// src/services/clinical/resolveCriticalAlertChannels.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, pure channel-selection rule engine for automated critical-alert
// dispatch (PS-136). Deliberately separated from dispatchCriticalAlerts.ts's
// own orchestration (resolving the physician, calling adapters, persisting
// the record) — this file only ever decides WHICH channels apply, given
// real severity + real recipient contact data, with no I/O of its own.
//
// Real, explicit rules, reasoned from established clinical-alerting
// practice (and this app's own prior conclusion on PS-136/PS-143 —
// no regulatory guidance anywhere requires automated push as the
// primary mechanism; a documented verbal call remains the accepted
// standard everywhere). Automated dispatch here is a real,
// speed-of-contact supplement, not a replacement for that:
//
// - Critical / Malignant severity: fire on every channel this
//   recipient genuinely has available. A multi-channel simultaneous
//   alert is standard practice for a genuinely urgent finding —
//   redundancy increases the odds of fast contact, and firing an
//   extra channel the recipient doesn't check costs nothing.
// - Abnormal severity: fire only on the recipient's own stated
//   preferredContact channel, and only if that channel maps to one
//   of the three automated channels this system knows (preferredContact
//   'Phone' has no automated equivalent — a merely Abnormal finding
//   relies on the existing manual/audit-trail flow, not a push).
//   'Fax' has no automated channel here either — real, honest gap:
//   nothing in this system sends a fax.
//
// A channel is only ever "available" when the recipient genuinely
// carries the real contact data it needs — this function never
// fabricates a destination. See CriticalAlertRecipient's own doc
// comment for what each availability signal actually means.
// ─────────────────────────────────────────────────────────────────────────────

import type { AbnormalSeverity } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';
import type { AlertChannelType, CriticalAlertRecipient } from '@/types/clinical/CriticalAlertDispatch';

/** Real, per-recipient availability — a channel is available only
 *  when the real, underlying contact data this dispatch would
 *  actually need is present on the recipient. Exported on its own
 *  since both the urgent (all-available) and non-urgent
 *  (preferred-only) rules below both need to start from the same
 *  real availability set. */
export function resolveAvailableAlertChannels(recipient: CriticalAlertRecipient): AlertChannelType[] {
  const available: AlertChannelType[] = [];
  if (recipient.email) available.push('secure_email');
  if (recipient.smsCapablePhone) available.push('sms');
  if (recipient.hasKnownEhrInbox) available.push('ehr_push');
  return available;
}

/** Real, per direct guidance: preferredContact is Physician's own
 *  three-value enum ('Email' | 'Fax' | 'Phone') — only 'Email' maps
 *  onto one of this system's three automated channels. Returns null,
 *  never a fabricated fallback, when the recipient's stated
 *  preference has no automated equivalent. */
function mapPreferredContactToChannel(preferredContact: CriticalAlertRecipient['preferredContact']): AlertChannelType | null {
  if (preferredContact === 'Email') return 'secure_email';
  return null;
}

/** Real, the actual rule engine — see this file's own header for the
 *  full reasoning. Pure: same inputs always produce the same real
 *  output, no I/O, fully testable without mocking anything. */
export function resolveCriticalAlertChannels(
  severity: AbnormalSeverity,
  recipient: CriticalAlertRecipient,
): AlertChannelType[] {
  const available = resolveAvailableAlertChannels(recipient);
  if (available.length === 0) return [];

  if (severity === 'Critical' || severity === 'Malignant') {
    return available;
  }

  // Abnormal — only the recipient's own stated preference, and only
  // when it's actually available (a stated 'Email' preference with no
  // real email on file resolves to no channel, never a substitute).
  const preferred = mapPreferredContactToChannel(recipient.preferredContact);
  if (preferred && available.includes(preferred)) return [preferred];
  return [];
}
