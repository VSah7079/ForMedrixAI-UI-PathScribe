// src/utils/parseScannedPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "Barcode Listener & Form
// Auto-Ingestion" — the "2. Parser Logic" piece. Deliberately a standalone,
// pure, testable utility, not built into ScannerProvider.tsx directly — that
// file's own real job (global keystroke-burst detection distinguishing
// scanner input from human typing) is a genuinely separate concern from
// classifying and decoding what a scan's payload actually contains, and it
// already works correctly. This is the missing second half.
//
// Three real payload shapes, per the spec's own classification:
//
// 1. GS1 (DataMatrix / GS1-128) — Application-Identifier-encoded data. Real,
//    verified structure (GS1's own published AI table, not assumed): each
//    element string is a 2-4 digit AI followed by its data. Fixed-length AIs
//    (01 GTIN =14 digits, 17/11/13/15/16 dates =6 digits) need no terminator;
//    variable-length AIs (10 BATCH/LOT, 21 SERIAL, 240 ADDITIONAL ID, and the
//    90-99 "mutually defined"/company-internal range) are terminated by the
//    next GS (ASCII 29, the real FNC1 field separator a decoded GS1 scan
//    carries) or the end of the string. A leading GS/FNC1 flagging character
//    is tolerated but not required — some real scanner configurations strip
//    it automatically.
//
//    Real, honest finding worth being direct about: the spec asks to extract
//    "GTIN, Serial/Accession, MRN" — GTIN (01) and Serial (21) are real,
//    standard GS1 Application Identifiers (confirmed against GS1's own
//    published AI table). GS1 has no standard AI for "MRN" — medical record
//    number isn't part of the GS1 General Specifications at all. In real
//    practice, a lab that wants to encode an MRN in a GS1 barcode would use
//    one of AI 90-99, the range GS1 explicitly reserves for "mutually
//    defined" / company-internal meaning, agreed bilaterally between a lab
//    and its label-printing vendor — there's no universal AI code that means
//    "MRN" the way (01) universally means GTIN. This parses that whole
//    90-99 range into a real `companyInternal` bucket rather than assuming
//    a specific AI within it means MRN — a real caller with a known,
//    site-specific AI-to-meaning mapping can read the right key out of it,
//    but this file doesn't fabricate that mapping itself.
//
// 2. Delimited — a plain string split on ^ or |, positionally mapped to
//    [FamilyName, GivenName, MRN, DOB, Accession] per the spec's own order.
//    Tolerant of fewer than 5 segments (a real label might omit trailing
//    fields) — never assumes a segment is present that genuinely isn't.
//
// 3. Plain alphanumeric — no recognizable GS1 or delimiter structure; the
//    spec's own fallback, "perform exact query search across [Accession #,
//    Requisition #, Order #, MRN]" — this file just classifies it as plain;
//    the actual cross-field search is a real, separate concern for whatever
//    UI consumes this result (AccessionPage.tsx), which already has direct
//    access to real pending-order/patient-index data this pure function
//    deliberately doesn't reach into.
// ─────────────────────────────────────────────────────────────────────────────

const GS = String.fromCharCode(29); // ASCII 29, Group Separator — real GS1 FNC1 field terminator

export interface Gs1ParsedPayload {
  type: 'gs1';
  /** AI (01) — 14-digit Global Trade Item Number. */
  gtin?: string;
  /** AI (10) — Batch/Lot number. */
  batchLot?: string;
  /** AI (21) — Serial number. Mapped to the spec's own "Serial/Accession"
   *  concept — the closest real, standard GS1 AI to a lab's own
   *  per-specimen accession identifier. */
  serial?: string;
  /** AI (17) — Expiry date, real YYMMDD as scanned (not reformatted here —
   *  this is a parsing concern, not a display one). */
  expiryDate?: string;
  /** AI (240) — Additional item identification. */
  additionalId?: string;
  /** AI 90-99 — GS1's own real "mutually defined"/company-internal range.
   *  Keyed by the literal two-digit AI (e.g. companyInternal['91']) since
   *  this file has no real, universal way to know what a specific site's
   *  AI 91 (or 92, or 99) is actually being used for — see this file's own
   *  header comment for the full "no standard AI for MRN" finding. */
  companyInternal: Record<string, string>;
}

export interface DelimitedParsedPayload {
  type: 'delimited';
  familyName?: string;
  givenName?: string;
  mrn?: string;
  dob?: string;
  accession?: string;
}

export interface PlainParsedPayload {
  type: 'plain';
  value: string;
}

