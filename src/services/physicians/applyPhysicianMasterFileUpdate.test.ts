import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { applyPhysicianMasterFileUpdate as ApplyType } from './applyPhysicianMasterFileUpdate';
import type { mockPhysicianService as MockPhysicianServiceType } from './mockPhysicianService';
import type { mockFacilityService as MockFacilityServiceType } from '../facilities/mockFacilityService';

// Same dynamic-import-after-stubbing pattern as resolveProviderName.test.ts,
// for the same reason — mockPhysicianService.ts's and
// mockFacilityService.ts's own MOCK_* arrays are initialized via
// storageGet at true module scope, before any beforeEach hook could run
// for a static top-level import.
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

let applyPhysicianMasterFileUpdate: typeof ApplyType;
let mockPhysicianService: typeof MockPhysicianServiceType;
let mockFacilityService: typeof MockFacilityServiceType;
beforeAll(async () => {
  ({ applyPhysicianMasterFileUpdate } = await import('./applyPhysicianMasterFileUpdate'));
  ({ mockPhysicianService } = await import('./mockPhysicianService'));
  ({ mockFacilityService } = await import('../facilities/mockFacilityService'));
});

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('applyPhysicianMasterFileUpdate', () => {
  it('rejects a record with no sourceSystem/sourceRecordId rather than silently falling back to name-only matching', async () => {
    const res = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Jane', familyNames: 'Doe',
      sourceSystem: '', sourceRecordId: '',
    });
    expect(res.ok).toBe(false);
  });

  it('creates a new physician on first sync, even with no NPI at all — the real point of this feature for international customers', async () => {
    const res = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Fenella', familyNames: 'Okonkwo-Bryce',
      identifiers: [{ value: '1234567', type: 'GMC' }],
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-001',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.outcome).toBe('created');
    expect(res.data.physician.npi).toBe(''); // GMC has no dedicated field — real, known, unchanged limitation
    expect(res.data.physician.sourceSystem).toBe('UK-CREDENTIALING');
    expect(res.data.physician.sourceRecordId).toBe('REC-001');
  });

  it('a second sync of the SAME physician matches on sourceSystem/sourceRecordId, not name — updates instead of creating a duplicate', async () => {
    const first = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Fenella', familyNames: 'Okonkwo-Bryce',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-002',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await applyPhysicianMasterFileUpdate({
      action: 'UPDATE', givenNames: 'Fenella', familyNames: 'Okonkwo-Bryce', specialty: 'Dermatopathology',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-002',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.outcome).toBe('updated');
    expect(second.data.physician.id).toBe(first.data.physician.id); // same record, not a new one
    expect(second.data.physician.specialty).toBe('Dermatopathology');

    const all = await mockPhysicianService.getAll();
    expect(all.ok && all.data.filter(p => p.sourceRecordId === 'REC-002').length).toBe(1); // never duplicated
  });

  it('two different physicians who happen to share a name never collide — a no-NPI first encounter always creates fresh rather than risking a name-based merge', async () => {
    const a = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Priya', familyNames: 'Anand-Whitfield',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-A',
    });
    const b = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Priya', familyNames: 'Anand-Whitfield',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-B',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.outcome).toBe('created');
    expect(b.data.outcome).toBe('created'); // NOT 'updated' — never matched onto A's record
    expect(a.data.physician.id).not.toBe(b.data.physician.id);
  });

  it('DEACTIVATE fails cleanly when the physician was never synced before, rather than silently no-op-ing', async () => {
    const res = await applyPhysicianMasterFileUpdate({
      action: 'DEACTIVATE', givenNames: 'Nobody', familyNames: 'Here',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-NONE',
    });
    expect(res.ok).toBe(false);
  });

  it('DEACTIVATE then REACTIVATE round-trips correctly for a previously-synced physician', async () => {
    const created = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Helen', familyNames: 'Marsh',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-003',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deactivated = await applyPhysicianMasterFileUpdate({
      action: 'DEACTIVATE', givenNames: 'Helen', familyNames: 'Marsh',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-003',
    });
    expect(deactivated.ok).toBe(true);
    if (!deactivated.ok) return;
    expect(deactivated.data.physician.status).toBe('Inactive');

    const reactivated = await applyPhysicianMasterFileUpdate({
      action: 'REACTIVATE', givenNames: 'Helen', familyNames: 'Marsh',
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-003',
    });
    expect(reactivated.ok).toBe(true);
    if (!reactivated.ok) return;
    expect(reactivated.data.physician.status).toBe('Active');
  });

  it('resolves a facilityAssigningAuthorities entry that matches a real facility into clientIds', async () => {
    const facilityRes = await mockFacilityService.add({
      name: 'Test Facility For MFN', assigningAuthority: 'TESTFAC-AA',
      address: '', phone: '', fax: '', email: '',
      roles: ['external_ordering_client'], jurisdiction: 'US',
      reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false },
      status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
      tatFirstTouchHours: null, tatTotalHours: null, escalationTargets: [], escalationPriority: 'high',
    } as any);
    expect(facilityRes.ok).toBe(true);
    if (!facilityRes.ok) return;

    const res = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'Carol', familyNames: 'Simmons',
      facilityAssigningAuthorities: ['TESTFAC-AA'],
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-004',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.physician.clientIds).toContain(facilityRes.data.id);
    expect(res.data.unmatchedFacilityAssigningAuthorities).toBeUndefined();
  });

  it('an unmatched facilityAssigningAuthorities entry is reported, never used to auto-create a Facility', async () => {
    const res = await applyPhysicianMasterFileUpdate({
      action: 'ADD', givenNames: 'David', familyNames: 'Holloway',
      facilityAssigningAuthorities: ['DOES-NOT-EXIST-AA'],
      sourceSystem: 'UK-CREDENTIALING', sourceRecordId: 'REC-005',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.unmatchedFacilityAssigningAuthorities).toEqual(['DOES-NOT-EXIST-AA']);

    const facilities = await mockFacilityService.getAll();
    expect(facilities.ok && facilities.data.some(f => f.assigningAuthority === 'DOES-NOT-EXIST-AA')).toBe(false);
  });
});
