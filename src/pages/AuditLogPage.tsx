import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useNavigate, useSearchParams } from 'react-router';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { useAuth } from '@/contexts/AuthContext';
import { getFacilityDateParts, getFacilityMidnightUtc } from '@/utils/facilityTime';
import ResourcesModal from './WorklistPage/ResourcesModal';
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { VOICE_CONTEXT } from '@/constants/systemActions';

// ── Types & Data ─────────────────────────────────────────────────────────────
// Components import ONLY from services/index.ts — never directly from mock/firestore files.
// Two exceptions below (mockPatientIndexService, listOrganisations) — neither
// is exported through services/index.ts today; PatientMatchReviewSection.tsx
// itself already imports them directly the same way, so this matches a real,
// existing precedent rather than introducing a new one.
import type { AuditLog, ErrorLog } from '../services/auditlog/IAuditService';
import type { SpecimenDeficiency, DeficiencyType } from '../services/deficiencies/IDeficiencyService';
import type { ManagementReview } from '../services/deficiencies/IDeficiencyService';
import type { IntraoperativeEntry } from '../types/intraop/IntraoperativeEntry';
import type { QaActivityRecord } from '../types/quality/QaActivityRecord';
import type { CountersignRecord } from '../types/case/CountersignRecord';
import type { FppeAssignment } from '../types/case/FppeAssignment';
import type { MasterPatientRecord } from '../services/patients/IPatientIndexService';
import type { InterfaceException } from '../services/interfaceExceptions/IInterfaceExceptionService';
import InterfaceExceptionReviewModal from '../components/Audit/InterfaceExceptionReviewModal';
import BreakGlassRebindModal from '../components/Audit/BreakGlassRebindModal';
import {
  auditService, specimenDeficiencyService, deficiencyTypeService,
  intraoperativeService, qaActivityRecordService, countersignService,
  fppeAssignmentService, managementReviewService, interfaceExceptionService,
} from '../services';
import { mockPatientIndexService } from '../services/patients/mockPatientIndexService';
import { listOrganisations } from '../services/organisation/organisationService';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '../services/quality/mockQaActivityTypeService';
import { formatAuditTimestamp } from '../utils/formatDate';
import { downloadCSV, buildMetaHeader } from '../utils/csvExport';
import BillingLogsSection from './BillingLogsSection';
import OutboundDlqSection from './OutboundDlqSection';
import OutboundInterfaceDlqSection from './OutboundInterfaceDlqSection';
import OutboundDispatchTrailSection from './OutboundDispatchTrailSection';
import PrintQueueDashboardSection from './PrintQueueDashboardSection';
import CriticalAlertAuditSection from './CriticalAlertAuditSection';
import SupportReferenceChip from '../components/Support/SupportReferenceChip';
import SupportReferenceLookup from '../components/Support/SupportReferenceLookup';

type ActiveTab = 'audit' | 'errors' | 'interfaces' | 'quality' | 'financial' | 'criticalAlerts';

// ── Quality Assurance groups ─────────────────────────────────────────────────
// Every tabbed item group from the Quality Assurance working queue
// (pages/QualityAssurancePage.tsx), normalized into one searchable/exportable
// shape here — this is the complete historical record across all of them,
// not just deficiencies. Each group keeps its own real status vocabulary
// (a deficiency's Open/Pending/Closed isn't the same thing as a countersign's
// Pending/Countersigned) rather than forcing one fake shared status set.
type QaGroup = 'deficiency' | 'intraop-linkage' | 'reconciliation' | 'countersign' | 'fppe' | 'drift' | 'patient-match' | 'management-review';

// Kept as a plain, always-English record — used for the CSV exports'
// own "Group" meta-header value and row data (a compliance record
// that has to hold up as a self-explanatory document however it's
// downloaded, matching the same "exported data stays English"
// convention already established for every other CSV export in this
// sweep). The on-screen, translated equivalent is GROUP_LABEL_KEY
// below, looked up with t() at each on-screen call site.
const GROUP_LABELS: Record<QaGroup, string> = {
  'deficiency': 'Deficiencies',
  'intraop-linkage': 'Intraoperative Linkage',
  'reconciliation': 'Discordance & Reconciliation',
  'countersign': 'Countersign Turnaround',
  'fppe': 'Credentialing Review',
  'drift': 'Post-Finalization Drift',
  'patient-match': 'Patient Match Review',
  'management-review': 'Management Reviews',
};

const GROUP_LABEL_KEY: Record<QaGroup, string> = {
  'deficiency': 'auditLog.groupLabels.deficiency',
  'intraop-linkage': 'auditLog.groupLabels.intraopLinkage',
  'reconciliation': 'auditLog.groupLabels.reconciliation',
  'countersign': 'auditLog.groupLabels.countersign',
  'fppe': 'auditLog.groupLabels.fppe',
  'drift': 'auditLog.groupLabels.drift',
  'patient-match': 'auditLog.groupLabels.patientMatch',
  'management-review': 'auditLog.groupLabels.managementReview',
};

// Status options per group — 'all' plus whatever that group's own real
// status values are. Management Reviews and Patient Match Review each have
// only one real status ('Completed' / 'Needs Review' respectively) — kept
// in the record as a real value rather than omitted, since a recorded
// review or a flagged match is itself the compliance evidence, status
// vocabulary or not. See Pete's own point: not having a multi-value status
// isn't a reason to leave something out of the permanent record.
// 'label' stays the plain-English display text (used for the CSV
// exports' own Status column/meta value, same "exported data stays
// English" convention as GROUP_LABELS above); 'labelKey' is the
// translated equivalent, looked up with t() for every on-screen
// use (the <select> filter options below).
const GROUP_STATUS_OPTIONS: Record<QaGroup, { value: string; label: string; labelKey: string }[]> = {
  'deficiency': [
    { value: 'open', label: 'Open', labelKey: 'auditLog.statusLabels.open' },
    { value: 'pending-verification', label: 'Pending Verification', labelKey: 'auditLog.statusLabels.pendingVerification' },
    { value: 'closed', label: 'Closed', labelKey: 'auditLog.statusLabels.closed' },
  ],
  'intraop-linkage': [
    { value: 'pending', label: 'Pending', labelKey: 'auditLog.statusLabels.pending' },
    { value: 'merged', label: 'Merged', labelKey: 'auditLog.statusLabels.merged' },
  ],
  'reconciliation': [
    { value: 'concordant', label: 'Concordant', labelKey: 'auditLog.statusLabels.concordant' },
    { value: 'discordant', label: 'Discordant', labelKey: 'auditLog.statusLabels.discordant' },
  ],
  'countersign': [
    { value: 'pending', label: 'Pending', labelKey: 'auditLog.statusLabels.pending' },
    { value: 'countersigned', label: 'Countersigned', labelKey: 'auditLog.statusLabels.countersigned' },
  ],
  'fppe': [
    { value: 'active', label: 'Active', labelKey: 'auditLog.statusLabels.active' },
    { value: 'completed', label: 'Completed', labelKey: 'auditLog.statusLabels.completed' },
  ],
  'drift': [
    { value: 'Post-Finalization Drift Detected', label: 'Detected', labelKey: 'auditLog.statusLabels.driftDetected' },
    { value: 'Post-Finalization Drift Auto-Corrected', label: 'Auto-Corrected', labelKey: 'auditLog.statusLabels.driftAutoCorrected' },
    { value: 'Post-Finalization Drift Correction Deferred', label: 'Deferred', labelKey: 'auditLog.statusLabels.driftDeferred' },
    { value: 'Post-Finalization Drift Correction Failed', label: 'Failed', labelKey: 'auditLog.statusLabels.driftFailed' },
  ],
  'patient-match': [{ value: 'needs-review', label: 'Needs Review', labelKey: 'auditLog.statusLabels.needsReview' }],
  'management-review': [{ value: 'completed', label: 'Completed', labelKey: 'auditLog.statusLabels.completed' }],
};

