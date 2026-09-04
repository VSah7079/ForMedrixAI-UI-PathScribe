// src/pages/ContributionDashboardPage.tsx
import React, { useState, useEffect } from "react";
import '../pathscribe.css';
import { useAuth } from "@contexts/AuthContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { WarningIcon } from "@components/Icons";
import FlagRow        from "@components/Contribution/FlagRow";
import CaseMixTile    from "@components/Contribution/CaseMixTile";
import ProductivityTab from "../components/Contribution/ProductivityTab";
import QualityTab      from "../components/Contribution/QualityTab";
import AIContributionTab from "../components/Contribution/AIContributionTab";
import { pathscribeTheme as t } from "@theme/pathscribeTheme";
import type {
  ContributionFlag,
  KpiTile,
} from "../types/ContributionDashboard";
import { getOrgOrchestratorDefault } from "@components/Config/AI/orchestratorModeConfig";
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '../constants/systemActions';
import { useNavigate } from 'react-router-dom';
import { specimenDeficiencyService, deficiencyTypeService, qaActivityRecordService, intraoperativeService, subspecialtyService, countersignService } from '../services';
import type { Subspecialty } from '../services';
import { caseRouter } from '../services/cases/CaseRouter';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '../services/quality/mockQaActivityTypeService';
import { computeOverviewKpis, computeCaseMixData, computeOrgWideTatPerformance, computeRvu30, computeWeeklyDaily, type RealOverviewKpis, type RealCaseMixData, type RealTatPerformance, type RealRvu30, type RealDailyRvu } from './contributionDashboardCalculations';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import { specimenDictionaryService } from '@/services';
import { TAT_STORAGE_KEY, SYSTEM_DEFAULTS as TAT_SYSTEM_DEFAULTS } from '@components/Config/System/TATConfigSection';
import type { TatEntryForResolution } from '@components/Contribution/qualityCalculations';
import * as XLSX from 'xlsx';
import type { SpecimenDeficiency, DeficiencyType } from '../services/deficiencies/IDeficiencyService';


// ─── Mock Data ────────────────────────────────────────────────────────────────

