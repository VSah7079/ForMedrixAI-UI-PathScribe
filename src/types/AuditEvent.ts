//
// AuditEvent.ts
// ------------------------------------------------------------------
// Central audit event model for pathscribeAI.
// Supports:
// - AI actions
// - User actions
// - System actions
// - Field-level changes
// - Comment events
// - Lifecycle transitions
// - Full audit trail reconstruction
//

// High-level category for filtering and dashboard grouping
export type AuditEventCategory = "ai" | "user" | "system";

// Template lifecycle states
export type TemplateLifecycleState =
  | "draft"
  | "in_review"
  | "needs_changes"
  | "approved"
  | "published";

// Core audit event structure
export interface AuditEvent {
  // Unique event ID
  id: string;

  // ISO timestamp
  timestamp: string;

  // Who performed the action
  // Examples:
  // - "Dr. Sarah Johnson"
  // - "System"
  // - "System (AI)"
  user: string;

  // High-level grouping for UI filters
  category: AuditEventCategory;

  // Machine-readable action identifier
  // Examples:
  // - "set_single_answer"
  // - "add_comment"
  // - "state_transition"
  // - "ai_generated_synoptic"
  action: string;

  // Human-readable detail string (built by useAuditLog)
  detail: string;

  // Optional: which template this event belongs to
  templateId?: string;

  /**
   * Real feature, per direct specification: Post-Sign-Out Release
   * Buffer, Phase 5 (audit-logging polish). A real, genuine, app-wide
   * gap found and fixed while auditing this app's own audit system:
   * this field never existed here at all — auditLogger.ts's own
   * bridge function hardcoded caseId: null on every single event
   * routed through this file, regardless of whether the real caller's
   * own payload carried one (many do — flag_applied,
   * case_search_opened, case_finalized, this feature's own
   * sign_out_buffered, and others). Optional, additive — genuinely
   * absent for the real payloads that never carried a caseId at all,
   * not backfilled.
   */
  caseId?: string | null;

  /** Real feature, per direct specification: Post-Sign-Out Release
   *  Buffer, Phase 5 (spec §18a — audit entries need "facility IDs").
   *  Same real, generic-extraction reasoning as caseId immediately
   *  above — see that field's own doc comment. */
  facilityId?: string | null;

  /**
   * Real feature, per direct follow-up: "when we are tracking
   * actions, I don't believe we include the physical location of
   * that action, just the person - Correct?" Confirmed directly —
   * this type had `user` (who) and `facilityId` (which building/
   * site), but genuinely nothing for where WITHIN that facility an
   * action happened. Auto-populated by auditLogger.ts's own
   * logEvent() bridge for every real event that routes through it
   * (getEffectiveScanStationId(), utils/effectiveScanStation.ts) —
   * no caller anywhere needs to be changed to start carrying this;
   * same real "one central bridge, not every call site" approach
   * already used for caseId/facilityId. null when no station is
   * currently known (device not configured, no user default) —
   * genuinely absent, not a default/guessed value.
   */
  stationId?: string | null;

  // Optional lifecycle transition fields
  stateFrom?: TemplateLifecycleState;
  stateTo?: TemplateLifecycleState;

  // Optional question-level context
  questionId?: string;

  // Optional comment-level context
  commentId?: string;

  // Old and new values for field changes
  oldValue?: any;
  newValue?: any;

  // Optional free-text note (e.g., AI explanation, reviewer note)
  note?: string;
}
