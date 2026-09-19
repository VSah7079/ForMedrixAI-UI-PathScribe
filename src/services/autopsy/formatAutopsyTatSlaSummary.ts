// src/services/autopsy/formatAutopsyTatSlaSummary.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "it all needs to be wired." Kept as its
// own pure function rather than inline JSX string interpolation — the
// real range-vs-single-figure logic (a jurisdiction can report either
// a genuine range or one fixed figure, per resolveAutopsyTatSlaMatrix.ts's
// own header comment: "a real admin/report needs to know the honest
// range, not a single figure that quietly picks one side of it") is
// genuine, testable logic, not just interpolation.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyTatSlaConfig } from './resolveAutopsyTatSlaMatrix';

function formatRange(min: number, max: number, unit: string): string {
  return min === max ? `${min} ${unit}` : `${min}\u2013${max} ${unit}`;
}

export function formatAutopsyTatSlaSummary(config: AutopsyTatSlaConfig): string {
  const padUnitLabel = config.padUnit === 'working_days' ? 'working days' : 'hours';
  const fadUnitLabel = config.fadUnit === 'working_days' ? 'working days' : 'days';
  const pad = formatRange(config.padMin, config.padMax, padUnitLabel);
  const fad = formatRange(config.fadMin, config.fadMax, fadUnitLabel);
  const complexFad = formatRange(config.complexFadMin, config.complexFadMax, fadUnitLabel);
  return `TAT: PAD within ${pad}, FAD within ${fad} (${complexFad} if complex) \u2014 per ${config.governingStandard}`;
}
