// src/services/cassetteRouting/mockCassetteRoutingRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// See ICassetteRoutingRuleService.ts's own header for the full
// rationale. Seeded with two real, plausible rules — a protocol-linked
// one (referencing the one real protocol actually seeded in
// mockProtocolService.ts, proto-medical-renal, rather than a
// fabricated id nothing else in the app would ever resolve) and a
// pure priority-based override (per direct follow-up's own example,
// "STAT Override" — no protocol at all, since a STAT flag can apply
// regardless of what's being processed).
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { CassetteRoutingRule, ICassetteRoutingRuleService } from './ICassetteRoutingRuleService';

const SEED_RULES: CassetteRoutingRule[] = [
  {
    id: 'route-renal-protocol',
    name: 'Renal Protocol — Blue Mesh',
    description: 'Renal biopsies route to blue cassette stock — the protocol\'s own processing format (Megablock/Standard per pathway) still determines the physical form factor; this rule only sets color.',
    conditions: { protocolId: 'proto-medical-renal' },
    colorId: 'color-blue',
    priorityWeight: 10,
    active: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  // Real, per direct follow-up: "it all needs to be wired" —
  // proto-autopsy-cardiac-sectioning (mockProtocolService.ts) had no
  // real cassette routing rule at all, so blocks it generates got no
  // color, unlike the Renal Protocol's own rule right above. White,
  // not one of the urgency/type-specific colors already claimed
  // (STAT/Rush/CellBlock/Small Biopsy) — a real, neutral, routine
  // choice, since autopsy blocks aren't themselves a STAT/Rush
  // category the way a live surgical specimen can be.
  {
    id: 'route-autopsy-cardiac-protocol',
    name: 'Autopsy Cardiac Sectioning — White',
    description: 'Blocks generated from the Autopsy Cardiac Sectioning protocol (coronary vessels and myocardium) route to white cassette stock — a real, neutral, routine choice distinct from every other urgency/type-specific color already in use.',
    conditions: { protocolId: 'proto-autopsy-cardiac-sectioning' },
    colorId: 'color-white',
    priorityWeight: 10,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'route-stat-override',
    name: 'STAT Override',
    description: 'Any STAT order routes to red cassette stock regardless of protocol, so a bench tech can spot an urgent case in the hopper by color alone.',
    conditions: { priority: ['STAT'] },
    colorId: 'color-red',
    priorityWeight: 90,
    active: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  // Real feature, per direct follow-up: "cell blocks... frequently use
  // distinct cassette colors... to signal fragile cytopreparations."
  // priorityWeight sits between the two existing rules — a real
  // material-type requirement (needs a mesh cassette, a physical
  // constraint, not just a color preference) should generally beat a
  // plain protocol-based default, but a real admin can retune this
  // via the existing routing rules UI if a given STAT cell block
  // should still route red instead.
  {
    id: 'route-cellblock',
    name: 'Cell Block — Green / Mesh',
    description: 'Cell blocks (cytology/FNA specimens decanted into a cell block for standard histology processing) route to green, dual-mesh cassette stock so histotechs can identify fragile cytopreparations at a glance.',
    conditions: { decantType: ['cell_block'] },
    colorId: 'color-green-mesh',
    priorityWeight: 50,
    active: true,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
  // Real feature, per direct follow-up: "the Pink/Rush color conflict
  // is still unresolved... it needs its own, different color." Real,
  // genuinely new color (color-yellow/COLOR_SMALL_BIOPSY — see
  // mockCassetteColorService.ts's own header note on why this isn't
  // color-pink) — same real priorityWeight tier as the Renal rule
  // above (a plain protocol-based default, no material-type or
  // urgency override involved), so STAT Override below still
  // correctly wins for a STAT-priority small biopsy. Four separate
  // rules, not one — see resolveBlockCassetteColor.ts's own header:
  // CassetteRoutingConditions.protocolId is a single id, not an
  // array, so a real "small biopsy" CATEGORY spanning several
  // genuinely different protocols needs one rule per protocol, same
  // structural pattern the Renal rule already establishes for a
  // single one.
  {
    id: 'route-small-biopsy-skin-punch',
    name: 'Small Biopsy — Yellow (Skin Punch)',
    description: 'Skin punch biopsies are small, easily-lost specimens — yellow cassette stock flags them for extra care at grossing and embedding.',
    conditions: { protocolId: 'proto-skin-punch-biopsy' },
    colorId: 'color-yellow',
    priorityWeight: 10,
    active: true,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'route-small-biopsy-prostate-core',
    name: 'Small Biopsy — Yellow (Prostate Core)',
    description: 'Prostate needle core biopsies are small, easily-lost specimens — yellow cassette stock flags them for extra care at grossing and embedding.',
    conditions: { protocolId: 'proto-prostate-core-biopsy' },
    colorId: 'color-yellow',
    priorityWeight: 10,
    active: true,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'route-small-biopsy-breast-core',
    name: 'Small Biopsy — Yellow (Breast Core)',
    description: 'Breast core needle biopsies are small, easily-lost specimens — yellow cassette stock flags them for extra care at grossing and embedding.',
    conditions: { protocolId: 'proto-breast-core-biopsy' },
    colorId: 'color-yellow',
    priorityWeight: 10,
    active: true,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  },
  {
    id: 'route-small-biopsy-endometrial',
    name: 'Small Biopsy — Yellow (Endometrial)',
    description: 'Endometrial biopsies are small, easily-lost specimens — yellow cassette stock flags them for extra care at grossing and embedding.',
    conditions: { protocolId: 'proto-endometrial-biopsy' },
    colorId: 'color-yellow',
    priorityWeight: 10,
    active: true,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  },
];

const STORAGE_KEY = 'cassette_routing_rules';

function load(): CassetteRoutingRule[] {
  return storageGet<CassetteRoutingRule[]>(STORAGE_KEY, SEED_RULES);
}

function save(rules: CassetteRoutingRule[]): void {
  storageSet(STORAGE_KEY, rules);
}

export const mockCassetteRoutingRuleService: ICassetteRoutingRuleService = {
  async getAll(): Promise<ServiceResult<CassetteRoutingRule[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<CassetteRoutingRule>> {
    const found = load().find(r => r.id === id);
    if (!found) return { ok: false, error: `No cassette routing rule found for id '${id}'.` };
    return { ok: true, data: found };
  },

  async create(draft): Promise<ServiceResult<CassetteRoutingRule>> {
    const all = load();
    const now = new Date().toISOString();
    const created: CassetteRoutingRule = { ...draft, id: `route-${Date.now()}`, createdAt: now, updatedAt: now };
    save([...all, created]);
    return { ok: true, data: created };
  },

  async update(id: ID, changes): Promise<ServiceResult<CassetteRoutingRule>> {
    const all = load();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: `No cassette routing rule found for id '${id}'.` };
    const updated: CassetteRoutingRule = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    save(next);
    return { ok: true, data: updated };
  },

  async deactivate(id: ID): Promise<ServiceResult<CassetteRoutingRule>> {
    return mockCassetteRoutingRuleService.update(id, { active: false });
  },

  async reactivate(id: ID): Promise<ServiceResult<CassetteRoutingRule>> {
    return mockCassetteRoutingRuleService.update(id, { active: true });
  },
};
