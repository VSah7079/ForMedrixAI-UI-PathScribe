type CodeModalSystem = 'snomed' | 'icd' | 'SNOMED' | 'ICD-10' | 'ICD-11' | 'ICD-O-topography' | 'ICD-O-morphology';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { caseRouter } from '../services/cases/CaseRouter';
import WorklistTable from '../components/Worklist/WorklistTable';
import { ReassignCasePatientPanel } from '../components/Search/ReassignCasePatientPanel';
import { codeService, flagService, userService, physicianService, facilityService, subspecialtyService } from '../services';
import { getStaffSubspecialtyDisplay } from '../utils/staffSubspecialties';
import type { PathologyCase, CaseFilterParams, ClinicalCode, Flag } from '../services';
import { LookupModal, LookupSearch, LookupItem, LookupSection, LookupEmpty } from '../components/Common/LookupModal';
// Extended component — adds onClear prop until LookupModal.tsx is updated
const LookupModalX = LookupModal as React.ComponentType<React.ComponentProps<typeof LookupModal> & { onClear?: () => void; onDone?: () => void }>;
import { useSpecimenDictionary } from '../components/Config/System/useSpecimenDictionary';
import type { SpecimenEntry } from '../services/specimenDictionary/specimenTypes';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { useEnabledIdentifierFormats } from '../hooks/useEnabledIdentifierFormats';
import { getFacilityDateParts } from '@/utils/facilityTime';
import { useBreadcrumb }   from '../contexts/BreadcrumbContext';
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { detectIdentifierType, resolveIdentifierApplication } from '../utils/detectIdentifierType';
import type { IdentifierType } from '../utils/detectIdentifierType';
import { deriveLegacyFormats } from '../types/systemConfig';
import { VOICE_CONTEXT } from '../constants/systemActions';

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Real fix: was d.toISOString().split('T')[0] - extracts the UTC date,
// not the real, facility-local one. Not caught by the project's
// no-restricted-properties lint rule at all (toISOString/split isn't
// one of the restricted methods) despite being the same real bug -
// worth a real, separate note for whoever next extends that rule.
const toFacilityDateString = (d: Date, timezone: string): string => {
  const { year, month, day } = getFacilityDateParts(d, timezone);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const today   = (timezone: string): string => toFacilityDateString(new Date(), timezone);
// eslint-disable-next-line no-restricted-properties -- Real, honest justification: computes the absolute "N days ago" instant (real milliseconds subtraction) - the real, facility-timezone-aware conversion to a displayed calendar date already happens downstream via toFacilityDateString(d, timezone) above.
const daysAgo = (n: number, timezone: string): string => { const d = new Date(); d.setDate(d.getDate() - n); return toFacilityDateString(d, timezone); };

const DATE_RANGE_SHORTCUTS: [string, number][] = [['7d',7],['30d',30],['90d',90],['1yr',365]];
// Real, live page size for Load More - both mock and Firestore backends
// now honor pageSize/cursor identically (caseFilterUtils.ts's
// applyCasePagination, FirestoreCaseService.ts's limit()/startAfter()).
const SEARCH_PAGE_SIZE = 25;
// Shared by applyFilters and the breadcrumb-return session-snapshot
// restore — both set dateFrom/dateTo from a previously-saved/captured
// value and need to re-derive whether that value happens to match one of
// the four shortcut buttons, so the button's active-state highlight stays
// correct after a restore, not just after a direct click.
const matchDateRangeShortcut = (from: string, to: string, timezone: string): string | null => {
  if (!from && !to) return 'all';
  const match = DATE_RANGE_SHORTCUTS.find(([, days]) => from === daysAgo(days, timezone) && to === today(timezone));
  return match ? match[0] : null;
};
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
};

// â”€â”€â”€ localStorage / sessionStorage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LS_KEY = 'pathscribe:savedSearches';
const lsLoad = (): SavedSearch[] => { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } };
const lsSave = (s: SavedSearch[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} };

const SS_KEY = 'pathscribe:lastSearch';
interface LastSearchSnapshot { filters: FilterState; results: PathologyCase[]; hasSearched: boolean; }
const ssLoad  = (): LastSearchSnapshot | null => { try { const r = sessionStorage.getItem(SS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
const ssSave  = (s: LastSearchSnapshot) => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(s)); } catch {} };
const ssClear = () => { try { sessionStorage.removeItem(SS_KEY); } catch {} };

// â”€â”€â”€ Specimen dictionary (used for inline typeahead only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Full specimen list lives in mockSpecimenService ”” this is just for the
// search field suggestions until that service is wired to this page.
const SPECIMEN_DICTIONARY = [
  'Left Breast Mastectomy','Right Breast Mastectomy','Right Breast Lumpectomy','Left Breast Lumpectomy',
  'Right Hemicolectomy','Left Hemicolectomy','Radical Prostatectomy','Left Lower Lobe Lobectomy',
  'Right Upper Lobe Lobectomy','Total Thyroidectomy','Partial Thyroidectomy',
  'Cholecystectomy','Appendectomy','Partial Nephrectomy','Radical Nephrectomy',
  'Total Hysterectomy','Wide Local Excision','Axillary Node Dissection',
  'TURBT Specimen','Endocervical Curettage','Cervical Cone Biopsy',
  'Sentinel Lymph Node Biopsy','Core Needle Biopsy Breast','Prostate Biopsy Cores',
];

// â”€â”€â”€ SNOMED/ICD inline data removed ”” now served by codeService â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// See src/services/codes/mockCodeService.ts

// â”€â”€â”€ Synoptics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SynopticTemplate { id: string; name: string; organ: string; category: string; templateId: string; }
const ALL_SYNOPTICS: SynopticTemplate[] = [
  // Breast
  { id:'p01', templateId:'generic_test_complex',       name:'Breast Invasive Carcinoma',      organ:'Breast',      category:'Breast'      },
  { id:'p02', templateId:'generic_test_basic',         name:'Breast DCIS',                    organ:'Breast DCIS', category:'Breast'      },
  // GI — alphabetical by organ
  { id:'p05', templateId:'appendix',                   name:'Appendix',                       organ:'Appendix',    category:'GI'          },
  { id:'p03', templateId:'generic_test_complex',       name:'Colon Resection',                organ:'Colon',       category:'GI'          },
  { id:'p04', templateId:'generic_test_complex',       name:'Rectum Resection',               organ:'Rectum',      category:'GI'          },
  // GU — alphabetical by organ
  { id:'p09', templateId:'bladder_resection',          name:'Bladder Resection',              organ:'Bladder',     category:'GU'          },
  { id:'p08', templateId:'generic_test_complex',       name:'Kidney Resection',               organ:'Kidney',      category:'GU'          },
  { id:'p06', templateId:'generic_test_complex',       name:'Prostatectomy',                  organ:'Prostate',    category:'GU'          },
  { id:'p07', templateId:'generic_test_complex',       name:'Prostate Biopsy',                organ:'Prostate Bx', category:'GU'          },
  // Thoracic
  { id:'p10', templateId:'generic_test_complex',       name:'Lung Resection',                 organ:'Lung',        category:'Thoracic'    },
  { id:'p11', templateId:'mesothelioma',               name:'Mesothelioma',                   organ:'Pleura',      category:'Thoracic'    },
  // Endocrine — alphabetical
  { id:'p13', templateId:'adrenal',                    name:'Adrenal',                        organ:'Adrenal',     category:'Endocrine'   },
  { id:'p12', templateId:'thyroid_malignant',          name:'Thyroid',                        organ:'Thyroid',     category:'Endocrine'   },
  // Gynaecology — alphabetical
  { id:'p15', templateId:'cervix_resection',           name:'Cervix Resection',               organ:'Cervix',      category:'Gynaecology' },
  { id:'p14', templateId:'endometrium_biopsy',         name:'Endometrium',                    organ:'Uterus',      category:'Gynaecology' },
  { id:'p16', templateId:'ovary',                      name:'Ovary',                          organ:'Ovary',       category:'Gynaecology' },
  // Skin — alphabetical
  { id:'p17', templateId:'generic_test_basic',         name:'Melanoma',                       organ:'Skin',        category:'Skin'        },
  { id:'p18', templateId:'skin_scc',                   name:'Squamous Cell Carcinoma',        organ:'Skin SCC',    category:'Skin'        },
  // Bone/Soft — alphabetical
  { id:'p20', templateId:'bone',                       name:'Bone',                           organ:'Bone',        category:'Bone/Soft'   },
  { id:'p19', templateId:'soft_tissue',                name:'Soft Tissue',                    organ:'Soft Tissue', category:'Bone/Soft'   },
  // Haem
  { id:'p22', templateId:'hodgkin_lymphoma',           name:'Hodgkin Lymphoma',               organ:'Lymphoma',    category:'Haem'        },
  { id:'p21', templateId:'lymph_node',                 name:'Lymph Node',                     organ:'Lymph Node',  category:'Haem'        },
];

// â”€â”€â”€ Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface UserStub { id: string; name: string; secondary: string; }
// Real fix: ALL_PATHOLOGISTS/ALL_ATTENDINGS used to be hardcoded, static
// snapshots here - pathologists with fake ids never matching a real
// services/users/ StaffUser record, and an attending list honestly
// "sourced from requestingProvider values in mock case data" but then
// frozen as a static array, meaning a real, new attending on a newly
// accessioned case would never appear in this search filter. Both are
// now real, live state fetched inside the component (see
// pathologists/attendings state + effect below) from userService
// (filtered to real StaffUser.roles.includes('Pathologist') - real,
// capitalized casing, verified directly against the real seed data
// after an initial, lowercase version of this filter was caught
// silently matching zero real users) and physicianService respectively
// - the same real services RoleDictionary.tsx/AccessionPage.tsx already use.

// â”€â”€â”€ Flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Sorted alphabetically. 'STAT' (shorthand) catches all STAT-prefixed flags via name-contains
// matching in the service. The PRIORITY → STAT chip in the sidebar filters by case priority;
// these flag entries target case-level flag badges on the case card.
// Real fix: same bug class as ALL_PATHOLOGISTS/ALL_ATTENDINGS above - a
// completely separate, fake id scheme (c1-c8) unrelated to the real
// services/clients/ roster. Now real, live state (see facilities state +
// effect below) from facilityService.getAll().

// Real CaseStatus values only (see src/types/case/CaseStatus.ts) — this array
// previously included 'pending' and 'pending-countersign', neither of which
// is a valid CaseStatus (the latter is a SynopticReportInstance status, not a
// Case status), so those two pills never matched any real case. Replaced with
// 'pathologist-review' (the real "ready for sign-out" status) and dropped the
// non-existent 'pending' value — folded into 'pending-review', which already
// covers it. Also adds the three new Orchestration statuses: 'accessioned',
// 'gross-complete', 'intraoperative-complete'.
//
// 'pending-release' added later, per direct specification — Post-Sign-Out
// Release Buffer. Found missing during a pre-push audit: this list is a
// real, single source of truth for search filtering, and a brand-new
// CaseStatus value built while focused on SynopticReportPage.tsx's own
// display components is exactly the kind of thing that's easy to miss
// here unless specifically checked for.
const CASE_STATUS_OPTIONS = [
  'draft','accessioned','gross-complete','in-progress','intraoperative-complete',
  'pending-review','pathologist-review','finalizing','finalized','pool','pending-countersign',
  'pending-release','returned',
] as const;

