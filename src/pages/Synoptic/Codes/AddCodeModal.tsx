// src/pages/Synoptic/Codes/AddCodeModal.tsx
// Navy design system — matches FlagManagerModal.
// Live terminology search via NLM API (codeSearchService).
// Left panel: applied codes per case/specimen with strikethrough/undo.
// Right panel: system tabs + hierarchy filters + live search.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { callAi } from '@/services/aiIntegration/aiProviderService';
import { resolveAiConfigOverrideForClient } from '@/components/Config/AI/resolveClientAiModel';
import '../../../pathscribe.css';
import type { MedicalCode } from '../synopticTypes';
import { searchCodes, filterToVerifiedCodes, type CodeResult, type SnomedFilter } from '../../../services/terminologySearch/codeSearchService';
import { getOrganisationByHospitalId, type CodingSystem } from '@/services/organisation/organisationService';
import { CODE_MAP_TABLE, resolveSpecimenDictionaryBaseCptCode } from '@/services/billing/codeMapTable';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpecimenOption { index: number; id: number; specimenId?: string | null; name: string; specimenDictionaryEntryId?: string; complexity?: 'GROSS_ONLY' | 'GROSS_AND_MICRO'; }

export interface AiCodeSuggestion {
  code: string;
  display: string;
  system: string;
  confidence: number;
  rationale: string;
  rvu?: number | null;
}

export interface AddCodeModalProps {
  existingCodes: MedicalCode[];
  allSpecimens: SpecimenOption[];
  /** Real feature, per direct feedback: the Specimen Dictionary already
   *  has a real, coder-entered "Default Base CPT Code" per specimen
   *  type - a genuinely verified value, not a guess. When available
   *  for the currently-targeted specimen's own type, this is shown as
   *  a real, high-confidence default rather than relying on the AI's
   *  own narrative-text estimate for something a real coder has
   *  already, deliberately determined. */
  specimenDictionary?: { id: string; defaultBaseCptCode?: string }[];
  activeSpecimenIndex?: number;  // reserved for future per-specimen default targeting
  /** Real fix: which coding-system tab to open on - e.g. 'CPT' when
   *  launched from a specimen's own "+Code" contextual button, so the
   *  user lands directly where they meant to go rather than needing to
   *  switch tabs manually. Defaults to 'SNOMED', preserving existing
   *  behavior for every other caller. */
  initialSystem?: CodeSystem;
  onAddToSpecimens: (codes: Omit<MedicalCode, 'id' | 'source'>[], specimenIndices: number[]) => Promise<void>;
  onClose: () => void;
  originHospitalId?: string;
  /** Optional — if provided, enables AI code suggestions */
  caseText?: { gross: string; microscopic: string; ancillary: string };
  synopticAnswers?: Record<string, string | string[]>;
  templateName?: string;
  /** Tier 1: codes pre-derived from CAP template option metadata */
  synopticDerivedCodes?: AiCodeSuggestion[];
  /** Whether Orchestrator/narrative mode is active */
  narrativeText?: string;
  /** The case's ordering facility — needed to resolve which AI model this
   *  specific facility is actually approved to use for AI code
   *  suggestions. Optional so callers without a resolvable facility
   *  still fall back safely to the org-wide default. */
  facilityId?: string;
  /** Real, per direct requirement: "the Pathologist has the right to
   *  update all billing, even those that are deterministic ... LIS
   *  will handle the billing in assist mode" alongside a real,
   *  separate follow-up ("can we still keep RVU... useful to track
   *  Pathologist performance"). A CPT code added here in orchestration
   *  mode is a real billing decision; in assist mode it's honestly
   *  relabeled as RVU/productivity tracking only - never hidden
   *  entirely, since contributionDashboardCalculations.ts genuinely
   *  prefers a specimen's own real, applied CPT code over its generic
   *  fallback estimate. Optional, defaulting to false (assist-style
   *  labeling) so no existing caller needs to change to keep working -
   *  a real caller should pass this explicitly rather than rely on
   *  the default. */
  isOrchestrationMode?: boolean;
}

type CodeSystem = 'SNOMED' | 'ICD10' | 'ICD11' | 'LOINC' | 'ICDO' | 'CPT' | 'OPCS4';

export interface PendingCode {
  /** Real, per direct feedback ("if an IHC interp was done on 4
   *  slides, they have to enter the code 4 times?"): a stable,
   *  per-instance identifier - the old code+specimenIndex matching
   *  throughout this file couldn't tell two real, separate instances
   *  of the same code apart, so deleting/moving/restoring "one" of
   *  them actually affected every instance at once. */
  id: string;
  code: string;
  display: string;
  system: string;
  specimenIndex: number | null;
  pendingDelete: boolean;
}

/**
 * Real, per direct guidance: "if the code exists already it is
 * flagged so the Pathologist knows it has been applied. From there
 * the Pathologist can assign the code to a different case specimen or
 * maybe they want it at the case level." Finds every real, active
 * (non-pending-delete) application of this exact code to a target
 * OTHER than the one currently selected — the real, cross-target
 * awareness this app's own existing "applied to THIS target" check
 * never had. Extracted as its own, pure, testable function since the
 * same real logic is needed in both the search-results list and the
 * AI-suggestions panel.
 */
export function findAppliedElsewhere(applied: PendingCode[], code: string, currentTarget: number | null): PendingCode[] {
  return applied.filter(c => c.code === code && c.specimenIndex !== currentTarget && !c.pendingDelete);
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Full registry of all supported coding systems
// Visibility per site is controlled by organisationService.Site.codingSystems
const ALL_SYSTEMS: { id: CodeSystem; label: string; accent: string }[] = [
  { id: 'SNOMED', label: 'SNOMED CT', accent: '#0891B2' },
  { id: 'ICD10',  label: 'ICD-10',   accent: '#7c3aed' },
  { id: 'ICD11',  label: 'ICD-11',   accent: '#0369a1' },
  { id: 'LOINC',  label: 'LOINC',    accent: '#0f766e' },
  { id: 'ICDO',   label: 'ICD-O',    accent: '#b45309' },
  { id: 'CPT',    label: 'CPT',      accent: '#7c3aed' },
  { id: 'OPCS4',  label: 'OPCS-4',   accent: '#0891B2' },
];

const SNOMED_FILTERS: { id: SnomedFilter; label: string; hint: string }[] = [
  { id: 'all',       label: 'All',        hint: 'All SNOMED concepts' },
  { id: 'morphology',label: 'Morphology', hint: 'Diagnoses & structural changes' },
  { id: 'anatomy',   label: 'Anatomy',    hint: 'Body structures & sites' },
  { id: 'specimen',  label: 'Specimen',   hint: 'Specimen types' },
  { id: 'organism',  label: 'Organism',   hint: 'Infectious agents' },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcoCode = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 6l-3 2 3 2M11 6l3 2-3 2M9 4l-2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoCase = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);

const IcoSpec = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="8" cy="8" r="2" fill="currentColor"/>
  </svg>
);

