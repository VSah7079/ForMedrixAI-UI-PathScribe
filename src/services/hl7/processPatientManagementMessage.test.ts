// src/services/hl7/processPatientManagementMessage.test.ts
import { describe, it, expect } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { processPatientManagementMessage } = await import('./processPatientManagementMessage');
const { mockPatientIndexService } = await import('../patients/mockPatientIndexService');
const { mockEncounterService } = await import('../encounters/mockEncounterService');
const { mockInterfaceExceptionService } = await import('../interfaceExceptions/mockInterfaceExceptionService');
const { caseRouter } = await import('../cases/CaseRouter');
const { mockMessageService } = await import('../messages/mockMessageService');

// Real fix, per the established discipline learned in
// processAdtMessage.test.ts and re-applied here after initially
// forgetting it: every test uses its own genuinely unique NAME, not
// just a unique MRN - there's no per-test reset, so reusing a name
// across unrelated tests correctly (not incorrectly) triggers the
// real "name+DOB match under a different MRN" ambiguous path against
// an EARLIER test's own records.
function buildA40(targetMrn: string, targetAuth: string, name: string, sourceMrn: string, sourceAuth: string): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A40|MSG001|P|2.5',
    'EVN||202601150800',
    `PID|1||${targetMrn}^^^${targetAuth}^MR||${name}||19850601|M`,
    `MRG|${sourceMrn}^^^${sourceAuth}^MR`,
  ].join('\r');
}

function buildA24(targetMrn: string, targetAuth: string, name: string, sourceMrn: string, sourceAuth: string): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A24|MSG002|P|2.5',
    'EVN||202601150800',
    `PID|1||${targetMrn}^^^${targetAuth}^MR||${name}||19850601|M`,
    `MRG|${sourceMrn}^^^${sourceAuth}^MR`,
  ].join('\r');
}

function buildA47(newMrn: string, newAuth: string, name: string, oldMrn: string, oldAuth: string): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A47|MSG003|P|2.5',
    'EVN||202601150800',
    `PID|1||${newMrn}^^^${newAuth}^MR||${name}||19850601|M`,
    `MRG|${oldMrn}^^^${oldAuth}^MR`,
  ].join('\r');
}

// Real feature, per direct architecture confirmation. MRG-5 field
// position verified programmatically before use (same rigor as every
// other fixture in this codebase): MRG|sourceId||||priorVisitNumber —
// 4 empty fields between MRG-1 and MRG-5 (components 2/3/4 unused
// here, matching how patientManagementParser.ts only ever reads
// MRG-1 and MRG-7 besides this).
function buildA43(targetMrn: string, targetAuth: string, name: string, sourceMrn: string, sourceAuth: string, priorVisitNumber?: string): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601161200|CHARRIS|ADT^A43|MSG-A43|P|2.5',
    'EVN||202601161200',
    `PID|1||${targetMrn}^^^${targetAuth}^MR||${name}||19850601|M`,
    `MRG|${sourceMrn}^^^${sourceAuth}^MR||||${priorVisitNumber ?? ''}`,
  ].join('\r');
}

