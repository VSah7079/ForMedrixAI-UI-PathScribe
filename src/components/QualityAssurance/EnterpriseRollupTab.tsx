// src/components/QualityAssurance/EnterpriseRollupTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// i18n note: `JURISDICTION_LABELS` (types/systemConfig.ts) is a shared,
// multi-consumer map used across seven other files — left as literal
// English data, out of scope for this file's own batch. CSV export
// column headers in `handleExport` stay literal English (persisted/
// exported data convention).
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Enterprise Business Intelligence
// Rollup Dashboard gap: a genuinely new, cross-facility view
// aggregating operational, financial, diagnostic, and TAT metrics
// across the whole network — respecting local data-residency rules at
// the performing-lab tier (see resolveJurisdictionRollup.ts's own
// header for the full architectural account) while rolling up
// anonymized/aggregated metrics enterprise-wide.
//
// Real, deliberate reuse of this module's own established QA
// conventions: cross-tenant audit logging (same as IntraopLinkageTab.tsx),
// PHI-safe export (exportQaReportRows — jurisdiction-level aggregate
// rows only, never a raw case), and the same real data-fetching
// pattern already proven in ContributionDashboardPage.tsx for RVU
// versions and the specimen dictionary.
//
// Real, honest scope note: this is the dashboard UI and the real,
// tested LOCAL AGGREGATION logic, built against this app's own
// existing, single-instance case/facility data as a stand-in for true
// multi-facility federation — genuine, physically-separate per-
// facility data hosting across jurisdictions is real, separate backend
// infrastructure this app does not have (per the RFP's own "Backend
// need" note for this gap).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockFacilityService } from '@/services/facilities/mockFacilityService';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import { specimenDictionaryService } from '@/services';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { TAT_STORAGE_KEY, SYSTEM_DEFAULTS as TAT_SYSTEM_DEFAULTS } from '@components/Config/System/TATConfigSection';
import type { TatEntryForResolution } from '@/components/Contribution/qualityCalculations';
import { resolveJurisdictionRollup, type EnterpriseRollupResult, type CaseForJurisdictionRollup } from '@/services/qualityAssurance/resolveJurisdictionRollup';
import { JURISDICTION_LABELS } from '@/types/systemConfig';
import { exportQaReportRows } from './qaReportUtils';

export const EnterpriseRollupTab: React.FC = () => {
  const { t } = useTranslation();
  const [result, setResult] = useState<EnterpriseRollupResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSessionUser();
    const crossTenant = canViewCrossTenantQaData(session);
    if (crossTenant) {
      mockAuditService.logEvent({
        type: 'system',
        event: 'qa.cross_tenant_access_executed',
        detail: `Cross-tenant QA access: Enterprise Rollup tab, user ${session?.id ?? 'unknown'}`,
        user: session?.id ?? 'unknown',
        caseId: null,
        confidence: null,
      }).catch(() => {});
    }

    const tatEntries = (() => {
      try {
        const raw = localStorage.getItem(TAT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : TAT_SYSTEM_DEFAULTS;
      } catch { return TAT_SYSTEM_DEFAULTS; }
    })() as TatEntryForResolution[];

    Promise.all([
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: crossTenant }),
      mockFacilityService.getAll(),
      mockRvuCodeMapService.getAllVersions(),
      specimenDictionaryService.getAll(),
    ]).then(([casesRes, facilitiesRes, versionsRes, dictionaryRes]) => {
      if (!casesRes.ok || !facilitiesRes.ok) { setLoading(false); return; }
      const enterpriseFacilities = facilitiesRes.data.filter(f => f.isEnterprise);
      const versions = versionsRes.ok ? versionsRes.data : [];
      const dictionaryEntries = dictionaryRes.ok ? dictionaryRes.data : [];
      setResult(resolveJurisdictionRollup(
        casesRes.data as CaseForJurisdictionRollup[],
        enterpriseFacilities,
        tatEntries,
        versions,
        dictionaryEntries,
      ));
      setLoading(false);
    });
  }, []);

  const handleExport = () => {
    if (!result) return;
    // Real, per this module's own established PHI-safe export
    // convention (qaReportUtils.ts's own header) — jurisdiction-level
    // aggregate rows only, never a raw case, never patient data.
    const rows = result.byJurisdiction.map(r => ({
      Jurisdiction: JURISDICTION_LABELS[r.jurisdiction],
      'Facility Count': r.facilityCount,
      'Case Volume': r.caseVolume,
      'Total Work RVU': r.totalWorkRvu,
      'AI-Assisted %': r.aiAssistedPct,
      'First-Touch Avg (hrs)': r.firstTouchAvgHrs,
      'Total Case Avg (hrs)': r.totalCaseAvgHrs,
      'On-Target %': r.onTargetPct,
    }));
    exportQaReportRows(rows, `enterprise-rollup-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) return <div className="ps-conf-page">{t('common.loading')}</div>;
  if (!result) return <div className="ps-conf-page">{t('enterpriseRollupTab.unableToLoad')}</div>;

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('enterpriseRollupTab.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('enterpriseRollupTab.subtitle')}
      </p>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('billingDictionarySection.enterpriseWideLabel')}</div>
        <div className="ps-conf-row"><span>{t('qaConfigurationCenterSection.table.headers.jurisdictions')}</span><span className="ps-conf-value">{result.enterpriseWide.jurisdictionCount}</span></div>
        <div className="ps-conf-row"><span>{t('physiciansSection.table.facilities')}</span><span className="ps-conf-value">{result.enterpriseWide.facilityCount}</span></div>
        <div className="ps-conf-row"><span>{t('enterpriseRollupTab.caseVolumeLabel')}</span><span className="ps-conf-value">{result.enterpriseWide.caseVolume}</span></div>
        <div className="ps-conf-row"><span>{t('enterpriseRollupTab.totalWorkRvuLabel')}</span><span className="ps-conf-value">{result.enterpriseWide.totalWorkRvu}</span></div>
        <div className="ps-conf-row"><span>{t('aiContributionTab.comparison.aiLabel')}</span><span className="ps-conf-value">{result.enterpriseWide.aiAssistedPct}%</span></div>
        <div className="ps-conf-row"><span>{t('enterpriseRollupTab.onTargetTatLabel')}</span><span className="ps-conf-value">{result.enterpriseWide.onTargetPct}%</span></div>
        {result.unresolvedCaseCount > 0 && (
          <div className="ps-conf-saving-indicator">{t('enterpriseRollupTab.unresolvedNotice', { count: result.unresolvedCaseCount })}</div>
        )}
      </div>

      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('enterpriseRollupTab.byJurisdictionTitle')}</div>
          <button className="ps-conf-btn-secondary" onClick={handleExport}>{t('qualityAssurance.common.export')}</button>
        </div>
        {result.byJurisdiction.map(row => (
          <div key={row.jurisdiction} className="ps-conf-row">
            <span>{JURISDICTION_LABELS[row.jurisdiction]}</span>
            <span className="ps-conf-value">
              {t('enterpriseRollupTab.rowSummary', {
                caseVolume: row.caseVolume,
                facilityCount: row.facilityCount,
                totalWorkRvu: row.totalWorkRvu,
                aiAssistedPct: row.aiAssistedPct,
                onTargetPct: row.onTargetPct,
              })}
            </span>
          </div>
        ))}
        {result.byJurisdiction.length === 0 && (
          <div className="ps-conf-empty-row">{t('enterpriseRollupTab.emptyState')}</div>
        )}
      </div>
    </div>
  );
};
