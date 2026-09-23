// src/components/OrSuiteDashboard/OrBoardRow.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "there shouldn't be any business logic in
// the UI at all unless it's compulsory... it's the only way I know to
// prevent/control performance issues when load gets applied." Two
// real, paired fixes to OrSuiteDashboardPage.tsx's own previous
// design (one parent-level 1-second tick forcing every row to
// recompute its full derived state, every second, regardless of
// whether that row's own data changed):
//
// 1. All decision logic (resolveOrBoardRowDisplayState.ts) is pure
//    and lives outside this component entirely — this file only
//    calls it and renders the result.
// 2. The compulsory part — a visible clock has to tick somewhere —
//    is isolated to THIS row's own internal timer, not a shared
//    parent-level one. Real, deliberate: the interval only runs while
//    this specific row is genuinely still in progress
//    (!diagnosisRendered) — a completed row's timer is frozen, so it
//    has no real reason to keep ticking at all, closing that cost
//    entirely rather than just moving it.
//
// Wrapped in React.memo so a sibling row's own internal tick (or the
// parent's real 15-second data poll, when this row's own data hasn't
// actually changed) never forces this row to re-render. At real
// scale — dozens or hundreds of active rows across a Multi-Suite
// Overview — this is the real difference between N independent,
// cheap per-row updates and one expensive, repeated full-list
// recomputation every second.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveOrBoardRowDisplayState } from '@/services/intraopDashboard/resolveOrBoardRowDisplayState';
import type { ActiveIntraopRequest, CurrentWorkflowStep } from '@/services/intraopDashboard/resolveActiveIntraopRequestsForLocations';

// Real i18n-sweep fix: resolveCurrentWorkflowStep() used to return the
// English display string directly, with no way to translate it. It now
// returns a stable key; this map supplies the translated label.
const WORKFLOW_STEP_LABEL_KEY: Record<CurrentWorkflowStep, string> = {
  grossing:           'orSuiteDashboard.workflowStep.grossing',
  touch_prep:         'orSuiteDashboard.workflowStep.touchPrep',
  sectioning:         'orSuiteDashboard.workflowStep.sectioning',
  pathologist_review: 'orSuiteDashboard.workflowStep.pathologistReview',
};

interface OrBoardRowProps {
  req: ActiveIntraopRequest;
  hasFlashed: boolean;
  isDismissing: boolean;
  onFlashed: (specimenId: string) => void;
  onLogVerbalReport: (req: ActiveIntraopRequest) => void;
  onDismiss: (req: ActiveIntraopRequest) => void;
}

const OrBoardRow: React.FC<OrBoardRowProps> = ({ req, hasFlashed, isDismissing, onFlashed, onLogVerbalReport, onDismiss }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    // Real, per this file's own header — a completed row's own timer
    // is frozen (resolveOrBoardRowDisplayState.ts already handles
    // that), so there is no real reason to keep this row's own
    // interval running once it's done. Closes the cost, not just
    // relocates it.
    if (req.diagnosisRendered) return;
    const interval = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(interval);
  }, [req.diagnosisRendered]);

  const { isCompleted, isFlashing, rowClass, elapsedDisplay } = resolveOrBoardRowDisplayState(req, now, hasFlashed, isDismissing);

  return (
    <div className={rowClass} onAnimationEnd={() => isFlashing && onFlashed(req.specimenId)}>
      <div className="ps-orboard-row-context">
        <div className="ps-orboard-row-patient" data-phi="name">{req.patientName}</div>
        <div className="ps-orboard-row-meta">
          {t('orSuiteDashboard.rowMeta', { specimenLabel: req.specimenLabel, surgeon: req.surgeon, pathologist: req.pathologistName })}
        </div>
      </div>
      <div className="ps-orboard-row-timer">
        {elapsedDisplay}
      </div>
      <div className="ps-orboard-row-diagnostic">
        {isCompleted
          ? <span className="ps-orboard-row-preliminary">{t('orSuiteDashboard.preliminaryLabel', { diagnosis: req.frozenSectionDiagnosis ?? '' })}</span>
          : <span className="ps-orboard-row-step">{t(WORKFLOW_STEP_LABEL_KEY[req.currentWorkflowStep])}</span>}
      </div>
      <div className="ps-orboard-row-actions">
        {isCompleted ? (
          <button className="ps-orboard-dismiss-btn" onClick={() => onDismiss(req)}>
            {t('orSuiteDashboard.dismissCase')}
          </button>
        ) : (
          <>
            <button className="ps-orboard-inprogress-btn" disabled>{t('orSuiteDashboard.inProgress')}</button>
            <button className="ps-orboard-verbal-report-link" onClick={() => onLogVerbalReport(req)}>{t('orSuiteDashboard.logVerbalReport')}</button>
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(OrBoardRow);
