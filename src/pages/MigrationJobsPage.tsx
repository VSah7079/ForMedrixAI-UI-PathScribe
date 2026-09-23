// src/pages/MigrationJobsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap's own "migration status/validation UI" ask — this gap's
// own Backend Needs Log entry explicitly names this as the real,
// comparatively small frontend surface for what is otherwise
// "fundamentally a backend-heavy story." Lists every real
// MigrationJob, its own real aggregate counts, and
// resolveMigrationCrossValidation.ts's own real reconciliation
// result — plus the per-record detail (MigrationRecordResult) behind
// any job's own failures/needs-review count.
//
// File-by-file cleanup sweep: layout/colors moved from inline style={{}} to
// pathscribe.css classes (data-driven colors stay as scoped --tag-color CSS
// custom properties, same real pattern DelegationTypeSection.tsx and
// CytologyQaTab.tsx already use); every visible label goes through
// useTranslation()/t() (migrationJobs.* in all five locale files). The real
// cross-validation/status-derivation logic already lived in
// resolveMigrationCrossValidation.ts before this pass — nothing new to
// extract there.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { mockMigrationJobService } from '@/services/migration/mockMigrationJobService';
import { mockMigrationRecordResultService } from '@/services/migration/mockMigrationRecordResultService';
import { resolveMigrationCrossValidation } from '@/services/migration/resolveMigrationCrossValidation';
import type { MigrationJob } from '@/services/migration/IMigrationJobService';
import type { MigrationRecordResult } from '@/services/migration/IMigrationRecordResultService';

const STATUS_COLOR: Record<string, string> = {
  pending: '#94A3B8', running: '#3B82F6', completed: '#22C55E',
  completed_with_errors: '#F59E0B', failed: '#EF4444',
};

const JobDetail: React.FC<{ job: MigrationJob; onClose: () => void }> = ({ job, onClose }) => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<MigrationRecordResult[]>([]);
  useEffect(() => { mockMigrationRecordResultService.getByJobId(job.id).then(res => { if (res.ok) setRecords(res.data); }); }, [job.id]);
  const crossValidation = resolveMigrationCrossValidation(job);
  const problemRecords = records.filter(r => r.outcome !== 'succeeded');
  const statusLabel = t(`migrationJobs.status.${job.status}`);

  return (
    <div className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--medium" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{job.sourceSystemName} — {statusLabel}</div>
        <div className="ps-conf-modal-body">
          <p><strong>{t('migrationJobs.crossValidationLabel')}</strong>{' '}
            {crossValidation.status === 'no_claimed_count' && t('migrationJobs.crossValidationNoClaimedCount')}
            {crossValidation.status === 'reconciled' && t('migrationJobs.crossValidationReconciled', {
              processedCount: crossValidation.processedCount, claimedCount: crossValidation.claimedCount,
            })}
            {crossValidation.status === 'discrepancy' && (
              <span className="ps-migration-discrepancy-text">
                {crossValidation.missingCount! > 0
                  ? t('migrationJobs.crossValidationDiscrepancyMissing', {
                      claimedCount: crossValidation.claimedCount, processedCount: crossValidation.processedCount,
                      count: crossValidation.missingCount,
                    })
                  : t('migrationJobs.crossValidationDiscrepancyExtra', {
                      claimedCount: crossValidation.claimedCount, processedCount: crossValidation.processedCount,
                      count: Math.abs(crossValidation.missingCount!),
                    })}
              </span>
            )}
          </p>
          <p>{t('migrationJobs.jobCounts', {
            succeeded: job.succeededCount, failed: job.failedCount,
            needsReview: job.needsReviewCount, total: job.totalRecordsProcessed,
          })}</p>

          {problemRecords.length > 0 && (
            <>
              <h4>{t('migrationJobs.recordsNeedingAttention')}</h4>
              <div className="ps-conf-card">
                {problemRecords.map(r => (
                  <div key={r.id} className="ps-conf-row">
                    <span className="ps-conf-value">
                      {r.sourceRecordId}
                      <span
                        className="ps-migration-record-outcome"
                        style={{ '--tag-color': r.outcome === 'failed' ? '#EF4444' : '#F59E0B' } as React.CSSProperties}
                      >
                        {r.outcome === 'failed' ? r.errorMessage : t('migrationJobs.needsMpiReview')}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
};

const MigrationJobsPage: React.FC = () => {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [detailJob, setDetailJob] = useState<MigrationJob | null>(null);

  const refresh = () => { mockMigrationJobService.getAll().then(res => { if (res.ok) setJobs(res.data); }); };
  useEffect(() => { refresh(); }, []);

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('migrationJobs.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('migrationJobs.subtitle')}
      </p>

      <div className="ps-conf-card">
        {jobs.map(job => {
          const cv = resolveMigrationCrossValidation(job);
          return (
            <div key={job.id} className="ps-conf-row ps-conf-row--clickable" onClick={() => setDetailJob(job)}>
              <span className="ps-conf-value">
                {job.sourceSystemName}
                <span
                  className="ps-migration-status-tag"
                  style={{ '--tag-color': STATUS_COLOR[job.status] } as React.CSSProperties}
                >
                  {t(`migrationJobs.status.${job.status}`)}
                </span>
                {cv.status === 'discrepancy' && (
                  <span className="ps-migration-discrepancy-tag">{t('migrationJobs.crossValidationDiscrepancyBadge')}</span>
                )}
              </span>
              <span className="ps-migration-job-counts">
                {t('migrationJobs.listJobCounts', { succeeded: job.succeededCount, failed: job.failedCount, review: job.needsReviewCount })}
              </span>
            </div>
          );
        })}
        {jobs.length === 0 && <div className="ps-conf-empty-row">{t('migrationJobs.noJobs')}</div>}
      </div>

      {detailJob && <JobDetail job={detailJob} onClose={() => { setDetailJob(null); refresh(); }} />}
    </div>
  );
};

export default MigrationJobsPage;
