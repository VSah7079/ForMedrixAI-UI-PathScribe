// src/components/Config/System/BillingTypeTriggerSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Outbound Billing & Charge Event Engine epic's own
// stated acceptance criteria ("allow system administrators to specify
// default release triggers") - previously disclosed as real but
// deliberately not built (codeMapTable.ts's own header on
// BILLING_TYPE_DEFAULT_TRIGGER). This screen is purely
// presentational - it reads the real, effective trigger map and
// writes a real, complete override via
// mockBillingTypeTriggerConfigService.ts; every actual decision
// (what the default is, how a partial override merges) lives in that
// service, never here.
//
// Real, per direct follow-up ("scope should be available to the
// entire set of billing configuration with a fallback to Enterprise
// settings"): the "Viewing: Enterprise-Wide / [Site]" selector below
// mirrors BillingDictionarySection.tsx's own established pattern
// exactly - a facility can legitimately want its own release timing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { mockBillingTypeTriggerConfigService } from '@/services/billing/mockBillingTypeTriggerConfigService';
import type { BillingTypeTriggerMap } from '@/services/billing/mockBillingTypeTriggerConfigService';
import { BILLING_TYPE_DEFAULT_TRIGGER } from '@/services/billing/codeMapTable';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import { auditService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';

const BILLING_TYPE_LABEL: Record<keyof BillingTypeTriggerMap, string> = {
  TC: 'TC (Technical Component)',
  '26': '26 (Professional Component)',
  Global: 'Global (Combined)',
};

const TRIGGER_LABEL: Record<'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT', string> = {
  SPECIMEN_GROSSED: 'Specimen grossed',
  CASE_SIGNED_OUT: 'Case signed out',
};

const BillingTypeTriggerSection: React.FC = () => {
  const { user } = useAuth();
  const [triggerMap, setTriggerMap] = useState<BillingTypeTriggerMap>(BILLING_TYPE_DEFAULT_TRIGGER);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [isOverridden, setIsOverridden] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [viewingSiteId, setViewingSiteId] = useState<string>('');
  const [siteIdsWithOverrides, setSiteIdsWithOverrides] = useState<string[]>([]);

  const activeSiteId = viewingSiteId || undefined;

  const load = () => {
    Promise.all([
      mockBillingTypeTriggerConfigService.getEffectiveTriggerMap(activeSiteId),
      listAllSites(),
      mockBillingTypeTriggerConfigService.getSiteIdsWithOverrides(),
    ]).then(([mapRes, sitesRes, siteIdsRes]) => {
      if (mapRes.ok) {
        setTriggerMap(mapRes.data);
        setIsOverridden(JSON.stringify(mapRes.data) !== JSON.stringify(BILLING_TYPE_DEFAULT_TRIGGER));
      }
      setSites(sitesRes);
      if (siteIdsRes.ok) setSiteIdsWithOverrides(siteIdsRes.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, [viewingSiteId]);

  const scopeLabel = activeSiteId ? (sites.find(s => s.id === activeSiteId)?.name ?? activeSiteId) : 'Enterprise-Wide';

  const handleChange = async (billingType: keyof BillingTypeTriggerMap, trigger: 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT') => {
    const previous = triggerMap[billingType];
    const next = { ...triggerMap, [billingType]: trigger };
    setTriggerMap(next);
    const res = await mockBillingTypeTriggerConfigService.setTriggerOverride(next, activeSiteId);
    if (res.ok) {
      setIsOverridden(JSON.stringify(res.data) !== JSON.stringify(BILLING_TYPE_DEFAULT_TRIGGER));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Real, per direct guidance's own follow-up on the broader
      // provenance & auditability sweep: found via direct check to
      // have zero audit trail at all - an unaudited change here
      // silently shifts WHEN real money moves to outbound dispatch,
      // system-wide, with no record of who changed it or when.
      auditService.logEvent({
        type: 'user',
        event: 'Charge release trigger changed',
        detail: `${billingType} release trigger changed from ${previous} to ${trigger} (${scopeLabel})`,
        user: user?.name ?? 'unknown',
        caseId: null,
        confidence: null,
      });
      load();
    }
  };

  const handleResetToDefault = async () => {
    const previous = { ...triggerMap };
    const res = await mockBillingTypeTriggerConfigService.resetToDefault(activeSiteId);
    if (res.ok) {
      setTriggerMap(res.data);
      setIsOverridden(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      auditService.logEvent({
        type: 'user',
        event: 'Charge release triggers reset to default',
        detail: `Reset from ${JSON.stringify(previous)} to real defaults (${scopeLabel})`,
        user: user?.name ?? 'unknown',
        caseId: null,
        confidence: null,
      });
      load();
    }
  };

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <h2 className="ps-conf-section-title">Charge Release Triggers</h2>
        <p className="ps-conf-section-subtitle">
          Which real clinical event releases each billing component to the outbound dispatch queue.
          TC (technical component) releases as soon as its own specimen's grossing work is done by
          default; 26 (professional) and Global both hold until the whole case signs out. This is the
          real, admin-configurable override the Outbound Billing &amp; Charge Event Engine's own
          acceptance criteria calls for — leave a row on its default unless a real, specific reason
          requires releasing that component at a different real event. A facility with its own release
          timing can override just that site below; every other site keeps inheriting the enterprise-wide
          setting.
        </p>
      </div>

      <div className="ps-conf-row-actions">
        <select value={viewingSiteId} onChange={e => setViewingSiteId(e.target.value)} className="ps-conf-select">
          <option value="">Viewing: Enterprise-Wide</option>
          {sites.map(s => (
            <option key={s.id} value={s.id}>
              Viewing: {s.name}{siteIdsWithOverrides.includes(s.id) ? ' (has override)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">Billing Type</th>
                <th className="ps-conf-th">Releases At</th>
                <th className="ps-conf-th">Real Default</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(BILLING_TYPE_LABEL) as Array<keyof BillingTypeTriggerMap>).map(billingType => (
                <tr key={billingType} className="ps-conf-tr">
                  <td className="ps-conf-td">{BILLING_TYPE_LABEL[billingType]}</td>
                  <td className="ps-conf-td">
                    <select
                      className="ps-conf-select"
                      value={triggerMap[billingType]}
                      disabled={loading}
                      onChange={e => handleChange(billingType, e.target.value as 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT')}
                    >
                      <option value="SPECIMEN_GROSSED">{TRIGGER_LABEL.SPECIMEN_GROSSED}</option>
                      <option value="CASE_SIGNED_OUT">{TRIGGER_LABEL.CASE_SIGNED_OUT}</option>
                    </select>
                  </td>
                  <td className="ps-conf-td">{TRIGGER_LABEL[BILLING_TYPE_DEFAULT_TRIGGER[billingType]]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-conf-form-field">
        <button className="ps-conf-btn-secondary" onClick={handleResetToDefault} disabled={!isOverridden}>
          Reset {activeSiteId ? `${scopeLabel} to Enterprise-Wide` : 'all to real default'}
        </button>
        {saved && <span className="ps-billing-reason-hint">✓ Saved ({scopeLabel})</span>}
      </div>
    </div>
  );
};

export default BillingTypeTriggerSection;