describe('processPatientManagementMessage — real fix, the actual point of Phase 2: real inbound merge/link/change-identifier events resolve through the SAME real operations the human review UI already uses', () => {
  it('a real A40 genuinely merges two real, separate identities - repointing real cases, same as the human "Merge into this patient" action', async () => {
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A40-TARGET', assigningAuthority: 'MAIN', firstName: 'JOHN', lastName: 'A40TARGET', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    if (targetRes.outcome === 'ambiguous') throw new Error('setup produced an ambiguous target record unexpectedly');
    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A40-SOURCE', assigningAuthority: 'MAIN', firstName: 'JOHN', lastName: 'A40SOURCE', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    if (sourceRes.outcome === 'ambiguous') throw new Error('setup produced an ambiguous source record unexpectedly');

    // The real A40 message's own PID name doesn't need to match the
    // setup calls' names exactly - the merge operation resolves by
    // (authority, mrn) via the crosswalk, which already know both
    // real ids from setup above.
    const result = await processPatientManagementMessage(
      buildA40('MRN-A40-TARGET', 'MAIN', 'A40TARGET^JOHN', 'MRN-A40-SOURCE', 'MAIN'), 'ORG-A'
    );
    expect(result.eventType).toBe('A40');
    expect(result.patientId).toBe(targetRes.patientId);

    // Real, confirmed HL7 A40 semantics: the source record is kept
    // (not deleted) but marked as merged - never a valid, standalone
    // match target going forward.
    const sourceRecord = await mockPatientIndexService.getById(sourceRes.patientId);
    expect(sourceRecord?.mergedInto).toBe(targetRes.patientId);
  });

  it('a real A24 links two real, separate identities - BOTH stay independently active, never merged', async () => {
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A24-TARGET', assigningAuthority: 'MAIN', firstName: 'JOHN', lastName: 'A24TARGET', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A24-SOURCE', assigningAuthority: 'PAYER', firstName: 'JOHN', lastName: 'A24SOURCE', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    if (targetRes.outcome === 'ambiguous' || sourceRes.outcome === 'ambiguous') throw new Error('setup produced an ambiguous record unexpectedly');

    const result = await processPatientManagementMessage(
      buildA24('MRN-A24-TARGET', 'MAIN', 'A24PERSON^JOHN', 'MRN-A24-SOURCE', 'PAYER'), 'ORG-A'
    );
    expect(result.eventType).toBe('A24');

    const linked = await mockPatientIndexService.getLinkedPatientIds(result.patientId!, 'same_person');
    expect(linked.length).toBe(2); // target + source, genuinely linked, not merged into one

    for (const id of linked) {
      const record = await mockPatientIndexService.getById(id);
      expect(record?.mergedInto).toBeUndefined(); // real, critical distinction from A40
    }
  });

  it('a real A47 resolves via the OLD (MRG) identifier and records the NEW (PID) one for the SAME real patientId - never creates a second, separate identity', async () => {
    const originalRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A47-OLD', assigningAuthority: 'MAIN', firstName: 'JOHN', lastName: 'A47PERSON', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    if (originalRes.outcome === 'ambiguous') throw new Error('setup produced an ambiguous record unexpectedly');

    const result = await processPatientManagementMessage(
      buildA47('MRN-A47-NEW', 'MAIN', 'A47PERSON^JOHN', 'MRN-A47-OLD', 'MAIN'), 'ORG-A'
    );
    expect(result.eventType).toBe('A47');
    expect(result.patientId).toBe(originalRes.patientId); // the SAME real person, not a new identity

    const identifiers = await mockPatientIndexService.listIdentifiersForPatient(originalRes.patientId);
    expect(identifiers.map(i => i.identifierValue)).toContain('MRN-A47-NEW');
  });

  it('after a real A47, a later order under the NEW identifier resolves directly to the same real, existing patient', async () => {
    await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A47B-OLD', assigningAuthority: 'MAIN', firstName: 'JANE', lastName: 'A47BPERSON', dateOfBirth: '1970-01-01T00:00:00.000Z',
    });
    const a47Result = await processPatientManagementMessage(
      buildA47('MRN-A47B-NEW', 'MAIN', 'A47BPERSON^JANE', 'MRN-A47B-OLD', 'MAIN'), 'ORG-A'
    );

    const laterOrder = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A47B-NEW', assigningAuthority: 'MAIN', firstName: 'JANE', lastName: 'A47BPERSON', dateOfBirth: '1970-01-01T00:00:00.000Z',
    });
    expect(laterOrder.outcome).toBe('matched');
    expect(laterOrder.patientId).toBe(a47Result.patientId);
  });
});

