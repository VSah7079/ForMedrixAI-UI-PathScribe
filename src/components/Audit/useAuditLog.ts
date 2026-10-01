/**
 * useAuditLog
 * ============================================================
 * Centralised audit logging hook for pathscribe AI.
 *
 * Usage (in any component):
 *   const { log } = useAuditLog();
 *   log("save_protocol", { name: protocol.name, changes: ["Title changed"] });
 *   log("create_macro",  { name: macro.name });
 *   log("delete_template", { name: template.name });
 *
 * All events are automatically stamped with:
 *   - The current user's email (via useAuth)
 *   - A UUID + ISO timestamp (via logEvent)
 *   - A consistently formatted detail string (built here)
 *
 * Typed to match src/types/AuditEvent.ts (uses `category` not `type`/`actor`).
 * ============================================================
 */

import { useCallback } from "react";
import { useAuth } from "@contexts/AuthContext";
import { logEvent } from "../../audit/auditLogger";
import type { AuditEvent, AuditEventCategory } from "../../types/AuditEvent";

// ── Action catalogue ──────────────────────────────────────────────────────────

export type AuditAction =
  | "save_protocol"
  | "clone_protocol"
  | "create_protocol"
  | "delete_protocol"
  | "open_clone_modal"
  | "cancel_clone"
  | "create_macro"
  | "update_macro"
  | "delete_macro"
  | "create_template"
  | "update_template"
  | "delete_template"
  | "update_ai_behavior"
  | "update_system_settings"
  | "create_user"
  | "update_user"
  | "delete_user"
  | "update_models"
  | "navigate_tab"
  | "clear_audit_log"
  // ── Computational Sidecar — utilization ──
  | "comp_sidecar_opened"
  | "comp_sidecar_closed"
  | "comp_result_viewed"
  | "comp_result_read_aloud"
  | "comp_tab_opened"
  | "comp_order_modal_opened"
  | "comp_orders_placed"
  | "comp_order_cancelled"
  | "comp_concordance_viewed"
  // ── Computational Sidecar — configuration ──
  | "comp_config_flag_created"
  | "comp_config_flag_updated"
  | "comp_config_flag_deactivated"
  | "comp_config_protocol_linked"
  | "comp_config_protocol_unlinked"
  // ── Validation Studies ──
  | "validation_study_created"
  | "validation_study_activated"
  | "validation_study_closed"
  | "validation_study_deleted"
  | "validation_report_generated"
  | "validation_routing_rule_added"
  | "validation_routing_rule_updated"
  | "validation_routing_rule_deleted"
  // ── Synoptic Report Page ──
  | "case_finalized"
  /** Real feature, per direct specification: Post-Sign-Out Release
   *  Buffer, Phase 5 (audit-logging polish). A real, genuine gap found
   *  and fixed while auditing this app's own audit system: this event
   *  has been logged since Phase 1 via useSignOutWorkflow.ts's own
   *  log('sign_out_buffered', {...}) call, but was never added here —
   *  meaning it silently fell through buildDetail()'s default case
   *  (a raw JSON.stringify(payload)) instead of a real, clean,
   *  human-readable sentence like every other real event in this
   *  file gets. */
  | "sign_out_buffered"
  | "protocol_change_committed"
  | "flag_manager_opened"
  | "team_modal_opened"
  | "codes_modal_opened";

// ── Event type mapping ────────────────────────────────────────────────────────
// Maps each AuditAction to the high-level AuditEventCategory used by your
// project's AuditEvent type (ai | user | system).

const actionTypeMap: Record<AuditAction, AuditEventCategory> = {
  save_protocol:          "user",
  clone_protocol:         "user",
  create_protocol:        "user",
  delete_protocol:        "user",
  open_clone_modal:       "system",
  cancel_clone:           "user",
  create_macro:           "user",
  update_macro:           "user",
  delete_macro:           "user",
  create_template:        "user",
  update_template:        "user",
  delete_template:        "user",
  update_ai_behavior:     "ai",
  update_system_settings: "system",
  create_user:            "user",
  update_user:            "user",
  delete_user:            "user",
  update_models:          "user",
  navigate_tab:           "user", // <-- ensure this exists to satisfy Record<AuditAction,...>
  clear_audit_log:        "system",
  // Computational Sidecar
  comp_sidecar_opened:        "user",
  comp_sidecar_closed:        "user",
  comp_result_viewed:         "user",
  comp_result_read_aloud:     "user",
  comp_tab_opened:            "user",
  comp_order_modal_opened:    "user",
  comp_orders_placed:         "user",
  comp_order_cancelled:       "user",
  comp_concordance_viewed:    "user",
  comp_config_flag_created:   "system",
  comp_config_flag_updated:   "system",
  comp_config_flag_deactivated: "system",
  comp_config_protocol_linked:  "system",
  comp_config_protocol_unlinked:  "system",
  // ── Validation Studies ──
  validation_study_created:        "user",
  validation_study_activated:      "user",
  validation_study_closed:         "user",
  validation_study_deleted:        "user",
  validation_report_generated:     "user",
  validation_routing_rule_added:   "user",
  validation_routing_rule_updated: "user",
  validation_routing_rule_deleted: "user",
  // ── Synoptic Report Page ──
  case_finalized:             "user",
  sign_out_buffered:          "user",
  protocol_change_committed:  "user",
  flag_manager_opened:        "user",
  team_modal_opened:          "user",
  codes_modal_opened:         "user",
};