// Label + accent color per status — kept in one place instead of inline so the
// mapping stays legible as statuses are added. Colors match getStatusStyle in
// WorklistTable.tsx where the same status appears, for visual consistency
// between Worklist and Search.
// Label-key map — the CaseStatus values above remain the real, underlying
// values used for filtering/matching and sent to the backend as literal
// data; only the on-screen label is translated, via t(STATUS_PILL_META[s].label).
const STATUS_PILL_META: Record<typeof CASE_STATUS_OPTIONS[number], { label: string; color: string }> = {
  'draft':                    { label: 'searchPage.statusLabelKey.draft',             color: '#94a3b8' },
  'accessioned':              { label: 'searchPage.statusLabelKey.accessioned',       color: '#38BDF8' },
  'gross-complete':           { label: 'searchPage.statusLabelKey.grossComplete',     color: '#14B8A6' },
  'in-progress':              { label: 'searchPage.statusLabelKey.inProgress',        color: '#0891B2' },
  'intraoperative-complete':  { label: 'searchPage.statusLabelKey.intraopComplete',   color: '#A855F7' },
  'pending-review':           { label: 'searchPage.statusLabelKey.pendingReview',     color: '#F59E0B' },
  'pathologist-review':       { label: 'searchPage.statusLabelKey.pathologistReview', color: '#FB7185' },
  'finalizing':                { label: 'searchPage.statusLabelKey.finalizing',       color: '#EC4899' },
  'finalized':                 { label: 'searchPage.statusLabelKey.finalized',        color: '#10B981' },
  'pool':                      { label: 'searchPage.statusLabelKey.pool',             color: '#F97316' },
  // Real fix: was missing entirely - confirmed a real, live, currently-
  // reachable CaseStatus (WorklistPage.tsx's own "Awaiting My
  // Countersign" filter tile checks this exact status, fixed earlier
  // in this same audit). Color matches that tile's own existing violet.
  'pending-countersign':       { label: 'searchPage.statusLabelKey.pendingCountersign', color: '#a78bfa' },
  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer. Color matches HeaderBar.tsx's own dedicated teal for this
  // exact status, for the same cross-page visual-consistency reasoning
  // as the comment above.
  'pending-release':           { label: 'searchPage.statusLabelKey.pendingRelease',   color: '#1C8DE3' },
  // Real, per direct guidance ("Yes we should scope 'Return to
  // Trainee'/'Reject with Notes'"): color matches WorklistPage.tsx's
  // own dedicated amber/gold for the "Needs Revision" tile, for the
  // same cross-page visual-consistency reasoning as the comment above.
  'returned':                  { label: 'searchPage.statusLabelKey.returned',         color: '#78350F' },
};
const PRIORITY_OPTIONS    = ['Routine','Rush','STAT'] as const;
// Same label-key pattern as STATUS_PILL_META above — PRIORITY_OPTIONS itself
// stays the real value used for filtering/matching; only the displayed
// label is translated.
const PRIORITY_LABEL_KEY: Record<typeof PRIORITY_OPTIONS[number], string> = {
  'Routine': 'searchPage.priorityLabelKey.routine',
  'Rush':    'searchPage.priorityLabelKey.rush',
  'STAT':    'searchPage.priorityLabelKey.stat',
};
// Same label-key pattern — the gender option values below stay the real
// values sent as CaseFilterParams.genderList; only the displayed label is
// translated. Locale key names (NonBinary) differ from the display value
// itself (Non-binary) only in punctuation, so the map is keyed explicitly
// rather than derived.
const GENDER_OPTIONS = ['Male','Female','Non-binary','Other','Unknown'] as const;
const GENDER_LABEL_KEY: Record<typeof GENDER_OPTIONS[number], string> = {
  'Male':       'searchPage.genderLabelKey.Male',
  'Female':     'searchPage.genderLabelKey.Female',
  'Non-binary': 'searchPage.genderLabelKey.NonBinary',
  'Other':      'searchPage.genderLabelKey.Other',
  'Unknown':    'searchPage.genderLabelKey.Unknown',
};
// quickLinks' own object keys (Protocols/References/Systems) are data —
// they drive the JSX .map()/key lookups below — so they stay as-is; this
// parallel map translates only the on-screen section heading.
const RESOURCE_SECTION_LABEL_KEY: Record<string, string> = {
  'Protocols':  'searchPage.resourceSection.protocols',
  'References': 'searchPage.resourceSection.references',
  'Systems':    'searchPage.resourceSection.systems',
};

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FilterState {
  patientName: string; hospitalId: string; patientId: string; accessionNo: string;
  diagnosisList: string[]; specimenList: string[];
  snomedList: ClinicalCode[]; icdCodes: ClinicalCode[];
  synopticIds: string[]; flagsList: string[];
  pathologistIds: string[]; attendingIds: string[];
  submittingNames: string[]; statusList: string[]; priorityList: string[];
  dateFrom: string; dateTo: string;
  genderList: string[];
  dobFrom: string; dobTo: string;
  ageMin: number | undefined; ageMax: number | undefined;
}
interface SavedSearch { id: string; name: string; filters: FilterState; createdAt: string; }

// â”€â”€â”€ English summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const buildSummary = (
  f: FilterState,
  pathologists: UserStub[],
  attendings: UserStub[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string => {
  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) parts.push(t('searchPage.summaryParts.accessionRange', { from: fmtDate(f.dateFrom) || '…', to: fmtDate(f.dateTo) || t('searchPage.summaryParts.todayFallback') }));
  if (f.patientName)           parts.push(t('searchPage.summaryParts.patientName', { name: f.patientName }));
  if (f.accessionNo)           parts.push(t('searchPage.summaryParts.accessionNo', { no: f.accessionNo }));
  if (f.hospitalId)            parts.push(t('searchPage.summaryParts.mrn', { id: f.hospitalId }));
  if (f.patientId)             parts.push(t('searchPage.summaryParts.mpi', { id: f.patientId }));
  if (f.specimenList.length)   parts.push(t('searchPage.summaryParts.specimen', { list: f.specimenList.join(', ') }));
  if (f.diagnosisList.length)  parts.push(t('searchPage.summaryParts.diagnosis', { list: f.diagnosisList.join(', ') }));
  if (f.snomedList.length)   parts.push(t('searchPage.summaryParts.snomed', { list: f.snomedList.map(s=>s.code).join(', ') }));
  if (f.icdCodes.length)     parts.push(t('searchPage.summaryParts.icd', { list: f.icdCodes.map(s=>`${s.system}:${s.code}`).join(', ') }));
  if (f.statusList.length)     parts.push(t('searchPage.summaryParts.status', { list: f.statusList.join(', ') }));
  if (f.genderList?.length)    parts.push(t('searchPage.summaryParts.gender', { list: f.genderList.join(', ') }));
  if (f.dobFrom || f.dobTo)    parts.push(t('searchPage.summaryParts.dob', { from: f.dobFrom||'…', to: f.dobTo||'…' }));
  if (f.ageMin !== undefined || f.ageMax !== undefined) parts.push(t('searchPage.summaryParts.age', { min: f.ageMin??'0', max: f.ageMax??'∞' }));
  if (f.priorityList.length)   parts.push(t('searchPage.summaryParts.priority', { list: f.priorityList.join(', ') }));
  if (f.flagsList.length)      parts.push(t('searchPage.summaryParts.flags', { list: f.flagsList.join(', ') }));
  if (f.synopticIds.length)    parts.push(t('searchPage.summaryParts.synoptic', { list: f.synopticIds.map(id=>ALL_SYNOPTICS.find(syn=>syn.id===id)?.organ??id).join(', ') }));
  if (f.pathologistIds.length) parts.push(t('searchPage.summaryParts.pathologist', { list: f.pathologistIds.map(id=>pathologists.find(u=>u.id===id)?.name??id).join(', ') }));
  if (f.attendingIds.length)   parts.push(t('searchPage.summaryParts.attending', { list: f.attendingIds.map(id=>attendings.find(u=>u.id===id)?.name??id).join(', ') }));
  return parts.length===0 ? t('searchPage.summary.allCases') : t('searchPage.summary.prefix')+parts.join(' · ');
};

// â”€â”€â”€ Virtual scroll wrapper removed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WorklistTable manages its own internal scroll and incremental row loading.
// Passing cases directly is sufficient.

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const Chip: React.FC<{ label: string; onRemove: () => void; title?: string; accent?: string }> = ({ label, onRemove, title, accent='#0891B2' }) => (
  <span title={title} className="ps-searchpage-chip" style={{ '--accent': accent } as React.CSSProperties}>
    {label}
    <button type="button" onClick={e=>{ e.preventDefault(); e.stopPropagation(); onRemove(); }} className="ps-searchpage-chip-remove">×</button>
  </span>
);

const CheckPill: React.FC<{ label: string; checked: boolean; onChange: () => void; accent?: string }> = ({ label, checked, onChange, accent='#0891B2' }) => (
  <button type="button" onClick={onChange}
    className={`ps-searchpage-checkpill${checked ? ' ps-searchpage-checkpill--checked' : ''}`}
    style={{ '--accent': accent } as React.CSSProperties}
  >
    <span className={`ps-searchpage-checkpill-dot${checked ? ' ps-searchpage-checkpill-dot--checked' : ''}`} />
    {label}
  </button>
);

// SectionLabel: clear by default, vivid cyan when active
const SectionLabel: React.FC<{ title: string; active?: boolean }> = ({ title, active=false }) => (
  <div className={`ps-searchpage-section-label${active ? ' ps-searchpage-section-label--active' : ''}`}>{title}</div>
);

// Browse button ”” opens lookup modal, sits inline with input
const BrowseBtn: React.FC<{ onClick: () => void; count?: number }> = ({ onClick, count }) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} className="ps-searchpage-browse-btn">
      {count ? t('searchPage.browse.labelWithCount', { count }) : t('searchPage.browse.label')}
    </button>
  );
};

const DROPDOWN_CLASS = 'ps-searchpage-dropdown';
const DROP_BTN_CLASS = 'ps-searchpage-dropdown-btn';

// â”€â”€â”€ LookupModal and content components imported from Common/LookupModal â”€â”€â”€â”€â”€â”€
// LookupModal, LookupSearch, LookupItem, LookupSection, LookupEmpty

// â”€â”€â”€ Synoptic lookup content (local ”” synoptics are search-page-specific) â”€â”€â”€â”€â”€

const SynopticLookupContent: React.FC<{ selected: string[]; onToggle: (id: string) => void }> = ({ selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const categories = Array.from(new Set(ALL_SYNOPTICS.map(s => s.category)));
  const filtered = q.length < 1 ? ALL_SYNOPTICS : ALL_SYNOPTICS.filter(s =>
    s.name.toLowerCase().includes(q.toLowerCase()) || s.organ.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.synopticLookup.searchProtocols')} />
      {q.length < 1
        ? categories.map(cat => {
            const items = ALL_SYNOPTICS.filter(s => s.category === cat);
            return (
              <div key={cat}>
                <LookupSection label={cat} count={items.length} />
                <div className="ps-searchpage-organ-grid">
                  {items.map(s => {
                    const sel = selected.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => onToggle(s.id)}
                        className={`ps-searchpage-organ-pill${sel ? ' ps-searchpage-organ-pill--selected' : ''}`}
                      >{s.organ}</button>
                    );
                  })}
                </div>
              </div>
            );
          })
        : <>
            {filtered.length === 0
              ? <LookupEmpty query={q} />
              : filtered.map(s => (
                  <LookupItem key={s.id} selected={selected.includes(s.id)} onToggle={() => onToggle(s.id)}
                    primary={s.name} secondary={s.category} />
                ))
            }
          </>
      }
    </>
  );
};

// â”€â”€â”€ User lookup content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const UserLookupContent: React.FC<{ users: UserStub[]; selected: string[]; onToggle: (id: string) => void; accent?: string }> = ({ users, selected, onToggle, accent='#0891B2' }) => {
  const { t } = useTranslation();
  const [nameQ,   setNameQ]   = useState('');
  const [secondaryQ, setSecondaryQ] = useState('');

  const filtered = users.filter(u => {
    const matchName   = nameQ.length   < 1 || u.name.toLowerCase().includes(nameQ.toLowerCase());
    const matchSecondary = secondaryQ.length < 1 || u.secondary.toLowerCase().includes(secondaryQ.toLowerCase());
    return matchName && matchSecondary;
  });

  const initials = (name: string) => { const p = name.replace(/^(Dr|Mr|Ms|Mrs|Prof|Mx)\.\s*/i,'').split(' ').filter(Boolean); return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():p[0]?.[0]?.toUpperCase()??'?'; };

  return (
    <>
      <div className="ps-searchpage-user-search-row">
        <input
          value={nameQ} onChange={e => setNameQ(e.target.value)}
          placeholder={t('searchPage.userLookup.searchByName')}
          className="ps-searchpage-user-search-input"
        />
        <input
          value={secondaryQ} onChange={e => setSecondaryQ(e.target.value)}
          placeholder={t('searchPage.userLookup.searchByHospital')}
          className="ps-searchpage-user-search-input"
        />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={nameQ || secondaryQ} />
        : filtered.map(u => {
            const sel = selected.includes(u.id);
            return (
              <LookupItem key={u.id} selected={sel} onToggle={() => onToggle(u.id)}
                primary={u.name}
                secondary={u.secondary}
                badge={initials(u.name)}
                badgeColor={accent}
              />
            );
          })
      }
    </>
  );
};

// â”€â”€â”€ Flags lookup content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FlagsLookupContent: React.FC<{ flags: string[]; selected: string[]; onToggle: (f: string) => void }> = ({ flags, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = q.length < 1 ? flags : flags.filter(f => f.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.flagsLookup.searchFlags')} />
      <div className="ps-searchpage-flag-grid">
        {filtered.length === 0
          ? <LookupEmpty query={q} />
          : filtered.map(f => {
              const sel = selected.includes(f);
              return (
                <button key={f} type="button" onClick={() => onToggle(f)}
                  className={`ps-searchpage-flag-pill${sel ? ' ps-searchpage-flag-pill--selected' : ''}`}
                >{f}</button>
              );
            })
        }
      </div>
    </>
  );
};

// â”€â”€â”€ Specimen lookup content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SPECIMEN_TYPES = [
  'Biopsy','Resection','Excision','Cytology','FNA',
  'Molecular','Gross Only','Consult','Autopsy','Other',
] as const;

const SPECIMEN_TYPE_COLOURS: Record<string, string> = {
  'Biopsy':     '#0891B2',
  'Resection':  '#6366F1',
  'Excision':   '#8B5CF6',
  'Cytology':   '#10B981',
  'FNA':        '#F59E0B',
  'Molecular':  '#EC4899',
  'Gross Only': '#64748b',
  'Consult':    '#F97316',
  'Autopsy':    '#EF4444',
  'Other':      '#94a3b8',
};

// Label-key map — SPECIMEN_TYPES itself stays the real, underlying value used
// for matching (s.type ===) and sent as literal data; only the on-screen
// label rendered from it is translated, via this parallel lookup.
const SPECIMEN_TYPE_LABEL_KEY: Record<string, string> = {
  'Biopsy':     'searchPage.specimenTypeLabelKey.Biopsy',
  'Resection':  'searchPage.specimenTypeLabelKey.Resection',
  'Excision':   'searchPage.specimenTypeLabelKey.Excision',
  'Cytology':   'searchPage.specimenTypeLabelKey.Cytology',
  'FNA':        'searchPage.specimenTypeLabelKey.FNA',
  'Molecular':  'searchPage.specimenTypeLabelKey.Molecular',
  'Gross Only': 'searchPage.specimenTypeLabelKey.Gross Only',
  'Consult':    'searchPage.specimenTypeLabelKey.Consult',
  'Autopsy':    'searchPage.specimenTypeLabelKey.Autopsy',
  'Other':      'searchPage.specimenTypeLabelKey.Other',
};

