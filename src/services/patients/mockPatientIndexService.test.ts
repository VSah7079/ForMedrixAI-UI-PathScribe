// src/services/patients/mockPatientIndexService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Real, working in-memory localStorage stub — this test environment is
// plain Node, no browser storage natively available.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { mockPatientIndexService } = await import('./mockPatientIndexService');

const ORG_A = 'ORG-DVMC';
const ORG_B = 'ORG-MFT';

function candidate(overrides: Partial<{ organisationId: string; mrn: string; assigningAuthority: string; firstName: string; lastName: string; dateOfBirth: string; sourceAccession: string; isDowntimeRecord: boolean; downtimeReasonCode: string }> = {}) {
  return {
    organisationId: ORG_A,
    mrn: '100002',
    firstName: 'Robert',
    lastName: 'Jackson',
    dateOfBirth: '1958-03-14',
    sourceAccession: 'S26-1001-BX-001',
    ...overrides,
  };
}

describe('mockPatientIndexService — real matching behavior', () => {
  beforeEach(() => { store.clear(); });

  it('a genuinely new patient (no match on anything) gets created with a real, persistent id', async () => {
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate());
    expect(result.outcome).toBe('created');
    if (result.outcome === 'created') {
      expect(result.patientId).toMatch(/^MPI-/);
    }
  });

  it('the same person accessioned twice (matching MRN, DOB, and name) reuses the same persistent id — the actual point of an MPI', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const second = await mockPatientIndexService.resolveOrCreatePatient(candidate());
    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('matched');
    if (first.outcome === 'created' && second.outcome === 'matched') {
      expect(second.patientId).toBe(first.patientId);
    }
  });

  it('MRN matches but DOB does not — real ambiguous outcome, never silently merged or silently duplicated', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01' }));
    expect(result.outcome).toBe('ambiguous');
    if (result.outcome === 'ambiguous') {
      expect(result.candidatePatientIds).toHaveLength(1);
      expect(result.reason).toContain('date of birth');
      // Still gets a real, usable id — accessioning can't halt on this
      expect(result.patientId).toMatch(/^MPI-/);
    }
  });

  it('MRN matches but name does not — same real ambiguous handling', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate({ firstName: 'Different', lastName: 'Person' }));
    expect(result.outcome).toBe('ambiguous');
    if (result.outcome === 'ambiguous') expect(result.reason).toContain('name');
  });

  it('name and DOB match but under a different MRN — flagged, not silently treated as a new person', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: '999999' }));
    expect(result.outcome).toBe('ambiguous');
    if (result.outcome === 'ambiguous') expect(result.reason).toContain('different MRN');
  });

  it('a provisional ambiguous-match record is real, persisted, and shows up in the review queue', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01' }));
    expect(ambiguous.outcome).toBe('ambiguous');
    const pending = await mockPatientIndexService.listPendingReview(ORG_A);
    expect(pending).toHaveLength(1);
    if (ambiguous.outcome === 'ambiguous') {
      expect(pending[0].id).toBe(ambiguous.patientId);
      expect(pending[0].needsReview).toBe(true);
    }
  });

  it('the exact same MRN+DOB+name combination in a DIFFERENT organisation is a genuinely separate person — MPI, not EMPI', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate({ organisationId: ORG_A }));
    const second = await mockPatientIndexService.resolveOrCreatePatient(candidate({ organisationId: ORG_B }));
    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('created'); // NOT 'matched' — different org, no cross-tenant matching
    if (first.outcome === 'created' && second.outcome === 'created') {
      expect(second.patientId).not.toBe(first.patientId);
    }
    // And the org-B record must never show up when reviewing org A's queue
    const pendingA = await mockPatientIndexService.listPendingReview(ORG_A);
    expect(pendingA).toHaveLength(0);
  });

  it('name matching is case/whitespace tolerant but not a false positive across genuinely different names', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate({ firstName: 'robert', lastName: '  Jackson  ' }));
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate({ firstName: 'ROBERT', lastName: 'Jackson' }));
    expect(result.outcome).toBe('matched');
  });

  it('getById returns null for an id that was never created, not a throw', async () => {
    const found = await mockPatientIndexService.getById('MPI-nonexistent');
    expect(found).toBeNull();
  });
});

describe('mockPatientIndexService.resolvePatientWithoutMatching — real, per direct guidance (Outside Client Support: "completely bypassing the identity reconciliation queue")', () => {
  it('always creates a genuinely fresh identity, even when an exact MRN+name+DOB match already exists — the whole real point of this method', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-BYPASS-1' }));
    expect(first.outcome).toBe('created');
    if (first.outcome !== 'created') return;

    // A real, exact duplicate of the same demographics — resolveOrCreatePatient
    // would confidently MATCH this to the same real person.
    const result = await mockPatientIndexService.resolvePatientWithoutMatching(candidate({ mrn: 'MRN-BYPASS-1' }));
    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') return;
    expect(result.patientId).not.toBe(first.patientId);
  });

  it('the created record is honestly marked establishedVia "created_unmatched" — distinct from a genuinely-checked new patient', async () => {
    const result = await mockPatientIndexService.resolvePatientWithoutMatching(candidate({ mrn: 'MRN-BYPASS-2' }));
    if (result.outcome !== 'created') throw new Error('setup failed');
    const record = await mockPatientIndexService.getById(result.patientId);
    expect(record?.establishedVia).toBe('created_unmatched');
  });

  it('never returns "matched" or "ambiguous" — always "created", regardless of what real data already exists', async () => {
    // Real, deliberately ambiguous-shaped input against existing data
    // (would trigger a real 'ambiguous' flag via resolveOrCreatePatient) —
    // this method must still just create, honestly, every time.
    await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-BYPASS-3' }));
    const result = await mockPatientIndexService.resolvePatientWithoutMatching(candidate({ mrn: 'MRN-BYPASS-3', dateOfBirth: '1990-01-01' }));
    expect(result.outcome).toBe('created');
  });

  it('still adds a real identifier crosswalk entry when assigningAuthority is provided, same as resolveOrCreatePatient', async () => {
    const result = await mockPatientIndexService.resolvePatientWithoutMatching(candidate({ mrn: 'MRN-BYPASS-4', assigningAuthority: 'OUTSIDE_REFERRING_EMR' }));
    if (result.outcome !== 'created') throw new Error('setup failed');
    const knownId = await mockPatientIndexService.resolveByIdentifier('OUTSIDE_REFERRING_EMR', 'MRN-BYPASS-4');
    expect(knownId).toBe(result.patientId);
  });
});

