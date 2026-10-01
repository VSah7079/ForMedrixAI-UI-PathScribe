// src/services/fieldRequirements/defaultFieldRequirementService.ts
// PS-359 (Batch 376): the field requirement service wired to this build's mock data.
import { storageGet, storageSet } from '../mockStorage';
import { readSessionProfile } from '../auth/sessionProfile';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { mockAuditService } from '../auditlog/mockAuditService';
import { authorizationService } from '../authorization/defaultAuthorizationService';
import { createFieldRequirementService } from './fieldRequirementService';

export const fieldRequirementService = createFieldRequirementService({
  authorization: authorizationService,
  session: () => {
    const p = readSessionProfile();
    return p ? { id: p.id, name: p.name, organisationId: p.organisationId } : null;
  },
  enterpriseFacilities: async () => {
    const r = await mockFacilityService.getAll();
    return r.ok ? r.data.filter(f => f.isEnterprise) : [];
  },
  audit: entry => mockAuditService.logEvent(entry),
  store: { get: storageGet, set: storageSet },
});
