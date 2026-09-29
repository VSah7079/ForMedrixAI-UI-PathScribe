// src/services/governingBodies/governingBodyAdministration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 371: saving the governing-body settings (which CAP / RCPath / ICCR /
// RCPA content syncs into the platform's synoptic library). This is a
// platform-wide setting, so it needs platform:governing-bodies:manage,
// which only the Superadmin role (ForMedrixAI support) holds. Before this
// the screen was shown to every administrator with `isSuperAdmin={true}`
// hard-coded (docs/architecture/ACCESS_CONTROL_PLAN.md).
// ─────────────────────────────────────────────────────────────────────────────

import type { IAuthorizationService } from '../authorization/authorizationService';
import type { GoverningBody } from './IGoverningBodyService';

export type SaveGoverningBodiesResult = { ok: true } | { ok: false; reason: 'notPermitted' };

export async function saveGoverningBodies(
  bodies: GoverningBody[],
  deps: { authorization: Pick<IAuthorizationService, 'enforce'>; service: { saveAll(bodies: GoverningBody[]): Promise<void> } },
): Promise<SaveGoverningBodiesResult> {
  const decision = await deps.authorization.enforce('platform:governing-bodies:manage');
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };
  await deps.service.saveAll(bodies);
  return { ok: true };
}
