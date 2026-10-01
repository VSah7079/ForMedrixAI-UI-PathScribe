// src/services/quality/applySurgicalPostSignOutQa.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, end-to-end integration tests through the actual
// caseRouter/mockIntraoperativeService/mockSpecimenDictionaryService/
// mockSurgicalPeerReviewRiskWeightService stack — same real "seed
// through the real services, exercise the real function, read back
// through the real services" convention as
// mockReportReleaseService.test.ts, not a heavily-mocked unit test.
// The underlying pure logic (targeted-signal evaluation, weighted
// sampling math, site-match candidate resolution) already has its own
// dedicated, exhaustive unit tests elsewhere in this session
// (resolveQaCaseSelectionContext.test.ts,
// resolveSurgicalPeerReviewSelectionForCase.test.ts,
// resolveSurgicalBiopsyToResectionCorrelationCandidates.test.ts) — this
// file's real job is proving the ORCHESTRATION actually wires them
// together and persists the result, not re-proving the math.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Case } from '@/types/case/Case';
import type { IntraoperativeEntry } from '@/types/intraop/IntraoperativeEntry';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { caseRouter } = await import('../cases/CaseRouter');
const { storageSet } = await import('../mockStorage');
const { mockSurgicalPeerReviewRiskWeightService } = await import('./mockSurgicalPeerReviewRiskWeightService');
const { applySurgicalPostSignOutQa } = await import('./applySurgicalPostSignOutQa');

