// src/components/ValidationStudies/ValidationStudiesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Validation Studies — Configuration tab for managing parallel run studies.
// Three sub-tabs: Studies | Dashboard | Reports
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '@/pathscribe.css';
import { useAuditLog } from '@/components/Audit/useAuditLog';
import { mockValidationStudyService }  from '@/services/validationStudies/mockValidationStudyService';
import type { CommitteeSubmission, CommitteeApproval } from '@/services/validationStudies/IValidationStudyService';
import { mockNarrativeSignalService }  from '@/services/narrativeSignals/mockNarrativeSignalService';
import { mockFacilityService }           from '@/services/facilities/mockFacilityService';
import { mockPhysicianService }        from '@/services/physicians/mockPhysicianService';
import { mockReportTemplateService }   from '@/services/reportTemplates/mockReportTemplateService';
import { modelService }                from '@/services';
import type { ValidationStudy }        from '@/services/validationStudies/IValidationStudyService';
import type { NarrativeSignalStats }   from '@/services/narrativeSignals/INarrativeSignalService';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { Physician }              from '@/services/physicians/IPhysicianService';
import type { ReportTemplate }         from '@/types/reportPart';
import type { AIModel }                from '@/services/models/IModelService';
import { computeValidationStudyGrade } from '@/services/validationStudies/computeValidationStudyGrade';
import { ModelStoreModal } from './ModelStoreModal';

type SubTab = 'studies' | 'dashboard' | 'reports';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft:              '#64748b',
  pending_approval:   '#f59e0b',
  approved:           '#a78bfa',
  active:             '#10b981',
  closed:             '#94a3b8',
  reported:           '#0891B2',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  draft:              'validationStudies.status.draft',
  pending_approval:   'validationStudies.status.pendingApproval',
  approved:           'validationStudies.status.approved',
  active:             'validationStudies.status.active',
  closed:             'validationStudies.status.closed',
  reported:           'validationStudies.status.reported',
};

function pct(n: number): string { return `${Math.round(n * 100)}%`; }

