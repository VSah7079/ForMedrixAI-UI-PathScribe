// src/services/terminologySearch/codeSearchService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Terminology search abstraction.
// All endpoint URLs are centralised in terminologyConfig.ts.
//
// NLM Clinical Tables API response format (all endpoints):
//   data[0] = total match count
//   data[1] = array of primary codes     e.g. ["C50.412", "C50.911"]
//   data[2] = code system info (ignore)
//   data[3] = array of display arrays    e.g. [["C50.412","Malignant..."], ...]
//
// Key params:
//   sf = search fields  (which fields NLM searches against)
//   df = display fields (which fields NLM returns in data[3])
//   rec_type = SNOMED concept type filter
// ─────────────────────────────────────────────────────────────────────────────

import { TERMINOLOGY_CONFIG } from '../../components/Config/Terminology/terminologyConfig';

export interface CodeResult {
  code:       string;
  display:    string;
  system:     string;
  hierarchy?: string;
}

const NLM_BASE = TERMINOLOGY_CONFIG.nlm.baseUrl;

export type SnomedFilter = 'all' | 'morphology' | 'anatomy' | 'specimen' | 'organism';

// ─── SNOMED CT ────────────────────────────────────────────────────────────────
// Endpoint: UTS REST API (uts-ws.nlm.nih.gov) — NLM Clinical Tables SNOMED
// endpoint has been retired and returns 404 for all queries.
// UTS 'approximate' search type gives the best substring/partial word matching.

// Real fix, found via direct feedback and a live 401 trace: this
// previously called uts-ws.nlm.nih.gov directly from the browser,
// which the real, external UTS service blocks via CORS - confirmed
// live, not assumed. A correct, server-side proxy already exists for
// exactly this (vite.config.ts's own '/api/terminology/umls' route,
// which injects the real API key server-side from env.UMLS_API_KEY -
// no VITE_ prefix, deliberately never exposed to the browser) - this
// search code just never used it. Routing through it here instead.
const UTS_SEARCH = '/api/terminology/umls/search/current';

const SNOMED_FILTER_KEYWORDS: Record<SnomedFilter, string[]> = {
  all:        [],
  morphology: ['carcinoma','adenocarcinoma','sarcoma','lymphoma','melanoma','neoplasm','dysplasia','adenoma','in situ','tumour','tumor','hyperplasia','metaplasia','invasion'],
  anatomy:    ['structure','region','area','wall','lobe','node','duct','gland','tissue','tract','junction','zone'],
  specimen:   ['specimen','biopsy','resection','excision','aspirate','curettage','washings'],
  organism:   ['bacterium','virus','fungus','organism','parasite'],
};

