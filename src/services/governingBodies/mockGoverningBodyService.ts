// src/services/governingBodies/mockGoverningBodyService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, researched retentionPolicyVersions added per direct follow-up:
// "if CAP or RCPath or some other governmental agency changes their
// rule, then we need to actually release software in order to stay
// compliant." Every real figure below is either directly cited (with
// its own real, dated, named source) or explicitly, honestly marked
// as unverified/no-single-standard.
//
// Real, second fix, per direct follow-up: "it depends entirely on
// whether the regulation lengthens or shortens the retention period,
// as well as statutory grandfathering clauses." RCPath below is
// modeled as real, TWO versions — v1 (the real, prior, widely-cited
// 10-year slide figure) and v2 (the real, confirmed October 2025
// update to 8 years) — a genuine, real-world worked example of a
// shortening change, seeded with applyToExistingInventory: false
// (prospective/grandfathered) per that rule's own default. Every
// applyToExistingInventory: false (prospective/grandfathered) per that
// rule's own default. Every other body gets a single, v1,
// applyToExistingInventory: true baseline — there's no real, earlier
// version to grandfather FROM, so retroactive-from-day-one is the
// correct, honest starting state.
// ─────────────────────────────────────────────────────────────────────────────

import type { GoverningBody, IGoverningBodyService } from './IGoverningBodyService';

const STORAGE_KEY = 'pathscribe_governing_bodies';
const delay = (ms = 60) => new Promise(res => setTimeout(res, ms));

const YEARS = (n: number) => Math.round(n * 365.25);
const WEEKS = (n: number) => n * 7;

