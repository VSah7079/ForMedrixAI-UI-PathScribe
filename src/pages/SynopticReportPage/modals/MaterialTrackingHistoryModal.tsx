// src/pages/SynopticReportPage/modals/MaterialTrackingHistoryModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up with a concrete, detailed
// hierarchy/scan-log mockup in hand: "I was expecting to see something
// more like this" — a real, nested Specimen -> Block -> Slide ->
// Aliquot tree, each level showing its own real, human-readable
// identifier and its own FULL scan/tracking history (every real
// event, not just the latest — see Material.ts's own MaterialLocation
// doc comment for the earlier gap this closes).
//
// Real rebuild, per direct follow-up's own detailed spec: "Master-
// Detail Split Pane (Interactive Tree + History Timeline)... Instead
// of displaying every single event for every single child item
// simultaneously, decouple the Asset Tree from the Event History."
// Interactive screen view is now genuinely two panes — a compact
// tree (left, current status only) and a per-item vertical timeline
// (right, full history for whatever's selected). Reduces the real
// visual density the original, always-everything tree had, per that
// same follow-up's own stated goal.
//
// Print output deliberately STAYS the full, comprehensive tree (every
// item, every event) — a printed "record" is a complete-document
// concern, genuinely different from an interactive "find one thing
// fast" concern the split-pane view exists for. Both real layouts
// coexist in this one file: the split-pane view is screen-only, the
// full tree is print-only (see the @media print rules in
// pathscribe.css), never both visible at once.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { Case } from '@/types/case/Case';
import type { HistologyBlock, StainOrder, Specimen } from '@/types/case/Specimen';
import type { Decant, Aliquot, MaterialLocation } from '@/types/case/Material';
import { DECANT_TYPE_LABEL } from '@/types/case/Material';
import {
  resolveSpecimenDisplayId, resolveBlockDisplayId, resolveSlideDisplayId,
  resolveDecantDisplayId, resolveDecantSlideDisplayId,
  resolveAliquotDisplayId, resolveDecantAliquotDisplayId,
} from '@/utils/materialDisplayId';
import { fetchDispatchHistoryForCase, type DispatchHistoryEntry } from '@/services/engravers/fetchDispatchHistoryForCase';
import { mockCassetteColorService } from '@/services/cassetteColors/mockCassetteColorService';
import DispatchHistoryTimeline from '../components/DispatchHistoryTimeline';

interface MaterialTrackingHistoryModalProps {
  caseData: Case;
  onClose: () => void;
}

import { is24HourForLocale } from '@/utils/formatDate';

/**
 * Real fix, per direct follow-up: "Maybe time in military style?
 * Will it reflect regional preference for date?" Confirmed directly,
 * not assumed: this modal's own formatTimestamp was hardcoded to
 * 'en-US' with hour12: true — always 12-hour time, always MM/DD dates,
 * regardless of who was actually viewing it.
 *
 * Genuinely locale-aware now — both date ORDER (via toLocaleString's
 * own real per-locale month/day ordering) and 12h/24h time (via
 * is24HourForLocale, reusing the exact same real jurisdiction logic
 * formatDate.ts's own formatDateTime already uses internally — every
 * real UK/IE jurisdiction there already defaults to 24-hour time,
 * genuinely the normal, everyday civilian convention there, not a
 * specialized "military" mode).
 *
 * Deliberately NOT formatDateTime itself, despite it existing for
 * exactly this and being this app's own real, established "single
 * source of truth for all date display" — its own fixed shape
 * includes a full year, which real-world testing here caught
 * reintroducing the print-column overflow this modal's own recent,
 * carefully-tuned fix had just resolved (a case's own tracking log
 * never spans multiple years, so the extra length buys nothing real
 * for this specific, compact use). is24HourForLocale, newly exported
 * from formatDate.ts for exactly this, lets this stay compact while
 * still reusing that file's own real 24h-detection logic rather than
 * quietly re-deriving it a second, independent way.
 *
 * No real, stored "institution jurisdiction" setting exists yet to
 * source this from (checked directly — SystemConfig, the real system-
 * wide config service, has no jurisdiction field at all yet) — using
 * the viewer's own real, live browser locale (navigator.language)
 * instead: a real, honest, immediately-available signal of regional
 * preference, not a guess.
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const locale = navigator.language;
  try {
    return d.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: !is24HourForLocale(locale) });
  } catch {
    // Real, defensive fallback — found directly while verifying an
    // unrelated print fix: some real environments report a malformed
    // navigator.language (e.g. a POSIX-influenced locale string
    // Intl.DateTimeFormat rejects outright), which made this fall all
    // the way back to the raw, unformatted ISO string — a genuinely
    // poor fallback for a real reader. Retries with a plain, always-
    // valid 'en-US' before giving up entirely, so a bad locale signal
    // degrades to a still-readable date, not raw ISO text.
    try {
      return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return iso;
    }
  }
}

/** Real, deterministic "current" status — sorted by `at`, not assumed
 *  append-order (a late-arriving or backfilled event should never
 *  silently look current just because it happened to append last).
 *  Same real helper MaterialTreePanel.tsx's own badges already use —
 *  reused, not re-implemented, so both surfaces can never silently
 *  disagree about what "most recent" means. */
