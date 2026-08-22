// src/services/cassetteColors/ICassetteColorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up's own two-layer architecture:
// "The Application Layer... Routing Dictionary Management: Interfaces
// to maintain color keys, display names, and hex codes (e.g.,
// COLOR_BIOPSY → 'Blue')" and "Fallback Policy Settings: Configured
// behavior rules (e.g., 'If requested color is missing: Auto-fallback
// to White vs. Prompt User on Bench Screen')."
//
// Before this file, CassetteRoutingRule.cassetteColor was free text —
// a rule literally spelled out "Blue" as its own string. Same real
// "spread the definition over multiple types of maintenance" problem
// already fixed once for cassette TYPE (never re-stored on a rule,
// always resolved from the real Protocol) — color gets the same
// real dictionary, referenced by key, never re-typed per rule.
//
// Fallback policy lives HERE, on the color itself, not on individual
// rules — confirmed as the right shape by the spec's own framing:
// "if requested color is missing" is a real fact about that COLOR
// (is White a sensible substitute for Blue in this lab?), not a
// property any given rule that happens to output Blue should have to
// separately decide. One color, one real fallback answer, reused by
// every rule that ever resolves to it.
//
// Deliberately NEVER models hopper state, inventory, or "is this
// color actually available right now" anywhere in this file — per
// direct confirmation, that's entirely Layer 2 (the Engine)'s own
// concern. This dictionary defines what SHOULD happen if the Engine
// reports a color unavailable; it never decides IF a color is
// unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type CassetteColorFallbackBehavior = 'auto' | 'prompt';

export interface CassetteColorDefinition {
  id: ID;
  /** Stable, uppercase key used in the real dispatch payload sent to
   *  the Engine — e.g. "COLOR_BIOPSY". Deliberately separate from
   *  displayName so a lab can rename how a color is shown ("Blue" →
   *  "Sky Blue") without touching every rule/payload that references
   *  the underlying key, same real reasoning as ScanStation.
   *  barcodeCode being separate from ScanStation.id. */
  key: string;
  /** e.g. "Blue" — shown throughout the admin UI and any real
   *  technician-facing notification. */
  displayName: string;
  /** e.g. "#3B82F6" — real hex code for UI swatches (the routing
   *  rules table, the color picker in the rule modal). */
  hexCode: string;
  active: boolean;
  /** What SHOULD happen if the Engine reports this color's real
   *  hopper unavailable — 'auto' silently substitutes
   *  fallbackColorId, 'prompt' means the Engine (or PathScribe's own
   *  UI, once it hears back — see the dispatch-outcome event) should
   *  surface a real choice to a technician instead of guessing. */
  fallbackBehavior: CassetteColorFallbackBehavior;
  /** Required when fallbackBehavior is 'auto' — which other, real
   *  CassetteColorDefinition to substitute. References another
   *  color's own id, never a second, free-text guess at a color that
   *  might not even still exist in this same dictionary. */
  fallbackColorId?: ID;
  createdAt: string;
  updatedAt: string;
}

export interface ICassetteColorService {
  getAll(): Promise<ServiceResult<CassetteColorDefinition[]>>;
  getById(id: ID): Promise<ServiceResult<CassetteColorDefinition>>;
  getByKey(key: string): Promise<ServiceResult<CassetteColorDefinition>>;
  create(draft: Omit<CassetteColorDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<CassetteColorDefinition>>;
  update(id: ID, changes: Partial<Omit<CassetteColorDefinition, 'id'>>): Promise<ServiceResult<CassetteColorDefinition>>;
  deactivate(id: ID): Promise<ServiceResult<CassetteColorDefinition>>;
  reactivate(id: ID): Promise<ServiceResult<CassetteColorDefinition>>;
}
