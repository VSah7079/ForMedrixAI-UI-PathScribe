// src/services/cases/caseHolds.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 381 (PS-359, and Pete: "Add, keep today's users"). Placing and
// releasing a case hold or a retention hold used to happen inside the two
// modals, with no permission check and no audit entry. This does the work:
//   1. the note the organisation's Field Requirements need (locked today),
//   2. the capability for that hold and step, for the case's facility,
//   3. the case's current holds, read fresh (never a stale copy), so two
//      people can't overwrite each other's hold,
//   4. the new or released hold, saved against the case's version,
//   5. an audit entry (literal English, no free-text note: notes can name
//      people),
//   6. the case's new version, for the report page: before this, a hold
//      moved the case's version on without the page knowing, so the page's
//      next save (a comment, a draft) was refused as someone else's change.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { CaseHold, CaseHoldReason } from '@/types/case/CaseHold';
import type { RetentionHold, RetentionHoldReason } from '@/types/case/RetentionHold';
import type { IAuthorizationService } from '../authorization/authorizationService';
import type { NewAuditLog } from '../auditlog/IAuditService';
import type { ResolvedFieldRequirement } from '../fieldRequirements/fieldRequirementRules';
import { holdMissing, type HoldKind } from '../fieldRequirements/reportPageChecks';
import { ConcurrencyConflictError } from './ConcurrencyConflictError';

type AnyHold = CaseHold | RetentionHold;
type HoldList<K extends HoldKind> = K extends 'case' ? CaseHold[] : RetentionHold[];

const FIELD: Record<HoldKind, 'caseHolds' | 'retentionHolds'> = { case: 'caseHolds', retention: 'retentionHolds' };
type Enforce = Pick<IAuthorizationService, 'enforce'>;
type Ctx = { caseId: string; facilityId: string | null };
// Literal keys, so the capabilities guard can see each check.
const CHECK: Record<HoldKind, { place: (a: Enforce, ctx: Ctx) => ReturnType<Enforce['enforce']>; release: (a: Enforce, ctx: Ctx) => ReturnType<Enforce['enforce']> }> = {
  case: {
    place:   (a, ctx) => a.enforce('case:hold:place', ctx),
    release: (a, ctx) => a.enforce('case:hold:release', ctx),
  },
  retention: {
    place:   (a, ctx) => a.enforce('case:retention-hold:place', ctx),
    release: (a, ctx) => a.enforce('case:retention-hold:release', ctx),
  },
};
const LABEL: Record<HoldKind, string> = { case: 'Case hold', retention: 'Retention hold' };

export interface HoldDeps {
  authorization: Pick<IAuthorizationService, 'enforce'>;
  getCase: (caseId: string) => Promise<Case | undefined>;
  updateCase: (caseId: string, patch: Partial<Case>, knownVersion?: number) => Promise<unknown>;
  audit: (entry: NewAuditLog) => Promise<unknown>;
  now?: () => string;
}

export interface HoldActor { id: string; name: string }

export type HoldResult<K extends HoldKind> =
  | {
      ok: true; holds: HoldList<K>;
      /** The case's version after the save, so the report page's next save doesn't read as someone else's change. */
      version: number | undefined;
    }
  | { ok: false; reason: 'missing' | 'notPermitted' | 'caseNotFound' | 'alreadyOnHold' | 'noActiveHold' | 'conflict' | 'failed'; missing?: string[] };

const holdsOf = (c: Case, kind: HoldKind): AnyHold[] => ((c as unknown as Record<string, AnyHold[] | undefined>)[FIELD[kind]] ?? []);

async function save<K extends HoldKind>(
  kind: K, c: Case, holds: AnyHold[], deps: HoldDeps, event: string, detail: string, actor: HoldActor,
): Promise<HoldResult<K>> {
  try {
    await deps.updateCase(c.id, { [FIELD[kind]]: holds } as Partial<Case>, (c as { version?: number }).version);
  } catch (e) {
    return { ok: false, reason: e instanceof ConcurrencyConflictError ? 'conflict' : 'failed' };
  }
  await deps.audit({ type: 'user', event, detail, user: actor.name, caseId: c.id, confidence: null });
  const saved = await deps.getCase(c.id);
  return { ok: true, holds: holds as HoldList<K>, version: saved?.version };
}

/** Places a hold of this kind on the case. */
export async function placeHold<K extends HoldKind>(
  kind: K, caseId: string, input: { reason: K extends 'case' ? CaseHoldReason : RetentionHoldReason; note: string },
  actor: HoldActor, requirements: readonly ResolvedFieldRequirement[], deps: HoldDeps,
): Promise<HoldResult<K>> {
  const missing = holdMissing(kind, 'place', input.note, requirements);
  if (missing.length) return { ok: false, reason: 'missing', missing };
  const c = await deps.getCase(caseId);
  if (!c) return { ok: false, reason: 'caseNotFound' };
  const decision = await CHECK[kind].place(deps.authorization, { caseId, facilityId: c.order?.facilityId ?? null });
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };
  const current = holdsOf(c, kind);
  if (current.some(h => h.active)) return { ok: false, reason: 'alreadyOnHold' };
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const hold = {
    id: `${kind === 'case' ? 'casehold' : 'hold'}-${Date.parse(now) || Date.now()}`,
    reason: input.reason, note: input.note.trim(),
    setAt: now, setByUserId: actor.id, setByUserName: actor.name, active: true,
  } as AnyHold;
  return save(kind, c, [...current, hold], deps, `${LABEL[kind]} placed`, `${LABEL[kind]} placed (reason: ${input.reason}).`, actor);
}

/** Releases the case's active hold of this kind. */
export async function releaseHold<K extends HoldKind>(
  kind: K, caseId: string, input: { releaseNote: string },
  actor: HoldActor, requirements: readonly ResolvedFieldRequirement[], deps: HoldDeps,
): Promise<HoldResult<K>> {
  const missing = holdMissing(kind, 'release', input.releaseNote, requirements);
  if (missing.length) return { ok: false, reason: 'missing', missing };
  const c = await deps.getCase(caseId);
  if (!c) return { ok: false, reason: 'caseNotFound' };
  const decision = await CHECK[kind].release(deps.authorization, { caseId, facilityId: c.order?.facilityId ?? null });
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };
  const current = holdsOf(c, kind);
  const active = current.find(h => h.active);
  if (!active) return { ok: false, reason: 'noActiveHold' };
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const updated = current.map(h => (h.id === active.id ? {
    ...h, active: false, releasedAt: now, releasedByUserId: actor.id, releasedByUserName: actor.name, releaseNote: input.releaseNote.trim(),
  } : h));
  return save(kind, c, updated, deps, `${LABEL[kind]} released`, `${LABEL[kind]} released (reason it was placed: ${active.reason}).`, actor);
}