describe('processPatientManagementMessage — real feature, per direct architecture confirmation: ADT^A43 (Move Patient Information)', () => {
  async function setupSourceAndTarget(suffix: string) {
    const sourceRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: `MRN-A43SRC-${suffix}`, assigningAuthority: 'MAIN',
      firstName: 'SOURCE', lastName: `A43SRC${suffix}`, dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: `MRN-A43TGT-${suffix}`, assigningAuthority: 'MAIN',
      firstName: 'TARGET', lastName: `A43TGT${suffix}`, dateOfBirth: '1990-01-01T00:00:00.000Z',
    });
    if (sourceRes.outcome === 'ambiguous' || targetRes.outcome === 'ambiguous') {
      throw new Error('setup produced an ambiguous record unexpectedly');
    }
    return { sourcePatientId: sourceRes.patientId, targetPatientId: targetRes.patientId };
  }

  // Real, minimal setup: repurposes a real, existing seeded Case
  // rather than constructing a full Case object from scratch — sets
  // its encounterId and patient.id directly via the same real
  // updateCase() every other real write in this app already uses.
  async function setupCaseUnderEncounter(sourcePatientId: string, encounterNumber: string): Promise<string> {
    const encounterRes = await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: sourcePatientId, encounterNumber, encounterClass: 'Inpatient',
    });
    if (!encounterRes.ok) throw new Error('setup could not create a real encounter');

    const allCases = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
    if (!allCases.ok) throw new Error('setup could not fetch real, existing cases');
    const anyCase = (allCases.data as any[])[0];
    if (!anyCase) throw new Error('setup found no real, existing case to repurpose');

    await caseRouter.updateCase(anyCase.id, { encounterId: encounterRes.data.id, patient: { ...anyCase.patient, id: sourcePatientId } } as any, anyCase.version);
    return anyCase.id;
  }

  it('a real A43 moves the real, specific Case matched via MRG-5 — the source patient stays independently active, never merged or retired', async () => {
    const { sourcePatientId, targetPatientId } = await setupSourceAndTarget('OK');
    const caseId = await setupCaseUnderEncounter(sourcePatientId, 'FIN-A43-OK');

    const result = await processPatientManagementMessage(
      buildA43(`MRN-A43TGT-OK`, 'MAIN', 'A43TGTOK^TARGET', `MRN-A43SRC-OK`, 'MAIN', 'FIN-A43-OK'), 'ORG-A'
    );
    expect(result.eventType).toBe('A43');
    expect(result.caseMoved).toBe(true);
    expect(result.movedCaseId).toBe(caseId);
    expect(result.patientId).toBe(targetPatientId);

    // Real, load-bearing distinction from A40: the source patient
    // record is NOT merged/retired.
    const sourceRecord = await mockPatientIndexService.getById(sourcePatientId);
    expect(sourceRecord?.mergedInto).toBeUndefined();

    const movedCase = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
    if (!movedCase.ok) throw new Error('verification could not fetch real cases');
    const found = (movedCase.data as any[]).find(c => c.id === caseId);
    expect(found?.patient?.id).toBe(targetPatientId);
  });

  it('a real A43 with no MRG-5 routes to the real Interface Exception Queue — never auto-moves anything on a guess', async () => {
    const { sourcePatientId } = await setupSourceAndTarget('NOMRG5');
    await setupCaseUnderEncounter(sourcePatientId, 'FIN-A43-NOMRG5');

    const result = await processPatientManagementMessage(
      buildA43('MRN-A43TGT-NOMRG5', 'MAIN', 'A43TGTNOMRG5^TARGET', 'MRN-A43SRC-NOMRG5', 'MAIN', undefined), 'ORG-A'
    );
    expect(result.eventType).toBe('A43');
    expect(result.caseMoved).toBe(false);
    expect(result.routedToExceptionQueue).toBeDefined();

    const pending = await mockInterfaceExceptionService.getPending();
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    const match = pending.data.find(e => e.eventType === 'A43' && e.reason.includes('No MRG-5'));
    expect(match).toBeDefined();
  });

  it('a real A43 whose MRG-5 matches no real Encounter routes to the exception queue', async () => {
    await setupSourceAndTarget('NOENC');
    const result = await processPatientManagementMessage(
      buildA43('MRN-A43TGT-NOENC', 'MAIN', 'A43TGTNOENC^TARGET', 'MRN-A43SRC-NOENC', 'MAIN', 'FIN-DOES-NOT-EXIST'), 'ORG-A'
    );
    expect(result.caseMoved).toBe(false);
    expect(result.routedToExceptionQueue).toContain('does not match any known Encounter');
  });

  it('a real A43 whose MRG-5 matches a real Encounter but no linked Case routes to the exception queue', async () => {
    const { sourcePatientId } = await setupSourceAndTarget('NOCASE');
    // Real Encounter created, but deliberately no Case ever linked to it.
    await mockEncounterService.resolveOrCreateEncounter({
      organisationId: 'ORG-A', patientId: sourcePatientId, encounterNumber: 'FIN-A43-NOCASE', encounterClass: 'Inpatient',
    });
    const result = await processPatientManagementMessage(
      buildA43('MRN-A43TGT-NOCASE', 'MAIN', 'A43TGTNOCASE^TARGET', 'MRN-A43SRC-NOCASE', 'MAIN', 'FIN-A43-NOCASE'), 'ORG-A'
    );
    expect(result.caseMoved).toBe(false);
    expect(result.routedToExceptionQueue).toContain('no Case is linked');
  });

  it('real feature, per direct confirmation: routing to the exception queue sends a real, urgent message to every real Clinical Admin — never a raw Admin with no clinical standing', async () => {
    await setupSourceAndTarget('NOTIFY');
    await processPatientManagementMessage(
      buildA43('MRN-A43TGT-NOTIFY', 'MAIN', 'A43TGTNOTIFY^TARGET', 'MRN-A43SRC-NOTIFY', 'MAIN', undefined), 'ORG-A'
    );

    // PATH-001 (Pete Nimmo) is a real, seeded Clinical Admin —
    // Pathologist + Admin together.
    const inbox = await mockMessageService.getInbox('PATH-001');
    expect(inbox.ok).toBe(true);
    if (!inbox.ok) return;
    const urgentMsg = inbox.data.find(m => m.subject.includes('Interface Exception'));
    expect(urgentMsg).toBeDefined();
    expect(urgentMsg?.isUrgent).toBe(true);
    expect(urgentMsg?.configLink).toBe('/audit?tab=errors&pill=interfaces');
  });
});