// Locates one or more values inside an already-translated sentence and
// wraps each in <strong>, correct regardless of a locale's word order.
// Same pattern as PoolClaimModal.tsx/RequestReviewModal.tsx's own
// boldSubstrings().
const boldSubstrings = (text: string, values: string[]): React.ReactNode => {
  const positions = values
    .filter(Boolean)
    .map(v => ({ v, i: text.indexOf(v) }))
    .filter(p => p.i !== -1)
    .sort((a, b) => a.i - b.i);
  if (positions.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  positions.forEach(({ v, i }, idx) => {
    if (i < cursor) return;
    parts.push(text.slice(cursor, i));
    parts.push(<strong key={idx}>{v}</strong>);
    cursor = i + v.length;
  });
  parts.push(text.slice(cursor));
  return parts;
};

// Real fix, found by this app's own inline-CSS/business-logic sweep:
// the PASS/CONDITIONAL PASS/FURTHER REVIEW grading rule now lives in
// computeValidationStudyGrade.ts, a dedicated, tested module — real,
// regulatory-relevant logic (persisted as ValidationStudy.finalGrade,
// which resolveClientAiModel.ts/resolveVoiceAiModel.ts both gate
// production AI model eligibility on) that had no backing service and
// no tests. See that module's own header for the full rationale.

// ── Studies Tab ───────────────────────────────────────────────────────────────

const StudiesTab: React.FC<{
  studies:    ValidationStudy[];
  facilities: Facility[];
  physicians: Physician[];
  templates:  ReportTemplate[];
  models:     AIModel[];
  onRefresh:    () => void;
  isSuperAdmin?: boolean;
}> = ({ studies, facilities, physicians, templates, models, onRefresh, isSuperAdmin: _isSuperAdmin = false }) => {
  const { t } = useTranslation();
  const { log } = useAuditLog();
  const [showNew,    setShowNew]    = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [submitId,   setSubmitId]   = useState<string | null>(null);
  const [approveId,  setApproveId]  = useState<string | null>(null);

  const handleActivate = async (id: string) => {
    const study = studies.find(s => s.id === id);
    const result = await mockValidationStudyService.activate(id, 'admin') as any;
    if (!result.ok) {
      alert(result.error ?? t('validationStudies.studies.activateError'));
      return;
    }
    if (study) log('validation_study_activated', {
      studyName:   study.name,
      activatedBy: 'admin',
      irbReference: study.committeeApproval?.irbReference ?? '',
    });
    onRefresh();
  };
  const handleClose = async (id: string) => {
    const study = studies.find(s => s.id === id);
    await mockValidationStudyService.close(id);
    const signals = await mockNarrativeSignalService.getByStudy(id);
    const signalCount = (signals as any).ok ? (signals as any).data.length : 0;
    if (study) log('validation_study_closed', { studyName: study.name, signalCount });
    onRefresh();
  };
  const handleDelete = async (id: string) => {
    const study = studies.find(s => s.id === id);
    await mockValidationStudyService.remove(id);
    if (study) log('validation_study_deleted', { studyName: study.name });
    onRefresh();
  };

  return (
    <div className="ps-vs-studies">
      <div className="ps-vs-section-header">
        <div>
          <div className="ps-vs-section-title">{t('validationStudies.studies.title')}</div>
          <div className="ps-vs-section-sub">
            {t('validationStudies.studies.subtitle')}
          </div>
        </div>
        <button className="ps-section-add-btn" onClick={() => setShowNew(true)}>{t('validationStudies.studies.newStudy')}</button>
      </div>

      {studies.length === 0 ? (
        <div className="ps-vs-empty">
          <div className="ps-vs-empty-icon">🔬</div>
          <div className="ps-vs-empty-title">{t('validationStudies.studies.emptyTitle')}</div>
          <div className="ps-vs-empty-body">
            {t('validationStudies.studies.emptyBody')}
          </div>
        </div>
      ) : studies.map(s => (
        <div key={s.id} className="ps-vs-study-row">
          <div className="ps-vs-study-row-main">
            <div className="ps-vs-study-name">{s.name}</div>
            <div className="ps-vs-study-meta">
              <span
                className="ps-vs-study-badge"
                style={{ '--ps-vs-badge-color': STATUS_COLORS[s.status] } as React.CSSProperties}
              >
                {STATUS_LABEL_KEY[s.status] ? t(STATUS_LABEL_KEY[s.status]) : s.status.toUpperCase()}
              </span>
              <span>{t('validationStudies.studies.facilityCount', { count: s.clientIds.length })}</span>
              <span>{t('validationStudies.studies.pathologistCount', { count: s.pathologistIds.length })}</span>
              {s.templateIds && s.templateIds.length > 0 && (
                <span>{t('validationStudies.studies.templateCount', { count: s.templateIds.length })}</span>
              )}
              <span>{t('validationStudies.studies.targetAcceptance', { pct: pct(s.targetAcceptanceRate) })}</span>
              {s.startDate && <span>{t('validationStudies.studies.started', { date: new Date(s.startDate).toLocaleDateString() })}</span>}
              {s.committeeApproval?.irbReference && <span>{t('validationStudies.studies.irb', { ref: s.committeeApproval.irbReference })}</span>}
              {s.committeeSubmission?.committeeName && s.status === 'pending_approval' && <span>{t('validationStudies.studies.committee', { name: s.committeeSubmission.committeeName })}</span>}
            </div>
            {s.description && <div className="ps-vs-study-desc">{s.description}</div>}
          </div>
          <div className="ps-vs-study-actions">
            {s.status === 'draft'            && <button className="ps-rr-btn" onClick={() => setEditId(s.id)}>{t('validationStudies.studies.edit')}</button>}
            {s.status === 'draft'            && <button className="ps-rr-btn ps-rr-btn--primary" onClick={() => setSubmitId(s.id)}>{t('validationStudies.studies.submitForReview')}</button>}
            {s.status === 'pending_approval' && <button className="ps-rr-btn ps-rr-btn--primary" onClick={() => setApproveId(s.id)}>{t('validationStudies.studies.recordApproval')}</button>}
            {s.status === 'approved'         && <button className="ps-rr-btn ps-rr-btn--primary" onClick={() => handleActivate(s.id)}>{t('validationStudies.studies.activate')}</button>}
            {s.status === 'active'           && <button className="ps-rr-btn" onClick={() => handleClose(s.id)}>{t('validationStudies.studies.closeStudy')}</button>}
            {s.status === 'draft'            && <button className="ps-rr-btn ps-rr-btn--ghost" onClick={() => handleDelete(s.id)}>{t('validationStudies.studies.delete')}</button>}
          </div>
        </div>
      ))}

      {showNew && (
        <StudyFormModal
          facilities={facilities}
          physicians={physicians}
          templates={templates}
          models={models}
          onSave={async (data) => {
            await mockValidationStudyService.create(data as any);
            log('validation_study_created', {
              studyName: (data as any).name ?? 'Unknown',
              clientCount: ((data as any).clientIds ?? []).length,
              pathologistCount: ((data as any).pathologistIds ?? []).length,
            });
            setShowNew(false);
            onRefresh();
          }}
          onClose={() => setShowNew(false)}
          onModelsChanged={onRefresh}
        />
      )}

      {submitId && (
        <SubmitForReviewModal
          study={studies.find(s => s.id === submitId)!}
          onSave={async (submission) => {
            const study = studies.find(s => s.id === submitId);
            await mockValidationStudyService.submitForReview(submitId, submission);
            if (study) log('validation_study_submitted', {
              studyName:     study.name,
              committeeName: submission.committeeName,
              submittedBy:   submission.submittedBy,
            });
            setSubmitId(null);
            onRefresh();
          }}
          onClose={() => setSubmitId(null)}
        />
      )}

      {approveId && (
        <RecordApprovalModal
          study={studies.find(s => s.id === approveId)!}
          onSave={async (approval) => {
            const study = studies.find(s => s.id === approveId);
            await mockValidationStudyService.recordApproval(approveId, approval);
            if (study) log('validation_study_approval_recorded', {
              studyName:    study.name,
              irbReference: approval.irbReference,
              approvedBy:   approval.approvedBy,
              conditions:   approval.conditions,
            });
            setApproveId(null);
            onRefresh();
          }}
          onClose={() => setApproveId(null)}
        />
      )}

      {editId && (
        <StudyFormModal
          facilities={facilities}
          physicians={physicians}
          templates={templates}
          models={models}
          existing={studies.find(s => s.id === editId)}
          onSave={async (data) => {
            await mockValidationStudyService.update(editId, data as any);
            log('validation_study_created', {
              studyName: (data as any).name ?? 'Unknown',
              clientCount: ((data as any).clientIds ?? []).length,
              pathologistCount: ((data as any).pathologistIds ?? []).length,
            });
            setEditId(null);
            onRefresh();
          }}
          onClose={() => setEditId(null)}
          onModelsChanged={onRefresh}
        />
      )}
    </div>
  );
};

// ── Study Form Modal ──────────────────────────────────────────────────────────

// ── Submit for Review Modal ──────────────────────────────────────────────────

const SubmitForReviewModal: React.FC<{
  study:   ValidationStudy;
  onSave:  (submission: CommitteeSubmission) => void;
  onClose: () => void;
}> = ({ study, onSave, onClose }) => {
  const { t } = useTranslation();
  const [committeeName,       setCommitteeName]       = useState('');
  const [submittedBy,         setSubmittedBy]         = useState('');
  const [expectedReviewDate,  setExpectedReviewDate]  = useState('');
  const [notes,               setNotes]               = useState('');

  const canSave = committeeName.trim() && submittedBy.trim();

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{t('validationStudies.submitModal.title')}</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div className="ps-vs-modal-body">
          <div className="ps-vs-modal-study-name">{study.name}</div>

          <div className="ps-vs-modal-info">
            {boldSubstrings(
              t('validationStudies.submitModal.info', { status: t(STATUS_LABEL_KEY.pending_approval) }),
              [t(STATUS_LABEL_KEY.pending_approval)]
            )}
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.submitModal.committeeName')}</div>
            <input
              className="ps-conf-input"
              value={committeeName}
              onChange={e => setCommitteeName(e.target.value)}
              placeholder={t('validationStudies.submitModal.committeeNamePlaceholder')}
            />
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.submitModal.submittedBy')}</div>
            <input
              className="ps-conf-input"
              value={submittedBy}
              onChange={e => setSubmittedBy(e.target.value)}
              placeholder={t('validationStudies.submitModal.submittedByPlaceholder')}
            />
          </div>

          <div>
            <div className="ps-conf-label">{t('validationStudies.submitModal.expectedReviewDate')}</div>
            <input
              type="date"
              className="ps-conf-input"
              value={expectedReviewDate}
              onChange={e => setExpectedReviewDate(e.target.value)}
            />
          </div>

          <div>
            <div className="ps-conf-label">{t('validationStudies.submitModal.notes')}</div>
            <textarea
              className="ps-conf-input"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('validationStudies.submitModal.notesPlaceholder')}
            />
          </div>

          <div className="ps-vs-modal-governance">
            🔒 {t('validationStudies.submitModal.auditNotice')}
          </div>
        </div>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>{t('validationStudies.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canSave}
            onClick={() => onSave({
              submittedAt:        new Date().toISOString(),
              submittedBy:        submittedBy.trim(),
              committeeName:      committeeName.trim(),
              expectedReviewDate: expectedReviewDate || undefined,
              notes:              notes.trim() || undefined,
            })}
          >
            {t('validationStudies.submitModal.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Record Approval Modal ─────────────────────────────────────────────────────

const RecordApprovalModal: React.FC<{
  study:   ValidationStudy;
  onSave:  (approval: CommitteeApproval) => void;
  onClose: () => void;
}> = ({ study, onSave, onClose }) => {
  const { t } = useTranslation();
  const [approvedBy,           setApprovedBy]           = useState('');
  const [approvedAt,           setApprovedAt]           = useState(new Date().toISOString().slice(0,10));
  const [irbReference,         setIrbReference]         = useState('');
  const [committeeMinutesRef,  setCommitteeMinutesRef]  = useState('');
  const [conditions,           setConditions]           = useState('');

  const canSave = approvedBy.trim() && irbReference.trim() && approvedAt;

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{t('validationStudies.approveModal.title')}</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div className="ps-vs-modal-body">
          <div className="ps-vs-modal-study-name">{study.name}</div>

          {study.committeeSubmission && (
            <div className="ps-vs-modal-submission-ref">
              <span className="ps-vs-modal-ref-label">{t('validationStudies.approveModal.submittedTo')}</span>
              <span>{study.committeeSubmission.committeeName}</span>
              <span className="ps-vs-modal-ref-label">{t('validationStudies.approveModal.by')}</span>
              <span>{study.committeeSubmission.submittedBy}</span>
              <span className="ps-vs-modal-ref-label">{t('validationStudies.approveModal.on')}</span>
              <span>{new Date(study.committeeSubmission.submittedAt).toLocaleDateString()}</span>
            </div>
          )}

          <div className="ps-vs-modal-info">
            {boldSubstrings(
              t('validationStudies.approveModal.info', { status: t(STATUS_LABEL_KEY.approved) }),
              [t(STATUS_LABEL_KEY.approved)]
            )}
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.approveModal.irbReference')}</div>
            <input
              className="ps-conf-input"
              value={irbReference}
              onChange={e => setIrbReference(e.target.value)}
              placeholder={t('validationStudies.approveModal.irbReferencePlaceholder')}
            />
            <div className="ps-vs-slider-hint">{t('validationStudies.approveModal.irbReferenceHint')}</div>
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.approveModal.approvedBy')}</div>
            <input
              className="ps-conf-input"
              value={approvedBy}
              onChange={e => setApprovedBy(e.target.value)}
              placeholder={t('validationStudies.approveModal.approvedByPlaceholder')}
            />
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.approveModal.approvalDate')}</div>
            <input
              type="date"
              className="ps-conf-input"
              value={approvedAt}
              onChange={e => setApprovedAt(e.target.value)}
            />
          </div>

          <div>
            <div className="ps-conf-label">{t('validationStudies.approveModal.minutesReference')}</div>
            <input
              className="ps-conf-input"
              value={committeeMinutesRef}
              onChange={e => setCommitteeMinutesRef(e.target.value)}
              placeholder={t('validationStudies.approveModal.minutesReferencePlaceholder')}
            />
          </div>

          <div>
            <div className="ps-conf-label">{t('validationStudies.approveModal.conditions')}</div>
            <textarea
              className="ps-conf-input"
              rows={3}
              value={conditions}
              onChange={e => setConditions(e.target.value)}
              placeholder={t('validationStudies.approveModal.conditionsPlaceholder')}
            />
          </div>

          <div className="ps-vs-modal-governance">
            🔒 {t('validationStudies.approveModal.auditNotice')}
          </div>
        </div>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>{t('validationStudies.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canSave}
            onClick={() => onSave({
              approvedAt:           new Date(approvedAt).toISOString(),
              approvedBy:           approvedBy.trim(),
              irbReference:         irbReference.trim(),
              committeeMinutesRef:  committeeMinutesRef.trim() || undefined,
              conditions:           conditions.trim() || undefined,
            })}
          >
            {t('validationStudies.approveModal.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Study Form Modal ──────────────────────────────────────────────────────────

const StudyFormModal: React.FC<{
  facilities: Facility[];
  physicians: Physician[];
  templates:  ReportTemplate[];
  models:     AIModel[];
  existing?:  ValidationStudy;
  onSave:     (data: Partial<ValidationStudy>) => void;
  onClose:    () => void;
  /** Real fix, per direct workflow description: the point where an
   *  admin who got the "new model available" email actually goes to
   *  get it — browsing the ForMedrixAI store and downloading a model
   *  creates a genuine new local record, which the parent needs to
   *  know about to refresh its own `models` list. Without this, the
   *  newly-downloaded model would exist in storage but never appear
   *  as a selectable option here. */
  onModelsChanged?: () => void;
}> = ({ facilities, physicians, templates, models, existing, onSave, onClose, onModelsChanged }) => {
  const { t } = useTranslation();
  const isEdit = !!existing;
  const [name,           setName]           = useState(existing?.name ?? '');
  const [description,    setDescription]    = useState(existing?.description ?? '');
  const [modelId,        setModelId]        = useState(existing?.modelId ?? '');
  const [showStore,      setShowStore]      = useState(false);
  const [clientIds,      setClientIds]      = useState<string[]>(existing?.clientIds ?? []);
  const [pathIds,        setPathIds]        = useState<string[]>(existing?.pathologistIds ?? []);
  // Real fix, per direct report: templateIds is a real field on
  // ValidationStudy — explicitly documented as part of the study's
  // scope, alongside clientIds/pathologistIds — but this form never
  // had a UI for it. The `templates` prop was fetched by the parent
  // and passed in for exactly this purpose, then silently renamed
  // `_templates` here (unused) rather than wired up. The "How this
  // works" example already described scoping a study by template
  // ("template: Breast Core Biopsy") — this makes that description
  // actually true rather than aspirational. Optional, matching the
  // field's own optional type — a study can validly be unscoped by
  // template (applies across all templates for the selected facilities).
  const [templateIds,    setTemplateIds]    = useState<string[]>(existing?.templateIds ?? []);
  const [targetAccept,   setTargetAccept]   = useState(existing?.targetAcceptanceRate ?? 0.70);
  const [targetEdit,     setTargetEdit]     = useState(existing?.targetMaxEditRatio ?? 0.30);
  const [startDate,      setStartDate]      = useState(existing?.startDate ? existing.startDate.slice(0,10) : new Date().toISOString().slice(0,10));
  const [irbRef,         setIrbRef]         = useState(existing?.committeeApproval?.irbReference ?? '');
  const [piId,           setPiId]           = useState(existing?.principalInvestigatorId ?? '');
  void setPiId; // genuine gap: no input field lets a user actually choose a specific PI; always falls back to pathIds[0] at submission (line ~569). Flagged, not deleted.

  const toggleFacility = (id: string) => {
    const next = clientIds.includes(id) ? clientIds.filter(x => x !== id) : [...clientIds, id];
    setClientIds(next);
    // Remove pathologists no longer associated with any selected facility
    setPathIds(prev => prev.filter(pid => {
      const ph = physicians.find(p => (p.id as string) === pid);
      return ph?.clientIds?.some((cid: string) => next.includes(cid));
    }));
  };
  const togglePath = (id: string) =>
    setPathIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleTemplate = (id: string) =>
    setTemplateIds(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-vs-studyform-modal" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{isEdit ? t('validationStudies.form.editTitle') : t('validationStudies.form.newTitle')}</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div className="ps-vs-studyform-body">

          <div><div className="ps-conf-label ps-conf-label--required">{t('validationStudies.form.studyName')}</div>
            <input className="ps-conf-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('validationStudies.form.studyNamePlaceholder')} /></div>

          <div><div className="ps-conf-label">{t('validationStudies.form.description')}</div>
            <textarea className="ps-conf-input" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder={t('validationStudies.form.descriptionPlaceholder')} /></div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.form.aiModel')}</div>
            <select
              className="ps-conf-select"
              value={modelId}
              disabled={isEdit}
              onChange={e => setModelId(e.target.value)}
              title={isEdit ? t('validationStudies.form.aiModelLockedTitle') : undefined}
            >
              <option value="">{t('validationStudies.form.aiModelPlaceholder')}</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.version} — {m.status}</option>
              ))}
            </select>
            {isEdit && (
              <div className="ps-vs-slider-hint ps-vs-hint--spaced">
                {t('validationStudies.form.aiModelLockedHint')}
              </div>
            )}
            {!isEdit && (
              <button
                type="button"
                onClick={() => setShowStore(true)}
                className="ps-vs-store-link"
              >
                🏪 {t('validationStudies.form.browseStore')}
              </button>
            )}
            {showStore && (
              <ModelStoreModal
                onClose={() => setShowStore(false)}
                onDownloaded={newModel => {
                  setShowStore(false);
                  setModelId(newModel.id as string);
                  onModelsChanged?.();
                }}
              />
            )}
          </div>

          <div className="ps-vs-form-2col">
            <div><div className="ps-conf-label">{t('validationStudies.form.targetAcceptanceRate')}</div>
              <div className="ps-vs-slider-wrap">
                <input type="range" min={0.5} max={1} step={0.05} value={targetAccept} onChange={e => setTargetAccept(Number(e.target.value))} className="ps-vs-slider" />
                <span className="ps-vs-slider-val">{pct(targetAccept)}</span>
              </div>
              <div className="ps-vs-slider-hint">{t('validationStudies.form.targetAcceptanceRateHint')}</div>
            </div>
            <div><div className="ps-conf-label">{t('validationStudies.form.maxEditRatio')}</div>
              <div className="ps-vs-slider-wrap">
                <input type="range" min={0.1} max={0.9} step={0.05} value={targetEdit} onChange={e => setTargetEdit(Number(e.target.value))} className="ps-vs-slider" />
                <span className="ps-vs-slider-val">{pct(targetEdit)}</span>
              </div>
              <div className="ps-vs-slider-hint">{t('validationStudies.form.maxEditRatioHint')}</div>
            </div>
          </div>

          <div><div className="ps-conf-label ps-conf-label--required">{t('validationStudies.form.startDate')}</div>
            <input type="date" className="ps-conf-input" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>

          <div><div className="ps-conf-label">{t('validationStudies.form.irbReference')}</div>
            <input className="ps-conf-input" value={irbRef} onChange={e => setIrbRef(e.target.value)} placeholder={t('validationStudies.form.irbReferencePlaceholder')} /></div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.form.facilities')}</div>
            <div className="ps-vs-checklist">
              {facilities.map(c => (
                <label key={c.id as string} className="ps-vs-check-row">
                  <input type="checkbox" checked={clientIds.includes(c.id as string)} onChange={() => toggleFacility(c.id as string)} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">{t('validationStudies.form.pathologists')}</div>
            {clientIds.length === 0 && (
              <div className="ps-vs-slider-hint ps-vs-hint--spaced">{t('validationStudies.form.pathologistsHint')}</div>
            )}
            <div className="ps-vs-checklist">
              {physicians
                .filter(p => clientIds.length === 0 || p.clientIds?.some((cid: string) => clientIds.includes(cid)))
                .map(p => (
                  <label key={p.id as string} className="ps-vs-check-row">
                    <input type="checkbox" checked={pathIds.includes(p.id as string)} onChange={() => togglePath(p.id as string)} />
                    <span>{p.lastName}, {p.firstName} — {p.specialty}</span>
                  </label>
                ))
              }
              {clientIds.length > 0 && physicians.filter(p => p.clientIds?.some((cid: string) => clientIds.includes(cid))).length === 0 && (
                <div className="ps-vs-slider-hint">{t('validationStudies.form.noPathologistsFound')}</div>
              )}
            </div>
          </div>

          <div>
            <div className="ps-conf-label">{t('validationStudies.form.templates')}</div>
            <div className="ps-vs-slider-hint ps-vs-hint--spaced">
              {t('validationStudies.form.templatesHint')}
            </div>
            <div className="ps-vs-checklist">
              {templates.map(tpl => (
                <label key={tpl.id} className="ps-vs-check-row">
                  <input type="checkbox" checked={templateIds.includes(tpl.id)} onChange={() => toggleTemplate(tpl.id)} />
                  <span>{tpl.name} — {tpl.specialty}</span>
                </label>
              ))}
              {templates.length === 0 && (
                <div className="ps-vs-slider-hint">{t('validationStudies.form.noTemplatesAvailable')}</div>
              )}
            </div>
          </div>

        </div>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>{t('validationStudies.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!name || !modelId || clientIds.length === 0 || pathIds.length === 0}
            onClick={() => onSave({
              name, description, status: 'draft',
              modelId,
              clientIds, pathologistIds: pathIds,
              ...(templateIds.length > 0 ? { templateIds } : {}),
              targetAcceptanceRate: targetAccept,
              targetMaxEditRatio:   targetEdit,
              // irbReference intentionally omitted here — it lives on
              // committeeApproval, which requires approvedAt/approvedBy
              // and only gets populated later via the real
              // recordApproval flow. A draft study can't validly have
              // a partial committeeApproval object yet.
              startDate,
              principalInvestigatorId: piId || (pathIds[0] ?? ''),
              validationMode: 'advisory',
              createdBy: 'admin',
            })}
          >{isEdit ? t('validationStudies.form.saveChanges') : t('validationStudies.form.createStudy')}</button>
        </div>
      </div>
    </div>
  );
};

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

const DashboardTab: React.FC<{
  studies:      ValidationStudy[];
  isSuperAdmin?: boolean;
}> = ({ studies, isSuperAdmin: _isSuperAdmin = false }) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>(studies[0]?.id ?? '');
  const [stats,      setStats]      = useState<NarrativeSignalStats | null>(null);
  const [caseCount,  setCaseCount]  = useState(0);

  const active = studies.filter(s => s.status === 'active' || s.status === 'closed');

  useEffect(() => {
    if (!selectedId) return;
    mockNarrativeSignalService.getStats(selectedId).then((r: any) => {
      if (r.ok) setStats(r.data);
    });
    mockNarrativeSignalService.getByStudy(selectedId).then((r: any) => {
      if (r.ok) setCaseCount(new Set(r.data.map((s: any) => s.caseId)).size);
    });
  }, [selectedId]);

  const study = studies.find(s => s.id === selectedId);

  if (active.length === 0) return (
    <div className="ps-vs-empty">
      <div className="ps-vs-empty-icon">📊</div>
      <div className="ps-vs-empty-title">{t('validationStudies.dashboard.emptyTitle')}</div>
      <div className="ps-vs-empty-body">{t('validationStudies.dashboard.emptyBody')}</div>
    </div>
  );

  return (
    <div className="ps-vs-dashboard">
      <div className="ps-vs-study-select-wrap">
        <select className="ps-conf-select ps-vs-select--wide" aria-label={t('validationStudies.dashboard.selectStudyAriaLabel')} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          {active.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {study && (
          <span
            className="ps-vs-study-badge"
            style={{ '--ps-vs-badge-color': STATUS_COLORS[study.status] } as React.CSSProperties}
          >
            {STATUS_LABEL_KEY[study.status] ? t(STATUS_LABEL_KEY[study.status]) : study.status.toUpperCase()}
          </span>
        )}
      </div>

      {stats && study && (
        <>
          {/* KPI cards */}
          <div className="ps-vs-kpi-row">
            <div className="ps-vs-kpi">
              <div className="ps-vs-kpi-val">{caseCount}</div>
              <div className="ps-vs-kpi-label">{t('validationStudies.dashboard.casesCaptured')}</div>
              {study.targetCaseCount && <div className="ps-vs-kpi-target">{t('validationStudies.dashboard.target', { value: study.targetCaseCount })}</div>}
            </div>
            <div className="ps-vs-kpi">
              <div className="ps-vs-kpi-val">{stats.totalSignals}</div>
              <div className="ps-vs-kpi-label">{t('validationStudies.dashboard.sectionSignals')}</div>
            </div>
            <div className={`ps-vs-kpi ${stats.acceptanceRate >= study.targetAcceptanceRate ? 'ps-vs-kpi--good' : 'ps-vs-kpi--bad'}`}>
              <div className="ps-vs-kpi-val ps-vs-kpi-val--metric">
                {pct(stats.acceptanceRate)}
              </div>
              <div className="ps-vs-kpi-label">{t('validationStudies.dashboard.acceptanceRate')}</div>
              <div className="ps-vs-kpi-target">{t('validationStudies.dashboard.targetAtLeast', { value: pct(study.targetAcceptanceRate) })}</div>
            </div>
            <div className="ps-vs-kpi">
              <div className="ps-vs-kpi-val">{stats.acceptedCount}</div>
              <div className="ps-vs-kpi-label">{t('validationStudies.dashboard.acceptedUnchanged')}</div>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="ps-vs-table-wrap">
            <div className="ps-vs-table-title">{t('validationStudies.dashboard.performanceBySection')}</div>
            <table className="ps-vs-table">
              <thead>
                <tr>
                  <th>{t('validationStudies.dashboard.colSection')}</th>
                  <th>{t('validationStudies.dashboard.colSignals')}</th>
                  <th>{t('validationStudies.dashboard.colAcceptance')}</th>
                  <th>{t('validationStudies.dashboard.colMeanEditRatio')}</th>
                  <th>{t('validationStudies.dashboard.colMostCommonEdit')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.bySection).map(([sectionId, sec]) => {
                  const topEdit = Object.entries(sec.editTypes).sort((a,b) => b[1]-a[1])[0];
                  const ar = sec.total ? sec.accepted / sec.total : 0;
                  return (
                    <tr key={sectionId}>
                      <td className="ps-vs-td-name">{sectionId.replace(/_/g,' ')}</td>
                      <td>{sec.total}</td>
                      <td className={ar >= study.targetAcceptanceRate ? 'ps-vs-metric--good' : 'ps-vs-metric--bad'}>{pct(ar)}</td>
                      <td className={sec.avgEditRatio <= study.targetMaxEditRatio ? 'ps-vs-metric--good' : 'ps-vs-metric--bad'}>{pct(sec.avgEditRatio)}</td>
                      <td className="ps-vs-td-edittype">{topEdit?.[0]?.replace(/_/g,' ') ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Advisory mode notice */}
          <div className="ps-vs-advisory-notice">
            🔒 {t('validationStudies.dashboard.advisoryNotice')}
          </div>
        </>
      )}

      {!stats?.totalSignals && (
        <div className="ps-vs-empty ps-vs-empty--spaced">
          <div className="ps-vs-empty-body">{t('validationStudies.dashboard.noSignalsYet')}</div>
        </div>
      )}
    </div>
  );
};

// ── Reports Tab ───────────────────────────────────────────────────────────────

const ReportsTab: React.FC<{ studies: ValidationStudy[]; onRefresh: () => void; isSuperAdmin?: boolean }> = ({ studies, onRefresh, isSuperAdmin: _isSuperAdmin = false }) => {
  const { t } = useTranslation();
  const { log } = useAuditLog();
  const [selectedId, setSelectedId] = useState<string>(studies[0]?.id ?? '');
  const [stats,      setStats]      = useState<NarrativeSignalStats | null>(null);
  const [caseCount,  setCaseCount]  = useState(0);
  const [generating, setGenerating] = useState(false);

  const closedStudies = studies.filter(s => s.status === 'closed' || s.status === 'reported');
  const study = studies.find(s => s.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    mockNarrativeSignalService.getStats(selectedId).then((r: any) => { if (r.ok) setStats(r.data); });
    mockNarrativeSignalService.getByStudy(selectedId).then((r: any) => {
      if (r.ok) setCaseCount(new Set(r.data.map((s: any) => s.caseId)).size);
    });
  }, [selectedId]);

  const generateReport = async () => {
    if (!study || !stats) return;
    setGenerating(true);

    // Generate screen report — PDF export would use reportlab/pdfmake in production
    const avgEditRatio = Object.values(stats.bySection).reduce((sum, s) => sum + s.avgEditRatio, 0) /
      Math.max(Object.values(stats.bySection).length, 1);
    const grade = computeValidationStudyGrade(stats.acceptanceRate, study.targetAcceptanceRate, avgEditRatio, study.targetMaxEditRatio);

    // Print-friendly report in new window
    const html = buildReportHtml(study, stats, caseCount, grade, avgEditRatio);
    const win  = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }

    // Real fix: the grade shown here was always computed live and never
    // actually recorded anywhere on the study itself — meaning nothing
    // else in the app (like a facility's own AI model override) could
    // ever check "did this study pass" without recomputing it fresh.
    // Persisted exactly once, the first time a report is generated —
    // if finalGrade is already set from an earlier report run, it's
    // deliberately left alone rather than overwritten, even if the
    // live numbers would now compute differently.
    const alreadyGraded = !!study.finalGrade;
    await mockValidationStudyService.update(study.id, {
      status: 'reported',
      ...(alreadyGraded ? {} : {
        finalGrade: grade.grade,
        finalGradedAt: new Date().toISOString(),
      }),
    });
    log('validation_report_generated', {
      studyName: study.name,
      caseCount,
      acceptanceRate: pct(stats.acceptanceRate),
    });
    onRefresh();
    setGenerating(false);
  };

  return (
    <div className="ps-vs-reports">
      <div className="ps-vs-section-header">
        <div>
          <div className="ps-vs-section-title">{t('validationStudies.reports.title')}</div>
          <div className="ps-vs-section-sub">
            {t('validationStudies.reports.subtitle')}
          </div>
        </div>
      </div>

      {closedStudies.length === 0 ? (
        <div className="ps-vs-empty">
          <div className="ps-vs-empty-icon">📄</div>
          <div className="ps-vs-empty-title">{t('validationStudies.reports.emptyTitle')}</div>
          <div className="ps-vs-empty-body">{t('validationStudies.reports.emptyBody')}</div>
        </div>
      ) : (
        <>
          <div className="ps-vs-reports-select-wrap">
            <select className="ps-conf-select ps-vs-select--wide" aria-label={t('validationStudies.reports.selectStudyAriaLabel')} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {closedStudies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {study && stats && (
            <div className="ps-vs-report-preview">
              <div className="ps-vs-report-preview-title">{t('validationStudies.reports.previewTitle', { name: study.name })}</div>
              <div className="ps-vs-report-kpis">
                <div><span className="ps-vs-rp-label">{t('validationStudies.reports.period')}</span><span>{new Date(study.startDate).toLocaleDateString()} — {study.endDate ? new Date(study.endDate).toLocaleDateString() : t('validationStudies.reports.ongoing')}</span></div>
                <div><span className="ps-vs-rp-label">{t('validationStudies.reports.cases')}</span><span>{caseCount}</span></div>
                <div><span className="ps-vs-rp-label">{t('validationStudies.reports.sectionsAnalysed')}</span><span>{stats.totalSignals}</span></div>
                <div><span className="ps-vs-rp-label">{t('validationStudies.reports.acceptanceRate')}</span><span className={stats.acceptanceRate >= study.targetAcceptanceRate ? 'ps-vs-metric--good' : 'ps-vs-metric--bad'}>{pct(stats.acceptanceRate)}</span></div>
                <div><span className="ps-vs-rp-label">{t('validationStudies.reports.governance')}</span><span>{t('validationStudies.reports.advisoryModeOnly')}</span></div>
                {study.committeeApproval?.irbReference && <div><span className="ps-vs-rp-label">{t('validationStudies.reports.irb')}</span><span>{study.committeeApproval.irbReference}</span></div>}
              </div>
              <button className="ps-conf-btn-primary ps-vs-generate-btn" onClick={generateReport} disabled={generating}>
                {generating ? t('validationStudies.reports.generating') : `📄 ${t('validationStudies.reports.generateAndPrint')}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Print-quality HTML report ─────────────────────────────────────────────────

function buildReportHtml(
  study:         ValidationStudy,
  stats:         NarrativeSignalStats,
  caseCount:     number,
  grade:         { grade: string; color: string; description: string },
  avgEditRatio:  number,
): string {
  const now   = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const rows   = Object.entries(stats.bySection).map(([sid, sec]) => {
    const ar = sec.total ? sec.accepted / sec.total : 0;
    return `<tr>
      <td>${sid.replace(/_/g,' ')}</td>
      <td>${sec.total}</td>
      <td>${pct(ar)}</td>
      <td>${pct(sec.avgEditRatio)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>PathScribe Validation Report — ${study.name}</title>
<style>
  body { font-family: 'Arial', sans-serif; font-size: 12px; color: #1f2937; margin: 40px; }
  h1 { font-size: 20px; color: #0f172a; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #0891B2; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 24px 0 10px; }
  .subtitle { color: #6b7280; font-size: 11px; margin-bottom: 24px; }
  .rule { height: 2px; background: linear-gradient(90deg,#0891B2,rgba(8,145,178,0.1)); margin: 16px 0; }
  .kpi-row { display: flex; gap: 20px; margin: 12px 0; }
  .kpi { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
  .kpi-val { font-size: 22px; font-weight: 700; color: #0f172a; }
  .kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; color: #6b7280; }
  td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
  .grade { font-size: 16px; font-weight: 700; color: ${grade.color}; }
  .advisory { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; font-size: 11px; color: #1e40af; margin-top: 24px; }
  .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #9ca3af; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>PathScribe AI Validation Report</h1>
<div class="subtitle">Generated ${now} · Confidential — not for distribution without authorisation</div>
<div class="rule"></div>

<h2>1. Study Overview</h2>
<table><tr><td><strong>Study Name</strong></td><td>${study.name}</td></tr>
<tr><td><strong>Period</strong></td><td>${new Date(study.startDate).toLocaleDateString()} — ${study.endDate ? new Date(study.endDate).toLocaleDateString() : 'Ongoing'}</td></tr>
<tr><td><strong>Validation Mode</strong></td><td>Advisory — AI output reviewed and signed by pathologist. No AI-direct LIS submission.</td></tr>
${study.committeeApproval?.irbReference ? `<tr><td><strong>Ethics Reference</strong></td><td>${study.committeeApproval.irbReference}</td></tr>` : ''}
<tr><td><strong>PathScribe Version</strong></td><td>v${__APP_VERSION__}</td></tr></table>

<h2>2. Executive Summary</h2>
<div class="grade">${grade.grade}</div>
<p style="margin-top:6px">${grade.description}</p>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-val">${caseCount}</div><div class="kpi-label">Cases</div></div>
  <div class="kpi"><div class="kpi-val">${stats.totalSignals}</div><div class="kpi-label">Sections analysed</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${stats.acceptanceRate>=study.targetAcceptanceRate?'#10b981':'#ef4444'}">${pct(stats.acceptanceRate)}</div><div class="kpi-label">Acceptance rate</div></div>
  <div class="kpi"><div class="kpi-val">${pct(avgEditRatio)}</div><div class="kpi-label">Mean edit ratio</div></div>
</div>

<h2>3. AI Narrative Quality — by Section</h2>
<table><thead><tr><th>Section</th><th>Signals</th><th>Acceptance</th><th>Mean Edit Ratio</th></tr></thead>
<tbody>${rows}</tbody></table>

<h2>4. Governance Statement</h2>
<p>All AI-generated narrative output was reviewed, edited where necessary, and signed by a qualified pathologist before submission to the laboratory information system. PathScribe operated in advisory mode throughout this study. No AI output was transmitted to the LIS without pathologist approval. Patient data does not appear in this report. Individual pathologist performance metrics are not disclosed in this report.</p>

<div class="advisory">🔒 This report contains no patient-identifiable information. Aggregate statistics only. De-identification applied at signal capture — clinical values replaced with typed placeholders before storage.</div>

<div class="footer">	PathScribe v${__APP_VERSION__} · ForMedrixAI · Confidential validation report · ${now}</div>
</body></html>`;
}

// ── Main Section ──────────────────────────────────────────────────────────────

const SUBTAB_LABEL_KEY: Record<SubTab, string> = {
  studies:   'validationStudies.tabs.studies',
  dashboard: 'validationStudies.tabs.dashboard',
  reports:   'validationStudies.tabs.reports',
};

const ValidationStudiesSection: React.FC<{ isSuperAdmin?: boolean }> = ({ isSuperAdmin = false }) => {
  const { t } = useTranslation();
  const [subTab,     setSubTab]     = useState<SubTab>('studies');
  const [studies,    setStudies]    = useState<ValidationStudy[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [templates,  setTemplates]  = useState<ReportTemplate[]>([]);
  const [models,     setModels]     = useState<AIModel[]>([]);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const load = useCallback(async () => {
    const [sr, cr, pr, tr, mr] = await Promise.all([
      mockValidationStudyService.getAll(),
      mockFacilityService.getAll(),
      mockPhysicianService.getAll(),
      mockReportTemplateService.getAll(),
      modelService.getAll(),
    ]);
    if ((sr as any).ok) setStudies((sr as any).data);
    if ((cr as any).ok) setFacilities((cr as any).data.filter((c: Facility) => c.status === 'Active'));
    if ((pr as any).ok) setPhysicians((pr as any).data.filter((p: Physician) => p.status === 'Active'));
    if ((tr as any).ok) setTemplates((tr as any).data.filter((t: ReportTemplate) => t.status === 'published'));
    if (mr.ok) setModels(mr.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ps-vs-root">
      <div className="ps-vs-header">
        <div className="ps-vs-header-title">{t('validationStudies.header.title')}</div>
        <div className="ps-vs-header-sub">
          {t('validationStudies.header.subtitle')}
        </div>
        <div className="ps-vs-advisory-banner">
          🔒 {t('validationStudies.header.advisoryBanner')}
        </div>
        <button
          onClick={() => setHowItWorksOpen(o => !o)}
          className="ps-conf-btn-secondary ps-vs-howitworks-toggle"
        >
          {howItWorksOpen ? '▾' : '▸'} {t('validationStudies.howItWorks.toggle')}
        </button>
        {howItWorksOpen && (
          <div className="ps-vs-howitworks-panel">
            <p className="ps-vs-howitworks-p">
              <Trans
                i18nKey="validationStudies.howItWorks.intro"
                components={{ strong: <strong /> }}
              />
            </p>
            <p className="ps-vs-howitworks-p">
              <Trans
                i18nKey="validationStudies.howItWorks.betaNote"
                components={{ beta: <strong className="ps-vs-howitworks-beta" /> }}
              />
            </p>
            <p className="ps-vs-howitworks-example-heading">{t('validationStudies.howItWorks.workedExample')}</p>
            <p className="ps-vs-howitworks-p">
              {t('validationStudies.howItWorks.exampleIntro')}
            </p>
            <ol className="ps-vs-howitworks-list">
              <li><Trans i18nKey="validationStudies.howItWorks.step1" components={{ strong: <strong /> }} /></li>
              <li><Trans i18nKey="validationStudies.howItWorks.step2" components={{ strong: <strong /> }} /></li>
              <li><Trans i18nKey="validationStudies.howItWorks.step3" components={{ strong: <strong /> }} /></li>
              <li><Trans i18nKey="validationStudies.howItWorks.step4" components={{ strong: <strong /> }} /></li>
              <li><Trans i18nKey="validationStudies.howItWorks.step5" components={{ strong: <strong /> }} /></li>
              <li><Trans i18nKey="validationStudies.howItWorks.step6" components={{ strong: <strong /> }} /></li>
            </ol>
            <p className="ps-vs-howitworks-footer">
              {t('validationStudies.howItWorks.footer')}
            </p>
          </div>
        )}
      </div>

      <div className="ps-sub-tab-group">
        {(['studies','dashboard','reports'] as SubTab[]).map(tab => (
          <button key={tab} onClick={() => setSubTab(tab)} className={`ps-sub-tab-btn${subTab === tab ? ' active' : ''}`}>
            {t(SUBTAB_LABEL_KEY[tab])}
          </button>
        ))}
      </div>

      <div className="ps-vs-content">
        {subTab === 'studies'   && <StudiesTab   studies={studies} facilities={facilities} physicians={physicians} templates={templates} models={models} onRefresh={load} isSuperAdmin={isSuperAdmin} />}
        {subTab === 'dashboard' && <DashboardTab studies={studies} isSuperAdmin={isSuperAdmin} />}
        {subTab === 'reports'   && <ReportsTab   studies={studies} onRefresh={load} isSuperAdmin={isSuperAdmin} />}
      </div>
    </div>
  );
};

export default ValidationStudiesSection;
