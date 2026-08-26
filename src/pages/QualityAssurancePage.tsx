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
import { useNavigate, useLocation } from 'react-router-dom';
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
import { mockBillingDeficiencyService } from '@/services/billing/mockBillingDeficiencyService';
import { mockOutboundChargeQueueService } from '@/services/billing/mockOutboundChargeQueueService';
import { mockCodeReviewPoolService } from '@/services/billing/mockCodeReviewPoolService';
import { correctServiceCharge } from '@/services/billing/correctServiceCharge';
import { mockCaseService } from '@/services/cases/mockCaseService';
import { mockReasonDictionaryService } from '@/services/reasons/mockReasonDictionaryService';
import { isCaseSignedOutForBilling } from '@/services/billing/isCaseSignedOutForBilling';
import type { ReasonDictionaryEntry } from '@/types/reasons/ReasonDictionaryEntry';
import { auditService } from '@/services';
import type { BillingDeficiencyRecord, BillingDeficiencyType } from '@/types/billing/BillingDeficiencyRecord';
import type { CodeReviewPoolEntry } from '@/types/billing/CodeReviewPoolEntry';

type Pillar = 'operations' | 'financials' | 'capa';
// Real, per direct guidance: "CAPA Engine only ever sees things once
// they've been escalated or closed" - Operations owns the raw,
// still-open deficiency list; CAPA Engine only sees items once a
// corrective action has actually been taken ('pending-verification',
// now surfaced here as 'escalated') or fully closed. Deliberately not
// a genuinely new status - 'pending-verification' already meant
// exactly this (a corrective action taken, awaiting a real
// effectiveness check), just previously shown alongside 'open' items
// in the same tab. This tab split is what changed, not the lifecycle
// itself.
type Tab = 'case-specimen' | 'escalated' | 'closed' | 'reviews' | 'intraop-linkage' | 'discordance' | 'countersign' | 'fppe' | 'drift-correction' | 'patient-match-review' | 'access-requests' | 'financials-open' | 'financials-resolved' | 'financials-code-review';

