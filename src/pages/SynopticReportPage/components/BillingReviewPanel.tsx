// src/pages/SynopticReportPage/components/BillingReviewPanel.tsx
// -----------------------------------------------------------------------------
// Real feature, per direct request: AI-suggested ancillary billing codes
// (special stains, IHC - see services/billing/codeMapTable.ts) must be
// explicitly confirmed or overridden by a pathologist.
//
// Deliberately a real right-panel TAB (activeReportType === 'billing'),
// not a modal - per direct, correct catch: a full-screen overlay would
// cover LeftReportPanel entirely, defeating the whole point of showing
// the report alongside the review. Sits in the exact same real
// grossing/microscopic/synoptic slot in SynopticReportPage.tsx, so
// LeftReportPanel never needs to change to accommodate this - same real
// reasoning already documented there for why LeftReportPanel is kept
// outside that conditional in the first place.
//
// Real, per direct feedback: renders every pending suggestion as a full
// list, not a one-at-a-time stepper - "I would prefer to list them out
// in an appropriate sequence." Language and row styling (Confirm/
// Override, the "AI source: ..." line, font sizes/colors) deliberately
// match RightSynopticPanel's own field-review UI exactly, per the same
// feedback's own reasoning: "this way the interactions with AI are
// consistent." No confidence percentage badge, unlike that panel's -
// these suggestions come from a deterministic rule engine, not a
// probabilistic model, so a fabricated confidence score would be
// dishonest rather than genuinely informative.
//
// Each suggestion needs an explicit Confirm or Override action; an
// overridden code is permanently remembered (HistologyBlock.coding.
// rejectedCpt - see that field's own comment) so it never resurfaces
// for this block again - deliberately different from
// ProtocolChangeModal's own select/deselect-then-apply model, where
// deselecting isn't a real rejection and the same proposal can
// silently reappear next time.
//
// Generalized, per direct request, so this same component can be opened
// from other real trigger points later (e.g. a frozen-section completion
// gate) without changes - takes a "context" label for the header copy
// rather than hardcoding sign-out language, and has no built-in
// assumption about what happens when review finishes.
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { stainTypeService } from '@/services';
import type { StainType } from '@/services/stains/IStainService';
import { CODE_MAP_TABLE, computeCaseCodingSummary, type SpecimenCodingSummary } from '@/services/billing/codeMapTable';
import type { AppliedBlockCode } from '@/types/case/Specimen';
import { CodeSearchModal } from '@/components/Common/CodeSearchModal';

interface PendingCode {
  specimenId: string;
  specimenLabel: string;
  blockId: string;
  blockLabel: string;
  stainNames: string[];
  code: string;
  /** Real, per direct follow-up: the exact stain/slide (StainOrder.id
   *  and its real stainName) that produced this specific suggestion -
   *  see SpecimenCodingSummaryBlock.unappliedSuggestionSources's own
   *  comment. Undefined only for a suggestion whose original source
   *  stain genuinely can't be resolved (e.g. very old data predating
   *  this link) - falls back to the block's stain list as a whole in
   *  that case, same as before this fix. */
  sourceStainId?: string;
  sourceStainName?: string;
}

interface BillingReviewPanelProps {
  specimens: { id: string; label: string; description?: string; coding?: { cpt?: string[] }; blocks?: { id: string; label: string; stains?: { id?: string; stainName: string }[]; coding?: { cpt?: AppliedBlockCode[]; rejectedCpt?: AppliedBlockCode[] } }[]; matrixBlockIds?: string[]; matrixBlockCoding?: { matrixBlockId: string; cpt?: AppliedBlockCode[]; rejectedCpt?: AppliedBlockCode[] }[] }[];
  /** Real, per direct billing-expert guidance (PS-93) — see
   *  BillingReviewPanel.tsx's own identical prop for the full
   *  reasoning. Defaults to [] — a case with no Biopsy Arrays renders
   *  exactly as it always did before this feature existed. */
  matrixBlocks?: { id: string; label: string; participants: { specimenId: string; positionInBlock: number }[]; slides: { id?: string; stainName: string; targetSpecimenIds?: string[]; evaluatedSpecimenIds?: string[] }[] }[];
  /** Real, per direct billing-expert guidance (PS-93) — the Evaluated
   *  Cores Checklist's own real write. See
   *  SynopticReportPage.tsx's own handleSetMatrixEvaluatedCores for
   *  the real implementation this is always wired to. */
  onSetMatrixEvaluatedCores?: (matrixBlockId: string, stainOrderId: string, evaluatedSpecimenIds: string[]) => void;
  /** Real, per direct billing-expert guidance (PS-93) — applies/
   *  rejects one specimen's own contribution from a shared MatrixBlock
   *  — deliberately separate props from onApprove/onRejectOnly above,
   *  since the real storage location differs (Specimen.matrixBlockCoding,
   *  not HistologyBlock.coding) — see SynopticReportPage.tsx's own
   *  handleApplyMatrixBillingCode/handleRejectMatrixBillingCode. */
  onApplyMatrixCode?: (specimenId: string, matrixBlockId: string, code: string, stainOrderId?: string) => void;
  onRejectMatrixCode?: (specimenId: string, matrixBlockId: string, code: string, stainOrderId?: string) => void;
  onApprove: (specimenId: string, blockId: string, code: string, stainOrderId?: string) => void;
  /** Real fix, found via direct data inspection: calling a separate
   *  onReject then onApprove back-to-back for the same suggestion
   *  silently lost one of the two changes (both computed their own
   *  update from the same stale snapshot). This is the atomic,
   *  combined action instead - the real handler behind it computes
   *  both changes from a single read and writes them together in one
   *  update. */
  onOverride: (specimenId: string, blockId: string, oldCode: string, newCode: string, stainOrderId?: string) => void;
  /** Real fix, found while wiring onOverride above: the old Override
   *  button always let a pathologist reject a suggestion outright,
   *  with no replacement needed (they may simply believe no code is
   *  warranted at all). Requiring a replacement code to close the
   *  expanded card would have silently removed that capability. */
  onRejectOnly: (specimenId: string, blockId: string, code: string, stainOrderId?: string) => void;
  /** Real feature, per direct request: "we need the delete in case they
   *  want to remove the billing on that item." Removes a real, already-
   *  applied code from a block's coding.cpt - deliberately does NOT
   *  touch rejectedCpt, so a deleted AI-confirmed code is free to
   *  reappear as a real, pending suggestion on the next recompute (the
   *  underlying stain evidence hasn't changed), giving a pathologist a
   *  genuine second chance at it rather than silently losing it for
   *  this block forever. A deleted manually-added code just disappears,
   *  since it was never a suggestion to begin with. */
  onDelete: (specimenId: string, blockId: string, code: string, stainOrderId?: string) => void;
  /** Real feature, per direct request: "display the specimen level
   *  codes in the billing area where they can remove the code if need
   *  be." Specimen-level base codes are a genuinely different shape
   *  from block-level ancillary ones - no blockId at all - so this is
   *  a separate delete action, not a reuse of onDelete above. */
  onDeleteBaseCode: (specimenId: string, code: string) => void;
  /** Real, per direct guidance's own follow-up: "post-signout
   *  additions may be required if the wrong code was billed... the
   *  original bill is credited and the new billing code submitted."
   *  Genuinely different from onDelete above - a correction credits
   *  the original AND submits a real, new replacement code in one
   *  action, rather than only removing the original. Only meaningful
   *  for a genuinely applied, already-charged code (a real
   *  ServiceChargeRecord to reverse) - the caller decides when to
   *  offer this, never this presentational component. */
  onCorrect?: (specimenId: string, blockId: string, oldCode: string, stainOrderId?: string) => void;
  /** Specimen-level counterpart to onCorrect above, mirroring the
   *  onDelete/onDeleteBaseCode split exactly - a base code has no
   *  blockId. */
  onCorrectBaseCode?: (specimenId: string, code: string) => void;
  /** Real feature, per the redesign's own new "select a specimen, see
   *  its detail" model: closes a real, pre-existing gap this panel
   *  had - there was previously no way to manually assign a specimen-
   *  level base code here at all (only delete an auto-applied one).
   *  Mirrors onApprove's own shape, minus blockId - a base code has no
   *  block. */
  onAddBaseCode: (specimenId: string, code: string) => void;
  /** Real feature, per direct request: "an option to Approve all billing
   *  since they can see it all now... could be a lot in some
   *  instances." Takes the full, real batch at once rather than being
   *  called once per item - see this component's own handleConfirmAll
   *  for why a naive per-item loop through onApprove would be a real
   *  bug here: several real demo blocks (e.g. the MMR case) carry more
   *  than one pending suggestion with the SAME code value on the SAME
   *  block, and repeated synchronous calls to a single-code handler
   *  would each read the same stale coding.cpt before React re-renders
   *  between them, silently dropping all but one. The caller groups by
   *  block and applies each block's full, real set of new codes in one
   *  update instead. */
  onApproveAll: (items: { specimenId: string; blockId: string; code: string; stainOrderId?: string }[]) => void;
  /** Real, shared highlight mechanism - the exact same one
   *  RightSynopticPanel's own onHighlight already drives. Pass
   *  SynopticReportPage's setRawHighlightText directly. Real, disclosed
   *  limitation found via direct feedback: this only ever targets
   *  LeftReportPanel's own report-text search (Report Draft tab) - it
   *  does nothing on the Material tab. Use onHighlightStain below for
   *  that. */
  onHighlight: (text: string | undefined) => void;
  /** Real fix, per direct feedback: "the source is still not getting
   *  highlighted... only the H&E slides remain highlighted." onHighlight
   *  above was silently a no-op for anyone viewing the Material tab
   *  (where a pathologist reviewing billing suggestions actually is,
   *  per the AI source line pointing at a specific stain slide) - it
   *  only ever affected LeftReportPanel's report text. This is the
   *  real, separate, exact-id-based highlight MaterialTreePanel's own
   *  SlideChip components actually match against. */
  onHighlightStain?: (stainId: string | undefined) => void;
  /** Real feature, per direct request: the reverse sync direction -
   *  when a block or one of its stains is clicked on the Material tab
   *  while this panel is open, the matching row here highlights to
   *  match. Set by the parent whenever a real (non-decant) block gets
   *  selected there. */
  materialSelectedBlockId?: string;
  /** Real, per direct follow-up: LeftReportPanel and MaterialTreePanel
   *  are both always mounted (leftTab just toggles a CSS visibility
   *  class between them - see SynopticReportPage.tsx's own
   *  ps-syn-tab-panel--visible-block usage), so the report highlight
   *  above is invisible unless a pathologist happens to already be on
   *  the Report tab. Fired with the selected suggestion's specimenId
   *  whenever selection changes, so the caller can switch leftTab to
   *  'material' and focus that specimen in the tree - a more directly
   *  useful destination than a report-text highlight, since the
   *  Material tab is where the actual stain record (and its own
   *  editor, via MaterialTreePanel's onOpenBlockEditor) lives. */
  onFocusBlock?: (specimenId: string) => void;
  /** Real, per direct requirement: lets this same component be reused
   *  from a different real trigger point later without hardcoding
   *  sign-out language into the header copy. */
  contextLabel?: string;
}

