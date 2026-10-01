// src/services/stains/IMolecularTargetService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "a searchable master probe dictionary" -
// the real, curated, reusable target catalog a StainType's own
// defaultTargets (and an order's own selectedTargets) are built from,
// not a plain typed-in string. Same real "small, curated dictionary,
// admin-editable" posture as every other dictionary in this app
// (StainType, DeficiencyType, DelegationType, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { MolecularTarget } from '@/types/billing/MolecularBillingRule';

export interface IMolecularTargetService {
  getAll(): Promise<ServiceResult<MolecularTarget[]>>;
  add(entry: Omit<MolecularTarget, 'id'>): Promise<ServiceResult<MolecularTarget>>;
  update(id: ID, changes: Partial<Omit<MolecularTarget, 'id'>>): Promise<ServiceResult<MolecularTarget>>;
}
