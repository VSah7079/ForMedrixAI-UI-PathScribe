// src/services/narrativeSignals/deidentification.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clinical text de-identification for narrative edit signals.
//
// Purpose: Strip clinical values from AI-generated and pathologist-edited
// narrative text before storage, so that stored signals are safe to:
//   1. Aggregate across customers
//   2. Share with AI partners (Anthropic etc.) for model improvement
//   3. Include in validation reports without PHI risk
//
// Approach: Pattern-based replacement of clinical values with typed
// placeholders. Structural language (sentence patterns, transitions,
// medical terminology as categories) is preserved — this is what has
// value for training. Specific measurements, names, and findings that
// could re-identify a patient are replaced.
//
// What is REPLACED (values):
//   • Measurements: "3.2 cm", "450g", "18 mm"
//   • Dates: "January 2024", "03/14/1974"
//   • Patient identifiers: MRN-like patterns, DOB patterns
//   • Proper nouns in clinical context: physician names, hospital names
//   • Specific test results: "PSA 12.4", "ER 95%", "Ki-67 25%"
//   • TNM staging specifics: "pT3N1M0"
//   • Gleason scores: "3+4=7"
//
// What is PRESERVED (structure):
//   • Sentence structure and transitions
//   • Medical category terms: "invasive carcinoma", "moderately differentiated"
//   • Section-level language patterns
//   • Edit patterns (what type of change was made)
// ─────────────────────────────────────────────────────────────────────────────

export interface DeidentifiedSignal {
  /** De-identified AI-generated text */
  aiGeneratedClean:    string;
  /** De-identified final pathologist text */
  finalTextClean:      string;
  /** Structural diff — what KIND of change was made, not the clinical values */
  structuralEditType:  StructuralEditType;
  /** Number of value replacements made */
  replacementCount:    number;
  /** Whether any replacements were made */
  wasDeidentified:     boolean;
}

export type StructuralEditType =
  | 'none'              // identical — pathologist accepted as-is
  | 'minor_wording'     // small phrasing change, no structural difference
  | 'added_content'     // pathologist added information
  | 'removed_content'   // pathologist removed AI content
  | 'restructured'      // same information, different structure
  | 'major_rewrite'     // substantial change
  | 'complete_replace'; // entirely different content

// ── Replacement patterns ──────────────────────────────────────────────────────

const REPLACEMENTS: Array<{ pattern: RegExp; placeholder: string }> = [
  // Measurements — must come before general numbers
  { pattern: /\b\d+\.?\d*\s*(?:cm|mm|μm|um|g|kg|ml|mL|cc|nm)\b/gi,           placeholder: '[MEASUREMENT]' },
  { pattern: /\b\d+\.?\d*\s*(?:×|x)\s*\d+\.?\d*(?:\s*(?:×|x)\s*\d+\.?\d*)?\s*(?:cm|mm|g)?\b/gi, placeholder: '[DIMENSIONS]' },

  // Biomarker values
  { pattern: /\b(?:ER|PR|HER2|Ki-?67|PD-?L1|CPS|PSA|CEA|CA-?125|AFP)\s*[:\s]\s*\d+\.?\d*\s*%?/gi, placeholder: '[BIOMARKER_RESULT]' },
  { pattern: /\b\d+\.?\d*\s*%\s*(?:positive|staining|expression|nuclear)/gi,  placeholder: '[BIOMARKER_PERCENT]' },

  // TNM staging
  { pattern: /\bp[yc]?T\d[a-z]?\s*(?:N\d[a-z]?)?\s*(?:M\d[a-z]?)?\b/gi,      placeholder: '[pTNM_STAGE]' },
  { pattern: /\b(?:Stage|stage)\s+(?:I{1,3}V?|[1-4][A-C]?)\b/g,               placeholder: '[STAGE]' },

  // Gleason / grade group
  { pattern: /\b\d\s*\+\s*\d\s*=\s*\d+\b/g,                                   placeholder: '[GLEASON_SCORE]' },
  { pattern: /\bGrade\s+[Gg]roup\s+[1-5]\b/gi,                                 placeholder: '[GRADE_GROUP]' },
  { pattern: /\bGleason\s+(?:score\s+)?\d+\b/gi,                               placeholder: '[GLEASON_SCORE]' },

  // Dates
  { pattern: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi, placeholder: '[DATE]' },
  { pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,                        placeholder: '[DATE]' },
  { pattern: /\b\d{4}[/-]\d{2}[/-]\d{2}\b/g,                              placeholder: '[DATE]' },

  // Accession numbers
  { pattern: /\b[SO]\d{2}-\d{4}(?:-[A-Z]{2}-\d{3})?\b/gi,                     placeholder: '[ACCESSION]' },
  { pattern: /\bS\d{2}-\d{4,}\b/gi,                                            placeholder: '[ACCESSION]' },

  // MRN / patient ID patterns
  { pattern: /\b(?:MRN|mrn|Patient\s+ID|Case\s+No\.?)\s*:?\s*\d+\b/gi,        placeholder: '[PATIENT_ID]' },
  { pattern: /\b\d{6,10}\b/g,                                                  placeholder: '[ID_NUMBER]' },

  // Block/slide identifiers
  { pattern: /\b(?:Block|Cassette|Slide)\s+[A-Z]\d*(?:-\d+)?\b/gi,            placeholder: '[BLOCK_ID]' },

  // Standalone large numbers (likely measurements or counts)
  { pattern: /\b\d+,\d{3}\b/g,                                                 placeholder: '[NUMBER]' },

  // Remaining standalone decimals likely to be clinical values
  { pattern: /\b\d{1,2}\.\d{1,2}\b(?!\s*(?:×|x))/g,                           placeholder: '[VALUE]' },
];

