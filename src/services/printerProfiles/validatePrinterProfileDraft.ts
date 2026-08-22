// src/services/printerProfiles/validatePrinterProfileDraft.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct reminder: "no business logic in the UI code."
// Extracted out of PrinterProfilesSection.tsx's own canSave check.
// ─────────────────────────────────────────────────────────────────────────────

export interface PrinterProfileDraftValidationInput {
  printerId: string;
  model: string;
}

/** Real, required fields for a printer profile to be saveable — a
 *  printer with no real, human-facing id or model isn't actually
 *  addressable in the registry yet. */
export function isPrinterProfileDraftValid(draft: PrinterProfileDraftValidationInput): boolean {
  return draft.printerId.trim().length > 0 && draft.model.trim().length > 0;
}
