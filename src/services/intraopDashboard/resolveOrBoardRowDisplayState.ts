// src/services/intraopDashboard/resolveOrBoardRowDisplayState.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "there shouldn't be any business logic in
// the UI at all unless it's compulsory... it's the only way I know to
// prevent/control performance issues when load gets applied." This is
// the pure extraction of what OrSuiteDashboardPage.tsx's own row
// rendering used to compute inline, every second, for every row, via
// one shared parent-level tick — see OrBoardRow.tsx's own header for
// the real, paired performance fix this enables (per-row isolated
// timers instead of one parent-wide re-render).
//
// Pure — no React, no timers, no service calls. Everything here is a
// real, testable decision, not formatting: which row-state class
// applies, whether the flash animation should play, and which
// timestamp is authoritative for the displayed elapsed time (a real
// business rule from the OR Live Board's own spec — freeze at the
// real moment of sign-off, never keep counting past it).
// ─────────────────────────────────────────────────────────────────────────────

import type { ActiveIntraopRequest } from './resolveActiveIntraopRequestsForLocations';

function formatElapsedMMSS(startIso: string, endIso: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  const mm = Math.floor(elapsedSeconds / 60);
  const ss = elapsedSeconds % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export interface OrBoardRowDisplayState {
  isCompleted: boolean;
  isFlashing: boolean;
  rowClass: string;
  elapsedDisplay: string;
}

export function resolveOrBoardRowDisplayState(
  req: ActiveIntraopRequest,
  now: string,
  hasAlreadyFlashed: boolean,
  isDismissing: boolean,
): OrBoardRowDisplayState {
  const isCompleted = req.diagnosisRendered;
  const isFlashing = isCompleted && !hasAlreadyFlashed;

  const elapsedDisplay = isCompleted && req.frozenDiagnosisRenderedAt
    ? formatElapsedMMSS(req.arrivalTimestamp, req.frozenDiagnosisRenderedAt)
    : formatElapsedMMSS(req.arrivalTimestamp, now);

  const rowClass = [
    'ps-orboard-row',
    isCompleted ? 'ps-orboard-row--completed' : `ps-orboard-row--${req.tat.status}`,
    isFlashing ? 'ps-orboard-row--flashing' : '',
    isDismissing ? 'ps-orboard-row--dismissing' : '',
  ].filter(Boolean).join(' ');

  return { isCompleted, isFlashing, rowClass, elapsedDisplay };
}
