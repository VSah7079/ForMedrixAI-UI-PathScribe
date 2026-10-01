// src/utils/microtomyOperations.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284 (Microtomy Workstation). Pure, testable functions —
// same real shape as grossingScreenOperations.ts's own extraction:
// genuinely worth verifying in isolation (print-status transitions,
// the printed-vs-unprinted removal-reason gate, control-slide pairing)
// without driving a real page component to do it. The caller
// (useMicrotomyWorkstation.ts) is responsible for persisting the
// returned Specimen via caseRouter.updateCase — these functions never
// touch case data themselves.
//
// Real, deliberate scope note on control-slide pairing: this creates
// a second StainOrder on the SAME block, cross-linked via
// pairedControlSlideId — the real, physical thing a microtomy tech
// does when pairing happens at order time (an extra slide cut
// alongside the clinical one). This is genuinely separate from
// shouldAutoAppendControl.ts's own, already-real mechanism (Stain QC
// Module §2.3), which creates a synthetic CONTROL CASE at the batch/
// QC level, not a same-block sibling slide. Reconciling whether these
// two real control-slide paths should ever be unified is a real,
// separate design question, not resolved here.
// ─────────────────────────────────────────────────────────────────────────────

import { slideIdentifier } from '@/types/labels/LabelData';
import type { HistologyBlock, Specimen, StainOrder } from '@/types/case/Specimen';
import type { Decant } from '@/types/case/Material';
import type { MaterialComment } from '@/types/case/MaterialComment';
import type { StainType } from '@/services/stains/IStainService';
import type { CytologyPrepSuggestion } from '@/services/cytology/computeCytologyPrepSuggestions';

export type MicrotomyOperationResult =
  | { ok: true; specimen: Specimen }
  | { ok: false; error: string }
  | { ok: false; needsReason: true };

/** Real, per the spec's own "Remove/Cancel Stain... cancellation
 *  reason required (Damaged Section, Ordered in Error, Tissue
 *  Exhausted) if removing after a slide has already printed." */
export const MICROTOMY_CANCEL_REASONS = ['Damaged Section', 'Ordered in Error', 'Tissue Exhausted', 'Other'] as const;
export type MicrotomyCancelReason = typeof MICROTOMY_CANCEL_REASONS[number];

/** Real, per the spec's own "dedicated Reprint button requiring
 *  single-tap reason selection." */
export const MICROTOMY_REPRINT_REASONS = ['Jam', 'Scratched Glass', 'Misprint', 'Other'] as const;

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function findBlock(specimen: Specimen, blockId: string): HistologyBlock | undefined {
  return (specimen.blocks ?? []).find(b => b.id === blockId);
}

function findDecant(specimen: Specimen, decantId: string): Decant | undefined {
  return (specimen.decants ?? []).find(d => d.id === decantId);
}

function replaceBlockStains(specimen: Specimen, blockId: string, stains: StainOrder[], extra?: Partial<HistologyBlock>): Specimen {
  return {
    ...specimen,
    blocks: (specimen.blocks ?? []).map(b => b.id !== blockId ? b : { ...b, ...extra, stains }),
  };
}

function replaceDecantStains(specimen: Specimen, decantId: string, stains: StainOrder[]): Specimen {
  return {
    ...specimen,
    decants: (specimen.decants ?? []).map(d => d.id !== decantId ? d : { ...d, stains }),
  };
}

/** Real, first unprinted slide on a block, per the spec's own
 *  "On-Demand: auto-selects first unprinted slide on Block barcode
 *  scan or Block selection from queue." A slide with no printStatus
 *  at all (predates this field) counts as unprinted — same real
 *  "undefined means never attempted" posture as the field's own doc
 *  comment. 'Printing' is deliberately excluded — a slide already
 *  mid-dispatch is never re-selected as "next." */
export function computeNextUnprintedStain(stains: StainOrder[]): StainOrder | undefined {
  return stains.find(s => s.printStatus === undefined || s.printStatus === 'Pending' || s.printStatus === 'Failed');
}

/** Real, per the spec's own Add Stain Quick-Picker: "configurable
 *  duplicate count, level depth/microtome step distance,
 *  control-slide pairing checkbox." Works against a block's own
 *  stains array directly — caller passes which real block. */
