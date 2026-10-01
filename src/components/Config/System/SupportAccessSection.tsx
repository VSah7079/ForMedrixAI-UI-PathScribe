// src/components/Config/System/SupportAccessSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 372: ForMedrixAI support access (Pete's specification, Sep 28, 2026).
//
//   Your organisation (hospital IT/security administrators)
//     • the Support Access Policy: Disabled / Approval Required / Always
//       Allowed, and the access window (default 2 hours)
//     • support requests awaiting approval: approve or reject
//     • active support sessions, with time left: revoke
//     • support activity: the organisation's own support audit stream, its
//       tamper check, and CSV/JSON export
//   Support (ForMedrixAI, Superadmin sessions)
//     • request access to another organisation, per ticket, with a reason
//     • your requests and approvals; end an approval early
//
// Everything here is decided and recorded by services/supportAccess/; the
// screen shows it and dispatches.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import {
  supportAccessService, minutesLeft, isLiveGrant, supportRequestQueues, supportWindowParts, SUPPORT_ACCESS_POLICIES, SUPPORT_WINDOW_OPTIONS, SUPPORT_AUDIT_COLUMNS,
  type SupportAccessPolicy, type SupportAccessRequest, type SupportAccessSettings, type SupportAuditEntry, type ChainCheck,
} from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { formatDateTime } from '@/utils/formatDate';
import { downloadText } from '@/utils/downloadText';

type Org = { id: string; name: string };

const SupportAccessSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isSupport = user?.role === 'superadmin';
  const [myTenant, setMyTenant] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [settings, setSettings] = useState<SupportAccessSettings | null>(null);
  const [draft, setDraft] = useState<SupportAccessSettings | null>(null);
  const [requests, setRequests] = useState<SupportAccessRequest[]>([]);
  const [mine, setMine] = useState<SupportAccessRequest[]>([]);
  const [audit, setAudit] = useState<SupportAuditEntry[] | null>(null);
  const [auditRefused, setAuditRefused] = useState(false);
  const [chain, setChain] = useState<ChainCheck | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ tenantId: '', ticketId: '', reason: '' });
  const [now, setNow] = useState(() => new Date());

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name ?? id;
  const when = (iso?: string) => (iso ? formatDateTime(iso, i18n.language) : '—');

  const load = useCallback(async () => {
    const [tenant, list] = await Promise.all([supportAccessService.sessionTenantId(), supportAccessService.organisations()]);
    setMyTenant(tenant); setOrgs(list); setNow(new Date());
    if (tenant) {
      const s = await supportAccessService.getSettings(tenant);
      setSettings(s); setDraft(s);
      setRequests(await supportAccessService.listRequests({ tenantId: tenant }));
      const a = await supportAccessService.listAudit(tenant);
      if (a.ok === false) { setAudit(null); setAuditRefused(true); } else { setAudit(a.entries); setAuditRefused(false); setChain(await supportAccessService.verifyAudit(tenant)); }
    }
    if (user?.id && isSupport) setMine(await supportAccessService.listRequests({ agentId: user.id }));
  }, [user?.id, isSupport]);

  useEffect(() => { void load(); }, [load]);
  // Time left on approvals, refreshed each half-minute.
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);

  const done = async (key: string | null) => { setMessage(key); await load(); };

  const saveSettings = async () => {
    if (!myTenant || !draft) return;
    const r = await supportAccessService.setSettings(myTenant, draft);
    await done(r.ok === false ? `supportAccess.refusals.${r.reason}` : 'supportAccess.messages.saved');
  };
  const decide = async (id: string, d: 'approve' | 'reject') => {
    const r = await supportAccessService.decide(id, d);
    await done(r.ok === false ? `supportAccess.refusals.${r.reason}` : d === 'approve' ? 'supportAccess.messages.approved' : 'supportAccess.messages.rejected');
  };
  const revoke = async (id: string) => {
    const r = await supportAccessService.revoke(id);
    await done(r.ok === false ? `supportAccess.refusals.${r.reason}` : 'supportAccess.messages.revoked');
  };
  const request = async () => {
    const r = await supportAccessService.requestAccess(form);
    if (r.ok) setForm({ tenantId: form.tenantId, ticketId: '', reason: '' });
    await done(r.ok === false ? `supportAccess.refusals.${r.reason}` : 'supportAccess.messages.requested');
  };
  const end = async (id: string) => { await supportAccessService.endAccess(id); await done('supportAccess.messages.ended'); };
  const exportAudit = async (format: 'csv' | 'json') => {
    if (!myTenant) return;
    const columns = Object.fromEntries(SUPPORT_AUDIT_COLUMNS.map(c => [c, t(`supportAccess.audit.columns.${c}`)])) as Record<(typeof SUPPORT_AUDIT_COLUMNS)[number], string>;
    const r = await supportAccessService.exportAudit(myTenant, format, columns);
    if (r.ok === false) { await done(`supportAccess.refusals.${r.reason}`); return; }
    downloadText(r.filename, r.content, r.mime);
    await load();
  };

  const { pending, active } = supportRequestQueues(requests, now);
  const windowLabel = (m: number) => {
    const w = supportWindowParts(m);
    return w.unit === 'hours' ? t('supportAccess.policy.windowHours', { count: w.count }) : t('supportAccess.policy.windowMinutes', { count: w.count });
  };

  return (
    <div className="ps-conf-page ps-supacc">
      <h2 className="ps-conf-section-title">{t('supportAccess.title')}</h2>
      <p className="ps-conf-section-subtitle">{t('supportAccess.subtitle')}</p>
      {message && <div className="ps-supacc-message" role="status">{t(message)}</div>}

      {myTenant && draft && (
        <section className="ps-supacc-card" aria-labelledby="supacc-policy">
          <h3 id="supacc-policy" className="ps-supacc-heading">{t('supportAccess.policy.heading', { organisation: orgName(myTenant) })}</h3>
          <div className="ps-supacc-options" role="radiogroup">
            {SUPPORT_ACCESS_POLICIES.map((p: SupportAccessPolicy) => (
              <label key={p} className={`ps-supacc-option${draft.policy === p ? ' ps-supacc-option--on' : ''}`}>
                <input type="radio" name="supacc-policy" checked={draft.policy === p} onChange={() => setDraft({ ...draft, policy: p })} />
                <span>
                  <span className="ps-supacc-option-title">{t(`supportAccess.policy.options.${p}.label`)}</span>
                  <span className="ps-supacc-option-desc">{t(`supportAccess.policy.options.${p}.description`)}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="ps-conf-label" htmlFor="supacc-window">{t('supportAccess.policy.windowLabel')}</label>
          <select id="supacc-window" className="ps-conf-select ps-supacc-window" value={draft.windowMinutes}
            onChange={e => setDraft({ ...draft, windowMinutes: Number(e.target.value) })}>
            {SUPPORT_WINDOW_OPTIONS.map(m => <option key={m} value={m}>{windowLabel(m)}</option>)}
          </select>
          <div className="ps-supacc-actions">
            <CapabilityButton capability="config:support-access:policy" className="ps-conf-btn-primary"
              disabled={!settings || (settings.policy === draft.policy && settings.windowMinutes === draft.windowMinutes)}
              onClick={() => { void saveSettings(); }}>
              {t('supportAccess.policy.save')}
            </CapabilityButton>
          </div>
        </section>
      )}

      {myTenant && (
        <section className="ps-supacc-card" aria-labelledby="supacc-pending">
          <h3 id="supacc-pending" className="ps-supacc-heading">{t('supportAccess.pending.heading', { count: pending.length })}</h3>
          {pending.length === 0 ? <p className="ps-supacc-empty">{t('supportAccess.pending.empty')}</p> : (
            <div className="ps-conf-table-wrap"><table className="ps-conf-table">
              <thead><tr>
                <th className="ps-conf-th">{t('supportAccess.columns.requested')}</th><th className="ps-conf-th">{t('supportAccess.columns.agent')}</th>
                <th className="ps-conf-th">{t('supportAccess.columns.ticket')}</th><th className="ps-conf-th">{t('supportAccess.columns.reason')}</th><th className="ps-conf-th" />
              </tr></thead>
              <tbody>{pending.map(r => (
                <tr key={r.id}>
                  <td className="ps-conf-td">{when(r.requestedAt)}</td><td className="ps-conf-td">{r.agentName}</td><td className="ps-conf-td">{r.ticketId}</td><td className="ps-conf-td" data-phi="true">{r.reason}</td>
                  <td className="ps-conf-td"><div className="ps-supacc-row-actions">
                    <CapabilityButton capability="config:support-access:approve" className="ps-conf-btn-primary" onClick={() => { void decide(r.id, 'approve'); }}>{t('supportAccess.pending.approve')}</CapabilityButton>
                    <CapabilityButton capability="config:support-access:approve" className="ps-conf-btn-secondary" onClick={() => { void decide(r.id, 'reject'); }}>{t('supportAccess.pending.reject')}</CapabilityButton>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <h3 className="ps-supacc-heading ps-supacc-heading--sub">{t('supportAccess.active.heading', { count: active.length })}</h3>
          {active.length === 0 ? <p className="ps-supacc-empty">{t('supportAccess.active.empty')}</p> : (
            <div className="ps-conf-table-wrap"><table className="ps-conf-table">
              <thead><tr>
                <th className="ps-conf-th">{t('supportAccess.columns.agent')}</th><th className="ps-conf-th">{t('supportAccess.columns.ticket')}</th>
                <th className="ps-conf-th">{t('supportAccess.columns.approvedBy')}</th><th className="ps-conf-th">{t('supportAccess.columns.timeLeft')}</th><th className="ps-conf-th" />
              </tr></thead>
              <tbody>{active.map(r => (
                <tr key={r.id}>
                  <td className="ps-conf-td">{r.agentName}</td><td className="ps-conf-td">{r.ticketId}</td><td className="ps-conf-td">{r.decidedByName}</td>
                  <td className="ps-conf-td">{t('supportAccess.active.minutesLeft', { count: minutesLeft(r.expiresAt, now) })}</td>
                  <td className="ps-conf-td"><div className="ps-supacc-row-actions">
                    <CapabilityButton capability="config:support-access:approve" className="ps-conf-btn-secondary" onClick={() => { void revoke(r.id); }}>{t('supportAccess.active.revoke')}</CapabilityButton>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}

      {myTenant && (
        <section className="ps-supacc-card" aria-labelledby="supacc-audit">
          <div className="ps-supacc-audit-head">
            <h3 id="supacc-audit" className="ps-supacc-heading">{t('supportAccess.audit.heading')}</h3>
            {chain && (
              <span className={`ps-supacc-chain ps-supacc-chain--${chain.intact ? 'ok' : 'broken'}`}>
                {chain.intact === false ? t('supportAccess.audit.chainBroken', { seq: chain.brokenAt }) : t('supportAccess.audit.chainIntact', { count: chain.entries })}
              </span>
            )}
            <span className="ps-supacc-audit-exports">
              <CapabilityButton capability="config:support-audit:view" className="ps-conf-btn-secondary" onClick={() => { void exportAudit('csv'); }}>{t('supportAccess.audit.exportCsv')}</CapabilityButton>
              <CapabilityButton capability="config:support-audit:view" className="ps-conf-btn-secondary" onClick={() => { void exportAudit('json'); }}>{t('supportAccess.audit.exportJson')}</CapabilityButton>
            </span>
          </div>
          <p className="ps-supacc-hint">{t('supportAccess.audit.hint')}</p>
          {auditRefused ? <p className="ps-supacc-empty">{t('supportAccess.audit.notPermitted')}</p> : audit && audit.length === 0 ? <p className="ps-supacc-empty">{t('supportAccess.audit.empty')}</p> : audit && (
            <div className="ps-conf-table-wrap"><div className="ps-conf-table-scroll ps-supacc-audit-scroll"><table className="ps-conf-table">
              <thead><tr>
                <th className="ps-conf-th">{t('supportAccess.audit.columns.timestamp')}</th><th className="ps-conf-th">{t('supportAccess.audit.columns.agent')}</th>
                <th className="ps-conf-th">{t('supportAccess.audit.columns.ticketId')}</th><th className="ps-conf-th">{t('supportAccess.audit.columns.action')}</th>
                <th className="ps-conf-th">{t('supportAccess.audit.columns.caseIds')}</th><th className="ps-conf-th">{t('supportAccess.audit.columns.detail')}</th>
              </tr></thead>
              <tbody>{audit.map(e => (
                <tr key={e.id}>
                  <td className="ps-conf-td">{when(e.at)}</td><td className="ps-conf-td">{e.actorName}</td><td className="ps-conf-td">{e.ticketId ?? '—'}</td>
                  <td className="ps-conf-td">{t(`supportAccess.audit.actions.${e.action}`)}</td>
                  <td className="ps-conf-td ps-supacc-cases" data-phi="case">{e.caseIds.join(', ') || '—'}</td>
                  <td className="ps-conf-td">{e.detail}</td>
                </tr>
              ))}</tbody>
            </table></div></div>
          )}
        </section>
      )}

      {isSupport && (
        <section className="ps-supacc-card ps-supacc-card--support" aria-labelledby="supacc-support">
          <h3 id="supacc-support" className="ps-supacc-heading">{t('supportAccess.support.heading')}</h3>
          <p className="ps-supacc-hint">{t('supportAccess.support.hint')}</p>
          <div className="ps-supacc-form">
            <label className="ps-conf-label" htmlFor="supacc-org">{t('supportAccess.support.organisation')}</label>
            <select id="supacc-org" className="ps-conf-select" value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
              <option value="">{t('supportAccess.support.chooseOrganisation')}</option>
              {orgs.filter(o => o.id !== myTenant).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <label className="ps-conf-label" htmlFor="supacc-ticket">{t('supportAccess.support.ticket')}</label>
            <input id="supacc-ticket" className="ps-conf-input" value={form.ticketId} onChange={e => setForm({ ...form, ticketId: e.target.value })} placeholder={t('supportAccess.support.ticketPlaceholder')} />
            <label className="ps-conf-label" htmlFor="supacc-reason">{t('supportAccess.support.reason')}</label>
            <textarea id="supacc-reason" className="ps-conf-input ps-supacc-reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder={t('supportAccess.support.reasonPlaceholder')} />
            <div className="ps-supacc-actions">
              <button className="ps-conf-btn-primary" disabled={!form.tenantId} onClick={() => { void request(); }}>{t('supportAccess.support.request')}</button>
            </div>
          </div>
          <h3 className="ps-supacc-heading ps-supacc-heading--sub">{t('supportAccess.support.mineHeading')}</h3>
          {mine.length === 0 ? <p className="ps-supacc-empty">{t('supportAccess.support.mineEmpty')}</p> : (
            <div className="ps-conf-table-wrap"><table className="ps-conf-table">
              <thead><tr>
                <th className="ps-conf-th">{t('supportAccess.support.organisation')}</th><th className="ps-conf-th">{t('supportAccess.columns.ticket')}</th>
                <th className="ps-conf-th">{t('supportAccess.columns.status')}</th><th className="ps-conf-th">{t('supportAccess.columns.timeLeft')}</th><th className="ps-conf-th" />
              </tr></thead>
              <tbody>{mine.map(r => {
                const live = isLiveGrant(r, now);
                return (
                  <tr key={r.id}>
                    <td className="ps-conf-td">{orgName(r.tenantId)}</td><td className="ps-conf-td">{r.ticketId}</td>
                    <td className="ps-conf-td"><span className={`ps-supacc-status ps-supacc-status--${r.status}`}>{t(`supportAccess.status.${r.status}`)}</span></td>
                    <td className="ps-conf-td">{live ? t('supportAccess.active.minutesLeft', { count: minutesLeft(r.expiresAt, now) }) : '—'}</td>
                    <td className="ps-conf-td"><div className="ps-supacc-row-actions">{live && <button className="ps-conf-btn-secondary" onClick={() => { void end(r.id); }}>{t('supportAccess.support.end')}</button>}</div></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>
      )}
    </div>
  );
};

export default SupportAccessSection;
