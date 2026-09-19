// src/services/reagentLots/mockReagentLotService.ts
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ReagentLot, IReagentLotService } from './IReagentLotService';

const STORAGE_KEY = 'reagent_lots';

// Real, per this app's own established version-gated re-seed
// convention (see mockContainerTypeService.ts's own header, and the
// real, longstanding gap fixed retroactively in
// mockDeficiencyTypeService.ts) — built in from day one here, since
// that gap only ever surfaces once a later session needs to change
// the seed and finds nothing gates it.
const REAGENT_LOT_VERSION = '1';
const VERSION_KEY = 'pathscribe_mock_reagent_lots_version';
if (typeof localStorage !== 'undefined') {
  try {
    if (localStorage.getItem(VERSION_KEY) !== REAGENT_LOT_VERSION) {
      localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, REAGENT_LOT_VERSION);
    }
  } catch { /* SSR / sandboxed env — ignore */ }
}

// Real, seeded against real, existing StainType ids (services/stains/
// mockStainTypeService.ts) for IHC/Special Stain, plus the real,
// closed RoutineStainComponentType set for H&E line reagents that
// have no orderable StainType of their own — see this module's own
// IReagentLotService.ts header for the full reasoning on the split.
const SEED_REAGENT_LOTS: ReagentLot[] = [
  // ── IHC antibody lots ──────────────────────────────────────────────
  { id: 'lot-ki67-2601', stainTypeId: 'st-ki67', lotNumber: 'KI67-24601A', expirationDate: '2027-03-31', vendor: 'Ventana', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-08-01', createdAt: '2026-08-01T09:00:00.000Z', createdBy: 'system' },
  { id: 'lot-er-2588', stainTypeId: 'st-er', lotNumber: 'ER-SP1-25880', expirationDate: '2027-01-15', vendor: 'Ventana', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-07-10', createdAt: '2026-07-10T09:00:00.000Z', createdBy: 'system' },
  { id: 'lot-pr-2599', stainTypeId: 'st-pr', lotNumber: 'PR-1E2-25990', expirationDate: '2026-12-01', vendor: 'Ventana', qcStatus: 'Pending', status: 'Active', receivedDate: '2026-09-05', createdAt: '2026-09-05T09:00:00.000Z', createdBy: 'system' },
  { id: 'lot-her2-2540', stainTypeId: 'st-her2', lotNumber: 'HER2-4B5-25400', expirationDate: '2026-10-01', vendor: 'Ventana', qcStatus: 'Failed', status: 'Inactive', receivedDate: '2026-05-01', createdAt: '2026-05-01T09:00:00.000Z', createdBy: 'system' },

  // ── Special stain kit lots ───────────────────────────────────────────
  { id: 'lot-pas-1102', stainTypeId: 'st-pas', lotNumber: 'PAS-KIT-1102', expirationDate: '2027-02-28', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-08-15', createdAt: '2026-08-15T09:00:00.000Z', createdBy: 'system' },
  { id: 'lot-gms-0977', stainTypeId: 'st-gms', lotNumber: 'GMS-KIT-0977', expirationDate: '2027-04-30', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-08-20', createdAt: '2026-08-20T09:00:00.000Z', createdBy: 'system' },

  // ── Routine H&E line reagents — no StainType of their own ────────────
  { id: 'lot-he-hematoxylin-0326', routineComponentType: 'HEMATOXYLIN', lotNumber: 'HTX-0326', expirationDate: '2027-01-31', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-08-01', createdAt: '2026-08-01T09:00:00.000Z', createdBy: 'system' },
  { id: 'lot-he-eosin-0412', routineComponentType: 'EOSIN', lotNumber: 'EOS-0412', expirationDate: '2027-01-31', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-08-01', createdAt: '2026-08-01T09:00:00.000Z', createdBy: 'system' },
  { id: 'lot-he-bluing-0215', routineComponentType: 'BLUING_REAGENT', lotNumber: 'BLU-0215', expirationDate: '2026-12-31', qcStatus: 'Passed', status: 'Active', receivedDate: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z', createdBy: 'system' },
];

const load    = (): ReagentLot[] => storageGet<ReagentLot[]>(STORAGE_KEY, SEED_REAGENT_LOTS);
const persist = (data: ReagentLot[]) => storageSet(STORAGE_KEY, data);

export const mockReagentLotService: IReagentLotService = {
  async getAll(): Promise<ServiceResult<ReagentLot[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<ReagentLot>> {
    const found = load().find(l => l.id === id);
    if (!found) return { ok: false, error: `Reagent lot ${id} not found` };
    return { ok: true, data: found };
  },

  async create(draft: Omit<ReagentLot, 'id' | 'createdAt'>): Promise<ServiceResult<ReagentLot>> {
    // Real, per this file's own IReagentLotService.ts header — a lot
    // is for exactly one of a catalog StainType or a routine line
    // component, never both, never neither.
    const hasStainType = !!draft.stainTypeId;
    const hasComponent = !!draft.routineComponentType;
    if (hasStainType === hasComponent) {
      return { ok: false, error: 'A reagent lot must reference exactly one of stainTypeId or routineComponentType, not both or neither.' };
    }
    const data = load();
    const newLot: ReagentLot = { ...draft, id: 'lot-' + Date.now(), createdAt: new Date().toISOString() };
    data.push(newLot);
    persist(data);
    return { ok: true, data: newLot };
  },

  async update(id: ID, changes: Partial<Omit<ReagentLot, 'id' | 'createdAt' | 'createdBy'>>): Promise<ServiceResult<ReagentLot>> {
    const data = load();
    const idx = data.findIndex(l => l.id === id);
    if (idx === -1) return { ok: false, error: `Reagent lot ${id} not found` };
    const updated = { ...data[idx], ...changes };
    const hasStainType = !!updated.stainTypeId;
    const hasComponent = !!updated.routineComponentType;
    if (hasStainType === hasComponent) {
      return { ok: false, error: 'A reagent lot must reference exactly one of stainTypeId or routineComponentType, not both or neither.' };
    }
    data[idx] = updated;
    persist(data);
    return { ok: true, data: updated };
  },

  async deactivate(id: ID): Promise<ServiceResult<ReagentLot>> {
    return mockReagentLotService.update(id, { status: 'Inactive' });
  },

  async reactivate(id: ID): Promise<ServiceResult<ReagentLot>> {
    return mockReagentLotService.update(id, { status: 'Active' });
  },
};
