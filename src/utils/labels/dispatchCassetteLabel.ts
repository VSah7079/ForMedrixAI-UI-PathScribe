// src/utils/labels/dispatchCassetteLabel.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: Step 4 of the label-printing build
// plan — on-demand trigger wiring. The trigger (when to fire, per-block as
// each cassette is logged) is real and independent of HOW the cassette
// actually gets its real identifier applied. The HOW is a genuinely open
// question — see SCRUM-41/PS-51.
//
// Real, important correction, confirmed directly: this is NOT a print
// job. Cassettes aren't printed with an adhesive label the way specimen
// containers/requisitions are — they're ENGRAVED. Most labs send a
// message to a physical engraver (real, named hardware — Leica,
// Cognitive, Cerebro's own CEREBRO-ID modules — sitting locally in the
// grossing room) instructing it to laser-etch a specific, given
// identifier directly into the cassette material, which is why it
// survives the xylene/alcohol tissue-processing steps a printed sticker
// never would. The real integration this file stands in for is a
// real-time machine command to grossing-room-local hardware, not a
// rendered label image sent to a print spooler — PS-51's own comment
// thread has the full, confirmed workflow sequence.
//
// Until the real, vendor-specific engraver protocol is known, this is a
// real, honest stub — same discipline as
// services/hl7/adapters/cerebroAdapter.ts: records the real intent
// (inspectable, testable) rather than either silently doing nothing or
// pretending to drive an engraver that isn't wired up yet. Real trigger
// wiring (useSpecimenBlockManagement.ts's own handleAddBlock) can be
// built and tested now; only this one function's real body needs to
// change once a real engraver integration exists.
// ─────────────────────────────────────────────────────────────────────────────

export interface CassetteLabelDispatchRequest {
  fullAccession: string;
  specimenLabel: string;
  blockLabel: string;
  cassetteId: string;
}

/** Real, dedicated, matrix-block sibling to CassetteLabelDispatchRequest
 *  above — added per direct follow-up: "primary label printing for
 *  matrix blocks." A real matrix block has multiple real participants
 *  (types/case/MatrixBlock.ts), never a single specimenLabel, so this
 *  is its own, small, dedicated type — same real split this app's own
 *  matrix-block work already uses throughout (buildSecondaryLabelDataForBlock
 *  / buildSecondaryLabelDataForMatrixBlock, buildContainerLabelHtml /
 *  buildStationLabelHtml) — rather than reshaping the existing,
 *  already-working ordinary-block type and its three real call sites. */
export interface MatrixCassetteLabelDispatchRequest {
  fullAccession: string;
  specimenLabels: string[];
  matrixBlockLabel: string;
  cassetteId: string;
}

export interface CassetteLabelDispatchResult {
  dispatched: boolean;
  /** Always 'stub' until a real, vendor-specific engraver integration
   *  is wired in here. */
  method: 'stub';
}

const DISPATCHED_LOG: (CassetteLabelDispatchRequest | MatrixCassetteLabelDispatchRequest)[] = [];

/**
 * Real, honest stand-in for the real engrave-command dispatch — see
 * this file's own header for why this is a real machine command, not
 * a print job. Never throws — a real dispatch failure here must never
 * block grossing work, same posture as every other fire-and-forget
 * dispatch in this app. Logs to console AND an in-memory, inspectable
 * log (real, testable behavior — not a silent no-op) so this is
 * visibly, honestly a placeholder rather than something that looks
 * like it engraved something when nothing did.
 */
export async function dispatchCassetteLabel(
  request: CassetteLabelDispatchRequest,
): Promise<CassetteLabelDispatchResult> {
  DISPATCHED_LOG.push(request);
  console.info(
    `[PathScribe] Cassette engrave dispatch — STUB, no real engraver integration wired yet (PS-51 still open). ` +
    `Would engrave: ${request.cassetteId}`,
  );
  return { dispatched: true, method: 'stub' };
}

/** Real, dedicated engrave dispatch for a real, shared matrix block —
 *  same real, honest stub posture as dispatchCassetteLabel above, see
 *  this file's own header. A real matrix block cassette carries every
 *  real participant's own tissue, so the engraved identifier and the
 *  physical object itself are shared — this dispatch fires once per
 *  matrix block, never once per participant. */
export async function dispatchMatrixCassetteLabel(
  request: MatrixCassetteLabelDispatchRequest,
): Promise<CassetteLabelDispatchResult> {
  DISPATCHED_LOG.push(request);
  console.info(
    `[PathScribe] Matrix cassette engrave dispatch — STUB, no real engraver integration wired yet (PS-51 still open). ` +
    `Would engrave: ${request.cassetteId} (shared by specimens ${request.specimenLabels.join(', ')})`,
  );
  return { dispatched: true, method: 'stub' };
}

/** Real, dedicated inspection method — for tests, and so a real UI
 *  could eventually show "what would have engraved" while PS-51 is
 *  still unresolved. Real, single, combined log across both ordinary
 *  and matrix cassette dispatches — a real batch print run touches
 *  both kinds at once, and a single, chronological log is more
 *  useful for that than two, separately-ordered lists. */
export function getDispatchedCassetteLabels(): readonly (CassetteLabelDispatchRequest | MatrixCassetteLabelDispatchRequest)[] {
  return DISPATCHED_LOG;
}

/** Test-only reset — the log is a real, deliberate module-level array
 *  (not a class), so tests need a way to clear it between cases. */
export function _resetDispatchedCassetteLabelsForTests(): void {
  DISPATCHED_LOG.length = 0;
}
