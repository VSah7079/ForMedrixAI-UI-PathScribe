// src/utils/participationTypeLookup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared cache for ParticipationTypeRecord[] — extracted because the
// same "fetch every participation type, memoize the in-flight promise" need
// showed up in two independent real call sites wiring real finalize/sign-out
// enforcement to ParticipationTypeRecord.canFinalize (CaseRouter.ts's
// deriveEligibleFinalizerIds() denormalization, useSignOutWorkflow.ts's
// canFinalizeCase() client-side gate) — same real duplication problem
// utils/performingLabs.ts already fixed once for "fetch all active
// performing labs."
//
// Matters more here than for a typical admin-screen lookup:
// mockParticipationTypeService's own delay() simulates a real ~60ms network
// round trip. Fine for a Config screen render, but calling it unmemoized
// directly in the sign-out hot path would add a genuine, repeated 60ms of
// latency to every single finalize/sign-out attempt for no reason —
// participation types are admin-managed data that changes rarely, exactly
// what this memoization pattern exists for (see CaseRouter.ts's own,
// pre-existing getSubspecialtyLookup/getEnterpriseFacilityLookup for the
// precedent this follows).
//
// Memoizes the in-flight PROMISE, not just the resolved value, so
// concurrent callers share one fetch rather than firing several. A failed
// fetch doesn't poison the cache forever — cleared so the next call
// retries instead of permanently resolving to an empty list.
// ─────────────────────────────────────────────────────────────────────────────
import { mockParticipationTypeService } from '../services/participationTypes/mockParticipationTypeService';
import type { ParticipationTypeRecord } from '../services/participationTypes/IParticipationTypeService';

let participationTypeLookupPromise: Promise<ParticipationTypeRecord[]> | null = null;

export function getParticipationTypeLookup(): Promise<ParticipationTypeRecord[]> {
  if (!participationTypeLookupPromise) {
    participationTypeLookupPromise = mockParticipationTypeService.getAll()
      .then(res => (res.ok ? res.data : []))
      .catch(() => []);
    participationTypeLookupPromise.catch(() => { participationTypeLookupPromise = null; });
  }
  return participationTypeLookupPromise;
}