// Real, honest lookup - checks both a real CPT code and a real
// billingCode label (suggestions from newer specimens carry
// billingCode labels like 'IHC-FIRST', not raw CPT - see
// services/billing/README.md's own Charge Capture section for why).
// Never fabricates a description for an unrecognized code.
function describeCode(code: string): string {
  const entry = CODE_MAP_TABLE.find(e => e.code === code || e.billingCode === code);
  return entry?.description ?? code;
}

// Real fix, per direct feedback: "should there be a code next to
// [the description]?" PendingRow was showing item.code directly as
// its bold header - for a real, applied base code that's already the
// raw CPT number, but for a pending ancillary suggestion, item.code
// is the internal billingCode label ('IHC-ADDL'), never resolved to
// its real CPT number (88341) anywhere in the row. Same lookup as
// describeCode above, returning the other field.
function resolveRealCptCode(code: string): string | null {
  const entry = CODE_MAP_TABLE.find(e => e.code === code || e.billingCode === code);
  return entry?.code ?? null;
}

const BillingReviewPanel: React.FC<BillingReviewPanelProps> = ({
  specimens, matrixBlocks = [], onSetMatrixEvaluatedCores, onApplyMatrixCode, onRejectMatrixCode, onApprove, onOverride, onRejectOnly, onDelete, onDeleteBaseCode, onCorrect, onCorrectBaseCode, onAddBaseCode, onApproveAll, onHighlight, onHighlightStain, materialSelectedBlockId, onFocusBlock, contextLabel,
}) => {
  const { t } = useTranslation();
  const effectiveContextLabel = contextLabel ?? t('billingReviewPanel.defaultContextLabel');
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
  }, []);

  const summary = computeCaseCodingSummary(specimens, stainTypes, matrixBlocks);

  const pending: PendingCode[] = summary.flatMap(sp =>
    sp.blocks.flatMap(block => {
      const rawBlock = specimens.find(s => s.id === sp.specimenId)?.blocks?.find(b => b.id === block.blockId);
      return block.unappliedSuggestionSources.map(({ code, stainOrderId }) => ({
        specimenId: sp.specimenId,
        specimenLabel: sp.specimenLabel,
        blockId: block.blockId,
        blockLabel: block.blockLabel,
        stainNames: block.stainNames,
        code,
        sourceStainId: stainOrderId,
        sourceStainName: rawBlock?.stains?.find(s => s.id === stainOrderId)?.stainName,
      }));
    })
  );

  // Real, per direct feedback: "specimen assets on one side, code
  // details on the right." A block can be pending review, have real
  // applied codes, or both at once - the tree needs to show enough at
  // a glance to know where attention is needed without opening it.
  const pendingCountFor = (specimenId: string, blockId: string) => pending.filter(p => p.specimenId === specimenId && p.blockId === blockId).length;
  const appliedCountFor = (specimenId: string, blockId: string) => summary.find(sp => sp.specimenId === specimenId)?.blocks.find(b => b.blockId === blockId)?.appliedAncillaryCodes.length ?? 0;

  // Real feature, per direct feedback: "this could grow the left
  // panel, we should be able to collapse the slides and blocks under
  // the specimen." Specimens default open; blocks default open only
  // when they have something pending (auto-surfaces what needs
  // attention without the user expanding every block by hand first),
  // collapsed otherwise to keep an all-clear block from adding height
  // for nothing. Lazy-initialized once from the real, current pending
  // set - doesn't re-run on every summary change, so it never
  // overrides a user's own manual collapse/expand choice later.
  const [collapsedSpecimenIds, setCollapsedSpecimenIds] = useState<Set<string>>(() => new Set());
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(() => new Set());
  // Real fix, found via live verification: stainTypes loads
  // asynchronously (see the fetch effect above) - a lazy useState
  // initializer runs once, on the very first render, before that real
  // data arrives, so it always captured an empty pending set and
  // never actually auto-expanded anything. This waits for stainTypes
  // to genuinely be loaded, then runs the same real auto-expand logic
  // exactly once (hasAutoExpanded guards against re-running and
  // silently re-expanding a block the user has since collapsed by
  // hand, whenever summary recomputes for any other reason).
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (hasAutoExpanded.current || stainTypes.length === 0) return;
    hasAutoExpanded.current = true;
    setExpandedBlockIds(() => {
      const initial = new Set<string>();
      summary.forEach(sp => sp.blocks.forEach(block => {
        if (pendingCountFor(sp.specimenId, block.blockId) > 0) initial.add(block.blockId);
      }));
      return initial;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stainTypes.length]);
  const toggleSpecimenCollapsed = (specimenId: string) => {
    setCollapsedSpecimenIds(prev => {
      const next = new Set(prev);
      if (next.has(specimenId)) next.delete(specimenId); else next.add(specimenId);
      return next;
    });
  };
  const toggleBlockExpanded = (blockId: string) => {
    setExpandedBlockIds(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId); else next.add(blockId);
      return next;
    });
  };

  type Selection = { type: 'specimen'; specimenId: string } | { type: 'block'; specimenId: string; blockId: string };
  const [selected, setSelected] = useState<Selection | null>(null);

  // Real feature, per direct request: "since the stains and blocks are
  // selectable [on Material], I think the User would expect the...
  // associated row would be highlighted in the billing review panel."
  // Only re-runs when materialSelectedBlockId itself changes (a real,
  // new click on Material), never on every render - so it never fights
  // with the user manually selecting a different row within this
  // panel's own tree, which doesn't touch this prop at all.
  useEffect(() => {
    if (!materialSelectedBlockId) return;
    const owningSpecimen = specimens.find(sp => sp.blocks?.some(b => b.id === materialSelectedBlockId));
    if (!owningSpecimen) return;
    setManualAddTargetStainId(null);
    setSelected({ type: 'block', specimenId: owningSpecimen.id, blockId: materialSelectedBlockId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialSelectedBlockId]);

  // Real, per direct feedback, default selection: the first real block
  // with something pending, so opening this tab lands directly on the
  // thing most likely to need attention - same real intent the old
  // stepper's own default (pending[0]) had, just expressed through the
  // new tree/detail model instead of a step index.
  const effectiveSelection: Selection | null = selected ?? (pending[0] ? { type: 'block', specimenId: pending[0].specimenId, blockId: pending[0].blockId } : (specimens[0] ? { type: 'specimen', specimenId: specimens[0].id } : null));

  const selectedSpecimenSummary = effectiveSelection ? summary.find(sp => sp.specimenId === effectiveSelection.specimenId) : undefined;
  const selectedBlockSummary = effectiveSelection?.type === 'block' ? selectedSpecimenSummary?.blocks.find(b => b.blockId === effectiveSelection.blockId) : undefined;
  const selectedRawSpecimen = effectiveSelection ? specimens.find(s => s.id === effectiveSelection.specimenId) : undefined;
  const selectedRawBlock = effectiveSelection?.type === 'block' ? selectedRawSpecimen?.blocks?.find(b => b.id === effectiveSelection.blockId) : undefined;

  const pendingForSelectedBlock = effectiveSelection?.type === 'block'
    ? pending.filter(p => p.specimenId === effectiveSelection.specimenId && p.blockId === effectiveSelection.blockId)
    : [];

  // Real, per direct feedback: "the individual elements on the right
  // are not clickable as expected... When the individual element is
  // selected it is expected to highlight the AI source." A block can
  // carry several pending suggestions with different real source
  // stains (e.g. IHC-FIRST from MLH1, IHC-ADDL from MSH2) - this
  // tracks which specific row is active, independent of the tree's
  // own block-level selection, so clicking a row highlights that
  // row's own source rather than always defaulting to the first one.
  const [activePendingKey, setActivePendingKey] = useState<string | null>(null);
  const pendingKeyFor = (item: PendingCode) => `${item.blockId}::${item.code}::${item.sourceStainId ?? ''}`;
  const activePendingItem = pendingForSelectedBlock.find(item => pendingKeyFor(item) === activePendingKey) ?? pendingForSelectedBlock[0];

  // Real, per direct feedback: selecting a row (not stepping through a
  // stepper) is what now drives which source is highlighted in the
  // report/Material tab - a specimen row focuses that specimen with no
  // report-text highlight (a base code isn't tied to one specific
  // stain), a block row highlights its first real pending suggestion's
  // source stain if it has one pending, or just its own stain list
  // otherwise.
  useEffect(() => {
    if (!effectiveSelection) { onHighlight(undefined); onHighlightStain?.(undefined); return; }
    onFocusBlock?.(effectiveSelection.specimenId);
    if (effectiveSelection.type === 'block') {
      onHighlight(activePendingItem?.sourceStainName || selectedBlockSummary?.stainNames?.[0] || undefined);
      onHighlightStain?.(activePendingItem?.sourceStainId);
    } else {
      onHighlight(undefined);
      onHighlightStain?.(undefined);
    }
    return () => { onHighlight(undefined); onHighlightStain?.(undefined); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelection?.type, effectiveSelection?.specimenId, (effectiveSelection as any)?.blockId, activePendingItem?.code, activePendingItem?.sourceStainId]);

  // Real feature, per direct feedback: a fresh block selection should default
  // back to its own first pending item's highlight, not silently keep
  // whatever row was active in the previously-selected block - UNLESS
  // a stain row was clicked directly (via onSelectStain below), which
  // sets this one-shot ref immediately before changing the selection
  // so this same effect can pick up the intended item instead of
  // always resetting to null.
  const pendingStainKeyRef = useRef<string | null>(null);
  const [manualAddTargetStainId, setManualAddTargetStainId] = useState<string | null>(null);
  useEffect(() => {
    setActivePendingKey(pendingStainKeyRef.current);
    pendingStainKeyRef.current = null;
    // Real fix, found via direct live verification: a stain click
    // within the SAME, already-selected block (e.g. clicking H&E when
    // block A1 was already active by default) never changes
    // specimenId/blockId, so this effect never re-fires for it -
    // manualAddTargetStainId must NOT be reset here, or it would be
    // wiped out immediately after onSelectStain sets it directly
    // below. Only a genuine block/specimen change (via the ordinary
    // onSelect, not onSelectStain) should clear the stain target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelection?.type, effectiveSelection?.specimenId, (effectiveSelection as any)?.blockId]);

  // Real feature, per direct feedback: clicking a specific stain row
  // in the tree jumps directly to that stain's own pending item in
  // the detail panel (if it has one) AND targets manual-add at that
  // exact stain regardless - a stain with nothing pending yet (or
  // already resolved) is still a real, valid target to add a new code
  // to directly. Sets manualAddTargetStainId directly, not via a
  // deferred ref/effect - see the effect above for why that would
  // silently fail to update when the stain's own block is already
  // the active selection.
  const onSelectStain = (specimenId: string, blockId: string, pendingKey: string | null, stainOrderId: string) => {
    pendingStainKeyRef.current = pendingKey;
    setManualAddTargetStainId(stainOrderId);
    setSelected({ type: 'block', specimenId, blockId });
  };

  // Real fix: only an explicit stain-row click (onSelectStain above)
  // should target manual-add at a specific stain - an ordinary
  // specimen or block row click is not targeting any one stain, so
  // the target needs to be explicitly cleared here rather than left
  // stale from whatever stain was last clicked.
  const onSelectSpecimenOrBlock = (sel: Selection) => {
    setManualAddTargetStainId(null);
    setSelected(sel);
  };

  // Real feature, per direct course-correction: routing Override to a
  // separate modal/view was rejected - "why bother having the Code
  // review screen at all" if all real CRUD happens elsewhere, and
  // navigating away entirely felt disjointed ("the screen changes
  // completely... seems to get stuck in that view"). Instead, only the
  // specific row being overridden expands in place to reveal a search
  // box - the rest of the review list, and the tree, stay exactly as
  // they were the whole time.
  const [overridingKey, setOverridingKey] = useState<string | null>(null);
  const [overrideCodeValue, setOverrideCodeValue] = useState('');

  useEffect(() => {
    setOverridingKey(null);
    setOverrideCodeValue('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelection?.type, effectiveSelection?.specimenId, (effectiveSelection as any)?.blockId]);

  // Real, per direct request: "when the user searches and selects the
  // code they want, they have a confirm button that closes the
  // expanded card and allows them to continue the review." Rejects the
  // old AI suggestion (same real audit trail as today's Override) and
  // applies the newly-chosen replacement in one action, then collapses
  // back to the normal list.
  const overrideCodeAlreadyApplied = !!selectedRawBlock?.coding?.cpt?.some(c => c.code === overrideCodeValue.trim());

  const handleConfirmOverride = (item: PendingCode) => {
    const code = overrideCodeValue.trim();
    if (!code || overrideCodeAlreadyApplied) return;
    onOverride(item.specimenId, item.blockId, item.code, code, item.sourceStainId);
    setOverridingKey(null);
    setOverrideCodeValue('');
  };

  // Real fix: preserves the old Override button's own real capability
  // to reject a suggestion outright, with no replacement - a
  // pathologist may simply believe no code is warranted at all for
  // this stain, not every override is "pick a different one."
  const handleRejectOnly = (item: PendingCode) => {
    onRejectOnly(item.specimenId, item.blockId, item.code, item.sourceStainId);
    setOverridingKey(null);
    setOverrideCodeValue('');
  };

  // Real feature, per direct request: "a way to manually add billing if
  // there are no suggestions or the suggestions missed something." The
  // real suggestion engine deliberately only covers Special Stain/IHC
  // categories (see suggestAncillaryCodesForStains's own comment) -
  // Molecular, a genuinely new stain type not yet in the dictionary, or
  // a real coder's own judgment call all need a way in that doesn't
  // depend on the rule engine having produced something first. Real,
  // per the new layout: no longer needs its own specimen/block
  // dropdowns - the tree selection already determines the real target.
  // Real feature, per direct feedback: "there isn't much space... its
  // just too cramped." Controls the new CodeSearchModal for each of
  // the two real places a search was previously crammed into this
  // narrow panel - manual add and Override's own replacement search.
  const [showManualCodeSearch, setShowManualCodeSearch] = useState(false);
  const [showOverrideCodeSearch, setShowOverrideCodeSearch] = useState(false);

  // Real fix, per direct follow-up ("add multiple codes"/"stains need
  // to be selectable"): the modal now applies each code immediately
  // and stays open, rather than staging one value for a separate
  // confirm button - this replaces the old pre-computed
  // manualCodeAlreadyApplied boolean with a real, callable check the
  // modal can run against whichever (code, stain) pair is actually
  // being picked in the moment.
  const isManualCodeAlreadyApplied = (code: string, stainId: string | undefined) =>
    !!selectedRawBlock?.coding?.cpt?.some(c => c.code === code && c.stainOrderId === stainId);

  // Real feature, per direct request: "an option to Approve all billing
  // since they can see it all now... save them the tedium of going to
  // every entry." Uses onApproveAll (a single, batched call) rather
  // than pending.forEach(item => onApprove(...)) - see this component's
  // own onApproveAll prop comment for the real, specific bug a naive
  // loop would cause on blocks with duplicate pending codes.
  const handleConfirmAll = () => {
    onApproveAll(pending.map(item => ({ specimenId: item.specimenId, blockId: item.blockId, code: item.code, stainOrderId: item.sourceStainId })));
  };

  return (
    <div className="ps-billing-review-panel">
      <div className="ps-billing-review-panel-header">
        <div>
          <div className="fm-eyebrow ps-billing-eyebrow">
            ✦ {t('billingReviewPanel.title')}
          </div>
          <h3 className="ps-billing-review-panel-heading">
            {pending.length > 0
              ? t('billingReviewPanel.codesNeedReview', { count: pending.length, context: effectiveContextLabel })
              : t('billingReviewPanel.billingCodesHeading')}
          </h3>
        </div>
        {pending.length > 1 && (
          <button
            onClick={handleConfirmAll}
            className="ps-billing-confirm-all-btn"
          >✓ {t('billingReviewPanel.confirmAllButton', { count: pending.length })}</button>
        )}
      </div>

      <div className="ps-billing-main-row">
        <SpecimenTree
          summary={summary}
          specimens={specimens}
          selected={effectiveSelection}
          onSelect={onSelectSpecimenOrBlock}
          onSelectStain={onSelectStain}
          activePendingKey={activePendingKey}
          manualAddTargetStainId={manualAddTargetStainId}
          pendingCountFor={pendingCountFor}
          appliedCountFor={appliedCountFor}
          collapsedSpecimenIds={collapsedSpecimenIds}
          onToggleSpecimenCollapsed={toggleSpecimenCollapsed}
          expandedBlockIds={expandedBlockIds}
          onToggleBlockExpanded={toggleBlockExpanded}
        />
        <DetailPanel
          selection={effectiveSelection}
          selectedRawSpecimen={selectedRawSpecimen}
          selectedSpecimenSummary={selectedSpecimenSummary}
          selectedBlockSummary={selectedBlockSummary}
          pendingForSelectedBlock={pendingForSelectedBlock}
          activePendingKey={activePendingKey}
          onSelectPending={setActivePendingKey}
          overridingKey={overridingKey}
          onStartOverride={setOverridingKey}
          overrideCodeValue={overrideCodeValue}
          setOverrideCodeValue={setOverrideCodeValue}
          overrideCodeAlreadyApplied={overrideCodeAlreadyApplied}
          onConfirmOverride={handleConfirmOverride}
          onRejectOnly={handleRejectOnly}
          onApprove={onApprove}
          onDelete={onDelete}
          onDeleteBaseCode={onDeleteBaseCode}
          onCorrect={onCorrect}
          onCorrectBaseCode={onCorrectBaseCode}
          onAddBaseCode={onAddBaseCode}
          onApproveAll={onApproveAll}
          isManualCodeAlreadyApplied={isManualCodeAlreadyApplied}
          onHighlightStain={onHighlightStain}
          manualAddTargetStainId={manualAddTargetStainId}
          showManualCodeSearch={showManualCodeSearch}
          setShowManualCodeSearch={setShowManualCodeSearch}
          showOverrideCodeSearch={showOverrideCodeSearch}
          setShowOverrideCodeSearch={setShowOverrideCodeSearch}
        />
      </div>

      {matrixBlocks.length > 0 && (
        <MatrixArrayCoverageSection
          matrixBlocks={matrixBlocks}
          specimens={specimens}
          summary={summary}
          onSetMatrixEvaluatedCores={onSetMatrixEvaluatedCores}
          onApplyMatrixCode={onApplyMatrixCode}
          onRejectMatrixCode={onRejectMatrixCode}
        />
      )}
    </div>
  );
};

// Real, per direct feedback: "specimen assets on one side" - directly
// mirrors the Code Manager's own left panel (Case Level, then each
// specimen with its applied codes underneath), extended one level
// deeper for this panel's own real, block-level granularity a
// specimen's diagnosis/procedure codes never needed. Shows real
// Real feature, per direct request: "an indication of state similar
// to what we do for the specimens in sidebar - using colored dots."
// Sidebar.tsx's own StatusDot isn't exported, so replicated here with
// the exact same three colors/meaning for visual consistency across
// the app, rather than inventing a new color vocabulary.
type DotStatus = 'complete' | 'partial' | 'empty' | 'rejected';
// UI-chrome tooltip labels for a computed display status (not a
// persisted enum value) — translated via the same label-key
// indirection used for real persisted enums elsewhere in this sweep.
const DOT_STATUS_LABEL_KEY: Record<DotStatus, string> = {
  complete: 'billingReviewPanel.dotStatus.applied',
  partial:  'billingReviewPanel.dotStatus.pendingReview',
  empty:    'billingReviewPanel.dotStatus.noCodes',
  rejected: 'billingReviewPanel.dotStatus.declined',
};
const StatusDot: React.FC<{ status: DotStatus }> = ({ status }) => {
  return (
    <span className="ps-status-dot-wrap">
      <span className={`ps-status-dot ps-billing-status-dot--${status}`} />
    </span>
  );
};

// pending/applied counts per row so a pathologist can see where
// attention is needed without opening every row first.
const SpecimenTree: React.FC<{
  summary: ReturnType<typeof computeCaseCodingSummary>;
  specimens: BillingReviewPanelProps['specimens'];
  selected: { type: 'specimen'; specimenId: string } | { type: 'block'; specimenId: string; blockId: string } | null;
  onSelect: (sel: { type: 'specimen'; specimenId: string } | { type: 'block'; specimenId: string; blockId: string }) => void;
  onSelectStain: (specimenId: string, blockId: string, pendingKey: string | null, stainOrderId: string) => void;
  activePendingKey: string | null;
  manualAddTargetStainId: string | null;
  pendingCountFor: (specimenId: string, blockId: string) => number;
  appliedCountFor: (specimenId: string, blockId: string) => number;
  collapsedSpecimenIds: Set<string>;
  onToggleSpecimenCollapsed: (specimenId: string) => void;
  expandedBlockIds: Set<string>;
  onToggleBlockExpanded: (blockId: string) => void;
}> = ({ summary, specimens, selected, onSelect, onSelectStain, activePendingKey, manualAddTargetStainId, pendingCountFor, appliedCountFor, collapsedSpecimenIds, onToggleSpecimenCollapsed, expandedBlockIds, onToggleBlockExpanded }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-billing-tree">
    <div className="ps-billing-tree-heading">
      {t('billingReviewPanel.specimensHeading')}
    </div>
    {summary.map(sp => {
      const rawSpecimen = specimens.find(s => s.id === sp.specimenId);
      const isSpecSelected = selected?.type === 'specimen' && selected.specimenId === sp.specimenId;
      const isSpecCollapsed = collapsedSpecimenIds.has(sp.specimenId);
      return (
        <div key={sp.specimenId} className="ps-billing-tree-specimen">
          <div
            title={`${sp.specimenLabel}: ${rawSpecimen?.description ?? ''}`}
            className={`ps-billing-tree-specimen-row${isSpecSelected ? ' ps-billing-tree-row--selected' : ''}`}
          >
            <button
              onClick={e => { e.stopPropagation(); onToggleSpecimenCollapsed(sp.specimenId); }}
              className="ps-billing-tree-toggle-btn"
              title={isSpecCollapsed ? t('billingReviewPanel.expand') : t('billingReviewPanel.collapse')}
            >{isSpecCollapsed ? '▶' : '▼'}</button>
            <div className="ps-billing-tree-specimen-label" onClick={() => onSelect({ type: 'specimen', specimenId: sp.specimenId })}>
              <div className="ps-billing-tree-specimen-label-row">
                <span className="ps-billing-tree-specimen-name">
                  {sp.specimenLabel}: {rawSpecimen?.description ?? ''}
                </span>
                <StatusDot status={sp.hasBaseCode ? 'complete' : 'empty'} />
              </div>
              <div className={`ps-billing-tree-base-line${sp.hasBaseCode ? '' : ' ps-billing-tree-base-line--missing'}`}>
                {sp.hasBaseCode ? (
                  <>
                    {t('billingReviewPanel.baseLabel')}{' '}
                    {sp.baseCptCodes.map((c, i) => {
                      const realCode = resolveRealCptCode(c) ?? c;
                      return (
                        <React.Fragment key={`${c}-${i}`}>
                          {i > 0 && ', '}
                          <span title={`${realCode} — ${describeCode(c)}`}>{realCode}</span>
                        </React.Fragment>
                      );
                    })}
                  </>
                ) : t('billingReviewPanel.noBaseCode')}
              </div>
            </div>
          </div>
          {!isSpecCollapsed && sp.blocks.map(block => {
            const isBlockSelected = selected?.type === 'block' && selected.specimenId === sp.specimenId && selected.blockId === block.blockId;
            const pendingCount = pendingCountFor(sp.specimenId, block.blockId);
            const appliedCount = appliedCountFor(sp.specimenId, block.blockId);
            const isBlockExpanded = expandedBlockIds.has(block.blockId);
            const hasStains = block.stainCodingStatus.length > 0;
            // Real fix, per direct feedback: "the green dot is next to
            // the Block and it should be next to the stain, because
            // the Fee code is associated to the stain not the block."
            // Every real AI suggestion is generated from a specific
            // stain - there's no such thing as a genuinely block-level
            // pending suggestion - so this only reflects a real,
            // deliberate block-level code (its own real, tagged
            // classification in CODE_MAP_TABLE says 'block' - e.g.
            // FROZEN-FIRST/FROZEN-ADDL), which for most blocks will
            // honestly be none at all. Checking the code's own real
            // level, not just "does it lack a stainOrderId" - a stain-
            // level code manually added without picking a specific
            // stain shouldn't count as block-native just because it's
            // unattributed.
            const hasBlockLevelOnlyCode = block.blockNativeAppliedCodes.length > 0;
            return (
              <div key={block.blockId}>
                <div
                  title={`${sp.specimenLabel}${block.blockLabel}${block.stainNames.length > 0 ? ` (${block.stainNames.join(', ')})` : ''}`}
                  className={`ps-billing-tree-block-row${isBlockSelected ? ' ps-billing-tree-row--selected' : ''}`}
                >
                  {hasStains ? (
                    <button
                      onClick={e => { e.stopPropagation(); onToggleBlockExpanded(block.blockId); }}
                      className="ps-billing-tree-block-toggle-btn"
                      title={isBlockExpanded ? t('billingReviewPanel.collapseStains') : t('billingReviewPanel.expandStains')}
                    >{isBlockExpanded ? '▼' : '▶'}</button>
                  ) : <span className="ps-billing-tree-block-toggle-spacer" />}
                  <div
                    onClick={() => onSelect({ type: 'block', specimenId: sp.specimenId, blockId: block.blockId })}
                    className="ps-billing-tree-block-label"
                  >
                    <span className="ps-billing-tree-block-name">
                      {sp.specimenLabel}{block.blockLabel}
                      {hasBlockLevelOnlyCode && (
                        <span className="ps-billing-tree-block-native-codes">
                          {block.blockNativeAppliedCodes.map((c, i) => {
                            const realCode = resolveRealCptCode(c.code) ?? c.code;
                            return (
                              <React.Fragment key={`${c.code}-${i}`}>
                                {i > 0 && ', '}
                                <span title={`${realCode} — ${describeCode(c.code)}`}>{realCode}</span>
                              </React.Fragment>
                            );
                          })}
                        </span>
                      )}
                    </span>
                    <span className="ps-billing-tree-block-counts">
                      {pendingCount > 0 && (
                        <span className="ps-billing-tree-count-badge ps-billing-tree-count-badge--pending">{pendingCount}</span>
                      )}
                      {appliedCount > 0 && (
                        <span className="ps-billing-tree-count-badge ps-billing-tree-count-badge--applied">{appliedCount}</span>
                      )}
                      <StatusDot status={hasBlockLevelOnlyCode ? 'complete' : 'empty'} />
                    </span>
                  </div>
                </div>
                {/* Real feature, per direct feedback: "the stains
                    themselves are the billable bit... each stain
                    under the block as a separate [row]." One row per
                    real stain, not one grouped line for the whole
                    block. */}
                {isBlockExpanded && block.stainCodingStatus.map(stain => {
                  const pendingKey = stain.status === 'pending' ? `${block.blockId}::${stain.suggestedCode}::${stain.stainOrderId}` : null;
                  const isStainSelected = isBlockSelected && (pendingKey !== null ? activePendingKey === pendingKey : manualAddTargetStainId === stain.stainOrderId);
                  return (
                    <div
                      key={stain.stainOrderId || stain.stainName}
                      onClick={() => onSelectStain(sp.specimenId, block.blockId, pendingKey, stain.stainOrderId)}
                      title={stain.status === 'not-applicable' ? t('billingReviewPanel.noAncillaryCode', { stainName: stain.stainName }) : `${stain.stainName} — ${t(DOT_STATUS_LABEL_KEY[stain.status === 'rejected' ? 'rejected' : stain.status === 'applied' ? 'complete' : stain.status === 'pending' ? 'partial' : 'empty'])}`}
                      className={`ps-billing-tree-stain-row${isStainSelected ? ' ps-billing-tree-stain-row--selected' : ''}`}
                    >
                      <span className={`ps-billing-tree-stain-name${stain.status === 'not-applicable' ? ' ps-billing-tree-stain-name--muted' : ''}`}>
                        {stain.stainName}
                        {stain.allAppliedCodes.length > 0 ? (
                          <span className="ps-billing-tree-stain-codes ps-billing-tree-stain-codes--applied">
                            {stain.allAppliedCodes.map((c, i) => {
                              const realCode = resolveRealCptCode(c) ?? c;
                              return (
                                <React.Fragment key={`${c}-${i}`}>
                                  {i > 0 && ', '}
                                  <span title={`${realCode} — ${describeCode(c)}`}>{realCode}</span>
                                </React.Fragment>
                              );
                            })}
                          </span>
                        ) : stain.suggestedCode && stain.status === 'pending' && (
                          <span
                            className="ps-billing-tree-stain-codes ps-billing-tree-stain-codes--pending"
                            title={`${resolveRealCptCode(stain.suggestedCode) ?? stain.suggestedCode} — ${describeCode(stain.suggestedCode)}`}
                          >
                            {resolveRealCptCode(stain.suggestedCode) ?? stain.suggestedCode}
                          </span>
                        )}
                      </span>
                      <StatusDot status={
                        stain.status === 'applied' ? 'complete' :
                        stain.status === 'pending' ? 'partial' :
                        stain.status === 'rejected' ? 'rejected' : 'empty'
                      } />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    })}
  </div>
  );
};

// Real, per direct feedback: "code details on the right." Shows
// whatever's currently selected in the tree - a specimen's own base
// code, or a block's pending suggestions and applied ancillary codes -
// directly mirroring the Code Manager's own "Applying to: X — click a
// row on the left to change" model.
const DetailPanel: React.FC<{
  selection: { type: 'specimen'; specimenId: string } | { type: 'block'; specimenId: string; blockId: string } | null;
  selectedRawSpecimen: BillingReviewPanelProps['specimens'][number] | undefined;
  selectedSpecimenSummary: ReturnType<typeof computeCaseCodingSummary>[number] | undefined;
  selectedBlockSummary: ReturnType<typeof computeCaseCodingSummary>[number]['blocks'][number] | undefined;
  pendingForSelectedBlock: PendingCode[];
  activePendingKey: string | null;
  onSelectPending: (key: string) => void;
  overridingKey: string | null;
  onStartOverride: (key: string | null) => void;
  overrideCodeValue: string;
  setOverrideCodeValue: (v: string) => void;
  overrideCodeAlreadyApplied: boolean;
  onConfirmOverride: (item: PendingCode) => void;
  onRejectOnly: (item: PendingCode) => void;
  onApprove: BillingReviewPanelProps['onApprove'];
  onDelete: BillingReviewPanelProps['onDelete'];
  onDeleteBaseCode: BillingReviewPanelProps['onDeleteBaseCode'];
  onCorrect: BillingReviewPanelProps['onCorrect'];
  onCorrectBaseCode: BillingReviewPanelProps['onCorrectBaseCode'];
  onAddBaseCode: BillingReviewPanelProps['onAddBaseCode'];
  onApproveAll: BillingReviewPanelProps['onApproveAll'];
  isManualCodeAlreadyApplied: (code: string, stainId: string | undefined) => boolean;
  onHighlightStain?: (stainId: string | undefined) => void;
  manualAddTargetStainId: string | null;
  showManualCodeSearch: boolean;
  setShowManualCodeSearch: (v: boolean) => void;
  showOverrideCodeSearch: boolean;
  setShowOverrideCodeSearch: (v: boolean) => void;
}> = ({ selection, selectedRawSpecimen, selectedSpecimenSummary, selectedBlockSummary, pendingForSelectedBlock, activePendingKey, onSelectPending, overridingKey, onStartOverride, overrideCodeValue, setOverrideCodeValue, overrideCodeAlreadyApplied, onConfirmOverride, onRejectOnly, onApprove, onDelete, onDeleteBaseCode, onCorrect, onCorrectBaseCode, onAddBaseCode, onApproveAll, isManualCodeAlreadyApplied, onHighlightStain, manualAddTargetStainId, showManualCodeSearch, setShowManualCodeSearch, showOverrideCodeSearch, setShowOverrideCodeSearch }) => {
  const { t } = useTranslation();
  if (!selection || !selectedRawSpecimen) {
    return <div className="ps-billing-detail-empty">{t('billingReviewPanel.noSpecimensYet')}</div>;
  }

  // Real fix, per direct feedback: the label now reflects the actual,
  // exact target a manually-added code will attach to, including the
  // real stain name when one's targeted - not just the block, which
  // was misleading once codes could be attached at the stain level.
  const targetStainName = manualAddTargetStainId
    ? selectedBlockSummary?.stainCodingStatus.find(s => s.stainOrderId === manualAddTargetStainId)?.stainName
    : undefined;
  const targetLabel = selection.type === 'block'
    ? `${selectedSpecimenSummary?.specimenLabel ?? ''}${selectedBlockSummary?.blockLabel ?? ''}`
    : t('billingReviewPanel.specimenLabelPrefix', { label: selectedSpecimenSummary?.specimenLabel ?? '' });
  const manualAddTargetLabel = targetStainName ? `${targetLabel} — ${targetStainName}` : targetLabel;

  return (
    <div className="ps-billing-detail-panel">
      <div className="ps-billing-applying-to">
        {t('billingReviewPanel.applyingTo')} <strong className="ps-billing-applying-to-target">{targetLabel}</strong>
      </div>

      {selection.type === 'block' && pendingForSelectedBlock.length > 0 && (
        <div className="ps-billing-detail-section">
          <div className="ps-billing-detail-section-heading">
            {t('billingReviewPanel.pendingReviewHeading')}
          </div>
          <div className="ps-billing-detail-section-list">
            {pendingForSelectedBlock.map(item => {
              const key = `${item.blockId}::${item.code}::${item.sourceStainId ?? ''}`;
              const isFirstDefault = !activePendingKey && pendingForSelectedBlock[0] === item;
              return (
                <PendingRow
                  key={key}
                  item={item}
                  isActive={activePendingKey === key || isFirstDefault}
                  onClick={() => onSelectPending(key)}
                  onConfirm={() => onApprove(item.specimenId, item.blockId, item.code, item.sourceStainId)}
                  isOverriding={overridingKey === key}
                  onStartOverride={() => onStartOverride(key)}
                  onCancelOverride={() => onStartOverride(null)}
                  overrideCodeValue={overrideCodeValue}
                  setOverrideCodeValue={setOverrideCodeValue}
                  overrideCodeAlreadyApplied={overrideCodeAlreadyApplied}
                  onConfirmOverride={() => onConfirmOverride(item)}
                  onRejectOnly={() => onRejectOnly(item)}
                  showOverrideCodeSearch={showOverrideCodeSearch}
                  setShowOverrideCodeSearch={setShowOverrideCodeSearch}
                />
              );
            })}
          </div>
        </div>
      )}

      {selection.type === 'block' && (selectedBlockSummary?.appliedAncillaryCodes.length ?? 0) > 0 && (
        <div className="ps-billing-detail-section">
          <div className="ps-billing-detail-section-heading">
            {t('billingReviewPanel.appliedCodesHeading')}
          </div>
          <div className="ps-billing-detail-section-list ps-billing-detail-section-list--tight">
            {selectedBlockSummary!.appliedAncillaryCodes.map((applied, i) => {
              const stainName = applied.stainOrderId
                ? selectedBlockSummary!.stainCodingStatus.find(s => s.stainOrderId === applied.stainOrderId)?.stainName
                : undefined;
              return (
                <AppliedRow
                  key={`${applied.code}::${applied.stainOrderId ?? ''}::${i}`}
                  code={applied.code}
                  stainName={stainName}
                  onDelete={() => onDelete(selection.specimenId, selection.blockId, applied.code, applied.stainOrderId)}
                  onCorrect={onCorrect ? () => onCorrect(selection.specimenId, selection.blockId, applied.code, applied.stainOrderId) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {selection.type === 'specimen' && (
        <div className="ps-billing-detail-section">
          <div className="ps-billing-detail-section-heading">
            {t('billingReviewPanel.baseCodeHeading')}
          </div>
          {(selectedSpecimenSummary?.baseCptCodes.length ?? 0) > 0 ? (
            <div className="ps-billing-detail-section-list ps-billing-detail-section-list--tight">
              {selectedSpecimenSummary!.baseCptCodes.map((code, i) => (
                <AppliedRow
                  key={`${code}::${i}`}
                  code={code}
                  onDelete={() => onDeleteBaseCode(selection.specimenId, code)}
                  onCorrect={onCorrectBaseCode ? () => onCorrectBaseCode(selection.specimenId, code) : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="ps-billing-empty-note ps-billing-empty-note--warning">{t('billingReviewPanel.noBaseCodeYet')}</p>
          )}
        </div>
      )}

      {selection.type === 'block' && pendingForSelectedBlock.length === 0 && (selectedBlockSummary?.appliedAncillaryCodes.length ?? 0) === 0 && (
        <p className="ps-billing-empty-note">{t('billingReviewPanel.noCodesForBlock')}</p>
      )}

      <div className="ps-billing-manual-add">
        <div className="ps-billing-detail-section-heading">
          + {t('billingReviewPanel.addCodeManuallyHeading')}
        </div>
        <button
          onClick={() => setShowManualCodeSearch(true)}
          className="ps-btn-primary"
        >
          {t('billingReviewPanel.searchCodesButton')}
        </button>
      </div>
      {showManualCodeSearch && selection.type === 'block' && (
        <CodeSearchModal
          entries={CODE_MAP_TABLE}
          targetLabel={targetLabel}
          stains={(selectedBlockSummary?.stainCodingStatus ?? []).map(s => ({ stainOrderId: s.stainOrderId, stainName: s.stainName }))}
          initialStainId={manualAddTargetStainId}
          onAddCode={(code, stainIds) => onApproveAll(stainIds.map(stainId => ({ specimenId: selection.specimenId, blockId: selection.blockId, code, stainOrderId: stainId })))}
          isAlreadyApplied={isManualCodeAlreadyApplied}
          onHighlightStain={onHighlightStain}
          onClose={() => setShowManualCodeSearch(false)}
        />
      )}
      {showManualCodeSearch && selection.type === 'specimen' && (
        <CodeSearchModal
          entries={CODE_MAP_TABLE}
          targetLabel={manualAddTargetLabel}
          targetLevel="specimen"
          onSelect={entry => onAddBaseCode(selection.specimenId, entry.code)}
          onSelectFreeText={code => onAddBaseCode(selection.specimenId, code)}
          onClose={() => setShowManualCodeSearch(false)}
        />
      )}
    </div>
  );
};

// Real, per direct billing-expert guidance (PS-93) — the Evaluated
// Cores Checklist, at the slide viewer / diagnostic sign-out stage
// per direct spec: for every ancillary stain ordered on a shared
// Biopsy Array (MatrixBlock.slides, excluding the routine H&E every
// block gets by default), a pathologist explicitly checks which
// targeted cores were genuinely evaluated/reviewed for diagnosis on
// the resulting slide — this is the real billing trigger
// (StainOrder.evaluatedSpecimenIds), never the earlier, order-entry
// targetSpecimenIds selection alone. Deliberately a separate section
// below the ordinary specimen tree/detail layout above, not folded
// into it — a shared MatrixBlock genuinely doesn't belong to one
// specimen the way that tree's own selection model assumes.
const MatrixArrayCoverageSection: React.FC<{
  matrixBlocks: NonNullable<BillingReviewPanelProps['matrixBlocks']>;
  specimens: BillingReviewPanelProps['specimens'];
  summary: SpecimenCodingSummary[];
  onSetMatrixEvaluatedCores?: BillingReviewPanelProps['onSetMatrixEvaluatedCores'];
  onApplyMatrixCode?: BillingReviewPanelProps['onApplyMatrixCode'];
  onRejectMatrixCode?: BillingReviewPanelProps['onRejectMatrixCode'];
}> = ({ matrixBlocks, specimens, summary, onSetMatrixEvaluatedCores, onApplyMatrixCode, onRejectMatrixCode }) => {
  const { t } = useTranslation();
  // Local, per-stain draft of the checklist — only committed via
  // onSetMatrixEvaluatedCores when the pathologist explicitly saves,
  // same "never auto-fires" posture as everywhere else in this
  // feature. Keyed by stainOrderId, initialized from the stain's own
  // real, already-saved evaluatedSpecimenIds.
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({});
  const draftFor = (stainId: string, saved: string[] | undefined): Set<string> =>
    drafts[stainId] ?? new Set(saved ?? []);
  const toggleCore = (stainId: string, saved: string[] | undefined, specimenId: string) => {
    setDrafts(prev => {
      const current = new Set(draftFor(stainId, saved));
      if (current.has(specimenId)) current.delete(specimenId); else current.add(specimenId);
      return { ...prev, [stainId]: current };
    });
  };

  const ancillaryStains = matrixBlocks.flatMap(mb =>
    mb.slides.filter(s => s.stainName !== 'H&E' && (s.targetSpecimenIds?.length ?? 0) > 0).map(s => ({ matrixBlock: mb, stain: s }))
  );
  if (ancillaryStains.length === 0) return null;

  return (
    <div className="ps-billing-matrix-section">
      <div className="fm-eyebrow ps-billing-eyebrow">
        ✦ {t('billingReviewPanel.matrixSection.title')}
      </div>
      <div className="ps-billing-matrix-intro">
        {t('billingReviewPanel.matrixSection.intro')}
      </div>

      {ancillaryStains.map(({ matrixBlock, stain }) => {
        if (!stain.id) return null;
        const saved = stain.evaluatedSpecimenIds ?? [];
        const draft = draftFor(stain.id, stain.evaluatedSpecimenIds);
        const isDirty = draft.size !== saved.length || saved.some(id => !draft.has(id));
        const specimenContribution = (specimenId: string) =>
          summary.find(sp => sp.specimenId === specimenId)?.matrixBlockContributions.find(mb => mb.matrixBlockId === matrixBlock.id);

        return (
          <div key={stain.id} className="ps-billing-matrix-stain-card">
            <div className="ps-billing-matrix-stain-heading">
              {stain.stainName} <span className="ps-billing-matrix-stain-block-label">— {matrixBlock.label}</span>
            </div>
            <div className="ps-billing-matrix-core-checklist">
              {(stain.targetSpecimenIds ?? []).map(specimenId => {
                const sp = specimens.find(s => s.id === specimenId);
                return (
                  <label key={specimenId} className="ps-billing-matrix-core-checkbox-label">
                    <input
                      type="checkbox"
                      checked={draft.has(specimenId)}
                      onChange={() => toggleCore(stain.id!, stain.evaluatedSpecimenIds, specimenId)}
                    />
                    {sp?.label ?? specimenId} — {t('billingReviewPanel.matrixSection.evaluatedReviewedForDiagnosis')}
                  </label>
                );
              })}
            </div>
            {isDirty && (
              <button
                type="button"
                onClick={() => onSetMatrixEvaluatedCores?.(matrixBlock.id, stain.id!, Array.from(draft))}
                className="ps-billing-matrix-save-btn"
              >
                {t('billingReviewPanel.matrixSection.saveEvaluationButton')}
              </button>
            )}
            {/* Real, per direct spec: once evaluatedSpecimenIds is
                saved, the resulting computeMatrixStainBillingUnits
                suggestion(s) become real, pending, per-specimen codes
                — shown here for direct Confirm/Reject, same real
                "explicit confirmation required" posture as every
                other suggestion in this panel. */}
            {saved.length > 0 && (
              <div className="ps-billing-matrix-suggestions">
                {saved.map(specimenId => {
                  const contribution = specimenContribution(specimenId);
                  const pendingForThisStain = (contribution?.unappliedSuggestionSources ?? []).filter(s => s.stainOrderId === stain.id);
                  if (pendingForThisStain.length === 0) return null;
                  const sp = specimens.find(s => s.id === specimenId);
                  return pendingForThisStain.map(({ code }, i) => (
                    <div key={`${specimenId}-${code}-${i}`} className="ps-billing-matrix-suggestion-row">
                      <span>{sp?.label ?? specimenId}: <strong>{code}</strong></span>
                      <span className="ps-billing-matrix-suggestion-actions">
                        <button
                          type="button"
                          onClick={() => onApplyMatrixCode?.(specimenId, matrixBlock.id, code, stain.id)}
                          className="ps-billing-matrix-confirm-btn"
                        >{t('common.confirm')}</button>
                        <button
                          type="button"
                          onClick={() => onRejectMatrixCode?.(specimenId, matrixBlock.id, code, stain.id)}
                          className="ps-billing-matrix-reject-btn"
                        >{t('billingReviewPanel.matrixSection.rejectButton')}</button>
                      </span>
                    </div>
                  ));
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Real, per direct feedback: matches RightSynopticPanel's own field-row
// styling and language exactly (Confirm/Override, not Approve/Reject;
// the same "AI source: ..." line, same font sizes/colors) - "this way
// the interactions with AI are consistent" across the app, not a
// visually distinct pattern just because this one reviews billing
// codes instead of synoptic answers. Real, per direct feedback: click-
// to-select restored - a block can carry several pending suggestions
// with different real source stains, so each row needs to be
// individually selectable to drive its own highlight, not just
// whichever one happens to be first.
const PendingRow: React.FC<{
  item: PendingCode;
  isActive: boolean;
  onClick: () => void;
  onConfirm: () => void;
  isOverriding: boolean;
  onStartOverride: () => void;
  onCancelOverride: () => void;
  overrideCodeValue: string;
  setOverrideCodeValue: (v: string) => void;
  overrideCodeAlreadyApplied: boolean;
  onConfirmOverride: () => void;
  onRejectOnly: () => void;
  showOverrideCodeSearch: boolean;
  setShowOverrideCodeSearch: (v: boolean) => void;
}> = ({ item, isActive, onClick, onConfirm, isOverriding, onStartOverride, onCancelOverride, overrideCodeValue, setOverrideCodeValue, overrideCodeAlreadyApplied, onConfirmOverride, onRejectOnly, showOverrideCodeSearch, setShowOverrideCodeSearch }) => {
  const { t } = useTranslation();
  return (
  <>
  <div
    onClick={isOverriding ? undefined : onClick}
    className={`ps-billing-pending-row${isActive || isOverriding ? ' ps-billing-pending-row--active' : ''}${isOverriding ? ' ps-billing-pending-row--overriding' : ''}`}
  >
    <div className="ps-billing-pending-row-top">
      <span className="ps-billing-pending-row-code" title={`${resolveRealCptCode(item.code) ?? item.code} — ${describeCode(item.code)}`}>
        {resolveRealCptCode(item.code) ?? item.code}
      </span>
      {!isOverriding && (
        <div className="ps-billing-pending-row-actions" onClick={e => e.stopPropagation()}>
          <button
            onClick={onConfirm}
            className="ps-billing-confirm-btn"
          >✓ {t('common.confirm')}</button>
          <button
            onClick={onStartOverride}
            className="ps-billing-override-btn"
          >✎ {t('billingReviewPanel.overrideButton')}</button>
          <button
            onClick={onRejectOnly}
            className="ps-btn-icon-danger ps-btn-icon-danger--visible"
            title={t('billingReviewPanel.dismissTooltip')}
          >🗑</button>
        </div>
      )}
    </div>
    <div className="ps-billing-pending-row-description">
      {describeCode(item.code)}
    </div>
    <div className="ps-billing-pending-row-source">
      {t('billingReviewPanel.aiSourceLine', { source: item.sourceStainName ?? (item.stainNames.length > 0 ? item.stainNames.join(', ') : t('billingReviewPanel.stainNotRecorded')) })}
    </div>
    {isOverriding && (
      <div onClick={e => e.stopPropagation()} className="ps-billing-override-form">
        <div className="ps-billing-detail-section-heading">
          {t('billingReviewPanel.replaceWithHeading')}
        </div>
        <button
          onClick={() => setShowOverrideCodeSearch(true)}
          className={`ps-billing-override-search-btn${overrideCodeValue ? ' ps-billing-override-search-btn--filled' : ''}`}
        >
          {overrideCodeValue ? `${overrideCodeValue} — ${describeCode(overrideCodeValue)}` : t('billingReviewPanel.searchCodesButton')}
        </button>
        {overrideCodeAlreadyApplied && (
          <p className="ps-billing-empty-note ps-billing-empty-note--warning">{t('billingReviewPanel.codeAlreadyAppliedHere')}</p>
        )}
        <div className="ps-billing-override-confirm-row">
          <button
            className="ps-btn-primary ps-billing-override-confirm-btn"
            disabled={!overrideCodeValue.trim() || overrideCodeAlreadyApplied}
            onClick={onConfirmOverride}
          >
            {t('common.confirm')}
          </button>
          <button
            onClick={onCancelOverride}
            className="ps-billing-override-cancel-btn"
          >
            {t('common.cancel')}
          </button>
        </div>
        <button
          onClick={onRejectOnly}
          className="ps-billing-reject-only-link"
        >
          {t('billingReviewPanel.noReplacementNeeded')}
        </button>
      </div>
    )}
  </div>
  {isOverriding && showOverrideCodeSearch && (
    <CodeSearchModal
      entries={CODE_MAP_TABLE}
      targetLabel={t('billingReviewPanel.replacingCodeLabel', { code: item.code, stainName: item.sourceStainName ? ` (${item.sourceStainName})` : '' })}
      targetLevel="stain"
      initialValue={overrideCodeValue}
      onSelect={entry => setOverrideCodeValue(entry.code)}
      onSelectFreeText={code => setOverrideCodeValue(code)}
      onClose={() => setShowOverrideCodeSearch(false)}
    />
  )}
  </>
  );
};

// Real feature, per direct request: "we need the delete in case they
// want to remove the billing on that item." A single, shared row used
// by DetailPanel for both a block's ancillary codes and a specimen's
// base code - the two are a genuinely different real shape underneath
// (a base code has no blockId), but read identically once you're
// already looking at one specific specimen or block's own detail, so
// one simple, code-plus-delete row serves both instead of two nearly-
// identical components.
const AppliedRow: React.FC<{
  code: string;
  stainName?: string;
  onDelete: () => void;
  /** Real, per direct guidance's own follow-up - optional since a
   *  correction is only ever meaningful for a genuinely applied,
   *  already-charged code with a real underlying ServiceChargeRecord
   *  to reverse (the caller decides when that's true, never this
   *  presentational component). */
  onCorrect?: () => void;
}> = ({ code, stainName, onDelete, onCorrect }) => {
  const { t } = useTranslation();
  return (
  <div className="ps-billing-applied-row">
    <span className="ps-billing-applied-row-text">
      {code} <span className="ps-billing-applied-row-description">({describeCode(code)})</span>
      {stainName && <span className="ps-billing-applied-row-stain"> — {stainName}</span>}
    </span>
    <div className="ps-billing-applied-row-actions">
      {onCorrect && (
        <button
          onClick={onCorrect}
          className="ps-btn-icon"
          title={t('billingReviewPanel.correctCodeTooltip')}
        >✏️</button>
      )}
      <button
        onClick={onDelete}
        className="ps-btn-icon-danger ps-btn-icon-danger--visible"
        title={t('billingReviewPanel.removeCodeTooltip')}
      >🗑</button>
    </div>
  </div>
  );
};

export default BillingReviewPanel;
