// src/pages/ReportPreview/ReportPreviewPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone React route: /report-preview/:caseId
//
// Opens as a detachable browser window from the draft editor.
// Receives live section updates via BroadcastChannel — never shows stale data.
// No AppShell, no NavBar — pure report preview with a slim top bar.
//
// Architecture:
//   1. On mount: loads caseData from mockOrchestratorCaseService (fallback)
//      and restores orchSections from localStorage
//   2. BroadcastChannel listener: receives SECTIONS_UPDATE from draft editor
//      and re-renders immediately
//   3. "🔴 Live" indicator turns green when connected to the draft editor
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { usePreviewReceiver } from '@/hooks/usePreviewChannel';
import ReportPreviewRenderer from './ReportPreviewRenderer';
import { mockOrchestratorCaseService } from '@/services/cases/mockOrchestratorCaseService';
import type { OrchestratorSection } from '@/pages/SynopticReportPage/components/OrchestratorSectionEditor';
import type { Case } from '@/types/case/Case';

const ReportPreviewPage: React.FC = () => {
  const { t } = useTranslation();
  const { caseId } = useParams<{ caseId: string }>();
  const { sections: liveSections, caseData: liveCaseData, lastUpdated, isConnected }
    = usePreviewReceiver(caseId ?? null);

  // Fallback data loaded from service when preview opens without a live sender
  const [fallbackSections, setFallbackSections] = useState<OrchestratorSection[]>([]);
  const [fallbackCaseData, setFallbackCaseData]  = useState<Case | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Self-position on mount — more reliable than opener's window.open() flags.
  // Chrome ignores left/top in window.open() for cross-monitor placement,
  // but window.moveTo() called from inside the window works correctly.
  useEffect(() => {
    const GEOMETRY_KEY = 'ps_preview_window_geometry';
    try {
      const stored = localStorage.getItem(GEOMETRY_KEY);
      if (!stored) return;
      const geo = JSON.parse(stored) as {
        width: number; height: number; left: number; top: number;
      };
      // Validate — must be plausible values
      if (geo.width < 200 || geo.height < 200) return;
      // Move and resize to remembered position/size
      // Small delay ensures the window is fully initialised before moving
      setTimeout(() => {
        try {
          window.moveTo(geo.left, geo.top);
          window.resizeTo(geo.width, geo.height);
        } catch { /* ignore — security restrictions */ }
      }, 100);
    } catch { /* ignore */ }
  }, []); // Run once on mount only

  // Save geometry directly to localStorage from inside the preview window.
  // This is the most reliable approach — the window knows its own position.
  // screenX/screenY correctly report multi-monitor coordinates.
  useEffect(() => {
    const GEOMETRY_KEY = 'ps_preview_window_geometry';

    const saveGeo = () => {
      try {
        const geo = {
          width:  window.outerWidth,
          height: window.outerHeight,
          left:   window.screenX,
          top:    window.screenY,
        };
        if (geo.width >= 200 && geo.height >= 200) {
          localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geo));
        }
      } catch { /* ignore */ }
    };

    // Save on resize
    window.addEventListener('resize', saveGeo, { passive: true });
    // Save periodically to catch window drags (move event not available)
    const interval = setInterval(saveGeo, 2000);
    // Save on close
    window.addEventListener('beforeunload', saveGeo);

    return () => {
      window.removeEventListener('resize', saveGeo);
      window.removeEventListener('beforeunload', saveGeo);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!caseId) return;
    // Load from service
    mockOrchestratorCaseService.getCase(caseId).then(c => {
      if (c) {
        setFallbackCaseData(c);
        setFallbackSections((c as any).orchSections ?? []);
      }
      // Also check localStorage for more recent draft
      try {
        const stored = localStorage.getItem(`ps_orch_sections_${caseId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFallbackSections(parsed);
          }
        }
      } catch { /* ignore */ }
      setIsLoading(false);
    });
  }, [caseId]);

  // Use live data if available, fall back to loaded data
  const sections  = liveSections.length > 0 ? liveSections  : fallbackSections;
  const caseData  = liveCaseData            ?? fallbackCaseData;
  const accession = caseData?.accession?.fullAccession
    ?? caseData?.accession?.accessionNumber ?? caseId ?? '';

  const handlePrint = () => window.print();

  return (
    <div className="rp-shell">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="rp-topbar">
        <div className="rp-topbar-left">
          <span className="rp-topbar-logo">PathScribe</span>
          <span className="rp-topbar-sep">·</span>
          <span className="rp-topbar-accession" data-phi="accession">{accession}</span>
          {caseData?.patient && (
            <>
              <span className="rp-topbar-sep">·</span>
              {/* Real gap found while converting: this patient name
                  wasn't wrapped in a `data-phi` attribute the way the
                  accession right above it already is — every other
                  patient-name display in this app marks itself
                  `data-phi="name"` for the same real capture/redaction
                  tooling to find; this one was silently missed. */}
              <span className="rp-topbar-patient" data-phi="name">
                {caseData.patient.lastName}, {caseData.patient.firstName}
              </span>
            </>
          )}
        </div>

        <div className="rp-topbar-centre">
          {/* Live connection indicator */}
          <div className={`rp-live-indicator${isConnected ? ' rp-live-indicator--connected' : ''}`}>
            <span className="rp-live-dot" />
            <span className="rp-live-label">
              {isConnected ? t('reportPreviewPage.live') : t('reportPreviewPage.standalone')}
            </span>
          </div>
          {lastUpdated && (
            <span className="rp-last-updated">
              {t('reportPreviewPage.updatedAt', { time: lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
            </span>
          )}
        </div>

        <div className="rp-topbar-right">
          <button className="rp-topbar-btn" onClick={handlePrint} title={t('reportPreviewPage.printTitle')}>
            {t('reportPreviewPage.print')}
          </button>
          <button className="rp-topbar-btn rp-topbar-btn--close" onClick={() => window.close()} title={t('reportPreviewPage.closeTitle')}>
            {t('reportPreviewPage.close')}
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="rp-content">
        {isLoading ? (
          <div className="rp-loading">
            <div className="rp-loading-spinner" />
            <span>{t('reportPreviewPage.loadingReport')}</span>
          </div>
        ) : (
          <ReportPreviewRenderer
            sections={sections}
            caseData={caseData}
            templateName={undefined}
            resolvedBy="gold-standard"
          />
        )}
      </div>

    </div>
  );
};

export default ReportPreviewPage;
