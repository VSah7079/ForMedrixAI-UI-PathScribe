// src/components/PatientHistory/PatientHistoryModal.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
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

// i18n note (batch 119): clinical/report field values (diagnosis,
// site, procedure, physician, receptors, ki67, margins, nodes, gross/
// microscopic descriptions, comments, tags, dates, case/accession
// IDs) are real patient case content — persisted, externally-sourced
// clinical data, not chrome authored in this file — and stay
// untranslated throughout, same posture as every other case-content
// field elsewhere in this codebase. The outbound message `subject`/
// `body` sent via mockMessageService.send() is a message body to
// another user and stays English per established convention. Field
// *labels* ("Case ID", "Site", "Gross Description", etc.) are UI
// chrome and are translated below.

// ─── Sub-components ───────────────────────────────────────────────────────────

function CaseCard({ item, onClick }: { item: ReportItem; onClick: () => void }) {
  const { t } = useTranslation();
  const ai = isAiCase(item);

  return (
    <div
      className="ps-ph-card"
      onClick={onClick}
    >
      <div className="ps-ph-card-top">
        <span className="ps-ph-card-date">{item.date}</span>
        <span className="ps-ph-card-id" data-phi="accession">
          {ai ? (item as AiMatchedCase).accession : (item as PatientHistoryCase).id}
          {ai && (
            <span className="ps-ph-match-badge">{t('patientHistoryModal.card.matchPct', { pct: (item as AiMatchedCase).matchPct })}</span>
          )}
        </span>
      </div>
      <div className="ps-ph-card-diagnosis" data-phi="diagnosis">{item.diagnosis}</div>
      <div className="ps-ph-card-meta">
        {ai
          ? (item as AiMatchedCase).matchReason
          : `${(item as PatientHistoryCase).site} · ${(item as PatientHistoryCase).procedure}`}
      </div>
    </div>
  );
}

function ReportField({ label, value, phi }: { label: string; value: string | number; phi?: string }) {
  return (
    <div>
      <div className="ps-ph-field-label">{label}</div>
      <div className="ps-ph-field-value" data-phi={phi}>{value}</div>
    </div>
  );
}

