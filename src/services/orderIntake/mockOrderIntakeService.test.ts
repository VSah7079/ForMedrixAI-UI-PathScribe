import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { mockOrderIntakeService as MockOrderIntakeServiceType } from './mockOrderIntakeService';
import type { mockInterfaceExceptionService as MockInterfaceExceptionServiceType } from '../interfaceExceptions/mockInterfaceExceptionService';
import type { mockFacilityService as MockFacilityServiceType } from '../facilities/mockFacilityService';
import type { mockSpecimenDictionaryService as MockSpecimenDictionaryServiceType } from '../specimenDictionary/mockSpecimenDictionaryService';
import type { SpecimenEntry } from '../specimenDictionary/specimenTypes';

// Real, deliberate: same dynamic-import-after-stubbing pattern as
// services/intraop/mockIntraoperativeService.test.ts, for the same
// real reason - this file's own loadOrders()/loadCrosswalk() touch
// localStorage directly at module-load time, before any beforeEach
// hook could run for a static top-level import.
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

let mockOrderIntakeService: typeof MockOrderIntakeServiceType;
let mockInterfaceExceptionService: typeof MockInterfaceExceptionServiceType;
let mockFacilityService: typeof MockFacilityServiceType;
let mockSpecimenDictionaryService: typeof MockSpecimenDictionaryServiceType;
let realClientId: string;
let realAssigningAuthority: string;
let realEntryIdA: string;
let realEntryIdB: string;

