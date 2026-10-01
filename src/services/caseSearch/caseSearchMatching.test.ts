import { describe, it, expect } from 'vitest';
import type { Case } from '@/types/case/Case';
import { matchesCaseSearch, compareCases, pageBounds, caseAccessionInstant, toFacilityDate, expandOrganisationCriteria, type CaseSearchMatchContext } from './caseSearchMatching';
import type { CaseSearchCriteria } from './caseSearchTypes';

// Minimal, hand-built cases: only the fields search reads.
const mk = (over: Record<string, unknown>): Case => ({
  id: 'C-1', status: 'in-progress', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
  accession: { fullAccession: 'S26-4403' },
  patient: { id: 'MPI-1', mrn: '100001', firstName: 'Jane', lastName: 'Williams', sex: 'F', dateOfBirth: '1970-06-15' },
  order: { priority: 'Routine', facilityId: 'c1', requestingProvider: 'Dr. Sarah Chen', receivedDate: '2026-09-20T15:00:00Z' },
  specimens: [],
  ...over,
} as unknown as Case);

const ctx: CaseSearchMatchContext = {
  physicianNamesById: new Map([['ph1', ['Sarah Chen']]]),
  timeZone: 'America/Phoenix',
  now: new Date('2026-09-27T12:00:00Z'),
};
const hit = (c: Case, k: CaseSearchCriteria) => matchesCaseSearch(c, k, ctx);