// ── Payload types per action ──────────────────────────────────────────────────

export type AuditPayload = {
  save_protocol:          { name: string; changes: string[] };
  clone_protocol:         { sourceId: string; sourceName: string; newId: string };
  create_protocol:        { name: string };
  delete_protocol:        { name: string; id: string };
  open_clone_modal:       { id: string; name: string };
  cancel_clone:           { id: string; name: string };
  create_macro:           { name: string };
  update_macro:           { name: string; changes: string[] };
  delete_macro:           { name: string };
  create_template:        { name: string; organ?: string };
  update_template:        { name: string; changes: string[] };
  delete_template:        { name: string };
  update_ai_behavior:     { setting: string; from: string | boolean; to: string | boolean };
  update_system_settings: { setting: string; from?: string | boolean; to: string | boolean };
  create_user:            { name: string; email: string; role: string };
  update_user:            { name: string; changes: string[] };
  delete_user:            { name: string; email: string };
  update_models:          { protocol: string; model: string };
  navigate_tab:           { tabId: string; tabName?: string };
  clear_audit_log:        Record<string, never>;
  // Computational Sidecar — utilization
  comp_sidecar_opened:        { caseId?: string; flagId?: string; source?: "click" | "voice" };
  comp_sidecar_closed:        { caseId?: string };
  comp_result_viewed:         { caseId?: string; flagId?: string; flagName?: string; status?: string };
  comp_result_read_aloud:     { caseId?: string; flagId?: string };
  comp_tab_opened:            { caseId?: string; source?: "click" | "voice" };
  comp_order_modal_opened:    { caseId?: string };
  comp_orders_placed:         { caseId?: string; count?: number; flags?: Array<{ flagId: string; lisCode?: string; specimenId?: string | null }> };
  comp_order_cancelled:       { caseId?: string; flagId?: string; flagName?: string; orderedVia?: string };
  comp_concordance_viewed:    { caseId?: string; flagId?: string; agreement?: "agrees" | "differs" };
  // Computational Sidecar — configuration
  comp_config_flag_created:   { flagId?: string; flagName?: string; dataSourceType?: string; lisCode?: string };
  comp_config_flag_updated:   { flagId?: string; changes?: string[] };
  comp_config_flag_deactivated: { flagId?: string; flagName?: string };
  comp_config_protocol_linked:  { flagId?: string; protocolId?: string };
  comp_config_protocol_unlinked:  { flagId?: string; protocolId?: string };
  // ── Validation Studies ──
  validation_study_created:        { studyName: string; clientCount: number; pathologistCount: number };
  validation_study_activated:      { studyName: string; activatedBy: string; irbReference?: string };
  validation_study_closed:         { studyName: string; signalCount: number };
  validation_study_deleted:        { studyName: string };
  validation_report_generated:     { studyName: string; caseCount: number; acceptanceRate: string };
  validation_routing_rule_added:   { entityName: string; templateName: string; ruleType: string };
  validation_routing_rule_updated: { entityName: string; templateName: string };
  validation_routing_rule_deleted: { entityName: string; ruleType: string };
  // ── Synoptic Report Page ──
  case_finalized:             { caseId: string; accession?: string; finalizedBy: string; excludedCount: number };
  /** Matches exactly what useSignOutWorkflow.ts's finalizeCase() has
   *  passed since Phase 1 — no call-site change needed to close this
   *  gap. */
  sign_out_buffered:          { caseId: string; accession?: string; durationMinutes: number; facilityId?: string | null };
  protocol_change_committed: { caseId: string; acceptedCount: number; totalProposed: number; actions?: string[] };
  flag_manager_opened:       { caseId: string; source?: string };
  team_modal_opened:         { caseId: string };
  codes_modal_opened:        { caseId: string };
  gross_complete:            { caseId: string; accession?: string; specimenCount: number };
  gross_updated:             { caseId: string; accession?: string; specimenCount: number; reason?: string };

  // ── Messaging (AppShell) ──
  message_sent:               { recipientId: string; recipientName: string; isUrgent: boolean };
  secure_email_sent:          { recipientEmail: string; subject: string };

  // ── Audit log itself ──
  audit_log_viewed:           Record<string, never>;

  // ── Identifier Formats ──
  identifier_format_toggled:  { formatId: string; label: string; enabled: boolean };
  identifier_formats_saved:   { jurisdiction: string; enabledCount: number };

  // ── TAT Configuration ──
  tat_entry_deleted:          { id: string; type: string };
  tat_entry_toggled:          { id: string; type: string; active: boolean };
  tat_entry_updated:          { id: string; type: string; changes: string[] };
  tat_entry_created:          { type: string; targetHours: number; facilityId: string | null; roleId: string | null };

  // ── Flag Manager (real apply/remove — not the removed Computational ordering) ──
  flag_applied:                { caseId: string; flagName: string; specimenId?: string };
  flag_removed:                { caseId: string; flagName: string; specimenId?: string };

  // ── Case Search ──
  case_search_no_results:     { query: string };
  case_search_performed:      { query: string; resultCount: number };
  case_search_opened:         { query: string; caseId: string; accession?: string; matchedField?: string };
  // Real, per direct guidance's own full "On-Demand Fetch &
  // Fallback" design — a real local cache miss that a live LIS
  // fetch (Option A) successfully resolved.
  case_fetched_on_demand_from_lis: { query: string; caseId: string };

  // ── Validation Studies (additional — some entries already existed above) ──
  validation_study_submitted:           { studyName: string; committeeName: string; submittedBy: string };
  validation_study_approval_recorded:   { studyName: string; irbReference?: string; approvedBy: string; conditions?: string };
};

