// src/pages/ContributionDashboardPage.tsx
//
// File-by-file cleanup sweep: all UI chrome (tab labels, tile titles/
// subtitles, KPI labels, empty states) now goes through t() — new
// `contributionDashboard` namespace. Real dead code removed: kpiExtras'
// own `targetLabel` field was set on two of the three entries but never
// once read anywhere in this file's JSX (confirmed via grep) — the %-of-
// target figure renders with no label beside it, so the field was inert
// from the start. The progress bar's `style={{ width: ... }}` became a
// `--progress-width` custom property + `.ps-contrib-progress-fill--
// dynamic-width` class, the same established pattern this file's own
// WeeklyOverviewChart/TatPerformanceTile already use for their bars.
// Also: `pathscribeTheme` was previously imported as `t` — a real naming
// collision with i18next's own `t()`, surfaced only once this sweep added
// useTranslation() here. Renamed to its own name at both of its two call
// sites rather than aliasing around the clash.
import React, { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useAuth } from "@contexts/AuthContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { WarningIcon } from "@components/Icons";
import FlagRow        from "@components/Contribution/FlagRow";
import CaseMixTile    from "@components/Contribution/CaseMixTile";
import ProductivityTab from "../components/Contribution/ProductivityTab";
import QualityTab      from "../components/Contribution/QualityTab";
import AIContributionTab from "../components/Contribution/AIContributionTab";
import MentorTab        from "../components/Contribution/MentorTab";
import { pathscribeTheme } from "@theme/pathscribeTheme";
import type {
  ContributionFlag,
  KpiTile,
} from "../types/ContributionDashboard";
import { getOrgOrchestratorDefault } from "@components/Config/AI/orchestratorModeConfig";
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '../constants/systemActions';
import { useNavigate } from 'react-router-dom';
import { specimenDeficiencyService, deficiencyTypeService, qaActivityRecordService, intraoperativeService, subspecialtyService, countersignService, qaSupervisionAssignmentService, qaSupervisionAssignmentTypeService } from '../services';
import type { Subspecialty } from '../services';
import { caseRouter } from '../services/cases/CaseRouter';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '../services/quality/mockQaActivityTypeService';
import { computeOverviewKpis, computeCaseMixData, computeOrgWideTatPerformance, computeRvu30, computeWeeklyDaily, type RealOverviewKpis, type RealCaseMixData, type RealTatPerformance, type RealRvu30, type RealDailyRvu } from './contributionDashboardCalculations';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import { specimenDictionaryService } from '@/services';
import { TAT_STORAGE_KEY, SYSTEM_DEFAULTS as TAT_SYSTEM_DEFAULTS } from '@components/Config/System/TATConfigSection';
import type { TatEntryForResolution } from '@components/Contribution/qualityCalculations';
import { toCsv, downloadCsv } from '../utils/csv';
import type { SpecimenDeficiency, DeficiencyType } from '../services/deficiencies/IDeficiencyService';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';
import type { QaSupervisionAssignmentType } from '@/types/quality/QaSupervisionAssignmentType';
import { buildSubspecialtyBreakdown, applyExpectedCaseMix, describeSupervisionProgress, buildCaseMixExportRows } from '@components/Contribution/caseMixCalculations';


// ─── Mock Data ────────────────────────────────────────────────────────────────

// Extended KPI data — peer averages and % of target (added alongside KpiTile)
const kpiExtras = [
  { peer: 109, targetPct: 107 },
  { peer: 18,  targetPct: null },
  { peer: 76,  targetPct: 72 },
];

// mockKpis removed - real fix, now derived from overviewKpis state
// via realKpiTiles() below, computed in
// contributionDashboardCalculations.ts's computeOverviewKpis.

// mockCaseMixData removed - real fix, now sourced from caseMixData
// state via computeCaseMixData in contributionDashboardCalculations.ts.



// Quality Flags previously lived here as 3 permanently-fixed fake
// entries ("PSA-2024-XXXX") with zero connection to the real
// Deficiency/CAPA system — looked live, never actually was. Replaced
// by a real fetch + derivation inside the component itself, below.

// mockRvu30 removed - real fix, now sourced from rvu30 state via
// computeRvu30 in contributionDashboardCalculations.ts.

// mockClientTatData/mockTatTargets/mockTatPerf removed - real fix, now
// sourced from tatPerformance state via computeOrgWideTatPerformance in
// contributionDashboardCalculations.ts.

// mockDaily removed - real fix, now sourced from weeklyDaily state via
// computeWeeklyDaily in contributionDashboardCalculations.ts.

// ─── Tab config ───────────────────────────────────────────────────────────────

type DashboardTab = "overview" | "productivity" | "quality" | "ai" | "mentor";

const TAB_LABEL_KEYS: Record<DashboardTab, string> = {
  overview:     "contributionDashboard.tabLabels.overview",
  productivity: "contributionDashboard.tabLabels.productivity",
  quality:      "contributionDashboard.tabLabels.quality",
  ai:           "contributionDashboard.tabLabels.ai",
  mentor:       "contributionDashboard.tabLabels.mentor",
};

// ─── Inline Weekly Chart (Overview) ──────────────────────────────────────────

