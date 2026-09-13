// src/services/digitalPathology/mockWsiViewerVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IWsiViewerVendorService. Seed data: the three
// real scanner/viewer vendors RFP-APLIS-2026-GLOBAL §3.4 itself names
// (Leica, Roche, Hamamatsu), each with a genuinely empty
// launchUrlTemplate — this app has no real customer's own real viewer
// URL to ship, same honest-absence posture as
// FacilityInterfaceEngineConnection.endpoint elsewhere.
//
// Real, per direct follow-up: "many DP vendors actually have their
// own AI or they allow other AI to connect" — confirmed via real,
// current (2026) research and folded in as four more real, launchable
// platforms: Paige IMS (bundles the real FullFocus viewer with a
// real third-party AI marketplace), PathAI PathOS (orchestrates both
// PathAI's own and partner models), Proscia Concentriq, and Philips
// IntelliSite. Real, deliberate design confirmed via direct guidance
// ("contextual launch of the application, similar to the EMR
// approach"): this dictionary's own real job is exactly that one
// mechanism — pass identifying context, launch the app — for ANY
// real, launchable DP platform, regardless of whether that platform
// also happens to run AI internally. Paige and PathAI legitimately
// also exist in IDpVendorService.ts (this app's own separate AI
// RESULT PROVENANCE dictionary, for QA/discordance tracking) — not a
// data inconsistency, an accurate reflection of these being real
// companies with two genuinely different real roles.
//
// Plus one additional demo entry with a real, working (synthetic)
// template — same real "for demo, why not synthetic" reasoning per
// direct guidance on the SNOMED severity mapping dictionary — so
// "Launch in Viewer" is genuinely clickable and demoable out of the
// box, never mistaken for a real vendor.
// ─────────────────────────────────────────────────────────────────────────────

import type { IWsiViewerVendorService, WsiViewerVendorEntry, NewWsiViewerVendorEntry } from './IWsiViewerVendorService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'wsiViewerVendorDictionary';

const SEED: WsiViewerVendorEntry[] = [
  { id: 'wsi-viewer-leica-aperio', name: 'Leica Aperio eSlide Manager', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 1 },
  { id: 'wsi-viewer-roche-upath', name: 'Roche uPath', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 2 },
  { id: 'wsi-viewer-hamamatsu-ndpview', name: 'Hamamatsu NDP.view2', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 3 },
  // Real, per direct follow-up: "many DP vendors actually have their
  // own AI or they allow other AI to connect." Confirmed via real,
  // current (2026) research: several of the vendors already seeded in
  // IDpVendorService.ts as AI-analysis vendors are ALSO real,
  // launchable image-management platforms in their own right — not a
  // data inconsistency, a real fact about these specific companies.
  // Paige (now under Tempus) — "Paige IMS" bundles the real FullFocus
  // viewer with "an application marketplace for third-party AI"
  // (tempus.com). PathAI shifted from a single AI product to PathOS,
  // a full platform "orchestrating both their own and partner models"
  // (pdpspectra.com, May 2026). Philips IntelliSite is a real,
  // major scanner/IMS platform in its own right, not named in the
  // RFP's own §3.4 text but confirmed prominent in current market
  // research. Proscia Concentriq is, in real market terms, the same
  // kind of unified image-management-plus-AI platform as the two
  // above. A lab can genuinely choose to launch INTO any of these —
  // exactly the same real "contextual launch, like an EMR" mechanism
  // as the three hardware-scanner vendors above, regardless of
  // whether the launched platform also happens to run AI internally.
  { id: 'wsi-viewer-paige-ims', name: 'Paige IMS (FullFocus)', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 4 },
  { id: 'wsi-viewer-pathai-pathos', name: 'PathAI PathOS', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 5 },
  { id: 'wsi-viewer-proscia-concentriq', name: 'Proscia Concentriq', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 6 },
  { id: 'wsi-viewer-philips-intellisite', name: 'Philips IntelliSite', launchUrlTemplate: '', active: true, isSystem: true, sortOrder: 7 },
  // Real, per direct guidance's own "for demo, why not synthetic"
  // reasoning — a real, working (obviously fake) launch target so
  // sales can click "Launch in Viewer" and see something happen,
  // before a real customer's own real viewer URL is configured.
  { id: 'wsi-viewer-demo', name: '[DEMO ONLY] Sample WSI Viewer', launchUrlTemplate: 'https://example.com/demo-wsi-viewer?slideId={{wsiUniqueId}}', active: true, isSystem: true, sortOrder: 8 },
];

const load = (): WsiViewerVendorEntry[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: WsiViewerVendorEntry[]) => storageSet(STORAGE_KEY, data);
let _cache: WsiViewerVendorEntry[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));
const sorted = (entries: WsiViewerVendorEntry[]) => [...entries].sort((a, b) => a.sortOrder - b.sortOrder);

export const mockWsiViewerVendorService: IWsiViewerVendorService = {
  async getAll() {
    await delay();
    return ok(sorted(_cache));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache.filter(e => e.active)));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(e => e.id === id);
    return found ? ok({ ...found }) : err(`WsiViewerVendorEntry ${id} not found`);
  },

  async add(entry: NewWsiViewerVendorEntry) {
    await delay();
    const maxOrder = _cache.reduce((m, e) => Math.max(m, e.sortOrder), 0);
    const created: WsiViewerVendorEntry = { ...entry, id: 'wsi-viewer-custom-' + Date.now(), isSystem: false, sortOrder: maxOrder + 1 };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<WsiViewerVendorEntry>) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`WsiViewerVendorEntry ${id} not found`);
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(e => e.id === id ? { ...e, ...safeChanges } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockWsiViewerVendorService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockWsiViewerVendorService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target)         return err(`WsiViewerVendorEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system WSI viewer vendor entry "${id}"`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};
