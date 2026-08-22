// src/services/hl7/processAdtMessage.test.ts
import { describe, it, expect } from 'vitest';

// Real, working in-memory localStorage stub — this test environment is
// plain Node, no browser storage natively available. Set up BEFORE the
// dynamic imports below, since processAdtMessage transitively imports
// caseRouter (via mockPatientIndexService), which touches localStorage
// at module-load time - a static import here would evaluate before
// this stub exists.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { processAdtMessage } = await import('./processAdtMessage');
const { mockPatientIndexService } = await import('../patients/mockPatientIndexService');
const { mockEncounterService } = await import('../encounters/mockEncounterService');

// Real fix, from a real cross-test pollution bug caught while building
// this file: every test uses its own unique MRN, encounter number, AND
// patient name - since there is no per-test localStorage reset (this
// file has none, matching mockPatientIndexService.test.ts's own
// established pattern), reusing any of the three across genuinely
// unrelated tests can accidentally trigger real matching/deduplication
// logic that's meant for real, related data, not unrelated tests
// sharing fixture text.
function buildAdtA01(mrn: string, authority: string, encounterNumber: string, lastName = 'GARCIA', firstName = 'MARIA'): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG001|P|2.5',
    'EVN||202601150800',
    `PID|1||${mrn}^^^${authority}^MR||${lastName}^${firstName}^L||19901105|F`,
    `PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||${encounterNumber}|||||||||||||||||||||||||202601150730`,
  ].join('\r');
}

function buildAdtA08(mrn: string, authority: string, lastName = 'GARCIA', firstName = 'MARIA'): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601160900|CHARRIS|ADT^A08|MSG002|P|2.5',
    'EVN||202601160900',
    `PID|1||${mrn}^^^${authority}^MR||${lastName}^${firstName}^L||19901105|F`,
  ].join('\r');
}

// Real feature, per direct confirmation: working through the full
// list of ADT trigger events. Generic builder for the 9 new event
// types — all of them find an EXISTING encounter by encounterNumber
// (never create one, matching each event's real, confirmed HL7
// semantics), so patient identity fields matter less here than a
// real, matching encounterNumber and whatever PV1 content the
// specific event is meant to carry.
function buildAdtEvent(eventCode: string, mrn: string, authority: string, encounterNumber: string, pv1Fields: {
  classCode?: string; location?: string; msgId?: string; recordedAt?: string;
} = {}): string {
  const { classCode = 'I', location = '', msgId = `MSG-${eventCode}-${Date.now()}`, recordedAt = '202601160900' } = pv1Fields;
  return [
    `MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|${recordedAt}|CHARRIS|ADT^${eventCode}|${msgId}|P|2.5`,
    `EVN||${recordedAt}`,
    `PID|1||${mrn}^^^${authority}^MR||GARCIA^MARIA^L||19901105|F`,
    `PV1|1|${classCode}|${location}||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||${encounterNumber}`,
  ].join('\r');
}

