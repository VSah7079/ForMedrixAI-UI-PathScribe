// src/pages/SynopticReportPage/modals/CriticalFindingsModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own revised PS-105 scope ("Sign-Out
// Guardrails" - soft block, not a hard block): surfaced from
// useSignOutWorkflow.ts's own handleRequestFinalize, the moment a real
// 'critical' severity finding is detected (detectCriticalFindings.ts)
// and hasn't already been acknowledged this session. A pathologist can
// either record a real CriticalResultNotification (who was called, how,
// whether they read it back) or explicitly acknowledge without
// recording - the detection is an LLM-based heuristic that can be
// wrong, and the finding may already have been communicated through a
// real means this feature doesn't capture.
//
// Same real shell/pattern as CaseHoldModal.tsx - a pathologist who's
// learned one already knows the other.
//
// i18n note: `f.term`/`.sourceField`/`.sourceQuote` are real, detected
// clinical-narrative data, never translated. The notification-method
// labels and three of the form field's own labels/placeholder reuse
// identical, already-translated strings from `AmendmentModal.tsx`'s
// own clinical-notification section (same real
// `NotificationMethod`/`CriticalResultNotification` vocabulary).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { CriticalFindingFlag } from '@/services/clinical/detectCriticalFindings';
import type { NotificationMethod } from '@/types/clinical/CriticalResultNotification';

const NOTIFICATION_METHOD_LABEL_KEY: Record<NotificationMethod, string> = {
  verbal_phone: 'amendmentModal.notificationMethod.verbalPhone',
  secure_page: 'amendmentModal.notificationMethod.securePage',
  direct_lis_flag: 'amendmentModal.notificationMethod.directLisFlag',
  secure_email: 'amendmentModal.notificationMethod.secureEmail',
  fax: 'amendmentModal.notificationMethod.fax',
};

interface CriticalFindingsModalProps {
  findings: CriticalFindingFlag[];
  /** Real, per direct guidance: defaults the new, editable "notified
   *  by" field to the real, currently signed-in user — the common
   *  case, where the same person recording this also made the real
   *  call. Editable since that's not always true: a representative
   *  may have made the real call, with staff simply transcribing the
   *  event into the record afterward. */
  defaultNotifiedByName?: string;
  onRecord: (input: { clinicianName: string; method: NotificationMethod; readBackConfirmed?: boolean; notifiedByName: string }) => void;
  onAcknowledge: () => void;
}

export const CriticalFindingsModal: React.FC<CriticalFindingsModalProps> = ({
  findings, defaultNotifiedByName, onRecord, onAcknowledge,
}) => {
  const { t } = useTranslation();
  const [clinicianName, setClinicianName] = useState('');
  const [method, setMethod] = useState<NotificationMethod | ''>('');
  const [readBackConfirmed, setReadBackConfirmed] = useState(false);
  const [notifiedByName, setNotifiedByName] = useState(defaultNotifiedByName ?? '');
  const [busy, setBusy] = useState(false);

  const canRecord = clinicianName.trim().length > 0 && !!method && notifiedByName.trim().length > 0;

  const handleRecord = async () => {
    if (!canRecord) return;
    setBusy(true);
    await onRecord({ clinicianName: clinicianName.trim(), method: method as NotificationMethod, readBackConfirmed, notifiedByName: notifiedByName.trim() });
    setBusy(false);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">⚠️ {t('criticalFindingsModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-note" style={{ marginBottom: 16, borderColor: 'rgba(248,113,113,0.4)' }}>
            <span className="ps-intraop-note-label" style={{ color: '#f87171' }}>{t('criticalFindingsModal.requiresUrgentLabel')}</span>
            {t('criticalFindingsModal.intro')}
          </p>

          {findings.map((f, i) => (
            <div key={i} className="ps-intraop-note" style={{ marginBottom: 10 }}>
              <span className="ps-intraop-note-label">{t('criticalFindingsModal.findingLabel', { term: f.term, sourceField: f.sourceField })}</span>
              "{f.sourceQuote}"
            </div>
          ))}

          <div className="ps-conf-form-field" style={{ marginTop: 16 }}>
            <label className="ps-conf-label">{t('criticalFindingsModal.notifiedByLabel')}</label>
            <input
              className="ps-conf-input"
              value={notifiedByName}
              onChange={e => setNotifiedByName(e.target.value)}
              placeholder={t('criticalFindingsModal.notifiedByPlaceholder')}
            />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('amendmentModal.notification.clinicianNotifiedLabel')}</label>
            <input
              className="ps-conf-input"
              value={clinicianName}
              onChange={e => setClinicianName(e.target.value)}
              placeholder={t('criticalFindingsModal.clinicianNotifiedPlaceholder')}
            />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="critical-notify-method">{t('amendmentModal.notification.methodLabel')}</label>
            <select id="critical-notify-method" className="ps-conf-select" value={method} onChange={e => setMethod(e.target.value as NotificationMethod | '')}>
              <option value="">{t('amendmentModal.notification.methodSelectPlaceholder')}</option>
              {(Object.keys(NOTIFICATION_METHOD_LABEL_KEY) as NotificationMethod[]).map(m => (
                <option key={m} value={m}>{t(NOTIFICATION_METHOD_LABEL_KEY[m])}</option>
              ))}
            </select>
          </div>
          <label className="ps-conf-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={readBackConfirmed} onChange={e => setReadBackConfirmed(e.target.checked)} />
            {t('criticalFindingsModal.readBackLabel')}
          </label>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-btn-secondary" onClick={onAcknowledge} disabled={busy}>
            {t('criticalFindingsModal.acknowledgeButton')}
          </button>
          <button className="ps-ms-btn-apply" onClick={handleRecord} disabled={busy || !canRecord}>
            {t('criticalFindingsModal.recordButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CriticalFindingsModal;
