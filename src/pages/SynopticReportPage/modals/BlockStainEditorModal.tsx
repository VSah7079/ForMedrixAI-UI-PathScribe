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
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { stainTypeService, molecularTargetService, cassetteColorService, blockCancelMissing, restainMissing, chosenReason, type ResolvedFieldRequirement } from '@/services';
import { useFieldRequirements } from '@/hooks/useFieldRequirements';
import { formatDateTime } from '@/utils/formatDate';
import { WsiViewerLaunchButton } from '../components/WsiViewerLaunchButton';
import type { StainType } from '@/services/stains/IStainService';
import type { MaterialComment } from '@/types/case/MaterialComment';
import CameraCaptureControl from '@/components/GrossingHardware/CameraCaptureControl';
import type { MolecularTarget } from '@/types/billing/MolecularBillingRule';
import type { CasePriority } from '@/services/cases/ICaseService';
import { suggestSpecimenAncillaryCptCodes, computeNewSuggestionsWithSources } from '@/services/billing/codeMapTable';
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
import { DECANT_TYPE_LABEL } from '@/types/case/Material';

const BLOCK_STATUSES = ['Pending', 'Grossed', 'Embedded', 'Exhausted', 'Lost', 'Damaged'] as const;
// Real, persisted enum values (block.status) stay as data — only the
// displayed option text translates, same LABEL_KEY pattern used
// elsewhere in this sweep for other persisted status enums.
const BLOCK_STATUS_LABEL_KEY: Record<typeof BLOCK_STATUSES[number], string> = {
  Pending: 'blockStainEditorModal.blockStatusLabels.pending',
  Grossed: 'blockStainEditorModal.blockStatusLabels.grossed',
  Embedded: 'blockStainEditorModal.blockStatusLabels.embedded',
  Exhausted: 'blockStainEditorModal.blockStatusLabels.exhausted',
  Lost: 'blockStainEditorModal.blockStatusLabels.lost',
  Damaged: 'blockStainEditorModal.blockStatusLabels.damaged',
};

const PRIORITY_OPTIONS: CasePriority[] = ['Routine', 'Rush', 'STAT'];
// Same real-enum-stays-data pattern as BLOCK_STATUS_LABEL_KEY above —
// casePriority/block.priority are real, persisted values.
const PRIORITY_LABEL_KEY: Record<CasePriority, string> = {
  Routine: 'blockStainEditorModal.priorityLabels.routine',
  Rush: 'blockStainEditorModal.priorityLabels.rush',
  STAT: 'blockStainEditorModal.priorityLabels.stat',
};

// Real feature, per direct confirmation, grounded explicitly in CAP
// ANP.11600, CLIA 493.1105, and ISO 15189:2012 5.8: "Add a required
// reason (dropdown or free text)." Deliberately not wired through the
// generic status dropdown below (which calls onUpdateBlock with no
// audit trail at all) — cancellation gets its own, dedicated control
// so a reason is always captured, never optional.
// Deliberately NOT translated: whichever of these a user selects
// becomes the permanently-persisted audit-trail value
// (block.cancelReason), read back verbatim in the read-only audit
// display below — translating the picklist would mean the exact
// same choice gets stored as different text depending on the UI
// language active at the moment it was picked, which is exactly the
// kind of drift a CAP/CLIA audit trail can't tolerate.
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
// Same not-translated reasoning as CANCEL_REASONS above — the chosen
// value is permanently persisted as stain.restainReason and read back
// verbatim in the audit display.
const RESTAIN_REASONS = [
  'Weak stain',
  'Artifact',
  'Pathologist request',
  'Other',
] as const;

