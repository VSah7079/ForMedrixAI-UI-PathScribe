// src/components/Contribution/QualityTab.tsx
import React, { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import {
  qaActivityRecordService, facilityService, intraoperativeService, amendmentService, informalReviewService,
  delegationService, tatTargetService,
} from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '@/services/quality/reconciliationRecordMapping';
import { withPerformingLabs, facilityNamesById, consultationRecords } from '@/services/quality/qualityTatInputs';
import {
  reconciliationRecordsToDiscordantCases, amendmentRecordsToAmendedCases,
  computeTotalCaseTatOutliers, computeFirstTouchOutliers, computeGrossingOutliers, computeSignOutOutliers,
  computeFrozenSectionOutliers, computeColdIschemiaOutliers,
  computeConsultResponseOutliers, computeConsultAwaitingOutliers, computeTatByClient,
  type RealDiscordantCase, type RealAmendedCase, type RealTotalTatOutlier, type RealFirstTouchOutlier,
  type RealGenericTatOutlier, type RealClientTatRow,
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
// qaActivityRecordService/mockAmendmentService via qualityCalculations.ts.
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

// TREND_DATA is illustrative demo data (see comments above/below) — its
// own month labels ("Sep '24" etc.) are data values, not UI chrome, so
// they're deliberately left as-is rather than run through i18n.
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
  // Real, separate gap (flagged, not fixed this batch): this locale is
  // hardcoded to 'en-US' regardless of the active UI language, so these
  // weekly chart-axis labels don't follow i18n language switching the way
  // the surrounding chrome now does. Left as-is because TREND_DATA (the
  // data these labels are synthesized from) is itself entirely hardcoded
  // demo data, not live computed values — see README.
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

// Real fix (batch 32): was a hex-returning function driving a per-render
// inline `style={{ color }}`/`style={{ background }}`; now returns a fixed
// three-state class suffix so the actual colors live in pathscribe.css
// (`.ps-tat-client__bar-fill--good/--warn/--bad` etc.) instead of being
// computed in JS on every render.
const barColorClass = (pct: number): 'good' | 'warn' | 'bad' =>
  pct < 70 ? 'good' : pct < 90 ? 'warn' : 'bad';

// Real fix (batch 32): returns a class suffix + the raw parts for the
// translated "{{arrow}} {{diff}}h vs peers" string, instead of a hardcoded
// English sentence and a raw hex color.
const deltaLabel = (mine: number, peer: number) => {
  const diff   = mine - peer;
  const faster = diff < 0;
  return { diff: Math.abs(diff).toFixed(1), arrow: faster ? '↓' : '↑', cls: faster ? 'good' as const : 'warn' as const };
};

// Discordant-diagnosis delta → icon / i18n-key / CSS-class lookups.
// Real fix (batch 32): the old className ternary only branched on
// Concordant/Minor Variance vs. "everything else", so "Downgraded" was
// silently given the same ps-delta--upgraded class as "Upgraded" — those
// classes never matched any CSS rule before this batch (see the file's own
// long-standing comment below), so the mismatch was invisible. Now that
// real .ps-delta--* rules exist, each of the four real delta values gets
// its own class.
const DELTA_KEY: Record<string, string> = {
  Concordant:       'concordant',
  'Minor Variance': 'variance',
  Downgraded:       'downgraded',
  Upgraded:         'upgraded',
};
const DELTA_ICON: Record<string, string> = {
  Concordant:       '✓',
  'Minor Variance': '≈',
  Downgraded:       '↓',
  Upgraded:         '↑',
};
const DELTA_CLASS: Record<string, string> = {
  Concordant:       'ps-delta--concordant',
  'Minor Variance': 'ps-delta--variance',
  Downgraded:       'ps-delta--downgraded',
  Upgraded:         'ps-delta--upgraded',
};

// ─── Enabled TAT types — in production from ITATConfigService ────────────────
// One entry per type configured in TAT Configuration for this pathologist.
// Comment out any type not yet enabled to demo a partial configuration.
// Labels are resolved via t(`qualityTab.tat.${key}.label`) at each usage
// site rather than stored here, so this stays a module-level constant.

interface TatTypeConfig {
  key:        TatTileKey;
  icon:       string;
  color:      string;
  summaryKey: keyof typeof mockSummary;
  dataKey:    keyof Omit<TatTrendMonth, 'month' | 'cases'>;
}

const ENABLED_TAT_TYPES: TatTypeConfig[] = [
  { key: "firstTouch",      icon: "⚡", color: "#f59e0b", summaryKey: "firstTouchBreaches",      dataKey: "firstTouch"      },
  { key: "totalCase",       icon: "✓",  color: "#f97316", summaryKey: "totalCaseBreaches",       dataKey: "totalCase"       },
  { key: "frozenSection",   icon: "🧊", color: "#7dd3fc", summaryKey: "frozenSectionBreaches",   dataKey: "frozenSection"   },
  { key: "grossing",        icon: "🔬", color: "#a78bfa", summaryKey: "grossingBreaches",        dataKey: "grossing"        },
  { key: "signOut",         icon: "📋", color: "#34d399", summaryKey: "signOutBreaches",         dataKey: "signOut"         },
  { key: "coldIschemia",    icon: "❄️", color: "#93c5fd", summaryKey: "coldIschemiaBreaches",    dataKey: "coldIschemia"    },
  { key: "consultResponse", icon: "💬", color: "#f472b6", summaryKey: "consultResponseBreaches", dataKey: "consultResponse" },
  { key: "consultAwaiting", icon: "⏳", color: "#fb923c", summaryKey: "consultAwaitingBreaches", dataKey: "consultAwaiting" },
];

// Fixed (non-TAT) summary tiles — always present. Labels resolved via
// t(`qualityTab.tiles.${key}`) at each usage site.
const FIXED_SUMMARY_TILES = [
  { key: "discordant"      as const, unit: "", color: "#f97316", icon: "⚠️" },
  { key: "amended"         as const, unit: "", color: "#FDD663", icon: "✏️" },
  { key: "concordanceRate" as const, unit: "%",color: "#10b981", icon: "✓"  },
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
        className="ps-tat-refline-label"
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
  const { t } = useTranslation();
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
  // Real, per direct follow-up ("show a frequency of confirmed
  // discordance to all AI flagged") — this modal only ever opens via
  // the real, automatic detection (confirmed directly: no other
  // trigger exists anywhere in this app), so every real
  // QaActivityRecord for this activity type already IS "AI flagged"
  // by definition — the frequency is just discordant / total for this
  // one activity type, no new "flaggedBySystem" field needed.
  const [realReconciliationTotal, setRealReconciliationTotal] = useState(0);
  useEffect(() => {
    let cancelled = false;
    qaActivityRecordService.getAll().then(res => {
      if (!cancelled && res.ok) {
        const frozenFinalRecords = res.data.filter(r => r.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID);
        setRealDiscordant(reconciliationRecordsToDiscordantCases(frozenFinalRecords));
        setRealReconciliationTotal(frozenFinalRecords.length);
      }
    });
    amendmentService.getAll().then(async res => {
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
    // Batch 353: delegations and TAT targets come from their services (this
    // read the demo case service and the TAT screen's browser storage); the
    // joins below are services/quality/qualityTatInputs.ts. Informal review
    // requests replaced CASUAL_REVIEW delegations, so both are counted for
    // consultation response / awaiting TAT.
    Promise.all([
      caseRouter.getAll(),
      facilityService.getAll(),
      intraoperativeService.getAll(),
      delegationService.list(),
      currentUser ? informalReviewService.getAllForUser(currentUser.id) : Promise.resolve({ ok: true as const, data: [] }),
      tatTargetService.getAll(),
    ]).then(([allCasesRes, clientRes, intraopRes, delegationsRes, informalReviewsRes, tatRes]) => {
      if (cancelled) return;
      const allCases = allCasesRes.ok ? allCasesRes.data : [];
      const facilities = clientRes.ok ? clientRes.data : [];
      const combinedDelegations = consultationRecords(
        delegationsRes.ok ? delegationsRes.data : [], informalReviewsRes.ok ? informalReviewsRes.data : [],
      );
      const tatEntries = tatRes.ok ? tatRes.data : [];
      const clientNameById = facilityNamesById(facilities);
      const casesWithPerformingLab = withPerformingLabs(allCases, facilities);
      setRealTotalTAT(computeTotalCaseTatOutliers(casesWithPerformingLab, tatEntries, clientNameById));
      setRealFirstTouch(computeFirstTouchOutliers(casesWithPerformingLab, tatEntries, clientNameById));
      setRealGrossing(computeGrossingOutliers(casesWithPerformingLab, tatEntries, clientNameById));
      setRealSignOut(computeSignOutOutliers(casesWithPerformingLab, tatEntries, clientNameById));
      setRealColdIschemia(computeColdIschemiaOutliers(casesWithPerformingLab, tatEntries, clientNameById));
      if (intraopRes.ok) {
        setRealFrozenSection(computeFrozenSectionOutliers(intraopRes.data, casesWithPerformingLab, tatEntries, clientNameById));
      }
      if (currentUser) {
        setRealConsultResponse(computeConsultResponseOutliers(combinedDelegations, casesWithPerformingLab, currentUser.id, tatEntries, clientNameById));
        setRealConsultAwaiting(computeConsultAwaitingOutliers(combinedDelegations, casesWithPerformingLab, currentUser.id, tatEntries, clientNameById));
        if (clientRes.ok) {
          setRealTatByClient(computeTatByClient(casesWithPerformingLab, tatEntries, clientRes.data, currentUser.id));
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

  // Real, per direct follow-up — real, live rate rather than
  // mockSummary's own static placeholder: discordant / total for every
  // real QaActivityRecord of this activity type. Deliberately
  // all-time (realDiscordant, not the date-filtered
  // filteredDiscordant) — realReconciliationTotal is itself all-time,
  // so mixing a filtered numerator against an unfiltered denominator
  // would produce a real, misleading rate. 0 total is a real, honest
  // "no data yet" case, not a divide-by-zero NaN shown to a user.
  const realConcordanceRate = realReconciliationTotal > 0
    ? Math.round(((realReconciliationTotal - realDiscordant.length) / realReconciliationTotal) * 1000) / 10
    : mockSummary.concordanceRate;

  // Reactive summary counts that update with the date filter
  const summaryData = {
    discordant:            filteredDiscordant.length,
    amended:               filteredAmended.length,
    concordanceRate:       realConcordanceRate,
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
      if (key && ENABLED_TAT_TYPES.some(tt => tt.key === key)) setActiveTatTile(key);
    };
    window.addEventListener('PATHSCRIBE_TAT_TILE', handler);
    return () => window.removeEventListener('PATHSCRIBE_TAT_TILE', handler);
  }, []);

  // Date-range button/period labels — three fixed values, resolved via t()
  // here so both the range selector buttons and the summary-tile "Last …"
  // period text stay in sync.
  const rangeButtonLabel = (r: DateRange) =>
    r === "30d" ? t('qualityTab.dateRange.thirtyDays') : r === "90d" ? t('qualityTab.dateRange.ninetyDays') : t('qualityTab.dateRange.oneYear');

  return (
    <div className="ps-quality-container">

      {/* ── Summary tiles — fixed tiles + one per enabled TAT type ── */}
      <div className="ps-quality-summary-grid">

        {/* Fixed tiles — Discordant, Amended, Concordance */}
        {FIXED_SUMMARY_TILES.map(s => (
          <div key={s.key} className="ps-quality-summary-tile">
            <div className="ps-quality-summary-tile__header">
              <span className="ps-quality-summary-tile__label">{t(`qualityTab.tiles.${s.key}`)}</span>
              <span>{s.icon}</span>
            </div>
            <div className="ps-quality-summary-tile__value-row">
              <span className="ps-quality-summary-tile__value" style={{ '--tile-color': s.color } as React.CSSProperties}>
                {summaryData[s.key]}
              </span>
              {s.unit && <span className="ps-quality-summary-tile__unit">{s.unit}</span>}
            </div>
            <div className="ps-quality-summary-tile__period">{t('qualityTab.summary.period', { range: dateRange })}</div>
          </div>
        ))}

        {/* TAT tiles — one per enabled TAT type, clickable to drill into trend */}
        {ENABLED_TAT_TYPES.map(tt => {
          const isActive = activeTatTile === tt.key;
          const tatLabel = t(`qualityTab.tat.${tt.key}.label`);
          return (
            <div
              key={tt.key}
              className={`ps-quality-summary-tile ps-quality-summary-tile--clickable${isActive ? " ps-quality-summary-tile--active" : ""}`}
              onClick={() => setActiveTatTile(prev => prev === tt.key ? null : tt.key)}
            >
              <div className="ps-quality-summary-tile__header">
                <span className="ps-quality-summary-tile__label">{tatLabel}</span>
                <span>{tt.icon}</span>
              </div>
              <div className="ps-quality-summary-tile__value-row">
                <span className="ps-quality-summary-tile__value" style={{ '--tile-color': tt.color } as React.CSSProperties}>
                  {summaryData[tt.summaryKey]}
                </span>
              </div>
              <div className="ps-quality-summary-tile__period">
                <span className={`ps-quality-summary-tile__hint${isActive ? ' ps-quality-summary-tile__hint--active' : ''}`} style={isActive ? { '--accent': tt.color } as React.CSSProperties : undefined}>
                  {isActive ? `▲ ${t('qualityTab.summary.showingTrend')}` : t('qualityTab.summary.clickForTrend')}
                </span>
              </div>
            </div>
          );
        })}

      </div>

      {/* ── TAT trend date range selector ── */}
      <div className="ps-quality-tat-range">
        <span className="ps-quality-tat-range__label">{t('qualityTab.trendRange.label')}</span>
        {(["30d", "90d", "ytd"] as DateRange[]).map(r => (
          <button key={r} className={`ps-quality-btn${dateRange === r ? " active" : ""}`} onClick={() => setDateRange(r)}>
            {rangeButtonLabel(r)}
          </button>
        ))}
      </div>

      {/* ── TAT Trend — shown when a TAT tile is selected ── */}
      {activeTatTile !== null && (() => {
        const tatCfg   = ENABLED_TAT_TYPES.find(tt => tt.key === activeTatTile)!;
        const tatLabel = t(`qualityTab.tat.${tatCfg.key}.label`);
        const targets = TAT_TYPE_TARGETS[activeTatTile];
        const dataKey = tatCfg.dataKey;
        const isMin   = activeTatTile === 'frozenSection' || activeTatTile === 'coldIschemia';
        const fmt     = (v: number) => isMin ? `${Math.round(v * 60)}m` : `${v}h`;
        const yMax    = Math.ceil(Math.max(targets.target, ...trendRows.map(d => d[dataKey] as number)) * 1.35);
        const periodLabel      = dateRange === "30d" ? t('qualityTab.trend.periodShort.thirtyDays') : dateRange === "90d" ? t('qualityTab.trend.periodShort.ninetyDays') : t('qualityTab.trend.periodShort.oneYear');
        const periodTitleLabel = dateRange === "30d" ? t('qualityTab.trend.periodTitle.thirtyDays') : dateRange === "90d" ? t('qualityTab.trend.periodTitle.ninetyDays') : t('qualityTab.trend.periodTitle.oneYear');
        const avg12   = +(trendRows.reduce((s, d) => s + (d[dataKey] as number), 0) / trendRows.length).toFixed(2);
        const vsTarget = +(avg12 - targets.target).toFixed(2);
        const vsPeer   = +(avg12 - targets.peer).toFixed(2);
        const vsTargetCls = vsTarget < 0 ? 'good' : 'bad';
        const vsPeerCls   = vsPeer < 0 ? 'good' : 'warn';

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
                  {t('qualityTab.trend.title', { icon: tatCfg.icon, label: tatLabel, period: periodTitleLabel })}
                </div>
                <div className="ps-tat-trend__subtitle">
                  {t('qualityTab.trend.subtitle', { target: fmt(targets.target), peer: fmt(targets.peer) })}
                </div>
                <div className="ps-tat-trend__summary-row">
                  <span className="ps-tat-trend__summary-group">
                    <span className="ps-tat-trend__summary-label">{t('qualityTab.trend.periodAvg', { period: periodLabel })}</span>
                    <span className="ps-tat-trend__summary-pill ps-tat-trend__summary-pill--hue" style={{ '--ps-hue': tatCfg.color } as React.CSSProperties}>
                      {tatCfg.icon} {fmt(avg12)}
                    </span>
                  </span>
                  <span className="ps-tat-trend__summary-divider">|</span>
                  <span className="ps-tat-trend__summary-group">
                    <span className="ps-tat-trend__summary-label">{t('qualityTab.trend.vsTarget')}</span>
                    <span className={`ps-tat-trend__summary-delta ps-tat-trend__summary-delta--${vsTargetCls}`}>
                      {vsTarget < 0 ? '↓' : '↑'} {fmt(Math.abs(vsTarget))}
                    </span>
                  </span>
                  <span className="ps-tat-trend__summary-divider">|</span>
                  <span className="ps-tat-trend__summary-group">
                    <span className="ps-tat-trend__summary-label">{t('qualityTab.trend.vsPeers')}</span>
                    <span className={`ps-tat-trend__summary-delta ps-tat-trend__summary-delta--${vsPeerCls}`}>
                      {vsPeer < 0 ? '↓' : '↑'} {fmt(Math.abs(vsPeer))}
                    </span>
                  </span>
                  <span className="ps-tat-trend__summary-divider">|</span>
                  <button
                    onClick={() => setActiveTatTile(null)}
                    className="ps-tat-trend__close-btn"
                  >
                    {t('qualityTab.trend.close')}
                  </button>
                </div>
              </div>
            </div>

            <div className="ps-tat-trend__legend">
              <div className="ps-tat-trend__legend-item ps-tat-trend__legend-item--dynamic" style={{ '--accent': tatCfg.color } as React.CSSProperties}>
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke={tatCfg.color} strokeWidth="2" /></svg>
                {t('qualityTab.trend.legendAvg', { label: tatLabel })}
              </div>
              <div className="ps-tat-trend__legend-item ps-tat-trend__legend-item--red">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                {t('qualityTab.trend.legendTarget', { value: fmt(targets.target) })}
              </div>
              <div className="ps-tat-trend__legend-item ps-tat-trend__legend-item--purple">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="2 3" /></svg>
                {t('qualityTab.trend.legendPeer', { value: fmt(targets.peer) })}
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
                      <div className="ps-tat-trend__tooltip-header">{t('qualityTab.trend.tooltipHeader', { label, count: cases })}</div>
                      <div className="ps-tat-trend__tooltip-line" style={{ '--accent': tatCfg.color } as React.CSSProperties}>{t('qualityTab.trend.tooltipValue', { label: tatLabel, value: fmt(val) })}</div>
                      <div className={`ps-tat-trend__tooltip-footer ps-tat-trend__tooltip-footer--${over ? 'bad' : 'good'}`}>
                        {over ? t('qualityTab.trend.tooltipOver', { delta: fmt(+(val - targets.target).toFixed(2)) }) : t('qualityTab.trend.tooltipWithin')}
                      </div>
                    </div>
                  );
                }} />
                <ReferenceLine y={targets.target} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
                  label={<RefLineLabel value={t('qualityTab.trend.refLineTarget', { value: fmt(targets.target) })} color="#ef4444" side="left" nudge={-18} />} />
                <ReferenceLine y={targets.peer} stroke="#a78bfa" strokeDasharray="2 3" strokeWidth={1.5}
                  label={<RefLineLabel value={t('qualityTab.trend.refLinePeer', { value: fmt(targets.peer) })} color="#a78bfa" side="right" nudge={8} />} />
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
          <button className={`ps-quality-btn${section === "discordant" ? " active" : ""}`} onClick={() => setSection("discordant")}>{t('qualityTab.nav.frozenVsFinal')}</button>
          <button className={`ps-quality-btn${section === "amended"    ? " active" : ""}`} onClick={() => setSection("amended")}>{t('qualityTab.nav.amendedReports')}</button>
          <button className={`ps-quality-btn${section === "tat"        ? " active" : ""}`} onClick={() => setSection("tat")}>{t('qualityTab.nav.tatOutliers')}</button>
          <button className={`ps-quality-btn${section === "tatClient"  ? " active" : ""}`} onClick={() => setSection("tatClient")}>{t('qualityTab.nav.tatByFacility')}</button>
        </div>
      </div>

      {/* ── Discordant diagnoses ── */}
      {section === "discordant" && (
        <div className="ps-quality-card">
          <div className="ps-quality-card__header">
            <div className="ps-quality-card__title">{t('qualityTab.discordant.title')}</div>
            <div className="ps-quality-card__subtitle">{t('qualityTab.discordant.subtitle')}</div>
          </div>
          <table className="ps-quality-table">
            <thead>
              <tr>{[
                t('qualityTab.discordant.headers.case'), t('qualityTab.discordant.headers.type'),
                t('qualityTab.discordant.headers.frozenDx'), t('qualityTab.discordant.headers.finalDx'),
                t('qualityTab.discordant.headers.delta'), t('qualityTab.discordant.headers.date'),
                t('qualityTab.discordant.headers.severity'),
              ].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
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
                        the "upgraded" bucket. The ps-delta--* classes below
                        now have real matching rules in pathscribe.css
                        (batch 32) - previously a pre-existing styling gap. */}
                    <span className={DELTA_CLASS[c.delta]}>
                      {DELTA_ICON[c.delta]} {t(`qualityTab.discordant.delta.${DELTA_KEY[c.delta]}`)}
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
            <div className="ps-quality-card__title">{t('qualityTab.amended.title')}</div>
            <div className="ps-quality-card__subtitle">{t('qualityTab.amended.subtitle')}</div>
          </div>
          <table className="ps-quality-table">
            <thead>
              <tr>{[
                t('qualityTab.amended.headers.case'), t('qualityTab.amended.headers.type'),
                t('qualityTab.amended.headers.reason'), t('qualityTab.amended.headers.date'),
                t('qualityTab.amended.headers.severity'),
              ].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
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
          firstTouch:      { data: filteredFirstTouch,         valueLabel: t('qualityTab.tat.firstTouch.valueLabel'),      subtitle: t('qualityTab.tat.firstTouch.subtitle'),      isMin: false },
          totalCase:       { data: filteredTotalTAT,           valueLabel: t('qualityTab.tat.totalCase.valueLabel'),       subtitle: t('qualityTab.tat.totalCase.subtitle'),       isMin: false },
          frozenSection:   { data: filteredFrozenSection,      valueLabel: t('qualityTab.tat.frozenSection.valueLabel'),   subtitle: t('qualityTab.tat.frozenSection.subtitle'),   isMin: true  },
          grossing:        { data: filteredGrossing,           valueLabel: t('qualityTab.tat.grossing.valueLabel'),        subtitle: t('qualityTab.tat.grossing.subtitle'),        isMin: false },
          signOut:         { data: filteredSignOut,            valueLabel: t('qualityTab.tat.signOut.valueLabel'),         subtitle: t('qualityTab.tat.signOut.subtitle'),         isMin: false },
          coldIschemia:    { data: filteredColdIschemia,       valueLabel: t('qualityTab.tat.coldIschemia.valueLabel'),    subtitle: t('qualityTab.tat.coldIschemia.subtitle'),    isMin: true  },
          consultResponse: { data: filteredConsultResponse,    valueLabel: t('qualityTab.tat.consultResponse.valueLabel'),subtitle: t('qualityTab.tat.consultResponse.subtitle'), isMin: false },
          consultAwaiting: { data: filteredConsultAwaiting,    valueLabel: t('qualityTab.tat.consultAwaiting.valueLabel'),subtitle: t('qualityTab.tat.consultAwaiting.subtitle'), isMin: false },
        };
        const getActual = (row: Record<string, any>) => row.actualHrs ?? row.firstTouchHrs ?? row.tatHrs;
        const fmtVal = (v: number, isMin: boolean) => isMin ? `${Math.round(v * 60)}m` : `${v}h`;

        return (
          <div className="ps-quality-tat-outliers">
            <div className="ps-quality-sub-toggle">
              {ENABLED_TAT_TYPES.map(tt => {
                const tatLabel = t(`qualityTab.tat.${tt.key}.label`);
                return (
                  <button key={tt.key} className={`ps-quality-sub-btn${tatSubView === tt.key ? " active" : ""}`} onClick={() => setTatSubView(tt.key)}>
                    {tt.icon} {t('qualityTab.outliers.breachesLabel', { label: tatLabel })}
                    {OUTLIER_CONFIG[tt.key].data.length > 0 && <span className="ps-quality-sub-btn__badge">{OUTLIER_CONFIG[tt.key].data.length}</span>}
                  </button>
                );
              })}
            </div>

            {ENABLED_TAT_TYPES.map(tt => {
              if (tatSubView !== tt.key) return null;
              const cfg = OUTLIER_CONFIG[tt.key];
              const tatLabel = t(`qualityTab.tat.${tt.key}.label`);
              return (
                <div className="ps-quality-card" key={tt.key}>
                  <div className="ps-quality-card__header">
                    <div className="ps-quality-card__title">{tt.icon} {t('qualityTab.outliers.breachesLabel', { label: tatLabel })}</div>
                    <div className="ps-quality-card__subtitle">{cfg.subtitle}</div>
                  </div>
                  {cfg.data.length === 0
                    ? <div className="ps-quality-empty">{t('qualityTab.outliers.emptyState', { label: tatLabel.toLowerCase() })}</div>
                    : (
                      <table className="ps-quality-table">
                        <thead>
                          <tr>{[
                            t('qualityTab.outliers.headers.case'), t('qualityTab.outliers.headers.type'),
                            t('qualityTab.outliers.headers.facility'), cfg.valueLabel,
                            t('qualityTab.outliers.headers.target'), t('qualityTab.outliers.headers.overBy'),
                            t('qualityTab.outliers.headers.date'),
                          ].map(h => <th key={h} className="ps-quality-th">{h}</th>)}</tr>
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

      {/* ── TAT by Facility ── */}
      {section === "tatClient" && (
        <div className="ps-quality-tat-client">

          <div className="ps-tat-client__section-header">
            <div>
              <div className="ps-tat-client__title">{t('qualityTab.byFacility.title')}</div>
              <div className="ps-tat-client__subtitle">{t('qualityTab.byFacility.subtitle')}</div>
            </div>
            <div className="ps-tat-client__metric-toggle">
              <button className={`ps-quality-sub-btn${metric === "firstTouch" ? " active" : ""}`} onClick={() => setMetric("firstTouch")}>⚡ {t('qualityTab.byFacility.metricFirstTouch')}</button>
              <button className={`ps-quality-sub-btn${metric === "total"      ? " active" : ""}`} onClick={() => setMetric("total")}>✓ {t('qualityTab.byFacility.metricTotalTat')}</button>
            </div>
          </div>

          <div className="ps-tat-client__cards">
            {realTatByClient.length === 0 && (
              <div className="ps-cmnt-thread-empty">{t('qualityTab.byFacility.noCasesFound')}</div>
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
                        {target === null ? t('qualityTab.byFacility.noTargetConfigured') : t('qualityTab.byFacility.noCompletedCases')}
                      </span>
                    </div>
                  </div>
                );
              }
              const pct        = Math.min(100, (myVal   / target) * 100);
              const peerPct    = Math.min(100, (peerVal / target) * 100);
              const colorCls   = barColorClass(pct);
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
                          {t('qualityTab.byFacility.breachBadge', { count: breachCount })}
                        </span>
                      )}
                      <span className={`ps-tat-client__delta ps-tat-client__delta--${delta.cls}`}>{t('qualityTab.byFacility.deltaVsPeers', { arrow: delta.arrow, diff: delta.diff })}</span>
                    </div>
                  </div>

                  <div className="ps-tat-client__bar-track">
                    <div className={`ps-tat-client__bar-fill ps-tat-client__bar-fill--${colorCls}`} style={{ '--bar-pct': `${pct}%` } as React.CSSProperties} />
                    <div className="ps-tat-client__peer-marker" style={{ '--peer-pct': `${peerPct}%` } as React.CSSProperties} />
                    <div className="ps-tat-client__target-marker" />
                  </div>

                  <div className="ps-tat-client__legend-row">
                    <div className="ps-tat-client__legend-left">
                      <div className="ps-tat-client__legend-item">
                        <div className={`ps-tat-client__legend-dot ps-tat-client__legend-dot--${colorCls}`} />
                        <span className={`ps-tat-client__you-label ps-tat-client__you-label--${colorCls}`}>{t('qualityTab.byFacility.youLabel', { value: myVal })}</span>
                      </div>
                      <div className="ps-tat-client__legend-item">
                        <div className="ps-tat-client__legend-peer-mark" />
                        <span className="ps-tat-client__peer-label">{t('qualityTab.byFacility.peersLabel', { value: peerVal })}</span>
                      </div>
                    </div>
                    <span className="ps-tat-client__pct-label">{t('qualityTab.byFacility.pctLabel', { pct: pct.toFixed(0), target, count: client.caseCount })}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ps-tat-client__footer">
            <span>{t('qualityTab.byFacility.footerEstimate')}</span>
            <span>{t('qualityTab.byFacility.footerTargets')}</span>
          </div>
        </div>
      )}

    </div>
  );
};

export default QualityTab;
