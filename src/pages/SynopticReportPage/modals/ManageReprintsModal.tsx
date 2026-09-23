// src/pages/SynopticReportPage/modals/ManageReprintsModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature. Cascading, checkbox-driven 4-column reprint manager,
// refined through several rounds of direct feedback:
//   - "too much vertical scrolling" -> the 4-column layout itself
//   - "the customer might think he is just printing specimen A's
//     labels" -> Select All now only ever operates on what's
//     genuinely visible in that column (the same cascade-filtered
//     set already rendered), never a hidden, broader scope — this
//     structurally removes the old "Reprint All" ambiguity rather
//     than just re-labelling it
//   - "Card-Level Tapping... 50px... prominent active states...
//     Select All pills... Card Grid for Slides" -> this pass: real,
//     large touch cards (not a small checkbox + label row), a single
//     Select All/Clear pill per column instead of a text link, and a
//     2-up grid for Column 4 specifically
// Every column, including Requisition, now shares one, single,
// uniform interaction model: check cards, then Print X (N) prints
// exactly what's checked — no separate bypass action anywhere.
//
// Styling: real CSS classes in pathscribe.css (ps-reprint-*), per the
// Internal Team Guide's own CSS convention (4.3) — no inline styles
// for anything that isn't a genuinely dynamic, per-render value.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Case } from '@/types/case/Case';
import { isUrgent, isExhausted, isLost, isDamaged, isEntirelySubmitted, entirelySubmittedBlockRangeText } from '@/utils/blockExceptionStates';
import { resolveBlockDisplayId, resolveSlideDisplayId } from '@/utils/materialDisplayId';

interface ManageReprintsModalProps {
  caseData: Case;
  onClose: () => void;
  onReprintRequisition: () => void;
  onReprintContainer: (specimenLabel: string) => Promise<void> | void;
  onReprintCassette: (specimenLabel: string, blockLabel: string) => void;
  onReprintSlide: (specimenLabel: string, blockLabel: string, level: string, stainName: string) => void;
  batchPrintBlocked: boolean;
}

const REQ_KEY = 'requisition';
const blockKey = (specimenLabel: string, blockLabel: string) => `${specimenLabel}${blockLabel}`;
const slideKey = (specimenLabel: string, blockLabel: string, level: string) => `${specimenLabel}${blockLabel}-${level}`;

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

/** Real feature, per direct follow-up: "Contextual Batching: Tapping
 *  the parent section label... can act as a quick-select toggle for
 *  all slides inside that specific block group." Same toggle-all/
 *  clear-all logic as SelectAllPill, deliberately scoped down to just
 *  one group's own keys rather than the whole column's. */
function toggleGroup(groupKeys: string[], selected: Set<string>, onSetSelected: (next: Set<string>) => void) {
  const allSelected = groupKeys.length > 0 && groupKeys.every(k => selected.has(k));
  onSetSelected(allSelected ? new Set([...selected].filter(k => !groupKeys.includes(k))) : new Set([...selected, ...groupKeys]));
}

const SelectAllPill: React.FC<{ allKeys: string[]; selected: Set<string>; onSetSelected: (next: Set<string>) => void }> = ({ allKeys, selected, onSetSelected }) => {
  const { t } = useTranslation();
  const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k));
  return (
    <button
      className={`ps-reprint-select-all-pill${allSelected ? ' ps-reprint-select-all-pill--clear' : ''}`}
      disabled={allKeys.length === 0}
      onClick={() => onSetSelected(allSelected ? new Set() : new Set(allKeys))}
    >
      {allSelected ? t('common.clear') : t('manageReprintsModal.selectAll')}
    </button>
  );
};

const Column: React.FC<{
  n: number; title: string; count: number; children: React.ReactNode; widthClass: string; bordered?: boolean;
  allKeys?: string[]; selected?: Set<string>; onSetSelected?: (next: Set<string>) => void;
}> = ({ n, title, count, children, widthClass, bordered, allKeys, selected, onSetSelected }) => (
  <div className={`ps-reprint-column ${widthClass}${bordered ? ' ps-reprint-column--bordered' : ''}`}>
    <div className="ps-reprint-column-header">
      <span className="ps-reprint-column-title">{n}. {title.toUpperCase()} ({count})</span>
      {/* Real fix, per direct follow-up: "I'm not sure the first
          column in the modal make sense to select all. can per row."
          Requisition only ever has exactly one real item — "Select
          All" implies a choice among several, which doesn't apply
          here. allKeys/selected/onSetSelected are omitted entirely
          for that column below rather than rendering a pill that
          just toggles a single row. */}
      {allKeys && selected && onSetSelected && (
        <SelectAllPill allKeys={allKeys} selected={selected} onSetSelected={onSetSelected} />
      )}
    </div>

    <div className="ps-reprint-column-body">{children}</div>
  </div>
);

