// src/services/printerProfiles/validatePrinterProfileDraft.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct reminder: "no business logic in the UI code."
// Extracted out of PrinterProfilesSection.tsx's own canSave check.
//
// Batch 346 (PS-52): the PathScribe Agent's port. Only a PathScribe Agent
// printer uses it; it is optional, and when set must be 1024–65535
// (utils/labels/pathscribeAgent/agentProtocol.ts). The screen now calls
// these instead of repeating the check itself.
// ─────────────────────────────────────────────────────────────────────────────

import { isValidAgentPort } from '@/utils/labels/pathscribeAgent/agentProtocol';
import type { PrinterBridgeType } from './IPrinterProfileService';

export interface PrinterProfileDraftValidationInput {
  printerId: string;
  model: string;
  bridgeType?: PrinterBridgeType;
  agentPort?: number;
}

/** A PathScribe Agent port was entered and isn't one the agent could use. */
export function hasInvalidAgentPort(draft: Pick<PrinterProfileDraftValidationInput, 'bridgeType' | 'agentPort'>): boolean {
  return draft.bridgeType === 'pathscribe_agent' && draft.agentPort !== undefined && draft.agentPort !== null
    && !isValidAgentPort(draft.agentPort);
}

/** Real, required fields for a printer profile to be saveable — a
 *  printer with no real, human-facing id or model isn't actually
 *  addressable in the registry yet. */
export function isPrinterProfileDraftValid(draft: PrinterProfileDraftValidationInput): boolean {
  return draft.printerId.trim().length > 0 && draft.model.trim().length > 0 && !hasInvalidAgentPort(draft);
}

/** What gets saved: the agent port is kept only for a PathScribe Agent
 *  printer, so switching the bridge away doesn't leave a stale port.
 *  (Set to undefined rather than left out, so an update clears it.) */
export function printerProfileDraftForSave<T extends { bridgeType: PrinterBridgeType; agentPort?: number }>(draft: T): T {
  return draft.bridgeType === 'pathscribe_agent' ? draft : { ...draft, agentPort: undefined };
}