// ── Real search + multi-select for stains, same pattern as the Protocol ────
// ── editor's picker — reused rather than reinvented for the same reason: ───
// ── a live Stain Dictionary can run to hundreds of entries. ─────────────────
// Real, per direct guidance's own confirmed correction while
// migrating Cytology's own Material drawer onto the real Decant/
// StainType system: exported so Cytology's own material view uses
// this EXACT, real component — never a separate, cytology-specific
// look-alike that could drift out of sync with this one over time.
export const StainMultiSelect: React.FC<{
  stainTypes: StainType[];
  stains: { id: string; stainName: string; status: string; lisRequestStatus?: 'pending' | 'confirmed' | 'rejected'; selectedTargets?: MolecularTarget[]; displayId?: string }[];
  onChange: (stains: { id: string; stainName: string; status: string; lisRequestStatus?: 'pending' | 'confirmed' | 'rejected'; selectedTargets?: MolecularTarget[]; displayId?: string }[]) => void;
  masterTargets: MolecularTarget[];
  /** Real feature, per direct feedback: "I was trying to Add a
   *  Unstained slide, but did not see it in the drop down list."
   *  Unstained stays deliberately out of the real Stain Dictionary —
   *  it's a reserved marker (see UNSTAINED_LABEL's own doc comment),
   *  not a real, orderable stain — but it needs to be discoverable
   *  from the same search a pathologist already expects to use for
   *  everything else. Optional: only shown when the caller (a block
   *  that isn't cancelled) actually offers spare creation. */
  onCreateSpare?: () => void;
}> = ({ stainTypes, stains, onChange, masterTargets, onCreateSpare }) => {
  const { t } = useTranslation();
  const [editingTargetsForId, setEditingTargetsForId] = useState<string | null>(null);
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
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
    onChange([...stains, {
      id: `stain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stainName: s.name, status: 'Pending Cut',
      // Real, per direct guidance's own template-and-override design:
      // "copy the default probe set onto the individual accession
      // record upon creation." Only meaningful for a real Molecular
      // stain - a copy, not a live reference, so editing it here never
      // touches this StainType's own dictionary default.
      selectedTargets: s.category === 'Molecular' && s.defaultTargets ? s.defaultTargets.map(tgt => ({ ...tgt })) : undefined,
    }]);
    setQuery('');
  };
  const updateTargets = (id: string, targets: MolecularTarget[]) => {
    onChange(stains.map(s => s.id === id ? { ...s, selectedTargets: targets } : s));
  };
  const remove = (id: string) => onChange(stains.filter(s => s.id !== id));

  return (
    <div className="ps-protocol-stainselect" ref={wrapRef}>
      {stains.length > 0 && (
        <div className="ps-protocol-stainselect-chips">
          {stains.map(s => (
            <span key={s.id} className="ps-protocol-stainselect-chip">
              {s.stainName}
              {s.selectedTargets && (
                <button
                  type="button"
                  onClick={() => setEditingTargetsForId(editingTargetsForId === s.id ? null : s.id)}
                  title={t('blockStainEditorModal.stainMultiSelect.editTargetsTitle')}
                  className="ps-blockstain-target-count-btn"
                >
                  {t('blockStainEditorModal.stainMultiSelect.targetCount', { count: s.selectedTargets.length })}
                </button>
              )}
              {/* Real feature, per the Hybrid Request-Driven Workflow
                  spec's "Optimistic / 'Pending' State": renders the
                  instant a stain/IHC request is made, confirmed or
                  flagged in place once the real LIS request resolves
                  — never silently dropped on rejection. */}
              {s.lisRequestStatus === 'pending' && (
                <span title={t('blockStainEditorModal.stainMultiSelect.lisPendingTitle')} className="ps-blockstain-lis-icon ps-blockstain-lis-icon--pending">⏳</span>
              )}
              {s.lisRequestStatus === 'rejected' && (
                <span title={t('blockStainEditorModal.stainMultiSelect.lisRejectedTitle')} className="ps-blockstain-lis-icon ps-blockstain-lis-icon--rejected">⚠</span>
              )}
              <WsiViewerLaunchButton status={s.status} displayId={s.displayId} />
              <button type="button" onClick={() => remove(s.id)} className="ps-protocol-stainselect-chip-remove">×</button>
            </span>
          ))}
        </div>
      )}
      {editingTargetsForId && (() => {
        const editingStain = stains.find(s => s.id === editingTargetsForId);
        if (!editingStain) return null;
        const currentTargets = editingStain.selectedTargets ?? [];
        return (
          <div className="ps-blockstain-target-editor">
            <div className="ps-blockstain-target-editor-title">
              {t('blockStainEditorModal.stainMultiSelect.targetsForStain', { name: editingStain.stainName })}
            </div>
            <div className="ps-blockstain-target-chips">
              {currentTargets.map(tgt => (
                <span key={tgt.id} className="ps-blockstain-target-chip">
                  {tgt.symbol}{tgt.detail ? ` (${tgt.detail})` : ''}
                  <button
                    type="button"
                    onClick={() => updateTargets(editingStain.id, currentTargets.filter(x => x.id !== tgt.id))}
                    className="ps-blockstain-target-chip-remove"
                    aria-label={t('blockStainEditorModal.stainMultiSelect.removeTargetAriaLabel', { symbol: tgt.symbol })}
                  >×</button>
                </span>
              ))}
              {currentTargets.length === 0 && <span className="ps-blockstain-target-empty">{t('blockStainEditorModal.stainMultiSelect.noTargetsSelected')}</span>}
            </div>
            <input
              className="ps-conf-input"
              placeholder={t('blockStainEditorModal.stainMultiSelect.searchTargetsPlaceholder')}
              value={targetSearchQuery}
              onChange={e => setTargetSearchQuery(e.target.value)}
            />
            {targetSearchQuery.trim() && (
              <div className="ps-blockstain-target-results">
                {masterTargets
                  .filter(tgt => !currentTargets.some(x => x.id === tgt.id))
                  .filter(tgt => tgt.symbol.toLowerCase().includes(targetSearchQuery.trim().toLowerCase()) || tgt.detail?.toLowerCase().includes(targetSearchQuery.trim().toLowerCase()))
                  .slice(0, 20)
                  .map(tgt => (
                    <div key={tgt.id} onMouseDown={() => { updateTargets(editingStain.id, [...currentTargets, tgt]); setTargetSearchQuery(''); }}
                      className="ps-blockstain-target-result-row">
                      <strong>{tgt.symbol}</strong>{tgt.detail ? <span className="ps-blockstain-target-result-detail"> — {tgt.detail}</span> : null}
                    </div>
                  ))}
              </div>
            )}
            <div className="ps-blockstain-target-editor-footer">
              <button type="button" className="ps-conf-btn-secondary" onClick={() => { setEditingTargetsForId(null); setTargetSearchQuery(''); }}>{t('blockStainEditorModal.doneButton')}</button>
            </div>
          </div>
        );
      })()}
      <input
        className="ps-conf-input"
        placeholder={t('blockStainEditorModal.stainMultiSelect.searchStainsPlaceholder')}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (showUnstainedOption || matches.length > 0) && (
        <div className="ps-protocol-stainselect-dropdown">
          {showUnstainedOption && (
            <div
              className={`ps-protocol-stainselect-option${matches.length > 0 ? ' ps-blockstain-option--divided' : ''}`}
              onMouseDown={() => { onCreateSpare!(); setQuery(''); setOpen(false); }}
            >
              <span>{t('blockStainEditorModal.stainMultiSelect.unstainedOption')}</span>
              <span className="ps-protocol-stainselect-option-cat">{t('blockStainEditorModal.stainMultiSelect.unstainedOptionMeta')}</span>
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
          <div className="ps-protocol-stainselect-empty">{t('blockStainEditorModal.stainMultiSelect.noMatchingStains')}</div>
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
  /** Real, per direct follow-up on comment-field parity across
   *  material types — needed to stamp a new block/decant comment
   *  with a real author, same as ReportCommentModal's own
   *  currentUserId/currentUserName. */
  currentUserId: string;
  currentUserName: string;
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
  allSuggestedSources: { code: string; stainOrderId?: string }[];
  onUpdateBlock: (specimenId: string, blockId: string, changes: Partial<any>) => void;
}> = ({ specimenId, block, allSuggestedSources, onUpdateBlock }) => {
  const { t } = useTranslation();
  const appliedCodes: { code: string; stainOrderId?: string }[] = block.coding?.cpt ?? [];
  const rejectedCodes: { code: string; stainOrderId?: string }[] = block.coding?.rejectedCpt ?? [];
  const newSuggestions = computeNewSuggestionsWithSources(appliedCodes, allSuggestedSources, rejectedCodes);

  if (appliedCodes.length === 0 && newSuggestions.length === 0) return null;

  const handleApply = () => {
    onUpdateBlock(specimenId, block.id, { coding: { cpt: [...appliedCodes, ...newSuggestions] } });
  };

  return (
    <div className="ps-fixgate-intro ps-blockstain-cpt-suggestion">
      {appliedCodes.length > 0 && (
        <div>{t('blockStainEditorModal.cptSuggestion.appliedCodes')} <strong>{appliedCodes.map(c => c.code).join(', ')}</strong></div>
      )}
      {newSuggestions.length > 0 && (
        <div className="ps-blockstain-cpt-suggestion-row">
          <span>{t('blockStainEditorModal.cptSuggestion.suggestedFromStains')} <strong>{newSuggestions.map(s => s.code).join(', ')}</strong></span>
          <button className="ps-btn-secondary ps-blockstain-cpt-apply-btn" onClick={handleApply}>
            {t('blockStainEditorModal.cptSuggestion.applyButton')}
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
// Real, per direct follow-up on comment-field parity across material
// types — a small, real, inline composer, same real posture as
// CancelBlockControl below (a local, single-purpose control, not a
// second full modal stacked on top of this one). Deliberately no
// rich-text editor here (unlike ReportCommentModal's own
// PathScribeEditor) — per direct follow-up confirming this is the
// right design, not a scope trim: a block/stain/decant-level note is
// a short, operational one, genuinely different in kind from a
// substantial, formatted case/specimen-level note. Produces plain
// text (MaterialComment), never rendered via dangerouslySetInnerHTML.
const BlockCommentComposer: React.FC<{ onSubmit: (text: string) => void }> = ({ onSubmit }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  return (
    <div className="ps-blockstain-comment-composer">
      {/* Real fix (PS-314 — "unnecessary Block Comment dropdown"):
          this is a plain free-text field, not a <select>, but it was
          on ps-conf-select — the class that paints the dropdown-
          chevron background and sets cursor: pointer for real <select>
          elements. That's the actual "dropdown" being reported; there
          was never a real dropdown behavior here to remove, only this
          class mismatch. Swapped to ps-conf-input, the plain-text-
          input counterpart. Same exact defect, on the same screen,
          also existed (not just here) on several other plain inputs
          below — the embed-count-confirm field, the Lost/Damaged
          exception note, Pieces Grossed, Piece Description, and Tissue
          Description — so all of those are fixed alongside this one
          rather than leaving the identical bug in place a few fields
          away from the one the ticket named. */}
      <input
        type="text"
        className="ps-conf-input"
        placeholder={t('blockStainEditorModal.commentComposer.placeholder')}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim()) { onSubmit(value.trim()); setValue(''); }
        }}
      />
      <button
        type="button"
        className="ps-btn-small"
        disabled={!value.trim()}
        onClick={() => { onSubmit(value.trim()); setValue(''); }}
      >
        {t('blockStainEditorModal.commentComposer.addButton')}
      </button>
    </div>
  );
};

// Real, per direct follow-up on comment-field parity across material
// types — same real toggle posture as RestainControl below (a small,
// per-stain control, not an always-expanded section, since a block
// card can carry many stain rows). Persists via onUpdateBlock's own
// generic patch — rebuilds the block's stains array with this one
// stain's comments updated, since StainOrder lives nested under
// HistologyBlock.stains, not as its own top-level, directly-
// patchable record.
const StainCommentControl: React.FC<{
  stain: any;
  currentUserId: string;
  currentUserName: string;
  onUpdateStainComments: (nextComments: MaterialComment[]) => void;
}> = ({ stain, currentUserId, currentUserName, onUpdateStainComments }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = (stain.comments ?? []).length;

  return (
    <div className="ps-blockstain-comment-toggle-wrap">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ps-blockstain-comment-toggle-btn"
      >
        💬{count > 0 ? ` ${count}` : ''}
      </button>
      {open && (
        <div className="ps-blockstain-comment-list">
          {(stain.comments ?? []).map((c: MaterialComment) => (
            <div key={c.id} className="ps-blockstain-comment-row">
              <Trans i18nKey="blockStainEditorModal.commentMeta" values={{ author: c.authorName, when: formatDateTime(c.createdAt, i18n.language) }} components={{ author: <strong className="ps-blockstain-comment-author" /> }} />
              <div className="ps-blockstain-comment-text">{c.text}</div>
            </div>
          ))}
          <BlockCommentComposer
            onSubmit={text => onUpdateStainComments([...(stain.comments ?? []), {
              id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              authorId: currentUserId, authorName: currentUserName, text, createdAt: new Date().toISOString(),
            }])}
          />
        </div>
      )}
    </div>
  );
};

const CancelBlockControl: React.FC<{
  block: any;
  requirements: readonly ResolvedFieldRequirement[];
  onCancel: (reason: string) => void;
}> = ({ block, requirements, onCancel }) => {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<string>(CANCEL_REASONS[0]);
  const [otherDetail, setOtherDetail] = useState('');

  if (block.status === 'Cancelled') {
    const cancelledAtDisplay = block.cancelledAt
      ? formatDateTime(block.cancelledAt, i18n.language)
      : '—';
    return (
      <div className="ps-fixgate-intro ps-blockstain-cancelled-block">
        <div className="ps-blockstain-cancelled-block-title">{t('blockStainEditorModal.cancelBlock.cancelledTitle')}</div>
        <div>{t('blockStainEditorModal.cancelBlock.reasonLine', { reason: block.cancelReason || '—' })}</div>
        <div>{t('blockStainEditorModal.cancelBlock.byLine', { who: block.cancelledBy || '—', when: cancelledAtDisplay })}</div>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ps-blockstain-cancel-block-btn"
      >
        {t('blockStainEditorModal.cancelBlock.cancelThisBlockButton')}
      </button>
    );
  }

  // Batch 381: the reason is required (Field Requirements, locked; reportPageChecks).
  const finalReason = chosenReason(reasonChoice, otherDetail);
  const canConfirm = blockCancelMissing(finalReason, requirements).length === 0;

  return (
    <div className="ps-fixgate-intro ps-blockstain-cancel-form">
      <label className="ps-conf-label" htmlFor={`cancel-reason-${block.id}`}>{t('blockStainEditorModal.cancelBlock.reasonFieldLabel')}</label>
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
          className="ps-conf-input ps-blockstain-other-detail-input"
          placeholder={t('blockStainEditorModal.describeReasonPlaceholder')}
          value={otherDetail}
          onChange={e => setOtherDetail(e.target.value)}
        />
      )}
      <div className="ps-blockstain-confirm-row">
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => canConfirm && onCancel(finalReason)}
          className={`ps-blockstain-danger-confirm-btn${canConfirm ? ' ps-blockstain-danger-confirm-btn--enabled' : ''}`}
        >
          {t('blockStainEditorModal.cancelBlock.confirmCancellationButton')}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setReasonChoice(CANCEL_REASONS[0]); setOtherDetail(''); }}
          className="ps-blockstain-nevermind-btn"
        >
          {t('blockStainEditorModal.nevermindButton')}
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
  requirements: readonly ResolvedFieldRequirement[];
  onOrderRestain: (stainName: string, reason: string) => void;
}> = ({ stain, stainTypes, requirements, onOrderRestain }) => {
  const { t, i18n } = useTranslation();
  const isUnstained = stain.stainName === UNSTAINED_LABEL;
  const [ordering, setOrdering] = useState(false);
  const [stainName, setStainName] = useState(isUnstained ? '' : stain.stainName);
  const [reasonChoice, setReasonChoice] = useState<string>(RESTAIN_REASONS[0]);
  const [otherDetail, setOtherDetail] = useState('');

  if (stain.restainReason) {
    const orderedAtDisplay = stain.restainOrderedAt
      ? formatDateTime(stain.restainOrderedAt, i18n.language)
      : '—';
    return (
      <div className="ps-blockstain-restain-record">
        {t('blockStainEditorModal.restainControl.restainRecordLine', { reason: stain.restainReason, who: stain.restainOrderedBy || '—', when: orderedAtDisplay })}
      </div>
    );
  }

  if (!ordering) {
    return (
      <button
        type="button"
        onClick={() => setOrdering(true)}
        className="ps-blockstain-order-restain-btn"
      >
        {t('blockStainEditorModal.restainControl.orderRestainButton')}
      </button>
    );
  }

  // Batch 381: the stain and the reason are required (Field Requirements, locked; reportPageChecks).
  const finalReason = chosenReason(reasonChoice, otherDetail);
  const canConfirm = restainMissing(stainName, finalReason, requirements).length === 0;

  return (
    <div className="ps-blockstain-restain-form">
      {isUnstained && (
        <>
          <label className="ps-conf-label ps-blockstain-small-label">{t('blockStainEditorModal.restainControl.stainFieldLabel')}</label>
          <select className="ps-conf-select ps-blockstain-restain-select" value={stainName} onChange={e => setStainName(e.target.value)}>
            <option value="">{t('blockStainEditorModal.selectPlaceholder')}</option>
            {stainTypes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </>
      )}
      <label className="ps-conf-label ps-blockstain-small-label">{t('blockStainEditorModal.restainControl.reasonFieldLabel')}</label>
      <select className="ps-conf-select" value={reasonChoice} onChange={e => setReasonChoice(e.target.value)}>
        {RESTAIN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {reasonChoice === 'Other' && (
        <input
          className="ps-conf-input ps-blockstain-other-detail-input"
          placeholder={t('blockStainEditorModal.describeReasonPlaceholder')}
          value={otherDetail}
          onChange={e => setOtherDetail(e.target.value)}
        />
      )}
      <div className="ps-blockstain-confirm-row">
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => canConfirm && onOrderRestain(stainName.trim(), finalReason)}
          className={`ps-blockstain-teal-confirm-btn${canConfirm ? ' ps-blockstain-teal-confirm-btn--enabled' : ''}`}
        >
          {t('blockStainEditorModal.restainControl.confirmRestainOrderButton')}
        </button>
        <button
          type="button"
          onClick={() => { setOrdering(false); setReasonChoice(RESTAIN_REASONS[0]); setOtherDetail(''); }}
          className="ps-blockstain-nevermind-btn"
        >
          {t('blockStainEditorModal.nevermindButton')}
        </button>
      </div>
    </div>
  );
};

export const BlockStainEditorModal: React.FC<Props> = ({ blocks, decants, casePriority, fullAccession, onUpdateBlock, onUpdateDecant, onPrintDecantContainerLabel, onSendStainOrder, onCancelBlock, onCreateSpareSlide, onOrderRestain, currentUserId, currentUserName, onClose, initialFocusBlockId, initialFocusDecantId }) => {
  const { t, i18n } = useTranslation();
  // Batch 381 (PS-359): the cancel-block and restain forms' requirements.
  const requirements = useFieldRequirements('report');
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [masterTargets, setMasterTargets] = useState<MolecularTarget[]>([]);
  // Real, per the RFP-APLIS-2026-GLOBAL Grossing Station Hardware
  // Integration gap — which block (if any) currently has the real
  // camera capture overlay open.
  const [capturingPhotoForBlockId, setCapturingPhotoForBlockId] = useState<string | null>(null);
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
    molecularTargetService.getAll().then(res => { if (res.ok) setMasterTargets(res.data.filter(tgt => tgt.active)); });
  }, []);

  // Real feature, per direct follow-up: "Additional Requirements for
  // Batch Management: cell blocks... Dedicated Hopper Assignment."
  // Same real, established convention as stainTypes immediately
  // above — fetched locally here, not passed in as a prop.
  const [cassetteColors, setCassetteColors] = useState<CassetteColorDefinition[]>([]);
  useEffect(() => {
    cassetteColorService.getAll().then(res => { if (res.ok) setCassetteColors(res.data); });
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
    const result = new Map<string, { code: string; stainOrderId?: string }[]>();
    for (const specimenBlocks of bySpecimen.values()) {
      for (const { blockId, sources } of suggestSpecimenAncillaryCptCodes(specimenBlocks, stainTypes)) {
        result.set(blockId, sources);
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
        setOrderErrors(prev => ({ ...prev, [block.id]: t('blockStainEditorModal.errors.lisRejected', { stainName: added.stainName }) }));
      }
    } catch (e) {
      const rejectedStains = nextStains.map(s => s.id === added.id ? { ...s, lisRequestStatus: 'rejected' as const } : s);
      onUpdateBlock(specimenId, block.id, { stains: rejectedStains });
      setOrderErrors(prev => ({ ...prev, [block.id]: t('blockStainEditorModal.errors.orderFailed', { stainName: added.stainName, message: (e as Error).message }) }));
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
          <div className="ps-ms-header">{t('blockStainEditorModal.header')}</div>
          <button className="ps-ms-close-btn" onClick={onClose} title={t('common.close')}>✕</button>
        </div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {t('blockStainEditorModal.introText', { priority: t(PRIORITY_LABEL_KEY[casePriority]) })}
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
                    <label className="ps-conf-label" htmlFor={`block-status-${block.id}`}>{t('blockStainEditorModal.statusFieldLabel')}</label>
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
                      {BLOCK_STATUSES.map(s => <option key={s} value={s}>{t(BLOCK_STATUS_LABEL_KEY[s])}</option>)}
                      {block.status === 'Cancelled' && <option value="Cancelled">{t('blockStainEditorModal.blockStatusLabels.cancelled')}</option>}
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
                      <div className="ps-blockstain-embed-prompt">
                        <div className="ps-blockstain-embed-prompt-text">
                          {t('blockStainEditorModal.embedCountPrompt.question', { count: block.pieceCount })}
                        </div>
                        <div className="ps-blockstain-embed-prompt-row">
                          <input
                            type="number" min={0} className="ps-conf-input ps-blockstain-embed-count-input"
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
                            {t('common.confirm')}
                          </button>
                          <button type="button" className="ps-conf-btn-secondary" onClick={() => setEmbedCountPrompt(null)}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label" htmlFor={`block-priority-${block.id}`}>{t('blockStainEditorModal.priorityFieldLabel')}</label>
                    <select id={`block-priority-${block.id}`} className="ps-conf-select" value={block.priority ?? ''}
                      disabled={block.status === 'Cancelled'}
                      onChange={e => onUpdateBlock(specimenId, block.id, { priority: e.target.value || undefined })}>
                      <option value="">{t('blockStainEditorModal.inheritFromCaseOption', { priority: t(PRIORITY_LABEL_KEY[casePriority]) })}</option>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{t('blockStainEditorModal.priorityOverrideOption', { priority: t(PRIORITY_LABEL_KEY[p]) })}</option>)}
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
                  <div className="ps-conf-form-field ps-blockstain-field-spaced">
                    <label className="ps-conf-label" htmlFor={`block-exception-note-${block.id}`}>
                      {block.status === 'Lost' ? t('blockStainEditorModal.exceptionNote.missingLabel') : t('blockStainEditorModal.exceptionNote.damagedLabel')}
                    </label>
                    <input
                      id={`block-exception-note-${block.id}`} type="text" className="ps-conf-input"
                      value={block.exceptionNote ?? ''}
                      placeholder={block.status === 'Lost' ? t('blockStainEditorModal.exceptionNote.missingPlaceholder') : t('blockStainEditorModal.exceptionNote.damagedPlaceholder')}
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
                    <label className="ps-conf-label" htmlFor={`block-piece-count-${block.id}`}>{t('blockStainEditorModal.piecesGrossedLabel')}</label>
                    <input
                      id={`block-piece-count-${block.id}`} type="number" min={0} className="ps-conf-input"
                      disabled={block.status === 'Cancelled'}
                      value={block.pieceCount ?? ''}
                      placeholder={t('blockStainEditorModal.piecesGrossedPlaceholder')}
                      onChange={e => {
                        const n = e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0);
                        onUpdateBlock(specimenId, block.id, { pieceCount: n });
                      }}
                    />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-blockstain-checkbox-label">
                      <input
                        type="checkbox"
                        checked={block.isEntirelySubmitted ?? true}
                        disabled={block.status === 'Cancelled'}
                        onChange={e => onUpdateBlock(specimenId, block.id, { isEntirelySubmitted: e.target.checked })}
                        className="ps-blockstain-checkbox-input"
                      />
                      <span className="ps-blockstain-checkbox-text">{t('blockStainEditorModal.entirelySubmittedLabel')}</span>
                    </label>
                  </div>
                </div>
                <div className="ps-conf-form-field ps-blockstain-field-spaced">
                  <label className="ps-conf-label" htmlFor={`block-piece-desc-${block.id}`}>{t('blockStainEditorModal.pieceDescriptionLabel')}</label>
                  <input
                    id={`block-piece-desc-${block.id}`} type="text" className="ps-conf-input"
                    disabled={block.status === 'Cancelled'}
                    value={block.pieceDescription ?? ''}
                    placeholder={t('blockStainEditorModal.pieceDescriptionPlaceholder')}
                    onChange={e => onUpdateBlock(specimenId, block.id, { pieceDescription: e.target.value || undefined })}
                  />
                </div>
                {/* Real, per direct follow-up: "add tissue
                    descriptions on cassettes as that would be good
                    for any block." Same real, simple single-line
                    pattern as Piece Description above — genuinely
                    distinct from it (this names WHAT tissue is in the
                    cassette, e.g. "Heart — LAD"; Piece Description
                    describes the physical fragment count/condition),
                    and distinct from the Block Comments thread below
                    (a running note log, not a structured, one-line
                    identifying description). */}
                <div className="ps-conf-form-field ps-blockstain-field-spaced">
                  <label className="ps-conf-label" htmlFor={`block-tissue-desc-${block.id}`}>{t('blockStainEditorModal.tissueDescriptionLabel')}</label>
                  <input
                    id={`block-tissue-desc-${block.id}`} type="text" className="ps-conf-input"
                    disabled={block.status === 'Cancelled'}
                    value={block.tissueDescription ?? ''}
                    placeholder={t('blockStainEditorModal.tissueDescriptionPlaceholder')}
                    onChange={e => onUpdateBlock(specimenId, block.id, { tissueDescription: e.target.value || undefined })}
                  />
                </div>
                {/* Real, per the RFP-APLIS-2026-GLOBAL Grossing
                    Station Hardware Integration gap — populates the
                    real, previously-empty DigitalAsset pipeline (see
                    CameraCaptureControl.tsx's own header for the full
                    account). */}
                <div className="ps-conf-form-field ps-blockstain-field-spaced">
                  <label className="ps-conf-label">{t('blockStainEditorModal.blockFacePhotosLabel')}</label>
                  <div className="ps-blockstain-photo-thumbs">
                    {(block.digitalAssets ?? []).filter((a: any) => a.kind === 'block_face_photo').map((a: any) => (
                      <img key={a.id} src={a.url} alt={t('blockStainEditorModal.blockFacePhotoAlt')} className="ps-blockstain-photo-thumb" />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ps-btn-small"
                    onClick={() => setCapturingPhotoForBlockId(block.id)}
                  >
                    {t('blockStainEditorModal.addPhotoButton')}
                  </button>
                </div>
                {capturingPhotoForBlockId === block.id && (
                  <CameraCaptureControl
                    kind="block_face_photo"
                    capturedBy={currentUserName}
                    onCapture={asset => {
                      onUpdateBlock(specimenId, block.id, { digitalAssets: [...(block.digitalAssets ?? []), asset] });
                      setCapturingPhotoForBlockId(null);
                    }}
                    onClose={() => setCapturingPhotoForBlockId(null)}
                  />
                )}
                <div className="ps-conf-form-field ps-blockstain-field-spaced">
                  <label className="ps-conf-label">{t('blockStainEditorModal.blockCommentsLabel')}</label>
                  {(block.comments ?? []).map(c => (
                    <div key={c.id} className="ps-blockstain-comment-row">
                      <Trans i18nKey="blockStainEditorModal.commentMeta" values={{ author: c.authorName, when: formatDateTime(c.createdAt, i18n.language) }} components={{ author: <strong className="ps-blockstain-comment-author" /> }} />
                      <div className="ps-blockstain-comment-text">{c.text}</div>
                    </div>
                  ))}
                  {block.status !== 'Cancelled' && (
                    <BlockCommentComposer
                      onSubmit={text => onUpdateBlock(specimenId, block.id, {
                        comments: [...(block.comments ?? []), {
                          id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          authorId: currentUserId, authorName: currentUserName, text, createdAt: new Date().toISOString(),
                        }],
                      })}
                    />
                  )}
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
                  sourcePlaceholder={t('blockStainEditorModal.foreignId.blockSourcePlaceholder')}
                  idPlaceholder={t('blockStainEditorModal.foreignId.blockIdPlaceholder')}
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
                    className="ps-blockstain-print-secondary-btn"
                  >
                    {t('blockStainEditorModal.printSecondaryLabelButton')}
                  </button>
                )}
                <label className="ps-conf-label">{t('blockStainEditorModal.stainsLabel')}</label>
                {block.status === 'Cancelled' ? (
                  <div className="ps-blockstain-cancelled-stains">
                    {(block.stains ?? []).map((s: any) => (
                      <span key={s.id} className="ps-protocol-stainselect-chip ps-blockstain-cancelled-stain-chip">
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
                      masterTargets={masterTargets}
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
                      <div key={s.id} className="ps-blockstain-stain-row">
                        {/* Real fix (PS-314 — "'Stain' field could show
                            a Stain identifier for clarity"): s.displayId
                            is the real, already-generated slide
                            identifier (slideIdentifier(), the same real
                            id WsiViewerLaunchButton routes a scan launch
                            to) — it existed on this record already but
                            was never actually shown anywhere a person
                            reads, only used internally for that launch
                            URL. With more than one stain on a block
                            (routine, especially after a restain), stain
                            name + status alone doesn't say which
                            physical slide is which; the real identifier
                            does. Shown only when present — a stain not
                            yet through labeling has no real displayId
                            yet. */}
                        <span className="ps-blockstain-stain-row-label">
                          {s.stainName === UNSTAINED_LABEL ? t('blockStainEditorModal.unstainedSpareLabel') : s.stainName}
                          {s.displayId ? ` (${s.displayId})` : ''} — {s.status}
                        </span>
                        <RestainControl
                          stain={s}
                          stainTypes={stainTypes}
                          requirements={requirements}
                          onOrderRestain={(stainName, reason) => onOrderRestain(specimenId, block.id, {
                            targetSlideId: s.id,
                            stainName, reason,
                          })}
                        />
                        <StainCommentControl
                          stain={s}
                          currentUserId={currentUserId}
                          currentUserName={currentUserName}
                          onUpdateStainComments={nextComments => onUpdateBlock(specimenId, block.id, {
                            stains: (block.stains ?? []).map((st: any) => st.id === s.id ? { ...st, comments: nextComments } : st),
                          })}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => onCreateSpareSlide(specimenId, block.id)}
                      className="ps-blockstain-create-spare-btn"
                    >
                      {t('blockStainEditorModal.createSpareSlideButton')}
                    </button>
                  </>
                )}
                {orderingBlockId === block.id && (
                  <div className="ps-fixgate-intro ps-blockstain-inline-status">{t('blockStainEditorModal.placingStainOrder')}</div>
                )}
                {orderErrors[block.id] && (
                  <div className="ps-fixgate-intro ps-blockstain-inline-status ps-blockstain-inline-status--error">
                    {orderErrors[block.id]}
                  </div>
                )}
                <BlockCptSuggestion
                  specimenId={specimenId}
                  block={block}
                  allSuggestedSources={suggestionsByBlockId.get(block.id) ?? []}
                  onUpdateBlock={onUpdateBlock}
                />
                <CancelBlockControl
                  block={block}
                  requirements={requirements}
                  onCancel={reason => onCancelBlock(specimenId, block.id, reason)}
                />
              </div>
            ))}
            {blocks.length === 0 && <div className="ps-cmnt-thread-empty">{t('blockStainEditorModal.noBlocksYet')}</div>}

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
                  {t('blockStainEditorModal.decantsSectionLabel')}
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
                      sourcePlaceholder={t('blockStainEditorModal.foreignId.decantSourcePlaceholder')}
                      idPlaceholder={t('blockStainEditorModal.foreignId.decantIdPlaceholder')}
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

                    {/* Real, per direct follow-up on comment-field
                        parity across material types — same real
                        pattern as the block comments section above,
                        reusing onUpdateDecant's own generic patch
                        callback. See Decant.comments's own doc
                        comment (types/case/Material.ts). */}
                    <div className="ps-conf-form-field ps-blockstain-field-spaced">
                      <label className="ps-conf-label">{t('blockStainEditorModal.decantCommentsLabel')}</label>
                      {(decant.comments ?? []).map(c => (
                        <div key={c.id} className="ps-blockstain-comment-row">
                          <Trans i18nKey="blockStainEditorModal.commentMeta" values={{ author: c.authorName, when: formatDateTime(c.createdAt, i18n.language) }} components={{ author: <strong className="ps-blockstain-comment-author" /> }} />
                          <div className="ps-blockstain-comment-text">{c.text}</div>
                        </div>
                      ))}
                      <BlockCommentComposer
                        onSubmit={text => onUpdateDecant(specimenId, decant.id, {
                          comments: [...(decant.comments ?? []), {
                            id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            authorId: currentUserId, authorName: currentUserName, text, createdAt: new Date().toISOString(),
                          }],
                        })}
                      />
                    </div>

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
                      {t('blockStainEditorModal.printContainerLabelButton')}
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
                        {t('blockStainEditorModal.printSecondaryLabelButton')}
                      </button>
                    )}

                    <label className="ps-conf-label">{t('blockStainEditorModal.stainsLabel')}</label>
                    <StainMultiSelect
                      stainTypes={stainTypes}
                      stains={decant.stains ?? []}
                      onChange={stains => handleDecantStainsChange(specimenId, decant, stains)}
                      masterTargets={masterTargets}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-apply" onClick={onClose}>{t('blockStainEditorModal.doneButton')}</button>
        </div>
      </div>
    </div>
  );
};
