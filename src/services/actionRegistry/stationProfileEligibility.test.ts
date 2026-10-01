// src/services/actionRegistry/stationProfileEligibility.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockActionRegistryService } from './mockActionRegistryService';

// Real, per PS-289's own comment thread — a real, existing action,
// temporarily given a real stationProfiles value for this test, then
// restored — LIVE_ACTIONS is a real, shared, module-level array, so
// mutating it without restoring would leak into any other test file
// sharing this same module instance.
const TEST_ACTION_ID = 'PRINT_CURRENT_CASSETTE';

afterEach(async () => {
  await mockActionRegistryService.updateAction(TEST_ACTION_ID as any, { stationProfiles: undefined });
  mockActionRegistryService.setCurrentStationProfile(undefined);
  mockActionRegistryService.setCurrentActionGroupActionIds(undefined);
});

describe('mockActionRegistryService \u2014 real station-profile eligibility, per PS-289', () => {
  it('an action tagged with a real functionalArea is NOT eligible when no station profile is set', async () => {
    await mockActionRegistryService.updateAction(TEST_ACTION_ID as any, { stationProfiles: ['Grossing'] });
    mockActionRegistryService.setCurrentStationProfile(undefined);
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(false);
  });

  it('an action tagged with the real, current station\u2019s own functionalArea IS eligible', async () => {
    await mockActionRegistryService.updateAction(TEST_ACTION_ID as any, { stationProfiles: ['Grossing'] });
    mockActionRegistryService.setCurrentStationProfile('Grossing');
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(true);
  });

  it('an action tagged with a DIFFERENT real functionalArea is honestly NOT eligible, even with a station profile set', async () => {
    await mockActionRegistryService.updateAction(TEST_ACTION_ID as any, { stationProfiles: ['Embedding'] });
    mockActionRegistryService.setCurrentStationProfile('Grossing');
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(false);
  });

  it('station-profile eligibility is a real, additional OR branch \u2014 an action already eligible via app context stays eligible regardless of station profile', () => {
    const eligibleBefore = mockActionRegistryService.getEligibleActions();
    mockActionRegistryService.setCurrentStationProfile('Grossing');
    const eligibleAfter = mockActionRegistryService.getEligibleActions();
    // Every action eligible before (via app context / global category)
    // must remain eligible — setting a station profile only ever adds
    // eligibility, never removes it from an action that didn't ask
    // to be scoped by stationProfiles at all.
    const idsBefore = new Set(eligibleBefore.map(a => a.id));
    const idsAfter = new Set(eligibleAfter.map(a => a.id));
    expect([...idsBefore].every(id => idsAfter.has(id))).toBe(true);
  });
});

describe('mockActionRegistryService \u2014 real action-group eligibility (the "loading a specific action group" piece), per PS-289', () => {
  it('an action with NO stationProfiles at all is eligible once its own id is in the current action-group bundle', () => {
    mockActionRegistryService.setCurrentActionGroupActionIds([TEST_ACTION_ID]);
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(true);
  });

  it('an action NOT in the current bundle is honestly NOT made eligible by an unrelated bundle being active', () => {
    mockActionRegistryService.setCurrentActionGroupActionIds(['SOME_OTHER_ACTION_ID']);
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(false);
  });

  it('is a real, additional OR branch alongside stationProfiles \u2014 both can independently make the same action eligible', async () => {
    await mockActionRegistryService.updateAction(TEST_ACTION_ID as any, { stationProfiles: ['Grossing'] });
    mockActionRegistryService.setCurrentStationProfile(undefined);
    mockActionRegistryService.setCurrentActionGroupActionIds([TEST_ACTION_ID]);
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(true);
  });

  it('clearing the bundle with undefined removes that real source of eligibility', () => {
    mockActionRegistryService.setCurrentActionGroupActionIds([TEST_ACTION_ID]);
    mockActionRegistryService.setCurrentActionGroupActionIds(undefined);
    const eligible = mockActionRegistryService.getEligibleActions();
    expect(eligible.some(a => a.id === TEST_ACTION_ID)).toBe(false);
  });
});