describe('case search matching (Batch 350)', () => {
  it('diagnosis matches the case diagnostic text (it read fields that don\'t exist, so it never matched)', () => {
    const c = mk({ diagnostic: { microscopicDescription: 'Tubular adenoma with low grade dysplasia' } });
    expect(hit(c, { diagnosisTerms: ['tubular adenoma'] })).toBe(true);
    expect(hit(c, { diagnosisTerms: ['melanoma'] })).toBe(false);
    expect(hit(mk({ diagnostic: { primaryDiagnosis: 'Invasive ductal carcinoma' } }), { diagnosisTerms: ['ductal'] })).toBe(true);
  });

  it('an order number matches requisition, external order and referral numbers (it was compared to accessions)', () => {
    const c = mk({ order: { requisitionNumber: 'REQ-123456', externalOrderId: 'EXT-9', referralNumber: 'RF-1' } });
    expect(hit(c, { orderNo: 'REQ-123456' })).toBe(true);
    expect(hit(c, { orderNo: 'ext-9' })).toBe(true);
    expect(hit(c, { orderNo: 'REQ-999999' })).toBe(false);
  });

  it('a pathologist matches when assigned, signing, accepting or a participant', () => {
    expect(hit(mk({ order: { assignedTo: 'P1' } }), { pathologistIds: ['P1'] })).toBe(true);
    expect(hit(mk({ finalizedBy: 'P2' }), { pathologistIds: ['P2'] })).toBe(true);
    expect(hit(mk({ participants: [{ staffId: 'P3' }] }), { pathologistIds: ['P3'] })).toBe(true);
    expect(hit(mk({ order: { assignedTo: 'P1' } }), { pathologistIds: ['P9'] })).toBe(false);
  });

  it('ICD matches ICD-10, ICD-11 and ICD-O, and a category matches its sub-codes', () => {
    expect(hit(mk({ coding: { icd10: ['C50.412'] } }), { icdCodes: ['C50'] })).toBe(true);
    expect(hit(mk({ coding: { icd11: ['2C61.0'] } }), { icdCodes: ['2C61'] })).toBe(true);
    expect(hit(mk({ coding: { icdO: ['8500/3'] } }), { icdCodes: ['8500/3'] })).toBe(true);
    expect(hit(mk({ coding: { icd10: ['C18.7'] } }), { icdCodes: ['C50'] })).toBe(false);
  });

  it('a synoptic protocol matches the template id cases actually use', () => {
    const c = mk({ synopticReports: [{ templateId: 'breast_invasive' }] });
    expect(hit(c, { synopticTemplateIds: ['breast_invasive'] })).toBe(true);
    expect(hit(c, { synopticTemplateIds: ['colon_resection'] })).toBe(false);
  });

  it('flags match by definition id, ignoring removed flags, at case and specimen level', () => {
    const c = mk({
      caseFlags: [{ flagDefinitionId: 'f1', deletedAt: null }, { flagDefinitionId: 'f2', deletedAt: '2026-01-01' }],
      specimens: [{ specimenFlags: [{ flagDefinitionId: 'f9', deletedAt: null }] }],
    });
    expect(hit(c, { caseFlagIds: ['f1'] })).toBe(true);
    expect(hit(c, { caseFlagIds: ['f2'] })).toBe(false);
    expect(hit(c, { specimenFlagIds: ['f9'] })).toBe(true);
  });

  it('older flag records (a name or LIS code, no definition id) match their definition', () => {
    const withDefs = { ...ctx, flagsById: new Map([['f3', { name: 'Second Opinion Requested', lisCode: 'SOP' }], ['f7', { name: 'BRAF V600E', lisCode: 'BRAFM' }]]) };
    const c = mk({
      caseFlags: [{ id: 'second-op', name: 'Second Opinion Requested' }],
      specimens: [{ specimenFlags: [{ id: 'comp-braf', name: 'Braf v600e', lisCode: 'BRAFM' }] }],
    });
    expect(matchesCaseSearch(c, { caseFlagIds: ['f3'] }, withDefs)).toBe(true);
    expect(matchesCaseSearch(c, { specimenFlagIds: ['f7'] }, withDefs)).toBe(true);
    expect(matchesCaseSearch(c, { caseFlagIds: ['f7'] }, withDefs)).toBe(false);
  });

  it('any identifier finds an MRN, accession, order number or name; punctuation and case don\'t matter', () => {
    const c = mk({ order: { requisitionNumber: 'REQ-777000' } });
    expect(hit(c, { anyIdentifier: '100001' })).toBe(true);
    expect(hit(c, { anyIdentifier: 's264403' })).toBe(true);
    expect(hit(c, { anyIdentifier: 'REQ-777000' })).toBe(true);
    expect(hit(c, { anyIdentifier: 'Williams, Jane' })).toBe(true);
    expect(hit(c, { anyIdentifier: '999999' })).toBe(false);
  });

  it('patient name matches every word in any order', () => {
    expect(hit(mk({}), { patientName: 'Williams, Jane' })).toBe(true);
    expect(hit(mk({}), { patientName: 'jane williams' })).toBe(true);
    expect(hit(mk({}), { patientName: 'John Williams' })).toBe(false);
  });

  it('the accession date is the facility-local date, and a case with no date no longer passes a date filter', () => {
    // 2026-09-21T02:00Z is still 20 September in Phoenix.
    const c = mk({ order: { receivedDate: '2026-09-21T02:00:00Z' } });
    expect(hit(c, { dateFrom: '2026-09-20', dateTo: '2026-09-20' })).toBe(true);
    expect(hit(c, { dateFrom: '2026-09-21' })).toBe(false);
    const undated = mk({ order: {}, createdAt: undefined });
    expect(hit(undated, { dateFrom: '2026-01-01' })).toBe(false);
  });

  it('sex filters use the recorded codes; age and DOB exclude cases without a DOB', () => {
    expect(hit(mk({}), { sexes: ['F'] })).toBe(true);
    expect(hit(mk({}), { sexes: ['M', 'U'] })).toBe(false);
    expect(hit(mk({}), { ageMin: 56, ageMax: 56 })).toBe(true); // born 1970-06-15, on 2026-09-27
    expect(hit(mk({ patient: { mrn: '1' } }), { ageMin: 1 })).toBe(false);
    expect(hit(mk({}), { dobFrom: '1970-01-01', dobTo: '1970-12-31' })).toBe(true);
  });

  it('priority matches exactly (Rush is no longer confused with anything)', () => {
    expect(hit(mk({ order: { priority: 'Rush' } }), { priorities: ['Rush'] })).toBe(true);
    expect(hit(mk({ order: { priority: 'STAT' } }), { priorities: ['Rush'] })).toBe(false);
    expect(hit(mk({ order: {} }), { priorities: ['Routine'] })).toBe(true);
  });

  it('an ordering physician matches by id, or by name when the case records the name only', () => {
    expect(hit(mk({ order: { orderingPhysicianId: 'ph2' } }), { orderingPhysicianIds: ['ph2'] })).toBe(true);
    expect(hit(mk({}), { orderingPhysicianIds: ['ph1'] })).toBe(true);
    expect(hit(mk({ order: { requestingProvider: 'Dr. Tom Hart' } }), { orderingPhysicianIds: ['ph1'] })).toBe(false);
  });

  it('criteria are ANDed, values within one are ORed', () => {
    const c = mk({ status: 'finalized' });
    expect(hit(c, { statuses: ['draft', 'finalized'], sexes: ['F'] })).toBe(true);
    expect(hit(c, { statuses: ['finalized'], sexes: ['M'] })).toBe(false);
  });
});

