// src/pages/MockWsiViewerPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance on Cytology Assisted Instrumentation:
// "Standardize on WSI for Image Workflows... bring a window to open
// and host the image viewer specific to that case." This is the real
// content that real, "sticky" companion window
// (useCompanionWindow.ts) actually hosts — opened via
// `/wsi-viewer?caseId=...&accessionNumber=...`, mirroring
// MockEMRPage.tsx's own real "look the real case up, show honest
// empty/not-found states" precedent.
//
// Real, honest limit, stated plainly in the UI itself, not hidden:
// this is a real, clearly-labeled placeholder — no real WSI image
// server exists in this environment. It looks up and displays the
// real, actual case/specimen identity (never a fabricated one), but
// the slide surface itself is an honest placeholder, not a real
// rendered image.
//
// File-by-file cleanup sweep: the case→display derivation now lives in
// resolveWsiViewerCaseSummary.ts (testable on its own, no `as any` casts);
// layout/colors moved from inline style={{}} to pathscribe.css's
// .ps-wsi-viewer-* classes; every visible string goes through
// useTranslation()/t() (wsiViewer.* in all five locale files).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import {
  resolveWsiViewerCaseSummary,
  EMPTY_WSI_VIEWER_CASE_SUMMARY,
  type WsiViewerCaseSummary,
} from '@/services/cases/resolveWsiViewerCaseSummary';

const MockWsiViewerPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId') ?? '';

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<WsiViewerCaseSummary>(EMPTY_WSI_VIEWER_CASE_SUMMARY);

  useEffect(() => {
    let cancelled = false;
    if (!caseId) { setLoading(false); return; }
    setLoading(true);
    caseRouter.getCase(caseId).then(caseData => {
      if (cancelled) return;
      setSummary(resolveWsiViewerCaseSummary(caseData));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [caseId]);

  const { accessionNumber, patientName, specimenLabel } = summary;

  return (
    <div className="ps-app-root ps-wsi-viewer-root">
      <div className="ps-wsi-viewer-notice">
        {t('wsiViewer.mockNotice')}
      </div>

      {loading ? (
        <div className="ps-conf-loading">{t('common.loading')}</div>
      ) : !caseId ? (
        <div className="ps-wsi-viewer-error">{t('wsiViewer.noCaseSpecified')}</div>
      ) : !accessionNumber ? (
        <div className="ps-wsi-viewer-error">{t('wsiViewer.noCaseFound', { caseId })}</div>
      ) : (
        <>
          <div className="ps-wsi-viewer-info">
            <strong data-phi="accession">{accessionNumber}</strong>
            {specimenLabel ? ` — ${t('wsiViewer.specimenLabel', { specimenLabel })}` : ''}
            {patientName && <span className="ps-wsi-viewer-patient" data-phi="name">{patientName}</span>}
          </div>
          <div className="ps-wsi-viewer-surface">
            {t('wsiViewer.slideSurfacePlaceholder')}
          </div>
        </>
      )}
    </div>
  );
};

export default MockWsiViewerPage;
