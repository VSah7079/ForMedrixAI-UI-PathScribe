// src/services/hl7/adtParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseAdtMessage } from './adtParser';

// Real, precisely verified fixtures - every field index confirmed via
// direct, programmatic counting before writing any assertion against
// it. Building this file caught two real, separate manual-counting
// mistakes of its own (one in the generic parser's own test file, one
// retyping this exact PV1 string with an extra pipe) - both fixed
// before finalizing, not left in.
function buildAdtA01(): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG001|P|2.5',
    'EVN||202601150800',
    // PID-3: two real, repeating identifiers, two different real
    // assigning authorities - directly exercises the multi-authority
    // crosswalk extraction this parser exists to feed.
    'PID|1||MRN30456^^^MAIN_CAMPUS^MR~ALT789^^^PAYER_X^SS||GARCIA^MARIA^L||19901105|F',
    'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN99887|||||||||||||||||||||||||202601150730',
  ].join('\r');
}

function buildAdtA04(): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A04|MSG002|P|2.5',
    'EVN||202601150800',
    'PID|1||MRN99999^^^MAIN_CAMPUS^MR||SMITH^JOHN||19850601|M',
    'PV1|1|O|CLINIC_W^EXAM3^A^MAIN_CAMPUS||||5551234^CHEN^DAVID^M^^^MD||||||||||||FIN11223',
  ].join('\r');
}

function buildAdtA08(): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A08|MSG003|P|2.5',
    'EVN||202601150800',
    'PID|1||MRN99999^^^MAIN_CAMPUS^MR||SMITH^JOHN||19850601|M',
  ].join('\r');
}

// Real, precisely verified fixture, per direct, detailed correction:
// DG1 riding with a real A01 — DG1-3's real component order
// (identifier^text^codingSystem) confirmed directly against this
// app's own, already-existing outbound buildDG1 (segmentBuilders.ts).
// Two real, repeating DG1 segments (getAllSegments, not getSegment) —
// exercises real multi-diagnosis handling, not just a single row.
function buildAdtA01WithDG1(): string {
  return [
    'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG004|P|2.5',
    'EVN||202601150800',
    'PID|1||MRN30456^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
    'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN99887|||||||||||||||||||||||||202601150730',
    'DG1|1|I10|E11.9^Type 2 diabetes mellitus without complications^I10|Type 2 Diabetes||A',
    'DG1|2|I10|I10^Essential (primary) hypertension^I10|Hypertension||W',
  ].join('\r');
}

describe('parseAdtMessage — real fix, per direct, detailed correction: DG1 is its own, dedicated segment (not part of OBR), and legitimately rides with ADT', () => {
  it('correctly extracts a real DG1-3 (identifier^text^codingSystem) and DG1-6 (diagnosis type)', () => {
    const result = parseAdtMessage(buildAdtA01WithDG1());
    expect(result.diagnoses).toEqual([
      { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', codingSystem: 'I10', diagnosisType: 'A' },
      { code: 'I10', description: 'Essential (primary) hypertension', codingSystem: 'I10', diagnosisType: 'W' },
    ]);
  });

  it('preserves real DG1-1 set-id order across multiple repeating segments', () => {
    const result = parseAdtMessage(buildAdtA01WithDG1());
    expect(result.diagnoses[0].code).toBe('E11.9');
    expect(result.diagnoses[1].code).toBe('I10');
  });

  it('returns a genuinely empty array, not undefined, for a real message that carries no DG1 at all — most real ADT traffic won\'t', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.diagnoses).toEqual([]);
  });

  it('silently drops a DG1 segment with no real DG1-3.1 identifier — never a genuine diagnosis, never a hollow entry', () => {
    const raw = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG005|P|2.5',
      'EVN||202601150800',
      'PID|1||MRN30456^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN99887|||||||||||||||||||||||||202601150730',
      'DG1|1|I10|||',
    ].join('\r');
    expect(parseAdtMessage(raw).diagnoses).toEqual([]);
  });
});