describe('processPatientManagementMessage — Phase A, per direct architecture confirmation: the Interface Exception & Case-Binding Module. A40/A24/A47/A43 all deal with identities the sending system claims are ALREADY known — none of them should ever silently fabricate a new one.', () => {
  it('a real, confirmed bug fix: an A40 whose source (MRG-1) references an identifier this LIS has never seen routes to the exception queue — it no longer fabricates a new patient record and merges it away', async () => {
    const targetRes = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A40-FAB-TARGET', assigningAuthority: 'MAIN', firstName: 'REAL', lastName: 'TARGET', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    if (targetRes.outcome === 'ambiguous') throw new Error('setup produced an ambiguous record unexpectedly');

    const result = await processPatientManagementMessage(
      buildA40('MRN-A40-FAB-TARGET', 'MAIN', 'REAL^TARGET', 'MRN-A40-FAB-UNKNOWN-SOURCE', 'UNKNOWN_AUTHORITY'), 'ORG-A'
    );
    expect(result.eventType).toBe('A40');
    expect(result.patientId).toBeUndefined();
    expect(result.routedToExceptionQueue).toContain('source (MRG-1)');

    // The real, load-bearing assertion: the target record was NEVER
    // merged into anything — a real bug before this fix would have
    // fabricated a new source record and then genuinely merged it,
    // silently corrupting the target's own case history.
    const targetRecord = await mockPatientIndexService.getById(targetRes.patientId);
    expect(targetRecord?.mergedInto).toBeUndefined();
  });

  it('the fabricated record resolveOrCreatePatient() creates as a byproduct is flagged for review, not silently orphaned', async () => {
    await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A40-FLAG-TARGET', assigningAuthority: 'MAIN', firstName: 'REAL', lastName: 'FLAGTARGET', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });

    // Real, unique MRG-7 source name (field position verified
    // programmatically) — without this, the source's name/DOB default
    // to genuinely empty, which the real name+DOB candidate matcher
    // would treat as ambiguous against ANY other test's own
    // empty-named fixture, not the real 'created' outcome this test
    // means to exercise.
    const a40WithSourceName = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A40|MSG-FLAGTEST|P|2.5',
      'EVN||202601150800',
      'PID|1||MRN-A40-FLAG-TARGET^^^MAIN^MR||REAL^FLAGTARGET||19850601|M',
      'MRG|MRN-A40-FLAG-UNKNOWN^^^UNKNOWN_AUTHORITY_FLAG^MR||||||UNIQUEFLAGSOURCE^JANE',
    ].join('\r');
    await processPatientManagementMessage(a40WithSourceName, 'ORG-A');

    // The orphaned record fabricated for the unrecognized source
    // identifier should exist (resolveOrCreatePatient's own real
    // behavior) but be honestly flagged, not silently un-reviewable.
    // Uses the precise crosswalk lookup, not resolveOrCreatePatient
    // again — a second name+DOB candidate search would be its own
    // separate, fragile match attempt.
    const foundId = await mockPatientIndexService.resolveByIdentifier('UNKNOWN_AUTHORITY_FLAG', 'MRN-A40-FLAG-UNKNOWN');
    expect(foundId).not.toBeNull();
    const record = await mockPatientIndexService.getById(foundId!);
    expect(record?.needsReview).toBe(true);
    expect(record?.reviewReason).toContain('byproduct');
  });

  it('a real A24 whose target (PID) references an unrecognized identifier routes to the exception queue', async () => {
    await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A', mrn: 'MRN-A24-FAB-SOURCE', assigningAuthority: 'PAYER', firstName: 'REAL', lastName: 'A24FABSOURCE', dateOfBirth: '1985-06-01T00:00:00.000Z',
    });
    const result = await processPatientManagementMessage(
      buildA24('MRN-A24-FAB-UNKNOWN-TARGET', 'UNKNOWN_AUTHORITY_A24', 'UNKNOWN^TARGET', 'MRN-A24-FAB-SOURCE', 'PAYER'), 'ORG-A'
    );
    expect(result.patientId).toBeUndefined();
    expect(result.routedToExceptionQueue).toContain('target (PID)');
  });

  it('a real A47 whose OLD identifier (MRG-1) is unrecognized routes to the exception queue — never fabricates a record just to attach the corrected identifier to it', async () => {
    const result = await processPatientManagementMessage(
      buildA47('MRN-A47-FAB-NEW', 'MAIN', 'UNKNOWN^PERSON', 'MRN-A47-FAB-UNKNOWN-OLD', 'UNKNOWN_AUTHORITY_A47'), 'ORG-A'
    );
    expect(result.patientId).toBeUndefined();
    expect(result.routedToExceptionQueue).toContain('OLD identifier');
  });

  it('a real A43 whose source or target identifier is unrecognized routes to the exception queue — a new failure mode beyond MRG-5 checks alone', async () => {
    const result = await processPatientManagementMessage(
      buildA43('MRN-A43-FAB-UNKNOWN-TGT', 'UNKNOWN_AUTHORITY_A43', 'UNKNOWN^TGT', 'MRN-A43-FAB-UNKNOWN-SRC', 'UNKNOWN_AUTHORITY_A43B', 'FIN-DOESNT-MATTER'), 'ORG-A'
    );
    expect(result.caseMoved).toBe(false);
    expect(result.patientId).toBeUndefined();
    expect(result.routedToExceptionQueue).toContain('Neither the target');
  });
});