const WeeklyOverviewChart: React.FC<{ data: RealDailyRvu[] }> = ({ data }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);
  // Single shared scale — bars reflect true relative magnitude across both series
  const maxC    = Math.max(...data.map(d => d.cases), 1);
  const maxR    = Math.max(...data.map(d => d.rvus), 1);
  const maxAll  = Math.max(maxC, maxR);
  const BAR_H   = 72; // max bar height px — the highest value across both series fills this

  return (
    <div className="ps-contrib-tile">
      <div className="ps-contrib-chart-header">
        <div className="ps-contrib-chart-title">{t('contributionDashboard.weeklyChart.title')}</div>
        <div className="ps-contrib-chart-subtitle">{t('contributionDashboard.weeklyChart.subtitle')}</div>
      </div>

      <div className="ps-contrib-chart-bars">
        {data.map((d, i) => {
          const cH    = (d.cases / maxAll) * BAR_H;
          const rH    = (d.rvus  / maxAll) * BAR_H;
          const isHov = hovered === i;
          return (
            <div key={d.day}
              className="ps-contrib-chart-barcol"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            >
              {/* Always-visible totals above bars */}
              <div className="ps-contrib-chart-totals">
                <div className="ps-contrib-chart-total ps-contrib-chart-total--cases">{d.cases}</div>
                <div className="ps-contrib-chart-total ps-contrib-chart-total--rvu">{d.rvus}</div>
              </div>

              {/* Bars */}
              <div className="ps-contrib-chart-bar-track">
                <div className={`ps-contrib-chart-bar ps-contrib-chart-bar--cases${isHov ? ' ps-contrib-chart-bar--hovered' : ''}`} style={{ '--bar-height': `${cH}px` } as React.CSSProperties} />
                <div className={`ps-contrib-chart-bar ps-contrib-chart-bar--rvu${isHov ? ' ps-contrib-chart-bar--hovered' : ''}`} style={{ '--bar-height': `${rH}px` } as React.CSSProperties} />
              </div>

              {/* Day label */}
              <div className="ps-contrib-chart-day-label">{d.day}</div>
            </div>
          );
        })}
      </div>

      <div className="ps-contrib-chart-legend">
        <div className="ps-contrib-chart-legend-item">
          <div className="ps-contrib-chart-legend-swatch ps-contrib-chart-legend-swatch--cases" />
          <span className="ps-contrib-chart-legend-text">{t('contributionDashboard.weeklyChart.casesLegend')}</span>
        </div>
        <div className="ps-contrib-chart-legend-item">
          <div className="ps-contrib-chart-legend-swatch ps-contrib-chart-legend-swatch--rvu" />
          <span className="ps-contrib-chart-legend-text">{t('contributionDashboard.weeklyChart.rvusLegend')}</span>
        </div>
      </div>
    </div>
  );
};

// ─── RVU 30-day tile ──────────────────────────────────────────────────────────

const Rvu30Tile: React.FC<{ data: RealRvu30 }> = ({ data }) => {
  const { t } = useTranslation();
  const deltaLabel = data.deltaPct === null ? t('contributionDashboard.rvu30.deltaNew') : `${data.deltaPct >= 0 ? '+' : ''}${data.deltaPct}%`;
  const isUp = data.deltaPct === null || data.deltaPct >= 0;
  return (
  <div className="ps-contrib-tile">
    <div className="ps-contrib-rvu-header">
      <span className="ps-contrib-rvu-label">{t('contributionDashboard.rvu30.title')}</span>
      <span className="ps-contrib-rvu-icon">📊</span>
    </div>
    <div className="ps-contrib-rvu-value-row">
      <span className="ps-contrib-rvu-value">{data.total}</span>
      <span className="ps-contrib-rvu-unit">{t('contributionDashboard.rvu30.unit')}</span>
    </div>
    <div className={`ps-contrib-rvu-delta ${isUp ? 'ps-contrib-rvu-delta--up' : 'ps-contrib-rvu-delta--down'}`}>
      {isUp ? "▲" : "▼"} {deltaLabel} {t('contributionDashboard.rvu30.deltaVsPrev')}
    </div>
    <div className="ps-contrib-rvu-divider">
      <span className="ps-contrib-rvu-avg-label">{t('contributionDashboard.rvu30.avgPerCase')}</span>
      <span className="ps-contrib-rvu-avg-value">{data.avgPerCase}</span>
    </div>
  </div>
  );
};

// ─── TAT Performance tile ─────────────────────────────────────────────────────

