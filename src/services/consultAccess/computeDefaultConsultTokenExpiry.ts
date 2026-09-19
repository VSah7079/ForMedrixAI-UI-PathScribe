// src/services/consultAccess/computeDefaultConsultTokenExpiry.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-290 §2, "Default Lifespan: aligned with clinical workflow — 24-hour
// default window, 72 hours if spanning a weekend." A pure, testable rule,
// not embedded inline in the issuance service — same separation-of-concerns
// precedent as computeSlaCountdown.ts (facilityOpsDashboard/).
//
// Rule: compute the naive 24-hour window from issuedAt. If either endpoint
// of that window falls on a Saturday or Sunday, the window "spans a
// weekend" and the real lifespan is 72 hours instead — a flat 72h from
// issuedAt, exactly as the spec states it (not "extend until Monday"; the
// spec's own wording is a fixed alternate duration, not a rolling
// adjustment). Uses local time (Date.getDay()), matching how a pathologist
// issuing the link actually experiences the calendar — not UTC.
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 60 * 60 * 1000;

function isWeekendDay(d: Date): boolean {
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

export function computeDefaultConsultTokenExpiry(issuedAt: Date): Date {
  const naive24h = new Date(issuedAt.getTime() + 24 * MS_PER_HOUR);
  const spansWeekend = isWeekendDay(issuedAt) || isWeekendDay(naive24h);
  const hours = spansWeekend ? 72 : 24;
  return new Date(issuedAt.getTime() + hours * MS_PER_HOUR);
}
