// src/services/printerProfiles/printerProfileList.ts
// Batch 359: the Printer Profiles list's decisions, moved out of
// PrinterProfilesSection.tsx when the register link was added there.
import type { PrinterProfile } from './IPrinterProfileService';

/** The facility filter: that lab's printers plus shared (no-lab) ones, which every lab's benches can reach. */
export function printerProfilesForFacility(profiles: readonly PrinterProfile[], facilityId?: string): PrinterProfile[] {
  return facilityId ? profiles.filter(p => !p.facilityId || p.facilityId === facilityId) : [...profiles];
}

/** The GS1 / DataMatrix column's label key. */
export function printerSupportLabelKey(p: Pick<PrinterProfile, 'supportsGS1' | 'supportsDataMatrix'>): string {
  if (p.supportsGS1 && p.supportsDataMatrix) return 'printerProfilesSection.supportBoth';
  if (p.supportsDataMatrix) return 'printerProfilesSection.supportDataMatrixOnly';
  if (p.supportsGS1) return 'printerProfilesSection.supportGs1Only';
  return 'printerProfilesSection.supportNone';
}
