// src/services/cases/casePoolAssignmentService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Automatic case pool routing when no LIS assignment is available.
//
// Routing priority order:
//   1. Direct LIS assignment (handled upstream — not this service)
//   2. Specimen type → Subspecialty → Pool (this service)
//   3. Fallback pool (configurable — default: 'general')
//   4. Unrouted — flagged for manual admin assignment
//
// Called by:
//   - HL7 inbound handler when ORM^O01 arrives with no assignedTo
//   - LIS polling service when assignment timeout is reached
//   - Manual "Route to Pool" action on the worklist
// ─────────────────────────────────────────────────────────────────────────────

import { Case }         from '../../types/case/Case';
import { CaseStatus }   from '../../types/case/CaseStatus';
import { subspecialtyService } from '../index';
import { mockCaseService }     from '../cases/mockCaseService';
import { storageGet, storageSet }               from '../mockStorage';
import { Subspecialty }                         from '../subspecialties/ISubspecialtyService';
import { mockFacilityService }                  from '../facilities/mockFacilityService';
import { resolvePerformingLabFacilityId }       from '../facilities/IFacilityService';
import { ensureHistoryFetchStarted }             from '../patientHistory/ensureHistoryFetchStarted';

// ─── Routing config ───────────────────────────────────────────────────────────
// In production this comes from LISSection config in the System Tab.
// For now stored in localStorage so admins can change it without a redeploy.

export interface RoutingConfig {
  /** Enable automatic pool routing — if false, unassigned cases stay as draft */
  enabled:              boolean;
  /** Pool ID to use when no subspecialty match is found */
  fallbackPoolId:       string;
  /** Display name of the fallback pool */
  fallbackPoolName:     string;
  /** Seconds to wait for LIS assignment before routing to pool */
  assignmentTimeoutSec: number;
  /** Whether STAT cases bypass the timeout and route immediately */
  statRoutesImmediately: boolean;
  /**
   * Real, per direct guidance ("General Pathology for the Performing
   * Lab Facility") — per-lab overrides for the fallback pool used when
   * no keyword rule matches. Checked before fallbackPoolId/Name above,
   * same Global-then-specific precedence as RoutingRule.
   * performingLabFacilityId below. A lab with no override here falls
   * through to the Global fallbackPoolId/Name — that pair keeps its
   * existing meaning as the org-wide default, not a specific lab's.
   */
  labFallbacks?: { performingLabFacilityId: string; poolId: string; poolName: string }[];
}

const ROUTING_CONFIG_KEY  = 'pathscribe_routing_config';
const ROUTING_RULES_KEY   = 'pathscribe_routing_rules';

// ─── Routing rule ─────────────────────────────────────────────────────────────
// Each rule maps a set of keywords to a subspecialty pool.
// Built-in rules ship with PathScribe and cannot be deleted but can be disabled.
// Custom rules are added by admins and can be deleted.

export interface RoutingRule {
  id:             string;
  subspecialtyId: string;   // target pool
  keywords:       string[]; // matched against normalised specimen description
  builtIn:        boolean;
  active:         boolean;
  priority:       number;   // lower = checked first
  note?:          string;   // admin notes
  /**
   * Real fix, per FEAT-ROUT-01 AC-1/AC-2: the deterministic match key
   * this spec actually calls for is [Specimen Type] + [Performing Lab
   * ID], not free-text keyword search — a Specimen Dictionary entry id
   * (SpecimenEntry.id, same id space as Specimen.
   * specimenDictionaryEntryId) is unambiguous where `keywords` below
   * is a substring heuristic that can both over- and under-match.
   * Checked first, in ruleMatchesSpecimen() below; `keywords` remains
   * as an explicit, secondary fallback for specimens with no
   * dictionary link (manually entered, or seeded before that field
   * existed) — dropping text matching entirely would regress those,
   * which are still real in this app today.
   */
  mappedSpecimenTypeIds?: string[];
  /**
   * Real, per direct guidance: different performing labs get their own
   * pools — this scopes a rule to one lab, same Global/scoped
   * convention as ContainerType/DelegationType's own
   * performingLabFacilityId (undefined = Global, checked for every
   * lab's cases; set = only ever considered for that lab's own cases).
   * Built-in rules are always Global. Duplicating a rule and setting
   * this is how an admin gives one performing lab its own routing for
   * a given department — see matchSpecimenToSubspecialty's own
   * most-specific-wins resolution below.
   */
  performingLabFacilityId?: string;
}