describe('mockPatientIndexService — real audit trail', () => {
  beforeEach(() => { store.clear(); });

  it('an ambiguous match is audited at the moment it is detected, PHI-safe', async () => {
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01', sourceAccession: 'S26-1002-BX-001' }));
    expect(ambiguous.outcome).toBe('ambiguous');

    const logsRes = await mockAuditService.getAuditLogs({ search: 'mpi.match.ambiguous' } as any);
    expect(logsRes.ok).toBe(true);
    if (!logsRes.ok) return;
    const entries = logsRes.data.filter(l => l.event === 'mpi.match.ambiguous');
    // The audit log's own store isn't reset between tests in this file
    // (it's not backed by the same localStorage stub these tests clear),
    // so earlier tests' ambiguous matches legitimately accumulate here
    // too — at least one real entry for THIS test's match is what
    // matters, not an exact count.
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // PHI-safe: the actual patient name/MRN/DOB must never appear in ANY
    // audit detail, even though they're the exact values used across
    // every test in this file — checking every entry, not just the
    // newest one, is the actually meaningful assertion here.
    entries.forEach(entry => {
      expect(entry.detail).not.toContain('Robert');
      expect(entry.detail).not.toContain('Jackson');
      expect(entry.detail).not.toContain('100002');
    });
    // Real regression test for a genuine bug found via a direct
    // question: caseId must be the real accession number, not null —
    // AuditLogPage.tsx's role filter only shows a pathologist-role user
    // events with a real caseId (or an exact user name/email match), so
    // a null caseId here would make the event invisible to the exact
    // person who accessioned the case that triggered it.
    const own = entries.find(e => e.caseId === 'S26-1002-BX-001');
    expect(own).toBeDefined();
  });

  it('confirmAsNewPatient is audited, PHI-safe, with a real caseId', async () => {
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01', sourceAccession: 'S26-1003-BX-001' }));
    if (ambiguous.outcome !== 'ambiguous') return;

    await mockPatientIndexService.confirmAsNewPatient(ambiguous.patientId);
    const logsRes = await mockAuditService.getAuditLogs({ search: 'mpi.match.confirmed_new' } as any);
    expect(logsRes.ok).toBe(true);
    if (!logsRes.ok) return;
    const entries = logsRes.data.filter(l => l.event === 'mpi.match.confirmed_new');
    const own = entries.find(e => e.detail.includes(ambiguous.patientId));
    expect(own).toBeDefined();
    expect(own?.caseId).toBe('S26-1003-BX-001');
    entries.forEach(entry => expect(entry.detail).not.toContain('Robert'));
  });

  it('mergeIntoExistingPatient is audited with the real repointed-case count, PHI-safe, with a real caseId', async () => {
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate());
    if (first.outcome !== 'created') return;
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01', sourceAccession: 'S26-1004-BX-001' }));
    if (ambiguous.outcome !== 'ambiguous') return;

    await mockPatientIndexService.mergeIntoExistingPatient(ambiguous.patientId, first.patientId);
    const logsRes = await mockAuditService.getAuditLogs({ search: 'mpi.match.merged' } as any);
    expect(logsRes.ok).toBe(true);
    if (!logsRes.ok) return;
    const entries = logsRes.data.filter(l => l.event === 'mpi.match.merged');
    const own = entries.find(e => e.detail.includes(ambiguous.patientId) && e.detail.includes(first.patientId));
    expect(own).toBeDefined();
    expect(own?.caseId).toBe('S26-1004-BX-001');
    entries.forEach(entry => {
      expect(entry.detail).not.toContain('Robert');
      expect(entry.detail).not.toContain('100002');
    });
  });
});

