// src/services/participationTypes/IParticipationTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Service interface for participation types.
// Dev: mockParticipationTypeService (localStorage-backed)
// Live: FirestoreParticipationTypeService (customer Firestore collection)
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

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
   * IMPORTANT, flagged directly rather than silently assumed: this
   * only configures the record. Real finalize/countersign enforcement
   * (services/auth/caseAccessControl.ts's canFinalizeCase()) does NOT
   * currently consult canFinalize/requiresCountersign at all — it's a
   * separate, hardcoded FINALIZE_ELIGIBLE_PARTICIPATION_TYPES literal
   * ('primary'/'attending'), denormalized into Case.eligibleFinalizerIds
   * for Firestore rules by deriveEligibleFinalizerIds(). Wiring real
   * enforcement (client-side gate + the Firestore rules mirror) to
   * actually read this data, lab-scoped or not, is a separate, real,
   * security-relevant change that needs its own explicit go-ahead —
   * not bundled into this data-model addition.
   */
  authorityOverrides?: Record<string, {
    canFinalize?:          boolean;
    requiresCountersign?:  boolean;
    canViewWholeCase?:     boolean;
  }>;
}

/**
 * Resolves this type's EFFECTIVE authority flags for a given performing
 * lab — the lab's own override where set, falling back to the platform
 * default field-by-field (a lab can override just canFinalize and leave
 * requiresCountersign at the platform default, for instance; there's no
 * "all or nothing" per lab). Undefined/no matching override, or no
 * performingLabFacilityId given at all (global/unscoped context), always
 * resolves to the platform default — the same value every caller already
 * got before authorityOverrides existed, so adding an override to one lab
 * can never silently change behavior anywhere else.
 */
export function resolveParticipationTypeAuthority(
  type: ParticipationTypeRecord,
  performingLabFacilityId?: string,
): { canFinalize?: boolean; requiresCountersign?: boolean; canViewWholeCase?: boolean } {
  const base = {
    canFinalize:         type.canFinalize,
    requiresCountersign: type.requiresCountersign,
    canViewWholeCase:    type.canViewWholeCase,
  };
  const override = performingLabFacilityId ? type.authorityOverrides?.[performingLabFacilityId] : undefined;
  if (!override) return base;
  return {
    canFinalize:         override.canFinalize         ?? base.canFinalize,
    requiresCountersign: override.requiresCountersign ?? base.requiresCountersign,
    canViewWholeCase:    override.canViewWholeCase     ?? base.canViewWholeCase,
  };
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
