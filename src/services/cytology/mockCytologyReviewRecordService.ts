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
const SEED_VERSION = '3'; // bumped: real, new Korean seed review (cyto-review-seed-kr001-primary) added for the South Korea Phase 4 registry work — stale cached data on version '2' would be missing it entirely.
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
