// src/components/PatientHistory/PatientHistoryModal.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useDirtyState } from '@/contexts/DirtyStateContext';
import { mockMessageService } from '@/services/messages/mockMessageService';
import { useAuth } from '@/contexts/AuthContext';
import { mockUserService } from '@/services/users/mockUserService';
import {
  PatientHistoryCase,
  AiMatchedCase,
  findSimilarCases,
} from '@/services/cases/mockCaseService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { queryRealPatientHistory } from '@/services/patients/patientHistoryQuery';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientHistoryModalProps {
  patientName: string;
  mrn: string;
  /** The real second patient identifier, per the Joint Commission's
   *  National Patient Safety Goal requiring a minimum of two identifiers
   *  for patient-identification-critical actions — explicitly including
   *  laboratory specimens and requisitions. Surfacing another patient's
   *  history/AI-matched cases off a single, possibly-mistyped or
   *  cross-facility-ambiguous MRN is exactly the kind of error that
   *  requirement exists to prevent. See the real gate below. */
  dateOfBirth: string;
  /** Real fix: the real, persistent MPI identity this case's patient
   *  was actually resolved to (Case.patient.id) - what real "Patient
   *  History" now queries by, instead of the old, hardcoded MRN-keyed
   *  mock table. Optional only for safety during rollout on any case
   *  predating the real MPI; without it, no real history can be shown
   *  (see hasSufficientIdentifiers below). */
  patientId?: string;
  /** The case currently being viewed - excluded from its own history,
   *  since "history" means this patient's OTHER real cases. */
  currentCaseId?: string;
  onClose: () => void;
}

type ReportItem = PatientHistoryCase | AiMatchedCase;
type ReportSource = 'history' | 'ai';