export function addMicrotomyStain(
  specimen: Specimen,
  blockId: string,
  stainType: StainType,
  fullAccession: string,
  options: { duplicateCount?: number; levelDepthMicrons?: number; pairWithControl?: boolean } = {},
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };

  const duplicateCount = Math.max(1, options.duplicateCount ?? 1);
  const newStains: StainOrder[] = [];
  let nextLevel = block.stains.length;

  for (let i = 0; i < duplicateCount; i++) {
    nextLevel += 1;
    const clinical: StainOrder = {
      id: genId('stain'),
      stainName: stainType.name,
      status: 'Pending Cut',
      displayId: slideIdentifier(fullAccession, specimen.label, block.label, `L${nextLevel}`),
      userAdded: true,
      levelDepthMicrons: options.levelDepthMicrons,
      printStatus: 'Pending',
    };
    newStains.push(clinical);

    if (options.pairWithControl) {
      nextLevel += 1;
      const controlId = genId('stain');
      const control: StainOrder = {
        id: controlId,
        stainName: `${stainType.name} (Control)`,
        status: 'Pending Cut',
        displayId: slideIdentifier(fullAccession, specimen.label, block.label, `L${nextLevel}`),
        userAdded: true,
        isControlSlide: true,
        pairedControlSlideId: clinical.id,
        printStatus: 'Pending',
      };
      clinical.pairedControlSlideId = controlId;
      newStains.push(control);
    }
  }

  return { ok: true, specimen: replaceBlockStains(specimen, blockId, [...block.stains, ...newStains], { userModified: true }) };
}

/** Real, per the spec's own "Remove/Cancel Stain: direct delete on
 *  unprinted rows; cancellation reason required... if removing after
 *  a slide has already printed." Pass `reason` only once the caller's
 *  own real reason-selection UI has answered it — this function never
 *  shows UI itself, same real convention as removeGrossingStain's own
 *  confirmed flag. */
export function removeMicrotomyStain(
  specimen: Specimen,
  blockId: string,
  stainId: string,
  reason?: MicrotomyCancelReason,
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const stain = block.stains.find(s => s.id === stainId);
  if (!stain) return { ok: false, error: 'Stain not found.' };

  const alreadyPrinted = stain.printStatus === 'Printed' || stain.printStatus === 'Printing';
  if (alreadyPrinted && !reason) return { ok: false, needsReason: true };

  // Real, deliberate choice: a printed slide is never silently
  // deleted from the record (it's a real, physical label that already
  // left the printer) — it's marked Canceled instead, same "never
  // silently reversible" posture as disposedAt elsewhere in this app.
  // An unprinted slide has nothing physical yet, so a direct delete is
  // safe and matches the spec's own "direct delete on unprinted rows."
  const updatedStains = alreadyPrinted
    ? block.stains.map(s => s.id !== stainId ? s : { ...s, status: 'Cancelled' as const, printStatus: 'Canceled' as const, printFailureReason: reason })
    : block.stains.filter(s => s.id !== stainId);

  return { ok: true, specimen: replaceBlockStains(specimen, blockId, updatedStains) };
}

/** Real, called once dispatch has actually begun — sets 'Printing'
 *  optimistically before the real async printCassetteSlideLabel call
 *  resolves, so a batch progress UI reflects "in flight" honestly
 *  rather than jumping straight from Pending to a final state. */
export function markStainPrinting(specimen: Specimen, blockId: string, stainId: string): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const updatedStains = block.stains.map(s => s.id !== stainId ? s : { ...s, printStatus: 'Printing' as const, printFailureReason: undefined });
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, updatedStains) };
}

/** Real, records the real, final outcome of a dispatch attempt —
 *  printedAt/printedBy on success, printFailureReason on failure.
 *  Never throws; the caller decides what a failure means for the
 *  rest of a batch run (stop vs. continue). */
export function markStainPrintResult(
  specimen: Specimen,
  blockId: string,
  stainId: string,
  // Real, per this codebase's own established gotcha (see
  // services/reports/README.md — "a real, found-and-fixed TypeScript
  // gotcha worth remembering"): this project's tsconfig has
  // strictNullChecks: false, under which a discriminated union
  // (`{ok: true} | {ok: false; message: string}`) doesn't reliably
  // narrow on `if (result.ok)`. Using the same fix already established
  // there — a single shape with an optional field — rather than
  // discrimination.
  result: { ok: boolean; message?: string },
  actor: string,
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const updatedStains = block.stains.map(s => {
    if (s.id !== stainId) return s;
    if (result.ok) {
      return { ...s, printStatus: 'Printed' as const, printedAt: new Date().toISOString(), printedBy: actor, printFailureReason: undefined };
    }
    return { ...s, printStatus: 'Failed' as const, printFailureReason: result.message ?? 'Print failed.' };
  });
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, updatedStains) };
}

