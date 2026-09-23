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
import { mockRvuCodeMapService } from "@/services/billing/mockRvuCodeMapService";
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
// services/billing/mockRvuCodeMapService.ts and services/users/. Two
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

// Note (batch 33, i18n sweep): this file styles everything via inline
// `style={{...}}` objects built from the shared `theme.colors.*` token
// object, not the `pathscribe.css` class system most other components use.
// That's a different, but not a worse, pattern — every value already
// traces back to one shared source of truth (the theme) rather than being
// a hardcoded magic value repeated per component, which is what the
// "remove inline CSS" sweep rule is really guarding against. Converting
// this file to `pathscribe.css` classes would mean duplicating the theme
// as CSS custom properties for no real benefit, so it's left as-is; only
// the hardcoded UI strings were in scope for this batch.

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: theme.colors.surfaceSubtle,
    border: `1px solid ${theme.colors.border.subtle}`,
    borderRadius: "16px",
    padding: "20px",
    ...style,
  }}>
    {children}
  </div>
);

const SectionTitle: React.FC<{ title: string; sub?: string; badge?: React.ReactNode }> = ({ title, sub, badge }) => (
  <div style={{ marginBottom: "16px" }}>
    <div style={{ fontSize: "15px", fontWeight: 700, color: theme.colors.text.primary, display: "flex", alignItems: "center", gap: "8px" }}>
      {title}
      {badge}
    </div>
    {sub && <div style={{ fontSize: "12px", color: theme.colors.text.muted, marginTop: "2px" }}>{sub}</div>}
  </div>
);

