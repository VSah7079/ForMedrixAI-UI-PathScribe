import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import { resolveMockEmrPatientMatch, type MockEmrPatientMatch } from '@/services/cases/resolveMockEmrPatientMatch';

interface MockEMRPageProps {
  /** Optional — when provided (embedded modal use), takes priority over
   *  the URL search param. Falls back to the ?patientId= query param so
   *  this still works standalone at the real /mock-emr route. */
  patientId?: string;
}

// Real fix, found via a direct bug report: this used to hardcode exactly
// one recognized patientId ('100004' -> "MARTINEZ, DAVID") and silently
// show a completely unrelated patient ("THOMPSON, GRACE") for literally
// every other value — meaning any real case's actual patient MRN would
// show the wrong name. The launch itself was never broken
// (BottomActionBar.tsx already correctly passes the real
// caseData.patient.mrn) — this page just never looked it up. Per Pete's
// own principle: showing a wrong patient is worse than showing nothing,
// so a genuine "No Patient Found" state now replaces the second
// hardcoded guess rather than trading one wrong default for another.
//
// File-by-file cleanup sweep: the real patient lookup/name-derivation logic
// now lives in resolveMockEmrPatientMatch.ts (testable on its own); every
// visible string goes through useTranslation()/t() (mockEmr.* in all five
// locale files). This file already used pathscribe.css classes throughout
// with no inline style={{}} — nothing to change there.
const MockEMRPage: React.FC<MockEMRPageProps> = ({ patientId: patientIdProp }) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const patientId = patientIdProp ?? searchParams.get('patientId') ?? '';

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MockEmrPatientMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!patientId) { setLoading(false); return; }
    setLoading(true);
    caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true })
      .then(res => {
        if (cancelled || !res.ok) { setLoading(false); return; }
        setMatch(resolveMockEmrPatientMatch(res.data, patientId));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) {
    return (
      <div className="ps-mockemr-loading">
        {t('mockEmr.lookingUpPatient')}
      </div>
    );
  }

  const { patientName, dob, sex } = match ?? { patientName: null, dob: null, sex: undefined };
  const genderLabel = sex ? t(`mockEmr.gender.${sex}`) : null;

  if (!patientName) {
    return (
      <div className="ps-mockemr-shell">
        <div className="ps-mockemr-banner">
          <div className="ps-mockemr-nhs-badge">{t('mockEmr.nhsBadge')}</div>
        </div>
        <div className="ps-mockemr-nopatient-body">
          <div className="ps-mockemr-nopatient-title">{t('mockEmr.noPatientFound')}</div>
          <div className="ps-mockemr-nopatient-sub">
            {patientId ? t('mockEmr.noRecordForMrn', { patientId }) : t('mockEmr.noPatientIdentifier')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-mockemr-shell">

      {/* NHS BANNER */}
      <div className="ps-mockemr-banner ps-mockemr-banner--flex">
        <div className="ps-mockemr-banner-left">
          <div className="ps-mockemr-nhs-badge">{t('mockEmr.nhsBadge')}</div>
          <div>
            <h1 className="ps-mockemr-patient-name" data-phi="name">{patientName}</h1>
            <span className="ps-mockemr-patient-meta" data-phi="true">
              {dob ? t('mockEmr.dobWithValue', { dob }) : t('mockEmr.dobNotRecorded')}{genderLabel ? ` (${genderLabel})` : ''} • {t('mockEmr.mrnLabel', { patientId })}
            </span>
          </div>
        </div>
        <div className="ps-mockemr-demo-badge">
          {t('mockEmr.demoBadge')}
        </div>
      </div>

      <div className="ps-mockemr-content-row">
        {/* LEFT COLUMN */}
        <div className="ps-mockemr-leftcol">
          <h3 className="ps-mockemr-leftcol-heading">{t('mockEmr.encounter')}</h3>
          <p className="ps-mockemr-leftcol-p"><strong>{t('mockEmr.status')}</strong> {t('mockEmr.admitted')}</p>
          <p className="ps-mockemr-leftcol-p"><strong>{t('mockEmr.ward')}</strong> {t('mockEmr.wardValue')}</p>

          <div className="ps-mockemr-integration-note">
            <strong>{t('mockEmr.integrationNote')}</strong> {t('mockEmr.integrationNoteBody')}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="ps-mockemr-rightcol">
          <div className="ps-mockemr-card">
            <h2 className="ps-mockemr-card-heading">{t('mockEmr.clinicalSummary')}</h2>
            <div className="ps-mockemr-grid">
              <div className="ps-mockemr-grid-cell">
                <h4 className="ps-mockemr-grid-cell-heading">{t('mockEmr.activeProblems')}</h4>
                <ul className="ps-mockemr-list">
                  <li>{t('mockEmr.problemPsa')}</li>
                  <li>{t('mockEmr.problemPiRads')}</li>
                </ul>
              </div>
              <div className="ps-mockemr-grid-cell">
                <h4 className="ps-mockemr-grid-cell-heading">{t('mockEmr.medications')}</h4>
                <ul className="ps-mockemr-list">
                  <li>{t('mockEmr.medMetformin')}</li>
                  <li>{t('mockEmr.medLisinopril')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockEMRPage;
