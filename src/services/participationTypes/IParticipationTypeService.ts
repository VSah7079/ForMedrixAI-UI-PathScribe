// src/services/participationTypes/IParticipationTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Service interface for participation types.
// Dev: mockParticipationTypeService (localStorage-backed)
// Live: FirestoreParticipationTypeService (customer Firestore collection)
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { Jurisdiction } from '../../types/systemConfig';

/** The three compliance-relevant authority flags every resolution tier can set. */
export type AuthorityFlag = 'canFinalize' | 'requiresCountersign' | 'canViewWholeCase';
export const AUTHORITY_FLAGS: readonly AuthorityFlag[] = ['canFinalize', 'requiresCountersign', 'canViewWholeCase'];

/**
 * One facility-level ("break-glass") override of a participation type's
 * authority — the most specific tier in resolveParticipationTypeAuthority().
 *
 * Real, per direct guidance (Sep 2026): because these override a
 * jurisdiction's own regulatory default (NATA/RCPath/RCPI/CPSO/MHW…),
 * every override carries its own provenance — who set it, when, and an
 * optional justification (e.g. "Medical Director approval ref MD-2026-14,
 * BMS credentialed under IBMS HSRP scheme") — shown back to admins as
 * the rule's source of truth and written to the audit log on every
 * change. Provenance is optional only so overrides created before this
 * existed still load; every new or changed override is stamped
 * (services/participationTypes/authorityProvenance.ts).
 */
export interface FacilityAuthorityOverride {
  canFinalize?:          boolean;
  requiresCountersign?:  boolean;
  canViewWholeCase?:     boolean;
  overriddenBy?:         { userId: string; userName: string };
  /** ISO timestamp of the most recent change to this override. */
  overriddenAt?:         string;
  justification?:        string;
}

export interface ParticipationTypeRecord {
  id:              string;
  label:           string;
  description:     string;
  color:           string;
  icon?:           string;
  allowsMultiple:  boolean;
  requiresNote:    boolean;
  active:          boolean;
  isSystem:        boolean;
  sortOrder:       number;
  /** Whether this participation type can be assigned a report template
   *  for structured reporting (e.g. a synoptic template). */
  canBeAssignedTemplate?: boolean;
  /** Whether someone holding this participation type can view the
   *  entire case (all specimens and prior reports), not just what
   *  they're specifically working on. */
  canViewWholeCase?:      boolean;
  /** Short badge text (2-6 chars) shown on case team chips. */
  abbreviation?:        string;
  /** Whether this participation type's work requires a supervising
   *  countersign before the case can finalize. */
  requiresCountersign?: boolean;
  /** Whether someone holding this participation type can finalize
   *  (sign out) the case themselves. */
  canFinalize?:          boolean;

  /**
   * Per-performing-lab overrides of this type's own sign-out-authority
   * flags — real, per direct ruling: signing authority and delegation
   * rules genuinely vary by country/legal jurisdiction (US CLIA/CAP
   * standardized roles vs. UK/Ireland RCPath's Consultant/Specialty
   * Registrar delegation rules vs. France/Germany/South Korea's
   * personal-liability-for-the-diagnostic-act mandates), so a rigid
   * global bright line on canFinalize/requiresCountersign/
   * canViewWholeCase can't hold across a real multi-region enterprise.
   *
   * Deliberately kept additive rather than forking the whole type per
   * lab (the ContainerTypesSection-style pattern): label/abbreviation/
   * color/description/allowsMultiple stay real platform defaults, one
   * shared vocabulary ("Primary", "Attending", etc.) across every lab —
   * only the compliance-relevant authority flags vary. Key is a real
   * performingLabFacilityId (see utils/performingLabs.ts); a lab with
   * no entry here uses the platform default (canFinalize etc. above)
   * unchanged. Use resolveParticipationTypeAuthority() below to read
   * the effective, resolved value — never this map or the base fields
   * directly, so resolution logic can never drift out of sync between
   * call sites.
   *
   * Real enforcement (updated — this note previously said enforcement
   * did NOT consult this map; that's no longer true): canFinalize is
   * read by services/auth/caseAccessControl.ts's canFinalizeCase()/
   * resolveFinalizeEligibleTypeIds(), and requiresCountersign by
   * resolveCountersignRequiredTypeIds() (PS-327), both via
   * resolveParticipationTypeAuthority() below, for useSignOutWorkflow.ts's
   * Surg Path sign-out and Assist-mode finalize. Still NOT consulted by
   * deriveEligibleFinalizerIds() (the flat Case.eligibleFinalizerIds
   * denormalization — platform default only, a disclosed tradeoff in
   * that function's own doc comment) or by Cytology/Autopsy sign-out
   * (neither resolves participation types at all yet).
   */
  authorityOverrides?: Record<string, FacilityAuthorityOverride>;

