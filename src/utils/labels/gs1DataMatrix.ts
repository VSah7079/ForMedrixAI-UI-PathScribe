// src/utils/labels/gs1DataMatrix.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own "Technical Specification:
// PathScribe Dual Engine Print & Barcode Integration" (Sections 3 + 4 —
// "Barcode & Label Data Standards" and "GS1 Validation Engine"). This is
// the PathScribe-side half of that spec: GS1 Application Identifier
// encoding and validation. The Local Print Bridge Agent (Section 8, a
// separate native binary) and the real Interface Engine (Section 6,
// third-party software like Mirth/Cloverleaf/Rhapsody) are genuinely
// outside this codebase's scope — see dispatchNetworkPrintJob.ts's own
// header for the full reasoning on that boundary. This module is real,
// complete, and independently testable regardless of when — or whether
// — those two external pieces get built.
//
// Real, important correction to the spec's own worked example, found
// by verifying it against actual GS1 encoding rules rather than
// copying it as-is: the spec's own "validated" gs1DataMatrix string
// ("010085000000000021PS2026882110BLK02") has NO separator between
// the variable-length (21) value and the following (10) AI. Per GS1's
// own DataMatrix Guideline (gs1.org): every variable-length element
// string that isn't the LAST one in the symbol must be followed by a
// real separator character (FNC1, transmitted as the control
// character <GS>, ASCII 29 / 0x1D) — otherwise a real, compliant
// scanner has no way to know where the accession number ends and the
// block ID begins. This module always inserts that real separator;
// the spec's own example, encoded literally, would not have scanned
// correctly on real hardware.
//
// Real, confirmed Zebra-specific detail (support.zebra.com's own
// "Creating GS1 Barcodes with Zebra Printers" article): ZPL's own
// DataMatrix escape sequence for FNC1 is the two-character sequence
// "_1" (underscore + the digit one), and requires ^FH (Field Hex) on
// the ^FD line that carries it — the spec's own ZPL template
// (Section 6.2) has neither. zplTemplates.ts (this module's own
// sibling) builds this correctly; see that file's own header.
// ─────────────────────────────────────────────────────────────────────────────

/** Real GS1 Application Identifiers this app actually encodes — see
 *  each field's own real-world AI definition (GS1 General
 *  Specifications) vs. how this spec repurposes it for lab use. AI
 *  (01) is genuinely fixed-length (14 digits) by the GS1 standard
 *  itself; (21) and (10) are genuinely variable-length. */
export const GS1_AI = {
  GTIN: '01',
  /** Real, deliberate repurposing, per the spec's own Section 3.1:
   *  GS1's own definition for AI (21) is "Serial Number," not
   *  "Accession Number" — this app uses it for accession number by
   *  the spec's own explicit instruction. Worth knowing if this ever
   *  needs reconciling against a real customer's own GS1 usage
   *  elsewhere (e.g. a referring lab's own product barcodes), since a
   *  scanner/downstream system reading strictly by the official AI
   *  table would label this field "Serial Number," not "Accession
   *  Number." */
  ACCESSION: '21',
  /** Same real note as ACCESSION above — GS1's own definition for AI
   *  (10) is "Batch/Lot Number," repurposed here for Block ID. */
  BLOCK_ID: '10',
} as const;

/** Real ASCII Group Separator (GS, 0x1D) — the real, standard GS1
 *  separator character. Used in the RAW/transport-level string; the
 *  ZPL-specific escape sequence ("_1", requiring ^FH) is a genuinely
 *  different representation of the same real separator, built by
 *  zplTemplates.ts, not this module. */
export const GS1_SEPARATOR = '\x1d';

