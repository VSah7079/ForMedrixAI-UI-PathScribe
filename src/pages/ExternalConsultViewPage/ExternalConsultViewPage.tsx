// src/pages/ExternalConsultViewPage/ExternalConsultViewPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-290 — External Consult / Second-Opinion Access, the OUTSIDE half.
// Public, unauthenticated route (`/consult/:token`) — same real,
// deliberate "Station Identity, not per-user login" posture as
// /or-suite-dashboard and /facility-ops-dashboard, but for a
// completely different reason: there IS no PathScribe login for an
// outside consultant to have. The token itself is this page's entire
// authorization — see services/consultAccess/IConsultTokenService.ts's
// own header for the full, load-bearing caveat on what that actually
// means (NOT real cryptographic security).
//
// Deliberately calls mockCaseService.getCase() directly rather than
// routing through caseRouter.getCase() — caseRouter's own
// resolveCaseAccess() enforces PathScribe's INTERNAL session/tenant
// model (services/auth/caseAccessControl.ts), which has no concept of
// an external, token-bearing guest at all. A valid, Active, unexpired
// ConsultToken IS the authorization for this one, specific read — that
// is the entire point of building a token-scoped access path instead of
// just handing out a normal case URL.
//
// i18n note: this page is a standalone, self-contained shell (its own
// dark theme, not the normal app chrome — see the "Station Identity"
// posture above), so its inline styles were converted to a dedicated
// `.ps-extconsult-*` class family rather than reused `.ps-conf-*`/
// `.ps-modal-dark-*` classes. Patient/specimen/slide identifiers stay
// as real data; `signedStatus`'s underlying 'Draft'/'Signed' values
// stay literal via SIGNED_STATUS_LABEL_KEY, translating only the
// displayed button label.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { mockCaseService } from '@/services/cases/mockCaseService';
import { consultTokenService } from '@/services';
import type { Case } from '@/types/case/Case';
import type { ConsultToken, ConsultOpinionSignedStatus } from '@/services/consultAccess/IConsultTokenService';

interface SlideRow { stainOrderId: string; specimenLabel: string; blockLabel: string; stainName: string; }

function flattenSlides(c: Case): SlideRow[] {
  const out: SlideRow[] = [];
  for (const sp of c.specimens ?? []) {
    for (const block of sp.blocks ?? []) {
      for (const stain of block.stains ?? []) {
        out.push({ stainOrderId: stain.id, specimenLabel: sp.label, blockLabel: block.label, stainName: stain.stainName });
      }
    }
  }
  return out;
}

const SIGNED_STATUS_LABEL_KEY: Record<ConsultOpinionSignedStatus, string> = {
  Draft:  'externalConsultViewPage.status.draft',
  Signed: 'externalConsultViewPage.status.signed',
};

const DisclosureBanner: React.FC = () => (
  <div className="ps-extconsult-disclosure-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="ps-extconsult-disclosure-icon"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span className="ps-extconsult-disclosure-text">
      <Trans i18nKey="externalConsultViewPage.disclosureBanner" components={{ strong: <strong /> }} />
    </span>
  </div>
);

