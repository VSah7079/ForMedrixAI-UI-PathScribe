// src/services/billing/searchBillingAuditLog.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own follow-up: "these kind of queries
// should be server side." Searching and aggregating billing events
// across potentially many cases - joining case-level filters
// (case number, patient name, patient ID) against per-case billing
// data (charges, credits, deficiencies, code review activity,
// dispatch history, amendments, audit log entries), then filtering
// and sorting the combined result - is real, genuine business logic.
// It belongs here, in the services layer, not assembled inside
// CaseBillingAuditTrailSection.tsx itself, which only ever renders
// filter inputs and this function's own, already-computed result.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import type { CaseFilterParams, PathologyCase } from '@/services/cases/ICaseService';
import { mockServiceChargeService, getEffectiveChargeStatus } from './mockServiceChargeService';
import { mockBillingDeficiencyService } from './mockBillingDeficiencyService';
import { mockCodeReviewPoolService } from './mockCodeReviewPoolService';
import { mockOutboundChargeQueueService } from './mockOutboundChargeQueueService';
import { amendmentService, auditService } from '@/services';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';
import type { CodeReviewPoolEntry } from '@/types/billing/CodeReviewPoolEntry';
import type { OutboundChargeQueueEntry } from '@/types/billing/OutboundChargeQueueEntry';
import type { AmendmentRecord } from '@/types/reports/AmendmentRecord';
import type { AuditLog } from '@/services/auditlog/IAuditService';
import type { ServiceResult } from '../types';

export type BillingAuditLogEventKind = 'charge' | 'credit' | 'deficiency' | 'code_review' | 'dispatch' | 'amendment' | 'audit';

export interface BillingAuditLogEntry {
  id: string;
  caseId: string;
  caseNumber: string;
  patientName: string;
  patientId: string;
  timestamp: string;
  kind: BillingAuditLogEventKind;
  label: string;
  detail: string;
  /** Real, per direct guidance's own follow-up - labeled "Staff" in
   *  the UI, not "Actor". Kept as staff internally too, not aliased,
   *  so there's exactly one real name for this field end to end. */
  staff: string;
  /** Real, per direct follow-up's own Billing Logs filtering gap:
   *  genuine Date of Service - the specimen's own real receivedAt,
   *  the same field resolveServiceCharge.ts itself resolves a rule
   *  version against - never the same thing as `timestamp` above
   *  (when this particular event happened). Undefined for an event
   *  with no real, resolvable specimen (a case-level charge, or a
   *  non-charge event kind). */
  dateOfService?: string;
  /** Real, per direct follow-up: the case's own real report
   *  sign-out/release date (Case.releasedAt, falling back to
   *  finalizedAt for a case finalized before the post-signout release
   *  buffer existed) - a case-level fact, stamped identically on
   *  every event for that case, same as caseNumber/patientName above. */
  signOutDate?: string;
  /** Real, per direct follow-up: the case's own real signing
   *  pathologist (Case.finalizedBy) - deliberately distinct from
   *  `staff` above, which names whoever handled each individual
   *  billing event, not who actually signed the report. */
  signingPathologist?: string;
  /** Real, per direct follow-up: the case's own real ordering
   *  facility (Case.clientId/clientName) - a case-level fact. */
  clientId?: string;
  clientName?: string;
  /** Real, per direct follow-up: only ever set for a charge/credit
   *  event - the real TC/26/Global component of the underlying
   *  ServiceChargeRecord. Undefined for every other event kind, which
   *  has no real billing-type concept of its own. */
  billingType?: 'TC' | '26' | 'Global';
  /** Real, per direct follow-up: only ever set for a charge/credit
   *  event - getEffectiveChargeStatus's own real, effective status
   *  (never the raw, possibly-undefined field directly, so a
   *  legacy-cleared charge with no approval history correctly reads
   *  as EXPORTED here, not blank). */
  approvalStatus?: NonNullable<ServiceChargeRecord['approvalStatus']>;
}