describe('case search ordering and paging', () => {
  it('accession date uses the accession timestamp, then order received, then earliest specimen, then created', () => {
    expect(caseAccessionInstant(mk({ accession: { accessionedAt: 'A' }, order: { receivedDate: 'B' } }))).toBe('A');
    expect(caseAccessionInstant(mk({ order: {}, specimens: [{ receivedAt: '2026-02-02' }, { receivedAt: '2026-01-01' }] }))).toBe('2026-01-01');
  });

  it('sorts with a stable tiebreak on id, and cases without a value last', () => {
    const a = mk({ id: 'B', updatedAt: '2026-01-01' });
    const b = mk({ id: 'A', updatedAt: '2026-01-01' });
    const c = mk({ id: 'C', updatedAt: undefined });
    const sorted = [c, a, b].sort(compareCases({ key: 'lastUpdated', direction: 'desc' }));
    expect(sorted.map(x => x.id)).toEqual(['A', 'B', 'C']);
  });

  it('clamps a page past the end to the last page', () => {
    expect(pageBounds(51, 9, 25)).toEqual({ page: 3, pageCount: 3, start: 50, end: 51 });
    expect(pageBounds(0, 1, 25)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });
  });

  it('toFacilityDate leaves a date-only value alone', () => {
    expect(toFacilityDate('1970-06-15', 'Asia/Seoul')).toBe('1970-06-15');
  });
});