describe('mockPatientIndexService — real resolution actions (confirm / merge)', () => {
  beforeEach(() => { store.clear(); });

  it('confirmAsNewPatient clears the review flag on a real provisional record', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01' }));
    expect(ambiguous.outcome).toBe('ambiguous');
    if (ambiguous.outcome !== 'ambiguous') return;

    await mockPatientIndexService.confirmAsNewPatient(ambiguous.patientId);
    const record = await mockPatientIndexService.getById(ambiguous.patientId);
    expect(record?.needsReview).toBe(false);

    const pending = await mockPatientIndexService.listPendingReview(ORG_A);
    expect(pending).toHaveLength(0);
  });

  it('mergeIntoExistingPatient actually repoints real cases from the provisional id to the confirmed one', async () => {
    const { mockCaseService } = await import('../cases/mockCaseService');

    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate());
    expect(first.outcome).toBe('created');
    if (first.outcome !== 'created') return;
    const confirmedId = first.patientId;

    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01' }));
    expect(ambiguous.outcome).toBe('ambiguous');
    if (ambiguous.outcome !== 'ambiguous') return;
    const provisionalId = ambiguous.patientId;

    // A real case, actually created under the provisional identity —
    // the exact scenario a merge needs to fix, not a mocked stand-in.
    const caseId = 'S26-MPI-TEST-001';
    await mockCaseService.createCase({
      id: caseId,
      status: 'draft',
      patient: { id: provisionalId, mrn: '100002', firstName: 'Robert', lastName: 'Jackson' },
    } as any);

    const result = await mockPatientIndexService.mergeIntoExistingPatient(provisionalId, confirmedId);
    expect(result.casesRepointed).toBe(1);

    const casesRes = await mockCaseService.getAll();
    const repointed = casesRes.ok ? (casesRes.data as any[]).find(c => c.id === caseId) : null;
    expect(repointed?.patient?.id).toBe(confirmedId);

    // The provisional record itself is kept, not deleted — a real
    // audit trail of "this id used to exist and where it went."
    const provisionalRecord = await mockPatientIndexService.getById(provisionalId);
    expect(provisionalRecord?.mergedInto).toBe(confirmedId);
    expect(provisionalRecord?.needsReview).toBe(false);

    const pending = await mockPatientIndexService.listPendingReview(ORG_A);
    expect(pending).toHaveLength(0);
  });

  it('real, found-and-fixed gap: mergeIntoExistingPatient also repoints every real Encounter under the provisional id, not just its cases', async () => {
    const { mockEncounterService } = await import('../encounters/mockEncounterService');

    const first = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ENC-1' }));
    expect(first.outcome).toBe('created');
    if (first.outcome !== 'created') return;
    const confirmedId = first.patientId;

    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ENC-1', dateOfBirth: '1990-01-01' }));
    expect(ambiguous.outcome).toBe('ambiguous');
    if (ambiguous.outcome !== 'ambiguous') return;
    const provisionalId = ambiguous.patientId;

    const encRes = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: ORG_A, patientId: provisionalId, encounterNumber: 'ENC-MERGE-TEST-1', encounterClass: 'Inpatient',
    });
    expect(encRes.ok).toBe(true);
    if (!encRes.ok) return;

    const result = await mockPatientIndexService.mergeIntoExistingPatient(provisionalId, confirmedId);
    expect(result.encountersRepointed).toBe(1);

    const reloaded = await mockEncounterService.getById(encRes.data.id);
    expect(reloaded.ok && reloaded.data?.patientId).toBe(confirmedId);
  });

  it('merging into a target that does not exist throws rather than silently corrupting state', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01' }));
    if (ambiguous.outcome !== 'ambiguous') return;
    await expect(
      mockPatientIndexService.mergeIntoExistingPatient(ambiguous.patientId, 'MPI-does-not-exist')
    ).rejects.toThrow();
  });
});

describe('mockPatientIndexService — real bug fix: a future order under a merged-away MRN correctly redirects to the real, current canonical record', () => {
  beforeEach(() => { store.clear(); });

  it('the real bug this fixes: a new order under the old, merged-away MRN no longer resurrects the stale, deprecated identity', async () => {
    const originalRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-OLD' }));
    if (originalRes.outcome !== 'created') throw new Error('setup failed');
    const originalId = originalRes.patientId;

    // A real, separate confirmed identity this one gets merged into -
    // deliberately a different DOB at setup time so it doesn't itself
    // get flagged ambiguous against "original" during creation.
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-TARGET', dateOfBirth: '1975-06-01' }));
    if (targetRes.outcome !== 'created') throw new Error('setup failed');
    const targetId = targetRes.patientId;

    await mockPatientIndexService.mergeIntoExistingPatient(originalId, targetId);

    // A genuinely new order arrives later, still carrying the OLD MRN
    // (a real, common real-world case — a downstream system hasn't
    // caught up with the merge yet), but matching the real, canonical
    // (target) record's own actual DOB - the real, correct two-
    // identifier match after redirect. Before this fix, this would have
    // matched the stale, merged-away record directly instead.
    const laterRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-OLD', dateOfBirth: '1975-06-01' }));
    expect(laterRes.outcome).toBe('matched');
    if (laterRes.outcome === 'matched') {
      expect(laterRes.patientId).toBe(targetId); // real, current target - not the stale, deprecated id
    }
  });
});

describe('mockPatientIndexService — real fix: linkPatients, the third resolution distinct from merge', () => {
  beforeEach(() => { store.clear(); });

  it('linking two records keeps BOTH fully active - neither gets mergedInto, unlike a real merge', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created') throw new Error('setup failed');

    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1', 'Same real patient, two different referring EMRs');

    const recordA = await mockPatientIndexService.getById(aRes.patientId);
    const recordB = await mockPatientIndexService.getById(bRes.patientId);
    expect(recordA?.mergedInto).toBeUndefined();
    expect(recordB?.mergedInto).toBeUndefined();
  });

  it('a real, future order under EITHER original MRN still resolves to its own, real, unmerged identity after linking', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1');

    const laterA = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A' }));
    const laterB = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01' }));
    expect(laterA.outcome === 'matched' && laterA.patientId).toBe(aRes.patientId);
    expect(laterB.outcome === 'matched' && laterB.patientId).toBe(bRes.patientId);
  });

  it('linking clears the review flag, same as the other two resolutions', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate());
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(candidate({ dateOfBirth: '1990-01-01' }));
    if (ambiguous.outcome !== 'ambiguous') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(ambiguous.patientId, ambiguous.candidatePatientIds[0], 'same_person', 'admin-1');
    const pending = await mockPatientIndexService.listPendingReview(ORG_A);
    expect(pending.find(r => r.id === ambiguous.patientId)).toBeUndefined();
  });
});

