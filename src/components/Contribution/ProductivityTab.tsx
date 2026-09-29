// src/components/Contribution/ProductivityTab.tsx
import React, { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
         CartesianGrid, Tooltip as RechartsTooltip } from "recharts";
import { pathscribeTheme as theme } from "@theme/pathscribeTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { caseRouter } from "@/services/cases/CaseRouter";
import { userService } from "@/services";
import { rvuCodeMapService } from "@/services";
import { getFacilityDateParts } from "@/utils/facilityTime";
import { computeMonthlyCaseCounts, canSeePeerComparison, computeRvuSummary, computeMonthlyRvu, computePeerRvuStats, type RealRvuSummary, type RealPeerRvuStats } from "./productivityCalculations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyData {
  month: string;
  cases: number;
  rvus: number;
  cumulativeRvus: number;
}


type ChartMetric = "cases" | "rvus" | "combined";
type DateRange   = "ytd" | "6m" | "3m" | "1m";

// Real fix, from a direct product review: this file's case counts, RVU
// values, AND peer comparison used to be entirely hardcoded. All three are
// now genuinely real (see productivityCalculations.ts -
// computeMonthlyCaseCounts, computeRvuSummary, computeMonthlyRvu,
// computePeerRvuStats), via the real, already-existing
// services/billing/rvuCodeMapService.ts and services/users/. Two
// separate, earlier versions of this comment claimed "no real RVU data
// source" and "no real aggregated-peer backend" respectively - both were
// stale/wrong, caught during a later audit in the same evening: the real
// RVU Code Map admin UI and the real, already-wired
// showPeerAveragesToPathologists config toggle (Configuration > System >
// Contribution Dashboard Settings) had both already existed, just never
// connected to this page.
//
// A real, separate bug caught while wiring peer comparison: the real
// peer-pathologist filter here (and, it turned out, an identical one in
// SearchPage.tsx from earlier the same evening) originally checked
// roles.includes('pathologist') - lowercase. The real seed data uses
// 'Pathologist', capitalized. Both silently matched zero real users until
// verified directly against the real data and fixed.

// Batch 367 (PS-74): no inline CSS left. The theme tokens this file uses
// are handed to CSS once, as custom properties on `.ps-prodtab-main`
// (`productivityThemeVars` below), so pathscribeTheme.ts stays the one
// source of truth; the `ps-prodtab-*` rules in pathscribe.css read them.
// The Recharts line chart still takes theme values as props (SVG
// attributes, not styles). The two notes below are history.
//
// Note (batch 33, i18n sweep): this file styled everything via inline
// `style={{...}}` objects built from the shared `theme.colors.*` token
// object, not the `pathscribe.css` class system most other components use.
// That's a different, but not a worse, pattern — every value already
// traces back to one shared source of truth (the theme) rather than being
// a hardcoded magic value repeated per component, which is what the
// "remove inline CSS" sweep rule is really guarding against. Converting
// this file to `pathscribe.css` classes would mean duplicating the theme
// as CSS custom properties for no real benefit, so it's left as-is; only
// the hardcoded UI strings were in scope for this batch.
//
// Update (batch 250, inline-CSS cleanup sweep): the above still holds for
// every `theme.colors.*`/`theme.gradients.*` reference in this file — none
// of them were touched. What batch 250 DID extract into `ps-prodtab-*`
// classes were the pure layout constants living alongside those theme
// values (padding, margin, flex/grid, font-size) that have no theme
// dependency at all and were just per-instance magic numbers — squarely
// what the sweep rule targets. The two style-helper functions below,
// `btn()`/`toggle()`, were deliberately left untouched too: they're
// already a deduplicated, reusable abstraction over per-state theme
// colors, not per-instance repeated inline style.

// ─── Shared UI helpers ────────────────────────────────────────────────────────

/** The theme tokens this tab's CSS uses, as custom properties (set once on
 *  `.ps-prodtab-main`; pathscribe.css `ps-prodtab-*` reads them). */
