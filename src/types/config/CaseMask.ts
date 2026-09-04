// src/types/config/CaseMask.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("Change the data model so each Facility/
// Department can have its own fully independent, separately-saved mask
// config"): replaces the old CaseMaskConfig (one record per
// organisationId, with sitePrefixMap/siteIndependentSequence/a
// department "override" all merged together at allocation time) with a
// genuinely simple model — each CaseMask is fully self-contained and
// independently defined at exactly one real scope point.
//
// Three real scope points, per direct guidance's own follow-ups:
//   - 'department' — a Department (services/departments/), matches
//     Department.id.
//   - 'facility'   — a performing-lab Facility (services/facilities/),
//     matches Facility.id. Restricted to roles.includes('performing_lab')
//     — a pure submitting/ordering facility never generates its own
//     accession numbers; whatever it sends gets numbered by whichever
//     real performing lab receives it. Confirmed directly: "a site is
//     a Facility that does testing... a Facility that actually has an
//     attached laboratory is defined as a Facility - Performing Lab."
//   - 'enterprise' — NOT a separate concept from 'facility'. Confirmed
//     directly against FacilityEditorModal.tsx's own Parent Enterprise
//     picker: an Enterprise is just a Facility record with
//     isEnterprise: true: "Only Enterprise-tagged facilities appear as
//     selectable Parent Enterprises... keeps a real affiliate from
//     accidentally pointing at another affiliate." Kept as its own
//     scopeType here (rather than folding it into 'facility') only
//     because the resolution walk (resolveCaseMaskScopeCandidates.ts)
//     needs to distinguish "this case's own performing lab" from "the
//     Enterprise ancestor reached by walking parentId" as two, real,
//     separately-triable candidates in order — the underlying id is
//     still always a real Facility.id either way.
//
// Deliberately no {SITE}/{CAT}/{DEPT} tokens (see the old
// CaseMaskConfig.ts's own CaseMaskToken for what those did) — those
// existed specifically so one, shared, org-level pattern could show a
// lower level's own prefix/name without that lower level having a
// real, separate mask of its own. Now that a Department/Facility gets
// a genuinely complete, independent CaseMask the moment it needs to
// differ at all, that indirection has no real job left to do.
// ─────────────────────────────────────────────────────────────────────────────

export type CaseMaskScopeType = 'enterprise' | 'facility' | 'department';

/** Supported mask template tokens. {SEQ:N} is the only parameterized
 *  one — N is the zero-padded digit count, e.g. {SEQ:4} -> "0029". */
export type CaseMaskToken = '{PREFIX}' | '{YEAR:4}' | '{YEAR:2}' | '{SEQ:N}';

export interface CaseMask {
  /** Real Firestore/storage doc id. Always equal to scopeId — exactly
   *  one CaseMask can exist per real scope point, so the scope's own
   *  id is already a real, natural, collision-free primary key. */
  id: string;
  scopeType: CaseMaskScopeType;
  /** Department.id when scopeType is 'department'; Facility.id (the
   *  performing lab itself, or the Facility where isEnterprise is
   *  true) when scopeType is 'facility' or 'enterprise'. */
  scopeId: string;
  /** e.g. 'MFT', 'DVMC', 'S' (Surgical), 'NG' (Non-GYN Cytology) —
   *  feeds the {PREFIX} token. */
  prefix: string;
  /** e.g. "{PREFIX}{YEAR:2}-{SEQ:4}" -> "MFT26-0029". Fully owned by
   *  this one CaseMask — no merging with any other scope's pattern. */
  maskPattern: string;
  /** The digit count for the {SEQ:N} portion of maskPattern — kept as
   *  its own field (not re-parsed out of maskPattern every allocation)
   *  since the record itself needs to know how to format the number
   *  it's counting, independent of the rest of the pattern. */
  sequenceDigits: number;
  /** Last sequence number actually issued — allocateNextCaseNumber
   *  reads this, increments, and writes it back inside the same
   *  transaction. Wholly this CaseMask's own counter — never shared
   *  with, or merged into, any other scope's sequence. */
  currentSequence: number;
  resetSequenceAnnually: boolean;
  /** Set whenever the sequence was last reset — allocateNextCaseNumber
   *  compares this against the current (real, facility-timezone)
   *  year to decide whether a reset is due, rather than relying on
   *  any wall-clock side channel. */
  lastResetYear?: number;
  updatedBy: string;
  updatedAt: string;
}

/** The fallback shape used when no CaseMask exists at any real scope
 *  for a given case — mirrors the old system's own fallback exactly
 *  (prefix 'O', 2-digit year, 4-digit sequence), so a case with
 *  nothing configured anywhere keeps working exactly as it does
 *  today rather than failing. See resolveEffectiveCaseMask's own
 *  fallback path. */
export const DEFAULT_FALLBACK_MASK = '{PREFIX}{YEAR:2}-{SEQ:4}';
export const DEFAULT_FALLBACK_PREFIX = 'O';
export const DEFAULT_FALLBACK_SEQUENCE_DIGITS = 4;
