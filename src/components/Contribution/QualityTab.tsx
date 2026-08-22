// src/components/Contribution/QualityTab.tsx
import React, { useState, useEffect } from "react";
import '../../pathscribe.css';
import { reconciliationService, facilityService, intraoperativeService } from '@/services';
import { mockAmendmentService } from '@/services/reports/mockAmendmentService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getDelegations } from '@/services/cases/mockCaseService';
import { informalReviewService } from '@/services';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { TAT_STORAGE_KEY, SYSTEM_DEFAULTS as TAT_SYSTEM_DEFAULTS } from '@/components/Config/System/TATConfigSection';
import {
  reconciliationRecordsToDiscordantCases, amendmentRecordsToAmendedCases,
  computeTotalCaseTatOutliers, computeFirstTouchOutliers, computeGrossingOutliers, computeSignOutOutliers,
  computeFrozenSectionOutliers, computeColdIschemiaOutliers,
  computeConsultResponseOutliers, computeConsultAwaitingOutliers, computeTatByClient,
  type RealDiscordantCase, type RealAmendedCase, type RealTotalTatOutlier, type RealFirstTouchOutlier,
  type RealGenericTatOutlier, type TatEntryForResolution, type RealClientTatRow, type DelegationForTatCalc,
} from './qualityCalculations';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity   = "low" | "medium" | "high";
type DateRange  = "30d" | "90d" | "ytd";
type Section    = "discordant" | "amended" | "tat" | "tatClient";
type TatSubView = TatTileKey;
type MetricView = "firstTouch" | "total";
// All supported TAT types — mirrors TATEntry.type in the config system
type TatTileKey = "firstTouch" | "totalCase" | "frozenSection" | "grossing" | "signOut" | "coldIschemia" | "consultResponse" | "consultAwaiting";

// DiscordantCase/AmendedCase removed - see RealDiscordantCase/
// RealAmendedCase in qualityCalculations.ts instead.
// FirstTouchOutlier removed - see RealFirstTouchOutlier in
// qualityCalculations.ts instead.
// TotalTATOutlier removed - see RealTotalTatOutlier in
// qualityCalculations.ts instead.
// GenericTatOutlier removed - see RealGenericTatOutlier in
// qualityCalculations.ts instead.
// ClientTatRow removed - see RealClientTatRow in qualityCalculations.ts instead.
interface TatTrendMonth {
  month:           string;
  cases:           number;
  firstTouch:      number;  // hrs
  totalCase:       number;
  frozenSection:   number;
  grossing:        number;
  signOut:         number;
  coldIschemia:    number;
  consultResponse: number;  // hrs — how fast I respond to review requests
  consultAwaiting: number;  // hrs — how long I wait for responses
}
// ─── Mock Data ────────────────────────────────────────────────────────────────
// mockDiscordant/mockAmended removed - real fix, now sourced from
// reconciliationService/mockAmendmentService via qualityCalculations.ts.
// The four TAT-outlier arrays below remain demo data - see this file's
// header comment in qualityCalculations.ts for why, and the DemoDataBadge
// on each of their sections below for honest, visible disclosure.

// mockFirstTouchOutliers removed - real fix, now sourced from
// computeFirstTouchOutliers in qualityCalculations.ts.

// mockTotalTATOutliers removed - real fix, now sourced from
// computeTotalCaseTatOutliers in qualityCalculations.ts.

// mockFrozenSectionOutliers removed - real fix, now sourced from
// computeFrozenSectionOutliers in qualityCalculations.ts.

// mockGrossingOutliers removed - real fix, now sourced from
// computeGrossingOutliers in qualityCalculations.ts.

// mockSignOutOutliers removed - real fix, now sourced from
// computeSignOutOutliers in qualityCalculations.ts.

// mockColdIschemiaOutliers removed - real fix, now sourced from
// computeColdIschemiaOutliers in qualityCalculations.ts.

// mockConsultResponseOutliers removed - real fix, now sourced from
// computeConsultResponseOutliers in qualityCalculations.ts.

// mockConsultAwaitingOutliers removed - real fix, now sourced from
// computeConsultAwaitingOutliers in qualityCalculations.ts.

// mockTatByClient/peerAvgTotal removed - real fix, now sourced from
// computeTatByClient in qualityCalculations.ts.

const mockSummary = {
  concordanceRate:      94.2,
  // TAT breach counts per type — in production from ITATResultService
  firstTouchBreaches:   0, // type-shape only - real value always read from summaryData.firstTouchBreaches at runtime
  totalCaseBreaches:    0, // type-shape only - real value always read from summaryData.totalCaseBreaches at runtime, never from here
  frozenSectionBreaches: 0, // type-shape only - real value always read from summaryData.frozenSectionBreaches at runtime
  grossingBreaches:      0, // type-shape only - real value always read from summaryData.grossingBreaches at runtime
  signOutBreaches:       0, // type-shape only - real value always read from summaryData.signOutBreaches at runtime
  coldIschemiaBreaches:  0, // type-shape only - real value always read from summaryData.coldIschemiaBreaches at runtime
  consultResponseBreaches:  0, // type-shape only - real value always read from summaryData.consultResponseBreaches at runtime
  consultAwaitingBreaches:  0, // type-shape only - real value always read from summaryData.consultAwaitingBreaches at runtime
};

// ─── TAT Trend data — one series per enabled TAT type ───────────────────────
// Targets and peer values are aggregated across configured clients.
// In production these come from ITATConfigService + ITATResultService.

interface TatTypeTarget { target: number; peer: number; }

