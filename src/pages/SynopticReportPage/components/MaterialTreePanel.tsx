// src/pages/SynopticReportPage/components/MaterialTreePanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Visual, clickable material tree — Specimen (container) → Block/Decant →
// StainOrder (slide) — reading real data already produced at accession
// (Specimen.blocks/.decants, see types/case/Material.ts and Specimen.ts).
//
// Deliberately not a second editor. Clicking a block or slide opens the
// real, already-working BlockStainEditorModal (the same one HeaderBar's
// "Edit" button opens) — this component is a navigation/viewing layer,
// not a competing place to change status/stains. See the conversation
// that led here: a first pass at this material model duplicated
// HistologyBlock/StainOrder before that was caught; this component reuses
// them directly rather than re-flattening its own copy.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import MaterialTrackingHistoryModal from '../modals/MaterialTrackingHistoryModal';
import GrossingReleasePanel from './GrossingReleasePanel';
import { mockCassetteColorService } from '@/services/cassetteColors/mockCassetteColorService';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';
import { classifyGrossingComplexity } from '@/utils/classifyGrossingComplexity';
import { resolveSpecimenDisplayId, resolveBlockDisplayId, resolveSlideDisplayId, resolveDecantDisplayId, resolveDecantSlideDisplayId } from '@/utils/materialDisplayId';
import type { Case } from '@/types/case/Case';
import BiopsyArrayDiagram, { type BiopsyArrayPosition } from './BiopsyArrayDiagram';
import { isExhausted, isLost, isDamaged, isEntirelySubmitted, entirelySubmittedBlockRangeText } from '@/utils/blockExceptionStates';
import type { MaterialLocation } from '@/types/case/Material';

/**
 * Real fix, per direct report with screenshots in hand: "how come the
 * initial material tree isn't displaying the badge for the most
 * recent scan event." Confirmed directly: this whole file still read
 * the OLD, single-value lastKnownLocation field everywhere — missed
 * during the locationHistory[] rebuild (see Material.ts's own
 * MaterialLocation doc comment for that rebuild's full reasoning).
 * Every specimen/block badge below was reading a field that stopped
 * being written to the moment that rebuild shipped; what Block 1's
 * own badge in the report's own screenshot showed was real, but
 * STALE — left over from before the rebuild, not the real, current
 * location. Sorted by `at`, not assumed-in-order — a real event
 * arriving out of chronological order (a late-arriving inbound
 * message, a backfilled correction) should never silently look like
 * the current location just because it happened to append last.
 */