function mostRecentLocation(history: MaterialLocation[] | undefined): MaterialLocation | undefined {
  if (!history || history.length === 0) return undefined;
  return [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

// ─── Search matching — real, pure predicates, mirrored top-down so a
// parent can decide whether to include a child at all (pruning the
// tree before render) rather than every leaf deciding for itself
// post-hoc, which React can't easily bubble back up to a parent. ────
function textMatch(haystack: string | undefined, query: string): boolean {
  if (!query) return true;
  return (haystack ?? '').toLowerCase().includes(query.toLowerCase());
}
/**
 * Real fix, per direct follow-up: "search not working - in the image
 * I started searching for slide... What bits of data are we
 * searching on?" Confirmed directly: this WAS matching workflowStage
 * and source too — neither field is ever actually rendered anywhere
 * in this modal (not in the timeline, not in the sidebar, not in
 * print). Specimen B/C's own real "Archive Shelf 12B" event has
 * workflowStage: 'Slide Archival' — searching "Slide" matched it
 * correctly, by the letter of "contains," but with no way for anyone
 * to see WHY it matched, since that field is invisible everywhere
 * else in this UI. Narrowed to only the fields actually shown on
 * screen (location, action, performedByName) — every real match
 * should now be visibly explainable by the same text a reader can
 * already see.
 */
function eventMatches(e: MaterialLocation, query: string): boolean {
  if (!query) return true;
  return textMatch(e.location, query) || textMatch(e.action, query) || textMatch(e.performedByName, query);
}
function anyEventMatches(history: MaterialLocation[] | undefined, query: string): boolean {
  if (!query) return true;
  return (history ?? []).some(e => eventMatches(e, query));
}
/**
 * Real fix, per direct follow-up: "search not working - in the image
 * I started searching for slide... What bits of data are we
 * searching on?" Confirmed directly, via a live test on the exact
 * query reported: searching "Slide" returned ZERO matches once
 * workflowStage/source were removed above — because none of these
 * functions ever checked the item's own TYPE label ("Specimen,"
 * "Block," "Slide," "Aliquot," "Decant") at all; that word only ever
 * existed in the UI-generated title string, never in a real,
 * searched data field. A reader typing "slide," expecting "show me
 * every slide," is an entirely reasonable, intuitive search — this
 * closes that real, missing capability, not just the earlier,
 * confusing-match problem.
 */
const TYPE_LABELS = { specimen: 'Specimen', block: 'Block', slide: 'Slide', decant: 'Decant', aliquot: 'Aliquot' } as const;

function aliquotMatches(aliquot: Aliquot, displayId: string, query: string): boolean {
  if (!query) return true;
  return textMatch(TYPE_LABELS.aliquot, query) || textMatch(aliquot.label, query) || textMatch(aliquot.aliquotType, query) || textMatch(displayId, query) || anyEventMatches(aliquot.locationHistory, query);
}
function slideMatches(slide: StainOrder, displayId: string, query: string): boolean {
  if (!query) return true;
  if (textMatch(TYPE_LABELS.slide, query) || textMatch(slide.stainName, query) || textMatch(displayId, query) || anyEventMatches(slide.locationHistory, query)) return true;
  return (slide.aliquots ?? []).some(a => aliquotMatches(a, '', query));
}
function blockMatches(block: HistologyBlock, displayId: string, query: string): boolean {
  if (!query) return true;
  if (textMatch(TYPE_LABELS.block, query) || textMatch(block.label, query) || textMatch(displayId, query) || anyEventMatches(block.locationHistory, query)) return true;
  return (block.stains ?? []).some(s => slideMatches(s, '', query));
}
function decantMatches(decant: Decant, displayId: string, query: string): boolean {
  if (!query) return true;
  if (textMatch(TYPE_LABELS.decant, query) || textMatch(decant.label, query) || textMatch(displayId, query) || anyEventMatches(decant.locationHistory, query)) return true;
  return (decant.stains ?? []).some(s => slideMatches(s, '', query));
}
function specimenMatches(specimen: Specimen, displayId: string, query: string): boolean {
  if (!query) return true;
  if (textMatch(TYPE_LABELS.specimen, query) || textMatch(specimen.label, query) || textMatch(specimen.description, query) || textMatch(displayId, query) || anyEventMatches(specimen.locationHistory, query)) return true;
  if ((specimen.blocks ?? []).some(b => blockMatches(b, '', query))) return true;
  return (specimen.decants ?? []).some(d => decantMatches(d, '', query));
}

/**
 * Real fix, per direct report: "The update broke the search."
 * Confirmed directly, via a real click-through test, not assumed:
 * the sidebar filtered correctly, but the detail panel — 68% of the
 * modal, the part someone's eye actually lands on — kept showing
 * whatever was selected before the search (e.g. "Block 1," its own
 * unrelated events), because that item stayed technically visible as
 * an ancestor of the real match, and this modal's own selection logic
 * only checked "is the selection still in the visible list," never
 * "does the selection itself actually match what was searched for."
 * A user typing "RNA Lysate" and seeing a Grossing/Sectioning
 * timeline that never mentions it reasonably reads that as search
 * being broken, even though the sidebar itself was correct the whole
 * time.
 *
 * These are the real, missing "does THIS item's own content match" —
 * deliberately NOT recursive (no descendant check), unlike
 * specimenMatches/blockMatches/etc. above, which mix "self matches"
 * and "a descendant matches" into one combined answer by design (that
 * combination is exactly right for deciding sidebar visibility/
 * keeping ancestors in view — just wrong for deciding what the detail
 * panel should jump to show).
 */
function specimenSelfMatches(specimen: Specimen, displayId: string, query: string): boolean {
  if (!query) return false;
  return textMatch(TYPE_LABELS.specimen, query) || textMatch(specimen.label, query) || textMatch(specimen.description, query) || textMatch(displayId, query) || anyEventMatches(specimen.locationHistory, query);
}
function blockSelfMatches(block: HistologyBlock, displayId: string, query: string): boolean {
  if (!query) return false;
  return textMatch(TYPE_LABELS.block, query) || textMatch(block.label, query) || textMatch(displayId, query) || anyEventMatches(block.locationHistory, query);
}
function slideSelfMatches(slide: StainOrder, displayId: string, query: string): boolean {
  if (!query) return false;
  return textMatch(TYPE_LABELS.slide, query) || textMatch(slide.stainName, query) || textMatch(displayId, query) || anyEventMatches(slide.locationHistory, query);
}
function decantSelfMatches(decant: Decant, displayId: string, query: string): boolean {
  if (!query) return false;
  return textMatch(TYPE_LABELS.decant, query) || textMatch(decant.label, query) || textMatch(displayId, query) || anyEventMatches(decant.locationHistory, query);
}
function aliquotSelfMatches(aliquot: Aliquot, displayId: string, query: string): boolean {
  if (!query) return false;
  return textMatch(TYPE_LABELS.aliquot, query) || textMatch(aliquot.label, query) || textMatch(aliquot.aliquotType, query) || textMatch(displayId, query) || anyEventMatches(aliquot.locationHistory, query);
}

function hasEvents(history: MaterialLocation[] | undefined): boolean {
  return (history ?? []).length > 0;
}
function hasAnyTrackingData(specimens: Specimen[]): boolean {
  return specimens.some(sp =>
    hasEvents(sp.locationHistory) ||
    (sp.blocks ?? []).some(b => hasEvents(b.locationHistory) || (b.stains ?? []).some(s => hasEvents(s.locationHistory) || (s.aliquots ?? []).some(a => hasEvents(a.locationHistory)))) ||
    (sp.decants ?? []).some(d => hasEvents(d.locationHistory) || (d.stains ?? []).some(s => hasEvents(s.locationHistory) || (s.aliquots ?? []).some(a => hasEvents(a.locationHistory)))),
  );
}

// ─── Flat tree — real, per direct follow-up's own spec: "Left Sidebar
// (Asset Tree Column)... Displays the clean hierarchy tree... Each
// node displays only its current live status/location." One pass
// over the real specimen tree, producing a flat list (id, depth, icon,
// title, subtitle, its own real locationHistory, and whether it's
// visible under the current search) — simpler for the sidebar to
// render as a plain, indented list than re-deriving this from nested
// JSX every render. ───────────────────────────────────────────────
interface FlatTreeItem {
  id: string;
  depth: number;
  icon: string;
  title: string;
  displayId: string;
  subtitle: string;
  locationHistory: MaterialLocation[] | undefined;
  visible: boolean;
  /** Real fix, per direct report: "The update broke the search." See
   *  the specimenSelfMatches/etc. functions' own doc comment above
   *  for the full reasoning — this item's own content directly
   *  matches the query, independent of whether it's only visible
   *  because a descendant matched instead. */
  directMatch: boolean;
  /** Real feature, per direct follow-up: "maybe that Green dot should
   *  indicate its ready for review?" Slide: the SAME real status
   *  check MaterialTreePanel.tsx's own SlideChip already uses
   *  (status === 'Coverslipped' || 'Ready for Review') — reused, not
   *  re-derived, so the two real "ready" indicators in this app can
   *  never silently disagree about what ready means. Specimen/Block/
   *  Decant: true only when EVERY real slide under it is ready (and
   *  at least one exists) — a real, honest aggregate, not "any slide
   *  ready." Aliquot: always false — StainOrder has a real status
   *  field; Aliquot (types/case/Material.ts) genuinely doesn't, so
   *  "ready for review" has no real meaning there yet; showing a dot
   *  anyway would be a guess, not a real status. */
  readyForReview: boolean;
}

/** Real, shared "is this slide ready" check — the exact same
 *  condition MaterialTreePanel.tsx's own SlideChip uses for its own
 *  ready dot (see that file's notYetReady), duplicated here rather
 *  than imported only because that component doesn't currently
 *  export it — the LOGIC itself is identical on purpose, not
 *  independently re-derived. */
function isSlideReady(stain: StainOrder): boolean {
  return stain.status === 'Coverslipped' || stain.status === 'Ready for Review';
}
function allSlidesReady(stains: StainOrder[]): boolean {
  return stains.length > 0 && stains.every(isSlideReady);
}

function buildFlatTree(specimens: Specimen[], fullAccession: string, query: string): FlatTreeItem[] {
  const items: FlatTreeItem[] = [];

  for (const sp of specimens) {
    const spDisplayId = resolveSpecimenDisplayId(fullAccession, sp);
    const spVisible = specimenMatches(sp, spDisplayId, query);
    // Real, honest specimen-level aggregate — every real slide across
    // every real block AND decant this specimen owns, not just the
    // first one found. Computed once, up front, rather than inside
    // the block/decant loops below (which haven't run yet at this
    // point) so the Specimen row's own dot reflects its FULL real
    // material tree, not just a partial view of it.
    const allSpecimenSlides: StainOrder[] = [
      ...(sp.blocks ?? []).flatMap(b => b.stains ?? []),
      ...(sp.decants ?? []).flatMap(d => d.stains ?? []),
    ];
    items.push({ id: sp.id, depth: 0, icon: '📁', title: `Specimen ${sp.label}`, displayId: spDisplayId, subtitle: sp.description || 'Specimen', locationHistory: sp.locationHistory, visible: spVisible, directMatch: specimenSelfMatches(sp, spDisplayId, query), readyForReview: allSlidesReady(allSpecimenSlides) });

    for (const block of sp.blocks ?? []) {
      const blockDisplayId = resolveBlockDisplayId(fullAccession, sp.label, block);
      const blockVisible = spVisible && blockMatches(block, blockDisplayId, query);
      items.push({ id: block.id, depth: 1, icon: '📦', title: `Block ${block.label}`, displayId: blockDisplayId, subtitle: 'Tissue Cassette', locationHistory: block.locationHistory, visible: blockVisible, directMatch: blockSelfMatches(block, blockDisplayId, query), readyForReview: allSlidesReady(block.stains ?? []) });

      (block.stains ?? []).forEach((slide, i) => {
        const level = `L${i + 1}`;
        const slideDisplayId = resolveSlideDisplayId(fullAccession, sp.label, block.label, level, slide);
        const slideVisible = blockVisible && slideMatches(slide, slideDisplayId, query);
        items.push({ id: slide.id, depth: 2, icon: '🔬', title: `Slide ${block.label}-${level}`, displayId: slideDisplayId, subtitle: slide.stainName || 'Unstained', locationHistory: slide.locationHistory, visible: slideVisible, directMatch: slideSelfMatches(slide, slideDisplayId, query), readyForReview: isSlideReady(slide) });

        for (const aliquot of slide.aliquots ?? []) {
          const aliquotDisplayId = resolveAliquotDisplayId(fullAccession, sp.label, block.label, level, aliquot);
          items.push({ id: aliquot.id, depth: 3, icon: '🧪', title: `Aliquot ${block.label}-${level}${aliquot.label}`, displayId: aliquotDisplayId, subtitle: aliquot.aliquotType, locationHistory: aliquot.locationHistory, visible: slideVisible && aliquotMatches(aliquot, aliquotDisplayId, query), directMatch: aliquotSelfMatches(aliquot, aliquotDisplayId, query), readyForReview: false });
        }
      });
    }

    for (const decant of sp.decants ?? []) {
      const decantDisplayId = resolveDecantDisplayId(fullAccession, sp.label, decant);
      const decantVisible = spVisible && decantMatches(decant, decantDisplayId, query);
      items.push({ id: decant.id, depth: 1, icon: '📦', title: `Decant ${decant.label}`, displayId: decantDisplayId, subtitle: DECANT_TYPE_LABEL[decant.decantType], locationHistory: decant.locationHistory, visible: decantVisible, directMatch: decantSelfMatches(decant, decantDisplayId, query), readyForReview: allSlidesReady(decant.stains ?? []) });

      (decant.stains ?? []).forEach((slide, i) => {
        const level = `L${i + 1}`;
        const slideDisplayId = resolveDecantSlideDisplayId(fullAccession, sp.label, decant.label, level, slide);
        const slideVisible = decantVisible && slideMatches(slide, slideDisplayId, query);
        items.push({ id: slide.id, depth: 2, icon: '🔬', title: `Slide ${decant.label}-${level}`, displayId: slideDisplayId, subtitle: slide.stainName || 'Unstained', locationHistory: slide.locationHistory, visible: slideVisible, directMatch: slideSelfMatches(slide, slideDisplayId, query), readyForReview: isSlideReady(slide) });

        for (const aliquot of slide.aliquots ?? []) {
          const aliquotDisplayId = resolveDecantAliquotDisplayId(fullAccession, sp.label, decant.label, level, aliquot);
          items.push({ id: aliquot.id, depth: 3, icon: '🧪', title: `Aliquot ${decant.label}-${level}${aliquot.label}`, displayId: aliquotDisplayId, subtitle: aliquot.aliquotType, locationHistory: aliquot.locationHistory, visible: slideVisible && aliquotMatches(aliquot, aliquotDisplayId, query), directMatch: aliquotSelfMatches(aliquot, aliquotDisplayId, query), readyForReview: false });
        }
      });
    }
  }

  return items;
}

// ─── Left sidebar row — per direct spec: "Each node displays only its
// current live status/location (e.g., Slide A1-L1 · 🟢 Digital
// Scanner 02)." ─────────────────────────────────────────────────────
const SidebarRow: React.FC<{ item: FlatTreeItem; selected: boolean; onSelect: () => void }> = ({ item, selected, onSelect }) => {
  const loc = mostRecentLocation(item.locationHistory);
  return (
    <button
      type="button"
      className={`ps-mth-sidebar-row${selected ? ' ps-mth-sidebar-row--selected' : ''}`}
      style={{ paddingLeft: 14 + item.depth * 16 }}
      onClick={onSelect}
    >
      <div className="ps-mth-sidebar-row-top">
        <span className="ps-mth-sidebar-icon">{item.icon}</span>
        <span className="ps-mth-sidebar-title">{item.title}</span>
      </div>
      <div
        className="ps-mth-sidebar-status"
        title={
          loc
            ? `${item.readyForReview ? 'Ready for review. ' : ''}Most recent known location, reported ${formatTimestamp(loc.at)}. Click to see this item's full history.`
            : 'No tracking events recorded for this item yet.'
        }
      >
        {loc ? <>{item.readyForReview && <span className="ps-mth-sidebar-dot" />} {loc.location}</> : <span className="ps-mth-sidebar-status--none">No events yet</span>}
      </div>
    </button>
  );
};

// ─── Right panel — per direct spec: "Shows a clean vertical step-by-
// step timeline only for the selected asset." Reverse-chronological,
// same real display-only reasoning as the earlier tabular view (the
// underlying stored history stays real, append-order chronological —
// this never mutates it). ───────────────────────────────────────────
const DetailTimeline: React.FC<{ item: FlatTreeItem }> = ({ item }) => {
  const displayHistory = useMemo(() => [...(item.locationHistory ?? [])].reverse(), [item.locationHistory]);
  return (
    <div className="ps-mth-detail">
      <div className="ps-mth-detail-header">
        <span className="ps-mth-detail-icon">{item.icon}</span>
        <div>
          <div className="ps-mth-detail-title">{item.title}: {item.displayId}</div>
          <div className="ps-mth-detail-subtitle">{item.subtitle}</div>
        </div>
      </div>
      {displayHistory.length === 0 ? (
        <div className="ps-mth-detail-empty">No tracking events yet for this item.</div>
      ) : (
        <div className="ps-mth-timeline">
          {displayHistory.map((event, i) => (
            <div key={i} className="ps-mth-timeline-step">
              <div className="ps-mth-timeline-marker">
                <span className="ps-mth-timeline-dot" />
                {i < displayHistory.length - 1 && <span className="ps-mth-timeline-line" />}
              </div>
              <div className="ps-mth-timeline-content">
                <div className="ps-mth-timeline-time">{formatTimestamp(event.at)}</div>
                <div className="ps-mth-timeline-location">{event.location}</div>
                {event.action && <div className="ps-mth-timeline-action">{event.action}</div>}
                {event.performedByName && <div className="ps-mth-timeline-who">{event.performedByName}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Print-only comprehensive tree — every item, every event, real
// tabular columns. Kept separate from the interactive split-pane
// view above; a printed "record" is a complete-document concern,
// genuinely different from the "find one thing fast" the split-pane
// view exists for. ───────────────────────────────────────────────
const PrintEventRow: React.FC<{ event: MaterialLocation }> = ({ event }) => (
  <div className="ps-mth-event">
    <span className="ps-mth-event-time">🕒 {formatTimestamp(event.at)}</span>
    <span className="ps-mth-event-location">{event.location}</span>
    <span className="ps-mth-event-action">{event.action ?? '—'}</span>
    <span className="ps-mth-event-who">{event.performedByName ?? ''}</span>
  </div>
);
const PrintNode: React.FC<{ item: FlatTreeItem }> = ({ item }) => {
  const displayHistory = useMemo(() => [...(item.locationHistory ?? [])].reverse(), [item.locationHistory]);
  return (
    <div className="ps-mth-node" style={{ marginLeft: item.depth * 14 }}>
      <div className="ps-mth-node-header">
        <span className="ps-mth-node-icon">{item.icon}</span>
        <span className="ps-mth-node-title">{item.title}: {item.displayId}</span>
        <span className="ps-mth-node-subtitle">— {item.subtitle}</span>
      </div>
      <div className="ps-mth-node-body">
        {displayHistory.length === 0 ? (
          <div className="ps-mth-event ps-mth-event--empty">No tracking events yet</div>
        ) : (
          displayHistory.map((event, i) => <PrintEventRow key={i} event={event} />)
        )}
      </div>
    </div>
  );
};

const MaterialTrackingHistoryModal: React.FC<MaterialTrackingHistoryModalProps> = ({ caseData, onClose }) => {
  const fullAccession = caseData.accession?.fullAccession ?? caseData.id;
  const specimens = caseData.specimens ?? [];
  const [query, setQuery] = useState('');

  const flatItems = useMemo(() => buildFlatTree(specimens, fullAccession, query.trim()), [specimens, fullAccession, query]);
  const visibleItems = useMemo(() => flatItems.filter(i => i.visible), [flatItems]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Real fix, per direct report: "The update broke the search."
  // Confirmed directly via a real click-through test: the sidebar
  // filtered correctly, but the detail panel kept showing whatever
  // was selected before the search — an item that stayed technically
  // visible only because it's an ancestor of the real match, with
  // nothing in its own content mentioning the search term at all.
  // When the query itself changes, jump the selection to the first
  // real, direct match (see directMatch's own doc comment above) —
  // deliberately keyed on `query` alone, not on every render, so a
  // manual click on a visible-but-non-matching ancestor (deliberately
  // reviewing the parent Specimen while a search is still active)
  // never gets silently overridden back to the match afterward.
  useEffect(() => {
    if (!query.trim()) return;
    const directMatches = flatItems.filter(i => i.directMatch);
    if (directMatches.length > 0) setSelectedId(directMatches[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  // Real, deliberate default — the first visible item, so the right
  // panel isn't a blank "select something" prompt on first open. Also
  // re-selects if the current selection drops out of the search
  // results, rather than showing a detail panel for a hidden item.
  const selectedItem = useMemo(() => {
    const found = visibleItems.find(i => i.id === selectedId);
    return found ?? visibleItems[0];
  }, [visibleItems, selectedId]);

  const handlePrint = () => {
    if (!hasAnyTrackingData(specimens)) {
      const proceed = window.confirm(
        `${fullAccession} has no tracking events recorded yet — none of its specimens, blocks, slides, or aliquots have a real scan event. Print anyway?`,
      );
      if (!proceed) return;
    }
    window.print();
  };

  // Real, per direct guidance's own Clinical Job History spec —
  // case-level dispatch/exception history, additive to this modal's
  // existing per-item MaterialLocation timeline above. See
  // DispatchHistoryTimeline.tsx's own header for why this is case-
  // level rather than wired into the existing per-node selection —
  // the underlying event data has no block-level identifier to match
  // against a specific tree node.
  const [dispatchHistory, setDispatchHistory] = useState<DispatchHistoryEntry[]>([]);
  const [colorNames, setColorNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetchDispatchHistoryForCase(caseData.id).then(setDispatchHistory).catch(err => {
      console.error('[MaterialTrackingHistoryModal] failed to load dispatch history', err);
    });
    mockCassetteColorService.getAll().then(res => {
      if (res.ok) setColorNames(Object.fromEntries(res.data.map(c => [c.key, c.displayName])));
    });
  }, [caseData.id]);

  return ReactDOM.createPortal(
    <div className="ps-overlay ps-mth-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-mth-modal ps-mth-print-area" onClick={e => e.stopPropagation()}>
        <div className="ps-mth-header">
          <div>
            <div className="ps-mth-title">📍 Hierarchy &amp; Scan Audit Log</div>
            <div className="ps-mth-case">{fullAccession}</div>
          </div>
          <div className="ps-mth-header-actions">
            <button className="ps-btn-secondary ps-mth-print-btn" onClick={handlePrint}>🖨️ Print</button>
            <button className="ps-mth-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="ps-mth-search-row">
          <input
            className="ps-mth-search-input"
            type="text"
            placeholder="Search by type, ID, location, action, tech/pathologist name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && <span className="ps-mth-search-count">{visibleItems.length} of {flatItems.length} items match</span>}
        </div>

        {/* Real, per direct guidance's own Clinical Job History spec —
            case-level cassette dispatch/exception history, additive to
            the existing per-item tree below. Screen-only, same real
            "hidden on print, print gets its own comprehensive section"
            posture as the split-pane view below — see this section's
            own print-only counterpart further down. */}
        <div className="ps-mth-dispatch-history-section" style={{ padding: '0 16px 12px', maxHeight: 220, overflowY: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8899aa', marginBottom: 8 }}>
            🖨️ Cassette Dispatch &amp; Block Exception History
          </div>
          <DispatchHistoryTimeline entries={dispatchHistory} colorNames={colorNames} />
        </div>

        {/* Real, interactive split-pane view — screen only, hidden on
            print (see pathscribe.css's own @media print block). */}
        <div className="ps-mth-splitpane">
          <div className="ps-mth-sidebar">
            {specimens.length === 0 ? (
              <div className="ps-mth-empty">No specimens on this case.</div>
            ) : visibleItems.length === 0 ? (
              <div className="ps-mth-empty">No matches for "{query}".</div>
            ) : (
              visibleItems.map(item => (
                <SidebarRow key={item.id} item={item} selected={item.id === selectedItem?.id} onSelect={() => setSelectedId(item.id)} />
              ))
            )}
          </div>
          <div className="ps-mth-detail-pane">
            {selectedItem ? <DetailTimeline item={selectedItem} /> : (
              <div className="ps-mth-empty">Select an item on the left to see its full scan history.</div>
            )}
          </div>
        </div>

        {/* Real, comprehensive full tree — print only. */}
        <div className="ps-mth-print-only-body">
          {specimens.length === 0 ? (
            <div className="ps-mth-empty">No specimens on this case.</div>
          ) : (
            flatItems.map(item => <PrintNode key={item.id} item={item} />)
          )}
          {/* Real, per direct guidance's own Clinical Job History spec
              — same case-level history as the screen-only section
              above, included in the printed comprehensive record too. */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #444' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Cassette Dispatch &amp; Block Exception History</div>
            <DispatchHistoryTimeline entries={dispatchHistory} colorNames={colorNames} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MaterialTrackingHistoryModal;
