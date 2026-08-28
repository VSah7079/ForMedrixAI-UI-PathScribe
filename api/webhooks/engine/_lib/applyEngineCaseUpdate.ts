// api/webhooks/engine/_lib/applyEngineCaseUpdate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own architectural decision: a dedicated
// system-level write path for a trusted, server-side Engine event,
// separate from caseRouter.updateCase() — which stays exactly as
// restrictive as it already is for real UI clients
// (FirestoreCaseService.ts's own LIS_OWNED_FIELDS guardrail, untouched
// by this file).
//
// Real, deliberate location: NOT a method on FirestoreCaseService.ts.
// That file is a CLIENT-SDK module (firebase/firestore) that
// caseRouter.ts pulls into the actual browser bundle a pathologist's
// app runs. firebase-admin cannot run in a browser at all (Node-only
// APIs, service-account credential handling) and must never enter
// that bundle — putting an Admin-SDK method inside a client-bundled
// file, even one never called from the browser, is a real security
// and build-correctness risk, not just a style preference. This file
// lives under api/ specifically so nothing in src/ can ever import it.
//
// Real, deliberate transactional shape: mirrors
// FirestoreCaseService.updateCase()'s own real compare-and-swap
// pattern (read version inside the transaction, write version + 1) —
// an Engine-applied mutation increments the same real version field a
// concurrent client edit's own optimistic-concurrency check depends
// on. Skipping that increment (a blind .update()) would let a
// pathologist's stale, already-open case tab overwrite the Engine's
// just-applied change without ever seeing a real conflict.
// ─────────────────────────────────────────────────────────────────────────────

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin';
import type { Specimen } from '../../../../src/types/case/Specimen';
import type { MatrixBlock } from '../../../../src/types/case/MatrixBlock';

const COLLECTION_NAME = 'cases';

export type ApplyEngineCaseUpdateOutcome = 'applied' | 'case-not-found' | 'target-not-found';

export interface ApplyEngineCaseUpdateResult {
  outcome: ApplyEngineCaseUpdateOutcome;
  caseId: string;
}

/** Real, discriminated result from a caller's mutate function — exactly
 *  one of the case's two independently-mutable arrays changes per real
 *  event (materialLocationMutation.ts's own matrix_block/matrix_slide
 *  vs everything-else split), never both from one real event. */
export type EngineCaseMutation =
  | { field: 'specimens'; specimens: Specimen[] }
  | { field: 'matrixBlocks'; matrixBlocks: MatrixBlock[] }
  | null;

/**
 * Real, trusted, server-only mutation of a case's specimens or matrix
 * blocks — the Engine-event equivalent of caseRouter.updateCase(),
 * but without that path's real LIS_OWNED_FIELDS guardrail, because
 * this function is never reachable from a UI client in the first
 * place (only ever called from a real, authenticated webhook handler
 * under api/webhooks/engine/).
 *
 * @param caseId  Real Case.id / accession — same lookupId convention
 *                every existing process*Event function already uses.
 * @param mutate  Real, caller-supplied function describing exactly
 *                what changes, given the case's CURRENT specimens and
 *                matrixBlocks (read inside this same transaction, so
 *                it's never stale). Returns null if the real target
 *                this event names doesn't exist on this case — lets
 *                the caller report a real 'target-not-found' outcome
 *                distinctly from 'case-not-found'.
 */
export async function applyEngineCaseUpdate(
  caseId: string,
  mutate: (specimens: Specimen[], matrixBlocks: MatrixBlock[]) => EngineCaseMutation,
): Promise<ApplyEngineCaseUpdateResult> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION_NAME).doc(caseId);

  return db.runTransaction(async (tx): Promise<ApplyEngineCaseUpdateResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { outcome: 'case-not-found', caseId };
    }

    const data = snap.data()!;
    const currentSpecimens: Specimen[] = data.specimens ?? [];
    const currentMatrixBlocks: MatrixBlock[] = data.matrixBlocks ?? [];
    const currentVersion: number = data.version ?? 0;

    const mutation = mutate(currentSpecimens, currentMatrixBlocks);
    if (mutation === null) {
      return { outcome: 'target-not-found', caseId };
    }

    const fieldUpdate = mutation.field === 'specimens'
      ? { specimens: mutation.specimens }
      : { matrixBlocks: mutation.matrixBlocks };

    tx.update(ref, {
      ...fieldUpdate,
      version: currentVersion + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { outcome: 'applied', caseId };
  });
}
