// src/pages/CriticalAlertReferencePage/CriticalAlertReferencePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — the public, unauthenticated half of the SMS/secure-email
// non-PHI "tap to view" deep link. Same real "Station Identity, not a
// per-user login" posture App.tsx's own route comments document for
// /or-suite-dashboard and /facility-ops-dashboard, but for a third,
// distinct reason from either of those or /consult/:token: there is no
// PathScribe login for the receiving physician to have here at all, and
// — unlike /consult/:token — this page was deliberately designed to
// need none, by never displaying anything PHI-bearing in the first
// place. See services/clinical/ICriticalAlertReferenceTokenService.ts's
// own header for the full reasoning.
//
// Real, deliberate, load-bearing design boundary — read before adding
// anything to this page: it NEVER renders findingTerm, findingSeverity,
// or sourceQuote, and never calls into mockCaseService or any other
// source of real clinical/patient data. The resolved token record
// itself carries findingTerm/findingSeverity (for the INTERNAL,
// authenticated audit-trail viewer — CriticalAlertAuditSection.tsx —
// which reads the same token records through a normal, session-gated
// service call), but this component only ever destructures and renders
// accessionNumber/physicianName/status/timestamps from it. If a future
// change needs this page to show more, that is exactly the moment to
// re-open the App.tsx /consult/:token route comment this page's own
// design was written to satisfy, not to quietly start rendering more
// fields here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useParams } from 'react-router';
import { mockCriticalAlertReferenceTokenService } from '@/services/clinical/mockCriticalAlertReferenceTokenService';
import { resolveCriticalAlertReferenceTokenStatus } from '@/services/clinical/ICriticalAlertReferenceTokenService';
import type { CriticalAlertReferenceToken } from '@/services/clinical/ICriticalAlertReferenceTokenService';

const DisclosureBanner: React.FC = () => (
  <div className="ps-critalert-disclosure-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="ps-critalert-disclosure-icon"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span className="ps-critalert-disclosure-text">
      <Trans i18nKey="criticalAlertReferencePage.disclosureBanner" components={{ strong: <strong /> }} />
    </span>
  </div>
);

const CriticalAlertReferencePage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [record, setRecord] = useState<CriticalAlertReferenceToken | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) { setStatus('invalid'); return; }

    mockCriticalAlertReferenceTokenService.resolve(token).then(res => {
      if (cancelled) return;
      if (!res.ok) { setStatus('invalid'); return; }
      setRecord(res.data);
      setAcknowledged(!!res.data.acknowledgedAt);
      setStatus('ready');
      // Recorded once per real page view, not on every resolve() — same
      // real posture as consultAccess's own recordAccess() doc comment.
      mockCriticalAlertReferenceTokenService.recordAccess(res.data.id);
    });

    return () => { cancelled = true; };
  }, [token]);

  const handleAcknowledge = async () => {
    if (!record) return;
    setAcknowledging(true);
    const res = await mockCriticalAlertReferenceTokenService.recordAcknowledged(record.id);
    setAcknowledging(false);
    if (res.ok) { setRecord(res.data); setAcknowledged(true); }
  };

  if (status === 'loading') {
    return <div className="ps-critalert-shell"><div className="ps-critalert-card ps-critalert-card--loading">{t('criticalAlertReferencePage.loading')}</div></div>;
  }

  if (status === 'invalid' || !record) {
    return (
      <div className="ps-critalert-shell">
        <div className="ps-critalert-card">
          <DisclosureBanner />
          <div className="ps-critalert-invalid-content">
            <div className="ps-critalert-invalid-title">{t('criticalAlertReferencePage.invalidLink.title')}</div>
            <div className="ps-critalert-invalid-desc">{t('criticalAlertReferencePage.invalidLink.description')}</div>
          </div>
        </div>
      </div>
    );
  }

  const tokenStatus = resolveCriticalAlertReferenceTokenStatus(record);

  return (
    <div className="ps-critalert-shell">
      <div className="ps-critalert-card">
        <DisclosureBanner />

        <div className="ps-critalert-section">
          <div className="ps-critalert-eyebrow">{t('criticalAlertReferencePage.eyebrow')}</div>
          <div className="ps-critalert-accession" data-phi="accession">{record.accessionNumber}</div>
          <div className="ps-critalert-physician-line">
            {t('criticalAlertReferencePage.physicianLabel')}: {record.physicianName}
          </div>
          <div className={`ps-critalert-status-badge ps-critalert-status-badge--${tokenStatus === 'Active' ? 'active' : 'expired'}`}>
            {t(tokenStatus === 'Active' ? 'criticalAlertReferencePage.statusLabel.active' : 'criticalAlertReferencePage.statusLabel.expired')}
          </div>
          <div className="ps-critalert-meta-line">
            {t('criticalAlertReferencePage.expiresLabel', { date: new Date(record.expiresAt).toLocaleString() })}
            {' · '}
            {t('criticalAlertReferencePage.viewedLabel', { count: record.accessCount })}
          </div>
        </div>

        <div className="ps-critalert-section-plain">
          {acknowledged ? (
            <div className="ps-critalert-acknowledged-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span className="ps-critalert-acknowledged-text">{t('criticalAlertReferencePage.acknowledgedConfirmation')}</span>
            </div>
          ) : (
            <button onClick={handleAcknowledge} disabled={acknowledging} className="ps-critalert-acknowledge-btn">
              {t('criticalAlertReferencePage.acknowledgeButton')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CriticalAlertReferencePage;
