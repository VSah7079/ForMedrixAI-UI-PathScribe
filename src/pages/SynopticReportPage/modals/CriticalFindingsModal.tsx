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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../../pathscribe.css';
import type { CriticalFindingFlag } from '@/services/clinical/detectCriticalFindings';
import type { NotificationMethod } from '@/types/clinical/CriticalResultNotification';

const NOTIFICATION_METHOD_LABEL: Record<NotificationMethod, string> = {
  verbal_phone: 'Verbal / Phone Call',
  secure_page: 'Secure Page',
  direct_lis_flag: 'Direct LIS Flag',
  secure_email: 'Secure Email',
  fax: 'Fax',
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
        <div className="ps-ms-header">⚠️ Critical Finding Detected</div>
        <div className="ps-ms-body">
          <p className="ps-intraop-note" style={{ marginBottom: 16, borderColor: 'rgba(248,113,113,0.4)' }}>
            <span className="ps-intraop-note-label" style={{ color: '#f87171' }}>Requires urgent notification</span>
            This case's own narrative text was flagged as containing a critical finding that may require
            immediate physician communication. Review below, then either record the real notification you've
            made or acknowledge if it's already been handled some other way.
          </p>

          {findings.map((f, i) => (
            <div key={i} className="ps-intraop-note" style={{ marginBottom: 10 }}>
              <span className="ps-intraop-note-label">{f.term} — {f.sourceField}</span>
              "{f.sourceQuote}"
            </div>
          ))}

          <div className="ps-conf-form-field" style={{ marginTop: 16 }}>
            <label className="ps-conf-label">Notified by</label>
            <input
              className="ps-conf-input"
              value={notifiedByName}
              onChange={e => setNotifiedByName(e.target.value)}
              placeholder="Name of the person who made this notification"
            />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Clinician notified</label>
            <input
              className="ps-conf-input"
              value={clinicianName}
              onChange={e => setClinicianName(e.target.value)}
              placeholder="Name of the physician contacted"
            />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="critical-notify-method">Method</label>
            <select id="critical-notify-method" className="ps-conf-select" value={method} onChange={e => setMethod(e.target.value as NotificationMethod | '')}>
              <option value="">Select…</option>
              {(Object.keys(NOTIFICATION_METHOD_LABEL) as NotificationMethod[]).map(m => (
                <option key={m} value={m}>{NOTIFICATION_METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <label className="ps-conf-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={readBackConfirmed} onChange={e => setReadBackConfirmed(e.target.checked)} />
            Clinician read back the finding to confirm
          </label>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-btn-secondary" onClick={onAcknowledge} disabled={busy}>
            Acknowledge without recording
          </button>
          <button className="ps-ms-btn-apply" onClick={handleRecord} disabled={busy || !canRecord}>
            Record Notification
          </button>
        </div>
      </div>
    </div>
  );
};

export default CriticalFindingsModal;
