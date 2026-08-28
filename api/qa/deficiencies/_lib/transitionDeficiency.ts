// api/qa/deficiencies/_lib/transitionDeficiency.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared transactional guard for every real status transition
// (contain, resolve, verify) — the fourth real action,
// raise-and-resolve, creates a brand-new document instead and doesn't
// use this (same real distinction raiseSpecimenDeficiency.ts's own
// header already draws for the raise() case).
//
// Real, deliberate design: mirrors applyEngineCaseUpdate.ts's own
// callback-based shape (read current state inside a real transaction,
// let the caller compute the real update from it) rather than a fixed
// update object — verify.ts specifically needs this, since a real
// reopenCount increment depends on the document's own current value,
// not a static payload.
//
// Real, deliberate guard: checks the document's own CURRENT status is
// one of the real, expected starting states before ever writing —
// this is what stops a double-click, a stale browser tab, or two
// reviewers racing on the same record from silently corrupting a real
// CAPA record's own lifecycle (e.g. "resolving" an already-closed
// deficiency a second time).
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from '../../../webhooks/engine/_lib/firebaseAdmin';

const COLLECTION_NAME = 'specimen_deficiencies';

export type TransitionOutcome = 'applied' | 'not-found' | 'wrong-status';

export interface TransitionResult {
  outcome: TransitionOutcome;
  /** Real, only meaningful on a 'wrong-status' outcome — the actual
   *  current status found, so a caller/response can explain precisely
   *  why the transition was refused rather than a generic error. */
  actualStatus?: string;
}

export async function transitionDeficiency(
  deficiencyId: string,
  expectedStatuses: string[],
  computeUpdates: (current: FirebaseFirestore.DocumentData) => Record<string, unknown>,
): Promise<TransitionResult> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION_NAME).doc(deficiencyId);

  return db.runTransaction(async (tx): Promise<TransitionResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { outcome: 'not-found' };
    }

    const current = snap.data()!;
    if (!expectedStatuses.includes(current.status)) {
      return { outcome: 'wrong-status', actualStatus: current.status };
    }

    const updates = computeUpdates(current);
    tx.update(ref, updates);
    return { outcome: 'applied' };
  });
}
