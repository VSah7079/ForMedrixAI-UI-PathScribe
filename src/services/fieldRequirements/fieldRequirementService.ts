// src/services/fieldRequirements/fieldRequirementService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-359 (Batch 376): each organisation's required-field choices, per page.
// Reading is open to everyone (a page needs them to know what to require).
// Changing one needs config:field-requirements:manage, is limited to the
// person's own organisation, refuses locked fields, and is audited.
// ─────────────────────────────────────────────────────────────────────────────

import type { Facility } from '../facilities/IFacilityService';
import type { IAuthorizationService } from '../authorization/authorizationService';
import type { NewAuditLog } from '../auditlog/IAuditService';
import { resolveTenantFacility } from '../auth/resolveTenantFacility';
import {
  fieldRequirementChangeAudit, overrideProblem, resolveFieldRequirements,
  type FieldRequirementOverrides, type FieldRequirementPageId, type OverrideProblem, type ResolvedFieldRequirement,
} from './fieldRequirementRules';

export const FIELD_REQUIREMENTS_KEY = 'pathscribe_field_requirements';

/** organisation id → page → field id → required */
type Stored = Record<string, Partial<Record<FieldRequirementPageId, Record<string, boolean>>>>;

export interface FieldRequirementDeps {
  authorization: Pick<IAuthorizationService, 'enforce'>;
  session: () => { id: string; name: string; organisationId?: string } | null;
  enterpriseFacilities: () => Promise<Facility[]>;
  audit: (entry: NewAuditLog) => Promise<unknown>;
  store: { get<T>(key: string, fallback: T): T; set<T>(key: string, value: T): void };
}

export function createFieldRequirementService(deps: FieldRequirementDeps) {
  const read = () => deps.store.get<Stored>(FIELD_REQUIREMENTS_KEY, {});
  const sessionTenant = async (): Promise<Facility | null> => {
    const s = deps.session();
    if (!s?.organisationId) return null;
    return resolveTenantFacility(s.organisationId, await deps.enterpriseFacilities()) ?? null;
  };

  return {
    /** The signed-in person's organisation (id and name), or null. */
    async sessionOrganisation(): Promise<{ id: string; name: string } | null> {
      const f = await sessionTenant();
      return f ? { id: f.id, name: f.name } : null;
    },

    /** A page's fields for an organisation (the defaults when it has made no choices). */
    async forOrganisation(organisationId: string | null, page: FieldRequirementPageId): Promise<ResolvedFieldRequirement[]> {
      return resolveFieldRequirements(page, organisationId ? (read()[organisationId]?.[page] as FieldRequirementOverrides | undefined) : undefined);
    },

    /** A page's fields for the signed-in person's organisation. */
    async forSession(page: FieldRequirementPageId): Promise<ResolvedFieldRequirement[]> {
      const t = await sessionTenant();
      return this.forOrganisation(t?.id ?? null, page);
    },

    /** Switch a field's Required status for the person's own organisation. */
    async setRequired(organisationId: string, page: FieldRequirementPageId, fieldId: string, required: boolean):
      Promise<{ ok: true } | { ok: false; reason: OverrideProblem | 'notPermitted' | 'otherOrganisation' }> {
      const problem = overrideProblem(page, fieldId);
      if (problem) return { ok: false, reason: problem };
      const t = await sessionTenant();
      if (!t || t.id !== organisationId) return { ok: false, reason: 'otherOrganisation' };
      const d = await deps.authorization.enforce('config:field-requirements:manage');
      if (!d.allowed) return { ok: false, reason: 'notPermitted' };
      const all = read();
      const def = resolveFieldRequirements(page).find(f => f.id === fieldId)!;
      const pageChoices = { ...(all[organisationId]?.[page] ?? {}) };
      const before = resolveFieldRequirements(page, pageChoices).find(f => f.id === fieldId)!.required;
      if (required === def.required) delete pageChoices[fieldId]; else pageChoices[fieldId] = required;
      deps.store.set(FIELD_REQUIREMENTS_KEY, { ...all, [organisationId]: { ...(all[organisationId] ?? {}), [page]: pageChoices } });
      if (before !== required) {
        const s = deps.session()!;
        await deps.audit(fieldRequirementChangeAudit(page, fieldId, required, t.name, s.name));
      }
      return { ok: true };
    },
  };
}

export type IFieldRequirementService = ReturnType<typeof createFieldRequirementService>;
