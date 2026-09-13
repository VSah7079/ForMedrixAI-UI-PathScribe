// src/services/cytology/mockCytologyProficiencyTestResultService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance on APAC-QA-01 — synthetic seed data so the
// report can actually be demoed. Every value below is invented for
// this purpose, matching this app's own established synthetic-seed
// convention. Real, deliberate mix, not arbitrary filler: one
// satisfactory, one unsatisfactory (a real, named discordance, per
// CAP's own real, standard scoring language), and one no_response —
// an all-satisfactory dataset would never demonstrate what this
// report actually exists to catch.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ICytologyProficiencyTestResultService, CytologyProficiencyTestResult } from './ICytologyProficiencyTestResultService';

const STORE_KEY = 'cytology_proficiency_test_results';
const ok = <T>(data: T) => ({ ok: true as const, data });
const delay = () => new Promise(res => setTimeout(res, 30));

const SEED: CytologyProficiencyTestResult[] = [
  {
    id: 'cpt-001', caseId: 'S26-PT001-CYT-001', accessionNumber: 'S26-PT001-CYT-001',
    provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-03',
    outcome: 'satisfactory', scoreDetail: 'Concordant — HSIL correctly identified.',
    receivedAt: '2026-08-20T14:00:00.000Z',
  },
  {
    id: 'cpt-002', caseId: 'S26-PT002-CYT-001', accessionNumber: 'S26-PT002-CYT-001',
    provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-07',
    outcome: 'unsatisfactory', scoreDetail: 'Discordant — reported LSIL, reference value HSIL.',
    expectedAnswer: 'HSIL',
    receivedAt: '2026-08-20T14:00:00.000Z',
  },
  {
    id: 'cpt-003', caseId: 'S26-PT003-CYT-001', accessionNumber: 'S26-PT003-CYT-001',
    provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-B-02',
    outcome: 'no_response', scoreDetail: 'No result received by the survey deadline — scored 0% for this event.',
    receivedAt: '2026-09-01T14:00:00.000Z',
  },
];

const load = (): CytologyProficiencyTestResult[] => storageGet(STORE_KEY, SEED);
const persist = (data: CytologyProficiencyTestResult[]) => storageSet(STORE_KEY, data);

export const mockCytologyProficiencyTestResultService: ICytologyProficiencyTestResultService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async add(result) {
    await delay();
    const created: CytologyProficiencyTestResult = { ...result, id: 'CPT_' + Date.now() };
    const all = load();
    persist([...all, created]);
    return ok(created);
  },
};