  /**
   * Real, per direct correction (Sep 2026): the facility-keyed
   * `authorityOverrides` above models a genuine, narrower case (one
   * specific lab granted or denied authority beyond its country's own
   * norm), but signing-authority regulation is fundamentally
   * JURISDICTION-bound, not facility-bound — NATA (AU), RCPA (AU/NZ),
   * RCPath (UK), RCPI (Ireland), CPSO/RCPSC (Canada), MHW (South
   * Korea), and each EU member state's own national medical act all
   * govern every lab in that country identically. Recording the same
   * rule once per lab (duplicated across every lab in a country) would
   * be both more error-prone (an admin could miss one lab) and a
   * misrepresentation of where the rule actually comes from. This is
   * the real, country-scoped counterpart: keyed by `Jurisdiction`
   * (`types/systemConfig.ts` — already the same field `Facility.
   * jurisdiction` uses), carrying the real local role title and
   * regulatory citation alongside the effective authority flags for
   * that jurisdiction, since both come from the same real source (the
   * named regulatory body) and an admin/compliance reviewer needs to
   * see them together, not as two independently-drifting records.
   *
   * Resolution order, in `resolveParticipationTypeAuthority()` below:
   * a facility-specific `authorityOverrides` entry (the more specific,
   * already-shipped mechanism — a genuine lab-level exception to its
   * own country's norm) wins when present; otherwise this jurisdiction
   * profile; otherwise the platform default. Additive — a type with no
   * `jurisdictionProfiles` entry for a given jurisdiction resolves
   * exactly as it always has.
   */
  jurisdictionProfiles?: Partial<Record<Jurisdiction, {
    /** Real local title for this role in this jurisdiction (e.g.
     *  "Specialty Registrar (StR)" for GB_EW, "Jeon-gong-ui (Resident)"
     *  for KR) — shown in place of the platform-default `label` above
     *  wherever a jurisdiction is known. Optional: a jurisdiction can
     *  carry just a regulatory authority override with no distinct
     *  local title, or vice versa. */
    label?: string;
    /** The real regulatory body/citation driving this jurisdiction's
     *  rule (e.g. "RCPath guidelines — task-shifting limits require
     *  strict credentialing/supervision for BMS primary reporting") —
     *  admin/compliance-facing context, never machine-read. */
    regulatoryNote?: string;
    canFinalize?:          boolean;
    requiresCountersign?:  boolean;
    canViewWholeCase?:     boolean;
    /** Batch 335 (PS-341): provenance of the last change made in System →
     *  Country Signing Rules. Absent on seeded profiles never edited. */
    updatedBy?:            { userId: string; userName: string };
    updatedAt?:            string;
    changeReason?:         string;
  }>>;

  /**
   * Real, per direct correction (Sep 2026): some roles aren't a local
   * NAME for an otherwise-universal type — they're a genuinely
   * distinct role with no equivalent elsewhere (the UK's non-physician
   * Biomedical Scientist holding primary-reporting rights under RCPath
   * task-shifting guidelines has no equivalent scope/legal standing in
   * the US, Canada, or South Korea's models). Undefined/omitted means
   * a global baseline type, available at any facility regardless of
   * jurisdiction (the existing, default behavior for every type this
   * app already had before this field existed). Present means this
   * type is a genuinely region-specific role — real admin UI/case-team
   * assignment surfaces should treat it as only relevant/offered at a
   * facility whose own `Facility.jurisdiction` is in this list, not a
   * universally-applicable option that happens to carry a country-
   * flavored label.
   */
  scopedJurisdictions?: Jurisdiction[];
}

/**
 * Resolves this type's EFFECTIVE authority flags, real per-lab-then-
 * per-jurisdiction, field-by-field (a lab or a country can override
 * just canFinalize and leave requiresCountersign at the platform
 * default, for instance; there's no "all or nothing" at either level).
 *
 * Resolution order, most specific wins — same real precedence pattern
 * already established elsewhere in this codebase (TAT Config, Template
 * Routing, Routing Rules: lab-specific beats Global):
 *   1. `authorityOverrides[performingLabFacilityId]` — a genuine,
 *      lab-level exception to its own country's norm (the original,
 *      already-shipped mechanism).
 *   2. `jurisdictionProfiles[jurisdiction]` — the country/region's own
 *      real regulatory norm (NATA/RCPath/RCPI/CPSO/RCPSC/MHW/EU member-
 *      state directives — see that field's own doc comment).
 *   3. The platform default (`canFinalize`/`requiresCountersign`/
 *      `canViewWholeCase` above).
 * Any input omitted (no performingLabFacilityId, no jurisdiction, or
 * neither map has a matching entry) simply skips that tier — the same
 * value every caller already got before either override mechanism
 * existed, so adding an override at either level can never silently
 * change behavior anywhere it wasn't explicitly configured.
 */
