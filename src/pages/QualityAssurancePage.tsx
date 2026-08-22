// src/pages/QualityAssurancePage.tsx
// ─────────────────────────────────────────────────────────────
// Renamed from DeficienciesPage.tsx per direct follow-up: "I think
// we should rename the deficiencies to QualityAssurance." The
// user-facing name was already "Quality Assurance" everywhere that
// mattered (the Home tile's title, the breadcrumb) — only the file
// name, component name, and route string had never caught up. The
// underlying specimen-deficiency domain terminology itself
// (SpecimenDeficiency, specimenDeficiencyService, DeficiencyType,
// etc.) is untouched — that's a real, narrower, genuinely correct
// term for the specific concept it names, and is only one of several
// real things this broader page now covers (Intraoperative Linkage,
// Discordance & Reconciliation, Countersign Turnaround, Access
// Request Response, FPPE Tracking — see the imports below, which
// already used the QualityAssurance/ component folder name).
// ─────────────────────────────────────────────────────────────
// A dedicated, independent nonconformance-management work queue —
// built this way specifically because it's the industry-standard
// architecture, not a design preference. ISO 15189:2022 Clause 7.5
// ("Nonconforming Work") requires labs to have a documented process to
// identify, assess, act on, and retain records of a nonconformity;
// Clause 8.7 requires a full CAPA cycle including an effectiveness
// check later — genuinely coming back and confirming a corrective
// action worked, not just marking something done and moving on. Real
// laboratory Quality Management Systems implement this as its own
// dedicated module, separate from (but integrated with) audit
// management — a nonconformance's resolution lifecycle is independent
// of whatever clinical workflow raised it, which is why this isn't a
// modal hanging off Synoptic Report or a Search filter.
//
// Three real, permanent stages — Open, Pending Verification, Closed —
// not a simple open/closed flag. Nothing here is ever deleted; Clause
// 7.5's "retain records" requirement means every stage stays visible.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import '../pathscribe.css';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import {
  specimenDeficiencyService, deficiencyTypeService, resolutionTypeService, managementReviewService,
} from '@/services';
import type {
  SpecimenDeficiency, DeficiencyType, ResolutionType, ManagementReview,
} from '@/services/deficiencies/IDeficiencyService';
import { ManagementReviewModal } from './modals/ManagementReviewModal';
import { IntraopLinkageTab } from '@/components/QualityAssurance/IntraopLinkageTab';
import { ReconciliationTab } from '@/components/QualityAssurance/ReconciliationTab';
import { CountersignTurnaroundTab } from '@/components/QualityAssurance/CountersignTurnaroundTab';
import { AccessRequestResponseTab } from '@/components/QualityAssurance/AccessRequestResponseTab';
import { FppeTrackingTab } from '@/components/QualityAssurance/FppeTrackingTab';
import { DriftCorrectionTab } from '@/components/QualityAssurance/DriftCorrectionTab';
import { PatientMatchReviewSection } from '@/components/QualityAssurance/PatientMatchReviewSection';
import { exportQaReportRows } from '@/components/QualityAssurance/qaReportUtils';

type Tab = 'case-specimen' | 'closed' | 'reviews' | 'intraop-linkage' | 'discordance' | 'countersign' | 'fppe' | 'drift-correction' | 'patient-match-review' | 'access-requests';

const formatTimestamp = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};
const formatDateOnly = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }); }
  catch { return iso; }
};
const isOverdue = (iso?: string) => !!iso && new Date(iso).getTime() < Date.now();

// ── Resolve modal — moves Open → Pending Verification ───────────────────────