// Real, per direct guidance on the QA reorganization: which tabs
// belong to which pillar. Operations = the raw deficiency list plus
// every existing Clinical Quality Metrics tab, matching the reference
// document's own Operations definition almost verbatim. CAPA Engine =
// governance over what's already been escalated or closed (see Tab's
// own comment above). Financials now shows real BillingDeficiencyRecord
// entries (Trigger A/B, raised at sign-out) - "Billing & Coding
// Deficiencies" from the reference document's own Section 1. "Payer &
// Pre-Auth Audits" from that same section stays deliberately absent -
// no real detection mechanism for those exists yet, and fabricating
// empty tabs for them would misrepresent what this pillar actually does.
const PILLAR_TABS: Record<Pillar, Tab[]> = {
  operations: ['case-specimen', 'intraop-linkage', 'discordance', 'countersign', 'fppe', 'drift-correction', 'patient-match-review', 'access-requests'],
  capa: ['escalated', 'closed', 'reviews'],
  financials: ['financials-open', 'financials-resolved', 'financials-code-review'],
};

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
  onResolve: (resolutionTypeId: string, correctiveAction: string, rootCause: string, preventiveAction: string, verificationDueDate: string) => void;
  onClose: () => void;
}> = ({ deficiency, resolutionTypes, onResolve, onClose }) => {
  const [resolutionTypeId, setResolutionTypeId] = useState(resolutionTypes[0]?.id ?? '');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [preventiveAction, setPreventiveAction] = useState('');
  const defaultDue = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [verificationDueDate, setVerificationDueDate] = useState(defaultDue);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Escalate to CAPA</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {deficiency.specimenLabel ? `Specimen ${deficiency.specimenLabel}, ` : ''}case {deficiency.caseId} — {deficiency.comment || 'no additional detail recorded'}
          </p>
          <p className="ps-fixgate-intro">
            This moves to <strong>Pending Verification</strong> in CAPA Engine, not Closed — someone still needs to
            come back and confirm the corrective action actually worked.
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
            <label className="ps-conf-label" htmlFor="resolve-root-cause">Root Cause <span className="ps-conf-required">*</span></label>
            <textarea id="resolve-root-cause" className="ps-conf-input ps-conf-textarea" value={rootCause} onChange={e => setRootCause(e.target.value)}
              placeholder="Why did this actually happen — the real, underlying cause, not just what you did about it" />
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
            onClick={() => onResolve(resolutionTypeId, correctiveAction, rootCause, preventiveAction, new Date(verificationDueDate).toISOString())}
            disabled={!resolutionTypeId || !correctiveAction.trim() || !rootCause.trim()}>
            Escalate to CAPA
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Contain modal — Immediate Containment, resolves an existing open ────────
// ── deficiency straight to Closed, no root cause, nothing to verify later ───

const ContainModal: React.FC<{
  deficiency: SpecimenDeficiency;
  resolutionTypes: ResolutionType[];
  onContain: (resolutionTypeId: string, resolutionComment: string) => void;
  onClose: () => void;
}> = ({ deficiency, resolutionTypes, onContain, onClose }) => {
  const [resolutionTypeId, setResolutionTypeId] = useState(resolutionTypes[0]?.id ?? '');
  const [resolutionComment, setResolutionComment] = useState('');

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Immediate Containment</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {deficiency.specimenLabel ? `Specimen ${deficiency.specimenLabel}, ` : ''}case {deficiency.caseId} — {deficiency.comment || 'no additional detail recorded'}
          </p>
          <p className="ps-fixgate-intro">
            This moves straight to <strong>Closed</strong> — no root cause, no later verification. Use this for a
            quick, contained fix; if this needs a real root-cause analysis, use <strong>Escalate to CAPA</strong> instead.
          </p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="contain-resolution-type">Resolution Type <span className="ps-conf-required">*</span></label>
            <select id="contain-resolution-type" className="ps-conf-select" value={resolutionTypeId} onChange={e => setResolutionTypeId(e.target.value)}>
              {resolutionTypes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="contain-comment">What was done <span className="ps-conf-required">*</span></label>
            <textarea id="contain-comment" className="ps-conf-input ps-conf-textarea" value={resolutionComment} onChange={e => setResolutionComment(e.target.value)}
              placeholder="What was actually done to fix this specific occurrence?" />
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary"
            onClick={() => onContain(resolutionTypeId, resolutionComment)}
            disabled={!resolutionTypeId || !resolutionComment.trim()}>
            Close — Contained
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

// ── Resolve billing deficiency modal — the four real resolution paths ───────
// from the original Trigger A/B design discussion's own governance
// section: code correction, charge reversal, billing-admin override, or
// a physician's clinical addendum.

const RESOLUTION_REASON_LABEL: Record<NonNullable<BillingDeficiencyRecord['resolutionReasonCode']>, string> = {
  CODE_CORRECTED: 'Code corrected',
  CHARGE_REVERSED: 'Charge reversed',
  APPROVED_BY_BILLING_ADMIN: 'Approved by billing admin (override)',
  PHYSICIAN_ADDENDUM_ADDED: 'Physician addendum added',
};

const ResolveBillingDeficiencyModal: React.FC<{
  deficiency: BillingDeficiencyRecord;
  onResolve: (
    resolutionReasonCode: BillingDeficiencyRecord['resolutionReasonCode'],
    correctedCptCode?: string,
    postSignoutContext?: { reasonId: string; comment: string }
  ) => void;
  onClose: () => void;
}> = ({ deficiency, onResolve, onClose }) => {
  const [reasonCode, setReasonCode] = useState<BillingDeficiencyRecord['resolutionReasonCode']>('CODE_CORRECTED');
  const [correctedCptCode, setCorrectedCptCode] = useState('');
  // Real, per direct guidance's own follow-up: billing is one of the
  // few things that can genuinely happen after sign-out, and when it
  // does, a real reason + comment is required - not just a background
  // audit log entry. isSignedOut starts undefined (genuinely unknown
  // until the real case status loads) rather than defaulting to
  // false, so the gate can't be silently skipped by a race between
  // this load and the Resolve button becoming clickable.
  const [isSignedOut, setIsSignedOut] = useState<boolean | undefined>(undefined);
  const [reasonOptions, setReasonOptions] = useState<ReasonDictionaryEntry[]>([]);
  const [postSignoutReasonId, setPostSignoutReasonId] = useState('');
  const [postSignoutComment, setPostSignoutComment] = useState('');

  useEffect(() => {
    let cancelled = false;
    mockCaseService.getCase(deficiency.caseId).then(c => {
      if (cancelled) return;
      setIsSignedOut(!!c && isCaseSignedOutForBilling(c.status));
    });
    mockReasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE').then(res => {
      if (cancelled) return;
      if (res.ok) setReasonOptions(res.data.filter(r => r.status === 'Active'));
    });
    return () => { cancelled = true; };
  }, [deficiency.caseId]);

  // Real, per direct report: CODE_CORRECTED used to just be a label -
  // resolving with it never actually changed the underlying charge.
  // Only meaningful when this deficiency is tied to one real charge
  // (chargeRecordId) - a case-wide deficiency (e.g. missing ICD-10)
  // has no single charge to correct here.
  const needsCorrectedCode = reasonCode === 'CODE_CORRECTED' && !!deficiency.chargeRecordId;
  const needsPostSignoutContext = needsCorrectedCode && isSignedOut === true;
  const canResolve =
    (!needsCorrectedCode || correctedCptCode.trim().length > 0) &&
    (!needsPostSignoutContext || (postSignoutReasonId !== '' && postSignoutComment.trim().length > 0)) &&
    isSignedOut !== undefined;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Resolve Billing Deficiency</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">case {deficiency.caseId} — {deficiency.auditorNotes}</p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="resolve-billing-reason">Resolution Reason <span className="ps-conf-required">*</span></label>
            <select id="resolve-billing-reason" className="ps-conf-select" value={reasonCode} onChange={e => setReasonCode(e.target.value as BillingDeficiencyRecord['resolutionReasonCode'])}>
              {(Object.keys(RESOLUTION_REASON_LABEL) as Array<NonNullable<BillingDeficiencyRecord['resolutionReasonCode']>>).map(k => (
                <option key={k} value={k}>{RESOLUTION_REASON_LABEL[k]}</option>
              ))}
            </select>
          </div>
          {needsCorrectedCode && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="resolve-billing-corrected-code">Corrected CPT Code <span className="ps-conf-required">*</span></label>
              <input
                id="resolve-billing-corrected-code"
                className="ps-conf-input"
                value={correctedCptCode}
                onChange={e => setCorrectedCptCode(e.target.value)}
                placeholder="e.g. 88305"
              />
              <p className="ps-billing-reason-hint">
                Real, per direct fix — the original charge will be reversed with a credit and a new charge
                created with this code, both permanently recorded on the case's own billing ledger.
              </p>
            </div>
          )}
          {needsPostSignoutContext && (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="resolve-billing-postsignout-reason">
                  Reason for post-sign-out change <span className="ps-conf-required">*</span>
                </label>
                <select
                  id="resolve-billing-postsignout-reason"
                  className="ps-conf-select"
                  value={postSignoutReasonId}
                  onChange={e => setPostSignoutReasonId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {reasonOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="ps-billing-reason-hint">
                  This case has already signed out. Billing is one of the few things that can still
                  change afterward, but it needs a real, documented reason.
                </p>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="resolve-billing-postsignout-comment">Comment <span className="ps-conf-required">*</span></label>
                <textarea
                  id="resolve-billing-postsignout-comment"
                  className="ps-conf-textarea"
                  value={postSignoutComment}
                  onChange={e => setPostSignoutComment(e.target.value)}
                  placeholder="What changed and why — permanently attached to the credit and the corrected charge."
                />
              </div>
            </>
          )}
          {reasonCode === 'CODE_CORRECTED' && !deficiency.chargeRecordId && (
            <p className="ps-billing-reason-hint">
              This deficiency isn't tied to one specific charge — no charge correction to apply here.
            </p>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canResolve}
            onClick={() => onResolve(
              reasonCode,
              needsCorrectedCode ? correctedCptCode.trim() : undefined,
              needsPostSignoutContext ? { reasonId: postSignoutReasonId, comment: postSignoutComment.trim() } : undefined
            )}
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Review code review pool entry modal — the billing specialist's real
// review outcome, per Trigger C. NO_ISSUE_FOUND needs no further input.
// DEFICIENCY_RAISED requires selecting which of the real deficiency
// types was actually found, plus real auditor notes - the same
// requirement Trigger A/B's own automated records already carry.

const DEFICIENCY_TYPE_LABEL: Record<BillingDeficiencyType, string> = {
  UNSUPPORTED_CPT_LEVEL: 'Unsupported CPT level',
  MISSING_DIAGNOSTIC_ICD10: 'Missing diagnostic ICD-10',
  NCCI_BUNDLING_VIOLATION: 'NCCI bundling violation',
  UNATTACHED_ANCILLARY_ORDER: 'Unattached ancillary order',
  MODIFIER_MISMATCH: 'Modifier mismatch (26/TC)',
  ZERO_FEE_MAPPING_ERROR: 'Zero-fee mapping error',
};

const ReviewPoolEntryModal: React.FC<{
  entry: CodeReviewPoolEntry;
  onReview: (outcome: 'NO_ISSUE_FOUND' | 'DEFICIENCY_RAISED', deficiencyType?: BillingDeficiencyType, auditorNotes?: string) => void;
  onClose: () => void;
}> = ({ entry, onReview, onClose }) => {
  const [outcome, setOutcome] = useState<'NO_ISSUE_FOUND' | 'DEFICIENCY_RAISED'>('NO_ISSUE_FOUND');
  const [deficiencyType, setDeficiencyType] = useState<BillingDeficiencyType>('UNSUPPORTED_CPT_LEVEL');
  const [auditorNotes, setAuditorNotes] = useState('');
  const canSubmit = outcome === 'NO_ISSUE_FOUND' || auditorNotes.trim().length > 0;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Review Code Review Pool Entry</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            case {entry.caseId} — {entry.source === 'MANUAL' ? `flagged by ${entry.flaggedByName ?? 'staff'}` : 'random sample'}
            {entry.notes ? `: ${entry.notes}` : ''}
          </p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Review Outcome <span className="ps-conf-required">*</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={outcome === 'NO_ISSUE_FOUND' ? 'ps-conf-btn-primary' : 'ps-conf-btn-secondary'} onClick={() => setOutcome('NO_ISSUE_FOUND')}>No Issue Found</button>
              <button className={outcome === 'DEFICIENCY_RAISED' ? 'ps-conf-btn-primary' : 'ps-conf-btn-secondary'} onClick={() => setOutcome('DEFICIENCY_RAISED')}>Raise Billing Deficiency</button>
            </div>
          </div>
          {outcome === 'DEFICIENCY_RAISED' && (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="pool-deficiency-type">Deficiency Type <span className="ps-conf-required">*</span></label>
                <select id="pool-deficiency-type" className="ps-conf-select" value={deficiencyType} onChange={e => setDeficiencyType(e.target.value as BillingDeficiencyType)}>
                  {(Object.keys(DEFICIENCY_TYPE_LABEL) as BillingDeficiencyType[]).map(k => (
                    <option key={k} value={k}>{DEFICIENCY_TYPE_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="pool-auditor-notes">Auditor Notes <span className="ps-conf-required">*</span></label>
                <textarea id="pool-auditor-notes" className="ps-conf-input ps-conf-textarea" value={auditorNotes} onChange={e => setAuditorNotes(e.target.value)}
                  placeholder="What did you actually find during review?" />
              </div>
            </>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" disabled={!canSubmit} onClick={() => onReview(outcome, outcome === 'DEFICIENCY_RAISED' ? deficiencyType : undefined, outcome === 'DEFICIENCY_RAISED' ? auditorNotes.trim() : undefined)}>
            Submit Review
          </button>
        </div>
      </div>
    </div>
  );
};

const QualityAssurancePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { crumbs, setCrumbs } = useBreadcrumb();
  const { user } = useAuth();
  // Real, per direct request: "the crumb should take me back to the
  // Financials area" - same real ?section= deep-link pattern already
  // established in Config/System/index.tsx, applied here so the
  // breadcrumb path itself remembers which pillar was active, not
  // just a fixed '/quality-assurance' that always lands on Operations.
  const [pillar, setPillar] = useState<Pillar>(() => {
    const p = new URLSearchParams(location.search).get('pillar') as Pillar | null;
    return p && p in PILLAR_TABS ? p : 'operations';
  });
  useEffect(() => {
    const path = `/quality-assurance?pillar=${pillar}`;
    // Real fix, found via direct verification: pushCrumb only
    // de-dupes on an EXACT path match, so calling it again with a
    // different pillar in the path appended a second, duplicate
    // "Quality Assurance" crumb instead of updating the existing
    // one - confirmed live, clicking the crumb landed back on the
    // stale, first-mounted pillar rather than the current one.
    // Updates the existing entry's path in place instead.
    const idx = crumbs.findIndex(c => c.label === 'Quality Assurance');
    if (idx === -1) {
      setCrumbs([...crumbs, { label: 'Quality Assurance', path }]);
    } else if (crumbs[idx].path !== path) {
      const next = [...crumbs];
      next[idx] = { label: 'Quality Assurance', path };
      setCrumbs(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillar]);
  // Re-sync if the URL changes after mount (e.g. a deep link arriving
  // via browser back/forward, not just initial load).
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('pillar') as Pillar | null;
    if (p && p in PILLAR_TABS && p !== pillar) setPillar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  const [tab, setTab] = useState<Tab>('case-specimen');
  const [deficiencies, setDeficiencies] = useState<SpecimenDeficiency[]>([]);
  const [deficiencyTypes, setDeficiencyTypes] = useState<DeficiencyType[]>([]);
  const [resolutionTypes, setResolutionTypes] = useState<ResolutionType[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [containingId, setContainingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [managementReviews, setManagementReviews] = useState<ManagementReview[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [billingDeficiencies, setBillingDeficiencies] = useState<BillingDeficiencyRecord[]>([]);
  const [resolvingBillingDeficiencyId, setResolvingBillingDeficiencyId] = useState<string | null>(null);
  const [failedDlqCount, setFailedDlqCount] = useState(0);
  const [codeReviewPool, setCodeReviewPool] = useState<CodeReviewPoolEntry[]>([]);
  const [reviewingPoolEntryId, setReviewingPoolEntryId] = useState<string | null>(null);
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
    mockBillingDeficiencyService.getAll().then(res => { if (res.ok) setBillingDeficiencies(res.data); });
    mockOutboundChargeQueueService.getFailed().then(res => { if (res.ok) setFailedDlqCount(res.data.length); });
    mockCodeReviewPoolService.getAll().then(res => { if (res.ok) setCodeReviewPool(res.data); });
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
    if (target.status === 'open') { setPillar('operations'); setTab('case-specimen'); }
    else if (target.status === 'pending-verification') { setPillar('capa'); setTab('escalated'); }
    else { setPillar('capa'); setTab('closed'); }
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
    const rows = activeItemsForTab.map(d => ({
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
  // Real, per direct guidance: split what was one combined "active"
  // view into the two real pillars now own separately - Operations
  // sees only genuinely open, unaddressed issues; CAPA Engine sees
  // only what's already been escalated (a corrective action taken,
  // awaiting effectiveness verification). Same real statuses as
  // before, just no longer shown together in one tab.
  const openItems = useMemo(
    () => deficiencies.filter(d => d.status === 'open'),
    [deficiencies]
  );
  const escalatedItems = useMemo(
    () => deficiencies.filter(d => d.status === 'pending-verification'),
    [deficiencies]
  );
  // Whichever of the two real, split lists the active tab actually
  // needs - case-specimen (Operations) wants openItems, escalated
  // (CAPA Engine) wants escalatedItems. Grouped by level and sorted by
  // case number, same real UX Pete asked for originally, now applied
  // to each pillar's own real slice rather than one merged list.
  const activeItemsForTab = tab === 'escalated' ? escalatedItems : openItems;
  const caseLevelActive = useMemo(
    () => activeItemsForTab.filter(d => !d.specimenId).sort((a, b) => a.caseId.localeCompare(b.caseId)),
    [activeItemsForTab]
  );
  const specimenLevelActive = useMemo(
    () => activeItemsForTab.filter(d => !!d.specimenId).sort((a, b) => a.caseId.localeCompare(b.caseId)),
    [activeItemsForTab]
  );
  const openCount = deficiencies.filter(d => d.status === 'open').length;
  const pendingCount = deficiencies.filter(d => d.status === 'pending-verification').length;
  const closedCount = deficiencies.filter(d => d.status === 'closed').length;
  const overdueCount = deficiencies.filter(d => d.status === 'pending-verification' && isOverdue(d.verificationDueDate)).length;
  const unreviewedClosed = useMemo(
    () => deficiencies.filter(d => d.status === 'closed' && !d.managementReviewId),
    [deficiencies]
  );

  // Real, per direct guidance: OPEN/UNDER_REVIEW are both "still needs
  // attention" for this list - UNDER_REVIEW isn't reachable via any
  // real UI action yet (no triage/assignment step built), but the
  // status exists on the real type and a record could theoretically
  // arrive in that state, so it's grouped here rather than silently
  // dropped from both tabs.
  const billingDeficienciesOpen = useMemo(
    () => billingDeficiencies.filter(d => d.status === 'OPEN' || d.status === 'UNDER_REVIEW'),
    [billingDeficiencies]
  );
  const billingDeficienciesResolved = useMemo(
    () => billingDeficiencies.filter(d => d.status === 'RESOLVED' || d.status === 'OVERRIDDEN_WITH_JUSTIFICATION'),
    [billingDeficiencies]
  );
  const resolvingBillingDeficiency = billingDeficiencies.find(d => d.id === resolvingBillingDeficiencyId) ?? null;

  const handleResolveBillingDeficiency = (
    resolutionReasonCode: BillingDeficiencyRecord['resolutionReasonCode'],
    correctedCptCode?: string,
    postSignoutContext?: { reasonId: string; comment: string }
  ) => {
    if (!resolvingBillingDeficiencyId || !resolvingBillingDeficiency) return;
    const resolvedBy = user?.id ?? 'unknown';

    // Real fix, per direct report: CODE_CORRECTED used to only label
    // the deficiency resolved without ever touching the actual,
    // underlying charge. Real, shared orchestration
    // (correctServiceCharge.ts) - extracted per direct correction that
    // this "credit the old, charge the new" sequence is real business
    // logic and doesn't belong inline in a page component. When the
    // case has already signed out, per direct follow-up, both the
    // credit and the new charge carry the real, required reason +
    // comment.
    const applyCorrection = async () => {
      if (resolutionReasonCode !== 'CODE_CORRECTED' || !resolvingBillingDeficiency.chargeRecordId || !correctedCptCode) return;
      const res = await correctServiceCharge(
        resolvingBillingDeficiency.caseId, resolvingBillingDeficiency.chargeRecordId, correctedCptCode, resolvedBy, postSignoutContext
      );
      if (!res.ok) return;
      const { original, corrected } = res.data;
      auditService.logEvent({
        type: 'user',
        event: 'Billing code corrected (QA resolution)',
        detail: `${original.sourceLabel}: ${original.cptCode} \u2192 ${correctedCptCode} \u2014 real credit issued reversing charge ${original.id}, new charge ${corrected.id} created`
          + (postSignoutContext ? ` \u2014 post-sign-out change, reason ${postSignoutContext.reasonId}: "${postSignoutContext.comment}"` : ''),
        user: user?.name ?? resolvedBy,
        caseId: resolvingBillingDeficiency.caseId,
        confidence: null,
      });
    };

    applyCorrection()
      .catch(e => console.error('[PathScribe] Code correction failed (deficiency resolution still proceeds):', e))
      .then(() => mockBillingDeficiencyService.resolve(resolvingBillingDeficiencyId, { resolutionReasonCode, resolvedBy }))
      .then(() => { setResolvingBillingDeficiencyId(null); loadAll(); });
  };

  // Real, per Trigger C (manual QA billing audits): pending entries
  // from the billing review pool - both MANUAL (flagged via Request
  // Colleague Review's own Code Review type) and, later,
  // RANDOM_SAMPLE sources both land here undifferentiated in the UI,
  // since a billing specialist reviews either the same way.
  const codeReviewPending = useMemo(
    () => codeReviewPool.filter(e => e.status === 'PENDING_REVIEW'),
    [codeReviewPool]
  );
  const reviewingPoolEntry = codeReviewPool.find(e => e.id === reviewingPoolEntryId) ?? null;

  // Real, per direct guidance: a billing specialist's actual review
  // outcome. When a real deficiency is found, raises the real,
  // permanent BillingDeficiencyRecord first (raisedByTrigger:
  // 'MANUAL_BILLING_AUDIT', same real record type Trigger A/B
  // produce), then links its real id back onto the pool entry - never
  // two independent, drifting records of the same finding.
  const handleReviewPoolEntry = async (
    outcome: 'NO_ISSUE_FOUND' | 'DEFICIENCY_RAISED',
    deficiencyType?: BillingDeficiencyType,
    auditorNotes?: string
  ) => {
    if (!reviewingPoolEntry) return;
    let raisedDeficiencyId: string | undefined;
    if (outcome === 'DEFICIENCY_RAISED' && deficiencyType && auditorNotes) {
      const raised = await mockBillingDeficiencyService.raise({
        caseId: reviewingPoolEntry.caseId,
        deficiencyType,
        severity: 'COMPLIANCE_WARNING',
        raisedByTrigger: 'MANUAL_BILLING_AUDIT',
        auditorNotes,
        createdBy: user?.id ?? 'unknown',
      });
      if (raised.ok) raisedDeficiencyId = raised.data.id;
    }
    await mockCodeReviewPoolService.review(reviewingPoolEntry.id, {
      reviewOutcome: outcome,
      reviewedBy: user?.id ?? 'unknown',
      reviewedByName: user?.name,
      raisedDeficiencyId,
    });
    setReviewingPoolEntryId(null);
    loadAll();
  };

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
  const containingItem = deficiencies.find(d => d.id === containingId) ?? null;
  const verifyingItem = deficiencies.find(d => d.id === verifyingId) ?? null;

  const handleResolve = (resolutionTypeId: string, correctiveAction: string, rootCause: string, preventiveAction: string, verificationDueDate: string) => {
    if (!resolvingId) return;
    specimenDeficiencyService.resolve(resolvingId, {
      resolutionTypeId, correctiveAction, rootCause, preventiveAction: preventiveAction || undefined,
      resolvedBy: user?.id ?? 'unknown', verificationDueDate,
    }).then(() => { setResolvingId(null); loadAll(); });
  };

  const handleContain = (resolutionTypeId: string, resolutionComment: string) => {
    if (!containingId) return;
    specimenDeficiencyService.containImmediately(containingId, {
      resolutionTypeId, resolutionComment, resolvedBy: user?.id ?? 'unknown',
    }).then(() => { setContainingId(null); loadAll(); });
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
    if (t === 'case-specimen' || t === 'escalated') return ['Status', 'Case', 'Specimen', 'Issue', 'Detail', 'When', 'Actions'];
    return ['Case', 'Specimen', 'Issue', 'Resolution', 'Verified', 'Closed'];
  };

  return (
    <div className="ps-defic-page">
      <div className="ps-defic-scroll">
      <div className="ps-defic-inner">
      <div className="ps-defic-page-header">
        <h1 className="ps-defic-page-title">✓ Quality Assurance</h1>
        <p className="ps-defic-page-subtitle">
          Three real pillars. Operations tracks nonconformances and Clinical Quality metrics — Frozen Linkage,
          Discordance &amp; Reconciliation, Countersign Turnaround, Credentialing Review, and more. Financials
          tracks billing/coding deficiencies raised automatically at case sign-out. CAPA Engine governs the
          corrective-action lifecycle across both — a correction doesn't close out by itself, it's escalated here
          until someone actually confirms it worked, with periodic management review.
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
      {pillar === 'capa' && (
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
      <div className="ps-auditlog-tabswitch">
        {([
          { key: 'operations', label: 'Operations' },
          { key: 'financials', label: 'Financials' },
          { key: 'capa', label: 'CAPA Engine' },
        ] as const).map(p => (
          <button
            key={p.key}
            className={`ps-auditlog-tabswitch-btn${pillar === p.key ? ' ps-auditlog-tabswitch-btn--active' : ''}`}
            onClick={() => { setPillar(p.key); setTab(PILLAR_TABS[p.key][0] ?? 'case-specimen'); }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ps-qa-tab-tiles">
        {([
          { key: 'case-specimen', label: '⚠️ Deficiencies', count: openCount, color: '#EF4444', sublabel: overdueCount > 0 ? `${overdueCount} overdue` : undefined },
          { key: 'escalated', label: '🚩 Escalated to CAPA', count: pendingCount, color: '#f59e0b', sublabel: overdueCount > 0 ? `${overdueCount} overdue` : undefined },
          { key: 'closed', label: '✓ Closed', count: closedCount, color: '#10B981', sublabel: undefined },
          { key: 'reviews', label: '📋 Mgmt Reviews', count: managementReviews.length, color: '#536EEA', sublabel: undefined },
          { key: 'intraop-linkage', label: '🔬 Frozen Linkage', count: undefined, color: '#0891B2', sublabel: undefined },
          { key: 'discordance', label: '⚖️ Discordance', count: undefined, color: '#8B5CF6', sublabel: undefined },
          { key: 'countersign', label: '✍️ Countersign Turnaround', count: undefined, color: '#f59e0b', sublabel: undefined },
          { key: 'fppe', label: '📜 Credentialing Review', count: undefined, color: '#261CE3', sublabel: undefined },
          { key: 'drift-correction', label: '🔄 Post-Final Drift', count: undefined, color: '#EC4899', sublabel: undefined },
          { key: 'patient-match-review', label: '🪪 Patient Match Review', count: undefined, color: '#53E2EA', sublabel: undefined },
          { key: 'access-requests', label: '🔑 Access Requests', count: undefined, color: '#94a3b8', sublabel: undefined },
          { key: 'financials-open', label: '💲 Billing Deficiencies', count: billingDeficienciesOpen.length, color: '#EF4444', sublabel: undefined },
          { key: 'financials-resolved', label: '✓ Resolved', count: billingDeficienciesResolved.length, color: '#10B981', sublabel: undefined },
          { key: 'financials-code-review', label: '🔍 Code Review Pool', count: codeReviewPending.length, color: '#8B5CF6', sublabel: undefined },
        ] as const).filter(t => (PILLAR_TABS[pillar] as readonly Tab[]).includes(t.key)).map(t => {
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
        {pillar === 'financials' && (
          // Real, per direct guidance: read-only visibility into the
          // Outbound Charge DLQ (Configuration → Financial & Revenue
          // Lookups) from right here, rather than merging that
          // mechanical retry-queue into this clinical-judgment-based
          // QA module. Navigates to Configuration, not a tab switch -
          // this tile has no real tab of its own on this page.
          <button
            className="ps-wl-filter-tile"
            title="View failed outbound charge dispatches in Configuration"
            onClick={() => navigate('/configuration?tab=system&section=outbound_charge_dlq')}
            style={{ '--tile-bg': '#f59e0b0d', '--tile-border': '#f59e0b2e', '--tile-shadow': 'none' } as React.CSSProperties}
          >
            <div className="ps-wl-filter-tile__label" style={{ '--tile-label-color': '#8899aa' } as React.CSSProperties}>📮 Failed Dispatches</div>
            <div className="ps-wl-filter-tile__count" style={{ '--tile-count-color': '#f59e0b' } as React.CSSProperties}>{failedDlqCount}</div>
            <div className="ps-wl-filter-tile__sublabel" style={{ '--tile-count-color': '#f59e0b', '--tile-sublabel-opacity': 0.75 } as React.CSSProperties}>in Config →</div>
          </button>
        )}
      </div>

      {pillar === 'financials' && tab === 'financials-code-review' && (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>
                  <th className="ps-conf-th">Case</th>
                  <th className="ps-conf-th">Source</th>
                  <th className="ps-conf-th">Flagged By</th>
                  <th className="ps-conf-th">Notes</th>
                  <th className="ps-conf-th">Flagged</th>
                  <th className="ps-conf-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codeReviewPending.map(e => (
                  <tr key={e.id} className="ps-conf-tr">
                    <td className="ps-conf-td">
                      <button className="ps-conf-btn-row" onClick={() => navigate(`/case/${e.caseId}/synoptic`)}>{e.caseId}</button>
                    </td>
                    <td className="ps-conf-td">{e.source === 'MANUAL' ? 'Manual' : 'Random sample'}</td>
                    <td className="ps-conf-td">{e.flaggedByName ?? '—'}</td>
                    <td className="ps-conf-td"><div className="ps-specreq-meta">{e.notes ?? '—'}</div></td>
                    <td className="ps-conf-td">{formatTimestamp(e.flaggedAt)}</td>
                    <td className="ps-conf-td">
                      <button className="ps-conf-btn-primary" onClick={() => setReviewingPoolEntryId(e.id)}>Review</button>
                    </td>
                  </tr>
                ))}
                {codeReviewPending.length === 0 && (
                  <tr><td className="ps-conf-empty-row" colSpan={6}>No cases pending code review.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pillar === 'financials' && tab !== 'financials-code-review' && (
        <>
        <div className="ps-qa-tab-toolbar">
          <button className="ps-conf-btn-secondary" onClick={() => exportQaReportRows(
            (tab === 'financials-open' ? billingDeficienciesOpen : billingDeficienciesResolved).map(d => ({
              'Case': d.caseId,
              'Type': d.deficiencyType,
              'Severity': d.severity,
              'Trigger': d.raisedByTrigger,
              'Notes': d.auditorNotes,
              'Raised': d.createdAt,
              'Resolution': d.resolutionReasonCode ?? '',
              'Resolved': d.resolvedAt ?? '',
            })),
            `quality-assurance-financials-${tab === 'financials-open' ? 'open' : 'resolved'}-${new Date().toISOString().slice(0, 10)}.xlsx`
          )}>Export</button>
        </div>
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>
                  {(tab === 'financials-open'
                    ? ['Case', 'Type', 'Severity', 'Trigger', 'Notes', 'Raised', 'Actions']
                    : ['Case', 'Type', 'Severity', 'Resolution', 'Resolved']
                  ).map(h => <th key={h} className="ps-conf-th">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(tab === 'financials-open' ? billingDeficienciesOpen : billingDeficienciesResolved).map(d => (
                  <tr key={d.id} className="ps-conf-tr">
                    <td className="ps-conf-td">
                      <button className="ps-conf-btn-row" onClick={() => navigate(`/case/${d.caseId}/synoptic`)}>{d.caseId}</button>
                    </td>
                    <td className="ps-conf-td">{d.deficiencyType}</td>
                    <td className="ps-conf-td">{d.severity}</td>
                    {tab === 'financials-open' ? (
                      <>
                        <td className="ps-conf-td">{d.raisedByTrigger}</td>
                        <td className="ps-conf-td"><div className="ps-specreq-meta">{d.auditorNotes}</div></td>
                        <td className="ps-conf-td">{formatTimestamp(d.createdAt)}</td>
                        <td className="ps-conf-td">
                          <button className="ps-conf-btn-primary" onClick={() => setResolvingBillingDeficiencyId(d.id)}>Resolve</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="ps-conf-td">{d.resolutionReasonCode}</td>
                        <td className="ps-conf-td">{formatTimestamp(d.resolvedAt)}</td>
                      </>
                    )}
                  </tr>
                ))}
                {(tab === 'financials-open' ? billingDeficienciesOpen : billingDeficienciesResolved).length === 0 && (
                  <tr><td className="ps-conf-empty-row" colSpan={tab === 'financials-open' ? 7 : 5}>
                    No {tab === 'financials-open' ? 'open' : 'resolved'} billing deficiencies.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {pillar !== 'financials' && (
      <>

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

      {(tab === 'case-specimen' || tab === 'escalated' || tab === 'closed') && (
        <div className="ps-qa-tab-toolbar">
          <button className="ps-conf-btn-secondary" onClick={(tab === 'case-specimen' || tab === 'escalated') ? exportActiveQueue : exportClosed}>Export</button>
        </div>
      )}

      {(tab === 'case-specimen' || tab === 'escalated' || tab === 'closed') ? (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>{columnsFor(tab).map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(tab === 'case-specimen' || tab === 'escalated') && (() => {
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
                          ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="ps-conf-btn-secondary" onClick={() => setContainingId(d.id)}>Immediate Containment</button>
                              <button className="ps-conf-btn-primary" onClick={() => setResolvingId(d.id)}>Escalate to CAPA</button>
                            </div>
                          : <button className="ps-conf-btn-primary" onClick={() => setVerifyingId(d.id)}>Verify Effectiveness</button>}
                      </td>
                    </tr>
                  );
                  return (
                    <>
                      <tr className="ps-defic-group-header"><td colSpan={7}>Case-Level ({caseLevelActive.length})</td></tr>
                      {caseLevelActive.length > 0
                        ? caseLevelActive.map(renderActiveRow)
                        : <tr><td className="ps-conf-empty-row" colSpan={7}>No {tab === 'escalated' ? 'escalated' : 'open'} case-level deficiencies.</td></tr>}
                      <tr className="ps-defic-group-header"><td colSpan={7}>Specimen-Level ({specimenLevelActive.length})</td></tr>
                      {specimenLevelActive.length > 0
                        ? specimenLevelActive.map(renderActiveRow)
                        : <tr><td className="ps-conf-empty-row" colSpan={7}>No {tab === 'escalated' ? 'escalated' : 'open'} specimen-level deficiencies.</td></tr>}
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
      </>
      )}

      {resolvingItem && (
        <ResolveModal deficiency={resolvingItem} resolutionTypes={resolutionTypes} onResolve={handleResolve} onClose={() => setResolvingId(null)} />
      )}
      {containingItem && (
        <ContainModal deficiency={containingItem} resolutionTypes={resolutionTypes} onContain={handleContain} onClose={() => setContainingId(null)} />
      )}
      {verifyingItem && (
        <VerifyModal deficiency={verifyingItem} onVerify={handleVerify} onClose={() => setVerifyingId(null)} />
      )}
      {resolvingBillingDeficiency && (
        <ResolveBillingDeficiencyModal deficiency={resolvingBillingDeficiency} onResolve={handleResolveBillingDeficiency} onClose={() => setResolvingBillingDeficiencyId(null)} />
      )}
      {reviewingPoolEntry && (
        <ReviewPoolEntryModal entry={reviewingPoolEntry} onReview={handleReviewPoolEntry} onClose={() => setReviewingPoolEntryId(null)} />
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
