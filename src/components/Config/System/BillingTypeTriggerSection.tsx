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
//
// i18n sweep (batch 53): the persisted `auditService.logEvent()`
// detail/event strings keep using the real, raw internal
// `billingType`/trigger enum values and the English `scopeLabel` —
// a real audit-trail record, not on-screen chrome, so it must never
// shift with the UI locale. A separate `scopeLabelDisplay` was added
// for the on-screen button/badge text so the enterprise-wide fallback
// can be translated there without touching the persisted string. Real
// site names (`s.name`) stay as stored.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { mockBillingTypeTriggerConfigService } from '@/services/billing/mockBillingTypeTriggerConfigService';
import type { BillingTypeTriggerMap } from '@/services/billing/mockBillingTypeTriggerConfigService';
import { BILLING_TYPE_DEFAULT_TRIGGER } from '@/services/billing/codeMapTable';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import { auditService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';

const BILLING_TYPE_LABEL_KEY: Record<keyof BillingTypeTriggerMap, string> = {
  TC: 'billingTypeTriggerSection.billingTypes.tc',
  '26': 'billingTypeTriggerSection.billingTypes.professional',
  Global: 'billingTypeTriggerSection.billingTypes.global',
};

const TRIGGER_LABEL_KEY: Record<'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT', string> = {
  SPECIMEN_GROSSED: 'billingTypeTriggerSection.triggers.specimenGrossed',
  CASE_SIGNED_OUT: 'billingTypeTriggerSection.triggers.caseSignedOut',
};

const BillingTypeTriggerSection: React.FC = () => {
  const { t } = useTranslation();
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

  // Real, English, used only in the persisted audit-trail record below —
  // never rendered on screen. See scopeLabelDisplay for the translated
  // on-screen equivalent.
  const scopeLabel = activeSiteId ? (sites.find(s => s.id === activeSiteId)?.name ?? activeSiteId) : 'Enterprise-Wide';
  const scopeLabelDisplay = activeSiteId ? (sites.find(s => s.id === activeSiteId)?.name ?? activeSiteId) : t('billingTypeTriggerSection.enterpriseWide');

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
        <h2 className="ps-conf-section-title">{t('billingTypeTriggerSection.title')}</h2>
        <p className="ps-conf-section-subtitle">
          {t('billingTypeTriggerSection.subtitle')}
        </p>
      </div>

      <div className="ps-conf-row-actions">
        <select value={viewingSiteId} onChange={e => setViewingSiteId(e.target.value)} className="ps-conf-select">
          <option value="">{t('billingTypeTriggerSection.viewingEnterpriseWide')}</option>
          {sites.map(s => (
            <option key={s.id} value={s.id}>
              {t('billingTypeTriggerSection.viewingSite', { site: s.name })}{siteIdsWithOverrides.includes(s.id) ? ` ${t('billingTypeTriggerSection.hasOverride')}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('billingTypeTriggerSection.table.billingType')}</th>
                <th className="ps-conf-th">{t('billingTypeTriggerSection.table.releasesAt')}</th>
                <th className="ps-conf-th">{t('billingTypeTriggerSection.table.realDefault')}</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(BILLING_TYPE_LABEL_KEY) as Array<keyof BillingTypeTriggerMap>).map(billingType => (
                <tr key={billingType} className="ps-conf-tr">
                  <td className="ps-conf-td">{t(BILLING_TYPE_LABEL_KEY[billingType])}</td>
                  <td className="ps-conf-td">
                    <select
                      className="ps-conf-select"
                      value={triggerMap[billingType]}
                      disabled={loading}
                      onChange={e => handleChange(billingType, e.target.value as 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT')}
                    >
                      <option value="SPECIMEN_GROSSED">{t(TRIGGER_LABEL_KEY.SPECIMEN_GROSSED)}</option>
                      <option value="CASE_SIGNED_OUT">{t(TRIGGER_LABEL_KEY.CASE_SIGNED_OUT)}</option>
                    </select>
                  </td>
                  <td className="ps-conf-td">{t(TRIGGER_LABEL_KEY[BILLING_TYPE_DEFAULT_TRIGGER[billingType]])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-conf-form-field">
        <button className="ps-conf-btn-secondary" onClick={handleResetToDefault} disabled={!isOverridden}>
          {activeSiteId ? t('billingTypeTriggerSection.resetSiteBtn', { scope: scopeLabelDisplay }) : t('billingTypeTriggerSection.resetAllBtn')}
        </button>
        {saved && <span className="ps-billing-reason-hint">{t('billingTypeTriggerSection.savedMessage', { scope: scopeLabelDisplay })}</span>}
      </div>
    </div>
  );
};

export default BillingTypeTriggerSection;
