# ACCESS_CONTROL_PLAN.md — ForMedrix-employee-only settings

**Status: PLANNED, not built.** No customers yet — this doesn't block the
copyright deposit (that's about originality/ownership of the code, not
runtime access control) and doesn't need to be built until a real
deployment approaches.

## The problem

Two admin screens configure platform-level, cross-customer concerns that
no single customer should be able to touch, regardless of how senior
their own admin is:

- **`components/Config/System/GoverningBodiesSection.tsx`** — which
  CAP/RCPath/ICCR/RCPA content syncs into the whole platform's synoptic
  library.
- **`components/Config/Terminology/TerminologyServicesSection.tsx`** —
  terminology endpoint config, including real licensing plumbing (CPT
  proxy, non-US ICD-10 proxies — see `terminologyConfig.ts`).

Both are currently rendered from `components/Config/System/index.tsx`
with `isSuperAdmin={true}` hardcoded — not wired to anything real.

## Why this isn't a simple prop wire-up

`AuthContext.tsx`'s `User.role` already includes a `superadmin` value, and
it might look like the fix is just `isSuperAdmin={user.role === 'superadmin'}`.
It isn't, because every `User` — including a `superadmin` — carries an
`organisationId` (the tenant boundary). As modeled today, `superadmin` is
the top of *one hospital's own* role hierarchy, not a ForMedrix-employee
identity. Wiring it in as-is would let a trust's own senior admin reach
platform-wide config that should be ForMedrix-only.

**The real requirement is two genuinely different trust boundaries:**
1. Customer-side seniority (`admin` → `pathologist-admin` → `superadmin`,
   scoped within `organisationId`) — already modeled, fine as-is for
   everything else it currently gates.
2. Vendor identity (ForMedrix employee, no `organisationId`, or explicitly
   cross-tenant) — does NOT exist anywhere in the codebase yet.

## Current state of the stack (confirmed by grep, July 2026)

Zero references to Azure AD / MSAL / OIDC / SAML anywhere in `src/`.
Everything today is mock services backed by localStorage — there is no
real backend enforcement of anything, for any role. The hardcoded `true`
is an honest reflection of that, not a bug hiding a working system.

## Direction (not yet built)

Standard federated-identity shape for a vendor/tenant split:

1. ForMedrix staff authenticate via ForMedrix's own Azure AD (a security
   group or app role) — separate from how customer users authenticate.
2. Federate into Firebase Auth via OIDC (Firebase supports this directly).
3. A Cloud Function on sign-in sets a custom claim (e.g. `vendorStaff: true`)
   based on the Azure AD group/role membership in the federated token.
4. **Enforcement lives server-side** — Firestore Security Rules and Cloud
   Functions check `request.auth.token.vendorStaff == true` for the
   collections/actions behind these two screens. This is the actual
   security boundary.
5. The React `isSuperAdmin`/`isVendorStaff` prop mirrors the claim for UI
   purposes only (hide the nav item, disable the form) — never trusted as
   the real gate, since client-side checks are a UX convenience, not
   security, especially pre-Firestore-migration when there's no backend at
   all to enforce anything.

This slots into the existing `services/` interface/mock/firestore pattern
naturally: whichever service ends up backing these two screens should
follow the same swap-in-a-real-backend shape already used elsewhere
(`firestoreClientService.ts` etc.) — the claim-check becomes part of that
service's real (Firestore/Cloud Function) implementation, not the mock.

## Interim stopgap (also not yet built, cheap to add later)

Before real customers and before the Azure federation work above, a
build-time flag (`VITE_FORMEDRIX_INTERNAL_BUILD`) that excludes these two
screens entirely from customer-facing builds would be a stronger interim
boundary than any runtime role check — code that doesn't ship can't be
reached, full stop. Worth doing whenever the first real external
deployment approaches, as a stopgap until the real claim-based enforcement
above exists.

## Explicitly NOT the fix

- Wiring `isSuperAdmin` to the existing in-tenant `superadmin` role as-is.
  Would create a false sense of security and would be painful to unwind
  once real customers have been assigned that role.
- Any client-side-only check, ever, as the actual enforcement — only ever
  as a UX nicety layered on top of real server-side enforcement.

## Trigger to revisit

First real (non-demo) customer deployment being planned. Revisit before
that, not before the copyright filing.