const IcoSearch = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IcoTrash = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoUndo = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M3 7V3L1 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 3C3 3 5 1 8 1C11.866 1 15 4.134 15 8C15 11.866 11.866 15 8 15C4.134 15 1 11.866 1 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const AddCodeModal: React.FC<AddCodeModalProps> = ({
  existingCodes, allSpecimens, specimenDictionary = [], onAddToSpecimens, onClose,
  caseText, synopticAnswers, templateName, synopticDerivedCodes, narrativeText,
  originHospitalId, activeSpecimenIndex, initialSystem, facilityId, isOrchestrationMode = false,
}) => {
  // ── Site coding config ────────────────────────────────────────────────────
  // Coding systems shown are driven by site config from organisationService.
  // This replaces any hardcoded locale/country checks.
  // When backend is ready: replace with useSessionSiteConfig() hook.
  const siteOrg = React.useMemo(() => {
    return getOrganisationByHospitalId(originHospitalId ?? 'HOSP-001');
  }, [originHospitalId]);
  const siteCodingSystems = React.useMemo<CodingSystem[]>(() => {
    const systems = siteOrg?.sites?.[0]?.codingSystems;
    return systems?.length ? systems : ['SNOMED', 'ICD10', 'ICD11', 'LOINC', 'ICDO', 'CPT'] as CodingSystem[];
  }, [siteOrg]);
  const SYSTEMS = ALL_SYSTEMS.filter(s => siteCodingSystems.includes(s.id) && !(s.id === 'CPT' && isOrchestrationMode));
  const isUK = siteOrg?.sites?.[0]?.defaultLocale === 'en-GB';

  const [system,       setSystem]       = useState<CodeSystem>(initialSystem ?? 'SNOMED');
  const [snomedFilter, setSnomedFilter] = useState<SnomedFilter>('morphology');
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState<CodeResult[]>([]);
  const [searchError,  setSearchError]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [focused,      setFocused]      = useState(-1);
  const [target,       setTarget]       = useState<number | null>(activeSpecimenIndex ?? null);
  const [applied,      setApplied]      = useState<PendingCode[]>(() => {
    const fromExisting = existingCodes
      // Guards against malformed entries with an empty/missing code --
      // these were rendering as blank rows (grabber + trash icon, no
      // visible text) with no indication anything was wrong. Filtering
      // here means they're excluded from the very first render, and
      // since handleSave's diff logic works entirely off this `applied`
      // array (not existingCodes directly), any of these already sitting
      // in the real backend data get silently dropped the next time this
      // case's codes are saved for any reason -- no separate cleanup
      // migration needed.
      .filter(c => !!c.code)
      .map((c, idx) => {
        // Resolve specimenId back to specimenIndex so left panel groups correctly
        const specOption = (c as any).specimenId
          ? allSpecimens.find(s => s.specimenId === (c as any).specimenId)
          : null;
        return {
          id:            `existing-${idx}-${c.code}-${c.system}`,
          code:          c.code,
          display:       c.display,
          system:        c.system,
          specimenIndex: specOption ? specOption.index : null,
          pendingDelete: false,
        };
      });
    // Real fix, per direct clarification: "something that defaults from
    // maintenance/configuration doesn't need to be verified, it should
    // automatically get applied." A Specimen Dictionary default base
    // CPT code is a real, deliberate, prior coder determination, not a
    // guess - matches how AccessionPage.tsx already auto-populates
    // this same field right at specimen creation. This is the same
    // real default, applied here too, for any specimen that doesn't
    // already have a CPT code - backfills cases created before a
    // dictionary default existed, or where the dictionary was updated
    // after the specimen was already accessioned. Scoped to Assist
    // mode only - orchestration mode's own real rule engine already
    // resolves this far more precisely from structured stain data.
    const autoDefaults: PendingCode[] = !isOrchestrationMode
      ? allSpecimens
        .filter(sp => !fromExisting.some(c => c.specimenIndex === sp.index && c.system === 'CPT'))
        .map(sp => {
          const defaultCode = sp.specimenDictionaryEntryId
            ? resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: sp.specimenDictionaryEntryId, complexity: sp.complexity }, specimenDictionary)
            : null;
          if (!defaultCode) return null;
          const entry = CODE_MAP_TABLE.find(e => e.code === defaultCode);
          return {
            id: `dictionary-default-${sp.index}-${defaultCode}`,
            code: defaultCode,
            display: entry?.description ?? defaultCode,
            system: 'CPT',
            specimenIndex: sp.index,
            pendingDelete: false,
          };
        })
        .filter((c): c is PendingCode => c !== null)
      : [];
    if (autoDefaults.length > 0) setTimeout(() => setIsDirty(true), 0);
    return [...fromExisting, ...autoDefaults];
  });
  const [isDirty, setIsDirty] = useState(false);
  const [aiSuggestions,    setAiSuggestions]    = useState<AiCodeSuggestion[]>([]);
  const [aiLoading,        setAiLoading]        = useState(false);
  const [aiError,          setAiError]          = useState<string | null>(null);
  const [aiRan,            setAiRan]            = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);

  // Real fix, found via direct feedback: "should just show the
  // recommended codes based on the selected pill." The AI suggestion
  // list previously showed every real suggestion across every coding
  // system at once (SNOMED, ICD-10, ICD-O, LOINC all mixed together),
  // regardless of which system tab was actually active - this is the
  // real, shared filter both the panel's own count and its list use,
  // so they can never drift out of sync with each other.
  // Real fix, per direct feedback: "I couldn't add it to two
  // specimens." The old check only compared code+system against
  // existingCodes - a code already saved for ONE specimen made the
  // suggestion disappear for every specimen, not just that one, since
  // the check never looked at which real specimen the existing code
  // actually belonged to. Resolves the currently-selected target
  // (an index) to its real specimenId once, then only treats a
  // suggestion as "already applied" when an existing code genuinely
  // matches this exact target - a different specimen, or the case
  // level, no longer hides it.
  const targetSpecimenId = target !== null ? (allSpecimens.find(s => s.index === target)?.specimenId ?? null) : null;

  const visibleSuggestions = React.useMemo(() => (
    aiSuggestions
      .filter((s, i, a) => a.findIndex(x => x.code === s.code) === i)
      .filter(s => !existingCodes.some(ec => ec.code === s.code && ec.system === s.system && ((ec as any).specimenId ?? null) === targetSpecimenId))
      .filter(s => s.system === system)
  ), [aiSuggestions, existingCodes, system, targetSpecimenId]);


  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [dragCode,     setDragCode]     = useState<PendingCode | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | null | 'none'>('none'); // null=case, number=spec, 'none'=not dragging
  const [contextMenu,  setContextMenu]  = useState<{ entry: PendingCode; x: number; y: number } | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const sysInfo = SYSTEMS.find(s => s.id === system) ?? SYSTEMS[0];

  // ── Live search with debounce ─────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Real fix: CPT is a small, curated table (services/billing/), not
    // a large live search like every other system here - an empty
    // query still searches, showing the real, active table's full list
    // as a default view (Pete's "top/frequent codes" default) rather
    // than requiring a keystroke first. Every other system keeps the
    // original "require a real query" behavior - correct for a live
    // NLM search that could otherwise return thousands of results.
    if (!query.trim() && system !== 'CPT') { setResults([]); setLoading(false); return; }

    setLoading(true);
    setSearchError(null);
    debounceRef.current = setTimeout(async () => {
      const filter = system === 'SNOMED' ? snomedFilter : 'all';
      try {
        const data = await searchCodes(system, query, filter);
        setResults(data);
      } catch (err: any) {
        // Real fix, per direct feedback: a failed search (missing API
        // key, network error, CORS) previously looked identical to a
        // genuine "no matches" result. Distinct state here so the UI
        // can tell the person their search backend is unavailable,
        // not that the term itself has no matches.
        setResults([]);
        setSearchError(err?.message ?? 'Search failed — please try again.');
      }
      setLoading(false);
      setFocused(-1);
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, system, snomedFilter]);

  // ── Applied code helpers ──────────────────────────────────────────────────

  const caseApplied           = applied.filter(c => c.specimenIndex === null);
  const activeCaseApplied     = caseApplied.filter(c => !c.pendingDelete);
  const specimenApplied       = (idx: number) => applied.filter(c => c.specimenIndex === idx);
  const activeSpecimenApplied = (idx: number) => specimenApplied(idx).filter(c => !c.pendingDelete);
  const totalActive           = applied.filter(c => !c.pendingDelete).length;

  // ── Add / remove / undo ───────────────────────────────────────────────────

  const addCode = useCallback((r: CodeResult) => {
    // Real fix, per direct feedback: "if an IHC interp was done on 4
    // slides, they have to enter the code 4 times?" - the old logic
    // hard-blocked re-adding an already-active code, silently
    // undercounting a real, repeated procedure with no error or
    // feedback at all. If a pending-delete instance of this exact
    // code exists, restore that one first (matches the original
    // "oops, didn't mean to remove that" intent behind this branch);
    // otherwise, always add a new, genuinely separate instance - a
    // real, repeatable procedure needs a real, separate count, not a
    // single toggle.
    const pendingDeleteInstance = applied.find(c => c.code === r.code && c.specimenIndex === target && c.pendingDelete);
    if (pendingDeleteInstance) {
      setApplied(prev => prev.map(c =>
        c.id === pendingDeleteInstance.id ? { ...c, pendingDelete: false } : c
      ));
    } else {
      setApplied(prev => [...prev, {
        id: `new-${r.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        code: r.code, display: r.display, system: r.system,
        specimenIndex: target, pendingDelete: false,
      }]);
    }
    setIsDirty(true);
  }, [applied, target]);

  const removeCode = useCallback((id: string) => {
    setApplied(prev => prev.map(c =>
      c.id === id ? { ...c, pendingDelete: true } : c
    ));
    setIsDirty(true);
  }, []);

  const undoRemove = useCallback((id: string) => {
    setApplied(prev => prev.map(c =>
      c.id === id ? { ...c, pendingDelete: false } : c
    ));
    setIsDirty(true);
  }, []);

  // Move a code from one specimen/case to another
  const moveCode = useCallback((entry: PendingCode, toSpecimenIndex: number | null) => {
    if (entry.specimenIndex === toSpecimenIndex) return; // already there
    setApplied(prev => prev.map(c =>
      c.id === entry.id
        ? { ...c, specimenIndex: toSpecimenIndex, pendingDelete: false }
        : c
    ));
    setIsDirty(true);
    setContextMenu(null);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  // ── AI Code Generation ───────────────────────────────────────────────────
  const generateAiCodes = useCallback(async () => {
    if (!caseText) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const answersText = synopticAnswers
        ? Object.entries(synopticAnswers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\n')
        : 'No synoptic answers available';

      const { text: raw } = await callAi({
        system: isUK
          ? 'You are a pathology coding specialist with expertise in NHS surgical pathology coding — SNOMED CT, ICD-10, ICD-O, and OPCS-4. Return only valid JSON — no markdown, no preamble.'
          : 'You are a pathology coding specialist with expertise in ICD-10, SNOMED CT, and ICD-O diagnostic coding. Return only valid JSON — no markdown, no preamble.',
        prompt: isUK
          ? `Suggest appropriate medical codes for this NHS pathology case. Include diagnostic codes and OPCS-4 procedure codes.

TEMPLATE: ${templateName ?? 'Unknown'}
${narrativeText ? `NARRATIVE REPORT (primary source):\n${narrativeText}\n\nSUPPORTING:` : ''}
GROSS: ${caseText.gross}
MICROSCOPIC: ${caseText.microscopic}
ANCILLARY: ${caseText.ancillary}
SYNOPTIC ANSWERS:
${answersText}

Return a JSON array covering:

DIAGNOSTIC CODES (ICD-10, SNOMED CT, ICD-O):
- Primary diagnosis ICD-10 code (UK 5th edition)
- SNOMED CT morphology code (UK SNOMED release)
- ICD-O topography and morphology codes if applicable

PROCEDURE CODES (OPCS-4):
- Primary surgical pathology procedure code
- Additional procedures if applicable (IHC, molecular)

Format:
[
  {
    "code": "C20",
    "display": "Malignant neoplasm of rectum",
    "system": "ICD10",
    "confidence": 95,
    "rationale": "Rectal adenocarcinoma primary diagnosis",
    "rvu": null
  },
  {
    "code": "Y76.8",
    "display": "Examination of specimen from rectum",
    "system": "OPCS4",
    "confidence": 92,
    "rationale": "Histological examination of resection specimen",
    "rvu": null
  }
]

Rules:
- system must be one of: ICD10, SNOMED, ICDO, LOINC, OPCS4
- Do NOT include CPT codes — not used in NHS
- confidence 0-100, rationale ≤12 words
- Return 4-8 codes total — MUST include at least one SNOMED morphology code`
          : `Suggest appropriate diagnostic codes for this pathology case.

TEMPLATE: ${templateName ?? 'Unknown'}
${narrativeText ? `NARRATIVE REPORT (primary source):
${narrativeText}

SUPPORTING:` : ''}
GROSS: ${caseText.gross}
MICROSCOPIC: ${caseText.microscopic}
ANCILLARY: ${caseText.ancillary}
SYNOPTIC ANSWERS:
${answersText}

Return a JSON array covering:

DIAGNOSTIC CODES (ICD-10, SNOMED CT, ICD-O):
- Primary diagnosis ICD-10 code
- SNOMED CT morphology code
- ICD-O topography and morphology codes if applicable
${!isOrchestrationMode ? `
SPECIMEN-LEVEL BILLING CODE (RVU ESTIMATE ONLY — Assist mode):
- This case is in Assist mode: your LIS owns real billing, this is
  read-only, internal RVU/productivity tracking - never a real charge.
- Pick at most ONE code from this exact, real, verified list, based
  on the overall complexity of the gross/microscopic work described -
  never invent a code outside this list:
${CODE_MAP_TABLE.filter(e => e.level === 'specimen').map(e => `  - ${e.code}: ${e.description}`).join('\n')}
- Do NOT suggest ancillary/stain-level codes (special stains, IHC) -
  those need an exact stain count this prompt cannot reliably judge
  from narrative text alone, and are already handled by this app's
  own real, structured rule engine in orchestration mode.
- Mark confidence honestly lower for this one (it's a rough estimate,
  not a precision determination) and say so in rationale.
` : ''}
Format:
[
  {
    "code": "C50.412",
    "display": "Malignant neoplasm of upper-outer quadrant of left female breast",
    "system": "ICD10",
    "confidence": 95,
    "rationale": "Left breast invasive carcinoma upper outer quadrant",
    "rvu": null
  }${!isOrchestrationMode ? `,
  {
    "code": "88305",
    "display": "Code 88305 — Specimen Level",
    "system": "CPT",
    "confidence": 65,
    "rationale": "Estimate only - moderate complexity specimen, Assist mode",
    "rvu": null
  }` : ''}
]

Rules:
- system must be one of: ICD10, SNOMED, ICDO, LOINC${!isOrchestrationMode ? ', CPT' : ''}
${isOrchestrationMode ? '- Do NOT include CPT codes — surgical pathology level, special stain, and IHC billing codes are resolved by this app\'s own real, verified rule engine from structured stain data, not guessed from narrative text' : '- At most ONE CPT code, only from the real, verified list above, only for the specimen-level base code - never a stain-level ancillary code'}
- confidence 0-100
- rationale ≤12 words
- rvu: always null - this prompt no longer suggests billable procedure codes
- Return 4-8 codes total — MUST include at least one SNOMED morphology code
- SNOMED morphology example: {"code":"413448000","display":"Invasive carcinoma of breast, no special type","system":"SNOMED","confidence":95,"rationale":"Primary diagnosis morphology","rvu":null}
- Only include codes you are highly confident are correct`,
        maxTokens: 1200,
        configOverride: await resolveAiConfigOverrideForClient(facilityId),
      });

      const clean = raw.replace(/```json|```/g, '').trim();
      // Real fix, per direct report: a raw JSON.parse error message
      // ("Unexpected non-whitespace character after JSON...") was
      // surfacing straight to the user - the LLM had added trailing
      // content after the real JSON array that the markdown-fence
      // strip above didn't catch. Extracting the array by its
      // outermost [ ] rather than trusting the whole cleaned string
      // is pure JSON survives that regardless of what the extra
      // content actually was.
      const arrayStart = clean.indexOf('[');
      const arrayEnd = clean.lastIndexOf(']');
      if (arrayStart === -1 || arrayEnd === -1 || arrayEnd < arrayStart) {
        throw new Error('AI response did not contain a recognizable code list — please try again.');
      }
      const parsed: AiCodeSuggestion[] = JSON.parse(clean.slice(arrayStart, arrayEnd + 1));
      // Real, defensive filter, per direct requirement: CPT is no
      // longer part of what this prompt asks for (see the prompt's own
      // header comment on this whole function for why), but an LLM
      // doesn't always perfectly follow an instruction - explicitly
      // dropping any CPT suggestion here too, rather than relying on
      // the prompt change alone, since a wrong CPT guess with a false
      // sense of confidence is a real billing risk, not just noise.
      const specimenLevelCptCodes = new Set(CODE_MAP_TABLE.filter(e => e.level === 'specimen').map(e => e.code));
      let cptSeen = false;
      const filtered = Array.isArray(parsed)
        ? parsed.filter(s => {
            if (!siteCodingSystems.includes(s.system as CodeSystem)) return false;
            if (s.system !== 'CPT') return true;
            // Real fix: CPT suggestions are only ever real here in
            // Assist mode (see the prompt's own conditional block
            // above) - defensively re-verify even then, since the
            // model is only asked, not guaranteed, to stay inside the
            // real, verified specimen-level list this app actually
            // knows about. A wrong or hallucinated code showing up
            // with a confident-looking percentage is the real risk
            // this guards against, not just noise to filter later.
            if (isOrchestrationMode || cptSeen || !specimenLevelCptCodes.has(s.code)) return false;
            cptSeen = true;
            return true;
          })
        : [];
      // Real, per direct guidance: "before any suggestion is [shown],
      // verify that code actually exists and is a real code. Machine
      // verified. Then the Practitioner makes the medical decision to
      // use or not use that code" — applies to every real system this
      // modal presents (SNOMED, ICD-10, ICD-11, ICD-O, LOINC — CPT
      // already got its own, separate re-verification just above,
      // short-circuited to true inside filterToVerifiedCodes rather
      // than checked twice). A hallucinated code is dropped here,
      // silently, before the practitioner ever sees it as an option —
      // their own review still decides whether a genuinely-real code
      // is the medically right one for this case, exactly as before.
      const verified = await filterToVerifiedCodes(filtered);
      setAiSuggestions(verified);
      setAiRan(true);
    } catch (e: any) {
      setAiError(e?.message ?? 'AI suggestion failed');
    } finally {
      setAiLoading(false);
    }
  }, [caseText, synopticAnswers, templateName, isUK, narrativeText, siteCodingSystems, isOrchestrationMode]);

  // Auto-run on open — after generateAiCodes is defined
  // Tier 1: use pre-derived synoptic codes immediately
  // Tier 2/3: auto-call AI so codes are ready when modal opens
  React.useEffect(() => {
    if (synopticDerivedCodes?.length) {
      setAiSuggestions(synopticDerivedCodes);
      setAiRan(true);
    } else if (caseText && !aiRan) {
      // Auto-run AI once on open — aiRan guard prevents re-running on re-render
      generateAiCodes();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    // Include codes that are new OR have been moved to a different specimen
    const toAdd = applied.filter(c => {
      if (c.pendingDelete) return false;
      const original = existingCodes.find(e => e.code === c.code && e.system === c.system);
      if (!original) return true; // new code
      // Check if specimenId changed — if so, it's a move and needs saving
      const originalSpecId = (original as any).specimenId ?? null;
      const newSpecOption  = c.specimenIndex !== null
        ? allSpecimens.find(s => s.index === c.specimenIndex)
        : null;
      const newSpecId = newSpecOption ? (newSpecOption as any).specimenId ?? String(newSpecOption.id) : null;
      return originalSpecId !== newSpecId; // moved
    });
    // Build complete resolved code list — source of truth for the parent
    const allActiveCodes = applied
      .filter(c => !c.pendingDelete)
      .map(c => {
        const sp = c.specimenIndex !== null
          ? allSpecimens.find(s => s.index === c.specimenIndex)
          : null;
        return {
          code:       c.code,
          display:    c.display,
          system:     c.system as MedicalCode['system'],
          specimenId: sp ? ((sp as any).specimenId ?? String(sp.id)) : null,
        };
      });

    const hasDeletions = applied.some(c => c.pendingDelete);
    if (toAdd.length > 0 || hasDeletions) {
      const specimenIndices = [...new Set(toAdd.map(c => c.specimenIndex ?? 0))];
      // Previously fired onAddToSpecimens and closed the modal
      // immediately afterward regardless of whether the save actually
      // succeeded -- the parent's real persist call only had a
      // console.error on failure, invisible in normal use. Now the
      // modal genuinely waits: closes only on confirmed success, shows
      // a real error and stays open (so nothing looks "saved" when it
      // wasn't) on failure. Also fixes saving never being reset to
      // false, which previously left the button stuck disabled.
      try {
        await onAddToSpecimens(allActiveCodes, specimenIndices);
        onClose();
      } catch (err: any) {
        setSaveError(err?.message ?? 'Failed to save — please try again.');
      } finally {
        setSaving(false);
      }
    } else {
      setSaving(false);
      onClose();
    }
  }, [applied, existingCodes, allSpecimens, onAddToSpecimens, onClose]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  // Real fix, found ahead of a live demo: selecting a code in this
  // modal only updates the local, staged `applied` list - real
  // persistence to specimen.coding.cpt only happens via the separate
  // Save button below (see handleSave). All three ways to leave this
  // modal (X button, Cancel, Escape) previously called onClose
  // directly with zero check for unsaved changes, so a code that felt
  // "added" the moment it was clicked could be silently discarded if
  // the modal was closed before Save - exactly what happened when a
  // base code was picked here but never showed up as applied anywhere
  // else in the app.
  const handleCloseAttempt = () => {
    if (isDirty && !window.confirm('You have unsaved code changes. Discard them and close without saving?')) {
      return;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' && focused >= 0 && results[focused]) addCode(results[focused]);
    if (e.key === 'Escape') handleCloseAttempt();
  };

  // ── Pending counts for footer ─────────────────────────────────────────────

  const toAddCount    = applied.filter(c => !c.pendingDelete && !existingCodes.some(e => e.code === c.code)).length;
  const toRemoveCount = applied.filter(c => c.pendingDelete).length;

  // ── CodeChip — draggable + right-click context menu ──────────────────────

  // Grabber icon SVG
  const IcoGrab = () => (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="acd-drag-handle">
      <circle cx="3" cy="2.5" r="1.2" fill="currentColor"/>
      <circle cx="7" cy="2.5" r="1.2" fill="currentColor"/>
      <circle cx="3" cy="7"   r="1.2" fill="currentColor"/>
      <circle cx="7" cy="7"   r="1.2" fill="currentColor"/>
      <circle cx="3" cy="11.5" r="1.2" fill="currentColor"/>
      <circle cx="7" cy="11.5" r="1.2" fill="currentColor"/>
    </svg>
  );

  const CodeChip: React.FC<{ entry: PendingCode }> = ({ entry }) => {
    const [hovered, setHovered] = React.useState(false);
    return (
      <div
        className={`fm-flag-chip${entry.pendingDelete ? ' deleted' : ''}`}
        draggable={!entry.pendingDelete}
        onDragStart={e => {
          setDragCode(entry);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => { setDragCode(null); setDragOverTarget('none'); }}
        onContextMenu={e => {
          e.preventDefault();
          if (!entry.pendingDelete) setContextMenu({ entry, x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor:     entry.pendingDelete ? 'default' : 'grab',
          background: hovered && !entry.pendingDelete ? 'rgba(56,189,248,0.08)' : undefined,
          borderColor: hovered && !entry.pendingDelete ? 'rgba(56,189,248,0.3)' : undefined,
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        {/* Grabber — only shown when not deleted */}
        {!entry.pendingDelete && (
          <span className="acd-icon-wrap">
            <IcoGrab />
          </span>
        )}
        <span className={`fm-flag-chip-name${entry.pendingDelete ? ' strikethrough' : ''}`}>
          <span className="acd-code-mono" title={`${entry.code} — ${entry.display}`}>{entry.code}</span>
          {entry.display}
        </span>
        {entry.pendingDelete ? (
          <button className="fm-chip-undo-btn" onClick={() => undoRemove(entry.id)} title="Undo removal">
            <IcoUndo />
          </button>
        ) : (
          <button className="fm-chip-remove-btn" onClick={() => removeCode(entry.id)} title="Remove code">
            <IcoTrash />
          </button>
        )}
      </div>
    );
  };

  // Real feature, per direct feedback ("if an IHC interp was done on 4
  // slides, they have to enter the code 4 times?" / "use the same
  // display approach ... used in the Billing review pane"): when the
  // same real code has more than one genuine instance for this
  // specimen (e.g. a real, repeated ancillary procedure), shows them
  // as one compact row - the description once, then each instance's
  // code comma-separated with its own "code — definition" tooltip,
  // matching BillingReviewPanel.tsx's own stain/block row treatment
  // exactly, rather than N redundant, full-size chips each repeating
  // the same description text. A single instance (the common case)
  // still renders as the existing, full CodeChip - drag-and-drop and
  // the right-click context menu stay exactly as they were.
  const GroupedCodeRow: React.FC<{ entries: PendingCode[] }> = ({ entries }) => {
    const first = entries[0];
    return (
      <div className="fm-flag-chip" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{first.display}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          {entries.map((entry, i) => (
            <span key={entry.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span style={{ color: '#64748b' }}>,</span>}
              <span
                className={`acd-code-mono${entry.pendingDelete ? ' strikethrough' : ''}`}
                title={`${entry.code} — ${entry.display}`}
              >
                {entry.code}
              </span>
              {entry.pendingDelete ? (
                <button className="fm-chip-undo-btn" onClick={() => undoRemove(entry.id)} title="Undo removal">
                  <IcoUndo />
                </button>
              ) : (
                <button className="fm-chip-remove-btn" onClick={() => removeCode(entry.id)} title="Remove this instance">
                  <IcoTrash />
                </button>
              )}
            </span>
          ))}
        </span>
      </div>
    );
  };

  // Groups a specimen's (or the case level's) own applied entries by
  // real code value, preserving first-seen order - a group of one
  // renders as the existing, full CodeChip; a group of several
  // renders compactly via GroupedCodeRow above.
  const renderAppliedGroups = (entries: PendingCode[]) => {
    const order: string[] = [];
    const groups = new Map<string, PendingCode[]>();
    entries.forEach(e => {
      if (!groups.has(e.code)) { groups.set(e.code, []); order.push(e.code); }
      groups.get(e.code)!.push(e);
    });
    return order.map(code => {
      const group = groups.get(code)!;
      return group.length > 1
        ? <GroupedCodeRow key={code} entries={group} />
        : <CodeChip key={group[0].id} entry={group[0]} />;
    });
  };

  // ── Drop target wrapper ───────────────────────────────────────────────────

  const DropZone: React.FC<{ specimenIndex: number | null; children: React.ReactNode }> = ({ specimenIndex, children }) => {
    const isOver = dragCode !== null && dragOverTarget === specimenIndex;
    const isSame = dragCode?.specimenIndex === specimenIndex;
    return (
      <div
        onDragOver={e => { e.preventDefault(); if (!isSame) setDragOverTarget(specimenIndex); }}
        onDragLeave={() => setDragOverTarget('none')}
        onDrop={e => {
          e.preventDefault();
          if (dragCode && !isSame) moveCode(dragCode, specimenIndex);
          setDragOverTarget('none');
        }}
        style={{
          borderRadius: 8,
          border: isOver && !isSame ? '1.5px dashed #38bdf8' : '1.5px solid transparent',
          background: isOver && !isSame ? 'rgba(8,145,178,0.08)' : 'transparent',
          transition: 'all 0.12s',
          padding: '2px 0',
          marginBottom: 4,
        }}
      >
        {children}
      </div>
    );
  };

  // ── Context menu ──────────────────────────────────────────────────────────

  const ContextMenu = contextMenu ? (
    <div
      onClick={() => setContextMenu(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 9000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: Math.min(contextMenu.x, window.innerWidth - 220),
          top:  Math.min(contextMenu.y, window.innerHeight - 200),
          width: 210,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          zIndex: 9001,
        }}
      >
        <div className="acd-ctx-menu-label">
          Move to
        </div>

        {/* Case Level */}
        {contextMenu.entry.specimenIndex !== null && (
          <button
            onClick={() => moveCode(contextMenu.entry, null)}
            className="acd-ctx-menu-btn"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IcoCase />
            Case Level
          </button>
        )}

        {/* Specimens */}
        {allSpecimens
          .filter(sp => sp.index !== contextMenu.entry.specimenIndex)
          .map(sp => (
            <button
              key={sp.index}
              onClick={() => moveCode(contextMenu.entry, sp.index)}
              className="acd-ctx-menu-btn"
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <IcoSpec />
              <span className="acd-sp-label">
                <span className="acd-sp-label-prefix">Sp {sp.id}:</span> {sp.name}
              </span>
            </button>
          ))
        }
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-research-modal fm-modal acd-modal-inner" onClick={e => e.stopPropagation()}>

        {/* ── HEADER ── */}
        <div className="ps-research-header">
          <div>
            <div className="fm-eyebrow">Code Manager</div>
            <div className="fm-title-row">
              <IcoCode />
              <h2 className="fm-title">Codes</h2>
              {totalActive > 0 && (
                <span className="fm-active-badge">{totalActive} active</span>
              )}
            </div>
          </div>
          <button className="acd-close-btn" aria-label="Close" onClick={handleCloseAttempt}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >✕</button>
        </div>

        <div className="acd-body">

          {/* ── LEFT PANEL ── */}
          <div className="fm-left-panel acd-left">
            <div className="acd-left-title">Applied Codes</div>
            {dragCode && (
              <div className="acd-left-hint">
                Drop on a target to move · Right-click for menu
              </div>
            )}

            {/* Case level */}
            <DropZone specimenIndex={null}>
              <button
                className={`fm-target-row${target === null ? ' active' : ''}`}
                onClick={() => setTarget(null)}
              >
                <IcoCase />
                <span className="acd-case-label-flex">Case Level</span>
                {activeCaseApplied.length > 0 && (
                  <span className="fm-count-badge">{activeCaseApplied.length}</span>
                )}
              </button>
              {renderAppliedGroups(caseApplied)}
              {caseApplied.length === 0 && (
                <div className="fm-no-flags-note">No case-level codes</div>
              )}
            </DropZone>

            <div className="fm-divider" />

            {/* Specimens */}
            {allSpecimens.map(sp => {
              const spApplied   = specimenApplied(sp.index);
              const activeCount = activeSpecimenApplied(sp.index).length;
              return (
                <DropZone key={sp.index} specimenIndex={sp.index}>
                  <button
                    className={`fm-target-row${target === sp.index ? ' active' : ''}`}
                    onClick={() => setTarget(sp.index)}
                  >
                    <IcoSpec />
                    <span className="acd-sp-row-label">
                      <span className="acd-sp-label-prefix">Sp {sp.id}:</span>{'  '}{sp.name}
                    </span>
                    {activeCount > 0 && (
                      <span className="fm-count-badge">{activeCount}</span>
                    )}
                  </button>
                  {renderAppliedGroups(spApplied)}
                  {spApplied.length === 0 && (
                    <div className="fm-no-flags-note">No codes applied — drag here or click row to add</div>
                  )}
                </DropZone>
              );
            })}
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="fm-right-panel acd-right">

            {/* AI Suggest button */}
            {caseText && (
              <div className="acd-ai-header-row">
                <button
                  onClick={generateAiCodes}
                  disabled={aiLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: '1.5px solid rgba(8,145,178,0.5)',
                    background: aiLoading ? 'rgba(8,145,178,0.08)' : 'rgba(8,145,178,0.15)',
                    color: aiLoading ? '#64748b' : '#38bdf8',
                    cursor: aiLoading ? 'wait' : 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <span className="acd-ai-sparkle">✦</span>
                  {aiLoading ? 'AI thinking…'
                    : aiRan && synopticDerivedCodes?.length ? '↻ Re-run (Synoptic)'
                    : aiRan && narrativeText ? '↻ Re-run (Narrative)'
                    : aiRan ? '↻ Re-run AI Suggestions'
                    : narrativeText ? '✦ AI Suggest (Narrative)'
                    : '✦ AI Suggest Codes'}
                </button>
                {aiError && <span className="acd-ai-error">⚠ {aiError}</span>}
              </div>
            )}

            {/* AI Suggestions panel */}
            {aiSuggestions.length > 0 && (
              <div className="acd-ai-panel">
                <div
                  onClick={() => setAiPanelCollapsed(c => !c)}
                  className="acd-ai-panel-header"
                >
                  <span>✦</span>
                  <span className="acd-ai-panel-label">AI Suggested Codes — review and apply</span>
                  <span className="acd-ai-panel-count">
                    {visibleSuggestions.length} suggestions
                  </span>
                  <span style={{ fontSize: 14, transition: 'transform 0.2s', transform: aiPanelCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                </div>
                {!aiPanelCollapsed && visibleSuggestions
                  .map((sug) => {
                  const activeCount = applied.filter(c => c.code === sug.code && c.specimenIndex === target && !c.pendingDelete).length;
                  // Real, per direct guidance — same real fix as the
                  // search results list above: a suggestion for a code
                  // already applied to a DIFFERENT specimen previously
                  // showed as if entirely fresh here too.
                  const elsewhere = activeCount === 0
                    ? findAppliedElsewhere(applied, sug.code, target)
                    : [];
                  return (
                    <div
                      key={sug.code}
                      onClick={() => elsewhere.length === 0 && addCode({ code: sug.code, display: sug.display, system: sug.system })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', cursor: 'pointer',
                        background: activeCount > 0 ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = activeCount > 0 ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)')}
                    >
                      <span className="acd-code-badge">
                        {sug.code}
                      </span>
                      <span className="acd-system-badge">
                        {sug.system}
                      </span>
                      {sug.system === 'CPT' && (
                        <span
                          style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}
                          title="Rough RVU estimate only, not a precision billing determination — your LIS owns real billing for this case"
                        >
                          Estimate
                        </span>
                      )}
                      <span style={{ flex: 1, fontSize: 13, color: activeCount > 0 ? '#64748b' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sug.display}
                      </span>
                      <span style={{ fontSize: 12, color: sug.confidence >= 85 ? '#34d399' : '#fbbf24', fontWeight: 700, flexShrink: 0 }}>
                        {sug.confidence}%
                      </span>
                      {sug.rvu != null && (
                        <span className="acd-already-added">
                          {sug.rvu} RVU
                        </span>
                      )}
                      {activeCount > 0 ? (
                        <span className="acd-added-check" title={`Applied ${activeCount}× — click to add another instance`}>✓ ×{activeCount}</span>
                      ) : elsewhere.length > 0 ? (
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#fbbf24' }}
                          title={`Already applied to: ${elsewhere.map(e => e.specimenIndex === null ? 'Case' : (allSpecimens.find(s => s.index === e.specimenIndex)?.name ?? 'another specimen')).join(', ')}`}
                        >
                          Elsewhere
                          <button
                            className="ps-conf-btn-row"
                            onClick={(e) => { e.stopPropagation(); moveCode(elsewhere[0], target); }}
                          >
                            Move here
                          </button>
                        </span>
                      ) : (
                        <span className="acd-add-btn" title="Apply code"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/><line x1="19" y1="3" x2="19" y2="9"/><line x1="16" y1="6" x2="22" y2="6"/></svg></span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* System tabs */}
            <div className="acd-filter-row">
              {SYSTEMS.map(s => (
                <button key={s.id} onClick={() => { setSystem(s.id); setQuery(''); setFocused(-1); inputRef.current?.focus(); }}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: system === s.id ? s.accent : 'rgba(255,255,255,0.06)',
                    color: system === s.id ? 'white' : '#94a3b8',
                  }}
                >{s.id === 'CPT' ? (isOrchestrationMode ? 'Billing Code' : 'CPT (RVU)') : s.label}</button>
              ))}
            </div>

            {/* Hierarchy filters — SNOMED only */}
            {system === 'SNOMED' && (
              <div className="acd-filter-row">
                {SNOMED_FILTERS.map(f => (
                  <button key={f.id} onClick={() => setSnomedFilter(f.id)} title={f.hint}
                    style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${snomedFilter === f.id ? '#0891B2' : 'rgba(100,116,139,0.4)'}`,
                      background: snomedFilter === f.id ? 'rgba(8,145,178,0.15)' : 'transparent',
                      color: snomedFilter === f.id ? '#38bdf8' : '#64748b',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >{f.label}</button>
                ))}
              </div>
            )}

            {/* Target indicator */}
            <div className="acd-hint-text">
              Applying to:{' '}
              <strong className="acd-hint-strong">
                {target === null ? 'Case Level' : `Specimen ${allSpecimens.find(s => s.index === target)?.id ?? target + 1}`}
              </strong>
              <span className="acd-hint-muted">— click a row on the left to change</span>
            </div>

            {/* Real, honest note, per direct requirement: "the
                Pathologist has the right to update all billing, even
                those that are deterministic ... LIS will handle the
                billing in assist mode" alongside the real, separate
                follow-up on keeping RVU tracking useful. Only shown on
                the CPT tab, only in assist mode - never hidden, since
                the code itself still needs to be added for RVU
                tracking to work, just honestly labeled as not a real
                charge here. */}
            {system === 'CPT' && !isOrchestrationMode && (
              <div className="acd-hint-text" style={{ color: '#fbbf24', marginTop: -4, marginBottom: 8 }}>
                ⓘ Assist mode: this records a CPT code for RVU/productivity tracking only — your LIS owns real billing for this case.
              </div>
            )}

            {/* Search */}
            <div className="fm-search-wrap acd-search-mb">
              <span className="fm-search-icon"><IcoSearch /></span>
              <input
                ref={inputRef}
                autoFocus
                className="fm-search-input"
                value={query}
                onChange={e => { setQuery(e.target.value); setFocused(-1); }}
                onKeyDown={handleKeyDown}
                placeholder={`Search ${sysInfo.label} — code or term…`}
              />
              {query && (
                <button className="fm-search-clear" onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}>✕</button>
              )}
            </div>

            {/* Results */}
            <div className="acd-list-scroll">
              {loading ? (
                <div className="fm-empty">
                  <div className="fm-empty-hint">Searching {sysInfo.label}…</div>
                </div>
              ) : !query.trim() ? (
                <div className="fm-empty">
                  <IcoSearch />
                  <div className="fm-empty-heading">Search {sysInfo.label}</div>
                  <div className="fm-empty-hint">
                    {system === 'SNOMED' ? 'Type a diagnosis, site, specimen type, or organism' :
                     system === 'ICD10'  ? 'Type a code (e.g. C50) or description' :
                     system === 'LOINC'  ? 'Type a test name or LOINC number' :
                     system === 'ICD11'  ? 'ICD-11 requires backend proxy — coming soon' :
                     'ICD-O search requires backend proxy — coming soon'}
                  </div>
                </div>
              ) : searchError ? (
                <div className="fm-empty">
                  <IcoSearch />
                  <div className="fm-empty-heading" style={{ color: '#f59e0b' }}>Search unavailable</div>
                  <div className="fm-empty-hint">{searchError}</div>
                </div>
              ) : results.length === 0 ? (
                <div className="fm-empty">
                  <IcoSearch />
                  <div className="fm-empty-heading">No results for "{query}"</div>
                  <div className="fm-empty-hint">Try a different term or switch filters</div>
                </div>
              ) : results.map((r, i) => {
                const activeCount = applied.filter(c => c.code === r.code && c.specimenIndex === target && !c.pendingDelete).length;
                // Real, per direct guidance: "if the code exists
                // already it is flagged so the Pathologist knows it
                // has been applied. From there the Pathologist can
                // assign the code to a different case specimen or
                // maybe they want it at the case level." The existing
                // activeCount check above only ever looked at the
                // CURRENTLY-selected target — a code applied to a
                // different specimen showed as if it had never been
                // applied at all anywhere on the case. This surfaces
                // that real, cross-target state and reuses the
                // already-existing, already-working moveCode() (the
                // same real reassignment this app's own drag-and-drop
                // already performs) rather than building a second,
                // separate reassignment mechanism.
                const elsewhere = activeCount === 0
                  ? findAppliedElsewhere(applied, r.code, target)
                  : [];
                const isFocus  = focused === i;
                return (
                  <div
                    key={r.code}
                    className={`fm-flag-card${activeCount > 0 ? ' applied' : ''}`}
                    style={{ background: isFocus && activeCount === 0 ? 'rgba(255,255,255,0.05)' : undefined }}
                    onMouseEnter={() => setFocused(i)}
                    onClick={() => elsewhere.length === 0 && addCode(r)}
                  >
                    <span className={`fm-code-chip${activeCount > 0 ? ' applied' : ''}`} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {r.code}
                    </span>
                    <span style={{ fontSize: 13, color: activeCount > 0 ? '#64748b' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.display}
                    </span>
                    {activeCount > 0 ? (
                      <span className="acd-added-text" title={`Applied ${activeCount}× — click to add another instance`}>✓ Applied ×{activeCount}</span>
                    ) : elsewhere.length > 0 ? (
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#fbbf24' }}
                        title={`Already applied to: ${elsewhere.map(e => e.specimenIndex === null ? 'Case' : (allSpecimens.find(s => s.index === e.specimenIndex)?.name ?? 'another specimen')).join(', ')}`}
                      >
                        Applied elsewhere
                        <button
                          className="ps-conf-btn-row"
                          onClick={(e) => { e.stopPropagation(); moveCode(elsewhere[0], target); }}
                        >
                          Move here
                        </button>
                      </span>
                    ) : (
                      <span className="fm-apply-btn acd-apply-btn-right" title="Apply code"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/><line x1="19" y1="3" x2="19" y2="9"/><line x1="16" y1="6" x2="22" y2="6"/></svg></span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CONTEXT MENU ── */}
        {ContextMenu}

        {/* ── FOOTER ── */}
        <div className="fm-footer">
          <span className={`fm-footer-status${isDirty ? ' dirty' : ''}`} style={saveError ? { color: '#f87171' } : undefined}>
            {saveError
              ? saveError
              : isDirty
              ? `${toAddCount > 0 ? `${toAddCount} to add` : ''}${toAddCount > 0 && toRemoveCount > 0 ? ' · ' : ''}${toRemoveCount > 0 ? `${toRemoveCount} to remove` : ''}`
              : 'No changes'
            }
          </span>
          <div className="acd-footer-row">
            <button className="fm-btn-cancel" onClick={handleCloseAttempt}>Cancel</button>
            <button
              className="fm-btn-save"
              disabled={saving || !isDirty}
              onClick={handleSave}
              style={{ opacity: saving || !isDirty ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddCodeModal;
