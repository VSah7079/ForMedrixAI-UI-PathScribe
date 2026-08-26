// src/services/billing/canDraftOrApproveBillingCharge.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own "Complete the Guardrails" /
// decoupled-permissions requirement (billing.draft vs
// billing.approve). This app has no real, live-enforced RBAC system
// today (services/roles/mockRoleService.ts's own
// ActionId/PermissionSet is declarative/UI-only - confirmed via
// direct check to have zero real, live call sites anywhere) - real
// authorization in this app is done via direct role-string checks
// against SessionUser.role (services/auth/caseAccessControl.ts's own
// established pattern, e.g. AccessionPage.tsx's own
// pathologist/pathologist-admin/superadmin check). This follows that
// same, real, actually-enforced pattern rather than extending the
// unused declarative one.
//
// Real, honest scope limitation: this app's role model has no
// dedicated "Billing Supervisor"/"Billing Clerk" role distinct from
// clinical roles (services/roles/mockRoleService.ts's own SEED_ROLES)
// - the Feature Specification's own "Approver: Billing Supervisor,
// Senior Pathologist, Billing Clerk" can't be modeled precisely
// without adding one. Scoped here to the same roles this app already
// treats as having billing/administrative authority elsewhere
// (caseAccessControl.ts's own admin-tier check) - narrower scoping
// needs a real, new role added first, not guessed at here.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per direct guidance - whether a given real role may draft or
 *  submit a billing charge, or act as its approver/reviewer. The same
 *  real check governs both sides deliberately: the Four-Eyes
 *  Principle itself (mockServiceChargeService.ts's own
 *  approveCharge/rejectCharge - approvedBy !== draftedBy) is what
 *  actually separates the two roles on any given charge, not a
 *  narrower permission split this app's real role model can't yet
 *  support. */
export function canDraftOrApproveBillingCharge(role: string | undefined): boolean {
  return role === 'pathologist' || role === 'pathologist-admin' || role === 'admin' || role === 'superadmin';
}
