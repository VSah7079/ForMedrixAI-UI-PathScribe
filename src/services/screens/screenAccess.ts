// src/services/screens/screenAccess.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 374. Pete: "Home Page should only show tiles that the User has
// access to."
//
// Each screen reached from the Home page (or from one of its two hubs) has a
// capability, `screen:<name>:open`, granted by roles like any other
// (authorization/capabilityCatalog.ts, seeds in capabilitySeeds.ts):
//
//   • the Home page shows a tile only for a screen the user may open;
//   • a hub tile (Pathology Workspace, Quality & Compliance, and since Batch
//     375 the Worklist with its two peer-review queues) shows when the user
//     may open at least one screen inside it, and it shows only those;
//   • the route checks again (ScreenGate), so typing the address doesn't get
//     round it.
//
// Case pages (a report, grossing) aren't screens here: a case is reached
// from a screen, and case access has its own rules (auth/caseAccessControl).
// ─────────────────────────────────────────────────────────────────────────────

import type { CapabilityKey } from '../authorization/capabilityCatalog';
import type { IAuthorizationService } from '../authorization/authorizationService';

export type ScreenId =
  | 'accession' | 'worklist' | 'search' | 'addOnOrders' | 'intraopQueue' | 'cytologyQcQueue' | 'surgicalQaWorklist'
  | 'myContributions' | 'batchManagement' | 'configuration'
  | 'cytologyWorkspace' | 'microtomy' | 'embedding' | 'slideDistribution' | 'molecular'
  | 'auditLog' | 'qualityAssurance';

export const SCREEN_CAPABILITY: Readonly<Record<ScreenId, CapabilityKey>> = {
  accession: 'screen:accession:open',
  worklist: 'screen:worklist:open',
  search: 'screen:search:open',
  addOnOrders: 'screen:add-on-orders:open',
  intraopQueue: 'screen:intraop-queue:open',
  cytologyQcQueue: 'screen:cytology-qc-queue:open',
  surgicalQaWorklist: 'screen:surgical-qa-worklist:open',
  myContributions: 'screen:my-contributions:open',
  batchManagement: 'screen:batch-management:open',
  configuration: 'screen:configuration:open',
  cytologyWorkspace: 'screen:cytology-workspace:open',
  microtomy: 'screen:microtomy:open',
  embedding: 'screen:embedding:open',
  slideDistribution: 'screen:slide-distribution:open',
  molecular: 'screen:molecular:open',
  auditLog: 'screen:audit-log:open',
  qualityAssurance: 'screen:quality-assurance:open',
};

export type HubId = 'pathologyWorkspace' | 'qualityCompliance';

/** The tiles on the Home page, in order (Batch 375: the two QA queues are in
 *  the Worklist, Add-On Orders is an action on a case, and Batch Management
 *  is in the Pathology Workspace). */
export type HomeTileId =
  | 'accession' | 'worklist' | 'search' | 'intraopQueue' | 'myContributions' | 'configuration' | HubId;

/**
 * What each Home tile opens. A tile shows when the user may open any of its
 * screens: a hub's screens, or (Batch 375) the Worklist's case list and its
 * two peer-review queues.
 */
export const TILE_SCREENS: Readonly<Record<HomeTileId, readonly ScreenId[]>> = {
  accession: ['accession'],
  worklist: ['worklist', 'cytologyQcQueue', 'surgicalQaWorklist'],
  search: ['search'],
  intraopQueue: ['intraopQueue'],
  myContributions: ['myContributions'],
  configuration: ['configuration'],
  pathologyWorkspace: ['cytologyWorkspace', 'microtomy', 'embedding', 'slideDistribution', 'molecular', 'batchManagement'],
  qualityCompliance: ['auditLog', 'qualityAssurance'],
};

/** The screens inside each hub, in the hub's tile order. */
export const HUB_SCREENS: Readonly<Record<HubId, readonly ScreenId[]>> = {
  pathologyWorkspace: TILE_SCREENS.pathologyWorkspace,
  qualityCompliance: TILE_SCREENS.qualityCompliance,
};

const screensOf = (id: HomeTileId | ScreenId): readonly ScreenId[] =>
  (TILE_SCREENS as Record<string, readonly ScreenId[]>)[id] ?? [id as ScreenId];

/** Whether the user may open this tile (any of its screens) or screen. `has` answers for a capability. */
export function canOpenTile(id: HomeTileId | ScreenId, has: (capability: string) => boolean): boolean {
  return screensOf(id).some(s => has(SCREEN_CAPABILITY[s]));
}

/** The tiles to show, in the given order. */
export function visibleTiles<T extends HomeTileId | ScreenId>(order: readonly T[], has: (capability: string) => boolean): T[] {
  return order.filter(id => canOpenTile(id, has));
}

// ── The Worklist's views (Batch 375) ────────────────────────────────────────

export type WorklistView = 'cases' | 'cytologyQc' | 'surgicalQa';

const VIEW_SCREEN: Readonly<Record<WorklistView, ScreenId>> = {
  cases: 'worklist', cytologyQc: 'cytologyQcQueue', surgicalQa: 'surgicalQaWorklist',
};

/** The Worklist views this user may open, cases first. */
export function worklistViews(has: (capability: string) => boolean): WorklistView[] {
  return (Object.keys(VIEW_SCREEN) as WorklistView[]).filter(v => has(SCREEN_CAPABILITY[VIEW_SCREEN[v]]));
}

/** The view to show: the one asked for (e.g. from the address) if allowed, else the first allowed; null if none. */
export function resolveWorklistView(requested: string | null | undefined, allowed: readonly WorklistView[]): WorklistView | null {
  const asked = allowed.find(v => v === requested);
  return asked ?? allowed[0] ?? null;
}

/** The route check. Each screen's check names its capability literally, so the capabilities guard test sees it. */
export function createScreenAccessService(deps: { authorization: Pick<IAuthorizationService, 'enforce'> }) {
  const a = deps.authorization;
  const checks: Record<ScreenId, () => Promise<{ allowed: boolean }>> = {
    accession: () => a.enforce('screen:accession:open'),
    worklist: () => a.enforce('screen:worklist:open'),
    search: () => a.enforce('screen:search:open'),
    addOnOrders: () => a.enforce('screen:add-on-orders:open'),
    intraopQueue: () => a.enforce('screen:intraop-queue:open'),
    cytologyQcQueue: () => a.enforce('screen:cytology-qc-queue:open'),
    surgicalQaWorklist: () => a.enforce('screen:surgical-qa-worklist:open'),
    myContributions: () => a.enforce('screen:my-contributions:open'),
    batchManagement: () => a.enforce('screen:batch-management:open'),
    configuration: () => a.enforce('screen:configuration:open'),
    cytologyWorkspace: () => a.enforce('screen:cytology-workspace:open'),
    microtomy: () => a.enforce('screen:microtomy:open'),
    embedding: () => a.enforce('screen:embedding:open'),
    slideDistribution: () => a.enforce('screen:slide-distribution:open'),
    molecular: () => a.enforce('screen:molecular:open'),
    auditLog: () => a.enforce('screen:audit-log:open'),
    qualityAssurance: () => a.enforce('screen:quality-assurance:open'),
  };
  return {
    /** Whether the signed-in user may open this tile (any of its screens) or screen. */
    async canOpen(id: HomeTileId | ScreenId): Promise<boolean> {
      for (const s of screensOf(id)) if ((await checks[s]()).allowed) return true;
      return false;
    },
  };
}

export type IScreenAccessService = ReturnType<typeof createScreenAccessService>;
