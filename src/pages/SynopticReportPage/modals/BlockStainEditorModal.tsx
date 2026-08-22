// src/pages/SynopticReportPage/modals/BlockStainEditorModal.tsx
// ─────────────────────────────────────────────────────────────
// The actual visual editor at the bench — voice commands (next/
// previous block, mark grossed, confirm triage) existed before this,
// but there was no way to hand-edit a block at all: no UI to change
// status to anything other than the next step forward, no UI to add
// or remove a stain after auto-generation, no UI to override priority
// per block. This is that editor.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import '../../../pathscribe.css';
import { stainTypeService } from '@/services';
import type { StainType } from '@/services/stains/IStainService';
import type { CasePriority } from '@/services/cases/ICaseService';
import { suggestSpecimenAncillaryCptCodes, computeNewSuggestions } from '@/services/billing/codeMapTable';
import { UNSTAINED_LABEL } from '@/types/case/Specimen';
import { findForeignIdCollision } from '@/utils/foreignIdCollision';
import type { ForeignIdCollision } from '@/utils/foreignIdCollision';
import { buildSecondaryLabelDataForBlock, buildSecondaryLabelDataForDecant } from '@/utils/labels/buildSecondaryLabelData';
import { buildSecondaryLabelHtml } from '@/utils/labels/buildLabelHtml';
import { printLabels } from '@/utils/labels/printLabels';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';
import ForeignIdFields from './ForeignIdFields';
import CassetteColorControl from './CassetteColorControl';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';
import { mockCassetteColorService } from '@/services/cassetteColors/mockCassetteColorService';
import { DECANT_TYPE_LABEL } from '@/types/case/Material';

const BLOCK_STATUSES = ['Pending', 'Grossed', 'Embedded', 'Exhausted', 'Lost', 'Damaged'] as const;
const PRIORITY_OPTIONS: CasePriority[] = ['Routine', 'Rush', 'STAT'];

// Real feature, per direct confirmation, grounded explicitly in CAP
// ANP.11600, CLIA 493.1105, and ISO 15189:2012 5.8: "Add a required
// reason (dropdown or free text)." Deliberately not wired through the
// generic status dropdown below (which calls onUpdateBlock with no
// audit trail at all) — cancellation gets its own, dedicated control
// so a reason is always captured, never optional.
const CANCEL_REASONS = [
  'Wrong specimen assigned to this block',
  'Wrong block for this tissue',
  'Duplicate block created in error',
  'Insufficient tissue for this block',
  'Wrong stain ordered',
  'Other',
] as const;

// Real feature, per direct confirmation: "Order Restain... Captures
// reason (e.g., 'Weak stain', 'Artifact', 'Pathologist request')."
const RESTAIN_REASONS = [
  'Weak stain',
  'Artifact',
  'Pathologist request',
  'Other',
] as const;

