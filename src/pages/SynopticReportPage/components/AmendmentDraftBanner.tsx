// src/pages/SynopticReportPage/components/AmendmentDraftBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Extended per feedback: this now doubles as the persistent Amendment
// Summary Box (FR-19) plus a LIVE Changed Items Summary (FR-20).
//
// Important distinction from the wizard's own Changed Items Summary:
// that one only showed fields explicitly pulled from an older version
// in the Delta step. This one shows EVERY field currently different
// from the true baseline — including ordinary edits made afterward in
// the main synoptic form, not just Delta-table overrides. Diffed
// against amendmentRecord.originalReportSnapshot.answers — the durable,
// one-time-captured baseline (see mockAmendmentService.ts's captureFields
// fix) — not the page-level preOverrideSnapshot state, which doesn't
// survive a refresh.
//
// Re-renders live off `caseData` prop changes, so edits in the main
// form update this immediately with no extra wiring needed.
// ─────────────────────────────────────────────────────────────────────────────

//
// i18n note: `record.explanationOfChange` (a pathologist's own typed
// reason) and `key` (the raw synoptic answer key, an internal data
// identifier) are never translated. `record.notification.method` is a
// real, persisted enum value, so NOTIFICATION_METHOD_LABEL_KEY carries
// a translation key per entry — reuses AmendmentModal.tsx's own
// exact-text keys for the same three methods. The "Changed Items
// Summary" toggle here is deliberately its OWN new key rather than a
// reuse of `amendmentModal.changedItems.toggle_one/_other` — per this
// file's own header comment, this banner's summary means something
// different (every field currently differing from the true baseline)
// from the wizard's own Changed Items Summary (fields explicitly
// pulled from an earlier version in the Delta step), so reusing that
// wording here would misdescribe what's actually being shown.

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { amendmentService } from '@/services';
import type { AmendmentRecord } from '@/types/reports/AmendmentRecord';

const formatDateTime = (iso?: string) => iso ? new Date(iso).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

const NOTIFICATION_METHOD_LABEL_KEY: Record<string, string> = {
  verbal_phone: 'amendmentModal.notificationMethod.verbalPhone',
  secure_page: 'amendmentModal.notificationMethod.securePage',
  direct_lis_flag: 'amendmentModal.notificationMethod.directLisFlag',
};

export const AmendmentDraftBanner: React.FC<{
  caseData?: any;
  activeReportInstanceId?: string | null;
  onEdit?: () => void;
}> = ({ caseData, activeReportInstanceId, onEdit }) => {
  const { t } = useTranslation();
  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return t('amendmentModal.delta.emptyValue');
    return String(value);
  };
  const [record, setRecord] = useState<AmendmentRecord | undefined>(undefined);
  const [changedItemsOpen, setChangedItemsOpen] = useState(false);

  const activeInstance = (caseData?.synopticReports ?? []).find((r: any) => r.instanceId === activeReportInstanceId);
  const isDraftAmendment = !!activeInstance?.pendingAmendmentId && activeInstance?.status === 'draft' && activeInstance?.previouslyFinalizedForAmendment;

  useEffect(() => {
    if (!isDraftAmendment || !caseData?.id || !activeInstance?.pendingAmendmentId) { setRecord(undefined); return; }
    amendmentService.getByCaseId(caseData.id).then(res => {
      if (!res.ok) return;
      setRecord(res.data.find(r => r.id === activeInstance.pendingAmendmentId));
    });
  }, [isDraftAmendment, caseData?.id, activeInstance?.pendingAmendmentId, activeInstance?.answers]);

  if (!isDraftAmendment) return null;

  const baseline = (record?.originalReportSnapshot as any)?.answers as Record<string, unknown> | undefined;
  const liveAnswers = activeInstance?.answers as Record<string, unknown> | undefined;
  const changedKeys = baseline && liveAnswers
    ? Object.keys({ ...baseline, ...liveAnswers }).filter(k => JSON.stringify(baseline[k]) !== JSON.stringify(liveAnswers[k]))
    : [];

  return (
    <div className="ps-amendment-draft-banner">
      <span className="ps-amendment-draft-banner-icon">🔶</span>
      <div className="ps-amendment-draft-banner-body">
        <div className="ps-amendment-draft-banner-header-row">
          <div className="ps-amendment-draft-banner-title">
            {record?.type === 'correction' ? t('amendmentDraftBanner.correctionTitle') : t('amendmentDraftBanner.amendmentTitle')}
          </div>
          {onEdit && (
            <button type="button" className="ps-amendment-draft-banner-edit" onClick={onEdit}>✏️ {t('common.edit')}</button>
          )}
        </div>

        {record && (
          <div className="ps-amendment-summary-box ps-amendment-summary-box--compact">
            <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">{t('amendmentModal.form.reasonLabel')}</span> {record.explanationOfChange}</div>
            <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">{record.type === 'correction' ? t('amendmentModal.summary.correctedBy') : t('amendmentModal.summary.amendedBy')}</span> {record.authoringPathologist.userName}</div>
            <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">{t('cytotechCompetencyAssignmentsSection.table.headers.started')}</span> {formatDateTime(record.initiatedAt)}</div>
            {record.notification && (
              <div className="ps-amendment-summary-row">
                <span className="ps-amendment-summary-label">{t('amendmentModal.notification.clinicianNotifiedLabel')}</span> {record.notification.clinicianName} — {NOTIFICATION_METHOD_LABEL_KEY[record.notification.method] ? t(NOTIFICATION_METHOD_LABEL_KEY[record.notification.method]) : record.notification.method}, {formatDateTime(record.notification.notifiedAt)}
              </div>
            )}
          </div>
        )}

        {changedKeys.length > 0 && (
          <div className="ps-amendment-changed-items">
            <button type="button" className="ps-amendment-changed-items-toggle" onClick={() => setChangedItemsOpen(o => !o)}>
              {changedItemsOpen ? '▾' : '▸'} {t('amendmentDraftBanner.changedItemsToggle', { count: changedKeys.length })}
            </button>
            {changedItemsOpen && (
              <table className="ps-amendment-matrix">
                <thead><tr><th>{t('amendmentModal.changedItems.field')}</th><th>{t('amendmentDraftBanner.baselineHeader')}</th><th>{t('protocolChangeModal.currentLabel')}</th></tr></thead>
                <tbody>
                  {changedKeys.map(key => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td className="ps-amendment-matrix-previous">{formatValue(baseline?.[key])}</td>
                      <td className="ps-amendment-matrix-current">{formatValue(liveAnswers?.[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