const ExternalConsultViewPage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [tokenRecord, setTokenRecord] = useState<ConsultToken | null>(null);
  const [caseRecord, setCaseRecord] = useState<Case | null>(null);

  const [diagnosticCategory, setDiagnosticCategory] = useState('');
  const [signedStatus, setSignedStatus] = useState<ConsultOpinionSignedStatus>('Draft');
  const [opinionText, setOpinionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) { setStatus('invalid'); return; }

    consultTokenService.resolve(token).then(async res => {
      if (cancelled) return;
      if (!res.ok) { setStatus('invalid'); return; }
      const record = (res as { ok: true; data: ConsultToken }).data;
      setTokenRecord(record);

      const c = await mockCaseService.getCase(record.scope.caseId);
      if (cancelled) return;
      if (!c) { setStatus('invalid'); return; }
      setCaseRecord(c);
      setStatus('ready');
      // Recorded once per real page view, not on every resolve() —
      // see IConsultTokenService.ts's own recordAccess() doc comment.
      consultTokenService.recordAccess(record.id);
    });

    return () => { cancelled = true; };
  }, [token]);

  const handleSubmitOpinion = async () => {
    if (!tokenRecord || !caseRecord) return;
    if (!opinionText.trim()) { setSubmitError(t('externalConsultViewPage.requiredOpinionError')); return; }
    setSubmitting(true);
    setSubmitError(null);
    const res = await consultTokenService.submitOpinion({
      tokenId: tokenRecord.id,
      caseId: caseRecord.id,
      consultantIdentifier: tokenRecord.consultantIdentifier,
      diagnosticCategory: diagnosticCategory.trim() || undefined,
      signedStatus,
      opinionText: opinionText.trim(),
    });
    setSubmitting(false);
    if (!res.ok) { setSubmitError((res as { ok: false; error: string }).error); return; }
    setSubmitted(true);
  };

  if (status === 'loading') {
    return <div className="ps-extconsult-shell"><div className="ps-extconsult-card ps-extconsult-card--loading">{t('externalConsultViewPage.loading')}</div></div>;
  }

  if (status === 'invalid' || !tokenRecord || !caseRecord) {
    return (
      <div className="ps-extconsult-shell">
        <div className="ps-extconsult-card">
          <DisclosureBanner />
          <div className="ps-extconsult-invalid-content">
            <div className="ps-extconsult-invalid-title">{t('externalConsultViewPage.invalidLink.title')}</div>
            <div className="ps-extconsult-invalid-desc">{t('externalConsultViewPage.invalidLink.description')}</div>
          </div>
        </div>
      </div>
    );
  }

  const slides = flattenSlides(caseRecord);
  const scopedSlides = tokenRecord.scope.slideIds?.length
    ? slides.filter(s => tokenRecord.scope.slideIds!.includes(s.stainOrderId))
    : slides;

  return (
    <div className="ps-extconsult-shell">
      <div className="ps-extconsult-card">
        <DisclosureBanner />

        <div className="ps-extconsult-section">
          <div className="ps-extconsult-eyebrow">{t('externalConsultViewPage.eyebrow')}</div>
          <div className="ps-extconsult-accession" data-phi="accession">{caseRecord.accession?.accessionNumber}</div>
          <div className="ps-extconsult-patient-line">
            {caseRecord.patient?.lastName}, {caseRecord.patient?.firstName}
            {caseRecord.patient?.dateOfBirth && <> · {t('externalConsultViewPage.dobPrefix', { date: caseRecord.patient.dateOfBirth })}</>}
          </div>
          <div className="ps-extconsult-scope-line">
            {tokenRecord.scope.slideIds?.length ? t('externalConsultViewPage.scopedAccess', { count: tokenRecord.scope.slideIds.length }) : t('externalConsultViewPage.fullCaseAccess')}
            {' · '}
            {t('externalConsultViewPage.linkExpires', { date: new Date(tokenRecord.expiresAt).toLocaleString() })}
          </div>
        </div>

        <div className="ps-extconsult-section">
          <div className="ps-extconsult-section-heading">{t('externalConsultViewPage.specimensAndSlides')}</div>
          {caseRecord.specimens?.map(sp => (
            <div key={sp.id} className="ps-extconsult-specimen-row">
              <div className="ps-extconsult-specimen-text">{sp.label} — {sp.description}</div>
            </div>
          ))}
          <div className="ps-extconsult-slides-list">
            {scopedSlides.length === 0 ? (
              <div className="ps-extconsult-empty-note">{t('externalConsultViewPage.noSlidesInScope')}</div>
            ) : scopedSlides.map(s => (
              <div key={s.stainOrderId} className="ps-extconsult-slide-row">
                {s.specimenLabel}-{s.blockLabel} · {s.stainName}
              </div>
            ))}
          </div>
        </div>

        <div className="ps-extconsult-section-plain">
          <div className="ps-extconsult-section-heading">{t('externalConsultViewPage.yourOpinionHeading')}</div>
          {submitted ? (
            <div className="ps-extconsult-submitted-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span className="ps-extconsult-submitted-text">{t('externalConsultViewPage.opinionSubmittedConfirmation')}</span>
            </div>
          ) : (
            <>
              <div className="ps-extconsult-form-row">
                <div className="ps-extconsult-field-flex">
                  <label className="ps-extconsult-field-label">{t('externalConsultViewPage.diagnosticCategoryLabel')}</label>
                  <input type="text" value={diagnosticCategory} onChange={e => setDiagnosticCategory(e.target.value)} placeholder={t('externalConsultViewPage.diagnosticCategoryPlaceholder')}
                    className="ps-extconsult-input" />
                </div>
                <div>
                  <label className="ps-extconsult-field-label">{t('externalConsultViewPage.statusLabel')}</label>
                  <div className="ps-extconsult-status-group">
                    {(['Draft', 'Signed'] as const).map(s => (
                      <button key={s} onClick={() => setSignedStatus(s)} className={`ps-extconsult-status-btn${signedStatus === s ? ' ps-extconsult-status-btn--active' : ''}`}>
                        {t(SIGNED_STATUS_LABEL_KEY[s])}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea value={opinionText} onChange={e => setOpinionText(e.target.value)} rows={5}
                placeholder={t('externalConsultViewPage.opinionPlaceholder')}
                className="ps-extconsult-textarea" />
              {submitError && <div className="ps-extconsult-submit-error">{submitError}</div>}
              <div className="ps-extconsult-submit-row">
                <button onClick={handleSubmitOpinion} disabled={submitting} className="ps-extconsult-submit-btn">
                  {submitting ? t('externalConsultViewPage.submittingButton') : t('externalConsultViewPage.submitOpinionButton')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExternalConsultViewPage;
