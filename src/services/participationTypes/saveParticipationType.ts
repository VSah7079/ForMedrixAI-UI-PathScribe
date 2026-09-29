// src/services/participationTypes/saveParticipationType.ts
// ─────────────────────────────────────────────────────────────────────────────
// Saving a participation type, including the compliance audit trail for
// facility-level sign-out authority overrides — moved out of
// components/Config/System/ParticipationTypesSection.tsx (standing rule:
// no business logic in components; the component now only calls this).
//
// Order is deliberate: stamp provenance (who/when/why) onto every added,
// changed, reverted, or re-justified facility override → persist → and
// only if the save succeeded, write one audit entry per change. Never an
// audit record for a change that didn't land. Untouched overrides keep
// their original provenance (see stampFacilityOverrideChanges()).
// Batch 335: a successful save also clears the shared participation-type
// cache (utils/participationTypeLookup.ts) used by the sign-out check.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { IAuditService } from '../auditlog/IAuditService';
import type { IParticipationTypeService, NewParticipationType, ParticipationTypeRecord } from './IParticipationTypeService';
import { stampFacilityOverrideChanges, buildFacilityOverrideAuditEntry } from './authorityProvenance';
import { invalidateParticipationTypeLookup } from '../../utils/participationTypeLookup';

export interface AuditActor { userId: string; userName: string }

/** The acting admin, from a session user record. Literal fallbacks are
 *  audit-record data (compliance artifacts are English by this app's
 *  convention), never shown as UI chrome. */
export function resolveAuditActor(session: { id?: string; firstName?: string; lastName?: string } | null | undefined): AuditActor {
  const name = [session?.firstName, session?.lastName].filter(Boolean).join(' ');
  return { userId: session?.id ?? 'unknown', userName: name || session?.id || 'Unknown user' };
}

export interface SaveParticipationTypeInput {
  mode: 'add' | 'edit';
  /** The stored record being edited (edit mode). */
  existing?: ParticipationTypeRecord;
  draft: NewParticipationType;
  /** Per facility id — the justification the admin entered this session. */
  justifications: Record<string, string>;
  /** Facility id → display name, for human-readable audit entries. */
  facilityNames: Record<string, string>;
  actor: AuditActor;
  /** Injectable for tests; defaults to the current time. */
  now?: () => string;
}

export async function saveParticipationTypeWithAudit(
  input: SaveParticipationTypeInput,
  deps: { typeService: IParticipationTypeService; auditService: Pick<IAuditService, 'logEvent'> },
): Promise<ServiceResult<ParticipationTypeRecord>> {
  const { mode, existing, draft, justifications, facilityNames, actor, now = () => new Date().toISOString() } = input;

  const { overrides, changes } = stampFacilityOverrideChanges(existing?.authorityOverrides, draft.authorityOverrides, justifications, actor, now());
  const stamped = { ...draft, authorityOverrides: overrides };

  if (mode === 'edit' && !existing) return { ok: false, error: 'No participation type selected to update.' };
  const saved = mode === 'add'
    ? await deps.typeService.add(stamped)
    : await deps.typeService.update(existing!.id, stamped);
  if (!saved.ok) return saved;
  // Batch 335: the sign-out check reads a cached list; drop it so the new
  // rules apply without a page reload.
  invalidateParticipationTypeLookup();

  for (const change of changes) {
    deps.auditService
      .logEvent(buildFacilityOverrideAuditEntry(change, saved.data.label, facilityNames[change.facilityId] ?? change.facilityId, actor.userName))
      .catch(e => console.error('[saveParticipationTypeWithAudit] Failed to write signing-authority override audit entry:', e));
  }
  return saved;
}
