import { describe, it, expect } from 'vitest';
import { CAPABILITY_CATALOG } from '../authorization/capabilityCatalog';
import { HUB_SCREENS, SCREEN_CAPABILITY, TILE_SCREENS, canOpenTile, createScreenAccessService, resolveWorklistView, visibleTiles, worklistViews, type HomeTileId } from './screenAccess';

const grant = (...keys: string[]) => (c: string) => keys.includes(c);

describe('screen access (Batch 374)', () => {
  it('every screen capability in the catalog belongs to exactly one screen', () => {
    const screens = CAPABILITY_CATALOG.filter(c => c.group === 'screens').map(c => c.key).sort();
    expect(Object.values(SCREEN_CAPABILITY).sort()).toEqual(screens);
  });
  it('Home shows only what the user may open; a hub shows when any screen inside it may be opened', () => {
    const order: HomeTileId[] = ['accession', 'worklist', 'configuration', 'pathologyWorkspace', 'qualityCompliance', 'search'];
    expect(visibleTiles(order, grant('screen:worklist:open', 'screen:microtomy:open'))).toEqual(['worklist', 'pathologyWorkspace']);
    expect(visibleTiles(order, grant())).toEqual([]);
    expect(canOpenTile('qualityCompliance', grant('screen:audit-log:open'))).toBe(true);
    expect(visibleTiles(HUB_SCREENS.pathologyWorkspace, grant('screen:microtomy:open', 'screen:embedding:open'))).toEqual(['microtomy', 'embedding']);
  });
  it('every screen is reached from exactly one Home tile (Batch 375)', () => {
    const reached = Object.values(TILE_SCREENS).flat().sort();
    expect(reached).toEqual(Object.keys(SCREEN_CAPABILITY).sort().filter(k => k !== 'addOnOrders'));
    expect(Object.keys(TILE_SCREENS)).not.toContain('batchManagement');
    expect(HUB_SCREENS.pathologyWorkspace).toContain('batchManagement');
  });
  it('the Worklist tile shows for its case list or either peer-review queue, and opens the right view (Batch 375)', () => {
    expect(canOpenTile('worklist', grant('screen:surgical-qa-worklist:open'))).toBe(true);
    expect(worklistViews(grant('screen:worklist:open', 'screen:cytology-qc-queue:open'))).toEqual(['cases', 'cytologyQc']);
    expect(resolveWorklistView('cytologyQc', ['cases', 'cytologyQc'])).toBe('cytologyQc');
    expect(resolveWorklistView('surgicalQa', ['cases', 'cytologyQc'])).toBe('cases');
    expect(resolveWorklistView(null, ['surgicalQa'])).toBe('surgicalQa');
    expect(resolveWorklistView('cases', [])).toBeNull();
  });
  it('the route check asks the authorization service for the screen\'s capability', async () => {
    const asked: string[] = [];
    const svc = createScreenAccessService({ authorization: { enforce: async (c: string) => { asked.push(c); return { capability: c, allowed: c === 'screen:embedding:open', grantedBy: [], missingRequirements: [], context: {} }; } } });
    expect(await svc.canOpen('configuration')).toBe(false);
    expect(await svc.canOpen('embedding')).toBe(true);
    expect(await svc.canOpen('pathologyWorkspace')).toBe(true);
    expect(await svc.canOpen('qualityCompliance')).toBe(false);
    expect(asked).toEqual(['screen:configuration:open', 'screen:embedding:open', 'screen:cytology-workspace:open', 'screen:microtomy:open', 'screen:embedding:open', 'screen:audit-log:open', 'screen:quality-assurance:open']);
    expect(await svc.canOpen('batchManagement')).toBe(false);
  });
});
