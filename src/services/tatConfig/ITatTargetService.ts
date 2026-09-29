// src/services/tatConfig/ITatTargetService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: the turnaround (TAT) targets, owned by a service. Before this,
// the TAT settings screen kept them in browser storage, and Search, the
// quality dashboards and the facility reference check each read that
// storage themselves. The API server implements this contract; see
// docs/architecture/TAT_AND_DELEGATION_API.md.
//
// Add and update are separate calls: the caller says which (a duplicated
// entry is an add, even though it starts from an existing one).
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';
import type { TATEntry } from '@/types/quality/TatConfigEntry';

export type TatTargetError =
  /** No entry has this id. */
  | 'notFound'
  /** add() was given an id that already exists. */
  | 'duplicateId'
  /** A built-in ("sys-") target cannot be deleted; switch it off instead. */
  | 'systemDefault';

export interface ITatTargetService {
  /** Every target, active or not, system defaults included. */
  getAll(): Promise<ServiceResult<TATEntry[]>>;
  add(entry: TATEntry): Promise<ServiceResult<TATEntry>>;
  update(entry: TATEntry): Promise<ServiceResult<TATEntry>>;
  /** Refuses a system default ('systemDefault'). */
  remove(id: string): Promise<ServiceResult<void>>;
}
