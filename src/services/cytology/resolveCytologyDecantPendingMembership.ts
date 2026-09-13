// src/services/cytology/resolveCytologyDecantPendingMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed correction: Cytology's
// "Cell Block / Ancillary Pending" worklist tile now reads the real,
// established Decant/StainOrder model (types/case/Material.ts,
// Specimen.decants) — the same real model Surgical Pathology already
// uses — never the separate, now-retired CytologyCellBlock model this
// replaces.
//
// Real, deliberate "pending" definition: a stain order is genuinely
// still outstanding when its own real StainOrderStatus hasn't reached
// a real, final state yet. 'Coverslipped' and 'Ready for Review' are
// real, completed states — a slide is done. 'Cancelled' is also
// final, in the sense that nothing further is expected of it. Every
// other real status ('Pending Cut', 'Cut & Placed', 'Staining',
// 'Recut Requested', 'QC Failed') represents genuine, real, ongoing
// work — including 'QC Failed', which needs a real recut/redo, not a
// stain nobody is waiting on.
// ─────────────────────────────────────────────────────────────────────────────

import type { Decant } from '@/types/case/Material';

const FINAL_STAIN_STATUSES = new Set(['Coverslipped', 'Ready for Review', 'Cancelled']);

export function resolveCytologyDecantPendingMembership(
  decants: Decant[] | undefined,
): boolean {
  if (!decants || decants.length === 0) return false;
  return decants.some(decant => decant.stains.some(stain => !FINAL_STAIN_STATUSES.has(stain.status)));
}