describe('mockPatientIndexService — real fix: getLinkedPatientIds follows the full link graph, not just one hop', () => {
  beforeEach(() => { store.clear(); });

  it('returns just the given id when it has no real links at all', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate());
    if (res.outcome !== 'created') throw new Error('setup failed');
    const linked = await mockPatientIndexService.getLinkedPatientIds(res.patientId, 'same_person');
    expect(linked).toEqual([res.patientId]);
  });

  it('a real, direct link returns both real ids', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1');
    const linked = await mockPatientIndexService.getLinkedPatientIds(aRes.patientId, 'same_person');
    expect(linked.sort()).toEqual([aRes.patientId, bRes.patientId].sort());
  });

  it('real, chained links (A-B, B-C) transitively include C in a query for A', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01' }));
    const cRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-C', dateOfBirth: '1990-05-05' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created' || cRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1');
    await mockPatientIndexService.linkPatients(bRes.patientId, cRes.patientId, 'same_person', 'admin-1');

    const linkedFromA = await mockPatientIndexService.getLinkedPatientIds(aRes.patientId, 'same_person');
    expect(linkedFromA.sort()).toEqual([aRes.patientId, bRes.patientId, cRes.patientId].sort());
  });

  it('real, per direct guidance: a family_relation link never leaks into a same_person query, even through a shared intermediate patient', async () => {
    // Real, concrete scenario this whole fix exists for: A and B are
    // the same real person (maiden/married name) - a real
    // same_person link. B and C are genuinely different real people
    // (B's own newborn) - a real family_relation link. A query for
    // A's own same_person-linked identities must include B (the real
    // reason the link exists) but never C - C is not the same real
    // person as A just because both happen to connect through B.
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A2' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B2', dateOfBirth: '1980-01-01' }));
    const cRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-C2', dateOfBirth: '2026-01-01' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created' || cRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1');
    await mockPatientIndexService.linkPatients(bRes.patientId, cRes.patientId, 'family_relation', 'admin-1');

    const samePersonFromA = await mockPatientIndexService.getLinkedPatientIds(aRes.patientId, 'same_person');
    expect(samePersonFromA.sort()).toEqual([aRes.patientId, bRes.patientId].sort());
    expect(samePersonFromA).not.toContain(cRes.patientId);

    // The real family_relation query for B, on the other hand, genuinely
    // includes C (the actual relationship it represents) but never A.
    const familyFromB = await mockPatientIndexService.getLinkedPatientIds(bRes.patientId, 'family_relation');
    expect(familyFromB.sort()).toEqual([bRes.patientId, cRes.patientId].sort());
    expect(familyFromB).not.toContain(aRes.patientId);
  });
});

