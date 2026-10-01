// src/services/grossingHardware/mockGrossingHardwareProfileService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, standard mock service implementation — same real
// storageGet/storageSet-backed pattern as mockPrinterProfileService.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { isHttpsUrl } from '@/utils/serviceEndpoint';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IGrossingHardwareProfileService, GrossingHardwareProfile } from './IGrossingHardwareProfileService';
import { mockEquipmentService } from '../equipment/mockEquipmentService';
import { checkEquipmentLink } from '../equipment/equipmentRules';
import { EQUIPMENT_LINK_INVALID } from '../equipment/IEquipmentService';

const genId = () => `grossing-hw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const load = () => storageGet<GrossingHardwareProfile[]>('pathscribe_grossing_hardware_profiles', [
  // Real, honest default: 'browser_native' (getUserMedia) — the one
  // real, no-install-required path this app can actually offer out
  // of the box for a camera, per this module's own header.
  {
    id: 'grossing-hw-camera-default',
    kind: 'camera',
    label: 'Grossing Station Camera (Browser)',
    bridgeType: 'browser_native',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Real, honest default: no real digital scale bridge exists yet —
  // seeded as manual_entry_only, the real, already-working fallback,
  // per this module's own header (never a fabricated 'connected'
  // default for hardware that isn't actually reachable).
  {
    id: 'grossing-hw-scale-default',
    kind: 'scale',
    label: 'Grossing Station Scale (Manual Entry)',
    bridgeType: 'manual_entry_only',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]);
// Batch 327 (HTTPS): the local agent's address must be https://. An empty
// value is allowed (manual entry needs none).
const AGENT_URL_NOT_HTTPS = 'The PathScribe Agent address must start with https://';
const agentUrlAllowed = (url: string | undefined) => !url?.trim() || isHttpsUrl(url.trim());

const save = (profiles: GrossingHardwareProfile[]) => storageSet('pathscribe_grossing_hardware_profiles', profiles);

/** Batch 359: an equipmentId must be a register device of the profile's kind. */
async function equipmentLinkOk(equipmentId: string | undefined, kind: GrossingHardwareProfile['kind']): Promise<boolean> {
  if (!equipmentId) return true;
  const res = await mockEquipmentService.getAll();
  return checkEquipmentLink(equipmentId, res.ok ? res.data : [], kind) === null;
}

export const mockGrossingHardwareProfileService: IGrossingHardwareProfileService = {
  async getAll(): Promise<ServiceResult<GrossingHardwareProfile[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<GrossingHardwareProfile | null>> {
    return { ok: true, data: load().find(p => p.id === id) ?? null };
  },

  async create(profile): Promise<ServiceResult<GrossingHardwareProfile>> {
    if (!agentUrlAllowed(profile.agentBaseUrl)) return { ok: false, error: AGENT_URL_NOT_HTTPS };
    if (!(await equipmentLinkOk(profile.equipmentId, profile.kind))) return { ok: false, error: EQUIPMENT_LINK_INVALID };
    const now = new Date().toISOString();
    const created: GrossingHardwareProfile = { ...profile, id: genId(), createdAt: now, updatedAt: now };
    const all = load();
    save([...all, created]);
    return { ok: true, data: created };
  },

  async update(id: ID, changes): Promise<ServiceResult<GrossingHardwareProfile>> {
    const all = load();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return { ok: false, error: `Grossing hardware profile ${id} not found` };
    if (!agentUrlAllowed(changes.agentBaseUrl)) return { ok: false, error: AGENT_URL_NOT_HTTPS };
    if (!(await equipmentLinkOk(changes.equipmentId ?? all[idx].equipmentId, changes.kind ?? all[idx].kind))) return { ok: false, error: EQUIPMENT_LINK_INVALID };
    const updated: GrossingHardwareProfile = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    save(next);
    return { ok: true, data: updated };
  },
};