export interface Gs1LabelFields {
  /** Real, required prerequisite this module cannot supply on its
   *  own: a genuine GTIN requires a real GS1 Company Prefix,
   *  registered with GS1 US (or the applicable regional GS1 Member
   *  Organisation) — a real business/legal step for ForMedrixAI LLC
   *  to complete separately, not something any code can fabricate.
   *  Deliberately a real, required parameter here (not a hardcoded
   *  default) so a real, unregistered placeholder is never silently
   *  encoded into a real, physical label. Accepts the GTIN in
   *  whatever real length it's registered at (GTIN-8/12/13/14 are all
   *  real, valid lengths) — padded to 14 digits per Section 4.1's own
   *  "GTIN must be numeric and padded to 14 digits" rule. */
  gtin: string;
  /** AI (21) — repurposed as accession number per the spec's own
   *  Section 3.1. Real max length 20 chars, alphanumeric. */
  accessionNumber: string;
  /** AI (10) — repurposed as block id. Same real length/character
   *  constraints as accessionNumber. */
  blockId: string;
}

export interface Gs1ValidationError {
  field: keyof Gs1LabelFields;
  message: string;
}

export interface Gs1BuildResult {
  /** The real, raw, transport-level GS1 string — real ASCII GS
   *  (0x1D) separators between variable-length fields, none after
   *  the last one (per GS1's own DataMatrix Guideline: "A separator
   *  character is never required after the last element string
   *  encoded in the symbol"). This is what a real Interface Engine/
   *  Local Bridge Agent would embed into an actual barcode symbol —
   *  never render this raw string directly as visible label text; it
   *  contains a real, non-printing control character. */
  raw: string;
  /** Real, human-readable form — GS1's own standard convention of
   *  parenthesized AIs (e.g. "(01)00850000000000(21)PS2026-8821(10)
   *  BLK-02"), safe to print as visible text under the barcode or
   *  show in a UI. Matches Section 4.1's own "Auto escape parentheses
   *  for ZPL encoding" language: parentheses are the human-readable
   *  form that gets converted away for the real, raw encoding. */
  humanReadable: string;
}

/** Real, deliberate rejection list, per Section 4.1's own "Illegal
 *  characters rejected (_, /, \, :)." The underscore specifically
 *  isn't an arbitrary choice — it's the literal character ZPL itself
 *  uses to introduce an escape sequence (see zplTemplates.ts) once a
 *  field is embedded in a ^FH-flagged ^FD block. A real accession
 *  number or block id containing a literal underscore could corrupt
 *  the escape sequence or inject an unintended control character into
 *  the printed barcode — rejecting it here, at validation time, is
 *  real, load-bearing safety, not a cosmetic rule. Deliberately
 *  narrower than it might look at first: the spec's own Section 4.1
 *  treats parentheses differently ("Auto escape parentheses for ZPL
 *  encoding") — escaped, not rejected — so they're handled separately
 *  below, not folded into this same reject list.
 */
const ILLEGAL_CHARS = /[_/\\:]/;

/** A literal "(" or ")" inside a real value would visually collide
 *  with this module's own human-readable AI-delimiter convention
 *  (see Gs1BuildResult.humanReadable) — escaped with a backslash
 *  here, per Section 4.1's own instruction, rather than rejected
 *  outright the way the four characters above are. */
function escapeParens(value: string): string {
  return value.replace(/([()])/g, '\\$1');
}

function validateVariableField(field: keyof Gs1LabelFields, value: string): Gs1ValidationError[] {
  const errors: Gs1ValidationError[] = [];
  if (!value.trim()) {
    errors.push({ field, message: `${field} is required.` });
    return errors;
  }
  if (value.length > 20) {
    errors.push({ field, message: `${field} exceeds the real GS1 20-character limit (got ${value.length}).` });
  }
  if (ILLEGAL_CHARS.test(value)) {
    errors.push({ field, message: `${field} contains a character this app rejects for real GS1/ZPL safety (_, /, \\, or :): "${value}".` });
  }
  if (!/^[A-Za-z0-9\-() ]*$/.test(value.replace(ILLEGAL_CHARS, ''))) {
    errors.push({ field, message: `${field} contains a character outside GS1's own alphanumeric field rules.` });
  }
  return errors;
}