const TatPerformanceTile: React.FC<{ data: RealTatPerformance }> = ({ data }) => {
  const { t } = useTranslation();
  const pct      = data.onTargetPct;
  const ftPct    = data.firstTouchTargetHrs > 0 ? Math.min(100, (data.firstTouchAvgHrs / data.firstTouchTargetHrs) * 100) : 0;
  const totalPct = data.totalTargetHrs      > 0 ? Math.min(100, (data.totalCaseAvgHrs  / data.totalTargetHrs)      * 100) : 0;

  const barColorClass = (p: number) => p < 70 ? 'ps-tat-tile__bar-fill--good' : p < 90 ? 'ps-tat-tile__bar-fill--warn' : 'ps-tat-tile__bar-fill--alert';
  const ftColorClass    = barColorClass(ftPct);
  const totalColorClass = barColorClass(totalPct);

  return (
    <div className="ps-tat-tile">
      <div className="ps-tat-tile__header">
        <span className="ps-tat-tile__eyebrow">{t('contributionDashboard.tat.title')}</span>
        <span className="ps-tat-tile__icon">⏱</span>
      </div>

      {/* First Touch metric + bar */}
      <div className="ps-tat-tile__metric-block">
        <div className="ps-tat-tile__row">
          <div className="ps-tat-tile__row-left">
            <span className="ps-tat-tile__row-icon ps-tat-tile__row-icon--teal">⚡</span>
            <span className="ps-tat-tile__metric-label">{t('contributionDashboard.tat.firstTouch')}</span>
          </div>
          <span className="ps-tat-tile__metric-value">
            {data.firstTouchAvgHrs}h{' '}
            <span className="ps-tat-tile__metric-unit">{t('contributionDashboard.tat.avg')}</span>
          </span>
        </div>
        <div className="ps-tat-tile__bar-track">
          <div className={`ps-tat-tile__bar-fill ps-tat-tile__bar-fill--dynamic-width ${ftColorClass}`} style={{ '--bar-width': `${ftPct}%` } as React.CSSProperties} />
        </div>
        <div className="ps-tat-tile__target-label">
          {t('contributionDashboard.tat.targetOfHours', { pct: ftPct.toFixed(0), hours: data.firstTouchTargetHrs })}
        </div>
      </div>

      {/* Total Case metric + bar */}
      <div className="ps-tat-tile__metric-block">
        <div className="ps-tat-tile__row">
          <div className="ps-tat-tile__row-left">
            <span className="ps-tat-tile__row-icon ps-tat-tile__row-icon--green">✓</span>
            <span className="ps-tat-tile__metric-label">{t('contributionDashboard.tat.totalCase')}</span>
          </div>
          <span className="ps-tat-tile__metric-value">
            {data.totalCaseAvgHrs}h{' '}
            <span className="ps-tat-tile__metric-unit">{t('contributionDashboard.tat.avg')}</span>
          </span>
        </div>
        <div className="ps-tat-tile__bar-track">
          <div className={`ps-tat-tile__bar-fill ps-tat-tile__bar-fill--dynamic-width ${totalColorClass}`} style={{ '--bar-width': `${totalPct}%` } as React.CSSProperties} />
        </div>
        <div className="ps-tat-tile__target-label">
          {t('contributionDashboard.tat.targetOfHours', { pct: totalPct.toFixed(0), hours: data.totalTargetHrs })}
        </div>
      </div>

      {/* Summary line */}
      <div className="ps-tat-tile__summary-line">
        <span className={`ps-contrib-tat-summary ps-contrib-tat-summary--${pct >= 85 ? 'good' : pct >= 65 ? 'ok' : 'bad'}`}>{t('contributionDashboard.tat.onTarget', { pct })}</span>
        <span className="ps-contrib-tat-clients">{t('contributionDashboard.tat.weightedAcross', { count: data.facilityCount })}</span>
      </div>
    </div>
  );
};

// ─── My Teaching Cases tile ───────────────────────────────────────────────────
// Was an IIFE `{(...) && (() => {...})()}` computed inline inside the JSX
// return — pulled out to a real named component, same standard applied to
// business logic found embedded in the UI elsewhere in this review.

