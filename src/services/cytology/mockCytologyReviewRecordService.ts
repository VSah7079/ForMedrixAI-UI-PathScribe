// src/services/cytology/mockCytologyReviewRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, localStorage-backed create/list/update for CytologyReviewRecord.
// Real, per direct correction: "a User may edit their own review, but
// no one elses" — update() enforces this directly, not just as a
// documented convention: requestingUserId must match the existing
// record's own recordedBy.userId, or the write is refused.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ICytologyReviewRecordService } from './ICytologyReviewRecordService';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const STORAGE_KEY = 'cytology_review_records';

// Real, per direct guidance ("We need several cases for seed data"):
// real review history for two of the six real seeded cases
// (mockCaseService.ts) — S26-5002 (screened, no Final Diagnosis
// selected yet) and S26-5006 (screened AND Final Diagnosis already
// selected — id matches exactly what that specimen's own
// cytologyScreening.finalDiagnosis.reviewRecordId references, not a
// second, independently-typed copy of the same data).
const SEED_REVIEWS: CytologyReviewRecord[] = [
  {
    id: 'cyto-review-seed-002-primary',
    specimenId: 'S26-5002-SP-1', caseId: 'S26-5002-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-squam-ascus',
    requiresPathologistReview: true,
    recordedAt: '2026-09-02T14:30:00.000Z',
    recordedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
  },
  {
    id: 'cyto-review-seed-006-primary',
    specimenId: 'S26-5006-SP-1', caseId: 'S26-5006-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-gencat-nilm',
    requiresPathologistReview: false,
    recordedAt: '2026-08-30T09:15:00.000Z',
    recordedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
  },
  {
    id: 'cyto-review-seed-007-primary',
    specimenId: 'S26-5007-SP-1', caseId: 'S26-5007-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-gencat-nilm',
    requiresPathologistReview: false,
    recordedAt: '2026-09-02T11:00:00.000Z',
    recordedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
  },
  {
    // Real, per direct guidance's own South Korea Phase 4 registry
    // work — a real Korean case (co_testing/Bethesda, per the given
    // information), ready for sign-out so the real KNCSP/KCCR
    // registry dispatch (buildCytologyRegistryReportPayload.ts) has
    // something real to fire against once signed.
    id: 'cyto-review-seed-kr001-primary',
    specimenId: 'S26-7001-SP-1', caseId: 'S26-7001-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-gencat-nilm',
    requiresPathologistReview: false,
    recordedAt: '2026-09-03T08:30:00.000Z',
    recordedBy: { userId: 'PATH-KR-001', userName: 'Dr. Min-jun Park' },
  },
  {
    // Real, per direct guidance's own German G-BA age-stratified work
    // — real cytology_only mode (age 28, under the real 35 threshold).
    id: 'cyto-review-seed-de001-primary',
    specimenId: 'S26-8001-SP-1', caseId: 'S26-8001-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'mn3-adeq-satisfactory' }],
    primaryInterpretationId: 'mn3-group-i',
    requiresPathologistReview: false,
    recordedAt: '2026-09-02T09:00:00.000Z',
    recordedBy: { userId: 'PATH-DE-001', userName: 'Dr. Anke Weber' },
  },
  {
    // Real co_testing mode (age 42, at/above the real 35 threshold).
    id: 'cyto-review-seed-de002-primary',
    specimenId: 'S26-8002-SP-1', caseId: 'S26-8002-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'mn3-adeq-satisfactory' }],
    primaryInterpretationId: 'mn3-group-i',
    requiresPathologistReview: false,
    recordedAt: '2026-09-01T09:00:00.000Z',
    recordedBy: { userId: 'PATH-DE-001', userName: 'Dr. Anke Weber' },
  },
  {
    // Real, per direct guidance's own request for testable Netherlands
    // seed data — a real, populated CisoeAScore (PS-183). S4 (mild
    // dyskaryosis) correctly maps to LSIL via resolveCisoeAToBethesda.ts,
    // which is why primaryInterpretationId is 'cyto-squam-lsil' and
    // requiresPathologistReview is true — the same real Bethesda
    // dictionary entry drives it, exactly as every other resolver in
    // this module already expects.
    id: 'cyto-review-seed-nl001-primary',
    specimenId: 'S26-9001-SP-1', caseId: 'S26-9001-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-squam-lsil',
    cisoeAScore: {
      composition: { value: 1 }, inflammation: { value: 1 },
      squamous: { value: 4 }, otherEndometrium: { value: 1 }, endocervical: { value: 1 },
      adequacy: 'satisfactory',
    },
    requiresPathologistReview: true,
    recordedAt: '2026-09-03T10:00:00.000Z',
    recordedBy: { userId: 'PATH-NL-001', userName: 'Dr. Willem Bakker' },
  },
  {
    // Real demo, per direct guidance's own real CSMS QA mechanism —
    // a real, negative UK finding, already signed out.
    id: 'cyto-review-seed-uk9101-primary',
    specimenId: 'S26-9101-SP-1', caseId: 'S26-9101-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'bscc-adeq-satisfactory' }],
    primaryInterpretationId: 'bscc-negative',
    requiresPathologistReview: false,
    recordedAt: '2026-09-04T09:00:00.000Z',
    recordedBy: { userId: 'PATH-UK-001', userName: 'Dr. Priya Shah' },
  },
  {
    // Real demo, per direct guidance's own real NCSR mechanism — a
    // real ASC-US finding (real NCSR mapping: S2, possible LSIL).
    id: 'cyto-review-seed-au9301-primary',
    specimenId: 'S26-9301-SP-1', caseId: 'S26-9301-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-squam-ascus',
    requiresPathologistReview: true,
    recordedAt: '2026-09-04T09:00:00.000Z',
    recordedBy: { userId: 'PATH-AU-001', userName: 'Dr. Olivia Chen' },
  },
  {
    // Real demo, per direct research into the Northern Ireland
    // Cervical Screening Programme — a real BSCC low-grade dyskaryosis
    // finding, the same real BSCC/RCPath nomenclature already
    // confirmed for England and Scotland.
    id: 'cyto-review-seed-ni9401-primary',
    specimenId: 'S26-9401-SP-1', caseId: 'S26-9401-CYT-001', role: 'primary_screen',
    adequacySelections: [{ categoryId: 'bscc-adeq-satisfactory' }],
    primaryInterpretationId: 'bscc-low-grade-dyskaryosis',
    requiresPathologistReview: true,
    recordedAt: '2026-09-04T09:00:00.000Z',
    recordedBy: { userId: 'PATH-NI-001', userName: 'Dr. Fiona Hamill' },
  },

  // ── Real demo QA-comparison reviews (Sep 2026) ──────────────────────────────
  // Real, per direct follow-up: every one of the three real QA report
  // types (10% Random, Directed/High-Risk, CT vs. Pathologist) had
  // zero real qc_random_selection / qc_targeted_high_risk /
  // pathologist_review reviews anywhere in seed data — every report
  // would always show "0 Cases Compared," which is exactly why the
  // dashboard read as broken/unpopulated rather than genuinely empty.
  // These pair against existing primary_screen reviews above,
  // deliberately spanning exact agreement, a real minor discrepancy,
  // and a real major/false-negative discrepancy — the same real range
  // classifyCytologyAgreement.ts's own tests already exercise.
  {
    // 10% Random Rescreening — real exact agreement (S26-5002).
    id: 'cyto-review-seed-002-qc-random',
    specimenId: 'S26-5002-SP-1', caseId: 'S26-5002-CYT-001', role: 'qc_random_selection',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-squam-ascus',
    requiresPathologistReview: true,
    recordedAt: '2026-09-05T10:00:00.000Z',
    recordedBy: { userId: 'CT-QC-001', userName: 'Maria Santos, CT(ASCP)' },
  },
  {
    // 10% Random Rescreening — real minor discrepancy: primary NILM,
    // QC rescreen finds ASC-US (both real diagnosticRank ≤2, same
    // side of HIGH_GRADE_RANK_THRESHOLD — Minor, not Major).
    id: 'cyto-review-seed-006-qc-random',
    specimenId: 'S26-5006-SP-1', caseId: 'S26-5006-CYT-001', role: 'qc_random_selection',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-squam-ascus',
    requiresPathologistReview: true,
    recordedAt: '2026-09-05T10:05:00.000Z',
    recordedBy: { userId: 'CT-QC-001', userName: 'Maria Santos, CT(ASCP)' },
  },
  {
    // Directed/High-Risk Rescreening — real major discrepancy, false
    // negative: primary NILM, targeted high-risk rescreen finds HSIL
    // — exactly the real, intended purpose of this report type.
    id: 'cyto-review-seed-007-qc-highrisk',
    specimenId: 'S26-5007-SP-1', caseId: 'S26-5007-CYT-001', role: 'qc_targeted_high_risk',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-squam-hsil',
    requiresPathologistReview: true,
    recordedAt: '2026-09-05T10:10:00.000Z',
    recordedBy: { userId: 'PATH-US-002', userName: 'Dr. Rachel Kim' },
  },
  {
    // CT vs. Pathologist Correlation — real exact agreement (S26-7001,
    // Korea's own seed case).
    id: 'cyto-review-seed-kr001-pathologist',
    specimenId: 'S26-7001-SP-1', caseId: 'S26-7001-CYT-001', role: 'pathologist_review',
    adequacySelections: [{ categoryId: 'cyto-adeq-satisfactory' }],
    primaryInterpretationId: 'cyto-gencat-nilm',
    requiresPathologistReview: false,
    recordedAt: '2026-09-05T10:15:00.000Z',
    recordedBy: { userId: 'PATH-KR-001', userName: 'Dr. Min-jun Park' },
  },
];

