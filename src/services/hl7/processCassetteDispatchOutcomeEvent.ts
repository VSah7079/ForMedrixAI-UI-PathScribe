// src/services/hl7/processCassetteDispatchOutcomeEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for CassetteDispatchOutcomeEventPayload
// (types/events/CassetteDispatchOutcomeEventPayload.ts) — the
// notification half of "User Notifications: UI alerts and banners
// informing technicians when a fallback occurs or a hopper is empty."
// Same real idempotent-on-messageId pattern as
// processMaterialLocationEvent.ts.
//
// Deliberately never shows a notification for a genuinely routine
// 'dispatched' outcome (the primary color's hopper was simply
// available, nothing noteworthy happened) — Pete's own spec asks for
// alerts "when a fallback occurs or a hopper is empty," not a toast
// on every single successful print. A notification a tech has to
// dismiss 50 times a day trains them to stop reading it, which
// defeats the real point of the ones that matter.
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from 'react-toastify';
import i18n from '@/i18n/config';
import { phiToastContent } from '../phi/phiToast';
import { caseRouter } from '../cases/CaseRouter';
import type { CassetteDispatchOutcomeEventPayload } from '@/types/events/CassetteDispatchOutcomeEventPayload';

export interface ProcessCassetteDispatchOutcomeResult {
  messageId: string;
  outcome: 'notified' | 'already-applied' | 'case-not-found' | 'invalid-payload' | 'no-notification-needed';
  reason?: string;
}

const processedMessageIds = new Set<string>();

export async function processCassetteDispatchOutcomeEvent(
  payload: CassetteDispatchOutcomeEventPayload,
): Promise<ProcessCassetteDispatchOutcomeResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate notification.' };
  }

  if (!payload.caseId || !payload.requestedColorKey || !payload.outcome) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: caseId, requestedColorKey, outcome.' };
  }

  const caseData = await caseRouter.getCase(payload.caseId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'case-not-found', reason: `No case found for '${payload.caseId}'.` };
  }

  const accession = caseData.accession?.fullAccession ?? caseData.id;
  // Batch 363 (PS-72): translated, and redacted in support-ticket screenshots (they name the case).
  const specimen = payload.specimenLabel ? i18n.t('hl7Notifications.specimenSuffix', { label: payload.specimenLabel }) : '';
  const requested = payload.requestedColorKey;

  if (payload.outcome === 'fallback_used') {
    toast.warn(phiToastContent(i18n.t('hl7Notifications.cassetteFallback', {
      accession, specimen, requested,
      actual: payload.actualColorKey ?? i18n.t('hl7Notifications.cassetteFallbackUnknownColor'),
      message: payload.message ?? i18n.t('hl7Notifications.cassetteFallbackDefaultMessage'),
    })));
  } else if (payload.outcome === 'prompted') {
    toast.warn(phiToastContent(i18n.t('hl7Notifications.cassettePrompted', {
      accession, specimen, requested, message: payload.message ?? i18n.t('hl7Notifications.cassettePromptedDefaultMessage'),
    })));
  } else if (payload.outcome === 'error') {
    toast.error(phiToastContent(i18n.t('hl7Notifications.cassetteFailed', {
      accession, specimen, message: payload.message ?? i18n.t('hl7Notifications.cassetteFailedDefaultMessage'),
    })));
  } else {
    // 'dispatched' — genuinely routine, no notification.
    processedMessageIds.add(payload.messageId);
    return { messageId: payload.messageId, outcome: 'no-notification-needed' };
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'notified' };
}

/** Test-only reset — see processMaterialLocationEvent.ts's own
 *  identical helper for the full reasoning. */
export function _resetCassetteDispatchOutcomeMessageIdsForTests(): void {
  processedMessageIds.clear();
}