const ResolveModal: React.FC<{
  deficiency: SpecimenDeficiency;
  resolutionTypes: ResolutionType[];
  onResolve: (resolutionTypeId: string, correctiveAction: string, preventiveAction: string, verificationDueDate: string) => void;
  onClose: () => void;
}> = ({ deficiency, resolutionTypes, onResolve, onClose }) => {
  const [resolutionTypeId, setResolutionTypeId] = useState(resolutionTypes[0]?.id ?? '');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [preventiveAction, setPreventiveAction] = useState('');
  const defaultDue = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [verificationDueDate, setVerificationDueDate] = useState(defaultDue);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Corrective Action</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {deficiency.specimenLabel ? `Specimen ${deficiency.specimenLabel}, ` : ''}case {deficiency.caseId} — {deficiency.comment || 'no additional detail recorded'}
          </p>
          <p className="ps-fixgate-intro">
            This moves to <strong>Pending Verification</strong>, not Closed — someone still needs to come back and
            confirm the corrective action actually worked.
          </p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="resolve-resolution-type">Resolution Type <span className="ps-conf-required">*</span></label>
            <select id="resolve-resolution-type" className="ps-conf-select" value={resolutionTypeId} onChange={e => setResolutionTypeId(e.target.value)}>
              {resolutionTypes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="resolve-corrective-action">Corrective Action <span className="ps-conf-required">*</span></label>
            <textarea id="resolve-corrective-action" className="ps-conf-input ps-conf-textarea" value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)}
              placeholder="What was actually done to fix this specific occurrence?" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="resolve-preventive-action">Preventive Action (optional)</label>
            <textarea id="resolve-preventive-action" className="ps-conf-input ps-conf-textarea" value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)}
              placeholder="What stops this from recurring, beyond just fixing this one instance?" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="resolve-verification-due">Effectiveness Check Due</label>
            <input id="resolve-verification-due" className="ps-conf-input" type="date" value={verificationDueDate} onChange={e => setVerificationDueDate(e.target.value)} />
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary"
            onClick={() => onResolve(resolutionTypeId, correctiveAction, preventiveAction, new Date(verificationDueDate).toISOString())}
            disabled={!resolutionTypeId || !correctiveAction.trim()}>
            Move to Pending Verification
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Verify modal — moves Pending Verification → Closed, or back to Open ─────

const VerifyModal: React.FC<{
  deficiency: SpecimenDeficiency;
  onVerify: (outcome: 'effective' | 'recurred', comment: string) => void;
  onClose: () => void;
}> = ({ deficiency, onVerify, onClose }) => {
  const [comment, setComment] = useState('');

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Effectiveness Check</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {deficiency.specimenLabel ? `Specimen ${deficiency.specimenLabel}, ` : ''}case {deficiency.caseId}
          </p>
          <div className="ps-defichist-item">
            <div className="ps-defichist-row"><span className="ps-defic-label">Corrective action taken:</span> {deficiency.correctiveAction}</div>
            {deficiency.preventiveAction && (
              <div className="ps-defichist-row"><span className="ps-defic-label">Preventive action:</span> {deficiency.preventiveAction}</div>
            )}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="verify-comment">Did the corrective action actually work? <span className="ps-conf-required">*</span></label>
            <textarea id="verify-comment" className="ps-conf-input ps-conf-textarea" value={comment} onChange={e => setComment(e.target.value)}
              placeholder="What did you check, and what did you find?" />
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-secondary" onClick={() => onVerify('recurred', comment)} disabled={!comment.trim()}>
            Recurred — Reopen
          </button>
          <button className="ps-conf-btn-primary" onClick={() => onVerify('effective', comment)} disabled={!comment.trim()}>
            Effective — Close
          </button>
        </div>
      </div>
    </div>
  );
};

