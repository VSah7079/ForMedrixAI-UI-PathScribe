// src/services/deficiencies/fetchGlobalDeficiencies.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own corrected design: the global CAPA
// queue QualityAssurancePage.tsx's Operations/CAPA Engine pillars need
// — every real, still-open deficiency across every case, not one
// case's own history (that's fetchSpecimenDeficienciesForCase.ts's
// own, narrower job).
//
// Real, deliberate query shape, corrected against the actual
// SpecimenDeficiency.status union ('open' | 'pending-verification' |
// 'closed' — never 'contained'/'investigating', which aren't real
// values): filters to the two real, still-actionable statuses,
// ordered by the real raisedAt field (not createdAt, which doesn't
// exist on this type).
//
// Real, deliberate top-level collection, not a collection group or a
// cases/{caseId} subcollection — matches raiseSpecimenDeficiency.ts's
// own real write target (db.collection('specimen_deficiencies')), the
// only real writer today.
//
// Real, disclosed operational step: combining a status 'in' filter
// with orderBy on a different field (raisedAt) will need a real
// Firestore composite index the first time this runs against a real
// project — same real, one-time setup Firestore itself prompts for
// with a direct console link, not a bug (same real note already
// applied to usePendingEngineNotifications.ts's own query).
// ─────────────────────────────────────────────────────────────────────────────

import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import type { SpecimenDeficiency } from './IDeficiencyService';

const COLLECTION_NAME = 'specimen_deficiencies';
const DEFAULT_LIMIT = 100;

/**
 * Real, cross-case, still-open CAPA queue — every SpecimenDeficiency
 * whose status is 'open' or 'pending-verification', newest first.
 * Real, deliberate default cap (100) — a genuinely unbounded global
 * query is the one real risk Pete's own original proposal flagged
 * (per-case history has no such concern — a real case is naturally
 * bounded — but a global, cross-case queue is not).
 */
export async function fetchGlobalDeficiencies(limitCount: number = DEFAULT_LIMIT): Promise<SpecimenDeficiency[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('status', 'in', ['open', 'pending-verification']),
    orderBy('raisedAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SpecimenDeficiency));
}