export const BUILT_IN_ROUTING_RULES: RoutingRule[] = [
  { id: 'rule-gi-colorectal', subspecialtyId: 'gi', priority: 10, builtIn: true, active: true,
    note: 'Colorectal specimens',
    keywords: ['colon', 'colorectal', 'sigmoid', 'rectum', 'rectal', 'caecum', 'cecum', 'appendix', 'ileum', 'jejunum', 'duodenum', 'small bowel', 'large bowel', 'colectomy', 'hemicolectomy', 'hartmann', 'anterior resection', 'low anterior resection', 'tems', 'transanal', 'polypectomy'] },
  { id: 'rule-gi-upper', subspecialtyId: 'gi', priority: 11, builtIn: true, active: true,
    note: 'Upper GI specimens',
    keywords: ['stomach', 'gastric', 'gastrectomy', 'oesophagus', 'esophagus', 'oesophageal', 'esophageal', 'gastroesophageal', 'gej'] },
  { id: 'rule-gi-hpb', subspecialtyId: 'gi', priority: 12, builtIn: true, active: true,
    note: 'Hepatobiliary and pancreatic specimens',
    keywords: ['liver', 'hepatic', 'hepatectomy', 'cholecystectomy', 'gallbladder', 'bile duct', 'biliary', 'pancreas', 'pancreatic', 'whipple'] },
  { id: 'rule-breast', subspecialtyId: 'breast', priority: 20, builtIn: true, active: true,
    note: 'Breast specimens',
    keywords: ['breast', 'mastectomy', 'lumpectomy', 'mammary', 'nipple', 'axilla', 'axillary', 'sentinel node', 'wide local excision'] },
  { id: 'rule-gu', subspecialtyId: 'uro', priority: 30, builtIn: true, active: true,
    note: 'Genitourinary specimens',
    keywords: ['prostate', 'prostatic', 'prostatectomy', 'turp', 'bladder', 'cystectomy', 'kidney', 'renal', 'nephrectomy', 'ureter', 'urethra', 'testis', 'testicular', 'orchidectomy', 'penile'] },
  { id: 'rule-gynae', subspecialtyId: 'gyn', priority: 40, builtIn: true, active: true,
    note: 'Gynaecological specimens',
    keywords: ['uterus', 'uterine', 'hysterectomy', 'endometrium', 'endometrial', 'cervix', 'cervical', 'ovary', 'ovarian', 'fallopian', 'vulva', 'vulval', 'vagina', 'vaginal', 'placenta', 'products of conception'] },
  { id: 'rule-derm', subspecialtyId: 'derm', priority: 50, builtIn: true, active: true,
    note: 'Dermatopathology specimens',
    keywords: ['skin', 'cutaneous', 'melanoma', 'punch biopsy', 'shave biopsy', 'excision skin', 'wide excision', 'basal cell', 'squamous cell skin'] },
  { id: 'rule-haem', subspecialtyId: 'heme', priority: 60, builtIn: true, active: true,
    note: 'Haematopathology specimens',
    keywords: ['lymph node', 'lymphoma', 'bone marrow', 'thymus', 'lymphadenopathy', 'haematological', 'hematological'] },
];

export function loadRoutingRules(): RoutingRule[] {
  const stored = storageGet<RoutingRule[]>(ROUTING_RULES_KEY, BUILT_IN_ROUTING_RULES);
  // Migration: ensure all built-ins are present
  const storedIds = new Set(stored.map(r => r.id));
  const missing = BUILT_IN_ROUTING_RULES.filter(r => !storedIds.has(r.id));
  const merged = [...missing, ...stored].sort((a, b) => a.priority - b.priority);
  return merged;
}

export function saveRoutingRules(rules: RoutingRule[]): void {
  storageSet(ROUTING_RULES_KEY, rules);
}

const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  enabled:               true,
  fallbackPoolId:        'general',
  fallbackPoolName:      'General Pathology',
  assignmentTimeoutSec:  300,   // 5 minutes
  statRoutesImmediately: true,
};

export function getRoutingConfig(): RoutingConfig {
  return storageGet<RoutingConfig>(ROUTING_CONFIG_KEY, DEFAULT_ROUTING_CONFIG);
}

