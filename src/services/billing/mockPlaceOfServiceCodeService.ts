// src/services/billing/mockPlaceOfServiceCodeService.ts
// ───────────────────────────────────────────────────────────────────────────────
// Real, versioned, admin-viewable dictionary of CMS Place of Service
// codes - matches BillingRuleVersion's own real append-only pattern
// (see PlaceOfServiceCode.ts's own header for the full reasoning on
// what carries over from that pattern and what deliberately doesn't).
//
// Real, complete source, fetched directly:
// https://www.cms.gov/medicare/coding-billing/place-of-service-codes/code-sets
// "Database (updated May 2, 2024)" per the page's own real label; page
// itself last modified 02/17/2026. 52 real, currently-assigned codes -
// the real "Unassigned" ranges (28-30, 35-40, 43-48, 59, 63-64, 67-70,
// 73-80) are deliberately not seeded, since they're not real, selectable
// options a facility could ever actually hold.
//
// Real, honest disclosure on effectiveFrom: where the real CMS source
// states a specific effective date for a code (e.g. "(Effective October
// 1, 2003)"), that real date is used. For the older, foundational codes
// CMS gave no code-specific date for in the source (11, 12, 21, 23-26,
// 31-34, 41-42, 50-56, 60-62, 65, 71-72, 81, 99), effectiveFrom uses
// "1991-01-01" as a real, disclosed approximate placeholder -
// never presented as a specific, CMS-cited date for that code.
// ───────────────────────────────────────────────────────────────────────────────

import type { PlaceOfServiceCode } from '@/types/billing/PlaceOfServiceCode';
import type { IPlaceOfServiceCodeService } from './IPlaceOfServiceCodeService';
const SOURCE_URL = "https://www.cms.gov/medicare/coding-billing/place-of-service-codes/code-sets";
const SOURCE_LAST_VERIFIED = "2026-08-28";

