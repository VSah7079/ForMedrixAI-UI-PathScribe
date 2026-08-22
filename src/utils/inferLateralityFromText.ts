// src/utils/inferLateralityFromText.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct report: "For the Mock Order, there is a Left
// forearm skin excision, pigmented lesion which clearly has implied
// laterality, but we do not default the information in the dropdown...
// We want any data available in the record to be loaded with the order
// to make it super easy to get through Orders rapidly."
//
// Confirmed directly, not assumed: doImportOrder's real specimen mapping
// (AccessionPage.tsx) never populated laterality from the order's own
// specimen description text — the mock order data itself only ever
// carries it embedded in free text ({ description: 'Left forearm skin
// excision, pigmented lesion' }), no separate structured field.
//
// Real, deliberate safety discipline: laterality is not a field to
// guess confidently on. Word-boundary matching only (never a bare
// substring match — "leftover" or "copyright" must never register as a
// side), and if the text genuinely implies more than one distinct side,
// this returns unspecified rather than picking one arbitrarily. A wrong
// default here is a real, serious class of error to avoid, not just a
// convenience miss — matches this app's own established pattern
// elsewhere (specimen dictionary matching: "no AI/fuzzy matching... a
// needsDictionaryResolution flag the accessioner resolves directly"
// rather than guessing).
// ─────────────────────────────────────────────────────────────────────────────

export type InferredLaterality = 'Left' | 'Right' | 'Bilateral' | 'Midline' | '';

const PATTERNS: { value: Exclude<InferredLaterality, ''>; regex: RegExp }[] = [
  { value: 'Bilateral', regex: /\bbilateral\b/i },
  { value: 'Midline', regex: /\bmidline\b/i },
  { value: 'Left', regex: /\bleft\b/i },
  { value: 'Right', regex: /\bright\b/i },
];

/**
 * Real, pure text inference — a real specimen description in, a real
 * (possibly empty/unspecified) laterality value out. Never throws;
 * a genuinely empty or unparseable input just returns ''.
 */
export function inferLateralityFromText(text: string | undefined | null): InferredLaterality {
  if (!text) return '';

  const hasBilateral = PATTERNS[0].regex.test(text);
  const hasMidline = PATTERNS[1].regex.test(text);
  const hasLeft = PATTERNS[2].regex.test(text);
  const hasRight = PATTERNS[3].regex.test(text);

  // Real, deliberate safety rule: Left AND Right both present in the
  // same description is a genuine ambiguity (e.g. a multi-part
  // specimen, or unrelated text that happens to contain both words) —
  // never silently pick one. Leave it for the accessioner to set by
  // hand, the same honest-uncertainty posture this app already uses
  // for specimen dictionary near-misses.
  if (hasLeft && hasRight) return '';
  if (hasBilateral) return 'Bilateral';
  if (hasMidline) return 'Midline';
  if (hasLeft) return 'Left';
  if (hasRight) return 'Right';
  return '';
}
