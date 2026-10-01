// src/services/supportAccess/defaultSupportAccessService.ts
// Batch 372: the app's support access service, wired to this build's
// services. Exported from `@/services` as `supportAccessService`.

import { DEMO_SUPPORT_ACCESS_SETTINGS } from './demoSupportAccessSeed';
import i18n from '@/i18n/config';
import { storageGet, storageSet } from '../mockStorage';
import { readSessionProfile } from '../auth/sessionProfile';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { mockUserService } from '../users/mockUserService';
import { mockRoleService } from '../roles/mockRoleService';
import { mockMessageService } from '../messages/mockMessageService';
import { authorizationService } from '../authorization/defaultAuthorizationService';
import { createSupportAccessService } from './supportAccessService';

export const supportAccessService = createSupportAccessService({
  authorization: authorizationService,
  session: () => {
    const p = readSessionProfile();
    return p ? { id: p.id, name: p.name, role: p.role, organisationId: p.organisationId } : null;
  },
  enterpriseFacilities: async () => {
    const r = await mockFacilityService.getAll();
    return r.ok ? r.data.filter(f => f.isEnterprise) : [];
  },
  staff: async () => { const r = await mockUserService.getAll(); return r.ok ? r.data : []; },
  roles: async () => { const r = await mockRoleService.getAll(); return r.ok ? r.data : []; },
  // In-app message to each approver, in the app's current language. Email
  // and webhooks are the API server's job (phase 4).
  notify: async m => {
    await mockMessageService.send({
      senderId: m.senderId, senderName: m.senderName, recipientId: m.recipientId, recipientName: m.recipientName,
      subject: i18n.t('supportAccess.notification.subject', { ticket: m.ticketId }),
      body: i18n.t('supportAccess.notification.body', { agent: m.senderName, organisation: m.tenantName, ticket: m.ticketId, reason: m.reason }),
      configLink: '/configuration?tab=system&section=support_access',
      timestamp: new Date(), isUrgent: true,
    } as any);
  },
  store: { get: storageGet, set: storageSet },
  seedSettings: DEMO_SUPPORT_ACCESS_SETTINGS,
});
