// src/components/Printing/NetworkPrintJobs.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 347 (PS-54): what happened to labels sent to "Direct via Interface
// Engine" printers. Each label shows while it's out: sent and waiting,
// printed (briefly), or failed with the reason and a Retry button. A label
// with no answer after two minutes can be retried too. Retry is manual only.
// In the demo (no API server) two small buttons simulate the engine's answer.
//
// Renders and dispatches. The jobs, the retry and the wording choice live in
// services/networkPrint/networkPrintJobs.ts (`networkPrintJobs` in
// @/services).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { networkPrintJobs } from '@/services';
import { describeNetworkPrintJob, isRetryable, type NetworkPrintJobTracker } from '@/services/networkPrint/networkPrintJobs';

export const NetworkPrintJobs: React.FC<{ tracker?: NetworkPrintJobTracker }> = ({ tracker = networkPrintJobs }) => {
  const { t } = useTranslation();
  const jobs = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);

  return (
    <div className="ps-netprint-jobs" aria-live="polite" aria-label={t('networkPrint.regionLabel')}>
      {jobs.map(job => {
        const text = describeNetworkPrintJob(job);
        const waiting = job.state === 'waiting' || job.state === 'noReply';
        return (
          <div key={job.jobId} className={`ps-netprint-job ps-netprint-job--${job.state}`} role={job.state === 'failed' ? 'alert' : undefined}>
            <span className="ps-netprint-job-dot" aria-hidden="true" />
            <span className="ps-netprint-job-text">{t(text.key, text.values)}</span>
            {job.attempt > 1 && <span className="ps-netprint-job-attempt">{t('networkPrint.job.attempt', { count: job.attempt })}</span>}
            {isRetryable(job) && (
              <span className="ps-netprint-job-actions">
                <button type="button" className="ps-netprint-job-btn ps-netprint-job-btn--primary" onClick={() => { void tracker.retry(job.jobId); }}>
                  {t('networkPrint.job.retry')}
                </button>
                <button type="button" className="ps-netprint-job-btn" onClick={() => tracker.dismiss(job.jobId)}>
                  {t('networkPrint.job.dismiss')}
                </button>
              </span>
            )}
            {waiting && tracker.canSimulate && (
              <span className="ps-netprint-job-sim" title={t('networkPrint.demo.note')}>
                <button type="button" className="ps-netprint-job-btn ps-netprint-job-btn--sim" onClick={() => tracker.simulateResult(job.jobId, 'PRINT_SUCCESS')}>
                  {t('networkPrint.demo.simulatePrinted')}
                </button>
                <button type="button" className="ps-netprint-job-btn ps-netprint-job-btn--sim" onClick={() => tracker.simulateResult(job.jobId, 'PAPER_OUT')}>
                  {t('networkPrint.demo.simulatePaperOut')}
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default NetworkPrintJobs;
