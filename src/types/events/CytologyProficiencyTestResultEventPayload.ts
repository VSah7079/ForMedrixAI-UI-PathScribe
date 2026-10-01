// src/types/events/CytologyProficiencyTestResultEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a real
// external proficiency-testing provider's own graded score — the
// direct inbound mirror of HpvResultEventPayload.ts's own,
// already-established philosophy: "PathScribe publishes/ingests its
// own specification; the real interface engine owns translating the
// provider's own real response (CAP's e-LAB Solutions Suite,
// RCPAQAP's myQAP, etc.) into this shape." Confirmed with real,
// current research before designing this (CAP's own official
// documentation): "CAP evaluates submitted results against the
// assigned/consensus value... and returns individual laboratory
// scores alongside participant-group summary statistics." PathScribe
// never computes or stores the real, known answer itself — the real
// provider is the sole real source of the grade, and this payload is
// PathScribe's own real, honest record of what that provider actually
// said, nothing more.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyProficiencyTestResultEventPayload {
  // 1. Transaction traceability — same real fields/reasoning as
  // HpvResultEventPayload's own messageId/timestamp.
  messageId: string;
  timestamp: string;

  // 2. Tenant & physical location hierarchy — identical shape to
  // HpvResultEventPayload's own fields.
  organisationId: string;
  siteId?: string;

  // 3. Canonical domain keys — resolves to the real, accessioned PT
  // case this graded challenge belongs to.
  internalCaseId?: string;
  accessionNumber: string;

  // 4. The real challenge this grade is for, matching the real
  // proficiencyTestContext already recorded on the case at
  // accessioning — validated against it on ingest (see
  // processInboundCytologyProficiencyTestResultEvent.ts), never
  // trusted blindly.
  provider: string;
  challengeReferenceId: string;

  /** Real, per this file's own header — the real, external
   *  provider's own real grading outcome. `'satisfactory'`/
   *  `'unsatisfactory'` are real, standard CLIA PT terms, confirmed
   *  directly (42 CFR § 493 PT requirements; most analytes require
   *  ≥80% correct per event to be satisfactory) — not invented for
   *  this payload. `'no_response'` is kept as its own, real, distinct
   *  category rather than folded into `'unsatisfactory'`: a real,
   *  non-submission is confirmed to score 0% for the event, a
   *  genuinely different real situation from a graded, incorrect
   *  response. */
  outcome: 'satisfactory' | 'unsatisfactory' | 'no_response';
  /** Real, optional — the real provider's own free-text score/grade
   *  detail, exactly as it sends it (e.g. "Pass — Concordant",
   *  "Fail — Major discordance: HSIL vs LSIL"), never PathScribe's
   *  own interpretation of what the grade "should" mean. */
  scoreDetail?: string;
  /** Real, optional — the real, correct answer, only ever present
   *  because the provider itself is now disclosing it as real
   *  feedback after grading — never PathScribe's own, pre-existing
   *  knowledge. Free text, matching scoreDetail's own convention. */
  expectedAnswer?: string;
}