/** Real, per the spec's own "dedicated Reprint button requiring
 *  single-tap reason selection... for duplicate-label auditing."
 *  Resets printStatus to 'Pending' so the real dispatch path picks it
 *  straight back up (computeNextUnprintedStain, or a direct
 *  print-this-row action) — reprintCount is the real, cumulative
 *  audit trail, never cleared. */
export function reprintMicrotomyStain(
  specimen: Specimen,
  blockId: string,
  stainId: string,
  reason: typeof MICROTOMY_REPRINT_REASONS[number],
  actor: string,
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const stain = block.stains.find(s => s.id === stainId);
  if (!stain) return { ok: false, error: 'Stain not found.' };
  const updatedStains = block.stains.map(s => s.id !== stainId ? s : {
    ...s,
    printStatus: 'Pending' as const,
    printFailureReason: undefined,
    lastReprintReason: reason,
    lastReprintOrderedBy: actor,
    lastReprintOrderedAt: new Date().toISOString(),
    reprintCount: (s.reprintCount ?? 0) + 1,
  });
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, updatedStains) };
}

/** Real, per the spec's own "drag-and-drop slide re-ordering before
 *  firing batch jobs." `orderedStainIds` is the caller's own real,
 *  already-reordered id list (e.g. from a drag handler) — any id not
 *  present is dropped defensively rather than silently duplicated. */
export function reorderBlockStains(specimen: Specimen, blockId: string, orderedStainIds: string[]): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const byId = new Map(block.stains.map(s => [s.id, s]));
  const reordered = orderedStainIds.map(id => byId.get(id)).filter((s): s is StainOrder => !!s);
  // Real, defensive completeness check — any stain not present in the
  // caller's own reorder list (a real bug, or a stale snapshot) is
  // appended at the end rather than silently dropped from the block.
  const missing = block.stains.filter(s => !orderedStainIds.includes(s.id));
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, [...reordered, ...missing]) };
}

/** Real, per the spec's own Comment Systems: "Slide-level: editable
 *  text per row; toggle for whether a comment prints on the
 *  human-readable label area or stays LIS-only." */
export function updateStainComment(
  specimen: Specimen,
  blockId: string,
  stainId: string,
  text: string,
  printsOnLabel: boolean,
  actor: { id: string; name: string },
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const comment: MaterialComment = { id: genId('comment'), authorId: actor.id, authorName: actor.name, text, createdAt: new Date().toISOString() };
  const updatedStains = block.stains.map(s => s.id !== stainId ? s : { ...s, comments: [...(s.comments ?? []), comment], commentPrintsOnLabel: printsOnLabel });
  return { ok: true, specimen: replaceBlockStains(specimen, blockId, updatedStains) };
}

/** Real, per the spec's own Comment Systems: "Block-level: read/write
 *  grossing notes." Reuses HistologyBlock.comments — already real,
 *  already MaterialComment-typed, no new field needed. */
export function updateBlockComment(
  specimen: Specimen,
  blockId: string,
  text: string,
  actor: { id: string; name: string },
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  const comment: MaterialComment = { id: genId('comment'), authorId: actor.id, authorName: actor.name, text, createdAt: new Date().toISOString() };
  const updatedComments = [...(block.comments ?? []), comment];
  return {
    ok: true,
    specimen: {
      ...specimen,
      blocks: (specimen.blocks ?? []).map(b => b.id !== blockId ? b : { ...b, comments: updatedComments }),
    },
  };
}

/** Real, per the spec's own Block-level "high-contrast alert badges
 *  for Tiny Tissue, Decal Required, Fragile." requiresDecal already
 *  existed; this toggles all three through one real entry point. */
export function setBlockAlertFlags(
  specimen: Specimen,
  blockId: string,
  flags: { tinyTissue?: boolean; fragile?: boolean; requiresDecal?: boolean },
): MicrotomyOperationResult {
  const block = findBlock(specimen, blockId);
  if (!block) return { ok: false, error: 'Block not found.' };
  return {
    ok: true,
    specimen: {
      ...specimen,
      blocks: (specimen.blocks ?? []).map(b => b.id !== blockId ? b : { ...b, ...flags }),
    },
  };
}

// ── Cytology / Decant panel ─────────────────────────────────────────────────

/** Real, per the spec's own "Specimen Fluid/Decant Panel: Total
 *  Volume (mL), Appearance, Decant Yield/Pellet Size." */
export function updateDecantCytologyFields(
  specimen: Specimen,
  decantId: string,
  fields: { totalVolumeMl?: number; appearance?: Decant['appearance']; yieldPelletSize?: Decant['yieldPelletSize'] },
): MicrotomyOperationResult {
  const decant = findDecant(specimen, decantId);
  if (!decant) return { ok: false, error: 'Decant not found.' };
  return {
    ok: true,
    specimen: {
      ...specimen,
      decants: (specimen.decants ?? []).map(d => d.id !== decantId ? d : { ...d, ...fields }),
    },
  };
}