const CompFlagsLookupContent: React.FC<{ flags: string[]; selected: string[]; onToggle: (f: string) => void }> = ({ flags, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = flags.filter(f => q.length < 1 || f.toLowerCase().includes(q.toLowerCase()));
  const abbr = (name: string) => name.replace(/[^A-Z0-9]/g,'').slice(0,3) || name.slice(0,2).toUpperCase();
  return (
    <>
      <div className="ps-searchpage-client-search-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchPage.compFlagsLookup.searchByTestName')}
          className="ps-searchpage-client-search-input" />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={q} />
        : filtered.map(f => {
            const sel = selected.includes(f);
            return (
              <LookupItem key={f} selected={sel} onToggle={() => onToggle(f)}
                primary={f}
                secondary={t('searchPage.compFlagsLookup.computationalLisFlag')}
                badge={abbr(f)}
                badgeColor="#0891b2"
              />
            );
          })
      }
    </>
  );
};

const FacilityLookupContent: React.FC<{ facilities: UserStub[]; selected: string[]; onToggle: (id: string) => void }> = ({ facilities, selected, onToggle }) => {
  const { t } = useTranslation();
  const [nameQ, setNameQ] = useState('');
  const filtered = facilities.filter(c =>
    nameQ.length < 1 || c.name.toLowerCase().includes(nameQ.toLowerCase())
  );
  const abbr = (name: string) => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase();
  return (
    <>
      <div className="ps-searchpage-client-search-wrap">
        <input value={nameQ} onChange={e => setNameQ(e.target.value)} placeholder={t('searchPage.facilityLookup.searchByFacilityName')}
          className="ps-searchpage-client-search-input" />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={nameQ} />
        : filtered.map(c => {
            const sel = selected.includes(c.id);
            return (
              <LookupItem key={c.id} selected={sel} onToggle={() => onToggle(c.id)}
                primary={c.name}
                secondary={c.id.toUpperCase()}
                badge={abbr(c.name)}
                badgeColor="#8b5cf6"
              />
            );
          })
      }
    </>
  );
};

const SpecimenLookupContent: React.FC<{
  specimens: SpecimenEntry[];
  selected:  string[];
  onToggle:  (name: string) => void;
}> = ({ specimens, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q,          setQ]          = useState('');
  const [pinnedType, setPinnedType] = useState<string | null>(null);

  const active = specimens.filter(s => s.active);
  const typesInUse = SPECIMEN_TYPES.filter(type => active.some(s => s.type === type));

  // Results driven by search query (no pill filter applied yet)
  const searched = (() => {
    if (q.trim().length < 1) return active;
    const lq = q.trim().toLowerCase();
    return active.filter(s =>
      s.name?.toLowerCase().includes(lq) ||
      s.normalizedLabel?.toLowerCase().includes(lq) ||
      (s.synonyms ?? []).some(syn => syn?.toLowerCase().includes(lq)) ||
      s.type?.toLowerCase().includes(lq) ||
      s.subspecialty?.toLowerCase().includes(lq)
    );
  })();

  // Which types have results right now ”” drives pill highlight
  const matchedTypes = new Set(searched.map(s => s.type));

  // Final display ”” apply pinned filter on top if set
  const displayed = pinnedType ? searched.filter(s => s.type === pinnedType) : searched;

  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.specimenLookup.searchPlaceholder')} />

      {/* Pills ”” always single row, horizontal scroll, highlight = has results */}
      <div className="ps-searchpage-type-pills">
        {(['All', ...typesInUse] as const).map(type => {
          const isAll    = type === 'All';
          const colour   = isAll ? '#0891B2' : SPECIMEN_TYPE_COLOURS[type] ?? '#94a3b8';
          const isPinned = isAll ? pinnedType === null : pinnedType === type;
          const hasMatch = isAll ? searched.length > 0 : matchedTypes.has(type);
          const isLit    = hasMatch && (q.trim().length >= 1); // feedback mode when searching
          const accentActive = isPinned || isLit;
          const noMatchFade  = !accentActive && q.trim().length >= 1 && !hasMatch;
          const dimmed       = q.trim().length >= 1 && !hasMatch && !isAll;
          return (
            <button key={type} type="button"
              onClick={() => setPinnedType(isAll ? null : (pinnedType === type ? null : type))}
              className={`ps-searchpage-type-pill${accentActive ? ' ps-searchpage-type-pill--lit' : ''}${noMatchFade ? ' ps-searchpage-type-pill--faded' : ''}${dimmed ? ' ps-searchpage-type-pill--dim' : ''}`}
              style={{ '--accent': colour } as React.CSSProperties}
            >
              {isAll ? t('searchPage.specimenLookup.allPill') : t(SPECIMEN_TYPE_LABEL_KEY[type] ?? type)}
            </button>
          );
        })}
      </div>

      {displayed.length === 0
        ? <LookupEmpty query={q || pinnedType || ''} />
        : displayed.map(s => {
            const colour = SPECIMEN_TYPE_COLOURS[s.type] ?? '#94a3b8';
            return (
              <LookupItem
                key={s.id}
                selected={selected.includes(s.name)}
                onToggle={() => onToggle(s.name)}
                primary={s.name}
                secondary={s.subspecialty}
                badge={t(SPECIMEN_TYPE_LABEL_KEY[s.type] ?? s.type)}
                badgeColor={colour}
              />
            );
          })
      }
    </>
  );
};

// â”€â”€â”€ Unified ICD modal ”” tabs shown only if active in config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type IcdTab = 'ICD-10' | 'ICD-11' | 'ICD-O-topography' | 'ICD-O-morphology';

const IcdModalContent: React.FC<{
  selected:    ClinicalCode[];
  onToggle:    (c: ClinicalCode) => void;
  icd10Active: boolean;
  icd11Active: boolean;
  icdoActive:  boolean;
}> = ({ selected, onToggle, icd10Active, icd11Active, icdoActive }) => {
  const { t } = useTranslation();
  const allTabs: { id: IcdTab; labelKey: string; active: boolean }[] = [
    { id:'ICD-10',           labelKey:'searchPage.icdModal.tabIcd10',          active: icd10Active },
    { id:'ICD-11',           labelKey:'searchPage.icdModal.tabIcd11',          active: icd11Active },
    { id:'ICD-O-topography', labelKey:'searchPage.icdModal.tabIcdOTopography', active: icdoActive  },
    { id:'ICD-O-morphology', labelKey:'searchPage.icdModal.tabIcdOMorphology', active: icdoActive  },
  ];
  const visibleTabs = allTabs.filter(at => at.active);
  const [tab, setTab] = useState<IcdTab>(() => visibleTabs[0]?.id ?? 'ICD-10');

  // If active tabs change and current tab is gone, reset to first visible
  useEffect(() => {
    if (!visibleTabs.some(at => at.id === tab)) {
      const first = visibleTabs[0];
      if (first) setTab(first.id);
    }
  }, [icd10Active, icd11Active, icdoActive, tab, visibleTabs]);

  if (visibleTabs.length === 0) {
    return (
      <div className="ps-searchpage-icd-empty">
        {t('searchPage.icdModal.noSystemsEnabled')}<br />
        <span className="ps-searchpage-icd-empty-sub">{t('searchPage.icdModal.enableHint')}</span>
      </div>
    );
  }

  return (
    <>
      {/* Tab bar ”” only shows active systems */}
      <div className="ps-searchpage-icd-tabbar">
        {visibleTabs.map(at => (
          <button key={at.id} type="button" onClick={() => setTab(at.id)}
            className={`ps-searchpage-icd-tab${tab === at.id ? ' ps-searchpage-icd-tab--active' : ''}`}
          >
            {t(at.labelKey)}
          </button>
        ))}
      </div>
      <CodeLookupContent system={tab} selected={selected} onToggle={onToggle} />
    </>
  );
};


// â”€â”€â”€ SNOMED CT modal ”” Big Four axes as tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SnomedAxis = 'Morphology' | 'Body Structure' | 'Procedure' | 'Specimen';

const SNOMED_AXIS_META: { id: SnomedAxis; labelKey: string; accent: string; placeholderKey: string }[] = [
  { id:'Morphology',     labelKey:'searchPage.snomedAxis.morphology',    accent:'#8B5CF6', placeholderKey:'searchPage.snomedAxis.morphologyPlaceholder' },
  { id:'Body Structure', labelKey:'searchPage.snomedAxis.bodyStructure', accent:'#0891B2', placeholderKey:'searchPage.snomedAxis.bodyStructurePlaceholder' },
  { id:'Procedure',      labelKey:'searchPage.snomedAxis.procedure',     accent:'#10B981', placeholderKey:'searchPage.snomedAxis.procedurePlaceholder' },
  { id:'Specimen',       labelKey:'searchPage.snomedAxis.specimen',      accent:'#F59E0B', placeholderKey:'searchPage.snomedAxis.specimenPlaceholder' },
];

const SnomedAxisContent: React.FC<{
  axis:     SnomedAxis;
  selected: ClinicalCode[];
  onToggle: (c: ClinicalCode) => void;
}> = ({ axis, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q,        setQ]        = useState('');
  const [allCodes, setAllCodes] = useState<ClinicalCode[]>([]);
  const [loading,  setLoading]  = useState(true);

  const meta = SNOMED_AXIS_META.find(m => m.id === axis)!;

  // Reset search when axis tab changes
  useEffect(() => { setQ(''); }, [axis]);

  // Load full axis set once ”” client-side search, no re-fetch on keystroke
  useEffect(() => {
    setLoading(true);
    codeService.search({ system:'SNOMED', category: axis })
      .then(r => { if (r.ok) setAllCodes(r.data); })
      .finally(() => setLoading(false));
  }, [axis]);

  // Stable subgroup list from the full axis set
  const subgroups = Array.from(new Set(
    allCodes.map(c => c.category?.includes('|') ? c.category.split('|')[1] : null).filter(Boolean) as string[]
  ));

  // Displayed results driven purely by search query ”” no pill filter
  const isSearching = q.trim().length >= 1;
  const displayed = isSearching
    ? allCodes.filter(c =>
        c.code.toLowerCase().includes(q.toLowerCase()) ||
        c.display.toLowerCase().includes(q.toLowerCase()) ||
        c.category?.toLowerCase().includes(q.toLowerCase())
      )
    : allCodes;

  // Which subgroups have at least one match ”” drives pill highlight
  const matchedSubgroups = new Set(
    displayed.map(c => c.category?.includes('|') ? c.category.split('|')[1] : null).filter(Boolean) as string[]
  );

  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t(meta.placeholderKey)} />
      {loading
        ? <div className="ps-searchpage-lookup-loading">{t('common.loading')}</div>
        : <>
            {/* Subgroup filter pills ”” only shown while searching, clickable to narrow results */}
            {isSearching && subgroups.length > 1 && (
              <div className="ps-searchpage-subgroup-pills">
                {subgroups.map(sg => {
                  const matched = matchedSubgroups.has(sg);
                  return (
                    <button key={sg} type="button" title={t('searchPage.snomedAxis.filterToTitle', { group: sg })}
                      className={`ps-searchpage-subgroup-pill${matched ? ' ps-searchpage-subgroup-pill--matched' : ''}`}
                      style={{ '--accent': meta.accent } as React.CSSProperties}
                    >
                      {sg}
                    </button>
                  );
                })}
              </div>
            )}
            {displayed.length === 0
              ? <LookupEmpty query={q} />
              : displayed.map(c => (
                  <LookupItem
                    key={c.code}
                    selected={selected.some(x => x.code === c.code)}
                    onToggle={() => onToggle(c)}
                    primary={c.display}
                    secondary={c.category?.split('|')[1]}
                    badge={c.code}
                    badgeColor={meta.accent}
                  />
                ))
            }
          </>
      }
    </>
  );
};