/** Real feature, per direct follow-up: "Section Headers + Full-Width
 *  Row Breaks... Block Column: Group blocks by their parent Specimen
 *  ... Slide Column: Group slides strictly by their parent Block."
 *  One instance per real parent (a specimen for Column 3, a block for
 *  Column 4) — the divider before each group is skipped for the
 *  first one, since there's nothing above it in the column to divide
 *  from. */
const SectionedGroup: React.FC<{
  label: string; count: number; first: boolean; groupKeys: string[]; selected: Set<string>; onSetSelected: (next: Set<string>) => void;
  children: React.ReactNode;
}> = ({ label, count, first, groupKeys, selected, onSetSelected, children }) => (
  <div className="ps-reprint-section">
    {!first && <div className="ps-reprint-section-divider" />}
    <button type="button" className="ps-reprint-section-header" onClick={() => toggleGroup(groupKeys, selected, onSetSelected)}>
      {label} <span className="ps-reprint-section-count">({count})</span>
    </button>
    <div className="ps-reprint-section-grid">{children}</div>
  </div>
);

const CheckCard: React.FC<{
  label: string; sublabel?: string; checked: boolean; onToggle: () => void; urgent?: boolean;
  truncateSublabel?: boolean; stacked?: boolean; recut?: boolean; emptySlides?: boolean; exhausted?: boolean;
  lost?: boolean; damaged?: boolean; exceptionNote?: string; exceptionReportedAt?: string; entirelySubmitted?: boolean;
  resolvedId?: string;
}> = ({
  label, sublabel, checked, onToggle, urgent, truncateSublabel, stacked, recut, emptySlides, exhausted,
  lost, damaged, exceptionNote, exceptionReportedAt, entirelySubmitted, resolvedId,
}) => {
  const { t } = useTranslation();
  // Real feature, per direct follow-up covering the full exception-
  // states matrix. Lost genuinely blocks selection outright (the
  // physical cassette can't be found, so cutting is impossible) —
  // same reasoning and same disabled-checkbox pattern as Exhausted.
  // Damaged deliberately stays selectable: "Print Label Allowed? Yes
  // — a tech may need to print a new cassette label to re-embed or
  // repair the block" — a genuinely different real consequence from
  // Lost, not the same treatment under a different name.
  const disabled = exhausted || lost;
  const reportedDate = exceptionReportedAt ? new Date(exceptionReportedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : undefined;
  // exceptionNote is real, tech-entered free-text data (kept untranslated,
  // interpolated as-is); only the fixed sentence fragments around it (and
  // the date, which is a formatted value, not text) are translated — the
  // conditional " {{date}}"/" — {{note}}" inclusion logic itself stays in
  // JS so an absent date/note produces no stray punctuation, same as before.
  const tooltip =
    lost ? `${t('manageReprintsModal.tooltip.lostBase')}${reportedDate ? ` ${reportedDate}` : ''}${exceptionNote ? ` — ${exceptionNote}` : ''}. ${t('manageReprintsModal.tooltip.lostSuffix')}`
    : damaged ? `${t('manageReprintsModal.tooltip.damagedBase')}${reportedDate ? ` ${reportedDate}` : ''}${exceptionNote ? ` — ${exceptionNote}` : ''}. ${t('manageReprintsModal.tooltip.damagedSuffix')}`
    : exhausted ? t('manageReprintsModal.tooltip.exhausted')
    : entirelySubmitted ? t('manageReprintsModal.tooltip.entirelySubmitted')
    : undefined;
  return (
  <label
    className={`ps-reprint-card${checked ? ' ps-reprint-card--checked' : ''}${exhausted ? ' ps-reprint-card--exhausted' : ''}${lost ? ' ps-reprint-card--lost' : ''}${damaged ? ' ps-reprint-card--damaged' : ''}`}
    title={tooltip}
  >
    {/* Real feature, per direct follow-up: "Disabled Selection State:
        Dim/grey out the card slightly and disable the checkbox for
        Slide Reprints (since no new tissue exists to cut)." A real,
        existing, reachable status — BlockStatus = 'Exhausted' is one
        of the actual options in the real Block/Cassette editor's own
        status dropdown (BlockStainEditorModal.tsx), not invented for
        this modal. Disabling outright (Pete's first option) rather
        than an alert-on-attempt (the second) — the standard, less
        disruptive pattern, and it makes the invalid action
        impossible rather than merely warning about it after the
        fact. */}
    <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} className="ps-reprint-card-checkbox" />
    <div className={`ps-reprint-card-text${stacked ? ' ps-reprint-card-text--stacked' : ''}`}>
      <span className="ps-reprint-card-label-row">
        <span className="ps-reprint-card-label">{label}</span>
        {urgent && <span className="ps-reprint-card-stat-badge">STAT</span>}
        {/* Real feature, per direct follow-up: "While recuts
            originate at the slide level, a [ Recut ] badge is rolled
            up to the Block Card... Gives histotechs an immediate
            visual signal on which physical paraffin blocks need to be
            pulled from storage." Real, existing StainOrderStatus =
            'Recut Requested' (Specimen.ts) — rolled up here, not a
            new status invented for this modal. */}
        {recut && <span className="ps-reprint-card-recut-badge">🔄 {t('manageReprintsModal.badge.recut')}</span>}
        {exhausted && <span className="ps-reprint-card-exhausted-badge">🚫 {t('manageReprintsModal.badge.exhausted')}</span>}
        {entirelySubmitted && <span className="ps-reprint-card-exhausted-badge">🚫 {t('manageReprintsModal.badge.entirelySubmitted')}</span>}
        {/* Real feature, per direct follow-up: "Badge: [ ⚠️ LOST ]...
            (Amber / High-contrast warning fill)." */}
        {lost && <span className="ps-reprint-card-lost-badge">⚠️ {t('manageReprintsModal.badge.lost')}</span>}
        {/* Real feature, per direct follow-up: "Badge: [ ⚡ DAMAGED ]
            ... (Red or Orange outline)." */}
        {damaged && <span className="ps-reprint-card-damaged-badge">🛠️ {t('manageReprintsModal.badge.damaged')}</span>}
      </span>
      {/* Real feature, per direct follow-up: "resolveBlockDisplayId()
          etc. are defined but never called anywhere in the real UI...
          the Reprint modal still show[s] bare labels." Same real,
          honest fallback-resolved id as MaterialTreePanel.tsx now
          shows — this modal's own label/key stays exactly what it
          already was (both the display text and the internal
          selection-state key), so this is a real, additive line, not
          a risky change to something selection logic depends on. */}
      {resolvedId && <span className="ps-reprint-card-resolved-id">{resolvedId}</span>}
      {sublabel && (
        <span
          className={`ps-reprint-card-sublabel${truncateSublabel ? ' ps-reprint-card-sublabel--truncate' : ''}${emptySlides ? ' ps-reprint-card-sublabel--warning' : ''}`}
          title={truncateSublabel ? sublabel : undefined}
        >
          {/* Real feature, per direct follow-up: "update the subtext
              from a muted 0 slides to a high-contrast, bold
              indicator." Same real dashed-outline icon as before
              (kept, not replaced — a separate, complementary signal),
              now paired with a genuinely bold, bright amber sublabel
              instead of the same muted grey every other card uses, so
              a tech scanning the column can't mistake an empty block
              for a normal one at a glance. */}
          {emptySlides && <span className="ps-reprint-card-empty-slide-icon" aria-hidden="true" />}
          {sublabel}
        </span>
      )}
      {/* Real feature, per direct follow-up: "Subtext: Display the QC
          status or timestamp ('Reported missing 8/14')." Real block
          data (exceptionNote/exceptionReportedAt), settable through
          the real Block/Cassette editor — not placeholder text. */}
      {(lost || damaged) && exceptionNote && (
        <span className="ps-reprint-card-exception-note">{exceptionNote}{reportedDate ? ` · ${t('manageReprintsModal.reportedOn', { date: reportedDate })}` : ''}</span>
      )}
    </div>
  </label>
  );
};

