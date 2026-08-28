// src/services/hl7/notifyMaterialLocationApplied.ts
// ─────────────────────────────────────────────────────────────────────────────
// Same real reasoning as notifyBlockExceptionApplied.ts's own header —
// separate, notification-only sibling to the mutation-performing
// processMaterialLocationEvent.ts (still what the Dev Tools "Sim
// Material Location" button calls directly). Real webhook flow
// (api/webhooks/engine/material-location.ts) has already applied the
// mutation server-side before this ever runs.
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from 'react-toastify';
import { caseRouter } from '../cases/CaseRouter';

export interface MaterialLocationNotificationPayload {
  messageId: string;
  caseId: string;
  targetDescription: string;
  location: string;
  action?: string;
  workflowStage?: string;
}

const notifiedMessageIds = new Set<string>();

export async function notifyMaterialLocationApplied(payload: MaterialLocationNotificationPayload): Promise<void> {
  if (notifiedMessageIds.has(payload.messageId)) return;

  const caseData = await caseRouter.getCase(payload.caseId);
  const accession = caseData?.accession?.fullAccession ?? payload.caseId;

  toast.info(`📍 ${accession}: ${payload.targetDescription} now at "${payload.location}"${payload.action ? ` — ${payload.action}` : ''}${payload.workflowStage ? ` (${payload.workflowStage})` : ''}`);
  notifiedMessageIds.add(payload.messageId);
}