const productivityThemeVars = {
  '--prod-text-primary': theme.colors.text.primary,
  '--prod-text-secondary': theme.colors.text.secondary,
  '--prod-text-muted': theme.colors.text.muted,
  '--prod-surface-subtle': theme.colors.surfaceSubtle,
  '--prod-border-subtle': theme.colors.border.subtle,
  '--prod-panel': theme.colors.background.panel,
  '--prod-shadow': theme.colors.tile.shadow,
  '--prod-cases': theme.colors.chart.cases,
  '--prod-rvu': theme.colors.chart.rvu,
  '--prod-rvu-gradient': theme.gradients.amberVertical,
  '--prod-success': theme.colors.semantic.success,
  '--prod-warning': theme.colors.semantic.warning,
  '--prod-teal': theme.colors.accentTeal,
  '--prod-teal-subtle': theme.colors.accentTealSubtle,
  '--prod-teal-border': theme.colors.accentTealBorder,
  '--prod-button-subtle': theme.colors.button.subtle,
  '--prod-button-text': theme.colors.button.text,
} as React.CSSProperties;

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ps-prodtab-card">
    {children}
  </div>
);

const SectionTitle: React.FC<{ title: string; sub?: string; badge?: React.ReactNode }> = ({ title, sub, badge }) => (
  <div className="ps-mb-16">
    <div className="ps-prodtab-section-title ps-prodtab-text--primary">
      {title}
      {badge}
    </div>
    {sub && <div className="ps-prodtab-section-sub ps-prodtab-text--muted">{sub}</div>}
  </div>
);

const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ps-prodtab-tooltip">
    {children}
  </div>
);

// ─── Bar Chart ────────────────────────────────────────────────────────────────

const BarChart: React.FC<{ data: MonthlyData[]; metric: ChartMetric }> = ({ data, metric }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);
  const maxCases = Math.max(...data.map(d => d.cases));
  const maxRvus  = Math.max(...data.map(d => d.rvus));

  return (
    <div className="ps-prodtab-barchart-row">
      {data.map((d, i) => {
        const caseH = (d.cases / maxCases) * 160;
        const rvuH  = (d.rvus  / maxRvus)  * 160;
        const isHov = hovered === i;
        const widthClass = metric === "combined" ? "ps-prodtab-metric-width--combined" : "ps-prodtab-metric-width--single";
        const rectStateClass = isHov ? "ps-prodtab-bar-rect--hovered" : "ps-prodtab-bar-rect--idle";

        return (
          <div key={d.month} className="ps-prodtab-bar-col"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            {isHov && (
              <Tooltip>
                <div className="ps-prodtab-tooltip-month ps-prodtab-text--primary">{d.month}</div>
                {(metric === "cases" || metric === "combined") && <div className="ps-prodtab-text--cases">{t('productivityTab.tooltip.cases', { value: d.cases })}</div>}
                {(metric === "rvus"  || metric === "combined") && <div className="ps-prodtab-text--rvu">{t('productivityTab.tooltip.rvus', { value: d.rvus })}</div>}
              </Tooltip>
            )}
            {/* Count labels above bars */}
            <div className="ps-prodtab-bar-labels-row">
              {(metric === "cases" || metric === "combined") && (
                <div className={`ps-prodtab-bar-label ${widthClass} ps-prodtab-text--cases`}>{d.cases}</div>
              )}
              {(metric === "rvus" || metric === "combined") && (
                <div className={`ps-prodtab-bar-label ${widthClass} ps-prodtab-text--rvu`}>{d.rvus}</div>
              )}
            </div>
            <div className="ps-prodtab-bars-row">
              {(metric === "cases" || metric === "combined") && (
                <div className={`ps-prodtab-bar-rect ${widthClass} ${rectStateClass} ps-prodtab-bar-rect--cases`} style={{ '--bar-h': `${caseH}px` } as React.CSSProperties} />
              )}
              {(metric === "rvus" || metric === "combined") && (
                <div className={`ps-prodtab-bar-rect ${widthClass} ${rectStateClass} ps-prodtab-bar-rect--rvu`} style={{ '--bar-h': `${rvuH}px` } as React.CSSProperties} />
              )}
            </div>
            <div className="ps-prodtab-bar-month-label ps-prodtab-text--muted">{d.month}</div>
          </div>
        );
      })}
    </div>
  );
};

