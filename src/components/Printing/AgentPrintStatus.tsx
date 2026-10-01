// src/components/Printing/AgentPrintStatus.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 346 (PS-52, point 2): a small status line while this tab's labels
// are going through the PathScribe Agent: "Sending label to the printer…",
// "Label queued: 2 jobs ahead", "Printing on ZD421". It disappears when the
// job finishes; the outcome itself is reported by the screen that printed.
// "Printing on…" appears only with an agent that sends PRINT_STARTED.
//
// Renders only. The jobs come from utils/labels/pathscribeAgent/
// printJobStatus.ts, which also decides what the line says.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { agentPrintJobs, summariseAgentPrintJobs, type AgentPrintJobStore } from '@/utils/labels/pathscribeAgent/printJobStatus';

export const AgentPrintStatus: React.FC<{ store?: AgentPrintJobStore }> = ({ store = agentPrintJobs }) => {
  const { t } = useTranslation();
  const jobs = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const summary = summariseAgentPrintJobs(jobs);

  return (
    <div className="ps-agent-print-status-region" role="status" aria-live="polite">
      {summary && (
        <div className={`ps-agent-print-status ps-agent-print-status--${summary.kind}`}>
          <span className="ps-agent-print-status-dot" aria-hidden="true" />
          <span className="ps-agent-print-status-text">
            {summary.kind === 'printing' && t('agentPrintStatus.printing', { printer: summary.printerName })}
            {summary.kind === 'queued' && (summary.ahead === 0
              ? t('agentPrintStatus.queuedNext')
              : t('agentPrintStatus.queued', { count: summary.ahead }))}
            {summary.kind === 'sending' && t('agentPrintStatus.sending')}
          </span>
          {summary.waiting > 0 && (
            <span className="ps-agent-print-status-more">{t('agentPrintStatus.moreWaiting', { count: summary.waiting })}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentPrintStatus;
