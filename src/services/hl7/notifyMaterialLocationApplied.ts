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
import i18n from '@/i18n/config';
import { phiToastContent } from '../phi/phiToast';
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

  // Batch 363 (PS-72): translated, and redacted in support-ticket screenshots (it names the case).
  const text = i18n.t('hl7Notifications.materialLocation', { accession, target: payload.targetDescription, location: payload.location })
    + (payload.action ? i18n.t('hl7Notifications.materialLocationAction', { action: payload.action }) : '')
    + (payload.workflowStage ? i18n.t('hl7Notifications.materialLocationStage', { stage: payload.workflowStage }) : '');
  toast.info(phiToastContent(text));
  notifiedMessageIds.add(payload.messageId);
}