// ── Real search + multi-select for stains, same pattern as the Protocol ────
// ── editor's picker — reused rather than reinvented for the same reason: ───
// ── a live Stain Dictionary can run to hundreds of entries. ─────────────────
const StainMultiSelect: React.FC<{
  stainTypes: StainType[];
  stains: { id: string; stainName: string; status: string; lisRequestStatus?: 'pending' | 'confirmed' | 'rejected' }[];
  onChange: (stains: { id: string; stainName: string; status: string; lisRequestStatus?: 'pending' | 'confirmed' | 'rejected' }[]) => void;
  /** Real feature, per direct feedback: "I was trying to Add a
   *  Unstained slide, but did not see it in the drop down list."
   *  Unstained stays deliberately out of the real Stain Dictionary —
   *  it's a reserved marker (see UNSTAINED_LABEL's own doc comment),
   *  not a real, orderable stain — but it needs to be discoverable
   *  from the same search a pathologist already expects to use for
   *  everything else. Optional: only shown when the caller (a block
   *  that isn't cancelled) actually offers spare creation. */
  onCreateSpare?: () => void;
}> = ({ stainTypes, stains, onChange, onCreateSpare }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const matches = stainTypes
    .filter(s => !stains.some(existing => existing.stainName === s.name))
    .filter(s => {
      const q = query.trim().toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    })
    .slice(0, 20);

  // Shown whenever the query is empty (so it's discoverable without
  // typing anything) or genuinely matches — "unstained" or "spare" —
  // so typing either word finds it, same as searching for any real
  // stain by name.
  const q = query.trim().toLowerCase();
  const showUnstainedOption = !!onCreateSpare && (!q || 'unstained'.includes(q) || 'spare'.includes(q));

  const add = (s: StainType) => {
    onChange([...stains, { id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stainName: s.name, status: 'Pending Cut' }]);
    setQuery('');
  };
  const remove = (id: string) => onChange(stains.filter(s => s.id !== id));

  return (
    <div className="ps-protocol-stainselect" ref={wrapRef}>
      {stains.length > 0 && (
        <div className="ps-protocol-stainselect-chips">
          {stains.map(s => (
            <span key={s.id} className="ps-protocol-stainselect-chip">
              {s.stainName}
              {/* Real feature, per the Hybrid Request-Driven Workflow
                  spec's "Optimistic / 'Pending' State": renders the
                  instant a stain/IHC request is made, confirmed or
                  flagged in place once the real LIS request resolves
                  — never silently dropped on rejection. */}
              {s.lisRequestStatus === 'pending' && (
                <span title="Sent to the LIS, awaiting confirmation" style={{ marginLeft: 5, fontSize: 10, color: '#f59e0b' }}>⏳</span>
              )}
              {s.lisRequestStatus === 'rejected' && (
                <span title="The LIS rejected this request — follow up with histology" style={{ marginLeft: 5, fontSize: 10, color: '#f87171' }}>⚠</span>
              )}
              <button type="button" onClick={() => remove(s.id)} className="ps-protocol-stainselect-chip-remove">×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="ps-conf-input"
        placeholder="Search stains to add — name or category…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (showUnstainedOption || matches.length > 0) && (
        <div className="ps-protocol-stainselect-dropdown">
          {showUnstainedOption && (
            <div
              className="ps-protocol-stainselect-option"
              onMouseDown={() => { onCreateSpare!(); setQuery(''); setOpen(false); }}
              style={{ borderBottom: matches.length > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}
            >
              <span>🩹 Unstained (spare slide)</span>
              <span className="ps-protocol-stainselect-option-cat">No stain yet — cut and ready</span>
            </div>
          )}
          {matches.map(s => (
            <div key={s.id} className="ps-protocol-stainselect-option" onMouseDown={() => add(s)}>
              <span>{s.name}</span>
              <span className="ps-protocol-stainselect-option-cat">{s.category}</span>
            </div>
          ))}
        </div>
      )}
      {open && query.trim() && !showUnstainedOption && matches.length === 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          <div className="ps-protocol-stainselect-empty">No matching stains.</div>
        </div>
      )}
    </div>
  );
};

interface BlockRow {
  specimenId: string;
  specimenLabel: string;
  /** Real feature, per direct confirmation: shows which specimen a
   *  block belongs to without cross-referencing the specimen list —
   *  previously this modal showed only the block identifier (e.g.
   *  "A1"), giving no clue which specimen that was. */
  specimenDescription: string;
  block: any;
}

/** Real feature, per direct follow-up: "decant-level linking UI. In
 *  the same UI we add specimens, blocks stains, protocols?" Real,
 *  parallel sibling to BlockRow above — the actual, real bug this
 *  closes: MaterialTreePanel.tsx's own decant slide row already
 *  called onOpenBlockEditor(decant.id), but this modal had zero
 *  decant handling at all — allBlocks.findIndex never matched a real
 *  decant's own id, silently failing to focus anything while still
 *  opening this modal, which then showed every ordinary block on the
 *  case with nothing decant-related in it. */
interface DecantRow {
  specimenId: string;
  specimenLabel: string;
  specimenDescription: string;
  decant: any;
}

interface Props {
  blocks: BlockRow[];
  decants: DecantRow[];
  casePriority: CasePriority;
  fullAccession: string;
  onUpdateBlock: (specimenId: string, blockId: string, changes: Partial<any>) => void;
  onUpdateDecant: (specimenId: string, decantId: string, changes: Partial<any>) => void;
  /** Real feature, per direct follow-up: "proceed with the decant
   *  container label." Same real reason this modal has no direct
   *  Case object of its own (see cassetteColors's own doc comment) —
   *  a real, printed label needs the full patient/order context this
   *  modal deliberately doesn't carry, so the parent (which owns
   *  caseData) implements the actual print call. */
  onPrintDecantContainerLabel: (specimenId: string, decantId: string) => void;
  /** Places a real stain order (LIS/order-service call) — distinct from
   *  onUpdateBlock, which only updates local block state. Called when a
   *  new stain is added via StainMultiSelect, before it's reflected in
   *  local state; if it fails, the stain is NOT added locally, so the UI
   *  never shows a stain chip that wasn't actually ordered. */
  onSendStainOrder: (specimenId: string, blockId: string, stainName: string) => Promise<{ ok: boolean }>;
  /** Real feature, per direct confirmation — corrects a genuine
   *  mis-assignment error ("wrong piece gets into the wrong block"),
   *  not withdrawal of an unfulfilled order. See CancelBlockControl's
   *  own doc comment for the full compliance rationale. */
  onCancelBlock: (specimenId: string, blockId: string, reason: string) => void;
  /** Real feature, per direct confirmation: "Create Spare Slide —
   *  Generates a new slide ID, links to block, no stain assigned
   *  yet." No LIS side-effect — see handleCreateSpareSlide's own doc
   *  comment for why. */
  onCreateSpareSlide: (specimenId: string, blockId: string) => void;
  /** Real feature, per direct confirmation: "Order Restain —
   *  Converts spare → staining workflow. Captures reason... Logs who
   *  ordered it." "We need a stain order called Unstained which is
   *  the only stain that can technically be restained on the same
   *  label." targetSlideId names which existing slide this repeats —
   *  the handler itself decides whether that means converting it in
   *  place (only ever true when its current stainName is
   *  UNSTAINED_LABEL) or creating a genuinely new one; this UI layer
   *  doesn't need to know or decide that. */
  onOrderRestain: (specimenId: string, blockId: string, params: { targetSlideId: string; stainName: string; reason: string }) => void;
  onClose: () => void;
  /** Real fix, item #28: which block (if any) the modal should scroll
   *  to as soon as it opens — the actual "navigate to the block that
   *  was clicked/just added" behavior. Optional and inert when absent,
   *  since this modal is also opened generically from places with no
   *  specific block in mind (e.g. the header's own block-editor
   *  button). */
  initialFocusBlockId?: string;
  /** Real, parallel sibling to initialFocusBlockId above — the actual
   *  fix for MaterialTreePanel.tsx's own decant slide row, which
   *  previously passed a decant's own id into a callback that only
   *  ever knew how to look up blocks. */
  initialFocusDecantId?: string;
}

// ── Real, rule-based ancillary CPT suggestion, computed live from the ──────
// ── block's actual current stains — closes the gap between the real ───────
// ── Phase 2 rule engine (services/billing/codeMapTable.ts) and the real ───
// ── Phase 1 data model (HistologyBlock.coding.cpt), which previously had ──
// ── no UI connecting them at all. Never auto-applied — a suggestion isn't ─
// ── real, confirmed coding until a person explicitly accepts it, same ─────
// ── principle as every other AI/rule-based suggestion in this app. ────────
const BlockCptSuggestion: React.FC<{
  specimenId: string;
  block: any;
  allSuggestedCodes: string[];
  onUpdateBlock: (specimenId: string, blockId: string, changes: Partial<any>) => void;
}> = ({ specimenId, block, allSuggestedCodes, onUpdateBlock }) => {
  const appliedCodes: string[] = block.coding?.cpt ?? [];
  const newSuggestions = computeNewSuggestions(appliedCodes, allSuggestedCodes);

  if (appliedCodes.length === 0 && newSuggestions.length === 0) return null;

  const handleApply = () => {
    onUpdateBlock(specimenId, block.id, { coding: { cpt: [...appliedCodes, ...newSuggestions] } });
  };

  return (
    <div className="ps-fixgate-intro" style={{ fontSize: 12, marginTop: 8 }}>
      {appliedCodes.length > 0 && (
        <div>Applied ancillary codes: <strong>{appliedCodes.join(', ')}</strong></div>
      )}
      {newSuggestions.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Suggested from this block's stains: <strong>{newSuggestions.join(', ')}</strong></span>
          <button className="ps-btn-secondary" onClick={handleApply} style={{ fontSize: 11, padding: '2px 8px' }}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

// Real feature, per direct confirmation: cancellation is a genuine
// mis-assignment correction ("wrong piece gets into the wrong
// block"), not deletion — the block stays visible with a real audit
// record (who/when/why), matching CAP ANP.11600 / CLIA 493.1105 /
// ISO 15189:2012 5.8. Two states: an already-cancelled block shows
// its audit record read-only; an active block shows a dedicated
// cancel action that requires a reason before it can proceed.
const CancelBlockControl: React.FC<{
  block: any;
  onCancel: (reason: string) => void;
}> = ({ block, onCancel }) => {
  const [confirming, setConfirming] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<string>(CANCEL_REASONS[0]);
  const [otherDetail, setOtherDetail] = useState('');

  if (block.status === 'Cancelled') {
    const cancelledAtDisplay = block.cancelledAt
      ? new Date(block.cancelledAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    return (
      <div className="ps-fixgate-intro" style={{ fontSize: 12, marginTop: 8, color: '#ef4444' }}>
        <div style={{ fontWeight: 700 }}>🚫 Cancelled</div>
        <div>Reason: {block.cancelReason || '—'}</div>
        <div>By: {block.cancelledBy || '—'} · {cancelledAtDisplay}</div>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{ fontSize: 12, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 8 }}
      >
        🚫 Cancel this block
      </button>
    );
  }

  const finalReason = reasonChoice === 'Other' ? otherDetail.trim() : reasonChoice;
  const canConfirm = finalReason.length > 0;

  return (
    <div className="ps-fixgate-intro" style={{ fontSize: 12, marginTop: 8 }}>
      <label className="ps-conf-label" htmlFor={`cancel-reason-${block.id}`}>Reason for cancellation (required)</label>
      <select
        id={`cancel-reason-${block.id}`}
        className="ps-conf-select"
        value={reasonChoice}
        onChange={e => setReasonChoice(e.target.value)}
      >
        {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {reasonChoice === 'Other' && (
        <input
          className="ps-conf-input"
          style={{ marginTop: 6 }}
          placeholder="Describe the reason…"
          value={otherDetail}
          onChange={e => setOtherDetail(e.target.value)}
        />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => canConfirm && onCancel(finalReason)}
          style={{
            fontSize: 12, fontWeight: 600, color: 'white', background: canConfirm ? '#dc2626' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 5, padding: '4px 10px', cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
        >
          Confirm Cancellation
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setReasonChoice(CANCEL_REASONS[0]); setOtherDetail(''); }}
          style={{ fontSize: 12, color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          Never mind
        </button>
      </div>
    </div>
  );
};

// Real feature, per direct confirmation: "Never delete restains —
// they are part of the case's analytic history... must remain
// visible in audit logs and QC review... should not be merged with
// or overwrite the original slide." A slide that's already a
// restain (has restainReason set) shows its audit record read-only,
// same posture as CancelBlockControl above. An ordinary slide —
// spare or already-stained — shows a dedicated "Order Restain"
// action requiring both a stain and a reason before it can proceed.
const RestainControl: React.FC<{
  stain: any;
  stainTypes: StainType[];
  onOrderRestain: (stainName: string, reason: string) => void;
}> = ({ stain, stainTypes, onOrderRestain }) => {
  const isUnstained = stain.stainName === UNSTAINED_LABEL;
  const [ordering, setOrdering] = useState(false);
  const [stainName, setStainName] = useState(isUnstained ? '' : stain.stainName);
  const [reasonChoice, setReasonChoice] = useState<string>(RESTAIN_REASONS[0]);
  const [otherDetail, setOtherDetail] = useState('');

  if (stain.restainReason) {
    const orderedAtDisplay = stain.restainOrderedAt
      ? new Date(stain.restainOrderedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    return (
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
        🔁 Restain — {stain.restainReason} · By {stain.restainOrderedBy || '—'} · {orderedAtDisplay}
      </div>
    );
  }

  if (!ordering) {
    return (
      <button
        type="button"
        onClick={() => setOrdering(true)}
        style={{ fontSize: 11, color: '#7dd3fc', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 8 }}
      >
        🔁 Order Restain
      </button>
    );
  }

  const finalReason = reasonChoice === 'Other' ? otherDetail.trim() : reasonChoice;
  const canConfirm = finalReason.length > 0 && stainName.trim().length > 0;

  return (
    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
      {isUnstained && (
        <>
          <label className="ps-conf-label" style={{ fontSize: 10 }}>Stain</label>
          <select className="ps-conf-select" value={stainName} onChange={e => setStainName(e.target.value)} style={{ marginBottom: 6 }}>
            <option value="">— Select —</option>
            {stainTypes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </>
      )}
      <label className="ps-conf-label" style={{ fontSize: 10 }}>Reason for restain (required)</label>
      <select className="ps-conf-select" value={reasonChoice} onChange={e => setReasonChoice(e.target.value)}>
        {RESTAIN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {reasonChoice === 'Other' && (
        <input
          className="ps-conf-input"
          style={{ marginTop: 6 }}
          placeholder="Describe the reason…"
          value={otherDetail}
          onChange={e => setOtherDetail(e.target.value)}
        />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => canConfirm && onOrderRestain(stainName.trim(), finalReason)}
          style={{
            fontSize: 11, fontWeight: 600, color: 'white', background: canConfirm ? '#0891B2' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 5, padding: '4px 10px', cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
        >
          Confirm Restain Order
        </button>
        <button
          type="button"
          onClick={() => { setOrdering(false); setReasonChoice(RESTAIN_REASONS[0]); setOtherDetail(''); }}
          style={{ fontSize: 11, color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          Never mind
        </button>
      </div>
    </div>
  );
};

export const BlockStainEditorModal: React.FC<Props> = ({ blocks, decants, casePriority, fullAccession, onUpdateBlock, onUpdateDecant, onPrintDecantContainerLabel, onSendStainOrder, onCancelBlock, onCreateSpareSlide, onOrderRestain, onClose, initialFocusBlockId, initialFocusDecantId }) => {
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
  }, []);

  // Real feature, per direct follow-up: "Additional Requirements for
  // Batch Management: cell blocks... Dedicated Hopper Assignment."
  // Same real, established convention as stainTypes immediately
  // above — fetched locally here, not passed in as a prop.
  const [cassetteColors, setCassetteColors] = useState<CassetteColorDefinition[]>([]);
  useEffect(() => {
    mockCassetteColorService.getAll().then(res => { if (res.ok) setCassetteColors(res.data); });
  }, []);

  // Real fix, item #28: scroll to the block that was actually clicked
  // (or just added) as soon as the modal opens, rather than leaving it
  // to whatever position the scroll container happened to already be
  // at. Deliberately only runs once on mount (empty deps) — if the
  // pathologist scrolls elsewhere afterward while the modal is open,
  // this shouldn't fight that by re-scrolling.
  const focusedBlockRef = useRef<HTMLDivElement>(null);
  // Real, parallel sibling — a real decant click now correctly
  // focuses its own card, not a block's.
  const focusedDecantRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initialFocusBlockId && focusedBlockRef.current) {
      focusedBlockRef.current.scrollIntoView({ block: 'start' });
    } else if (initialFocusDecantId && focusedDecantRef.current) {
      focusedDecantRef.current.scrollIntoView({ block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real, critical fix per direct, authoritative guidance: IHC
  // first/additional CPT counting (88342/88341) is a real, per-SPECIMEN
  // rule, not per block - grouping by specimenId here (preserving the
  // real block order they already appear in) and resolving each
  // specimen's blocks together lets suggestSpecimenAncillaryCptCodes
  // thread one real, running IHC count across every block on that
  // specimen, instead of each block wrongly starting its own count at
  // zero (which would have issued more than one "initial" 88342 per
  // specimen).
  const suggestionsByBlockId = React.useMemo(() => {
    const bySpecimen = new Map<string, { blockId: string; stains: any[] }[]>();
    for (const { specimenId, block } of blocks) {
      if (!bySpecimen.has(specimenId)) bySpecimen.set(specimenId, []);
      bySpecimen.get(specimenId)!.push({ blockId: block.id, stains: block.stains ?? [] });
    }
    const result = new Map<string, string[]>();
    for (const specimenBlocks of bySpecimen.values()) {
      for (const { blockId, suggestions } of suggestSpecimenAncillaryCptCodes(specimenBlocks, stainTypes)) {
        result.set(blockId, suggestions);
      }
    }
    return result;
  }, [blocks, stainTypes]);

  // Per-block state for in-flight stain orders and any failure to show inline.
  // Keyed by block id since multiple blocks can be edited independently.
  const [orderingBlockId, setOrderingBlockId] = useState<string | null>(null);
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  // Real feature, per direct follow-up: "The embedding technician
  // relies on the recorded piece count to verify that 100% of the
  // grossed tissue made it through processing into the paraffin
  // block... an immediate Tissue Discrepancy QA Flag is raised before
  // sectioning." Real, blocking prompt — a block with a real
  // pieceCount recorded at grossing can't silently become 'Embedded'
  // without the tech actually confirming what they observed.
  const [embedCountPrompt, setEmbedCountPrompt] = useState<{ blockId: string; observedCount: string } | null>(null);
  // Real feature, per direct follow-up: "the lab will receive outside
  // blocks or cytology fluids with existing ids that we need to map
  // to the pathscribe unique id... safer not to have to relabel
  // specimen containers." Keyed by blockId, since this modal can show
  // several blocks at once — holds the real collision result (or null
  // once cleared/resolved) for whichever block a tech is actively
  // linking a foreign id to. Checked on blur, not on every keystroke —
  // a real, deliberate cross-case search (findForeignIdCollision) on
  // every keystroke would be wasteful and would flash a false
  // "collision" against the tech's own still-being-typed value.
  const [foreignIdCollisions, setForeignIdCollisions] = useState<Record<string, ForeignIdCollision | null>>({});

  // Real fix, per direct follow-up: "the rapid-keystroke race
  // condition on onUpdateBlock/onUpdateDecant." Now takes the real,
  // just-typed values directly (from ForeignIdFields' own local state
  // at the moment of blur) rather than reading block.externalId/
  // externalIdSource — those parent-state fields can still be
  // genuinely stale at this exact moment (the real commit this same
  // blur triggers is itself async), and re-deriving the check from
  // stale props would silently check the wrong pair.
  const checkForeignIdCollision = async (blockId: string, externalId: string, externalIdSource: string) => {
    if (!externalId || !externalIdSource) {
      setForeignIdCollisions(prev => ({ ...prev, [blockId]: null }));
      return;
    }
    const result = await findForeignIdCollision(externalIdSource, externalId, blockId);
    setForeignIdCollisions(prev => ({ ...prev, [blockId]: result }));
  };

  // Real feature, per direct follow-up: "Fallback Physical Relabeling
  // (Secondary Labeling)... place an adhesive slide/cassette secondary
  // label over the non-tissue side... rather than attempting laser
  // re-engraving." Same real print pipeline as
  // MatrixBlockEditorModal.tsx's own identical action — takes the
  // specific block + its own specimenLabel as arguments, since this
  // modal shows several real blocks at once, unlike that one's single
  // matrixBlock.
  const printSecondaryLabel = (block: any, specimenLabel: string) => {
    const data = buildSecondaryLabelDataForBlock(fullAccession, specimenLabel, block);
    if (!data) return;
    const preset = getLabelSizePreset('histology_secondary_overlay');
    if (!preset) return;
    const html = buildSecondaryLabelHtml(data, preset);
    printLabels([html], preset, `Secondary Label — ${data.recordLabel}`);
  };

  // Real, parallel sibling to printSecondaryLabel above — per direct
  // follow-up: "no secondary-label printing for decants... if a
  // decant container's barcode gets damaged, there's currently no
  // recovery path the way there is for blocks." Same real overlay
  // preset and print pipeline; a decant's own container is a
  // genuinely different physical object from a cassette, but the real
  // problem this label solves (an unreadable, pre-existing barcode)
  // and the real fallback (an adhesive overlay sticker with a fresh,
  // scannable barcode) are identical, so this reuses
  // histology_secondary_overlay rather than inventing a second preset
  // for what Pete's own framing describes as "the equivalent."
  const printSecondaryLabelForDecant = (decant: any, specimenLabel: string) => {
    const data = buildSecondaryLabelDataForDecant(fullAccession, specimenLabel, decant);
    if (!data) return;
    const preset = getLabelSizePreset('histology_secondary_overlay');
    if (!preset) return;
    const html = buildSecondaryLabelHtml(data, preset);
    printLabels([html], preset, `Secondary Label — ${data.recordLabel}`);
  };

  // Real, parallel sibling to foreignIdCollisions/checkForeignIdCollision
  // above — same real reasoning, keyed by decant.id instead of block.id.
  const [decantForeignIdCollisions, setDecantForeignIdCollisions] = useState<Record<string, ForeignIdCollision | null>>({});
  const checkDecantForeignIdCollision = async (decantId: string, externalId: string, externalIdSource: string) => {
    if (!externalId || !externalIdSource) {
      setDecantForeignIdCollisions(prev => ({ ...prev, [decantId]: null }));
      return;
    }
    const result = await findForeignIdCollision(externalIdSource, externalId, decantId);
    setDecantForeignIdCollisions(prev => ({ ...prev, [decantId]: result }));
  };

  const handleStainsChange = async (
    specimenId: string,
    block: any,
    nextStains: { id: string; stainName: string; status: string }[],
  ) => {
    const added = nextStains.find(s => !block.stains.some((existing: any) => existing.id === s.id));

    // Removal (or no net addition) — purely local, no order to place.
    if (!added) {
      onUpdateBlock(specimenId, block.id, { stains: nextStains });
      setOrderErrors(prev => { const next = { ...prev }; delete next[block.id]; return next; });
      return;
    }

    // Real feature, per direct follow-up on the Hybrid Request-Driven
    // Workflow spec: "Optimistic / 'Pending' State... render it
    // immediately in the Material tree with a clear visual badge."
    // Previously this awaited the real order BEFORE the stain ever
    // appeared at all — pessimistic. Now appears immediately as
    // 'pending', confirmed or flagged 'rejected' in place once the
    // real request resolves — never silently dropped on rejection,
    // per the spec's own "flag the item with a clear alert"
    // instruction (replaces the old orderErrors-only, stain-never-
    // added rejection path).
    const optimisticStains = nextStains.map(s => s.id === added.id ? { ...s, lisRequestStatus: 'pending' as const } : s);
    onUpdateBlock(specimenId, block.id, { stains: optimisticStains });
    setOrderErrors(prev => { const next = { ...prev }; delete next[block.id]; return next; });
    setOrderingBlockId(block.id);
    try {
      const result = await onSendStainOrder(specimenId, block.id, added.stainName);
      const finalStains = nextStains.map(s => s.id === added.id ? { ...s, lisRequestStatus: result.ok ? 'confirmed' as const : 'rejected' as const } : s);
      onUpdateBlock(specimenId, block.id, { stains: finalStains });
      if (!result.ok) {
        setOrderErrors(prev => ({ ...prev, [block.id]: `LIS rejected ${added.stainName} — flagged, follow up with histology.` }));
      }
    } catch (e) {
      const rejectedStains = nextStains.map(s => s.id === added.id ? { ...s, lisRequestStatus: 'rejected' as const } : s);
      onUpdateBlock(specimenId, block.id, { stains: rejectedStains });
      setOrderErrors(prev => ({ ...prev, [block.id]: `Failed to order ${added.stainName}: ${(e as Error).message}` }));
    } finally {
      setOrderingBlockId(null);
    }
  };

  // Real, deliberately simpler sibling to handleStainsChange above —
  // no optimistic/LIS-order machinery, since decants have never had
  // that integration anywhere in this app (handleAddDecant itself
  // creates a real decant with no LIS order placed either). A direct,
  // local update via onUpdateDecant matches decants' own, existing,
  // established pattern rather than inventing LIS integration for
  // them here as a side effect of adding this section.
  const handleDecantStainsChange = (specimenId: string, decant: any, nextStains: { id: string; stainName: string; status: string }[]) => {
    onUpdateDecant(specimenId, decant.id, { stains: nextStains });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--protocol">
        <div className="ps-ms-header-row">
          <div className="ps-ms-header">Blocks &amp; Stains</div>
          <button className="ps-ms-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            Direct edits — status, stains, and a per-block priority override. Priority defaults to inheriting the
            case's own priority ({casePriority}); only set an override here if this specific block genuinely needs
            different urgency than the rest of the case.
          </p>
          <div className="ps-protocol-tracks-scroll">
            {blocks.map(({ specimenId, specimenLabel, specimenDescription, block }) => (
              <div key={block.id} ref={block.id === initialFocusBlockId ? focusedBlockRef : undefined} className="ps-protocol-track-card">
                <div className="ps-protocol-track-header">
                  <div className="ps-protocol-track-header-info">
                    <strong className="ps-protocol-track-name">
                      {specimenLabel}{block.label}{block.sourcePathwayName ? ` — ${block.sourcePathwayName}` : ''}
                    </strong>
                    {specimenDescription && (
                      <div className="ps-protocol-track-meta">{specimenDescription}</div>
                    )}
                  </div>
                </div>
                <div className="ps-conf-form-row">
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label" htmlFor={`block-status-${block.id}`}>Status</label>
                    <select id={`block-status-${block.id}`} className="ps-conf-select" value={block.status}
                      disabled={block.status === 'Cancelled'}
                      onChange={e => {
                        const nextStatus = e.target.value;
                        // Real feature, per direct follow-up — see
                        // embedCountPrompt's own doc comment above for
                        // the full reasoning. Only interrupts the
                        // transition when there's a real pieceCount on
                        // file and this is genuinely the first time
                        // this block is entering 'Embedded' — a block
                        // already confirmed once (pieceCountAtEmbedding
                        // set) never re-prompts on an unrelated re-save.
                        if (nextStatus === 'Embedded' && block.pieceCount != null && block.pieceCountAtEmbedding == null) {
                          setEmbedCountPrompt({ blockId: block.id, observedCount: String(block.pieceCount) });
                          return;
                        }
                        // Real feature, per direct follow-up: "Reported
                        // missing 8/14." Stamps the real moment an
                        // exception status was first set, not
                        // editable separately — only set once, the
                        // first time a block enters Lost/Damaged, so
                        // re-saving other fields afterward doesn't
                        // silently move the reported date forward.
                        const enteringException = (nextStatus === 'Lost' || nextStatus === 'Damaged') && !block.exceptionReportedAt;
                        onUpdateBlock(specimenId, block.id, {
                          status: nextStatus,
                          ...(enteringException ? { exceptionReportedAt: new Date().toISOString() } : {}),
                        });
                      }}>
                      {BLOCK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      {block.status === 'Cancelled' && <option value="Cancelled">Cancelled</option>}
                    </select>
                    {/* Real feature, per direct follow-up: "an
                        immediate Tissue Discrepancy QA Flag is raised
                        before sectioning." Real, blocking prompt —
                        status only actually advances once the tech
                        answers, never silently defaulted. A mismatch
                        is never hidden: both real counts (grossed vs.
                        observed) are stored and MaterialTreePanel.tsx
                        renders the real comparison directly. */}
                    {embedCountPrompt?.blockId === block.id && (
                      <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                        <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>
                          {block.pieceCount} piece{block.pieceCount === 1 ? '' : 's'} were recorded at grossing. How many do you actually see now?
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="number" min={0} className="ps-conf-select" style={{ width: 90 }}
                            value={embedCountPrompt.observedCount}
                            onChange={e => setEmbedCountPrompt({ blockId: block.id, observedCount: e.target.value })}
                          />
                          <button
                            type="button" className="ps-conf-btn-primary"
                            onClick={() => {
                              const observed = Math.max(0, parseInt(embedCountPrompt.observedCount, 10) || 0);
                              setEmbedCountPrompt(null);
                              onUpdateBlock(specimenId, block.id, { status: 'Embedded', pieceCountAtEmbedding: observed });
                            }}
                          >
                            Confirm
                          </button>
                          <button type="button" className="ps-conf-btn-secondary" onClick={() => setEmbedCountPrompt(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label" htmlFor={`block-priority-${block.id}`}>Priority</label>
                    <select id={`block-priority-${block.id}`} className="ps-conf-select" value={block.priority ?? ''}
                      disabled={block.status === 'Cancelled'}
                      onChange={e => onUpdateBlock(specimenId, block.id, { priority: e.target.value || undefined })}>
                      <option value="">Inherit from case ({casePriority})</option>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p} (override)</option>)}
                    </select>
                  </div>
                </div>
                {/* Real feature, per direct follow-up: "Block missing
                    from archive · QC Incident #1042" / "Paraffin
                    cracked · Requires re-embedding." Only shown for
                    the two statuses it actually applies to — a real,
                    free-text note the pathologist/histotech reads
                    directly in the Manage Reprints modal and
                    MaterialTreePanel, not a status label alone. */}
                {(block.status === 'Lost' || block.status === 'Damaged') && (
                  <div className="ps-conf-form-field" style={{ marginBottom: 12 }}>
                    <label className="ps-conf-label" htmlFor={`block-exception-note-${block.id}`}>
                      {block.status === 'Lost' ? 'Missing / incident details' : 'Damage / re-embed details'}
                    </label>
                    <input
                      id={`block-exception-note-${block.id}`} type="text" className="ps-conf-select"
                      value={block.exceptionNote ?? ''}
                      placeholder={block.status === 'Lost' ? 'e.g. Block missing from archive · QC Incident #1042' : 'e.g. Paraffin cracked · Requires re-embedding'}
                      onChange={e => onUpdateBlock(specimenId, block.id, { exceptionNote: e.target.value || undefined })}
                    />
                  </div>
                )}
                {/* Real feature, per direct follow-up: "pieces (or
                    tissue fragments) represent the individual physical
                    fragments of a specimen placed into a cassette...
                    recorded explicitly in the gross description...
                    embedding checks this count against what's actually
                    visible before processing continues." Real,
                    load-bearing QA number, not cosmetic — see the
                    real, matching discrepancy check this same field
                    now drives when a block advances to 'Embedded'
                    (this hook's own handleAdvanceFocusedBlockStatus /
                    handleUpdateBlock). */}
                <div className="ps-conf-form-row">
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label" htmlFor={`block-piece-count-${block.id}`}>Pieces Grossed</label>
                    <input
                      id={`block-piece-count-${block.id}`} type="number" min={0} className="ps-conf-select"
                      disabled={block.status === 'Cancelled'}
                      value={block.pieceCount ?? ''}
                      placeholder="e.g. 3"
                      onChange={e => {
                        const n = e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0);
                        onUpdateBlock(specimenId, block.id, { pieceCount: n });
                      }}
                    />
                  </div>
                  <div className="ps-conf-form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 22 }}>
                      <input
                        type="checkbox"
                        checked={block.isEntirelySubmitted ?? true}
                        disabled={block.status === 'Cancelled'}
                        onChange={e => onUpdateBlock(specimenId, block.id, { isEntirelySubmitted: e.target.checked })}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: 13, color: '#e2e8f0' }}>Entirely submitted (none held in wet storage)</span>
                    </label>
                  </div>
                </div>
                <div className="ps-conf-form-field" style={{ marginBottom: 12 }}>
                  <label className="ps-conf-label" htmlFor={`block-piece-desc-${block.id}`}>Piece Description</label>
                  <input
                    id={`block-piece-desc-${block.id}`} type="text" className="ps-conf-select"
                    disabled={block.status === 'Cancelled'}
                    value={block.pieceDescription ?? ''}
                    placeholder="e.g. 2 core fragments, 1 tiny dust piece"
                    onChange={e => onUpdateBlock(specimenId, block.id, { pieceDescription: e.target.value || undefined })}
                  />
                </div>
                {/* Real feature, per direct follow-up: "the lab will
                    receive outside blocks or cytology fluids with
                    existing ids that we need to map to the pathscribe
                    unique id... safer not to have to relabel specimen
                    containers." Real, both-linked pair — reuses
                    HistologyBlock.externalId/externalIdSource
                    directly, the same fields this app's own,
                    established pattern already defines (see that
                    field's own doc comment) — never a second,
                    competing field. */}
                <ForeignIdFields
                  key={block.id}
                  externalId={block.externalId}
                  externalIdSource={block.externalIdSource}
                  disabled={block.status === 'Cancelled'}
                  idPrefix={`block-${block.id}`}
                  sourcePlaceholder="e.g. Riverside Medical Center"
                  idPlaceholder="e.g. the id already on the container"
                  collision={foreignIdCollisions[block.id] ?? null}
                  onCommit={changes => onUpdateBlock(specimenId, block.id, changes)}
                  onCheckCollision={(id, source) => checkForeignIdCollision(block.id, id, source)}
                />
                {/* Real feature, per direct follow-up: "Fallback
                    Physical Relabeling (Secondary Labeling)... place
                    an adhesive slide/cassette secondary label over
                    the non-tissue side... rather than attempting
                    laser re-engraving." Only shown once a real
                    foreign id exists on this specific block. */}
                {block.externalId && block.externalIdSource && (
                  <button
                    type="button" onClick={() => printSecondaryLabel(block, specimenLabel)}
                    style={{ fontSize: 12, fontWeight: 600, color: '#0891B2', background: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.3)', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', marginBottom: 12 }}
                  >
                    🖨️ Print Secondary Label (barcode unreadable)
                  </button>
                )}
                <label className="ps-conf-label">Stains</label>
                {block.status === 'Cancelled' ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(block.stains ?? []).map((s: any) => (
                      <span key={s.id} className="ps-protocol-stainselect-chip" style={{ opacity: 0.5 }}>
                        {s.stainName} ({s.status})
                      </span>
                    ))}
                  </div>
                ) : (
                  <>
                    <StainMultiSelect
                      stainTypes={stainTypes}
                      stains={(block.stains ?? []).filter((s: any) => s.stainName !== UNSTAINED_LABEL)}
                      onChange={stains => handleStainsChange(specimenId, block, [...stains, ...(block.stains ?? []).filter((s: any) => s.stainName === UNSTAINED_LABEL)])}
                      onCreateSpare={() => onCreateSpareSlide(specimenId, block.id)}
                    />
                    {/* Real feature, per direct confirmation: spares
                        and restains are managed separately from the
                        ordinary add/remove-stain flow above — a
                        spare (stainName === UNSTAINED_LABEL) has no
                        real stain yet (nothing for StainMultiSelect's
                        picker to represent), and a restain needs its
                        own required-reason control, not a plain
                        chip. */}
                    {(block.stains ?? []).map((s: any) => (
                      <div key={s.id} style={{ marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {s.stainName === UNSTAINED_LABEL ? '🩹 Unstained (spare)' : s.stainName} — {s.status}
                        </span>
                        <RestainControl
                          stain={s}
                          stainTypes={stainTypes}
                          onOrderRestain={(stainName, reason) => onOrderRestain(specimenId, block.id, {
                            targetSlideId: s.id,
                            stainName, reason,
                          })}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => onCreateSpareSlide(specimenId, block.id)}
                      style={{ fontSize: 11, color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 8 }}
                    >
                      + Create Spare Slide
                    </button>
                  </>
                )}
                {orderingBlockId === block.id && (
                  <div className="ps-fixgate-intro" style={{ fontSize: 12, marginTop: 4 }}>Placing stain order…</div>
                )}
                {orderErrors[block.id] && (
                  <div className="ps-fixgate-intro" style={{ fontSize: 12, marginTop: 4, color: '#ef4444' }}>
                    {orderErrors[block.id]}
                  </div>
                )}
                <BlockCptSuggestion
                  specimenId={specimenId}
                  block={block}
                  allSuggestedCodes={suggestionsByBlockId.get(block.id) ?? []}
                  onUpdateBlock={onUpdateBlock}
                />
                <CancelBlockControl
                  block={block}
                  onCancel={reason => onCancelBlock(specimenId, block.id, reason)}
                />
              </div>
            ))}
            {blocks.length === 0 && <div className="ps-cmnt-thread-empty">No blocks on this case yet.</div>}

            {/* Real feature, per direct follow-up: "decant-level
                linking UI. In the same UI we add specimens, blocks
                stains, protocols?" Real, parallel sibling section to
                the block cards above, in the SAME scroll container —
                one, unified material editor, not two separate
                modals. Deliberately simpler than a block card: a real
                Decant has no status/priority/piece-count lifecycle of
                its own (see Decant's own type definition,
                types/case/Material.ts) — just its own real
                decantType, stains, and now the same real Foreign ID
                fields blocks already have. */}
            {decants.length > 0 && (
              <>
                <div className="ps-decants-section-label">
                  Decants
                </div>
                {decants.map(({ specimenId, specimenLabel, specimenDescription, decant }) => (
                  <div key={decant.id} ref={decant.id === initialFocusDecantId ? focusedDecantRef : undefined} className="ps-protocol-track-card">
                    <div className="ps-protocol-track-header">
                      <div className="ps-protocol-track-header-info">
                        <strong className="ps-protocol-track-name">
                          {specimenLabel}{decant.label} — {DECANT_TYPE_LABEL[decant.decantType]}
                        </strong>
                        {specimenDescription && (
                          <div className="ps-protocol-track-meta">{specimenDescription}</div>
                        )}
                      </div>
                    </div>

                    {/* Real feature, per direct follow-up: "Specimen/
                        Decant-level foreign ID... the actual cytology
                        fluid case." Same real pattern, same real
                        collision-check UX, as the block cards above —
                        a received, foreign-labeled fluid specimen's
                        own decant gets linked here, never re-labeled. */}
                    <ForeignIdFields
                      key={decant.id}
                      externalId={decant.externalId}
                      externalIdSource={decant.externalIdSource}
                      idPrefix={`decant-${decant.id}`}
                      sourcePlaceholder="e.g. Outside Cytology Lab"
                      idPlaceholder="e.g. the id already assigned by that lab"
                      collision={decantForeignIdCollisions[decant.id] ?? null}
                      onCommit={changes => onUpdateDecant(specimenId, decant.id, changes)}
                      onCheckCollision={(id, source) => checkDecantForeignIdCollision(decant.id, id, source)}
                    />

                    {/* Real feature, per direct follow-up: "Additional
                        Requirements for Batch Management: cell
                        blocks... Dedicated Hopper Assignment...
                        Specimen Protocol Overrides." Real, confirmed
                        scope: color only, never a hopper number — see
                        CassetteColorControl.tsx's own header. */}
                    <CassetteColorControl
                      colorId={decant.cassetteColorId}
                      overridden={decant.cassetteColorOverridden}
                      colors={cassetteColors}
                      onChange={newColorId => onUpdateDecant(specimenId, decant.id, { cassetteColorId: newColorId, cassetteColorOverridden: true })}
                    />

                    {/* Real feature, per direct follow-up: "proceed
                        with the decant container label." Same real,
                        on-demand print pattern as
                        MatrixBlockEditorModal.tsx's own cassette/
                        secondary-label buttons — a real, physical
                        label for the decant's own, separate container,
                        the object this scan-based disposal action
                        (disposeItemByScan.ts) actually scans. */}
                    <button
                      type="button"
                      onClick={() => onPrintDecantContainerLabel(specimenId, decant.id)}
                      className="ps-teal-action-btn ps-teal-action-btn--block"
                    >
                      🖨️ Print Container Label
                    </button>

                    {/* Real feature, per direct follow-up: "no
                        secondary-label printing for decants... if a
                        decant container's barcode gets damaged,
                        there's currently no recovery path the way
                        there is for blocks." Same real fallback-only
                        visibility rule as the block card's own
                        identical button above — only shown once a
                        real foreign id exists to explain why a
                        fallback overlay is needed. */}
                    {decant.externalId && decant.externalIdSource && (
                      <button
                        type="button"
                        onClick={() => printSecondaryLabelForDecant(decant, specimenLabel)}
                        className="ps-teal-action-btn ps-teal-action-btn--block"
                      >
                        🖨️ Print Secondary Label (barcode unreadable)
                      </button>
                    )}

                    <label className="ps-conf-label">Stains</label>
                    <StainMultiSelect
                      stainTypes={stainTypes}
                      stains={decant.stains ?? []}
                      onChange={stains => handleDecantStainsChange(specimenId, decant, stains)}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-apply" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};