const QualityAssurancePage: React.FC = () => {
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb('Quality Assurance', '/quality-assurance'); }, [pushCrumb]);
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('case-specimen');
  const [deficiencies, setDeficiencies] = useState<SpecimenDeficiency[]>([]);
  const [deficiencyTypes, setDeficiencyTypes] = useState<DeficiencyType[]>([]);
  const [resolutionTypes, setResolutionTypes] = useState<ResolutionType[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [managementReviews, setManagementReviews] = useState<ManagementReview[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  // Deep-link support (?open=<deficiencyId>) — a real gap found while
  // tracing whether Contribution Dashboard's "My Quality Flags" widget
  // actually closes the loop on a flagged deficiency. It didn't: it
  // linked to the case's own synoptic report page, which has no
  // resolve/verify UI at all (that only exists here). Landing on the
  // right tab with the actual record visible, rather than just the
  // general queue, is what makes clicking the flag genuinely useful
  // rather than a dead end the user has to manually work around.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const loadAll = () => {
    specimenDeficiencyService.getAll().then(res => { if (res.ok) setDeficiencies(res.data); });
    managementReviewService.getAll().then(res => { if (res.ok) setManagementReviews(res.data); });
  };
  useEffect(() => {
    loadAll();
    deficiencyTypeService.getAll().then(res => { if (res.ok) setDeficiencyTypes(res.data); });
    resolutionTypeService.getAll().then(res => { if (res.ok) setResolutionTypes(res.data); });
  }, []);

  useEffect(() => {
    if (deficiencies.length === 0) return;
    const openId = new URLSearchParams(window.location.search).get('open');
    if (!openId) return;
    const target = deficiencies.find(d => d.id === openId);
    if (!target) return; // stale/invalid link — no record silently shown, no crash either
    setTab(target.status === 'closed' ? 'closed' : 'case-specimen');
    setHighlightId(target.id);
    // Scroll the row into view once the right tab has rendered it.
    setTimeout(() => {
      document.getElementById(`deficiency-row-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    // Clean the query param so refreshing/sharing the URL later doesn't
    // keep re-triggering the highlight on an item the user may have
    // already resolved.
    window.history.replaceState(null, '', window.location.pathname);
    const clearHighlight = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(clearHighlight);
  }, [deficiencies]);

  const typeName = (id: string) => deficiencyTypes.find(t => t.id === id)?.name ?? id;
  const resolutionName = (id?: string) => id ? (resolutionTypes.find(t => t.id === id)?.name ?? id) : '—';

  // Exports "just the working rows" — whatever's actually visible in
  // that tab right now, not the complete historical record (that's
  // System Logs' "Quality Assurance" tab's job — see AuditLogPage.tsx).
  // Same shared exportQaReportRows utility the other 5 QA report tabs
  // already use, for consistency, not a separate one-off CSV path.
  const exportActiveQueue = () => {
    const rows = activeItems.map(d => ({
      'Case': d.caseId,
      'Specimen': d.specimenLabel ?? 'Case-level',
      'Status': d.status === 'open' ? 'Open' : 'Pending Verification',
      'Issue Type': typeName(d.deficiencyTypeId),
      'Detail': d.status === 'open' ? (d.comment ?? '') : (d.correctiveAction ?? ''),
      'Raised': d.raisedAt,
      'Verification Due': d.verificationDueDate ?? '',
      'Reopen Count': d.reopenCount ?? 0,
    }));
    exportQaReportRows(rows, `quality-assurance-active-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportClosed = () => {
    const rows = filtered.map(d => ({
      'Case': d.caseId,
      'Specimen': d.specimenLabel ?? 'Case-level',
      'Issue Type': typeName(d.deficiencyTypeId),
      'Resolution': resolutionName(d.resolutionTypeId),
      'Verified': d.verifiedBy ? `${d.verifiedBy} @ ${d.verifiedAt ?? ''}` : 'instant fix, not verified',
      'Closed': d.resolvedAt ?? '',
      'Reopen Count': d.reopenCount ?? 0,
      'Management Review': d.managementReviewId ?? 'not yet reviewed',
    }));
    exportQaReportRows(rows, `quality-assurance-closed-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportManagementReviews = () => {
    const rows = [...managementReviews].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).map(r => ({
      'Reviewed': r.reviewedAt,
      'Reviewed By': r.reviewedBy,
      'Items in Scope': r.deficiencyIds.length,
      'Findings': r.findings,
    }));
    exportQaReportRows(rows, `quality-assurance-management-reviews-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 'closed' stays its own simple status filter, sorted by when raised
  // (matches its prior behavior — a closed-items archive reads
  // naturally most-recent-first, unlike the active queue below).
  const filtered = useMemo(
    () => deficiencies.filter(d => d.status === tab).sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)),
    [deficiencies, tab]
  );
  // The combined Case-Specimen Deficiency tab — open and
  // pending-verification together (still separate, real statuses;
  // this just stops splitting them across two different tabs), grouped
  // by level and sorted by accession/case number within each group,
  // per how Pete actually wants to scan this list — case-level issues
  // together, specimen-level issues together, ordered the same way the
  // rest of the app orders cases.
  const activeItems = useMemo(
    () => deficiencies.filter(d => d.status === 'open' || d.status === 'pending-verification'),
    [deficiencies]
  );
  const caseLevelActive = useMemo(
    () => activeItems.filter(d => !d.specimenId).sort((a, b) => a.caseId.localeCompare(b.caseId)),
    [activeItems]
  );
  const specimenLevelActive = useMemo(
    () => activeItems.filter(d => !!d.specimenId).sort((a, b) => a.caseId.localeCompare(b.caseId)),
    [activeItems]
  );
  const openCount = deficiencies.filter(d => d.status === 'open').length;
  const pendingCount = deficiencies.filter(d => d.status === 'pending-verification').length;
  const closedCount = deficiencies.filter(d => d.status === 'closed').length;
  const overdueCount = deficiencies.filter(d => d.status === 'pending-verification' && isOverdue(d.verificationDueDate)).length;
  const unreviewedClosed = useMemo(
    () => deficiencies.filter(d => d.status === 'closed' && !d.managementReviewId),
    [deficiencies]
  );

  // Trend: deficiencies closed per month, last 6 months — the actual
  // point of doing a Management Review as a batch rather than per-item
  // is spotting a pattern like this, not re-litigating each record.
  const trendData = useMemo(() => {
    const months: { month: string; closed: number; reopened: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const closedThisMonth = deficiencies.filter(x => {
        if (!x.resolvedAt) return false;
        const t = new Date(x.resolvedAt).getTime();
        return t >= monthStart && t < monthEnd && x.status === 'closed';
      });
      months.push({
        month: monthKey,
        closed: closedThisMonth.length,
        reopened: closedThisMonth.filter(x => (x.reopenCount ?? 0) > 0).length,
      });
    }
    return months;
  }, [deficiencies]);

  const resolvingItem = deficiencies.find(d => d.id === resolvingId) ?? null;
  const verifyingItem = deficiencies.find(d => d.id === verifyingId) ?? null;

  const handleResolve = (resolutionTypeId: string, correctiveAction: string, preventiveAction: string, verificationDueDate: string) => {
    if (!resolvingId) return;
    specimenDeficiencyService.resolve(resolvingId, {
      resolutionTypeId, correctiveAction, preventiveAction: preventiveAction || undefined,
      resolvedBy: user?.id ?? 'unknown', verificationDueDate,
    }).then(() => { setResolvingId(null); loadAll(); });
  };

  const handleVerify = (outcome: 'effective' | 'recurred', comment: string) => {
    if (!verifyingId) return;
    specimenDeficiencyService.verifyEffectiveness(verifyingId, {
      outcome, comment, verifiedBy: user?.id ?? 'unknown',
    }).then(() => { setVerifyingId(null); loadAll(); });
  };

  const handleSubmitReview = (deficiencyIds: string[], findings: string) => {
    managementReviewService.create({
      reviewedBy: user?.id ?? 'unknown', deficiencyIds, findings,
    }).then(() => { setShowReviewModal(false); loadAll(); });
  };

  const columnsFor = (t: Tab) => {
    if (t === 'case-specimen') return ['Status', 'Case', 'Specimen', 'Issue', 'Detail', 'When', 'Actions'];
    return ['Case', 'Specimen', 'Issue', 'Resolution', 'Verified', 'Closed'];
  };

  return (
    <div className="ps-defic-page">
      <div className="ps-defic-scroll">
      <div className="ps-defic-inner">
      <div className="ps-defic-page-header">
        <h1 className="ps-defic-page-title">✓ Quality Assurance</h1>
        <p className="ps-defic-page-subtitle">
          Nonconformance tracking (Deficiencies), independent of case status — a corrective action doesn't close
          this out by itself, it moves to Pending Verification until someone actually confirms it worked — plus
          department-wide Intraoperative Linkage and Discordance & Reconciliation reporting.
        </p>
      </div>

      {/* Trend — closed per month, last 6 months. The actual point of a
          batch Management Review is spotting a pattern like this.
          Explicitly gated to the tabs this chart is actually about —
          previously rendered unconditionally regardless of which tab was
          active, so viewing Intraoperative Linkage or Discordance &
          Reconciliation still showed the deficiency-closure trend, which
          has nothing to do with either. Same explicit-enumeration
          pattern used below for the table/reviews block, rather than a
          negative check, so a future new tab can't silently fall through
          into this again. */}
      {(tab === 'case-specimen' || tab === 'closed' || tab === 'reviews') && (
        <div className="ps-defic-trend-card">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={({ active, payload, label }: TooltipContentProps<number, string>) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="ps-tat-trend__tooltip">
                    <div className="ps-tat-trend__tooltip-header">{label}</div>
                    <div className="ps-defic-trend-tooltip-closed">Closed: {payload[0]?.payload?.closed ?? 0}</div>
                    <div className="ps-defic-trend-tooltip-reopened">Reopened at least once: {payload[0]?.payload?.reopened ?? 0}</div>
                  </div>
                );
              }} />
              <Line type="monotone" dataKey="closed" stroke="#0891B2" strokeWidth={2.5} dot={{ r: 3, fill: '#0891B2', strokeWidth: 0 }} />
              <Line type="monotone" dataKey="reopened" stroke="#f87171" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2, fill: '#f87171', strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Real fix, per direct follow-up: "I don't like the scroll
          bars can we use tile like worklist and stack them?" Reuses
          .ps-wl-filter-tile directly — the same real, established
          tile Worklist's own status filters and Batch Management's
          own stage tiles already use (BatchManagementPage.tsx:
          "Same real ps-wl-filter-tile pattern Worklist's own status
          tiles already use... reused directly, not re-styled from
          scratch") — never a third, competing tile style. Colors
          reuse Worklist's own established per-status palette
          (urgent=red, completed=green, informalreview=violet, etc.)
          for the same semantic weight, not picked freshly. flex-wrap
          on the container (.ps-qa-tab-tiles) is the real fix itself —
          tiles stack onto additional rows instead of requiring
          horizontal scrolling once they don't all fit on one line. */}
      <div className="ps-qa-tab-tiles">
        {([
          { key: 'case-specimen', label: '⚠️ Deficiencies', count: openCount + pendingCount, color: '#EF4444', sublabel: overdueCount > 0 ? `${overdueCount} overdue` : undefined },
          { key: 'closed', label: '✓ Closed', count: closedCount, color: '#10B981', sublabel: undefined },
          { key: 'reviews', label: '📋 Mgmt Reviews', count: managementReviews.length, color: '#536EEA', sublabel: undefined },
          { key: 'intraop-linkage', label: '🔬 Frozen Linkage', count: undefined, color: '#0891B2', sublabel: undefined },
          { key: 'discordance', label: '⚖️ Discordance', count: undefined, color: '#8B5CF6', sublabel: undefined },
          { key: 'countersign', label: '✍️ Countersign Turnaround', count: undefined, color: '#f59e0b', sublabel: undefined },
          { key: 'fppe', label: '📜 Credentialing Review', count: undefined, color: '#261CE3', sublabel: undefined },
          { key: 'drift-correction', label: '🔄 Post-Final Drift', count: undefined, color: '#EC4899', sublabel: undefined },
          { key: 'patient-match-review', label: '🪪 Patient Match Review', count: undefined, color: '#53E2EA', sublabel: undefined },
          { key: 'access-requests', label: '🔑 Access Requests', count: undefined, color: '#94a3b8', sublabel: undefined },
        ] as const).map(t => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              className="ps-wl-filter-tile"
              title={isActive ? `Showing: ${t.label} — click to switch` : `View: ${t.label}`}
              onClick={() => setTab(t.key as typeof tab)}
              style={{
                '--tile-bg': isActive ? `${t.color}2e` : `${t.color}0d`,
                '--tile-border': isActive ? t.color : `${t.color}2e`,
                '--tile-shadow': isActive ? `0 0 12px ${t.color}66` : 'none',
              } as React.CSSProperties}
            >
              <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': isActive ? t.color : '#8899aa' } as React.CSSProperties}>
                {t.label}
              </div>
              <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': t.color } as React.CSSProperties}>
                {t.count ?? '\u00A0'}
              </div>
              <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': t.color, '--tile-sublabel-opacity': t.sublabel ? 0.75 : 0 } as React.CSSProperties}>
                {t.sublabel || '\u00A0'}
              </div>
            </button>
          );
        })}
      </div>

      {tab === 'intraop-linkage' && <IntraopLinkageTab />}
      {tab === 'discordance' && <ReconciliationTab />}
      {tab === 'countersign' && <CountersignTurnaroundTab />}
      {tab === 'fppe' && <FppeTrackingTab />}
      {tab === 'drift-correction' && <DriftCorrectionTab />}
      {tab === 'patient-match-review' && <PatientMatchReviewSection />}
      {tab === 'access-requests' && <AccessRequestResponseTab />}

      {tab === 'closed' && (
        <div className="ps-defic-review-banner">
          <span>{unreviewedClosed.length} closed item{unreviewedClosed.length === 1 ? '' : 's'} not yet covered by a Management Review.</span>
          <button className="ps-conf-btn-primary" onClick={() => setShowReviewModal(true)} disabled={unreviewedClosed.length === 0}>
            Start Management Review
          </button>
        </div>
      )}

      {(tab === 'case-specimen' || tab === 'closed') && (
        <div className="ps-qa-tab-toolbar">
          <button className="ps-conf-btn-secondary" onClick={tab === 'case-specimen' ? exportActiveQueue : exportClosed}>Export</button>
        </div>
      )}

      {(tab === 'case-specimen' || tab === 'closed') ? (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>{columnsFor(tab).map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {tab === 'case-specimen' && (() => {
                  // Shared row renderer — status (open vs pending-
                  // verification) now varies per row within one table,
                  // not per tab, since both statuses live here together.
                  const renderActiveRow = (d: SpecimenDeficiency) => (
                    <tr key={d.id} id={`deficiency-row-${d.id}`} className={`ps-conf-tr${d.id === highlightId ? ' ps-conf-tr--highlight' : ''}`}>
                      <td className="ps-conf-td">
                        <div className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${d.status === 'open' ? 'ps-conf-status-dot--open' : 'ps-conf-status-dot--pending'}`} />
                          <span className={`ps-conf-status-text ${d.status === 'open' ? 'ps-conf-status-text--open' : 'ps-conf-status-text--pending'}`}>
                            {d.status === 'open' ? 'Open' : 'Pending Verification'}
                          </span>
                        </div>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => navigate(`/case/${d.caseId}/synoptic`)}>{d.caseId}</button>
                      </td>
                      <td className="ps-conf-td">
                        {d.specimenLabel ? `Specimen ${d.specimenLabel}` : <em className="ps-defic-caselevel">Case-level</em>}
                      </td>
                      <td className="ps-conf-td">
                        {typeName(d.deficiencyTypeId)}
                        {!!d.reopenCount && <span className="ps-defic-reopen-badge" title="Reopened after a failed effectiveness check">↺ {d.reopenCount}</span>}
                      </td>
                      <td className="ps-conf-td">
                        <div className="ps-specreq-meta">{d.status === 'open' ? (d.comment || '—') : (d.correctiveAction || '—')}</div>
                      </td>
                      <td className="ps-conf-td">
                        {d.status === 'open'
                          ? <>{d.raisedBy === 'system' ? 'System' : d.raisedBy} · {formatTimestamp(d.raisedAt)}</>
                          : <span className={isOverdue(d.verificationDueDate) ? 'ps-defic-overdue' : ''}>Due {formatDateOnly(d.verificationDueDate)}</span>}
                      </td>
                      <td className="ps-conf-td">
                        {d.status === 'open'
                          ? <button className="ps-conf-btn-primary" onClick={() => setResolvingId(d.id)}>Take Corrective Action</button>
                          : <button className="ps-conf-btn-primary" onClick={() => setVerifyingId(d.id)}>Verify Effectiveness</button>}
                      </td>
                    </tr>
                  );
                  return (
                    <>
                      <tr className="ps-defic-group-header"><td colSpan={7}>Case-Level ({caseLevelActive.length})</td></tr>
                      {caseLevelActive.length > 0
                        ? caseLevelActive.map(renderActiveRow)
                        : <tr><td className="ps-conf-empty-row" colSpan={7}>No open case-level deficiencies.</td></tr>}
                      <tr className="ps-defic-group-header"><td colSpan={7}>Specimen-Level ({specimenLevelActive.length})</td></tr>
                      {specimenLevelActive.length > 0
                        ? specimenLevelActive.map(renderActiveRow)
                        : <tr><td className="ps-conf-empty-row" colSpan={7}>No open specimen-level deficiencies.</td></tr>}
                    </>
                  );
                })()}
                {tab === 'closed' && filtered.map(d => (
                  <tr key={d.id} id={`deficiency-row-${d.id}`} className={`ps-conf-tr${d.id === highlightId ? ' ps-conf-tr--highlight' : ''}`}>
                    <td className="ps-conf-td">
                      <button className="ps-conf-btn-row" onClick={() => navigate(`/case/${d.caseId}/synoptic`)}>{d.caseId}</button>
                    </td>
                    <td className="ps-conf-td">
                      {d.specimenLabel ? `Specimen ${d.specimenLabel}` : <em className="ps-defic-caselevel">Case-level</em>}
                    </td>
                    <td className="ps-conf-td">
                      {typeName(d.deficiencyTypeId)}
                      {!!d.reopenCount && <span className="ps-defic-reopen-badge" title="Reopened after a failed effectiveness check">↺ {d.reopenCount}</span>}
                    </td>
                    <td className="ps-conf-td">{resolutionName(d.resolutionTypeId)}</td>
                    <td className="ps-conf-td">{d.verifiedBy ? `${d.verifiedBy} · ${formatTimestamp(d.verifiedAt)}` : <em className="ps-defic-caselevel">instant fix, not verified</em>}</td>
                    <td className="ps-conf-td">{formatTimestamp(d.resolvedAt)}</td>
                  </tr>
                ))}
                {tab === 'closed' && filtered.length === 0 && (
                  <tr><td className="ps-conf-empty-row" colSpan={6}>No closed deficiencies yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'reviews' ? (
        <div className="ps-qa-tab-toolbar">
          <button className="ps-conf-btn-secondary" onClick={exportManagementReviews}>Export</button>
        </div>
      ) : null}
      {tab === 'reviews' && (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>{['Reviewed', 'Reviewed By', 'Items in Scope', 'Findings'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {[...managementReviews].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).map(r => (
                  <tr key={r.id} className="ps-conf-tr">
                    <td className="ps-conf-td">{formatTimestamp(r.reviewedAt)}</td>
                    <td className="ps-conf-td">{r.reviewedBy}</td>
                    <td className="ps-conf-td">{r.deficiencyIds.length}</td>
                    <td className="ps-conf-td"><div className="ps-specreq-meta">{r.findings}</div></td>
                  </tr>
                ))}
                {managementReviews.length === 0 && (
                  <tr><td className="ps-conf-empty-row" colSpan={4}>No management reviews recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resolvingItem && (
        <ResolveModal deficiency={resolvingItem} resolutionTypes={resolutionTypes} onResolve={handleResolve} onClose={() => setResolvingId(null)} />
      )}
      {verifyingItem && (
        <VerifyModal deficiency={verifyingItem} onVerify={handleVerify} onClose={() => setVerifyingId(null)} />
      )}
      {showReviewModal && (
        <ManagementReviewModal
          unreviewedClosed={unreviewedClosed}
          deficiencyTypes={deficiencyTypes}
          onSubmit={handleSubmitReview}
          onClose={() => setShowReviewModal(false)}
        />
      )}
      </div>
      </div>
    </div>
  );
};

export default QualityAssurancePage;