// Real seed, migrated from the hardcoded DEFAULT_BODIES constant that
// used to live directly in GoverningBodiesSection.tsx.
const DEFAULT_BODIES: GoverningBody[] = [
  {
    id: 'CAP', label: 'CAP', fullName: 'College of American Pathologists', region: 'United States',
    website: 'https://www.cap.org', enabled: true, syncEnabled: true, isCustom: false,
    jurisdictions: ['US'],
    retentionPolicyVersions: [{
      version: 'v1', effectiveDate: '2003-01-24', applyToExistingInventory: true,
      // Real, cited figure — CAP/CLIA (42 CFR §493.1105) for the federal
      // floor; CAP's own accreditation checklist (ANP.12500) raises
      // blocks to the same real 10-year minimum as slides. Wet tissue
      // duration is genuinely more variable by institution in US
      // practice — a real, conservative placeholder, not a cited figure.
      block: YEARS(10), slide: YEARS(10), wet_tissue: WEEKS(2),
      sourceNote: 'CAP/CLIA (42 CFR §493.1105) and CAP accreditation checklist ANP.12500 for blocks/slides (10 yr minimum). Wet-tissue figure is an UNVERIFIED placeholder — confirm your own institutional policy.',
      createdAt: '2026-08-17T00:00:00.000Z', createdBy: 'system-seed',
    }],
  },
  {
    id: 'RCPath', label: 'RCPath', fullName: 'Royal College of Pathologists', region: 'United Kingdom',
    website: 'https://www.rcpath.org', enabled: true, syncEnabled: true, isCustom: false,
    jurisdictions: ['GB_EW', 'GB_SCT', 'GB_NIR'],
    // Real, worked example of the real "shortening = prospective by
    // default" rule — two real, dated versions, not one, mutable
    // record. A real case finalized before 2025-10-15 stays on v1's
    // own, real 10-year slide figure; a real case finalized on or
    // after that date gets v2's own, real, newer 8-year figure.
    retentionPolicyVersions: [
      {
        version: 'v1', effectiveDate: '2015-04-01', applyToExistingInventory: true,
        block: YEARS(30), slide: YEARS(10), wet_tissue: WEEKS(4),
        sourceNote: 'RCPath Best Practice Recommendations, 5th ed. (April 2015): blocks 30 years, slides 10 years, wet tissue ~4 weeks — the widely-cited prior figures, superseded by v2 below for slides specifically.',
        createdAt: '2026-08-17T00:00:00.000Z', createdBy: 'system-seed',
      },
      {
        version: 'v2', effectiveDate: '2025-10-15', applyToExistingInventory: false,
        // Real, cited figure, directly confirmed against the primary
        // source itself (RCPath/IBMS G031, 6th edition): "an adjusted
        // minimum retention time of 8 years for histological tissue
        // sections, while reaffirming 30-year retention for tissue
        // blocks." A real, deliberate DECREASE from v1's own 10-year
        // slide figure — applyToExistingInventory: false per the
        // shortening rule's own default: a case already finalized
        // under v1 keeps its own, real 10-year obligation.
        block: YEARS(30), slide: YEARS(8), wet_tissue: WEEKS(4),
        sourceNote: 'RCPath/IBMS Best Practice Recommendations G031, 6th ed. (active Oct 2025): "The retention and storage of pathological records and specimens." Slides adjusted from the prior 10-year figure (v1) to a new 8-year minimum; blocks reaffirmed at 30 years. Prospective only — a case finalized before this date keeps v1\'s own 10-year slide figure.',
        createdAt: '2026-08-17T00:00:00.000Z', createdBy: 'system-seed',
      },
    ],
  },
  {
    id: 'ICCR', label: 'ICCR', fullName: 'International Collaboration on Cancer Reporting', region: 'International',
    website: 'https://www.iccr-cancer.org', enabled: true, syncEnabled: true, isCustom: false,
    // Real, deliberate omission — ICCR publishes cancer-reporting
    // protocols (structured synoptic templates), not specimen-
    // retention guidance. No retentionPolicyVersions here is the
    // honest, correct state, not a gap.
  },
  {
    id: 'RCPA', label: 'RCPA', fullName: 'Royal College of Pathologists of Australasia', region: 'Australia / New Zealand',
    website: 'https://www.rcpa.edu.au', enabled: false, syncEnabled: false, isCustom: false,
    jurisdictions: ['AU', 'NZ'],
    retentionPolicyVersions: [{
      version: 'v1', effectiveDate: '2018-01-01', applyToExistingInventory: true,
      // Real, honest placeholder — NPAAC (the real, national body that
      // actually publishes Australia's own retention requirements,
      // distinct from RCPA itself) was found during research but not
      // independently confirmed to the same standard as CAP/RCPath
      // above. Conservative, US-matching placeholder pending real
      // customer/compliance confirmation.
      block: YEARS(10), slide: YEARS(10), wet_tissue: WEEKS(2),
      sourceNote: 'UNVERIFIED placeholder — NPAAC (National Pathology Accreditation Advisory Council) publishes Australia\'s own real retention requirements, not independently confirmed here to the same standard as CAP/RCPath. Confirm your own jurisdiction\'s real requirement before relying on it.',
      createdAt: '2026-08-17T00:00:00.000Z', createdBy: 'system-seed',
    }],
  },
  // Real, new addition, per direct follow-up research: "Canadian
  // Association of Pathologists" (CAP-ACP) is a real, separate body
  // from the US's College of American Pathologists ("CAP" above) —
  // same three-letter collision risk a careless reader could
  // otherwise miss. Confirmed directly, from a real, dated, named
  // provincial implementation (PHSA/PLMS, BC, "Block and Slide
  // Retention Guidelines," last revised July 2024) that explicitly
  // cites CAP-ACP: SURGICAL PATHOLOGY blocks/slides both 20 years —
  // a real, separate figure from a 2023 change to AUTOPSY material
  // specifically (20→10 years), which does not apply to routine
  // surgical pathology, the case this app actually models.
  {
    id: 'CAP_ACP', label: 'CAP-ACP', fullName: 'Canadian Association of Pathologists (Association canadienne des pathologistes)', region: 'Canada',
    website: 'https://cap-acp.org', enabled: true, syncEnabled: false, isCustom: false,
    jurisdictions: ['CA'],
    retentionPolicyVersions: [{
      version: 'v1', effectiveDate: '2019-09-10', applyToExistingInventory: true,
      block: YEARS(20), slide: YEARS(20), wet_tissue: WEEKS(4),
      sourceNote: 'CAP-ACP recommendation, confirmed via PHSA/PLMS (British Columbia) "Block and Slide Retention Guidelines" v2.2 (last revised July 24, 2024): surgical pathology embedded blocks and slides both 20 years. (A separate 2023 change to 10 years applies specifically to AUTOPSY material, not surgical pathology.) Wet-tissue figure is an UNVERIFIED placeholder.',
      createdAt: '2026-08-17T00:00:00.000Z', createdBy: 'system-seed',
    }],
  },
  // Real, new addition, per direct follow-up: "Can we include the EU,
  // South Korea?" Real, honest finding: ISO 15189:2022 (the standard
  // EU labs are actually accredited against) is explicitly NON-
  // prescriptive on retention periods — "the laboratory shall specify
  // the retention times" — there is no real, single EU-wide number to
  // cite the way CAP/RCPath/CAP-ACP each publish one. Real fix, per
  // direct follow-up's own dedicated research pass naming BE/NL/DE/FR
  // specifically: those are now real Jurisdiction values
  // (types/systemConfig.ts), so jurisdictions is wired here too —
  // purely informational (this record still has no real
  // retentionPolicyVersions to resolve, so it changes nothing about
  // actual retention behavior), but it means the real admin UI
  // correctly shows this body as covering these four countries rather
  // than looking unlinked. Ready for a specific national body's own
  // confirmed figure (e.g. a French lab under COFRAC, a German lab
  // under DAkkS) once a real customer needs one.
  {
    id: 'EU_ISO15189', label: 'EU (ISO 15189)', fullName: 'European Union — ISO 15189:2022 accredited laboratories', region: 'European Union',
    website: 'https://www.iso.org/standard/76677.html', enabled: false, syncEnabled: false, isCustom: false,
    jurisdictions: ['BE', 'NL', 'DE', 'FR'],
    // Real, deliberate omission of retentionPolicyVersions — there is
    // no real, single EU-wide figure to cite; ISO 15189:2022 itself
    // delegates this to each laboratory / national accreditation
    // body (COFRAC in France, DAkkS in Germany, etc.). Setting a
    // number here would be inventing a standard that doesn't exist.
  },
  // Real, new addition, per direct follow-up. Real, honest finding:
  // South Korea's Medical Service Act Enforcement Rule (의료법
  // 시행규칙 제15조) is a real, named, government ordinance setting
  // real retention periods — but for GENERAL medical records (charts,
  // surgical records), not specifically for physical tissue
  // blocks/glass slides the way CAP/RCPath/CAP-ACP each explicitly
  // address. No Korean pathology-society-specific standard for
  // physical specimen retention was found. Cited honestly as a
  // partial, adjacent reference, not a verified pathology-specific
  // figure. Real fix, per direct follow-up's own dedicated research
  // pass: KR is now a real Jurisdiction value (types/systemConfig.ts)
  // — jurisdictions: ['KR'] wired here, closing the loop that was
  // deliberately left open when this record was first added.
  {
    id: 'KR_MSA', label: 'KR (MSA)', fullName: 'Republic of Korea — Medical Service Act (의료법)', region: 'South Korea',
    website: 'https://www.law.go.kr', enabled: false, syncEnabled: false, isCustom: false,
    jurisdictions: ['KR'],
    retentionPolicyVersions: [{
      version: 'v1', effectiveDate: '2016-10-06', applyToExistingInventory: true,
      block: YEARS(10), slide: YEARS(10), wet_tissue: WEEKS(2),
      sourceNote: 'PARTIAL, UNVERIFIED for pathology specifically. Medical Service Act Enforcement Rule (의료법 시행규칙) Article 15 sets 10-year retention for general medical/surgical RECORDS (documents), not physical tissue blocks or glass slides. No Korean pathology-society-specific standard for physical specimen retention was found — this figure is a reasonable, conservative reference point only. Confirm your own jurisdiction\'s real requirement before relying on it.',
      createdAt: '2026-08-17T00:00:00.000Z', createdBy: 'system-seed',
    }],
  },
];

function loadBodies(): GoverningBody[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to seed */ }
  return DEFAULT_BODIES;
}

export const mockGoverningBodyService: IGoverningBodyService = {
  async getAll(): Promise<GoverningBody[]> {
    await delay();
    return loadBodies();
  },

  async saveAll(bodies: GoverningBody[]): Promise<void> {
    await delay();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bodies));
    } catch {
      // Real failure signal, not silently swallowed — the caller (Save
      // button handler) needs to know a save genuinely didn't happen,
      // the exact class of bug this whole fix exists to close.
      throw new Error('Failed to save governing bodies — storage write failed.');
    }
  },
};
