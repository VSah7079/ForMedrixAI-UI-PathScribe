// src/components/Config/System/PendingApprovalSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Four-Eyes Principle (dual control)
// requirement: a real, second-person review queue for every billing
// rule version genuinely PENDING_APPROVAL, across every billingCode
// and site. The service layer (mockBillingRuleService.ts) is the real
// backstop - approveVersion/rejectVersion hard-reject a reviewer who
// matches the drafter or submitter regardless of what this UI does or
// doesn't check - but the visual lockout here means a reviewer never
// has to find that out the hard way: the actions are genuinely
// disabled, with a clear, honest explanation, before they'd even try.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mockBillingRuleService } from '@/services/billing/mockBillingRuleService';
import { mockModifierDictionaryService } from '@/services/billing/mockModifierDictionaryService';
import type { ModifierTableVersion } from '@/services/billing/ModifierTableVersion';
import { mockNcciEditService } from '@/services/billing/mockNcciEditService';
import type { NcciPtpEditImport } from '@/types/billing/NcciPtpEdit';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import type { RvuTableVersion } from '@/services/billing/RvuTableVersion';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { auditService } from '@/services';
import { siteLabel } from './BillingDictionarySection';

const PendingApprovalSection: React.FC = () => {
  const { t } = useTranslation();
  const [pending, setPending] = useState<BillingRuleVersion[]>([]);
  const [pendingModifiers, setPendingModifiers] = useState<ModifierTableVersion[]>([]);
  const [pendingNcci, setPendingNcci] = useState<NcciPtpEditImport[]>([]);
  const [pendingRvu, setPendingRvu] = useState<RvuTableVersion[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingModifierId, setRejectingModifierId] = useState<string | null>(null);
  const [modifierRejectionReason, setModifierRejectionReason] = useState('');
  const [rejectingNcciId, setRejectingNcciId] = useState<string | null>(null);
  const [ncciRejectionReason, setNcciRejectionReason] = useState('');
  const [rejectingRvuId, setRejectingRvuId] = useState<string | null>(null);
  const [rvuRejectionReason, setRvuRejectionReason] = useState('');

  const currentUserId = getSessionUser()?.id ?? 'unknown';
  const currentUserDisplayName = () => {
    const u = getSessionUser();
    return u?.firstName ? `${u.firstName} ${u.lastName ?? ''}`.trim() : currentUserId;
  };

  const refresh = useCallback(() => {
    Promise.all([mockBillingRuleService.getAll(), listAllSites(), mockModifierDictionaryService.getAllVersions(), mockNcciEditService.getAllImports(), mockRvuCodeMapService.getAllVersions()]).then(([versionsRes, sitesRes, modifierRes, ncciRes, rvuRes]) => {
      if (versionsRes.ok) setPending(versionsRes.data.filter(v => v.status === 'PENDING_APPROVAL'));
      setSites(sitesRes);
      if (modifierRes.ok) setPendingModifiers(modifierRes.data.filter(v => v.approvalStatus === 'PENDING_APPROVAL'));
      if (ncciRes.ok) setPendingNcci(ncciRes.data.filter(i => i.approvalStatus === 'PENDING_APPROVAL'));
      if (rvuRes.ok) setPendingRvu(rvuRes.data.filter(v => v.approvalStatus === 'PENDING_APPROVAL'));
      setLoading(false);
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const rowKey = (v: BillingRuleVersion) => `${v.billingCode}::${v.siteId ?? ''}::${v.version}`;

  // Real, visual Four-Eyes Principle enforcement - the same real
  // check the service layer hard-enforces, surfaced here so a
  // reviewer sees why the actions are unavailable instead of
  // discovering it only after clicking Approve.
  const isLockedForCurrentUser = (v: BillingRuleVersion) =>
    currentUserId === v.createdBy || currentUserId === v.submittedForApprovalBy;

  const isModifierLockedForCurrentUser = (v: ModifierTableVersion) =>
    currentUserId === v.uploadedBy || currentUserId === v.submittedForApprovalBy;

  const isNcciLockedForCurrentUser = (v: NcciPtpEditImport) =>
    currentUserId === v.importedBy || currentUserId === v.submittedForApprovalBy;

  const isRvuLockedForCurrentUser = (v: RvuTableVersion) =>
    currentUserId === v.uploadedBy || currentUserId === v.submittedForApprovalBy;

  const handleApprove = async (v: BillingRuleVersion) => {
    setErrorMsg(null);
    const res = await mockBillingRuleService.approveVersion(v.billingCode, v.version, v.siteId, currentUserId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'Billing rule approved',
      detail: `${v.billingCode} v${v.version}${v.siteId ? ` (site ${v.siteId})` : ' (enterprise-wide)'} approved`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    refresh();
  };

  const handleReject = async (v: BillingRuleVersion) => {
    setErrorMsg(null);
    if (!rejectionReason.trim()) { setErrorMsg(t('pendingApprovalSection.rejectionReasonRequired')); return; }
    const res = await mockBillingRuleService.rejectVersion(v.billingCode, v.version, v.siteId, currentUserId, rejectionReason.trim());
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'Billing rule rejected',
      detail: `${v.billingCode} v${v.version}${v.siteId ? ` (site ${v.siteId})` : ' (enterprise-wide)'} rejected: ${rejectionReason.trim()}`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    setRejectingKey(null);
    setRejectionReason('');
    refresh();
  };

  const handleApproveModifier = async (v: ModifierTableVersion) => {
    setErrorMsg(null);
    const res = await mockModifierDictionaryService.approveVersion(v.id, currentUserId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'CPT Modifier Dictionary version approved',
      detail: `"${v.label}" approved and activated`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    refresh();
  };

  const handleRejectModifier = async (v: ModifierTableVersion) => {
    setErrorMsg(null);
    if (!modifierRejectionReason.trim()) { setErrorMsg(t('pendingApprovalSection.rejectionReasonRequired')); return; }
    const res = await mockModifierDictionaryService.rejectVersion(v.id, currentUserId, modifierRejectionReason.trim());
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'CPT Modifier Dictionary version rejected',
      detail: `"${v.label}" rejected: ${modifierRejectionReason.trim()}`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    setRejectingModifierId(null);
    setModifierRejectionReason('');
    refresh();
  };

  const handleApproveNcci = async (v: NcciPtpEditImport) => {
    setErrorMsg(null);
    const res = await mockNcciEditService.approveImport(v.id, currentUserId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'NCCI Edit Rules import approved',
      detail: `"${v.quarterVersion}" approved and activated`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    refresh();
  };

  const handleRejectNcci = async (v: NcciPtpEditImport) => {
    setErrorMsg(null);
    if (!ncciRejectionReason.trim()) { setErrorMsg(t('pendingApprovalSection.rejectionReasonRequired')); return; }
    const res = await mockNcciEditService.rejectImport(v.id, currentUserId, ncciRejectionReason.trim());
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'NCCI Edit Rules import rejected',
      detail: `"${v.quarterVersion}" rejected: ${ncciRejectionReason.trim()}`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    setRejectingNcciId(null);
    setNcciRejectionReason('');
    refresh();
  };

  const handleApproveRvu = async (v: RvuTableVersion) => {
    setErrorMsg(null);
    const res = await mockRvuCodeMapService.approveVersion(v.id, currentUserId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'RVU Code Map version approved',
      detail: `"${v.label}" approved and activated`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    refresh();
  };

  const handleRejectRvu = async (v: RvuTableVersion) => {
    setErrorMsg(null);
    if (!rvuRejectionReason.trim()) { setErrorMsg(t('pendingApprovalSection.rejectionReasonRequired')); return; }
    const res = await mockRvuCodeMapService.rejectVersion(v.id, currentUserId, rvuRejectionReason.trim());
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'RVU Code Map version rejected',
      detail: `"${v.label}" rejected: ${rvuRejectionReason.trim()}`,
      user: currentUserDisplayName(),
      caseId: null,
      confidence: null,
    });
    setRejectingRvuId(null);
    setRvuRejectionReason('');
    refresh();
  };

  if (loading) return <div className="ps-conf-loading">{t('pendingApprovalSection.loading')}</div>;

  const billingRuleHeaders = [
    t('pendingApprovalSection.billingRules.headers.billingCode'),
    t('pendingApprovalSection.billingRules.headers.cpt'),
    t('pendingApprovalSection.billingRules.headers.rvuWork'),
    t('pendingApprovalSection.billingRules.headers.effectiveFrom'),
    t('pendingApprovalSection.billingRules.headers.scope'),
    t('pendingApprovalSection.billingRules.headers.draftedBy'),
    t('pendingApprovalSection.billingRules.headers.submittedBy'),
    t('pendingApprovalSection.billingRules.headers.changeReason'),
    t('pendingApprovalSection.billingRules.headers.actions'),
  ];

  const dictionaryHeaders = [
    t('pendingApprovalSection.dictionaries.headers.dictionary'),
    t('pendingApprovalSection.dictionaries.headers.label'),
    t('pendingApprovalSection.dictionaries.headers.effectiveFrom'),
    t('pendingApprovalSection.dictionaries.headers.submittedBy'),
    t('pendingApprovalSection.dictionaries.headers.actions'),
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('pendingApprovalSection.billingRules.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('pendingApprovalSection.billingRules.subtitle')}
          </p>
        </div>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead>
              <tr>{billingRuleHeaders.map(h =>
                <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {pending.map(v => {
                const locked = isLockedForCurrentUser(v);
                const isRejecting = rejectingKey === rowKey(v);
                return (
                  <tr key={rowKey(v)}>
                    <td className="ps-conf-td"><span className="ps-conf-identity-name">{v.billingCode}</span></td>
                    <td className="ps-conf-td">{v.cpt}</td>
                    <td className="ps-conf-td">{v.rvuWork ?? '—'}</td>
                    <td className="ps-conf-td">{new Date(v.effectiveFrom).toLocaleDateString()}</td>
                    <td className="ps-conf-td">{siteLabel(sites, v.siteId)}</td>
                    <td className="ps-conf-td">{v.createdBy}</td>
                    <td className="ps-conf-td">{v.submittedForApprovalBy ?? '—'}</td>
                    <td className="ps-conf-td">{v.changeReason ?? '—'}</td>
                    <td className="ps-conf-td">
                      {locked ? (
                        <span className="ps-billing-reason-hint">
                          {t('pendingApprovalSection.billingRules.lockedHint')}
                        </span>
                      ) : isRejecting ? (
                        <div className="ps-conf-row-actions">
                          <input
                            className="ps-conf-input"
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                            placeholder={t('pendingApprovalSection.rejectPlaceholder')}
                            autoFocus
                          />
                          <button className="ps-conf-btn-row" onClick={() => handleReject(v)}>{t('pendingApprovalSection.confirmReject')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingKey(null); setRejectionReason(''); setErrorMsg(null); }}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <div className="ps-conf-row-actions">
                          <button className="ps-conf-btn-row" onClick={() => handleApprove(v)}>{t('pendingApprovalSection.approve')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingKey(rowKey(v)); setRejectionReason(''); setErrorMsg(null); }}>{t('pendingApprovalSection.reject')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pending.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={9}>{t('pendingApprovalSection.billingRules.emptyRow')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('pendingApprovalSection.dictionaries.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('pendingApprovalSection.dictionaries.subtitle')}
          </p>
        </div>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead>
              <tr>{dictionaryHeaders.map(h =>
                <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {pendingModifiers.map(v => {
                const locked = isModifierLockedForCurrentUser(v);
                const isRejecting = rejectingModifierId === v.id;
                return (
                  <tr key={v.id}>
                    <td className="ps-conf-td">{t('pendingApprovalSection.dictionaries.names.modifier')}</td>
                    <td className="ps-conf-td"><span className="ps-conf-identity-name">{v.label}</span></td>
                    <td className="ps-conf-td">{new Date(v.effectiveDate).toLocaleDateString()}</td>
                    <td className="ps-conf-td">{v.submittedForApprovalBy ?? v.uploadedBy}</td>
                    <td className="ps-conf-td">
                      {locked ? (
                        <span className="ps-billing-reason-hint">
                          {t('pendingApprovalSection.dictionaries.lockedHint')}
                        </span>
                      ) : isRejecting ? (
                        <div className="ps-conf-row-actions">
                          <input
                            className="ps-conf-input"
                            value={modifierRejectionReason}
                            onChange={e => setModifierRejectionReason(e.target.value)}
                            placeholder={t('pendingApprovalSection.rejectPlaceholder')}
                            autoFocus
                          />
                          <button className="ps-conf-btn-row" onClick={() => handleRejectModifier(v)}>{t('pendingApprovalSection.confirmReject')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingModifierId(null); setModifierRejectionReason(''); setErrorMsg(null); }}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <div className="ps-conf-row-actions">
                          <button className="ps-conf-btn-row" onClick={() => handleApproveModifier(v)}>{t('pendingApprovalSection.approve')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingModifierId(v.id); setModifierRejectionReason(''); setErrorMsg(null); }}>{t('pendingApprovalSection.reject')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pendingNcci.map(v => {
                const locked = isNcciLockedForCurrentUser(v);
                const isRejecting = rejectingNcciId === v.id;
                return (
                  <tr key={v.id}>
                    <td className="ps-conf-td">{t('pendingApprovalSection.dictionaries.names.ncci')}</td>
                    <td className="ps-conf-td"><span className="ps-conf-identity-name">{v.quarterVersion}</span> ({t('pendingApprovalSection.pairCount', { count: v.pairCount })})</td>
                    <td className="ps-conf-td">{new Date(v.importedAt).toLocaleDateString()}</td>
                    <td className="ps-conf-td">{v.submittedForApprovalBy ?? v.importedBy}</td>
                    <td className="ps-conf-td">
                      {locked ? (
                        <span className="ps-billing-reason-hint">
                          {t('pendingApprovalSection.dictionaries.lockedHint')}
                        </span>
                      ) : isRejecting ? (
                        <div className="ps-conf-row-actions">
                          <input
                            className="ps-conf-input"
                            value={ncciRejectionReason}
                            onChange={e => setNcciRejectionReason(e.target.value)}
                            placeholder={t('pendingApprovalSection.rejectPlaceholder')}
                            autoFocus
                          />
                          <button className="ps-conf-btn-row" onClick={() => handleRejectNcci(v)}>{t('pendingApprovalSection.confirmReject')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingNcciId(null); setNcciRejectionReason(''); setErrorMsg(null); }}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <div className="ps-conf-row-actions">
                          <button className="ps-conf-btn-row" onClick={() => handleApproveNcci(v)}>{t('pendingApprovalSection.approve')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingNcciId(v.id); setNcciRejectionReason(''); setErrorMsg(null); }}>{t('pendingApprovalSection.reject')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pendingRvu.map(v => {
                const locked = isRvuLockedForCurrentUser(v);
                const isRejecting = rejectingRvuId === v.id;
                return (
                  <tr key={v.id}>
                    <td className="ps-conf-td">{t('pendingApprovalSection.dictionaries.names.rvu')}</td>
                    <td className="ps-conf-td"><span className="ps-conf-identity-name">{v.label}</span> ({t('pendingApprovalSection.codeCount', { count: v.entries.length })})</td>
                    <td className="ps-conf-td">{new Date(v.effectiveDate).toLocaleDateString()}</td>
                    <td className="ps-conf-td">{v.submittedForApprovalBy ?? v.uploadedBy}</td>
                    <td className="ps-conf-td">
                      {locked ? (
                        <span className="ps-billing-reason-hint">
                          {t('pendingApprovalSection.dictionaries.lockedHint')}
                        </span>
                      ) : isRejecting ? (
                        <div className="ps-conf-row-actions">
                          <input
                            className="ps-conf-input"
                            value={rvuRejectionReason}
                            onChange={e => setRvuRejectionReason(e.target.value)}
                            placeholder={t('pendingApprovalSection.rejectPlaceholder')}
                            autoFocus
                          />
                          <button className="ps-conf-btn-row" onClick={() => handleRejectRvu(v)}>{t('pendingApprovalSection.confirmReject')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingRvuId(null); setRvuRejectionReason(''); setErrorMsg(null); }}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <div className="ps-conf-row-actions">
                          <button className="ps-conf-btn-row" onClick={() => handleApproveRvu(v)}>{t('pendingApprovalSection.approve')}</button>
                          <button className="ps-conf-btn-row" onClick={() => { setRejectingRvuId(v.id); setRvuRejectionReason(''); setErrorMsg(null); }}>{t('pendingApprovalSection.reject')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pendingModifiers.length === 0 && pendingNcci.length === 0 && pendingRvu.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>{t('pendingApprovalSection.dictionaries.emptyRow')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalSection;
