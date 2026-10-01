// src/types/events/CassetteDispatchOutcomeEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up's own two-layer architecture:
// "User Notifications: UI alerts and banners informing technicians
// when a fallback occurs or a hopper is empty." This is the real,
// inbound half of that — the Engine (Layer 2, per direct
// confirmation) is the only thing that ever actually knows whether a
// hopper was available, so PathScribe can only ever show this after
// genuinely hearing back, never infer it from its own rule
// evaluation. Same real vendor-agnostic event-contract shape as
// MaterialLocationEventPayload.ts — a real, external system reporting
// what happened, not something PathScribe decides for itself.
// ─────────────────────────────────────────────────────────────────────────────

export type CassetteDispatchOutcome = 'dispatched' | 'fallback_used' | 'prompted' | 'error';

export interface CassetteDispatchOutcomeEventPayload {
  /** Same real idempotency key every other inbound event in this app
   *  uses (MaterialLocationEventPayload, BlockExceptionEventPayload)
   *  — redelivery of the same real Engine report is a no-op, never a
   *  duplicate notification. */
  messageId: string;
  /** Real, internal case id — how PathScribe finds the case to attach
   *  a real notification to. */
  caseId: string;
  specimenLabel?: string;
  /** The color key PathScribe originally requested (evaluate
   *  CassetteRoutingRouting's own primaryColor.key). */
  requestedColorKey: string;
  /** The color key actually used — differs from requestedColorKey
   *  only when outcome is 'fallback_used'. */
  actualColorKey?: string;
  outcome: CassetteDispatchOutcome;
  /** Free text from the Engine — e.g. "Hopper 2 empty", "Printer
   *  offline" — shown as-is in the real notification, never decoded
   *  or reinterpreted by PathScribe. */
  message?: string;
  reportedAt: string;
  /** Vendor-agnostic — same real reasoning as
   *  BlockExceptionEventPayload.sourceSystem: free text, not a closed
   *  enum naming a specific vendor. */
  sourceSystem?: string;
}
