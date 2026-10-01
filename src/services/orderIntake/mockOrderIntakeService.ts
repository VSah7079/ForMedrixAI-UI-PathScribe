// src/services/orderIntake/mockOrderIntakeService.ts

import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type {
  IOrderIntakeService, IncomingOrder, SpecimenCodeCrosswalkEntry, OrderResolutionResult, OrderCodeCodingSystem,
} from './IOrderIntakeService';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { mockDepartmentService } from '../departments/mockDepartmentService';
import { mockSpecimenDictionaryService } from '../specimenDictionary/mockSpecimenDictionaryService';
import { mockInterfaceExceptionService } from '../interfaceExceptions/mockInterfaceExceptionService';
import { resolveProviderName } from '../physicians/resolveProviderName';
import { normalizeOrderCode } from '@/utils/normalizeOrderCode';

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 100));

// Used below for the 12 newer orders — the original 3 use hardcoded
// literal timestamps instead, kept as-is rather than converted.
const isoDaysAgo = (days: number) => {
  const d = new Date();
  // eslint-disable-next-line no-restricted-properties -- Real, honest justification: generates a FAKE, illustrative timestamp for seeded demo data ("N days ago from right now"), not bucketing a real, stored clinical event by facility timezone. Result is a real, absolute UTC instant (toISOString()) regardless of runtime timezone.
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

// ─── Crosswalk seed data ────────────────────────────────────────────────────
// A couple of pre-learned mappings, as if an admin (or a prior auto-create
// cycle) had already resolved these once. Deliberately left gaps —
// PENDING_ORDERS below includes orders that WON'T find a crosswalk match,
// to demonstrate the fallback path, not just the happy path.
//
// dictionaryEntryId values: 'sp-kidney-native-biopsy' is a hand-added
// entry appended after specimens-starter.json's own data in
// mockSpecimenDictionaryService.ts, confirmed real. 'sp034' (Pleural
// Fluid Cytology) is confirmed real too — verified directly against
// specimens-starter.json once it was shared; both entries have
// departmentId: null in the real starter data (true for all 60
// starter entries, not just these two), so resolving through either
// will exercise the "dictionary entry has no department yet" fallback
// path in resolveOrder() — that's accurate to the real seed data, not
// an artifact of picking these two specifically.
const SEED_CROSSWALK: SpecimenCodeCrosswalkEntry[] = [
  {
    id: 'xwalk-001', clientId: 'c-fenwick-general', externalCode: 'SURG-01',
    dictionaryEntryId: 'sp-kidney-native-biopsy', createdAt: '2026-05-10', createdBy: 'admin',
  },
  {
    id: 'xwalk-002', clientId: 'c-royal-manchester', externalCode: 'CYTO-FL',
    dictionaryEntryId: 'sp034', createdAt: '2026-05-12', createdBy: 'admin',
  },
];

const loadCrosswalk    = () => storageGet<SpecimenCodeCrosswalkEntry[]>('pathscribe_specimen_crosswalk', SEED_CROSSWALK);
const persistCrosswalk = (data: SpecimenCodeCrosswalkEntry[]) => storageSet('pathscribe_specimen_crosswalk', data);
let CROSSWALK: SpecimenCodeCrosswalkEntry[] = loadCrosswalk();

// ─── Pending orders seed data ───────────────────────────────────────────────
// Three orders, each demonstrating a different resolution path:
//   ORD-001 — Fenwick General, known assigning authority + crosswalked specimen
//             code → resolves cleanly, no auto-creation at all.
//   ORD-002 — assigning authority 'NEWCLINIC01' doesn't match any existing
//             Client.assigningAuthority → demonstrates clientWasAutoCreated.
//   ORD-003 — Royal Manchester (known client) but a specimen code with no
//             crosswalk entry → demonstrates departmentWasAutoCreated,
//             independent of client resolution.
// None are pre-resolved — clientId/departmentId are left undefined
// until resolveOrder() actually runs, same as a real order would arrive
// unresolved and get processed by the Accession page.
const SEED_ORDERS: IncomingOrder[] = [
  {
    id: 'ord-001', externalOrderNumber: 'FGH-ORD-88213', source: 'hl7',
    receivedAt: '2026-06-29T08:14:00.000Z', status: 'pending',
    externalAssigningAuthority: 'FGH',
    patient: { firstName: 'Margaret', lastName: 'Wilcox', dateOfBirth: '1958-02-11', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Mr. Ian Faulkner', namePrefix: 'Mr.', givenNames: 'Ian', familyNames: 'Faulkner' }, priority: 'Routine',
    clinicalIndication: 'Right breast lump on screening mammography, BI-RADS 4. Core needle biopsy for histological diagnosis.',
    icd10Codes: [{ code: 'N63.10', description: 'Unspecified lump in right breast' }],
    specimens: [
      { description: 'Right breast core needle biopsy', externalSpecimenCode: 'SURG-01' },
    ],
    rawMessage: 'MSH|^~\\&|LIS|FGH|PATHSCRIBE|LAB|20260629081400||ORM^O01|MSG88213|P|2.5.1',
  },
  {
    id: 'ord-002', externalOrderNumber: 'NC-2026-0447', source: 'api',
    receivedAt: '2026-06-29T09:02:00.000Z', status: 'pending',
    externalAssigningAuthority: 'NEWCLINIC01',
    patient: { firstName: 'Daniel', lastName: 'Ortiz', dateOfBirth: '1990-07-23', sex: 'M', mrn: '778812' },
    requestingProvider: { rawName: 'Dr. Priya Nair', namePrefix: 'Dr.', givenNames: 'Priya', familyNames: 'Nair' }, priority: 'Routine',
    clinicalIndication: 'Suspicious pigmented lesion left forearm, changing over 3 months. Excisional biopsy.',
    specimens: [
      { description: 'Left forearm skin excision, pigmented lesion' },
    ],
  },
  {
    id: 'ord-003', externalOrderNumber: 'RMANC-ORD-55190', source: 'hl7',
    receivedAt: '2026-06-29T10:31:00.000Z', status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Robert', lastName: 'Fenn', dateOfBirth: '1971-11-04', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Mr. Colin Baxter', namePrefix: 'Mr.', givenNames: 'Colin', familyNames: 'Baxter' }, priority: 'STAT',
    clinicalIndication: 'New pericardial effusion, unknown aetiology. Pericardiocentesis for cytological evaluation.',
    specimens: [
      // 'PERI-FL-01' has no crosswalk entry for this client — the
      // resolution path this order exists to demonstrate.
      { description: 'Pericardial fluid, pericardiocentesis', externalSpecimenCode: 'PERI-FL-01' },
    ],
    rawMessage: 'MSH|^~\\&|LIS|RMANC|PATHSCRIBE|LAB|20260629103100||ORM^O01|MSG55190|P|2.5.1',
  },

  // ── 12 new orders, 3 each for Pete, Amber, Bronwyn, and Paul —────────────
  // for the reviewer whose name is on each block to accession themselves
  // during testing. Deliberately different specimen types from each
  // person's own existing worklist cases, for broader coverage rather
  // than repeating what they've already seen.

  // — Pete (Fenwick General / St. Catherine's) —
  {
    id: 'ord-004', externalOrderNumber: 'FGH-ORD-88301', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'FGH',
    patient: { firstName: 'Harold', lastName: 'Whitfield', dateOfBirth: '1951-06-02', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Dr. Naomi Blackwood', namePrefix: 'Dr.', givenNames: 'Naomi', familyNames: 'Blackwood' }, priority: 'Routine',
    clinicalIndication: 'Slowly enlarging nodule on the nose, pearly appearance with telangiectasia. Clinically suspicious for basal cell carcinoma. Shave excision.',
    specimens: [{ description: 'Nose, skin excision — pearly nodule', externalSpecimenCode: 'SURG-01' }],
    rawMessage: 'MSH|^~\\&|LIS|FGH|PATHSCRIBE|LAB|' + isoDaysAgo(0).replace(/[-:T.Z]/g, '').slice(0, 14) + '||ORM^O01|MSG88301|P|2.5.1',
  },
  {
    id: 'ord-005', externalOrderNumber: 'SCUH-ORD-22014', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'SCUH',
    patient: { firstName: 'Denise', lastName: 'Palowski', dateOfBirth: '1985-09-19', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Dr. Rebecca Sung', namePrefix: 'Dr.', givenNames: 'Rebecca', familyNames: 'Sung' }, priority: 'Routine',
    clinicalIndication: 'Colposcopy: HSIL (CIN2) on cervical biopsy, HPV 16/18 positive. LEEP/LLETZ excision for definitive treatment.',
    specimens: [{ description: 'Cervix, LEEP excision', externalSpecimenCode: 'SURG-01' }],
  },
  {
    id: 'ord-006', externalOrderNumber: 'FGH-ORD-88322', source: 'api',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'FGH',
    patient: { firstName: 'Walter', lastName: 'Bramwell', dateOfBirth: '1962-01-27', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Dr. Anita Kapoor', namePrefix: 'Dr.', givenNames: 'Anita', familyNames: 'Kapoor' }, priority: 'Routine',
    clinicalIndication: 'Pancytopenia of unknown cause, 6-week workup. Peripheral smear shows dysplastic changes. Bone marrow biopsy and aspirate for morphological evaluation.',
    specimens: [{ description: 'Bone marrow biopsy and aspirate, posterior iliac crest' }],
  },

  // — Amber (Westside Surgical Centre) —
  {
    id: 'ord-007', externalOrderNumber: 'WSSC-ORD-71042', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'WSSC',
    patient: { firstName: 'Rosalind', lastName: 'Marchetti', dateOfBirth: '1969-04-14', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Dr. Wayne Ostrowski', namePrefix: 'Dr.', givenNames: 'Wayne', familyNames: 'Ostrowski' }, priority: 'Routine',
    clinicalIndication: 'Symptomatic cholelithiasis with recurrent biliary colic. Ultrasound: multiple gallstones, wall thickening. Laparoscopic cholecystectomy.',
    specimens: [{ description: 'Gallbladder, cholecystectomy', externalSpecimenCode: 'SURG-01' }],
  },
  {
    id: 'ord-008', externalOrderNumber: 'WSSC-ORD-71058', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'WSSC',
    patient: { firstName: 'Constance', lastName: 'Ferreira', dateOfBirth: '1958-12-30', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Dr. Grace Ibekwe', namePrefix: 'Dr.', givenNames: 'Grace', familyNames: 'Ibekwe' }, priority: 'Routine',
    clinicalIndication: 'Postmenopausal bleeding. Transvaginal ultrasound: endometrial thickness 14mm. Pipelle endometrial biopsy to exclude malignancy.',
    specimens: [{ description: 'Endometrium, pipelle biopsy' }],
  },
  {
    id: 'ord-009', externalOrderNumber: 'WSSC-ORD-71075', source: 'api',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'WSSC',
    patient: { firstName: 'Bruce', lastName: 'Halvorsen', dateOfBirth: '1994-02-08', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Dr. Marcus Feldman', namePrefix: 'Dr.', givenNames: 'Marcus', familyNames: 'Feldman' }, priority: 'STAT',
    clinicalIndication: 'Painless right testicular mass. Ultrasound: 2.8 cm heterogeneous intratesticular lesion, AFP and beta-hCG elevated. Radical inguinal orchiectomy.',
    specimens: [{ description: 'Right testis, radical orchiectomy' }],
  },

  // — Bronwyn (Royal Manchester Centre) —
  {
    id: 'ord-010', externalOrderNumber: 'RMANC-ORD-55221', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Diane', lastName: 'Postlethwaite', dateOfBirth: '2014-05-06', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Mr. Julian Bardsley', namePrefix: 'Mr.', givenNames: 'Julian', familyNames: 'Bardsley' }, priority: 'Routine',
    clinicalIndication: 'Recurrent tonsillitis, 6 episodes in the past year, with one tonsil grossly asymmetric — query lymphoma. Bilateral tonsillectomy.',
    specimens: [{ description: 'Bilateral tonsils, tonsillectomy', externalSpecimenCode: 'SURG-01' }],
  },
  {
    id: 'ord-011', externalOrderNumber: 'RMANC-ORD-55247', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Reginald', lastName: 'Openshaw', dateOfBirth: '1979-08-21', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Dr. Priyanka Desai', namePrefix: 'Dr.', givenNames: 'Priyanka', familyNames: 'Desai' }, priority: 'STAT',
    clinicalIndication: 'Nephrotic syndrome — proteinuria 6.2g/24hr, hypoalbuminaemia, oedema. Renal ultrasound normal size, no obstruction. Percutaneous renal biopsy for medical renal workup.',
    specimens: [{ description: 'Kidney, percutaneous core biopsy — native, medical renal' }],
  },
  {
    id: 'ord-012', externalOrderNumber: 'RMANC-ORD-55263', source: 'api',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Sheila', lastName: 'Trenholme', dateOfBirth: '1966-10-11', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Dr. Aidan Foster', namePrefix: 'Dr.', givenNames: 'Aidan', familyNames: 'Foster' }, priority: 'Routine',
    clinicalIndication: 'Enlarging left axillary lymphadenopathy over 8 weeks, associated night sweats. PET-CT: hypermetabolic nodal mass. Excisional lymph node biopsy for lymphoma staging.',
    specimens: [{ description: 'Left axillary lymph node, excisional biopsy' }],
  },

  // — Paul (Royal Manchester Centre) —
  {
    id: 'ord-013', externalOrderNumber: 'RMANC-ORD-55289', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Norman', lastName: 'Ridgeway', dateOfBirth: '1988-03-25', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Dr. Fatima Al-Rashid', namePrefix: 'Dr.', givenNames: 'Fatima', familyNames: 'Al-Rashid' }, priority: 'Routine',
    clinicalIndication: 'Chronic scaly plaques, extensor surfaces, poor response to topical steroids. Query psoriasis vs. eczema vs. cutaneous lymphoma. Punch biopsy for histological confirmation.',
    specimens: [{ description: 'Skin, punch biopsy — extensor forearm', externalSpecimenCode: 'SURG-01' }],
  },
  {
    id: 'ord-014', externalOrderNumber: 'RMANC-ORD-55304', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Vera', lastName: 'Cholmondeley', dateOfBirth: '1957-07-17', sex: 'F', mrn: '' },
    requestingProvider: { rawName: 'Miss Amara Osei', namePrefix: 'Miss', givenNames: 'Amara', familyNames: 'Osei' }, priority: 'Routine',
    clinicalIndication: 'Submandibular gland swelling, FNA suspicious for pleomorphic adenoma. Submandibular gland excision.',
    specimens: [{ description: 'Submandibular gland, excision' }],
  },
  {
    id: 'ord-015', externalOrderNumber: 'RMANC-ORD-55318', source: 'api',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMANC',
    patient: { firstName: 'Trevor', lastName: 'Pickersgill', dateOfBirth: '1996-11-30', sex: 'M', mrn: '' },
    requestingProvider: { rawName: 'Mr. Duncan Wray', namePrefix: 'Mr.', givenNames: 'Duncan', familyNames: 'Wray' }, priority: 'STAT',
    clinicalIndication: 'Acute right iliac fossa pain, 18 hours, guarding on examination, raised CRP and white cell count. Clinical diagnosis of acute appendicitis. Emergency laparoscopic appendicectomy.',
    specimens: [{ description: 'Appendix, appendicectomy' }],
  },

  // ── 14 real, seeded test-patient orders — per direct follow-up's own
  //    exact clinical data (patient/MRN/DOB/ICD-10/specimen), used
  //    verbatim rather than paraphrased. Real, honest note: most
  //    specimen descriptions below are deliberately Pete's own,
  //    clinically specific wording, not forced to exactly match a
  //    Specimen Dictionary entry's own name/normalizedLabel — a
  //    genuinely accurate clinical description ("Prostate needle core
  //    biopsies (12 cores: 6 right, 6 left)") rarely matches a generic
  //    dictionary name character-for-character, so most of these will
  //    correctly show needsDictionaryResolution on import — real,
  //    honest behavior, not something to mask by rewording Pete's own
  //    text to force a false match.
  {
    id: 'ord-016', externalOrderNumber: 'EPO-ORD-40112', source: 'hl7',
    receivedAt: isoDaysAgo(3), status: 'pending',
    externalAssigningAuthority: 'EPO',
    patient: { firstName: 'Margaret', lastName: 'Higgins', dateOfBirth: '1958-04-12', sex: 'F', mrn: '90481237' },
    requestingProvider: { rawName: 'Dr. Owen Fairweather', namePrefix: 'Dr.', givenNames: 'Owen', familyNames: 'Fairweather' }, priority: 'Routine',
    clinicalIndication: 'Right upper lobe lung nodule, 2.3 cm, PET-avid on staging imaging. Wedge resection for tissue diagnosis.',
    icd10Codes: [{ code: 'C34.11', description: 'Malignant neoplasm of upper lobe, right bronchus or lung' }],
    specimens: [{ description: 'Right upper lobe lung wedge resection' }],
  },
  {
    id: 'ord-017', externalOrderNumber: 'WSC-ORD-19045', source: 'hl7',
    receivedAt: isoDaysAgo(3), status: 'pending',
    externalAssigningAuthority: 'WSC',
    patient: { firstName: 'Liam', lastName: 'Vance', dateOfBirth: '2012-11-03', sex: 'M', mrn: '41290384' },
    requestingProvider: { rawName: 'Dr. Patricia Ndiaye', namePrefix: 'Dr.', givenNames: 'Patricia', familyNames: 'Ndiaye' }, priority: 'STAT',
    clinicalIndication: 'Acute right lower quadrant pain, 24 hours, fever and guarding on examination. Clinical diagnosis of acute appendicitis. Emergency appendectomy.',
    icd10Codes: [{ code: 'K35.80', description: 'Unspecified acute appendicitis' }],
    specimens: [{ description: 'Appendix (Appendectomy)' }],
  },
  {
    id: 'ord-018', externalOrderNumber: 'NSC-ORD-27788', source: 'api',
    receivedAt: isoDaysAgo(2), status: 'pending',
    externalAssigningAuthority: 'NSC',
    patient: { firstName: 'Sophia', lastName: 'Patel', dateOfBirth: '1991-08-25', sex: 'F', mrn: '78310924' },
    requestingProvider: { rawName: 'Dr. Renata Alves', namePrefix: 'Dr.', givenNames: 'Renata', familyNames: 'Alves' }, priority: 'Routine',
    clinicalIndication: 'Pelvic pain and menorrhagia; transvaginal ultrasound shows a uterine fibroid and thickened endometrium. Myomectomy with endometrial sampling.',
    icd10Codes: [{ code: 'N80.00', description: 'Endometriosis of uterus, unspecified' }],
    specimens: [
      { description: 'Uterine leiomyoma' },
      { description: 'Endometrial biopsy' },
    ],
  },
  {
    id: 'ord-019', externalOrderNumber: 'EPO-ORD-40156', source: 'hl7',
    receivedAt: isoDaysAgo(2), status: 'pending',
    externalAssigningAuthority: 'EPO',
    patient: { firstName: 'Arthur', lastName: 'Pendelton', dateOfBirth: '1949-01-15', sex: 'M', mrn: '10928374' },
    requestingProvider: { rawName: 'Dr. Owen Fairweather', namePrefix: 'Dr.', givenNames: 'Owen', familyNames: 'Fairweather' }, priority: 'Routine',
    clinicalIndication: 'Elevated PSA 8.4 ng/mL with abnormal digital rectal exam. MRI-fusion guided prostate biopsy for tissue diagnosis.',
    icd10Codes: [{ code: 'C61', description: 'Malignant neoplasm of prostate' }],
    specimens: [{ description: 'Prostate needle core biopsies (12 cores: 6 right, 6 left)' }],
  },
  {
    id: 'ord-020', externalOrderNumber: 'EPO-ORD-40167', source: 'hl7',
    receivedAt: isoDaysAgo(2), status: 'pending',
    externalAssigningAuthority: 'EPO',
    patient: { firstName: 'Elena', lastName: 'Rostova', dateOfBirth: '1983-06-30', sex: 'F', mrn: '65421980' },
    requestingProvider: { rawName: 'Dr. Marguerite Delacroix', namePrefix: 'Dr.', givenNames: 'Marguerite', familyNames: 'Delacroix' }, priority: 'Routine',
    clinicalIndication: 'Left breast mass, upper-outer quadrant, BI-RADS 5 on diagnostic mammography. Core needle biopsy with sentinel lymph node biopsy.',
    icd10Codes: [{ code: 'C50.412', description: 'Malignant neoplasm of upper-outer quadrant of left female breast' }],
    specimens: [
      { description: 'Left breast core needle biopsy' },
      { description: 'Sentinel lymph node' },
    ],
  },
  {
    id: 'ord-021', externalOrderNumber: 'RMC-ORD-63304', source: 'api',
    receivedAt: isoDaysAgo(1), status: 'pending',
    externalAssigningAuthority: 'RMC',
    patient: { firstName: 'Derrick', lastName: 'Hayes', dateOfBirth: '1975-09-14', sex: 'M', mrn: '33819204' },
    requestingProvider: { rawName: 'Dr. Samuel Okonkwo', namePrefix: 'Dr.', givenNames: 'Samuel', familyNames: 'Okonkwo' }, priority: 'Routine',
    clinicalIndication: 'Screening colonoscopy — cecal polyp removed by snare polypectomy; separate sigmoid colon biopsy for a mucosal abnormality.',
    icd10Codes: [{ code: 'K63.5', description: 'Polyp of colon' }],
    specimens: [
      { description: 'Cecal polyp' },
      { description: 'Sigmoid colon biopsy' },
    ],
  },
  {
    id: 'ord-022', externalOrderNumber: 'NSC-ORD-27812', source: 'manual',
    receivedAt: isoDaysAgo(1), status: 'pending',
    externalAssigningAuthority: 'NSC',
    patient: { firstName: 'Chloe', lastName: 'Bennett', dateOfBirth: '2004-02-08', sex: 'F', mrn: '88201943' },
    requestingProvider: { rawName: 'Dr. Renata Alves', namePrefix: 'Dr.', givenNames: 'Renata', familyNames: 'Alves' }, priority: 'Routine',
    clinicalIndication: 'Pigmented lesion, left cheek, stable in size; patient requesting removal. Punch biopsy for histological evaluation.',
    icd10Codes: [{ code: 'D22.39', description: 'Melanocytic nevi of other and unspecified parts of face' }],
    specimens: [{ description: 'Left cheek skin punch biopsy' }],
  },
  {
    id: 'ord-023', externalOrderNumber: 'EPO-ORD-40179', source: 'hl7',
    receivedAt: isoDaysAgo(1), status: 'pending',
    externalAssigningAuthority: 'EPO',
    patient: { firstName: 'Mateo', lastName: 'Gomez', dateOfBirth: '1966-05-19', sex: 'M', mrn: '51092384' },
    requestingProvider: { rawName: 'Dr. Marguerite Delacroix', namePrefix: 'Dr.', givenNames: 'Marguerite', familyNames: 'Delacroix' }, priority: 'Routine',
    clinicalIndication: 'Gross painless hematuria; cystoscopy revealed a papillary bladder mass. TURBT for tissue diagnosis and staging.',
    icd10Codes: [{ code: 'C67.9', description: 'Malignant neoplasm of bladder, unspecified' }],
    specimens: [{ description: 'Transurethral resection of bladder tumor (TURBT)' }],
  },
  {
    id: 'ord-024', externalOrderNumber: 'RMC-ORD-63319', source: 'api',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMC',
    patient: { firstName: 'Hannah', lastName: 'Lindqvist', dateOfBirth: '1998-10-12', sex: 'F', mrn: '24901823' },
    requestingProvider: { rawName: 'Dr. Samuel Okonkwo', namePrefix: 'Dr.', givenNames: 'Samuel', familyNames: 'Okonkwo' }, priority: 'Routine',
    clinicalIndication: 'Palpable right thyroid nodule, 1.8 cm, TI-RADS 4 on ultrasound. Fine needle aspiration for cytological evaluation.',
    icd10Codes: [{ code: 'E04.1', description: 'Nontoxic single thyroid nodule' }],
    specimens: [{ description: "Right thyroid lobe fine needle aspiration (FNA) cell block & smear" }],
  },
  {
    id: 'ord-025', externalOrderNumber: 'EPO-ORD-40195', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'EPO',
    patient: { firstName: 'Samuel', lastName: "O'Connor", dateOfBirth: '1953-03-04', sex: 'M', mrn: '60293841' },
    requestingProvider: { rawName: 'Dr. Owen Fairweather', namePrefix: 'Dr.', givenNames: 'Owen', familyNames: 'Fairweather' }, priority: 'Routine',
    clinicalIndication: 'Ascending colon mass on colonoscopy, biopsy-proven adenocarcinoma. Right hemicolectomy for definitive resection.',
    icd10Codes: [{ code: 'C18.2', description: 'Malignant neoplasm of ascending colon' }],
    specimens: [{ description: 'Right hemicolectomy specimen' }],
  },
  {
    id: 'ord-026', externalOrderNumber: 'NSC-ORD-27840', source: 'manual',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'NSC',
    patient: { firstName: 'Aisha', lastName: 'Jackson', dateOfBirth: '1988-07-22', sex: 'F', mrn: '81920347' },
    requestingProvider: { rawName: 'Dr. Renata Alves', namePrefix: 'Dr.', givenNames: 'Renata', familyNames: 'Alves' }, priority: 'Routine',
    clinicalIndication: 'HSIL on Pap smear; colposcopy-directed biopsy confirmed CIN3. LEEP excision with endocervical curettage.',
    icd10Codes: [{ code: 'C53.9', description: 'Malignant neoplasm of cervix uteri, unspecified' }],
    specimens: [
      { description: 'Cervical LEEP excision' },
      { description: 'Endocervical curettage (ECC)' },
    ],
  },
  {
    id: 'ord-027', externalOrderNumber: 'WSC-ORD-19067', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'WSC',
    patient: { firstName: 'Julian', lastName: 'Zhang', dateOfBirth: '2018-12-01', sex: 'M', mrn: '14930284' },
    requestingProvider: { rawName: 'Dr. Patricia Ndiaye', namePrefix: 'Dr.', givenNames: 'Patricia', familyNames: 'Ndiaye' }, priority: 'Routine',
    clinicalIndication: 'Recurrent tonsillitis, six episodes in the past year, with sleep-disordered breathing. Tonsillectomy and adenoidectomy.',
    icd10Codes: [{ code: 'J35.01', description: 'Chronic tonsillitis' }],
    specimens: [{ description: 'Bilateral palatine tonsils and adenoids' }],
  },
  {
    id: 'ord-028', externalOrderNumber: 'RMC-ORD-63337', source: 'api',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'RMC',
    patient: { firstName: 'Nora', lastName: 'Vance', dateOfBirth: '1990-09-18', sex: 'F', mrn: '39021845' },
    requestingProvider: { rawName: 'Dr. Samuel Okonkwo', namePrefix: 'Dr.', givenNames: 'Samuel', familyNames: 'Okonkwo' }, priority: 'Routine',
    clinicalIndication: 'Right adnexal cystic mass on ultrasound with elevated CA-125. Image-guided fluid aspiration for cytological evaluation.',
    icd10Codes: [{ code: 'C56.9', description: 'Malignant neoplasm of unspecified ovary' }],
    specimens: [{ description: 'Right ovarian cyst fluid aspiration (Non-Gynecologic Cytology - Fluid & Cell Block)' }],
  },
  {
    id: 'ord-029', externalOrderNumber: 'EPO-ORD-40208', source: 'hl7',
    receivedAt: isoDaysAgo(0), status: 'pending',
    externalAssigningAuthority: 'EPO',
    patient: { firstName: 'Victor', lastName: 'Sterling', dateOfBirth: '1957-05-04', sex: 'M', mrn: '71289034' },
    requestingProvider: { rawName: 'Dr. Marguerite Delacroix', namePrefix: 'Dr.', givenNames: 'Marguerite', familyNames: 'Delacroix' }, priority: 'Routine',
    clinicalIndication: 'Left lower lobe mass on CT chest; bronchoscopy performed with bronchial washing and brushing for cytological evaluation.',
    icd10Codes: [{ code: 'C34.90', description: 'Malignant neoplasm of unspecified part of unspecified bronchus or lung' }],
    specimens: [{ description: 'Left lower lobe bronchial washing and brushing (Pulmonary Cytology - Direct Smear & Cell Block)' }],
  },
];

const persistOrders = (data: IncomingOrder[]) => storageSet('pathscribe_incoming_orders', data);

// Real fix, per direct follow-up: "Can we simply add the data to the
// tables?" Confirmed directly before building this: storageGet's own
// fallback-to-SEED_ORDERS only ever applies when the real,
// persisted 'pathscribe_incoming_orders' key is completely absent —
// for anyone who has already loaded the Accession page once (true
// for this app's own primary tester), that key already exists, so
// editing SEED_ORDERS in code alone would be silently ignored
// forever. Same real version-bump re-seed trigger as
// mockCaseService.ts's own MOCK_VERSION — but a genuine MERGE, never
// that file's own destructive wipe: an order a tech has already
// imported/linked to a real case (status: 'linked', a real
// linkedCaseId) must keep that real, current state, never silently
// revert to 'pending' just because it also happens to still be
// present in the SEED_ORDERS constant. Only genuinely new seed
// orders (by id, not yet in the real, persisted store) are appended;
// no existing order's own fields are ever touched.
const ORDERS_SEED_VERSION = '2'; // bumped: added 14 real, seeded test-patient orders (ord-016..ord-029) — per direct follow-up
const ORDERS_SEED_VERSION_KEY = 'pathscribe_orders_seed_version';

function loadOrders(): IncomingOrder[] {
  const stored = storageGet<IncomingOrder[]>('pathscribe_incoming_orders', SEED_ORDERS);
  const storedVersion = localStorage.getItem(ORDERS_SEED_VERSION_KEY);
  if (storedVersion === ORDERS_SEED_VERSION) return stored;

  const existingIds = new Set(stored.map(o => o.id));
  const newOnes = SEED_ORDERS.filter(o => !existingIds.has(o.id));
  const merged = newOnes.length > 0 ? [...stored, ...newOnes] : stored;
  localStorage.setItem(ORDERS_SEED_VERSION_KEY, ORDERS_SEED_VERSION);
  if (newOnes.length > 0) persistOrders(merged);
  return merged;
}

let ORDERS: IncomingOrder[] = loadOrders();

/** Real, priority-ordered crosswalk match — resolves PS-80's real,
 *  confirmed gap: the old match was a single, flat `.find()` on
 *  (clientId, externalCode) alone, completely ignoring
 *  SpecimenCodeCrosswalkEntry.codingSystem even though that field
 *  already existed. Two real crosswalk entries for the same
 *  (clientId, externalCode) but different codingSystem values would
 *  previously resolve to whichever happened to come first in the
 *  array — a real, silent, wrong-match risk this fixes.
 *
 *  Real, most-specific-wins priority, matching the same pattern
 *  already proven for BillingRuleVersion site overrides and
 *  CaseMask's own scope resolution in this app:
 *    1. Exact codingSystem match, when the incoming specimen actually
 *       carried one.
 *    2. A crosswalk entry with NO codingSystem set at all (every real
 *       entry created before multi-code-system matching existed, or
 *       one deliberately left general) — a real, backward-compatible
 *       fallback so pre-existing crosswalk entries keep matching
 *       exactly as they did before this fix.
 *    3. Any remaining match on (clientId, externalCode) as a final,
 *       last-resort fallback — never leaves a real match on the table
 *       over a coding-system mismatch alone; a genuinely wrong
 *       codingSystem tag on either side (a real, plausible data-entry
 *       error) shouldn't turn a real match into a false miss.
 *
 *  Uses normalizeOrderCode (utils/normalizeOrderCode.ts) for
 *  comparison, not the old plain .toLowerCase() — strips punctuation
 *  and collapses whitespace too, a real, strictly safer comparison
 *  (can only remove false negatives, never introduce a false
 *  positive — see that file's own header).
 *
 *  Real, disclosed, deliberate scope boundary: does NOT filter by
 *  SpecimenCodeCrosswalkEntry.siteId at all — confirmed directly
 *  before writing this that IncomingOrder has no siteId/organisationId
 *  field anywhere, so there is no real value to match against yet. A
 *  site-scoped crosswalk entry is created and stored correctly, but
 *  cannot actually be exercised from real inbound order data until
 *  IncomingOrder itself gains a real site-identifying field — a real,
 *  separate decision (and, per this app's own architecture, one the
 *  interface engine would need to populate) not made here. */
function findCrosswalkMatch(
  crosswalk: SpecimenCodeCrosswalkEntry[],
  clientId: string,
  externalCode: string,
  codingSystem: OrderCodeCodingSystem | undefined,
): SpecimenCodeCrosswalkEntry | undefined {
  const normalizedTarget = normalizeOrderCode(externalCode);
  const candidates = crosswalk.filter(
    x => x.clientId === clientId && normalizeOrderCode(x.externalCode) === normalizedTarget
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  if (codingSystem) {
    const exact = candidates.find(x => x.codingSystem === codingSystem);
    if (exact) return exact;
  }
  const legacy = candidates.find(x => !x.codingSystem);
  if (legacy) return legacy;
  return candidates[0];
}

export const mockOrderIntakeService: IOrderIntakeService = {

  async listPendingOrders(params) {
    await delay();
    let results = ORDERS.filter(o => o.status === 'pending');
    if (params?.facilityId) results = results.filter(o => o.facilityId === params.facilityId);
    return ok([...results]);
  },

  async getOrder(orderId: ID) {
    await delay();
    const o = ORDERS.find(o => o.id === orderId);
    return o ? ok({ ...o }) : err(`Order ${orderId} not found`);
  },

  async markOrderLinked(orderId, caseId) {
    await delay();
    const idx = ORDERS.findIndex(o => o.id === orderId);
    if (idx === -1) return err(`Order ${orderId} not found`);
    ORDERS = ORDERS.map(o => o.id === orderId ? { ...o, status: 'linked' as const, linkedCaseId: caseId } : o);
    persistOrders(ORDERS);
    return ok({ ...ORDERS[idx] });
  },

  async receiveOrder(order) {
    await delay();
    const newO: IncomingOrder = { ...order, id: 'ord-' + Date.now(), status: 'pending', receivedAt: new Date().toISOString() };
    ORDERS = [...ORDERS, newO];
    persistOrders(ORDERS);
    return ok({ ...newO });
  },

  async resolveOrder(orderId: ID) {
    await delay();
    const idx = ORDERS.findIndex(o => o.id === orderId);
    if (idx === -1) return err(`Order ${orderId} not found`);
    const order = { ...ORDERS[idx] };
    const warnings: string[] = [];

    // ── Facility resolution — Facility.assigningAuthority IS the crosswalk key, no
    // separate facility crosswalk table needed. ──────────────────────────
    const clientsRes = await mockFacilityService.getAll();
    const clients = clientsRes.ok ? clientsRes.data : [];
    const clientMatch = clients.find(c => c.assigningAuthority.toLowerCase() === order.externalAssigningAuthority.toLowerCase());

    if (clientMatch) {
      order.facilityId = clientMatch.id;
      order.facilityWasAutoCreated = false;
    } else {
      const created = await mockFacilityService.findOrCreateByAssigningAuthority(
        order.externalAssigningAuthority,
        `Unrecognized facility (order ${order.externalOrderNumber})`,
        `No Facility.assigningAuthority match for "${order.externalAssigningAuthority}" on incoming order ${order.externalOrderNumber} — created pending admin review.`
      );
      if (created.ok) {
        order.facilityId = created.data.id;
        order.facilityWasAutoCreated = true;
        warnings.push(`No existing facility matched assigning authority "${order.externalAssigningAuthority}" — created "${created.data.name}" as Unverified, pending admin review.`);
      }
    }

    // ── Requesting physician resolution — real, per PS-81 (Jira),
    // completing the "requesting" side to match the ADT pipeline's own
    // "attending_of_record" resolution. Prefers structured matching
    // (familyNames/givenNames, sidesteps any free-text formatting
    // difference from other pipelines) when the order carries a real,
    // confident split; falls back to matching on rawName as free text
    // otherwise. Never blocks order resolution on a physician-
    // resolution failure — same fail-open posture as client/specimen
    // resolution above. ──────────────────────────────────────────────
    const providerResolved = order.requestingProvider.familyNames
      ? await resolveProviderName(
          {
            namePrefix: order.requestingProvider.namePrefix,
            givenNames: order.requestingProvider.givenNames,
            familyNames: order.requestingProvider.familyNames,
            nameSuffix: order.requestingProvider.nameSuffix,
            identifiers: order.requestingProvider.identifiers,
          },
          'requesting',
          order.facilityId
        )
      : await resolveProviderName(order.requestingProvider.rawName, 'requesting', order.facilityId);
    if (providerResolved.ok && providerResolved.data) {
      order.requestingProviderPhysicianId = providerResolved.data.physician.id;
    }

    // ── Per-specimen resolution — Specimen Dictionary first, department
    // derived transitively ────────────────────────────────────────────
    const dictionaryRes = await mockSpecimenDictionaryService.getAll();
    const dictionary = dictionaryRes.ok ? dictionaryRes.data : [];

    const resolvedSpecimens = await Promise.all(order.specimens.map(async (spec) => {
      // Crosswalk match first, if this specimen came with a code —
      // resolves to a specific SpecimenEntry, not straight to a
      // department, so "TISSUE-01" resolves to "Left breast core biopsy"
      // and its department follows transitively, not a bare department
      // guess that loses the actual specimen type. Real, priority-
      // ordered match (findCrosswalkMatch above) — resolves PS-80.
      if (spec.externalSpecimenCode && order.facilityId) {
        const xwalkMatch = findCrosswalkMatch(CROSSWALK, order.facilityId, spec.externalSpecimenCode, spec.externalCodingSystem);
        const entry = xwalkMatch ? dictionary.find(d => d.id === xwalkMatch.dictionaryEntryId) : undefined;
        if (entry) {
          return {
            ...spec,
            dictionaryEntryId: entry.id, dictionaryEntryWasAutoCreated: false,
            departmentId: entry.departmentId, departmentWasAutoCreated: false,
          };
        }
      }

      // Real, per direct guidance's own confirmed resolution
      // (PS-80): raising a real InterfaceException happens ALONGSIDE
      // the existing auto-create-and-continue fallback below, never
      // instead of it — matches the same fail-open, never-block-order-
      // processing posture this whole function already applies to
      // clients and departments. Only for a specimen that actually
      // carried a real code the crosswalk tried and missed — a
      // description-only specimen (no externalSpecimenCode at all) was
      // never going to have a crosswalk entry in the first place, so
      // that's not a real "unmapped code" event, just the normal,
      // expected description-only path.
      if (spec.externalSpecimenCode && order.facilityId) {
        await mockInterfaceExceptionService.create({
          eventType: 'unmapped_order_code',
          reason: `No crosswalk match for order code "${spec.externalSpecimenCode}"${spec.externalCodingSystem ? ` (${spec.externalCodingSystem})` : ''} on order ${order.externalOrderNumber} from client assigning authority "${order.externalAssigningAuthority}" — auto-created a pending Specimen Dictionary entry so order processing wasn't blocked; a real crosswalk entry should be added for this code.`,
          rawMessage: order.rawMessage ?? `${spec.externalSpecimenCode} — ${spec.description}`,
          rawOrderCode: spec.externalSpecimenCode,
          normalizedOrderCode: normalizeOrderCode(spec.externalSpecimenCode),
          codingSystem: spec.externalCodingSystem,
          facilityId: order.facilityId,
        });
      }

      // No crosswalk match (or no code at all) — fall back to the
      // Specimen Dictionary's own findOrCreateByName using whatever text
      // is available, same fail-open posture as everywhere else. A new
      // crosswalk entry is learned immediately so the same code resolves
      // instantly next time, even though the entry itself still needs
      // admin sign-off.
      const nameGuess = spec.externalSpecimenCode ?? spec.description;
      const created = await mockSpecimenDictionaryService.findOrCreateByName(
        nameGuess,
        `No crosswalk match for specimen "${spec.description}"${spec.externalSpecimenCode ? ` (code "${spec.externalSpecimenCode}")` : ''} on order ${order.externalOrderNumber} from client assigning authority "${order.externalAssigningAuthority}" — created pending admin review.`
      );
      if (!created.ok) return spec;

      const wasAutoCreated = !!created.data.autoCreated;
      if (wasAutoCreated && spec.externalSpecimenCode && order.facilityId) {
        const newEntry: SpecimenCodeCrosswalkEntry = {
          id: 'xwalk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          clientId: order.facilityId,
          externalCode: spec.externalSpecimenCode,
          dictionaryEntryId: created.data.id,
          createdAt: new Date().toISOString(),
          createdBy: 'system',
        };
        CROSSWALK = [...CROSSWALK, newEntry];
        persistCrosswalk(CROSSWALK);
      }
      if (wasAutoCreated) {
        warnings.push(`No crosswalk match for specimen "${spec.description}" — created Specimen Dictionary entry "${created.data.name}" as pending admin review.`);
      }

      // The matched/created dictionary entry may not have a department set
      // yet (a brand-new auto-created entry never does; an existing one
      // might not either — see SpecimenEntry.departmentId's own
      // "optional, additive" doc comment). Falling back to department-level
      // findOrCreateByName here is a deliberate, documented
      // simplification: it derives a usable department immediately (never
      // blocks order processing) without writing the link back onto the
      // dictionary entry itself — that reconciliation is left for an
      // admin, same as everywhere else in this fail-open pattern, rather
      // than silently auto-linking a guess.
      let departmentId = created.data.departmentId;
      let departmentWasAutoCreated = false;
      if (!departmentId) {
        const catCreated = await mockDepartmentService.findOrCreateByName(
          nameGuess,
          `No department on Specimen Dictionary entry "${created.data.name}" for specimen "${spec.description}" on order ${order.externalOrderNumber} — created pending admin review.`
        );
        if (catCreated.ok) {
          departmentId = catCreated.data.id;
          departmentWasAutoCreated = !!catCreated.data.autoCreated;
          if (departmentWasAutoCreated) {
            warnings.push(`Specimen Dictionary entry "${created.data.name}" has no department — created Department "${catCreated.data.name}" as Unverified, pending admin review.`);
          }
        }
      }

      return {
        ...spec,
        dictionaryEntryId: created.data.id, dictionaryEntryWasAutoCreated: wasAutoCreated,
        departmentId, departmentWasAutoCreated,
      };
    }));

    order.specimens = resolvedSpecimens;
    ORDERS = ORDERS.map(o => o.id === orderId ? order : o);
    persistOrders(ORDERS);

    const result: OrderResolutionResult = { order, warnings };
    return ok(result);
  },

  // ── Crosswalk management ────────────────────────────────────────────────
  async listCrosswalkEntries(clientId?: string) {
    await delay();
    const results = clientId ? CROSSWALK.filter(x => x.clientId === clientId) : CROSSWALK;
    return ok([...results]);
  },

  async addCrosswalkEntry(entry) {
    await delay();
    const newEntry: SpecimenCodeCrosswalkEntry = { ...entry, id: 'xwalk-' + Date.now(), createdAt: new Date().toISOString() };
    CROSSWALK = [...CROSSWALK, newEntry];
    persistCrosswalk(CROSSWALK);
    return ok({ ...newEntry });
  },

  async updateCrosswalkEntry(id, changes) {
    await delay();
    const idx = CROSSWALK.findIndex(x => x.id === id);
    if (idx === -1) return err(`Crosswalk entry ${id} not found`);
    CROSSWALK = CROSSWALK.map(x => x.id === id ? { ...x, ...changes } : x);
    persistCrosswalk(CROSSWALK);
    return ok({ ...CROSSWALK[idx] });
  },
};