let counter = 0;
function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function makeIntraopEntry(overrides: Partial<IntraoperativeEntry> = {}): IntraoperativeEntry {
  return {
    id: makeId('intraop'),
    patientMatch: { source: 'barcode', patientName: 'Test Patient', mrn: 'MRN-1', confirmedAt: '2026-01-01T00:00:00.000Z' },
    performedBy: { userId: 'u1', userName: 'Dr. Test' },
    orNumber: 'OR-1',
    surgeon: 'Dr. Surgeon',
    specimens: [],
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as IntraoperativeEntry;
}

async function seedCase(overrides: Partial<Case> & { id: string }): Promise<string> {
  await caseRouter.createCase({
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'in-progress',
    participants: [],
    synopticReports: [],
    specimens: [],
    order: { priority: 'Routine' },
    patient: { id: makeId('patient'), mrn: 'MRN-X', firstName: 'Test', lastName: 'Patient', dateOfBirth: '1980-01-01' },
    ...overrides,
  } as unknown as Case);
  return overrides.id;
}

describe('applySurgicalPostSignOutQa', () => {
  afterEach(() => vi.restoreAllMocks());

  it('flags the case as targeted when a merged intraop session has a real, non-deferred frozen category', async () => {
    const caseId = makeId('S26-SURGQA-T');
    await seedCase({
      id: caseId,
      specimens: [{ id: 'sp1', label: 'A', description: 'Breast core' } as any],
    });
    storageSet('intraop_entries', [
      makeIntraopEntry({
        mergedIntoCaseId: caseId,
        status: 'merged',
        specimens: [{ id: 's1', specimenLabel: 'A', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [], frozenCategory: 'malignant' } as any],
      }),
    ]);

    await applySurgicalPostSignOutQa(caseId);

    const updated = await caseRouter.getCase(caseId);
    expect(updated?.specimens?.[0]?.surgicalPeerReview?.postSignOutPeerReviewFlag?.reason).toBe('targeted_high_risk');
  });

  it('never re-flags a case that already carries a real postSignOutPeerReviewFlag, even when it would otherwise be re-selected', async () => {
    const caseId = makeId('S26-SURGQA-IDEMPOTENT');
    await seedCase({
      id: caseId,
      specimens: [{
        id: 'sp1', label: 'A', description: 'Colon',
        surgicalPeerReview: { postSignOutPeerReviewFlag: { reason: 'random_selection', flaggedAt: '2020-01-01T00:00:00.000Z' } },
      } as any],
    });
    storageSet('intraop_entries', [
      makeIntraopEntry({
        mergedIntoCaseId: caseId,
        status: 'merged',
        specimens: [{ id: 's1', specimenLabel: 'A', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [], frozenCategory: 'malignant' } as any],
      }),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await applySurgicalPostSignOutQa(caseId);

    const updated = await caseRouter.getCase(caseId);
    expect(updated?.specimens?.[0]?.surgicalPeerReview?.postSignOutPeerReviewFlag?.flaggedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('applies a real, configured subspecialty risk weight — the same random draw selects a weighted case but misses an unweighted one', async () => {
    const weightedSubspecialty = makeId('sub-weighted');
    const unweightedSubspecialty = makeId('sub-unweighted');
    await mockSurgicalPeerReviewRiskWeightService.setWeight(weightedSubspecialty, 3, 'tester');

    const weightedCaseId = makeId('S26-SURGQA-WEIGHTED');
    const unweightedCaseId = makeId('S26-SURGQA-UNWEIGHTED');
    await seedCase({ id: weightedCaseId, subspecialtyId: weightedSubspecialty, specimens: [{ id: 'sp1', label: 'A', description: 'GI' } as any] });
    await seedCase({ id: unweightedCaseId, subspecialtyId: unweightedSubspecialty, specimens: [{ id: 'sp1', label: 'A', description: 'GI' } as any] });

    // Base rate is the real, seeded 10%. 3x weighting -> 30% effective.
    // A draw of 0.25 (25%) hits the weighted 30% but misses the flat 10%.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    await applySurgicalPostSignOutQa(weightedCaseId);
    await applySurgicalPostSignOutQa(unweightedCaseId);

    const weightedCase = await caseRouter.getCase(weightedCaseId);
    const unweightedCase = await caseRouter.getCase(unweightedCaseId);
    expect(weightedCase?.specimens?.[0]?.surgicalPeerReview?.postSignOutPeerReviewFlag?.reason).toBe('random_selection');
    expect(unweightedCase?.specimens?.[0]?.surgicalPeerReview?.postSignOutPeerReviewFlag).toBeUndefined();
  });

  it('detects a real biopsy-to-resection correlation candidate across two same-patient surgical cases and records it on the later case\'s own specimen', async () => {
    const patientId = makeId('patient-correlation');
    const earlierCaseId = makeId('S26-SURGQA-BIOPSY');
    const laterCaseId = makeId('S26-SURGQA-RESECTION');
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // never randomly selected for peer review — isolates this test to correlation only

    await seedCase({
      id: earlierCaseId,
      patient: { id: patientId, mrn: 'MRN-CORR', firstName: 'Corr', lastName: 'Elation', dateOfBirth: '1980-01-01' } as any,
      specimens: [{ id: 'sp-biopsy', label: 'A', description: 'Breast biopsy', receivedAt: '2026-01-01T00:00:00.000Z', collection: { bodySite: 'Breast', laterality: 'Left' } } as any],
    });
    await seedCase({
      id: laterCaseId,
      patient: { id: patientId, mrn: 'MRN-CORR', firstName: 'Corr', lastName: 'Elation', dateOfBirth: '1980-01-01' } as any,
      specimens: [{ id: 'sp-resection', label: 'A', description: 'Breast resection', receivedAt: '2026-02-01T00:00:00.000Z', collection: { bodySite: 'Breast', laterality: 'Left' } } as any],
    });

    await applySurgicalPostSignOutQa(laterCaseId);

    const updatedLater = await caseRouter.getCase(laterCaseId);
    const candidates = updatedLater?.specimens?.[0]?.surgicalPeerReview?.biopsyToResectionCandidates ?? [];
    expect(candidates).toHaveLength(1);
    expect(candidates[0].candidateCaseId).toBe(earlierCaseId);
    expect(candidates[0].candidateSpecimenId).toBe('sp-biopsy');
    expect(candidates[0].siteMatchStatus).toBe('matched');
  });

  it('never treats a Cytology-dictionary specimen as a surgical biopsy-to-resection candidate source', async () => {
    const patientId = makeId('patient-cyto-excl');
    const cytoCaseId = makeId('S26-SURGQA-CYTO');
    const otherCaseId = makeId('S26-SURGQA-OTHER');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await seedCase({
      id: otherCaseId,
      patient: { id: patientId, mrn: 'MRN-CYTOEXCL', firstName: 'Cy', lastName: 'Exclude', dateOfBirth: '1980-01-01' } as any,
      specimens: [{ id: 'sp-other', label: 'A', description: 'Breast biopsy', receivedAt: '2026-01-01T00:00:00.000Z', collection: { bodySite: 'Cervix' } } as any],
    });
    await seedCase({
      id: cytoCaseId,
      patient: { id: patientId, mrn: 'MRN-CYTOEXCL', firstName: 'Cy', lastName: 'Exclude', dateOfBirth: '1980-01-01' } as any,
      specimens: [{ id: 'sp-pap', label: 'A', description: 'Pap smear', specimenDictionaryEntryId: 'sp-cyto-pap', receivedAt: '2026-01-15T00:00:00.000Z', collection: { bodySite: 'Cervix' } } as any],
    });

    await applySurgicalPostSignOutQa(cytoCaseId);

    const updatedCyto = await caseRouter.getCase(cytoCaseId);
    expect(updatedCyto?.specimens?.[0]?.surgicalPeerReview?.biopsyToResectionCandidates ?? []).toHaveLength(0);
  });
});
