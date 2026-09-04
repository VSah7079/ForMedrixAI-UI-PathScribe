/**
 * ICodeService.ts — src/services/codes/ICodeService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interface and types for the clinical terminology service.
 *
 * Supported systems:
 *   SNOMED CT — pathology-relevant subset (~5k concepts), jurisdiction-specific
 *               national release
 *   ICD-10    — jurisdiction-variant:
 *                 US    → ICD-10-CM  (NLM/CMS)
 *                 CA    → ICD-10-CA  (CIHI)
 *                 GB_EW → ICD-10 WHO (NHS)
 *                 GB_SCT→ ICD-10 WHO (NHS Scotland)
 *                 IE    → ICD-10-AM  (HSE)
 *   ICD-11    — WHO oncology subset, all jurisdictions (off by default)
 *   ICD-O     — WHO/IARC topography + morphology axes, all jurisdictions
 *
 * Jurisdiction is resolved internally from SystemConfig — components never
 * pass it explicitly. They just call search() and get the right variant back.
 *
 * All implementations (mock, Firestore, future live API) must satisfy this
 * interface. Components import codeService from services/index.ts only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ServiceResult } from '../types';
import type { Jurisdiction } from '../../types/systemConfig';

// ─── Code systems ─────────────────────────────────────────────────────────────

export type CodeSystem = 'SNOMED' | 'ICD-10' | 'ICD-11' | 'ICD-O';

/**
 * ICD-O axis selector.
 * ICD-O has two independent coding axes:
 *   topography  — anatomical site of the tumour (C codes, e.g. C50.9 = Breast NOS)
 *   morphology  — tumour histology + behaviour (M codes, e.g. 8140/3 = Adenocarcinoma)
 * Both axes are coded independently on every case.
 */
export type IcdOSubtype = 'topography' | 'morphology';

// ─── ClinicalCode ─────────────────────────────────────────────────────────────

export interface ClinicalCode {
  /** The code string — e.g. "8140/3", "C50.9", "413448000" */
  code:          string;

  /** Human-readable display label — e.g. "Adenocarcinoma, NOS" */
  display:       string;

  /** Which terminology system this code belongs to */
  system:        CodeSystem;

  /**
   * ICD-O only — which axis this code belongs to.
   *   topography = anatomical site (C codes)
   *   morphology = tumour type + behaviour (M codes, format XXXX/B)
   */
  subtype?:      IcdOSubtype;

  /**
   * Optional UI grouping label — e.g. "Carcinoma", "Breast", "GI Tract".
   * Used to render section headers in the Browse modal.
   */
  category?:     string;

  /**
   * The jurisdiction this code belongs to.
   * 'ALL' means the code is valid in all jurisdictions (most ICD-O and ICD-11).
   * Jurisdiction-specific codes (e.g. SNOMED Scottish Extension) carry their
   * jurisdiction here so the service can filter correctly.
   */
  jurisdiction:  string;   // Jurisdiction | 'ALL'

  /**
   * Whether this code is currently active.
   * False if the code has been retired in a newer edition.
   * Retired codes are kept in Firestore to preserve historical case data.
   */
  active:        boolean;

  /**
   * The source edition this code was seeded from.
   * e.g. "ICD-10-CM 2025", "SNOMED CT UK Edition 2025-04-23", "ICD-O-3.2"
   */
  version?:      string;
}

// ─── Search params ────────────────────────────────────────────────────────────

export interface CodeSearchParams {
  /** Which terminology system to search — required */
  system:     CodeSystem;

  /**
   * ICD-O axis filter — required when system is 'ICD-O'.
   * Pass 'topography' or 'morphology' to search one axis.
   * Omit to search both axes together (used in the tabbed Browse modal).
   */
  subtype?:   IcdOSubtype;

  /**
   * Free-text search against code string and display label.
   * Minimum 2 characters for typeahead; omit to load all codes (Browse modal).
   */
  query?:     string;

  /**
   * Filter to a named category grouping — e.g. "Breast", "Carcinoma".
   * Used when the user clicks a category header in the Browse modal.
   */
  category?:  string;

  /**
   * Whether to include retired codes in results.
   * Defaults to false — only active codes shown in search and Browse.
   * Set to true when resolving historical case data.
   */
  includeRetired?: boolean;

  /**
   * Explicit jurisdiction override — added June 2026. When provided, the
   * search routes to that jurisdiction's terminology collection instead
   * of the implementation's own default resolution (previously a single
   * system-wide SystemConfig.jurisdiction value that nothing meaningful
   * ever changed — see Facility.jurisdiction for the real per-case
   * mechanism, added earlier the same session).
   *
   * Callers with a single case/facility in context (e.g. a synoptic report
   * editor) should resolve the case's facility's jurisdiction and pass it
   * here. Callers without a single definite context (e.g. a cross-case
   * search page, where results could span multiple facilities/jurisdictions
   * at once) should omit this and accept the implementation's default —
   * there isn't one "correct" jurisdiction to force in that situation.
   */
  jurisdiction?: Jurisdiction;
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface ICodeService {
  /**
   * Search for clinical codes matching the given params.
   * Jurisdiction: pass params.jurisdiction explicitly when the caller has
   * a single case/client in context; omit it to fall back to the
   * implementation's own default (see CodeSearchParams.jurisdiction).
   * Returns up to 50 results for Browse modal; up to 8 for typeahead.
   */
  search(params: CodeSearchParams): Promise<ServiceResult<ClinicalCode[]>>;

  /**
   * Fetch a single code by exact code string.
   * Used to resolve saved filter state (stored codes) back to display labels.
   * Returns an error result if the code is not found.
   */
  getByCode(system: CodeSystem, code: string, jurisdiction?: Jurisdiction): Promise<ServiceResult<ClinicalCode>>;

  /**
   * Returns all available category groupings for a given system + subtype.
   * Used to populate the category filter in the Browse modal.
   */
  getCategories(system: CodeSystem, subtype?: IcdOSubtype, jurisdiction?: Jurisdiction): Promise<ServiceResult<string[]>>;
}