describe('mockPatientIndexService.moveCaseToPatient — real fix, HL7 A43: repoints one specific, misattributed case, and (newly fixed) its own linked Encounter', () => {
  beforeEach(() => { store.clear(); });

  it('moves the case and reassigns its own exclusively-owned Encounter', async () => {
    const { mockCaseService } = await import('../cases/mockCaseService');
    const { mockEncounterService } = await import('../encounters/mockEncounterService');

    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A43-SRC' }));
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A43-TGT', dateOfBirth: '1990-01-01' }));
    if (sourceRes.outcome === 'ambiguous' || targetRes.outcome === 'ambiguous') throw new Error('setup failed');
    const sourceId = sourceRes.patientId;
    const targetId = targetRes.patientId;

    const encRes = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: ORG_A, patientId: sourceId, encounterNumber: 'ENC-A43-EXCLUSIVE', encounterClass: 'Inpatient',
    });
    if (!encRes.ok) throw new Error('setup failed');

    const caseId = 'S26-A43-TEST-001';
    await mockCaseService.createCase({
      id: caseId, status: 'draft', encounterId: encRes.data.id,
      patient: { id: sourceId, mrn: 'MRN-A43-SRC', firstName: 'Newborn', lastName: 'TestBaby' },
    } as any);

    const result = await mockPatientIndexService.moveCaseToPatient(caseId, sourceId, targetId, new Date().toISOString());
    expect(result.moved).toBe(true);
    expect(result.encounterOutcome).toBe('reassigned');

    const casesRes = await mockCaseService.getAll();
    const moved = casesRes.ok ? (casesRes.data as any[]).find(c => c.id === caseId) : null;
    expect(moved?.patient?.id).toBe(targetId);
    expect(moved?.encounterId).toBe(encRes.data.id);

    const encAfter = await mockEncounterService.getById(encRes.data.id);
    expect(encAfter.ok && encAfter.data?.patientId).toBe(targetId);
  });

  it('real, careful edge case: a real, genuinely SHARED Encounter (another case under the source patient still needs it) stays with the source patient, and the moved case\'s own encounterId is cleared rather than left stale and cross-patient', async () => {
    const { mockCaseService } = await import('../cases/mockCaseService');
    const { mockEncounterService } = await import('../encounters/mockEncounterService');

    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A43-SHARED-SRC' }));
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A43-SHARED-TGT', dateOfBirth: '1990-01-01' }));
    if (sourceRes.outcome === 'ambiguous' || targetRes.outcome === 'ambiguous') throw new Error('setup failed');
    const sourceId = sourceRes.patientId;
    const targetId = targetRes.patientId;

    const encRes = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: ORG_A, patientId: sourceId, encounterNumber: 'ENC-A43-SHARED', encounterClass: 'Inpatient',
    });
    if (!encRes.ok) throw new Error('setup failed');

    // Two real cases, from the same real clinical visit, sharing one
    // real Encounter — only ONE of them (the misattributed one) moves.
    const movedCaseId = 'S26-A43-SHARED-001';
    const staysCaseId = 'S26-A43-SHARED-002';
    await mockCaseService.createCase({
      id: movedCaseId, status: 'draft', encounterId: encRes.data.id,
      patient: { id: sourceId, mrn: 'MRN-A43-SHARED-SRC', firstName: 'Newborn', lastName: 'TestBaby' },
    } as any);
    await mockCaseService.createCase({
      id: staysCaseId, status: 'draft', encounterId: encRes.data.id,
      patient: { id: sourceId, mrn: 'MRN-A43-SHARED-SRC', firstName: 'Mother', lastName: 'TestParent' },
    } as any);

    const result = await mockPatientIndexService.moveCaseToPatient(movedCaseId, sourceId, targetId, new Date().toISOString());
    expect(result.moved).toBe(true);
    expect(result.encounterOutcome).toBe('unlinked_shared');

    const casesRes = await mockCaseService.getAll();
    const moved = casesRes.ok ? (casesRes.data as any[]).find(c => c.id === movedCaseId) : null;
    const stayed = casesRes.ok ? (casesRes.data as any[]).find(c => c.id === staysCaseId) : null;
    expect(moved?.patient?.id).toBe(targetId);
    expect(moved?.encounterId).toBeUndefined();
    // The real, still-shared case is completely untouched — same
    // patient, same encounter, exactly as it should stay.
    expect(stayed?.patient?.id).toBe(sourceId);
    expect(stayed?.encounterId).toBe(encRes.data.id);

    const encAfter = await mockEncounterService.getById(encRes.data.id);
    expect(encAfter.ok && encAfter.data?.patientId).toBe(sourceId);
  });

  it('a case with no linked Encounter at all reports encounterOutcome: none', async () => {
    const { mockCaseService } = await import('../cases/mockCaseService');
    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A43-NOENC-SRC' }));
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A43-NOENC-TGT', dateOfBirth: '1990-01-01' }));
    if (sourceRes.outcome === 'ambiguous' || targetRes.outcome === 'ambiguous') throw new Error('setup failed');
    const caseId = 'S26-A43-NOENC-001';
    await mockCaseService.createCase({
      id: caseId, status: 'draft',
      patient: { id: sourceRes.patientId, mrn: 'MRN-A43-NOENC-SRC', firstName: 'Test', lastName: 'Patient' },
    } as any);

    const result = await mockPatientIndexService.moveCaseToPatient(caseId, sourceRes.patientId, targetRes.patientId, new Date().toISOString());
    expect(result.moved).toBe(true);
    expect(result.encounterOutcome).toBe('none');
  });
});

describe('mockPatientIndexService — real fix: listLinks, the real audit trail of confirmed links', () => {
  beforeEach(() => { store.clear(); });

  it('returns a real, confirmed link scoped to this organisation', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A' }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01' }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1', 'Confirmed same patient');

    const links = await mockPatientIndexService.listLinks(ORG_A);
    expect(links).toHaveLength(1);
    expect(links[0].reason).toBe('Confirmed same patient');
  });

  it('never shows a real link belonging to a genuinely different organisation', async () => {
    const aRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-A', organisationId: ORG_B }));
    const bRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-B', dateOfBirth: '1980-01-01', organisationId: ORG_B }));
    if (aRes.outcome !== 'created' || bRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.linkPatients(aRes.patientId, bRes.patientId, 'same_person', 'admin-1');

    const linksForOrgA = await mockPatientIndexService.listLinks(ORG_A);
    expect(linksForOrgA).toHaveLength(0);
  });
});

