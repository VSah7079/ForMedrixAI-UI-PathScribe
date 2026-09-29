// src/services/authorization/defaultAuthorizationService.ts
// PS-355 (Batch 369): the app's authorization service, wired to the role,
// user and audit services of this build. Exported from `@/services` as
// `authorizationService`; tests build their own with createAuthorizationService.

import { mockRoleService } from '../roles/mockRoleService';
import { mockUserService } from '../users/mockUserService';
import { mockAuditService } from '../auditlog/mockAuditService';
import { createAuthorizationService } from './authorizationService';

export const authorizationService = createAuthorizationService({
  roleService: mockRoleService,
  userService: mockUserService,
  auditService: mockAuditService,
});