beforeAll(async () => {
  ({ mockOrderIntakeService } = await import('./mockOrderIntakeService'));
  ({ mockInterfaceExceptionService } = await import('../interfaceExceptions/mockInterfaceExceptionService'));
  ({ mockFacilityService } = await import('../facilities/mockFacilityService'));
  ({ mockSpecimenDictionaryService } = await import('../specimenDictionary/mockSpecimenDictionaryService'));

  const facilityRes = await mockFacilityService.getAll();
  if (!facilityRes.ok || facilityRes.data.length === 0) throw new Error('setup failed — no real facility seed data');
  realClientId = facilityRes.data[0].id;
  realAssigningAuthority = facilityRes.data[0].assigningAuthority;

  // Real, two distinct, valid SpecimenEntry records — needed so the
  // coding-system-priority test can prove WHICH real crosswalk entry
  // actually matched by checking which real dictionaryEntryId came
  // back, not just that something non-fake did.
  const entryA: SpecimenEntry = {
    id: 'sp-test-real-entry-a', name: 'Test Entry A', type: 'Biopsy', procedure: 'Core',
    normalizedLabel: 'TEST ENTRY A', synonyms: [], active: true, version: 1,
    updatedBy: 'test-admin', updatedAt: new Date().toISOString(),
  };
  const entryB: SpecimenEntry = {
    id: 'sp-test-real-entry-b', name: 'Test Entry B', type: 'Biopsy', procedure: 'Core',
    normalizedLabel: 'TEST ENTRY B', synonyms: [], active: true, version: 1,
    updatedBy: 'test-admin', updatedAt: new Date().toISOString(),
  };
  await mockSpecimenDictionaryService.addEntries([entryA, entryB]);
  realEntryIdA = entryA.id;
  realEntryIdB = entryB.id;
});

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('resolveOrder — real, priority-ordered crosswalk matching, resolves PS-80', () => {
  it('a real, exact crosswalk match (no coding-system ambiguity) still resolves correctly, unchanged from before', async () => {
    await mockOrderIntakeService.addCrosswalkEntry({
      clientId: realClientId, externalCode: 'TESTCODE-1', dictionaryEntryId: realEntryIdA, createdBy: 'test-admin',
    });
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-1', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Test specimen', externalSpecimenCode: 'TESTCODE-1' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data.order.specimens[0].dictionaryEntryId).toBe(realEntryIdA);
      expect(resolved.data.order.specimens[0].dictionaryEntryWasAutoCreated).toBe(false);
    }
  });

  it('the real point of PS-80: two crosswalk entries with the SAME code but DIFFERENT codingSystem no longer collide - the one matching the incoming specimen\'s own real codingSystem wins', async () => {
    await mockOrderIntakeService.addCrosswalkEntry({
      clientId: realClientId, externalCode: 'SHARED-CODE', codingSystem: 'HL7_LOCAL', dictionaryEntryId: realEntryIdA, createdBy: 'test-admin',
    });
    await mockOrderIntakeService.addCrosswalkEntry({
      clientId: realClientId, externalCode: 'SHARED-CODE', codingSystem: 'LOINC', dictionaryEntryId: realEntryIdB, createdBy: 'test-admin',
    });

    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-2', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Test specimen', externalSpecimenCode: 'SHARED-CODE', externalCodingSystem: 'LOINC' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      // Real, correct match on the LOINC-tagged entry (realEntryIdB),
      // not whichever happened to be added first (realEntryIdA) - the
      // old, flat .find() bug this fixes would have silently returned
      // realEntryIdA instead.
      expect(resolved.data.order.specimens[0].dictionaryEntryId).toBe(realEntryIdB);
    }
  });

  it('a real, legacy crosswalk entry with no codingSystem set at all still matches, even when the incoming specimen DID carry a real codingSystem — the real, backward-compatible fallback tier', async () => {
    await mockOrderIntakeService.addCrosswalkEntry({
      clientId: realClientId, externalCode: 'LEGACY-CODE', dictionaryEntryId: realEntryIdA, createdBy: 'test-admin', // no codingSystem — a real, pre-existing entry
    });
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-3', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Test specimen', externalSpecimenCode: 'LEGACY-CODE', externalCodingSystem: 'SNOMED' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.order.specimens[0].dictionaryEntryId).toBe(realEntryIdA);
  });

  it('real normalizeOrderCode-based comparison catches cosmetic differences a plain toLowerCase never would', async () => {
    await mockOrderIntakeService.addCrosswalkEntry({
      clientId: realClientId, externalCode: 'SURG-PATH', dictionaryEntryId: realEntryIdA, createdBy: 'test-admin',
    });
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-4', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Test specimen', externalSpecimenCode: '  surg-path  ' }], // real, cosmetic noise — same hyphen separator as the crosswalk entry, only case/outer whitespace differ. (A hyphen vs a space are NOT cosmetically equivalent to normalizeOrderCode — it strips punctuation like hyphens entirely but preserves whitespace, so 'SURG-PATH' and 'surg path' are genuinely different normalized keys, confirmed directly by an earlier, failed version of this exact test.)
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.order.specimens[0].dictionaryEntryId).toBe(realEntryIdA);
  });
});