function mostRecentLocation(history: MaterialLocation[] | undefined): MaterialLocation | undefined {
  if (!history || history.length === 0) return undefined;
  return [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

interface MaterialTreePanelProps {
  caseData: Case | null;
  /** Real fix, item #36: which specimen's synoptic report is currently
   *  being viewed on the right-hand panel — used to highlight the
   *  matching section here so switching specimens keeps the tree in
   *  sync rather than leaving the last-viewed selection stale. */
  activeSpecimenId?: string;
  /** Real fix, per direct feedback on BillingReviewPanel: clicking a
   *  specific AI billing suggestion is expected to highlight its real
   *  source stain here, not just scroll to the specimen. Separate from
   *  rawHighlightText (LeftReportPanel's own report-text search) -
   *  this matches by real stain id, exact and unambiguous, not by
   *  string search against prose. */
  highlightedStainId?: string;
  /** Real fix, item #28: previously took no argument at all, so
   *  clicking any specific block opened the editor generically without
   *  telling it which block was actually clicked - the editor always
   *  showed whatever block happened to be focused already, not the one
   *  the pathologist just clicked. */
  onOpenBlockEditor: (blockId: string) => void;
  /** Real, architectural fix, per direct follow-up: "the matrix block
   *  itself is the tracked asset." A real MatrixBlock isn't one of a
   *  specimen's own blocks — opening its own real editor
   *  (MatrixBlockEditorModal.tsx) needs a real, separate entry point. */
  onOpenMatrixBlockEditor: (matrixBlockId: string) => void;
  /** Replaces the old Add Orders modal's "Specimens" tab — opens the
   *  real SpecimenEditModal directly. */
  onAddSpecimen: () => void;
  /**
   * Real feature, per the Hybrid Request-Driven Workflow spec's
   * "Boundaries" section: "Lock down: New Specimen and Primary Block
   * accessioning (display only)" in Assist/CoPilot mode — primary
   * specimen accessioning belongs strictly to the LIS/Grossing
   * station in that mode. Recuts/additional blocks on an EXISTING
   * specimen are deliberately unaffected — those are already the
   * spec's own "Allow as Requests" category (see handleAddBlock's own
   * real LIS-request-and-confirm flow), a genuinely different case
   * from creating a brand new specimen record.
   */
  isOrchestrationMode: boolean;
  onReprintAllSlides: () => void;
  /** Replaces the old Add Orders modal's "Blocks/Recut" tab — appends a
   *  real HistologyBlock to the specimen, not the old free-text
   *  cassette_key/total_cassettes fields the tree doesn't read from. */
  onAddBlock: (specimenId: string) => void;
  /** Real fix: already exists in useSpecimenBlockManagement.ts, just
   *  never passed down to this component before — needed here for
   *  the grossing release panel's own color-override control, same
   *  real shape/reuse as onUpdateDecant's own established use for
   *  the identical, decant-side control. */
  onUpdateBlock: (specimenId: string, blockId: string, changes: Partial<any>) => void;
  /** Real feature, per direct follow-up describing the real grossing-
   *  station workflow — see GrossingReleasePanel.tsx's own header.
   *  Wired directly to useSpecimenBlockManagement.ts's own
   *  handleReleaseGrossingBlocks/handleRemovePendingBlock. */
  onReleaseGrossingBlocks: (specimenId: string, blockIds: string[]) => void;
  /** Real, additive — per the Protocol-Driven Workflow Infrastructure
   *  story's Part 2c. Passed straight through to GrossingReleasePanel. */
  onConfirmTriageChecklistItem: (specimenId: string, itemIndex: number, confirmed: boolean) => void;
  onOverrideTriage: (specimenId: string, reason: string) => void;
  onRemovePendingBlock: (specimenId: string, blockId: string) => void;
  onAddDecant: (specimenId: string, decantType: 'residual_fluid' | 'cell_block') => void;
  /** Real fix: opens the real AddCodeModal, pre-targeted at this
   *  specific specimen and landed directly on the CPT tab - the
   *  "contextual entry point" that puts base-code assignment right
   *  where the specimen already is, instead of a separate, unanchored
   *  global "Codes" button. specimenIndex is this specimen's real
   *  position in caseData.specimens (what AddCodeModal's own
   *  activeSpecimenIndex/specimenIndex targeting already expects). */
  onAssignBaseCode: (specimenId: string, specimenIndex: number) => void;
  /** Real feature, per direct confirmation: "I wanted to be able to
   *  assign each core to a specific section of a single block... This
   *  is a grossing activity." Opens CreateBiopsyArrayModal. Only shown
   *  when there are 2+ specimens on the case, since a Biopsy Array is
   *  inherently a multi-specimen concept. */
  onCreateBiopsyArray: () => void;
  /** Real feature, per direct confirmation: completes the Biopsy
   *  Array feature — "allowing edits." Opens CreateBiopsyArrayModal
   *  in edit mode for the given cassetteId. */
  onEditBiopsyArray: (cassetteId: string) => void;
  /** Real feature, per direct research: Step 6 of the label-printing
   *  build plan — "Batch Print Queue Interface: Provide a dedicated
   *  bulk action (e.g., 'Print All Cassettes for Case [Accession #]')."
   *  Optional — panels rendered without a real case (or in contexts
   *  that don't support batch printing) simply don't show the button. */
  onBatchPrintCassettes?: () => void;
  /** Real fix, per direct follow-up: "no standing visual cue for an
   *  unverified cassette" — the scan-verification guardrail previously
   *  only spoke up reactively (a toast when adding the *next* block).
   *  This renders a real, persistent badge on the specific block still
   *  awaiting a scan, visible at a glance. */
  pendingCassetteVerification?: { cassetteId: string; blockLabel: string; specimenLabel: string } | null;
}

const ContainerIcon: React.FC = () => (
  <div style={{ position: 'relative', width: 40, flexShrink: 0 }}>
    {/* Screw-top lid — wider than the body, with ridge lines to read as
        threaded plastic rather than a flat box top. */}
    <div style={{
      width: 32, height: 8, margin: '0 auto', background: 'rgba(56,130,246,0.4)',
      border: '0.5px solid rgba(148,163,184,0.35)', borderRadius: '3px 3px 0 0',
      position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', alignItems: 'center',
    }}>
      <div style={{ width: 24, height: 0.5, background: 'rgba(148,163,184,0.4)' }} />
      <div style={{ width: 24, height: 0.5, background: 'rgba(148,163,184,0.4)' }} />
    </div>
    {/* Body — flat bottom, real specimen containers sit flat on a
        bench, not rounded like a cup. Blue, distinct from the block's
        warm amber, so the two tiers read apart at a glance. */}
    <div style={{
      background: 'rgba(56,130,246,0.15)', border: '0.5px solid rgba(148,163,184,0.3)',
      borderTop: 'none', borderRadius: '0 0 2px 2px',
      width: 28, height: 30, margin: '0 auto',
    }} />
  </div>
);

const BlockIcon: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ width: 44, flexShrink: 0 }}>
    <div style={{
      background: 'rgba(186,117,23,0.18)',
      border: '0.5px solid rgba(148,163,184,0.3)',
      borderRadius: 3, width: 42, height: 28, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Lid seam — a real cassette's hinged lid is flush with the
          body, not a separate protrusion. A thin line inside the same
          rectangle reads as a hinge; the earlier offset tab above the
          body read as a manila folder instead. */}
      <div style={{ position: 'absolute', top: 5, left: 3, right: 3, height: 1, background: 'rgba(148,163,184,0.35)' }} />
      {/* Explicit slot rows, not a CSS gradient trick — the real
          cassette's perforated face is a stack of horizontal slots
          that let fixative through. Bright against the dark theme
          background, not a dark line that was blending into it. */}
      <div style={{ position: 'absolute', inset: '9px 4px 3px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 2, background: 'rgba(226,232,240,0.55)', borderRadius: 1 }} />
          ))}
        </div>
      </div>
      <span style={{ position: 'relative', fontSize: 11, fontWeight: 700, color: '#e2e8f0', background: '#1e293b', padding: '0 3px', borderRadius: 2, marginTop: 4 }}>{label}</span>
    </div>
  </div>
);