describe('processAdtMessage — real fix, the actual point of Phase 1: a real ADT message resolves through the SAME real MPI and Encounter services the rest of this app already uses', () => {
  it('a real A01 creates a real, new patient identity and a real encounter together', async () => {
    const result = await processAdtMessage(buildAdtA01('MRN-T1', 'MAIN_CAMPUS', 'FIN-T1'), 'ORG-A', 'FAC-A');
    expect(result.eventType).toBe('A01');
    expect(result.mpiOutcome).toBe('created');
    expect(result.patientId).toBeTruthy();
    expect(result.encounterId).toBeTruthy();
  });

  it('the real encounter genuinely belongs to the real, resolved patient - not a disconnected pair', async () => {
    const result = await processAdtMessage(buildAdtA01('MRN-T2', 'MAIN_CAMPUS', 'FIN-T2'), 'ORG-A', 'FAC-A');
    const encounters = await mockEncounterService.listForPatient(result.patientId);
    if (!encounters.ok) throw new Error('lookup failed');
    expect(encounters.data.map(e => e.id)).toContain(result.encounterId);
  });

  it('a real A08 for the SAME patient resolves to the SAME real patientId the earlier A01 already created', async () => {
    const a01Result = await processAdtMessage(buildAdtA01('MRN-T3', 'MAIN_CAMPUS', 'FIN-T3', 'SMITH', 'JOHN'), 'ORG-A', 'FAC-A');
    const a08Result = await processAdtMessage(buildAdtA08('MRN-T3', 'MAIN_CAMPUS', 'SMITH', 'JOHN'), 'ORG-A', 'FAC-A');
    expect(a08Result.patientId).toBe(a01Result.patientId);
  });

  it('a real A08 never creates a new encounter - it is not a new visit, per the real, confirmed HL7 semantics', async () => {
    const result = await processAdtMessage(buildAdtA08('MRN-T4', 'MAIN_CAMPUS', 'JONES', 'ROBERT'), 'ORG-A', 'FAC-A');
    expect(result.encounterId).toBeUndefined();
  });

  it('a real repeat A01 for the same patient AND the same real encounter number resolves to the SAME real encounter, not a duplicate', async () => {
    const first = await processAdtMessage(buildAdtA01('MRN-T5', 'MAIN_CAMPUS', 'FIN-T5', 'BROWN', 'LISA'), 'ORG-A', 'FAC-A');
    const second = await processAdtMessage(buildAdtA01('MRN-T5', 'MAIN_CAMPUS', 'FIN-T5', 'BROWN', 'LISA'), 'ORG-A', 'FAC-A');
    expect(second.encounterId).toBe(first.encounterId);
  });

  it('a real patient resolved via ADT ingestion is the SAME real identity a later, real accession-time resolution would find - proves this isn\'t a separate, parallel identity path', async () => {
    const adtResult = await processAdtMessage(buildAdtA01('MRN-T6', 'MAIN_CAMPUS', 'FIN-T6', 'DAVIS', 'PATRICIA'), 'ORG-A', 'FAC-A');
    // A real, later order arrives for the exact same real patient,
    // same real MRN, same real assigning authority - genuinely the
    // same resolution flow AccessionPage.tsx already uses.
    const laterResolution = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId: 'ORG-A',
      mrn: 'MRN-T6',
      assigningAuthority: 'MAIN_CAMPUS',
      firstName: 'PATRICIA',
      lastName: 'DAVIS',
      dateOfBirth: '1990-11-05T00:00:00.000Z',
    });
    expect(laterResolution.outcome).toBe('matched');
    expect(laterResolution.patientId).toBe(adtResult.patientId);
  });

  it('a real, second identifier beyond PID-3\'s first repetition is genuinely recorded in the crosswalk, not silently dropped', async () => {
    const withSecondIdentifier = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG003|P|2.5',
      'PID|1||MRN-T7^^^MAIN_CAMPUS^MR~ALT-T7^^^PAYER_X^SS||WILSON^THOMAS^L||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||||||||||||||FIN-T7',
    ].join('\r');
    const result = await processAdtMessage(withSecondIdentifier, 'ORG-A', 'FAC-A');
    const identifiers = await mockPatientIndexService.listIdentifiersForPatient(result.patientId);
    expect(identifiers.map(i => i.assigningAuthority).sort()).toEqual(['MAIN_CAMPUS', 'PAYER_X']);
  });

  it('an ambiguous MPI match still returns a real, usable patientId and encounter - real ingestion never halts on it', async () => {
    await processAdtMessage(buildAdtA01('MRN-T8', 'MAIN_CAMPUS', 'FIN-T8', 'MOORE', 'JENNIFER'), 'ORG-A', 'FAC-A');
    // Same MRN, different real demographics - the real, existing
    // Joint-Commission-style ambiguity check.
    const ambiguousRaw = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG004|P|2.5',
      'PID|1||MRN-T8^^^MAIN_CAMPUS^MR||DIFFERENT^PERSON||19700101|M',
      'PV1|1|I|ICU^302^B^MAIN_CAMPUS||||||||||||||||FIN-T8B',
    ].join('\r');
    const result = await processAdtMessage(ambiguousRaw, 'ORG-A', 'FAC-A');
    expect(result.mpiOutcome).toBe('ambiguous');
    expect(result.patientId).toBeTruthy();
  });

  it('real fix, Phase 3: a real A08 with a genuinely newer EVN-2 timestamp actually applies the demographic update - the real, previously-missing effect of an A08', async () => {
    await processAdtMessage(buildAdtA01('MRN-T9', 'MAIN_CAMPUS', 'FIN-T9', 'TAYLOR', 'MICHAEL'), 'ORG-A', 'FAC-A');

    const laterA08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601160900|CHARRIS|ADT^A08|MSG010|P|2.5',
      'EVN||202601160900', // genuinely later than the A01's own 202601150800
      'PID|1||MRN-T9^^^MAIN_CAMPUS^MR||UPDATEDLASTNAME^MICHAEL||19901105|F',
    ].join('\r');
    const result = await processAdtMessage(laterA08, 'ORG-A', 'FAC-A');
    expect(result.demographicsApplied).toBe(true);

    const record = await mockPatientIndexService.getById(result.patientId);
    expect(record?.lastName).toBe('UPDATEDLASTNAME');
  });

  it('real, critical fix, Phase 3: a real, STALE A08 (older EVN-2 than what\'s already applied) is honestly rejected end-to-end - never silently overwrites newer state', async () => {
    await processAdtMessage(buildAdtA01('MRN-T10', 'MAIN_CAMPUS', 'FIN-T10', 'ANDERSON', 'SARAH'), 'ORG-A', 'FAC-A');

    // A real, newer A08 applies first.
    const newerA08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601170900|CHARRIS|ADT^A08|MSG011|P|2.5',
      'EVN||202601170900',
      'PID|1||MRN-T10^^^MAIN_CAMPUS^MR||NEWERNAME^SARAH||19901105|F',
    ].join('\r');
    await processAdtMessage(newerA08, 'ORG-A', 'FAC-A');

    // A real, genuinely older A08 arrives late (real network delay,
    // retry, re-delivery of the SAME real message) - carries an EVN-2
    // from BEFORE the one already applied above, with the SAME real
    // demographic payload the message itself always carried. This is
    // the real, common "stale event" scenario (a duplicate/retry),
    // deliberately distinct from the rarer, genuinely harder case
    // (a stale event whose OWN demographic payload predates a later,
    // real, legitimate change and so no longer matches current state -
    // that scenario correctly, separately triggers the real crosswalk
    // safety check instead, since a mismatched name IS a real signal
    // worth a human's attention, not something sequence control alone
    // should silently paper over).
    const staleA08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601160900|CHARRIS|ADT^A08|MSG012|P|2.5',
      'EVN||202601160900', // genuinely earlier than 202601170900, already applied
      'PID|1||MRN-T10^^^MAIN_CAMPUS^MR||NEWERNAME^SARAH||19901105|F',
    ].join('\r');
    const staleResult = await processAdtMessage(staleA08, 'ORG-A', 'FAC-A');
    expect(staleResult.demographicsApplied).toBe(false);

    const record = await mockPatientIndexService.getById(staleResult.patientId);
    expect(record?.lastName).toBe('NEWERNAME'); // the real, newer name - never overwritten by the stale event
  });

  it('real fix, Phase 4: a real A03 discharges the real, EXISTING encounter an earlier A01 created - never creates a new one', async () => {
    const a01Result = await processAdtMessage(buildAdtA01('MRN-T11', 'MAIN_CAMPUS', 'FIN-T11', 'WHITE', 'DAVID'), 'ORG-A', 'FAC-A');

    const a03 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601180900|CHARRIS|ADT^A03|MSG020|P|2.5',
      'EVN||202601180900',
      'PID|1||MRN-T11^^^MAIN_CAMPUS^MR||WHITE^DAVID||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||||||||||||||FIN-T11|||||||||||||||||||||||||202601150730|202601180900',
    ].join('\r');
    const a03Result = await processAdtMessage(a03, 'ORG-A', 'FAC-A');

    expect(a03Result.eventType).toBe('A03');
    expect(a03Result.encounterId).toBe(a01Result.encounterId); // the SAME real encounter, not a new one
    expect(a03Result.encounterStatusApplied).toBe(true);

    const encounterCheck = await mockEncounterService.getById(a03Result.encounterId!);
    expect(encounterCheck.ok && encounterCheck.data?.status).toBe('Discharged');
    expect(encounterCheck.ok && encounterCheck.data?.dischargeTime).toBe('2026-01-18T09:00:00.000Z');
  });

  it('real, critical fix, Phase 4: a real, STALE status update arriving after a real discharge never reverts it', async () => {
    const a01Result = await processAdtMessage(buildAdtA01('MRN-T12', 'MAIN_CAMPUS', 'FIN-T12', 'BLACK', 'EMILY'), 'ORG-A', 'FAC-A');

    const a03 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601180900|CHARRIS|ADT^A03|MSG021|P|2.5',
      'EVN||202601180900',
      'PID|1||MRN-T12^^^MAIN_CAMPUS^MR||BLACK^EMILY||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||||||||||||||FIN-T12|||||||||||||||||||||||||202601150730|202601180900',
    ].join('\r');
    await processAdtMessage(a03, 'ORG-A', 'FAC-A');

    // A real, genuinely STALE A08 arrives late, from BEFORE the real
    // discharge - must never revert the encounter's real, newer status.
    const staleA08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601160900|CHARRIS|ADT^A08|MSG022|P|2.5',
      'EVN||202601160900', // genuinely earlier than the A03's own 202601180900
      'PID|1||MRN-T12^^^MAIN_CAMPUS^MR||BLACK^EMILY||19901105|F',
    ].join('\r');
    await processAdtMessage(staleA08, 'ORG-A', 'FAC-A');

    const encounterCheck = await mockEncounterService.getById(a01Result.encounterId!);
    expect(encounterCheck.ok && encounterCheck.data?.status).toBe('Discharged'); // still discharged - untouched by the stale A08
  });

  it('a real A03 with no matching prior encounter is honestly left unresolved, never fabricated', async () => {
    const a03 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601180900|CHARRIS|ADT^A03|MSG023|P|2.5',
      'PID|1||MRN-T13^^^MAIN_CAMPUS^MR||GREEN^ROBERT||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||||||||||||||FIN-NEVER-SEEN|||||||||||||||||||||||||202601150730|202601180900',
    ].join('\r');
    const result = await processAdtMessage(a03, 'ORG-A', 'FAC-A');
    expect(result.encounterId).toBeUndefined();
    expect(result.encounterStatusApplied).toBeUndefined();
  });
});