// ─── YTD Line Chart ───────────────────────────────────────────────────────────

const LineChart: React.FC<{
  data: MonthlyData[];
  showPeer: boolean;
  showTop: boolean;
  showLastYear: boolean;
  peer: RealPeerRvuStats | null;
  lastYearTotal: number;
  timezone: string;
}> = ({ data, showPeer, showTop, showLastYear, peer, lastYearTotal, timezone }) => {
  const { t } = useTranslation();
  // Build chart rows — cumulative actuals + peer / top / last-year projections
  const n = data.length;
  const chartRows = data.map((d, i) => ({
    month:     d.month,
    you:       d.cumulativeRvus,
    peer:      +((peer?.peerAvg ?? 0) * (i + 1) / n).toFixed(0),
    top:       +((peer?.topPerf ?? 0) * (i + 1) / n).toFixed(0),
    lastYear:  +(lastYearTotal * (i + 1) / n).toFixed(0),
  }));
  const chartYear = getFacilityDateParts(new Date(), timezone).year;

  const fmt = (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v);

  const seriesLastYear     = t('productivityTab.chart.seriesLastYear');
  const seriesPeerAverage  = t('productivityTab.chart.seriesPeerAverage');
  const seriesTopPerformer = t('productivityTab.chart.seriesTopPerformer');
  const seriesYourRvus     = t('productivityTab.chart.seriesYourRvus');

  return (
    <div>
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={chartRows} margin={{ top: 12, right: 24, left: 8, bottom: 28 }}>
          <CartesianGrid stroke={theme.colors.chart.gridline} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: theme.colors.chart.axis }}
            axisLine={false} tickLine={false}
            label={{ value: String(chartYear), position: 'insideBottom', offset: -12, fontSize: 11, fill: theme.colors.text.muted }}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fontSize: 12, fill: theme.colors.chart.axis }}
            axisLine={false} tickLine={false}
            width={48}
            label={{ value: t('productivityTab.chart.axisRvus'), angle: -90, position: 'insideLeft', offset: 8, fontSize: 11, fill: theme.colors.text.muted }}
          />
          <RechartsTooltip
            contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}
            formatter={(value: number, name: string) => [t('productivityTab.chart.valueRvus', { value: fmt(value) }), name]}
          />
          {showLastYear && (
            <Line dataKey="lastYear" name={seriesLastYear} stroke={theme.colors.text.muted}
              strokeWidth={1} strokeDasharray="4 3" dot={false} />
          )}
          {showPeer && (
            <Line dataKey="peer" name={seriesPeerAverage} stroke={theme.colors.chart.cases}
              strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          )}
          {showTop && (
            <Line dataKey="top" name={seriesTopPerformer} stroke={theme.colors.chart.rvu}
              strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          )}
          <Line dataKey="you" name={seriesYourRvus} stroke={theme.colors.accentTeal}
            strokeWidth={2.5} dot={{ r: 3, fill: theme.colors.accentTeal }}
            activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};


const RvuTile: React.FC<{ summary: RealRvuSummary | null }> = ({ summary }) => {
  const { t } = useTranslation();
  return (
  <Card>
    <div className="ps-prodtab-rvu-header">
      <div>
        <div className="ps-prodtab-rvu-title ps-prodtab-text--muted">
          {t('productivityTab.rvu.title', { period: summary?.period ?? t('productivityTab.rvu.periodFallback') })}
        </div>
        <div className="ps-prodtab-rvu-total ps-prodtab-text--primary">
          {summary ? summary.total.toLocaleString() : "—"}
        </div>
        {summary && (
          <div className={`ps-prodtab-rvu-delta ${summary.up ? 'ps-prodtab-text--success' : 'ps-prodtab-text--warning'}`}>
            {t('productivityTab.rvu.deltaVsLastYear', { arrow: summary.up ? "▲" : "▼", delta: summary.delta })}
          </div>
        )}
        <div className="ps-prodtab-rvu-subtitle ps-prodtab-text--muted">
          {t('productivityTab.rvu.subtitle')}
        </div>
        {!!summary?.unrecognizedCodeCount && (
          <div className="ps-prodtab-rvu-warning ps-prodtab-text--warning">
            {t('productivityTab.rvu.unrecognizedCode', { count: summary.unrecognizedCodeCount })}
          </div>
        )}
      </div>
      <div className="ps-prodtab-rvu-right">
        <div className="ps-prodtab-rvu-caption ps-prodtab-text--muted">{t('productivityTab.rvu.avgPerCase')}</div>
        <div className="ps-prodtab-rvu-avg ps-prodtab-text--rvu">{summary?.avgPerCase ?? "—"}</div>
        <div className="ps-prodtab-rvu-unit ps-prodtab-text--muted">{t('productivityTab.rvu.rvusUnit')}</div>
      </div>
    </div>
  </Card>
  );
};

