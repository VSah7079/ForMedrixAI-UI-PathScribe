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

// Real, per direct guidance: "real search could introduce time...
// Everything needs to be fast as possible otherwise, the point of the
// application, save pathologist time, is not realistic." Same real
// concern, same real fix, as dispatchInterfaceMessage.ts's own
// established DISPATCH_TIMEOUT_MS — a bare fetch() with no timeout
// hangs indefinitely on a genuinely unresponsive endpoint. That file
// uses 15000ms for a real, background dispatch queue nobody is
// actively watching; this is a genuinely different, interactive
// context — a pathologist is actively waiting on this specific
// result, so a much shorter, real timeout applies here instead.
const TERMINOLOGY_SEARCH_TIMEOUT_MS = 5000;

/**
 * Real, shared timeout wrapper — every real fetch() in this file goes
 * through this rather than five separate, duplicated
 * AbortController/setTimeout blocks. A genuine timeout surfaces as a
 * real AbortError, which each real caller's own existing try/catch
 * already treats the same as any other real network failure (a
 * distinct "search unavailable" message, never confused with a
 * genuine "no matches" result).
 */
async function fetchWithTimeout(url: string, timeoutMs = TERMINOLOGY_SEARCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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

    const res = await fetchWithTimeout(`${UTS_SEARCH}?${params}`);
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
    const res = await fetchWithTimeout(`${NLM_BASE}${TERMINOLOGY_CONFIG.nlm.endpoints.icd10}?${params}`);
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
    const res = await fetchWithTimeout(`${NLM_BASE}${TERMINOLOGY_CONFIG.nlm.endpoints.icd11}?${params}`);
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
    const res = await fetchWithTimeout(`${NLM_BASE}${TERMINOLOGY_CONFIG.nlm.endpoints.loinc}?${params}`);
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

    const res = await fetchWithTimeout(`${UTS_SEARCH}?${params}`);
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

// ─── Existence verification ───────────────────────────────────────────────────
// Real, per direct guidance: "before any suggestion is [shown], [verify]
// that code actually exists and is a real code. Machine verified. Then
// the Practitioner makes the medical decision to use or not use that
// code based on their own belief." This is deliberately NOT a
// replacement for that practitioner judgment (which stays exactly
// where it already was, in AddCodeModal.tsx's own "review and apply"
// flow) — it's a real, machine pre-filter ensuring only codes that
// genuinely exist in the real, live terminology source ever reach
// that judgment in the first place, the same real defensive posture
// CPT already gets there (re-verified against the real, curated
// CODE_MAP_TABLE) that SNOMED/ICD-10/ICD-11/LOINC/ICD-O did not have
// until now.
//
// Deliberately reuses the same real, already-working, already-tested
// search functions above rather than a new, separate "exact code
// lookup" API call this code can't empirically verify works correctly
// against the real, live UTS/NLM endpoints from this environment —
// lower real risk than guessing at an untested query-parameter shape.
// Searches using the AI's own claimed display text (the most likely
// real query to surface the actual concept, since these are text
// search APIs, not code-lookup APIs), then checks for a real result
// with an EXACT matching code — never a fuzzy/partial match, since a
// close-but-wrong code is exactly the failure mode this guards
// against.

/**
 * Real, per direct guidance: verifies a single AI-suggested code
 * genuinely exists in the real, live terminology source for its
 * system, before that suggestion is ever shown to the practitioner.
 * Fails closed on any real error (network failure, endpoint down) —
 * an unverifiable code is treated the same as a non-existent one,
 * never assumed real by default.
 */
// Real, per direct guidance: "we want the Pathologist to get the
// answer, we just need to optimize our code and approach to make
// sure PathScribe is not the performance problem." A timeout is a
// real, necessary safety net against a genuinely dead connection —
// it is NOT a performance strategy, since it makes a slow-but-working
// call fail faster, not resolve faster. This cache is the real
// optimization: eliminates a genuinely redundant round trip entirely
// for a code this session has already verified, rather than merely
// giving up on one sooner.
//
// Real, deliberate asymmetry, not an oversight: a POSITIVE result
// (code genuinely found) is cached by (system, code) alone — once a
// real code is confirmed to exist, that fact doesn't depend on which
// search phrase found it, so any future call for the same code can
// reuse it regardless of displayHint. A NEGATIVE result is cached by
// the full (system, code, displayHint) instead — "not found by THIS
// specific query" is real, but doesn't mean a different, better
// query wouldn't find the same real code. Caching a negative broadly
// risks silently hiding a real, valid code from a pathologist, which
// this app never trades for speed.
const verifiedCodeCache = new Map<string, boolean>();

/** Real, for test isolation only — module-level cache state would
 *  otherwise silently leak between test cases. */
export function clearVerifiedCodeCache(): void {
  verifiedCodeCache.clear();
}

export async function verifyCodeExists(code: string, system: string, displayHint: string): Promise<boolean> {
  if (system === 'CPT') return true; // Real, per direct precedent: CPT already has its own, separate, existing re-verification against CODE_MAP_TABLE (AddCodeModal.tsx) — never duplicated here.

  const positiveKey = `${system}::${code}`;
  if (verifiedCodeCache.get(positiveKey) === true) return true;
  const negativeKey = `${system}::${code}::${displayHint}`;
  if (verifiedCodeCache.get(negativeKey) === false) return false;

  try {
    const results = await searchCodes(system, displayHint, 'all', 20);
    const found = results.some(r => r.code === code);
    if (found) verifiedCodeCache.set(positiveKey, true);
    else verifiedCodeCache.set(negativeKey, false);
    return found;
  } catch {
    // Real, deliberate: a network/timeout failure is never cached —
    // an unreachable endpoint right now says nothing real about
    // whether the code exists, and caching that would risk
    // permanently hiding a real code behind a transient outage.
    return false;
  }
}


/**
 * Real, per direct guidance: filters a full list of AI-suggested
 * codes down to only those that machine-verify as genuinely real,
 * running every real verification check in parallel rather than
 * serially (a real latency concern — up to several distinct codes,
 * each a real network round trip). One real, silently-dropped
 * suggestion is a better outcome than one hallucinated code reaching
 * the practitioner's own review — see this file's own header comment
 * on verifyCodeExists for the full reasoning.
 */
export async function filterToVerifiedCodes<T extends { code: string; system: string; display: string }>(
  suggestions: T[]
): Promise<T[]> {
  const verifications = await Promise.all(
    suggestions.map(s => verifyCodeExists(s.code, s.system, s.display))
  );
  return suggestions.filter((_, i) => verifications[i]);
}