export function saveRoutingConfig(config: RoutingConfig): void {
  storageSet(ROUTING_CONFIG_KEY, config);
}

// ─── Routing result ───────────────────────────────────────────────────────────

export type RoutingOutcome =
  | 'routed_to_pool'      // matched a subspecialty pool
  | 'routed_to_fallback'  // no match — sent to fallback pool
  | 'unrouted'            // routing disabled or no fallback configured
  | 'already_assigned'    // case already has an assignedTo — skip
  | 'no_specimens';       // case has no specimens to match against

export interface RoutingResult {
  outcome:       RoutingOutcome;
  poolId?:       string;
  poolName?:     string;
  subspecialty?: string;
  reason:        string;
}

// ─── Specimen → Subspecialty matching ────────────────────────────────────────
// Matches a specimen description against all subspecialties via their
// linked specimenIds. The SpecimenDictionary stores subspecialtyId on each
// SpecimenEntry — we look up which subspecialty owns the matching specimen.
//
// Matching strategy (in order):
//   1. Exact specimenId match (if specimen has an id)
//   2. Keyword match against specimen description (normalised, lowercase)

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// ruleMatchesSpecimen — the real, composite-key check FEAT-ROUT-01
// AC-1/AC-2 calls for: a Specimen Dictionary entry id
// (specimenDictionaryEntryId) is a deterministic match against
// mappedSpecimenTypeIds, checked first. `keywords` substring matching
// against the free-text description is a real, secondary fallback —
// not part of the spec, but kept for specimens with no dictionary
// link (manual entry, or seeded before that field existed), where
// there is no structured id to match on at all.
function ruleMatchesSpecimen(rule: RoutingRule, specimenDictionaryEntryId: string | undefined, description: string): boolean {
  if (specimenDictionaryEntryId && rule.mappedSpecimenTypeIds?.includes(specimenDictionaryEntryId)) {
    return true;
  }
  if (rule.keywords.length > 0) {
    const norm = normalise(description);
    return rule.keywords.some(kw => norm.includes(normalise(kw)));
  }
  return false;
}

// Lab-scoped rules are checked before Global ones for the same case —
// most-specific-wins, same precedence TAT Configuration's 7-level
// resolution and TemplateRoutingService's Pass 0 client override both
// already use. Within each tier (lab-specific, then Global), the
// existing `priority` field still decides order.
function rulesForLab(performingLabFacilityId?: string): RoutingRule[] {
  return loadRoutingRules()
    .filter(r => r.active)
    .filter(r => !r.performingLabFacilityId || r.performingLabFacilityId === performingLabFacilityId)
    .sort((a, b) => {
      const aSpecific = a.performingLabFacilityId ? 0 : 1;
      const bSpecific = b.performingLabFacilityId ? 0 : 1;
      return aSpecific !== bSpecific ? aSpecific - bSpecific : a.priority - b.priority;
    });
}

// matchSpecimenToSubspecialty — uses dynamic rules loaded from storage
function matchSpecimenToSubspecialty(specimenDictionaryEntryId: string | undefined, description: string, performingLabFacilityId?: string): string | null {
  for (const rule of rulesForLab(performingLabFacilityId)) {
    if (ruleMatchesSpecimen(rule, specimenDictionaryEntryId, description)) {
      return rule.subspecialtyId;
    }
  }
  return null;
}

// testSpecimenRouting — used by the admin UI to preview routing without
// saving. performingLabFacilityId lets the preview reflect what a real
// case from that lab would actually match, including any lab-specific
// rule overriding the Global one. specimenDictionaryEntryId lets the
// preview exercise the real, deterministic composite-key match rather
// than only ever the text fallback.
export function testSpecimenRouting(description: string, performingLabFacilityId?: string, specimenDictionaryEntryId?: string): { matched: boolean; rule?: RoutingRule; subspecialtyId?: string } {
  for (const rule of rulesForLab(performingLabFacilityId)) {
    if (ruleMatchesSpecimen(rule, specimenDictionaryEntryId, description)) {
      return { matched: true, rule, subspecialtyId: rule.subspecialtyId };
    }
  }
  return { matched: false };
}

