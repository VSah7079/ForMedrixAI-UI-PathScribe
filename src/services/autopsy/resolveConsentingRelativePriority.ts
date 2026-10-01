// src/services/autopsy/resolveConsentingRelativePriority.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own reference in
// types/autopsy/AutopsyCaseDetails.ts's own HospitalConsentRecord doc
// comment — Phase 2 of the 8-phase Autopsy Pathology Module build
// (PS-261, RFP-APLIS-2026-GLOBAL §3.1.C). Covers exactly the three
// real systems that comment names — "US state law vs. UK HTA 2004 vs.
// NZ Coroners Act 2006" — never silently extended to a jurisdiction
// that comment didn't name (Scotland has its own, separate Human
// Tissue (Scotland) Act 2006 "nearest relative" provisions, genuinely
// distinct from HTA 2004's below; not modeled here — real, honest gap,
// not an oversight).
//
// Real, important limitation, stated plainly rather than glossed
// over: this app's own Jurisdiction type has a single 'US' value, but
// real US consent-priority law is set state-by-state (each state's
// own Uniform Anatomical Gift Act variant, with real local
// differences — domestic-partner recognition, whether an adult
// grandchild ranks before a parent, etc.). US_COMMON_PRIORITY below
// reflects the priority order the large majority of states' own UAGA
// adoptions share, not a state-by-state legal certainty. Per direct
// guidance's own confirmed framing, this function is decision
// support — it surfaces who to approach first — never a silent,
// irreversible gate on a real workflow action. A real deployment
// needs real jurisdiction-specific (and, for the US, state-specific)
// legal sign-off before this ordering is relied on unsupervised.
//
// UK_HTA_2004_PRIORITY reflects the Human Tissue Act 2004's own
// qualifying-relationship hierarchy; NZ_CORONERS_ACT_2006_PRIORITY
// reflects the Coroners Act 2006's own immediate-family provisions
// for post-mortem consent/objection.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

export type ConsentingRelativeRelationship =
  | 'spouse_or_partner'
  | 'adult_child'
  | 'parent'
  | 'parent_or_child'
  | 'adult_sibling'
  | 'sibling'
  | 'child'
  | 'grandparent'
  | 'grandparent_or_grandchild'
  | 'guardian_at_death'
  | 'niece_or_nephew'
  | 'stepparent'
  | 'half_sibling'
  | 'longstanding_friend';

/** Real, common UAGA-pattern order — see this file's own header
 *  comment for the real, stated limitation (not exhaustive
 *  state-by-state law). */
const US_COMMON_PRIORITY: ConsentingRelativeRelationship[] = [
  'spouse_or_partner', 'adult_child', 'parent', 'adult_sibling', 'grandparent', 'guardian_at_death',
];

/** Real, per the Human Tissue Act 2004's own qualifying-relationship
 *  hierarchy — England & Wales and Northern Ireland share this one,
 *  real act. */
const UK_HTA_2004_PRIORITY: ConsentingRelativeRelationship[] = [
  'spouse_or_partner', 'parent_or_child', 'sibling', 'grandparent_or_grandchild',
  'niece_or_nephew', 'stepparent', 'half_sibling', 'longstanding_friend',
];

/** Real, per the Coroners Act 2006's own immediate-family provisions. */
const NZ_CORONERS_ACT_2006_PRIORITY: ConsentingRelativeRelationship[] = [
  'spouse_or_partner', 'parent', 'child', 'sibling',
];

/** Real, per direct guidance's own confirmed scope. Returns the real,
 *  ordered (highest priority first) list of relationship categories
 *  recognized for a real case's own jurisdiction, or undefined for
 *  any real jurisdiction this module doesn't model a priority order
 *  for — never a guessed or extrapolated order for an unnamed
 *  jurisdiction. */
export function resolveConsentingRelativePriority(jurisdiction: Jurisdiction): ConsentingRelativeRelationship[] | undefined {
  switch (jurisdiction) {
    case 'US': return US_COMMON_PRIORITY;
    case 'GB_EW':
    case 'GB_NIR': return UK_HTA_2004_PRIORITY;
    case 'NZ': return NZ_CORONERS_ACT_2006_PRIORITY;
    default: return undefined;
  }
}

/** Real, per direct guidance's own confirmed "decision support, never
 *  a silent gate" framing — given the real relationships actually
 *  available for a real case (i.e., which of the deceased's relatives
 *  are alive and reachable), returns the single, real highest-
 *  priority one to approach first. Returns undefined when the
 *  jurisdiction has no defined order (see above) or when none of the
 *  real, available relationships appear in that order at all — never
 *  a fabricated default relative. */
export function resolveHighestPriorityConsentingRelative(
  jurisdiction: Jurisdiction,
  availableRelationships: ConsentingRelativeRelationship[],
): ConsentingRelativeRelationship | undefined {
  const order = resolveConsentingRelativePriority(jurisdiction);
  if (!order) return undefined;
  return order.find(rel => availableRelationships.includes(rel));
}