const TeachingCasesTile: React.FC<{
  teachingRecords: import('@/types/quality/QaActivityRecord').QaActivityRecord[];
  countersignRecords: import('@/types/case/CountersignRecord').CountersignRecord[];
  subspecialties: Subspecialty[];
  // Real, per direct follow-up ("I would like the Residents to know how
  // they are doing relative to the expectations") — optional org-wide
  // targets for the resident's OWN active supervision assignment, when
  // one exists and its type has expectedCaseMix configured. Undefined/
  // empty renders exactly as before: real coverage, no judgment.
  caseMixTargets?: import('@/types/quality/QaSupervisionAssignmentType').ExpectedCaseMixTarget[];
  onOpen: () => void;
  onExport: (e: React.MouseEvent) => void;
}> = ({ teachingRecords, countersignRecords, subspecialties, caseMixTargets, onOpen, onExport }) => {
  const { t } = useTranslation();
  const concordantCount = teachingRecords.filter(r => r.outcome === 'concordant').length;
  const rate = teachingRecords.length > 0 ? (concordantCount / teachingRecords.length) * 100 : null;
  const withFeedback = [...teachingRecords].filter(r => r.reviewerFeedback).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const csWithFeedback = [...countersignRecords].filter(r => r.attendingFeedback).sort((a, b) => (b.countersignedAt ?? '').localeCompare(a.countersignedAt ?? ''));
  const avgChangedFields = countersignRecords.length > 0
    ? countersignRecords.reduce((s, r) => s + (r.changedFieldCount ?? 0), 0) / countersignRecords.length
    : null;

  // Per-subspecialty breakdown — the actual point of linking to real
  // Subspecialty rather than just showing one aggregate rate: "98% in
  // Breast vs 88% in Bone & Soft Tissue" highlights WHERE a trainee
  // actually needs more work, not just how they're doing overall.
  // Records with no subspecialtyId (the case never had one set) group
  // under "Unspecified" rather than being silently dropped.
  //
  // Real fix: pulled out to the shared buildSubspecialtyBreakdown (used
  // identically by MentorTab.tsx for a supervisor's view of the same
  // supervisee) rather than keeping a second, independently-maintained
  // copy of this same logic here — that duplication was a real,
  // explicitly-flagged loose end. applyExpectedCaseMix layers any real
  // configured target on top, unchanged when there isn't one.
  const breakdown = applyExpectedCaseMix(buildSubspecialtyBreakdown(teachingRecords, subspecialties), caseMixTargets, subspecialties);

  return (
    <div className="ps-contrib-tile ps-contrib-tile-clickable" onClick={onOpen}>
      <div className="ps-contrib-tile-header">
        <div>
          <div className="ps-contrib-tile-title">{t('contributionDashboard.teaching.title')}</div>
          <div className="ps-contrib-tile-subtitle">{t('contributionDashboard.teaching.subtitle')}</div>
        </div>
        <button
          className="ps-conf-btn-secondary ps-contrib-export-btn"
          onClick={onExport}
          title={t('contributionDashboard.teaching.exportTitle')}
        >
          {t('contributionDashboard.teaching.exportButton')}
        </button>
      </div>
      {rate !== null && (
        <div className="ps-contrib-tile-value-row">
          <span className="ps-contrib-tile-value">{rate.toFixed(0)}%</span>
          <span className="ps-contrib-tile-value-sub">{t('contributionDashboard.teaching.overallConcordant', { count: teachingRecords.length })}</span>
        </div>
      )}
      {/* Shown whenever there's more than one subspecialty group to
          compare, OR at least one has a real configured target — a
          single-subspecialty case with an unmet target (e.g. 0 of 3) is
          exactly the actionable signal this section exists for, even
          though there's nothing to "compare" it against. */}
      {(breakdown.length > 1 || breakdown.some(b => b.target !== undefined)) && (
        <div className="ps-contrib-teaching-breakdown">
          {breakdown.map(b => (
            <div key={b.id} className="ps-contrib-teaching-row">
              <span className="ps-contrib-teaching-row-name">{b.name} ({b.total})</span>
              {b.target !== undefined ? (
                <span className={`ps-contrib-teaching-row-rate ${b.metTarget ? 'ps-contrib-teaching-row-rate--ok' : 'ps-contrib-teaching-row-rate--low'}`}>
                  {t('contributionDashboard.teaching.expectedOf', { total: b.total, target: b.target })}
                </span>
              ) : (
                <span className={`ps-contrib-teaching-row-rate ${b.rate < 90 ? 'ps-contrib-teaching-row-rate--low' : 'ps-contrib-teaching-row-rate--ok'}`}>{b.rate.toFixed(0)}%</span>
              )}
            </div>
          ))}
        </div>
      )}
      {withFeedback[0]?.reviewerFeedback && (
        <div className="ps-contrib-teaching-feedback">
          {t('contributionDashboard.teaching.latestReconciliationFeedback', { feedback: withFeedback[0].reviewerFeedback })}
        </div>
      )}
      {/* General countersign summary — the broader signal, covers every
          drafted case regardless of frozen section involvement. Shown
          separately from the reconciliation numbers above rather than
          blended into one figure, since changedFieldCount and concordance
          rate aren't the same kind of metric. */}
      {countersignRecords.length > 0 && (
        <div className="ps-contrib-teaching-countersign">
          <div className="ps-contrib-teaching-countersign-row">
            <span className="ps-contrib-teaching-countersign-count">{countersignRecords.length}</span>
            <span className="ps-contrib-teaching-countersign-text">
              {t('contributionDashboard.teaching.countersigned', { count: countersignRecords.length })}
              {avgChangedFields !== null && ` · ${t('contributionDashboard.teaching.avgFieldsChanged', { avg: avgChangedFields.toFixed(1), count: avgChangedFields })}`}
            </span>
          </div>
          {csWithFeedback[0]?.attendingFeedback && (
            <div className="ps-contrib-teaching-countersign-feedback">
              {t('contributionDashboard.teaching.latestCountersignFeedback', { feedback: csWithFeedback[0].attendingFeedback })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const ContributionDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSystemConfig();
  const navigate = useNavigate();

  const [activeTab,           setActiveTab]           = useState<DashboardTab>("overview");
  // Dashboard aggregates across clients/labs, so there's no single case to
  // resolve a per-lab override for — org default only (see orchestratorModeConfig.ts).
  const finalCaseLabel = getOrgOrchestratorDefault() ? t('contributionDashboard.finalCaseLabelSignedOut') : t('contributionDashboard.finalCaseLabelFinalised');

  // ── Quality Flags — real data, not the 3 permanently-fixed fake ───────────
  // entries this used to show. Severity isn't a real field anywhere on
  // SpecimenDeficiency (checked — it genuinely doesn't exist), so it's
  // derived here from real, existing signals rather than invented:
  // overdue pending-verification or anything reopened at least once
  // reads as high, a fresh open item as medium, anything else shown
  // (non-overdue pending-verification) as low.
  //
  // Filtered to the current pathologist — previously this called
  // specimenDeficiencyService.getAll()/discordanceService.getAll() with
  // zero scoping, meaning "My Contribution" was silently showing
  // department-wide data mislabeled as personal. Deficiencies are
  // cross-referenced by caseId to the case's own order.assignedTo (not
  // SpecimenDeficiency.raisedBy, which is often a tech/accessioner
  // flagging the issue, not the case's owning pathologist — the wrong
  // signal for "is this MY quality issue"). Discordances use
  // recordedBy.userId directly, since that's genuinely who reconciled it.
  const [qualityFlags, setQualityFlags] = useState<ContributionFlag[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      specimenDeficiencyService.getAll(), deficiencyTypeService.getAll(), qaActivityRecordService.getAll(),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true }),
    ]).then(([defRes, typeRes, discRes, casesRes]) => {
      if (!defRes.ok) return;
      const types: DeficiencyType[] = typeRes.ok ? typeRes.data : [];
      const typeName = (id: string) => types.find(t => t.id === id)?.name ?? id;
      const isOverdue = (d: SpecimenDeficiency) => !!d.verificationDueDate && new Date(d.verificationDueDate).getTime() < Date.now();

      const myCaseIds = new Set(
        (casesRes.ok ? casesRes.data : [])
          .filter((c) => c?.order?.assignedTo === user.id)
          .map((c) => c.id)
      );

      const deficiencyFlags: (ContributionFlag & { sortKey: string; score: number })[] = defRes.data
        .filter(d => d.status !== 'closed' && myCaseIds.has(d.caseId))
        .map(d => ({
          id: d.id,
          label: d.caseId,
          value: `${typeName(d.deficiencyTypeId)}${d.specimenLabel ? ` — Specimen ${d.specimenLabel}` : ' — case-level'}`,
          severity: (isOverdue(d) || (d.reopenCount ?? 0) > 0) ? 'high' : d.status === 'open' ? 'medium' : 'low',
          onClick: () => navigate(`/deficiencies?open=${d.id}`),
          sortKey: d.raisedAt,
          score: (isOverdue(d) || (d.reopenCount ?? 0) > 0) ? 2 : d.status === 'open' ? 1 : 0,
        }));

      // Real Frozen-to-Permanent discordance records now feed this same
      // list — this widget's own subtitle ("documentation or concordance
      // issues") already promised this; it just had nothing behind the
      // concordance half until discordanceService existed. Only high/
      // medium severity surface here — low (Tier 1, no clinical impact)
      // isn't the kind of thing that belongs in a short, urgent flag list.
      const discordanceFlags: (ContributionFlag & { sortKey: string; score: number })[] = discRes.ok
        ? discRes.data
            .filter(d => d.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID && d.outcome === 'discordant' && d.severity !== 'low' && d.recordedBy?.userId === user.id)
            .map(d => ({
              id: d.id,
              label: d.caseId,
              value: `Frozen/Final discordance — ${d.caseType}`,
              severity: d.severity,
              onClick: () => navigate(`/case/${d.caseId}/synoptic`),
              sortKey: d.recordedAt,
              score: d.severity === 'high' ? 2 : 1,
            }))
        : [];

      const relevant = [...deficiencyFlags, ...discordanceFlags]
        .sort((a, b) => b.score - a.score || b.sortKey.localeCompare(a.sortKey))
        .slice(0, 3);

      setQualityFlags(relevant.map(({ sortKey: _sortKey, score: _score, ...flag }) => flag));
    });
  }, [user?.id]);

  // Real fix: replaces mockKpis/mockCaseMixData - see
  // contributionDashboardCalculations.ts for the real transform logic.
  const [overviewKpis, setOverviewKpis]     = useState<RealOverviewKpis | null>(null);
  const [caseMixData,  setCaseMixData]      = useState<RealCaseMixData | null>(null);
  const [tatPerformance, setTatPerformance] = useState<RealTatPerformance | null>(null);
  const [rvu30, setRvu30]                   = useState<RealRvu30 | null>(null);
  const [weeklyDaily, setWeeklyDaily]       = useState<RealDailyRvu[] | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true }),
      mockRvuCodeMapService.getAllVersions(),
      specimenDictionaryService.getAll(),
    ]).then(([res, versionsRes, dictionaryRes]) => {
      if (!res.ok) return;
      const versions = versionsRes.ok ? versionsRes.data : [];
      const dictionaryEntries = dictionaryRes.ok ? dictionaryRes.data : [];
      setOverviewKpis(computeOverviewKpis(res.data, user.id));
      setCaseMixData(computeCaseMixData(res.data, user.id));
      setRvu30(computeRvu30(res.data, user.id, versions, new Date(), dictionaryEntries));
      setWeeklyDaily(computeWeeklyDaily(res.data, user.id, config.facilityTimezone, versions, new Date(), dictionaryEntries));
      const tatEntries = (() => {
        try {
          const raw = localStorage.getItem(TAT_STORAGE_KEY);
          return raw ? JSON.parse(raw) : TAT_SYSTEM_DEFAULTS;
        } catch { return TAT_SYSTEM_DEFAULTS; }
      })() as TatEntryForResolution[];
      // Real fix: org-wide aggregate, deliberately not filtered to this
      // user's own cases the way overviewKpis/caseMixData are - matches
      // TatPerformanceTile's own "weighted across N clients" framing.
      setTatPerformance(computeOrgWideTatPerformance(res.data, tatEntries));
    });
  }, [user?.id]);

  // Real fix: derives the three real KPI tiles from overviewKpis -
  // formats a null delta (no real prior-30-day baseline to compare
  // against, e.g. a pathologist too new to have one yet) as "New" rather
  // than fabricating a percentage.
  const formatDelta = (pct: number | null): { delta: string; up: boolean } =>
    pct === null ? { delta: t('contributionDashboard.rvu30.deltaNew'), up: true } : { delta: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
  const kpiTiles: KpiTile[] = overviewKpis ? [
    { label: 'CASE_LABEL_PLACEHOLDER', value: overviewKpis.casesFinalized30d, unit: '', icon: '✓',
      ...formatDelta(overviewKpis.casesFinalizedDeltaPct) },
    { label: t('contributionDashboard.kpiCasesInProgress'), value: overviewKpis.casesInProgress, unit: '', delta: '', up: true, icon: '⏳' },
    { label: t('contributionDashboard.kpiAiAssistedCases'), value: overviewKpis.aiAssistedCases30d, unit: '', icon: '🤖',
      ...formatDelta(overviewKpis.aiAssistedDeltaPct) },
  ] : [];

  // ── My Teaching Cases — real reconciliation records where the current
  // user is the draftedBy (their own draft was reconciled by an
  // attending). Only meaningful for residents/fellows; empty for anyone
  // whose cases are never drafted-then-countersigned by someone else.
  const [teachingRecords, setTeachingRecords] = useState<import('@/types/quality/QaActivityRecord').QaActivityRecord[]>([]);
  // General countersign records — the broader, more comprehensive
  // teaching signal added this session: unlike teachingRecords above
  // (scoped to frozen-section reconciliation only), this covers every
  // resident-drafted case regardless of whether it ever touched a
  // frozen section.
  const [countersignRecords, setCountersignRecords] = useState<import('@/types/case/CountersignRecord').CountersignRecord[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  // My own active supervision assignment (as the SUPERVISEE), and its
  // type — real, per direct follow-up ("I would like the Residents to
  // know how they are doing relative to the expectations"). Nothing
  // shown here when no such assignment exists (an attending with no
  // active FPPE/supervision record, say) — same "only show what's
  // real" convention this whole block already follows.
  const [mySupervision, setMySupervision] = useState<QaSupervisionAssignment | null>(null);
  const [mySupervisionType, setMySupervisionType] = useState<QaSupervisionAssignmentType | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    qaActivityRecordService.getAll().then(res => {
      if (res.ok) setTeachingRecords(res.data.filter(r => r.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID && r.draftedBy?.userId === user.id));
    });
    countersignService.getAll().then(res => {
      if (res.ok) setCountersignRecords(res.data.filter(r => r.residentId === user.id && r.status === 'countersigned'));
    });
    subspecialtyService.getAll().then(res => { if (res.ok) setSubspecialties(res.data); });
    qaSupervisionAssignmentService.getAll().then(res => {
      const mine = res.ok ? res.data.find(a => a.superviseeUserId === user.id && a.status === 'active') ?? null : null;
      setMySupervision(mine);
      if (mine) {
        qaSupervisionAssignmentTypeService.getAll().then(typeRes => {
          setMySupervisionType(typeRes.ok ? typeRes.data.find(t => t.id === mine.activityTypeId) ?? null : null);
        });
      } else {
        setMySupervisionType(null);
      }
    });
  }, [user?.id]);

  // Same real subspecialty-scoping rule MentorTab.tsx applies: a
  // single-subspecialty assignment only ever shows that subspecialty's
  // own target, never an unrelated one from the same type.
  const myCaseMixTargets = (mySupervisionType?.expectedCaseMix ?? [])
    .filter(t => !mySupervision?.subspecialtyId || t.subspecialtyId === mySupervision.subspecialtyId);

  // Trainee Case & Procedure Reference export — deliberately NOT an
  // "ACGME export." Checked directly against ACGME's own documentation:
  // no public vendor bulk-import/export schema exists, and ACGME
  // maintains a Non-Endorsement Policy specifically against third-party
  // tools claiming to speak its format. This is PathScribe's own
  // reference table, meant for a resident to consult while manually
  // entering their own cases into the real ADS portal — not a file
  // meant to be uploaded anywhere.
  //
  // Sourced from real Case.participants[] involvement — NOT from
  // reconciliation data alone, which only exists for cases with a
  // merged frozen section. A resident's real case volume includes
  // plenty of cases with no frozen section at all; building this from
  // reconciliation data alone would have silently hidden most of a
  // resident's actual caseload. Reconciliation outcome is included as
  // enrichment only for the cases where one genuinely exists.
  const exportCaseLog = async () => {
    if (!user?.id) return;
    const [casesRes, reconRes] = await Promise.all([
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true }),
      qaActivityRecordService.getAll(),
    ]);
    const myCases = (casesRes.ok ? casesRes.data : []).filter((c) =>
      c?.participants?.some((p) => p.staffId === user.id && p.participationTypeIds?.includes('resident') && p.status === 'active')
    );
    const reconByCase = new Map(
      (reconRes.ok ? reconRes.data : [])
        .filter(r => r.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID)
        .map(r => [r.caseId, r])
    );
    const subspecialtyName = (id?: string) => id ? (subspecialties.find(s => s.id === id)?.name ?? id) : '';

    const rows = myCases.map((c) => {
      const attending = c.participants?.find((p) => p.participationTypeIds?.includes('attending') || p.participationTypeIds?.includes('primary'));
      const recon = reconByCase.get(c.id);
      return {
        'Case ID': c.accession?.fullAccession ?? c.accession?.accessionNumber ?? c.id,
        'Subspecialty': subspecialtyName(c.subspecialtyId),
        'Attending': attending?.staffName ?? '',
        'Reconciliation Outcome': recon?.outcome ?? '(no frozen section on this case)',
        'Reconciliation Severity': recon?.severity ?? '',
        'Case Created': c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
      };
    });

    downloadCsv(`trainee-case-reference-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  // ── Progress/case-mix summary export — real, per direct follow-up.
  // Deliberately NOT framed as an "ACGME export" (see
  // buildCaseMixExportRows's own header comment in
  // caseMixCalculations.ts for the full reasoning) — a flat summary
  // for the resident to hand to a mentor/program coordinator or open
  // in Excel/a BI tool, not a file meant to be uploaded to ACGME.
  const myCaseMixBreakdown = applyExpectedCaseMix(buildSubspecialtyBreakdown(teachingRecords, subspecialties), myCaseMixTargets, subspecialties);
  const exportProgressSummary = () => {
    if (!user?.id) return;
    const rows = buildCaseMixExportRows(user.id, myCaseMixBreakdown);
    downloadCsv(`case-mix-progress-summary-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, [
      'Resident_ID', 'Category_Code', 'Category_Description', 'Logged_Count', 'Enterprise_Target_Goal', 'Variance', 'Concordance_Status', 'Compliance_Status',
    ]));
  };

  // ── Active Intraop Sessions — real, previously nothing on this
  // dashboard reflected intraop volume at all despite the feature
  // being real now. Filtered to entries this pathologist personally
  // performed (performedBy.userId) — same "this dashboard should
  // actually be personal" fix as Quality Flags above.
  const [activeIntraopCount, setActiveIntraopCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    intraoperativeService.getPending().then(res => {
      if (res.ok) setActiveIntraopCount(res.data.filter(e => e.performedBy.userId === user.id).length);
    });
  }, [user?.id]);


  // Real, per direct follow-up ("the actions list is out of sync...
  // voice control is one of its central pillars. It has to be
  // flawless"): this used to set VOICE_CONTEXT.WORKLIST — a real,
  // confirmed bug caught by the action registry's own new regression
  // test, same bug class as the REPORTING/SYNOPTIC mismatch that
  // motivated this whole pass. 8 real TAT_SHOW_* actions
  // (First Touch, Total Case, Frozen Section, Grossing, Sign Out,
  // Cold Ischemia, Consult Response, Consult Awaiting) already used
  // category: 'CONTRIBUTION' — a real, dedicated VOICE_CONTEXT value
  // that already existed for exactly this page, just never actually
  // set. Fixed to match, same one-line pattern every other page uses
  // for its own real context.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.CONTRIBUTION);
    return () => mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST);
  }, []);

  return (
    <div className="ps-contrib-page" tabIndex={0} role="region" aria-label="Contribution dashboard, scrollable">

      {/* ─── Page Title ──────────────────────────────────────────────────── */}
      <div className="ps-contrib-title-block">
        <h1 className="ps-contrib-title">
          {t('contributionDashboard.title')}
        </h1>
        <p className="ps-contrib-subtitle">
          {user?.name} · {t('contributionDashboard.subtitleRole')}
        </p>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────── */}
      <div className="ps-contrib-tab-bar">
        {(Object.keys(TAB_LABEL_KEYS) as DashboardTab[]).map((tab) => (
          <div
            key={tab}
            className={`ps-contrib-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(TAB_LABEL_KEYS[tab])}
          </div>
        ))}
      </div>

      {/* ─── Overview Tab ────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="ps-contrib-overview-tab">

          {/* KPI row — 3 standard KPIs + TAT Performance tile + RVU tile = 5 columns */}
          <div className="ps-kpi-grid">
            {kpiTiles.map((kpi, ki) => {
              const ext = kpiExtras[ki];
              return (
              <div key={kpi.label} className="ps-contrib-kpi-tile">
                {/* Header */}
                <div className="ps-contrib-tile-header">
                  <span className="ps-contrib-kpi-label">
                    {kpi.label === "CASE_LABEL_PLACEHOLDER" ? finalCaseLabel : kpi.label}
                  </span>
                  <span className="ps-contrib-rvu-icon">{kpi.icon}</span>
                </div>
                {/* Value */}
                <div className="ps-contrib-kpi-value-row">
                  <span className="ps-contrib-kpi-value">{kpi.value}</span>
                  {kpi.unit && <span className="ps-contrib-kpi-unit">{kpi.unit}</span>}
                </div>
                {/* Delta vs prior period */}
                <div className={`ps-contrib-kpi-delta ${kpi.up ? 'ps-contrib-kpi-delta--up' : 'ps-contrib-kpi-delta--down'}`}>
                  {kpi.up ? "▲" : "▼"} {kpi.delta} {t('contributionDashboard.vsPriorPeriod')}
                </div>
                {/* Divider */}
                <div className="ps-contrib-kpi-divider" />
                {/* Peer average */}
                <div className="ps-contrib-kpi-row">
                  <span className="ps-contrib-kpi-row-label">{t('contributionDashboard.peerAvg')}</span>
                  <span className="ps-contrib-kpi-row-value">{ext?.peer ?? "—"}</span>
                </div>
                {/* % of target */}
                {ext?.targetPct != null && (
                  <div className="ps-contrib-kpi-row">
                    <span className="ps-contrib-kpi-row-label">{t('contributionDashboard.percentOfTarget')}</span>
                    <span className={`ps-contrib-kpi-target ${ext.targetPct >= 100 ? 'ps-contrib-kpi-target--good' : ext.targetPct >= 75 ? 'ps-contrib-kpi-target--ok' : 'ps-contrib-kpi-target--bad'}`}>
                      {ext.targetPct}%
                    </span>
                  </div>
                )}
              </div>
              );
            })}
            {/* TAT Performance — split tile replacing plain Avg TAT KPI */}
            <TatPerformanceTile data={tatPerformance ?? { firstTouchAvgHrs: 0, totalCaseAvgHrs: 0, firstTouchTargetHrs: 0, totalTargetHrs: 0, onTargetPct: 0, facilityCount: 0 }} />
            {/* RVU tile as 5th KPI */}
            <Rvu30Tile data={rvu30 ?? { total: 0, deltaPct: null, avgPerCase: 0 }} />
          </div>

          {/* Main content: 2-col */}
          <div className="ps-contrib-overview-grid">

            {/* Left column */}
            <div className="ps-contrib-col">

              {/* Case Mix with counts */}
              <CaseMixTile
                title={t('contributionDashboard.caseMixTitle')}
                data={caseMixData ?? { breast: 0, gi: 0, gu: 0, derm: 0, other: 0 }}
                colors={pathscribeTheme.colors.caseMix}
                showCounts={true}
              />

              {/* Weekly chart */}
              <WeeklyOverviewChart data={weeklyDaily ?? []} />
            </div>

            {/* Right column */}
            <div className="ps-contrib-col">

              {/* Quality Flags */}
              <div className="ps-contrib-tile">
                <div className="ps-contrib-tile-header ps-contrib-tile-header--spaced">
                  <div>
                    <div className="ps-contrib-tile-title">{t('contributionDashboard.qualityFlags.title')}</div>
                    <div className="ps-contrib-tile-subtitle">{t('contributionDashboard.qualityFlags.subtitle')}</div>
                  </div>
                  {/* Real fix, found during this review: WarningIcon's stroke is
                      bound to its `color` prop, not CSS `color` — the previous
                      style={{color:...}} silently had no effect (this SVG's
                      stroke isn't currentColor), so the icon was rendering the
                      component's own default (#F59E0B) instead of the intended
                      warning color (#F97316). */}
                  <WarningIcon size={18} color={pathscribeTheme.colors.semantic.warning} />
                </div>
                <div data-capture-hide="true" className="ps-contrib-col ps-contrib-col--tight">
                  {qualityFlags.length === 0 && (
                    <div className="ps-contrib-tile-subtitle">{t('contributionDashboard.qualityFlags.empty')}</div>
                  )}
                  {qualityFlags.map((flag) => (
                    <FlagRow key={flag.id} {...flag} />
                  ))}
                </div>
              </div>

              {/* My Teaching Cases — shows when the current user has
                  EITHER kind of teaching record. Previously gated only on
                  teachingRecords (frozen-section reconciliation), which
                  meant a resident whose countersigned cases never
                  happened to involve a frozen section would see nothing
                  here at all, despite having real teaching data. */}
              {(teachingRecords.length > 0 || countersignRecords.length > 0) && (
                <TeachingCasesTile
                  teachingRecords={teachingRecords}
                  countersignRecords={countersignRecords}
                  subspecialties={subspecialties}
                  caseMixTargets={myCaseMixTargets}
                  onOpen={() => navigate('/quality-assurance')}
                  onExport={(e) => { e.stopPropagation(); exportCaseLog(); }}
                />
              )}

              {/* My progress toward graduation — real, per direct
                  follow-up ("Residents to know how they are doing
                  relative to the expectations"). Only shown when the
                  current user actually has an active supervision
                  assignment (as supervisee) — an attending with none
                  sees nothing here, same real-data-only convention as
                  every other tile on this dashboard. */}
              {mySupervision && (
                <div className="ps-contrib-tile">
                  <div className="ps-contrib-tile-header">
                    <div>
                      <div className="ps-contrib-tile-title">{t('contributionDashboard.myProgress.title')}</div>
                      <div className="ps-contrib-tile-subtitle">{mySupervisionType?.name ?? t('contributionDashboard.myProgress.activeAssignmentFallback')} · {t('contributionDashboard.myProgress.supervisedBy', { name: mySupervision.supervisorUserName })}</div>
                    </div>
                    <button
                      className="ps-conf-btn-secondary ps-contrib-export-btn"
                      onClick={exportProgressSummary}
                      title={t('contributionDashboard.myProgress.exportTitle')}
                    >
                      {t('contributionDashboard.myProgress.exportButton')}
                    </button>
                  </div>
                  {(() => {
                    const progress = describeSupervisionProgress(mySupervision);
                    return (
                      <div className="ps-contrib-progress-wrap">
                        <div className="ps-contrib-progress-label">
                          <span>{t('contributionDashboard.myProgress.progressLabel')}</span>
                          <span>{progress.label}</span>
                        </div>
                        <div className="ps-contrib-progress-track">
                          <div className="ps-contrib-progress-fill ps-contrib-progress-fill--dynamic-width" style={{ '--progress-width': `${progress.pct}%` } as React.CSSProperties} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Active Intraop Sessions */}
              <div className="ps-contrib-tile ps-contrib-tile-clickable" onClick={() => navigate('/intraop-queue')}>
                <div className="ps-contrib-tile-header">
                  <div>
                    <div className="ps-contrib-tile-title">{t('contributionDashboard.intraop.title')}</div>
                    <div className="ps-contrib-tile-subtitle">{t('contributionDashboard.intraop.subtitle')}</div>
                  </div>
                  <span className="ps-contrib-rvu-icon">🧊</span>
                </div>
                <div className="ps-contrib-tile-value-row">
                  <span className="ps-contrib-tile-value">
                    {activeIntraopCount === null ? "—" : activeIntraopCount}
                  </span>
                  <span className="ps-contrib-tile-value-sub">
                    {activeIntraopCount === 0 ? t('contributionDashboard.intraop.allMerged') : t('contributionDashboard.intraop.pending')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Productivity Tab ────────────────────────────────────────────── */}
      {activeTab === "productivity" && <ProductivityTab />}

      {/* ─── Quality Tab ─────────────────────────────────────────────────── */}
      {activeTab === "quality" && <div data-capture-hide="true"><QualityTab /></div>}

      {/* ─── AI Contribution Tab ─────────────────────────────────────────── */}
      {activeTab === "ai" && <AIContributionTab />}

      {/* ─── Mentor Tab ──────────────────────────────────────────────────── */}
      {activeTab === "mentor" && <MentorTab />}
    </div>
  );
};

export default ContributionDashboardPage;