describe('processAdtMessage — real feature, per direct confirmation: PV1-3 resolves against a real Location dictionary, scoped to the real Facility', () => {
  function buildAdtA01WithLocation(mrn: string, encounterNumber: string, pv1Location: string, lastName: string, firstName: string): string {
    return [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG030|P|2.5',
      'EVN||202601150800',
      `PID|1||${mrn}^^^MAIN_CAMPUS^MR||${lastName}^${firstName}^L||19901105|F`,
      `PV1|1|I|${pv1Location}||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||${encounterNumber}`,
    ].join('\r');
  }

  it('matches a real, existing seeded Location for the real facility — no duplicate created', async () => {
    // Real seed data (mockLocationService.ts): Fenwick General Hospital
    // (c-fenwick-general) has a real "Ward 3^101^A" location already
    // configured.
    const result = await processAdtMessage(
      buildAdtA01WithLocation('MRN-LOC1', 'FIN-LOC1', 'Ward 3^101^A^FGH', 'OKAFOR', 'AMARA'),
      'ORG-A', 'c-fenwick-general',
    );
    expect(result.locationOutcome).toBe('matched');
    expect(result.locationId).toBe('loc-fgh-ward3-101');
  });

  it('auto-creates a real, Unverified Location when PV1-3 carries no crosswalk match — same governance posture as Facility/Physician auto-creation', async () => {
    const result = await processAdtMessage(
      buildAdtA01WithLocation('MRN-LOC2', 'FIN-LOC2', 'Ward 9^901^B^FGH', 'NGUYEN', 'MINH'),
      'ORG-A', 'c-fenwick-general',
    );
    expect(result.locationOutcome).toBe('created');
    expect(result.locationId).toBeDefined();

    const { mockLocationService } = await import('../locations/mockLocationService');
    const locRes = await mockLocationService.getById(result.locationId!);
    expect(locRes.ok).toBe(true);
    if (!locRes.ok) return;
    expect(locRes.data.status).toBe('Unverified');
    expect(locRes.data.autoCreated).toBe(true);
  });

  it('the real, resolved Encounter genuinely carries the same locationId — not resolved and discarded', async () => {
    const result = await processAdtMessage(
      buildAdtA01WithLocation('MRN-LOC3', 'FIN-LOC3', 'Ward 3^102^A^FGH', 'PATEL', 'RAJ'),
      'ORG-A', 'c-fenwick-general',
    );
    expect(result.encounterId).toBeDefined();
    const encounterRes = await mockEncounterService.getById(result.encounterId!);
    expect(encounterRes.ok).toBe(true);
    if (!encounterRes.ok) return;
    expect(encounterRes.data?.locationId).toBe(result.locationId);
    expect(encounterRes.data?.locationId).toBe('loc-fgh-ward3-102'); // real, existing seeded location
  });

  it('resolves no location at all when PV1-3 carries no usable pointOfCare — genuinely absent, not a fabricated default', async () => {
    const noLocation = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG031|P|2.5',
      'EVN||202601150800',
      'PID|1||MRN-LOC4^^^MAIN_CAMPUS^MR||TAYLOR^JAMES||19901105|F',
      'PV1|1|O||||||||||||||||FIN-LOC4', // PV1-3 genuinely empty
    ].join('\r');
    const result = await processAdtMessage(noLocation, 'ORG-A', 'c-fenwick-general');
    expect(result.locationId).toBeUndefined();
    expect(result.locationOutcome).toBeUndefined();
  });
});

