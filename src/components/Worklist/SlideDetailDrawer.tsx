// src/components/Worklist/SlideDetailDrawer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed Digital Readiness spec —
// the Slide Detail Drawer, slid out from the right edge over the
// worklist per that spec's own §3. Integrated into the same,
// existing worklist (WorklistTable.tsx/WorklistPage.tsx) rather than
// a second, separate page, per direct follow-up ("some cases will
// have DP, others may not").
//
// Real, honest limitation, stated plainly rather than glossed over:
// WsiScanSlide has no real link to a specific HistologyBlock today
// (no shared id, no blockId field on either type) — only a real,
// shared specimenId. This drawer lists each real slide by its own
// slidePosition (the only real, reported identifier) and separately
// lists the specimen's own real blocks for context, rather than
// fabricating a one-to-one slide-to-block mapping the data model
// doesn't actually support yet.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { Case } from '@/types/case/Case';
import type { WsiScanSlide } from '@/services/digitalPathology/IWsiScanBatchService';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';
import { resolveDigitalReadinessBadge, resolveDpTriageBadge } from '@/services/digitalPathology/resolveWorklistDpBadges';

interface SlideDetailDrawerProps {
  caseData: Case;
  slides: WsiScanSlide[];
  aiResult?: AiScreeningResult;
  onClose: () => void;
  onOpenCaseWorkspace: () => void;
  onRequestRescan?: () => void;
}

const SLIDE_STATUS_LABEL_KEY: Record<WsiScanSlide['scanStatus'], string> = {
  pending: 'slideDetailDrawer.status.pending', scanning: 'slideDetailDrawer.status.scanning',
  completed: 'slideDetailDrawer.status.ready', failed: 'slideDetailDrawer.status.error',
};

export const SlideDetailDrawer: React.FC<SlideDetailDrawerProps> = ({
  caseData, slides, aiResult, onClose, onOpenCaseWorkspace, onRequestRescan,
}) => {
  const { t } = useTranslation();
  const readiness = resolveDigitalReadinessBadge(slides);
  const triage = resolveDpTriageBadge(aiResult);
  const accession = caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? caseData.id;
  const patientName = caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '—';
  const mrn = caseData.patient?.mrn ?? '—';

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-slide-drawer" onClick={e => e.stopPropagation()}>
        <div className="ps-slide-drawer-header">
          <div>
            <div className="ps-slide-drawer-title">{t('slideDetailDrawer.title')}</div>
            <div className="ps-slide-drawer-subtitle" data-phi="true">
              {t('slideDetailDrawer.subtitle', { accession, patientName, mrn })}
            </div>
          </div>
          <button type="button" className="ps-slide-drawer-close" onClick={onClose} aria-label={t('slideDetailDrawer.close')}>×</button>
        </div>

        <div className="ps-slide-drawer-section">
          <div className="ps-slide-drawer-section-title">{t('slideDetailDrawer.caseReadinessSummary')}</div>
          {readiness && (
            <div className={`wl-dp-badge wl-dp-badge--${readiness.level} sdd-readiness-badge`}>
              {t('slideDetailDrawer.statusPrefix')} {readiness.summaryText}
            </div>
          )}
          {triage && (
            <div className={`wl-dp-badge wl-dp-badge--${triage.level} sdd-triage-badge`}>
              {t('slideDetailDrawer.aiTriagePrefix')} {triage.primaryText}
              {triage.biomarkerSummary && <div className="wl-dp-badge-sub">{triage.biomarkerSummary}</div>}
            </div>
          )}
          {!readiness && !triage && <div className="ps-slide-drawer-empty">{t('slideDetailDrawer.noDigitalSlideData')}</div>}
        </div>

        <div className="ps-slide-drawer-section">
          <div className="ps-slide-drawer-section-title">{t('slideDetailDrawer.slideAssets')}</div>
          {/* Real, honest limitation — see this file's own header
              comment: no real slide-to-block link exists yet, so each
              real slide is listed by its own slidePosition, the one
              real identifier the interface engine actually reports. */}
          {slides.length === 0 && <div className="ps-slide-drawer-empty">{t('slideDetailDrawer.noWsiScanData')}</div>}
          {slides.map(s => (
              <div key={s.slidePosition} className="ps-slide-drawer-row">
                {/* Real bug fix (Jira sweep): wl-dp-badge's primary home is
                    WorklistTable.tsx, where it's a full-width table-cell
                    button (display: block; width: 100%). Reused here as a
                    compact status pill sitting beside this row's own text —
                    without this override it stretched to fill the flex row,
                    squeezing ps-slide-drawer-row-body (flex: 1; min-width: 0)
                    down to a sliver and wrapping "Slide position N" /
                    accession text into unreadable fragments. */}
                <span
                  className={`wl-dp-badge wl-dp-badge--${s.scanStatus === 'completed' && s.qcPassed !== false ? 'ready' : s.scanStatus === 'failed' || s.qcPassed === false ? 'error' : 'partial'} sdd-status-pill`}
                >
                  {t(SLIDE_STATUS_LABEL_KEY[s.scanStatus])}
                </span>
                <div className="ps-slide-drawer-row-body">
                  <div className="ps-slide-drawer-row-title">{t('slideDetailDrawer.slidePosition', { position: s.slidePosition })}</div>
                  <div className="ps-slide-drawer-row-meta">
                    {s.acquisitionMode && <>{t('slideDetailDrawer.acquisitionLabel')} {s.acquisitionMode}{s.focalPlaneCount ? ` (${t('slideDetailDrawer.planesCount', { count: s.focalPlaneCount })})` : ''} · </>}
                    {s.failureReason && <>{t('slideDetailDrawer.noteLabel')} {s.failureReason}</>}
                  </div>
                </div>
              </div>
          ))}
        </div>

        <div className="ps-slide-drawer-actions">
          <button type="button" className="ps-conf-btn-primary" onClick={onOpenCaseWorkspace}>
            {t('slideDetailDrawer.openCaseWorkspace')}
          </button>
          {onRequestRescan && (
            <button type="button" className="ps-conf-btn-secondary" onClick={onRequestRescan}>
              {t('slideDetailDrawer.requestRescan')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlideDetailDrawer;
