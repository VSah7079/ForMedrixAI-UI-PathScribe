// src/components/ValidationStudies/ValidationStudiesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Validation Studies — Configuration tab for managing parallel run studies.
// Three sub-tabs: Studies | Dashboard | Reports
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
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

const STATUS_LABELS: Record<string, string> = {
  draft:              'DRAFT',
  pending_approval:   'PENDING APPROVAL',
  approved:           'APPROVED',
  active:             'ACTIVE',
  closed:             'CLOSED',
  reported:           'REPORTED',
};

function pct(n: number): string { return `${Math.round(n * 100)}%`; }

function gradeResult(
  acceptanceRate: number,
  targetAcceptanceRate: number,
  editRatio: number,
  targetMaxEditRatio: number,
): { grade: string; color: string; description: string } {
  const passes = acceptanceRate >= targetAcceptanceRate && editRatio <= targetMaxEditRatio;
  const partial = acceptanceRate >= targetAcceptanceRate * 0.85;
  if (passes)  return { grade: 'PASS',             color: '#10b981', description: 'Performance meets study targets' };
  if (partial) return { grade: 'CONDITIONAL PASS', color: '#f59e0b', description: 'Performance approaches targets — extended study recommended' };
  return        { grade: 'FURTHER REVIEW',         color: '#ef4444', description: 'Performance below targets — review AI configuration' };
}

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
  const { log } = useAuditLog();
  const [showNew,    setShowNew]    = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [submitId,   setSubmitId]   = useState<string | null>(null);
  const [approveId,  setApproveId]  = useState<string | null>(null);

  const handleActivate = async (id: string) => {
    const study = studies.find(s => s.id === id);
    const result = await mockValidationStudyService.activate(id, 'admin') as any;
    if (!result.ok) {
      alert(result.error ?? 'Cannot activate — ensure committee approval and IRB reference are recorded first.');
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
          <div className="ps-vs-section-title">Validation Studies</div>
          <div className="ps-vs-section-sub">
            Each study defines a cohort of pathologists and facilities for a parallel run validation period.
            Studies must be approved before activation. All AI output remains advisory — pathologist sign-off is always required.
          </div>
        </div>
        <button className="ps-section-add-btn" onClick={() => setShowNew(true)}>+ New Study</button>
      </div>

      {studies.length === 0 ? (
        <div className="ps-vs-empty">
          <div className="ps-vs-empty-icon">🔬</div>
          <div className="ps-vs-empty-title">No validation studies yet</div>
          <div className="ps-vs-empty-body">
            Create a study to begin a parallel run validation of AI-assisted reporting.
          </div>
        </div>
      ) : studies.map(s => (
        <div key={s.id} className="ps-vs-study-row">
          <div className="ps-vs-study-row-main">
            <div className="ps-vs-study-name">{s.name}</div>
            <div className="ps-vs-study-meta">
              <span className="ps-vs-study-badge" style={{ color: STATUS_COLORS[s.status], borderColor: STATUS_COLORS[s.status] + '40', background: STATUS_COLORS[s.status] + '12' }}>
                {STATUS_LABELS[s.status] ?? s.status.toUpperCase()}
              </span>
              <span>{s.clientIds.length} facilit{s.clientIds.length !== 1 ? 'ies' : 'y'}</span>
              <span>{s.pathologistIds.length} pathologist{s.pathologistIds.length !== 1 ? 's' : ''}</span>
              {s.templateIds && s.templateIds.length > 0 && (
                <span>{s.templateIds.length} template{s.templateIds.length !== 1 ? 's' : ''}</span>
              )}
              <span>Target: {pct(s.targetAcceptanceRate)} acceptance</span>
              {s.startDate && <span>Started {new Date(s.startDate).toLocaleDateString()}</span>}
              {s.committeeApproval?.irbReference && <span>IRB: {s.committeeApproval.irbReference}</span>}
              {s.committeeSubmission?.committeeName && s.status === 'pending_approval' && <span>Committee: {s.committeeSubmission.committeeName}</span>}
            </div>
            {s.description && <div className="ps-vs-study-desc">{s.description}</div>}
          </div>
          <div className="ps-vs-study-actions">
            {s.status === 'draft'            && <button className="ps-rr-btn" onClick={() => setEditId(s.id)}>Edit</button>}
            {s.status === 'draft'            && <button className="ps-rr-btn ps-rr-btn--primary" onClick={() => setSubmitId(s.id)}>Submit for Review →</button>}
            {s.status === 'pending_approval' && <button className="ps-rr-btn ps-rr-btn--primary" onClick={() => setApproveId(s.id)}>Record Approval →</button>}
            {s.status === 'approved'         && <button className="ps-rr-btn ps-rr-btn--primary" onClick={() => handleActivate(s.id)}>Activate →</button>}
            {s.status === 'active'           && <button className="ps-rr-btn" onClick={() => handleClose(s.id)}>Close Study</button>}
            {s.status === 'draft'            && <button className="ps-rr-btn ps-rr-btn--ghost" onClick={() => handleDelete(s.id)}>Delete</button>}
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
  const [committeeName,       setCommitteeName]       = useState('');
  const [submittedBy,         setSubmittedBy]         = useState('');
  const [expectedReviewDate,  setExpectedReviewDate]  = useState('');
  const [notes,               setNotes]               = useState('');

  const canSave = committeeName.trim() && submittedBy.trim();

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">Submit for Ethics / IRB Review</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div className="ps-vs-modal-body">
          <div className="ps-vs-modal-study-name">{study.name}</div>

          <div className="ps-vs-modal-info">
            Submitting this study for committee review changes its status to <strong>Pending Approval</strong>.
            No data will be collected until the study is formally activated after committee approval is recorded.
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">Ethics / IRB Committee Name</div>
            <input
              className="ps-conf-input"
              value={committeeName}
              onChange={e => setCommitteeName(e.target.value)}
              placeholder="e.g. MGH Clinical Ethics & Research Committee"
            />
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">Submitted By</div>
            <input
              className="ps-conf-input"
              value={submittedBy}
              onChange={e => setSubmittedBy(e.target.value)}
              placeholder="Full name of person submitting"
            />
          </div>

          <div>
            <div className="ps-conf-label">Expected Review Date</div>
            <input
              type="date"
              className="ps-conf-input"
              value={expectedReviewDate}
              onChange={e => setExpectedReviewDate(e.target.value)}
            />
          </div>

          <div>
            <div className="ps-conf-label">Notes for Committee</div>
            <textarea
              className="ps-conf-input"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context for the committee review…"
            />
          </div>

          <div className="ps-vs-modal-governance">
            🔒 This action is recorded in the audit log with timestamp and user identity.
          </div>
        </div>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>Cancel</button>
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
            Submit for Review →
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
          <span className="ps-modal-dark-title">Record Committee Approval</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div className="ps-vs-modal-body">
          <div className="ps-vs-modal-study-name">{study.name}</div>

          {study.committeeSubmission && (
            <div className="ps-vs-modal-submission-ref">
              <span className="ps-vs-modal-ref-label">Submitted to:</span>
              <span>{study.committeeSubmission.committeeName}</span>
              <span className="ps-vs-modal-ref-label">By:</span>
              <span>{study.committeeSubmission.submittedBy}</span>
              <span className="ps-vs-modal-ref-label">On:</span>
              <span>{new Date(study.committeeSubmission.submittedAt).toLocaleDateString()}</span>
            </div>
          )}

          <div className="ps-vs-modal-info">
            Recording approval changes status to <strong>Approved</strong>.
            The study can then be activated to begin data collection.
            The IRB reference number is required and cannot be changed after activation.
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">IRB / Ethics Reference Number</div>
            <input
              className="ps-conf-input"
              value={irbReference}
              onChange={e => setIrbReference(e.target.value)}
              placeholder="e.g. MGH-IRB-2026-0042"
            />
            <div className="ps-vs-slider-hint">Required — cannot be changed after activation</div>
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">Approved By (name of approver)</div>
            <input
              className="ps-conf-input"
              value={approvedBy}
              onChange={e => setApprovedBy(e.target.value)}
              placeholder="Full name of person recording approval"
            />
          </div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">Approval Date</div>
            <input
              type="date"
              className="ps-conf-input"
              value={approvedAt}
              onChange={e => setApprovedAt(e.target.value)}
            />
          </div>

          <div>
            <div className="ps-conf-label">Committee Minutes Reference</div>
            <input
              className="ps-conf-input"
              value={committeeMinutesRef}
              onChange={e => setCommitteeMinutesRef(e.target.value)}
              placeholder="e.g. MGH-CERC-MIN-2026-Q2-04 (optional)"
            />
          </div>

          <div>
            <div className="ps-conf-label">Conditions Attached to Approval</div>
            <textarea
              className="ps-conf-input"
              rows={3}
              value={conditions}
              onChange={e => setConditions(e.target.value)}
              placeholder="Any conditions or restrictions placed on the study by the committee… (optional)"
            />
          </div>

          <div className="ps-vs-modal-governance">
            🔒 This approval record is permanent and audited. The IRB reference will appear on all validation reports generated from this study.
          </div>
        </div>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>Cancel</button>
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
            Record Approval →
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
      <div className="ps-modal-dark" style={{ width: 640, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{isEdit ? 'Edit Study (Draft)' : 'New Validation Study'}</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div><div className="ps-conf-label ps-conf-label--required">Study Name</div>
            <input className="ps-conf-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DVMC Breast Pathology AI Validation Q3 2026" /></div>

          <div><div className="ps-conf-label">Description</div>
            <textarea className="ps-conf-input" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Study objectives and scope…" /></div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">AI Model Being Validated</div>
            <select
              className="ps-conf-select"
              value={modelId}
              disabled={isEdit}
              onChange={e => setModelId(e.target.value)}
              title={isEdit ? 'Cannot be changed once a study exists — the whole record is evidence for this specific model version' : undefined}
            >
              <option value="">Select a model…</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.version} — {m.status}</option>
              ))}
            </select>
            {isEdit && (
              <div className="ps-vs-slider-hint" style={{ marginTop: 4 }}>
                Locked once a study exists — this record is the validation evidence for this exact model version.
              </div>
            )}
            {!isEdit && (
              <button
                type="button"
                onClick={() => setShowStore(true)}
                style={{
                  marginTop: 6, background: 'none', border: 'none', padding: 0,
                  color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                🏪 Don't see the model you need? Browse the ForMedrixAI store
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
            <div><div className="ps-conf-label">Target Acceptance Rate</div>
              <div className="ps-vs-slider-wrap">
                <input type="range" min={0.5} max={1} step={0.05} value={targetAccept} onChange={e => setTargetAccept(Number(e.target.value))} className="ps-vs-slider" />
                <span className="ps-vs-slider-val">{pct(targetAccept)}</span>
              </div>
              <div className="ps-vs-slider-hint">% of AI sections accepted without edits</div>
            </div>
            <div><div className="ps-conf-label">Max Mean Edit Ratio</div>
              <div className="ps-vs-slider-wrap">
                <input type="range" min={0.1} max={0.9} step={0.05} value={targetEdit} onChange={e => setTargetEdit(Number(e.target.value))} className="ps-vs-slider" />
                <span className="ps-vs-slider-val">{pct(targetEdit)}</span>
              </div>
              <div className="ps-vs-slider-hint">Max average change before flagging</div>
            </div>
          </div>

          <div><div className="ps-conf-label ps-conf-label--required">Start Date</div>
            <input type="date" className="ps-conf-input" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>

          <div><div className="ps-conf-label">IRB / Ethics Reference</div>
            <input className="ps-conf-input" value={irbRef} onChange={e => setIrbRef(e.target.value)} placeholder="Optional — ethics committee reference number" /></div>

          <div>
            <div className="ps-conf-label ps-conf-label--required">Participating Facilities</div>
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
            <div className="ps-conf-label ps-conf-label--required">Enrolled Pathologists</div>
            {clientIds.length === 0 && (
              <div className="ps-vs-slider-hint" style={{ marginBottom: 6 }}>Select at least one facility to filter pathologists</div>
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
                <div className="ps-vs-slider-hint">No pathologists found for the selected facilities</div>
              )}
            </div>
          </div>

          <div>
            <div className="ps-conf-label">Report Templates</div>
            <div className="ps-vs-slider-hint" style={{ marginBottom: 6 }}>
              Optional — leave unselected to cover every template used by the selected facilities
            </div>
            <div className="ps-vs-checklist">
              {templates.map(t => (
                <label key={t.id} className="ps-vs-check-row">
                  <input type="checkbox" checked={templateIds.includes(t.id)} onChange={() => toggleTemplate(t.id)} />
                  <span>{t.name} — {t.specialty}</span>
                </label>
              ))}
              {templates.length === 0 && (
                <div className="ps-vs-slider-hint">No published templates available</div>
              )}
            </div>
          </div>

        </div>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>Cancel</button>
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
          >{isEdit ? 'Save Changes' : 'Create Study'}</button>
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
      <div className="ps-vs-empty-title">No active studies</div>
      <div className="ps-vs-empty-body">Activate a study to begin capturing validation metrics.</div>
    </div>
  );

  return (
    <div className="ps-vs-dashboard">
      <div className="ps-vs-study-select-wrap">
        <select className="ps-conf-select" aria-label="Select validation study" style={{ maxWidth: 380 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          {active.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {study && (
          <span className="ps-vs-study-badge" style={{ color: STATUS_COLORS[study.status], borderColor: STATUS_COLORS[study.status] + '40', background: STATUS_COLORS[study.status] + '12' }}>
            {study.status.toUpperCase()}
          </span>
        )}
      </div>

      {stats && study && (
        <>
          {/* KPI cards */}
          <div className="ps-vs-kpi-row">
            <div className="ps-vs-kpi">
              <div className="ps-vs-kpi-val">{caseCount}</div>
              <div className="ps-vs-kpi-label">Cases captured</div>
              {study.targetCaseCount && <div className="ps-vs-kpi-target">Target: {study.targetCaseCount}</div>}
            </div>
            <div className="ps-vs-kpi">
              <div className="ps-vs-kpi-val">{stats.totalSignals}</div>
              <div className="ps-vs-kpi-label">Section signals</div>
            </div>
            <div className="ps-vs-kpi" style={{ borderColor: stats.acceptanceRate >= study.targetAcceptanceRate ? '#10b981' : '#f87171' }}>
              <div className="ps-vs-kpi-val" style={{ color: stats.acceptanceRate >= study.targetAcceptanceRate ? '#10b981' : '#f87171' }}>
                {pct(stats.acceptanceRate)}
              </div>
              <div className="ps-vs-kpi-label">Acceptance rate</div>
              <div className="ps-vs-kpi-target">Target: ≥{pct(study.targetAcceptanceRate)}</div>
            </div>
            <div className="ps-vs-kpi">
              <div className="ps-vs-kpi-val">{stats.acceptedCount}</div>
              <div className="ps-vs-kpi-label">Accepted unchanged</div>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="ps-vs-table-wrap">
            <div className="ps-vs-table-title">Performance by Section</div>
            <table className="ps-vs-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Signals</th>
                  <th>Acceptance</th>
                  <th>Mean Edit Ratio</th>
                  <th>Most Common Edit</th>
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
                      <td style={{ color: ar >= study.targetAcceptanceRate ? '#10b981' : '#f87171' }}>{pct(ar)}</td>
                      <td style={{ color: sec.avgEditRatio <= study.targetMaxEditRatio ? '#10b981' : '#f87171' }}>{pct(sec.avgEditRatio)}</td>
                      <td className="ps-vs-td-edittype">{topEdit?.[0]?.replace(/_/g,' ') ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Advisory mode notice */}
          <div className="ps-vs-advisory-notice">
            🔒 Advisory mode — all AI output reviewed and signed by pathologist before submission. No AI-direct LIS transmission.
          </div>
        </>
      )}

      {!stats?.totalSignals && (
        <div className="ps-vs-empty" style={{ marginTop: 24 }}>
          <div className="ps-vs-empty-body">No signals captured yet for this study. Cases finalised by enrolled pathologists will appear here.</div>
        </div>
      )}
    </div>
  );
};

// ── Reports Tab ───────────────────────────────────────────────────────────────

const ReportsTab: React.FC<{ studies: ValidationStudy[]; onRefresh: () => void; isSuperAdmin?: boolean }> = ({ studies, onRefresh, isSuperAdmin: _isSuperAdmin = false }) => {
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
    const grade = gradeResult(stats.acceptanceRate, study.targetAcceptanceRate, avgEditRatio, study.targetMaxEditRatio);

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
        finalGrade: grade.grade as 'PASS' | 'CONDITIONAL PASS' | 'FURTHER REVIEW',
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
          <div className="ps-vs-section-title">Validation Reports</div>
          <div className="ps-vs-section-sub">
            Generate a de-identified validation report for closed studies.
            Reports contain no patient data — only aggregate statistics.
          </div>
        </div>
      </div>

      {closedStudies.length === 0 ? (
        <div className="ps-vs-empty">
          <div className="ps-vs-empty-icon">📄</div>
          <div className="ps-vs-empty-title">No closed studies</div>
          <div className="ps-vs-empty-body">Close an active study to generate its validation report.</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <select className="ps-conf-select" aria-label="Select closed validation study" style={{ maxWidth: 380 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {closedStudies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {study && stats && (
            <div className="ps-vs-report-preview">
              <div className="ps-vs-report-preview-title">Report Preview — {study.name}</div>
              <div className="ps-vs-report-kpis">
                <div><span className="ps-vs-rp-label">Period</span><span>{new Date(study.startDate).toLocaleDateString()} — {study.endDate ? new Date(study.endDate).toLocaleDateString() : 'Ongoing'}</span></div>
                <div><span className="ps-vs-rp-label">Cases</span><span>{caseCount}</span></div>
                <div><span className="ps-vs-rp-label">Sections analysed</span><span>{stats.totalSignals}</span></div>
                <div><span className="ps-vs-rp-label">Acceptance rate</span><span style={{ color: stats.acceptanceRate >= study.targetAcceptanceRate ? '#10b981' : '#f87171' }}>{pct(stats.acceptanceRate)}</span></div>
                <div><span className="ps-vs-rp-label">Governance</span><span>Advisory mode only</span></div>
                {study.committeeApproval?.irbReference && <div><span className="ps-vs-rp-label">IRB</span><span>{study.committeeApproval.irbReference}</span></div>}
              </div>
              <button className="ps-conf-btn-primary" onClick={generateReport} disabled={generating} style={{ marginTop: 16 }}>
                {generating ? 'Generating…' : '📄 Generate & Print Report'}
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

const ValidationStudiesSection: React.FC<{ isSuperAdmin?: boolean }> = ({ isSuperAdmin = false }) => {
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
        <div className="ps-vs-header-title">Validation Studies</div>
        <div className="ps-vs-header-sub">
          Parallel run validation of AI-assisted reporting against existing workflow.
          All studies operate in advisory mode — pathologist sign-off required for all reports.
        </div>
        <div className="ps-vs-advisory-banner">
          🔒 Advisory Mode — AI output is never submitted to the LIS without pathologist review and approval
        </div>
        <button
          onClick={() => setHowItWorksOpen(o => !o)}
          className="ps-conf-btn-secondary"
          style={{ marginTop: 10, fontSize: 12 }}
        >
          {howItWorksOpen ? '▾' : '▸'} How this works — with an example
        </button>
        {howItWorksOpen && (
          <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 13, lineHeight: 1.7, color: '#cbd5e1' }}>
            <p style={{ margin: '0 0 10px' }}>
              A validation study measures whether a specific AI model's suggestions are trustworthy enough
              for a specific facility, physician, or report template — before relying on it for real reporting
              decisions. Every study goes through the same six stages, shown as its status:{' '}
              <strong>Draft → Pending Approval → Approved → Active → Closed → Reported</strong>.
            </p>
            <p style={{ margin: '0 0 10px' }}>
              Every model a study can be scoped to starts as <strong style={{ color: '#fbbf24' }}>Beta</strong> —
              advisory, never the org default, zero cases processed against real data — until a study like this
              one confirms it. A required field an AI model suggested a value for still has to be explicitly
              confirmed or overridden by a pathologist before a case can be finalized, regardless of how
              confident the model claims to be; nothing here relies on the AI's own accuracy claim as a
              substitute for that.
            </p>
            <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#e2e8f0' }}>Worked example</p>
            <p style={{ margin: '0 0 6px' }}>
              Say Metro General Hospital wants to know if a new AI model is ready for their breast core biopsies.
            </p>
            <ol style={{ margin: '0 0 10px', paddingLeft: 20 }}>
              <li><strong>Get the model.</strong> An admin gets notified — today, an email from ForMedrixAI —
                that a new model has been published following ForMedrixAI's own internal regression testing.
                From this screen's "New Study" form, <strong>Browse the ForMedrixAI store</strong> and download
                it; it lands in your system as Beta, never the default, with zero cases processed yet.</li>
              <li><strong>Create the study (Draft).</strong> Scope it — the model you just downloaded, facility:
                Metro General, template: Breast Core Biopsy — and set your targets, e.g. 90% AI-suggestion
                acceptance rate and a maximum 15% edit ratio (how much pathologists end up changing).</li>
              <li><strong>Submit for Review (Pending Approval).</strong> A second pathologist or admin
                reviews the study's scope and targets before it can start collecting real data.</li>
              <li><strong>Record Approval (Approved → Active).</strong> Once approved, the study goes live —
                every matching report during the study period is scored against the targets, still fully
                advisory the whole time.</li>
              <li><strong>Close the study.</strong> After enough cases (the Dashboard tab tracks this live),
                close it — this locks in the final numbers.</li>
              <li><strong>Report.</strong> The grade is computed automatically: <strong>PASS</strong> if both
                targets are met, <strong>CONDITIONAL PASS</strong> if close but not quite there, or{' '}
                <strong>FURTHER REVIEW</strong> if performance fell short — each with the specific numbers
                behind it, exportable from the Reports tab. A PASS is what makes it reasonable for an admin to
                later consider setting this model as the facility's default, in the Models screen — this study
                is the evidence for that decision, not the model's own published benchmark.</li>
            </ol>
            <p style={{ margin: 0, color: '#94a3b8' }}>
              The Dashboard tab shows every active study's live progress toward its targets; the Reports tab
              is where finished studies' graded outcomes live.
            </p>
          </div>
        )}
      </div>

      <div className="ps-sub-tab-group">
        {(['studies','dashboard','reports'] as SubTab[]).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className={`ps-sub-tab-btn${subTab === t ? ' active' : ''}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
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