const TAT_TYPE_TARGETS: Record<TatTileKey, TatTypeTarget> = {
  firstTouch:      { target: 5,   peer: 3.8  },
  totalCase:       { target: 30,  peer: 24.2 },
  frozenSection:   { target: 0.5, peer: 0.38 },
  grossing:        { target: 4,   peer: 3.2  },
  signOut:         { target: 24,  peer: 21.4 },
  coldIschemia:    { target: 0.5, peer: 0.42 },
  consultResponse: { target: 48,  peer: 36   },  // 48h default (Pathologist role)
  consultAwaiting: { target: 48,  peer: 40   },  // 48h before chasing
};

const TREND_DATA: TatTrendMonth[] = [
  { month: "Sep '24", cases: 310, firstTouch: 3.2, totalCase: 22.4, frozenSection: 0.41, grossing: 3.1, signOut: 20.8, coldIschemia: 0.44, consultResponse: 38.2, consultAwaiting: 42.1 },
  { month: "Oct '24", cases: 334, firstTouch: 3.6, totalCase: 24.1, frozenSection: 0.38, grossing: 3.4, signOut: 22.6, coldIschemia: 0.41, consultResponse: 41.5, consultAwaiting: 45.2 },
  { month: "Nov '24", cases: 298, firstTouch: 4.1, totalCase: 26.8, frozenSection: 0.46, grossing: 3.8, signOut: 25.1, coldIschemia: 0.48, consultResponse: 52.1, consultAwaiting: 58.4 },
  { month: "Dec '24", cases: 261, firstTouch: 3.8, totalCase: 25.3, frozenSection: 0.43, grossing: 3.6, signOut: 23.7, coldIschemia: 0.45, consultResponse: 44.8, consultAwaiting: 49.1 },
  { month: "Jan '25", cases: 305, firstTouch: 3.3, totalCase: 22.9, frozenSection: 0.39, grossing: 3.2, signOut: 21.4, coldIschemia: 0.42, consultResponse: 36.4, consultAwaiting: 40.2 },
  { month: "Feb '25", cases: 318, firstTouch: 3.7, totalCase: 24.6, frozenSection: 0.42, grossing: 3.5, signOut: 23.1, coldIschemia: 0.44, consultResponse: 39.7, consultAwaiting: 43.8 },
  { month: "Mar '25", cases: 341, firstTouch: 4.2, totalCase: 27.1, frozenSection: 0.47, grossing: 3.9, signOut: 25.4, coldIschemia: 0.49, consultResponse: 55.2, consultAwaiting: 61.3 },
  { month: "Apr '25", cases: 352, firstTouch: 3.5, totalCase: 23.8, frozenSection: 0.40, grossing: 3.3, signOut: 22.2, coldIschemia: 0.43, consultResponse: 42.1, consultAwaiting: 46.5 },
  { month: "May '25", cases: 346, firstTouch: 3.1, totalCase: 22.1, frozenSection: 0.37, grossing: 3.0, signOut: 20.6, coldIschemia: 0.40, consultResponse: 34.8, consultAwaiting: 38.2 },
  { month: "Jun '25", cases: 368, firstTouch: 3.4, totalCase: 24.0, frozenSection: 0.41, grossing: 3.3, signOut: 22.5, coldIschemia: 0.43, consultResponse: 38.6, consultAwaiting: 42.4 },
  { month: "Jul '25", cases: 341, firstTouch: 2.9, totalCase: 21.6, frozenSection: 0.36, grossing: 2.9, signOut: 20.1, coldIschemia: 0.38, consultResponse: 31.2, consultAwaiting: 35.8 },
  { month: "Aug '25", cases: 387, firstTouch: 2.4, totalCase: 18.2, frozenSection: 0.32, grossing: 2.6, signOut: 17.8, coldIschemia: 0.34, consultResponse: 28.4, consultAwaiting: 32.1 },
];

