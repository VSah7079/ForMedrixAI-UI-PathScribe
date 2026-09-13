// src/services/cytologyQc/resolveQcSlaStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §2.3's own TAT Monitoring — a real, configurable SLA
// window (createdAt -> slaDeadline) a case is checked against.
// "Approaching" is a real, useful warning state before an actual
// breach, not just binary on-time/breached — a real reviewer benefits
// from seeing a case is about to breach, not just after it already
// has. Pure — no clock of its own; the real caller passes "now."
// ─────────────────────────────────────────────────────────────────────────────

export type QcSlaStatus = 'on_time' | 'approaching' | 'breached';

const APPROACHING_THRESHOLD_FRACTION = 0.8;

export function resolveQcSlaStatus(createdAt: string, slaDeadline: string, now: string): QcSlaStatus {
  const totalWindowMs = new Date(slaDeadline).getTime() - new Date(createdAt).getTime();
  const elapsedMs = new Date(now).getTime() - new Date(createdAt).getTime();

  if (elapsedMs >= totalWindowMs) return 'breached';
  if (totalWindowMs > 0 && elapsedMs / totalWindowMs >= APPROACHING_THRESHOLD_FRACTION) return 'approaching';
  return 'on_time';
}
