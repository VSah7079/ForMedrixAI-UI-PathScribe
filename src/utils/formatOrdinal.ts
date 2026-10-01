// src/utils/formatOrdinal.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared per-locale ordinal-number formatter, extracted from
// AmendmentModal.tsx (its own version-history ordinal labels — "1st
// Amended", "2nd Amended"...) so PreFinalisationModal.tsx's specimen
// transmission-order labels can reuse the same real, correct ordinal
// forms instead of each maintaining its own copy.
//
// i18n note: ordinal labels need a real per-locale ordinal form, not
// just a translated noun around an English suffix — English's
// letter-suffix scheme (st/nd/rd/th) doesn't carry over to fr/de/nl/ko.
// Each locale gets its own standard ordinal notation; the formatted
// ordinal is then interpolated as an opaque value into a translated
// sentence around it.
// ─────────────────────────────────────────────────────────────────────────────

const ORDINAL_SUFFIX_EN = ['th', 'st', 'nd', 'rd'];

export function formatOrdinal(n: number, lang: string): string {
  // Batch 362: a regional variant (nl-BE) uses its language's form.
  switch (lang.split('-')[0]) {
    case 'fr': return n === 1 ? '1er' : `${n}e`;
    case 'de': return `${n}.`;
    case 'nl': return `${n}e`;
    case 'ko': return `${n}번째`;
    default: {
      const v = n % 100;
      return `${n}${ORDINAL_SUFFIX_EN[(v - 20) % 10] || ORDINAL_SUFFIX_EN[v] || ORDINAL_SUFFIX_EN[0]}`;
    }
  }
}