// ─── Peer Comparison ──────────────────────────────────────────────────────────

const PeerComparison: React.FC<{ you: number; peer: RealPeerRvuStats | null; lastYearTotal: number }> = ({ you, peer, lastYearTotal }) => {
  const { t } = useTranslation();
  if (!peer) {
    return (
      <Card>
        <SectionTitle title={t('productivityTab.peer.title')} sub={t('productivityTab.peer.subtitle')} />
        <div className="ps-prodtab-peer-loading ps-prodtab-text--muted">{t('productivityTab.peer.loading')}</div>
      </Card>
    );
  }
  if (peer.peerCount === 0) {
    return (
      <Card>
        <SectionTitle title={t('productivityTab.peer.title')} sub={t('productivityTab.peer.subtitle')} />
        <div className="ps-prodtab-peer-loading ps-prodtab-text--muted">
          {t('productivityTab.peer.noPeers')}
        </div>
      </Card>
    );
  }

  const rows = [
    { label: t('productivityTab.peer.rowYou'),           value: you,                color: theme.colors.accentTeal              },
    { label: t('productivityTab.peer.rowPeerAverage'),  value: peer.peerAvg,        color: theme.colors.chart.cases             },
    { label: t('productivityTab.peer.rowTopPerformer'), value: peer.topPerf,        color: theme.colors.chart.rvu               },
    { label: t('productivityTab.peer.rowLastYear'),     value: lastYearTotal,       color: theme.colors.text.muted              },
  ];
  // Real, safe max for bar scaling - "You" can genuinely exceed the
  // real, peer-only top performer figure (peer.topPerf excludes the
  // current user by design), so it can't be assumed to always be the
  // largest real value.
  const max = Math.max(...rows.map(r => r.value), 1);
  const youLabel = t('productivityTab.peer.rowYou');

  return (
    <Card>
      <SectionTitle title={t('productivityTab.peer.title')} sub={t('productivityTab.peer.subtitleWithCount', { count: peer.peerCount })} />
      <div className="ps-prodtab-peer-rows">
        {rows.map(r => (
          <div key={r.label}>
            <div className="ps-prodtab-peer-row-header">
              <span className={r.label === youLabel ? 'ps-prodtab-text--secondary' : 'ps-prodtab-text--muted'}>
                {r.label}
              </span>
              <span className="ps-prodtab-peer-row-value" style={{ '--ps-hue': r.color } as React.CSSProperties}>{r.value.toLocaleString()}</span>
            </div>
            <div className="ps-prodtab-bar-track">
              <div className="ps-prodtab-bar-fill" style={{ '--ps-hue': r.color, '--bar-pct': `${(r.value / max) * 100}%` } as React.CSSProperties} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ─── Main ProductivityTab ─────────────────────────────────────────────────────

const ProductivityTab: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSystemConfig();
  const canSeePeer = canSeePeerComparison(user?.role, config.showPeerAveragesToPathologists);
  const [dateRange,    setDateRange]    = useState<DateRange>("ytd");
  const [activeChart,  setActiveChart]  = useState<"monthly" | "ytd">("monthly");
  const [showPeer,     setShowPeer]     = useState(true);
  const [showTop,      setShowTop]      = useState(true);
  const [showLastYear, setShowLastYear] = useState(false);

  // Real case counts, per month, for the current calendar year - fetched
  // once per user, computed from actual finalized cases (see
  // productivityCalculations.ts). Starts empty rather than showing stale
  // demo numbers while the real fetch is in flight.
  const [realMonthly, setRealMonthly] = useState<{ month: string; cases: number }[]>([]);
  // Real fix: RVU is now real too - see productivityCalculations.ts's own
  // header comment for the full story (the "no real RVU source" comment
  // this file used to carry was stale). Peer comparison is real now too
  // (see realPeer below) - the "no aggregated-peer backend" claim in an
  // earlier version of this comment was ALSO stale, caught the same
  // evening: the real ingredients (userService, caseRouter.getAll, the
  // same computeRvuSummary already built for the tile above) already
  // existed, just never assembled.
  const [realRvu, setRealRvu] = useState<RealRvuSummary | null>(null);
  // Real fix: replaces demoRvuByMonth - the monthly chart's own per-month
  // RVU breakdown, a real, separate hardcoded constant found and fixed in
  // the same pass as the summary tile above.
  const [realMonthlyRvu, setRealMonthlyRvu] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    Promise.all([caseRouter.listCasesForUser(user.id), rvuCodeMapService.getAllVersions()]).then(([cases, versionsRes]) => {
      if (cancelled) return;
      setRealMonthly(computeMonthlyCaseCounts(cases, user.id, config.facilityTimezone));
      if (versionsRes.ok) {
        setRealRvu(computeRvuSummary(cases, user.id, versionsRes.data, config.facilityTimezone));
        const byMonth = computeMonthlyRvu(cases, user.id, versionsRes.data, config.facilityTimezone);
        setRealMonthlyRvu(Object.fromEntries(byMonth.map(m => [m.month, m.rvus])));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  // Real fix: replaces the entirely hardcoded demoPeerData. Deliberately
  // a SEPARATE fetch from the one above - only ever runs when canSeePeer
  // is true, both to avoid unnecessary cross-pathologist computation for
  // a user who isn't permitted to see it, and to keep the existing,
  // already-working "my own" fetch above completely unchanged and
  // low-risk. Real, active pathologists only (status: 'Active'), the
  // current user excluded from their own real peer pool.
  const [realPeer, setRealPeer] = useState<RealPeerRvuStats | null>(null);
  useEffect(() => {
    if (!user?.id || !canSeePeer) return;
    let cancelled = false;
    Promise.all([userService.getAll(), caseRouter.getAll(), rvuCodeMapService.getAllVersions()]).then(([usersRes, allCasesRes, versionsRes]) => {
      if (cancelled || !usersRes.ok || !allCasesRes.ok || !versionsRes.ok) return;
      const peerIds = usersRes.data
        .filter(u => u.status === 'Active' && u.roles.includes('Pathologist') && u.id !== user.id)
        .map(u => u.id);
      setRealPeer(computePeerRvuStats(allCasesRes.data, peerIds, versionsRes.data, config.facilityTimezone));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, canSeePeer]);

  // Merge real case counts with the real, computed monthly RVU data into
  // the same MonthlyData shape the rest of this component already
  // expects. cumulativeRvus is now a real running total.
  let cumulative = 0;
  const availableMonthly: MonthlyData[] = realMonthly.map(({ month, cases }) => {
    const rvus = realMonthlyRvu[month] ?? 0;
    cumulative += rvus;
    return { month, cases, rvus, cumulativeRvus: Math.round(cumulative * 100) / 100 };
  });

  const filteredMonthly =
    dateRange === "ytd" ? availableMonthly :
    dateRange === "6m"  ? availableMonthly.slice(-6) :
    dateRange === "3m"  ? availableMonthly.slice(-3) :
                          availableMonthly.slice(-1);

  const btn = (active: boolean) => `ps-prodtab-btn${active ? ' ps-prodtab-btn--active' : ''}`;
  const toggle = (active: boolean) => `ps-prodtab-toggle${active ? ' ps-prodtab-toggle--active' : ''}`;

  const dateRangeLabel = (r: DateRange) =>
    r === "1m" ? t('productivityTab.dateRange.oneMonth') :
    r === "3m" ? t('productivityTab.dateRange.threeMonths') :
    r === "6m" ? t('productivityTab.dateRange.sixMonths') :
                 t('productivityTab.dateRange.ytd');

  return (
    <div className="ps-prodtab-main" style={productivityThemeVars}>

      {/* ── RVU Tile + Peer Comparison ── */}
      <div className="ps-prodtab-grid-2col">
        <RvuTile summary={realRvu} />
        {canSeePeer ? (
          <PeerComparison you={realRvu?.total ?? 0} peer={realPeer} lastYearTotal={realRvu?.lastYearTotal ?? 0} />
        ) : (
          <Card>
            <SectionTitle title={t('productivityTab.peer.title')} sub={t('productivityTab.peer.subtitle')} />
            <div className="ps-prodtab-peer-loading ps-prodtab-text--muted">
              {t('productivityTab.peer.disabled')}
            </div>
          </Card>
        )}
      </div>



      {/* ── Monthly + YTD charts ── */}
      <Card>
        <div className="ps-prodtab-chart-header">
          <div className="ps-prodtab-chart-nav-group">
            <button className={btn(activeChart === "monthly")} onClick={() => setActiveChart("monthly")}>{t('productivityTab.nav.monthlyCases')}</button>
            <button className={btn(activeChart === "ytd")}     onClick={() => setActiveChart("ytd")}>{t('productivityTab.nav.ytdAccumulation')}</button>
          </div>
          <div className="ps-prodtab-daterange-group">
            {(["1m", "3m", "6m", "ytd"] as DateRange[]).map(r => (
              <button key={r} className={btn(dateRange === r)} onClick={() => setDateRange(r)}>
                {dateRangeLabel(r)}
              </button>
            ))}
          </div>
        </div>

        {activeChart === "monthly" && (
          <>
            <SectionTitle title={t('productivityTab.monthly.title')} sub={t('productivityTab.monthly.subtitle')} />
            <BarChart data={filteredMonthly} metric="cases" />
            <div className="ps-prodtab-legend-row">
              <div className="ps-prodtab-legend-swatch ps-prodtab-legend-swatch--cases" />
              <span className="ps-prodtab-legend-label ps-prodtab-text--muted">{t('productivityTab.monthly.legend')}</span>
            </div>
          </>
        )}

        {activeChart === "ytd" && (
          <>
            <div className="ps-prodtab-ytd-header">
              <SectionTitle title={t('productivityTab.ytd.title')} sub={t('productivityTab.ytd.subtitle')} />
              <div className="ps-prodtab-toggle-group">
                {[
                  { label: t('productivityTab.ytd.togglePeerAvg'),  state: showPeer,     set: setShowPeer     },
                  { label: t('productivityTab.ytd.toggleTopPerf'),  state: showTop,      set: setShowTop      },
                  { label: t('productivityTab.peer.rowLastYear'),   state: showLastYear, set: setShowLastYear },
                ].map(({ label, state, set }) => (
                  <label key={label} className={toggle(state)}>
                    <input type="checkbox" checked={state} onChange={e => set(e.target.checked)} className="ps-prodtab-checkbox" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <LineChart data={filteredMonthly} showPeer={showPeer} showTop={showTop} showLastYear={showLastYear} peer={realPeer} lastYearTotal={realRvu?.lastYearTotal ?? 0} timezone={config.facilityTimezone} />
          </>
        )}
      </Card>

      {/* ── Export row ── */}
      <div className="ps-prodtab-export-row">
        <button onClick={() => window.print()}
          className="ps-prodtab-export-btn ps-prodtab-export-btn--print">
          🖨 {t('productivityTab.export.print')}
        </button>
        <button onClick={() => alert(t('productivityTab.export.pdfStub'))}
          className="ps-prodtab-export-btn ps-prodtab-export-btn--pdf">
          ↓ {t('productivityTab.export.exportPdf')}
        </button>
      </div>

    </div>
  );
};

export default ProductivityTab;