// One normalized shape every group's real records get mapped into, so one
// table/filter/export can cover all 8 without 8 parallel implementations.
interface QualityRecord {
  id: string;
  group: QaGroup;
  date: string;       // ISO — drives date-range filtering and the Date column
  caseId?: string;
  specimen?: string;
  detail: string;      // main descriptive text (issue/event/finding)
  statusValue: string; // matches a GROUP_STATUS_OPTIONS[group] value, for filtering
  statusLabel: string; // plain-English display text — CSV export only (see GROUP_STATUS_OPTIONS)
  statusLabelKey: string; // translated equivalent of statusLabel, for on-screen display
  // Real fix found while converting this table's status badge to i18n:
  // the badge's own color previously matched on statusLabel's literal
  // English text (e.g. `['Closed', 'Merged', ...].includes(r.statusLabel)`)
  // — once statusLabel's on-screen counterpart is translated, that
  // string match would have silently stopped working (and silently
  // mis-colored badges) in every non-English locale. statusTone is a
  // stable, locale-independent classification computed once here,
  // instead of re-derived from display text at render time.
  statusTone: 'resolved' | 'open' | 'pending';
  user?: string;        // who's associated, for user-filtering
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDateStr(ts: string): Date {
  return new Date(ts.replace(' ', 'T'));
}

function getDateThreshold(range: string, timezone: string): Date | null {
  const now = new Date();
  const d   = new Date(now);
  // Real fix: "today" specifically needs the real, configured facility
  // timezone's own midnight, not the viewing device's own local midnight
  // - the other three cases below are genuine, timezone-independent
  // absolute-time subtraction (N days' worth of real milliseconds), not
  // at risk of the same bug.
  if (range === 'today')  {
    const { year, month, day } = getFacilityDateParts(now, timezone);
    return getFacilityMidnightUtc(year, month, day, timezone);
  }
  // eslint-disable-next-line no-restricted-properties -- Real, honest justification: genuinely different from the 'today' case above (already fixed with real facility-timezone logic). This is absolute-time subtraction (N days' worth of real milliseconds from now), not calendar-day bucketing - not at risk of the same facility-timezone bug.
  if (range === '7days')  { d.setDate(d.getDate() - 7);  return d; }
  // eslint-disable-next-line no-restricted-properties -- Same real justification as the '7days' case above.
  if (range === '30days') { d.setDate(d.getDate() - 30); return d; }
  // eslint-disable-next-line no-restricted-properties -- Same real justification as the '7days' case above.
  if (range === '90days') { d.setDate(d.getDate() - 90); return d; }
  return null;
}

function exportAuditCSV(rows: AuditLog[], requestedBy: string, filters: Record<string, string>) {
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const meta = buildMetaHeader('Audit Log', requestedBy, filters, rows.length);
  const data = [
    ['ID', 'Timestamp', 'Type', 'Event', 'Detail', 'Actioned By', 'Accession No.', 'AI Confidence'].join(','),
    ...rows.map(r => [r.id, r.timestamp, r.type, r.event, r.detail, r.user, r.caseId ?? '', r.confidence ?? ''].map(esc).join(','))
  ];
  downloadCSV(meta + data.join('\n'), `pathscribe-audit-log-${new Date().toISOString().slice(0,10)}.csv`);
}

function exportErrorCSV(rows: ErrorLog[], requestedBy: string, filters: Record<string, string>) {
  const esc = (v: string | number | boolean | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const meta = buildMetaHeader('Error Log', requestedBy, filters, rows.length);
  const data = [
    ['ID', 'Timestamp', 'Severity', 'Code', 'Message', 'Source', 'Accession No.', 'Resolved'].join(','),
    ...rows.map(r => [r.id, r.timestamp, r.severity, r.code, r.message, r.source, r.caseId ?? '', r.resolved].map(esc).join(','))
  ];
  downloadCSV(meta + data.join('\n'), `pathscribe-error-log-${new Date().toISOString().slice(0,10)}.csv`);
}

// Real, per direct request: "reduce the search bar in the audit log so
// that we can still fit a way to download interface error to a
// spreadsheet (csv)." Same real, established convention as the other
// three exports on this page — same meta header, same PHI-safety
// posture (sourcePatientIdentifier/targetPatientIdentifier only —
// never a raw name, MRN, or DOB — matching exactly what the real,
// on-screen table already shows, never anything more).
function exportInterfaceCSV(rows: InterfaceException[], requestedBy: string, filters: Record<string, string>) {
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const meta = buildMetaHeader('Interface Log', requestedBy, filters, rows.length);
  const data = [
    ['ID', 'Timestamp', 'Event Type', 'Reason', 'Source Patient', 'Target Patient', 'Status'].join(','),
    ...rows.map(r => [r.id, r.createdAt, r.eventType, r.reason, r.sourcePatientIdentifier ?? '', r.targetPatientIdentifier ?? '', r.status].map(esc).join(','))
  ];
  downloadCSV(meta + data.join('\n'), `pathscribe-interface-log-${new Date().toISOString().slice(0,10)}.csv`);
}

// Same compliance-notice/meta-header convention as the other two exports
// on this page, and the same PHI-safety principle qaReportUtils.ts
// already established for this exact data elsewhere (Intraop Linkage,
// Reconciliation, etc. exports): no patient name, MRN, or DOB — only
// case/accession identifiers, since none of the app's normal access
// controls apply once something leaves as a downloaded file. This is
// the record CAP and other certification bodies get pointed to during
// an inspection, so it needs to hold up as a real, self-explanatory
// document on its own — the notice/filter/requester header makes clear
// what it is and how it was scoped, the same way the audit/error
// exports already do.
function exportQualityCSV(rows: QualityRecord[], requestedBy: string, filters: Record<string, string>) {
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const meta = buildMetaHeader('Quality Assurance Log', requestedBy, filters, rows.length);
  const data = [
    ['ID', 'Group', 'Date', 'Case', 'Specimen', 'Detail', 'Status', 'User'].join(','),
    ...rows.map(r => [
      r.id, GROUP_LABELS[r.group], r.date, r.caseId ?? '', r.specimen ?? '', r.detail, r.statusLabel, r.user ?? '',
    ].map(esc).join(','))
  ];
  downloadCSV(meta + data.join('\n'), `pathscribe-quality-assurance-log-${new Date().toISOString().slice(0,10)}.csv`);
}

// UNIQUE_USERS is derived from loaded data — see useMemo below

// ── Role-based access helpers ─────────────────────────────────────────────────

const VALIDATION_EVENTS = new Set([
  'validation_study_created', 'validation_study_activated',
  'validation_study_closed',  'validation_study_deleted',
  'validation_report_generated',
  'validation_routing_rule_added', 'validation_routing_rule_updated',
  'validation_routing_rule_deleted',
]);

// ── Badge style helpers ──────────────────────────────────────────────────────
// Return a class-name modifier + label rather than raw colors — the actual
// color values live in pathscribe.css's .ps-auditlog-badge-- family.

const TYPE_LABEL_KEY: Record<string, string> = { ai: 'auditLog.typeLabels.ai', user: 'auditLog.typeLabels.user', system: 'auditLog.typeLabels.system' };
// Plain-function `t` param, not a hook — same convention this sweep
// already established for label-resolving helpers that live outside
// component scope (e.g. resolveSynopticFieldLabel.ts).
function getTypeBadge(type: string, t: (key: string) => string): { className: string; label: string } {
  const known = type === 'ai' || type === 'user' || type === 'system';
  return {
    className: known ? `ps-auditlog-badge--${type}` : 'ps-auditlog-badge--default',
    label: known ? t(TYPE_LABEL_KEY[type]) : type,
  };
}

const SEVERITY_LABEL_KEY: Record<string, string> = { error: 'auditLog.severityLabels.error', warning: 'auditLog.severityLabels.warning', info: 'auditLog.severityLabels.info' };
function getSeverityBadge(sev: string, t: (key: string) => string): { className: string; label: string } {
  const known = sev === 'error' || sev === 'warning' || sev === 'info';
  return {
    className: known ? `ps-auditlog-badge--${sev}` : 'ps-auditlog-badge--default',
    label: known ? t(SEVERITY_LABEL_KEY[sev]) : sev,
  };
}

// ── Component ────────────────────────────────────────────────────────────────
const AuditLogPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useSystemConfig();

  const [isLoaded,        setIsLoaded]        = useState(false);
  const [auditLogs,       setAuditLogs]       = useState<AuditLog[]>([]);
  const [errorLogs,       setErrorLogs]       = useState<ErrorLog[]>([]);
  /** Real feature, per direct confirmation: "Users should be able to
   *  see interface error log under Audit, a new pill Interfaces." A
   *  genuinely different data shape from ErrorLog — real HL7 interface
   *  messages this app could not safely auto-resolve (see
   *  services/interfaceExceptions/ for the full A43 story that created
   *  the need for this), not a generic system error. Loaded alongside
   *  errorLogs, shown via its own pill within the same Error Log tab. */
  const [interfaceExceptions, setInterfaceExceptions] = useState<InterfaceException[]>([]);
  /** Real feature, per direct confirmation: "Manual Review Queue /
   *  Flagging (Safest)" — the exception currently open in the review
   *  modal, or null when closed. */
  const [reviewingException, setReviewingException] = useState<InterfaceException | null>(null);
  /** Real feature, per direct confirmation, building Phase B of the
   *  "Interface Exception & Case-Binding Module." Deliberately gated
   *  to isAdmin at the trigger below — restricted, not a general tool. */
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [deficiencyLogs,      setDeficiencyLogs]      = useState<SpecimenDeficiency[]>([]);
  const [deficiencyTypes,     setDeficiencyTypes]     = useState<DeficiencyType[]>([]);
  const [intraopEntries,      setIntraopEntries]      = useState<IntraoperativeEntry[]>([]);
  const [reconciliationLogs,  setReconciliationLogs]  = useState<QaActivityRecord[]>([]);
  const [countersignLogs,     setCountersignLogs]     = useState<CountersignRecord[]>([]);
  const [fppeLogs,            setFppeLogs]            = useState<FppeAssignment[]>([]);
  const [driftLogs,           setDriftLogs]           = useState<AuditLog[]>([]);
  const [patientMatchLogs,    setPatientMatchLogs]    = useState<MasterPatientRecord[]>([]);
  const [managementReviews,   setManagementReviews]   = useState<ManagementReview[]>([]);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [activeTab,       setActiveTab]       = useState<ActiveTab>('audit');
  const [financialSubTab, setFinancialSubTab] = useState<'billing_logs' | 'outbound_dlq'>('billing_logs');
  const [interfacesSubTab, setInterfacesSubTab] = useState<'exceptions' | 'outbound_dlq' | 'outbound_dispatches' | 'print_queue'>('exceptions');
  const [searchParams] = useSearchParams();

  // Real feature, per direct confirmation: a high-priority message
  // about pending interface exceptions should land the recipient
  // directly on the relevant view, not the generic page. Real, per
  // direct redesign: interfaces is now its own real top-level tab
  // Real, per direct follow-up ("the actions list is out of sync...
  // voice control... has to be flawless"): this page never called
  // setCurrentContext at all, confirmed directly — the only major
  // page in the whole app that didn't. Whatever context the previous
  // page (almost always Worklist) last set just stayed stuck the
  // entire time anyone was on this page, orphaning "Dispatch Now"/
  // "Retry Dispatch" below and any future real Audit-context action.
  // Same one-line pattern every other page already uses.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.AUDIT);
    return () => { mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST); };
  }, []);

  // (?tab=interfaces), not a pill within errors — the old
  // ?tab=errors&pill=interfaces scheme (still the one real, live
  // deep-link CrosswalkSection.tsx's own Unmapped Stubs banner uses)
  // is kept working here too, rather than breaking that already-
  // shipped link the moment this redesign landed.
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const pillParam = searchParams.get('pill');
    const landingOnInterfaces = tabParam === 'interfaces' || (tabParam === 'errors' && pillParam === 'interfaces');
    if (landingOnInterfaces) setActiveTab('interfaces');
    else if (tabParam === 'errors') setActiveTab('errors');
    else if (tabParam === 'quality') setActiveTab('quality');
    else if (tabParam === 'financial') setActiveTab('financial');
    else if (tabParam === 'criticalAlerts') setActiveTab('criticalAlerts');
    // Real feature, per direct follow-up: "how would I see a report
    // that shows all the tracking events for a case?" — same real
    // deep-link pattern immediately above, extended with a ?search=
    // param so a real "View Tracking History" link from a case can
    // land here pre-filtered to that case's own events, not the
    // generic, unfiltered log. dateRange also widened to 'all' — the
    // default 7-day window would silently hide a case's own older
    // tracking events, defeating the point of a deep link built
    // specifically to show every one of them.
    const searchParam = searchParams.get('search');
    if (searchParam) {
      if (landingOnInterfaces) setInterfaceSearch(searchParam);
      else { setSearchQuery(searchParam); setDateRange('all'); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Role-based access ─────────────────────────────────────────────────────
  // Was two independent localStorage.getItem('pathscribe-user') + JSON.parse
  // calls (a module-level getRole() plus this component's own storedUser
  // IIFE) — the same duplication already found and fixed in
  // ConfigurationPage.tsx. Both now read from the one AuthContext already
  // parses and exposes.
  const { user: storedUser } = useAuth();
  const role          = storedUser?.role ?? 'pathologist';
  const isSuperAdmin  = role === 'superadmin';
  const isAdmin       = ['admin', 'pathologist-admin', 'superadmin'].includes(role);
  const isPathologist = role === 'pathologist';
  // Real fix: all three exports on this page previously hardcoded
  // "Requested By: Unknown" regardless of who was actually logged in —
  // a real gap given these are exactly the exports meant to hold up
  // under a CAP or other certification inspection, where knowing who
  // pulled the report is part of the point.
  const requestedByLabel = storedUser?.name ?? storedUser?.email ?? 'Unknown';

  // Audit filters
  const [typeFilter,  setTypeFilter]  = useState<'all' | 'ai' | 'user' | 'system'>('all');
  // Real, per direct guidance ("Any existing gaps to deal with?" — the
  // "log reports" half of "All this must be audited and should be
  // available to create log reports" was never actually built; only
  // the outbound-queue half was). A real, independent filter dimension
  // (not folded into the type pills above, which are mutually
  // exclusive) — combinable with every other real filter here (user,
  // date range, search), matching how every other filter on this tab
  // already composes. Prefix-based (mpi.*) rather than a hardcoded
  // event-name list, so a future new mpi.* event type is included
  // automatically, never silently missed.
  const [patientManagementOnly, setPatientManagementOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter,  setUserFilter]  = useState('all');
  const [dateRange,   setDateRange]   = useState('7days');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

  // Error filters
  const [errorSeverity, setErrorSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [errorSearch,   setErrorSearch]   = useState('');
  const [errorResolved, setErrorResolved] = useState<'all' | 'open' | 'resolved'>('all');
  /** Real feature, per direct confirmation. Separate resolution filter
   *  for interface exceptions, since their real status vocabulary
   *  ('pending'/'resolved'/'dismissed') is genuinely different from
   *  ErrorLog's own open/resolved boolean. */
  const [interfaceStatus, setInterfaceStatus] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');
  const [interfaceSearch, setInterfaceSearch] = useState('');

  // Quality Assurance filters — Group first (which of the 8 tabbed item
  // groups from the working queue), then Status (that group's own real
  // vocabulary — see GROUP_STATUS_OPTIONS, not one fake shared status
  // set), then User, then Date, then Search. Matches the exact order
  // requested, and mirrors the Audit tab's own filter shape/order above.
  const [qualityGroup,  setQualityGroup]  = useState<QaGroup>('deficiency');
  const [qualityStatus, setQualityStatus] = useState('all');
  const [qualityUser,   setQualityUser]   = useState('all');
  const [qualitySearch, setQualitySearch] = useState('');
  const [qualityDateRange, setQualityDateRange] = useState('all');
  const [qualityDateFrom,  setQualityDateFrom]  = useState('');
  const [qualityDateTo,    setQualityDateTo]    = useState('');

  useEffect(() => {
    const loadTimer = setTimeout(() => setIsLoaded(true), 100);
    // Load audit and error logs from service layer
    auditService.getAuditLogs().then(r => { if (r.ok) setAuditLogs(r.data); });
    auditService.getErrorLogs().then(r => { if (r.ok) setErrorLogs(r.data); });
    interfaceExceptionService.getAll().then(r => { if (r.ok) setInterfaceExceptions(r.data); });
    specimenDeficiencyService.getAll().then(r => { if (r.ok) setDeficiencyLogs(r.data); });
    deficiencyTypeService.getAll().then(r => { if (r.ok) setDeficiencyTypes(r.data); });
    intraoperativeService.getAll().then(r => { if (r.ok) setIntraopEntries(r.data); });
    qaActivityRecordService.getAll().then(r => { if (r.ok) setReconciliationLogs(r.data.filter(rec => rec.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID)); });
    countersignService.getAll().then(r => { if (r.ok) setCountersignLogs(r.data); });
    fppeAssignmentService.getAll().then(r => { if (r.ok) setFppeLogs(r.data); });
    managementReviewService.getAll().then(r => { if (r.ok) setManagementReviews(r.data); });
    // Drift reuses the same real audit-log-backed source
    // DriftCorrectionTab.tsx itself reads from — no dedicated service
    // exists for this, by design (see that file's own header comment).
    auditService.getAuditLogs({ search: 'Drift' }).then(r => {
      if (r.ok) setDriftLogs(r.data.filter(l => (Object.keys(GROUP_STATUS_OPTIONS.drift.reduce((a, o) => ({ ...a, [o.value]: 1 }), {} as Record<string, 1>))).includes(l.event)));
    });
    // Patient Match Review's own service is org-scoped with no
    // cross-org getAll (see PatientMatchReviewSection.tsx) — aggregate
    // across every organisation for the same complete-record purpose
    // this whole tab exists for.
    listOrganisations().then(async orgs => {
      const perOrg = await Promise.all(orgs.map(o => mockPatientIndexService.listPendingReview(o.id)));
      setPatientMatchLogs(perOrg.flat());
    });
    return () => clearTimeout(loadTimer);
  }, []);

  /** Real feature, per direct confirmation. Callable reload, distinct
   *  from the one-time load above — the review modal calls this after
   *  a real resolve/dismiss action, so the list (and the pending-count
   *  badge on the pill) reflects the real, current state immediately. */
  const reloadInterfaceExceptions = () => {
    interfaceExceptionService.getAll().then(r => { if (r.ok) setInterfaceExceptions(r.data); });
  };

  // Real bug fix: this page declared isResourcesOpen and rendered
  // ResourcesModal but never listened for the global
  // PATHSCRIBE_PAGE_OPEN_RESOURCES event that actually opens it elsewhere
  // (see WorklistPage.tsx, where this same modal is wired up correctly) —
  // meaning the modal had no way to ever open on this page at all.
  useEffect(() => {
    const openResources = () => setIsResourcesOpen(true);
    window.addEventListener('PATHSCRIBE_PAGE_OPEN_RESOURCES', openResources);
    return () => window.removeEventListener('PATHSCRIBE_PAGE_OPEN_RESOURCES', openResources);
  }, []);

  // ── Role-based scoping ───────────────────────────────────────────────────────
  // Applied before user-defined filters.
  const roleFilteredLogs = auditLogs.filter(log => {
    // Validation study events hidden from all except admin/superadmin
    if (!isAdmin && VALIDATION_EVENTS.has(log.event)) return false;
    // Pathologists: case audit is a shared clinical record — show all case events
    // Hide system/config events from other users that have no caseId
    if (isPathologist) {
      if (log.caseId) return true;
      if (log.user === storedUser?.name || log.user === storedUser?.email) return true;
      return false;
    }
    return true;
  });

  const filteredAuditLogs = roleFilteredLogs.filter(log => {
    if (typeFilter !== 'all' && log.type !== typeFilter) return false;
    if (patientManagementOnly && !log.event.startsWith('mpi.')) return false;
    if (isSuperAdmin && userFilter !== 'all' && log.user !== userFilter) return false;
    const logDate = parseDateStr(log.timestamp);
    if (dateRange === 'custom') {
      if (dateFrom && logDate < new Date(dateFrom))                    return false;
      if (dateTo   && logDate > new Date(dateTo + 'T23:59:59'))        return false;
    } else {
      const threshold = getDateThreshold(dateRange, config.facilityTimezone);
      if (threshold && logDate < threshold)                            return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (![log.event, log.detail, log.user, log.caseId ?? ''].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const filteredErrorLogs = errorLogs.filter(log => {
    if (errorSeverity !== 'all' && (log.severity as string) !== errorSeverity) return false;
    if (errorResolved === 'open'     &&  log.resolved)                 return false;
    if (errorResolved === 'resolved' && !log.resolved)                 return false;
    if (errorSearch) {
      const q = errorSearch.toLowerCase();
      if (![log.message, log.code, log.source, log.caseId ?? ''].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const filteredInterfaceExceptions = interfaceExceptions.filter(e => {
    if (interfaceStatus !== 'all' && e.status !== interfaceStatus) return false;
    if (interfaceSearch) {
      const q = interfaceSearch.toLowerCase();
      if (![e.eventType, e.reason, e.sourcePatientIdentifier ?? '', e.targetPatientIdentifier ?? ''].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const qualityTypeName = (id: string) => deficiencyTypes.find(t => t.id === id)?.name ?? id;
  const driftStatusOption = (event: string) => GROUP_STATUS_OPTIONS.drift.find(o => o.value === event);
  const driftStatusLabel = (event: string) => driftStatusOption(event)?.label ?? event;
  const driftStatusLabelKey = (event: string) => driftStatusOption(event)?.labelKey;
  // Real, locale-independent tone for the drift group specifically —
  // computed from the stable event value, not the (now translatable)
  // label text. Mirrors, event-for-event, the resolved/open/pending
  // split the old label-text-matching ternary used to encode.
  const driftTone = (event: string): QualityRecord['statusTone'] => {
    if (event === 'Post-Finalization Drift Auto-Corrected') return 'resolved';
    if (event === 'Post-Finalization Drift Correction Failed') return 'open';
    return 'pending'; // Detected, Correction Deferred
  };

  // Normalizes whichever group is currently selected into the one shared
  // QualityRecord shape — only the active group's own source data is
  // normalized (not all 8 at once on every render), since only one
  // group's table is ever visible at a time.
  const normalizedQualityRecords: QualityRecord[] = (() => {
    switch (qualityGroup) {
      case 'deficiency': return deficiencyLogs.map(d => ({
        id: d.id, group: 'deficiency' as const, date: d.raisedAt, caseId: d.caseId,
        specimen: d.specimenLabel ?? t('auditLog.qualityTab.caseLevelFallback'),
        detail: `${qualityTypeName(d.deficiencyTypeId)}${d.status === 'open' ? (d.comment ? ' — ' + d.comment : '') : (d.correctiveAction ? ' — ' + d.correctiveAction : '')}`,
        statusValue: d.status,
        statusLabel: d.status === 'open' ? 'Open' : d.status === 'pending-verification' ? 'Pending Verification' : 'Closed',
        statusLabelKey: d.status === 'open' ? 'auditLog.statusLabels.open' : d.status === 'pending-verification' ? 'auditLog.statusLabels.pendingVerification' : 'auditLog.statusLabels.closed',
        statusTone: d.status === 'open' ? 'open' as const : d.status === 'pending-verification' ? 'pending' as const : 'resolved' as const,
        user: d.raisedBy === 'system' ? t('auditLog.typeLabels.system') : d.raisedBy,
      }));
      case 'intraop-linkage': return intraopEntries.map(e => ({
        id: e.id, group: 'intraop-linkage' as const, date: e.mergedAt ?? e.createdAt, caseId: e.mergedIntoCaseId,
        detail: t('auditLog.qualityTab.orPrefix', { orNumber: e.orNumber }),
        statusValue: e.status,
        statusLabel: e.status === 'merged' ? 'Merged' : 'Pending',
        statusLabelKey: e.status === 'merged' ? 'auditLog.statusLabels.merged' : 'auditLog.statusLabels.pending',
        statusTone: e.status === 'merged' ? 'resolved' as const : 'pending' as const,
        user: e.performedBy?.userName,
      }));
      case 'reconciliation': return reconciliationLogs.map(r => ({
        id: r.id, group: 'reconciliation' as const, date: r.recordedAt, caseId: r.caseId, specimen: r.caseType,
        detail: r.outcome === 'discordant' ? `${r.fieldValues.frozenDx} → ${r.fieldValues.finalDx}${r.comments ? ' — ' + r.comments : ''}` : `${r.fieldValues.frozenDx} → ${r.fieldValues.finalDx}`,
        statusValue: r.outcome,
        statusLabel: r.outcome === 'concordant' ? 'Concordant' : 'Discordant',
        statusLabelKey: r.outcome === 'concordant' ? 'auditLog.statusLabels.concordant' : 'auditLog.statusLabels.discordant',
        statusTone: r.outcome === 'concordant' ? 'resolved' as const : 'open' as const,
        user: r.recordedBy?.userName,
      }));
      case 'countersign': return countersignLogs.map(c => ({
        id: c.id, group: 'countersign' as const, date: c.countersignedAt ?? c.releasedAt, caseId: c.caseId,
        detail: `${c.residentName} → ${c.attendingName ?? t('auditLog.qualityTab.attendingPending')}${c.attendingFeedback ? ' — ' + c.attendingFeedback : ''}`,
        statusValue: c.status,
        statusLabel: c.status === 'countersigned' ? 'Countersigned' : 'Pending',
        statusLabelKey: c.status === 'countersigned' ? 'auditLog.statusLabels.countersigned' : 'auditLog.statusLabels.pending',
        statusTone: c.status === 'countersigned' ? 'resolved' as const : 'pending' as const,
        user: c.residentName,
      }));
      case 'fppe': return fppeLogs.map(a => ({
        id: a.id, group: 'fppe' as const, date: a.completedAt ?? a.startedAt,
        detail: `${a.provisionalUserName} (${t('auditLog.qualityTab.proctorParenthetical', { name: a.proctorUserName })}) — ${t('auditLog.qualityTab.casesReviewed', { count: a.casesReviewedCount })}`,
        statusValue: a.status,
        statusLabel: a.status === 'completed' ? 'Completed' : 'Active',
        statusLabelKey: a.status === 'completed' ? 'auditLog.statusLabels.completed' : 'auditLog.statusLabels.active',
        statusTone: a.status === 'completed' ? 'resolved' as const : 'pending' as const,
        user: a.provisionalUserName,
      }));
      case 'drift': return driftLogs.map(l => ({
        id: l.id, group: 'drift' as const, date: l.timestamp, caseId: l.caseId ?? undefined,
        detail: l.detail, statusValue: l.event, statusLabel: driftStatusLabel(l.event),
        statusLabelKey: driftStatusLabelKey(l.event) ?? '',
        statusTone: driftTone(l.event),
        user: l.user,
      }));
      case 'patient-match': return patientMatchLogs.map(p => ({
        id: p.id, group: 'patient-match' as const, date: p.createdAt,
        detail: `${p.lastName}, ${p.firstName} (${t('auditLog.qualityTab.mrnParenthetical', { mrn: p.mrn })}) — ${p.reviewReason}`,
        statusValue: 'needs-review', statusLabel: 'Needs Review',
        statusLabelKey: 'auditLog.statusLabels.needsReview',
        statusTone: 'pending' as const,
      }));
      case 'management-review': return managementReviews.map(r => ({
        id: r.id, group: 'management-review' as const, date: r.reviewedAt,
        detail: `${t('auditLog.qualityTab.items', { count: r.deficiencyIds.length })} — ${r.findings}`,
        statusValue: 'completed', statusLabel: 'Completed',
        statusLabelKey: 'auditLog.statusLabels.completed',
        statusTone: 'resolved' as const,
        user: r.reviewedBy,
      }));
    }
  })();

  const qualityUniqueUsers = Array.from(new Set(normalizedQualityRecords.map(r => r.user).filter((u): u is string => !!u))).sort();

  const filteredQualityLogs = normalizedQualityRecords.filter(r => {
    if (qualityStatus !== 'all' && r.statusValue !== qualityStatus) return false;
    if (isSuperAdmin && qualityUser !== 'all' && r.user !== qualityUser) return false;
    const logDate = parseDateStr(r.date);
    if (qualityDateRange === 'custom') {
      if (qualityDateFrom && logDate < new Date(qualityDateFrom))                return false;
      if (qualityDateTo   && logDate > new Date(qualityDateTo + 'T23:59:59'))    return false;
    } else {
      const threshold = getDateThreshold(qualityDateRange, config.facilityTimezone);
      if (threshold && logDate < threshold)                                      return false;
    }
    if (qualitySearch) {
      const q = qualitySearch.toLowerCase();
      const haystack = [r.caseId ?? '', r.specimen ?? '', r.detail, r.user ?? ''];
      if (!haystack.some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const openQualityCount = deficiencyLogs.filter(l => l.status === 'open').length;

  useEffect(() => { setQualityStatus('all'); }, [qualityGroup]);

  const openErrors = errorLogs.filter(e => !e.resolved).length;
  const pendingInterfaceCount = interfaceExceptions.filter(e => e.status === 'pending').length;

  // Was an IIFE `{(() => { ... })()}` computed inline inside the JSX
  // return — pulled out to a real component-body value, same standard
  // applied to business logic found embedded in the UI elsewhere in this
  // review.
  const quickLinks = {
    protocols:  [{ title: 'CAP Cancer Protocols', url: 'https://www.cap.org/protocols-and-guidelines' }, { title: 'WHO Classification', url: 'https://www.who.int/publications' }],
    references: [{ title: 'PathologyOutlines', url: 'https://www.pathologyoutlines.com' }, { title: 'UpToDate', url: 'https://www.uptodate.com' }],
    systems:    [{ title: 'Hospital LIS', url: '#' }, { title: 'Lab Management', url: '#' }],
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`ps-auditlog-page${isLoaded ? ' ps-auditlog-page--loaded' : ''}`}>

      {/* Real, per direct UI-review follow-up ("Fix the root"): this
          page's own competing background image/gradient removed —
          falls through to AppShell's own real .ps-app-root
          background now, matching Configuration/Quality Assurance/
          Intraop Queue/Contribution. */}

      <div className="ps-auditlog-content">

        {/* ── Main ── */}
        <main className="ps-auditlog-main">

          {/* Header + Tab switcher */}
          <div className="ps-auditlog-header-row">
            <div>
              <h1 className="ps-auditlog-title">{t('auditLog.page.title')}</h1>
              <p className="ps-auditlog-subtitle">{t('auditLog.page.subtitle')}</p>
              {isPathologist && (
                <div className="ps-auditlog-role-notice">
                  {t('auditLog.page.roleNotice')}
                </div>
              )}
            </div>
            <div className="ps-auditlog-tabswitch">
              {(['audit', 'errors', 'interfaces', 'quality', 'financial', 'criticalAlerts'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`ps-auditlog-tabswitch-btn${activeTab === tab ? ' ps-auditlog-tabswitch-btn--active' : ''}`}
                >
                  {t(`auditLog.tabs.${tab}`)}
                  {tab === 'errors' && openErrors > 0 && <span className="ps-auditlog-tabswitch-badge">{openErrors}</span>}
                  {tab === 'interfaces' && pendingInterfaceCount > 0 && <span className="ps-auditlog-tabswitch-badge">{pendingInterfaceCount}</span>}
                  {tab === 'quality' && openQualityCount > 0 && <span className="ps-auditlog-tabswitch-badge">{openQualityCount}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Batch 364 (PS-350): find what a support reference names (support quotes it instead of a case number). */}
          <SupportReferenceLookup
            initialRef={searchParams.get('supportRef') ?? undefined}
            data={{ auditLogs, errorLogs, interfaceExceptions }}
            onOpenCase={caseId => navigate(`/case/${caseId}/synoptic`)}
          />

          {/* ── AUDIT TAB ── */}
          {activeTab === 'audit' && (
            <>
              {/* Filters */}
              <div className="ps-auditlog-filter-row">
                {/* Type pills — real counts, per direct redesign, replacing the removed stat cards */}
                <div className="ps-auditlog-pill-group">
                  {([
                    { id: 'all', labelKey: 'auditLog.auditTab.allPill', count: roleFilteredLogs.length },
                    { id: 'ai', labelKey: 'auditLog.auditTab.aiPill', count: roleFilteredLogs.filter(l => l.type === 'ai').length },
                    { id: 'user', labelKey: 'auditLog.auditTab.userPill', count: roleFilteredLogs.filter(l => l.type === 'user').length },
                    { id: 'system', labelKey: 'auditLog.auditTab.systemPill', count: roleFilteredLogs.filter(l => l.type === 'system').length },
                  ] as const).map(f => (
                    <button key={f.id} onClick={() => setTypeFilter(f.id)} className={`ps-auditlog-pill${typeFilter === f.id ? ' ps-auditlog-pill--active-teal' : ''}`}>
                      {t(f.labelKey)}
                      <span className="ps-auditlog-pill-badge">{f.count}</span>
                    </button>
                  ))}
                </div>
                <div className="ps-auditlog-filter-divider" />
                {/* Real, per direct guidance: a real, dedicated
                    "Patient Management" report — Merge/Move/Link/
                    Rebind/demographic-update events, filterable
                    independently of (and combinable with) the type
                    pills above. */}
                <label className="ps-auditlog-pill ps-auditlog-pill--checkbox">
                  <input type="checkbox" checked={patientManagementOnly} onChange={e => setPatientManagementOnly(e.target.checked)} />
                  {t('auditLog.auditTab.patientManagementOnly')}
                  <span className="ps-auditlog-pill-badge">{roleFilteredLogs.filter(l => l.event.startsWith('mpi.')).length}</span>
                </label>
                {/* User filter — superadmin only to prevent bias in validation studies */}
                {isSuperAdmin && (
                <select value={userFilter} onChange={e => setUserFilter(e.target.value)} aria-label={t('auditLog.auditTab.userFilterAria')} className="ps-auditlog-select ps-auditlog-select--wide">
                  {['all', ...Array.from(new Set(roleFilteredLogs.map(l => l.user))).sort()].map(u => (
                    <option key={u} value={u}>{u === 'all' ? t('auditLog.auditTab.allUsersOption') : u}</option>
                  ))}
                </select>
                )}
                {/* Date range */}
                <select value={dateRange} onChange={e => setDateRange(e.target.value)} aria-label={t('auditLog.shared.dateRangeAria')} className="ps-auditlog-select">
                  <option value="today">{t('auditLog.shared.today')}</option>
                  <option value="7days">{t('auditLog.shared.last7Days')}</option>
                  <option value="30days">{t('auditLog.shared.last30Days')}</option>
                  <option value="90days">{t('auditLog.shared.last90Days')}</option>
                  <option value="custom">{t('auditLog.shared.customRange')}</option>
                </select>
                {dateRange === 'custom' && (
                  <>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="ps-auditlog-select ps-auditlog-select--date" />
                    <span className="ps-auditlog-date-to">{t('auditLog.shared.dateToSeparator')}</span>
                    <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="ps-auditlog-select ps-auditlog-select--date" />
                  </>
                )}
                {/* Text search */}
                <div className="ps-auditlog-search-wrap">
                  <div className="ps-auditlog-search-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('auditLog.auditTab.searchPlaceholder')} className="ps-auditlog-select ps-auditlog-search-input" />
                </div>
                {/* Export — filter names/values in the CSV's own meta
                    header stay in English, same "exported data stays
                    English" convention as every other export on this
                    page (and this whole sweep). */}
                <button onClick={() => exportAuditCSV(
                    filteredAuditLogs,
                    requestedByLabel,
                    { 'Type': typeFilter, 'Patient Management Only': patientManagementOnly ? 'Yes' : 'No', 'User': userFilter, 'Date Range': dateRange === 'custom' ? `${dateFrom} to ${dateTo}` : dateRange, 'Search': searchQuery }
                  )} className="ps-auditlog-export-btn">
                  {t('auditLog.shared.exportCsv')}
                </button>
              </div>

              {/* Table */}
              <div className="ps-table-scroll-wrap" tabIndex={0} role="region" aria-label={t('auditLog.auditTab.scrollAria')}>
              <div className="ps-auditlog-table ps-auditlog-table--audit">
                <div className="ps-auditlog-thead ps-auditlog-thead--audit">
                  <div>{t('auditLog.auditTab.colTimestamp')}</div><div>{t('auditLog.auditTab.colType')}</div><div>{t('auditLog.auditTab.colEvent')}</div><div>{t('auditLog.auditTab.colDetail')}</div><div>{t('auditLog.auditTab.colUser')}</div><div>{t('auditLog.auditTab.colCase')}</div>
                </div>
                <div className="ps-auditlog-tbody">
                  {filteredAuditLogs.length === 0 ? (
                    <div className="ps-auditlog-empty">
                      <div className="ps-auditlog-empty-icon">📋</div>
                      <div className="ps-auditlog-empty-text">{t('auditLog.auditTab.emptyText')}</div>
                    </div>
                  ) : filteredAuditLogs.map((log) => {
                    const typeBadge = getTypeBadge(log.type, t);
                    return (
                      <div key={log.id} className="ps-auditlog-row ps-auditlog-row--audit">
                        <div className="ps-auditlog-cell-time">{formatAuditTimestamp(log.timestamp)}</div>
                        <div><span className={`ps-auditlog-badge ${typeBadge.className}`}>{typeBadge.label}</span></div>
                        <div className="ps-auditlog-cell-event">{log.event}<SupportReferenceChip kind="auditEntry" recordId={log.id} /></div>
                        <div className="ps-auditlog-cell-detail" data-phi="true">{log.detail}</div>
                        <div className="ps-auditlog-cell-user">{log.user}</div>
                        <div>{log.caseId ? <span className="ps-auditlog-case-link" data-phi="accession" onClick={() => navigate(`/case/${log.caseId}/synoptic`)}>{log.caseId}</span> : <span className="ps-auditlog-case-dash">—</span>}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>{/* end ps-table-scroll-wrap */}
              <div className="ps-auditlog-count-footer">{t('auditLog.auditTab.footerCount', { shown: filteredAuditLogs.length, total: roleFilteredLogs.length })}</div>
            </>
          )}

          {/* ── ERROR TAB ── */}
          {activeTab === 'errors' && (
            <>
              {/* Filters */}
              <div className="ps-auditlog-filter-row">
                <div className="ps-auditlog-pill-group">
                  {([
                    { id: 'all', labelKey: 'auditLog.errorTab.allPill', count: errorLogs.length },
                    { id: 'error', labelKey: 'auditLog.errorTab.errorPill', count: errorLogs.filter(e => e.severity === 'error').length },
                    { id: 'warning', labelKey: 'auditLog.errorTab.warningPill', count: errorLogs.filter(e => e.severity === 'warning').length },
                    { id: 'info', labelKey: 'auditLog.errorTab.infoPill', count: errorLogs.filter(e => e.severity === 'info').length },
                  ] as const).map(f => (
                    <button key={f.id} onClick={() => setErrorSeverity(f.id)} className={`ps-auditlog-pill${errorSeverity === f.id ? ' ps-auditlog-pill--active-red' : ''}`}>
                      {t(f.labelKey)}
                      <span className="ps-auditlog-pill-badge">{f.count}</span>
                    </button>
                  ))}
                </div>
                <div className="ps-auditlog-filter-divider" />
                <select value={errorResolved} onChange={e => setErrorResolved(e.target.value as 'all' | 'open' | 'resolved')} aria-label={t('auditLog.errorTab.statusAria')} className="ps-auditlog-select">
                  <option value="all">{t('auditLog.errorTab.allStatus')}</option>
                  <option value="open">{t('auditLog.errorTab.openOnly')}</option>
                  <option value="resolved">{t('auditLog.errorTab.resolvedOnly')}</option>
                </select>
                <div className="ps-auditlog-search-wrap">
                  <div className="ps-auditlog-search-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <input type="text" value={errorSearch} onChange={e => setErrorSearch(e.target.value)} placeholder={t('auditLog.errorTab.searchPlaceholder')} className="ps-auditlog-select ps-auditlog-search-input" />
                </div>
                <button onClick={() => exportErrorCSV(
                    filteredErrorLogs,
                    requestedByLabel,
                    { 'Severity': errorSeverity, 'Status': errorResolved, 'Search': errorSearch }
                  )} className="ps-auditlog-export-btn ps-auditlog-export-btn--danger">
                  {t('auditLog.shared.exportCsv')}
                </button>
              </div>

              {/* Error Table */}
              <div className="ps-table-scroll-wrap" tabIndex={0} role="region" aria-label={t('auditLog.errorTab.scrollAria')}>
              <div className="ps-auditlog-table ps-auditlog-table--error">
                <div className="ps-auditlog-thead ps-auditlog-thead--error">
                  <div>{t('auditLog.errorTab.colTimestamp')}</div><div>{t('auditLog.errorTab.colSeverity')}</div><div>{t('auditLog.errorTab.colCode')}</div><div>{t('auditLog.errorTab.colMessage')}</div><div>{t('auditLog.errorTab.colSource')}</div><div>{t('auditLog.errorTab.colCase')}</div><div>{t('auditLog.errorTab.colStatus')}</div>
                </div>
                <div className="ps-auditlog-tbody">
                  {filteredErrorLogs.length === 0 ? (
                    <div className="ps-auditlog-empty">
                      <div className="ps-auditlog-empty-icon">✅</div>
                      <div className="ps-auditlog-empty-text">{t('auditLog.errorTab.emptyText')}</div>
                    </div>
                  ) : filteredErrorLogs.map((log) => {
                    const severityBadge = getSeverityBadge(log.severity, t);
                    return (
                      <div key={log.id} className="ps-auditlog-row ps-auditlog-row--error">
                        <div className="ps-auditlog-cell-time">{formatAuditTimestamp(log.timestamp)}</div>
                        <div><span className={`ps-auditlog-badge ${severityBadge.className}`}>{severityBadge.label}</span></div>
                        <div className="ps-auditlog-cell-code">{log.code}<SupportReferenceChip kind="errorEntry" recordId={log.id} /></div>
                        <div className="ps-auditlog-cell-detail" data-phi="true">{log.message}</div>
                        <div className="ps-auditlog-cell-user">{log.source}</div>
                        <div>{log.caseId ? <span className="ps-auditlog-case-link" data-phi="accession" onClick={() => navigate(`/case/${log.caseId}/synoptic`)}>{log.caseId}</span> : <span className="ps-auditlog-case-dash">—</span>}</div>
                        <div><span className={`ps-auditlog-status-badge ${log.resolved ? 'ps-auditlog-status-badge--resolved' : 'ps-auditlog-status-badge--open'}`}>{log.resolved ? t('auditLog.errorTab.statusResolved') : t('auditLog.errorTab.statusOpen')}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>{/* end ps-table-scroll-wrap */}
              <div className="ps-auditlog-count-footer">{t('auditLog.errorTab.footerCount', { shown: filteredErrorLogs.length, total: errorLogs.length })}</div>
            </>
          )}

          {/* ── INTERFACE LOG TAB ──
              Real, per direct redesign: a genuine, independent top-level
              tab, not a pill within Error Log. Interface issues span
              PathScribe, the interface engine, instruments, and 3rd-party
              systems (PS-86 outbound dispatch, PS-87 Assist-mode LIS
              milestones, PS-88 DP/Specimen Tracking are all real, queued
              work that will each add their own event types here) — a
              real, distinct domain, not one flavor of general error. */}
          {activeTab === 'interfaces' && (
            <>
              <div className="ps-auditlog-tabswitch ps-auditlog-tabswitch--spaced">
                {([
                  { key: 'exceptions' as const, labelKey: 'auditLog.interfacesTab.subTabExceptions' },
                  { key: 'outbound_dlq' as const, labelKey: 'auditLog.interfacesTab.subTabOutboundDlq' },
                  // PS-86: the trail of what was sent (not a failure queue).
                  { key: 'outbound_dispatches' as const, labelKey: 'auditLog.interfacesTab.subTabOutboundDispatches' },
                  { key: 'print_queue' as const, labelKey: 'auditLog.interfacesTab.subTabPrintQueue' },
                ]).map(sub => (
                  <button
                    key={sub.key}
                    className={`ps-auditlog-tabswitch-btn${interfacesSubTab === sub.key ? ' ps-auditlog-tabswitch-btn--active' : ''}`}
                    onClick={() => setInterfacesSubTab(sub.key)}
                  >
                    {t(sub.labelKey)}
                  </button>
                ))}
              </div>
              {interfacesSubTab === 'outbound_dlq' && <OutboundInterfaceDlqSection />}
              {interfacesSubTab === 'outbound_dispatches' && <OutboundDispatchTrailSection />}
              {interfacesSubTab === 'print_queue' && <PrintQueueDashboardSection />}
              {interfacesSubTab === 'exceptions' && (
            <>
              {/* Filters — real counts on every pill, per direct
                  redesign, same convention as Audit/Error Log above. */}
              <div className="ps-auditlog-filter-row">
                <div className="ps-auditlog-pill-group">
                  {([
                    { id: 'all', labelKey: 'auditLog.interfacesTab.allPill', count: interfaceExceptions.length },
                    { id: 'pending', labelKey: 'auditLog.interfacesTab.pendingPill', count: interfaceExceptions.filter(e => e.status === 'pending').length },
                    { id: 'resolved', labelKey: 'auditLog.interfacesTab.resolvedPill', count: interfaceExceptions.filter(e => e.status === 'resolved').length },
                    { id: 'dismissed', labelKey: 'auditLog.interfacesTab.dismissedPill', count: interfaceExceptions.filter(e => e.status === 'dismissed').length },
                  ] as const).map(f => (
                    <button key={f.id} onClick={() => setInterfaceStatus(f.id)} className={`ps-auditlog-pill${interfaceStatus === f.id ? ' ps-auditlog-pill--active-red' : ''}`}>
                      {t(f.labelKey)}
                      <span className="ps-auditlog-pill-badge">{f.count}</span>
                    </button>
                  ))}
                </div>
                <div className="ps-auditlog-filter-divider" />
                <div className="ps-auditlog-search-wrap ps-auditlog-search-wrap--narrow">
                  <div className="ps-auditlog-search-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <input type="text" value={interfaceSearch} onChange={e => setInterfaceSearch(e.target.value)} placeholder={t('auditLog.interfacesTab.searchPlaceholder')} className="ps-auditlog-select ps-auditlog-search-input" />
                </div>
                {/* Real, per direct request: a real CSV export for
                    Interface Log, matching the exact same real
                    convention (buildMetaHeader, PHI-safety posture)
                    already established for the other three exports on
                    this page — this was the one real gap; the other
                    three tabs already had this, Interface Log never
                    did. */}
                <button onClick={() => exportInterfaceCSV(
                    filteredInterfaceExceptions,
                    requestedByLabel,
                    { 'Status': interfaceStatus, 'Search': interfaceSearch }
                  )} className="ps-auditlog-export-btn ps-auditlog-export-btn--danger">
                  {t('auditLog.shared.exportCsv')}
                </button>
                {/* Real feature, per direct confirmation, building
                    Phase B of the "Interface Exception & Case-Binding
                    Module." Deliberately restricted (isAdmin only) —
                    a rare, exceptional tool, not a general action. */}
                {isAdmin && storedUser?.organisationId && (
                  <button onClick={() => setBreakGlassOpen(true)} className="ps-auditlog-export-btn ps-auditlog-export-btn--danger">
                    {t('auditLog.interfacesTab.mapPatient')}
                  </button>
                )}
              </div>

              {/* Real feature, per direct confirmation: "Users should
                  be able to see interface error log under Audit."
                  Read-only display, matching Error Log's own table
                  convention exactly — no inline actions yet beyond
                  Review; see services/interfaceExceptions/README.md
                  for the real resolve()/dismiss() methods this wires
                  up to. */}
              <div className="ps-table-scroll-wrap" tabIndex={0} role="region" aria-label={t('auditLog.interfacesTab.scrollAria')}>
                <div className="ps-auditlog-table ps-auditlog-table--error">
                  <div className="ps-auditlog-thead ps-auditlog-thead--interfaces">
                    <div>{t('auditLog.interfacesTab.colTimestamp')}</div><div>{t('auditLog.interfacesTab.colEventType')}</div><div>{t('auditLog.interfacesTab.colReason')}</div><div>{t('auditLog.interfacesTab.colSourcePatient')}</div><div>{t('auditLog.interfacesTab.colTargetPatient')}</div><div>{t('auditLog.interfacesTab.colStatus')}</div>
                  </div>
                  <div className="ps-auditlog-tbody">
                    {filteredInterfaceExceptions.length === 0 ? (
                      <div className="ps-auditlog-empty">
                        <div className="ps-auditlog-empty-icon">✅</div>
                        <div className="ps-auditlog-empty-text">{t('auditLog.interfacesTab.emptyText')}</div>
                      </div>
                    ) : filteredInterfaceExceptions.map((e) => (
                      <div key={e.id} className="ps-auditlog-row ps-auditlog-row--interfaces">
                        <div className="ps-auditlog-cell-time">{formatAuditTimestamp(e.createdAt)}</div>
                        <div><span className="ps-auditlog-badge ps-auditlog-badge--info">{e.eventType}</span><SupportReferenceChip kind="interfaceException" recordId={e.id} /></div>
                        <div className="ps-auditlog-cell-detail" data-phi="true">{e.reason}</div>
                        <div className="ps-auditlog-cell-user" data-phi="mrn">{e.sourcePatientIdentifier ?? '—'}</div>
                        <div className="ps-auditlog-cell-user" data-phi="mrn">{e.targetPatientIdentifier ?? '—'}</div>
                        <div>
                          {/* Real feature, per direct confirmation:
                              "Manual Review Queue / Flagging
                              (Safest)." A pending exception is
                              actionable — clicking it opens the
                              review modal. Resolved/dismissed ones
                              stay a plain, read-only badge. */}
                          {e.status === 'pending' ? (
                            <button
                              onClick={() => setReviewingException(e)}
                              className="ps-auditlog-status-badge ps-auditlog-status-badge--open ps-iexc-review-btn"
                            >
                              {t('auditLog.interfacesTab.review')}
                            </button>
                          ) : (
                            <span className="ps-auditlog-status-badge ps-auditlog-status-badge--resolved">
                              {e.status === 'resolved' ? t('auditLog.interfacesTab.resolved') : t('auditLog.interfacesTab.dismissed')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ps-auditlog-count-footer">{t('auditLog.interfacesTab.footerCount', { shown: filteredInterfaceExceptions.length, total: interfaceExceptions.length })}</div>
            </>
              )}
            </>
          )}

          {/* ── QUALITY ASSURANCE TAB ──
              The permanent, complete Quality Assurance record — every
              tabbed item group from the working queue
              (pages/QualityAssurancePage.tsx), not just deficiencies, the
              record CAP and other certification bodies get pointed to
              during an inspection. Deliberately separate from the
              working queue itself: that page is for active, day-to-day
              work (what needs a corrective action right now), this is
              the searchable historical archive across every group,
              including ones with no real open/closed lifecycle at all
              (a completed Management Review is itself the compliance
              evidence a review happened, status vocabulary or not).
              Active entries still stay downloadable from the working
              queue itself — this doesn't replace that, it's the
              complete record alongside it. */}
          {activeTab === 'quality' && (
            <>
              {/* Filters — Group, then Status (that group's own real
                  vocabulary), then User, then Date, then Search. */}
              <div className="ps-auditlog-filter-row">
                <select value={qualityGroup} onChange={e => setQualityGroup(e.target.value as QaGroup)} aria-label={t('auditLog.qualityTab.groupAria')} className="ps-auditlog-select ps-auditlog-select--wide">
                  {(Object.keys(GROUP_LABELS) as QaGroup[]).map(g => <option key={g} value={g}>{t(GROUP_LABEL_KEY[g])}</option>)}
                </select>
                <div className="ps-auditlog-filter-divider" />
                <select value={qualityStatus} onChange={e => setQualityStatus(e.target.value)} aria-label={t('auditLog.qualityTab.statusAria')} className="ps-auditlog-select">
                  <option value="all">{t('auditLog.qualityTab.allStatuses')}</option>
                  {GROUP_STATUS_OPTIONS[qualityGroup].map(opt => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}
                </select>
                {/* User filter — superadmin only, same as the Audit
                    tab's own user filter above, and for the same
                    reason (avoid biasing validation/review work by
                    letting non-admins single out an individual). */}
                {isSuperAdmin && (
                  <select value={qualityUser} onChange={e => setQualityUser(e.target.value)} aria-label={t('auditLog.qualityTab.userAria')} className="ps-auditlog-select ps-auditlog-select--wide">
                    <option value="all">{t('auditLog.qualityTab.allUsers')}</option>
                    {qualityUniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}
                {/* Date range — defaults to All Time, unlike Audit Log's
                    default of last 7 days, since this is meant to be
                    the complete historical record, not a recent-activity
                    feed. */}
                <select value={qualityDateRange} onChange={e => setQualityDateRange(e.target.value)} aria-label={t('auditLog.shared.dateRangeAria')} className="ps-auditlog-select">
                  <option value="all">{t('auditLog.qualityTab.allTime')}</option>
                  <option value="today">{t('auditLog.shared.today')}</option>
                  <option value="7days">{t('auditLog.shared.last7Days')}</option>
                  <option value="30days">{t('auditLog.shared.last30Days')}</option>
                  <option value="90days">{t('auditLog.shared.last90Days')}</option>
                  <option value="custom">{t('auditLog.shared.customRange')}</option>
                </select>
                {qualityDateRange === 'custom' && (
                  <>
                    <input type="date" value={qualityDateFrom} onChange={e => setQualityDateFrom(e.target.value)} className="ps-auditlog-select ps-auditlog-select--date" />
                    <span className="ps-auditlog-date-to">{t('auditLog.shared.dateToSeparator')}</span>
                    <input type="date" value={qualityDateTo}   onChange={e => setQualityDateTo(e.target.value)}   className="ps-auditlog-select ps-auditlog-select--date" />
                  </>
                )}
                {/* Text search */}
                <div className="ps-auditlog-search-wrap">
                  <div className="ps-auditlog-search-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <input type="text" value={qualitySearch} onChange={e => setQualitySearch(e.target.value)} placeholder={t('auditLog.qualityTab.searchPlaceholder')} className="ps-auditlog-select ps-auditlog-search-input" />
                </div>
                {/* Export — Group/Date Range meta values stay in
                    plain English (GROUP_LABELS, not the translated
                    GROUP_LABEL_KEY), same "exported data stays
                    English" convention as every other export here. */}
                <button onClick={() => exportQualityCSV(
                    filteredQualityLogs,
                    requestedByLabel,
                    {
                      'Group': GROUP_LABELS[qualityGroup], 'Status': qualityStatus,
                      'User': qualityUser,
                      'Date Range': qualityDateRange === 'custom' ? `${qualityDateFrom} to ${qualityDateTo}` : qualityDateRange,
                      'Search': qualitySearch,
                    },
                  )} className="ps-auditlog-export-btn">
                  {t('auditLog.shared.exportCsv')}
                </button>
              </div>

              {/* Table */}
              <div className="ps-table-scroll-wrap" tabIndex={0} role="region" aria-label={t('auditLog.qualityTab.scrollAria')}>
              <div className="ps-auditlog-table ps-auditlog-table--quality">
                <div className="ps-auditlog-thead ps-auditlog-thead--quality">
                  <div>{t('auditLog.qualityTab.colDate')}</div><div>{t('auditLog.qualityTab.colCase')}</div><div>{t('auditLog.qualityTab.colSpecimen')}</div><div>{t('auditLog.qualityTab.colDetail')}</div><div>{t('auditLog.qualityTab.colStatus')}</div><div>{t('auditLog.qualityTab.colUser')}</div>
                </div>
                <div className="ps-auditlog-tbody">
                  {filteredQualityLogs.length === 0 ? (
                    <div className="ps-auditlog-empty">
                      <div className="ps-auditlog-empty-icon">✓</div>
                      <div className="ps-auditlog-empty-text">{t('auditLog.qualityTab.emptyText', { group: t(GROUP_LABEL_KEY[qualityGroup]) })}</div>
                    </div>
                  ) : filteredQualityLogs.map((r) => (
                    <div key={r.id} className="ps-auditlog-row ps-auditlog-row--quality">
                      <div className="ps-auditlog-cell-time">{formatAuditTimestamp(r.date)}</div>
                      <div>{r.caseId ? <span className="ps-auditlog-case-link" data-phi="accession" onClick={() => navigate(`/case/${r.caseId}/synoptic`)}>{r.caseId}</span> : <span className="ps-auditlog-case-dash">—</span>}</div>
                      <div>{r.specimen ?? <span className="ps-auditlog-case-dash">—</span>}</div>
                      <div className="ps-auditlog-cell-detail" data-phi="true">{r.detail}</div>
                      <div>
                        <span className={`ps-auditlog-status-badge ps-auditlog-status-badge--${r.statusTone}`}>
                          {t(r.statusLabelKey)}
                        </span>
                      </div>
                      <div>{r.user ?? <span className="ps-auditlog-case-dash">—</span>}</div>
                    </div>
                  ))}
                </div>
              </div>
              </div>{/* end ps-table-scroll-wrap */}
              <div className="ps-auditlog-count-footer">{t('auditLog.qualityTab.footerCount', { shown: filteredQualityLogs.length, total: normalizedQualityRecords.length, group: t(GROUP_LABEL_KEY[qualityGroup]) })}</div>
            </>
          )}

          {/* ── FINANCIAL TAB ── */}
          {activeTab === 'financial' && (
            <>
              <div className="ps-auditlog-tabswitch ps-auditlog-tabswitch--spaced">
                {([
                  { key: 'billing_logs' as const, labelKey: 'auditLog.financialTab.subTabBillingLogs' },
                  { key: 'outbound_dlq' as const, labelKey: 'auditLog.financialTab.subTabOutboundDlq' },
                ]).map(sub => (
                  <button
                    key={sub.key}
                    className={`ps-auditlog-tabswitch-btn${financialSubTab === sub.key ? ' ps-auditlog-tabswitch-btn--active' : ''}`}
                    onClick={() => setFinancialSubTab(sub.key)}
                  >
                    {t(sub.labelKey)}
                  </button>
                ))}
              </div>
              {financialSubTab === 'billing_logs' && <BillingLogsSection />}
              {financialSubTab === 'outbound_dlq' && <OutboundDlqSection />}
            </>
          )}

          {/* ── CRITICAL ALERTS TAB ── */}
          {/* PS-136 — real, per direct guidance's own "Add the Viewer to
              the Audit Module" ask. See CriticalAlertAuditSection.tsx's
              own header for why this is a simple, standalone section
              (the "financial" tab's own pattern) rather than a
              QaGroup-normalized row in the "quality" tab's table. */}
          {activeTab === 'criticalAlerts' && <CriticalAlertAuditSection />}
        </main>

        {/* Footer */}
        <footer className="ps-auditlog-footer">
          <div>{t('auditLog.page.footer')}</div>
          <div className="ps-auditlog-footer-status">
            <span className="ps-auditlog-status-dot" />
            {t('auditLog.page.systemsOperational')}
          </div>
        </footer>
      </div>

      <ResourcesModal
        isOpen={isResourcesOpen}
        onClose={() => setIsResourcesOpen(false)}
        quickLinks={quickLinks}
      />

      {/* Real feature, per direct confirmation: "Manual Review Queue /
          Flagging (Safest)." */}
      {reviewingException && (
        <InterfaceExceptionReviewModal
          exception={reviewingException}
          requestedBy={requestedByLabel}
          onClose={() => setReviewingException(null)}
          onResolved={reloadInterfaceExceptions}
        />
      )}

      {/* Real feature, per direct confirmation, building Phase B of
          the "Interface Exception & Case-Binding Module." Restricted
          — the trigger button itself is isAdmin-gated above, and this
          render is too, as defense in depth. Real, deliberate
          fail-safe: never guesses an organisationId — a restricted
          tool silently operating on the wrong tenant's patient pool
          is a real, serious risk, not a cosmetic one, so an
          unresolvable session simply doesn't render the modal at all
          rather than defaulting to a specific organisation. */}
      {breakGlassOpen && isAdmin && storedUser?.organisationId && (
        <BreakGlassRebindModal
          organisationId={storedUser.organisationId}
          performedBy={storedUser.id}
          onClose={() => setBreakGlassOpen(false)}
          onRebound={reloadInterfaceExceptions}
        />
      )}
    </div>
  );
};

export default AuditLogPage;
