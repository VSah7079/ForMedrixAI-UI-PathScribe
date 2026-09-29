// src/services/clinical/computeCriticalAlertReferenceTokenExpiry.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — expiry rule for the opaque reference token behind the SMS/
// secure-email "tap to view" deep link
// (ICriticalAlertReferenceTokenService.ts). A pure, testable rule, same
// separation-of-concerns precedent as
// consultAccess/computeDefaultConsultTokenExpiry.ts.
//
// Rule: a flat 7×24h (168h) window from issuedAt — deliberately NOT the
// consult token's 24h/72h-weekend logic, because this link plays a
// genuinely different, lower-stakes role: the REAL, mandatory
// notification for a critical/malignant finding is the human verbal
// phone call this app already requires
// (CriticalResultNotification/mockCriticalResultNotificationService.ts).
// This automated dispatch (and its reference link) is a real, additive
// courtesy on top of that call, never its substitute — so its expiry
// doesn't need to track clinical urgency the way a time-boxed external
// consult grant does. A full week keeps the link usable long enough to
// survive a delayed callback without needing a "did it expire before
// they saw it" edge case for what is, by design, a secondary channel.
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 60 * 60 * 1000;
const REFERENCE_TOKEN_LIFESPAN_HOURS = 7 * 24;

export function computeCriticalAlertReferenceTokenExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + REFERENCE_TOKEN_LIFESPAN_HOURS * MS_PER_HOUR);
}