export function resolveParticipationTypeAuthority(
  type: ParticipationTypeRecord,
  performingLabFacilityId?: string,
  jurisdiction?: Jurisdiction,
): { canFinalize?: boolean; requiresCountersign?: boolean; canViewWholeCase?: boolean } {
  const base = {
    canFinalize:         type.canFinalize,
    requiresCountersign: type.requiresCountersign,
    canViewWholeCase:    type.canViewWholeCase,
  };
  const jurisdictionProfile = jurisdiction ? type.jurisdictionProfiles?.[jurisdiction] : undefined;
  const withJurisdiction = jurisdictionProfile ? {
    canFinalize:         jurisdictionProfile.canFinalize         ?? base.canFinalize,
    requiresCountersign: jurisdictionProfile.requiresCountersign ?? base.requiresCountersign,
    canViewWholeCase:    jurisdictionProfile.canViewWholeCase    ?? base.canViewWholeCase,
  } : base;

  const labOverride = performingLabFacilityId ? type.authorityOverrides?.[performingLabFacilityId] : undefined;
  if (!labOverride) return withJurisdiction;
  return {
    canFinalize:         labOverride.canFinalize         ?? withJurisdiction.canFinalize,
    requiresCountersign: labOverride.requiresCountersign ?? withJurisdiction.requiresCountersign,
    canViewWholeCase:    labOverride.canViewWholeCase     ?? withJurisdiction.canViewWholeCase,
  };
}

/**
 * Resolves this type's EFFECTIVE display label for a given jurisdiction
 * — the jurisdiction's own real local title where one is recorded
 * (`jurisdictionProfiles[jurisdiction].label`), falling back to the
 * platform-default `label`. Separate from `resolveParticipationTypeAuthority()`
 * since a caller may want the label without an authority decision (a
 * read-only case-team display, for instance) — kept as its own small,
 * pure function rather than folding a string into that function's own
 * numeric/boolean-flag return shape.
 */
export function resolveParticipationTypeLabel(
  type: ParticipationTypeRecord,
  jurisdiction?: Jurisdiction,
): string {
  const profileLabel = jurisdiction ? type.jurisdictionProfiles?.[jurisdiction]?.label : undefined;
  return profileLabel ?? type.label;
}

/**
 * Real, per direct guidance ("Country-Scope Regional Roles"): whether a
 * participation type is offered at a facility in the given jurisdiction.
 * A type with no `scopedJurisdictions` is a global baseline type,
 * offered everywhere; a scoped type only where its jurisdiction matches.
 * An unknown jurisdiction (no facility context) offers global types
 * only — never a region-specific role guessed into a context it may not
 * legally belong in.
 */
export function isParticipationTypeOfferedIn(type: ParticipationTypeRecord, jurisdiction?: Jurisdiction): boolean {
  if (!type.scopedJurisdictions || type.scopedJurisdictions.length === 0) return true;
  return !!jurisdiction && type.scopedJurisdictions.includes(jurisdiction);
}

/**
 * The participation types a case-team editor should offer for one case,
 * each presented for that case's own performing lab and jurisdiction:
 * only types valid in the jurisdiction (a UK-only role never appears on
 * a Canadian case) — plus any type an active participant already holds,
 * so a real assignment is never silently hidden — each carrying the
 * jurisdiction's local title and its EFFECTIVE authority flags (the same
 * lab → jurisdiction → platform resolution the sign-out gate enforces).
 * Moved out of CaseTeamModal.tsx (no business logic in components).
 */
export function resolveCaseTeamParticipationTypes(
  types: ParticipationTypeRecord[],
  scope: { performingLabFacilityId?: string; jurisdiction?: Jurisdiction },
  heldTypeIds: ReadonlySet<string>,
): ParticipationTypeRecord[] {
  return types
    .filter(pt => isParticipationTypeOfferedIn(pt, scope.jurisdiction) || heldTypeIds.has(pt.id))
    .map(pt => ({
      ...pt,
      label: resolveParticipationTypeLabel(pt, scope.jurisdiction),
      ...resolveParticipationTypeAuthority(pt, scope.performingLabFacilityId, scope.jurisdiction),
    }));
}

export type NewParticipationType = Omit<ParticipationTypeRecord, 'id' | 'isSystem' | 'sortOrder'>;

export interface IParticipationTypeService {
  getAll():                                          Promise<ServiceResult<ParticipationTypeRecord[]>>;
  getActive():                                       Promise<ServiceResult<ParticipationTypeRecord[]>>;
  getById(id: ID):                                   Promise<ServiceResult<ParticipationTypeRecord>>;
  add(type: NewParticipationType):                   Promise<ServiceResult<ParticipationTypeRecord>>;
  update(id: ID, changes: Partial<ParticipationTypeRecord>): Promise<ServiceResult<ParticipationTypeRecord>>;
  deactivate(id: ID):                                Promise<ServiceResult<ParticipationTypeRecord>>;
  reactivate(id: ID):                                Promise<ServiceResult<ParticipationTypeRecord>>;
  remove(id: ID):                                    Promise<ServiceResult<void>>;
}
