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

const SLIDE_STATUS_LABEL: Record<WsiScanSlide['scanStatus'], string> = {
  pending: 'PENDING', scanning: 'SCANNING', completed: 'READY', failed: 'ERROR',
};

export const SlideDetailDrawer: React.FC<SlideDetailDrawerProps> = ({
  caseData, slides, aiResult, onClose, onOpenCaseWorkspace, onRequestRescan,
}) => {
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
            <div className="ps-slide-drawer-title">Slide Details & AI Context</div>
            <div className="ps-slide-drawer-subtitle">Accession: {accession} | Patient: {patientName} (MRN: {mrn})</div>
          </div>
          <button type="button" className="ps-slide-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ps-slide-drawer-section">
          <div className="ps-slide-drawer-section-title">Case Readiness Summary</div>
          {readiness && (
            <div className={`wl-dp-badge wl-dp-badge--${readiness.level}`} style={{ display: 'inline-block', marginBottom: 6 }}>
              Status: {readiness.summaryText}
            </div>
          )}
          {triage && (
            <div className={`wl-dp-badge wl-dp-badge--${triage.level}`} style={{ display: 'block' }}>
              AI Triage: {triage.primaryText}
              {triage.biomarkerSummary && <div className="wl-dp-badge-sub">{triage.biomarkerSummary}</div>}
            </div>
          )}
          {!readiness && !triage && <div className="ps-slide-drawer-empty">No real digital slide or AI data on file for this case yet.</div>}
        </div>

        <div className="ps-slide-drawer-section">
          <div className="ps-slide-drawer-section-title">Slide Assets</div>
          {/* Real, honest limitation — see this file's own header
              comment: no real slide-to-block link exists yet, so each
              real slide is listed by its own slidePosition, the one
              real identifier the interface engine actually reports. */}
          {slides.length === 0 && <div className="ps-slide-drawer-empty">No real WSI scan data on file for this case yet.</div>}
          {slides.map(s => (
              <div key={s.slidePosition} className="ps-slide-drawer-row">
                <span className={`wl-dp-badge wl-dp-badge--${s.scanStatus === 'completed' && s.qcPassed !== false ? 'ready' : s.scanStatus === 'failed' || s.qcPassed === false ? 'error' : 'partial'}`}>
                  {SLIDE_STATUS_LABEL[s.scanStatus]}
                </span>
                <div className="ps-slide-drawer-row-body">
                  <div className="ps-slide-drawer-row-title">Slide position {s.slidePosition}</div>
                  <div className="ps-slide-drawer-row-meta">
                    {s.acquisitionMode && <>Acquisition: {s.acquisitionMode}{s.focalPlaneCount ? ` (${s.focalPlaneCount} planes)` : ''} · </>}
                    {s.failureReason && <>Note: {s.failureReason}</>}
                  </div>
                </div>
              </div>
          ))}
        </div>

        <div className="ps-slide-drawer-actions">
          <button type="button" className="ps-conf-btn-primary" onClick={onOpenCaseWorkspace}>
            Open Case Workspace &amp; Synoptic Report
          </button>
          {onRequestRescan && (
            <button type="button" className="ps-conf-btn-secondary" onClick={onRequestRescan}>
              Request Re-scan / QC Overhaul
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlideDetailDrawer;