function FullReport({ item }: { item: ReportItem }) {
  const { t } = useTranslation();
  const ai = isAiCase(item);
  const a = item as AiMatchedCase;
  const h = item as PatientHistoryCase;

  return (
    <div className="ps-ph-full-report">
      <div className="ps-ph-report-title" data-phi="diagnosis">{item.diagnosis}</div>
      <div className="ps-ph-report-grid">
        <ReportField label={t('patientHistoryModal.field.caseId')}         value={ai ? a.accession : h.id} phi="accession" />
        <ReportField label={t('patientHistoryModal.field.date')}           value={item.date} />
        <ReportField label={t('patientHistoryModal.field.site')}          value={ai ? a.site : h.site} />
        <ReportField label={t('patientHistoryModal.field.procedure')}     value={ai ? a.procedure : h.procedure} />
        <ReportField label={t('patientHistoryModal.field.pathologist')}   value={ai ? a.physician : h.physician} />
        <ReportField label={t('patientHistoryModal.field.receptorStatus')} value={ai ? a.receptors : h.receptors} />
        <ReportField label={t('patientHistoryModal.field.ki67')}          value={ai ? a.ki67 : h.ki67} />
        <ReportField label={t('patientHistoryModal.field.margins')}       value={ai ? a.margins : h.margins} />
        <ReportField label={t('patientHistoryModal.field.lymphNodes')}    value={ai ? a.nodes : h.nodes} />
        {ai && <ReportField label={t('patientHistoryModal.field.aiMatchScore')} value={`${a.matchPct}%`} />}
      </div>
      <div className="ps-ph-divider" />
      <div className="ps-ph-grid-2col">
        <div>
          <div className="ps-ph-field-label">{t('patientHistoryModal.field.grossDescription')}</div>
          <div className="ps-ph-field-value ps-ph-field-value--loose">{ai ? a.gross : h.gross}</div>
        </div>
        <div>
          <div className="ps-ph-field-label">{t('patientHistoryModal.field.microscopicDescription')}</div>
          <div className="ps-ph-field-value ps-ph-field-value--loose">{ai ? a.microscopic : h.microscopic}</div>
        </div>
      </div>
      {ai && a.ancillaryStudies && (
        <div className="ps-ph-field-mb">
          <div className="ps-ph-field-label">{t('patientHistoryModal.field.ancillaryStudies')}</div>
          <div className="ps-ph-field-value ps-ph-field-value--loose">{a.ancillaryStudies}</div>
        </div>
      )}
      {!ai && (
        <div className="ps-ph-field-mb">
          <div className="ps-ph-field-label">{t('patientHistoryModal.field.pathologistComment')}</div>
          <div className="ps-ph-field-value ps-ph-field-value--loose">{h.comment}</div>
        </div>
      )}
      <div className="ps-ph-divider" />
      <div>
        <div className="ps-ph-field-label">{t('patientHistoryModal.field.tags')}</div>
        <div className="ps-ph-field-mt">
          {(ai ? a.tags : h.tags).map(tag => (
            <span key={tag} className="ps-ph-tag">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientHistoryModal({ patientName: initialPatientName, mrn: initialMrn, dateOfBirth: initialDateOfBirth, patientId: initialPatientId, currentCaseId, onClose }: PatientHistoryModalProps) {
  const { t } = useTranslation();
  // Real, per direct guidance ("Molecular testing across siblings"):
  // a real, distinct person shown under "Related Patients" below is
  // exactly who a reviewer would want to actually navigate to — e.g.
  // seeing a sibling's own prior molecular finding while reviewing
  // this patient's own case. Rather than requiring changes to this
  // modal's one real caller (SynopticReportPage.tsx), the modal
  // manages its own real "who am I actually showing" state — clicking
  // a related patient re-targets this same modal instance in place,
  // with a real "← Back to" link to return. currentCaseId
  // deliberately does NOT carry over to a related patient's own view
  // — we're no longer viewing from one of their own cases.
  const [viewingRelatedPatient, setViewingRelatedPatient] = useState<{ id: string; name: string; mrn: string; dateOfBirth: string } | null>(null);
  const patientName = viewingRelatedPatient?.name ?? initialPatientName;
  const mrn = viewingRelatedPatient?.mrn ?? initialMrn;
  const dateOfBirth = viewingRelatedPatient?.dateOfBirth ?? initialDateOfBirth;
  const patientId = viewingRelatedPatient?.id ?? initialPatientId;
  const effectiveCurrentCaseId = viewingRelatedPatient ? undefined : currentCaseId;

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
  // Real, per direct guidance: a genuinely separate list from history
  // above — 'family_relation' linked patients (e.g. newborn/mother,
  // or siblings for cascade molecular testing)
  // are distinct real people, shown as their own cross-reference, not
  // merged case history.
  const [familyRelatedPatients, setFamilyRelatedPatients] = useState<MasterPatientRecord[]>([]);

  // Real fix, from a direct question about how case-searching actually
  // worked: this used to read MOCK_PRIOR_PATHOLOGY[mrn], a hardcoded
  // object completely disconnected from the real MPI
  // (services/patients/). Now genuinely queries real cases by this
  // patient's real, persistent identity - including any identity a
  // human has confirmed via a real Link is the same real person, so a
  // confirmed link actually changes what history displays, not just
  // what the MPI record itself says.
  useEffect(() => {
    if (!hasSufficientIdentifiers || !patientId) { setHistory([]); setHistoryLoading(false); setFamilyRelatedPatients([]); return; }
    setHistoryLoading(true);
    Promise.all([
      // Real, per direct guidance: explicitly 'same_person' — the
      // only relationship type that should ever fold a linked
      // patient's own cases into this history view. A
      // 'family_relation' link (e.g. newborn/mother, or siblings) is two
      // distinct
      // real people; merging their histories together here would be
      // a real, clinically wrong outcome, not a cosmetic one.
      mockPatientIndexService.getLinkedPatientIds(patientId, 'same_person'),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true }),
    ])
      .then(([linkedIds, casesRes]) => {
        if (!casesRes.ok) { setHistory([]); return; }
        setHistory(queryRealPatientHistory(casesRes.data as any[], linkedIds, effectiveCurrentCaseId));
      })
      .finally(() => setHistoryLoading(false));

    // Real, per direct guidance: the real 'family_relation' side —
    // genuinely distinct real people, shown as its own, separate
    // cross-reference below, never folded into the case-history list
    // above.
    mockPatientIndexService.getLinkedPatientIds(patientId, 'family_relation')
      .then(async ids => {
        const relatedIds = ids.filter(id => id !== patientId);
        if (relatedIds.length === 0) { setFamilyRelatedPatients([]); return; }
        const records = await Promise.all(relatedIds.map(id => mockPatientIndexService.getById(id)));
        setFamilyRelatedPatients(records.filter((r): r is MasterPatientRecord => !!r));
      })
      .catch(() => setFamilyRelatedPatients([]));
  }, [patientId, hasSufficientIdentifiers, effectiveCurrentCaseId]);

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

  const sourceLabel = selectedSource === 'ai' ? t('patientHistoryModal.panel.aiMatchedCases') : t('patientHistoryModal.panel.priorPathology');
  const selectedId  = selectedItem
    ? isAiCase(selectedItem) ? selectedItem.accession : selectedItem.id
    : '';

  // i18n note: which identifier(s) are missing is itself chrome text
  // (not data), resolved to a translated fragment and interpolated
  // into the parent sentence below.
  const missingIdentifierKey = !patientId
    ? 'patientHistoryModal.missingIdentifiers.noPatientIdentity'
    : (!mrn && !dateOfBirth)
    ? 'patientHistoryModal.missingIdentifiers.mrnAndDob'
    : !mrn
    ? 'patientHistoryModal.missingIdentifiers.mrn'
    : 'patientHistoryModal.missingIdentifiers.dob';

  return (
    <div className="ps-ph-shell">
      <div className="ps-ph-modal">

        {/* Header */}
        <div className="ps-ph-header">
          <div>
            <div className="ps-ph-meta-label">{t('patientHistoryModal.header.metaLabel')}</div>
            <div>
              <span className="ps-ph-patient-name" data-phi="name">{patientName}</span>
              <span className="ps-ph-mrn" data-phi="mrn">· {t('patientHistoryModal.header.mrnPrefix', { mrn })}</span>
            </div>
            {viewingRelatedPatient && (
              <div className="ps-ph-breadcrumb">
                <button type="button" className="ps-ph-crumb-btn" onClick={() => { setViewingRelatedPatient(null); setView('list'); }}>← {t('patientHistoryModal.breadcrumb.backTo')} <span data-phi="name">{initialPatientName}</span></button>
              </div>
            )}
            <div className="ps-ph-breadcrumb">
              {view === 'report' && (
                <>
                  <button type="button" className="ps-ph-crumb-btn" onClick={goBack}>← {t('patientHistoryModal.header.metaLabel')}</button>
                  <span className="ps-ph-crumb-sep">›</span>
                  <button type="button" className="ps-ph-crumb-btn" onClick={goBack}>{sourceLabel}</button>
                  <span className="ps-ph-crumb-sep">›</span>
                  <span className="ps-ph-crumb-current">{selectedId}</span>
                </>
              )}
            </div>
          </div>
          <button className="ps-close-btn" onClick={view === 'report' ? goBack : onClose} aria-label={t('common.close')}>
            {view === 'report' ? `← ${t('common.back')}` : '✕'}
          </button>
        </div>

        {/* Body */}
        {view === 'list' ? (
          <div className="ps-ph-split-body">

            {/* Left: Prior Pathology */}
            <div className="ps-ph-panel ps-ph-panel--bordered">
              <div className="ps-ph-panel-title">{t('patientHistoryModal.panel.priorPathology')}</div>
              {!hasSufficientIdentifiers ? (
                <div className="ps-ph-empty-state">
                  {t('patientHistoryModal.insufficientId.body', { missing: t(missingIdentifierKey) })}
                </div>
              ) : historyLoading ? (
                <div className="ps-ph-empty-state">{t('patientHistoryModal.panel.loadingHistory')}</div>
              ) : history.length === 0 ? (
                <div className="ps-ph-empty-state">{t('patientHistoryModal.panel.noHistory')}</div>
              ) : (
                history.map(item => (
                  <CaseCard key={item.id} item={item} onClick={() => openReport(item, 'history')} />
                ))
              )}

              {/* Real, per direct guidance: a genuinely separate
                  section from the case-history list above — real,
                  distinct people (e.g. a newborn and their mother, or
                  siblings sharing a real molecular finding),
                  never folded into "this patient's own cases." Only
                  rendered when at least one real family_relation link
                  actually exists. */}
              {familyRelatedPatients.length > 0 && (
                <div className="ps-ph-related-section">
                  <div className="ps-ph-panel-title">{t('patientHistoryModal.panel.relatedPatients')}</div>
                  {familyRelatedPatients.map(r => (
                    <div
                      key={r.id}
                      className="ps-ph-empty-state ps-ph-related-patient-row"
                      onClick={() => { setViewingRelatedPatient({ id: r.id, name: `${r.lastName}, ${r.firstName}`, mrn: r.mrn, dateOfBirth: r.dateOfBirth }); setView('list'); }}
                      data-phi="true"
                    >
                      {t('patientHistoryModal.relatedPatient.row', { firstName: r.firstName, lastName: r.lastName, mrn: r.mrn, dob: new Date(r.dateOfBirth).toLocaleDateString() })} →
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: AI Matched Cases — populated by findSimilarCases() */}
            <div className="ps-ph-panel">
              <div className="ps-ph-panel-title">
                <span className="ps-ph-accent-text">★</span>
                {t('patientHistoryModal.panel.aiMatchedCases')}
                {!aiLoading && (
                  <span className="ps-ph-result-count">{t('patientHistoryModal.panel.resultCount', { count: aiMatches.length })}</span>
                )}
              </div>
              {aiLoading ? (
                <div className="ps-ph-spinner">
                  <span className="ps-ph-spinner-circle" />
                  {t('patientHistoryModal.panel.searchingCorpus')}
                </div>
              ) : aiMatches.length === 0 ? (
                <div className="ps-ph-empty-state">{t('patientHistoryModal.panel.noAiMatches')}</div>
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
        <div className="ps-ph-footer-outer">
          {/* Compose panel — slides in when showCompose is true */}
          {showCompose && view === 'report' && (
            <div className="ps-ph-compose-header">
              <div className="ps-ph-compose-meta">
                {t('patientHistoryModal.compose.messageTo')} <span className="ps-ph-accent-text">{physicianName}</span> · {t('patientHistoryModal.compose.caseLabel')} <span className="ps-ph-bright-text">{caseId}</span>
                <span className="ps-ph-compose-warn">{t('patientHistoryModal.compose.noIdentifiersWarning')}</span>
              </div>
              <div className="ps-ph-compose-btn-row">
                <input
                  autoFocus
                  value={composeNote}
                  onChange={e => setComposeNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder={t('patientHistoryModal.compose.placeholder')}
                  className="ps-ph-compose-input"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sending || !composeNote.trim()}
                  className={`ps-btn-primary ${sent ? 'ps-ph-send-btn--sent' : ''}`}
                >
                  {sent ? `✓ ${t('patientHistoryModal.compose.sent')}` : sending ? t('patientHistoryModal.compose.sending') : `${t('patientHistoryModal.compose.send')} ↑`}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCompose(false); setComposeNote(''); }}
                  className="fm-btn-cancel"
                >
                  {t('common.cancel')}
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
                  className="fm-btn-cancel ps-ph-message-btn"
                  disabled={view !== 'report'}
                  title={view !== 'report' ? t('patientHistoryModal.compose.disabledTooltip') : t('patientHistoryModal.compose.messageButtonWithName', { name: physicianName || t('patientHistoryModal.compose.pathologistFallback') })}
                >
                  ✉ {view === 'report' && physicianName ? t('patientHistoryModal.compose.messageButtonWithName', { name: physicianName }) : t('patientHistoryModal.compose.messageButtonGeneric')}
                </button>
              )}
            </div>
            <button type="button" className="ps-btn-ghost-teal" onClick={() => {
              setCrumbs([
                { label: t('patientHistoryModal.breadcrumbNav.home'), path: '/' },
                { label: t('patientHistoryModal.breadcrumbNav.caseReport'), path: window.location.pathname },
                { label: t('patientHistoryModal.header.metaLabel'), path: window.location.pathname + '?history=1' },
                { label: t('patientHistoryModal.breadcrumbNav.caseSearch'), path: '/search' },
              ]);
              // requestNavigate first — if dirty, shows warning before closing modal
              requestNavigate('/search', (path) => {
                onClose();
                setTimeout(() => navigate(path), 50);
              });
            }}>{t('patientHistoryModal.footer.refineSearch')} ✦</button>
          </div>
        </div>

      </div>
    </div>
  );
}