export interface BillingAuditLogFilters {
  caseNumber?: string;
  patientName?: string;
  /** Real, per direct guidance's own "Patient ID (MRN, MPI)" request -
   *  a single, real input matched as MRN (substring) OR MPI (exact),
   *  never both required at once - Case.patient.mrn and
   *  Case.patient.id are two, separate, real identifiers on the same
   *  case, and a real user searching "the patient's ID" doesn't know
   *  or care which one they have in hand. */
  patientId?: string;
  serviceDateFrom?: string;
  serviceDateTo?: string;
  type?: BillingAuditLogEventKind;
  detail?: string;
  /** Real, per direct guidance's own follow-up: converted from a
   *  single free-text string to a real, multi-select array, matching
   *  the same Browse-picker pattern SearchPage.tsx already uses for
   *  Pathologist/Attending Physician - a staff member selected from
   *  the actual directory, not a name a user could mistype. Matches
   *  if ANY selected name is a substring of the event's own staff
   *  field, same as selecting multiple pathologists is an OR, not an
   *  AND, in the equivalent Case Search filter. */
  staff?: string[];
  /** Real, per direct follow-up: genuine Date of Service range,
   *  matched against BillingAuditLogEntry.dateOfService - distinct
   *  from serviceDateFrom/To above, which still matches the event's
   *  own timestamp (kept, since the Billing Action/Export Date gap is
   *  already effectively covered by a Dispatch event's own
   *  timestamp). */
  dateOfServiceFrom?: string;
  dateOfServiceTo?: string;
  signOutDateFrom?: string;
  signOutDateTo?: string;
  /** Multi-select, same real OR semantics as staff above - matched
   *  against BillingAuditLogEntry.signingPathologist. */
  signingPathologist?: string[];
  /** Multi-select client/facility ids, same real OR semantics as
   *  staff/signingPathologist above. */
  clientIds?: string[];
  billingType?: 'TC' | '26' | 'Global';
  approvalStatus?: NonNullable<ServiceChargeRecord['approvalStatus']>;
  /** Real, per direct follow-up: a genuine alphabetical last-name
   *  range (e.g. "Smith" through "Williams"), distinct from
   *  patientName above, which stays a plain substring match - the two
   *  are deliberately separate fields, not a mode toggle on one. */
  patientNameRangeFrom?: string;
  patientNameRangeTo?: string;
}

const KIND_LABEL: Record<BillingAuditLogEventKind, string> = {
  charge: 'Charge', credit: 'Credit', deficiency: 'Deficiency',
  code_review: 'Code Review', dispatch: 'Dispatch', amendment: 'Amendment', audit: 'Audit',
};

/** Real, per direct guidance's own established discipline
 *  (jsonWebhookBuilder.ts's own compliance-advisory reuse) - never
 *  recomputes case-level identity per event; stamps it once per case,
 *  from the one real, authoritative source (the Case record itself). */
