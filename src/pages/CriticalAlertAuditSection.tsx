// src/pages/CriticalAlertAuditSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — the internal, authenticated half of the Critical Alerts audit
// trail (Audit Page > Critical Alerts). Real, per direct guidance's own
// "Add the Viewer to the Audit Module" ask: this is the ONE place
// findingTerm/findingSeverity/sourceQuote are shown alongside dispatch
// and reference-link status together, behind this app's own normal
// session — never the public CriticalAlertReferencePage.tsx, which
// deliberately never renders them (see that page's own header).
//
// Same "simple, standalone, self-contained" pattern as
// OutboundDlqSection.tsx/BillingLogsSection.tsx (the "financial" tab's
// own sibling sections) rather than QualityAssurancePage's unified
// QaGroup-normalized table — a dispatch record's own shape (per-channel
// outcomes, a joined reference-token's own access/acknowledgement
// state) doesn't share enough surface with that table's real QA-item
// vocabulary to be worth force-fitting into it.
//
// Joins each CriticalAlertDispatchRecord to its own reference token (if
// any — ehr_push-only dispatches never issue one, see
// dispatchCriticalAlerts.ts's own needsReferenceLink gate) by
// dispatchRecordId, a real, in-memory join rather than a stored
// denormalization, since both lists are already small and local to this
// mock's own storage.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mockCriticalAlertDispatchService } from '@/services/clinical/mockCriticalAlertDispatchService';
import { mockCriticalAlertReferenceTokenService } from '@/services/clinical/mockCriticalAlertReferenceTokenService';
import { resolveCriticalAlertReferenceTokenStatus } from '@/services/clinical/ICriticalAlertReferenceTokenService';
import type { CriticalAlertDispatchRecord, AlertChannelType } from '@/types/clinical/CriticalAlertDispatch';
import type { CriticalAlertReferenceToken } from '@/services/clinical/ICriticalAlertReferenceTokenService';
import { formatAuditTimestamp } from '@/utils/formatDate';

const CHANNEL_LABEL_KEY: Record<AlertChannelType, string> = {
  secure_email: 'criticalAlertsAudit.channelLabel.secureEmail',
  sms:          'criticalAlertsAudit.channelLabel.sms',
  ehr_push:     'criticalAlertsAudit.channelLabel.ehrPush',
};

const CriticalAlertAuditSection: React.FC = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<CriticalAlertDispatchRecord[]>([]);
  const [tokensByDispatchId, setTokensByDispatchId] = useState<Record<string, CriticalAlertReferenceToken>>({});
  const [caseFilter, setCaseFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      mockCriticalAlertDispatchService.getAll(),
      mockCriticalAlertReferenceTokenService.getAll(),
    ]).then(([dispatchRes, tokenRes]) => {
      if (dispatchRes.ok) {
        setRecords([...dispatchRes.data].sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt)));
      }
      if (tokenRes.ok) {
        const byDispatchId: Record<string, CriticalAlertReferenceToken> = {};
        for (const tok of tokenRes.data) byDispatchId[tok.dispatchRecordId] = tok;
        setTokensByDispatchId(byDispatchId);
      }
      setLoading(false);
    });
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = caseFilter.trim()
    ? records.filter(r => r.caseId.toLowerCase().includes(caseFilter.trim().toLowerCase()))
    : records;

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <div>
          <h2 className="ps-conf-section-title">{t('criticalAlertsAudit.title')}</h2>
          <p className="ps-conf-section-subtitle">{t('criticalAlertsAudit.subtitle')}</p>
        </div>
        <input
          className="ps-conf-input"
          placeholder={t('criticalAlertsAudit.caseFilterPlaceholder')}
          value={caseFilter}
          onChange={e => setCaseFilter(e.target.value)}
        />
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.caseHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.findingHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.severityHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.physicianHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.channelsHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.dispatchedAtHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.referenceLinkHeader')}</th>
                <th className="ps-conf-th">{t('criticalAlertsAudit.table.acknowledgedHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const token = tokensByDispatchId[r.id];
                return (
                  <tr key={r.id} className="ps-conf-tr">
                    <td className="ps-conf-td" data-phi="accession">{r.caseId}</td>
                    <td className="ps-conf-td" data-phi="finding">{r.findingTerm}</td>
                    <td className="ps-conf-td">{r.findingSeverity}</td>
                    <td className="ps-conf-td">{r.physicianName}</td>
                    <td className="ps-conf-td">
                      {r.channels.length === 0
                        ? <span className="ps-conf-hint">{t('criticalAlertsAudit.noChannelsResolved')}</span>
                        : r.channels.map(c => (
                            <div key={c.channel} className="ps-critaudit-channel-row">
                              {t(CHANNEL_LABEL_KEY[c.channel])}
                            </div>
                          ))
                      }
                    </td>
                    <td className="ps-conf-td">{formatAuditTimestamp(r.dispatchedAt)}</td>
                    <td className="ps-conf-td">
                      {token ? (
                        <>
                          <span className={`ps-critaudit-status-badge ps-critaudit-status-badge--${resolveCriticalAlertReferenceTokenStatus(token) === 'Active' ? 'active' : 'expired'}`}>
                            {t(resolveCriticalAlertReferenceTokenStatus(token) === 'Active' ? 'criticalAlertsAudit.statusLabel.active' : 'criticalAlertsAudit.statusLabel.expired')}
                          </span>
                          <div className="ps-specreq-meta">{t('criticalAlertsAudit.viewedCount', { count: token.accessCount })}</div>
                        </>
                      ) : (
                        <span className="ps-conf-hint">{t('criticalAlertsAudit.noReferenceLink')}</span>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      {token?.acknowledgedAt ? (
                        <span className="ps-conf-hint ps-conf-hint--success">{formatAuditTimestamp(token.acknowledgedAt)}</span>
                      ) : (
                        <span className="ps-conf-hint">{t('criticalAlertsAudit.notYetAcknowledged')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={8}>{t('criticalAlertsAudit.noRecords')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CriticalAlertAuditSection;
