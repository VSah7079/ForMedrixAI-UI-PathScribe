// src/services/autopsy/formatConsentingRelativePriorityHint.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "it all needs to be wired." The
// existing "Relationship" field in AccessionPage.tsx's own
// hospital_consented section is genuine free text (real, deliberate
// choice — see that field's own placeholder), not the structured
// ConsentingRelativeRelationship enum resolveConsentingRelativePriority.ts
// operates on. Rather than force a schema change onto an already-
// working, real field, this is a real, simple, informational hint
// shown alongside it — the jurisdiction's own priority order, in
// human-readable form, so an accessioner has real, useful context
// even though the field itself stays free text.
//
// Real, deliberate readable-label mapping — kept here, not in
// resolveConsentingRelativePriority.ts itself, since that file's own
// scope is real legal ordering, never display formatting.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';
import { resolveConsentingRelativePriority, type ConsentingRelativeRelationship } from './resolveConsentingRelativePriority';

const RELATIONSHIP_LABELS: Record<ConsentingRelativeRelationship, string> = {
  spouse_or_partner: 'Spouse/Partner', adult_child: 'Adult Child', parent: 'Parent',
  parent_or_child: 'Parent or Child', adult_sibling: 'Adult Sibling', sibling: 'Sibling',
  child: 'Child', grandparent: 'Grandparent', grandparent_or_grandchild: 'Grandparent or Grandchild',
  guardian_at_death: 'Guardian at Death', niece_or_nephew: 'Niece/Nephew', stepparent: 'Stepparent',
  half_sibling: 'Half-Sibling', longstanding_friend: 'Longstanding Friend',
};

/** Real, deliberate undefined return for a real jurisdiction with no
 *  defined order (see resolveConsentingRelativePriority.ts's own
 *  scope) — a real caller shows nothing, never a fabricated hint. */
export function formatConsentingRelativePriorityHint(jurisdiction: Jurisdiction): string | undefined {
  const order = resolveConsentingRelativePriority(jurisdiction);
  if (!order) return undefined;
  return `Priority order for this jurisdiction: ${order.map(rel => RELATIONSHIP_LABELS[rel]).join(' > ')}`;
}