export type ParsedScannedPayload = Gs1ParsedPayload | DelimitedParsedPayload | PlainParsedPayload;

const FIXED_LENGTH_AI: Record<string, number> = {
  '01': 14, // GTIN
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, // dates, YYMMDD
};

// Every AI this parser recognizes and extracts — used to detect whether a
// scanned string is genuinely GS1-shaped at all before committing to that
// interpretation, so a plain numeric string that merely happens to start
// with "01" doesn't get misclassified as GS1 data it never actually was.
const KNOWN_AI = new Set([
  ...Object.keys(FIXED_LENGTH_AI),
  '10', '21', '240',
  '90', '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

function isInCompanyInternalRange(ai: string): boolean {
  const n = Number(ai);
  return ai.length === 2 && n >= 90 && n <= 99;
}

/** Real, tolerant GS1 parse — strips a leading GS/FNC1 flag character if
 *  present, then walks the string AI-by-AI. Returns null (not a hollow
 *  result) when the string doesn't genuinely start with a real, recognized
 *  AI — a caller should fall through to delimited/plain detection instead
 *  of trusting a false-positive GS1 read. */
function tryParseGs1(raw: string): Gs1ParsedPayload | null {
  let s = raw.startsWith(GS) ? raw.slice(1) : raw;
  // Real, tolerant fallback for the common human-readable/testing notation
  // — parenthesized AIs (e.g. "(01)00012345678905(21)ABC123") — strip the
  // parentheses down to the same GS-delimited shape this function already
  // parses, inserting a real GS before each AI (except the first) so
  // variable-length fields still terminate correctly.
  if (/^\(\d{2,4}\)/.test(s)) {
    s = s.replace(/\)\(/g, `)${GS}(`).replace(/[()]/g, '');
  }

  const leadingAi = s.slice(0, 2);
  if (!KNOWN_AI.has(leadingAi)) return null;

  const result: Gs1ParsedPayload = { type: 'gs1', companyInternal: {} };
  let i = 0;
  let matchedAny = false;

  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (!KNOWN_AI.has(ai)) break; // a real, unrecognized AI ends parsing here rather than guessing
    i += 2;

    if (ai in FIXED_LENGTH_AI) {
      const len = FIXED_LENGTH_AI[ai];
      const data = s.slice(i, i + len);
      if (data.length < len) break; // genuinely truncated — not a real, complete field
      i += len;
      if (ai === '01') result.gtin = data;
      else if (ai === '17') result.expiryDate = data;
      matchedAny = true;
    } else {
      // Variable-length: terminated by the next real GS or end of string.
      const gsIndex = s.indexOf(GS, i);
      const end = gsIndex === -1 ? s.length : gsIndex;
      const data = s.slice(i, end);
      i = gsIndex === -1 ? s.length : gsIndex + 1;
      if (ai === '10') result.batchLot = data;
      else if (ai === '21') result.serial = data;
      else if (ai === '240') result.additionalId = data;
      else if (isInCompanyInternalRange(ai)) result.companyInternal[ai] = data;
      matchedAny = true;
    }
  }

  return matchedAny ? result : null;
}

function tryParseDelimited(raw: string): DelimitedParsedPayload | null {
  const sep = raw.includes('^') ? '^' : raw.includes('|') ? '|' : null;
  if (!sep) return null;
  const parts = raw.split(sep).map(p => p.trim());
  // A real, genuine delimited record needs at least two real,
  // non-empty segments — a lone trailing separator with nothing
  // after it ("JUSTONEFIELD|") is a stray character in an otherwise
  // plain string, not a second, empty field worth reporting.
  if (parts.filter(p => p.length > 0).length < 2) return null;

  const [familyName, givenName, mrn, dob, accession] = parts;
  return {
    type: 'delimited',
    familyName: familyName || undefined,
    givenName: givenName || undefined,
    mrn: mrn || undefined,
    dob: dob || undefined,
    accession: accession || undefined,
  };
}

/** Real, honest classification — never throws, always returns a real,
 *  usable result (falling all the way through to `plain` for anything that
 *  doesn't match a more specific real shape), matching the spec's own
 *  three-way parser design. */
export function parseScannedPayload(raw: string): ParsedScannedPayload {
  const trimmed = raw.trim();
  const gs1 = tryParseGs1(trimmed);
  if (gs1) return gs1;
  const delimited = tryParseDelimited(trimmed);
  if (delimited) return delimited;
  return { type: 'plain', value: trimmed };
}