describe('mockPatientIndexService — real fix: the identifier crosswalk, fixing the collision risk the enterprise-wide scoping fix introduced', () => {
  beforeEach(() => { store.clear(); });

  it('the real bug this fixes: two DIFFERENT real people, at two DIFFERENT hospitals, whose MRN schemes happen to collide, are never silently matched as the same person', async () => {
    const personX = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-12345', assigningAuthority: 'EPIC_MAIN', dateOfBirth: '1970-01-01' })
    );
    // A genuinely different real person, at a genuinely different
    // hospital, whose own MRN scheme happens to also produce "MRN-12345" -
    // a real, known collision risk once the MPI is scoped enterprise-wide.
    // No crosswalk entry exists yet for THIS authority, so this correctly
    // falls through to the bare-MRN check - which flags it 'ambiguous' for
    // a real human to review, rather than the actual bug this exists to
    // prevent: silently, confidently MATCHING two different real people
    // just because their MRN strings happen to collide.
    const personY = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-12345', assigningAuthority: 'CERNER_WEST', dateOfBirth: '1985-06-15', firstName: 'Different', lastName: 'Person' })
    );
    if (personX.outcome !== 'created') throw new Error('setup failed');
    expect(personY.outcome).toBe('ambiguous'); // never a silent, false-positive match
    if (personY.outcome === 'ambiguous') {
      expect(personY.patientId).not.toBe(personX.patientId); // never resolved to personX's own real id
    }
  });

  it('the same real patient, referred by two different hospitals with two different real MRNs, still resolves correctly via the existing name+DOB fallback', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-A', assigningAuthority: 'EPIC_MAIN' })
    );
    if (first.outcome !== 'created') throw new Error('setup failed');
    // Same real person (same default name/DOB from candidate()), different
    // hospital, different real MRN, different real assigning authority.
    const second = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-B', assigningAuthority: 'CERNER_WEST' })
    );
    // No crosswalk entry yet for MRN-B/CERNER_WEST, falls through to the
    // existing name+DOB match under a different MRN - correctly flagged
    // for a real human to confirm (not silently auto-linked).
    expect(second.outcome).toBe('ambiguous');
  });

  it('a repeat order under the SAME (assigningAuthority, mrn) pair resolves directly via the crosswalk, without re-running the ambiguous check', async () => {
    const first = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-A', assigningAuthority: 'EPIC_MAIN' })
    );
    if (first.outcome !== 'created') throw new Error('setup failed');

    const second = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-A', assigningAuthority: 'EPIC_MAIN' })
    );
    expect(second.outcome).toBe('matched');
    if (second.outcome === 'matched') {
      expect(second.patientId).toBe(first.patientId);
    }
  });

  it('resolveByIdentifier returns null, never a guess, for an identifier that has never been seen', async () => {
    const result = await mockPatientIndexService.resolveByIdentifier('EPIC_MAIN', 'NEVER-SEEN');
    expect(result).toBeNull();
  });

  it('listIdentifiersForPatient shows every real identifier recorded across every source system for that patient', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-A', assigningAuthority: 'EPIC_MAIN' })
    );
    if (res.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.addIdentifier(res.patientId, 'CERNER_WEST', 'MRN-DIFFERENT-AT-CERNER');

    const identifiers = await mockPatientIndexService.listIdentifiersForPatient(res.patientId);
    expect(identifiers).toHaveLength(2);
    expect(identifiers.map(i => i.assigningAuthority).sort()).toEqual(['CERNER_WEST', 'EPIC_MAIN']);
  });

  it('a real admin manually adding a known identifier is tagged source: manual, distinct from the automatic resolution path', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-A', assigningAuthority: 'EPIC_MAIN' })
    );
    if (res.outcome !== 'created') throw new Error('setup failed');
    const added = await mockPatientIndexService.addIdentifier(res.patientId, 'CERNER_WEST', 'MRN-X');
    expect(added.source).toBe('manual');

    const identifiers = await mockPatientIndexService.listIdentifiersForPatient(res.patientId);
    const autoRecorded = identifiers.find(i => i.assigningAuthority === 'EPIC_MAIN');
    expect(autoRecorded?.source).toBe('resolution');
  });

  it('adding the exact same (authority, value) pair twice for the same patient does not create a duplicate row', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-A', assigningAuthority: 'EPIC_MAIN' })
    );
    if (res.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.addIdentifier(res.patientId, 'EPIC_MAIN', 'MRN-A');
    const identifiers = await mockPatientIndexService.listIdentifiersForPatient(res.patientId);
    expect(identifiers).toHaveLength(1); // still just the one, real, auto-recorded entry
  });

  it('a candidate with no assigningAuthority provided falls back to the prior, bare-MRN behavior - real backward compatibility', async () => {
    const result = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-LEGACY' }));
    expect(result.outcome).toBe('created');
  });

  it('real fix: an ambiguous/provisional record still gets its own real assigningAuthority recorded in the crosswalk immediately, not just after a human resolves it', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ORIG', assigningAuthority: 'EPIC_MAIN' }));
    // Same real name+DOB as the first record (candidate()'s own
    // defaults, unchanged) but a genuinely different MRN and
    // assigningAuthority - correctly triggers the real, existing
    // "name+DOB match under a different MRN" ambiguous path.
    const ambiguous = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-DIFFERENT', assigningAuthority: 'CERNER_WEST' })
    );
    if (ambiguous.outcome !== 'ambiguous') throw new Error('setup failed - expected an ambiguous, provisional record');
    const identifiers = await mockPatientIndexService.listIdentifiersForPatient(ambiguous.patientId);
    expect(identifiers).toContainEqual(
      expect.objectContaining({ assigningAuthority: 'CERNER_WEST', identifierValue: 'MRN-DIFFERENT' })
    );
  });

  it('real, critical safety fix: an exact crosswalk hit alone is NOT sufficient - the same real two-identifier requirement (DOB+name) still applies, same as the bare-MRN path', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-SAFETY', assigningAuthority: 'EPIC_MAIN' })
    );
    // Same real (authority, mrn) pair as the crosswalk already knows -
    // but a genuinely different real name+DOB. Before this fix, the
    // crosswalk hit alone would have silently, confidently matched
    // this to the wrong real person.
    const result = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-SAFETY', assigningAuthority: 'EPIC_MAIN', firstName: 'Different', lastName: 'Person', dateOfBirth: '1970-01-01' })
    );
    expect(result.outcome).toBe('ambiguous'); // never a silent, false-positive match
  });
});

