// src/types/clinicalHistory/RecordedClinicalHistoryEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Structured Clinical History Dictionary &
// Accessioning Integration" spec. Lives under types/, not services/,
// specifically so Case.ts (types/case/Case.ts) can import
// RecordedClinicalHistoryEntry directly without a types→services
// dependency — IClinicalHistoryDictionaryService.ts imports
// ClinicalHistoryCategoryCode FROM here instead of defining it itself,
// same real direction every other shared type in this app already
// follows.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per the spec's own six real categories — SCR (Screening),
 *  SYM (Symptoms), RAD_LAB (Radiology/Lab), PRIOR_PATH (Prior
 *  Pathology), MAL_STAGE (Malignancy/Staging), HIGH_RISK (High-Risk
 *  Factors). */
export type ClinicalHistoryCategoryCode = 'SCR' | 'SYM' | 'RAD_LAB' | 'PRIOR_PATH' | 'MAL_STAGE' | 'HIGH_RISK';

/** Real, per the spec's own User Story 2 — one real, recorded
 *  clinical-history selection attached to an order. Either a real,
 *  dictionary-coded selection (historyCode set, metadata populated per
 *  that entry's own requiredMetadataSchema) or a real, honest
 *  unmapped-text fallback (historyCode null, unmappedTextFallback
 *  carrying the real, un-crosswalked free text the interface engine
 *  couldn't map to a known code) — never both at once, matching the
 *  spec's own "Maps unmapped free-text to unmapped_text_fallback with
 *  an appropriate category assignment (SYM or SCR)." */
export interface RecordedClinicalHistoryEntry {
  historyCode: string | null;
  categoryCode: ClinicalHistoryCategoryCode;
  unmappedTextFallback?: string | null;
  /** Real, per the spec's own metadata object shape — keyed exactly by
   *  the matching dictionary entry's own requiredMetadataSchema[].key
   *  values (e.g. 'prior_accession_number', 'prior_date'). Empty
   *  object for an entry needing no further detail. */
  metadata: Record<string, string>;
}
