// src/components/Contribution/AIContributionTab.tsx
import React, { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import '../../pathscribe.css';
// Migrated June 2026 from the dead services/specimens/mockSpecimenService.ts
// (zero real callers except this file — confirmed, then this file itself
// turned up as the one real caller a case-sensitive grep had missed) onto
// the real Specimen Dictionary service.
import { specimenDictionaryService } from '@/services';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import { getAiFeedbackLog, AiFeedbackEntry } from '@/services/cases/mockCaseService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange  = "30d" | "90d" | "ytd";
type Section    = "acceptance" | "overrides" | "comparison";

interface BreakdownRow {
  label: string; code?: string; rate: number; cases: number;
}

interface OverriddenCase {
  id: string; caseType: string; assigningAuthority?: string;
  aiSuggestion: string; finalDiagnosis: string; reason: string; date: string; daysAgo: number;
}

interface CaseComparison {
  caseType: string; aiAssisted: number; manual: number;
  aiTat: number; manualTat: number;
}

interface MonthlyPoint { month: string; rate: number; }

// Real fix (batch 34, i18n sweep): WorkflowDataset used to also carry a
// full set of UI label/title/subtitle strings (tileAssistedLabel,
// breakdownTitle, overridesAiCol, etc.) — leftover from a removed
// "workflow" toggle concept (see the real-fix comment below) that once
// switched between multiple named datasets. With only one dataset left,
// those fields were always-static English text baked into a plain data
// object with no way to reach a live t() call. They're now resolved via
// t() directly inside the component (see the labels below); this
// interface keeps only the fields that hold genuine data.
interface WorkflowDataset {
  summary: { totalAssisted: number; totalCases: number; avgConfidence: number };
  breakdown: BreakdownRow[];
  overridden: OverriddenCase[];
  comparison: CaseComparison[];
}

// ─── Mock Data — Synoptic AI (CoPilot field-suggestion AI) ────────────────────
//
// The `overridden`/`comparison` entries below are illustrative fallback
// content (medical diagnostic terminology used as example data, e.g.
// "Gleason 3+4=7", "Atypical ductal hyperplasia") — left in English
// deliberately rather than run through casual machine translation:
// clinical terminology is precision-critical in a pathology LIS, and
// these are the same kind of real-diagnosis-shaped strings this app
// never translates when they come from a real case record. They're
// replaced by real per-user data (see `ds` below) as soon as any exists.

const synopticDataset: WorkflowDataset = {
  summary: { totalAssisted: 92, totalCases: 128, avgConfidence: 91.4 },
  // breakdown is intentionally empty here — for the synoptic workflow this is
  // replaced at render time with categories derived live from the real
  // Specimen Dictionary (grouped by subspecialty name), not a hardcoded list.
  // See deriveBreakdownFromSpecimens below.
  breakdown: [],
  overridden: [
    { id: "PSA-2024-1195", caseType: "Breast Core Bx",   aiSuggestion: "Benign fibrocystic change",   finalDiagnosis: "Atypical ductal hyperplasia", reason: "Clinical context",     date: "Aug 13", daysAgo: 12  },
    { id: "PSA-2024-1183", caseType: "Prostate Bx",      aiSuggestion: "Gleason 3+3=6",               finalDiagnosis: "Gleason 3+4=7",              reason: "Pattern assessment",   date: "Aug 10", daysAgo: 15  },
    { id: "PSA-2024-1171", caseType: "Skin Shave",       aiSuggestion: "Compound nevus",              finalDiagnosis: "Dysplastic nevus, moderate",  reason: "Architectural atypia", date: "Aug 7",  daysAgo: 18  },
    { id: "PSA-2024-1158", caseType: "Lymph Node",       aiSuggestion: "Reactive lymphadenopathy",    finalDiagnosis: "Metastatic carcinoma",        reason: "IHC correlation",      date: "Aug 1",  daysAgo: 24  },
    { id: "PSA-2024-1102", caseType: "Renal Biopsy",     aiSuggestion: "Acute tubular injury",        finalDiagnosis: "Acute interstitial nephritis", reason: "Clinical correlation", date: "Jun 28", daysAgo: 58  },
    { id: "PSA-2024-1041", caseType: "Thyroid FNA",      aiSuggestion: "Benign follicular nodule",    finalDiagnosis: "Follicular neoplasm, atypia",  reason: "Architectural atypia", date: "May 12", daysAgo: 105 },
  ],
  comparison: [
    { caseType: "Breast",  aiAssisted: 38, manual: 4, aiTat: 1.8, manualTat: 2.9 },
    { caseType: "GI",      aiAssisted: 34, manual: 4, aiTat: 1.5, manualTat: 2.4 },
    { caseType: "GU",      aiAssisted: 19, manual: 2, aiTat: 1.9, manualTat: 3.1 },
    { caseType: "Derm",    aiAssisted: 15, manual: 2, aiTat: 1.2, manualTat: 2.0 },
  ],
};

// Real fix: narrativeDataset (and the whole "workflow" toggle concept)
// removed entirely. This page is explicitly, visibly personal - the
// real page title is "Contribution Dashboard" with the current user's
// own name/role directly under it (ContributionDashboardPage.tsx).
// NarrativeEditSignal (services/narrativeSignals/) carries no real
// pathologist attribution at all, by deliberate design - it's built
// for aggregate model-evaluation and partner sharing. That data
// belongs in services/narrativeSignals/'s own real, already-existing
// home: components/ValidationStudies/ValidationStudiesSection.tsx,
// which already calls the same real getStats() and already generates
// a formal "AI Narrative Quality" report - not duplicated here under a
// personal framing it was never built for. See the real, direct link
// to that section further down this file.
//
// Real fix (batch 34): `label` (the old per-dataset workflow name,
// "Synoptic AI (Assist)") and `monthlyShape` (a hardcoded illustrative
// full-year pattern) were both dead — neither was read anywhere in this
// component. `monthlyShape` in particular is explicitly superseded by
// `buildRealTrend()` below (see that function's own comment); both
// fields, and their WorkflowDataset entries, were removed rather than
// carried forward unused.

// Display labels for known subspecialty values from the specimen dictionary.
// Falls back to a humanized version of the raw name for anything not listed here,
// so a newly-added subspecialty never silently disappears from the breakdown.
const SUBSPECIALTY_LABELS: Record<string, string> = {
  gi:     "GI",
  breast: "Breast",
  derm:   "Dermatopathology",
  neuro:  "Neuropathology",
  heme:   "Hematopathology",
  gyn:    "Gynecologic",
  uro:    "Genitourinary",
  "":     "Unassigned",
};

// Illustrative acceptance rates per subspecialty — the CATEGORY LIST itself is
// derived live from the specimen dictionary (see deriveBreakdownFromSpecimens),
// but there's no real AI-usage audit trail behind these specific rate numbers yet.
// Falls back to a generic 80% for any subspecialty not seeded here.
const MOCK_RATE_BY_SUBSPECIALTY: Record<string, number> = {
  gi: 88, breast: 91, derm: 82, neuro: 86, heme: 84, gyn: 80, uro: 85, "": 75,
};
const CASES_PER_SPECIMEN_TYPE = 12; // mock volume multiplier — illustrative only

function humanizeSubspecialtyId(id: string): string {
  if (!id) return "Unassigned";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function deriveBreakdownFromSpecimens(specimens: SpecimenEntry[]): BreakdownRow[] {
  const groups = new Map<string, number>(); // subspecialty name -> active specimen-type count
  for (const s of specimens) {
    if (!s.active) continue;
    const key = (s.subspecialty ?? "").toLowerCase();
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([id, typeCount]) => ({
      label: SUBSPECIALTY_LABELS[id] ?? humanizeSubspecialtyId(id),
      rate: MOCK_RATE_BY_SUBSPECIALTY[id] ?? 80,
      cases: typeCount * CASES_PER_SPECIMEN_TYPE,
    }))
    .sort((a, b) => b.cases - a.cases);
}

/** Real, honest disclosure: the CSS-class-based counterpart to
 *  ProductivityTab.tsx's own theme-object DemoDataBadge - same real
 *  intent (a visible, honest "this is illustrative" signal for an
 *  actual user, not just a code comment), different implementation
 *  since this file uses pathscribe.css classes throughout. */
const DemoDataBadge: React.FC = () => {
  const { t } = useTranslation();
  return (
    <span className="ps-demo-data-badge" title={t('aiContributionTab.demoDataBadge.tooltip')}>
      {t('aiContributionTab.demoDataBadge.label')}
    </span>
  );
};

const AIContributionTab: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [section,   setSection]   = useState<Section>("acceptance");
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const [specimens, setSpecimens] = useState<SpecimenEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    specimenDictionaryService.getAll().then(result => {
      if (!cancelled && result.ok) setSpecimens(result.data);
    });
    return () => { cancelled = true; };
  }, []);

  // Real per-user AI feedback — was entirely hardcoded mock data before
  // (summary.totalAssisted/totalCases/avgConfidence, the specific
  // overridden cases, the comparison and trend numbers). recordAiFeedback
  // already existed as a real, working, immediate-capture event log
  // (see mockCaseService.ts) — it just had no user attribution and
  // nothing could read it back. Both fixed; this is that real data.
  // Only ever populated by RightSynopticPanel.tsx today, so this is
  // genuinely synoptic-workflow-only — the Narrative AI (Outreach) tab
  // below is NOT wired to real data yet and still shows the original
  // mock numbers, flagged as such rather than silently left ambiguous.
  const [myFeedback, setMyFeedback] = useState<AiFeedbackEntry[]>([]);
  const [caseTypeById, setCaseTypeById] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!user?.id) return;
    const log = getAiFeedbackLog().filter(e => e.userId === user.id);
    setMyFeedback(log);
    const caseIds = [...new Set(log.map(e => e.caseId).filter(Boolean))];
    if (caseIds.length === 0) return;
    caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true }).then(res => {
      if (!res.ok) return;
      const map: Record<string, string> = {};
      res.data.forEach((c: any) => {
        if (caseIds.includes(c.id)) map[c.id] = c.specimens?.[0]?.description ?? c.specimens?.[0]?.label ?? c.id;
      });
      setCaseTypeById(map);
    });
  }, [user?.id]);

  const myConfirmed  = myFeedback.filter(e => e.action === 'confirmed').length;
  const myOverridden = myFeedback.filter(e => e.action === 'overridden').length;

  const myTotal      = myConfirmed + myOverridden; // 'missed' entries aren't AI suggestions at all — no acceptance decision to measure
  const myAvgConfidence = myTotal > 0
    ? +(myFeedback.filter(e => e.action !== 'missed').reduce((s, e) => s + e.aiConfidence, 0) / myTotal).toFixed(1)
    : null;

  const liveSynopticBreakdown = specimens ? deriveBreakdownFromSpecimens(specimens) : null;

  const ds = liveSynopticBreakdown
    ? {
        ...synopticDataset,
        breakdown: liveSynopticBreakdown,
        // No fallback to the old mock summary when myTotal is 0 — showing
        // fake-but-plausible numbers when there's genuinely no real usage
        // yet is exactly the "looks real but isn't" problem this whole
        // fix exists to close. An honest zero is the correct state.
        summary: { totalAssisted: myTotal, totalCases: myTotal, avgConfidence: myAvgConfidence ?? 0 },
        overridden: myFeedback.filter(e => e.action === 'overridden').slice(0, 6).map((e): OverriddenCase => ({
          id: e.caseId,
          caseType: caseTypeById[e.caseId] ?? e.caseId,
          aiSuggestion: Array.isArray(e.aiValue) ? e.aiValue.join(', ') : e.aiValue,
          finalDiagnosis: Array.isArray(e.userValue) ? e.userValue.join(', ') : e.userValue,
          reason: e.fieldLabel,
          date: new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          daysAgo: Math.floor((Date.now() - new Date(e.timestamp).getTime()) / 86400000),
        })),
      }
    : synopticDataset;

  // Real trend, built from actual event timestamps — replaces the
  // synthetic interpolation buildYtdMonthly/generateLast4WeeksAcceptance
  // produced from a hardcoded monthlyShape array. Only meaningful for
  // synoptic (the only workflow with any real events); null when there's
  // not enough real data for a period to compute a rate from, rather
  // than interpolating a plausible-looking curve.
  const buildRealTrend = (periodDays: number, buckets: number): MonthlyPoint[] => {
    const now = Date.now();
    const bucketMs = (periodDays * 86400000) / buckets;
    const points: MonthlyPoint[] = [];
    for (let i = buckets - 1; i >= 0; i--) {
      const bucketEnd = now - i * bucketMs;
      const bucketStart = bucketEnd - bucketMs;
      const inBucket = myFeedback.filter(e => {
        const t = new Date(e.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd && e.action !== 'missed';
      });
      const confirmed = inBucket.filter(e => e.action === 'confirmed').length;
      const label = new Date(bucketEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      points.push({ month: label, rate: inBucket.length > 0 ? +((confirmed / inBucket.length) * 100).toFixed(1) : 0 });
    }
    return points;
  };

  const cutoff = dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 366;

  const monthly = buildRealTrend(366, 12);

  const trendRows = dateRange === "30d" ? buildRealTrend(28, 4) : dateRange === "90d" ? buildRealTrend(90, 3) : monthly;

  const ytdAvgRate = +(monthly.reduce((s, d) => s + d.rate, 0) / monthly.length).toFixed(1);
  const periodAvgRate = +(trendRows.reduce((s, d) => s + d.rate, 0) / trendRows.length).toFixed(1);
  const rateDelta = +(periodAvgRate - ytdAvgRate).toFixed(1);

  // Static UI labels — a single dataset remains (see the WorkflowDataset
  // comment above), so these are resolved once via t() here instead of
  // living on the data object.
  const tileAssistedLabel   = t('aiContributionTab.tiles.assisted');
  const tileOverridesLabel  = t('aiContributionTab.tiles.overrides');
  const tileConfidenceLabel = t('aiContributionTab.tiles.confidence');
  const breakdownTitle      = t('aiContributionTab.breakdown.title');
  const breakdownSubtitle   = t('aiContributionTab.breakdown.subtitle');
  const breakdownUnit       = t('aiContributionTab.breakdown.unit');
  const overridesTitle      = t('aiContributionTab.overrides.title');
  const overridesSubtitle   = t('aiContributionTab.overrides.subtitle');
  const overridesAiCol      = t('aiContributionTab.overrides.aiCol');
  const overridesFinalCol   = t('aiContributionTab.overrides.finalCol');
  const overridesReasonCol  = t('aiContributionTab.overrides.reasonCol');
  const comparisonTitle     = t('aiContributionTab.comparison.title');
  const comparisonSubtitle  = t('aiContributionTab.comparison.subtitle');
  const comparisonAiLabel     = t('aiContributionTab.comparison.aiLabel');
  const comparisonManualLabel = t('aiContributionTab.comparison.manualLabel');
  const trendTitle    = t('aiContributionTab.trend.title');
  const trendSubtitle = t('aiContributionTab.trend.subtitle');

  const periodTitleLabel = dateRange === "30d" ? t('aiContributionTab.trend.period.thirtyDays') : dateRange === "90d" ? t('aiContributionTab.trend.period.ninetyDays') : t('aiContributionTab.trend.period.ytd');

  // monthly now spans however many real months have elapsed this year so far —
  // use that as the YTD baseline window for proportional volume scaling
  // (same technique as QualityTab), instead of a hardcoded month count.
  const monthsInPeriod = dateRange === "30d" ? 1 : dateRange === "90d" ? 3 : monthly.length;
  const periodFraction = monthsInPeriod / monthly.length;
  const scaledTotalCases    = dateRange === "ytd" ? ds.summary.totalCases    : Math.round(ds.summary.totalCases    * periodFraction);
  const scaledTotalAssisted = dateRange === "ytd" ? ds.summary.totalAssisted : Math.round(ds.summary.totalAssisted * periodFraction);

  const filteredOverridden = ds.overridden.filter(c => c.daysAgo <= cutoff);

  const scaledBreakdown = ds.breakdown.map(r => ({
    ...r,
    cases: dateRange === "ytd" ? r.cases : Math.max(1, Math.round(r.cases * periodFraction)),
  }));

  const scaledComparison = ds.comparison.map(c => ({
    ...c,
    aiAssisted: dateRange === "ytd" ? c.aiAssisted : Math.max(1, Math.round(c.aiAssisted * periodFraction)),
    manual:     dateRange === "ytd" ? c.manual     : Math.max(1, Math.round(c.manual     * periodFraction)),
  }));

  const summaryTiles = [
    { label: t('aiContributionTab.tiles.acceptanceRate'), value: periodAvgRate,       unit: "%", color: "#34d399", icon: "✓",
      delta: t('aiContributionTab.tiles.deltaVsYtdAvg', { sign: rateDelta >= 0 ? "+" : "", value: rateDelta }), deltaUp: rateDelta >= 0 },
    { label: tileAssistedLabel,     value: scaledTotalAssisted,       unit: "",  color: "#38bdf8", icon: "🤖",
      delta: t('aiContributionTab.tiles.ofTotal', { count: scaledTotalCases }), deltaUp: null as boolean | null },
    { label: tileOverridesLabel,    value: filteredOverridden.length, unit: "",  color: "#fbbf24", icon: "✏️",
      delta: t('aiContributionTab.tiles.pathologistChanged'), deltaUp: null as boolean | null },
    { label: tileConfidenceLabel,   value: ds.summary.avgConfidence,  unit: "%", color: "#0891b2", icon: "📊",
      delta: t('aiContributionTab.tiles.notPeriodFiltered'), deltaUp: null as boolean | null },
  ];

  const dateRangeLabel = (r: DateRange) =>
    r === "30d" ? t('aiContributionTab.dateRange.thirtyDays') : r === "90d" ? t('aiContributionTab.dateRange.ninetyDays') : t('aiContributionTab.dateRange.ytd');

  return (
    <div className="ps-quality-container">

      {/* Real, honest pointer to the actual, real home for aggregate,
          practice-wide AI narrative-quality data — this page stays
          entirely personal. */}
      <div className="ps-contrib-validation-pointer">
        {t('aiContributionTab.validationPointer.question')}{' '}
        <button type="button" className="ps-contrib-validation-link" onClick={() => navigate('/configuration?tab=validation')}>
          {t('aiContributionTab.validationPointer.link')}
        </button>
      </div>

      {/* ── Summary tiles ── */}
      <div className="ps-quality-summary-grid">
        {summaryTiles.map(s => (
          <div key={s.label} className="ps-quality-summary-tile">
            <div className="ps-quality-summary-tile__header">
              <span className="ps-quality-summary-tile__label">{s.label}</span>
              <span>{s.icon}</span>
            </div>
            <div className="ps-quality-summary-tile__value-row">
              <span className="ps-quality-summary-tile__value" style={{ '--tile-color': s.color } as React.CSSProperties}>
                {s.value}
              </span>
              {s.unit && <span className="ps-quality-summary-tile__unit">{s.unit}</span>}
            </div>
            <div className="ps-quality-summary-tile__period">
              {s.deltaUp === null
                ? s.delta
                : <span className={`ps-quality-summary-tile__delta--${s.deltaUp ? 'good' : 'bad'}`}>{s.deltaUp ? "▲" : "▼"} {s.delta}</span>
              }
            </div>
          </div>
        ))}
      </div>

      {/* ── Section nav + date range ── */}
      <div className="ps-quality-nav">
        <div className="ps-quality-nav__left">
          <button className={`ps-quality-btn${section === "acceptance" ? " active" : ""}`} onClick={() => setSection("acceptance")}>{t('aiContributionTab.nav.acceptanceRate')}</button>
          <button className={`ps-quality-btn${section === "overrides"  ? " active" : ""}`} onClick={() => setSection("overrides")}>{tileOverridesLabel}</button>
          <button className={`ps-quality-btn${section === "comparison" ? " active" : ""}`} onClick={() => setSection("comparison")}>{t('aiContributionTab.nav.aiVsManual', { ai: comparisonAiLabel, manual: comparisonManualLabel })}</button>
        </div>
        <div className="ps-quality-nav__right">
          {(["30d", "90d", "ytd"] as DateRange[]).map(r => (
            <button key={r} className={`ps-quality-btn${dateRange === r ? " active" : ""}`} onClick={() => setDateRange(r)}>{dateRangeLabel(r)}</button>
          ))}
        </div>
      </div>

      {/* ── Acceptance Rate section ── */}
      {section === "acceptance" && (
        <div className="ps-quality-split-grid">

          {/* Acceptance by case type / client */}
          <div className="ps-quality-card">
            <div className="ps-quality-card__header">
              <div className="ps-quality-card__title">
                {breakdownTitle}
                <DemoDataBadge />
              </div>
              <div className="ps-quality-card__subtitle">{breakdownSubtitle}</div>
            </div>
            <div className="ps-quality-bar-list">
              {specimens === null
                ? <div className="ps-quality-empty">{t('aiContributionTab.breakdown.loading')}</div>
                : scaledBreakdown.map(r => (
                <div key={r.label} className="ps-quality-bar-row">
                  <div className="ps-quality-bar-row__label-row">
                    <span className="ps-quality-bar-row__type">
                      {r.code && <span className="ps-client-authority-badge ps-quality-bar-row__code-badge">{r.code}</span>}
                      {r.label}
                    </span>
                    <span className="ps-quality-bar-row__meta">{r.cases} {breakdownUnit} &middot; <span className="ps-quality-bar-row__rate">{r.rate}%</span></span>
                  </div>
                  <div className="ps-quality-progress-track">
                    <div className="ps-quality-progress-fill" style={{ width: `${r.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Acceptance trend chart */}
          <div className="ps-quality-card">
            <div className="ps-quality-card__header">
              <div className="ps-quality-card__title">{trendTitle} &mdash; {periodTitleLabel}</div>
              <div className="ps-quality-card__subtitle">{trendSubtitle}</div>
            </div>
            <div className="ps-quality-trend-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `${v}%`} width={40} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const val = payload[0]?.value as number;
                    return (
                      <div className="ps-tat-trend__tooltip">
                        <div className="ps-tat-trend__tooltip-header">{label}</div>
                        <div className="ps-tat-trend__tooltip-ft">{t('aiContributionTab.trend.tooltipAcceptance', { value: val })}</div>
                      </div>
                    );
                  }} />
                  <Line type="monotone" dataKey="rate" stroke="var(--ps-teal-light)" strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--ps-teal-light)", strokeWidth: 0 }} activeDot={{ r: 5, fill: "var(--ps-teal-light)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Overrides / Narrative Edits ── */}
      {section === "overrides" && (
        <div className="ps-quality-card">
          <div className="ps-quality-card__header">
            <div className="ps-quality-card__title">{overridesTitle}</div>
            <div className="ps-quality-card__subtitle">{overridesSubtitle}</div>
          </div>
          {filteredOverridden.length === 0
            ? <div className="ps-quality-empty">{t('aiContributionTab.overrides.emptyState', { label: tileOverridesLabel.toLowerCase() })}</div>
            : (
              <table className="ps-quality-table">
                <thead>
                  <tr>{[
                    t('aiContributionTab.overrides.caseCol'), t('aiContributionTab.overrides.typeCol'),
                    overridesAiCol, overridesFinalCol, overridesReasonCol,
                    t('aiContributionTab.overrides.dateCol'),
                  ].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredOverridden.map(c => (
                    <tr key={c.id}>
                      <td className="ps-quality-td ps-quality-td--accent">{c.id}</td>
                      <td className="ps-quality-td">{c.caseType}</td>
                      <td className="ps-quality-td ps-quality-td--muted">{c.aiSuggestion}</td>
                      <td className="ps-quality-td ps-quality-td--primary">{c.finalDiagnosis}</td>
                      <td className="ps-quality-td">
                        <span className="ps-badge ps-badge-teal">{c.reason}</span>
                      </td>
                      <td className="ps-quality-td ps-quality-td--muted">{c.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {/* ── AI vs Manual comparison ── */}
      {section === "comparison" && (
        <div className="ps-quality-card">
          <div className="ps-quality-card__header">
            <div className="ps-quality-card__title">
              {comparisonTitle}
              <DemoDataBadge />
            </div>
            <div className="ps-quality-card__subtitle">{t('aiContributionTab.comparison.subtitleFull', { subtitle: comparisonSubtitle })}</div>
            <div className="ps-quality-legend">
              <div className="ps-quality-legend__item">
                <div className="ps-quality-legend__swatch ps-quality-legend__swatch--ai" />
                <span>{comparisonAiLabel}</span>
              </div>
              <div className="ps-quality-legend__item">
                <div className="ps-quality-legend__swatch ps-quality-legend__swatch--manual" />
                <span>{comparisonManualLabel}</span>
              </div>
            </div>
          </div>
          <table className="ps-quality-table">
            <thead>
              <tr>{[
                t('aiContributionTab.comparison.headers.caseType'),
                t('aiContributionTab.comparison.headers.cases', { label: comparisonAiLabel }),
                t('aiContributionTab.comparison.headers.cases', { label: comparisonManualLabel }),
                t('aiContributionTab.comparison.headers.avgTat', { label: comparisonAiLabel }),
                t('aiContributionTab.comparison.headers.avgTat', { label: comparisonManualLabel }),
                t('aiContributionTab.comparison.headers.tatImprovement'),
              ].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {scaledComparison.map(c => {
                const improvement = ((c.manualTat - c.aiTat) / c.manualTat * 100).toFixed(0);
                return (
                  <tr key={c.caseType}>
                    <td className="ps-quality-td ps-quality-td--primary ps-quality-td--bold">{c.caseType}</td>
                    <td className="ps-quality-td ps-quality-td--accent">{c.aiAssisted}</td>
                    <td className="ps-quality-td ps-quality-td--muted">{c.manual}</td>
                    <td className="ps-quality-td ps-quality-td--accent">{c.aiTat}d</td>
                    <td className="ps-quality-td ps-quality-td--muted">{c.manualTat}d</td>
                    <td className="ps-quality-td">
                      <span className="ps-quality-delta--concordant">{t('aiContributionTab.comparison.fasterBy', { value: improvement })}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default AIContributionTab;