// ── Batch 351: section 3 of the gap analysis ────────────────────────────────
describe('case search matching: new case data (Batch 351)', () => {
  const ref: CaseSearchMatchContext = {
    ...ctx,
    specimenDictionary: [{ id: 'sp-pap', specimenCategory: 'GYN_CYTOLOGY' }, { id: 'sp-fna', specimenCategory: 'NON_GYN_CYTOLOGY' }],
    performingLabByFacilityId: new Map([['c1', 'lab-1']]),
    stainCategoryByName: new Map([['er', 'IHC'], ['her2 fish', 'Molecular'], ['h&e', 'Routine']]),
    revisionTypesByCaseId: new Map([['C-rev', new Set(['correction'])]]),
    countersignsByCaseId: new Map([['C-cs', [{ residentId: 'R1', attendingId: 'A1' }]]]),
    delegateesByCaseId: new Map([['C-dl', new Set(['D1'])]]),
    subspecialtyOf: () => 'gi',
    tatTargetHoursOf: () => 24,
  };
  const on = (c: Case, k: CaseSearchCriteria) => matchesCaseSearch(c, k, ref);

  it('case type: surgical, gyn and non-gyn cytology by the specimen dictionary, autopsy by its details', () => {
    expect(on(mk({ specimens: [{ specimenDictionaryEntryId: 'sp-pap' }] }), { caseTypes: ['gynCytology'] })).toBe(true);
    expect(on(mk({ specimens: [{ specimenDictionaryEntryId: 'sp-fna' }] }), { caseTypes: ['nonGynCytology'] })).toBe(true);
    expect(on(mk({ specimens: [{ description: 'colon' }] }), { caseTypes: ['surgical'] })).toBe(true);
    expect(on(mk({ specimens: [{ specimenDictionaryEntryId: 'sp-pap' }] }), { caseTypes: ['surgical'] })).toBe(false);
    expect(on(mk({ autopsy: { jurisdiction: 'US', caseAuthority: 'hospital_consented' } }), { caseTypes: ['autopsy'] })).toBe(true);
  });

  it('sign-out and release dates: finalizedAt, else the issued date of a signed-out case; open cases have none', () => {
    const signed = mk({ status: 'finalized', finalizedAt: '2026-09-10T18:00:00Z' });
    expect(on(signed, { dateBasis: 'signedOut', dateFrom: '2026-09-10', dateTo: '2026-09-10' })).toBe(true);
    expect(on(signed, { dateBasis: 'released', dateFrom: '2026-09-10' })).toBe(true);
    const buffered = mk({ status: 'pending-release', finalizedAt: '2026-09-10T18:00:00Z' });
    expect(on(buffered, { dateBasis: 'released', dateFrom: '2026-01-01' })).toBe(false);
    const legacy = mk({ status: 'finalized', diagnostic: { issuedDate: '2026-09-05T12:00:00Z' } });
    expect(on(legacy, { dateBasis: 'signedOut', dateFrom: '2026-09-05', dateTo: '2026-09-05' })).toBe(true);
    const open = mk({ status: 'in-progress', diagnostic: { issuedDate: '2026-09-05T12:00:00Z' } });
    expect(on(open, { dateBasis: 'signedOut', dateFrom: '2026-01-01' })).toBe(false);
  });

  it('pathologist role: assigned, signed out, resident, countersigner, delegated to', () => {
    const c = mk({ id: 'C-cs', status: 'finalized', finalizedBy: 'S1', order: { assignedTo: 'P1' },
      participants: [{ staffId: 'R2', participationTypeIds: ['resident'] }] });
    expect(on(c, { pathologistIds: ['P1'], pathologistRole: 'assigned' })).toBe(true);
    expect(on(c, { pathologistIds: ['P1'], pathologistRole: 'signedOut' })).toBe(false);
    expect(on(c, { pathologistIds: ['S1'], pathologistRole: 'signedOut' })).toBe(true);
    expect(on(c, { pathologistIds: ['R1'], pathologistRole: 'resident' })).toBe(true);
    expect(on(c, { pathologistIds: ['R2'], pathologistRole: 'resident' })).toBe(true);
    expect(on(c, { pathologistIds: ['A1'], pathologistRole: 'countersigner' })).toBe(true);
    expect(on(mk({ id: 'C-dl' }), { pathologistIds: ['D1'], pathologistRole: 'delegatedTo' })).toBe(true);
    expect(on(mk({ id: 'C-dl' }), { pathologistIds: ['D1'] })).toBe(true); // any role
  });

  it('revisions: on the case, on a report, or a released amendment record', () => {
    expect(on(mk({ lastRevisionType: 'amendment' }), { revisionTypes: ['amendment'] })).toBe(true);
    expect(on(mk({ synopticReports: [{ templateId: 'x', lastRevisionType: 'addendum' }] }), { revisionTypes: ['addendum'] })).toBe(true);
    expect(on(mk({ id: 'C-rev' }), { revisionTypes: ['correction'] })).toBe(true);
    expect(on(mk({ lastRevisionType: 'original' }), { revisionTypes: ['amendment'] })).toBe(false);
  });

  it('holds: only active ones count', () => {
    expect(on(mk({ caseHolds: [{ active: true }] }), { holdTypes: ['case'] })).toBe(true);
    expect(on(mk({ caseHolds: [{ active: false }] }), { holdTypes: ['case'] })).toBe(false);
    expect(on(mk({ retentionHolds: [{ active: true }] }), { holdTypes: ['retention'] })).toBe(true);
    expect(on(mk({ autopsy: { ancillaryHold: { active: true } } }), { holdTypes: ['autopsyAncillary'] })).toBe(true);
  });

  it('result flag and diagnosis content (grade, biomarkers)', () => {
    expect(on(mk({ abnormalDetectionStatus: { severity: 'Critical', confirmedAt: 'x' } }), { resultFlags: ['Critical'] })).toBe(true);
    expect(on(mk({}), { resultFlags: ['Malignant'] })).toBe(false);
    expect(on(mk({ diagnostic: { synoptic: { grade: 'Grade 3', biomarkers: { her2: '3+' } } } }), { diagnosisTerms: ['grade 3'] })).toBe(true);
    expect(on(mk({ diagnostic: { synoptic: { biomarkers: { her2: '3+' } } } }), { diagnosisTerms: ['her2 3+'] })).toBe(true);
  });

  it('pending work: open stain orders by category, and add-ons', () => {
    const c = mk({ specimens: [{ blocks: [{ stains: [
      { stainName: 'H&E', status: 'Coverslipped' },
      { stainName: 'ER', status: 'Staining' },
      { stainName: 'HER2 FISH', status: 'Ready for Review' },
      { stainName: 'PAS', status: 'Pending Cut', orderedByPathologistId: 'P1' },
    ] }] }] });
    expect(on(c, { pendingWork: ['stains'] })).toBe(true);
    expect(on(c, { pendingWork: ['ihc'] })).toBe(true);
    expect(on(c, { pendingWork: ['molecular'] })).toBe(false); // the FISH is ready for review
    expect(on(c, { pendingWork: ['addOns'] })).toBe(true);
    expect(on(mk({ specimens: [{ blocks: [{ stains: [{ stainName: 'H&E', status: 'Coverslipped' }] }] }] }), { pendingWork: ['stains'] })).toBe(false);
  });

  it('past TAT target: open past the target, or signed out after it', () => {
    // Received 2026-09-20; now 2026-09-27; target 24 h.
    expect(on(mk({ status: 'in-progress' }), { pastTatTarget: true })).toBe(true);
    expect(on(mk({ status: 'finalized', finalizedAt: '2026-09-20T20:00:00Z' }), { pastTatTarget: true })).toBe(false);
    expect(on(mk({ status: 'finalized', finalizedAt: '2026-09-23T20:00:00Z' }), { pastTatTarget: true })).toBe(true);
    expect(matchesCaseSearch(mk({ status: 'in-progress' }), { pastTatTarget: true }, { ...ref, tatTargetHoursOf: () => null })).toBe(false);
  });

  it('subspecialty, performing lab, location', () => {
    expect(on(mk({ subspecialtyId: 'breast' }), { subspecialtyIds: ['breast'] })).toBe(true);
    expect(on(mk({}), { subspecialtyIds: ['gi'] })).toBe(true); // derived
    expect(on(mk({}), { performingLabIds: ['lab-1'] })).toBe(true); // c1 → lab-1
    expect(on(mk({ order: { facilityId: 'c9' } }), { performingLabIds: ['lab-1'] })).toBe(false);
    expect(on(mk({ order: { locationId: 'loc-3' } }), { locationIds: ['loc-3'] })).toBe(true);
  });

  it('intake, payer and CPT', () => {
    expect(on(mk({}), { intakes: ['standard'] })).toBe(true);
    expect(on(mk({ order: { intakeType: 'downtime' } }), { intakes: ['downtime'] })).toBe(true);
    expect(on(mk({ isReferenceLabCase: true }), { intakes: ['referenceLab'] })).toBe(true);
    expect(on(mk({ order: { outsidePatientData: { primaryPayerName: 'Blue Shield' } } }), { payer: 'blue' })).toBe(true);
    expect(on(mk({ specimens: [{ coding: { cpt: ['88307'] } }] }), { cptCodes: ['88307'] })).toBe(true);
    expect(on(mk({ specimens: [{ blocks: [{ coding: { cpt: [{ code: '88342' }] } }] }] }), { cptCodes: ['8834'] })).toBe(true);
    expect(on(mk({}), { cptCodes: ['88307'] })).toBe(false);
  });

  it('autopsy: jurisdiction, authority, which reports are signed; non-autopsy cases never match', () => {
    const a = mk({ autopsy: { jurisdiction: 'GB_EW', caseAuthority: 'medicolegal_forensic', padSnapshot: { signedAt: 'x' } } });
    expect(on(a, { autopsyJurisdictions: ['GB_EW'] })).toBe(true);
    expect(on(a, { autopsyAuthorities: ['hospital_consented'] })).toBe(false);
    expect(on(a, { autopsyReports: ['pad'] })).toBe(true);
    expect(on(a, { autopsyReports: ['fad'] })).toBe(false);
    expect(on(a, { autopsyReports: ['none'] })).toBe(false);
    expect(on(mk({}), { autopsyReports: ['none'] })).toBe(false);
  });

  it('order numbers include lab and block numbers', () => {
    expect(on(mk({ order: { labNumber: 'BLK-SP1-A1' } }), { orderNo: 'BLK-SP1-A1' })).toBe(true);
  });
});

// ── Batch 354: a Trust includes its sites ────────────────────────────────────
describe('expandOrganisationCriteria (Batch 354)', () => {
  const parents = new Map([['site-a', 'trust'], ['site-b', 'trust'], ['client-a', 'site-a']]);
  it('adds every facility under a chosen submitting facility or performing lab', () => {
    const out = expandOrganisationCriteria({ submittingFacilityIds: ['trust'], performingLabIds: ['site-a'], mrn: '1' }, parents);
    expect(out.submittingFacilityIds?.sort()).toEqual(['client-a', 'site-a', 'site-b', 'trust']);
    expect(out.performingLabIds?.sort()).toEqual(['client-a', 'site-a']);
    expect(out.mrn).toBe('1');
  });
  it('leaves criteria alone with no hierarchy or no organisation filter', () => {
    const k = { performingLabIds: ['trust'] };
    expect(expandOrganisationCriteria(k, undefined)).toBe(k);
    expect(expandOrganisationCriteria({ mrn: '1' }, parents)).toEqual({ mrn: '1' });
  });
});
