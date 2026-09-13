// src/services/cytology/resolveCisoeAReflexRecommendation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own request: "reflex-threshold triggers
// (colposcopy referral, HPV genotype recommendation) keyed off real
// CISOE-A score values" — deferred from PS-183, built here against
// real, direct research (not assumed or borrowed from Germany's own,
// different thresholds):
//
// - "BMD" (Borderline or Mild Dyskaryosis, S/O/E 2-4 — Bethesda
//   ASC-US through LSIL) is a real, established, combined Dutch
//   screening category (Bulkmans et al., PMC1770272; "BMD smears
//   (Pap 2 + Pap 3a1)"). Real, direct confirmation that HPV genotyping
//   (16/18 vs. other high-risk) is the actual real triage tool used
//   for hrHPV-positive BMD, to decide between direct colposcopy
//   referral and repeat cytology — not an invented rule (Bonde et al.,
//   AACR CEBP 2024, evaluating real genotyping triage strategies
//   specifically for this range).
// - Real, distinctively Dutch referral threshold, worth noting: the
//   Netherlands has used a minimum 20% short-term CIN3+ PPV for direct
//   colposcopy referral — genuinely higher, more conservative, than
//   the 10% PPV threshold used in the US. Real S/O/E >= 5 (moderate
//   dyskaryosis/Pap 3a2 or worse, mapping to HSIL+) is high-risk
//   enough to clear that higher real bar directly, matching every
//   other real HSIL+ referral rule already built in this module.
//
// Real, additive suggestion only, same real posture as this module's
// own other reflex-recommendation work (resolveGermanCytologyTriageRecommendation.ts):
// never forces a recommendation onto a review — the real reviewer
// still selects recommendations themselves.
// ─────────────────────────────────────────────────────────────────────────────

import type { CisoeAScore } from '@/types/cytology/CisoeAScore';

export function resolveCisoeAReflexRecommendation(
  score: Pick<CisoeAScore, 'squamous' | 'otherEndometrium' | 'endocervical'>,
): 'cyto-rec-colposcopy' | 'cyto-rec-hpv-genotyping' | undefined {
  const maxAxisValue = Math.max(score.squamous.value, score.otherEndometrium.value, score.endocervical.value);

  if (maxAxisValue >= 5) return 'cyto-rec-colposcopy';
  if (maxAxisValue >= 2) return 'cyto-rec-hpv-genotyping';
  return undefined;
}
