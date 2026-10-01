// src/pages/CytologyQcQueuePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct resolution: "One Unified Peer Review Queue backed
// by dynamic rule prioritization" — the actual pathologist-facing
// screen. Real, per direct guidance ("no business logic in the UI"):
// sorting (sortQcQueueByPriority.ts, inside the service's own
// getUnifiedQueue()), tab filtering (resolveQcQueueTabFilter.ts), and
// SLA status (resolveQcSlaStatus.ts) are all pure functions this file
// only calls and renders. Built with useTranslation() from the start.
//
// Real, deliberate placement for now: a standalone page/route, not
// yet embedded in the main WorklistPage's own new Pathologist tiles
// (Parts 1/2 of the original worklist spec) — that integration is
// real, separate, deferred work; this component is built so it can
// be dropped into that later home unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useAuth } from '@contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockCytologyQcCaseAssignmentService } from '@/services/cytologyQc/mockCytologyQcCaseAssignmentService';
import { resolveQcQueueTabFilter, type QcQueueTab } from '@/services/cytologyQc/resolveQcQueueTabFilter';
import { resolveQcSlaStatus, type QcSlaStatus } from '@/services/cytologyQc/resolveQcSlaStatus';
import { resolvePatientFullDisplayName } from '@/utils/personName';
import type { CytologyQcCaseAssignment } from '@/types/cytologyQc/CytologyQcRule';
import type { Case } from '@/types/case/Case';

const SLA_STATUS_CLASS: Record<QcSlaStatus, string> = {
  on_time: 'ps-qcqueue-sla--ontime',
  approaching: 'ps-qcqueue-sla--approaching',
  breached: 'ps-qcqueue-sla--breached',
};