describe('parseAdtMessage — real fix: the first real inbound HL7 parsing this app has, verified against real, precisely-counted field positions', () => {
  it('correctly identifies the real event type from MSH-9', () => {
    expect(parseAdtMessage(buildAdtA01()).eventType).toBe('A01');
    expect(parseAdtMessage(buildAdtA04()).eventType).toBe('A04');
    expect(parseAdtMessage(buildAdtA08()).eventType).toBe('A08');
  });

  it('the real, confirmed distinction between A01 and A04: PV1-2 patient class, nothing else', () => {
    const a01 = parseAdtMessage(buildAdtA01());
    const a04 = parseAdtMessage(buildAdtA04());
    expect(a01.encounter.encounterClass).toBe('Inpatient');
    expect(a04.encounter.encounterClass).toBe('Outpatient');
  });

  it('correctly extracts real, multiple identifiers from a real, repeating PID-3, each with its own real assigning authority', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.patient.identifiers).toEqual([
      { identifierValue: 'MRN30456', assigningAuthority: 'MAIN_CAMPUS' },
      { identifierValue: 'ALT789', assigningAuthority: 'PAYER_X' },
    ]);
  });

  it('primaryMrn is the real, first identifier\'s value, for a caller that only needs the simple, single-MRN shape', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.patient.primaryMrn).toBe('MRN30456');
  });

  it('correctly extracts the real patient name from PID-5', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.patient.firstName).toBe('MARIA');
    expect(result.patient.lastName).toBe('GARCIA');
  });

  it('correctly converts the real HL7 date format (YYYYMMDD) to a real ISO date', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.patient.dateOfBirth).toBe('1990-11-05T00:00:00.000Z');
  });

  it('correctly extracts the real visit number from PV1-19', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.encounter.encounterNumber).toBe('FIN99887');
  });

  it('correctly extracts the real ward/room/bed/facility from PV1-3', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.encounter.ward).toBe('ICU');
    expect(result.encounter.room).toBe('301');
    expect(result.encounter.bed).toBe('A');
    expect(result.encounter.facility).toBe('MAIN_CAMPUS');
  });

  it('correctly extracts the real locationStatus/personLocationType/building/floor from PV1-3.5–3.8', () => {
    // Real feature, per direct confirmation: "include the standards" —
    // fresh fixture with all 8 real PV1-3 components populated,
    // distinct from buildAdtA01()'s 4-component fixture above so that
    // existing tests keep exercising the "only 4 present" case too.
    const raw = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG010|P|2.5',
      'EVN||202601150800',
      'PID|1||MRN50501^^^MAIN_CAMPUS^MR||OKAFOR^AMARA||19770312|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS^O^B^Tower1^3||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN50501',
    ].join('\r');
    const result = parseAdtMessage(raw);
    expect(result.encounter.locationStatus).toBe('O');
    expect(result.encounter.personLocationType).toBe('B');
    expect(result.encounter.building).toBe('Tower1');
    expect(result.encounter.floor).toBe('3');
  });

  it('leaves locationStatus/personLocationType/building/floor undefined when PV1-3 only carries the first 4 components — never fabricates the rest', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.encounter.locationStatus).toBeUndefined();
    expect(result.encounter.personLocationType).toBeUndefined();
    expect(result.encounter.building).toBeUndefined();
    expect(result.encounter.floor).toBeUndefined();
  });

  it('real, per PS-81 (Jira): correctly extracts the real, structured attending provider from PV1-7 - id/lastName/firstName, never flattened to a string here anymore', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.encounter.attendingProvider).toEqual({ id: '9876543', lastName: 'WILLIAMS', firstName: 'CAROL' });
  });

  it('correctly extracts the real admit time from PV1-44', () => {
    const result = parseAdtMessage(buildAdtA01());
    expect(result.encounter.admitTime).toBe('2026-01-15T07:30:00.000Z');
  });

  it('a real, unrecognized event type throws, rather than silently returning a half-populated result', () => {
    // A02 was this test's original example before it became a real,
    // supported event type this session (Transfer Patient) — A99 is a
    // genuinely nonexistent HL7 event code, keeping this test's own
    // intent (unrecognized events throw) valid without depending on
    // this app's own, still-growing list of supported real events.
    const unrecognized = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A99|MSG004|P|2.5',
      'PID|1||MRN1^^^MAIN_CAMPUS^MR||DOE^JANE',
    ].join('\r');
    expect(() => parseAdtMessage(unrecognized)).toThrow(/A99/);
  });

  it('a message with no real MSH segment at all throws, rather than guessing', () => {
    expect(() => parseAdtMessage('PID|1||MRN1^^^X^MR||DOE^JANE')).toThrow(/MSH/);
  });

  it('a genuinely empty PID-3 repetition is never turned into a fabricated identifier row', () => {
    const withEmptyRep = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG005|P|2.5',
      'PID|1||MRN1^^^MAIN_CAMPUS^MR~||DOE^JANE',
    ].join('\r');
    const result = parseAdtMessage(withEmptyRep);
    expect(result.patient.identifiers).toHaveLength(1);
  });

  it('real fix: correctly identifies A03 (discharge/end visit) as a real, handled event type', () => {
    const a03 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601180900|CHARRIS|ADT^A03|MSG006|P|2.5',
      'PID|1||MRN30456^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN99887|||||||||||||||||||||||||202601150730|202601180900',
    ].join('\r');
    const result = parseAdtMessage(a03);
    expect(result.eventType).toBe('A03');
  });

  it('real fix: correctly extracts the real discharge time from PV1-45', () => {
    const a03 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601180900|CHARRIS|ADT^A03|MSG007|P|2.5',
      'PID|1||MRN30456^^^MAIN_CAMPUS^MR||GARCIA^MARIA^L||19901105|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||9876543^WILLIAMS^CAROL^L^^^MD||||||||||||FIN99887|||||||||||||||||||||||||202601150730|202601180900',
    ].join('\r');
    const result = parseAdtMessage(a03);
    expect(result.encounter.dischargeTime).toBe('2026-01-18T09:00:00.000Z');
    expect(result.encounter.encounterNumber).toBe('FIN99887'); // the real visit being discharged
  });

  it('dischargeTime is genuinely absent for A01/A04/A08 - a visit hasn\'t ended yet', () => {
    const a01 = [
      'MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|202601150800|CHARRIS|ADT^A01|MSG008|P|2.5',
      'PID|1||MRN1^^^MAIN_CAMPUS^MR||DOE^JANE||19850101|F',
      'PV1|1|I|ICU^301^A^MAIN_CAMPUS||||||||||||||||FIN00099',
    ].join('\r');
    const result = parseAdtMessage(a01);
    expect(result.encounter.dischargeTime).toBeUndefined();
  });
});