async function searchSnomed(
  query: string,
  filter: SnomedFilter = 'all',
  maxResults = 20
): Promise<CodeResult[]> {
  if (!query.trim()) return [];
  const q = query.trim();
  try {
    const params = new URLSearchParams({
      string:       q,
      searchType:   'rightTruncation',
      sabs:         'SNOMEDCT_US',
      returnIdType: 'code',
      pageSize:     String(maxResults),
    });

    const res = await fetch(`${UTS_SEARCH}?${params}`);
    if (!res.ok) throw new Error(`UTS SNOMED ${res.status}`);
    const data = await res.json();

    const results: any[] = data?.result?.results ?? [];

    let mapped: CodeResult[] = results
      .filter(r => r.ui && r.ui !== 'NONE' && r.rootSource === 'SNOMEDCT_US')
      .map(r => ({
        code:    r.ui,
        display: r.name,
        system:  'SNOMED',
      }));

    // Apply filter client-side via keyword matching
    const keywords = SNOMED_FILTER_KEYWORDS[filter];
    if (keywords.length > 0) {
      const filtered = mapped.filter(r =>
        keywords.some(kw => r.display.toLowerCase().includes(kw))
      );
      if (filtered.length > 0) mapped = filtered;
    }

    return mapped;
  } catch (err) {
    console.warn('[codeSearchService] SNOMED search failed:', err);
    // Real fix, per direct feedback: "I searched for Breast and it
    // didn't find any codes which surprised me." A failed request
    // (missing/misconfigured API key, network error, CORS) looked
    // identical to a real, genuine "no matches" result - both
    // silently returned []. Re-throwing here lets the real caller
    // show a distinct "search unavailable" message instead of
    // implying the term itself has no matches, which was actively
    // misleading for a term as common as "Breast."
    throw new Error(`SNOMED search is currently unavailable — ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

// ─── ICD-10-CM ────────────────────────────────────────────────────────────────
// Endpoint: /icd10cm/v3/search
// data[1] = codes, data[3] = [[code, name], ...] when df=code,name
// Note: Non-US variants (ICD-10-AM, ICD-10 WHO) require backend proxy.

async function searchIcd10(query: string, maxResults = 20): Promise<CodeResult[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({
      terms:   query,
      maxList: String(maxResults),
      sf:      'code,name',
      df:      'code,name',
    });
    const res = await fetch(`${NLM_BASE}${TERMINOLOGY_CONFIG.nlm.endpoints.icd10}?${params}`);
    if (!res.ok) throw new Error(`NLM ICD-10 ${res.status}`);
    const data = await res.json();

    const codes:    string[]  = data[1] ?? [];
    const extraArr: any[][]   = data[3] ?? [];

    return codes.map((code, i) => ({
      code,
      display: extraArr[i]?.[1] ?? extraArr[i]?.[0] ?? code,
      system:  'ICD10',
    }));
  } catch (err) {
    console.warn('[codeSearchService] ICD-10 search failed:', err);
    // Real fix, per direct feedback: "I searched for Breast and it
    // didn't find any codes which surprised me." A failed request
    // (missing/misconfigured API key, network error, CORS) looked
    // identical to a real, genuine "no matches" result - both
    // silently returned []. Re-throwing here lets the real caller
    // show a distinct "search unavailable" message instead of
    // implying the term itself has no matches, which was actively
    // misleading for a term as common as "Breast."
    throw new Error(`ICD-10 search is currently unavailable — ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

// ─── ICD-11 ───────────────────────────────────────────────────────────────────
// Endpoint: /icd11_codes/v3/search
// NLM hosts ICD-11 directly — no WHO OAuth or backend proxy required.
// data[1] = codes, data[3] = [[code, title], ...] when df=code,title

async function searchIcd11(query: string, maxResults = 20): Promise<CodeResult[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({
      terms:   query,
      maxList: String(maxResults),
      sf:      'code,title',
      df:      'code,title',
    });
    const res = await fetch(`${NLM_BASE}${TERMINOLOGY_CONFIG.nlm.endpoints.icd11}?${params}`);
    if (!res.ok) throw new Error(`NLM ICD-11 ${res.status}`);
    const data = await res.json();

    const codes:    string[]  = data[1] ?? [];
    const extraArr: any[][]   = data[3] ?? [];

    return codes.map((code, i) => ({
      code,
      display: extraArr[i]?.[1] ?? extraArr[i]?.[0] ?? code,
      system:  'ICD11',
    }));
  } catch (err) {
    console.warn('[codeSearchService] ICD-11 search failed:', err);
    // Real fix, per direct feedback: "I searched for Breast and it
    // didn't find any codes which surprised me." A failed request
    // (missing/misconfigured API key, network error, CORS) looked
    // identical to a real, genuine "no matches" result - both
    // silently returned []. Re-throwing here lets the real caller
    // show a distinct "search unavailable" message instead of
    // implying the term itself has no matches, which was actively
    // misleading for a term as common as "Breast."
    throw new Error(`ICD-11 search is currently unavailable — ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

// ─── LOINC ────────────────────────────────────────────────────────────────────
// Endpoint: /loinc_items/v3/search  (note: loinc_items, not loinc)
// type=question filters to observable/test codes relevant to pathology.
// data[1] = LOINC numbers, data[3] = [[LOINC_NUM, LONG_COMMON_NAME], ...]

async function searchLoinc(query: string, maxResults = 20): Promise<CodeResult[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({
      terms:   query,
      maxList: String(maxResults),
      type:    'question',
      sf:      'LOINC_NUM,LONG_COMMON_NAME,SHORTNAME',
      df:      'LOINC_NUM,LONG_COMMON_NAME',
    });
    const res = await fetch(`${NLM_BASE}${TERMINOLOGY_CONFIG.nlm.endpoints.loinc}?${params}`);
    if (!res.ok) throw new Error(`NLM LOINC ${res.status}`);
    const data = await res.json();

    const codes:    string[]  = data[1] ?? [];
    const extraArr: any[][]   = data[3] ?? [];

    return codes.map((code, i) => ({
      code,
      display: extraArr[i]?.[1] ?? extraArr[i]?.[0] ?? code,
      system:  'LOINC',
    }));
  } catch (err) {
    console.warn('[codeSearchService] LOINC search failed:', err);
    // Real fix, per direct feedback: "I searched for Breast and it
    // didn't find any codes which surprised me." A failed request
    // (missing/misconfigured API key, network error, CORS) looked
    // identical to a real, genuine "no matches" result - both
    // silently returned []. Re-throwing here lets the real caller
    // show a distinct "search unavailable" message instead of
    // implying the term itself has no matches, which was actively
    // misleading for a term as common as "Breast."
    throw new Error(`LOINC search is currently unavailable — ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

// ─── ICD-O ────────────────────────────────────────────────────────────────────
// Uses UTS SNOMED morphology search filtered to morphologic abnormality concepts.
// Replace with a dedicated backend ICD-O-3 endpoint for full topography coverage.

async function searchIcdo(query: string, maxResults = 20): Promise<CodeResult[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({
      string:       query.trim(),
      searchType:   'rightTruncation',
      sabs:         'SNOMEDCT_US',
      returnIdType: 'code',
      pageSize:     String(maxResults),
    });

    const res = await fetch(`${UTS_SEARCH}?${params}`);
    if (!res.ok) throw new Error(`UTS SNOMED (ICD-O) ${res.status}`);
    const data = await res.json();

    const results: any[] = data?.result?.results ?? [];
    const morphologyKeywords = ['carcinoma','adenocarcinoma','sarcoma','lymphoma','melanoma','neoplasm','dysplasia','adenoma','in situ','tumour','tumor','metaplasia'];

    return results
      .filter(r => r.ui && r.ui !== 'NONE' && r.rootSource === 'SNOMEDCT_US')
      .filter(r => morphologyKeywords.some(kw => r.name.toLowerCase().includes(kw)))
      .map(r => ({
        code:    r.ui,
        display: r.name,
        system:  'ICDO',
      }));
  } catch (err) {
    console.warn('[codeSearchService] ICD-O search failed:', err);
    // Real fix, per direct feedback: "I searched for Breast and it
    // didn't find any codes which surprised me." A failed request
    // (missing/misconfigured API key, network error, CORS) looked
    // identical to a real, genuine "no matches" result - both
    // silently returned []. Re-throwing here lets the real caller
    // show a distinct "search unavailable" message instead of
    // implying the term itself has no matches, which was actively
    // misleading for a term as common as "Breast."
    throw new Error(`ICD-O search is currently unavailable — ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

// ─── OPCS-4 ───────────────────────────────────────────────────────────────────
// NHS UK procedure classification — no public NLM endpoint exists.
// Requires NHS TRUD licence and backend proxy for production.
// Dev/demo: returns empty with a console note.
// TODO: wire to NHS TRUD API via backend proxy.

async function searchOpcs4(_query: string, _maxResults = 20): Promise<CodeResult[]> {
  console.info('[codeSearchService] OPCS-4 search requires NHS TRUD backend proxy — not yet implemented');
  return [];
}

// ─── CPT ──────────────────────────────────────────────────────────────────────
// NLM does not have CPT codes (AMA copyright restriction) - a full,
// licensed CPT database is still not available. Real fix: this doesn't
// need one. Searches the app's own, small, manually-curated, verified
// Code_Map_Table (services/billing/codeMapTable.ts) instead - not a
// substitute for full CPT coverage, but real, legally clean data for
// the handful of codes this app actually tracks, rather than the
// silent, permanent empty-array stub this was before.

async function searchCpt(query: string, maxResults = 20): Promise<CodeResult[]> {
  const { mockRvuCodeMapService } = await import('../billing/mockRvuCodeMapService');
  const activeRes = await mockRvuCodeMapService.getActiveVersion();
  if (!activeRes.ok || !activeRes.data) return [];

  const q = query.trim().toLowerCase();
  const entries = activeRes.data.entries.filter(e =>
    !q || e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
  );

  return entries.slice(0, maxResults).map(e => ({
    code: e.code,
    display: e.description,
    system: 'CPT',
  }));
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

export async function searchCodes(
  system: string,
  query: string,
  filter: SnomedFilter = 'all',
  maxResults = 20
): Promise<CodeResult[]> {
  switch (system) {
    case 'SNOMED': return searchSnomed(query, filter, maxResults);
    case 'ICD10':  return searchIcd10(query, maxResults);
    case 'ICD11':  return searchIcd11(query, maxResults);
    case 'LOINC':  return searchLoinc(query, maxResults);
    case 'ICDO':   return searchIcdo(query, maxResults);
    case 'OPCS4':  return searchOpcs4(query, maxResults);
    case 'CPT':    return searchCpt(query, maxResults);
    default:       return [];
  }
}