describe('mockPatientIndexService — real fix, Phase 3: updateDemographics, the actual missing "update" half of ADT^A08', () => {
  beforeEach(() => { store.clear(); });

  it('applies a real, genuinely newer event and updates the real record', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-DEMO-1' }));
    if (res.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.updateDemographics(
      res.patientId,
      { firstName: 'UpdatedFirst' },
      '2026-01-15T15:00:00.000Z'
    );
    expect(result.applied).toBe(true);
    expect(result.record.firstName).toBe('UpdatedFirst');
    expect(result.record.lastEventAt).toBe('2026-01-15T15:00:00.000Z');
  });

  it('real, found-and-fixed gap: a genuinely applied demographic update now leaves a real, PHI-safe audit trail — previously only the rejected/stale path logged anything at all', async () => {
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-DEMO-AUDIT' }));
    if (res.outcome !== 'created') throw new Error('setup failed');

    await mockPatientIndexService.updateDemographics(res.patientId, { firstName: 'AuditedFirst', lastName: 'AuditedLast' }, '2026-01-15T15:00:00.000Z');

    const logsRes = await mockAuditService.getAuditLogs({ search: 'mpi.demographics.updated' } as any);
    expect(logsRes.ok).toBe(true);
    if (!logsRes.ok) return;
    const entry = logsRes.data.find(l => l.detail.includes(res.patientId));
    expect(entry).toBeTruthy();
    // Real, PHI-safe: names WHICH fields changed, never the actual new values.
    expect(entry?.detail).toContain('firstName');
    expect(entry?.detail).toContain('lastName');
    expect(entry?.detail).not.toContain('AuditedFirst');
    expect(entry?.detail).not.toContain('AuditedLast');
  });

  it('real, critical fix: a genuinely STALE (older) event is honestly rejected, never silently applied over newer state', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-DEMO-2' }));
    if (res.outcome !== 'created') throw new Error('setup failed');

    // A real, newer event applies first (e.g. arrives first, or is
    // processed first even though a real, older one was sent earlier).
    await mockPatientIndexService.updateDemographics(res.patientId, { firstName: 'Newer' }, '2026-01-15T15:00:00.000Z');

    // A real, genuinely older event arrives late (network delay,
    // retry, re-delivery) - must never overwrite the newer, real state.
    const staleResult = await mockPatientIndexService.updateDemographics(
      res.patientId,
      { firstName: 'StaleOlder' },
      '2026-01-15T14:00:00.000Z'
    );
    expect(staleResult.applied).toBe(false);
    expect(staleResult.record.firstName).toBe('Newer'); // unchanged - the stale update never landed
  });

  it('a genuine re-delivery of the exact same event (identical timestamp) is also rejected, not re-applied', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-DEMO-3' }));
    if (res.outcome !== 'created') throw new Error('setup failed');

    await mockPatientIndexService.updateDemographics(res.patientId, { firstName: 'First' }, '2026-01-15T15:00:00.000Z');
    const redelivery = await mockPatientIndexService.updateDemographics(
      res.patientId,
      { firstName: 'ShouldNotApply' },
      '2026-01-15T15:00:00.000Z'
    );
    expect(redelivery.applied).toBe(false);
    expect(redelivery.record.firstName).toBe('First');
  });

  it('a record with no prior real event (never updated via ADT before) accepts the first real event, regardless of timestamp', async () => {
    const res = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-DEMO-4' }));
    if (res.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.updateDemographics(
      res.patientId,
      { firstName: 'FirstEverUpdate' },
      '2020-01-01T00:00:00.000Z' // even an "old" real-world date is genuinely newer than "never"
    );
    expect(result.applied).toBe(true);
  });

  it('updating a real, nonexistent patient throws honestly, rather than silently creating a corrupted record', async () => {
    await expect(
      mockPatientIndexService.updateDemographics('MPI-does-not-exist', { firstName: 'X' }, '2026-01-01T00:00:00.000Z')
    ).rejects.toThrow();
  });
});

