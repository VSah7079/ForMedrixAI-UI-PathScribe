// src/services/spellcheck/tokenizeForSpelling.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): splits report text into the words the spell checker
// looks at, and decides which tokens pass through unchecked. Pure.
//
// Pass-through (AC3, and Pete's "context-aware" rule: whatever the
// spelling language, codes and clinical tokens are never flagged):
//   • anything containing a digit — SNOMED CT concept ids, LOINC codes
//     (2160-0), ICD-10 (C50.9), ICD-O morphology (8140/3), TNM (pT3N1a),
//     markers (CK7, CD20, Ki-67, HER2, BRCA1), measurements (2.5cm),
//     Gleason scores, accession numbers;
//   • short all-capital acronyms (ER, PR, IHC, DCIS, LVI, AJCC; up to 6
//     letters) — a longer all-capital word is still checked;
//   • dotted abbreviations (e.g., i.e., approx.), URLs and e-mail addresses;
//   • single letters (specimen parts A, B, C);
//   • short parts of a run that carries a number (the "Ki" of Ki-67, the
//     "PD" of PD-L1); longer parts ("positive" in HER2-positive) are checked.
// Hyphenated and slashed words are checked part by part, so
// "well-differentiatted" flags only the misspelled part.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpellToken {
  /** The word as written (curly apostrophes normalised to '). */
  text: string;
  /** Offsets into the original string, [from, to). */
  from: number;
  to: number;
  script: 'latin' | 'hangul' | 'other';
}

// A run of letters, marks, digits and joiners, starting and ending on a letter or digit.
const RUN = /[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}'’.\-/+@_:]*[\p{L}\p{M}\p{N}])?/gu;
const HAS_DIGIT = /\p{N}/u;
const URLISH = /^(https?:|www\.)|@|\.(com|org|net|uk|au|nz|ca|nl|be|de|fr|kr|gov|edu)$/i;
const DOTTED_ABBREV = /^(\p{L}{1,4}\.)+\p{L}{0,4}$/u;
const HANGUL = /\p{Script=Hangul}/u;
const LATIN = /\p{Script=Latin}/u;

export const MAX_PASS_THROUGH_ACRONYM = 6;
/** In a run containing a digit, parts shorter than this are treated as part of a marker name. */
export const MIN_CHECKED_MARKER_PART = 4;

function scriptOf(word: string): SpellToken['script'] {
  if (HANGUL.test(word)) return 'hangul';
  if (LATIN.test(word)) return 'latin';
  return 'other';
}

function isPassThrough(word: string): boolean {
  if (word.length <= 1) return true;
  if (HAS_DIGIT.test(word)) return true;
  if (URLISH.test(word)) return true;
  if (DOTTED_ABBREV.test(word) && word.includes('.')) return true;
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (letters.length <= MAX_PASS_THROUGH_ACRONYM && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return true;
  return false;
}

/** The words to check, with offsets. Pass-through tokens are omitted. */
export function tokenizeForSpelling(text: string): SpellToken[] {
  const out: SpellToken[] = [];
  for (const m of text.matchAll(RUN)) {
    const run = m[0];
    const start = m.index ?? 0;
    if (URLISH.test(run)) continue;
    // In a run carrying a code or marker number (Ki-67, PD-L1, HER2-positive),
    // short parts are part of the marker's name; longer parts are still checked.
    const markerRun = HAS_DIGIT.test(run);
    // Split into parts on hyphens, slashes, plus signs and colons; keep apostrophes and dots inside parts.
    let offset = 0;
    for (const part of run.split(/([-/+:])/)) {
      const partStart = start + offset;
      offset += part.length;
      if (!part || /^[-/+:]$/.test(part)) continue;
      // Trim dots at either end ("mucosa." at a sentence end) and quote marks; inner dots make it an abbreviation.
      const lead = part.match(/^\.+/)?.[0].length ?? 0;
      const trimmed = part.slice(lead).replace(/\.+$/, '');
      const leadQuote = trimmed.match(/^['’]+/)?.[0].length ?? 0;
      const core = trimmed.slice(leadQuote).replace(/['’]+$/, '');
      if (!core || core.includes('.') || isPassThrough(core)) continue;
      if (markerRun && core.replace(/[^\p{L}]/gu, '').length < MIN_CHECKED_MARKER_PART) continue;
      const from = partStart + lead + leadQuote;
      const normalised = core.replace(/’/g, "'");
      out.push({ text: normalised, from, to: from + core.length, script: scriptOf(normalised) });
    }
  }
  return out;
}

/** Korean particles and endings that attach to a noun; stripped before a
 *  medical-lexicon lookup so 검체를 matches 검체. Longest first. Needs
 *  native-speaker review. */
export const KOREAN_PARTICLES: readonly string[] = [
  '에서는', '에서도', '으로는', '으로도', '에게서', '에서', '으로', '에게', '에는', '에도', '까지', '부터', '보다', '처럼', '마다', '이나', '이며', '이고', '이다',
  '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '나', '며', '고',
];

/** The word plus its particle-stripped forms, most specific first. */
export function koreanLookupForms(word: string): string[] {
  const forms = [word];
  for (const p of KOREAN_PARTICLES) {
    if (word.length > p.length && word.endsWith(p)) forms.push(word.slice(0, -p.length));
  }
  return forms;
}