// ── Detail string builders ────────────────────────────────────────────────────

function buildDetail<A extends keyof AuditPayload>(action: A, payload: AuditPayload[A]): string {
  switch (action) {
    case "save_protocol": {
      const p = payload as AuditPayload["save_protocol"];
      return p.changes.length > 0
        ? p.changes.join(" | ")
        : `Saved "${p.name}" — no changes detected`;
    }
    case "clone_protocol": {
      const p = payload as AuditPayload["clone_protocol"];
      return `Cloned "${p.sourceName}" (${p.sourceId}) → new copy (${p.newId})`;
    }
    case "create_protocol": {
      const p = payload as AuditPayload["create_protocol"];
      return `Created new protocol "${p.name}"`;
    }
    case "delete_protocol": {
      const p = payload as AuditPayload["delete_protocol"];
      return `Deleted protocol "${p.name}" (${p.id})`;
    }
    case "open_clone_modal": {
      const p = payload as AuditPayload["open_clone_modal"];
      return `Opened clone modal for "${p.name}" (${p.id})`;
    }
    case "cancel_clone": {
      const p = payload as AuditPayload["cancel_clone"];
      return `Canceled clone of "${p.name}" (${p.id})`;
    }
    case "create_macro": {
      const p = payload as AuditPayload["create_macro"];
      return `Created macro "${p.name}"`;
    }
    case "update_macro": {
      const p = payload as AuditPayload["update_macro"];
      return p.changes.length > 0
        ? `Updated macro "${p.name}": ${p.changes.join(" | ")}`
        : `Saved macro "${p.name}" — no changes detected`;
    }
    case "delete_macro": {
      const p = payload as AuditPayload["delete_macro"];
      return `Deleted macro "${p.name}"`;
    }
    case "create_template": {
      const p = payload as AuditPayload["create_template"];
      return `Created template "${p.name}"${p.organ ? ` (${p.organ})` : ""}`;
    }
    case "update_template": {
      const p = payload as AuditPayload["update_template"];
      return p.changes.length > 0
        ? `Updated template "${p.name}": ${p.changes.join(" | ")}`
        : `Saved template "${p.name}" — no changes detected`;
    }
    case "delete_template": {
      const p = payload as AuditPayload["delete_template"];
      return `Deleted template "${p.name}"`;
    }
    case "update_ai_behavior": {
      const p = payload as AuditPayload["update_ai_behavior"];
      return `${p.setting}: ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}`;
    }
    case "update_system_settings": {
      const p = payload as AuditPayload["update_system_settings"];
      return p.from !== undefined
        ? `${p.setting}: ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}`
        : `${p.setting} set to ${JSON.stringify(p.to)}`;
    }
    case "create_user": {
      const p = payload as AuditPayload["create_user"];
      return `Created user "${p.name}" (${p.email}) with role ${p.role}`;
    }
    case "update_user": {
      const p = payload as AuditPayload["update_user"];
      return p.changes.length > 0
        ? `Updated user "${p.name}": ${p.changes.join(" | ")}`
        : `Saved user "${p.name}" — no changes detected`;
    }
    case "delete_user": {
      const p = payload as AuditPayload["delete_user"];
      return `Deleted user "${p.name}" (${p.email})`;
    }
    case "update_models": {
      const p = payload as AuditPayload["update_models"];
      return `Set model for "${p.protocol}" to ${p.model}`;
    }
    case "clear_audit_log":
      return "Audit log cleared";

    // ── Computational Sidecar ──────────────────────────────────────
    case "comp_sidecar_opened": {
      const p = payload as AuditPayload["comp_sidecar_opened"];
      return `Computational sidecar opened for case ${p.caseId ?? "unknown"}${p.flagId ? ` — flag ${p.flagId}` : ""} (${p.source ?? "click"})`;
    }
    case "comp_sidecar_closed": {
      const p = payload as AuditPayload["comp_sidecar_closed"];
      return `Computational sidecar closed — case ${p.caseId ?? "unknown"}`;
    }
    case "comp_result_viewed": {
      const p = payload as AuditPayload["comp_result_viewed"];
      return `Result viewed: ${p.flagName ?? p.flagId ?? "unknown"} (${p.status ?? "PENDING"}) — case ${p.caseId ?? "unknown"}`;
    }
    case "comp_result_read_aloud": {
      const p = payload as AuditPayload["comp_result_read_aloud"];
      return `Result read aloud: flag ${p.flagId ?? "unknown"} — case ${p.caseId ?? "unknown"}`;
    }
    case "comp_tab_opened": {
      const p = payload as AuditPayload["comp_tab_opened"];
      return `Computational tab opened — case ${p.caseId ?? "unknown"} (${p.source ?? "click"})`;
    }
    case "comp_order_modal_opened": {
      const p = payload as AuditPayload["comp_order_modal_opened"];
      return `Order modal opened — case ${p.caseId ?? "unknown"}`;
    }
    case "comp_orders_placed": {
      const p = payload as AuditPayload["comp_orders_placed"];
      const names = (p.flags ?? []).map(f => f.lisCode ?? f.flagId).join(", ");
      return `${p.count ?? 0} order(s) placed — case ${p.caseId ?? "unknown"}: ${names}`;
    }
    case "comp_order_cancelled": {
      const p = payload as AuditPayload["comp_order_cancelled"];
      return `Order cancelled: ${p.flagName ?? p.flagId ?? "unknown"} (via ${p.orderedVia ?? "lis"}) — case ${p.caseId ?? "unknown"}`;
    }
    case "comp_concordance_viewed": {
      const p = payload as AuditPayload["comp_concordance_viewed"];
      return `Concordance viewed: ${p.agreement ?? "unknown"} — flag ${p.flagId ?? "unknown"}, case ${p.caseId ?? "unknown"}`;
    }
    case "comp_config_flag_created": {
      const p = payload as AuditPayload["comp_config_flag_created"];
      return `Computational flag created: "${p.flagName ?? p.flagId}" (${p.dataSourceType ?? "unknown"}, LIS code: ${p.lisCode ?? "none"})`;
    }
    case "comp_config_flag_updated": {
      const p = payload as AuditPayload["comp_config_flag_updated"];
      return `Computational flag updated: ${p.flagId} — changed: ${(p.changes ?? []).join(", ")}`;
    }
    case "comp_config_flag_deactivated": {
      const p = payload as AuditPayload["comp_config_flag_deactivated"];
      return `Computational flag deactivated: "${p.flagName ?? p.flagId}"`;
    }
    case "comp_config_protocol_linked": {
      const p = payload as AuditPayload["comp_config_protocol_linked"];
      return `Protocol linked to flag ${p.flagId}: protocol ${p.protocolId}`;
    }
    // ── Validation Studies ──────────────────────────────────────────────
    case "validation_study_created": {
      const p = payload as AuditPayload["validation_study_created"];
      return `Validation study created: "${p.studyName}" — ${p.clientCount} client(s), ${p.pathologistCount} pathologist(s)`;
    }
    case "validation_study_activated": {
      const p = payload as AuditPayload["validation_study_activated"];
      return `Validation study activated: "${p.studyName}" — activated by ${p.activatedBy}`;
    }
    case "validation_study_closed": {
      const p = payload as AuditPayload["validation_study_closed"];
      return `Validation study closed: "${p.studyName}" — ${p.signalCount} signals captured`;
    }
    case "validation_study_deleted": {
      const p = payload as AuditPayload["validation_study_deleted"];
      return `Validation study deleted: "${p.studyName}"`;
    }
    case "validation_report_generated": {
      const p = payload as AuditPayload["validation_report_generated"];
      return `Validation report generated: "${p.studyName}" — ${p.caseCount} cases, ${p.acceptanceRate} acceptance rate`;
    }
    case "validation_routing_rule_added": {
      const p = payload as AuditPayload["validation_routing_rule_added"];
      return `Routing rule added: ${p.entityName} → ${p.templateName} (${p.ruleType})`;
    }
    case "validation_routing_rule_updated": {
      const p = payload as AuditPayload["validation_routing_rule_updated"];
      return `Routing rule updated: ${p.entityName} → ${p.templateName}`;
    }
    case "validation_routing_rule_deleted": {
      const p = payload as AuditPayload["validation_routing_rule_deleted"];
      return `Routing rule deleted: ${p.entityName} (${p.ruleType})`;
    }

    case "comp_config_protocol_unlinked": {
      const p = payload as AuditPayload["comp_config_protocol_unlinked"];
      return `Protocol unlinked from flag ${p.flagId}: protocol ${p.protocolId}`;
    }

    // ── Synoptic Report Page ────────────────────────────────────────────
    case "case_finalized": {
      const p = payload as AuditPayload["case_finalized"];
      return `Case finalized: ${p.accession ?? p.caseId} by ${p.finalizedBy}` +
        (p.excludedCount > 0 ? ` — ${p.excludedCount} synoptic instance(s) excluded/deferred` : "");
    }
    case "sign_out_buffered": {
      const p = payload as AuditPayload["sign_out_buffered"];
      return `Case ${p.accession ?? p.caseId} entered the post-sign-out release buffer (${p.durationMinutes} min) — recall available until real expiry.`;
    }
    case "protocol_change_committed": {
      const p = payload as AuditPayload["protocol_change_committed"];
      return `Protocol changes committed — case ${p.caseId}: ${p.acceptedCount} of ${p.totalProposed} proposed change(s) accepted`;
    }
    case "flag_manager_opened": {
      const p = payload as AuditPayload["flag_manager_opened"];
      return `Flag manager opened — case ${p.caseId}`;
    }
    case "team_modal_opened": {
      const p = payload as AuditPayload["team_modal_opened"];
      return `Team modal opened — case ${p.caseId}`;
    }
    case "codes_modal_opened": {
      const p = payload as AuditPayload["codes_modal_opened"];
      return `Codes modal opened — case ${p.caseId}`;
    }

    default:
      return JSON.stringify(payload);
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuditLog() {
  const { user } = useAuth();

  const log = useCallback(function log<A extends keyof AuditPayload>(action: A, payload: AuditPayload[A]) {
    // Real feature, per direct specification, Phase 5 (audit-logging
    // polish): a generic, runtime extraction — not retrofitting each
    // of this file's ~80 real AuditPayload entries individually to
    // formally declare a caseId field, which is far beyond this
    // phase's real scope. Many payloads already carry a real caseId
    // (case_finalized, sign_out_buffered, flag_applied,
    // case_search_opened, and others) — this picks it up wherever
    // it's genuinely present, forwards it through to the real,
    // structured AuditEvent.caseId field instead of it being stranded
    // inside the free-text detail string only.
    const caseId = (payload as { caseId?: string })?.caseId ?? null;
    const facilityId = (payload as { facilityId?: string | null })?.facilityId ?? null;

    // Build an object that exactly matches Omit<AuditEvent, 'id' | 'timestamp'>
    const eventPayload: Omit<AuditEvent, "id" | "timestamp"> = {
      // `user` in AuditEvent is the actor name/email; here we use the authenticated email.
      user: user?.email || "unknown",
      // `category` is required by your AuditEvent type and must be one of AuditEventCategory.
      category: actionTypeMap[action],
      // machine-readable action identifier
      action,
      // human-readable detail string
      detail: buildDetail(action, payload),
      caseId,
      facilityId,
      // optional fields can be added here if relevant (templateId, stateFrom, etc.)
    };

    logEvent(eventPayload);
  }, [user]);

  return { log };
}