// resolveCasePerformingLab — the case's ordering facility (facilityId)
// resolved to the actual performing lab, via the same
// resolvePerformingLabFacilityId() every other lab-scoped dictionary
// (Container Types, Delegation Types) already resolves against.
// Returns undefined for a case with no facilityId, an unknown facility,
// or a facility with no performing_lab role and no override — in all
// three cases, only Global rules/fallback can ever apply.
export async function resolveCasePerformingLab(caseData: Case): Promise<string | undefined> {
  if (!caseData.order?.facilityId) return undefined;
  const res = await mockFacilityService.getById(caseData.order.facilityId);
  if (!res.ok) return undefined;
  return resolvePerformingLabFacilityId(res.data);
}

// ─── Main routing function ────────────────────────────────────────────────────

export async function routeCase(caseData: Case): Promise<RoutingResult> {
  // Real, per direct guidance: "when [a case gets pulled and assigned]
  // is the first time PathScribe [is] aware of the case" — this
  // function is called from the real HL7 inbound handler and the
  // real LIS polling service (see this file's own header) whether a
  // case ends up directly assigned or pool-routed, making it the
  // real, single point to start an Assist-mode patient-history fetch.
  // Deliberately fire-and-forget (never awaited) — a slow or failed
  // history fetch must never block or fail the real routing decision
  // this function exists for.
  ensureHistoryFetchStarted(caseData).catch(() => {});

  const config = getRoutingConfig();

  // Already assigned — nothing to do
  if (caseData.order?.assignedTo) {
    return { outcome: 'already_assigned', reason: 'Case already has an assigned pathologist' };
  }

  // Routing disabled
  if (!config.enabled) {
    return { outcome: 'unrouted', reason: 'Automatic pool routing is disabled in LIS config' };
  }

  // No specimens to match against
  if (!caseData.specimens || caseData.specimens.length === 0) {
    return { outcome: 'unrouted', reason: 'No specimens on case — cannot determine subspecialty' };
  }

  // Which performing lab this case actually belongs to — resolved once,
  // used both for rule matching and for the fallback pool below.
  const performingLabFacilityId = await resolveCasePerformingLab(caseData);

  // Load all active subspecialties
  const subsResult = await subspecialtyService.getAll();
  if (!subsResult.ok) {
    return { outcome: 'unrouted', reason: 'Could not load subspecialties for routing' };
  }
  const subspecialties = subsResult.data.filter((s: Subspecialty) => s.active && s.isWorkgroup);

  // Try to match each specimen to a subspecialty pool
  // First match wins — use the most specific specimen (usually specimen A)
  let matchedSubspecialty: Subspecialty | null = null;
  let matchedVia = '';

  for (const specimen of caseData.specimens) {
    const description = specimen.description ?? specimen.label ?? '';

    // Try the real composite-key match first (specimenDictionaryEntryId
    // + this case's own performing lab), falling back to keyword text
    // matching only when the rule or specimen has no structured id —
    // see ruleMatchesSpecimen's own doc comment.
    const subspecialtyId = matchSpecimenToSubspecialty(specimen.specimenDictionaryEntryId, description, performingLabFacilityId);
    if (subspecialtyId) {
      const sub = subspecialties.find((s: Subspecialty) => s.id === subspecialtyId);
      // Real safety check, not just a blind lookup: a pool can itself
      // be scoped to one performing lab (Subspecialty.
      // performingLabFacilityId, same convention as the rule above).
      // If a rule points at a pool that belongs to a *different* lab
      // than this case resolved to, that's a real misconfiguration —
      // treat it as no match rather than silently routing this case
      // into another lab's pool.
      if (sub && (!sub.performingLabFacilityId || sub.performingLabFacilityId === performingLabFacilityId)) {
        matchedSubspecialty = sub;
        matchedVia = specimen.specimenDictionaryEntryId ? `specimen type match on "${description}"` : `keyword match on "${description}"`;
        break;
      }
    }
  }

  // Route to matched pool
  if (matchedSubspecialty) {
    await applyPoolRouting(caseData, matchedSubspecialty.id, matchedSubspecialty.name);
    return {
      outcome:       'routed_to_pool',
      poolId:        matchedSubspecialty.id,
      poolName:      matchedSubspecialty.name,
      subspecialty:  matchedSubspecialty.name,
      reason:        `Routed to ${matchedSubspecialty.name} pool via ${matchedVia}`,
    };
  }

  // No match — route to fallback pool. Per FEAT-ROUT-01's own data
  // model, the real, primary source of truth is a pool's own
  // isCatchAll flag (Subspecialty.isCatchAll) — a lab-specific
  // catch-all pool wins over a Global one, same most-specific-wins
  // precedence as the routing rules above. config.labFallbacks/
  // fallbackPoolId remain a real, secondary source for orgs that
  // haven't tagged a pool as catch-all yet — never removed, just
  // checked after isCatchAll now finds nothing.
  const catchAllPool = performingLabFacilityId
    ? subspecialties.find(s => s.isCatchAll && s.performingLabFacilityId === performingLabFacilityId)
      ?? subspecialties.find(s => s.isCatchAll && !s.performingLabFacilityId)
    : subspecialties.find(s => s.isCatchAll && !s.performingLabFacilityId);

  const labFallback = performingLabFacilityId
    ? config.labFallbacks?.find(f => f.performingLabFacilityId === performingLabFacilityId)
    : undefined;
  const fallbackPoolId   = catchAllPool?.id   ?? labFallback?.poolId   ?? config.fallbackPoolId;
  const fallbackPoolName = catchAllPool?.name ?? labFallback?.poolName ?? config.fallbackPoolName;

  if (fallbackPoolId) {
    await applyPoolRouting(caseData, fallbackPoolId, fallbackPoolName);
    return {
      outcome:   'routed_to_fallback',
      poolId:    fallbackPoolId,
      poolName:  fallbackPoolName,
      reason:    `No subspecialty match found — routed to fallback pool "${fallbackPoolName}"`,
    };
  }

  // No fallback configured
  return {
    outcome: 'unrouted',
    reason:  'No subspecialty match and no fallback pool configured — manual assignment required',
  };
}

