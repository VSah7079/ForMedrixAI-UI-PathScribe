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

## Update, Sep 2026 (Batch 343, PS-60)

Two things below are out of date:
- **The stack.** Production is SQL Server behind an ASP.NET Core API server, not Firebase, so steps 2–4 of the direction below (Firebase Auth federation, Cloud Function claims, Firestore rules) no longer apply.
- **"Zero references to OIDC".** User sign-in is now OpenID Connect with the customer's identity provider; see [`AUTHENTICATION_OIDC.md`](AUTHENTICATION_OIDC.md).

The vendor-staff idea still holds, in the new setting. PathScribe support staff sign in through ForMedrix's own tenant, and the API server grants `superadmin` (or a narrower vendor claim) from that tenant's group membership, never from a customer's staff directory. It enforces that on the server, and the UI only mirrors it.

## Update, Sep 2026 (Batch 369, PS-355)

Capabilities now exist (`src/services/authorization/`, `AUTHORIZATION_API.md`). Superadmin is a built-in role in the catalog, granted every capability, with no bypass in the check. It is held only through a support sign-in (session role `superadmin`) and can't be assigned to a hospital's staff: the staff role picker leaves it out, and a staff record naming it gets nothing from it.

That doesn't settle this plan's question. The two platform screens above still receive `isSuperAdmin` from their parent rather than from a capability, and in-app `superadmin` is still what every demo account signs in as. Turning those two screens into vendor-only capabilities is a candidate for the PS-357 sweep; the vendor identity itself still has to come from ForMedrix's own tenant on the server.

## Update, Sep 2026 (Batch 371)

Pete decided that Superadmin is reserved for ForMedrixAI support staff and that hospital administrators have no control over it. Built:
- **Superadmin is locked** to the whole catalog. A hospital's Role Dictionary shows it read-only, and the role service refuses changes.
- **Platform-only capabilities** can't be put on a hospital role.
- **The governing-bodies screen** now needs `platform:governing-bodies:manage`.
- **Terminology endpoint details** are shown only to superadmin sessions.
- **Opening another organisation's case** as support is checked and audited (`platform:cross-tenant-cases:view`).
- **Demo accounts:** only ForMedrixAI people sign in as superadmin.

Still open:
- **Server-side vendor identity:** the vendor identity still has to come from ForMedrixAI's own tenant on the server (phase 4).
- **Break-glass access:** a stated reason and a time limit for support access to a hospital's cases isn't built. *(Built in Batch 372 as approval-based support access; see below.)*

## Update, Sep 2026 (Batch 372): support access is the hospital's decision

Pete's specification: the hospital, as data controller, controls ForMedrixAI support's access to its data. Built in the browser (`src/services/supportAccess/`):
- **Policy per organisation:** Disabled / Approval required (default) / Always allowed, set by holders of `config:support-access:policy`. Disabled blocks support entirely, Superadmin included.
- **Just-in-time access:** support requests access linked to a ticket, with a reason. Approvers in that organisation (`config:support-access:approve`, not the requester) get an in-app message and approve or reject. An approval lasts the organisation's window (30 minutes to 8 hours, default 2), and ends early if support ends it or the hospital revokes it.
- **The gate** sits in `CaseRouter` (open, list, edit) and the case search, ahead of the `platform:cross-tenant-cases:view` check.
- **The hospital's own support audit stream:** requests, decisions, expiries, refusals, case opens and edits, list and search disclosures (case ids; search criteria names, never values), policy changes and exports. Hash-chained, shown with its tamper check to holders of `config:support-audit:view`, and exportable as CSV or JSON.

Still open, all server-side (phase 4, PS-358): originating IP and country; email and webhook notification; ending access when the ticket closes; PDF export; the stream in a per-tenant append-only table; support session tokens bound to the ticket and expiry; copying support's exports and configuration changes into the hospital's stream. See `AUTHORIZATION_API.md` § Support access.

## Direction (not yet built; written for the earlier Firebase plan)

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
