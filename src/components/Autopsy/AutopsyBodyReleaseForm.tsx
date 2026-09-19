// src/components/Autopsy/AutopsyBodyReleaseForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed requirements: no inline
// CSS (real classNames only), no inline logic
// (resolveAutopsyBodyReleaseGate.ts and releaseAutopsyBody.ts — this
// file only calls and renders), no text strings (useTranslation()
// throughout).
//
// Real, deliberate difference from AutopsyAuthorizationCompletionForm.tsx:
// per direct guidance's own "continue with wiring and UI," this
// component actually calls the real, async releaseAutopsyBody.ts
// itself (fetch, gate re-check, persist) rather than handing built
// data back to a caller — closing the loop instead of deferring it
// again.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';
import { resolveAutopsyBodyReleaseGate } from '@/services/autopsy/resolveAutopsyBodyReleaseGate';
import { releaseAutopsyBody } from '@/services/autopsy/releaseAutopsyBody';

interface AutopsyBodyReleaseFormProps {
  caseId: string;
  specimenId: string;
  autopsyDetails: AutopsyCaseDetails;
  onReleased: () => void;
}

const AutopsyBodyReleaseForm: React.FC<AutopsyBodyReleaseFormProps> = ({ caseId, specimenId, autopsyDetails, onReleased }) => {
  const { t } = useTranslation();
  const [releasedTo, setReleasedTo] = useState('');
  const [releasedByName, setReleasedByName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const gate = resolveAutopsyBodyReleaseGate(autopsyDetails);
  const formValid = Boolean(releasedTo.trim() && releasedByName.trim());

  const handleSubmit = async () => {
    if (!formValid) { setShowErrors(true); return; }
    setSubmitting(true);
    setServerError(null);
    const result = await releaseAutopsyBody(caseId, specimenId, { releasedTo: releasedTo.trim(), releasedByName: releasedByName.trim() });
    setSubmitting(false);
    if (result.ok) {
      onReleased();
    } else {
      setServerError(result.error ?? result.blockedReasons?.join(' ') ?? t('autopsyBodyRelease.genericError'));
    }
  };

  return (
    <div className="ps-conf-card ps-autopsy-intake-card">
      <div className="ps-conf-section-title">{t('autopsyBodyRelease.title')}</div>
      <p className="ps-conf-section-subtitle">{t('autopsyBodyRelease.subtitle')}</p>

      {!gate.allowed && (
        <div className="ps-conf-validation-errors">
          {gate.blockedReasons.map(reason => <div key={reason}>{reason}</div>)}
        </div>
      )}

      {gate.allowed && (
        <>
          <div className="ps-conf-form-row">
            <div>
              <label className="ps-label" htmlFor="autopsy-release-to">{t('autopsyBodyRelease.releasedToLabel')}</label>
              <input
                id="autopsy-release-to"
                className="ps-conf-input"
                value={releasedTo}
                placeholder={t('autopsyBodyRelease.releasedToPlaceholder')}
                onChange={e => setReleasedTo(e.target.value)}
              />
            </div>
            <div>
              <label className="ps-label" htmlFor="autopsy-release-by">{t('autopsyBodyRelease.releasedByLabel')}</label>
              <input
                id="autopsy-release-by"
                className="ps-conf-input"
                value={releasedByName}
                placeholder={t('autopsyBodyRelease.releasedByPlaceholder')}
                onChange={e => setReleasedByName(e.target.value)}
              />
            </div>
          </div>

          {showErrors && !formValid && (
            <div className="ps-conf-validation-errors">{t('autopsyBodyRelease.validationError')}</div>
          )}

          {serverError && (
            <div className="ps-conf-validation-errors">{serverError}</div>
          )}

          <div className="ps-conf-modal-footer ps-autopsy-intake-footer">
            <button className="ps-conf-btn-primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? t('autopsyBodyRelease.submittingBtn') : t('autopsyBodyRelease.submitBtn')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AutopsyBodyReleaseForm;