/** Real, complete validation — every rule from Section 4.1, checked
 *  explicitly rather than assumed. Returns every real problem found,
 *  not just the first — an accessioner/admin fixing a rejected label
 *  should see every real issue at once, not one at a time. */
export function validateGs1Fields(fields: Gs1LabelFields): Gs1ValidationError[] {
  const errors: Gs1ValidationError[] = [];

  const gtinDigitsOnly = fields.gtin.replace(/\s/g, '');
  if (!gtinDigitsOnly) {
    errors.push({ field: 'gtin', message: 'GTIN is required.' });
  } else if (!/^\d+$/.test(gtinDigitsOnly)) {
    errors.push({ field: 'gtin', message: 'GTIN must be numeric only.' });
  } else if (gtinDigitsOnly.length > 14) {
    errors.push({ field: 'gtin', message: `GTIN exceeds 14 digits (got ${gtinDigitsOnly.length}) — real GTINs are GTIN-8/12/13/14, never longer.` });
  }

  errors.push(...validateVariableField('accessionNumber', fields.accessionNumber));
  errors.push(...validateVariableField('blockId', fields.blockId));

  return errors;
}

/** Real, honest padding — GS1's own AI (01) is always encoded as
 *  exactly 14 digits regardless of the real GTIN's own native length
 *  (GTIN-8/12/13 are each left-padded with zeros to reach 14) — see
 *  Section 4.1's own "GTIN must be numeric and padded to 14 digits." */
function padGtin(gtin: string): string {
  return gtin.replace(/\s/g, '').padStart(14, '0');
}

/** Real, honest stripping — the four rejected characters (_, /, \, :)
 *  are stripped here before encoding into the RAW string, as a
 *  second, defense-in-depth layer — validateGs1Fields should already
 *  have rejected these before this is ever called, but this function
 *  never silently encodes a value it hasn't itself confirmed is
 *  clean, in case a caller skips validation. Parentheses are left
 *  alone here — they're real, legal characters in the raw GS1
 *  encoding itself; escaping only matters for the human-readable
 *  string, built separately below. */
function sanitizeForEncoding(value: string): string {
  return value.replace(ILLEGAL_CHARS, '').trim();
}

/** Real, top-level entry point — builds both the raw (transport/
 *  barcode-symbol) and human-readable GS1 strings from real label
 *  fields. Returns null if validateGs1Fields finds any real problem —
 *  callers should always validate first and surface real, specific
 *  errors to the user rather than relying on this to fail silently. */
export function buildGs1DataMatrix(fields: Gs1LabelFields): Gs1BuildResult | null {
  if (validateGs1Fields(fields).length > 0) return null;

  const gtin = padGtin(fields.gtin);
  const accession = sanitizeForEncoding(fields.accessionNumber);
  const blockId = sanitizeForEncoding(fields.blockId);

  // Real, correct GS1 structure: AI(01) is fixed-length (14 digits) —
  // no separator ever needed after it, the decoder always knows to
  // read exactly 14 more characters. AI(21) is variable-length and is
  // NOT the last element here, so it's followed by a real GS
  // separator. AI(10) is variable-length but IS the last element, so
  // — per GS1's own DataMatrix Guideline — no trailing separator is
  // used or needed.
  const raw = `${GS1_AI.GTIN}${gtin}${GS1_AI.ACCESSION}${accession}${GS1_SEPARATOR}${GS1_AI.BLOCK_ID}${blockId}`;
  const humanReadable = `(${GS1_AI.GTIN})${gtin}(${GS1_AI.ACCESSION})${escapeParens(fields.accessionNumber.trim())}(${GS1_AI.BLOCK_ID})${escapeParens(fields.blockId.trim())}`;

  return { raw, humanReadable };
}
