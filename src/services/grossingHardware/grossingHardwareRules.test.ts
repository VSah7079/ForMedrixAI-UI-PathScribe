// Batch 359: the Grossing Hardware screen's rules.
import { describe, expect, it } from 'vitest';
import {
  bridgeForKind, grossingHardwareDraftForSave, grossingProfilesForFacility, validateGrossingHardwareDraft, type GrossingHardwareDraft,
} from './grossingHardwareRules';
import type { Equipment } from '../equipment/IEquipmentService';

const reg: Equipment[] = [
  { id: 'cam', code: 'CAM', name: 'Cam', kind: 'camera', facilityId: 'lab', status: 'Active' },
  { id: 'scale', code: 'SC', name: 'Scale', kind: 'scale', facilityId: 'lab', status: 'Active' },
];
const draft = (over: Partial<GrossingHardwareDraft> = {}): GrossingHardwareDraft =>
  ({ kind: 'camera', label: 'Bench cam', bridgeType: 'browser_native', isActive: true, ...over });

describe('validateGrossingHardwareDraft', () => {
  it('a valid camera, and the label is required', () => {
    expect(validateGrossingHardwareDraft(draft(), reg)).toEqual({});
    expect(validateGrossingHardwareDraft(draft({ label: ' ' }), reg).label).toBe('labelRequired');
  });
  it('a scale can never use the browser; the Agent needs an https:// address', () => {
    expect(validateGrossingHardwareDraft(draft({ kind: 'scale', bridgeType: 'browser_native' }), reg).bridgeType).toBe('bridgeNotForKind');
    expect(validateGrossingHardwareDraft(draft({ kind: 'scale', bridgeType: 'pathscribe_agent' }), reg).agentBaseUrl).toBe('agentUrlRequired');
    expect(validateGrossingHardwareDraft(draft({ kind: 'scale', bridgeType: 'pathscribe_agent', agentBaseUrl: 'http://127.0.0.1:9100' }), reg).agentBaseUrl).toBe('agentUrlNotHttps');
    expect(validateGrossingHardwareDraft(draft({ kind: 'scale', bridgeType: 'pathscribe_agent', agentBaseUrl: 'https://127.0.0.1:9100' }), reg)).toEqual({});
  });
  it('the register device must be the same kind', () => {
    expect(validateGrossingHardwareDraft(draft({ equipmentId: 'scale' }), reg).equipmentId).toBe('equipmentWrongKind');
    expect(validateGrossingHardwareDraft(draft({ equipmentId: 'gone' }), reg).equipmentId).toBe('equipmentNotFound');
    expect(validateGrossingHardwareDraft(draft({ equipmentId: 'cam' }), reg)).toEqual({});
  });
});

describe('grossing hardware helpers', () => {
  it('draftForSave keeps the Agent address only for the Agent and clears empty links', () => {
    expect(grossingHardwareDraftForSave(draft({ agentBaseUrl: 'https://x', stationId: '', equipmentId: '' }))).toMatchObject({ agentBaseUrl: undefined, stationId: undefined, equipmentId: undefined });
    expect(grossingHardwareDraftForSave(draft({ bridgeType: 'pathscribe_agent', agentBaseUrl: ' https://x ' })).agentBaseUrl).toBe('https://x');
  });
  it('bridgeForKind keeps a bridge that fits, else the kind\'s first', () => {
    expect(bridgeForKind('scale', 'browser_native')).toBe('pathscribe_agent');
    expect(bridgeForKind('scale', 'manual_entry_only')).toBe('manual_entry_only');
  });
  it('facility filter: profiles at that lab\'s stations, plus profiles with no station', () => {
    const stations = [{ id: 's1', facilityId: 'lab-a' }, { id: 's2', facilityId: 'lab-b' }];
    const profiles = [{ id: '1', stationId: 's1' }, { id: '2', stationId: 's2' }, { id: '3' }];
    expect(grossingProfilesForFacility(profiles, stations, 'lab-a').map(p => p.id)).toEqual(['1', '3']);
    expect(grossingProfilesForFacility(profiles, stations).map(p => p.id)).toEqual(['1', '2', '3']);
  });
});
