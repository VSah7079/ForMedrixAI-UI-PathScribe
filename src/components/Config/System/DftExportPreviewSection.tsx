// src/components/Config/System/DftExportPreviewSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct clarification: "PathScribe is not generating HL7
// transactions, we are just sending json file to the interface engine.
// That is where the magic happens." The real, primary artifact
// PathScribe produces is the JSON payload (jsonWebhookBuilder.ts) - the
// interface engine (Mirth/Rhapsody/Cloverleaf/etc.), not PathScribe,
// is what actually builds and transmits HL7 from it. The HL7 block
// shown below is a real, useful preview of what that downstream engine
// would construct from the same JSON - shown for demo credibility and
// to confirm the JSON carries everything an interface engine would
// need - but it is explicitly labeled as a preview of someone else's
// output, never presented as a second thing PathScribe itself sends.
// Includes the real governance gate (canCaseExportDft.ts, "block
// export while an OPEN billing deficiency exists"). Deliberately not
// case-scoped UI (no button on the synoptic page) - this is a
// billing-admin lookup tool, same shape as every other screen in this
// Financial & Revenue Lookups group, not a per-case clinical workflow
// action.
//
// i18n sweep (batch 56): the real JSON payload / HL7 message text
// (`result.jsonPayload`, `result.dftMessage`) and every real charge/
// deficiency record field (`sourceLabel`, `cptCode`, `cptDescription`,
// `modifier`, `billingType`, `resolvedAt`, `deficiencyType`,
// `auditorNotes`) stay exactly as generated/stored — this screen's
// whole purpose is showing the real, unmodified output PathScribe (and
// the downstream interface engine) actually produces, so none of that
// can be run through the UI locale. Only page chrome is translated.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockServiceChargeService } from '@/services/billing/mockServiceChargeService';
import { mockBillingDeficiencyService } from '@/services/billing/mockBillingDeficiencyService';
import { canCaseExportDft } from '@/services/billing/canCaseExportDft';
import { buildDftP03ForCase } from '@/services/hl7/dftBuilder';
import { buildJsonWebhookPayload } from '@/services/billing/jsonWebhookBuilder';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';

