// src/utils/specimenLabeling.ts
// ─────────────────────────────────────────────────────────────
// Single source of truth for specimen/block label generation — see
// Facility.specimenLabelStyle's own doc comment (IFacilityService.ts) for
// the full CAP/NSH reasoning behind why this is one alternating-pair
// enum rather than two independent alpha/numeric toggles.
//
// Both AccessionPage.tsx (specimen labels) and the block-generation
// logic (block labels) call into this file, so the pairing logic only
// ever lives in one place — a component picking its own alpha/numeric
// scheme independently per level is exactly the bug this file exists
// to make impossible.
// ─────────────────────────────────────────────────────────────

export type SpecimenLabelStyle = 'alpha-specimen' | 'numeric-specimen';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Specimen label at a given position (0-indexed). */
export function getSpecimenLabel(index: number, style: SpecimenLabelStyle = 'alpha-specimen'): string {
  if (style === 'numeric-specimen') return `${index + 1}`;
  // alpha-specimen — same double-letter fallback logic that already
  // existed in AccessionPage.tsx before this file, just centralized:
  // A..Z, then AA, AB... once a case genuinely has more than 26 parts.
  if (index < ALPHA.length) return ALPHA[index];
  const first = Math.floor(index / ALPHA.length) - 1;
  const second = index % ALPHA.length;
  return `${ALPHA[first]}${ALPHA[second]}`;
}

/**
 * Block label at a given position (0-indexed) — always the OPPOSITE
 * symbol type from the specimen label, per the CAP/NSH alternating
 * pattern. This is what makes "Specimen 1, Block 1" structurally
 * impossible: block labeling is never independently configurable from
 * specimen labeling, it's always derived as the other type.
 */
export function getBlockLabel(index: number, specimenStyle: SpecimenLabelStyle = 'alpha-specimen'): string {
  // Specimen is alpha -> block is numeric, and vice versa.
  const blockStyle: SpecimenLabelStyle = specimenStyle === 'alpha-specimen' ? 'numeric-specimen' : 'alpha-specimen';
  return getSpecimenLabel(index, blockStyle);
}