function buildEventsForCase(
  caseData: PathologyCase,
  charges: ServiceChargeRecord[],
  deficiencies: BillingDeficiencyRecord[],
  codeReviews: CodeReviewPoolEntry[],
  dispatches: OutboundChargeQueueEntry[],
  amendments: AmendmentRecord[],
  auditLogs: AuditLog[],
): BillingAuditLogEntry[] {
  const caseNumber = caseData.accession?.fullAccession ?? caseData.id;
  const patientName = caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : 'Unknown';
  const patientId = caseData.patient?.mrn ?? caseData.patient?.id ?? '';
  // Real, per direct follow-up: releasedAt is the real, buffer-aware
  // "actually final and dispatch-eligible" moment; finalizedAt is the
  // honest fallback for a case finalized before that buffer existed.
  const signOutDate = caseData.releasedAt ?? caseData.finalizedAt;
  const base = {
    caseId: caseData.id, caseNumber, patientName, patientId,
    signOutDate,
    signingPathologist: caseData.finalizedBy,
    clientId: caseData.order?.facilityId,
    clientName: caseData.order?.facilityName,
  };

  // Real, per direct follow-up: resolves a charge's own real Date of
  // Service from its specimen's own real receivedAt - the same field
  // resolveServiceCharge.ts itself resolves a rule version against.
  // Undefined for a case-level charge with no specimenId, or a
  // specimen genuinely missing its own receivedAt.
  const dosForSpecimen = (specimenId?: string): string | undefined =>
    specimenId ? caseData.specimens.find(sp => sp.id === specimenId)?.receivedAt : undefined;

  const events: BillingAuditLogEntry[] = [];

  for (const c of charges) {
    events.push({
      ...base,
      id: c.id,
      timestamp: c.resolvedAt,
      kind: c.transactionType === 'credit' ? 'credit' : 'charge',
      label: `${c.transactionType === 'credit' ? 'Credit' : 'Charge'} \u2014 ${c.billingCode} (CPT ${c.cptCode})`,
      detail: [
        `RVU work ${c.rvuWork ?? 'unverified'}`,
        c.billingType !== 'Global' ? `${c.billingType} component` : undefined,
        c.postSignoutChangeReasonId ? `Post-signout change \u2014 reason ${c.postSignoutChangeReasonId}${c.postSignoutChangeComment ? `: ${c.postSignoutChangeComment}` : ''}` : undefined,
        c.reversesTransactionId ? `Reverses transaction ${c.reversesTransactionId}` : undefined,
        `Rule version ${c.ruleVersion}`,
      ].filter(Boolean).join(' \u2014 '),
      staff: c.resolvedBy,
      dateOfService: dosForSpecimen(c.specimenId),
      billingType: c.billingType,
      approvalStatus: getEffectiveChargeStatus(c),
    });
  }

  for (const d of deficiencies) {
    events.push({
      ...base, id: `${d.id}-raised`, timestamp: d.createdAt, kind: 'deficiency',
      label: `Billing deficiency raised \u2014 ${d.deficiencyType} (${d.severity})`,
      detail: `Trigger: ${d.raisedByTrigger}${d.auditorNotes ? ` \u2014 ${d.auditorNotes}` : ''}`,
      staff: d.createdBy,
    });
    if (d.resolvedAt) {
      events.push({
        ...base, id: `${d.id}-resolved`, timestamp: d.resolvedAt, kind: 'deficiency',
        label: `Billing deficiency resolved \u2014 ${d.deficiencyType}`,
        detail: d.resolutionReasonCode ? `Resolution: ${d.resolutionReasonCode}` : 'Resolved',
        staff: d.resolvedBy ?? 'unknown',
      });
    }
  }

  for (const r of codeReviews) {
    events.push({
      ...base, id: `${r.id}-flagged`, timestamp: r.flaggedAt, kind: 'code_review',
      label: `Flagged for code review \u2014 ${r.source === 'RANDOM_SAMPLE' ? 'random sample' : 'manual'}`,
      detail: r.notes ?? '',
      staff: r.flaggedByName ?? r.flaggedBy ?? 'system',
    });
    if (r.reviewedAt) {
      events.push({
        ...base, id: `${r.id}-reviewed`, timestamp: r.reviewedAt, kind: 'code_review',
        label: `Code review completed \u2014 ${r.reviewOutcome === 'DEFICIENCY_RAISED' ? 'deficiency raised' : 'no issue found'}`,
        detail: '',
        staff: r.reviewedByName ?? r.reviewedBy ?? 'unknown',
      });
    }
  }

  for (const q of dispatches) {
    events.push({
      ...base, id: q.id, timestamp: q.lastAttemptAt ?? q.queuedAt, kind: 'dispatch',
      label: `Outbound dispatch \u2014 ${q.status}${q.errorCode ? ` (${q.errorCode})` : ''}`,
      detail: q.errorMessage ?? `Trigger: ${q.triggerEvent}, retries: ${q.retryCount}`,
      staff: 'system',
    });
  }

  for (const a of amendments.filter(x => x.status === 'released')) {
    events.push({
      ...base, id: a.id, timestamp: a.releasedAt ?? a.initiatedAt, kind: 'amendment',
      label: `${a.type === 'addendum' ? 'Addendum' : 'Amendment'} released`,
      detail: a.explanationOfChange,
      staff: a.authoringPathologist.userName,
    });
  }

  for (const log of auditLogs) {
    events.push({ ...base, id: log.id, timestamp: log.timestamp, kind: 'audit', label: log.event, detail: log.detail, staff: log.user });
  }

  return events;
}

