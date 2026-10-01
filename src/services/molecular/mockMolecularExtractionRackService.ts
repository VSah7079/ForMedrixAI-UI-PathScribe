// src/services/molecular/mockMolecularExtractionRackService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Implement the load into extraction
// rack workflow step (§5.1's secondary_rack stage)."
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import { generateExtractionRackBarcode } from './resolveMolecularBarcodes';
import type {
  IMolecularExtractionRackService, MolecularExtractionRack, NewMolecularExtractionRack, MolecularRackPosition,
} from './IMolecularExtractionRackService';
import type { MolecularMovementRecord } from './IMolecularBatchService';

const STORE_KEY = 'molecular_extraction_racks';
const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (message: string) => ({ ok: false as const, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

function emptyPositions(capacity: number): MolecularRackPosition[] {
  return Array.from({ length: capacity }, (_, i) => ({ positionLabel: String(i + 1) }));
}

// Real, seeded rack — one real specimen already loaded at position 1,
// so the "already racked" lookup path (findPositionByContainerBarcode)
// has a real, non-empty case to demonstrate against out of the box.
const SEED: MolecularExtractionRack[] = [
  {
    id: 'rack-001',
    rackBarcode: 'RACK-MOLE-00001',
    rackUuid: 'a3f5c8e1-2b4d-4f6a-9c1e-7d8b3a2f5e6c',
    capacity: 24,
    positions: [
      { positionLabel: '1', specimenUuid: 'a1b2c3d4-e5f6-7890-1234-56789abcdef0', accessionNumber: 'PS26-100452', containerBarcode: 'SPEC-20260906-8831' },
      ...emptyPositions(24).slice(1),
    ],
    createdAt: '2026-09-06T15:00:00.000Z',
    createdByUserId: 'seed-user',
    createdByUserName: 'Demo Lab Tech',
  },
];

const load = (): MolecularExtractionRack[] => storageGet(STORE_KEY, SEED);
const persist = (data: MolecularExtractionRack[]) => storageSet(STORE_KEY, data);

export const mockMolecularExtractionRackService: IMolecularExtractionRackService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getById(id) {
    await delay();
    const found = load().find(r => r.id === id);
    if (!found) return err(`No extraction rack found with id "${id}".`);
    return ok(found);
  },

  async create(rack: NewMolecularExtractionRack) {
    await delay();
    const all = load();
    const sequence = all.length + 1;
    const created: MolecularExtractionRack = {
      ...rack,
      id: 'rack-' + Date.now(),
      rackBarcode: generateExtractionRackBarcode(sequence),
      rackUuid: crypto.randomUUID(),
      positions: emptyPositions(rack.capacity),
      createdAt: new Date().toISOString(),
    };
    persist([...all, created]);
    return ok(created);
  },

  async loadSpecimenIntoPosition(rackId, positionLabel, specimen, movement: MolecularMovementRecord) {
    await delay();
    const all = load();
    const rackIdx = all.findIndex(r => r.id === rackId);
    if (rackIdx === -1) return err(`No extraction rack found with id "${rackId}".`);

    const rack = all[rackIdx];
    const posIdx = rack.positions.findIndex(p => p.positionLabel === positionLabel);
    if (posIdx === -1) return err(`Rack "${rack.rackBarcode}" has no position "${positionLabel}".`);

    const existing = rack.positions[posIdx];
    if (existing.containerBarcode) {
      return err(`Position "${positionLabel}" on rack "${rack.rackBarcode}" is already occupied by ${existing.containerBarcode} — a real rack position holds exactly one tube at a time.`);
    }

    const updatedPositions = [...rack.positions];
    updatedPositions[posIdx] = {
      ...existing, ...specimen,
      movementHistory: [...(existing.movementHistory ?? []), movement],
    };
    const updatedRack: MolecularExtractionRack = { ...rack, positions: updatedPositions };
    const next = [...all];
    next[rackIdx] = updatedRack;
    persist(next);
    return ok(updatedRack);
  },

  async findPositionByContainerBarcode(containerBarcode) {
    await delay();
    for (const rack of load()) {
      const position = rack.positions.find(p => p.containerBarcode === containerBarcode);
      if (position) return ok({ rack, position });
    }
    return ok(null);
  },
};
