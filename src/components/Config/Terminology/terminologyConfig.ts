/**
 * terminologyConfig.ts
 * src/components/Config/Terminology/terminologyConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised terminology service configuration.
 *
 * All endpoint URLs live here — if NLM changes their API version (v3 → v4)
 * or you switch to a backend proxy, update this file only.
 *
 * Overridable via .env:
 *   VITE_NLM_BASE_URL     — NLM Clinical Tables base URL
 *   VITE_CPT_PROXY_URL    — Licensed CPT backend proxy
 *   VITE_ICD10_PROXY_URL  — Backend proxy for non-US ICD-10 variants
 *
 * NLM provides free, direct access (no auth) for:
 *   SNOMED CT, ICD-10-CM, ICD-11, LOINC, ICD-O (via SNOMED subset)
 *
 * Backend proxy required for:
 *   CPT           — AMA licensed, cannot be served publicly
 *   ICD-10 non-US — ICD-10-AM (AU), ICD-10 WHO (UK/Intl), ICD-10-CA
 *
 * Region → ICD-10 variant mapping (driven by active governing body):
 *   CAP    (United States)   → ICD-10-CM  via NLM (free, direct)
 *   RCPath (United Kingdom)  → ICD-10 WHO via backend proxy
 *   RCPA   (Australia/NZ)    → ICD-10-AM  via backend proxy
 *   ICCR   (International)   → ICD-10 WHO via backend proxy
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Endpoint config ──────────────────────────────────────────────────────────

export const TERMINOLOGY_CONFIG = {

  nlm: {
    baseUrl: import.meta.env.VITE_NLM_BASE_URL ?? 'https://clinicaltables.nlm.nih.gov/api',
    endpoints: {
      snomed:     '/snomed_ct/v3/search',  // Dev: Conditions API (free, no license)
                                            // Prod: swap to UMLS API via backend proxy
      icd10:      '/icd10cm/v3/search',
      icd11:      '/icd11_codes/v3/search', // NLM hosts ICD-11 directly — no WHO OAuth needed
      loinc:      '/loinc_items/v3/search', // Note: loinc_items, not loinc
    },
  },

  cpt: {
    // CPT is AMA-licensed — must go through your backend proxy.
    // Requires AMA CPT data license before go-live (~$3–10k/year).
    proxyUrl: import.meta.env.VITE_CPT_PROXY_URL ?? '/api/terminology/cpt',
  },

  icd10Variants: {
    // Non-US ICD-10 variants require your backend proxy.
    // NLM only carries ICD-10-CM (US). Your backend routes to the correct
    // variant based on a ?variant= query param.
    proxyUrl: import.meta.env.VITE_ICD10_PROXY_URL ?? '/api/terminology/icd10',
  },

} as const;

// ─── Region → ICD-10 variant ──────────────────────────────────────────────────

export type Icd10Variant = 'icd10cm' | 'icd10who' | 'icd10am' | 'icd10ca';

const GOVERNING_BODY_TO_ICD10_VARIANT: Record<string, Icd10Variant> = {
  CAP:    'icd10cm',   // US   — NLM direct, free
  RCPath: 'icd10who',  // UK   — backend proxy required
  ICCR:   'icd10who',  // Intl — backend proxy required
  RCPA:   'icd10am',   // AU   — backend proxy required
};

export function getIcd10VariantForBody(governingBodyId: string): Icd10Variant {
  return GOVERNING_BODY_TO_ICD10_VARIANT[governingBodyId] ?? 'icd10cm';
}

export function isNlmDirectVariant(variant: Icd10Variant): boolean {
  return variant === 'icd10cm';
}

// ─── Status types ─────────────────────────────────────────────────────────────

export type ServiceStatus =
  | 'live'
  | 'degraded'
  | 'down'
  | 'not_configured'
  | 'license_required'
  | 'checking';

export interface TerminologyServiceStatus {
  name:       string;
  status:     ServiceStatus;
  latencyMs?: number;
  note?:      string;
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Tests all NLM terminology endpoints.
 * CPT is skipped (requires backend) and returned as license_required.
 */
