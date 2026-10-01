type CodeModalSystem = 'snomed' | 'icd' | 'SNOMED' | 'ICD-10' | 'ICD-11' | 'ICD-O-topography' | 'ICD-O-morphology';

// src/pages/SearchPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Case search. Batch 350 (Pete: "the search is largely broken … results
// should be paged so that the heavy lifting is done on the server side"):
//   • the page keeps one draft of the filters (CaseSearchDraft) and sends it
//     to the case search service (@/services caseSearchService), which
//     applies the user's access rules, matches, sorts, counts and returns one
//     page; the page shows that page with a pager and the total;
//   • CSV export asks the service for every match (up to its limit), not just
//     the rows on screen, and is audited;
//   • saved searches go through the saved-search service (they were kept in
//     this browser only, and dropped the facility and specimen-flag filters);
//   • the last search is restored from utils/search/searchSession.ts (filters
//     and page only: results are fetched again, so no patient data is kept
//     in the browser);
//   • decisions moved to utils/search/ (building the request, the summary,
//     the CSV, date shortcuts, specimen suggestions) and services/caseSearch/;
//   • synoptic protocols come from the protocol registry, not a hard-coded
//     list; flags are chosen by id.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import WorklistTable from '../components/Worklist/WorklistTable';
import { ReassignCasePatientPanel } from '../components/Search/ReassignCasePatientPanel';
import {
  codeService, flagService, userService, physicianService, facilityService, subspecialtyService,
  caseSearchService, savedSearchService, actionRegistryService,
  CASE_SEARCH_STATUS_OPTIONS, CASE_SEARCH_PRIORITY_OPTIONS, CASE_SEARCH_SEX_OPTIONS, CASE_SEARCH_SORT_OPTIONS,
  CASE_SEARCH_PAGE_SIZES, DEFAULT_CASE_SEARCH_SORT, DEFAULT_CASE_SEARCH_PAGE_SIZE, emptyCaseSearchDraft,
  CASE_SEARCH_DATE_BASES, CASE_SEARCH_CASE_TYPES, CASE_SEARCH_PATHOLOGIST_ROLES, CASE_SEARCH_REVISION_TYPES,
  CASE_SEARCH_HOLD_TYPES, CASE_SEARCH_RESULT_FLAGS, CASE_SEARCH_PENDING_WORK, CASE_SEARCH_INTAKES,
  CASE_SEARCH_AUTOPSY_AUTHORITIES, CASE_SEARCH_AUTOPSY_REPORTS, locationService,
} from '../services';
import type {
  ClinicalCode, Flag, SavedSearch, CaseSearchDraft, CaseSearchPage, CaseSearchSort, CaseSearchDateBasis, CaseSearchPathologistRole,
} from '../services';
import { getActivePerformingLabs } from '../utils/performingLabs';
import { listTemplatesCached } from '../services/templates/templateService';
import { getStaffSubspecialtyDisplay } from '../utils/staffSubspecialties';
import { LookupModal, LookupSearch, LookupItem, LookupSection, LookupEmpty } from '../components/Common/LookupModal';
// Extended component — adds onClear prop until LookupModal.tsx is updated
const LookupModalX = LookupModal as React.ComponentType<React.ComponentProps<typeof LookupModal> & { onClear?: () => void; onDone?: () => void }>;
import { useSpecimenDictionary } from '../components/Config/System/useSpecimenDictionary';
import type { SpecimenEntry } from '../services/specimenDictionary/specimenTypes';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { useEnabledIdentifierFormats } from '../hooks/useEnabledIdentifierFormats';
import { useBreadcrumb }   from '../contexts/BreadcrumbContext';
import { detectIdentifierType, resolveIdentifierApplication } from '../utils/detectIdentifierType';
import type { IdentifierType } from '../utils/detectIdentifierType';
import { deriveLegacyFormats } from '../types/systemConfig';
import { VOICE_CONTEXT } from '../constants/systemActions';
import { downloadCsv } from '../utils/csv';
import { getUiPreference, setUiPreference } from '../utils/uiPreferences';
import {
  addTerm, applyIdentifierToDraft, buildCaseSearchRequest, countDraftFilters, countMoreFilters, draftToCriteria,
  normalizeCaseSearchDraft, toggleInList,
} from '../utils/search/buildCaseSearchRequest';
import { describeCaseSearch, pageRange } from '../utils/search/describeCaseSearch';
import { buildCaseSearchCsv, caseSearchCsvFilename, formatCalendarDate } from '../utils/search/caseSearchCsv';
import {
  CASE_PRIORITY_HUE, CASE_PRIORITY_LABEL_KEY, CASE_SEARCH_SORT_LABEL_KEY, CASE_SEX_LABEL_KEY,
  CASE_STATUS_HUE, CASE_STATUS_LABEL_KEY, sortOptionKey,
  AUTOPSY_AUTHORITY_LABEL_KEY, AUTOPSY_JURISDICTIONS, AUTOPSY_REPORT_LABEL_KEY, CASE_TYPE_LABEL_KEY, DATE_BASIS_LABEL_KEY,
  HOLD_TYPE_LABEL_KEY, INTAKE_LABEL_KEY, PATHOLOGIST_ROLE_LABEL_KEY, PENDING_WORK_LABEL_KEY, RESULT_FLAG_HUE,
  RESULT_FLAG_LABEL_KEY, REVISION_TYPE_LABEL_KEY,
} from '../utils/search/caseSearchLabels';
import {
  DEFAULT_SEARCH_DATE_SHORTCUT, SEARCH_DATE_SHORTCUT_DAYS, facilityDateString, matchDateShortcut, shortcutDateRange,
  type SearchDateShortcut,
} from '../utils/search/searchDateShortcuts';
import {
  clearLastCaseSearch, consumeReturnToSearch, loadLastCaseSearch, saveLastCaseSearch, setCaseOpenedFrom,
} from '../utils/search/searchSession';
import { suggestSpecimens } from '../utils/search/suggestSpecimens';
import { filterLookup, groupLookup } from '../utils/search/lookupFilter';

// ─── Picker option shapes ───────────────────────────────────────────────────

interface UserStub { id: string; name: string; secondary: string; }
interface SynopticTemplateOption { id: string; name: string; category: string; }
interface FlagOption { id: string; name: string; abbreviation: string; }

const DATE_SHORTCUT_LABEL_KEY: Record<Exclude<SearchDateShortcut, 'all'>, string> = {
  '7d': 'searchPage.dateShortcuts.days7', '30d': 'searchPage.dateShortcuts.days30',
  '90d': 'searchPage.dateShortcuts.days90', '1yr': 'searchPage.dateShortcuts.year1',
};
const PAGE_SIZE_PREFERENCE = 'searchPage.pageSize';

// quickLinks' own object keys (Protocols/References/Systems) are data —
// they drive the JSX .map()/key lookups below — so they stay as-is; this
// parallel map translates only the on-screen section heading.
const RESOURCE_SECTION_LABEL_KEY: Record<string, string> = {
  'Protocols':  'searchPage.resourceSection.protocols',
  'References': 'searchPage.resourceSection.references',
  'Systems':    'searchPage.resourceSection.systems',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// Browse button — opens lookup modal, sits inline with input
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

// ─── LookupModal and content components imported from Common/LookupModal ──────
// LookupModal, LookupSearch, LookupItem, LookupSection, LookupEmpty

// ─── Synoptic lookup content (local — synoptics are search-page-specific) ─────

const SynopticLookupContent: React.FC<{ templates: SynopticTemplateOption[]; selected: string[]; onToggle: (id: string) => void }> = ({ templates, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = filterLookup(templates, q, s => [s.name, s.category]);
  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.synopticLookup.searchProtocols')} />
      {q.trim().length < 1
        ? groupLookup(templates, s => s.category).map(([cat, items]) => (
            <div key={cat}>
              <LookupSection label={cat} count={items.length} />
              {items.map(s => (
                <LookupItem key={s.id} selected={selected.includes(s.id)} onToggle={() => onToggle(s.id)} primary={s.name} secondary={s.id} />
              ))}
            </div>
          ))
        : filtered.length === 0
          ? <LookupEmpty query={q} />
          : filtered.map(s => (
              <LookupItem key={s.id} selected={selected.includes(s.id)} onToggle={() => onToggle(s.id)} primary={s.name} secondary={s.category} />
            ))
      }
    </>
  );
};

// ─── User lookup content ──────────────────────────────────────────────────────

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

// ─── Flags lookup content ─────────────────────────────────────────────────────

const FlagsLookupContent: React.FC<{ flags: FlagOption[]; selected: string[]; onToggle: (id: string) => void }> = ({ flags, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = filterLookup(flags, q, f => [f.name]);
  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.flagsLookup.searchFlags')} />
      <div className="ps-searchpage-flag-grid">
        {filtered.length === 0
          ? <LookupEmpty query={q} />
          : filtered.map(f => (
              <button key={f.id} type="button" onClick={() => onToggle(f.id)}
                className={`ps-searchpage-flag-pill${selected.includes(f.id) ? ' ps-searchpage-flag-pill--selected' : ''}`}
              >{f.name}</button>
            ))
        }
      </div>
    </>
  );
};

// ─── Specimen lookup content ──────────────────────────────────────────────────

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

const CompFlagsLookupContent: React.FC<{ flags: FlagOption[]; selected: string[]; onToggle: (id: string) => void }> = ({ flags, selected, onToggle }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = filterLookup(flags, q, f => [f.name]);
  return (
    <>
      <div className="ps-searchpage-client-search-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchPage.compFlagsLookup.searchByTestName')}
          className="ps-searchpage-client-search-input" />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={q} />
        : filtered.map(f => (
            <LookupItem key={f.id} selected={selected.includes(f.id)} onToggle={() => onToggle(f.id)}
              primary={f.name}
              secondary={t('searchPage.compFlagsLookup.computationalLisFlag')}
              badge={f.abbreviation}
              badgeColor="#0891b2"
            />
          ))
      }
    </>
  );
};

