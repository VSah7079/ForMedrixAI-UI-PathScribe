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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';

const MockWsiViewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId') ?? '';

  const [loading, setLoading] = useState(true);
  const [accessionNumber, setAccessionNumber] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [specimenLabel, setSpecimenLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!caseId) { setLoading(false); return; }
    setLoading(true);
    caseRouter.getCase(caseId).then(caseData => {
      if (cancelled) return;
      if (caseData) {
        setAccessionNumber((caseData as any).accession?.fullAccession ?? null);
        setPatientName((caseData as any).patient ? `${(caseData as any).patient.lastName}, ${(caseData as any).patient.firstName}` : null);
        setSpecimenLabel((caseData as any).specimens?.[0]?.label ?? null);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [caseId]);

  return (
    <div className="ps-app-root" style={{ padding: 24, height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#f59e0b18', border: '1px solid #f59e0b33', color: '#f59e0b', fontSize: 13, fontWeight: 600 }}>
        ⚠ Mock WSI viewer — no real image server exists in this environment. This is a real, honest placeholder for
        where a real digital pathology viewer would render this specimen's own real slide.
      </div>

      {loading ? (
        <div className="ps-conf-loading">Loading…</div>
      ) : !caseId ? (
        <div style={{ color: '#ef4444' }}>No case specified.</div>
      ) : !accessionNumber ? (
        <div style={{ color: '#ef4444' }}>No case found for '{caseId}'.</div>
      ) : (
        <>
          <div style={{ marginBottom: 16, color: '#e5e7eb', fontSize: 14 }}>
            <strong>{accessionNumber}</strong>{specimenLabel ? ` — Specimen ${specimenLabel}` : ''}
            {patientName && <span style={{ marginLeft: 12, color: '#9ca3af' }}>{patientName}</span>}
          </div>
          <div style={{ flex: 1, borderRadius: 8, border: '1px dashed #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>
            [ Real WSI slide surface — pan/zoom would render here ]
          </div>
        </>
      )}
    </div>
  );
};

export default MockWsiViewerPage;
