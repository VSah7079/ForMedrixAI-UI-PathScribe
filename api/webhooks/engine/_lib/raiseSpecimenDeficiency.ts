// api/webhooks/engine/_lib/raiseSpecimenDeficiency.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own decision: the first piece of the
// real, Firestore-backed CAPA foundation — a backend-only equivalent
// of ISpecimenDeficiencyService.raise() (src/services/deficiencies/
// IDeficiencyService.ts), reachable from a real webhook the way the
// client-only mockSpecimenDeficiencyService.ts never can be (same real
// "localStorage-backed, unreachable from Node" gap already found and
// fixed once for case mutations via applyEngineCaseUpdate.ts).
//
// Real, deliberate scope: only raise() — no resolve/containImmediately/
// verifyEffectiveness/raiseAndResolve/markReviewed here. Those are
// real, legitimate CLIENT actions (a QA reviewer working through the
// UI), not something a webhook ever needs to do, and building real,
// auth-gated backend endpoints for all of them is a genuinely separate
// scope question — not decided yet, see this session's own open flag
// on it.
//
// Real, deliberate simplicity vs applyEngineCaseUpdate.ts: no
// transaction needed here. Raising a deficiency creates a brand-new,
// independent document — there's no existing state to read-compare-
// write against the way a case mutation or an engraver status upsert
// has.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from './firebaseAdmin';

const COLLECTION_NAME = 'specimen_deficiencies';

export interface RaiseSpecimenDeficiencyInput {
  caseId: string;
  organisationId?: string;
  siteId?: string;
  specimenId?: string;
  specimenLabel?: string;
  deficiencyTypeId: string;
  comment?: string;
  /** 'system' for a real, Engine-triggered deficiency like this one —
   *  same real convention SpecimenDeficiency.raisedBy's own doc
   *  comment already establishes ("'system' for auto-detected
   *  deficiencies... vs a user id if a person raised it manually"). */
  raisedBy: string;
}

/**
 * Raises a real, open SpecimenDeficiency — same real shape and 'open'
 * starting status ISpecimenDeficiencyService.raise() already produces
 * client-side, just reachable from a real backend webhook instead.
 * Returns the new document's real id.
 */
export async function raiseSpecimenDeficiency(input: RaiseSpecimenDeficiencyInput): Promise<string> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION_NAME).doc();
  await ref.set({
    ...input,
    status: 'open',
    raisedAt: new Date().toISOString(),
  });
  return ref.id;
}