const DftExportPreviewSection: React.FC = () => {
  const { t } = useTranslation();
  const [caseIdInput, setCaseIdInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState<{
    caseId: string;
    charges: ServiceChargeRecord[];
    blocking: BillingDeficiencyRecord[];
    dftMessage: string | null;
    jsonPayload: string | null;
  } | null>(null);

  const handleLookup = async () => {
    const caseId = caseIdInput.trim();
    if (!caseId) return;
    setBusy(true);
    setNotFound(false);
    setResult(null);
    try {
      const caseData = await caseRouter.getCase(caseId);
      if (!caseData) { setNotFound(true); return; }

      const [chargesRes, deficienciesRes] = await Promise.all([
        mockServiceChargeService.getChargesForCase(caseId),
        mockBillingDeficiencyService.getByCaseId(caseId),
      ]);
      const charges = chargesRes.ok ? chargesRes.data.filter(c => c.transactionType === 'charge') : [];
      const deficiencies = deficienciesRes.ok ? deficienciesRes.data : [];
      const gate = canCaseExportDft(deficiencies);

      let dftMessage: string | null = null;
      let jsonPayload: string | null = null;
      if (gate.allowed && charges.length > 0) {
        // Real, per direct guidance: Case.coding.icd10 is a bare
        // string[] (types/case/Case.ts's own CaseCoding), but
        // dftBuilder.ts's own signature expects {code, display}[] - a
        // real, pre-existing mismatch in that file, not something to
        // silently work around by fabricating display text. Mapped
        // here from order.icd10Codes instead, which already carries
        // the real {code, description} shape this needs -
        // validateChargeMetadata.ts's own real source of truth for a
        // case's ICD-10 codes, not a second, different one.
        const icd10 = (caseData.order?.icd10Codes ?? []).map(c => ({ code: c.code, display: c.description }));
        const built = buildDftP03ForCase(
          { sendingApplication: 'PATHSCRIBE', sendingFacility: 'FORMEDRIX', receivingApplication: 'RCM', receivingFacility: 'RCM_FAC', processingId: 'T' },
          { id: caseData.id, patient: caseData.patient, coding: { icd10 } },
          charges,
          'UTC'
        );
        dftMessage = built.message;

        // Real, per direct clarification: this JSON is the actual,
        // primary output PathScribe produces - the interface engine
        // builds HL7 from it, not PathScribe. Rebuilt to genuinely
        // match the real spec (ChargeCaptureEventPayload, §5.1) -
        // async since patientDataScope requires a real lookup, not a
        // guess.
        const payload = await buildJsonWebhookPayload(caseData, charges);
        jsonPayload = JSON.stringify(payload, null, 2);
      }

      setResult({ caseId, charges, blocking: gate.blocking, dftMessage, jsonPayload });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <h2 className="ps-conf-section-title">{t('dftExportPreviewSection.title')}</h2>
        <p className="ps-conf-section-subtitle">
          {t('dftExportPreviewSection.subtitle')}
        </p>
      </div>

      <div className="ps-qa-tab-toolbar">
        <input
          className="ps-conf-input ps-dft-export__case-input"
          placeholder={t('dftExportPreviewSection.caseIdPlaceholder')}
          value={caseIdInput}
          onChange={e => setCaseIdInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLookup(); }}
        />
        <button className="ps-conf-btn-primary" disabled={busy || !caseIdInput.trim()} onClick={handleLookup}>
          {busy ? t('dftExportPreviewSection.lookingUpBtn') : t('dftExportPreviewSection.previewExportBtn')}
        </button>
      </div>

      {notFound && <p className="ps-conf-hint ps-conf-hint--warning">{t('dftExportPreviewSection.notFound')}</p>}

      {result && (
        <>
          {result.blocking.length > 0 ? (
            <div className="ps-conf-hint ps-conf-hint--danger">
              {t('dftExportPreviewSection.blockedHeader', { count: result.blocking.length })}
              <ul>
                {result.blocking.map(d => <li key={d.id}>{d.deficiencyType}: {d.auditorNotes}</li>)}
              </ul>
            </div>
          ) : result.charges.length === 0 ? (
            <p className="ps-conf-hint">{t('dftExportPreviewSection.noCharges')}</p>
          ) : (
            <p className="ps-conf-hint ps-conf-hint--success">{t('dftExportPreviewSection.clearForExport', { count: result.charges.length })}</p>
          )}

          {result.charges.length > 0 && (
            <div className="ps-conf-table-wrap">
              <div className="ps-conf-table-scroll">
                <table className="ps-conf-table">
                  <thead className="ps-conf-thead-sticky">
                    <tr>
                      <th className="ps-conf-th">{t('dftExportPreviewSection.table.source')}</th>
                      <th className="ps-conf-th">{t('dftExportPreviewSection.table.cpt')}</th>
                      <th className="ps-conf-th">{t('dftExportPreviewSection.table.description')}</th>
                      <th className="ps-conf-th">{t('dftExportPreviewSection.table.modifier')}</th>
                      <th className="ps-conf-th">{t('dftExportPreviewSection.table.component')}</th>
                      <th className="ps-conf-th">{t('dftExportPreviewSection.table.serviceDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.charges.map(c => (
                      <tr key={c.id} className="ps-conf-tr">
                        <td className="ps-conf-td">{c.sourceLabel}</td>
                        <td className="ps-conf-td">{c.cptCode}</td>
                        <td className="ps-conf-td">{c.cptDescription ?? '—'}</td>
                        <td className="ps-conf-td">{c.modifier ?? '—'}</td>
                        <td className="ps-conf-td">{c.billingType}</td>
                        <td className="ps-conf-td">{c.resolvedAt.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.jsonPayload && (
            <>
              <div className="ps-conf-section-header ps-dft-export__section-header--spaced">
                <h2 className="ps-conf-section-title">{t('dftExportPreviewSection.jsonSection.title')}</h2>
                <p className="ps-conf-section-subtitle">{t('dftExportPreviewSection.jsonSection.subtitle')}</p>
              </div>
              <textarea
                readOnly
                className="ps-conf-input ps-dft-export__mono-textarea ps-dft-export__mono-textarea--json"
                value={result.jsonPayload}
              />
            </>
          )}

          {result.dftMessage && (
            <>
              <div className="ps-conf-section-header ps-dft-export__section-header--spaced">
                <h2 className="ps-conf-section-title">{t('dftExportPreviewSection.dftSection.title')}</h2>
                <p className="ps-conf-section-subtitle">{t('dftExportPreviewSection.dftSection.subtitle')}</p>
              </div>
              <textarea
                readOnly
                className="ps-conf-input ps-dft-export__mono-textarea ps-dft-export__mono-textarea--hl7"
                value={result.dftMessage.split('\r').join('\n')}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default DftExportPreviewSection;