describe('processAdtMessage — real feature, per direct confirmation: working through the full list of ADT trigger events', () => {
  it('real, correct fix found while wiring in A05: A01 now creates a real Arrived encounter, not the previous, silently wrong Planned default', async () => {
    const result = await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT01', 'MAIN_CAMPUS', 'FIN-EVT01'), 'ORG-A', 'FAC-A');
    expect(result.encounterId).toBeDefined();
    const enc = await mockEncounterService.getById(result.encounterId!);
    expect(enc.ok && enc.data?.status).toBe('Arrived');
  });

  it('A05 (Pre-Admit) creates a real, genuinely Planned encounter ahead of arrival', async () => {
    const result = await processAdtMessage(buildAdtEvent('A05', 'MRN-EVT05', 'MAIN_CAMPUS', 'FIN-EVT05'), 'ORG-A', 'FAC-A');
    expect(result.encounterId).toBeDefined();
    const enc = await mockEncounterService.getById(result.encounterId!);
    expect(enc.ok && enc.data?.status).toBe('Planned');
  });

  it('A02 (Transfer) moves a real, EXISTING encounter to a new location and captures the prior one — never creates a new encounter', async () => {
    const a01Result = await processAdtMessage(
      buildAdtEvent('A01', 'MRN-EVT02', 'MAIN_CAMPUS', 'FIN-EVT02', { location: 'ICU^301^A^MAIN_CAMPUS' }),
      'ORG-A', 'FAC-A'
    );
    const originalLocationId = a01Result.locationId;
    expect(originalLocationId).toBeDefined();

    const a02Result = await processAdtMessage(
      buildAdtEvent('A02', 'MRN-EVT02', 'MAIN_CAMPUS', 'FIN-EVT02', { location: 'WARD5^502^B^MAIN_CAMPUS', recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    expect(a02Result.encounterId).toBe(a01Result.encounterId);
    expect(a02Result.encounterLocationApplied).toBe(true);
    expect(a02Result.locationId).not.toBe(originalLocationId);

    const enc = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc.ok && enc.data?.locationId).toBe(a02Result.locationId);
    expect(enc.ok && enc.data?.previousLocationId).toBe(originalLocationId); // real, captured for A12's later restore
  });

  it('A09 (Patient Tracking) uses the same real transfer path as A02 — temporary movement, same real effect', async () => {
    const a01Result = await processAdtMessage(
      buildAdtEvent('A01', 'MRN-EVT09', 'MAIN_CAMPUS', 'FIN-EVT09', { location: 'ICU^301^A^MAIN_CAMPUS' }),
      'ORG-A', 'FAC-A'
    );
    const a09Result = await processAdtMessage(
      buildAdtEvent('A09', 'MRN-EVT09', 'MAIN_CAMPUS', 'FIN-EVT09', { location: 'RADIOLOGY^1^A^MAIN_CAMPUS', recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    expect(a09Result.encounterId).toBe(a01Result.encounterId);
    expect(a09Result.encounterLocationApplied).toBe(true);
  });

  it('A06 (Outpatient → Inpatient) changes the real, EXISTING encounter\'s class', async () => {
    const a04Result = await processAdtMessage(
      buildAdtEvent('A04', 'MRN-EVT06', 'MAIN_CAMPUS', 'FIN-EVT06', { classCode: 'O' }),
      'ORG-A', 'FAC-A'
    );
    const enc1 = await mockEncounterService.getById(a04Result.encounterId!);
    expect(enc1.ok && enc1.data?.encounterClass).toBe('Outpatient');

    const a06Result = await processAdtMessage(
      buildAdtEvent('A06', 'MRN-EVT06', 'MAIN_CAMPUS', 'FIN-EVT06', { classCode: 'I', recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    expect(a06Result.encounterId).toBe(a04Result.encounterId);
    expect(a06Result.encounterClassApplied).toBe(true);
    const enc2 = await mockEncounterService.getById(a04Result.encounterId!);
    expect(enc2.ok && enc2.data?.encounterClass).toBe('Inpatient');
  });

  it('A07 (Inpatient → Outpatient) reverses the same real class-change path', async () => {
    const a01Result = await processAdtMessage(
      buildAdtEvent('A01', 'MRN-EVT07', 'MAIN_CAMPUS', 'FIN-EVT07', { classCode: 'I' }),
      'ORG-A', 'FAC-A'
    );
    const a07Result = await processAdtMessage(
      buildAdtEvent('A07', 'MRN-EVT07', 'MAIN_CAMPUS', 'FIN-EVT07', { classCode: 'O', recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    expect(a07Result.encounterClassApplied).toBe(true);
    const enc = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc.ok && enc.data?.encounterClass).toBe('Outpatient');
  });

  it('A11 (Cancel Admit) reverts a real, EXISTING encounter to Cancelled — no prior state to restore, unlike A12', async () => {
    const a01Result = await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT11', 'MAIN_CAMPUS', 'FIN-EVT11'), 'ORG-A', 'FAC-A');
    const a11Result = await processAdtMessage(
      buildAdtEvent('A11', 'MRN-EVT11', 'MAIN_CAMPUS', 'FIN-EVT11', { recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    expect(a11Result.encounterId).toBe(a01Result.encounterId);
    expect(a11Result.encounterStatusApplied).toBe(true);
    const enc = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc.ok && enc.data?.status).toBe('Cancelled');
  });

  it('A12 (Cancel Transfer) restores the real, captured previousLocationId — never trusts the cancel message\'s own PV1-3 alone', async () => {
    const a01Result = await processAdtMessage(
      buildAdtEvent('A01', 'MRN-EVT12', 'MAIN_CAMPUS', 'FIN-EVT12', { location: 'ICU^301^A^MAIN_CAMPUS' }),
      'ORG-A', 'FAC-A'
    );
    const originalLocationId = a01Result.locationId;
    await processAdtMessage(
      buildAdtEvent('A02', 'MRN-EVT12', 'MAIN_CAMPUS', 'FIN-EVT12', { location: 'WARD5^502^B^MAIN_CAMPUS', recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );

    const a12Result = await processAdtMessage(
      buildAdtEvent('A12', 'MRN-EVT12', 'MAIN_CAMPUS', 'FIN-EVT12', { recordedAt: '202601161100' }),
      'ORG-A', 'FAC-A'
    );
    expect(a12Result.transferCancelled).toBe(true);
    expect(a12Result.locationId).toBe(originalLocationId);
    const enc = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc.ok && enc.data?.locationId).toBe(originalLocationId);
  });

  it('A12 is a genuine no-op — not an error — when the encounter was never transferred', async () => {
    await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT12B', 'MAIN_CAMPUS', 'FIN-EVT12B'), 'ORG-A', 'FAC-A');
    const a12Result = await processAdtMessage(
      buildAdtEvent('A12', 'MRN-EVT12B', 'MAIN_CAMPUS', 'FIN-EVT12B', { recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    expect(a12Result.transferCancelled).toBe(false);
  });

  it('A13 (Cancel Discharge) re-opens a real, EXISTING discharged encounter back to In-Progress', async () => {
    const a01Result = await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT13', 'MAIN_CAMPUS', 'FIN-EVT13'), 'ORG-A', 'FAC-A');
    await processAdtMessage(buildAdtEvent('A03', 'MRN-EVT13', 'MAIN_CAMPUS', 'FIN-EVT13', { recordedAt: '202601161000' }), 'ORG-A', 'FAC-A');
    const enc1 = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc1.ok && enc1.data?.status).toBe('Discharged');

    const a13Result = await processAdtMessage(
      buildAdtEvent('A13', 'MRN-EVT13', 'MAIN_CAMPUS', 'FIN-EVT13', { recordedAt: '202601161100' }),
      'ORG-A', 'FAC-A'
    );
    expect(a13Result.encounterStatusApplied).toBe(true);
    const enc2 = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc2.ok && enc2.data?.status).toBe('In-Progress');
  });

  it('A08\'s real, previously-missing metadata effect — PV1-10/14/20 now actually apply to the real, EXISTING encounter', async () => {
    const a01Result = await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT08M', 'MAIN_CAMPUS', 'FIN-EVT08M'), 'ORG-A', 'FAC-A');

    // Field positions verified programmatically before use: PV1-10
    // "SURG", PV1-14 "EMR", PV1-19 "FIN-EVT08M".
    const a08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601161000|CHARRIS|ADT^A08|MSG-A08M|P|2.5',
      'EVN||202601161000',
      'PID|1||MRN-EVT08M^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD|||SURG||||EMR|||||FIN-EVT08M|INS1',
    ].join('\r');
    const a08Result = await processAdtMessage(a08, 'ORG-A', 'FAC-A');
    expect(a08Result.encounterId).toBe(a01Result.encounterId);
    expect(a08Result.encounterMetadataApplied).toBe(true);

    const enc = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc.ok && enc.data?.hospitalService).toBe('SURG');
    expect(enc.ok && enc.data?.admitSource).toBe('EMR');
  });

  // Real feature, per direct, detailed correction: DG1 is its own,
  // dedicated segment, legitimately riding with A01/A04/A05
  // (creation) and A08 (update) — end-to-end coverage through the
  // real parser AND the real service, not just one or the other.
  it('a real DG1 riding with A01 creates the encounter with real diagnoses attached', async () => {
    const a01WithDg1 = [
      buildAdtEvent('A01', 'MRN-EVTDG1', 'MAIN_CAMPUS', 'FIN-EVTDG1'),
      'DG1|1|I10|E11.9^Type 2 diabetes mellitus without complications^I10|Type 2 Diabetes||A',
    ].join('\r');
    const result = await processAdtMessage(a01WithDg1, 'ORG-A', 'FAC-A');
    expect(result.encounterId).toBeTruthy();

    const enc = await mockEncounterService.getById(result.encounterId!);
    expect(enc.ok && enc.data?.diagnoses).toEqual([
      { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', codingSystem: 'I10', diagnosisType: 'A' },
    ]);
  });

  it('a real A01 with no DG1 creates an encounter with genuinely no diagnoses — most real ADT traffic won\'t carry one', async () => {
    const result = await processAdtMessage(buildAdtEvent('A01', 'MRN-EVTNODG1', 'MAIN_CAMPUS', 'FIN-EVTNODG1'), 'ORG-A', 'FAC-A');
    const enc = await mockEncounterService.getById(result.encounterId!);
    expect(enc.ok && enc.data?.diagnoses).toBeUndefined();
  });

  it('a real DG1 riding with a later A08 updates the diagnoses on the real, EXISTING encounter — the same real gap PV1-10/14/20 metadata had before this event type\'s own effect was wired in', async () => {
    const a01Result = await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT08DG1', 'MAIN_CAMPUS', 'FIN-EVT08DG1'), 'ORG-A', 'FAC-A');

    const a08WithDg1 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601161000|CHARRIS|ADT^A08|MSG-A08DG1|P|2.5',
      'EVN||202601161000',
      'PID|1||MRN-EVT08DG1^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN-EVT08DG1',
      'DG1|1|I10|J45.909^Unspecified asthma, uncomplicated^I10|Asthma||F',
    ].join('\r');
    const a08Result = await processAdtMessage(a08WithDg1, 'ORG-A', 'FAC-A');
    expect(a08Result.encounterId).toBe(a01Result.encounterId);
    expect(a08Result.encounterDiagnosesApplied).toBe(true);

    const enc = await mockEncounterService.getById(a01Result.encounterId!);
    expect(enc.ok && enc.data?.diagnoses).toEqual([
      { code: 'J45.909', description: 'Unspecified asthma, uncomplicated', codingSystem: 'I10', diagnosisType: 'F' },
    ]);
  });

  it('an A08 with no DG1 leaves encounterDiagnosesApplied genuinely undefined — never calls updateDiagnoses when the message carried nothing to apply', async () => {
    await processAdtMessage(buildAdtEvent('A01', 'MRN-EVT08NODG1', 'MAIN_CAMPUS', 'FIN-EVT08NODG1'), 'ORG-A', 'FAC-A');
    const a08Result = await processAdtMessage(buildAdtEvent('A08', 'MRN-EVT08NODG1', 'MAIN_CAMPUS', 'FIN-EVT08NODG1'), 'ORG-A', 'FAC-A');
    expect(a08Result.encounterDiagnosesApplied).toBeUndefined();
  });

  it('a genuinely stale, out-of-order event is honestly rejected for the new event types too — same sequence-control discipline as updateStatus', async () => {
    // Real fix: this test originally used static, hardcoded
    // identifiers ('MRN-EVT-STALE'/'FIN-EVT-STALE'), violating this
    // file's own header-comment rule (every test needs its own unique
    // MRN/encounter number, since there's no per-test localStorage
    // reset) — a real oversight when this test was added later in the
    // same session that established the rule. If this file is ever
    // executed more than once without a full process restart (watch
    // mode, certain runner caching behavior), a static identifier
    // could collide with a prior run's own residual encounter,
    // producing exactly this kind of environment-specific flakiness.
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mrn = `MRN-EVT-STALE-${uniqueSuffix}`;
    const fin = `FIN-EVT-STALE-${uniqueSuffix}`;
    const a01Result = await processAdtMessage(
      buildAdtEvent('A01', mrn, 'MAIN_CAMPUS', fin, { recordedAt: '202601161000' }),
      'ORG-A', 'FAC-A'
    );
    // A02 arriving with an EARLIER real timestamp than the A01 that
    // already established this encounter — must be honestly rejected.
    const staleResult = await processAdtMessage(
      buildAdtEvent('A02', mrn, 'MAIN_CAMPUS', fin, { location: 'WARD5^502^B^MAIN_CAMPUS', recordedAt: '202601160900' }),
      'ORG-A', 'FAC-A'
    );
    expect(staleResult.encounterId).toBe(a01Result.encounterId);
    expect(staleResult.encounterLocationApplied).toBe(false);
  });
});

describe('processAdtMessage — real feature, per direct confirmation: working through the full list of ADT demographic/identity trigger events', () => {
  it('a real A08 carrying PID-9/11/13/16/29/30 actually applies alias/address/phone/marital-status/death-status to the real MasterPatientRecord — previously parsed but silently discarded', async () => {
    await processAdtMessage(buildAdtA01('MRN-DEMO01', 'MAIN_CAMPUS', 'FIN-DEMO01'), 'ORG-A', 'FAC-A');

    // Field positions verified programmatically before use.
    const a08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601161000|CHARRIS|ADT^A08|MSG-DEMO01|P|2.5',
      'EVN||202601161000',
      'PID|1||MRN-DEMO01^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F|SMITH^JANE||123 Main St^^Springfield^IL^62701^USA||555-0100|||M|||||||||||||Y|20260116120000',
    ].join('\r');
    const result = await processAdtMessage(a08, 'ORG-A', 'FAC-A');
    expect(result.demographicsApplied).toBe(true);

    const record = await mockPatientIndexService.getById(result.patientId);
    expect(record?.aliases).toEqual(['SMITH, JANE']);
    expect(record?.address).toEqual({ street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'USA' });
    expect(record?.phone).toBe('555-0100');
    expect(record?.maritalStatus).toBe('M');
    expect(record?.deceased).toBe(true);
    expect(record?.deathDateTime).toBeDefined();
  });

  it('a real A08 with no PID-9/11/13/16/29/30 never blanks out previously-established real data — undefined fields are left as-is', async () => {
    const a01Result = await processAdtMessage(buildAdtA01('MRN-DEMO02', 'MAIN_CAMPUS', 'FIN-DEMO02'), 'ORG-A', 'FAC-A');
    await mockPatientIndexService.updateDemographics(a01Result.patientId, { phone: '555-9999' }, '202601160900');

    // A plain A08 carrying only a name — no PID-13 at all.
    const bareA08 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601161100|CHARRIS|ADT^A08|MSG-DEMO02|P|2.5',
      'EVN||202601161100',
      'PID|1||MRN-DEMO02^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
    ].join('\r');
    await processAdtMessage(bareA08, 'ORG-A', 'FAC-A');

    const record = await mockPatientIndexService.getById(a01Result.patientId);
    expect(record?.phone).toBe('555-9999'); // untouched, not blanked
  });

  it('a real A31 (Update Person Information) applies demographics via the SAME crosswalk-precise path as A08, but never touches Encounter at all', async () => {
    const a01Result = await processAdtMessage(buildAdtA01('MRN-A31', 'MAIN_CAMPUS', 'FIN-A31'), 'ORG-A', 'FAC-A');

    const a31 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601161200|CHARRIS|ADT^A31|MSG-A31|P|2.5',
      'EVN||202601161200',
      'PID|1||MRN-A31^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F|||456 Oak Ave^^Chicago^IL^60601^USA',
    ].join('\r');
    const result = await processAdtMessage(a31, 'ORG-A', 'FAC-A');
    expect(result.eventType).toBe('A31');
    expect(result.patientId).toBe(a01Result.patientId);
    expect(result.demographicsApplied).toBe(true);
    // Real, confirmed distinction: A31 is sent outside an active
    // encounter context — never creates or updates an Encounter.
    expect(result.encounterId).toBeUndefined();

    const record = await mockPatientIndexService.getById(a01Result.patientId);
    expect(record?.address?.city).toBe('Chicago');
  });
});