export async function testTerminologyEndpoints(): Promise<
  Record<string, TerminologyServiceStatus>
> {
  const base = TERMINOLOGY_CONFIG.nlm.baseUrl;

  // Use minimal params (terms + maxList only) to avoid invalid field name errors.
  // Each endpoint has different internal field names — omitting sf/df uses NLM defaults.
  const checks: { key: string; name: string; url: string; isUts: boolean }[] = [
    {
      key:  'snomed',
      name: 'SNOMED CT',
      // Real, per direct fix: routes through the same real, secure,
      // server-side proxy searchSnomed()/searchIcdo() already use
      // (vite.config.ts's own '/api/terminology/umls' route, which
      // injects the real API key server-side from env.UMLS_API_KEY) —
      // never a raw apiKey in a client-side URL, which this line
      // previously had, hardcoded, shipped in the client bundle.
      url:  `/api/terminology/umls/search/current?string=carcinoma&sabs=SNOMEDCT_US&returnIdType=code&pageSize=1`,
      isUts: true,
    },
    {
      key:  'icd10',
      name: 'ICD-10-CM',
      url:  `${base}/icd10cm/v3/search?terms=malignant&maxList=1&sf=code,name&df=code,name`,
      isUts: false,
    },
    {
      key:  'icd11',
      name: 'ICD-11',
      url:  `${base}/icd11_codes/v3/search?terms=malignant&maxList=1`,
      isUts: false,
    },
    {
      key:  'loinc',
      name: 'LOINC',
      url:  `${base}/loinc_items/v3/search?terms=pathology&maxList=1&type=question`,
      isUts: false,
    },
    {
      key:  'icdo',
      name: 'ICD-O',
      // Real, per direct fix — same real, secure proxy as SNOMED above.
      url:  `/api/terminology/umls/search/current?string=adenocarcinoma&sabs=SNOMEDCT_US&returnIdType=code&pageSize=1`,
      isUts: true,
    },
  ];

  const results: Record<string, TerminologyServiceStatus> = {};

  await Promise.all(
    checks.map(async ({ key, name, url, isUts }) => {
      const t0 = Date.now();
      try {
        const res       = await fetch(url, { mode: 'cors' });
        const latencyMs = Date.now() - t0;
        if (!res.ok) {
          results[key] = { name, status: 'degraded', latencyMs, note: `HTTP ${res.status}` };
          return;
        }
        const data = await res.json();
        // Real, per direct fix: two genuinely different real response
        // shapes — NLM Clinical Tables returns a top-level array
        // ([count, codes, ...]), UTS (SNOMED/ICD-O) returns
        // {result: {results: [...]}}. The old, single Array.isArray
        // check only ever matched the first shape — SNOMED/ICD-O
        // always reported "degraded... returned no results" even when
        // genuinely working, since a real UTS response is an object,
        // never an array.
        const hasResults = isUts
          ? Array.isArray(data?.result?.results) && data.result.results.length > 0
          : Array.isArray(data) && (data[0] ?? 0) > 0;
        results[key] = {
          name,
          status:    hasResults ? 'live' : 'degraded',
          latencyMs,
          note:      !hasResults ? 'Reachable but returned no results' : undefined,
        };
      } catch (e: any) {
        const latencyMs = Date.now() - t0;
        // CORS errors throw — treat as unknown rather than definitively down
        // since the endpoint may work fine for actual search requests via Vite proxy
        const isCors = e?.message?.includes('fetch') || e?.name === 'TypeError';
        results[key] = {
          name,
          status:    isCors ? 'degraded' : 'down',
          latencyMs,
          note:      isCors
            ? 'Health check blocked by CORS — endpoint may still work for searches'
            : 'Connection failed — check network or NLM service status',
        };
      }
    })
  );

  // CPT — always license_required, no NLM endpoint exists
  results['cpt'] = {
    name:   'CPT',
    status: 'license_required',
    note:   'Requires AMA CPT data license and backend proxy',
  };

  return results;
}
