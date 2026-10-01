import { IDelegationTypeService, DelegationType } from './IDelegationTypeService';
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ─── Seed data ────────────────────────────────────────────────────────────────
// Mirrors DEFAULT_DELEGATION_TYPES from constants/delegationTypes.ts.
// The mock owns its own copy so it is not coupled to localStorage.

const SEED: DelegationType[] = [
  {
    id: 'REASSIGN', label: 'Case Reassignment',
    description: 'Full transfer of case ownership — you are no longer responsible',
    transfersOwnership: true,  requiresNote: false, multiAssign: false,
    color: '#0891B2', active: true, isSystem: true, sortOrder: 1,
  },
  {
    id: 'POOL', label: 'Move to Pool',
    description: 'Transfer to a workgroup queue for any available pathologist to accept',
    transfersOwnership: true,  requiresNote: false, multiAssign: false,
    color: '#6366f1', active: true, isSystem: true, sortOrder: 2,
  },
  {
    id: 'SECOND_OPINION', label: 'Second Opinion',
    description: 'Formal consultation — you retain ownership and sign-out responsibility',
    transfersOwnership: false, requiresNote: true,  multiAssign: false,
    color: '#f59e0b', active: true, isSystem: true, sortOrder: 3, cptHint: '88321–88325',
  },
  {
    id: 'CASUAL_REVIEW', label: 'Informal Review',
    description: 'Informal peer review — no formal obligation for the reviewer',
    transfersOwnership: false, requiresNote: false, multiAssign: false,
    color: '#10b981', active: false, isSystem: true, sortOrder: 4,
  },
  {
    id: 'TUMOR_BOARD', label: 'Tumor Board',
    description: 'Submitted for multidisciplinary team discussion — not a sign-out',
    transfersOwnership: false, requiresNote: false, multiAssign: false,
    color: '#8b5cf6', active: true, isSystem: true, sortOrder: 5,
  },
  {
    id: 'TEACHING', label: 'Teaching Case',
    description: 'Assigned to resident or fellow for educational review',
    transfersOwnership: false, requiresNote: false, multiAssign: true,
    color: '#64748b', active: true, isSystem: true, sortOrder: 6,
  },
  {
    id: 'CONSULT_EXT', label: 'External Consultation',
    description: 'Sent to an outside institution or specialist',
    transfersOwnership: false, requiresNote: true,  multiAssign: false,
    color: '#ef4444', active: true, isSystem: true, sortOrder: 7, cptHint: '88321–88325',
  },
];

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORE_KEY = 'pathscribe_delegation_types_v2';

const load    = ()                    => storageGet<DelegationType[]>(STORE_KEY, SEED);
const persist = (data: DelegationType[]) => storageSet(STORE_KEY, data);

let _cache: DelegationType[] = load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok  = <T>(data: T): ServiceResult<T>   => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });
const delay = () => new Promise(r => setTimeout(r, 80));

const sorted = (list: DelegationType[]) =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder);

// ─── Service ──────────────────────────────────────────────────────────────────

export const mockDelegationTypeService: IDelegationTypeService = {

  async getAll() {
    await delay();
    return ok(sorted(_cache).map(dt => ({ ...dt })));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache).filter(dt => dt.active).map(dt => ({ ...dt })));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(dt => dt.id === id);
    return found ? ok({ ...found }) : err(`DelegationType ${id} not found`);
  },

  async add(dt) {
    await delay();
    const maxOrder = _cache.reduce((m, d) => Math.max(m, d.sortOrder), 0);
    // Real fix: use the caller's real, validated id when given —
    // it's what the admin actually saw and could edit on screen — not
    // a random timestamp that silently discarded it. Falls back to a
    // timestamp only for a caller that genuinely doesn't provide one.
    const { id: providedId, ...rest } = dt;
    const created: DelegationType = {
      ...rest,
      id:       providedId || 'CUSTOM_' + Date.now(),
      isSystem: false,
      sortOrder: maxOrder + 1,
    };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id, changes) {
    await delay();
    const idx = _cache.findIndex(dt => dt.id === id);
    if (idx === -1) return err(`DelegationType ${id} not found`);
    // Guard: isSystem cannot be changed via update
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(dt => dt.id === id ? { ...dt, ...safeChanges } : dt);
    persist(_cache);
    return ok({ ..._cache.find(dt => dt.id === id)! });
  },

  async deactivate(id: ID) {
    return mockDelegationTypeService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockDelegationTypeService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(dt => dt.id === id);
    if (!target)          return err(`DelegationType ${id} not found`);
    if (target.isSystem)  return err(`Cannot delete system type "${id}"`);
    _cache = _cache.filter(dt => dt.id !== id);
    persist(_cache);
    return ok(undefined);
  },

};