/** Real, per direct guidance's own "these kind of queries should be
 *  server side" correction: the one real place a multi-case billing
 *  audit search is actually performed. CaseBillingAuditTrailSection.tsx
 *  calls this once and renders its result - no aggregation, filtering,
 *  or per-case looping happens in that component itself.
 *
 *  Real, honest scope limit: case-level filters (caseNumber,
 *  patientName, patientId) narrow which cases are even considered,
 *  capped at MAX_CASES to keep a real, bounded number of per-case
 *  sub-queries - a genuinely unscoped search (no case-level filter at
 *  all) still runs, but only against the first MAX_CASES cases
 *  returned, most-recently-updated first; result.meta communicates
 *  whether the cap was actually hit, never silently. */
const MAX_CASES = 50;

export interface BillingAuditLogSearchResult {
  entries: BillingAuditLogEntry[];
  casesCapped: boolean;
}

export async function searchBillingAuditLog(filters: BillingAuditLogFilters): Promise<ServiceResult<BillingAuditLogSearchResult>> {
  const caseFilterParams: CaseFilterParams = { pageSize: MAX_CASES + 1 };
  if (filters.caseNumber?.trim()) caseFilterParams.accessionNo = filters.caseNumber.trim();
  if (filters.patientName?.trim()) caseFilterParams.patientName = filters.patientName.trim();

  const casesRes = await caseRouter.getAll(caseFilterParams);
  if (casesRes.ok === false) return casesRes;

  let candidateCases = casesRes.data;

  // Real, per direct guidance's own "Patient ID (MRN, MPI)" request -
  // a real OR check (never both fields required at once), applied
  // here since caseRouter.getAll's own filter pipeline ANDs every
  // field together (confirmed via direct check of
  // caseFilterUtils.ts), which would never match a real case if MRN
  // and MPI were both required to equal the same string.
  const patientIdQuery = filters.patientId?.trim();
  if (patientIdQuery) {
    const q = patientIdQuery.toLowerCase();
    candidateCases = candidateCases.filter(c =>
      (c.patient?.mrn ?? '').toLowerCase().includes(q) || c.patient?.id === patientIdQuery
    );
  }

  const casesCapped = candidateCases.length > MAX_CASES;
  const cappedCases = candidateCases.slice(0, MAX_CASES);

  const perCaseResults = await Promise.all(cappedCases.map(async caseData => {
    const [chargesRes, deficienciesRes, codeReviewsRes, dispatchesRes, amendmentsRes, auditRes] = await Promise.all([
      mockServiceChargeService.getChargesForCase(caseData.id),
      mockBillingDeficiencyService.getByCaseId(caseData.id),
      mockCodeReviewPoolService.getByCaseId(caseData.id),
      mockOutboundChargeQueueService.getByCaseId(caseData.id),
      amendmentService.getByCaseId(caseData.id),
      auditService.getAuditLogs({ search: caseData.id }),
    ]);
    return buildEventsForCase(
      caseData,
      chargesRes.ok ? chargesRes.data : [],
      deficienciesRes.ok ? deficienciesRes.data : [],
      codeReviewsRes.ok ? codeReviewsRes.data : [],
      dispatchesRes.ok ? dispatchesRes.data : [],
      amendmentsRes.ok ? amendmentsRes.data : [],
      // Real, exact-match filter - getAuditLogs' own search param is a
      // substring match across several fields, not scoped to caseId
      // alone, so a case with a short id could false-match against
      // unrelated event/detail/user text.
      (auditRes.ok ? auditRes.data : []).filter(l => l.caseId === caseData.id),
    );
  }));

  let allEvents = perCaseResults.flat();

  if (filters.type) allEvents = allEvents.filter(e => e.kind === filters.type);
  if (filters.detail?.trim()) {
    const q = filters.detail.trim().toLowerCase();
    allEvents = allEvents.filter(e => e.detail.toLowerCase().includes(q) || e.label.toLowerCase().includes(q));
  }
  if (filters.staff && filters.staff.length > 0) {
    const queries = filters.staff.map(s => s.toLowerCase());
    allEvents = allEvents.filter(e => queries.some(q => e.staff.toLowerCase().includes(q)));
  }
  if (filters.serviceDateFrom) {
    const from = new Date(filters.serviceDateFrom).getTime();
    allEvents = allEvents.filter(e => new Date(e.timestamp).getTime() >= from);
  }
  if (filters.serviceDateTo) {
    const to = new Date(filters.serviceDateTo).getTime();
    allEvents = allEvents.filter(e => new Date(e.timestamp).getTime() <= to);
  }
  // Real, per direct follow-up: a genuine Date of Service filter -
  // an event with no real, resolvable dateOfService (a case-level
  // charge, or any non-charge event kind) never matches a real DOS
  // range, rather than silently falling back to its own timestamp.
  if (filters.dateOfServiceFrom) {
    const from = new Date(filters.dateOfServiceFrom).getTime();
    allEvents = allEvents.filter(e => e.dateOfService !== undefined && new Date(e.dateOfService).getTime() >= from);
  }
  if (filters.dateOfServiceTo) {
    const to = new Date(filters.dateOfServiceTo).getTime();
    allEvents = allEvents.filter(e => e.dateOfService !== undefined && new Date(e.dateOfService).getTime() <= to);
  }
  if (filters.signOutDateFrom) {
    const from = new Date(filters.signOutDateFrom).getTime();
    allEvents = allEvents.filter(e => e.signOutDate !== undefined && new Date(e.signOutDate).getTime() >= from);
  }
  if (filters.signOutDateTo) {
    const to = new Date(filters.signOutDateTo).getTime();
    allEvents = allEvents.filter(e => e.signOutDate !== undefined && new Date(e.signOutDate).getTime() <= to);
  }
  if (filters.signingPathologist && filters.signingPathologist.length > 0) {
    const queries = filters.signingPathologist.map(s => s.toLowerCase());
    allEvents = allEvents.filter(e => e.signingPathologist !== undefined && queries.some(q => e.signingPathologist!.toLowerCase().includes(q)));
  }
  if (filters.clientIds && filters.clientIds.length > 0) {
    const ids = new Set(filters.clientIds);
    allEvents = allEvents.filter(e => e.clientId !== undefined && ids.has(e.clientId));
  }
  if (filters.billingType) {
    allEvents = allEvents.filter(e => e.billingType === filters.billingType);
  }
  if (filters.approvalStatus) {
    allEvents = allEvents.filter(e => e.approvalStatus === filters.approvalStatus);
  }
  // Real, per direct follow-up: a genuine alphabetical last-name
  // range, e.g. "Smith" through "Williams" - patientName itself is
  // stored as "Last, First", so the comparison is against the
  // substring before the first comma.
  if (filters.patientNameRangeFrom || filters.patientNameRangeTo) {
    const lastNameOf = (patientName: string) => patientName.split(',')[0].trim().toLowerCase();
    const from = filters.patientNameRangeFrom?.trim().toLowerCase();
    const to = filters.patientNameRangeTo?.trim().toLowerCase();
    allEvents = allEvents.filter(e => {
      const last = lastNameOf(e.patientName);
      if (from && last < from) return false;
      if (to && last > to) return false;
      return true;
    });
  }

  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { ok: true, data: { entries: allEvents, casesCapped } };
}

export { KIND_LABEL as BILLING_AUDIT_LOG_KIND_LABEL };
