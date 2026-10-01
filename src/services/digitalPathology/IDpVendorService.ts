// src/services/digitalPathology/IDpVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own earlier DP/AI vendor research — an
// admin-definable dictionary of real, named computational-pathology
// vendors (Paige, Ibex, PathAI, Proscia, Hologic), matching this app's
// own, already-established dictionary pattern (add/edit/deactivate,
// isSystem-protected seed entries). Real, deliberate placement:
// services/digitalPathology/, not services/cytology/ — surgical
// pathology's own real, FDA-cleared AI products (Paige Prostate, Ibex
// Prostate Detect, PathAI AISight Dx, Proscia Concentriq AP-Dx) are
// the majority of this real market; cervical cytology (Hologic Genius)
// is one, real, additional modality this same shared dictionary
// covers, not the dictionary's own primary reason to exist.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

/** Real, per this module's own earlier research into which real
 *  specimen/case types each real, named vendor's own AI product
 *  actually screens — Paige/Ibex are prostate-specific; PathAI/
 *  Proscia are general surgical pathology; Hologic is cervical
 *  cytology only. Open string, not a closed enum — a real, new
 *  vendor's own product may cover a real modality this dictionary
 *  hasn't seen yet, and an admin adding one shouldn't be blocked by a
 *  hardcoded, closed list. */
export type DpVendorModality = string;

export interface DpVendorEntry {
  id: string;
  name: string;
  /** Real, per direct guidance's own established pattern
   *  (services/cytology/'s own vendor-agnostic "PathScribe owns the
   *  canonical schema, the real product name is just a label" design)
   *  — the real, specific AI product name, e.g. "Paige Prostate,"
   *  distinct from the underlying company. */
  productName: string;
  modality: DpVendorModality;
  /** Real, per this module's own earlier FDA-clearance research —
   *  whether this specific, real product carries a real FDA
   *  clearance. Never a claim this app can independently verify
   *  going forward (clearance status changes over time) — an honest,
   *  point-in-time admin-entered fact, not a live regulatory feed. */
  fdaCleared: boolean;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export type NewDpVendorEntry = Omit<DpVendorEntry, 'id' | 'isSystem' | 'sortOrder'>;

export interface IDpVendorService {
  getAll(): Promise<ServiceResult<DpVendorEntry[]>>;
  getActive(): Promise<ServiceResult<DpVendorEntry[]>>;
  getByModality(modality: DpVendorModality): Promise<ServiceResult<DpVendorEntry[]>>;
  getById(id: ID): Promise<ServiceResult<DpVendorEntry>>;
  add(entry: NewDpVendorEntry): Promise<ServiceResult<DpVendorEntry>>;
  update(id: ID, changes: Partial<DpVendorEntry>): Promise<ServiceResult<DpVendorEntry>>;
  deactivate(id: ID): Promise<ServiceResult<DpVendorEntry>>;
  reactivate(id: ID): Promise<ServiceResult<DpVendorEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
