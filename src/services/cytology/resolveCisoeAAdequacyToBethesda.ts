// src/services/cytology/resolveCisoeAAdequacyToBethesda.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, small, additive mapping — CISOE-A has no real adequacy
// dictionary entries of its own (palga_cisoea carries no
// CytologyCategoryEntry rows at all, per CisoeAScore.ts's own design),
// so a real CISOE-A review's own 3-tier adequacy value needs a real
// Bethesda-equivalent adequacy category id to drive
// resolveCytologySignOutGate.ts's own isUnsatisfactory check — the
// same real "populate primaryInterpretationId with the mapped
// equivalent so every existing resolver keeps working unmodified"
// principle resolveCisoeAToBethesda.ts already established for the
// interpretation axes.
//
// Real, deliberate: 'suboptimal' maps to the real satisfactory
// category, not the unsatisfactory one — CISOE-A's own real A2 tier
// is a real, technically-limited-but-still-usable specimen, not a
// genuinely inadequate one; only real A3 (unsatisfactory) blocks
// independent CT sign-out.
// ─────────────────────────────────────────────────────────────────────────────

import type { CisoeAAdequacy } from '@/types/cytology/CisoeAScore';

export function resolveCisoeAAdequacyToBethesda(adequacy: CisoeAAdequacy): string {
  if (adequacy === 'unsatisfactory') return 'cyto-adeq-processed-insufficient';
  return 'cyto-adeq-satisfactory';
}