const SnomedModalContent: React.FC<{
  selected: ClinicalCode[];
  onToggle: (c: ClinicalCode) => void;
}> = ({ selected, onToggle }) => {
  const { t } = useTranslation();
  const [axis, setAxis] = useState<SnomedAxis>('Morphology');

  return (
    <>
      {/* Axis tabs */}
      <div className="ps-searchpage-axis-tabbar">
        {SNOMED_AXIS_META.map(m => (
          <button key={m.id} type="button" onClick={() => setAxis(m.id)}
            className={`ps-searchpage-axis-tab${axis === m.id ? ' ps-searchpage-axis-tab--active' : ''}`}
            style={{ '--accent': m.accent } as React.CSSProperties}
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>
      <SnomedAxisContent axis={axis} selected={selected} onToggle={onToggle} />
    </>
  );
};



const CodeLookupContent: React.FC<{
  system:   CodeModalSystem;
  selected: ClinicalCode[];
  onToggle: (c: ClinicalCode) => void;
}> = ({ system, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [codes, setCodes] = useState<ClinicalCode[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [allCodes,    setAllCodes]    = useState<ClinicalCode[]>([]); // stable full set for pill labels

  const svcSystem  = system === 'SNOMED' ? 'SNOMED' : system === 'ICD-11' ? 'ICD-11' : system.startsWith('ICD-O') ? 'ICD-O' : 'ICD-10';
  const svcSubtype = system === 'ICD-O-topography' ? 'topography' : system === 'ICD-O-morphology' ? 'morphology' : undefined;
  const accent     = system === 'SNOMED' ? '#0891B2' : system === 'ICD-11' ? '#F59E0B' : system.startsWith('ICD-O') ? '#10B981' : '#8B5CF6';

  // Load full set once for stable pill labels
  useEffect(() => {
    codeService.search({ system: svcSystem, subtype: svcSubtype })
      .then(r => { if (r.ok) setAllCodes(r.data); });
  }, [svcSystem, svcSubtype]);

  useEffect(() => {
    setLoading(true);
    codeService.search({ system: svcSystem, subtype: svcSubtype, query: q.length >= 2 ? q : undefined })
      .then(r => { if (r.ok) setCodes(r.data); })
      .finally(() => setLoading(false));
  }, [q, svcSystem, svcSubtype]);

  const allCategories  = Array.from(new Set(allCodes.map(c => c.category ?? 'Other')));
  const matchedCats    = new Set(codes.map(c => c.category ?? 'Other'));
  const isSearching    = q.trim().length >= 1;
  const [activeCat, setActiveCat] = useState<string | null>(null);

  // Apply active category filter on top of search results
  const displayed = activeCat ? codes.filter(c => (c.category ?? 'Other') === activeCat) : codes;

  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.codeLookup.searchPlaceholder', { system })} />
      {loading
        ? <div className="ps-searchpage-lookup-loading">{t('common.loading')}</div>
        : <>
            {/* Category filter pills ”” clickable, wrap, highlight active/matched */}
            {allCategories.length > 1 && (
              <div className="ps-searchpage-cat-pills">
                {allCategories.map(cat => {
                  const isActive  = activeCat === cat;
                  const matched   = !isSearching || matchedCats.has(cat);
                  return (
                    <button key={cat} type="button"
                      onClick={() => setActiveCat(isActive ? null : cat)}
                      className={`ps-searchpage-cat-pill${isActive ? ' ps-searchpage-cat-pill--active' : matched ? ' ps-searchpage-cat-pill--matched' : ''}${isSearching && !matched ? ' ps-searchpage-cat-pill--dim' : ''}`}
                      style={{ '--accent': accent } as React.CSSProperties}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
            {displayed.length === 0
              ? <LookupEmpty query={q || activeCat || ''} />
              : displayed.map(c => (
                  <LookupItem
                    key={c.code}
                    selected={selected.some(x => x.code === c.code)}
                    onToggle={() => onToggle(c)}
                    primary={c.display}
                    badge={c.code}
                    badgeColor={accent}
                  />
                ))
            }
          </>
      }
    </>
  );
};


const SearchPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate     = useNavigate();
  const { user }      = useAuth();
  const { pushCrumb } = useBreadcrumb();
  const { dictionary: specimenDictionary } = useSpecimenDictionary();
  const { config } = useSystemConfig();

  // Real fix: pathologists/attendings/facilities used to be hardcoded,
  // static module-scope constants (ALL_PATHOLOGISTS/ALL_ATTENDINGS/
  // ALL_CLIENTS) - see this file's own "Users" section comment for the
  // full story. Now real, live state, fetched once from the same real
  // services RoleDictionary.tsx/AccessionPage.tsx already use.
  const [pathologists, setPathologists] = useState<UserStub[]>([]);
  const [attendings, setAttendings] = useState<UserStub[]>([]);
  const [facilities, setFacilities] = useState<UserStub[]>([]);
  useEffect(() => {
    Promise.all([userService.getAll(), physicianService.getAll(), facilityService.getAll(), subspecialtyService.getAll()]).then(
      ([userRes, physicianRes, clientRes, subsRes]) => {
        const realFacilities = clientRes.ok ? clientRes.data : [];
        setFacilities(realFacilities.map(c => ({ id: c.id, name: c.name, secondary: '' })));

        if (userRes.ok) {
          // Real fix, per direct confirmation: replaces the old
          // free-text department field — genuinely redundant with the
          // real Subspecialty dictionary, which is the actual data
          // this was standing in for.
          const allSubspecialties = subsRes.ok ? subsRes.data : [];
          setPathologists(
            userRes.data
              .filter(u => u.roles.includes('Pathologist'))
              .map(u => ({ id: u.id, name: `Dr. ${u.firstName} ${u.lastName}`, secondary: getStaffSubspecialtyDisplay(u.id, allSubspecialties) }))
          );
        }

        if (physicianRes.ok) {
          setAttendings(
            physicianRes.data.map(p => ({
              id: p.id,
              name: `${p.namePrefix || 'Dr.'} ${p.firstName} ${p.lastName}`,
              // A real physician can have more than one real client
              // (clientIds is plural) - joins every real, resolved
              // name rather than arbitrarily picking just the first.
              secondary: p.clientIds.map(cid => realFacilities.find(c => c.id === cid)?.name).filter(Boolean).join(', '),
            }))
          );
        }
      }
    );
  }, []);


  // Measure available height for the table container — mirrors
  // WorklistPage.tsx's identical hook exactly. That page's own comment is
  // explicit about why: this is "immune to any parent overflow/flex chain
  // issues." SearchPage previously relied purely on the CSS flex cascade
  // for the table's height, which is exactly the thing this technique
  // exists to avoid trusting — that gap, not a missing min-width/min-height
  // somewhere, was the actual cause of the table's bottom (and its
  // horizontal scrollbar, which lives at that bottom edge) rendering past
  // the visible viewport.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number>(400);
  useEffect(() => {
    const measure = () => {
      if (!wrapperRef.current) return;
      const top = wrapperRef.current.getBoundingClientRect().top;
      const available = window.innerHeight - top - 16; // 16px bottom breathing room
      setTableHeight(Math.max(200, available));
    };
    const timer = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, []);

  // Mirrors canViewPediatric's pattern (WorklistPage.tsx/WorklistTable.tsx) —
  // a Role-level flag surfaced onto the authenticated user, defaulting to
  // false. Unlike pediatric redaction (same data controller, sensitive
  // fields hidden within an otherwise-visible case), this gates visibility
  // of an entire different controller's cases (Orchestration/PathScribe vs.
  // the NHS Trust LIS) — see IRoleService.ts and CaseRouter.ts for why that
  // distinction matters for compliance, not just UI.
  const canViewOrchestration = user?.canViewOrchestration ?? false;

  const [isLoaded,        setIsLoaded]        = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);

  // Lookup modals
  const [snomedModal,    setSnomedModal]    = useState(false);
  const [icdModal,       setIcdModal]       = useState(false);
  const [specimenModal,  setSpecimenModal]  = useState(false);
  const [synopticModal,  setSynopticModal]  = useState(false);
  const [flagsModal,     setFlagsModal]     = useState(false);
  const [pathModal,      setPathModal]      = useState(false);
  const [attendingModal, setAttendingModal] = useState(false);

  // Active section (for label intensity)
  const [activeSection, setActiveSection] = useState('');

  // Filter state
  const [patientName,  setPatientName]  = useState('');
  const [hospitalId,   setHospitalId]   = useState('');
  const [patientId,    setPatientId]    = useState('');
  const [accessionNo,  setAccessionNo]  = useState('');

  // Smart identifier box
  const [identifierQuery, setIdentifierQuery] = useState('');
  const [detectedType, setDetectedType] = useState<IdentifierType>(null);

  // Real, per direct guidance: replaces config.identifierFormats -
  // enabledFormats now resolves from the real union of every
  // Enterprise's own enabled formats, falling back to
  // IDENTIFIER_FORMAT_LIBRARY's own defaults unchanged when none has
  // configured this yet (see useEnabledIdentifierFormats.ts). The
  // legacy accessionPattern this screen also needs is derived the
  // same real way SystemConfig.identifierFormats itself always
  // derived it - deriveLegacyFormats() from the enabled formats list,
  // not a separately-stored value.
  const enabledFormats = useEnabledIdentifierFormats();
  const legacyFormats = deriveLegacyFormats(enabledFormats);

  const applyIdentifier = (val: string, type: IdentifierType) => {
    const result = resolveIdentifierApplication(val, type, enabledFormats, legacyFormats.accessionPattern);
    if (result.action === 'navigate') { navigate(result.path); return; }
    setPatientName(result.patientName);
    setHospitalId(result.hospitalId);
    setPatientId(result.patientId);
    setAccessionNo(result.accessionNo);
  };

  const handleIdentifierChange = (val: string) => {
    setIdentifierQuery(val);
    const type = detectIdentifierType(val, enabledFormats);
    setDetectedType(type);
    applyIdentifier(val, type);
  };

  const IDENTIFIER_BADGE: Record<NonNullable<IdentifierType>, { label: string; color: string }> = {
    accession:   { label: t('searchPage.identifierBadge.accession'),   color: '#8B5CF6' },
    mrn:         { label: t('searchPage.identifierBadge.mrn'),         color: '#0891B2' },
    mpi:         { label: t('searchPage.identifierBadge.mpi'),         color: '#6366F1' },
    slide:       { label: t('searchPage.identifierBadge.slide'),       color: '#10B981' },
    requisition: { label: t('searchPage.identifierBadge.requisition'), color: '#F59E0B' },
    name:        { label: t('searchPage.identifierBadge.name'),        color: '#10B981' },
    ambiguous:   { label: t('searchPage.identifierBadge.ambiguous'),   color: '#F59E0B' },
  };

  const [dateFrom,     setDateFrom]     = useState(daysAgo(30, config.facilityTimezone));
  const [dateTo,       setDateTo]       = useState(today(config.facilityTimezone));
  // Tracks which date-range shortcut (7d/30d/90d/1yr) was last clicked, if
  // any — null once the user edits a date field manually, since at that
  // point no shortcut's value is necessarily still accurate. Default '30d'
  // matches the initial dateFrom/dateTo state above exactly.
  const [activeDateRange, setActiveDateRange] = useState<string | null>('30d');

  const [specimenQuery,       setSpecimenQuery]       = useState('');
  const [specimenList,        setSpecimenList]        = useState<string[]>([]);
  const [specimenSuggestions, setSpecimenSuggestions] = useState<string[]>([]);
  const [showSpecimenDrop,    setShowSpecimenDrop]    = useState(false);
  const specimenRef = useRef<HTMLDivElement|null>(null);

  const [diagnosisText, setDiagnosisText] = useState('');
  const [diagnosisList, setDiagnosisList] = useState<string[]>([]);

  const [snomedQuery,       setSnomedQuery]       = useState('');
  const [snomedList,        setSnomedList]        = useState<ClinicalCode[]>([]);
  const [snomedSuggestions, setSnomedSuggestions] = useState<ClinicalCode[]>([]);
  const [showSnomedDrop,    setShowSnomedDrop]    = useState(false);
  const snomedRef = useRef<HTMLDivElement|null>(null);

  const [icdQuery,       setIcdQuery]       = useState('');
  const [icdCodes,       setIcdCodes]       = useState<ClinicalCode[]>([]);
  const [icdSuggestions, setIcdSuggestions] = useState<ClinicalCode[]>([]);
  const [showIcdDrop,    setShowIcdDrop]    = useState(false);
  const icdRef = useRef<HTMLDivElement|null>(null);

  const [synopticIds,    setSynopticIds]    = useState<string[]>([]);
  const [flagsList,      setFlagsList]      = useState<string[]>([]);
  const [pathologistIds, setPathologistIds] = useState<string[]>([]);
  const [attendingIds,   setAttendingIds]   = useState<string[]>([]);
  const [compFlagsList,  setCompFlagsList]  = useState<string[]>([]);
  const [facilityIds,    setFacilityIds]    = useState<string[]>([]);
  const [compFlagsModal, setCompFlagsModal] = useState(false);
  const [facilityModal,  setFacilityModal]  = useState(false);
  const [submittingNames,setSubmittingNames]= useState<string[]>([]);
  const [statusList,     setStatusList]     = useState<string[]>([]);
  const [priorityList,   setPriorityList]   = useState<string[]>([]);
  // Patient Demographics
  const [genderList,     setGenderList]     = useState<string[]>([]);
  const [dobFrom,        setDobFrom]        = useState('');
  const [dobTo,          setDobTo]          = useState('');
  const [ageMin,         setAgeMin]         = useState('');
  const [ageMax,         setAgeMax]         = useState('');

  const [results,     setResults]     = useState<PathologyCase[]|null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  // Real, live pagination - Load More appends rather than replaces,
  // matching the cursor contract built into caseRouter.getAll() (both the
  // mock and Firestore paths now honor pageSize/cursor identically).
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextCursor,     setNextCursor]     = useState<string | undefined>(undefined);
  const [isLoadingMore,  setIsLoadingMore]  = useState(false);
  // Increments only on a genuine fresh search (never on Load More) - used
  // as WorklistTable's key below instead of results.length, so appending
  // more results doesn't force a full remount (which would reset the
  // table's own scroll position, sort state, and internal batching).
  const [searchGeneration, setSearchGeneration] = useState(0);

  // flagDefinitions still feeds WorklistTable/FlagManagerModal-style
  // consumers on this page; computationalFlags removed along with the
  // Sidecar it only ever fed.
  const [flagDefinitions, setFlagDefinitions] = useState<Flag[]>([]);
  useEffect(() => {
    flagService.getAll().then(res => {
      if (!res.ok) return;
      setFlagDefinitions(res.data);
    }).catch(() => {});
  }, []);
  // Real fix: ALL_FLAGS/ALL_COMP_FLAGS used to be static, hand-curated
  // name lists - confirmed directly against the real
  // services/flags/mockFlagService.ts data that many real, active flags
  // ('Malignant', 'Discordant', 'Intraoperative Consult', 'Margins
  // Involved', and more) were completely missing, so a search filtering
  // by one of those real flags had no way to select it via this picker.
  // Same bug class as the earlier ALL_ATTENDINGS fix in this same file.
  //
  // Sourced from the flag catalog (flagService.getAll()), not scraped
  // from raw case data, because that catalog is confirmed to be the
  // real, current, authoritative source: utils/flagAdapter.ts's own
  // header comment documents FlagManagerModal ("the only place flags
  // can be applied") as reading from this exact same catalog. Separate,
  // lower-priority observation, not fixed here: some older seed cases
  // (mockCaseService.ts) carry inline caseFlags/specimenFlags objects
  // predating this catalog's centralization (e.g. time-specific MDT
  // flags like "Colorectal MDT — Mon 13:00") that don't correspond to
  // any real catalog entry - legacy seed-data artifacts, not something
  // a flag applied via the current, real FlagManagerModal workflow
  // would ever produce, so not a gap this picker needs to cover.
  //
  // tagClass is documented elsewhere (IFlagService.ts) as vestigial for
  // real backend decisions, but it's still present on the data and this
  // is a presentational UI grouping (preserving the existing two-picker
  // structure), not a functional gate - flags missing tagClass default
  // to the general list rather than being silently dropped from both.
  const realFlagNames = React.useMemo(
    () => flagDefinitions.filter(f => f.status === 'Active' && f.tagClass !== 'COMPUTATIONAL').map(f => f.name),
    [flagDefinitions]
  );
  const realCompFlagNames = React.useMemo(
    () => flagDefinitions.filter(f => f.status === 'Active' && f.tagClass === 'COMPUTATIONAL').map(f => f.name),
    [flagDefinitions]
  );
  // Real, confirmed fix (Jira PS-57): caseFlags/specimenFlags now
  // correctly type as FlagInstance[] — an application record
  // referencing a real flag definition by flagDefinitionId, not an
  // inline copy of its display fields. Every place below that used
  // to read .label/.lisCode/.name directly off a case's own flag
  // entries now resolves through this same, real catalog instead —
  // the identical lookup FlagManagerModal.tsx itself already uses.
  const flagDefById = React.useMemo(
    () => new Map(flagDefinitions.map(f => [f.id, f])),
    [flagDefinitions]
  );
  // Auto-collapses the filter sidebar after a search runs, freeing real
  // width for the results table — mirrors SynopticReportPage's
  // Sidebar.tsx collapsed/expanded pattern exactly. Set explicitly at
  // each search-trigger call site below rather than via a useEffect on
  // hasSearched, since hasSearched may already be true on a second
  // search and wouldn't re-fire a dependency-based effect.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(lsLoad);
  const [activeSavedId, setActiveSavedId] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const saveInputRef = useRef<HTMLInputElement|null>(null);

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const returning = sessionStorage.getItem('pathscribe:searchReturn') === '1';
    sessionStorage.removeItem('pathscribe:searchReturn');
    if (!returning) { ssClear(); return; }
    const snap = ssLoad(); if (!snap) return;
    const f = snap.filters;
    setPatientName(f.patientName); setHospitalId(f.hospitalId); setPatientId(f.patientId); setAccessionNo(f.accessionNo);
    setDateFrom(f.dateFrom); setDateTo(f.dateTo);
    setActiveDateRange(matchDateRangeShortcut(f.dateFrom, f.dateTo, config.facilityTimezone));
    setSnomedList(f.snomedList); setIcdCodes(f.icdCodes);
    setSynopticIds(f.synopticIds); setFlagsList(f.flagsList);
    setPathologistIds(f.pathologistIds ?? []); setAttendingIds(f.attendingIds ?? []);
    setSubmittingNames(f.submittingNames); setStatusList(f.statusList); setPriorityList(f.priorityList);
    // Restore demographics (previously omitted — back-navigation lost these filters)
    setGenderList(f.genderList ?? []);
    setDobFrom(f.dobFrom ?? '');
    setDobTo(f.dobTo ?? '');
    setAgeMin(f.ageMin !== undefined ? String(f.ageMin) : '');
    setAgeMax(f.ageMax !== undefined ? String(f.ageMax) : '');
    setResults(snap.results); setHasSearched(snap.hasSearched);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { const timer = setTimeout(()=>setIsLoaded(true), 80); return ()=>clearTimeout(timer); }, []);
  useEffect(() => { pushCrumb(t('searchPage.page.title'), '/search'); }, [pushCrumb, t]);
  useEffect(() => { lsSave(savedSearches); }, [savedSearches]);

  // Real bug fix, same pattern already found in AuditLogPage.tsx: this
  // page declared isResourcesOpen and rendered a Resources modal off it,
  // but never listened for the global PATHSCRIBE_PAGE_OPEN_RESOURCES
  // event that actually opens it elsewhere (see WorklistPage.tsx) —
  // meaning the modal had no way to ever open on this page either.
  useEffect(() => {
    const openResources = () => setIsResourcesOpen(true);
    window.addEventListener('PATHSCRIBE_PAGE_OPEN_RESOURCES', openResources);
    return () => window.removeEventListener('PATHSCRIBE_PAGE_OPEN_RESOURCES', openResources);
  }, []);
  useEffect(() => { if (showSaveInput) saveInputRef.current?.focus(); }, [showSaveInput]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (specimenRef.current && !specimenRef.current.contains(e.target as Node)) setShowSpecimenDrop(false);
      if (snomedRef.current   && !snomedRef.current.contains(e.target as Node))   setShowSnomedDrop(false);
      if (icdRef.current      && !icdRef.current.contains(e.target as Node))      setShowIcdDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!specimenQuery || specimenQuery.length < 2) { setSpecimenSuggestions([]); setShowSpecimenDrop(false); return; }
    const q = specimenQuery.toLowerCase();
    const hits = specimenDictionary
      .filter(s => s.active && (
        (s.name?.toLowerCase() ?? '').includes(q) ||
        (s.normalizedLabel?.toLowerCase() ?? '').includes(q) ||
        (s.synonyms ?? []).some(syn => (syn?.toLowerCase() ?? '').includes(q))
      ) && !specimenList.includes(s.name))
      .map(s => s.name)
      .slice(0, 8);
    const fallback = hits.length > 0 ? hits :
      SPECIMEN_DICTIONARY.filter(s => s.toLowerCase().includes(q) && !specimenList.includes(s)).slice(0, 8);
    setSpecimenSuggestions(fallback); setShowSpecimenDrop(fallback.length > 0);
  }, [specimenQuery, specimenList, specimenDictionary]);

  useEffect(() => {
    if (!snomedQuery || snomedQuery.length < 2) { setSnomedSuggestions([]); setShowSnomedDrop(false); return; }
    codeService.search({ system:'SNOMED', query: snomedQuery }).then(r => {
      if (r.ok) { const hits = r.data.slice(0,6); setSnomedSuggestions(hits); setShowSnomedDrop(hits.length>0); }
    });
  }, [snomedQuery]);

  useEffect(() => {
    if (!icdQuery || icdQuery.length < 2) { setIcdSuggestions([]); setShowIcdDrop(false); return; }
    codeService.search({ system:'ICD-10', query: icdQuery }).then(r => {
      if (r.ok) { const hits = r.data.slice(0,6); setIcdSuggestions(hits); setShowIcdDrop(hits.length>0); }
    });
  }, [icdQuery]);

  // REMOVED: previously auto-re-ran the search on every single filter
  // change once hasSearched was true (any checkbox/dropdown edit fired a
  // real query immediately, no debounce, no confirmation step). Under
  // concurrent multi-pathologist usage that's a real backend-load concern
  // — someone adjusting several filters in sequence while deciding what
  // they actually want fires one query per click, not one query per
  // decision. "Search Cases" (handleSubmit) is now the single deliberate
  // trigger for any query, matching how the very first search already
  // worked (this effect was a no-op until hasSearched flipped true).
  // Filter state still updates instantly in the UI either way — only the
  // actual backend query is now gated behind the explicit button press.

  // â”€â”€ Filter helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const currentFilters = (): FilterState => ({
    patientName, hospitalId, patientId, accessionNo, diagnosisList, specimenList,
    snomedList, icdCodes, synopticIds, flagsList, pathologistIds, attendingIds,
    submittingNames, statusList, priorityList, dateFrom, dateTo,
    // Previously hardcoded to empty — now reads actual state so session
    // snapshots and saved searches correctly preserve demographic filters.
    genderList,
    dobFrom,
    dobTo,
    ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
    ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
  });

  const applyFilters = (f: FilterState) => {
    setPatientName(f.patientName); setHospitalId(f.hospitalId); setPatientId(f.patientId); setAccessionNo(f.accessionNo);
    // Restore smart identifier box from whichever field was populated
    const restored = f.accessionNo || f.patientName || f.hospitalId || f.patientId;
    setIdentifierQuery(restored);
    setDetectedType(restored ? detectIdentifierType(restored, enabledFormats) : null);
    setDiagnosisList(f.diagnosisList); setSpecimenList(f.specimenList);
    setSnomedList(f.snomedList); setIcdCodes(f.icdCodes ?? []);
    setSynopticIds(f.synopticIds); setFlagsList(f.flagsList);
    setPathologistIds(f.pathologistIds ?? []); setAttendingIds(f.attendingIds ?? []);
    setSubmittingNames(f.submittingNames); setStatusList(f.statusList); setPriorityList(f.priorityList);
    setDateFrom(f.dateFrom); setDateTo(f.dateTo);
    setActiveDateRange(matchDateRangeShortcut(f.dateFrom, f.dateTo, config.facilityTimezone));
    // Restore demographics — previously hardcoded to empty which broke saved-search round-trips
    setGenderList(f.genderList ?? []);
    setDobFrom(f.dobFrom ?? '');
    setDobTo(f.dobTo ?? '');
    setAgeMin(f.ageMin !== undefined ? String(f.ageMin) : '');
    setAgeMax(f.ageMax !== undefined ? String(f.ageMax) : '');
  };

  const toggle = (val: string, list: string[], setter: (v: string[]) => void) =>
    list.includes(val) ? setter(list.filter(x=>x!==val)) : setter([...list, val]);

  const addSpecimen = (val: string) => {
    const v = val.trim(); if (!v) return;
    setSpecimenList(p=>p.includes(v)?p:[...p,v]); setSpecimenQuery(''); setShowSpecimenDrop(false);
  };
  const addDiagnosis = () => {
    const v = diagnosisText.trim(); if (!v) return;
    setDiagnosisList(p=>p.includes(v)?p:[...p,v]); setDiagnosisText('');
  };
  const addSnomed = (s: ClinicalCode) => {
    setSnomedList(p=>p.some(x=>x.code===s.code)?p:[...p,s]); setSnomedQuery(''); setShowSnomedDrop(false);
  };
  const addIcd = (s: ClinicalCode) => {
    setIcdCodes(p=>p.some(x=>x.code===s.code)?p:[...p,s]); setIcdQuery(''); setShowIcdDrop(false);
  };

  const runSearch = async (loadMore = false) => {
    if (loadMore) setIsLoadingMore(true); else { setIsSearching(true); setSearchGeneration(g => g + 1); }
    try {
      const params: CaseFilterParams = {
        patientName,
        hospitalId,
        patientId,
        accessionNo,
        dateFrom:            dateFrom || undefined,
        dateTo:              dateTo   || undefined,
        diagnosisList,
        specimenList,
        // Pass codes (not display text) so service can match c.coding.snomed / c.coding.icd10
        snomedCodes:         snomedList.map(s => s.code),
        icdCodes:            icdCodes.map(s => s.code),
        statusList:          statusList  as CaseFilterParams['statusList'],
        priorityList:        priorityList as CaseFilterParams['priorityList'],
        genderList:          genderList.length ? genderList as CaseFilterParams['genderList'] : undefined,
        dobFrom:             dobFrom || undefined,
        dobTo:               dobTo   || undefined,
        ageMin:              ageMin  ? parseInt(ageMin, 10)  : undefined,
        ageMax:              ageMax  ? parseInt(ageMax, 10)  : undefined,
        facilityIds:         facilityIds.length    ? facilityIds    : undefined,
        // Previously omitted — these are the filters that were being tracked in state but never sent
        flagIds:             flagsList.length      ? flagsList      : undefined,
        pathologistIds:      pathologistIds.length ? pathologistIds : undefined,
        // Resolve p01 → 'breast_invasive' templateId before passing so service can match synopticReports
        synopticProtocolIds: synopticIds.length
          ? synopticIds.map(id => ALL_SYNOPTICS.find(syn => syn.id === id)?.templateId ?? '').filter(Boolean)
          : undefined,
        // Pass full provider names (not att-1 IDs) — service matches c.order.requestingProvider
        ...(attendingIds.length && {
          attendingNames: attendingIds
            .map(id => attendings.find(u => u.id === id)?.name ?? '')
            .filter(Boolean) as string[],
        }),
        pageSize: SEARCH_PAGE_SIZE,
        cursor: loadMore ? nextCursor : undefined,
      };
      const result = await caseRouter.getAll(params, {
        includeOrchestration: canViewOrchestration,
        userId: user?.id,
      });
      if (result.ok) {
        const filteredData = compFlagsList.length > 0
          ? result.data.filter((c: PathologyCase) =>
              compFlagsList.some(code =>
                (c.specimens ?? []).flatMap(sp => sp.specimenFlags ?? []).some(sf => {
                  // Real fix (Jira PS-57 + its follow-up "should be
                  // able to assign Flags at either a Case or Specimen
                  // level"): sf is a real FlagInstance now —
                  // id/flagDefinitionId/appliedAt/source/deletedAt,
                  // no .label/.lisCode of its own. Resolve against the
                  // real catalog (flagDefById, built from the same
                  // flagService.getAll() this file already fetches)
                  // instead, the same lookup FlagManagerModal.tsx
                  // itself uses. Aggregated across every specimen on
                  // the case — there's deliberately no case-level
                  // specimenFlags field; each specimen's own
                  // specimenFlags is the only real place a flag
                  // applied to a specific specimen can live, since
                  // FlagInstance itself carries no specimenId. Deleted
                  // instances (a flag removed from the case)
                  // correctly excluded — the old, wrong type had no
                  // real field for this at all, so this file could
                  // never previously respect it.
                  if (sf.deletedAt) return false;
                  const def = flagDefById.get(sf.flagDefinitionId);
                  return !!def && (def.lisCode === code || def.id === code || def.name === code);
                })
              )
            )
          : result.data;
        // compFlagsList filters client-side, after the real page was
        // already fetched — hasMore/nextCursor still reflect the real,
        // unfiltered page boundary from the backend, not this narrower
        // view. Honest, known limitation: a heavily-narrowing computational
        // flag filter combined with Load More can mean a "full" page from
        // the backend renders as a short (or empty) visible page here —
        // clicking Load More again still correctly advances to genuinely
        // new cases, it just may take more than one click to see new rows.
        const combined = loadMore ? [...(results ?? []), ...filteredData] : filteredData;
        setResults(combined);
        setHasMoreResults(!!result.meta?.hasMore);
        setNextCursor(result.meta?.nextCursor);
        ssSave({ filters: currentFilters(), results: combined, hasSearched: true });
      }
    } catch (err) {
      console.error('[SearchPage] runSearch error:', err);
    } finally {
      // Always reset — even if caseService throws
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  };

  const loadMoreResults = () => { void runSearch(true); };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setHasSearched(true); setSidebarCollapsed(true); void runSearch(); };

  const handleClear = () => {
    setPatientName(''); setHospitalId(''); setPatientId(''); setAccessionNo('');
    setIdentifierQuery(''); setDetectedType(null);
    setDiagnosisText(''); setDiagnosisList([]);
    setSpecimenQuery(''); setSpecimenList([]);
    setSnomedQuery(''); setSnomedList([]);
    setIcdQuery(''); setIcdCodes([]);
    setSynopticIds([]); setFlagsList([]); setPathologistIds([]); setAttendingIds([]);
    setSubmittingNames([]); setStatusList([]); setPriorityList([]);
    setGenderList([]); setDobFrom(''); setDobTo(''); setAgeMin(''); setAgeMax('');
    setDateFrom(daysAgo(30, config.facilityTimezone)); setDateTo(today(config.facilityTimezone)); setActiveDateRange('30d');
    setResults(null); setHasSearched(false); setActiveSavedId('');
    ssClear();
  };

  const handleExportCSV = () => {
    if (!results || results.length === 0) return;
    const headers = [
      'Accession', 'Patient Name', 'MRN', 'Sex', 'DOB',
      'Specimen(s)', 'Accession Date', 'Physician', 'Priority', 'Status', 'Flags',
    ];
    const rows = results.map(c => [
      c.accession?.fullAccession ?? '',
      `${c.patient?.firstName ?? ''} ${c.patient?.lastName ?? ''}`.trim(),
      c.patient?.mrn ?? '',
      c.patient?.sex ?? '',
      c.patient?.dateOfBirth
        ? new Date(c.patient.dateOfBirth).toLocaleDateString('en-US', { year:'numeric', month:'2-digit', day:'2-digit' })
        : '',
      (c.specimens ?? []).map(s => s.description ?? s.label ?? '').join('; '),
      c.specimens?.[0]?.receivedAt
        ? new Date(c.specimens[0].receivedAt).toLocaleDateString('en-US', { year:'numeric', month:'2-digit', day:'2-digit' })
        : '',
      c.order?.requestingProvider ?? '',
      c.order?.priority ?? '',
      c.status ?? '',
      // Real fix (Jira PS-57): same real-catalog resolution as the
      // computational-flags filter above — f is a FlagInstance, its
      // real display name lives on the flag definition it references,
      // not on the instance itself. Deleted (removed) flags excluded
      // from the export, same as the filter above.
      (c.caseFlags ?? [])
        .filter(f => !f.deletedAt)
        .map(f => flagDefById.get(f.flagDefinitionId)?.name ?? '')
        .join('; '),
    ]);
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv, ''], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pathscribe-cases-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveSearch = () => {
    const name = saveNameInput.trim(); if (!name) return;
    const ns: SavedSearch = { id:crypto.randomUUID(), name, filters:currentFilters(), createdAt:new Date().toISOString() };
    setSavedSearches(p=>[...p,ns]); setActiveSavedId(ns.id); setSaveNameInput(''); setShowSaveInput(false);
  };

  const handleLoadSearch = (id: string) => {
    const s = savedSearches.find(x=>x.id===id); if (!s) return;
    applyFilters(s.filters); setActiveSavedId(id); setHasSearched(true); setSidebarCollapsed(true); void runSearch();
  };

  const handleDeleteSearch = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); setSavedSearches(p=>p.filter(x=>x.id!==id));
    if (activeSavedId===id) setActiveSavedId('');
  };

  // ── Voice: selected result index ────────────────────────────
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(-1);

  // Real, per direct guidance (gap #6 — the proactive
  // moveCaseToPatient() trigger, complementing PatientManagementSection.tsx's
  // own patient-first "Move a Case…" action with this case-first
  // entry point): shows ReassignCasePatientPanel for whichever real
  // result row is currently selected via WorklistTable's own real
  // onRowSelect click handler — never a new per-row action embedded
  // in that shared table component itself.
  const [reassignPanelOpen, setReassignPanelOpen] = useState(false);
  // Real, defensive: closes the panel if the underlying selection
  // changes (a new search, arrow-key navigation to a different row)
  // rather than leaving it silently open against a stale case.
  useEffect(() => { setReassignPanelOpen(false); }, [selectedResultIndex, results]);

  // ── Voice: set SEARCH context on mount ─────────────────────────
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.SEARCH);
    return () => mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
  }, []);

  // ── Voice: table navigation and search action listeners ─────────────────────
  useEffect(() => {
    const resultList = results ?? [];
    const clamp = (i: number) => Math.max(0, Math.min(i, resultList.length - 1));

    const next     = () => setSelectedResultIndex(i => clamp(i + 1));
    const previous = () => setSelectedResultIndex(i => clamp(Math.max(0, i) - 1));
    const pageDown = () => setSelectedResultIndex(i => clamp(i + 10));
    const pageUp   = () => setSelectedResultIndex(i => clamp(Math.max(0, i) - 10));
    const first    = () => setSelectedResultIndex(0);
    const last     = () => setSelectedResultIndex(resultList.length - 1);

    const openSelected = () => {
      if (selectedResultIndex >= 0 && resultList[selectedResultIndex]) {
        sessionStorage.setItem('pathscribe:navFrom', 'search');
        navigate(`/case/${resultList[selectedResultIndex].id}/synoptic`);
      }
    };

    const clearSearch = () => {
      handleClear();
      setSelectedResultIndex(-1);
    };

    const runVoiceSearch = () => {
      setHasSearched(true);
      setSidebarCollapsed(true);
      void runSearch();
    };

    window.addEventListener('PATHSCRIBE_TABLE_NEXT',          next);
    window.addEventListener('PATHSCRIBE_TABLE_PREVIOUS',      previous);
    window.addEventListener('PATHSCRIBE_TABLE_PAGE_DOWN',     pageDown);
    window.addEventListener('PATHSCRIBE_TABLE_PAGE_UP',       pageUp);
    window.addEventListener('PATHSCRIBE_TABLE_FIRST',         first);
    window.addEventListener('PATHSCRIBE_TABLE_LAST',          last);
    window.addEventListener('PATHSCRIBE_TABLE_OPEN_SELECTED', openSelected);
    window.addEventListener('PATHSCRIBE_TABLE_CLEAR_SEARCH',  clearSearch);
    window.addEventListener('PATHSCRIBE_TABLE_SEARCH',        runVoiceSearch);

    return () => {
      window.removeEventListener('PATHSCRIBE_TABLE_NEXT',          next);
      window.removeEventListener('PATHSCRIBE_TABLE_PREVIOUS',      previous);
      window.removeEventListener('PATHSCRIBE_TABLE_PAGE_DOWN',     pageDown);
      window.removeEventListener('PATHSCRIBE_TABLE_PAGE_UP',       pageUp);
      window.removeEventListener('PATHSCRIBE_TABLE_FIRST',         first);
      window.removeEventListener('PATHSCRIBE_TABLE_LAST',          last);
      window.removeEventListener('PATHSCRIBE_TABLE_OPEN_SELECTED', openSelected);
      window.removeEventListener('PATHSCRIBE_TABLE_CLEAR_SEARCH',  clearSearch);
      window.removeEventListener('PATHSCRIBE_TABLE_SEARCH',        runVoiceSearch);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, selectedResultIndex, navigate]);

  // â”€â”€ Style helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // onF/onB update activeSection via data-section attribute. Was also
  // directly mutating e.currentTarget.style.borderColor for the focus
  // ring — replaced with a real CSS :focus rule on ps-searchpage-filter-
  // input, same fix already applied to hover-driven inline-style hacks
  // elsewhere in this review.
  const onF = (e: React.FocusEvent<HTMLInputElement>) => {
    setActiveSection(e.currentTarget.dataset.section ?? '');
  };
  const onB = () => {
    setActiveSection('');
  };

  const activeCount = [
    patientName, hospitalId, patientId, accessionNo,
    ...diagnosisList, ...specimenList,
    ...snomedList.map(s=>s.code), ...icdCodes.map(s=>s.code),
    ...synopticIds, ...flagsList, ...pathologistIds, ...attendingIds, ...submittingNames,
    ...statusList, ...priorityList, dateFrom?'df':'', dateTo?'dt':'',
  ].filter(Boolean).length;

  const summary = hasSearched ? buildSummary(currentFilters(), pathologists, attendings, t) : null;

  const quickLinks = {
    Protocols:  [{ title:'CAP Cancer Protocols', url:'https://www.cap.org/protocols-and-guidelines' }, { title:'WHO Classification', url:'https://www.who.int/publications' }],
    References: [{ title:'PathologyOutlines', url:'https://www.pathologyoutlines.com' }, { title:'UpToDate', url:'https://www.uptodate.com' }],
    Systems:    [{ title:'Hospital LIS', url:'#' }, { title:'Lab Management', url:'#' }],
  };


  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className={`ps-search-page-root${isLoaded ? ' ps-search-page-root--loaded' : ''}`}>

      {/* Real, per direct UI-review follow-up ("Fix the root"): this
          page's own competing background image/gradient removed —
          this page now falls through to AppShell's own real
          .ps-app-root background, matching Configuration/Quality
          Assurance/Intraop Queue/Contribution. See
          pathscribe.css's own .ps-search-bg-image/.ps-search-bg-gradient
          rules (now deleted) for the fuller account. */}

      <div className="ps-search-shell">

        {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="ps-search-header">
          <div className="ps-search-header-row">
            <div>
              <div className="ps-search-title-block-title">{t('searchPage.page.title')}</div>
              <div className="ps-search-title-block-sub">{t('searchPage.page.subtitle')}</div>
            </div>
            <div className="ps-search-saved-chips">
              {savedSearches.map(s => (
                <button key={s.id} type="button" onClick={()=>handleLoadSearch(s.id)} className={`ps-searchpage-saved-chip${activeSavedId===s.id ? ' ps-searchpage-saved-chip--active' : ''}`}>
                  {s.name}
                  <span onClick={e=>handleDeleteSearch(s.id,e)} className="ps-searchpage-saved-chip-remove">×</span>
                </button>
              ))}
              {showSaveInput ? (
                <div className="ps-searchpage-save-row">
                  <input ref={saveInputRef} type="text" value={saveNameInput} onChange={e=>setSaveNameInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')handleSaveSearch();if(e.key==='Escape'){setShowSaveInput(false);setSaveNameInput('');}}}
                    placeholder={t('searchPage.savedSearch.namePlaceholder')} className="ps-searchpage-save-input" />
                  <button type="button" onClick={handleSaveSearch} className="ps-searchpage-save-btn">{t('common.save')}</button>
                  <button type="button" onClick={()=>{setShowSaveInput(false);setSaveNameInput('');}} className="ps-searchpage-save-cancel-btn">✕</button>
                </div>
              ) : (
                <button type="button" onClick={()=>setShowSaveInput(true)} className="ps-searchpage-save-new-btn">{t('searchPage.savedSearch.saveNew')}</button>
              )}
              {activeCount>0&&<span className="ps-searchpage-active-count-badge">{t('searchPage.filterCount', { count: activeCount })}</span>}
            </div>
          </div>
        </div>

        {/* â”€â”€ Body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className="ps-search-main">
          <div className="ps-search-row">

          {/* â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <aside className={`ps-search-sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
            {sidebarCollapsed ? (
              <div className="ps-search-rail">
                <button type="button" className="ps-search-rail-toggle" onClick={() => setSidebarCollapsed(false)} title={t('searchPage.sidebar.expandFilters')}>
                  &rsaquo;
                </button>
                <div className="ps-search-rail-badge">{t('searchPage.sidebar.filtersBadge')}</div>
              </div>
            ) : (
            <>
            <button type="button" className="ps-search-sidebar-toggle" onClick={() => setSidebarCollapsed(true)} title={t('searchPage.sidebar.collapseFilters')}>
              &lsaquo;
            </button>
            <form onSubmit={handleSubmit} className="ps-search-form">

              {/* Accession Date */}
              <div className="ps-search-date-section">
                <div className="ps-searchpage-date-header-row">
                  <SectionLabel title={t('searchPage.sections.accessionDate')} active={activeSection==="date"} />
                  <div className="ps-searchpage-date-shortcuts">
                    {([['7d',7],['30d',30],['90d',90],['1yr',365]] as [string,number][]).map(([label,days])=>{
                      const isActive = activeDateRange === label;
                      return (
                        <button key={label} type="button"
                          onClick={()=>{setDateFrom(daysAgo(days, config.facilityTimezone));setDateTo(today(config.facilityTimezone));setActiveDateRange(label);}}
                          className={`ps-searchpage-date-shortcut-btn${isActive ? ' ps-searchpage-date-shortcut-btn--active' : ''}`}
                        >{label}</button>
                      );
                    })}
                    {/* "All" — deliberately separate from the days-based
                        shortcuts above (not representable as N-days-back).
                        Amber/warning coloring rather than cyan to visually
                        flag it as a different kind of action, not just a
                        wider version of the same thing. The tooltip is a
                        forward-looking caution about a real production
                        concern (unbounded query against years of clinical
                        records) — with the current mock service this
                        actually returns instantly, so the warning describes
                        the eventual real backend, not a live measurement of
                        anything slow happening today. */}
                    <button type="button"
                      onClick={()=>{setDateFrom('');setDateTo('');setActiveDateRange('all');}}
                      title={t('searchPage.dateShortcuts.allTooltip')}
                      className={`ps-searchpage-date-shortcut-btn ps-searchpage-date-shortcut-btn--all${activeDateRange === 'all' ? ' ps-searchpage-date-shortcut-btn--all-active' : ''}`}
                    >{t('searchPage.dateShortcuts.all')}</button>
                  </div>
                </div>
                <div className="ps-searchpage-date-grid">
                  <div>
                    <div className={`ps-searchpage-date-label${activeSection==='date' ? ' ps-searchpage-date-label--active' : ''}`}>{t('searchPage.dateShortcuts.from')}</div>
                    <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setActiveDateRange(null);}} onFocus={onF} onBlur={onB} data-section="date" aria-label={t('searchPage.identifierField.dateFromAria')} className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                  </div>
                  <div>
                    <div className={`ps-searchpage-date-label${activeSection==='date' ? ' ps-searchpage-date-label--active' : ''}`}>{t('searchPage.dateShortcuts.to')}</div>
                    <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setActiveDateRange(null);}} onFocus={onF} onBlur={onB} data-section="date" aria-label={t('searchPage.identifierField.dateToAria')} className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                  </div>
                </div>
              </div>

              {/* Scrollable filters */}
              <div className="ps-search-filter-scroll">

                {/* Identifiers */}
                {/* Identifiers ”” smart single box */}
                <div onMouseEnter={()=>setActiveSection('id')} onMouseLeave={()=>setActiveSection(s=>s==='id'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.identifier')} active={activeSection==='id'} /></div>
                  <div className="ps-searchpage-rel-wrap">
                    <input
                      data-capture-hide="true"
                      type="text"
                      value={identifierQuery}
                      onChange={e => handleIdentifierChange(e.target.value)}
                      onFocus={onF} onBlur={onB} data-section="id"
                      className="ps-searchpage-filter-input"
                      placeholder={t('searchPage.identifierField.placeholder')}
                    />
                    {identifierQuery && (
                      <button
                        type="button"
                        onClick={() => handleIdentifierChange('')}
                        className="ps-searchpage-identifier-clear"
                        aria-label={t('searchPage.identifierField.clearAria')}
                        title={t('searchPage.identifierField.clearTitle')}
                      >
                        ×
                      </button>
                    )}
                    {detectedType && identifierQuery && (
                      <div className="ps-searchpage-identifier-badge" style={{ '--accent': IDENTIFIER_BADGE[detectedType].color } as React.CSSProperties}>
                        {IDENTIFIER_BADGE[detectedType].label}
                      </div>
                    )}
                  </div>
                </div>


                {/* Patient Demographics */}
                <div
                  onMouseEnter={()=>setActiveSection('demographics')}
                  onMouseLeave={()=>setActiveSection(s=>s==='demographics'?'':s)}
                >
                  <div className="ps-searchpage-section-mb6"><SectionLabel title={t('searchPage.sections.patientDemographics')} active={activeSection==='demographics'} /></div>

                  {/* Gender */}
                  <div className="ps-searchpage-section-mb8">
                    <div className="ps-searchpage-mini-label">{t('searchPage.sections.gender')}</div>
                    <div className="ps-searchpage-pill-row">
                      {GENDER_OPTIONS.map(g => (
                        <CheckPill key={g} label={t(GENDER_LABEL_KEY[g])} checked={genderList.includes(g)} onChange={()=>toggle(g,genderList,setGenderList)} />
                      ))}
                    </div>
                  </div>

                  {/* Date of Birth range */}
                  <div className="ps-searchpage-section-mb8">
                    <div className="ps-searchpage-mini-label ps-searchpage-mini-label--soft">{t('searchPage.sections.dateOfBirth')}</div>
                    <div className="ps-searchpage-mini-grid">
                      <div>
                        <div className="ps-searchpage-mini-field-label">{t('searchPage.dateShortcuts.from')}</div>
                        <input type="date" value={dobFrom} onChange={e=>setDobFrom(e.target.value)}
                          aria-label={t('searchPage.demographics.dobFromAria')}
                          className="ps-searchpage-filter-input ps-searchpage-filter-input--date ps-searchpage-filter-input--sm" />
                      </div>
                      <div>
                        <div className="ps-searchpage-mini-field-label">{t('searchPage.dateShortcuts.to')}</div>
                        <input type="date" value={dobTo} onChange={e=>setDobTo(e.target.value)}
                          aria-label={t('searchPage.demographics.dobToAria')}
                          className="ps-searchpage-filter-input ps-searchpage-filter-input--date ps-searchpage-filter-input--sm" />
                      </div>
                    </div>
                  </div>

                  {/* Age range */}
                  <div>
                    <div className="ps-searchpage-mini-label">{t('searchPage.sections.age')}</div>
                    <div className="ps-searchpage-mini-grid">
                      <div>
                        <div className="ps-searchpage-mini-field-label ps-searchpage-mini-field-label--dim">{t('searchPage.demographics.ageMinLabel')}</div>
                        <input type="number" min={0} max={130} placeholder={t('searchPage.demographics.ageMinPlaceholder')} value={ageMin} onChange={e=>setAgeMin(e.target.value)}
                          className="ps-searchpage-filter-input" />
                      </div>
                      <div>
                        <div className="ps-searchpage-mini-field-label ps-searchpage-mini-field-label--dim">{t('searchPage.demographics.ageMaxLabel')}</div>
                        <input type="number" min={0} max={130} placeholder={t('searchPage.demographics.ageMaxPlaceholder')} value={ageMax} onChange={e=>setAgeMax(e.target.value)}
                          className="ps-searchpage-filter-input" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status + Priority ”” single row */}
                <div className="ps-searchpage-status-priority-row">
                  <div className="ps-searchpage-label-pair-row">
                    <SectionLabel title={t('searchPage.sections.status')} active={activeSection==='status'} />
                    <div className="ps-searchpage-vdivider" />
                    <SectionLabel title={t('searchPage.sections.priority')} active={activeSection==='priority'} />
                  </div>
                  <div
                    onMouseEnter={()=>setActiveSection('status')}
                    onMouseLeave={()=>setActiveSection(s=>s==='status'||s==='priority'?'':s)}
                    className="ps-searchpage-pill-row"
                  >
                    {CASE_STATUS_OPTIONS.map(s=><CheckPill key={s} label={t(STATUS_PILL_META[s].label)} checked={statusList.includes(s)} onChange={()=>toggle(s,statusList,setStatusList)} accent={STATUS_PILL_META[s].color} />)}
                    <div className="ps-searchpage-vdivider--stretch" />
                    {PRIORITY_OPTIONS.map(p=><CheckPill key={p} label={t(PRIORITY_LABEL_KEY[p])} checked={priorityList.includes(p)} onChange={()=>toggle(p,priorityList,setPriorityList)} accent={p==='STAT'?'#ef4444':p==='Rush'?'#f59e0b':'#0891B2'} />)}
                  </div>
                </div>

                {/* ── Browse-button sections: 2-column grid ── */}
                <div className="ps-search-2col">

                {/* Flags */}
                <div onMouseEnter={()=>setActiveSection('flags')} onMouseLeave={()=>setActiveSection(s=>s==='flags'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.flags')} active={activeSection==='flags'} />
                    <BrowseBtn onClick={()=>setFlagsModal(true)} count={realFlagNames.length} />
                  </div>
                  {flagsList.length>0&&<div className="ps-searchpage-pill-row">{flagsList.map(f=><Chip key={f} label={f} onRemove={()=>setFlagsList(p=>p.filter(x=>x!==f))} />)}</div>}
                </div>

                {/* Synoptic */}
                <div onMouseEnter={()=>setActiveSection('synoptic')} onMouseLeave={()=>setActiveSection(s=>s==='synoptic'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.synopticProtocol')} active={activeSection==='synoptic'} />
                    <BrowseBtn onClick={()=>setSynopticModal(true)} count={ALL_SYNOPTICS.length} />
                  </div>
                  {synopticIds.length>0&&<div className="ps-searchpage-pill-row">{synopticIds.map(id=>{const t=ALL_SYNOPTICS.find(s=>s.id===id);return t?<Chip key={id} label={t.organ} onRemove={()=>setSynopticIds(p=>p.filter(x=>x!==id))} />:null;})}</div>}
                </div>

                {/* Pathologist */}
                <div onMouseEnter={()=>setActiveSection('path')} onMouseLeave={()=>setActiveSection(s=>s==='path'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.pathologist')} active={activeSection==='path'} />
                    <BrowseBtn onClick={()=>setPathModal(true)} count={pathologists.length} />
                  </div>
                  {pathologistIds.length>0&&<div className="ps-searchpage-pill-row">{pathologistIds.map(id=>{const u=pathologists.find(x=>x.id===id);return u?<Chip key={id} label={u.name.replace('Dr. ','')} onRemove={()=>setPathologistIds(p=>p.filter(x=>x!==id))} />:null;})}</div>}
                </div>

                {/* Attending Physician */}
                <div onMouseEnter={()=>setActiveSection('attending')} onMouseLeave={()=>setActiveSection(s=>s==='attending'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.attendingPhysician')} active={activeSection==='attending'} />
                    <BrowseBtn onClick={()=>setAttendingModal(true)} count={attendings.length} />
                  </div>
                  {attendingIds.length>0&&<div className="ps-searchpage-pill-row">{attendingIds.map(id=>{const u=attendings.find(x=>x.id===id);return u?<Chip key={id} label={u.name.replace('Dr. ','')} onRemove={()=>setAttendingIds(p=>p.filter(x=>x!==id))} />:null;})}</div>}
                </div>


                {/* Computational Flags */}
                <div className="ps-searchpage-section-mb4">
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.compFlags')} active={false} />
                    <BrowseBtn onClick={()=>setCompFlagsModal(true)} count={compFlagsList.length||undefined} />
                  </div>
                  {compFlagsList.length>0&&<div className="ps-searchpage-pill-row">
                    {compFlagsList.map(f=><Chip key={f} label={f} onRemove={()=>setCompFlagsList(p=>p.filter(x=>x!==f))} accent="#0891b2" />)}
                  </div>}
                </div>

                {/* Facility */}
                <div className="ps-searchpage-section-mb4">
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.facility')} active={false} />
                    <BrowseBtn onClick={()=>setFacilityModal(true)} count={facilityIds.length||undefined} />
                  </div>
                  {facilityIds.length>0&&<div className="ps-searchpage-pill-row">
                    {facilityIds.map(id=><Chip key={id} label={facilities.find(c=>c.id===id)?.name??id} onRemove={()=>setFacilityIds(p=>p.filter(x=>x!==id))} accent="#8b5cf6" />)}
                  </div>}
                </div>

                </div>{/* end ps-search-2col */}

                {/* Specimen */}
                <div onMouseEnter={()=>setActiveSection('specimen')} onMouseLeave={()=>setActiveSection(s=>s==='specimen'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.specimen')} active={activeSection==='specimen'} /></div>
                  <div className="ps-searchpage-input-row" ref={specimenRef}>
                    <div className="ps-searchpage-rel-wrap--flex1">
                      <input type="text" value={specimenQuery} onChange={e=>setSpecimenQuery(e.target.value)} onFocus={onF} onBlur={onB} data-section="specimen" className="ps-searchpage-filter-input" placeholder={t('searchPage.specimenSection.placeholder')}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(specimenQuery.trim())addSpecimen(specimenQuery);}}} />
                      {showSpecimenDrop&&(
                        <div className={DROPDOWN_CLASS}>
                          {specimenSuggestions.map(s=>(
                            <button key={s} type="button" onClick={()=>addSpecimen(s)} className={DROP_BTN_CLASS}>{s}</button>
                          ))}
                          {specimenQuery.trim()&&!SPECIMEN_DICTIONARY.some(s=>s.toLowerCase()===specimenQuery.toLowerCase())&&(
                            <button type="button" onClick={()=>addSpecimen(specimenQuery)} className={`${DROP_BTN_CLASS} ps-searchpage-dropdown-btn--add`}>{t('searchPage.specimenSection.addOption', { query: specimenQuery })}</button>
                          )}
                        </div>
                      )}
                    </div>
                    <BrowseBtn onClick={()=>setSpecimenModal(true)} count={specimenList.length||undefined} />
                  </div>
                  {specimenList.length>0&&<div className="ps-searchpage-pill-row--mt4">{specimenList.map(s=><Chip key={s} label={s} onRemove={()=>setSpecimenList(p=>p.filter(x=>x!==s))} />)}</div>}
                </div>

                {/* Diagnosis */}
                <div onMouseEnter={()=>setActiveSection('diagnosis')} onMouseLeave={()=>setActiveSection(s=>s==='diagnosis'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.diagnosis')} active={activeSection==='diagnosis'} /></div>
                  <div className="ps-searchpage-input-row">
                    <input type="text" value={diagnosisText} onChange={e=>setDiagnosisText(e.target.value)} onFocus={onF} onBlur={onB} data-section="diagnosis" className="ps-searchpage-filter-input" placeholder={t('searchPage.diagnosisSection.placeholder')}
                      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addDiagnosis();}}} />
                    <button type="button" onClick={addDiagnosis} className="ps-searchpage-add-btn">+</button>
                  </div>
                  {diagnosisList.length>0&&<div className="ps-searchpage-pill-row--mt4">{diagnosisList.map(d=><Chip key={d} label={d} onRemove={()=>setDiagnosisList(p=>p.filter(x=>x!==d))} />)}</div>}
                </div>

                {/* SNOMED CT */}
                <div onMouseEnter={()=>setActiveSection('snomed')} onMouseLeave={()=>setActiveSection(s=>s==='snomed'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.snomedCt')} active={activeSection==='snomed'} /></div>
                  <div className="ps-searchpage-input-row" ref={snomedRef}>
                    <div className="ps-searchpage-rel-wrap--flex1">
                      <input type="text" value={snomedQuery} onChange={e=>setSnomedQuery(e.target.value)} onFocus={onF} onBlur={onB} data-section="snomed" className="ps-searchpage-filter-input" placeholder={t('searchPage.snomedSection.placeholder')} />
                      {showSnomedDrop&&(
                        <div className={DROPDOWN_CLASS}>
                          {snomedSuggestions.map(s=>(
                            <button key={s.code} type="button" onClick={()=>addSnomed(s)} className={DROP_BTN_CLASS}>
                              <span className="ps-searchpage-dropdown-code ps-searchpage-dropdown-code--snomed">{s.code}</span>
                              <span className="ps-searchpage-dropdown-desc">{s.display.substring(0,38)}…</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <BrowseBtn onClick={()=>setSnomedModal(true)} count={snomedList.length||undefined} />
                  </div>
                  {snomedList.length>0&&(
                    <div className="ps-searchpage-pill-row--mt4">
                      {snomedList.map(s=><Chip key={s.code} label={s.code} title={`SNOMED CT: ${s.display}`} onRemove={()=>setSnomedList(p=>p.filter(x=>x.code!==s.code))} accent='#8B5CF6' />)}
                    </div>
                  )}
                </div>

                {/* ICD Codes ”” unified ICD-10 / ICD-11 / ICD-O */}
                <div onMouseEnter={()=>setActiveSection('icd')} onMouseLeave={()=>setActiveSection(s=>s==='icd'?'':s)} className="ps-searchpage-icd-section-pb">
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.icdCodes')} active={activeSection==='icd'} /></div>
                  <div className="ps-searchpage-input-row" ref={icdRef}>
                    <div className="ps-searchpage-rel-wrap--flex1">
                      <input type="text" value={icdQuery} onChange={e=>setIcdQuery(e.target.value)} onFocus={onF} onBlur={onB} data-section="icd" className="ps-searchpage-filter-input" placeholder={t('searchPage.icdSection.placeholder')} />
                      {showIcdDrop&&(
                        <div className={`ps-scroll ${DROPDOWN_CLASS}`}>
                          {icdSuggestions.map(s=>(
                            <button key={s.code} type="button" onClick={()=>addIcd(s)} className={DROP_BTN_CLASS}>
                              <span className="ps-searchpage-dropdown-code ps-searchpage-dropdown-code--icd">{s.code}</span>
                              <span className="ps-searchpage-dropdown-desc">{s.display.substring(0,38)}…</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <BrowseBtn onClick={()=>setIcdModal(true)} count={icdCodes.length||undefined} />
                  </div>
                  {icdCodes.length>0&&(
                    <div className="ps-searchpage-pill-row--mt4">
                      {icdCodes.map(s=>{
                        const icdAccent = s.system==='ICD-11'?'#F59E0B':s.system?.startsWith('ICD-O')?'#10B981':'#8B5CF6';
                        return <Chip key={`${s.system}-${s.code}`} label={`${s.system} ${s.code}`} title={s.display} onRemove={()=>setIcdCodes(p=>p.filter(x=>x.code!==s.code))} accent={icdAccent} />;
                      })}
                    </div>
                  )}
                </div>

              </div>{/* end scrollable filters */}

              {/* Action buttons */}
              <div className="ps-search-actions">
                <button type="button" onClick={handleClear} className="ps-search-btn-clear">{t('searchPage.actions.clear')}</button>
                <button type="submit" disabled={isSearching} className="ps-search-btn-submit">
                  {isSearching?t('searchPage.actions.searching'):t('searchPage.actions.searchCases')}
                </button>
              </div>

            </form>
            </>
            )}
          </aside>

          {/* â”€â”€ Results pane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div data-capture-hide="true" className="ps-search-results-pane">

            {/* Summary bar */}
            <div className="ps-search-summary-bar">
              {summary ? (
                <p className="ps-searchpage-summary-text">
                  
                  {summary.split(' · ').map((part,i,arr)=>(
                    <React.Fragment key={i}>
                      <span className={i===0 ? 'ps-searchpage-summary-part--first' : 'ps-searchpage-summary-part'}>{part}</span>
                      {i<arr.length-1&&<span className="ps-searchpage-summary-sep">·</span>}
                    </React.Fragment>
                  ))}
                </p>
              ) : (
                <p className="ps-searchpage-summary-empty">{t('searchPage.summary.empty', { cta: t('searchPage.actions.searchCases') })}</p>
              )}
              <div className="ps-search-summary-actions">
                {results!==null&&<span className="ps-searchpage-result-count">{t('searchPage.summary.resultCount', { count: results.length })}</span>}
                {results!==null&&results.length>0&&(
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="ps-searchpage-export-btn"
                  >{t('searchPage.summary.exportCsv')}</button>
                )}
                {/* Real, per direct guidance (gap #6): only enabled when
                    a real result row is actually selected — reuses
                    selectedResultIndex, the same real signal
                    WorklistTable's own onRowSelect already drives via
                    real user click, not keyboard alone. */}
                {selectedResultIndex>=0 && results?.[selectedResultIndex] && (
                  <button
                    type="button"
                    onClick={() => setReassignPanelOpen(true)}
                    className="ps-searchpage-export-btn"
                  >{t('searchPage.summary.reassignPatient')}</button>
                )}
              </div>
            </div>

            {reassignPanelOpen && selectedResultIndex>=0 && results?.[selectedResultIndex] && (
              <ReassignCasePatientPanel
                caseData={results[selectedResultIndex]}
                onClose={() => setReassignPanelOpen(false)}
                onReassigned={() => {
                  setReassignPanelOpen(false);
                  runSearch();
                }}
              />
            )}

            {/* Result table — WorklistTable owns its own internal scroll
                (.wl-table-scroll). minWidth:0 here (and on .ps-search-results-body
                in pathscribe.css) is required for that to actually kick in —
                without it, the 1100px-wide table can push this flex chain wider
                instead of being clamped, which only shows up as truncation on
                narrower viewports rather than a visible bug on a wide monitor. */}
            <div ref={wrapperRef} className="ps-search-table-wrap">
              {hasSearched
                ? <WorklistTable key={searchGeneration} cases={results??[]} activeFilter="all" selectedIndex={selectedResultIndex} onRowSelect={setSelectedResultIndex} onBeforeNavigate={(_caseId)=>sessionStorage.setItem('pathscribe:navFrom','search')} tableHeight={tableHeight} forceCardView flagDefinitions={flagDefinitions} />
                : <div className="ps-searchpage-no-search">{t('searchPage.summary.noSearchYet')}</div>
              }
            </div>
            {hasSearched && hasMoreResults && (
              <div className="ps-searchpage-loadmore-row">
                <button
                  type="button"
                  onClick={loadMoreResults}
                  disabled={isLoadingMore}
                  className={`ps-searchpage-loadmore-btn${isLoadingMore ? ' ps-searchpage-loadmore-btn--loading' : ''}`}
                >
                  {isLoadingMore ? t('common.loading') : t('searchPage.summary.loadMore', { count: SEARCH_PAGE_SIZE })}
                </button>
              </div>
            )}
          </div>
          </div>{/* end inner flex row */}
        </main>
      </div>

      {/* â”€â”€ Lookup modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

      {specimenModal&&(
        <LookupModal
          title={t('searchPage.lookupModals.specimenTitle')}
          subtitle={t('searchPage.lookupModals.specimenSubtitle', { count: specimenDictionary.filter(s=>s.active).length, types: [...new Set(specimenDictionary.map(s=>s.type))].length })}
          selectedCount={specimenList.length}
          onClose={()=>setSpecimenModal(false)}
        >
          <SpecimenLookupContent
            specimens={specimenDictionary}
            selected={specimenList}
            onToggle={name => setSpecimenList(p => p.includes(name) ? p.filter(x=>x!==name) : [...p, name])}
          />
        </LookupModal>
      )}

      {snomedModal&&(
        <LookupModal
          title={t('searchPage.lookupModals.snomedTitle')}
          subtitle={t('searchPage.lookupModals.snomedSubtitle', { count: SNOMED_AXIS_META.length, axes: SNOMED_AXIS_META.map(m=>t(m.labelKey)).join(', ') })}
          selectedCount={snomedList.length}
          onClose={()=>setSnomedModal(false)}
        >
          <SnomedModalContent
            selected={snomedList}
            onToggle={c=>setSnomedList(p=>p.some(x=>x.code===c.code)?p.filter(x=>x.code!==c.code):[...p,c])}
          />
        </LookupModal>
      )}

      {icdModal&&(
        <LookupModal
          title={t('searchPage.lookupModals.icdTitle')}
          subtitle={t('searchPage.lookupModals.icdSubtitle')}
          selectedCount={icdCodes.length}
          onClose={()=>setIcdModal(false)}
        >
          <IcdModalContent
            selected={icdCodes}
            onToggle={c=>setIcdCodes(p=>p.some(x=>x.code===c.code)?p.filter(x=>x.code!==c.code):[...p,c])}
            icd10Active={config.terminologyConfig.icd10.active}
            icd11Active={config.terminologyConfig.icd11.active}
            icdoActive={config.terminologyConfig.icdo.active}
          />
        </LookupModal>
      )}

      {synopticModal&&(
        <LookupModal title={t('searchPage.lookupModals.synopticTitle')} subtitle={t('searchPage.lookupModals.synopticSubtitle', { count: ALL_SYNOPTICS.length, categories: Array.from(new Set(ALL_SYNOPTICS.map(s=>s.category))).length })} selectedCount={synopticIds.length} onClose={()=>setSynopticModal(false)}>
          <SynopticLookupContent selected={synopticIds} onToggle={id=>toggle(id,synopticIds,setSynopticIds)} />
        </LookupModal>
      )}

      {flagsModal&&(
        <LookupModal title={t('searchPage.lookupModals.flagsTitle')} subtitle={t('searchPage.lookupModals.flagsSubtitle', { count: realFlagNames.length })} selectedCount={flagsList.length} onClose={()=>setFlagsModal(false)}>
          <FlagsLookupContent flags={realFlagNames} selected={flagsList} onToggle={f=>toggle(f,flagsList,setFlagsList)} />
        </LookupModal>
      )}

      {pathModal&&(
        <LookupModal title={t('searchPage.lookupModals.pathologistTitle')} subtitle={t('searchPage.lookupModals.pathologistSubtitle')} selectedCount={pathologistIds.length} onClose={()=>setPathModal(false)}>
          <UserLookupContent users={pathologists} selected={pathologistIds} onToggle={id=>toggle(id,pathologistIds,setPathologistIds)} />
        </LookupModal>
      )}

      {attendingModal&&(
        <LookupModal title={t('searchPage.lookupModals.attendingTitle')} subtitle={t('searchPage.lookupModals.attendingSubtitle')} selectedCount={attendingIds.length} onClose={()=>setAttendingModal(false)}>
          <UserLookupContent users={attendings} selected={attendingIds} onToggle={id=>toggle(id,attendingIds,setAttendingIds)} accent="#10B981" />
        </LookupModal>
      )}

      {/* Facility browse modal */}
      {facilityModal && (
        <LookupModalX
          title={t('searchPage.lookupModals.facilityTitle')}
          subtitle={t('searchPage.lookupModals.facilitySubtitle')}
          selectedCount={facilityIds.length}
          onClose={() => setFacilityModal(false)}
          onClear={() => setFacilityIds([])}
          onDone={() => setFacilityModal(false)}
        >
          <FacilityLookupContent
            facilities={facilities}
            selected={facilityIds}
            onToggle={id => toggle(id, facilityIds, setFacilityIds)}
          />
        </LookupModalX>
      )}

      {/* Computational Flags browse modal */}
      {compFlagsModal && (
        <LookupModalX
          title={t('searchPage.lookupModals.compFlagsTitle')}
          subtitle={t('searchPage.lookupModals.compFlagsSubtitle')}
          selectedCount={compFlagsList.length}
          onClose={() => setCompFlagsModal(false)}
          onClear={() => setCompFlagsList([])}
          onDone={() => setCompFlagsModal(false)}
        >
          <CompFlagsLookupContent
            flags={realCompFlagNames}
            selected={compFlagsList}
            onToggle={f => toggle(f, compFlagsList, setCompFlagsList)}
          />
        </LookupModalX>
      )}

      {/* â”€â”€ Resources modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isResourcesOpen&&(
        <div className="ps-modal-overlay" onClick={()=>setIsResourcesOpen(false)}>
          <div className="ps-searchpage-resources-modal" onClick={e=>e.stopPropagation()}>
            <div className="ps-searchpage-modal-title ps-searchpage-modal-title--resources">{t('searchPage.resourcesModal.title')}</div>
            {Object.entries(quickLinks).map(([section,links])=>(
              <div key={section} className="ps-searchpage-resource-section">
                <div className="ps-searchpage-resource-section-label">{t(RESOURCE_SECTION_LABEL_KEY[section] ?? section)}</div>
                {links.map((link,i)=>(
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" onClick={()=>setIsResourcesOpen(false)}
                    className="ps-searchpage-resource-link">→ {link.title}</a>
                ))}
              </div>
            ))}
            <button onClick={()=>setIsResourcesOpen(false)} className="ps-searchpage-modal-close-btn">{t('common.close')}</button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SearchPage;