// Also the generic id/name picker for subspecialties, performing labs, locations and jurisdictions (Batch 351).
const FacilityLookupContent: React.FC<{ facilities: UserStub[]; selected: string[]; onToggle: (id: string) => void; placeholder?: string; showIds?: boolean }> = ({ facilities, selected, onToggle, placeholder, showIds = true }) => {
  const { t } = useTranslation();
  const [nameQ, setNameQ] = useState('');
  const filtered = facilities.filter(c =>
    nameQ.length < 1 || c.name.toLowerCase().includes(nameQ.toLowerCase())
  );
  const abbr = (name: string) => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase();
  return (
    <>
      <div className="ps-searchpage-client-search-wrap">
        <input value={nameQ} onChange={e => setNameQ(e.target.value)} placeholder={placeholder ?? t('searchPage.facilityLookup.searchByFacilityName')}
          className="ps-searchpage-client-search-input" />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={nameQ} />
        : filtered.map(c => {
            const sel = selected.includes(c.id);
            return (
              <LookupItem key={c.id} selected={sel} onToggle={() => onToggle(c.id)}
                primary={c.name}
                secondary={c.secondary || (showIds ? c.id.toUpperCase() : undefined)}
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

  // Which types have results right now — drives pill highlight
  const matchedTypes = new Set(searched.map(s => s.type));

  // Final display — apply pinned filter on top if set
  const displayed = pinnedType ? searched.filter(s => s.type === pinnedType) : searched;

  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t('searchPage.specimenLookup.searchPlaceholder')} />

      {/* Pills — always single row, horizontal scroll, highlight = has results */}
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

// ─── Unified ICD modal — tabs shown only if active in config ─────────────────

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
      {/* Tab bar — only shows active systems */}
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


// ─── SNOMED CT modal — Big Four axes as tabs ──────────────────────────────────

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

  // Load full axis set once — client-side search, no re-fetch on keystroke
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

  // Displayed results driven purely by search query — no pill filter
  const isSearching = q.trim().length >= 1;
  const displayed = isSearching
    ? allCodes.filter(c =>
        c.code.toLowerCase().includes(q.toLowerCase()) ||
        c.display.toLowerCase().includes(q.toLowerCase()) ||
        c.category?.toLowerCase().includes(q.toLowerCase())
      )
    : allCodes;

  // Which subgroups have at least one match — drives pill highlight
  const matchedSubgroups = new Set(
    displayed.map(c => c.category?.includes('|') ? c.category.split('|')[1] : null).filter(Boolean) as string[]
  );

  return (
    <>
      <LookupSearch value={q} onChange={setQ} placeholder={t(meta.placeholderKey)} />
      {loading
        ? <div className="ps-searchpage-lookup-loading">{t('common.loading')}</div>
        : <>
            {/* Subgroup filter pills — only shown while searching, clickable to narrow results */}
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
            {/* Category filter pills — clickable, wrap, highlight active/matched */}
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
  const { t, i18n } = useTranslation();
  const navigate     = useNavigate();
  const { user }      = useAuth();
  const { pushCrumb } = useBreadcrumb();
  const { dictionary: specimenDictionary } = useSpecimenDictionary();
  const { config } = useSystemConfig();
  const timeZone = config.facilityTimezone;
  const defaultRange = () => shortcutDateRange(DEFAULT_SEARCH_DATE_SHORTCUT, timeZone);

  // ── Picker data ─────────────────────────────────────────────────────────
  // Real fix (earlier): pathologists/attendings/facilities used to be
  // hardcoded; they come from the same services RoleDictionary.tsx and
  // AccessionPage.tsx use. Batch 350: names are shown as recorded, without
  // an English "Dr." added.
  const [pathologists, setPathologists] = useState<UserStub[]>([]);
  const [attendings, setAttendings] = useState<UserStub[]>([]);
  const [facilities, setFacilities] = useState<UserStub[]>([]);
  useEffect(() => {
    Promise.all([userService.getAll(), physicianService.getAll(), facilityService.getAll(), subspecialtyService.getAll()]).then(
      ([userRes, physicianRes, clientRes, subsRes]) => {
        const realFacilities = clientRes.ok ? clientRes.data : [];
        setFacilities(realFacilities.map(c => ({ id: c.id, name: c.name, secondary: '' })));
        if (userRes.ok) {
          const allSubspecialties = subsRes.ok ? subsRes.data : [];
          setSubspecialties(allSubspecialties.filter(x => x.status === 'Active').map(x => ({ id: x.id, name: x.name, secondary: '' })));
          setPathologists(
            userRes.data
              // Batch 351: residents too, for the Resident role.
              .filter(u => u.roles.includes('Pathologist') || u.roles.includes('Resident'))
              .map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), secondary: getStaffSubspecialtyDisplay(u.id, allSubspecialties) }))
          );
        }
        if (physicianRes.ok) {
          setAttendings(
            physicianRes.data.map(p => ({
              id: p.id,
              name: [p.namePrefix, p.givenNames || p.firstName, p.familyNames || p.lastName].filter(Boolean).join(' '),
              secondary: p.clientIds.map(cid => realFacilities.find(c => c.id === cid)?.name).filter(Boolean).join(', '),
            }))
          );
        }
      }
    );
  }, []);

  // Batch 350: protocols from the protocol registry (the ids cases carry).
  // Batch 351: subspecialties, performing labs, ordering locations and jurisdictions for the new filters.
  const [subspecialties, setSubspecialties] = useState<UserStub[]>([]);
  const [performingLabs, setPerformingLabs] = useState<UserStub[]>([]);
  const [locations, setLocations] = useState<UserStub[]>([]);
  useEffect(() => {
    getActivePerformingLabs().then(labs => setPerformingLabs(labs.map(l => ({ id: l.id, name: l.name, secondary: '' })))).catch(() => {});
    Promise.all([locationService.getAll(), facilityService.getAll()]).then(([locRes, facRes]) => {
      if (locRes.ok !== true) return;
      const facilityName = (id: string) => (facRes.ok === true ? facRes.data.find(f => f.id === id)?.name : undefined) ?? '';
      setLocations(locRes.data.map(l => ({ id: l.id, name: [l.pointOfCare, l.room].filter(Boolean).join(' · '), secondary: facilityName(l.facilityId) })));
    }).catch(() => {});
  }, []);
  const jurisdictions = useMemo<UserStub[]>(
    () => AUTOPSY_JURISDICTIONS.map(j => ({ id: j, name: t(`jurisdictionNames.${j}`), secondary: '' })),
    [t],
  );

  const [templates, setTemplates] = useState<SynopticTemplateOption[]>([]);
  useEffect(() => {
    listTemplatesCached(['published', 'approved', 'archived'])
      .then(list => setTemplates(list.map(p => ({ id: p.id, name: p.name, category: p.category }))))
      .catch(() => setTemplates([]));
  }, []);

  const [flagDefinitions, setFlagDefinitions] = useState<Flag[]>([]);
  useEffect(() => {
    flagService.getAll().then(res => { if (res.ok) setFlagDefinitions(res.data); }).catch(() => {});
  }, []);
  // Case flags and computational (specimen/LIS) flags, from the flag catalog.
  const [caseFlagOptions, specimenFlagOptions] = useMemo(() => {
    const active = flagDefinitions.filter(f => f.status === 'Active');
    const toOption = (f: Flag): FlagOption => ({ id: f.id, name: f.name, abbreviation: f.lisCode || f.name.slice(0, 3).toUpperCase() });
    return [
      active.filter(f => f.tagClass !== 'COMPUTATIONAL').map(toOption),
      active.filter(f => f.tagClass === 'COMPUTATIONAL').map(toOption),
    ];
  }, [flagDefinitions]);
  const flagName = (id: string) => flagDefinitions.find(f => f.id === id)?.name;

  // Measure available height for the table container — mirrors
  // WorklistPage.tsx's identical hook (immune to parent flex/overflow issues).
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number>(400);
  useEffect(() => {
    const measure = () => {
      if (!wrapperRef.current) return;
      const top = wrapperRef.current.getBoundingClientRect().top;
      setTableHeight(Math.max(200, window.innerHeight - top - 16));
    };
    const timer = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, []);

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
  const [compFlagsModal, setCompFlagsModal] = useState(false);
  const [facilityModal,  setFacilityModal]  = useState(false);
  // Batch 351: one modal for the simple id/name pickers, and the "More filters" section.
  const [optionModal, setOptionModal] = useState<null | 'subspecialtyIds' | 'performingLabIds' | 'locationIds' | 'autopsyJurisdictions'>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cptText, setCptText] = useState('');

  // Active section (for label intensity)
  const [activeSection, setActiveSection] = useState('');

  // ── The draft: every filter the user has set ────────────────────────────
  const [draft, setDraft] = useState<CaseSearchDraft>(() => { const r = defaultRange(); return emptyCaseSearchDraft(r.dateFrom, r.dateTo); });
  const set = (patch: Partial<CaseSearchDraft>) => setDraft(d => ({ ...d, ...patch }));
  const toggleIn = <K extends keyof CaseSearchDraft>(key: K, value: CaseSearchDraft[K] extends Array<infer V> ? V : never) =>
    setDraft(d => ({ ...d, [key]: toggleInList(d[key] as unknown as unknown[], value) }));
  const removeFrom = <K extends keyof CaseSearchDraft>(key: K, keep: (v: CaseSearchDraft[K] extends Array<infer V> ? V : never) => boolean) =>
    setDraft(d => ({ ...d, [key]: (d[key] as unknown as never[]).filter(keep) }));
  const [activeDateRange, setActiveDateRange] = useState<SearchDateShortcut | null>(DEFAULT_SEARCH_DATE_SHORTCUT);

  // Smart identifier box
  const [detectedType, setDetectedType] = useState<IdentifierType>(null);
  // Real, per direct guidance: the union of every Enterprise's enabled
  // identifier formats (useEnabledIdentifierFormats.ts).
  const enabledFormats = useEnabledIdentifierFormats();
  const legacyFormats = deriveLegacyFormats(enabledFormats);

  const handleIdentifierChange = (val: string) => {
    const type = detectIdentifierType(val, enabledFormats);
    setDetectedType(type);
    const result = resolveIdentifierApplication(val, type, enabledFormats, legacyFormats.accessionPattern);
    if (result.action === 'navigate') { navigate(result.path); return; }
    setDraft(d => applyIdentifierToDraft(d, val, result));
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

  const chooseDateShortcut = (shortcut: SearchDateShortcut) => {
    set({ ...shortcutDateRange(shortcut, timeZone), datesChosen: true });
    setActiveDateRange(shortcut);
  };

  // Typed inputs (not part of the draft until added)
  const [specimenQuery,       setSpecimenQuery]       = useState('');
  const [showSpecimenDrop,    setShowSpecimenDrop]    = useState(false);
  const specimenRef = useRef<HTMLDivElement|null>(null);
  const specimenSuggestions = useMemo(
    () => suggestSpecimens(specimenDictionary, specimenQuery, draft.specimenTerms),
    [specimenDictionary, specimenQuery, draft.specimenTerms],
  );

  const [diagnosisText, setDiagnosisText] = useState('');

  const [snomedQuery,       setSnomedQuery]       = useState('');
  const [snomedSuggestions, setSnomedSuggestions] = useState<ClinicalCode[]>([]);
  const [showSnomedDrop,    setShowSnomedDrop]    = useState(false);
  const snomedRef = useRef<HTMLDivElement|null>(null);

  const [icdQuery,       setIcdQuery]       = useState('');
  const [icdSuggestions, setIcdSuggestions] = useState<ClinicalCode[]>([]);
  const [showIcdDrop,    setShowIcdDrop]    = useState(false);
  const icdRef = useRef<HTMLDivElement|null>(null);

  // ── Results: one page from the server ───────────────────────────────────
  const [resultPage,  setResultPage]  = useState<CaseSearchPage | null>(null);
  /** The draft the shown results came from (paging and export use it, not unsaved edits). */
  const [searchedDraft, setSearchedDraft] = useState<CaseSearchDraft | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [sort, setSort] = useState<CaseSearchSort>(DEFAULT_CASE_SEARCH_SORT);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = getUiPreference<number>(PAGE_SIZE_PREFERENCE, DEFAULT_CASE_SEARCH_PAGE_SIZE);
    return (CASE_SEARCH_PAGE_SIZES as readonly number[]).includes(saved) ? saved : DEFAULT_CASE_SEARCH_PAGE_SIZE;
  });
  const [isSearching, setIsSearching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  // Changes on every search, so the table starts fresh (scroll, selection).
  const [searchGeneration, setSearchGeneration] = useState(0);
  const latestRequest = useRef(0);
  const results = resultPage?.items ?? null;

  // Auto-collapses the filter sidebar after a search runs (Sidebar.tsx pattern).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [activeSavedId, setActiveSavedId] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [savedSearchFailed, setSavedSearchFailed] = useState(false);
  const saveInputRef = useRef<HTMLInputElement|null>(null);

  // ── Voice: selected result index ────────────────────────────
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(-1);

  const runSearch = async (opts: { draft?: CaseSearchDraft; page?: number; pageSize?: number; sort?: CaseSearchSort } = {}) => {
    const d = opts.draft ?? draft;
    const size = opts.pageSize ?? pageSize;
    const order = opts.sort ?? sort;
    const requestId = ++latestRequest.current;
    setIsSearching(true); setSearchFailed(false); setHasSearched(true); setExportNotice(null);
    try {
      const res = await caseSearchService.search(buildCaseSearchRequest(d, { page: opts.page ?? 1, pageSize: size, sort: order, timeZone }));
      if (requestId !== latestRequest.current) return; // a newer search has started
      if (res.ok === true) {
        setResultPage(res.data);
        setSearchedDraft(d);
        setSearchGeneration(g => g + 1);
        setSelectedResultIndex(-1);
        saveLastCaseSearch({ draft: d, page: res.data.page, pageSize: size, sort: order });
      } else {
        setSearchFailed(true);
      }
    } catch {
      if (requestId === latestRequest.current) setSearchFailed(true);
    } finally {
      if (requestId === latestRequest.current) setIsSearching(false);
    }
  };

  const loadDraft = (d: CaseSearchDraft) => {
    setDraft(d);
    if (countMoreFilters(d) > 0) setMoreOpen(true);
    setActiveDateRange(matchDateShortcut(d.dateFrom, d.dateTo, timeZone));
    setDetectedType(d.identifierText ? detectIdentifierType(d.identifierText, enabledFormats) : null);
  };

  // ── Effects ─────────────────────────────────────────────────────────────

  // Coming back from a case: the same search, on the same page, fetched again.
  useEffect(() => {
    if (!consumeReturnToSearch()) { clearLastCaseSearch(); return; }
    const last = loadLastCaseSearch();
    if (!last) return;
    const r = defaultRange();
    const d = normalizeCaseSearchDraft(last.draft, r.dateFrom, r.dateTo);
    const order = CASE_SEARCH_SORT_OPTIONS.find(o => o.key === last.sort?.key && o.direction === last.sort?.direction) ?? DEFAULT_CASE_SEARCH_SORT;
    const size = (CASE_SEARCH_PAGE_SIZES as readonly number[]).includes(last.pageSize) ? last.pageSize : pageSize;
    loadDraft(d); setSort(order); setPageSize(size); setSidebarCollapsed(true);
    void runSearch({ draft: d, page: last.page, pageSize: size, sort: order });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    savedSearchService.getForUserByContext(user.id, 'caseSearch').then(res => { if (res.ok === true) setSavedSearches(res.data); });
  }, [user?.id]);

  useEffect(() => { const timer = setTimeout(()=>setIsLoaded(true), 80); return ()=>clearTimeout(timer); }, []);
  useEffect(() => { pushCrumb(t('searchPage.page.title'), '/search'); }, [pushCrumb, t]);

  // Real bug fix (earlier): listen for the global Resources event.
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

  // "Search Cases" is the one deliberate trigger for a query (filter edits
  // don't re-run it), so adjusting several filters costs one query.

  // ── Filter helpers ──────────────────────────────────────────────────────

  const addSpecimen = (val: string) => {
    set({ specimenTerms: addTerm(draft.specimenTerms, val) }); setSpecimenQuery(''); setShowSpecimenDrop(false);
  };
  const addDiagnosis = () => { set({ diagnosisTerms: addTerm(draft.diagnosisTerms, diagnosisText) }); setDiagnosisText(''); };
  const addCpt = () => { set({ cptCodes: addTerm(draft.cptCodes, cptText) }); setCptText(''); };
  const addSnomed = (s: ClinicalCode) => {
    setDraft(d => d.snomedCodes.some(x => x.code === s.code) ? d : { ...d, snomedCodes: [...d.snomedCodes, s] });
    setSnomedQuery(''); setShowSnomedDrop(false);
  };
  const addIcd = (s: ClinicalCode) => {
    setDraft(d => d.icdCodes.some(x => x.code === s.code) ? d : { ...d, icdCodes: [...d.icdCodes, s] });
    setIcdQuery(''); setShowIcdDrop(false);
  };
  const toggleCode = (key: 'snomedCodes' | 'icdCodes', c: ClinicalCode) =>
    setDraft(d => ({ ...d, [key]: d[key].some(x => x.code === c.code) ? d[key].filter(x => x.code !== c.code) : [...d[key], c] }));

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setSidebarCollapsed(true); void runSearch({ page: 1 }); };

  // Paging, sort and page size re-run the search that produced the results.
  const goToPage = (page: number) => { if (searchedDraft) void runSearch({ draft: searchedDraft, page }); };
  const changeSort = (value: string) => {
    const order = CASE_SEARCH_SORT_OPTIONS.find(o => sortOptionKey(o) === value) ?? DEFAULT_CASE_SEARCH_SORT;
    setSort(order);
    if (searchedDraft) void runSearch({ draft: searchedDraft, page: 1, sort: order });
  };
  const changePageSize = (value: string) => {
    const size = Number(value);
    setPageSize(size); setUiPreference(PAGE_SIZE_PREFERENCE, size);
    if (searchedDraft) void runSearch({ draft: searchedDraft, page: 1, pageSize: size });
  };

  const handleClear = () => {
    const r = defaultRange();
    setDraft(emptyCaseSearchDraft(r.dateFrom, r.dateTo));
    setActiveDateRange(DEFAULT_SEARCH_DATE_SHORTCUT);
    setDetectedType(null);
    setDiagnosisText(''); setSpecimenQuery(''); setSnomedQuery(''); setIcdQuery(''); setCptText('');
    setResultPage(null); setSearchedDraft(null); setHasSearched(false); setSearchFailed(false);
    setActiveSavedId(''); setExportNotice(null);
    clearLastCaseSearch();
  };

  // Batch 350: every matching case (not just this page), built by the
  // service; headings, statuses and dates in the user's language.
  const handleExportCSV = async () => {
    if (!searchedDraft) return;
    setIsExporting(true); setExportNotice(null);
    try {
      const res = await caseSearchService.exportRows({ criteria: draftToCriteria(searchedDraft), sort, timeZone });
      if (res.ok === true) {
        downloadCsv(
          caseSearchCsvFilename(facilityDateString(new Date(), timeZone)),
          buildCaseSearchCsv(res.data.rows, { t, locale: i18n.language, timeZone }),
        );
        if (res.data.truncated) setExportNotice(t('searchPage.export.truncated', { count: res.data.rows.length, total: res.data.total }));
      } else {
        setExportNotice(t('searchPage.export.failed'));
      }
    } catch {
      setExportNotice(t('searchPage.export.failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveSearch = async () => {
    const name = saveNameInput.trim();
    if (!name || !user?.id) return;
    setSavedSearchFailed(false);
    const res = await savedSearchService.save({ userId: user.id, name, context: 'caseSearch', filters: draft });
    if (res.ok === true) {
      setSavedSearches(p => [...p, res.data]); setActiveSavedId(res.data.id); setSaveNameInput(''); setShowSaveInput(false);
    } else {
      setSavedSearchFailed(true);
    }
  };

  const handleLoadSearch = (id: string) => {
    const s = savedSearches.find(x => x.id === id); if (!s) return;
    const r = defaultRange();
    const d = normalizeCaseSearchDraft(s.filters, r.dateFrom, r.dateTo);
    loadDraft(d); setActiveSavedId(id); setSidebarCollapsed(true);
    void savedSearchService.recordUse(id);
    void runSearch({ draft: d, page: 1 });
  };

  const handleDeleteSearch = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await savedSearchService.delete(id);
    if (res.ok === true) {
      setSavedSearches(p => p.filter(x => x.id !== id));
      if (activeSavedId === id) setActiveSavedId('');
    } else {
      setSavedSearchFailed(true);
    }
  };

  // Real, per direct guidance (gap #6): ReassignCasePatientPanel for the
  // selected result row; closed whenever the selection or results change.
  const [reassignPanelOpen, setReassignPanelOpen] = useState(false);
  useEffect(() => { setReassignPanelOpen(false); }, [selectedResultIndex, resultPage]);

  // ── Voice: set SEARCH context on mount ─────────────────────────
  useEffect(() => {
    actionRegistryService.setCurrentContext(VOICE_CONTEXT.SEARCH);
    return () => actionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
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
        setCaseOpenedFrom('search');
        navigate(`/case/${resultList[selectedResultIndex].id}/synoptic`);
      }
    };
    const clearSearch = () => { handleClear(); setSelectedResultIndex(-1); };
    const runVoiceSearch = () => { setSidebarCollapsed(true); void runSearch({ page: 1 }); };

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
  }, [results, selectedResultIndex, navigate, draft]);

  // onF/onB update activeSection via the data-section attribute.
  const onF = (e: React.FocusEvent<HTMLInputElement>) => { setActiveSection(e.currentTarget.dataset.section ?? ''); };
  const onB = () => { setActiveSection(''); };

  const activeCount = countDraftFilters(draft);

  const summaryParts = searchedDraft
    ? describeCaseSearch(searchedDraft, {
        pathologist: id => pathologists.find(u => u.id === id)?.name,
        physician:   id => attendings.find(u => u.id === id)?.name,
        facility:    id => facilities.find(u => u.id === id)?.name,
        flag:        flagName,
        template:    id => templates.find(x => x.id === id)?.name,
        subspecialty:  id => subspecialties.find(x => x.id === id)?.name,
        performingLab: id => performingLabs.find(x => x.id === id)?.name,
        location:      id => locations.find(x => x.id === id)?.name,
      }, t, day => formatCalendarDate(day, i18n.language, timeZone))
    : null;
  const range = resultPage ? pageRange(resultPage.page, resultPage.pageSize, resultPage.total) : null;

  const quickLinks = {
    Protocols:  [{ title:'CAP Cancer Protocols', url:'https://www.cap.org/protocols-and-guidelines' }, { title:'WHO Classification', url:'https://www.who.int/publications' }],
    References: [{ title:'PathologyOutlines', url:'https://www.pathologyoutlines.com' }, { title:'UpToDate', url:'https://www.uptodate.com' }],
    Systems:    [{ title: t('searchPage.resourceLinks.hospitalLis'), url:'#' }, { title: t('searchPage.resourceLinks.labManagement'), url:'#' }],
  };

  return (
    <div className={`ps-search-page-root${isLoaded ? ' ps-search-page-root--loaded' : ''}`}>
      <div className="ps-search-shell">

        {/* ── Page header ──────────────────────────────────────────────── */}
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
                  <span onClick={e=>{ void handleDeleteSearch(s.id,e); }} className="ps-searchpage-saved-chip-remove" aria-label={t('searchPage.savedSearch.deleteAria', { name: s.name })}>×</span>
                </button>
              ))}
              {showSaveInput ? (
                <div className="ps-searchpage-save-row">
                  <input ref={saveInputRef} type="text" value={saveNameInput} onChange={e=>setSaveNameInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')void handleSaveSearch();if(e.key==='Escape'){setShowSaveInput(false);setSaveNameInput('');}}}
                    placeholder={t('searchPage.savedSearch.namePlaceholder')} className="ps-searchpage-save-input" />
                  <button type="button" onClick={()=>void handleSaveSearch()} className="ps-searchpage-save-btn">{t('common.save')}</button>
                  <button type="button" onClick={()=>{setShowSaveInput(false);setSaveNameInput('');}} className="ps-searchpage-save-cancel-btn" aria-label={t('common.cancel')}>✕</button>
                </div>
              ) : (
                <button type="button" onClick={()=>setShowSaveInput(true)} className="ps-searchpage-save-new-btn">{t('searchPage.savedSearch.saveNew')}</button>
              )}
              {savedSearchFailed && <span className="ps-searchpage-inline-error" role="alert">{t('searchPage.savedSearch.failed')}</span>}
              {activeCount>0&&<span className="ps-searchpage-active-count-badge">{t('searchPage.filterCount', { count: activeCount })}</span>}
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <main className="ps-search-main">
          <div className="ps-search-row">

          {/* ── Sidebar ────────────────────────────────────────────────── */}
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
                  {/* Batch 351: which date the range applies to. */}
                  <select className="ps-searchpage-basis-select" value={draft.dateBasis} aria-label={t('searchPage.dateBasis.aria')}
                    onChange={e => set({ dateBasis: e.target.value as CaseSearchDateBasis })}>
                    {CASE_SEARCH_DATE_BASES.map(b => <option key={b} value={b}>{t(DATE_BASIS_LABEL_KEY[b])}</option>)}
                  </select>
                  <div className="ps-searchpage-date-shortcuts">
                    {SEARCH_DATE_SHORTCUT_DAYS.map(([shortcut])=>(
                      <button key={shortcut} type="button"
                        onClick={()=>chooseDateShortcut(shortcut)}
                        className={`ps-searchpage-date-shortcut-btn${activeDateRange === shortcut ? ' ps-searchpage-date-shortcut-btn--active' : ''}`}
                      >{t(DATE_SHORTCUT_LABEL_KEY[shortcut])}</button>
                    ))}
                    {/* "All": no date limit. Amber to set it apart; the tooltip
                        warns it can be slow against years of records. */}
                    <button type="button"
                      onClick={()=>chooseDateShortcut('all')}
                      title={t('searchPage.dateShortcuts.allTooltip')}
                      className={`ps-searchpage-date-shortcut-btn ps-searchpage-date-shortcut-btn--all${activeDateRange === 'all' ? ' ps-searchpage-date-shortcut-btn--all-active' : ''}`}
                    >{t('searchPage.dateShortcuts.all')}</button>
                  </div>
                </div>
                <div className="ps-searchpage-date-grid">
                  <div>
                    <div className={`ps-searchpage-date-label${activeSection==='date' ? ' ps-searchpage-date-label--active' : ''}`}>{t('searchPage.dateShortcuts.from')}</div>
                    <input type="date" value={draft.dateFrom} onChange={e=>{set({ dateFrom: e.target.value, datesChosen: true });setActiveDateRange(null);}} onFocus={onF} onBlur={onB} data-section="date" aria-label={t('searchPage.identifierField.dateFromAria')} className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                  </div>
                  <div>
                    <div className={`ps-searchpage-date-label${activeSection==='date' ? ' ps-searchpage-date-label--active' : ''}`}>{t('searchPage.dateShortcuts.to')}</div>
                    <input type="date" value={draft.dateTo} onChange={e=>{set({ dateTo: e.target.value, datesChosen: true });setActiveDateRange(null);}} onFocus={onF} onBlur={onB} data-section="date" aria-label={t('searchPage.identifierField.dateToAria')} className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                  </div>
                </div>
              </div>

              {/* Scrollable filters */}
              <div className="ps-search-filter-scroll">

                {/* Identifier — one smart box */}
                <div onMouseEnter={()=>setActiveSection('id')} onMouseLeave={()=>setActiveSection(s=>s==='id'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.identifier')} active={activeSection==='id'} /></div>
                  <div className="ps-searchpage-rel-wrap">
                    <input
                      data-capture-hide="true"
                      type="text"
                      value={draft.identifierText}
                      onChange={e => handleIdentifierChange(e.target.value)}
                      onFocus={onF} onBlur={onB} data-section="id"
                      className="ps-searchpage-filter-input"
                      placeholder={t('searchPage.identifierField.placeholder')}
                    />
                    {draft.identifierText && (
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
                    {detectedType && draft.identifierText && (
                      <div className="ps-searchpage-identifier-badge" style={{ '--accent': IDENTIFIER_BADGE[detectedType].color } as React.CSSProperties}>
                        {IDENTIFIER_BADGE[detectedType].label}
                      </div>
                    )}
                  </div>
                  {draft.identifierText.trim() && !draft.datesChosen && (
                    <p className="ps-searchpage-identifier-hint">{t('searchPage.identifierField.allDatesHint')}</p>
                  )}
                </div>

                {/* Case type (Batch 351) */}
                <div className="ps-searchpage-section-mb8">
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.caseType')} /></div>
                  <div className="ps-searchpage-pill-row">
                    {CASE_SEARCH_CASE_TYPES.map(x => (
                      <CheckPill key={x} label={t(CASE_TYPE_LABEL_KEY[x])} checked={draft.caseTypes.includes(x)} onChange={()=>toggleIn('caseTypes', x)} />
                    ))}
                  </div>
                </div>


                {/* Patient Demographics */}
                <div
                  onMouseEnter={()=>setActiveSection('demographics')}
                  onMouseLeave={()=>setActiveSection(s=>s==='demographics'?'':s)}
                >
                  <div className="ps-searchpage-section-mb6"><SectionLabel title={t('searchPage.sections.patientDemographics')} active={activeSection==='demographics'} /></div>

                  {/* Sex, as recorded on the patient */}
                  <div className="ps-searchpage-section-mb8">
                    <div className="ps-searchpage-mini-label">{t('searchPage.sections.gender')}</div>
                    <div className="ps-searchpage-pill-row">
                      {CASE_SEARCH_SEX_OPTIONS.map(g => (
                        <CheckPill key={g} label={t(CASE_SEX_LABEL_KEY[g])} checked={draft.sexes.includes(g)} onChange={()=>toggleIn('sexes', g)} />
                      ))}
                    </div>
                  </div>

                  {/* Date of Birth range */}
                  <div className="ps-searchpage-section-mb8">
                    <div className="ps-searchpage-mini-label ps-searchpage-mini-label--soft">{t('searchPage.sections.dateOfBirth')}</div>
                    <div className="ps-searchpage-mini-grid">
                      <div>
                        <div className="ps-searchpage-mini-field-label">{t('searchPage.dateShortcuts.from')}</div>
                        <input type="date" value={draft.dobFrom} onChange={e=>set({ dobFrom: e.target.value })}
                          aria-label={t('searchPage.demographics.dobFromAria')}
                          className="ps-searchpage-filter-input ps-searchpage-filter-input--date ps-searchpage-filter-input--sm" />
                      </div>
                      <div>
                        <div className="ps-searchpage-mini-field-label">{t('searchPage.dateShortcuts.to')}</div>
                        <input type="date" value={draft.dobTo} onChange={e=>set({ dobTo: e.target.value })}
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
                        <input type="number" min={0} max={130} placeholder={t('searchPage.demographics.ageMinPlaceholder')} value={draft.ageMin} onChange={e=>set({ ageMin: e.target.value })}
                          className="ps-searchpage-filter-input" />
                      </div>
                      <div>
                        <div className="ps-searchpage-mini-field-label ps-searchpage-mini-field-label--dim">{t('searchPage.demographics.ageMaxLabel')}</div>
                        <input type="number" min={0} max={130} placeholder={t('searchPage.demographics.ageMaxPlaceholder')} value={draft.ageMax} onChange={e=>set({ ageMax: e.target.value })}
                          className="ps-searchpage-filter-input" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status + Priority — single row */}
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
                    {CASE_SEARCH_STATUS_OPTIONS.map(s=><CheckPill key={s} label={t(CASE_STATUS_LABEL_KEY[s])} checked={draft.statuses.includes(s)} onChange={()=>toggleIn('statuses', s)} accent={CASE_STATUS_HUE[s]} />)}
                    <div className="ps-searchpage-vdivider--stretch" />
                    {CASE_SEARCH_PRIORITY_OPTIONS.map(p=><CheckPill key={p} label={t(CASE_PRIORITY_LABEL_KEY[p])} checked={draft.priorities.includes(p)} onChange={()=>toggleIn('priorities', p)} accent={CASE_PRIORITY_HUE[p]} />)}
                  </div>
                </div>

                {/* ── Browse-button sections: 2-column grid ── */}
                <div className="ps-search-2col">

                {/* Flags */}
                <div onMouseEnter={()=>setActiveSection('flags')} onMouseLeave={()=>setActiveSection(s=>s==='flags'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.flags')} active={activeSection==='flags'} />
                    <BrowseBtn onClick={()=>setFlagsModal(true)} count={draft.caseFlagIds.length||undefined} />
                  </div>
                  {draft.caseFlagIds.length>0&&<div className="ps-searchpage-pill-row">{draft.caseFlagIds.map(id=><Chip key={id} label={flagName(id) ?? id} onRemove={()=>removeFrom('caseFlagIds', x=>x!==id)} />)}</div>}
                </div>

                {/* Synoptic */}
                <div onMouseEnter={()=>setActiveSection('synoptic')} onMouseLeave={()=>setActiveSection(s=>s==='synoptic'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.synopticProtocol')} active={activeSection==='synoptic'} />
                    <BrowseBtn onClick={()=>setSynopticModal(true)} count={draft.synopticTemplateIds.length||undefined} />
                  </div>
                  {draft.synopticTemplateIds.length>0&&<div className="ps-searchpage-pill-row">{draft.synopticTemplateIds.map(id=><Chip key={id} label={templates.find(x=>x.id===id)?.name ?? id} onRemove={()=>removeFrom('synopticTemplateIds', x=>x!==id)} />)}</div>}
                </div>

                {/* Pathologist: anyone on the case (assigned, participant, signed) */}
                <div onMouseEnter={()=>setActiveSection('path')} onMouseLeave={()=>setActiveSection(s=>s==='path'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.pathologist')} active={activeSection==='path'} />
                    <BrowseBtn onClick={()=>setPathModal(true)} count={draft.pathologistIds.length||undefined} />
                  </div>
                  {draft.pathologistIds.length>0&&<div className="ps-searchpage-pill-row">{draft.pathologistIds.map(id=><Chip key={id} label={pathologists.find(x=>x.id===id)?.name ?? id} onRemove={()=>removeFrom('pathologistIds', x=>x!==id)} />)}</div>}
                  {/* Batch 351: how they must be on the case (once someone is chosen). */}
                  {draft.pathologistIds.length>0&&(
                    <select className="ps-searchpage-basis-select ps-searchpage-role-select" value={draft.pathologistRole} aria-label={t('searchPage.pathologistRole.aria')}
                      onChange={e => set({ pathologistRole: e.target.value as CaseSearchPathologistRole })}>
                      {CASE_SEARCH_PATHOLOGIST_ROLES.map(r => <option key={r} value={r}>{t(PATHOLOGIST_ROLE_LABEL_KEY[r])}</option>)}
                    </select>
                  )}
                </div>

                {/* Attending Physician */}
                <div onMouseEnter={()=>setActiveSection('attending')} onMouseLeave={()=>setActiveSection(s=>s==='attending'?'':s)}>
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.attendingPhysician')} active={activeSection==='attending'} />
                    <BrowseBtn onClick={()=>setAttendingModal(true)} count={draft.orderingPhysicianIds.length||undefined} />
                  </div>
                  {draft.orderingPhysicianIds.length>0&&<div className="ps-searchpage-pill-row">{draft.orderingPhysicianIds.map(id=><Chip key={id} label={attendings.find(x=>x.id===id)?.name ?? id} onRemove={()=>removeFrom('orderingPhysicianIds', x=>x!==id)} />)}</div>}
                </div>

                {/* Computational (specimen) flags */}
                <div className="ps-searchpage-section-mb4">
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.compFlags')} active={false} />
                    <BrowseBtn onClick={()=>setCompFlagsModal(true)} count={draft.specimenFlagIds.length||undefined} />
                  </div>
                  {draft.specimenFlagIds.length>0&&<div className="ps-searchpage-pill-row">
                    {draft.specimenFlagIds.map(id=><Chip key={id} label={flagName(id) ?? id} onRemove={()=>removeFrom('specimenFlagIds', x=>x!==id)} accent="#0891b2" />)}
                  </div>}
                </div>

                {/* Submitting facility */}
                <div className="ps-searchpage-section-mb4">
                  <div className="ps-searchpage-header-row">
                    <SectionLabel title={t('searchPage.sections.facility')} active={false} />
                    <BrowseBtn onClick={()=>setFacilityModal(true)} count={draft.submittingFacilityIds.length||undefined} />
                  </div>
                  {draft.submittingFacilityIds.length>0&&<div className="ps-searchpage-pill-row">
                    {draft.submittingFacilityIds.map(id=><Chip key={id} label={facilities.find(c=>c.id===id)?.name??id} onRemove={()=>removeFrom('submittingFacilityIds', x=>x!==id)} accent="#8b5cf6" />)}
                  </div>}
                  {draft.submittingFacilityIds.length>0&&<div className="ps-searchpage-org-hint">{t('searchPage.includesSitesHint')}</div>}
                </div>

                </div>{/* end ps-search-2col */}

                {/* Specimen */}
                <div onMouseEnter={()=>setActiveSection('specimen')} onMouseLeave={()=>setActiveSection(s=>s==='specimen'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.specimen')} active={activeSection==='specimen'} /></div>
                  <div className="ps-searchpage-input-row" ref={specimenRef}>
                    <div className="ps-searchpage-rel-wrap--flex1">
                      <input type="text" value={specimenQuery} onChange={e=>{setSpecimenQuery(e.target.value);setShowSpecimenDrop(true);}} onFocus={onF} onBlur={onB} data-section="specimen" className="ps-searchpage-filter-input" placeholder={t('searchPage.specimenSection.placeholder')}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(specimenQuery.trim())addSpecimen(specimenQuery);}}} />
                      {showSpecimenDrop&&specimenQuery.trim().length>=2&&(
                        <div className={DROPDOWN_CLASS}>
                          {specimenSuggestions.map(s=>(
                            <button key={s} type="button" onClick={()=>addSpecimen(s)} className={DROP_BTN_CLASS}>{s}</button>
                          ))}
                          {!specimenSuggestions.some(s=>s.toLowerCase()===specimenQuery.trim().toLowerCase())&&(
                            <button type="button" onClick={()=>addSpecimen(specimenQuery)} className={`${DROP_BTN_CLASS} ps-searchpage-dropdown-btn--add`}>{t('searchPage.specimenSection.addOption', { query: specimenQuery.trim() })}</button>
                          )}
                        </div>
                      )}
                    </div>
                    <BrowseBtn onClick={()=>setSpecimenModal(true)} count={draft.specimenTerms.length||undefined} />
                  </div>
                  {draft.specimenTerms.length>0&&<div className="ps-searchpage-pill-row--mt4">{draft.specimenTerms.map(s=><Chip key={s} label={s} onRemove={()=>removeFrom('specimenTerms', x=>x!==s)} />)}</div>}
                </div>

                {/* Diagnosis */}
                <div onMouseEnter={()=>setActiveSection('diagnosis')} onMouseLeave={()=>setActiveSection(s=>s==='diagnosis'?'':s)}>
                  <div className="ps-searchpage-section-mb4"><SectionLabel title={t('searchPage.sections.diagnosis')} active={activeSection==='diagnosis'} /></div>
                  <div className="ps-searchpage-input-row">
                    <input type="text" value={diagnosisText} onChange={e=>setDiagnosisText(e.target.value)} onFocus={onF} onBlur={onB} data-section="diagnosis" className="ps-searchpage-filter-input" placeholder={t('searchPage.diagnosisSection.placeholder')}
                      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addDiagnosis();}}} />
                    <button type="button" onClick={addDiagnosis} className="ps-searchpage-add-btn" aria-label={t('searchPage.diagnosisSection.addAria')}>+</button>
                  </div>
                  {draft.diagnosisTerms.length>0&&<div className="ps-searchpage-pill-row--mt4">{draft.diagnosisTerms.map(d=><Chip key={d} label={d} onRemove={()=>removeFrom('diagnosisTerms', x=>x!==d)} />)}</div>}
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
                              <span className="ps-searchpage-dropdown-desc">{s.display}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <BrowseBtn onClick={()=>setSnomedModal(true)} count={draft.snomedCodes.length||undefined} />
                  </div>
                  {draft.snomedCodes.length>0&&(
                    <div className="ps-searchpage-pill-row--mt4">
                      {draft.snomedCodes.map(s=><Chip key={s.code} label={s.code} title={t('searchPage.snomedSection.chipTitle', { display: s.display })} onRemove={()=>removeFrom('snomedCodes', x=>x.code!==s.code)} accent='#8B5CF6' />)}
                    </div>
                  )}
                </div>

                {/* ICD Codes — ICD-10 / ICD-11 / ICD-O */}
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
                              <span className="ps-searchpage-dropdown-desc">{s.display}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <BrowseBtn onClick={()=>setIcdModal(true)} count={draft.icdCodes.length||undefined} />
                  </div>
                  {draft.icdCodes.length>0&&(
                    <div className="ps-searchpage-pill-row--mt4">
                      {draft.icdCodes.map(s=>{
                        const icdAccent = s.system==='ICD-11'?'#F59E0B':s.system?.startsWith('ICD-O')?'#10B981':'#8B5CF6';
                        return <Chip key={`${s.system}-${s.code}`} label={t('searchPage.icdSection.chipLabel', { system: s.system, code: s.code })} title={s.display} onRemove={()=>removeFrom('icdCodes', x=>x.code!==s.code)} accent={icdAccent} />;
                      })}
                    </div>
                  )}
                </div>

                {/* ── More filters (Batch 351) ─────────────────────────────── */}
                <div className="ps-searchpage-more">
                  <button type="button" className="ps-searchpage-more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
                    <span>{moreOpen ? '▾' : '▸'} {t('searchPage.moreFilters.toggle')}</span>
                    {countMoreFilters(draft) > 0 && <span className="ps-searchpage-more-count">{countMoreFilters(draft)}</span>}
                  </button>
                  {moreOpen && (
                    <div className="ps-searchpage-more-body">
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.revisions')}</div>
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_REVISION_TYPES.map(x => <CheckPill key={x} label={t(REVISION_TYPE_LABEL_KEY[x])} checked={draft.revisionTypes.includes(x)} onChange={()=>toggleIn('revisionTypes', x)} accent="#8B5CF6" />)}
                        </div>
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.holds')}</div>
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_HOLD_TYPES.map(x => <CheckPill key={x} label={t(HOLD_TYPE_LABEL_KEY[x])} checked={draft.holdTypes.includes(x)} onChange={()=>toggleIn('holdTypes', x)} accent="#f97316" />)}
                        </div>
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.resultFlag')}</div>
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_RESULT_FLAGS.map(x => <CheckPill key={x} label={t(RESULT_FLAG_LABEL_KEY[x])} checked={draft.resultFlags.includes(x)} onChange={()=>toggleIn('resultFlags', x)} accent={RESULT_FLAG_HUE[x]} />)}
                        </div>
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.pendingWork')}</div>
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_PENDING_WORK.map(x => <CheckPill key={x} label={t(PENDING_WORK_LABEL_KEY[x])} checked={draft.pendingWork.includes(x)} onChange={()=>toggleIn('pendingWork', x)} />)}
                          <CheckPill label={t('searchPage.moreFilters.pastTat')} checked={draft.pastTatTarget} onChange={()=>set({ pastTatTarget: !draft.pastTatTarget })} accent="#ef4444" />
                        </div>
                      </div>
                      <div className="ps-search-2col">
                        {([
                          ['subspecialtyIds', 'searchPage.moreFilters.subspecialty', subspecialties],
                          ['performingLabIds', 'searchPage.moreFilters.performingLab', performingLabs],
                          ['locationIds', 'searchPage.moreFilters.location', locations],
                        ] as const).map(([key, labelKey, options]) => (
                          <div key={key} className="ps-searchpage-section-mb4">
                            <div className="ps-searchpage-header-row">
                              <SectionLabel title={t(labelKey)} />
                              <BrowseBtn onClick={()=>setOptionModal(key)} count={draft[key].length||undefined} />
                            </div>
                            {draft[key].length>0&&<div className="ps-searchpage-pill-row">
                              {draft[key].map(id=><Chip key={id} label={options.find(o=>o.id===id)?.name ?? id} onRemove={()=>removeFrom(key, x=>x!==id)} />)}
                            </div>}
                            {key==='performingLabIds'&&draft[key].length>0&&<div className="ps-searchpage-org-hint">{t('searchPage.includesSitesHint')}</div>}
                          </div>
                        ))}
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.intake')}</div>
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_INTAKES.map(x => <CheckPill key={x} label={t(INTAKE_LABEL_KEY[x])} checked={draft.intakes.includes(x)} onChange={()=>toggleIn('intakes', x)} />)}
                        </div>
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.payer')}</div>
                        <input type="text" value={draft.payer} onChange={e=>set({ payer: e.target.value })} className="ps-searchpage-filter-input" placeholder={t('searchPage.moreFilters.payerPlaceholder')} />
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-mini-label">{t('searchPage.moreFilters.cpt')}</div>
                        <div className="ps-searchpage-input-row">
                          <input type="text" value={cptText} onChange={e=>setCptText(e.target.value)} className="ps-searchpage-filter-input" placeholder={t('searchPage.moreFilters.cptPlaceholder')}
                            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCpt();}}} />
                          <button type="button" onClick={addCpt} className="ps-searchpage-add-btn" aria-label={t('searchPage.moreFilters.cptAddAria')}>+</button>
                        </div>
                        {draft.cptCodes.length>0&&<div className="ps-searchpage-pill-row--mt4">{draft.cptCodes.map(c=><Chip key={c} label={c} onRemove={()=>removeFrom('cptCodes', x=>x!==c)} />)}</div>}
                      </div>
                      <div className="ps-searchpage-more-group">
                        <div className="ps-searchpage-header-row">
                          <SectionLabel title={t('searchPage.moreFilters.autopsy')} />
                          <BrowseBtn onClick={()=>setOptionModal('autopsyJurisdictions')} count={draft.autopsyJurisdictions.length||undefined} />
                        </div>
                        {draft.autopsyJurisdictions.length>0&&<div className="ps-searchpage-pill-row">
                          {draft.autopsyJurisdictions.map(j=><Chip key={j} label={t(`jurisdictionNames.${j}`)} onRemove={()=>removeFrom('autopsyJurisdictions', x=>x!==j)} />)}
                        </div>}
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_AUTOPSY_AUTHORITIES.map(x => <CheckPill key={x} label={t(AUTOPSY_AUTHORITY_LABEL_KEY[x])} checked={draft.autopsyAuthorities.includes(x)} onChange={()=>toggleIn('autopsyAuthorities', x)} />)}
                        </div>
                        <div className="ps-searchpage-pill-row">
                          {CASE_SEARCH_AUTOPSY_REPORTS.map(x => <CheckPill key={x} label={t(AUTOPSY_REPORT_LABEL_KEY[x])} checked={draft.autopsyReports.includes(x)} onChange={()=>toggleIn('autopsyReports', x)} />)}
                        </div>
                      </div>
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

          {/* ── Results pane ───────────────────────────────────────────── */}
          <div data-capture-hide="true" className="ps-search-results-pane">

            {/* Summary bar */}
            <div className="ps-search-summary-bar">
              {summaryParts ? (
                <p className="ps-searchpage-summary-text">
                  {summaryParts.length === 0
                    ? <span className="ps-searchpage-summary-part--first">{t('searchPage.summary.allCases')}</span>
                    : summaryParts.map((part,i,arr)=>(
                        <React.Fragment key={i}>
                          <span className={i===0 ? 'ps-searchpage-summary-part--first' : 'ps-searchpage-summary-part'}>{i===0 ? t('searchPage.summary.prefix') + part : part}</span>
                          {i<arr.length-1&&<span className="ps-searchpage-summary-sep">·</span>}
                        </React.Fragment>
                      ))}
                </p>
              ) : (
                <p className="ps-searchpage-summary-empty">{t('searchPage.summary.empty', { cta: t('searchPage.actions.searchCases') })}</p>
              )}
              <div className="ps-search-summary-actions">
                {resultPage && range && (
                  <span className="ps-searchpage-result-count" aria-live="polite">
                    {resultPage.total === 0
                      ? t('searchPage.summary.noResults')
                      : t('searchPage.summary.rangeOfTotal', { from: range.from, to: range.to, count: resultPage.total })}
                  </span>
                )}
                {resultPage && (
                  <label className="ps-searchpage-sort">
                    <span className="ps-searchpage-sort-label">{t('searchPage.sort.label')}</span>
                    <select className="ps-searchpage-sort-select" value={sortOptionKey(sort)} onChange={e=>changeSort(e.target.value)} disabled={isSearching}>
                      {CASE_SEARCH_SORT_OPTIONS.map(o => (
                        <option key={sortOptionKey(o)} value={sortOptionKey(o)}>{t(CASE_SEARCH_SORT_LABEL_KEY[sortOptionKey(o)])}</option>
                      ))}
                    </select>
                  </label>
                )}
                {resultPage && resultPage.total>0 && (
                  <button
                    type="button"
                    onClick={()=>void handleExportCSV()}
                    disabled={isExporting}
                    className="ps-searchpage-export-btn"
                  >{isExporting ? t('searchPage.export.exporting') : t('searchPage.summary.exportCsv')}</button>
                )}
                {/* Real, per direct guidance (gap #6): only when a result row is selected. */}
                {selectedResultIndex>=0 && results?.[selectedResultIndex] && (
                  <button
                    type="button"
                    onClick={() => setReassignPanelOpen(true)}
                    className="ps-searchpage-export-btn"
                  >{t('searchPage.summary.reassignPatient')}</button>
                )}
              </div>
            </div>
            {exportNotice && <p className="ps-searchpage-notice" role="status">{exportNotice}</p>}
            {searchFailed && <p className="ps-searchpage-notice ps-searchpage-notice--error" role="alert">{t('searchPage.summary.searchFailed')}</p>}

            {reassignPanelOpen && selectedResultIndex>=0 && results?.[selectedResultIndex] && (
              <ReassignCasePatientPanel
                caseData={results[selectedResultIndex]}
                onClose={() => setReassignPanelOpen(false)}
                onReassigned={() => {
                  setReassignPanelOpen(false);
                  if (searchedDraft && resultPage) void runSearch({ draft: searchedDraft, page: resultPage.page });
                }}
              />
            )}

            {/* Result table — WorklistTable owns its own internal scroll. It
                keeps the server's order (preserveOrder): paging and sorting
                are done by the search service. */}
            <div ref={wrapperRef} className="ps-search-table-wrap">
              {hasSearched
                ? <WorklistTable key={searchGeneration} cases={results??[]} activeFilter="all" selectedIndex={selectedResultIndex} onRowSelect={setSelectedResultIndex} navSource="search" preserveOrder tableHeight={tableHeight} forceCardView flagDefinitions={flagDefinitions} />
                : <div className="ps-searchpage-no-search">{t('searchPage.summary.noSearchYet')}</div>
              }
            </div>
            {resultPage && resultPage.pageCount > 1 && (
              <nav className="ps-searchpage-pager" aria-label={t('searchPage.pager.aria')}>
                <button type="button" className="ps-searchpage-pager-btn" onClick={()=>goToPage(1)} disabled={isSearching || resultPage.page <= 1}>{t('searchPage.pager.first')}</button>
                <button type="button" className="ps-searchpage-pager-btn" onClick={()=>goToPage(resultPage.page - 1)} disabled={isSearching || resultPage.page <= 1}>{t('searchPage.pager.previous')}</button>
                <span className="ps-searchpage-pager-status">{t('searchPage.pager.pageOf', { page: resultPage.page, pageCount: resultPage.pageCount })}</span>
                <button type="button" className="ps-searchpage-pager-btn" onClick={()=>goToPage(resultPage.page + 1)} disabled={isSearching || resultPage.page >= resultPage.pageCount}>{t('searchPage.pager.next')}</button>
                <button type="button" className="ps-searchpage-pager-btn" onClick={()=>goToPage(resultPage.pageCount)} disabled={isSearching || resultPage.page >= resultPage.pageCount}>{t('searchPage.pager.last')}</button>
              </nav>
            )}
            {resultPage && resultPage.total > 0 && (
              <div className="ps-searchpage-pagesize">
                <label>
                  <span className="ps-searchpage-sort-label">{t('searchPage.pager.perPage')}</span>
                  <select className="ps-searchpage-sort-select" value={pageSize} onChange={e=>changePageSize(e.target.value)} disabled={isSearching}>
                    {CASE_SEARCH_PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
          </div>{/* end inner flex row */}
        </main>
      </div>

      {/* ── Lookup modals ────────────────────────────────────────────────── */}

      {specimenModal&&(
        <LookupModal
          title={t('searchPage.lookupModals.specimenTitle')}
          subtitle={t('searchPage.lookupModals.specimenSubtitle', { count: specimenDictionary.filter(s=>s.active).length, types: [...new Set(specimenDictionary.map(s=>s.type))].length })}
          selectedCount={draft.specimenTerms.length}
          onClose={()=>setSpecimenModal(false)}
        >
          <SpecimenLookupContent
            specimens={specimenDictionary}
            selected={draft.specimenTerms}
            onToggle={name => toggleIn('specimenTerms', name)}
          />
        </LookupModal>
      )}

      {snomedModal&&(
        <LookupModal
          title={t('searchPage.lookupModals.snomedTitle')}
          subtitle={t('searchPage.lookupModals.snomedSubtitle', { count: SNOMED_AXIS_META.length, axes: SNOMED_AXIS_META.map(m=>t(m.labelKey)).join(', ') })}
          selectedCount={draft.snomedCodes.length}
          onClose={()=>setSnomedModal(false)}
        >
          <SnomedModalContent selected={draft.snomedCodes} onToggle={c=>toggleCode('snomedCodes', c)} />
        </LookupModal>
      )}

      {icdModal&&(
        <LookupModal
          title={t('searchPage.lookupModals.icdTitle')}
          subtitle={t('searchPage.lookupModals.icdSubtitle')}
          selectedCount={draft.icdCodes.length}
          onClose={()=>setIcdModal(false)}
        >
          <IcdModalContent
            selected={draft.icdCodes}
            onToggle={c=>toggleCode('icdCodes', c)}
            icd10Active={config.terminologyConfig.icd10.active}
            icd11Active={config.terminologyConfig.icd11.active}
            icdoActive={config.terminologyConfig.icdo.active}
          />
        </LookupModal>
      )}

      {synopticModal&&(
        <LookupModal title={t('searchPage.lookupModals.synopticTitle')} subtitle={t('searchPage.lookupModals.synopticSubtitle', { count: templates.length, categories: new Set(templates.map(s=>s.category)).size })} selectedCount={draft.synopticTemplateIds.length} onClose={()=>setSynopticModal(false)}>
          <SynopticLookupContent templates={templates} selected={draft.synopticTemplateIds} onToggle={id=>toggleIn('synopticTemplateIds', id)} />
        </LookupModal>
      )}

      {flagsModal&&(
        <LookupModal title={t('searchPage.lookupModals.flagsTitle')} subtitle={t('searchPage.lookupModals.flagsSubtitle', { count: caseFlagOptions.length })} selectedCount={draft.caseFlagIds.length} onClose={()=>setFlagsModal(false)}>
          <FlagsLookupContent flags={caseFlagOptions} selected={draft.caseFlagIds} onToggle={id=>toggleIn('caseFlagIds', id)} />
        </LookupModal>
      )}

      {pathModal&&(
        <LookupModal title={t('searchPage.lookupModals.pathologistTitle')} subtitle={t('searchPage.lookupModals.pathologistSubtitle')} selectedCount={draft.pathologistIds.length} onClose={()=>setPathModal(false)}>
          <UserLookupContent users={pathologists} selected={draft.pathologistIds} onToggle={id=>toggleIn('pathologistIds', id)} />
        </LookupModal>
      )}

      {attendingModal&&(
        <LookupModal title={t('searchPage.lookupModals.attendingTitle')} subtitle={t('searchPage.lookupModals.attendingSubtitle')} selectedCount={draft.orderingPhysicianIds.length} onClose={()=>setAttendingModal(false)}>
          <UserLookupContent users={attendings} selected={draft.orderingPhysicianIds} onToggle={id=>toggleIn('orderingPhysicianIds', id)} accent="#10B981" />
        </LookupModal>
      )}

      {/* Facility browse modal */}
      {facilityModal && (
        <LookupModalX
          title={t('searchPage.lookupModals.facilityTitle')}
          subtitle={t('searchPage.lookupModals.facilitySubtitle')}
          selectedCount={draft.submittingFacilityIds.length}
          onClose={() => setFacilityModal(false)}
          onClear={() => set({ submittingFacilityIds: [] })}
          onDone={() => setFacilityModal(false)}
        >
          <FacilityLookupContent facilities={facilities} selected={draft.submittingFacilityIds} onToggle={id => toggleIn('submittingFacilityIds', id)} />
        </LookupModalX>
      )}

      {/* Batch 351: subspecialty, performing lab, location and autopsy jurisdiction pickers */}
      {optionModal && (
        <LookupModalX
          title={t(`searchPage.lookupModals.option.${optionModal}`)}
          subtitle={t('searchPage.lookupModals.optionSubtitle')}
          selectedCount={draft[optionModal].length}
          onClose={() => setOptionModal(null)}
          onClear={() => set({ [optionModal]: [] } as Partial<CaseSearchDraft>)}
          onDone={() => setOptionModal(null)}
        >
          <FacilityLookupContent
            facilities={{ subspecialtyIds: subspecialties, performingLabIds: performingLabs, locationIds: locations, autopsyJurisdictions: jurisdictions }[optionModal]}
            selected={draft[optionModal]}
            onToggle={id => toggleIn(optionModal, id)}
            placeholder={t('searchPage.lookupModals.optionSearch')}
            showIds={false}
          />
        </LookupModalX>
      )}

      {/* Computational (specimen) flags browse modal */}
      {compFlagsModal && (
        <LookupModalX
          title={t('searchPage.lookupModals.compFlagsTitle')}
          subtitle={t('searchPage.lookupModals.compFlagsSubtitle')}
          selectedCount={draft.specimenFlagIds.length}
          onClose={() => setCompFlagsModal(false)}
          onClear={() => set({ specimenFlagIds: [] })}
          onDone={() => setCompFlagsModal(false)}
        >
          <CompFlagsLookupContent flags={specimenFlagOptions} selected={draft.specimenFlagIds} onToggle={id => toggleIn('specimenFlagIds', id)} />
        </LookupModalX>
      )}

      {/* ── Resources modal ──────────────────────────────────────────────── */}
      {isResourcesOpen&&(
        <div className="ps-modal-overlay" onClick={()=>setIsResourcesOpen(false)}>
          <div className="ps-searchpage-resources-modal" onClick={e=>e.stopPropagation()}>
            <div className="ps-searchpage-modal-title ps-searchpage-modal-title--resources">{t('searchPage.resourcesModal.title')}</div>
            {Object.entries(quickLinks).map(([section,links])=>(
              <div key={section} className="ps-searchpage-resource-section">
                <div className="ps-searchpage-resource-section-label">{t(RESOURCE_SECTION_LABEL_KEY[section] ?? section)}</div>
                {links.map((link,i)=>(
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" onClick={()=>setIsResourcesOpen(false)}
                    className="ps-searchpage-resource-link">{t('searchPage.resourcesModal.linkLabel', { title: link.title })}</a>
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