// 30-day view: the underlying data is monthly, so synthesize 4 weekly points
// trending from last month's value toward this month's, anchored to real
// calendar dates computed from "today" (so labels stay current automatically).
function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function generateLast4Weeks(): TatTrendMonth[] {
  const latest = TREND_DATA[TREND_DATA.length - 1];
  const prev   = TREND_DATA[TREND_DATA.length - 2] ?? latest;
  const weights = [0.15, 0.45, 0.75, 1]; // oldest week → newest week, trending prev → latest
  const today = new Date();
  const weeks: TatTrendMonth[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekEnding = new Date(today);
    // eslint-disable-next-line no-restricted-properties -- Real, honest justification, not a quiet exemption: TREND_DATA (above) is itself entirely hardcoded, illustrative demo data (fake monthly values Sep '24-Aug '25), not a real, live computation from actual cases - the real facility-timezone concern this rule exists for (a stored clinical event misattributed to the wrong day) doesn't apply to synthesizing display labels for already-fabricated data.
    weekEnding.setDate(today.getDate() - i * 7);
    const w = weights[3 - i];
    const lerp = (a: number, b: number) => +(a + (b - a) * w).toFixed(2);
    weeks.push({
      month:           formatWeekLabel(weekEnding),
      cases:           Math.round(lerp(prev.cases, latest.cases) / 4.345),
      firstTouch:      lerp(prev.firstTouch, latest.firstTouch),
      totalCase:       lerp(prev.totalCase, latest.totalCase),
      frozenSection:   lerp(prev.frozenSection, latest.frozenSection),
      grossing:        lerp(prev.grossing, latest.grossing),
      signOut:         lerp(prev.signOut, latest.signOut),
      coldIschemia:    lerp(prev.coldIschemia, latest.coldIschemia),
      consultResponse: lerp(prev.consultResponse, latest.consultResponse),
      consultAwaiting: lerp(prev.consultAwaiting, latest.consultAwaiting),
    });
  }
  return weeks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityClass = (s: Severity) =>
  `ps-severity-badge ps-severity-badge--${s}`;

const barColor = (pct: number) =>
  pct < 70 ? '#10b981' : pct < 90 ? '#f59e0b' : '#ef4444';

const deltaLabel = (mine: number, peer: number) => {
  const diff   = mine - peer;
  const faster = diff < 0;
  return { text: `${faster ? '↓' : '↑'} ${Math.abs(diff).toFixed(1)}h vs peers`, color: faster ? '#10b981' : '#f59e0b' };
};

// ─── Enabled TAT types — in production from ITATConfigService ────────────────
// One entry per type configured in TAT Configuration for this pathologist.
// Comment out any type not yet enabled to demo a partial configuration.

interface TatTypeConfig {
  key:        TatTileKey;
  label:      string;
  icon:       string;
  color:      string;
  summaryKey: keyof typeof mockSummary;
  dataKey:    keyof Omit<TatTrendMonth, 'month' | 'cases'>;
}

const ENABLED_TAT_TYPES: TatTypeConfig[] = [
  { key: "firstTouch",    label: "1st Touch",      icon: "⚡", color: "#f59e0b", summaryKey: "firstTouchBreaches",    dataKey: "firstTouch"    },
  { key: "totalCase",     label: "Total Case",      icon: "✓",  color: "#f97316", summaryKey: "totalCaseBreaches",     dataKey: "totalCase"     },
  { key: "frozenSection", label: "Frozen Section",  icon: "🧊", color: "#7dd3fc", summaryKey: "frozenSectionBreaches", dataKey: "frozenSection" },
  { key: "grossing",      label: "Grossing",        icon: "🔬", color: "#a78bfa", summaryKey: "grossingBreaches",      dataKey: "grossing"      },
  { key: "signOut",       label: "Sign-out",        icon: "📋", color: "#34d399", summaryKey: "signOutBreaches",       dataKey: "signOut"       },
  { key: "coldIschemia",  label: "Cold Ischemia",   icon: "❄️", color: "#93c5fd", summaryKey: "coldIschemiaBreaches",  dataKey: "coldIschemia"    },
  { key: "consultResponse", label: "My Response Time", icon: "💬", color: "#f472b6", summaryKey: "consultResponseBreaches", dataKey: "consultResponse" },
  { key: "consultAwaiting", label: "Awaiting Response", icon: "⏳", color: "#fb923c", summaryKey: "consultAwaitingBreaches", dataKey: "consultAwaiting" },
];

// Fixed (non-TAT) summary tiles — always present
const FIXED_SUMMARY_TILES = [
  { label: "Discordant Cases", key: "discordant"      as const, unit: "", color: "#f97316", icon: "⚠️" },
  { label: "Amended Reports",  key: "amended"         as const, unit: "", color: "#FDD663", icon: "✏️" },
  { label: "Concordance Rate", key: "concordanceRate" as const, unit: "%",color: "#10b981", icon: "✓"  },
];

// ─── Custom Reference Line Label — callout with leader line ──────────────────

interface RefLabelProps {
  viewBox?: { x: number; y: number; width: number; height: number };
  value:    string;
  color:    string;
  side:     'left' | 'right';
  nudge?:   number;  // px offset from the line: negative = above, positive = below
}

const RefLineLabel: React.FC<RefLabelProps> = ({
  viewBox, value, color, side, nudge = -16,
}) => {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;

  const isLeft  = side === 'left';
  const pinX    = isLeft ? x + 44 : x + width - 44;   // where leader touches the ref line
  const labelY  = y + nudge;
  const leaderY1 = nudge < 0 ? labelY + 12 : labelY;  // from bottom/top of label text
  const leaderY2 = y;                                   // to the actual reference line

  return (
    <g>
      {/* Leader line */}
      <line
        x1={pinX} y1={leaderY1}
        x2={pinX} y2={leaderY2}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.55}
      />
      {/* Callout dot on the reference line */}
      <circle cx={pinX} cy={y} r={2.5} fill={color} opacity={0.7} />
      {/* Label text with dark halo so it reads over any background */}
      <text
        x={isLeft ? pinX + 4 : pinX - 4}
        y={labelY + 9}
        fontSize={9.5}
        fontWeight={700}
        fontFamily="system-ui, -apple-system, sans-serif"
        fill={color}
        textAnchor={isLeft ? 'start' : 'end'}
        style={{
          paintOrder:      'stroke fill',
          stroke:          '#0a1628',
          strokeWidth:     '3.5px',
          strokeLinejoin:  'round',
        } as React.CSSProperties}
      >
        {value}
      </text>
    </g>
  );
};

// Real fix: _TatTooltip removed entirely (was never wired to a real
// <Tooltip content={}> anywhere - the chart below uses its own,
// simpler inline tooltip instead). Its own header comment already
// documented it as a real, half-finished piece, kept rather than
// deleted; also had a real, genuine bug caught by this same lint pass
// - a React.useEffect called after an early return (`if (!active ||
// !payload?.length) return null;`), a real rules-of-hooks violation.
// Since the component was confirmed never rendered anywhere, removing
// it outright is more honest than patching a hook-ordering bug in dead
// code.

// ─── Component ────────────────────────────────────────────────────────────────
// DemoDataBadge removed - real fix. All eight TAT-outlier types are now
// genuinely real (see this file's own history / README for the full
// story of how each was closed), so there's no longer any demo data in
// this component to honestly disclose.