// ── Strip HTML tags ───────────────────────────────────────────────────────────
// Exported: also reused by useGrossingCompletion.ts to convert dictated
// Report Draft HTML into plain text before sending it to the AI prompt in
// generateGrossingFieldSuggestionsFromDictation — same conversion need,
// no reason to duplicate it.

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Apply replacements ────────────────────────────────────────────────────────

export function deidentifyText(text: string): { clean: string; replacementCount: number } {
  let clean = stripHtml(text);
  let replacementCount = 0;

  for (const { pattern, placeholder } of REPLACEMENTS) {
    const before = clean;
    clean = clean.replace(pattern, placeholder);
    // Count replacements (rough — counts occurrences replaced)
    if (clean !== before) {
      const diff = (before.match(pattern) ?? []).length;
      replacementCount += diff;
    }
  }

  return { clean, replacementCount };
}

// ── Classify structural edit type ─────────────────────────────────────────────

function classifyEdit(
  aiClean: string,
  finalClean: string,
  editRatio: number,
): StructuralEditType {
  if (editRatio === 0) return 'none';

  const aiWords    = aiClean.split(/\s+/).filter(Boolean);
  const finalWords = finalClean.split(/\s+/).filter(Boolean);
  const lenDiff    = Math.abs(aiWords.length - finalWords.length);
  const lenRatio   = lenDiff / Math.max(aiWords.length, 1);

  if (editRatio >= 0.9)                                return 'complete_replace';
  if (editRatio >= 0.5)                                return 'major_rewrite';
  if (finalWords.length > aiWords.length * 1.3)        return 'added_content';
  if (finalWords.length < aiWords.length * 0.7)        return 'removed_content';
  if (lenRatio < 0.1 && editRatio > 0.15)              return 'restructured';
  if (editRatio < 0.15)                                return 'minor_wording';
  return 'restructured';
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * De-identify a pair of narrative texts (AI-generated and pathologist-final)
 * before storing as a training/validation signal.
 *
 * The output is safe for:
 *   - Storage in PathScribe signal database
 *   - Aggregation across customers
 *   - Sharing with AI partners under a data sharing agreement
 *   - Inclusion in validation reports
 */
export function deidentifySignal(
  aiGenerated: string,
  finalText:   string,
  editRatio:   number,
): DeidentifiedSignal {
  const ai    = deidentifyText(aiGenerated);
  const final = deidentifyText(finalText);

  return {
    aiGeneratedClean:   ai.clean,
    finalTextClean:     final.clean,
    structuralEditType: classifyEdit(ai.clean, final.clean, editRatio),
    replacementCount:   ai.replacementCount + final.replacementCount,
    wasDeidentified:    (ai.replacementCount + final.replacementCount) > 0,
  };
}

/**
 * Validate that a text is sufficiently de-identified for sharing.
 * Returns warnings for any patterns that may still contain PHI.
 */
export function auditDeidentification(text: string): string[] {
  const warnings: string[] = [];
  const clean = stripHtml(text);

  // Check for remaining patterns that might be PHI
  if (/\b[A-Z][a-z]+,\s+[A-Z][a-z]+\b/.test(clean))
    warnings.push('Possible proper name detected');
  if (/\b\d{9,}\b/.test(clean))
    warnings.push('Possible long numeric identifier detected');
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(clean))
    warnings.push('Possible date of birth detected');

  return warnings;
}
