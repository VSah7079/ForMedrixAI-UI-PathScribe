# components/Config/Terminology/

Terminology service endpoint configuration and live health monitoring
(SNOMED CT, ICD-10-CM, ICD-11, LOINC, ICD-O, CPT).

**Pattern:** Config/data (`terminologyConfig.ts`) + monitoring UI
(`TerminologyServicesSection.tsx`), same shape as `Config/AI/`.

## Files

- **`terminologyConfig.ts`** — Excellent, detailed header. Documents
  exactly which terminology systems are free/direct via NLM (SNOMED CT,
  ICD-10-CM, ICD-11, LOINC, ICD-O) vs. require a licensed backend proxy
  (CPT — AMA-licensed, non-US ICD-10 variants), and the region → ICD-10
  variant mapping keyed off active governing body (CAP→ICD-10-CM, RCPath/
  ICCR→ICD-10 WHO, RCPA→ICD-10-AM). All overridable via `.env`
  (`VITE_NLM_BASE_URL`, `VITE_CPT_PROXY_URL`, `VITE_ICD10_PROXY_URL`).
  Strong copyright-narrative evidence — same licensing-awareness spirit as
  the CAP/RCPath content-licensing cleanup already done elsewhere.
- **`TerminologyServicesSection.tsx`** — Live health-check UI for the
  endpoints above (auto-runs on mount, "Test All" button). Own header
  correctly documents its consumer (`Config/System/index.tsx`).

## Notes

- Real, per direct guidance: fixed a real, live security issue found while
  investigating an unrelated question — `terminologyConfig.ts`'s own
  `testTerminologyEndpoints()` had a real UMLS API key hardcoded directly in
  a client-side URL for its SNOMED/ICD-O checks, calling `uts-ws.nlm.nih.gov`
  directly and bypassing the real, secure, server-side proxy
  `codeSearchService.ts`'s own search functions already correctly use
  (`vite.config.ts`'s `/api/terminology/umls` route, which injects the real
  key server-side from `env.UMLS_API_KEY`, never a client-exposed variable).
  Live and exposed every time `TerminologyServicesSection.tsx` (this
  folder's own real consumer) ran its health check. Now routes through that
  same real proxy. Found and fixed alongside it: the SNOMED/ICD-O response-
  parsing itself was also silently wrong — it assumed the NLM Clinical
  Tables array shape (`[count, codes, ...]`) for every endpoint, but a real
  UTS response (what SNOMED/ICD-O actually return) is `{result: {results:
  [...]}}`, an object — so `Array.isArray(data)` was always `false` for
  those two, meaning they always reported "degraded... returned no results"
  even when genuinely working. Both real fixes verified with **4 new
  tests** in the new `terminologyConfig.test.ts`.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