// ─── Apply pool routing to case ───────────────────────────────────────────────

// Real, per direct guidance's own CLIA workload Phase 2 request
// ("Automated Reassignment Queue Routing"): exported so the real
// workload capacity check (CytologyScreeningPage.tsx) can reuse the
// exact same real, established "return this case to its pool,
// explicitly unassigned" logic, rather than duplicating the same
// mockCaseService.updateCase shape a second, potentially-divergent
// way.
export async function applyPoolRouting(
  caseData: Case,
  poolId:   string,
  poolName: string,
): Promise<void> {
  // Real, direct follow-up (PS-71): this used to omit expectedVersion
  // entirely, even though the whole caseData (including its own real
  // .version) is already the caller's — re-assignment back to a pool can
  // race with a pathologist's own in-progress clinical edit, so this write
  // should honor the same optimistic-concurrency check every other real
  // case write does, not silently overwrite whatever version is current.
  await mockCaseService.updateCase(caseData.id, {
    status:   'pool' as CaseStatus,
    poolId,
    poolName,
    order: {
      ...caseData.order,
      assignedTo: undefined,  // explicitly unassigned — in the pool
    },
    updatedAt: new Date().toISOString(),
  } as any, (caseData as any).version);
}

// ─── Batch routing ────────────────────────────────────────────────────────────
// Routes all unassigned cases in a list — used on app startup or
// when routing config changes.

export async function routeUnassignedCases(cases: Case[]): Promise<{
  routed:   number;
  skipped:  number;
  failed:   number;
  results:  { caseId: string; result: RoutingResult }[];
}> {
  const unassigned = cases.filter(c =>
    !c.order?.assignedTo &&
    c.status !== 'pool' &&
    c.status !== 'finalized'
  );

  const results: { caseId: string; result: RoutingResult }[] = [];
  let routed = 0, skipped = 0, failed = 0;

  for (const c of unassigned) {
    try {
      const result = await routeCase(c);
      results.push({ caseId: c.id, result });
      if (result.outcome === 'routed_to_pool' || result.outcome === 'routed_to_fallback') {
        routed++;
      } else {
        skipped++;
      }
    } catch (e) {
      failed++;
      results.push({
        caseId: c.id,
        result: { outcome: 'unrouted', reason: `Error during routing: ${(e as Error).message}` },
      });
    }
  }

  return { routed, skipped, failed, results };
}

// ─── STAT routing ─────────────────────────────────────────────────────────────
// STAT cases bypass the assignment timeout and route immediately.
// Called as soon as a STAT case is received.

export async function routeStatCase(caseData: Case): Promise<RoutingResult> {
  const config = getRoutingConfig();
  if (!config.statRoutesImmediately) {
    return { outcome: 'unrouted', reason: 'STAT immediate routing is disabled' };
  }
  return routeCase(caseData);
}