// Extended KPI data — peer averages and % of target (added alongside KpiTile)
const kpiExtras = [
  { peer: 109, targetPct: 107, targetLabel: "of volume target" },
  { peer: 18,  targetPct: null, targetLabel: null },
  { peer: 76,  targetPct: 72,  targetLabel: "AI adoption target" },
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

type DashboardTab = "overview" | "productivity" | "quality" | "ai";

const TAB_LABELS: Record<DashboardTab, string> = {
  overview:     "Overview",
  productivity: "Productivity",
  quality:      "Quality",
  ai:           "AI Contribution",
};

// ─── Inline Weekly Chart (Overview) ──────────────────────────────────────────

const WeeklyOverviewChart: React.FC<{ data: RealDailyRvu[] }> = ({ data }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  // Single shared scale — bars reflect true relative magnitude across both series
  const maxC    = Math.max(...data.map(d => d.cases), 1);
  const maxR    = Math.max(...data.map(d => d.rvus), 1);
  const maxAll  = Math.max(maxC, maxR);
  const BAR_H   = 72; // max bar height px — the highest value across both series fills this

  return (
    <div className="ps-contrib-tile">
      <div className="ps-contrib-chart-header">
        <div className="ps-contrib-chart-title">This Week</div>
        <div className="ps-contrib-chart-subtitle">Daily cases and RVUs — shared scale</div>
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
          <span className="ps-contrib-chart-legend-text">Cases</span>
        </div>
        <div className="ps-contrib-chart-legend-item">
          <div className="ps-contrib-chart-legend-swatch ps-contrib-chart-legend-swatch--rvu" />
          <span className="ps-contrib-chart-legend-text">RVUs</span>
        </div>
      </div>
    </div>
  );
};

// ─── RVU 30-day tile ──────────────────────────────────────────────────────────

const Rvu30Tile: React.FC<{ data: RealRvu30 }> = ({ data }) => {
  const deltaLabel = data.deltaPct === null ? 'New' : `${data.deltaPct >= 0 ? '+' : ''}${data.deltaPct}%`;
  const isUp = data.deltaPct === null || data.deltaPct >= 0;
  return (
  <div className="ps-contrib-tile">
    <div className="ps-contrib-rvu-header">
      <span className="ps-contrib-rvu-label">RVUs — Last 30 Days</span>
      <span className="ps-contrib-rvu-icon">📊</span>
    </div>
    <div className="ps-contrib-rvu-value-row">
      <span className="ps-contrib-rvu-value">{data.total}</span>
      <span className="ps-contrib-rvu-unit">RVUs</span>
    </div>
    <div className={`ps-contrib-rvu-delta ${isUp ? 'ps-contrib-rvu-delta--up' : 'ps-contrib-rvu-delta--down'}`}>
      {isUp ? "▲" : "▼"} {deltaLabel} vs prev 30d
    </div>
    <div className="ps-contrib-rvu-divider">
      <span className="ps-contrib-rvu-avg-label">Avg / case</span>
      <span className="ps-contrib-rvu-avg-value">{data.avgPerCase}</span>
    </div>
  </div>
  );
};

// ─── TAT Performance tile ─────────────────────────────────────────────────────

const TatPerformanceTile: React.FC<{ data: RealTatPerformance }> = ({ data }) => {
  const pct      = data.onTargetPct;
  const ftPct    = data.firstTouchTargetHrs > 0 ? Math.min(100, (data.firstTouchAvgHrs / data.firstTouchTargetHrs) * 100) : 0;
  const totalPct = data.totalTargetHrs      > 0 ? Math.min(100, (data.totalCaseAvgHrs  / data.totalTargetHrs)      * 100) : 0;

  const barColorClass = (p: number) => p < 70 ? 'ps-tat-tile__bar-fill--good' : p < 90 ? 'ps-tat-tile__bar-fill--warn' : 'ps-tat-tile__bar-fill--alert';
  const ftColorClass    = barColorClass(ftPct);
  const totalColorClass = barColorClass(totalPct);

  return (
    <div className="ps-tat-tile">
      <div className="ps-tat-tile__header">
        <span className="ps-tat-tile__eyebrow">TAT Performance</span>
        <span className="ps-tat-tile__icon">⏱</span>
      </div>

      {/* First Touch metric + bar */}
      <div className="ps-tat-tile__metric-block">
        <div className="ps-tat-tile__row">
          <div className="ps-tat-tile__row-left">
            <span className="ps-tat-tile__row-icon ps-tat-tile__row-icon--teal">⚡</span>
            <span className="ps-tat-tile__metric-label">First Touch</span>
          </div>
          <span className="ps-tat-tile__metric-value">
            {data.firstTouchAvgHrs}h{' '}
            <span className="ps-tat-tile__metric-unit">avg</span>
          </span>
        </div>
        <div className="ps-tat-tile__bar-track">
          <div className={`ps-tat-tile__bar-fill ps-tat-tile__bar-fill--dynamic-width ${ftColorClass}`} style={{ '--bar-width': `${ftPct}%` } as React.CSSProperties} />
        </div>
        <div className="ps-tat-tile__target-label">
          {ftPct.toFixed(0)}% of {data.firstTouchTargetHrs}h target
        </div>
      </div>

      {/* Total Case metric + bar */}
      <div className="ps-tat-tile__metric-block">
        <div className="ps-tat-tile__row">
          <div className="ps-tat-tile__row-left">
            <span className="ps-tat-tile__row-icon ps-tat-tile__row-icon--green">✓</span>
            <span className="ps-tat-tile__metric-label">Total Case</span>
          </div>
          <span className="ps-tat-tile__metric-value">
            {data.totalCaseAvgHrs}h{' '}
            <span className="ps-tat-tile__metric-unit">avg</span>
          </span>
        </div>
        <div className="ps-tat-tile__bar-track">
          <div className={`ps-tat-tile__bar-fill ps-tat-tile__bar-fill--dynamic-width ${totalColorClass}`} style={{ '--bar-width': `${totalPct}%` } as React.CSSProperties} />
        </div>
        <div className="ps-tat-tile__target-label">
          {totalPct.toFixed(0)}% of {data.totalTargetHrs}h target
        </div>
      </div>

      {/* Summary line */}
      <div className="ps-tat-tile__summary-line">
        <span className={`ps-contrib-tat-summary ps-contrib-tat-summary--${pct >= 85 ? 'good' : pct >= 65 ? 'ok' : 'bad'}`}>{pct}% on target</span>
        <span className="ps-contrib-tat-clients">weighted across {data.facilityCount} facilities</span>
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
  onOpen: () => void;
  onExport: (e: React.MouseEvent) => void;
}> = ({ teachingRecords, countersignRecords, subspecialties, onOpen, onExport }) => {
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
  const bySubspecialty = new Map<string, { total: number; concordant: number }>();
  teachingRecords.forEach(r => {
    const key = r.subspecialtyId ?? '__unspecified__';
    const bucket = bySubspecialty.get(key) ?? { total: 0, concordant: 0 };
    bucket.total += 1;
    if (r.outcome === 'concordant') bucket.concordant += 1;
    bySubspecialty.set(key, bucket);
  });
  const subspecialtyName = (id: string) => id === '__unspecified__' ? 'Unspecified' : (subspecialties.find(s => s.id === id)?.name ?? id);
  const breakdown = [...bySubspecialty.entries()]
    .map(([id, b]) => ({ id, name: subspecialtyName(id), rate: (b.concordant / b.total) * 100, total: b.total }))
    .sort((a, b) => a.rate - b.rate); // lowest concordance first — that's the actual learning opportunity, surface it first

  return (
    <div className="ps-contrib-tile ps-contrib-tile-clickable" onClick={onOpen}>
      <div className="ps-contrib-tile-header">
        <div>
          <div className="ps-contrib-tile-title">My Teaching Cases</div>
          <div className="ps-contrib-tile-subtitle">Cases you drafted that were reviewed by an attending</div>
        </div>
        <button
          className="ps-conf-btn-secondary ps-contrib-export-btn"
          onClick={onExport}
          title="Trainee case reference for manual ACGME ADS entry — not an official ACGME file format"
        >
          Export Case Log
        </button>
      </div>
      {rate !== null && (
        <div className="ps-contrib-tile-value-row">
          <span className="ps-contrib-tile-value">{rate.toFixed(0)}%</span>
          <span className="ps-contrib-tile-value-sub">overall concordant (frozen section) · {teachingRecords.length} case{teachingRecords.length === 1 ? '' : 's'}</span>
        </div>
      )}
      {breakdown.length > 1 && (
        <div className="ps-contrib-teaching-breakdown">
          {breakdown.map(b => (
            <div key={b.id} className="ps-contrib-teaching-row">
              <span className="ps-contrib-teaching-row-name">{b.name} ({b.total})</span>
              <span className={`ps-contrib-teaching-row-rate ${b.rate < 90 ? 'ps-contrib-teaching-row-rate--low' : 'ps-contrib-teaching-row-rate--ok'}`}>{b.rate.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      {withFeedback[0]?.reviewerFeedback && (
        <div className="ps-contrib-teaching-feedback">
          Latest reconciliation feedback: "{withFeedback[0].reviewerFeedback}"
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
              case{countersignRecords.length === 1 ? '' : 's'} countersigned
              {avgChangedFields !== null && ` · avg ${avgChangedFields.toFixed(1)} field${avgChangedFields === 1 ? '' : 's'} changed`}
            </span>
          </div>
          {csWithFeedback[0]?.attendingFeedback && (
            <div className="ps-contrib-teaching-countersign-feedback">
              Latest countersign feedback: "{csWithFeedback[0].attendingFeedback}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const ContributionDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { config } = useSystemConfig();
  const navigate = useNavigate();

  const [activeTab,           setActiveTab]           = useState<DashboardTab>("overview");
  // Dashboard aggregates across clients/labs, so there's no single case to
  // resolve a per-lab override for — org default only (see orchestratorModeConfig.ts).
  const finalCaseLabel = getOrgOrchestratorDefault() ? "Cases Signed Out" : "Cases Finalised";

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
    pct === null ? { delta: 'New', up: true } : { delta: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
  const kpiTiles: KpiTile[] = overviewKpis ? [
    { label: 'CASE_LABEL_PLACEHOLDER', value: overviewKpis.casesFinalized30d, unit: '', icon: '✓',
      ...formatDelta(overviewKpis.casesFinalizedDeltaPct) },
    { label: 'Cases In Progress', value: overviewKpis.casesInProgress, unit: '', delta: '', up: true, icon: '⏳' },
    { label: 'AI‑Assisted Cases', value: overviewKpis.aiAssistedCases30d, unit: '', icon: '🤖',
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
  useEffect(() => {
    if (!user?.id) return;
    qaActivityRecordService.getAll().then(res => {
      if (res.ok) setTeachingRecords(res.data.filter(r => r.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID && r.draftedBy?.userId === user.id));
    });
    countersignService.getAll().then(res => {
      if (res.ok) setCountersignRecords(res.data.filter(r => r.residentId === user.id && r.status === 'countersigned'));
    });
    subspecialtyService.getAll().then(res => { if (res.ok) setSubspecialties(res.data); });
  }, [user?.id]);

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

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Case Reference');
    XLSX.writeFile(wb, `trainee-case-reference-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          Contribution Dashboard
        </h1>
        <p className="ps-contrib-subtitle">
          {user?.name} · Pathologist
        </p>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────── */}
      <div className="ps-contrib-tab-bar">
        {(Object.keys(TAB_LABELS) as DashboardTab[]).map((tab) => (
          <div
            key={tab}
            className={`ps-contrib-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
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
                  {kpi.up ? "▲" : "▼"} {kpi.delta} vs prior period
                </div>
                {/* Divider */}
                <div className="ps-contrib-kpi-divider" />
                {/* Peer average */}
                <div className="ps-contrib-kpi-row">
                  <span className="ps-contrib-kpi-row-label">Peer avg</span>
                  <span className="ps-contrib-kpi-row-value">{ext?.peer ?? "—"}</span>
                </div>
                {/* % of target */}
                {ext?.targetPct != null && (
                  <div className="ps-contrib-kpi-row">
                    <span className="ps-contrib-kpi-row-label">% of target</span>
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
                title="Case Mix"
                data={caseMixData ?? { breast: 0, gi: 0, gu: 0, derm: 0, other: 0 }}
                colors={t.colors.caseMix}
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
                    <div className="ps-contrib-tile-title">Quality Flags</div>
                    <div className="ps-contrib-tile-subtitle">Recent cases with documentation or concordance issues</div>
                  </div>
                  {/* Real fix, found during this review: WarningIcon's stroke is
                      bound to its `color` prop, not CSS `color` — the previous
                      style={{color:...}} silently had no effect (this SVG's
                      stroke isn't currentColor), so the icon was rendering the
                      component's own default (#F59E0B) instead of the intended
                      warning color (#F97316). */}
                  <WarningIcon size={18} color={t.colors.semantic.warning} />
                </div>
                <div data-capture-hide="true" className="ps-contrib-col ps-contrib-col--tight">
                  {qualityFlags.length === 0 && (
                    <div className="ps-contrib-tile-subtitle">No open quality items right now.</div>
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
                  onOpen={() => navigate('/quality-assurance')}
                  onExport={(e) => { e.stopPropagation(); exportCaseLog(); }}
                />
              )}

              {/* Active Intraop Sessions */}
              <div className="ps-contrib-tile ps-contrib-tile-clickable" onClick={() => navigate('/intraop-queue')}>
                <div className="ps-contrib-tile-header">
                  <div>
                    <div className="ps-contrib-tile-title">Active Intraop Sessions</div>
                    <div className="ps-contrib-tile-subtitle">Unlinked entries awaiting a formal accession to merge into</div>
                  </div>
                  <span className="ps-contrib-rvu-icon">🧊</span>
                </div>
                <div className="ps-contrib-tile-value-row">
                  <span className="ps-contrib-tile-value">
                    {activeIntraopCount === null ? "—" : activeIntraopCount}
                  </span>
                  <span className="ps-contrib-tile-value-sub">
                    {activeIntraopCount === 0 ? "all merged" : "pending"}
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
    </div>
  );
};

export default ContributionDashboardPage;