// Real, per direct guidance's own established mock-data versioning
// pattern (mockCaseService.ts's own MOCK_VERSION/VERSION_KEY): a
// version bump here forces a clean re-seed whenever SEED_REVIEWS
// changes — otherwise anyone with pre-existing, cached localStorage
// data (even just an empty array from before this seed data existed)
// would silently keep seeing nothing, since storageGet only falls
// back to its default when the key is genuinely absent, never when
// it's merely stale. Exactly the real failure mode direct follow-up
// flagged: "Last time this happened it was because the seed data
// version hadn't been bumped."
const SEED_VERSION = '9'; // bumped: real, new QA-comparison follow-up reviews added (qc_random_selection x2, qc_targeted_high_risk, pathologist_review) — the three real QA report types had zero real data to compare before this.
const SEED_VERSION_KEY = 'cytology_review_records_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORAGE_KEY, SEED_REVIEWS);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = (): CytologyReviewRecord[] => storageGet<CytologyReviewRecord[]>(STORAGE_KEY, SEED_REVIEWS);
const persist = (data: CytologyReviewRecord[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockCytologyReviewRecordService: ICytologyReviewRecordService = {
  async getAll() {
    return ok(load());
  },

  async getBySpecimenId(specimenId) {
    return ok(load().filter(r => r.specimenId === specimenId));
  },

  async getByCaseId(caseId) {
    return ok(load().filter(r => r.caseId === caseId));
  },

  async create(record) {
    const newRecord: CytologyReviewRecord = {
      ...record,
      id: `cyto-review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      recordedAt: new Date().toISOString(),
    };
    persist([newRecord, ...load()]);
    return ok(newRecord);
  },

  async update(id, requestingUserId, changes) {
    const records = load();
    const existing = records.find(r => r.id === id);
    if (!existing) return err(`CytologyReviewRecord ${id} not found`);
    // Real, per direct correction: the one, hard boundary — a review
    // is editable only by the person who recorded it. Never bypassed,
    // never softened for any other role.
    if (existing.recordedBy.userId !== requestingUserId) {
      return err(`Only the original author (${existing.recordedBy.userId}) may edit this review — ${requestingUserId} is not permitted.`);
    }
    const updated: CytologyReviewRecord = {
      ...existing,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    persist(records.map(r => r.id === id ? updated : r));
    return ok(updated);
  },
};