function isAiCase(item: ReportItem): item is AiMatchedCase {
  return 'matchPct' in item;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const dark = '#0b1c2e';
const border = '0.5px solid rgba(255,255,255,0.1)';
const muted = 'rgba(255,255,255,0.35)';
const accent = '#4da6e8';

const S: Record<string, React.CSSProperties> = {
  shell: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 9000,
  },
  modal: {
    background: dark,
    borderRadius: 12,
    width: '100%',
    maxWidth: 960,
    height: '90vh',
    display: 'flex',
    flexDirection: 'column',
    border,
    overflow: 'hidden',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
  },
  header: {
    padding: '16px 20px',
    borderBottom: border,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: muted,
    marginBottom: 4,
  },
  patientName: { fontSize: 20, fontWeight: 600, color: '#fff' },
  mrn: { fontSize: 13, color: muted, fontWeight: 400, marginLeft: 6 },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    marginTop: 6,
    minHeight: 18,
  },
  crumbBtn: {
    color: accent,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 12,
    fontFamily: 'inherit',
  },
  crumbSep: { color: 'rgba(255,255,255,0.2)', fontSize: 11 },
  crumbCurrent: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  splitBody: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  panel: { overflowY: 'auto', flex: 1, minHeight: 0 },
  panelTitle: {
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: muted,
    padding: '14px 16px 10px',
    position: 'sticky',
    top: 0,
    background: dark,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  resultCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 400,
    letterSpacing: 0,
    textTransform: 'none',
  },
  card: {
    padding: '11px 16px',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  cardDate: { fontSize: 11, color: muted },
  cardId: { fontSize: 11, color: `${accent}cc` },
  cardDiagnosis: { fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 },
  cardMeta: { fontSize: 11, color: 'rgba(255,255,255,0.38)' },
  matchBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 10,
    background: 'rgba(77,166,232,0.12)',
    color: accent,
    padding: '2px 7px',
    borderRadius: 20,
    border: '0.5px solid rgba(77,166,232,0.28)',
    marginLeft: 6,
  },
  emptyState: {
    padding: '32px 16px',
    textAlign: 'center',
    color: muted,
    fontSize: 13,
  },
  spinner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '32px 16px',
    color: muted,
    fontSize: 12,
  },
  footer: {
    padding: '12px 20px',
    borderTop: border,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  fullReport: {
    padding: '24px 32px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
    color: '#fff',
  },
  reportTitle: { fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16 },
  reportGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px 24px',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 3,
  },
  fieldValue: { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 },
  divider: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '14px 0' },
  tag: {
    display: 'inline-block',
    fontSize: 11,
    background: 'rgba(77,166,232,0.12)',
    color: accent,
    border: '0.5px solid rgba(77,166,232,0.28)',
    padding: '3px 9px',
    borderRadius: 12,
    margin: '2px 3px 2px 0',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CaseCard({ item, onClick }: { item: ReportItem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const ai = isAiCase(item);

  return (
    <div
      style={{ ...S.card, background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={S.cardTop}>
        <span style={S.cardDate}>{item.date}</span>
        <span style={S.cardId}>
          {ai ? (item as AiMatchedCase).accession : (item as PatientHistoryCase).id}
          {ai && (
            <span style={S.matchBadge}>{(item as AiMatchedCase).matchPct}% match</span>
          )}
        </span>
      </div>
      <div style={S.cardDiagnosis}>{item.diagnosis}</div>
      <div style={S.cardMeta}>
        {ai
          ? (item as AiMatchedCase).matchReason
          : `${(item as PatientHistoryCase).site} · ${(item as PatientHistoryCase).procedure}`}
      </div>
    </div>
  );
}

function ReportField({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={S.fieldLabel}>{label}</div>
      <div style={S.fieldValue}>{value}</div>
    </div>
  );
}

function FullReport({ item }: { item: ReportItem }) {
  const ai = isAiCase(item);
  const a = item as AiMatchedCase;
  const h = item as PatientHistoryCase;

  return (
    <div style={S.fullReport}>
      <div style={S.reportTitle}>{item.diagnosis}</div>
      <div style={S.reportGrid}>
        <ReportField label="Case ID"          value={ai ? a.accession : h.id} />
        <ReportField label="Date"             value={item.date} />
        <ReportField label="Site"             value={ai ? a.site : h.site} />
        <ReportField label="Procedure"        value={ai ? a.procedure : h.procedure} />
        <ReportField label="Pathologist"      value={ai ? a.physician : h.physician} />
        <ReportField label="Receptor Status"  value={ai ? a.receptors : h.receptors} />
        <ReportField label="Ki-67"            value={ai ? a.ki67 : h.ki67} />
        <ReportField label="Margins"          value={ai ? a.margins : h.margins} />
        <ReportField label="Lymph Nodes"      value={ai ? a.nodes : h.nodes} />
        {ai && <ReportField label="AI Match Score" value={`${a.matchPct}%`} />}
      </div>
      <div style={S.divider} />
      <div className="ps-ph-grid-2col">
        <div>
          <div style={S.fieldLabel}>Gross Description</div>
          <div style={{ ...S.fieldValue, lineHeight: 1.7 }}>{ai ? a.gross : h.gross}</div>
        </div>
        <div>
          <div style={S.fieldLabel}>Microscopic Description</div>
          <div style={{ ...S.fieldValue, lineHeight: 1.7 }}>{ai ? a.microscopic : h.microscopic}</div>
        </div>
      </div>
      {ai && a.ancillaryStudies && (
        <div className="ps-ph-field-mb">
          <div style={S.fieldLabel}>Ancillary Studies</div>
          <div style={{ ...S.fieldValue, lineHeight: 1.7 }}>{a.ancillaryStudies}</div>
        </div>
      )}
      {!ai && (
        <div className="ps-ph-field-mb">
          <div style={S.fieldLabel}>Pathologist Comment</div>
          <div style={{ ...S.fieldValue, lineHeight: 1.7 }}>{h.comment}</div>
        </div>
      )}
      <div style={S.divider} />
      <div>
        <div style={S.fieldLabel}>Tags</div>
        <div className="ps-ph-field-mt">
          {(ai ? a.tags : h.tags).map(t => (
            <span key={t} style={S.tag}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientHistoryModal({ patientName, mrn, dateOfBirth, patientId, currentCaseId, onClose }: PatientHistoryModalProps) {
  const [view, setView]                     = useState<'list' | 'report'>('list');
  const [selectedItem, setSelectedItem]     = useState<ReportItem | null>(null);
  const [selectedSource, setSelectedSource] = useState<ReportSource | null>(null);
  const [aiMatches, setAiMatches]           = useState<AiMatchedCase[]>([]);
  const [aiLoading, setAiLoading]           = useState(true);

  const navigate = useNavigate();
  const { setCrumbs } = useBreadcrumb();
  const { requestNavigate } = useDirtyState();

  // Real safety gate, not a formality: MRN alone doesn't meet the
  // Joint Commission's two-identifier minimum for patient-identification
  // -critical actions (explicitly including lab specimens/requisitions),
  // and ONC's own definition of patient matching requires linking
  // multiple demographic fields at minimum. Refusing to proceed on a
  // single identifier here is the real fix, not a cosmetic warning —
  // showing a wrong patient's oncology history is a materially worse
  // outcome than showing nothing. The underlying mock history data
  // (MOCK_PRIOR_PATHOLOGY) is itself only MRN-keyed, which is a real,
  // separate limitation of the demo data layer — this gate is what a
  // real patient-master-index lookup would also need to enforce before
  // ever considering an MRN a safe match; see
  // backend-requirements-concurrency-security.md for the production
  // version of this requirement.
  //
  // Real fix: also requires a real patientId now - without one, there's
  // no real MPI identity to query real history by at all. Cases created
  // before the real MPI existed won't have one; this modal shows no
  // history for those rather than falling back to a demographic guess.
  const hasSufficientIdentifiers = !!mrn && !!dateOfBirth && !!patientId;
  const [history, setHistory] = useState<PatientHistoryCase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Real fix, from a direct question about how case-searching actually
  // worked: this used to read MOCK_PRIOR_PATHOLOGY[mrn], a hardcoded
  // object completely disconnected from the real MPI
  // (services/patients/). Now genuinely queries real cases by this
  // patient's real, persistent identity - including any identity a
  // human has confirmed via a real Link is the same real person, so a
  // confirmed link actually changes what history displays, not just
  // what the MPI record itself says.
  useEffect(() => {
    if (!hasSufficientIdentifiers || !patientId) { setHistory([]); setHistoryLoading(false); return; }
    setHistoryLoading(true);
    Promise.all([
      mockPatientIndexService.getLinkedPatientIds(patientId),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true }),
    ])
      .then(([linkedIds, casesRes]) => {
        if (!casesRes.ok) { setHistory([]); return; }
        setHistory(queryRealPatientHistory(casesRes.data as any[], linkedIds, currentCaseId));
      })
      .finally(() => setHistoryLoading(false));
  }, [patientId, hasSufficientIdentifiers, currentCaseId]);

  const [showCompose, setShowCompose] = useState(false);
  const [composeNote, setComposeNote]  = useState('');
  const [sending, setSending]          = useState(false);
  // Fixes a confirmed bug: senderId/senderName were hardcoded to a
  // specific demo user (Pete Nimmo's ID, mislabeled here as "Dr. Sarah
  // Johnson"), and recipientId was hardcoded to that SAME id -- meaning
  // every message sent from this modal was actually addressed back to
  // the sender, never to the physician shown on screen. The comment
  // "in real app: look up physician ID" acknowledged this was a stub.
  const { user } = useAuth();
  const [sent, setSent]                = useState(false);

  const physicianName = selectedItem
    ? isAiCase(selectedItem)
      ? (selectedItem as AiMatchedCase).physician
      : (selectedItem as PatientHistoryCase).physician
    : '';

  const caseId = selectedItem
    ? isAiCase(selectedItem)
      ? (selectedItem as AiMatchedCase).accession
      : (selectedItem as PatientHistoryCase).id
    : '';

  async function handleSendMessage() {
    if (!composeNote.trim()) return;
    setSending(true);

    // Best-effort physician lookup by name -- imperfect (name-matching,
    // not a stable ID) but the only option available: case history only
    // stores the physician's display name, no real physician ID exists
    // anywhere in this data yet. Strips a leading "Dr." before matching
    // since physicianName typically includes it but the directory's
    // firstName/lastName fields don't.
    const usersResult = await mockUserService.getAll();
    const normalizedTarget = (physicianName ?? '').replace(/^dr\.?\s*/i, '').trim().toLowerCase();
    const matchedPhysician = usersResult.ok
      ? usersResult.data.find(u => `${u.firstName} ${u.lastName}`.trim().toLowerCase() === normalizedTarget)
      : undefined;

    await mockMessageService.send({
      senderId: user?.id ?? '',
      senderName: user?.name ?? 'Unknown',
      recipientId: matchedPhysician?.id ?? '',
      recipientName: physicianName,
      subject: `Case ${caseId} — Pathologist Query`,
      body: composeNote,
      caseNumber: caseId,
      timestamp: new Date(),
      isUrgent: false,
    });
    setSending(false);
    setSent(true);
    setComposeNote('');
    setTimeout(() => { setSent(false); setShowCompose(false); }, 2000);
  }

  // On mount: run AI similarity search using this patient's history as context
  useEffect(() => {
    if (!hasSufficientIdentifiers) { setAiLoading(false); return; }
    setAiLoading(true);
    findSimilarCases(mrn)
      .then(setAiMatches)
      .finally(() => setAiLoading(false));
  }, [mrn, hasSufficientIdentifiers]);

  function openReport(item: ReportItem, source: ReportSource) {
    setSelectedItem(item);
    setSelectedSource(source);
    setView('report');
  }

  function goBack() {
    setView('list');
    setSelectedItem(null);
    setSelectedSource(null);
    setShowCompose(false);
    setComposeNote('');
  }

  const sourceLabel = selectedSource === 'ai' ? 'AI Matched Cases' : 'Prior Pathology';
  const selectedId  = selectedItem
    ? isAiCase(selectedItem) ? selectedItem.accession : selectedItem.id
    : '';

  return (
    <div style={S.shell}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.metaLabel}>Patient History</div>
            <div>
              <span style={S.patientName} data-phi="name">{patientName}</span>
              <span style={S.mrn}>· MRN {mrn}</span>
            </div>
            <div style={S.breadcrumb}>
              {view === 'report' && (
                <>
                  <button type="button" style={S.crumbBtn} onClick={goBack}>← Patient History</button>
                  <span style={S.crumbSep}>›</span>
                  <button type="button" style={S.crumbBtn} onClick={goBack}>{sourceLabel}</button>
                  <span style={S.crumbSep}>›</span>
                  <span style={S.crumbCurrent}>{selectedId}</span>
                </>
              )}
            </div>
          </div>
          <button className="ps-close-btn" onClick={view === 'report' ? goBack : onClose} aria-label="Close">
            {view === 'report' ? '← Back' : '✕'}
          </button>
        </div>

        {/* Body */}
        {view === 'list' ? (
          <div style={S.splitBody}>

            {/* Left: Prior Pathology */}
            <div style={{ ...S.panel, borderRight: border }}>
              <div style={S.panelTitle}>Prior Pathology</div>
              {!hasSufficientIdentifiers ? (
                <div style={S.emptyState}>
                  Cannot safely retrieve patient history — this patient record is missing{' '}
                  {!patientId ? 'a real patient identity (predates the patient index)' : !mrn && !dateOfBirth ? 'an MRN and date of birth' : !mrn ? 'an MRN' : 'a date of birth'}.
                  A minimum of two patient identifiers is required before surfacing prior case history.
                </div>
              ) : historyLoading ? (
                <div style={S.emptyState}>Loading prior pathology…</div>
              ) : history.length === 0 ? (
                <div style={S.emptyState}>No prior pathology cases on record.</div>
              ) : (
                history.map(item => (
                  <CaseCard key={item.id} item={item} onClick={() => openReport(item, 'history')} />
                ))
              )}
            </div>

            {/* Right: AI Matched Cases — populated by findSimilarCases() */}
            <div style={S.panel}>
              <div style={S.panelTitle}>
                <span style={{ color: accent }}>★</span>
                AI Matched Cases
                {!aiLoading && (
                  <span style={S.resultCount}>{aiMatches.length} results</span>
                )}
              </div>
              {aiLoading ? (
                <div style={S.spinner}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(77,166,232,0.2)',
                    borderTopColor: accent,
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Searching case corpus…
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : aiMatches.length === 0 ? (
                <div style={S.emptyState}>No matched cases found for the current context.</div>
              ) : (
                aiMatches.map(item => (
                  <CaseCard key={item.caseId} item={item} onClick={() => openReport(item, 'ai')} />
                ))
              )}
            </div>

          </div>
        ) : (
          <div className="ps-ph-body-flex">
            {selectedItem && <FullReport item={selectedItem} />}
          </div>
        )}

        {/* Footer */}
        <div style={{ ...S.footer, flexDirection: 'column', gap: 0, padding: 0 }}>
          {/* Compose panel — slides in when showCompose is true */}
          {showCompose && view === 'report' && (
            <div style={{ padding: '12px 20px', borderBottom: border, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>
                Message to pathologist <span style={{ color: accent }}>{physicianName}</span> · Case <span style={{ color: '#fff' }}>{caseId}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: '#f87171' }}>Do not include patient identifiers</span>
              </div>
              <div className="ps-ph-compose-btn-row">
                <input
                  autoFocus
                  value={composeNote}
                  onChange={e => setComposeNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type your message — do not include patient name, MRN, or diagnosis…"
                  style={{
                    flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 13,
                    background: 'rgba(255,255,255,0.06)', border, color: '#fff', outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sending || !composeNote.trim()}
                  className="ps-btn-primary"
                  style={{ background: sent ? '#10b981' : undefined }}
                >
                  {sent ? '✓ Sent' : sending ? 'Sending…' : 'Send ↑'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCompose(false); setComposeNote(''); }}
                  className="fm-btn-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="ps-ph-compose-footer">
            <div>
              {!showCompose && (
                <button
                  type="button"
                  onClick={() => view === 'report' && setShowCompose(true)}
                  className="fm-btn-cancel"
                  disabled={view !== 'report'}
                  title={view !== 'report' ? 'Select a prior case or AI match to enable messaging' : `Message ${physicianName ?? 'Pathologist'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: view === 'report' ? 1 : 0.35, cursor: view === 'report' ? 'pointer' : 'not-allowed' }}
                >
                  ✉ {view === 'report' && physicianName ? `Message ${physicianName}` : 'Message Pathologist'}
                </button>
              )}
            </div>
            <button type="button" className="ps-btn-ghost-teal" onClick={() => {
              setCrumbs([
                { label: 'Home', path: '/' },
                { label: 'Case Report', path: window.location.pathname },
                { label: 'Patient History', path: window.location.pathname + '?history=1' },
                { label: 'Case Search', path: '/search' },
              ]);
              // requestNavigate first — if dirty, shows warning before closing modal
              requestNavigate('/search', (path) => {
                onClose();
                setTimeout(() => navigate(path), 50);
              });
            }}>Refine search ✦</button>
          </div>
        </div>

      </div>
    </div>
  );
}
