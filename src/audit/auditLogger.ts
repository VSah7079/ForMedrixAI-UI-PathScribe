import { AuditEvent } from "../types/AuditEvent";
import { mockAuditService } from "../services/auditlog/mockAuditService";

// Real bug found and fixed via a direct audit: this file used to be a
// completely separate, parallel audit system — its own localStorage key
// ("ps_audit_log_v1"), never read by anything. Real, active consumers
// (hooks/useSynopticAudit.ts, components/Audit/useAuditLog.ts, and
// InlineCommentThread.tsx via TemplateRenderer.tsx — all genuinely
// reachable, not dead code, confirmed via a direct trace including a
// lazy-loading variant the audit script's own heuristic initially
// missed) were calling logEvent() here believing they were writing to
// the real audit trail. They weren't — AuditLogPage.tsx (the real
// System Audit page) reads exclusively from services/auditlog/'s
// mockAuditService, which has zero awareness this file's storage key
// even exists. Every synoptic-editor action and inline comment routed
// through TemplateRenderer.tsx was silently invisible to any real audit
// review. Fixed here, not by touching the three consumer files — they
// keep calling this same logEvent() signature unchanged, it's this
// function's own implementation that now actually reaches the real,
// shared audit store instead of a disconnected one.
//
// getAuditLog()/clearAuditLog() removed — confirmed via the same audit
// that nothing anywhere reads from or calls them; the whole point of
// this fix is to stop this file from being its own separate store, so
// keeping unused read/clear functions for that store made no sense
// once logEvent() itself no longer treats it as authoritative.

const CATEGORY_TO_TYPE: Record<AuditEvent['category'], 'ai' | 'user' | 'system'> = {
  ai: 'ai',
  user: 'user',
  system: 'system',
};

/**
 * Real feature, per direct follow-up: "when we are tracking actions,
 * I don't believe we include the physical location of that action,
 * just the person - Correct?" Confirmed, then fixed — but NOT here.
 * A direct trace found 16 separate real files calling
 * mockAuditService.logEvent(), most going straight there rather than
 * through this one wrapper — the real, single choke point every one
 * of them funnels through is mockAuditService.logEvent() itself,
 * which now injects getEffectiveScanStationId() unconditionally on
 * every real write. stationId is still excluded from this function's
 * own caller-facing input type below (no caller anywhere needs to
 * know or care that this field exists at all), but the actual
 * injection lives one level down — see mockAuditService.ts's own
 * comment for the full reasoning.
 */
export function logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "stationId">) {
  // Fire-and-forget — matches every other audit call site in this app
  // (an audit write failing must never block or fail the action it
  // describes) and keeps this function's own signature synchronous, so
  // none of the three real callers need to change how they call it.
  mockAuditService.logEvent({
    type: CATEGORY_TO_TYPE[event.category] ?? 'system',
    event: event.action,
    detail: event.detail,
    user: event.user,
    // Real feature, per direct specification, Phase 5 (audit-logging
    // polish): this used to hardcode null regardless of what the real
    // caller's own event carried — see AuditEvent.caseId's own doc
    // comment for the full, app-wide gap this closes.
    caseId: event.caseId ?? null,
    facilityId: event.facilityId ?? null,
    confidence: null,
  }).catch(() => {});
}