const SEED_CODES: PlaceOfServiceCode[] = [
  { code: '01', version: 1, effectiveFrom: '2003-10-01', effectiveTo: null, status: 'ACTIVE',
    name: "Pharmacy", description: "A facility or location where drugs and other medically related items and services are sold, dispensed, or otherwise provided directly to patients.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '02', version: 1, effectiveFrom: '2017-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Telehealth Provided Other than in Patient's Home", description: "The location where health services and health related services are provided or received, through telecommunication technology. Patient is not located in their home when receiving health services or health related services through telecommunication technology.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '03', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "School", description: "A facility whose primary purpose is education.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '04', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Homeless Shelter", description: "A facility or location whose primary purpose is to provide temporary housing to homeless individuals (e.g., emergency shelters, individual or family shelters).",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '05', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Indian Health Service Free-standing Facility", description: "A facility or location, owned and operated by the Indian Health Service, which provides diagnostic, therapeutic (surgical and non-surgical), and rehabilitation services to American Indians and Alaska Natives who do not require hospitalization.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '06', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Indian Health Service Provider-based Facility", description: "A facility or location, owned and operated by the Indian Health Service, which provides diagnostic, therapeutic (surgical and non-surgical), and rehabilitation services rendered by, or under the supervision of, physicians to American Indians and Alaska Natives admitted as inpatients or outpatients.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '07', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Tribal 638 Free-standing Facility", description: "A facility or location owned and operated by a federally recognized American Indian or Alaska Native tribe or tribal organization under a 638 agreement, which provides diagnostic, therapeutic (surgical and non-surgical), and rehabilitation services to tribal members who do not require hospitalization.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '08', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Tribal 638 Provider-based Facility", description: "A facility or location owned and operated by a federally recognized American Indian or Alaska Native tribe or tribal organization under a 638 agreement, which provides diagnostic, therapeutic (surgical and non-surgical), and rehabilitation services to tribal members admitted as inpatients or outpatients.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '09', version: 1, effectiveFrom: '2006-07-01', effectiveTo: null, status: 'ACTIVE',
    name: "Prison/Correctional Facility", description: "A prison, jail, reformatory, work farm, detention center, or any other similar facility maintained by either Federal, State or local authorities for the purpose of confinement or rehabilitation of adult or juvenile criminal offenders.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '10', version: 1, effectiveFrom: '2022-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Telehealth Provided in Patient's Home", description: "The location where health services and health related services are provided or received, through telecommunication technology. Patient is located in their home (which is a location other than a hospital or other facility where the patient receives care in a private residence) when receiving health services or health related services through telecommunication technology.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '11', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Office", description: "Location, other than a hospital, skilled nursing facility (SNF), military treatment facility, community health center, State or local public health clinic, or intermediate care facility (ICF), where the health professional routinely provides health examinations, diagnosis, and treatment of illness or injury on an ambulatory basis.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '12', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Home", description: "Location, other than a hospital or other facility, where the patient receives care in a private residence.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '13', version: 1, effectiveFrom: '2003-10-01', effectiveTo: null, status: 'ACTIVE',
    name: "Assisted Living Facility", description: "Congregate residential facility with self-contained living units providing assessment of each resident's needs and on-site support 24 hours a day, 7 days a week, with the capacity to deliver or arrange for services including some health care and other services.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '14', version: 1, effectiveFrom: '2003-10-01', effectiveTo: null, status: 'ACTIVE',
    name: "Group Home", description: "A residence, with shared living areas, where clients receive supervision and other services such as social and/or behavioral services, custodial service, and minimal services (e.g., medication administration).",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '15', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Mobile Unit", description: "A facility/unit that moves from place-to-place equipped to provide preventive, screening, diagnostic, and/or treatment services.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '16', version: 1, effectiveFrom: '2008-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Temporary Lodging", description: "A short term accommodation such as a hotel, camp ground, hostel, cruise ship or resort where the patient receives care, and which is not identified by any other POS code.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '17', version: 1, effectiveFrom: '2010-05-01', effectiveTo: null, status: 'ACTIVE',
    name: "Walk-in Retail Health Clinic", description: "A walk-in health clinic, other than an office, urgent care facility, pharmacy or independent clinic and not described by any other Place of Service code, that is located within a retail operation and provides, on an ambulatory basis, preventive and primary care services.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '18', version: 1, effectiveFrom: '2013-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Place of Employment-Worksite", description: "A location, not described by any other POS code, owned or operated by a public or private entity where the patient is employed, and where a health professional provides on-going or episodic occupational medical, therapeutic or rehabilitative services to the individual.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '19', version: 1, effectiveFrom: '2016-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Off Campus-Outpatient Hospital", description: "A portion of an off-campus hospital provider based department which provides diagnostic, therapeutic (both surgical and nonsurgical), and rehabilitation services to sick or injured persons who do not require hospitalization or institutionalization.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '20', version: 1, effectiveFrom: '2003-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Urgent Care Facility", description: "Location, distinct from a hospital emergency room, an office, or a clinic, whose purpose is to diagnose and treat illness or injury for unscheduled, ambulatory patients seeking immediate medical attention.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '21', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Inpatient Hospital", description: "A facility, other than psychiatric, which primarily provides diagnostic, therapeutic (both surgical and nonsurgical), and rehabilitation services by, or under, the supervision of physicians to patients admitted for a variety of medical conditions.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '22', version: 1, effectiveFrom: '2016-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "On Campus-Outpatient Hospital", description: "A portion of a hospital's main campus which provides diagnostic, therapeutic (both surgical and nonsurgical), and rehabilitation services to sick or injured persons who do not require hospitalization or institutionalization.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '23', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Emergency Room - Hospital", description: "A portion of a hospital where emergency diagnosis and treatment of illness or injury is provided.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '24', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Ambulatory Surgical Center", description: "A freestanding facility, other than a physician's office, where surgical and diagnostic services are provided on an ambulatory basis.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '25', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Birthing Center", description: "A facility, other than a hospital's maternity facilities or a physician's office, which provides a setting for labor, delivery, and immediate post-partum care as well as immediate care of new born infants.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '26', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Military Treatment Facility", description: "A medical facility operated by one or more of the Uniformed Services. Military Treatment Facility (MTF) also refers to certain former U.S. Public Health Service (USPHS) facilities now designated as Uniformed Service Treatment Facilities (USTF).",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '27', version: 1, effectiveFrom: '2023-10-01', effectiveTo: null, status: 'ACTIVE',
    name: "Outreach Site/Street", description: "A non-permanent location on the street or found environment, not described by any other POS code, where health professionals provide preventive, screening, diagnostic, and/or treatment services to unsheltered homeless individuals.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '31', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Skilled Nursing Facility", description: "A facility which primarily provides inpatient skilled nursing care and related services to patients who require medical, nursing, or rehabilitative services but does not provide the level of care or treatment available in a hospital.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '32', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Nursing Facility", description: "A facility which primarily provides to residents skilled nursing care and related services for the rehabilitation of injured, disabled, or sick persons, or, on a regular basis, health-related care services above the level of custodial care to other than individuals with intellectual disabilities.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '33', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Custodial Care Facility", description: "A facility which provides room, board and other personal assistance services, generally on a long-term basis, and which does not include a medical component.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '34', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Hospice", description: "A facility, other than a patient's home, in which palliative and supportive care for terminally ill patients and their families are provided.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '41', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Ambulance - Land", description: "A land vehicle specifically designed, equipped and staffed for lifesaving and transporting the sick or injured.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '42', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Ambulance - Air or Water", description: "An air or water vehicle specifically designed, equipped and staffed for lifesaving and transporting the sick or injured.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '49', version: 1, effectiveFrom: '2023-10-01', effectiveTo: null, status: 'ACTIVE',
    name: "Independent Clinic", description: "A location, not part of a hospital and not described by any other Place of Service code, that is organized and operated to provide preventive, diagnostic, therapeutic, rehabilitative, or palliative services to outpatients only.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '50', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Federally Qualified Health Center", description: "A facility located in a medically underserved area that provides Medicare beneficiaries preventive primary medical care under the general direction of a physician.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '51', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Inpatient Psychiatric Facility", description: "A facility that provides inpatient psychiatric services for the diagnosis and treatment of mental illness on a 24-hour basis, by or under the supervision of a physician.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '52', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Psychiatric Facility-Partial Hospitalization", description: "A facility for the diagnosis and treatment of mental illness that provides a planned therapeutic program for patients who do not require full time hospitalization, but who need broader programs than are possible from outpatient visits to a hospital-based or hospital-affiliated facility.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '53', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Community Mental Health Center", description: "A facility that provides outpatient services including specialized outpatient services for children, the elderly, individuals who are chronically ill, and residents of the CMHC's mental health services area who have been discharged from inpatient treatment; 24 hour a day emergency care services; day treatment, other partial hospitalization services, or psychosocial rehabilitation services; screening for patients being considered for admission to State mental health facilities; and consultation and education services.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '54', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Intermediate Care Facility/Individuals with Intellectual Disabilities", description: "A facility which primarily provides health-related care and services above the level of custodial care to individuals but does not provide the level of care or treatment available in a hospital or SNF.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '55', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Residential Substance Abuse Treatment Facility", description: "A facility which provides treatment for substance (alcohol and drug) abuse to live-in residents who do not require acute medical care. Services include individual and group therapy and counseling, family counseling, laboratory tests, drugs and supplies, psychological testing, and room and board.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '56', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Psychiatric Residential Treatment Center", description: "A facility or distinct part of a facility for psychiatric care which provides a total 24-hour therapeutically planned and professionally staffed group living and learning environment.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '57', version: 1, effectiveFrom: '2023-10-01', effectiveTo: null, status: 'ACTIVE',
    name: "Non-residential Substance Abuse Treatment Facility", description: "A location which provides treatment for substance (alcohol and drug) abuse on an ambulatory basis. Services include individual and group therapy and counseling, family counseling, laboratory tests, drugs and supplies, and psychological testing.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '58', version: 1, effectiveFrom: '2020-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Non-residential Opioid Treatment Facility", description: "A location that provides treatment for opioid use disorder on an ambulatory basis. Services include methadone and other forms of Medication Assisted Treatment (MAT).",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '60', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Mass Immunization Center", description: "A location where providers administer pneumococcal pneumonia and influenza virus vaccinations and submit these services as electronic media claims, paper claims, or using the roster billing method. This generally takes place in a mass immunization setting, such as a public health center, pharmacy, or mall but may include a physician office setting.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '61', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Comprehensive Inpatient Rehabilitation Facility", description: "A facility that provides comprehensive rehabilitation services under the supervision of a physician to inpatients with physical disabilities. Services include physical therapy, occupational therapy, speech pathology, social or psychological services, and orthotics and prosthetics services.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '62', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Comprehensive Outpatient Rehabilitation Facility", description: "A facility that provides comprehensive rehabilitation services under the supervision of a physician to outpatients with physical disabilities. Services include physical therapy, occupational therapy, and speech pathology services.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '65', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "End-Stage Renal Disease Treatment Facility", description: "A facility other than a hospital, which provides dialysis treatment, maintenance, and/or training to patients or caregivers on an ambulatory or home-care basis.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '66', version: 1, effectiveFrom: '2024-08-01', effectiveTo: null, status: 'ACTIVE',
    name: "Programs of All-Inclusive Care for the Elderly (PACE) Center", description: "A facility or location providing comprehensive medical and social services as part of the Programs of All-Inclusive Care for the Elderly (PACE). This includes, but is not limited to, primary care; social work services; restorative therapies, including physical and occupational therapy; personal care and supportive services; nutritional counseling; recreational therapy; and meals when the individual is enrolled in PACE.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '71', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Public Health Clinic", description: "A facility maintained by either State or local health departments that provides ambulatory primary medical care under the general direction of a physician.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '72', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Rural Health Clinic", description: "A certified facility which is located in a rural medically underserved area that provides ambulatory primary medical care under the general direction of a physician.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '81', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Independent Laboratory", description: "A laboratory certified to perform diagnostic and/or clinical tests independent of an institution or a physician's office.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
  { code: '99', version: 1, effectiveFrom: '1991-01-01', effectiveTo: null, status: 'ACTIVE',
    name: "Other Place of Service", description: "Other place of service not identified above.",
    sourceUrl: SOURCE_URL, sourceLastVerified: SOURCE_LAST_VERIFIED },
];

const delay = (ms = 150) => new Promise(res => setTimeout(res, ms));

export const mockPlaceOfServiceCodeService: IPlaceOfServiceCodeService = {
  async getAll() {
    await delay();
    return { ok: true, data: SEED_CODES };
  },

  async getActiveCodes() {
    await delay();
    const active = SEED_CODES
      .filter(c => c.status === 'ACTIVE')
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return { ok: true, data: active };
  },

  async getVersionsForCode(code) {
    await delay();
    const versions = SEED_CODES
      .filter(c => c.code === code)
      .sort((a, b) => a.version - b.version);
    return { ok: true, data: versions };
  },

  async getActiveCode(code) {
    await delay();
    const found = SEED_CODES.find(c => c.code === code && c.status === 'ACTIVE');
    return { ok: true, data: found };
  },
};
