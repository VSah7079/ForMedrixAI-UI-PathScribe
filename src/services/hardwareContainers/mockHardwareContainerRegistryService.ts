// src/services/hardwareContainers/mockHardwareContainerRegistryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working implementation of IHardwareContainerRegistryService.ts —
// see that file's own header for the full reasoning. Same real,
// established persistence pattern as every other mock service
// (storageGet/storageSet), same real, single audit choke point
// (mockAuditService) every other real chain-of-custody event in this
// app already funnels through.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { mockAuditService } from '../auditlog/mockAuditService';
import type {
  IHardwareContainerRegistryService, HardwareContainer, ContainerType,
} from './IHardwareContainerRegistryService';

const STORAGE_KEY = 'hardware_containers';

// Real, small seed set — a real lab doesn't start with zero registered
// hardware; a few real, already-engraved racks matching the spec's own
// worked example (RACK-STAIN-04) so the Mode B flow has something real
// to scan/select from a fresh install, not an empty registry only an
// admin screen (not yet built) could ever populate.
const SEED_CONTAINERS: HardwareContainer[] = [
  { id: 'hwc-seed-1', rackId: 'RACK-STAIN-04', containerType: 'Staining Rack', status: 'Available', createdAt: new Date(Date.now() - 30 * 86400_000).toISOString() },
  { id: 'hwc-seed-2', rackId: 'RACK-STAIN-05', containerType: 'Staining Rack', status: 'Available', createdAt: new Date(Date.now() - 30 * 86400_000).toISOString() },
  { id: 'hwc-seed-3', rackId: 'RACK-PROC-01', containerType: 'Tissue Processor Basket', status: 'Available', createdAt: new Date(Date.now() - 30 * 86400_000).toISOString() },
  { id: 'hwc-seed-4', rackId: 'RACK-TRAY-02', containerType: 'Archive Storage Tray', status: 'Available', createdAt: new Date(Date.now() - 30 * 86400_000).toISOString() },
];

function loadContainers(): HardwareContainer[] {
  return storageGet<HardwareContainer[]>(STORAGE_KEY, SEED_CONTAINERS);
}
function saveContainers(containers: HardwareContainer[]): void {
  storageSet(STORAGE_KEY, containers);
}

let counter = 0;
function genId(): ID {
  counter += 1;
  return `hwc-${Date.now()}-${counter}`;
}

export const mockHardwareContainerRegistryService: IHardwareContainerRegistryService = {
  async getAll(): Promise<ServiceResult<HardwareContainer[]>> {
    return { ok: true, data: loadContainers() };
  },

  async getById(id: ID): Promise<ServiceResult<HardwareContainer>> {
    const container = loadContainers().find(c => c.id === id);
    if (!container) return { ok: false, error: `No hardware container found with id "${id}".` };
    return { ok: true, data: container };
  },

  async getByRackId(rackId: string): Promise<ServiceResult<HardwareContainer>> {
    const normalized = rackId.trim().toUpperCase();
    const container = loadContainers().find(c => c.rackId.toUpperCase() === normalized);
    if (!container) return { ok: false, error: `No registered hardware container for rack ID "${rackId}".` };
    return { ok: true, data: container };
  },

  async create(draft: { rackId: string; containerType: ContainerType; facilityId?: string }): Promise<ServiceResult<HardwareContainer>> {
    const containers = loadContainers();
    const normalized = draft.rackId.trim().toUpperCase();
    if (containers.some(c => c.rackId.toUpperCase() === normalized)) {
      return { ok: false, error: `A hardware container with rack ID "${draft.rackId}" is already registered.` };
    }
    const container: HardwareContainer = {
      id: genId(), rackId: draft.rackId.trim(), containerType: draft.containerType,
      status: 'Available', facilityId: draft.facilityId, createdAt: new Date().toISOString(),
    };
    containers.push(container);
    saveContainers(containers);
    return { ok: true, data: container };
  },

  async checkOut(rackId: string, batchId: ID): Promise<ServiceResult<HardwareContainer>> {
    const containers = loadContainers();
    const normalized = rackId.trim().toUpperCase();
    const container = containers.find(c => c.rackId.toUpperCase() === normalized);
    if (!container) return { ok: false, error: `No registered hardware container for rack ID "${rackId}".` };
    // Real, honest conflict check — the spec's own "preventing
    // duplicate batch conflicts on subsequent runs." A rack already
    // checked out to a DIFFERENT batch is a genuine conflict; checking
    // it out again to the SAME batch (e.g. a page refresh re-running
    // the same real flow) is a harmless, idempotent no-op.
    if (container.status === 'InUse' && container.currentBatchId !== batchId) {
      return { ok: false, error: `Rack "${rackId}" is already checked out to another active batch. Release it there first, or choose a different rack.` };
    }
    const updated: HardwareContainer = { ...container, status: 'InUse', currentBatchId: batchId, updatedAt: new Date().toISOString() };
    saveContainers(containers.map(c => c.id === container.id ? updated : c));
    mockAuditService.logEvent({
      type: 'system', event: 'Hardware Container Checked Out',
      detail: `Rack ${container.rackId} (${container.containerType}) checked out to batch.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updated };
  },

  async checkIn(rackId: string): Promise<ServiceResult<HardwareContainer>> {
    const containers = loadContainers();
    const normalized = rackId.trim().toUpperCase();
    const container = containers.find(c => c.rackId.toUpperCase() === normalized);
    if (!container) return { ok: false, error: `No registered hardware container for rack ID "${rackId}".` };
    if (container.status === 'Available') return { ok: true, data: container }; // real, honest idempotent no-op
    const updated: HardwareContainer = { ...container, status: 'Available', currentBatchId: undefined, updatedAt: new Date().toISOString() };
    saveContainers(containers.map(c => c.id === container.id ? updated : c));
    mockAuditService.logEvent({
      type: 'system', event: 'Hardware Container Released',
      detail: `Rack ${container.rackId} (${container.containerType}) released — returned to Available.`,
      user: 'System', caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: true, data: updated };
  },
};