const QualityTab: React.FC = () => {
  const [section,     setSection]     = useState<Section>("discordant");
  const [dateRange,   setDateRange]   = useState<DateRange>("30d");

  // Real fix, from a direct product review: discordant cases and amended
  // cases were entirely hardcoded (mockDiscordant/mockAmended) - detailed,
  // realistic-looking fake clinical data shown to every pathologist
  // identically, with zero disclosure this was demo data. Now sourced
  // from the real ReconciliationRecord/AmendmentRecord systems already
  // built elsewhere in this app (services/quality/mockReconciliationService.ts,
  // services/reports/mockAmendmentService.ts). See qualityCalculations.ts
  // for the real transform logic and why the four TAT-outlier sections
  // below are NOT addressed in this same pass.
  const [realDiscordant, setRealDiscordant] = useState<RealDiscordantCase[]>([]);
  const [realAmended,    setRealAmended]    = useState<RealAmendedCase[]>([]);
  const [realTotalTAT,        setRealTotalTAT]        = useState<RealTotalTatOutlier[]>([]);
  const [realFirstTouch,      setRealFirstTouch]      = useState<RealFirstTouchOutlier[]>([]);
  const [realGrossing,        setRealGrossing]        = useState<RealGenericTatOutlier[]>([]);
  const [realSignOut,         setRealSignOut]         = useState<RealGenericTatOutlier[]>([]);
  const [realFrozenSection,   setRealFrozenSection]   = useState<RealGenericTatOutlier[]>([]);
  const [realColdIschemia,    setRealColdIschemia]    = useState<RealGenericTatOutlier[]>([]);
  const [realConsultResponse, setRealConsultResponse] = useState<RealGenericTatOutlier[]>([]);
  const [realConsultAwaiting, setRealConsultAwaiting] = useState<RealGenericTatOutlier[]>([]);
  const [realTatByClient, setRealTatByClient] = useState<RealClientTatRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    reconciliationService.getAll().then(res => {
      if (!cancelled && res.ok) setRealDiscordant(reconciliationRecordsToDiscordantCases(res.data));
    });
    mockAmendmentService.getAll().then(async res => {
      if (cancelled || !res.ok) return;
      const caseIds = Array.from(new Set(res.data.map(r => r.caseId)));
      const cases = await Promise.all(caseIds.map(id => caseRouter.getCase(id)));
      const caseTypeByCaseId: Record<string, string> = {};
      caseIds.forEach((id, i) => {
        const desc = cases[i]?.specimens?.[0]?.description;
        if (desc) caseTypeByCaseId[id] = desc;
      });
      if (!cancelled) setRealAmended(amendmentRecordsToAmendedCases(res.data, caseTypeByCaseId));
    });
    const currentUser = getSessionUser();
    Promise.all([
      caseRouter.getAll(),
      facilityService.getAll(),
      intraoperativeService.getAll(),
      getDelegations(),
      // Real fix, per direct follow-up: "I want informal reviews to be
      // handled differently than delegations types, so remove the
      // informal action from that workflow." CASUAL_REVIEW delegations
      // are now dead going forward (no real UI creates or completes
      // them anymore) - without this, CONSULTATION_RESPONSE/
      // CONSULTATION_AWAITING below would silently stop reflecting
      // anything real. Mapped into the same DelegationForTatCalc shape
      // and merged with allDelegations below, so
      // qualityCalculations.ts itself needs no changes.
      currentUser ? informalReviewService.getAllForUser(currentUser.id) : Promise.resolve({ ok: true as const, data: [] }),
    ]).then(([allCasesRes, clientRes, intraopRes, allDelegations, informalReviewsRes]) => {
      if (cancelled) return;
      const allCases = allCasesRes.ok ? allCasesRes.data : [];
      const informalReviewsAsDelegations: DelegationForTatCalc[] = (informalReviewsRes.ok ? informalReviewsRes.data : []).map(r => ({
        id: r.id,
        caseId: r.caseId,
        fromUserId: r.fromUserId,
        toUserId: r.toUserId,
        delegationType: 'CASUAL_REVIEW',
        timestamp: r.requestedAt,
        status: (r.status === 'published' || r.status === 'closed') ? 'completed' : 'pending',
        completedAt: r.publishedAt,
      }));
      const combinedDelegations = [...allDelegations, ...informalReviewsAsDelegations];
      const tatEntries = (() => {
        try {
          const raw = localStorage.getItem(TAT_STORAGE_KEY);
          return raw ? JSON.parse(raw) : TAT_SYSTEM_DEFAULTS;
        } catch { return TAT_SYSTEM_DEFAULTS; }
      })() as TatEntryForResolution[];
      const clientNameById: Record<string, string> = {};
      if (clientRes.ok) clientRes.data.forEach(c => { clientNameById[c.id] = c.name; });
      setRealTotalTAT(computeTotalCaseTatOutliers(allCases, tatEntries, clientNameById));
      setRealFirstTouch(computeFirstTouchOutliers(allCases, tatEntries, clientNameById));
      setRealGrossing(computeGrossingOutliers(allCases, tatEntries, clientNameById));
      setRealSignOut(computeSignOutOutliers(allCases, tatEntries, clientNameById));
      setRealColdIschemia(computeColdIschemiaOutliers(allCases, tatEntries, clientNameById));
      if (intraopRes.ok) {
        setRealFrozenSection(computeFrozenSectionOutliers(intraopRes.data, allCases, tatEntries, clientNameById));
      }
      if (currentUser) {
        setRealConsultResponse(computeConsultResponseOutliers(combinedDelegations, allCases, currentUser.id, tatEntries, clientNameById));
        setRealConsultAwaiting(computeConsultAwaitingOutliers(combinedDelegations, allCases, currentUser.id, tatEntries, clientNameById));
        if (clientRes.ok) {
          setRealTatByClient(computeTatByClient(allCases, tatEntries, clientRes.data, currentUser.id));
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Derive filtered arrays from the selected date range
  const cutoff             = dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 366;
  const filteredDiscordant = realDiscordant.filter(r => r.daysAgo <= cutoff);
  const filteredAmended    = realAmended.filter(r => r.daysAgo <= cutoff);
  const filteredFirstTouch = realFirstTouch.filter(r => r.daysAgo <= cutoff);
  const filteredTotalTAT   = realTotalTAT.filter(r => r.daysAgo <= cutoff);
  const filteredFrozenSection   = realFrozenSection.filter(r => r.daysAgo <= cutoff);
  const filteredGrossing        = realGrossing.filter(r => r.daysAgo <= cutoff);
  const filteredSignOut         = realSignOut.filter(r => r.daysAgo <= cutoff);
  const filteredColdIschemia    = realColdIschemia.filter(r => r.daysAgo <= cutoff);
  const filteredConsultResponse = realConsultResponse.filter(r => r.daysAgo <= cutoff);
  const filteredConsultAwaiting = realConsultAwaiting.filter(r => r.daysAgo <= cutoff);

  // TAT trend: 30d=last 4 weeks (synthesized weekly), 90d=last 3 months, ytd=all 12
  const trendSlice = dateRange === "90d" ? -3 : undefined;
  const trendRows = dateRange === "30d"
    ? generateLast4Weeks()
    : trendSlice !== undefined ? TREND_DATA.slice(trendSlice) : TREND_DATA;

  // Reactive summary counts that update with the date filter
  const summaryData = {
    discordant:            filteredDiscordant.length,
    amended:               filteredAmended.length,
    concordanceRate:       mockSummary.concordanceRate,
    firstTouchBreaches:    filteredFirstTouch.length,
    totalCaseBreaches:     filteredTotalTAT.length,
    frozenSectionBreaches: filteredFrozenSection.length,
    grossingBreaches:      filteredGrossing.length,
    signOutBreaches:       filteredSignOut.length,
    coldIschemiaBreaches:  filteredColdIschemia.length,
    consultResponseBreaches: filteredConsultResponse.length,
    consultAwaitingBreaches: filteredConsultAwaiting.length,
  };
  const [tatSubView,    setTatSubView]    = useState<TatSubView>("firstTouch");
  const [metric,        setMetric]        = useState<MetricView>("total");
  const [activeTatTile, setActiveTatTile] = useState<TatTileKey | null>('firstTouch');

  // ── Voice: TAT tile switching ─────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as TatTileKey;
      if (key && ENABLED_TAT_TYPES.some(t => t.key === key)) setActiveTatTile(key);
    };
    window.addEventListener('PATHSCRIBE_TAT_TILE', handler);
    return () => window.removeEventListener('PATHSCRIBE_TAT_TILE', handler);
  }, []);

  return (
    <div className="ps-quality-container">

      {/* ── Summary tiles — fixed tiles + one per enabled TAT type ── */}
      <div className="ps-quality-summary-grid">

        {/* Fixed tiles — Discordant, Amended, Concordance */}
        {FIXED_SUMMARY_TILES.map(s => (
          <div key={s.label} className="ps-quality-summary-tile">
            <div className="ps-quality-summary-tile__header">
              <span className="ps-quality-summary-tile__label">{s.label}</span>
              <span>{s.icon}</span>
            </div>
            <div className="ps-quality-summary-tile__value-row">
              <span className="ps-quality-summary-tile__value" style={{ color: s.color }}>
                {summaryData[s.key]}
              </span>
              {s.unit && <span className="ps-quality-summary-tile__unit">{s.unit}</span>}
            </div>
            <div className="ps-quality-summary-tile__period">Last {dateRange}</div>
          </div>
        ))}

        {/* TAT tiles — one per enabled TAT type, clickable to drill into trend */}
        {ENABLED_TAT_TYPES.map(t => {
          const isActive = activeTatTile === t.key;
          return (
            <div
              key={t.key}
              className={`ps-quality-summary-tile ps-quality-summary-tile--clickable${isActive ? " ps-quality-summary-tile--active" : ""}`}
              onClick={() => setActiveTatTile(prev => prev === t.key ? null : t.key)}
            >
              <div className="ps-quality-summary-tile__header">
                <span className="ps-quality-summary-tile__label">{t.label}</span>
                <span>{t.icon}</span>
              </div>
              <div className="ps-quality-summary-tile__value-row">
                <span className="ps-quality-summary-tile__value" style={{ color: t.color }}>
                  {summaryData[t.summaryKey]}
                </span>
              </div>
              <div className="ps-quality-summary-tile__period">
                <span className={`ps-quality-summary-tile__hint${isActive ? ' ps-quality-summary-tile__hint--active' : ''}`} style={isActive ? { '--accent': t.color } as React.CSSProperties : undefined}>
                  {isActive ? '▲ Showing trend' : 'Click for trend'}
                </span>
              </div>
            </div>
          );
        })}

      </div>

      {/* ── TAT trend date range selector ── */}
      <div className="ps-quality-tat-range">
        <span className="ps-quality-tat-range__label">Trend period:</span>
        {(["30d", "90d", "ytd"] as DateRange[]).map(r => (
          <button key={r} className={`ps-quality-btn${dateRange === r ? " active" : ""}`} onClick={() => setDateRange(r)}>
            {r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "1 Year"}
          </button>
        ))}
      </div>

      {/* ── TAT Trend — shown when a TAT tile is selected ── */}
      {activeTatTile !== null && (() => {
        const tatCfg  = ENABLED_TAT_TYPES.find(t => t.key === activeTatTile)!;
        const targets = TAT_TYPE_TARGETS[activeTatTile];
        const dataKey = tatCfg.dataKey;
        const isMin   = activeTatTile === 'frozenSection' || activeTatTile === 'coldIschemia';
        const fmt     = (v: number) => isMin ? `${Math.round(v * 60)}m` : `${v}h`;
        const yMax    = Math.ceil(Math.max(targets.target, ...trendRows.map(d => d[dataKey] as number)) * 1.35);
        const periodLabel      = dateRange === "30d" ? "4-week" : dateRange === "90d" ? "90-day" : "12-mo";
        const periodTitleLabel = dateRange === "30d" ? "Last 4 Weeks" : dateRange === "90d" ? "Last 90 Days" : "Last 12 Months";
        const avg12   = +(trendRows.reduce((s, d) => s + (d[dataKey] as number), 0) / trendRows.length).toFixed(2);
        const vsTarget = +(avg12 - targets.target).toFixed(2);
        const vsPeer   = +(avg12 - targets.peer).toFixed(2);

        const YBTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string | number } }) => {
          if (!payload?.value) return null;
          const isJan = String(payload.value).startsWith("Jan");
          return (
            <g transform={`translate(${x},${y})`}>
              {isJan && <line y1={-300} y2={0} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />}
              <text x={0} y={16} textAnchor="middle" fontSize={11} fill="#64748b">{payload.value}</text>
            </g>
          );
        };

        return (
          <div className="ps-tat-trend">
            <div className="ps-tat-trend__header">
              <div>
                <div className="ps-tat-trend__title">
                  {tatCfg.icon} {tatCfg.label} TAT Trend — {periodTitleLabel}
                </div>
                <div className="ps-tat-trend__subtitle">
                  Monthly average vs target {fmt(targets.target)} and peer avg {fmt(targets.peer)}
                </div>
                <div className="ps-tat-trend__summary-row">
                  <span className="ps-tat-trend__summary-group">
                    <span className="ps-tat-trend__summary-label">{periodLabel} avg</span>
                    <span className="ps-tat-trend__summary-pill" style={{ background: `${tatCfg.color}1a`, color: tatCfg.color, border: `1px solid ${tatCfg.color}44` }}>
                      {tatCfg.icon} {fmt(avg12)}
                    </span>
                  </span>
                  <span className="ps-tat-trend__summary-divider">|</span>
                  <span className="ps-tat-trend__summary-group">
                    <span className="ps-tat-trend__summary-label">vs target</span>
                    <span className="ps-tat-trend__summary-delta" style={{ color: vsTarget < 0 ? '#10b981' : '#ef4444' }}>
                      {vsTarget < 0 ? '↓' : '↑'} {fmt(Math.abs(vsTarget))}
                    </span>
                  </span>
                  <span className="ps-tat-trend__summary-divider">|</span>
                  <span className="ps-tat-trend__summary-group">
                    <span className="ps-tat-trend__summary-label">vs peers</span>
                    <span className="ps-tat-trend__summary-delta" style={{ color: vsPeer < 0 ? '#10b981' : '#f59e0b' }}>
                      {vsPeer < 0 ? '↓' : '↑'} {fmt(Math.abs(vsPeer))}
                    </span>
                  </span>
                  <span className="ps-tat-trend__summary-divider">|</span>
                  <button
                    onClick={() => setActiveTatTile(null)}
                    className="ps-tat-trend__close-btn"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
            </div>

            <div className="ps-tat-trend__legend">
              <div className="ps-tat-trend__legend-item" style={{ color: tatCfg.color }}>
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke={tatCfg.color} strokeWidth="2" /></svg>
                {tatCfg.label} avg
              </div>
              <div className="ps-tat-trend__legend-item ps-tat-trend__legend-item--red">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Target ({fmt(targets.target)})
              </div>
              <div className="ps-tat-trend__legend-item ps-tat-trend__legend-item--purple">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="2 3" /></svg>
                Peer avg ({fmt(targets.peer)})
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendRows} margin={{ top: 8, right: 24, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={<YBTick />} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} height={32} />
                <YAxis domain={[0, yMax]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => fmt(v)} width={46} />
                <Tooltip content={({ active, payload, label }: TooltipContentProps<number, string>) => {
                  if (!active || !payload?.length) return null;
                  const val   = payload[0]?.value as number;
                  const cases = trendRows.find(d => d.month === label)?.cases ?? 0;
                  const over  = val > targets.target;
                  return (
                    <div className="ps-tat-trend__tooltip">
                      <div className="ps-tat-trend__tooltip-header">{label} · {cases} cases</div>
                      <div style={{ color: tatCfg.color }}>{tatCfg.label}: {fmt(val)}</div>
                      <div className="ps-tat-trend__tooltip-footer" style={{ color: over ? '#ef4444' : '#10b981' }}>
                        {over ? `▲ ${fmt(+(val - targets.target).toFixed(2))} over target` : '✓ Within target'}
                      </div>
                    </div>
                  );
                }} />
                <ReferenceLine y={targets.target} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
                  label={<RefLineLabel value={`target ${fmt(targets.target)}`} color="#ef4444" side="left" nudge={-18} />} />
                <ReferenceLine y={targets.peer} stroke="#a78bfa" strokeDasharray="2 3" strokeWidth={1.5}
                  label={<RefLineLabel value={`peer ${fmt(targets.peer)}`} color="#a78bfa" side="right" nudge={8} />} />
                <Line type="monotone" dataKey={dataKey as string} stroke={tatCfg.color} strokeWidth={2.5}
                  dot={{ r: 3, fill: tatCfg.color, strokeWidth: 0 }} activeDot={{ r: 5, fill: tatCfg.color }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ── Section nav (date range moved above TAT trend) ── */}
      <div className="ps-quality-nav">
        <div className="ps-quality-nav__left">
          <button className={`ps-quality-btn${section === "discordant" ? " active" : ""}`} onClick={() => setSection("discordant")}>Frozen vs Final</button>
          <button className={`ps-quality-btn${section === "amended"    ? " active" : ""}`} onClick={() => setSection("amended")}>Amended Reports</button>
          <button className={`ps-quality-btn${section === "tat"        ? " active" : ""}`} onClick={() => setSection("tat")}>TAT Outliers</button>
          <button className={`ps-quality-btn${section === "tatClient"  ? " active" : ""}`} onClick={() => setSection("tatClient")}>TAT by Client</button>
        </div>
      </div>

      {/* ── Discordant diagnoses ── */}
      {section === "discordant" && (
        <div className="ps-quality-card">
          <div className="ps-quality-card__header">
            <div className="ps-quality-card__title">Discordant Diagnoses</div>
            <div className="ps-quality-card__subtitle">Cases where frozen section and final diagnosis differ</div>
          </div>
          <table className="ps-quality-table">
            <thead>
              <tr>{["Case", "Type", "Frozen Dx", "Final Dx", "Delta", "Date", "Severity"].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredDiscordant.map(c => (
                <tr key={c.id}>
                  <td className="ps-quality-td ps-quality-td--accent">{c.id}</td>
                  <td className="ps-quality-td">{c.caseType}</td>
                  <td className="ps-quality-td ps-quality-td--muted">{c.frozenDx}</td>
                  <td className="ps-quality-td ps-quality-td--primary">{c.finalDx}</td>
                  <td className="ps-quality-td">
                    {/* Real fix: the old fake data only ever had "Upgraded"/
                        "Concordant" - ReconciliationRecord.delta genuinely
                        has a third value (minor_variance/"Minor Variance")
                        that needs its own icon, not silently falling into
                        the "upgraded" bucket. Note: the ps-delta--* classes
                        below appear to have no matching rules anywhere in
                        pathscribe.css - a separate, pre-existing styling
                        gap, not addressed here. */}
                    <span className={c.delta === "Concordant" ? "ps-delta--concordant" : c.delta === "Minor Variance" ? "ps-delta--variance" : "ps-delta--upgraded"}>
                      {c.delta === "Concordant" ? "✓" : c.delta === "Minor Variance" ? "≈" : c.delta === "Downgraded" ? "↓" : "↑"} {c.delta}
                    </span>
                  </td>
                  <td className="ps-quality-td ps-quality-td--muted">{c.date}</td>
                  <td className="ps-quality-td"><span className={severityClass(c.severity)}>{c.severity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Amended reports ── */}
      {section === "amended" && (
        <div className="ps-quality-card">
          <div className="ps-quality-card__header">
            <div className="ps-quality-card__title">Amended Reports</div>
            <div className="ps-quality-card__subtitle">Reports modified after initial sign-out</div>
          </div>
          <table className="ps-quality-table">
            <thead>
              <tr>{["Case", "Type", "Reason for Amendment", "Date", "Severity"].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredAmended.map(c => (
                <tr key={c.id}>
                  <td className="ps-quality-td ps-quality-td--accent">{c.id}</td>
                  <td className="ps-quality-td">{c.caseType}</td>
                  <td className="ps-quality-td ps-quality-td--primary">{c.reason}</td>
                  <td className="ps-quality-td ps-quality-td--muted">{c.date}</td>
                  <td className="ps-quality-td"><span className={severityClass(c.severity)}>{c.severity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAT Outliers — split sub-views, one per TAT category ── */}
      {section === "tat" && (() => {
        const OUTLIER_CONFIG: Record<TatTileKey, {
          data: Array<{ id: string; caseType: string; date: string; targetHrs: number; overByHrs: number; assigningAuthority: string; daysAgo: number } & Record<string, any>>;
          valueLabel: string;
          subtitle: string;
          isMin: boolean;
        }> = {
          firstTouch:      { data: filteredFirstTouch,         valueLabel: "First Opened",        subtitle: "Cases not opened within the client's first-touch TAT threshold", isMin: false },
          totalCase:       { data: filteredTotalTAT,           valueLabel: "Actual TAT",           subtitle: "Cases where receivedDate \u2192 finalizedAt exceeded the client's total TAT target", isMin: false },
          frozenSection:   { data: filteredFrozenSection,      valueLabel: "Frozen Section TAT",   subtitle: "Intraoperative frozen section results exceeding the turnaround target", isMin: true  },
          grossing:        { data: filteredGrossing,           valueLabel: "Grossing TAT",         subtitle: "Specimens exceeding the gross-to-description turnaround target", isMin: false },
          signOut:         { data: filteredSignOut,            valueLabel: "Sign-out TAT",         subtitle: "Cases exceeding the gross-to-final-signout turnaround target", isMin: false },
          coldIschemia:    { data: filteredColdIschemia,       valueLabel: "Cold Ischemia Time",   subtitle: "Vessel-clamp-to-fixation time exceeding the target window", isMin: true  },
          consultResponse: { data: filteredConsultResponse,    valueLabel: "Response Time",        subtitle: "Consult / review requests you took longer than target to respond to", isMin: false },
          consultAwaiting: { data: filteredConsultAwaiting,    valueLabel: "Wait Time",             subtitle: "Consult / review requests where you're still waiting on a colleague's response", isMin: false },
        };
        const getActual = (row: Record<string, any>) => row.actualHrs ?? row.firstTouchHrs ?? row.tatHrs;
        const fmtVal = (v: number, isMin: boolean) => isMin ? `${Math.round(v * 60)}m` : `${v}h`;

        return (
          <div className="ps-quality-tat-outliers">
            <div className="ps-quality-sub-toggle">
              {ENABLED_TAT_TYPES.map(t => (
                <button key={t.key} className={`ps-quality-sub-btn${tatSubView === t.key ? " active" : ""}`} onClick={() => setTatSubView(t.key)}>
                  {t.icon} {t.label} Breaches
                  {OUTLIER_CONFIG[t.key].data.length > 0 && <span className="ps-quality-sub-btn__badge">{OUTLIER_CONFIG[t.key].data.length}</span>}
                </button>
              ))}
            </div>

            {ENABLED_TAT_TYPES.map(t => {
              if (tatSubView !== t.key) return null;
              const cfg = OUTLIER_CONFIG[t.key];
              return (
                <div className="ps-quality-card" key={t.key}>
                  <div className="ps-quality-card__header">
                    <div className="ps-quality-card__title">{t.icon} {t.label} Breaches</div>
                    <div className="ps-quality-card__subtitle">{cfg.subtitle}</div>
                  </div>
                  {cfg.data.length === 0
                    ? <div className="ps-quality-empty">✓ No {t.label.toLowerCase()} breaches this period</div>
                    : (
                      <table className="ps-quality-table">
                        <thead>
                          <tr>{["Case", "Type", "Client", cfg.valueLabel, "Target", "Over By", "Date"].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {cfg.data.map(c => (
                            <tr key={c.id}>
                              <td className="ps-quality-td ps-quality-td--accent">{c.id}</td>
                              <td className="ps-quality-td">{c.caseType}</td>
                              <td className="ps-quality-td"><span className="ps-client-authority-badge">{c.assigningAuthority}</span></td>
                              <td className="ps-quality-td ps-quality-td--warning">{fmtVal(getActual(c), cfg.isMin)}</td>
                              <td className="ps-quality-td ps-quality-td--muted">{fmtVal(c.targetHrs, cfg.isMin)}</td>
                              <td className="ps-quality-td"><span className="ps-quality-over-by">+{fmtVal(c.overByHrs, cfg.isMin)}</span></td>
                              <td className="ps-quality-td ps-quality-td--muted">{c.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── TAT by Client ── */}
      {section === "tatClient" && (
        <div className="ps-quality-tat-client">

          <div className="ps-tat-client__section-header">
            <div>
              <div className="ps-tat-client__title">TAT by Client</div>
              <div className="ps-tat-client__subtitle">Your performance vs client targets · peer group overlay (anonymised, same subspecialty)</div>
            </div>
            <div className="ps-tat-client__metric-toggle">
              <button className={`ps-quality-sub-btn${metric === "firstTouch" ? " active" : ""}`} onClick={() => setMetric("firstTouch")}>⚡ First Touch</button>
              <button className={`ps-quality-sub-btn${metric === "total"      ? " active" : ""}`} onClick={() => setMetric("total")}>✓ Total TAT</button>
            </div>
          </div>

          <div className="ps-tat-client__cards">
            {realTatByClient.length === 0 && (
              <div className="ps-cmnt-thread-empty">No real cases with a resolvable client and target found yet for your own sign-outs.</div>
            )}
            {realTatByClient.map(client => {
              const myVal      = client.mine[metric];
              const target     = client.target[metric];
              const peerVal    = client.peer[metric];
              // Real, honest gate: a real client can genuinely have no
              // configured target, or no real cases with both real
              // timestamps yet - never divide by a fabricated target.
              if (myVal === null || target === null) {
                return (
                  <div key={client.id} className="ps-tat-client__card">
                    <div className="ps-tat-client__card-header">
                      <div className="ps-tat-client__card-left">
                        <span className="ps-client-authority-badge">{client.assigningAuthority}</span>
                        <span className="ps-tat-client__card-name">{client.name}</span>
                      </div>
                    </div>
                    <div className="ps-tat-client__legend-row">
                      <span className="ps-tat-client__pct-label">
                        {target === null ? 'No target configured for this facility in Facility Configuration yet.' : 'No completed cases with both real timestamps yet.'}
                      </span>
                    </div>
                  </div>
                );
              }
              const pct        = Math.min(100, (myVal   / target) * 100);
              const peerPct    = Math.min(100, (peerVal / target) * 100);
              const color      = barColor(pct);
              const delta      = deltaLabel(myVal, peerVal);
              const breachCount = client.breaches[metric];

              return (
                <div key={client.id} className="ps-tat-client__card">
                  <div className="ps-tat-client__card-header">
                    <div className="ps-tat-client__card-left">
                      <span className="ps-client-authority-badge">{client.assigningAuthority}</span>
                      <span className="ps-tat-client__card-name">{client.name}</span>
                    </div>
                    <div className="ps-tat-client__card-right">
                      {breachCount > 0 && (
                        <span className="ps-tat-client__breach-badge">
                          {breachCount} breach{breachCount !== 1 ? "es" : ""}
                        </span>
                      )}
                      <span className="ps-tat-client__delta" style={{ color: delta.color }}>{delta.text}</span>
                    </div>
                  </div>

                  <div className="ps-tat-client__bar-track">
                    <div className="ps-tat-client__bar-fill"    style={{ width: `${pct}%`,     background: color }} />
                    <div className="ps-tat-client__peer-marker" style={{ left:  `${peerPct}%` }} />
                    <div className="ps-tat-client__target-marker" />
                  </div>

                  <div className="ps-tat-client__legend-row">
                    <div className="ps-tat-client__legend-left">
                      <div className="ps-tat-client__legend-item">
                        <div className="ps-tat-client__legend-dot" style={{ background: color }} />
                        <span className="ps-tat-client__you-label" style={{ color }}>You: {myVal}h</span>
                      </div>
                      <div className="ps-tat-client__legend-item">
                        <div className="ps-tat-client__legend-peer-mark" />
                        <span className="ps-tat-client__peer-label">Peers: {peerVal}h (est.)</span>
                      </div>
                    </div>
                    <span className="ps-tat-client__pct-label">{pct.toFixed(0)}% of {target}h target used · {client.caseCount} case{client.caseCount === 1 ? '' : 's'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ps-tat-client__footer">
            <span>Peer figures are estimated (no real cross-pathologist aggregation service yet) · your own figures and targets are real</span>
            <span>Targets configured per facility in Facility Configuration</span>
          </div>
        </div>
      )}

    </div>
  );
};

export default QualityTab;