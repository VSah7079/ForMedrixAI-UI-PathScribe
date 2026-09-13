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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { mockMigrationJobService } from '@/services/migration/mockMigrationJobService';
import { mockMigrationRecordResultService } from '@/services/migration/mockMigrationRecordResultService';
import { resolveMigrationCrossValidation } from '@/services/migration/resolveMigrationCrossValidation';
import type { MigrationJob } from '@/services/migration/IMigrationJobService';
import type { MigrationRecordResult } from '@/services/migration/IMigrationRecordResultService';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', running: 'Running', completed: 'Completed',
  completed_with_errors: 'Completed with Errors', failed: 'Failed',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#94A3B8', running: '#3B82F6', completed: '#22C55E',
  completed_with_errors: '#F59E0B', failed: '#EF4444',
};

const JobDetail: React.FC<{ job: MigrationJob; onClose: () => void }> = ({ job, onClose }) => {
  const [records, setRecords] = useState<MigrationRecordResult[]>([]);
  useEffect(() => { mockMigrationRecordResultService.getByJobId(job.id).then(res => { if (res.ok) setRecords(res.data); }); }, [job.id]);
  const crossValidation = resolveMigrationCrossValidation(job);
  const problemRecords = records.filter(r => r.outcome !== 'succeeded');

  return (
    <div className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{job.sourceSystemName} — {STATUS_LABEL[job.status]}</div>
        <div className="ps-conf-modal-body">
          <p><strong>Cross-validation:</strong>{' '}
            {crossValidation.status === 'no_claimed_count' && 'No claimed source count on file — cannot reconcile.'}
            {crossValidation.status === 'reconciled' && `Reconciled — ${crossValidation.processedCount} of ${crossValidation.claimedCount} claimed records processed.`}
            {crossValidation.status === 'discrepancy' && (
              <span style={{ color: '#EF4444' }}>
                Discrepancy — claimed {crossValidation.claimedCount}, processed {crossValidation.processedCount}
                ({crossValidation.missingCount! > 0 ? `${crossValidation.missingCount} missing` : `${Math.abs(crossValidation.missingCount!)} extra`}).
              </span>
            )}
          </p>
          <p>{job.succeededCount} succeeded · {job.failedCount} failed · {job.needsReviewCount} need review (of {job.totalRecordsProcessed} processed)</p>

          {problemRecords.length > 0 && (
            <>
              <h4>Records needing attention</h4>
              <div className="ps-conf-card">
                {problemRecords.map(r => (
                  <div key={r.id} className="ps-conf-row">
                    <span className="ps-conf-value">
                      {r.sourceRecordId}
                      <span style={{ marginLeft: 8, fontSize: 12, color: r.outcome === 'failed' ? '#EF4444' : '#F59E0B' }}>
                        {r.outcome === 'failed' ? r.errorMessage : 'Needs MPI review'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

const MigrationJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [detailJob, setDetailJob] = useState<MigrationJob | null>(null);

  const refresh = () => { mockMigrationJobService.getAll().then(res => { if (res.ok) setJobs(res.data); }); };
  useEffect(() => { refresh(); }, []);

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">Historical Data Migration Jobs</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        Real status and cross-validation reporting for legacy LIS migration jobs. Ambiguous MPI matches found
        during import are routed to the existing Patient Match Review queue, not tracked separately here.
      </p>

      <div className="ps-conf-card">
        {jobs.map(job => {
          const cv = resolveMigrationCrossValidation(job);
          return (
            <div key={job.id} className="ps-conf-row" style={{ cursor: 'pointer' }} onClick={() => setDetailJob(job)}>
              <span className="ps-conf-value">
                {job.sourceSystemName}
                <span style={{ marginLeft: 8, fontSize: 12, color: STATUS_COLOR[job.status] }}>{STATUS_LABEL[job.status]}</span>
                {cv.status === 'discrepancy' && <span style={{ marginLeft: 8, fontSize: 12, color: '#EF4444' }}>⚠ Cross-validation discrepancy</span>}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {job.succeededCount} ok · {job.failedCount} failed · {job.needsReviewCount} review
              </span>
            </div>
          );
        })}
        {jobs.length === 0 && <div className="ps-conf-empty-row">No migration jobs on file.</div>}
      </div>

      {detailJob && <JobDetail job={detailJob} onClose={() => { setDetailJob(null); refresh(); }} />}
    </div>
  );
};

export default MigrationJobsPage;