export const ManageReprintsModal: React.FC<ManageReprintsModalProps> = ({
  caseData, onClose, onReprintRequisition, onReprintContainer, onReprintCassette, onReprintSlide, batchPrintBlocked,
}) => {
  const { t } = useTranslation();
  const [selectedReq, setSelectedReq] = useState<Set<string>>(new Set());
  const [selectedSpecimens, setSelectedSpecimens] = useState<Set<string>>(new Set());
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [selectedSlides, setSelectedSlides] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const specimens = caseData.specimens ?? [];
  const allBlockRows = specimens.flatMap(sp => (sp.blocks ?? []).map(b => ({ specimen: sp, block: b })));
  const allSlideRows = allBlockRows.flatMap(({ specimen, block }) =>
    (block.stains ?? []).map((stain, idx) => ({ specimen, block, stain, level: `L${idx + 1}` }))
  );

  // Real cascade: Column 3 shows only blocks under a currently-checked
  // specimen; Column 4 shows only slides under a currently-checked
  // block. Deliberately starts empty until a real selection narrows
  // it. Select All now only ever operates on exactly this same,
  // currently-visible set — never a hidden, broader scope.
  const visibleBlockRows = allBlockRows.filter(({ specimen }) => selectedSpecimens.has(specimen.label));
  const visibleSlideRows = allSlideRows.filter(({ specimen, block }) => selectedBlocks.has(blockKey(specimen.label, block.label)));

  // Real feature, per direct follow-up: grouped rendering for Columns
  // 3 & 4 — one real group per parent (a checked specimen for
  // blocks, a checked block for slides), in the same order they
  // appear in specimens/allBlockRows, not an arbitrary flat list.
  // Real feature, per direct follow-up: "Column 3 (Block): Shows the
  // existing blocks created from it, but displays a subtle header
  // note: SPECIMEN B (CONSUMED — 2 BLOCKS)." Real block count in the
  // note itself, not a generic "consumed" label alone — a tech
  // scanning the column sees at a glance both that it's consumed and
  // exactly how many cassettes that covers.
  const blockGroups = specimens
    .filter(sp => selectedSpecimens.has(sp.label))
    .map(sp => {
      const blockCount = sp.blocks?.length ?? 0;
      const consumed = isEntirelySubmitted(sp);
      // Group headers are visually upper-cased (no CSS text-transform here —
      // matches how Column's own title is upper-cased in JS below).
      const label = consumed
        ? t('manageReprintsModal.group.specimenConsumed', { label: sp.label, count: blockCount })
        : t('manageReprintsModal.group.specimen', { label: sp.label });
      return {
        key: sp.label,
        label: label.toUpperCase(),
        rows: (sp.blocks ?? []).map(block => ({ specimen: sp, block })),
      };
    });
  // Real fix, per direct follow-up: "slides appear without a block
  // selected." Confirmed directly from a screenshot: the header count
  // (visibleSlideRows.length, correctly filtered by selectedBlocks)
  // read 0, while the actual rendered groups below it still showed
  // "BLOCK A1"/"BLOCK A2" sections with real slide cards — a genuine
  // inconsistency between two different sources. This was built from
  // visibleBlockRows (every block merely LISTED in Column 3 because
  // its specimen is checked) rather than filtering down to blocks
  // that are themselves CHECKED — the same real distinction Column 3
  // itself depends on (a block being visible there was never meant
  // to imply its slides show in Column 4 too; only checking it does).
  const slideGroups = visibleBlockRows
    .filter(({ specimen, block }) => selectedBlocks.has(blockKey(specimen.label, block.label)))
    .map(({ specimen, block }) => {
      const key = blockKey(specimen.label, block.label);
      // Real feature, per direct follow-up: "When a tech taps/selects
      // a Lost or Damaged block, Column 4 should explicitly reflect
      // the block's physical status: BLOCK A4 (LOST) / BLOCK A5
      // (DAMAGED - AWAITING RE-EMBED)." Lost blocks can never actually
      // reach here — their own checkbox is disabled in Column 3, so
      // they can never enter selectedBlocks in the first place — but
      // the label logic is kept complete and correct regardless, not
      // dependent on that other, separate mechanism holding forever.
      const label = (
        isLost(block) ? t('manageReprintsModal.group.blockLost', { key })
        : isDamaged(block) ? t('manageReprintsModal.group.blockDamaged', { key })
        : t('manageReprintsModal.group.block', { key })
      ).toUpperCase();
      return {
        key, label, specimen, block,
        rows: (block.stains ?? []).map((stain, idx) => ({ specimen, block, stain, level: `L${idx + 1}` })),
      };
    });

  // Real fix, per direct follow-up: "Sync Button Quantities: Ensure
  // footer count indicators directly mirror the active checkbox
  // selection count." Confirmed directly, live: unchecking a specimen
  // left its blocks' — and their slides' — checked state sitting in
  // selectedBlocks/selectedSlides even though Column 3/4 no longer
  // showed them at all. "Print Sld (1)" kept reading 1 with nothing
  // whatsoever visible in Column 4 — a real, genuine risk of printing
  // something the pathologist can no longer see or confirm at all.
  // These two effects prune the downstream selection the moment its
  // own upstream selection changes, so a checked count can never
  // silently outlive what's actually still on screen.
  useEffect(() => {
    const visibleBlockKeys = new Set(visibleBlockRows.map(({ specimen, block }) => blockKey(specimen.label, block.label)));
    setSelectedBlocks(prev => {
      const pruned = new Set([...prev].filter(k => visibleBlockKeys.has(k)));
      return pruned.size === prev.size ? prev : pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpecimens]);

  useEffect(() => {
    const visibleSlideKeys = new Set(visibleSlideRows.map(({ specimen, block, level }) => slideKey(specimen.label, block.label, level)));
    setSelectedSlides(prev => {
      const pruned = new Set([...prev].filter(k => visibleSlideKeys.has(k)));
      return pruned.size === prev.size ? prev : pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlocks]);

  const runBusy = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const printSelectedReq = () => runBusy(onReprintRequisition);
  const printSelectedSpecimens = () => runBusy(async () => {
    for (const label of selectedSpecimens) await onReprintContainer(label);
  });
  const printSelectedBlocks = () => {
    for (const key of selectedBlocks) {
      const row = visibleBlockRows.find(r => blockKey(r.specimen.label, r.block.label) === key);
      if (row) onReprintCassette(row.specimen.label, row.block.label);
    }
  };
  const printSelectedSlides = () => {
    for (const key of selectedSlides) {
      const row = visibleSlideRows.find(r => slideKey(r.specimen.label, r.block.label, r.level) === key);
      if (row) onReprintSlide(row.specimen.label, row.block.label, row.level, row.stain.stainName);
    }
  };

  return (
    <div className="ps-overlay ps-reprint-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-reprint-modal" onClick={e => e.stopPropagation()}>
        <div className="ps-reprint-header">
          <div>
            <div className="ps-reprint-header-title">🖨️ {t('manageReprintsModal.title')}</div>
            <div className="ps-reprint-header-subtitle" data-phi="accession">{caseData.accession.fullAccession}</div>
          </div>
          <button onClick={onClose} className="ps-reprint-close-btn">✕</button>
        </div>

        <div className="ps-reprint-columns">
          {/* Column 1 — Requisition */}
          <Column n={1} title={t('manageReprintsModal.column.requisition')} count={1} widthClass="ps-reprint-column--req" bordered>
            <CheckCard
              label={caseData.accession.fullAccession} sublabel={t('manageReprintsModal.requisitionSublabel')}
              checked={selectedReq.has(REQ_KEY)} onToggle={() => setSelectedReq(prev => toggle(prev, REQ_KEY))}
              stacked truncateSublabel
            />
          </Column>

          {/* Column 2 — Specimen */}
          <Column
            n={2} title={t('manageReprintsModal.column.specimen')} count={specimens.length} widthClass="ps-reprint-column--specimen" bordered
            allKeys={specimens.map(sp => sp.label)} selected={selectedSpecimens} onSetSelected={setSelectedSpecimens}
          >
            {specimens.length === 0 && <div className="ps-reprint-empty">{t('manageReprintsModal.empty.noSpecimens')}</div>}
            {specimens.map(sp => {
              // Real feature, per direct follow-up: "Add a clear
              // badge like [ 🚫 Entirely Submitted ]... Replace or
              // append the description with helpful bench context
              // ('Entirely submitted in blocks B1–B2')." Replace, not
              // append — once every block is Exhausted, the original
              // anatomical description ("Left total mastectomy") is
              // less useful to a tech at the bench than knowing
              // exactly which cassettes accounted for all the tissue.
              // The specimen's own container-label checkbox stays
              // fully selectable either way — reprinting the original
              // bottle label is still a real, valid action even once
              // entirely submitted; only requesting a NEW block (a
              // different action, not available in this modal at all)
              // is what the spec's own warning applies to.
              const consumed = isEntirelySubmitted(sp);
              return (
                <CheckCard
                  key={sp.id} label={t('manageReprintsModal.specimenLabel', { label: sp.label })}
                  sublabel={consumed ? entirelySubmittedBlockRangeText(sp, t) : sp.description}
                  checked={selectedSpecimens.has(sp.label)}
                  onToggle={() => setSelectedSpecimens(prev => toggle(prev, sp.label))}
                  entirelySubmitted={consumed}
                  truncateSublabel stacked
                />
              );
            })}
          </Column>

          {/* Column 3 — Block / Cassette, grouped by parent Specimen */}
          <Column
            n={3} title={t('manageReprintsModal.column.block')} count={visibleBlockRows.length} widthClass="ps-reprint-column--block" bordered
            allKeys={visibleBlockRows.map(({ specimen, block }) => blockKey(specimen.label, block.label))}
            selected={selectedBlocks} onSetSelected={setSelectedBlocks}
          >
            {selectedSpecimens.size === 0 && <div className="ps-reprint-empty">{t('manageReprintsModal.empty.checkSpecimen')}</div>}
            {selectedSpecimens.size > 0 && visibleBlockRows.length === 0 && <div className="ps-reprint-empty">{t('manageReprintsModal.empty.noBlocks')}</div>}
            {blockGroups.filter(g => g.rows.length > 0).map((group, i) => (
              <SectionedGroup
                key={group.key} label={group.label} count={group.rows.length} first={i === 0}
                groupKeys={group.rows.map(({ specimen, block }) => blockKey(specimen.label, block.label))}
                selected={selectedBlocks} onSetSelected={setSelectedBlocks}
              >
                {group.rows.map(({ specimen, block }) => {
                  const key = blockKey(specimen.label, block.label);
                  const slideCount = block.stains?.length ?? 0;
                  return (
                    <CheckCard
                      key={key} label={key} sublabel={t('manageReprintsModal.slideCount', { count: slideCount })}
                      checked={selectedBlocks.has(key)}
                      onToggle={() => setSelectedBlocks(prev => toggle(prev, key))}
                      urgent={isUrgent(block, caseData)}
                      recut={block.stains?.some(s => s.status === 'Recut Requested') ?? false}
                      emptySlides={slideCount === 0}
                      exhausted={isExhausted(block)}
                      lost={isLost(block)}
                      damaged={isDamaged(block)}
                      exceptionNote={block.exceptionNote}
                      exceptionReportedAt={block.exceptionReportedAt}
                      resolvedId={resolveBlockDisplayId(caseData.accession.fullAccession, specimen.label, block)}
                      stacked
                    />
                  );
                })}
              </SectionedGroup>
            ))}
          </Column>

          {/* Column 4 — Slide / Stain, grouped by parent Block */}
          <Column
            n={4} title={t('manageReprintsModal.column.slides')} count={visibleSlideRows.length} widthClass="ps-reprint-column--slides"
            allKeys={visibleSlideRows.map(({ specimen, block, level }) => slideKey(specimen.label, block.label, level))}
            selected={selectedSlides} onSetSelected={setSelectedSlides}
          >
            {selectedBlocks.size === 0 && <div className="ps-reprint-empty">{t('manageReprintsModal.empty.checkBlock')}</div>}
            {/* Real feature, per direct follow-up: "Display a clear
                empty-state card under the SPECIMEN A > BLOCK A3
                boundary header: BLOCK A3 (0)... No slides generated
                for this block yet." Groups no longer get filtered out
                when empty — a checked block with genuinely zero
                slides now still gets its own real section header
                (with an honest "(0)") and an explicit, per-block empty
                state, rather than silently vanishing from the column
                entirely with no feedback at all. Replaces the old,
                broader "No slides on the checked block(s) yet."
                column-wide message, which would now be redundant with
                — and less precise than — telling the tech exactly
                which block is empty. */}
            {slideGroups.map((group, i) => (
              <SectionedGroup
                key={group.key} label={group.label} count={group.rows.length} first={i === 0}
                groupKeys={group.rows.map(({ specimen, block, level }) => slideKey(specimen.label, block.label, level))}
                selected={selectedSlides} onSetSelected={setSelectedSlides}
              >
                {/* Real feature, per direct follow-up: "For Damaged
                    Blocks (A5): BLOCK A5 (DAMAGED - AWAITING RE-EMBED)
                    🛠️ Tissue structure damaged. Re-embedding required
                    before recuts." Real exceptionNote shown when set,
                    generic fallback text otherwise — a damaged block
                    may still have real, existing slides (cut before
                    the damage occurred), so this banner sits ABOVE
                    them rather than replacing them; those slides are
                    real, physical objects that still exist and are
                    still reprintable regardless of the block's
                    current condition. */}
                {isDamaged(group.block) && (
                  <div className="ps-reprint-damaged-banner">
                    🛠️ {group.block.exceptionNote || t('manageReprintsModal.damagedBannerFallback')}
                  </div>
                )}
                {group.rows.length === 0 ? (
                  <div className="ps-reprint-empty-block-card">
                    <span className="ps-reprint-card-empty-slide-icon" aria-hidden="true" />
                    {t('manageReprintsModal.empty.noSlidesForBlock')}
                  </div>
                ) : group.rows.map(({ specimen, block, stain, level }) => {
                  const key = slideKey(specimen.label, block.label, level);
                  return (
                    <CheckCard
                      key={key} label={`${blockKey(specimen.label, block.label)}-${level}`} sublabel={stain.stainName}
                      checked={selectedSlides.has(key)}
                      onToggle={() => setSelectedSlides(prev => toggle(prev, key))}
                      urgent={isUrgent(block, caseData)}
                      resolvedId={resolveSlideDisplayId(caseData.accession.fullAccession, specimen.label, block.label, level, stain)}
                      stacked
                    />
                  );
                })}
              </SectionedGroup>
            ))}
          </Column>
        </div>

        {/* Per-column print actions — always exactly what's checked */}
        <div className="ps-reprint-footer">
          <div className="ps-reprint-footer-cell ps-reprint-footer-cell--req ps-reprint-footer-cell--bordered">
            <button onClick={printSelectedReq} disabled={selectedReq.size === 0} className="ps-reprint-print-btn">
              🖨️ {t('manageReprintsModal.footer.printReq', { count: selectedReq.size })}
            </button>
          </div>
          <div className="ps-reprint-footer-cell ps-reprint-footer-cell--specimen ps-reprint-footer-cell--bordered">
            <button onClick={printSelectedSpecimens} disabled={selectedSpecimens.size === 0} className="ps-reprint-print-btn">
              🖨️ {t('manageReprintsModal.footer.printSpec', { count: selectedSpecimens.size })}
            </button>
          </div>
          <div className="ps-reprint-footer-cell ps-reprint-footer-cell--block ps-reprint-footer-cell--bordered">
            <button
              onClick={printSelectedBlocks} disabled={selectedBlocks.size === 0 || batchPrintBlocked}
              title={batchPrintBlocked ? t('manageReprintsModal.footer.batchDisabledCassette') : undefined}
              className="ps-reprint-print-btn"
            >
              🖨️ {t('manageReprintsModal.footer.printBlk', { count: selectedBlocks.size })}
            </button>
          </div>
          <div className="ps-reprint-footer-cell ps-reprint-footer-cell--slides">
            <button
              onClick={printSelectedSlides} disabled={selectedSlides.size === 0 || batchPrintBlocked}
              title={batchPrintBlocked ? t('manageReprintsModal.footer.batchDisabledSlide') : undefined}
              className="ps-reprint-print-btn"
            >
              🖨️ {t('manageReprintsModal.footer.printSld', { count: selectedSlides.size })}
            </button>
          </div>
        </div>
        {busy && <div className="ps-reprint-busy">{t('manageReprintsModal.printing')}</div>}
      </div>
    </div>
  );
};

export default ManageReprintsModal;