describe('mockPatientIndexService.breakGlassRebind — Phase B, per direct confirmation: the Interface Exception & Case-Binding Module', () => {
  it('a genuine downtime record is successfully rebound to the confirmed patient — real cases repointed, downtime record retired', async () => {
    const downtimeRes = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'DOE_JOHN_1234', firstName: 'JOHN', lastName: 'DOE', isDowntimeRecord: true, downtimeReasonCode: 'EMERGENCY_TRAUMA' })
    );
    if (downtimeRes.outcome !== 'created') throw new Error('setup failed to create a genuine downtime record');
    const confirmedRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-REAL-CONFIRMED', firstName: 'REALCONFIRMED', lastName: 'PATIENT' }));
    if (confirmedRes.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.breakGlassRebind({
      downtimePatientId: downtimeRes.patientId,
      confirmedPatientId: confirmedRes.patientId,
      reasonCode: 'EMERGENCY_TRAUMA',
      notes: 'Rebound Doe_1234 to MRN 987654 per HIM Ticket #4091',
      performedBy: 'PATH-001',
    });
    expect(result.rebound).toBe(true);

    const downtimeRecord = await mockPatientIndexService.getById(downtimeRes.patientId);
    expect(downtimeRecord?.mergedInto).toBe(confirmedRes.patientId);
  });

  it('a record NOT flagged isDowntimeRecord is refused — this is what makes the tool genuinely restricted, not a second way to run an ordinary merge', async () => {
    const ordinaryRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-ORDINARY-NOT-DOWNTIME', firstName: 'ORDINARY', lastName: 'PATIENT' }));
    if (ordinaryRes.outcome !== 'created') throw new Error('setup failed');
    const confirmedRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-REAL-CONFIRMED-2', firstName: 'REALCONFIRMED2', lastName: 'PATIENT' }));
    if (confirmedRes.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.breakGlassRebind({
      downtimePatientId: ordinaryRes.patientId,
      confirmedPatientId: confirmedRes.patientId,
      reasonCode: 'EMERGENCY_TRAUMA',
      notes: 'This should genuinely be refused.',
      performedBy: 'PATH-001',
    });
    expect(result.rebound).toBe(false);
    expect(result.reason).toContain('not flagged');

    const record = await mockPatientIndexService.getById(ordinaryRes.patientId);
    expect(record?.mergedInto).toBeUndefined();
  });

  it('a missing or too-short free-text justification is refused, even with a real reason code', async () => {
    const downtimeRes = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-SHORTNOTE-DOWNTIME', firstName: 'SHORTNOTE', lastName: 'DOWNTIME', isDowntimeRecord: true })
    );
    if (downtimeRes.outcome !== 'created') throw new Error('setup failed');
    const confirmedRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-SHORTNOTE-CONFIRMED', firstName: 'SHORTNOTECONF', lastName: 'PATIENT' }));
    if (confirmedRes.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.breakGlassRebind({
      downtimePatientId: downtimeRes.patientId,
      confirmedPatientId: confirmedRes.patientId,
      reasonCode: 'EMERGENCY_TRAUMA',
      notes: 'too short',
      performedBy: 'PATH-001',
    });
    expect(result.rebound).toBe(false);
    expect(result.reason).toContain('free-text justification');
  });

  it('a missing reason code is refused outright', async () => {
    const downtimeRes = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-NOREASON-DOWNTIME', firstName: 'NOREASON', lastName: 'DOWNTIME', isDowntimeRecord: true })
    );
    if (downtimeRes.outcome !== 'created') throw new Error('setup failed');
    const confirmedRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-NOREASON-CONFIRMED', firstName: 'NOREASONCONF', lastName: 'PATIENT' }));
    if (confirmedRes.outcome !== 'created') throw new Error('setup failed');

    const result = await mockPatientIndexService.breakGlassRebind({
      downtimePatientId: downtimeRes.patientId,
      confirmedPatientId: confirmedRes.patientId,
      reasonCode: '',
      notes: 'A perfectly good, long-enough justification note.',
      performedBy: 'PATH-001',
    });
    expect(result.rebound).toBe(false);
    expect(result.reason).toContain('reason code');
  });

  it('listDowntimeRecords returns only genuinely flagged, not-yet-rebound records for the real organisation', async () => {
    const downtimeRes = await mockPatientIndexService.resolveOrCreatePatient(
      candidate({ mrn: 'MRN-LISTDOWNTIME-1', firstName: 'LISTDOWNTIME', lastName: 'ONE', isDowntimeRecord: true })
    );
    if (downtimeRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-LISTDOWNTIME-ORDINARY', firstName: 'LISTDOWNTIME', lastName: 'ORDINARY' }));

    const list = await mockPatientIndexService.listDowntimeRecords(ORG_A);
    expect(list.some(r => r.id === downtimeRes.patientId)).toBe(true);
    expect(list.every(r => r.isDowntimeRecord === true)).toBe(true);
    expect(list.every(r => !r.mergedInto)).toBe(true);

    // Once rebound, the same record must no longer appear — it's
    // retired, nothing left to resolve.
    const confirmedRes = await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-LISTDOWNTIME-CONFIRMED', firstName: 'LISTDOWNTIME', lastName: 'CONFIRMED' }));
    if (confirmedRes.outcome !== 'created') throw new Error('setup failed');
    await mockPatientIndexService.breakGlassRebind({
      downtimePatientId: downtimeRes.patientId, confirmedPatientId: confirmedRes.patientId,
      reasonCode: 'OUTAGE_EHR', notes: 'Rebinding to confirm list exclusion afterward.', performedBy: 'PATH-001',
    });
    const listAfter = await mockPatientIndexService.listDowntimeRecords(ORG_A);
    expect(listAfter.some(r => r.id === downtimeRes.patientId)).toBe(false);
  });

  it('searchPatients matches by real name or MRN substring, case-insensitively, scoped to the real organisation', async () => {
    await mockPatientIndexService.resolveOrCreatePatient(candidate({ mrn: 'MRN-SEARCHTEST-999', firstName: 'Zelda', lastName: 'Searchtarget' }));

    const byName = await mockPatientIndexService.searchPatients(ORG_A, 'searchtarget');
    expect(byName.some(r => r.mrn === 'MRN-SEARCHTEST-999')).toBe(true);

    const byMrn = await mockPatientIndexService.searchPatients(ORG_A, 'SEARCHTEST-999');
    expect(byMrn.some(r => r.mrn === 'MRN-SEARCHTEST-999')).toBe(true);

    const wrongOrg = await mockPatientIndexService.searchPatients(ORG_B, 'searchtarget');
    expect(wrongOrg.some(r => r.mrn === 'MRN-SEARCHTEST-999')).toBe(false);

    const empty = await mockPatientIndexService.searchPatients(ORG_A, '');
    expect(empty.length).toBe(0);
  });
});
