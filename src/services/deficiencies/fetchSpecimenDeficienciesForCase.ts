// src/services/deficiencies/fetchSpecimenDeficienciesForCase.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, read-only companion to mockSpecimenDeficiencyService.ts — reads
// from the real specimen_deficiencies Firestore collection
// raiseSpecimenDeficiency.ts (api/webhooks/engine/_lib/) writes real,
// backend-raised deficiencies into. Deliberately NOT a replacement for
// the mock service: existing client-side raise()/raiseAndResolve()
// call sites (fixative-time gate, tissue discrepancy, pre-analytic
// date gate, dictionary-mismatch) still write to localStorage via
// mockSpecimenDeficiencyService.ts — migrating those is real, separate,
// not-yet-scoped work. This function only reads the NEW, real
// Firestore-backed records (currently: block-exception.ts's own
// def-block-lost/def-block-damaged raises), so QualityAssurancePage.tsx
// does NOT yet show these unless/until it's updated to merge both
// sources — a real, disclosed gap, not silently papered over.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import type { SpecimenDeficiency } from './IDeficiencyService';

const COLLECTION_NAME = 'specimen_deficiencies';

export async function fetchSpecimenDeficienciesForCase(caseId: string): Promise<SpecimenDeficiency[]> {
  const q = query(collection(db, COLLECTION_NAME), where('caseId', '==', caseId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SpecimenDeficiency));
}