/** Real, default stain a slide of a given preparation method is cut
 *  for absent a specific tech choice — see this file's own header
 *  reasoning for computeCytologyPrepSuggestions.ts's honest,
 *  illustrative scope. Never enforced; the returned StainOrder rows
 *  go through the exact same StainMultiSelect editing surface as
 *  every other slide afterward, so a tech can change any of these on
 *  the spot. */
function defaultCytologyStainNameFor(method: CytologyPrepSuggestion['preparationMethod']): string {
  switch (method) {
    case 'ThinPrep/Liquid-Based': return 'Pap Smear, Liquid-Based (ThinPrep)';
    case 'Direct Smear (Air-Dried)': return 'Diff-Quik / Wright-Giemsa';
    case 'Direct Smear (Fixed)': return 'Pap Smear, Conventional';
    case 'Cytospin': return 'Diff-Quik / Wright-Giemsa';
    case 'Cell Block': return 'H&E';
  }
}

/** Real, per the spec's own Dynamic Preparation Rules — creates the
 *  real StainOrder rows a tech accepted from
 *  computeCytologyPrepSuggestions' own suggestion, one row per unit
 *  of `count`. Never called automatically; the tech's own explicit
 *  "accept suggestion" action in the UI is what invokes this. */
export function applyCytologyPrepSuggestions(
  specimen: Specimen,
  decantId: string,
  suggestions: CytologyPrepSuggestion[],
  fullAccession: string,
): MicrotomyOperationResult {
  const decant = findDecant(specimen, decantId);
  if (!decant) return { ok: false, error: 'Decant not found.' };
  const newStains: StainOrder[] = [];
  let nextLevel = decant.stains.length;
  for (const suggestion of suggestions) {
    for (let i = 0; i < suggestion.count; i++) {
      nextLevel += 1;
      newStains.push({
        id: genId('stain'),
        stainName: defaultCytologyStainNameFor(suggestion.preparationMethod),
        status: 'Pending Cut',
        displayId: slideIdentifier(fullAccession, specimen.label, decant.label, `L${nextLevel}`),
        preparationMethod: suggestion.preparationMethod,
        userAdded: true,
        printStatus: 'Pending',
      });
    }
  }
  return { ok: true, specimen: replaceDecantStains(specimen, decantId, [...decant.stains, ...newStains]) };
}

/** Real, decant-slide equivalent of addMicrotomyStain — a decant's
 *  own slides get the same real Add Stain Quick-Picker, minus the
 *  block-only control-pairing option (a cytology control slide, when
 *  one is genuinely needed, is a separate, real accession-level
 *  concern this app doesn't model yet — not silently faked here). */
export function addDecantStain(
  specimen: Specimen,
  decantId: string,
  stainType: StainType,
  fullAccession: string,
  preparationMethod?: StainOrder['preparationMethod'],
): MicrotomyOperationResult {
  const decant = findDecant(specimen, decantId);
  if (!decant) return { ok: false, error: 'Decant not found.' };
  const newStain: StainOrder = {
    id: genId('stain'),
    stainName: stainType.name,
    status: 'Pending Cut',
    displayId: slideIdentifier(fullAccession, specimen.label, decant.label, `L${decant.stains.length + 1}`),
    userAdded: true,
    preparationMethod,
    printStatus: 'Pending',
  };
  return { ok: true, specimen: replaceDecantStains(specimen, decantId, [...decant.stains, newStain]) };
}

export function removeDecantStain(
  specimen: Specimen,
  decantId: string,
  stainId: string,
  reason?: MicrotomyCancelReason,
): MicrotomyOperationResult {
  const decant = findDecant(specimen, decantId);
  if (!decant) return { ok: false, error: 'Decant not found.' };
  const stain = decant.stains.find(s => s.id === stainId);
  if (!stain) return { ok: false, error: 'Stain not found.' };
  const alreadyPrinted = stain.printStatus === 'Printed' || stain.printStatus === 'Printing';
  if (alreadyPrinted && !reason) return { ok: false, needsReason: true };
  const updatedStains = alreadyPrinted
    ? decant.stains.map(s => s.id !== stainId ? s : { ...s, status: 'Cancelled' as const, printStatus: 'Canceled' as const, printFailureReason: reason })
    : decant.stains.filter(s => s.id !== stainId);
  return { ok: true, specimen: replaceDecantStains(specimen, decantId, updatedStains) };
}
