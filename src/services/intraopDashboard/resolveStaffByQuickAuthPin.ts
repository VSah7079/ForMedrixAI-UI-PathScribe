// src/services/intraopDashboard/resolveStaffByQuickAuthPin.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct design brief: "Fast User Context Switching (Badge/
// PIN)... Proximity Badge Tap (RFID/NFC) or 4-digit PIN." Real, honest
// mock scope: a genuine RFID/NFC badge reader is real hardware
// integration this codebase cannot build — the PIN half is real and
// fully working, standing in for whichever real credential a real
// deployment actually wires up.
// ─────────────────────────────────────────────────────────────────────────────

import { userService } from '../index';
import type { StaffUser } from '../users/IUserService';

export interface QuickAuthResult {
  outcome: 'authenticated' | 'not-found' | 'invalid-role';
  staff?: StaffUser;
}

/** Real, per direct design brief's own audit example: "Event: Verbal
 *  Report Logged | Location: OR-04 | User: J. Doe, RN" — only ever
 *  resolves a real 'or-staff' StaffUser. A pathologist/lab-tech PIN
 *  (if one somehow matched) is deliberately refused here — this
 *  quick-auth path exists for the ambient OR terminal's own real
 *  audience, never a back door into the lab's own, separate login. */
export async function resolveStaffByQuickAuthPin(pin: string): Promise<QuickAuthResult> {
  const trimmed = pin.trim();
  if (!trimmed) return { outcome: 'not-found' };

  const res = await userService.getAll();
  if (!res.ok) return { outcome: 'not-found' };

  const match = res.data.find(s => s.quickAuthPin === trimmed);
  if (!match) return { outcome: 'not-found' };
  if (!match.roles.includes('or-staff')) return { outcome: 'invalid-role' };

  return { outcome: 'authenticated', staff: match };
}