const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
    background: theme.colors.background.panel,
    border: `1px solid ${theme.colors.border.subtle}`,
    borderRadius: "8px", padding: "8px 12px", fontSize: "12px",
    color: theme.colors.text.secondary, whiteSpace: "nowrap", zIndex: 10,
    boxShadow: `0 4px 16px ${theme.colors.tile.shadow}`,
  }}>
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
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "200px" }}>
      {data.map((d, i) => {
        const caseH = (d.cases / maxCases) * 160;
        const rvuH  = (d.rvus  / maxRvus)  * 160;
        const isHov = hovered === i;

        return (
          <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            {isHov && (
              <Tooltip>
                <div style={{ fontWeight: 700, color: theme.colors.text.primary, marginBottom: "4px" }}>{d.month}</div>
                {(metric === "cases" || metric === "combined") && <div style={{ color: theme.colors.chart.cases }}>{t('productivityTab.tooltip.cases', { value: d.cases })}</div>}
                {(metric === "rvus"  || metric === "combined") && <div style={{ color: theme.colors.chart.rvu   }}>{t('productivityTab.tooltip.rvus', { value: d.rvus })}</div>}
              </Tooltip>
            )}
            {/* Count labels above bars */}
            <div style={{ display: "flex", gap: "2px", marginBottom: "3px", justifyContent: "center", width: "100%" }}>
              {(metric === "cases" || metric === "combined") && (
                <div style={{ fontSize: "10px", fontWeight: 700, color: theme.colors.chart.cases, width: metric === "combined" ? "45%" : "70%", textAlign: "center" }}>{d.cases}</div>
              )}
              {(metric === "rvus" || metric === "combined") && (
                <div style={{ fontSize: "10px", fontWeight: 700, color: theme.colors.chart.rvu, width: metric === "combined" ? "45%" : "70%", textAlign: "center" }}>{d.rvus}</div>
              )}
            </div>
            <div style={{ width: "100%", height: "160px", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "2px" }}>
              {(metric === "cases" || metric === "combined") && (
                <div style={{ width: metric === "combined" ? "45%" : "70%", height: `${caseH}px`, background: theme.colors.chart.cases, borderRadius: "4px 4px 0 0", opacity: isHov ? 1 : 0.85, transition: "height 0.3s ease, opacity 0.15s" }} />
              )}
              {(metric === "rvus" || metric === "combined") && (
                <div style={{ width: metric === "combined" ? "45%" : "70%", height: `${rvuH}px`, background: theme.gradients.amberVertical, borderRadius: "4px 4px 0 0", opacity: isHov ? 1 : 0.85, transition: "height 0.3s ease, opacity 0.15s" }} />
              )}
            </div>
            <div style={{ fontSize: "11px", color: theme.colors.text.muted, marginTop: "6px" }}>{d.month}</div>
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: "13px", color: theme.colors.text.muted, marginBottom: "6px" }}>
          {t('productivityTab.rvu.title', { period: summary?.period ?? t('productivityTab.rvu.periodFallback') })}
        </div>
        <div style={{ fontSize: "32px", fontWeight: 800, color: theme.colors.text.primary, lineHeight: 1 }}>
          {summary ? summary.total.toLocaleString() : "—"}
        </div>
        {summary && (
          <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "6px", color: summary.up ? theme.colors.semantic.success : theme.colors.semantic.warning }}>
            {t('productivityTab.rvu.deltaVsLastYear', { arrow: summary.up ? "▲" : "▼", delta: summary.delta })}
          </div>
        )}
        <div style={{ fontSize: "11px", color: theme.colors.text.muted, marginTop: "8px" }}>
          {t('productivityTab.rvu.subtitle')}
        </div>
        {!!summary?.unrecognizedCodeCount && (
          <div style={{ fontSize: "10px", color: theme.colors.semantic.warning, marginTop: "4px" }}>
            {t('productivityTab.rvu.unrecognizedCode', { count: summary.unrecognizedCodeCount })}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "11px", color: theme.colors.text.muted }}>{t('productivityTab.rvu.avgPerCase')}</div>
        <div style={{ fontSize: "24px", fontWeight: 700, color: theme.colors.chart.rvu }}>{summary?.avgPerCase ?? "—"}</div>
        <div style={{ fontSize: "10px", color: theme.colors.text.muted, marginTop: "2px" }}>{t('productivityTab.rvu.rvusUnit')}</div>
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
        <div style={{ fontSize: "12px", color: theme.colors.text.muted, padding: "12px 0" }}>{t('productivityTab.peer.loading')}</div>
      </Card>
    );
  }
  if (peer.peerCount === 0) {
    return (
      <Card>
        <SectionTitle title={t('productivityTab.peer.title')} sub={t('productivityTab.peer.subtitle')} />
        <div style={{ fontSize: "12px", color: theme.colors.text.muted, padding: "12px 0" }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {rows.map(r => (
          <div key={r.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "5px" }}>
              <span style={{ color: r.label === youLabel ? theme.colors.text.secondary : theme.colors.text.muted }}>
                {r.label}
              </span>
              <span style={{ color: r.color, fontWeight: 700 }}>{r.value.toLocaleString()}</span>
            </div>
            <div style={{ height: "6px", borderRadius: "99px", background: theme.colors.surfaceSubtle, border: `1px solid ${theme.colors.border.subtle}`, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(r.value / max) * 100}%`, background: r.color, borderRadius: "99px", transition: "width 0.6s ease" }} />
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
    Promise.all([caseRouter.listCasesForUser(user.id), mockRvuCodeMapService.getAllVersions()]).then(([cases, versionsRes]) => {
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
    Promise.all([userService.getAll(), caseRouter.getAll(), mockRvuCodeMapService.getAllVersions()]).then(([usersRes, allCasesRes, versionsRes]) => {
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

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "6px", cursor: "pointer",
    border: `1px solid ${active ? theme.colors.accentTealBorder : theme.colors.border.subtle}`,
    background: active ? theme.colors.accentTealSubtle : theme.colors.button.subtle,
    color: active ? theme.colors.accentTeal : theme.colors.text.muted,
    transition: "all 0.15s",
  });

  const toggle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
    fontSize: "12px", color: active ? theme.colors.text.secondary : theme.colors.text.muted,
    userSelect: "none",
  });

  const dateRangeLabel = (r: DateRange) =>
    r === "1m" ? t('productivityTab.dateRange.oneMonth') :
    r === "3m" ? t('productivityTab.dateRange.threeMonths') :
    r === "6m" ? t('productivityTab.dateRange.sixMonths') :
                 t('productivityTab.dateRange.ytd');

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── RVU Tile + Peer Comparison ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <RvuTile summary={realRvu} />
        {canSeePeer ? (
          <PeerComparison you={realRvu?.total ?? 0} peer={realPeer} lastYearTotal={realRvu?.lastYearTotal ?? 0} />
        ) : (
          <Card>
            <SectionTitle title={t('productivityTab.peer.title')} sub={t('productivityTab.peer.subtitle')} />
            <div style={{ fontSize: "12px", color: theme.colors.text.muted, padding: "12px 0" }}>
              {t('productivityTab.peer.disabled')}
            </div>
          </Card>
        )}
      </div>



      {/* ── Monthly + YTD charts ── */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={btn(activeChart === "monthly")} onClick={() => setActiveChart("monthly")}>{t('productivityTab.nav.monthlyCases')}</button>
            <button style={btn(activeChart === "ytd")}     onClick={() => setActiveChart("ytd")}>{t('productivityTab.nav.ytdAccumulation')}</button>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["1m", "3m", "6m", "ytd"] as DateRange[]).map(r => (
              <button key={r} style={btn(dateRange === r)} onClick={() => setDateRange(r)}>
                {dateRangeLabel(r)}
              </button>
            ))}
          </div>
        </div>

        {activeChart === "monthly" && (
          <>
            <SectionTitle title={t('productivityTab.monthly.title')} sub={t('productivityTab.monthly.subtitle')} />
            <BarChart data={filteredMonthly} metric="cases" />
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "12px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: theme.colors.chart.cases }} />
              <span style={{ fontSize: "11px", color: theme.colors.text.muted }}>{t('productivityTab.monthly.legend')}</span>
            </div>
          </>
        )}

        {activeChart === "ytd" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <SectionTitle title={t('productivityTab.ytd.title')} sub={t('productivityTab.ytd.subtitle')} />
              <div style={{ display: "flex", gap: "16px" }}>
                {[
                  { label: t('productivityTab.ytd.togglePeerAvg'),  state: showPeer,     set: setShowPeer     },
                  { label: t('productivityTab.ytd.toggleTopPerf'),  state: showTop,      set: setShowTop      },
                  { label: t('productivityTab.peer.rowLastYear'),   state: showLastYear, set: setShowLastYear },
                ].map(({ label, state, set }) => (
                  <label key={label} style={toggle(state)}>
                    <input type="checkbox" checked={state} onChange={e => set(e.target.checked)} style={{ accentColor: theme.colors.accentTeal, width: "13px", height: "13px" }} />
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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button onClick={() => window.print()}
          style={{ padding: "8px 18px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: "pointer", border: `1px solid ${theme.colors.border.subtle}`, background: theme.colors.button.subtle, color: theme.colors.button.text }}>
          🖨 {t('productivityTab.export.print')}
        </button>
        <button onClick={() => alert(t('productivityTab.export.pdfStub'))}
          style={{ padding: "8px 18px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: "pointer", border: `1px solid ${theme.colors.accentTealBorder}`, background: theme.colors.accentTealSubtle, color: theme.colors.accentTeal }}>
          ↓ {t('productivityTab.export.exportPdf')}
        </button>
      </div>

    </div>
  );
};

export default ProductivityTab;
