import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../pathscribe.css';
import { caseRouter } from '@/services/cases/CaseRouter';
import { fromLegacyName, formatIdentificationName } from '@/utils/personName';

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
const MockEMRPage: React.FC<MockEMRPageProps> = ({ patientId: patientIdProp }) => {
  const [searchParams] = useSearchParams();
  const patientId = patientIdProp ?? searchParams.get('patientId') ?? '';

  const [loading, setLoading] = useState(true);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [dob, setDob] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!patientId) { setLoading(false); return; }
    setLoading(true);
    caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true })
      .then(res => {
        if (cancelled || !res.ok) { setLoading(false); return; }
        const match = res.data.find(c => c?.patient?.mrn === patientId);
        if (match?.patient) {
          const p = match.patient;
          const name = p.givenNames && p.familyNames
            ? formatIdentificationName({ givenNames: p.givenNames, familyNames: p.familyNames })
            : formatIdentificationName(fromLegacyName(p.firstName ?? '', p.lastName ?? ''));
          setPatientName(name || null);
          setDob(p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-GB') : null);
          setGender(p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : p.sex === 'U' ? 'Unknown' : null);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) {
    return (
      <div className="ps-mockemr-loading">
        Looking up patient…
      </div>
    );
  }

  if (!patientName) {
    return (
      <div className="ps-mockemr-shell">
        <div className="ps-mockemr-banner">
          <div className="ps-mockemr-nhs-badge">NHS</div>
        </div>
        <div className="ps-mockemr-nopatient-body">
          <div className="ps-mockemr-nopatient-title">No Patient Found</div>
          <div className="ps-mockemr-nopatient-sub">
            {patientId ? `No record matches MRN ${patientId}` : 'No patient identifier was provided'}
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
          <div className="ps-mockemr-nhs-badge">NHS</div>
          <div>
            <h1 className="ps-mockemr-patient-name" data-phi="name">{patientName}</h1>
            <span className="ps-mockemr-patient-meta">
              {dob ? `DOB: ${dob}` : 'DOB: not recorded'}{gender ? ` (${gender})` : ''} • MRN: {patientId}
            </span>
          </div>
        </div>
        <div className="ps-mockemr-demo-badge">
          DEMO: SYNTHETIC DATA
        </div>
      </div>

      <div className="ps-mockemr-content-row">
        {/* LEFT COLUMN */}
        <div className="ps-mockemr-leftcol">
          <h3 className="ps-mockemr-leftcol-heading">Encounter</h3>
          <p className="ps-mockemr-leftcol-p"><strong>Status:</strong> Admitted</p>
          <p className="ps-mockemr-leftcol-p"><strong>Ward:</strong> 4B (Urology)</p>

          <div className="ps-mockemr-integration-note">
            <strong>Integration Note:</strong> Production uses FHIR R4 API to sync with LIS.
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="ps-mockemr-rightcol">
          <div className="ps-mockemr-card">
            <h2 className="ps-mockemr-card-heading">Clinical Summary</h2>
            <div className="ps-mockemr-grid">
              <div className="ps-mockemr-grid-cell">
                <h4 className="ps-mockemr-grid-cell-heading">Active Problems</h4>
                <ul className="ps-mockemr-list">
                  <li>Elevated PSA (8.4 ng/mL)</li>
                  <li>Prostate PI-RADS 4 Lesion</li>
                </ul>
              </div>
              <div className="ps-mockemr-grid-cell">
                <h4 className="ps-mockemr-grid-cell-heading">Medications</h4>
                <ul className="ps-mockemr-list">
                  <li>Metformin 500mg</li>
                  <li>Lisinopril 10mg</li>
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