const DecantIcon: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ width: 36, flexShrink: 0 }}>
    <div style={{
      background: 'rgba(15,110,86,0.15)', border: '0.5px solid rgba(148,163,184,0.3)',
      borderRadius: '50%', width: 32, height: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0' }}>{label}</span>
    </div>
  </div>
);

const SlideChip: React.FC<{ level: string; stainName: string; status: string; onClick: () => void; displayId?: string; locationHistory?: MaterialLocation[]; isHighlighted?: boolean }> = ({ level, stainName, status, onClick, displayId, locationHistory, isHighlighted }) => {
  // 'Pending Cut' / 'Cut & Placed' / 'Staining' — the stain is real and
  // known, it just hasn't produced a finished, reviewable slide yet.
  // The dashed visual reflects that in-progress state; it never hides
  // the stain name itself, which is always known once ordered.
  const notYetReady = status !== 'Coverslipped' && status !== 'Ready for Review';
  const loc = mostRecentLocation(locationHistory);
  const baseTitle = displayId ? `${displayId} · ${stainName} · ${status}` : `${level} · ${stainName} · ${status}`;
  return (
    <div
      onClick={onClick}
      title={loc ? `${baseTitle} · 📍 ${loc.location} (${new Date(loc.at).toLocaleString('en-US')})` : baseTitle}
      style={{ cursor: 'pointer' }}
    >
      <div style={{
        background: isHighlighted ? 'rgba(34,211,238,0.18)' : notYetReady ? 'transparent' : 'rgba(212,83,126,0.15)',
        border: isHighlighted ? '1.5px solid #22d3ee' : notYetReady ? '0.5px dashed rgba(148,163,184,0.5)' : '0.5px solid rgba(148,163,184,0.3)',
        boxShadow: isHighlighted ? '0 0 0 2px rgba(34,211,238,0.25)' : undefined,
        borderRadius: 3, width: 68, height: 28, position: 'relative',
        display: 'flex', alignItems: 'stretch',
      }}>
        {/* Real feature, per direct follow-up: "put a green dot in
            the upper right had of the slide image to signify ready?
            I think that will even work for color blind folks - not a
            big circle, something modest." Deliberately small (6px)
            and presence/absence-based, not color-alone: the dashed
            vs. solid border above already carries the same real
            ready/not-ready distinction without relying on color at
            all — this dot is a second, genuinely redundant cue on
            top of that, not the only signal. Shown only when ready,
            never a second color for "not ready" — a colorblind reader
            already has the border style; adding a red dot here would
            only help readers who can already tell red from green,
            defeating the point. */}
        {!notYetReady && (
          <span
            aria-hidden="true"
            title="Ready for review"
            style={{
              position: 'absolute', top: 2, right: 2,
              width: 6, height: 6, borderRadius: '50%',
              background: '#34d399',
              border: '1px solid rgba(13,24,41,0.6)',
            }}
          />
        )}
        {/* Frosted end — real slides carry a matte strip at one end for
            a hand-written label; the vertical line is that strip's
            edge, and the ID sits centered inside it, same as where a
            real slide's ID would actually be written. */}
        <div style={{
          width: 20, flexShrink: 0, borderRight: '1px solid rgba(148,163,184,0.4)',
          background: 'rgba(148,163,184,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#cbd5e1' }}>{level}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: notYetReady ? '#94a3b8' : '#e2e8f0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'block', maxWidth: '100%',
          }}>
            {stainName}
          </span>
        </div>
      </div>
    </div>
  );
};

