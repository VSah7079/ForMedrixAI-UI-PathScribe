// src/services/grossingHardware/grossingHardwareRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 359: the rules for the Grossing Hardware settings screen (the
// profile service existed; its screen was never built). Pure.
//   - Which bridges fit each kind: a camera can use the browser itself
//     (getUserMedia) or the PathScribe Agent; a scale needs the Agent or
//     falls back to manual entry. 'browser_native' is never valid for a
//     scale (this folder's README).
//   - Draft validation, with translation-key errors
//     (grossingHardwareSection.errors.<key>).
//   - The facility filter: a profile shows under the lab of its station.
// ─────────────────────────────────────────────────────────────────────────────
import { isHttpsUrl } from '@/utils/serviceEndpoint';
import type { Equipment } from '../equipment/IEquipmentService';
import { checkEquipmentLink } from '../equipment/equipmentRules';
import type { GrossingHardwareBridgeType, GrossingHardwareKind, GrossingHardwareProfile } from './IGrossingHardwareProfileService';

export const GROSSING_HARDWARE_KINDS: readonly GrossingHardwareKind[] = ['camera', 'scale'];

export const GROSSING_BRIDGES_BY_KIND: Record<GrossingHardwareKind, readonly GrossingHardwareBridgeType[]> = {
  camera: ['browser_native', 'pathscribe_agent'],
  scale: ['pathscribe_agent', 'manual_entry_only'],
};

export type GrossingHardwareDraft = Pick<GrossingHardwareProfile, 'kind' | 'label' | 'bridgeType' | 'stationId' | 'agentBaseUrl' | 'equipmentId' | 'isActive'>;

export type GrossingHardwareErrorKey =
  | 'labelRequired' | 'bridgeNotForKind' | 'agentUrlRequired' | 'agentUrlNotHttps' | 'equipmentNotFound' | 'equipmentWrongKind';

export type GrossingHardwareErrors = Partial<Record<'label' | 'bridgeType' | 'agentBaseUrl' | 'equipmentId', GrossingHardwareErrorKey>>;

export function validateGrossingHardwareDraft(draft: GrossingHardwareDraft, equipment: readonly Equipment[]): GrossingHardwareErrors {
  const errors: GrossingHardwareErrors = {};
  if (!draft.label.trim()) errors.label = 'labelRequired';
  if (!GROSSING_BRIDGES_BY_KIND[draft.kind].includes(draft.bridgeType)) errors.bridgeType = 'bridgeNotForKind';
  if (draft.bridgeType === 'pathscribe_agent') {
    const url = draft.agentBaseUrl?.trim() ?? '';
    if (!url) errors.agentBaseUrl = 'agentUrlRequired';
    else if (!isHttpsUrl(url)) errors.agentBaseUrl = 'agentUrlNotHttps';
  }
  const link = checkEquipmentLink(draft.equipmentId || undefined, equipment, draft.kind);
  if (link === 'notFound') errors.equipmentId = 'equipmentNotFound';
  if (link === 'wrongKind') errors.equipmentId = 'equipmentWrongKind';
  return errors;
}

/** What gets saved: the agent address only for an Agent bridge; empty links cleared. */
export function grossingHardwareDraftForSave(draft: GrossingHardwareDraft): GrossingHardwareDraft {
  return {
    ...draft,
    label: draft.label.trim(),
    agentBaseUrl: draft.bridgeType === 'pathscribe_agent' ? draft.agentBaseUrl?.trim() : undefined,
    stationId: draft.stationId || undefined,
    equipmentId: draft.equipmentId || undefined,
  };
}

/** Switching kind: keep the bridge if it fits, else the kind's first. */
export function bridgeForKind(kind: GrossingHardwareKind, current: GrossingHardwareBridgeType): GrossingHardwareBridgeType {
  return GROSSING_BRIDGES_BY_KIND[kind].includes(current) ? current : GROSSING_BRIDGES_BY_KIND[kind][0];
}

/** The facility filter: profiles at a station in this lab, plus profiles with no station (they apply anywhere). */
export function grossingProfilesForFacility<P extends { stationId?: string }>(
  profiles: readonly P[], stations: ReadonlyArray<{ id: string; facilityId: string }>, facilityId?: string,
): P[] {
  if (!facilityId) return [...profiles];
  const labOf = new Map(stations.map(s => [s.id, s.facilityId]));
  return profiles.filter(p => !p.stationId || labOf.get(p.stationId) === facilityId);
}