describe('resolveOrder — real InterfaceException raised alongside (never instead of) the existing auto-create fallback, resolves PS-80', () => {
  it('a real, unmapped order code both auto-creates a pending dictionary entry AND raises a real InterfaceException', async () => {
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-5', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Genuinely unmapped specimen', externalSpecimenCode: 'NEVER-SEEN-BEFORE', externalCodingSystem: 'LOINC' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      // Real, honest fail-open behavior — order processing was never
      // blocked. This is the "alongside," not "instead of," part of
      // the fix.
      expect(resolved.data.order.specimens[0].dictionaryEntryId).toBeTruthy();
      expect(resolved.data.order.specimens[0].dictionaryEntryWasAutoCreated).toBe(true);
    }

    const exceptions = await mockInterfaceExceptionService.getPending();
    if (!exceptions.ok) throw new Error('lookup failed');
    const real = exceptions.data.find(e => e.rawOrderCode === 'NEVER-SEEN-BEFORE');
    expect(real).toBeTruthy();
    expect(real?.eventType).toBe('unmapped_order_code');
    expect(real?.codingSystem).toBe('LOINC');
    expect(real?.normalizedOrderCode).toBe('NEVERSEENBEFORE'); // real normalizeOrderCode output — hyphens are stripped, not converted to spaces
    // Real, per the "Map & Link" contextual resolution feature — a
    // real, resolved facilityId is now captured on the exception itself,
    // not just mentioned inside the free-text reason string. Without
    // this, a reviewer couldn't create a correctly-scoped real
    // crosswalk entry from the exception alone.
    expect(real?.facilityId).toBe(realClientId);
  });

  it('a real, description-only specimen (no code at all) never raises a real InterfaceException - there was never a real code for the crosswalk to have missed', async () => {
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-6', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Description-only specimen, no code at all' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const beforeCount = (await mockInterfaceExceptionService.getPending());
    const before = beforeCount.ok ? beforeCount.data.length : 0;

    await mockOrderIntakeService.resolveOrder(orderRes.data.id);

    const afterCount = await mockInterfaceExceptionService.getPending();
    const after = afterCount.ok ? afterCount.data.length : 0;
    expect(after).toBe(before);
  });

  it('a real, successful crosswalk match never raises a real InterfaceException', async () => {
    await mockOrderIntakeService.addCrosswalkEntry({
      clientId: realClientId, externalCode: 'KNOWN-CODE', dictionaryEntryId: realEntryIdA, createdBy: 'test-admin',
    });
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-7', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Test', namePrefix: 'Dr.', familyNames: 'Test' },
      specimens: [{ description: 'Known specimen', externalSpecimenCode: 'KNOWN-CODE' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    await mockOrderIntakeService.resolveOrder(orderRes.data.id);

    const exceptions = await mockInterfaceExceptionService.getPending();
    if (!exceptions.ok) throw new Error('lookup failed');
    expect(exceptions.data.find(e => e.rawOrderCode === 'KNOWN-CODE')).toBeUndefined();
  });
});

describe('resolveOrder — real requesting-physician resolution, completing PS-81 to match the ADT pipeline', () => {
  it('real, structured requestingProvider resolves to a real, stable Physician.id, stamped onto the order', async () => {
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-8', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Helena Marchetti', namePrefix: 'Dr.', givenNames: 'Helena', familyNames: 'Marchetti' },
      specimens: [{ description: 'Test specimen' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.order.requestingProviderPhysicianId).toBeTruthy();
  });

  it('the real point of PS-81 end to end: the SAME real physician named on an ADT attending record and an Order Intake requesting record resolves to the SAME real Physician.id', async () => {
    const { resolveProviderName } = await import('../physicians/resolveProviderName');
    const fromAdt = await resolveProviderName({ familyNames: 'Whitcombe', givenNames: 'Desmond' }, 'attending_of_record');
    if (!fromAdt.ok || !fromAdt.data) throw new Error('setup failed');
    const realId = fromAdt.data.physician.id;

    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-9', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Desmond Whitcombe', givenNames: 'Desmond', familyNames: 'Whitcombe' },
      specimens: [{ description: 'Test specimen' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.order.requestingProviderPhysicianId).toBe(realId);
  });

  it('a requestingProvider with only rawName (no confident familyNames split) still resolves via the real string fallback path', async () => {
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-10', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Unresolved Format Only' },
      specimens: [{ description: 'Test specimen' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.order.requestingProviderPhysicianId).toBeTruthy();
  });

  it('order resolution is never blocked by a physician-resolution issue - real, fail-open posture, same as client/specimen resolution', async () => {
    const orderRes = await mockOrderIntakeService.receiveOrder({
      externalOrderNumber: 'ORD-TEST-11', source: 'manual',
      externalAssigningAuthority: realAssigningAuthority,
      patient: { firstName: 'Test', lastName: 'Patient' },
      requestingProvider: { rawName: 'Dr. Real Genuine Physician', namePrefix: 'Dr.', givenNames: 'Real Genuine', familyNames: 'Physician' },
      specimens: [{ description: 'Test specimen' }],
    });
    if (!orderRes.ok) throw new Error('setup failed');

    const resolved = await mockOrderIntakeService.resolveOrder(orderRes.data.id);
    // Real, honest: order resolution itself always succeeds regardless
    // of physician-resolution outcome - the fail-open guarantee this
    // whole function is built around.
    expect(resolved.ok).toBe(true);
  });
});