const MaterialTreePanel: React.FC<MaterialTreePanelProps> = ({ caseData, activeSpecimenId, highlightedStainId, onOpenBlockEditor, onOpenMatrixBlockEditor, onAddSpecimen, onAddBlock, onUpdateBlock, onReleaseGrossingBlocks, onConfirmTriageChecklistItem, onOverrideTriage, onRemovePendingBlock, onAddDecant, onAssignBaseCode, onCreateBiopsyArray, onEditBiopsyArray, pendingCassetteVerification, isOrchestrationMode }) => {
  const [showTrackingHistory, setShowTrackingHistory] = useState(false);
  // Real fix, per direct follow-up: "the highlighting in the Material
  // tree isn't working - or its too subtle." Confirmed both were real:
  // the highlight itself was strengthened above (isActiveSpecimen's own
  // background/border/box-shadow), and this ref+effect actually
  // scrolls the active specimen into view - previously, if it wasn't
  // already visible in the panel's current scroll position (as
  // happened in the exact screenshot that reported this), the highlight
  // could be perfectly correct and still go completely unseen.
  const activeSpecimenRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeSpecimenId) activeSpecimenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSpecimenId]);
  // Real feature, per direct follow-up: "Decant has no creation flow
  // at all." Tracks which specimen's own "add decant" menu is
  // currently open — a single, shared piece of state rather than one
  // per specimen, since only one can reasonably be open at a time.
  const [openDecantMenuFor, setOpenDecantMenuFor] = useState<string | null>(null);
  // Real feature, per direct follow-up describing the real grossing-
  // station workflow — same real, established "fetch reference data
  // locally" convention as BlockStainEditorModal.tsx's own
  // cassetteColors, not passed in as a prop.
  const [cassetteColors, setCassetteColors] = useState<CassetteColorDefinition[]>([]);
  useEffect(() => {
    mockCassetteColorService.getAll().then(res => { if (res.ok) setCassetteColors(res.data); });
  }, []);
  const specimens = caseData?.specimens ?? [];
  // Real feature, per direct follow-up: "resolveBlockDisplayId() etc.
  // are defined but never called anywhere in the real UI." Same real
  // fullAccession-derivation pattern already used throughout the
  // scan-tracking work (accession.fullAccession, falling back to the
  // internal case id) — not a second, different convention.
  const fullAccession = caseData?.accession?.fullAccession ?? caseData?.id ?? '';

  // Real, architectural fix, per direct follow-up: "the matrix block
  // itself is the tracked asset." No more scanning every specimen's
  // own blocks for a shared tag — Case.matrixBlocks IS the real,
  // single source of truth, read directly. biopsyArrayGroups keeps
  // the same real BiopsyArrayPosition[] shape BiopsyArrayDiagram
  // already renders, built fresh from the real participants[] on
  // each real matrix block — blockId/blockLabel both point at the
  // one, real, SHARED MatrixBlock.id/label (not a per-participant
  // block, which no longer exists), so clicking any position opens
  // the same, real, shared editor.
  const biopsyArrayGroups = new Map<string, BiopsyArrayPosition[]>();
  for (const mb of (caseData?.matrixBlocks ?? [])) {
    const list = mb.participants
      .slice()
      .sort((a, b) => a.positionInBlock - b.positionInBlock)
      .map(p => {
        const sp = specimens.find((s: any) => s.id === p.specimenId);
        return {
          position: p.positionInBlock,
          specimenLabel: sp?.label ?? '?',
          specimenDescription: sp?.description,
          blockId: mb.id,
          blockLabel: mb.label,
        };
      });
    biopsyArrayGroups.set(mb.id, list);
  }
  // mb.id is the real matrix block's own internal key; mb.label is
  // the human-readable cassette label the PA typed in
  // CreateBiopsyArrayModal (e.g. "C3") — used for the section header.
  const matrixBlockLabelsById = new Map((caseData?.matrixBlocks ?? []).map(mb => [mb.id, mb.label]));

  if (specimens.length === 0) {
    return (
      <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>
        No specimens on this case yet.
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Real feature, per direct follow-up: "Move Manage Reprints...
          Bottom-Right Action Cluster... removes the visual orphaning
          of the current Manage Reports button." Moved to
          BottomActionBar.tsx, alongside Save Draft/Finalize/Finalize
          & Next — a global, always-available case action, not
          something that only exists while the Material tab happens
          to be open. See SynopticReportPage.tsx's own
          showReprintModal state and ManageReprintsModal rendering. */}
      {caseData && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          {/* Real feature, per direct follow-up with a concrete,
              detailed hierarchy/scan-log mockup in hand: "I looked at
              the tracking log and it just doesn't work... I was
              expecting to see something more like this." Confirmed
              directly: the earlier deep link into the generic,
              flat, mixed-event-type Audit Log genuinely didn't meet
              the real ask — a real, nested Specimen -> Block -> Slide
              -> Aliquot tree, each level showing its own FULL scan
              history. See MaterialTrackingHistoryModal.tsx's own
              header for the full reasoning. */}
          <button className="ps-btn-secondary" onClick={() => setShowTrackingHistory(true)}>
            📍 View Tracking History
          </button>
        </div>
      )}
      {showTrackingHistory && caseData && (
        <MaterialTrackingHistoryModal caseData={caseData} onClose={() => setShowTrackingHistory(false)} />
      )}
      {specimens.map((sp: any, specimenIndex: number) => {
        const blocks = sp.blocks ?? [];
        const decants = sp.decants ?? [];
        const hasMaterial = blocks.length > 0 || decants.length > 0;
        const hasBaseCode = ((sp.coding?.cpt ?? []) as string[]).length > 0;
        const isActiveSpecimen = !!activeSpecimenId && sp.id === activeSpecimenId;
        // Real feature, per direct follow-up: "Specimen's own read-side
        // fallback doesn't appear to have gotten the same treatment as
        // Block/Slide/Decant." Same real, honest fallback treatment as
        // the other three material types now.
        const resolvedSpecimenId = resolveSpecimenDisplayId(fullAccession, sp);

        return (
          <div key={sp.id} ref={isActiveSpecimen ? activeSpecimenRef : undefined} style={{
            marginBottom: 28, marginLeft: -12, marginRight: -12, padding: '8px 12px', borderRadius: 8,
            background: isActiveSpecimen ? 'rgba(8,145,178,0.18)' : 'transparent',
            borderLeft: isActiveSpecimen ? '3px solid #22d3ee' : '2px solid transparent',
            boxShadow: isActiveSpecimen ? '0 0 0 1px rgba(34,211,238,0.25)' : 'none',
            transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <ContainerIcon />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{sp.label}</span>
                  {/* Real feature, per direct follow-up: "Specimen's
                      own read-side fallback doesn't appear to have
                      gotten the same treatment as Block/Slide/Decant."
                      Same real, visible treatment the block row
                      already got. */}
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', fontFamily: 'monospace' }}>
                    {resolvedSpecimenId}
                  </span>
                  {/* Real feature, per direct follow-up: "Lets add the
                      exhausted badges for specimen and block in the
                      Material view as well... Add a clear badge like
                      [ 🚫 Entirely Submitted ] directly on the
                      Specimen B tile." Same real, derived state (every
                      real block Exhausted) as ManageReprintsModal.tsx
                      uses — shared helper, not a second, independently
                      -computed copy that could quietly disagree with
                      it. */}
                  {isEntirelySubmitted(sp) && (
                    <span
                      className="ps-material-exception-badge ps-material-exception-badge--exhausted"
                      title="Specimen entirely submitted — all tissue used during grossing, nothing remains."
                    >
                      🚫 Entirely Submitted
                    </span>
                  )}
                  {/* Real fix, per direct follow-up with screenshot in
                      hand: "The badge for the specimens seems
                      disconnected - too far away." Confirmed directly:
                      an earlier round moved this onto the description
                      line with justify-content: space-between,
                      right-justifying it across the full card width —
                      correctly fixed the "crowded name line" problem
                      that motivated that move, but overcorrected into
                      visual disconnection from the specimen it
                      describes. Back inline, same real, established
                      pattern the block row (below) already uses for
                      its own location badge — right next to the ID it
                      belongs to, not floating at the far edge of an
                      unrelated line. */}
                  {(() => {
                    const loc = mostRecentLocation(sp.locationHistory);
                    return loc && (
                      <span
                        className="ps-material-location-badge"
                        title={`Reported by ${loc.source} on ${new Date(loc.at).toLocaleString('en-US')}`}
                      >
                        📍 {loc.location}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {isEntirelySubmitted(sp) ? entirelySubmittedBlockRangeText(sp) : sp.description}
                </div>
              </div>
              {/* Real feature, per the Grossing spec's "Smart
                  Auto-Switching (Context Awareness)" section: a real,
                  additive suggestion — blue for Narrative dictation,
                  green for Template — based on this specimen's own,
                  real, assigned CPT code(s). Never a gate: both
                  Narrative dictation and Template fields already
                  coexist per specimen, independently, and remain
                  fully usable regardless of this badge. Silent for
                  'unknown' — a specimen with no assigned code, or one
                  outside this app's known simple/complex sets,
                  correctly shows nothing rather than a guessed
                  default. */}
              {(() => {
                const suggestion = classifyGrossingComplexity(sp.coding?.cpt as string[] | undefined);
                if (suggestion === 'unknown') return null;
                const isNarrative = suggestion === 'narrative';
                return (
                  <span
                    title={isNarrative
                      ? 'This specimen\u2019s CPT code suggests Narrative dictation as the likely starting point — Template fields remain fully available too.'
                      : 'This specimen\u2019s CPT code suggests Template (structured fields) as the likely starting point — Narrative dictation remains fully available too.'}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                      background: isNarrative ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                      border: `1px solid ${isNarrative ? 'rgba(59,130,246,0.4)' : 'rgba(16,185,129,0.4)'}`,
                      color: isNarrative ? '#60a5fa' : '#34d399',
                      cursor: 'default', flexShrink: 0,
                    }}
                  >
                    {isNarrative ? 'Suggested: Narrative' : 'Suggested: Template'}
                  </span>
                );
              })()}
              {/* Real fix: contextual entry point for base-code
                  assignment, right on the specimen it applies to,
                  rather than a separate, unanchored global button. */}
              {!hasBaseCode && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(245,158,11,0.15)', color: '#f59e0b', whiteSpace: 'nowrap',
                }} title="This specimen has no base surgical pathology CPT code assigned yet">
                  Pending Base Code
                </span>
              )}
              <button
                onClick={() => onAssignBaseCode(sp.id, specimenIndex)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(56,130,246,0.12)', border: '1px solid rgba(56,130,246,0.3)',
                  color: '#60a5fa', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                title="Assign this specimen's base CPT code"
              >
                + Code
              </button>
            </div>

            {!hasMaterial && (
              <div style={{ marginLeft: 52, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                No blocks or decants recorded yet.
              </div>
            )}

            {blocks.filter((block: any) => !block.sharedCassetteId).map((block: any) => {
              const isCancelled = block.status === 'Cancelled';
              // Real feature, per direct follow-up: "resolveBlockDisplayId()
              // etc. are defined but never called anywhere in the real
              // UI." Real, stored displayId if present; the same real,
              // deterministic fallback for a genuinely older block that
              // predates the field, computed identically either way —
              // never the internal id/label alone.
              const resolvedBlockId = resolveBlockDisplayId(fullAccession, sp.label, block);
              return (
                <div key={block.id} style={{ marginLeft: 40, marginBottom: 10, opacity: isCancelled ? 0.45 : 1 }}>
                  {/* Real feature, per direct follow-up: "I want to
                      move the slides to their own row. So indent
                      slightly to the right and then the slides."
                      Block's own header (icon, id, badges) stays on
                      this first row; slides moved to a real, separate
                      row below it (see the second flex row further
                      down), indented past the icon so they read as
                      the block's own children, not crammed onto the
                      same line as its badges. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div onClick={() => onOpenBlockEditor(block.id)} style={{ cursor: 'pointer' }} title={`${resolvedBlockId} · ${block.status}${isCancelled && block.cancelReason ? ` — ${block.cancelReason}` : ''}`}>
                      <BlockIcon label={`${sp.label}${block.label}`} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', fontFamily: 'monospace' }}>
                        {resolvedBlockId}
                      </span>
                      {/* Real feature, per direct follow-up: "did I see
                          it in the Grossing Templates?... it wasn't
                          described in the Material views." Real,
                          visible, without opening the block editor —
                          a real, informational count, not an exception
                          badge (undersubmitted tissue gets its own,
                          separate, amber warning right below, since
                          that specifically IS worth flagging). */}
                      {typeof block.pieceCount === 'number' && (
                        <span
                          style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', background: 'rgba(148,163,184,0.12)', padding: '2px 6px', borderRadius: 4 }}
                          title={block.pieceDescription || `${block.pieceCount} piece${block.pieceCount === 1 ? '' : 's'} grossed`}
                        >
                          {block.pieceCount} pc{block.pieceCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {block.isEntirelySubmitted === false && (
                        <span
                          className="ps-material-exception-badge"
                          style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
                          title="Not all grossed tissue was submitted in this cassette — some remains in wet storage."
                        >
                          ⚠️ Partial submission
                        </span>
                      )}
                      {/* Real feature, per direct follow-up: "an
                          immediate Tissue Discrepancy QA Flag is
                          raised before sectioning." Real, honest
                          comparison of the two, real, independently-
                          recorded counts — grossed vs. observed at
                          embedding — never a separately-tracked
                          boolean that could drift from what these two
                          real numbers actually say. */}
                      {typeof block.pieceCount === 'number' && typeof block.pieceCountAtEmbedding === 'number' && block.pieceCount !== block.pieceCountAtEmbedding && (
                        <span
                          className="ps-material-exception-badge"
                          style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}
                          title={`Tissue Discrepancy — ${block.pieceCount} piece${block.pieceCount === 1 ? '' : 's'} recorded at grossing, ${block.pieceCountAtEmbedding} observed at embedding.`}
                        >
                          🚩 Tissue Discrepancy
                        </span>
                      )}
                      {isCancelled && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textDecoration: 'line-through' }}>
                          CANCELLED
                        </span>
                      )}
                      {/* Real feature, per direct follow-up: "Lets add
                          the exhausted badges for specimen and block in
                          the Material view as well." Same shared helper
                          functions as ManageReprintsModal.tsx — one
                          source of truth for these states across both
                          surfaces, not two independently-computed
                          copies that could drift apart. */}
                      {isExhausted(block) && (
                        <span
                          className="ps-material-exception-badge ps-material-exception-badge--exhausted"
                          title="Block exhausted during grossing/levels — no tissue remains to cut."
                        >
                          🚫 Exhausted
                        </span>
                      )}
                      {isLost(block) && (
                        <span
                          className="ps-material-exception-badge ps-material-exception-badge--lost"
                          title={`Block reported lost${block.exceptionReportedAt ? ` ${new Date(block.exceptionReportedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}` : ''}${block.exceptionNote ? ` — ${block.exceptionNote}` : ''}. Not available for selection until located.`}
                        >
                          ⚠️ Lost
                        </span>
                      )}
                      {isDamaged(block) && (
                        <span
                          className="ps-material-exception-badge ps-material-exception-badge--damaged"
                          title={`Block damaged${block.exceptionReportedAt ? ` ${new Date(block.exceptionReportedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}` : ''}${block.exceptionNote ? ` — ${block.exceptionNote}` : ''}. Re-embedding required before any recut.`}
                        >
                          🛠️ Damaged
                        </span>
                      )}
                      {(() => {
                        const loc = mostRecentLocation(block.locationHistory);
                        return loc && (
                          <span
                            className="ps-material-location-badge"
                            title={`Reported by ${loc.source} on ${new Date(loc.at).toLocaleString('en-US')}`}
                          >
                            📍 {loc.location}
                          </span>
                        );
                      })()}
                      {/* Real feature, per the Hybrid Request-Driven
                          Workflow spec's "Optimistic / 'Pending' State":
                          renders the instant a recut/block request is
                          made, confirmed or flagged in place once the
                          real LIS request resolves — never silently
                          removed on rejection. */}
                      {block.lisRequestStatus === 'pending' && (
                        <span
                          title="Sent to the LIS, awaiting confirmation"
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', whiteSpace: 'nowrap' }}
                        >
                          ⏳ Pending LIS
                        </span>
                      )}
                      {block.lisRequestStatus === 'rejected' && (
                        <span
                          title="The LIS rejected this request — follow up with histology"
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', whiteSpace: 'nowrap' }}
                        >
                          ⚠ LIS Rejected
                        </span>
                      )}
                      {pendingCassetteVerification && pendingCassetteVerification.specimenLabel === sp.label && pendingCassetteVerification.blockLabel === block.label && (
                        <span
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', whiteSpace: 'nowrap' }}
                          title={`Cassette ${pendingCassetteVerification.cassetteId} has not been scanned yet`}
                        >
                          ⏳ Awaiting Scan
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 58, marginTop: 6 }}>
                    {(block.stains ?? []).length === 0 && (
                      <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>no slides yet</div>
                    )}
                    {(block.stains ?? []).map((stain: any, i: number) => (
                      <SlideChip
                        key={stain.id}
                        level={`L${i + 1}`}
                        stainName={stain.stainName}
                        status={stain.status}
                        onClick={() => onOpenBlockEditor(block.id)}
                        displayId={resolveSlideDisplayId(fullAccession, sp.label, block.label, `L${i + 1}`, stain)}
                        locationHistory={stain.locationHistory}
                        isHighlighted={!!highlightedStainId && stain.id === highlightedStainId}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Real feature, per direct confirmation: this specimen's
                tissue is part of a shared cassette — the full diagram
                renders once, in the dedicated Biopsy Array section
                below, rather than duplicating it under every
                participating specimen. Real, architectural fix, per
                direct follow-up: reads the specimen's own, real,
                lightweight matrixBlockIds reference — there's no more
                per-specimen block record to filter for. */}
            {(sp.matrixBlockIds ?? []).map((matrixBlockId: string) => {
              const mb = (caseData?.matrixBlocks ?? []).find((m: any) => m.id === matrixBlockId);
              if (!mb) return null;
              const participant = mb.participants.find((p: any) => p.specimenId === sp.id);
              return (
                <div
                  key={matrixBlockId}
                  onClick={() => onOpenMatrixBlockEditor(matrixBlockId)}
                  style={{ marginLeft: 40, marginBottom: 10, fontSize: 12, color: '#7dd3fc', cursor: 'pointer' }}
                >
                  🧩 Part of Biopsy Array {mb.label} (position {participant?.positionInBlock}) — see Biopsy Array section below
                </div>
              );
            })}

            {decants.map((decant: any) => {
              // Real feature, per direct follow-up: "resolveBlockDisplayId()
              // etc. are defined but never called anywhere in the real
              // UI." Same real treatment as the block row above.
              const resolvedDecantId = resolveDecantDisplayId(fullAccession, sp.label, decant);
              return (
              <div key={decant.id} style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 40, marginBottom: 10 }}>
                {/* Real bug fix, per direct follow-up: "decant-level
                    linking UI." Previously, the ONLY click target on
                    a real decant row lived inside the .map() over its
                    own stains — a brand-new decant (handleAddDecant
                    creates one with stains: [], unlike handleAddBlock,
                    which always seeds a default stain) had genuinely
                    no way to be opened at all; "no slides yet" was
                    plain, non-interactive text. The icon + id are now
                    themselves a real, clickable entry point, matching
                    the matrix block row's own "click to open" pattern
                    immediately above in this file. */}
                <div title={`${resolvedDecantId} · ${decant.decantType}`} onClick={() => onOpenBlockEditor(decant.id)} style={{ cursor: 'pointer' }}>
                  <DecantIcon label={`${sp.label}${decant.label}`} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    onClick={() => onOpenBlockEditor(decant.id)}
                    style={{ fontSize: 11, fontWeight: 600, color: '#64748b', fontFamily: 'monospace', cursor: 'pointer' }}
                  >
                    {resolvedDecantId}
                  </span>
                  {decant.stains.length === 0 && (
                    <div
                      onClick={() => onOpenBlockEditor(decant.id)}
                      style={{ fontSize: 11, color: '#7dd3fc', fontStyle: 'italic', cursor: 'pointer' }}
                    >
                      no slides yet — click to edit
                    </div>
                  )}
                  {decant.stains.map((stain: any, i: number) => (
                    <SlideChip
                      key={stain.id}
                      level={`L${i + 1}`}
                      stainName={stain.stainName}
                      status={stain.status}
                      onClick={() => onOpenBlockEditor(decant.id)}
                      displayId={resolveDecantSlideDisplayId(fullAccession, sp.label, decant.label, `L${i + 1}`, stain)}
                      locationHistory={stain.locationHistory}
                      isHighlighted={!!highlightedStainId && stain.id === highlightedStainId}
                    />
                  ))}
                </div>
              </div>
              );
            })}

            {/* Real feature, per direct follow-up describing the real
                grossing-station workflow — see
                GrossingReleasePanel.tsx's own header. Only ever
                renders real content when this specimen genuinely has
                real, hydrated (cassetteColorId set), still-'Pending'
                placeholder blocks — nothing shows for an ordinary
                specimen with no such blocks. */}
            <GrossingReleasePanel
              specimenLabel={sp.label}
              pendingBlocks={(sp.blocks ?? []).filter(b => b.status === 'Pending' && b.cassetteColorId)}
              cassetteColors={cassetteColors}
              onOverrideColor={(blockId, colorId) => onUpdateBlock(sp.id, blockId, { cassetteColorId: colorId, cassetteColorOverridden: true })}
              onRemove={blockId => onRemovePendingBlock(sp.id, blockId)}
              onRelease={blockIds => onReleaseGrossingBlocks(sp.id, blockIds)}
              triage={sp.triage}
              onConfirmChecklistItem={(itemIndex, confirmed) => onConfirmTriageChecklistItem(sp.id, itemIndex, confirmed)}
              onOverrideTriage={reason => onOverrideTriage(sp.id, reason)}
            />

            {/* Only offered when this specimen isn't already on the
                cytology/decant branch — a surgical specimen gets more
                blocks, a cytology one doesn't suddenly grow a block. */}
            {decants.length === 0 && (
              <div
                onClick={() => onAddBlock(sp.id)}
                style={{ marginLeft: 40, marginTop: 4, fontSize: 12, color: '#64748b', cursor: 'pointer', display: 'inline-block' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
              >
                + Request block/recut
              </div>
            )}
            {/* Real feature, per direct follow-up: "Decant has no
                creation flow at all — the ID scheme is ready for
                something that doesn't exist yet." The real inverse of
                the block condition immediately above — a specimen
                already on the surgical/block branch doesn't suddenly
                grow a decant, matching the same established "either
                blocks or decants, never both" rule. */}
            {blocks.length === 0 && (
              <div style={{ marginLeft: 40, marginTop: 4, position: 'relative', display: 'inline-block' }}>
                <div
                  onClick={() => setOpenDecantMenuFor(v => v === sp.id ? null : sp.id)}
                  style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                >
                  + Add decant/fluid {openDecantMenuFor === sp.id ? '▴' : '▾'}
                </div>
                {openDecantMenuFor === sp.id && (
                  <div className="ps-decant-add-menu">
                    <button
                      className="ps-decant-add-menu-item"
                      onClick={() => { onAddDecant(sp.id, 'residual_fluid'); setOpenDecantMenuFor(null); }}
                    >
                      Residual Fluid
                    </button>
                    <button
                      className="ps-decant-add-menu-item"
                      onClick={() => { onAddDecant(sp.id, 'cell_block'); setOpenDecantMenuFor(null); }}
                    >
                      Cell Block
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {biopsyArrayGroups.size > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.4 }}>
            Biopsy Arrays
          </div>
          {Array.from(biopsyArrayGroups.entries()).map(([matrixBlockId, positions]) => (
            <div key={matrixBlockId} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
              <BiopsyArrayDiagram
                cassetteLabel={matrixBlockLabelsById.get(matrixBlockId) ?? matrixBlockId}
                positions={positions}
                onOpenBlockEditor={() => onOpenMatrixBlockEditor(matrixBlockId)}
              />
              {/* Real feature, per direct confirmation: completes the
                  Biopsy Array feature — "allowing edits." */}
              <button
                onClick={() => onEditBiopsyArray(matrixBlockId)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, marginTop: 8,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                title={`Edit Biopsy Array ${matrixBlockLabelsById.get(matrixBlockId) ?? matrixBlockId}`}
              >
                ✏️ Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {isOrchestrationMode ? (
        <div
          onClick={onAddSpecimen}
          style={{ fontSize: 13, color: '#94a3b8', cursor: 'pointer', marginBottom: 12, display: 'inline-block', marginRight: 20 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
        >
          + Add specimen
        </div>
      ) : (
        <div
          style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginBottom: 12 }}
          title="New specimen accessioning belongs to the LIS in this mode — recuts and additional blocks on an existing specimen remain available above."
        >
          🔒 New specimens are accessioned in the LIS
        </div>
      )}

      {/* Real feature, per direct confirmation: only meaningful with
          2+ specimens on the case — a Biopsy Array is inherently a
          multi-specimen concept. */}
      {specimens.length >= 2 && (
        <div
          onClick={onCreateBiopsyArray}
          style={{ fontSize: 13, color: '#94a3b8', cursor: 'pointer', marginBottom: 20, display: 'inline-block' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
        >
          + Create Biopsy Array
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.15)', fontSize: 11, color: '#94a3b8' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(212,83,126,0.3)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />stained</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '0.5px dashed #94a3b8', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />held, unstained</span>
      </div>
    </div>
  );
};

export default MaterialTreePanel;
