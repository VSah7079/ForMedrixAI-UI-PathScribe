// src/services/cassetteRouting/ICassetteRoutingRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the "Cassette Colors Basic
// Routing Algorithm Flow" spec. Deliberately built as its own,
// standalone dictionary — per direct confirmation: "I generally don't
// want to spread the definition of rules over multiple types of
// maintenance. Let's build it separately."
//
// Protocol IS a real, deliberate component of a rule, though —
// confirmed directly: "perhaps the protocol is a component of the
// rule definition that identifies the Cassette stock." A rule may
// optionally CONDITION on a specific Protocol (protocols/
// IProtocolService.ts) as one of several trigger dimensions — but
// cassette TYPE/form-factor is never independently stored here at
// all. Protocol.pathways[].processingFormat ("Standard", "Megablock",
// "Frozen Block"...) already IS that concept — confirmed directly by
// comparing vocabularies before building this, not assumed. Re-storing
// it on a rule would be exactly the double-maintenance problem this
// file exists to avoid: change a protocol's processingFormat and every
// rule referencing it would silently disagree with reality until
// separately, manually updated. A rule's own real, genuinely NEW
// output is only cassette COLOR and a print template — concepts
// Protocol has no notion of at all.
//
// The other real trigger dimensions each reference their own existing
// dictionary rather than a free-text guess at the same data:
// originStationId → services/scanStations/ (the real "which bench"
// dictionary built earlier this session), orderingFacilityId →
// services/facilities/ (the real referring-facility dictionary).
// Same reasoning throughout this app: reference the one real
// dictionary for a concept, don't duplicate it as a second, drifting
// copy.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { DecantType } from '@/types/case/Material';

/** Same real, established priority vocabulary as OrderMetadata.priority
 *  (types/case/Case.ts) — that field's own doc comment explicitly warns
 *  against introducing a second, inconsistent priority vocabulary
 *  ("Fixed June 2026... two different, inconsistent priority
 *  vocabularies"); reusing the literal union rather than importing it
 *  directly for the same type-only-circular-import reasoning that
 *  comment documents. */
export type CassetteRuleOrderPriority = 'Routine' | 'Rush' | 'STAT';

/** All conditions are optional — an unset condition means "matches
 *  any value for this dimension," not "matches nothing." A rule with
 *  every condition unset is a genuine global default/catch-all,
 *  useful for the fallback logic the wider spec calls for. Multiple
 *  values within one condition (e.g. priority) are OR'd together;
 *  conditions across different dimensions are AND'd. */
export interface CassetteRoutingConditions {
  /** References protocols/IProtocolService.ts's own Protocol.id — see
   *  this file's own header comment for why this is also the
   *  authoritative source for cassette type/form-factor, never a
   *  second field here. */
  protocolId?: ID;
  priority?: CassetteRuleOrderPriority[];
  /** References services/scanStations/ — "requesting bench ID,
   *  workstation location." */
  originStationId?: ID;
  /** References services/facilities/ — "ordering facility/clinic." */
  orderingFacilityId?: ID;
  /** Guided free text, deliberately not a rigid enum — no existing
   *  dictionary models "case type" (Consultation, reference lab case,
   *  specific pathologist preference) as its own concept, and real
   *  lab vocabulary for this varies (confirmed directly — no shared
   *  standard found), same reasoning as ScanStation.workflowStage. */
  caseType?: string;
  /** Real feature, per direct follow-up: cell blocks (types/case/
   *  Material.ts's own Decant.decantType) "frequently use distinct
   *  cassette colors... to signal fragile cytopreparations to
   *  histotechnologists." Real, deliberate scope, per direct
   *  confirmation: PathScribe resolves which LOGICAL color a cell
   *  block gets (this condition, feeding evaluateCassetteRouting.ts) —
   *  it never models hopper numbers, hardware slots, or which
   *  physical bin holds that color's own stock. References the real,
   *  existing DecantType union directly — 'residual_fluid' and
   *  'cell_block' may reasonably route to different colors too, not
   *  just cell blocks specifically. Same OR-within-dimension pattern
   *  as priority above. */
  decantType?: DecantType[];
}

export interface CassetteRoutingRule {
  id: ID;
  /** e.g. "Prostate Core Protocol", "STAT Override" */
  name: string;
  description?: string;
  conditions: CassetteRoutingConditions;
  /**
   * Real fix, per direct follow-up's own two-layer architecture:
   * "Routing Dictionary Management: Interfaces to maintain color
   * keys, display names, and hex codes." Was free text
   * (cassetteColor: string, a rule literally spelling out "Blue" as
   * its own copy) — same real double-maintenance problem already
   * avoided for cassette TYPE, now avoided for color too. References
   * cassetteColors/ICassetteColorService.ts's own
   * CassetteColorDefinition.id — never a second, independently-typed
   * color name a rule and the real color dictionary could silently
   * disagree on.
   */
  colorId: ID;
  /** References a print layout/template — deliberately a loose,
   *  optional string key for now (not a hard foreign key into a
   *  template dictionary that doesn't exist yet) rather than
   *  inventing a whole second new dictionary this rule engine doesn't
   *  strictly need to function; a real template-picker can tighten
   *  this once that dictionary exists. */
  printTemplateKey?: string;
  /** Integer rank, higher wins — lets a specific rule (STAT override)
   *  outrank a general one (routine biopsy protocol) when both
   *  genuinely match the same real order. Real ties are broken by
   *  createdAt (earlier wins) — see the evaluation engine's own doc
   *  comment for why that, and not array order, is the deterministic
   *  tiebreak. */
  priorityWeight: number;
  active: boolean;
  /** Optional — an unset bound means "no start/end limit" on that
   *  side, not "never/always active." Real lab reality this exists
   *  for: a genuinely temporary operational change (a hopper down for
   *  service, a holiday-week protocol) that should lapse on its own
   *  rather than relying on someone remembering to deactivate it. */
  effectiveFrom?: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICassetteRoutingRuleService {
  getAll(): Promise<ServiceResult<CassetteRoutingRule[]>>;
  getById(id: ID): Promise<ServiceResult<CassetteRoutingRule>>;
  create(draft: Omit<CassetteRoutingRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<CassetteRoutingRule>>;
  update(id: ID, changes: Partial<Omit<CassetteRoutingRule, 'id'>>): Promise<ServiceResult<CassetteRoutingRule>>;
  deactivate(id: ID): Promise<ServiceResult<CassetteRoutingRule>>;
  reactivate(id: ID): Promise<ServiceResult<CassetteRoutingRule>>;
}
