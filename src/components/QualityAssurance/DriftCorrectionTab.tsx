// src/components/QualityAssurance/DriftCorrectionTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Surfaces post-finalization drift detection/correction — a finalized
// grossing report whose answers were edited after sign-out, and the
// automatic background correction that reverts it to draft (see the real
// telemetry added in SynopticReportPage.tsx's drift-correction useEffect).
//
// Reads from the same real audit log every drift event already writes
// into (auditService.getAuditLogs), filtered by the substring every
// drift event name shares — no new backend, no new storage, this is
// purely a read view over what already exists. The one thing this tab
// adds beyond "read the audit log" is surfacing UNRESOLVED entries
// (Deferred/Failed with no later Auto-Corrected for the same case)
// prominently — that's the actionable list, not just a history.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auditService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { QaScopeSwitcher } from './QaScopeSwitcher';
import { caseMatchesScope, exportQaReportRows, scopeLabel, QaScope } from './qaReportUtils';
import type { AuditLog } from '@/services/auditlog/IAuditService';

const DRIFT_EVENTS = [
  'Post-Finalization Drift Detected',
  'Post-Finalization Drift Auto-Corrected',
  'Post-Finalization Drift Correction Deferred',
  'Post-Finalization Drift Correction Failed',
] as const;

export const DriftCorrectionTab: React.FC = () => {
  const navigate = useNavigate();
  const [scope, setScope] = useState<QaScope>({ level: 'enterprise' });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [caseScopeFieldsById, setCaseScopeFieldsById] = useState<Record<string, { clientId?: string; originHospitalId?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      // Per the tenant-isolation design spec's Invariant 2 — cross-
      // tenant fetches must be auditable on both client invocation and
      // server execution. This is the client-invocation half; the
      // server-execution half needs the real backend query layer (see
      // backend requirements doc) since this bypass is still enforced
      // client-side only today, same caveat as caseAccessControl.ts's
      // own module doc comment.
      auditService.logEvent({
        type: 'system',
        event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Post-Finalization Drift tab, user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown',
        caseId: null,
        confidence: null,
      }).catch(() => {});
    }
    Promise.all([
      auditService.getAuditLogs({ search: 'Drift' }),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: crossTenant } as any),
    ]).then(([logsRes, casesRes]) => {
      if (logsRes.ok) {
        // The search matches substring across event/detail/user/caseId —
        // narrow to the exact drift event names so an unrelated case
        // whose ID happens to contain "drift" (unlikely, but not
        // impossible) can't slip in.
        setLogs(logsRes.data.filter(l => (DRIFT_EVENTS as readonly string[]).includes(l.event)));
      }
      if (casesRes.ok) {
        const map: Record<string, { clientId?: string; originHospitalId?: string }> = {};
        (casesRes.data as any[]).forEach((c: any) => {
          map[c.id] = { clientId: c?.order?.facilityId, originHospitalId: c?.originHospitalId };
        });
        setCaseScopeFieldsById(map);
      }
      setLoading(false);
    });
  }, []);

  const scoped = useMemo(
    () => logs.filter(l => {
      const fields = caseScopeFieldsById[l.caseId ?? ''] ?? {};
      return caseMatchesScope({ order: { clientId: fields.clientId }, originHospitalId: fields.originHospitalId }, scope);
    }),
    [logs, caseScopeFieldsById, scope]
  );

  const visibleClientIds = useMemo(
    () => Array.from(new Set(Object.values(caseScopeFieldsById).map(f => f.clientId).filter((v): v is string => !!v))),
    [caseScopeFieldsById]
  );

  const detected = scoped.filter(l => l.event === 'Post-Finalization Drift Detected');
  const corrected = scoped.filter(l => l.event === 'Post-Finalization Drift Auto-Corrected');
  const deferred = scoped.filter(l => l.event === 'Post-Finalization Drift Correction Deferred');
  const failed = scoped.filter(l => l.event === 'Post-Finalization Drift Correction Failed');

  // The actionable list — a case with a deferred/failed correction that
  // was never followed by a later successful correction for the same
  // case. This is the "still sitting wrong right now" set, not just a
  // historical failure count; deferred entries with a later
  // auto-corrected entry (the retry succeeded) are resolved and
  // deliberately excluded.
  const unresolved = useMemo(() => {
    const correctedCaseIdsAfter = (caseId: string, afterTs: string) =>
      corrected.some(c => c.caseId === caseId && c.timestamp > afterTs);
    return [...deferred, ...failed]
      .filter(l => l.caseId && !correctedCaseIdsAfter(l.caseId, l.timestamp))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [deferred, failed, corrected]);

  const handleExport = () => {
    const rows = scoped.map(l => ({
      'Case': l.caseId ?? '',
      'Event': l.event,
      'Detail': l.detail,
      'Timestamp': l.timestamp,
    }));
    exportQaReportRows(rows, `drift-correction-${scopeLabel(scope)}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-loading">Loading drift correction data…</div>;

  return (
    <div>
      <div className="ps-qa-tab-toolbar">
        <QaScopeSwitcher scope={scope} onChange={setScope} visibleClientIds={visibleClientIds} />
        <button className="ps-conf-btn-secondary" onClick={handleExport}>Export</button>
      </div>

      <div className="ps-qa-summary-tiles">
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{detected.length}</div>
          <div className="ps-qa-tile-label">Drift Events Detected</div>
        </div>
        <div className="ps-qa-tile">
          <div className="ps-qa-tile-value">{corrected.length}</div>
          <div className="ps-qa-tile-label">Auto-Corrected</div>
        </div>
        <div className="ps-qa-tile" style={unresolved.length > 0 ? { borderColor: '#f59e0b' } : undefined}>
          <div className="ps-qa-tile-value" style={unresolved.length > 0 ? { color: '#f59e0b' } : undefined}>{unresolved.length}</div>
          <div className="ps-qa-tile-label">Unresolved — Needs Review</div>
        </div>
      </div>

      {unresolved.length > 0 && (
        <div className="ps-defic-trend-card" style={{ marginTop: 16 }}>
          <div className="ps-conf-section-title" style={{ marginBottom: 8 }}>
            Cases with unresolved drift correction
          </div>
          <table className="ps-conf-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Detail</th>
                <th>Detected</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unresolved.map(l => (
                <tr key={l.id}>
                  <td>{l.caseId}</td>
                  <td>
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${l.event.includes('Deferred') ? 'ps-conf-status-dot--pending' : 'ps-conf-status-dot--open'}`} />
                      <span className={`ps-conf-status-text ${l.event.includes('Deferred') ? 'ps-conf-status-text--pending' : 'ps-conf-status-text--open'}`}>
                        {l.event.includes('Deferred') ? 'Deferred (conflict)' : 'Failed'}
                      </span>
                    </div>
                  </td>
                  <td>{l.detail}</td>
                  <td>{new Date(l.timestamp).toLocaleString()}</td>
                  <td>
                    <button
                      className="ps-conf-btn-secondary"
                      onClick={() => l.caseId && navigate(`/case/${l.caseId}`)}
                    >
                      Open Case
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ps-defic-trend-card" style={{ marginTop: 16 }}>
        <div className="ps-conf-section-title" style={{ marginBottom: 8 }}>
          All drift events
        </div>
        {scoped.length === 0 ? (
          <div style={{ color: '#64748b', padding: '12px 0' }}>No drift events recorded in this scope.</div>
        ) : (
          <table className="ps-conf-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Event</th>
                <th>Detail</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {[...scoped].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(l => (
                <tr key={l.id}>
                  <td>{l.caseId}</td>
                  <td>{l.event.replace('Post-Finalization Drift ', '')}</td>
                  <td>{l.detail}</td>
                  <td>{new Date(l.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