const DiscrepancyModal: React.FC<{
  onSubmit: (primary: string, secondary: string, severity: 'major' | 'minor', commentary: string) => void;
  onClose: () => void;
}> = ({ onSubmit, onClose }) => {
  const { t } = useTranslation();
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [severity, setSeverity] = useState<'major' | 'minor'>('major');
  const [commentary, setCommentary] = useState('');

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{t('cytologyQcQueue.discrepancyModalTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="qc-disc-primary">{t('cytologyQcQueue.primaryCodeLabel')}</label>
          <input id="qc-disc-primary" className="ps-conf-input" value={primary} onChange={e => setPrimary(e.target.value)} />

          <label className="ps-label" htmlFor="qc-disc-secondary">{t('cytologyQcQueue.secondaryCodeLabel')}</label>
          <input id="qc-disc-secondary" className="ps-conf-input" value={secondary} onChange={e => setSecondary(e.target.value)} />

          <label className="ps-label" htmlFor="qc-disc-severity">{t('cytologyQcQueue.severityLabel')}</label>
          <select id="qc-disc-severity" className="ps-conf-input" value={severity} onChange={e => setSeverity(e.target.value as 'major' | 'minor')}>
            <option value="major">{t('cytologyQcQueue.severity.major')}</option>
            <option value="minor">{t('cytologyQcQueue.severity.minor')}</option>
          </select>

          <label className="ps-label" htmlFor="qc-disc-commentary">{t('cytologyQcQueue.commentaryLabel')}</label>
          <textarea id="qc-disc-commentary" className="ps-conf-input ps-conf-textarea" value={commentary} onChange={e => setCommentary(e.target.value)} />
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" disabled={!primary.trim() || !secondary.trim()} onClick={() => onSubmit(primary, secondary, severity, commentary)}>
            {t('cytologyQcQueue.submitDiscrepancyBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

const CytologyQcQueuePage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<QcQueueTab>('all');
  const [queue, setQueue] = useState<CytologyQcCaseAssignment[]>([]);
  const [casesById, setCasesById] = useState<Record<string, Case>>({});
  const [now, setNow] = useState(() => new Date().toISOString());
  const [discrepancyTargetId, setDiscrepancyTargetId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await mockCytologyQcCaseAssignmentService.getUnifiedQueue();
    if (!result.ok) return;
    setQueue(result.data);
    const uniqueCaseIds = [...new Set(result.data.map(a => a.caseId))];
    const resolvedCases = await Promise.all(uniqueCaseIds.map(id => caseRouter.getCase(id)));
    const nextCasesById: Record<string, Case> = {};
    uniqueCaseIds.forEach((id, i) => { const c = resolvedCases[i]; if (c) nextCasesById[id] = c; });
    setCasesById(nextCasesById);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const visible = resolveQcQueueTabFilter(queue, activeTab);

  const handleAssignToMe = async (id: string) => {
    if (!user) return;
    await mockCytologyQcCaseAssignmentService.assignReviewer(id, user.id);
    refresh();
  };

  const handleConcurrence = async (id: string) => {
    await mockCytologyQcCaseAssignmentService.recordConcurrence(id);
    refresh();
  };

  const handleDiscrepancySubmit = async (primary: string, secondary: string, severity: 'major' | 'minor', commentary: string) => {
    if (!discrepancyTargetId) return;
    await mockCytologyQcCaseAssignmentService.recordDiscrepancy(discrepancyTargetId, {
      primaryDiagnosticCode: primary, secondaryDiagnosticCode: secondary, severity, reviewerCommentary: commentary,
    });
    setDiscrepancyTargetId(null);
    refresh();
  };

  return (
    <div className="ps-qcqueue-page">
      <h1 className="ps-qcqueue-title">{t('cytologyQcQueue.pageTitle')}</h1>

      <div className="ps-qcqueue-tabs">
        {(['all', 'escalations_discrepancies', 'routine_random'] as QcQueueTab[]).map(tab => (
          <button key={tab} className={`ps-qcqueue-tab-btn${activeTab === tab ? ' ps-qcqueue-tab-btn--active' : ''}`} onClick={() => setActiveTab(tab)}>
            {t(`cytologyQcQueue.tab.${tab}`)}
          </button>
        ))}
      </div>

      <div className="ps-qcqueue-list">
        {visible.map(assignment => {
          const relatedCase = casesById[assignment.caseId];
          const slaStatus = resolveQcSlaStatus(assignment.createdAt, assignment.slaDeadline, now);
          const isAssignedToMe = user && assignment.assignedReviewerId === user.id;

          return (
            <div key={assignment.id} className="ps-qcqueue-row">
              <div className="ps-qcqueue-row-patient" data-phi="true">
                {(relatedCase && resolvePatientFullDisplayName(relatedCase.patient)) ?? assignment.caseId}
                <span className="ps-qcqueue-row-accession" data-phi="accession">{relatedCase?.accession.accessionNumber}</span>
              </div>
              <div className="ps-qcqueue-row-badges">
                <span className={`ps-qcqueue-tier-badge ps-qcqueue-tier-badge--${assignment.priorityTier}`}>
                  {t(`cytologyQcRules.tier.${assignment.priorityTier}`)}
                </span>
                {assignment.badges.map(badge => <span key={badge} className="ps-qcqueue-badge-pill">{badge}</span>)}
                <span className={`ps-qcqueue-sla-badge ${SLA_STATUS_CLASS[slaStatus]}`}>{t(`cytologyQcQueue.slaStatus.${slaStatus}`)}</span>
              </div>
              <div className="ps-qcqueue-row-actions">
                {assignment.state === 'QC_PENDING' && (
                  <button className="ps-conf-btn-primary" onClick={() => handleAssignToMe(assignment.id)}>{t('cytologyQcQueue.assignToMeBtn')}</button>
                )}
                {assignment.state === 'QC_IN_REVIEW' && isAssignedToMe && (
                  <>
                    <button className="ps-conf-btn-primary" onClick={() => handleConcurrence(assignment.id)}>{t('cytologyQcQueue.recordConcurrenceBtn')}</button>
                    <button className="ps-conf-btn-secondary" onClick={() => setDiscrepancyTargetId(assignment.id)}>{t('cytologyQcQueue.recordDiscrepancyBtn')}</button>
                  </>
                )}
                {assignment.state === 'QC_IN_REVIEW' && !isAssignedToMe && (
                  <span className="ps-qcqueue-assigned-note">{t('cytologyQcQueue.assignedToOther')}</span>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('cytologyQcQueue.emptyRow')}</div>}
      </div>

      {discrepancyTargetId && (
        <DiscrepancyModal onSubmit={handleDiscrepancySubmit} onClose={() => setDiscrepancyTargetId(null)} />
      )}
    </div>
  );
};

export default CytologyQcQueuePage;
