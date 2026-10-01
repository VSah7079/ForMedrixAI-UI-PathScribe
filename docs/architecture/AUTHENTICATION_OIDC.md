# Sign-in: single sign-on with the hospital's identity provider

**Status:** the browser side is built and tested (Batches 343–344, Jira PS-60). The API server's part (§5, and SCIM in §6) is a specification; nothing of it is built yet.
**Decisions** (Sep 26, 2026; defaults taken where Pete hadn't decided, all listed in PS-60):
- **Protocol:** OpenID Connect, authorization code flow with PKCE, generic, so it works with Entra ID, Okta, Ping and Keycloak. Microsoft Entra ID is the first target.
- **Who can sign in:** only staff who are already provisioned and active. Nobody is created by signing in (the rule from the earlier PS-60 requirements).
- **Password sign-in:** demo builds only. A production build sets `VITE_AUTH_MODE=sso`, and the demo accounts are then not in the bundle.

## 1. Why the sign-in itself doesn't need a server

PS-60 said OAuth "needs a real backend for the token exchange (client secrets can't live in frontend code)". For Entra ID and Okta that is no longer true.

- The app is registered as a **public single-page-application client**. It has no secret.
- **PKCE** ties the authorization code to the browser that asked for it, so an intercepted code is useless.

What does need the API server is **trusting** the result: validating the token's signature and deciding who the caller is in PathScribe (§5). The browser's own checks are for a smooth experience, not security.

**Google is the exception.** Its token endpoint demands the client secret even for web apps, so Google sign-in needs the server to do the code exchange. Until then it isn't offered; a hospital on Google Workspace can federate Google through Entra ID or Okta.

## 2. The flow

1. The login page shows one button per provider configured for this build.
2. The click redirects to the provider. The page the user was trying to open is kept in this tab with the request state; it is not sent to the provider, because a path can name a case.
3. The provider sends the browser back to `/auth/callback/<provider>` with a code.
4. `oidc-client-ts` exchanges the code at the provider's token endpoint and checks `state`, `nonce` and `sub`. PathScribe then checks the ID token's issuer, audience and expiry.
5. **Who is this in PathScribe?**
   - **With the API server** (`VITE_API_BASE_URL` set): `GET /api/me` with the access token (§5.2).
   - **Without it** (development and demos): the same rule (§3) runs in the browser against the demo staff directory.
6. Same-browser conflict check: if this user is already signed in in another tab, the same prompt as the password form appears.
7. The user lands on the page they wanted, or home.

**Tokens:**
- They are held in `sessionStorage`: this tab only, kept across a reload, gone when the tab closes.
- An expired access token is renewed with the refresh token (`offline_access`).
- Signing out (explicitly, on idle timeout, or when superseded) forgets the tokens in this tab. It doesn't end the user's session at Microsoft: an idle timeout on a shared workstation shouldn't sign them out of Outlook.

## 3. Matching an identity to a staff member

The rule lives in `src/services/auth/externalIdentity.ts`; the server must apply the same one.

1. **Already linked.** A staff record whose `externalIdentities` holds this issuer + subject is that person, if Active; if not, the sign-in is refused as `inactive`.
   - **Subject:** Entra ID's `oid` (the account's permanent id in the tenant), otherwise `sub`.
   - **Never email.** Mailboxes get reassigned.
2. **First sign-in** (linking by email allowed, the default): the one Active staff record with the same email, but only if the email can be trusted: `email_verified: true`, or a tenant-specific Entra ID authority (the hospital's own directory). The link is then stored, so from now on step 1 applies.
3. **Refusals**, each shown to the user with a clear message and audited:
   - `not_provisioned`: no matching record;
   - `inactive`;
   - `ambiguous`: two matching records;
   - `already_linked`: the matching record is already linked to a different account at the same provider, which stops a reassigned mailbox from taking it over;
   - `no_app_access`: see below.
4. **App role**, from the staff record's roles in the role catalogue:
   - case access and configuration access → `pathologist-admin`;
   - case access only → `pathologist`;
   - configuration access only → `admin`;
   - neither (Physician, OR Staff) → `no_app_access`.
   - `superadmin` (PathScribe platform support) is never derived from a hospital's directory. The server grants it to PathScribe's own staff.

**Audit entries** (literal English): *SSO account linked*, *SSO sign-in refused*, and *Signed in* (password sign-ins are audited too now).

## 4. Configuration (build settings)

| Setting | Meaning |
|---|---|
| `VITE_AUTH_MODE` | `demo` (default): demo password accounts, plus any providers below. `sso`: providers only; the demo accounts are left out of the bundle. Any other value turns password sign-in off. |
| `VITE_AUTH_MICROSOFT_AUTHORITY` | `https://login.microsoftonline.com/<tenant id>/v2.0`. `/common`, `/organizations` and `/consumers` are refused: they let any Microsoft account in. |
| `VITE_AUTH_MICROSOFT_CLIENT_ID` | The app registration's client id |
| `VITE_AUTH_MICROSOFT_API_SCOPE` | The API's scope, e.g. `api://pathscribe-api/access_as_user`, so the access token is for the API |
| `VITE_AUTH_OIDC_*` | The same four for any other OpenID Connect provider (Okta, Ping, Keycloak). Its email is used for linking only when `email_verified` is true. |
| `…_SCOPES` | Replaces the default `openid profile email offline_access` |
| `…_LINK_BY_EMAIL` | `false` turns off first-sign-in linking, so an administrator must link each account |
| `VITE_API_BASE_URL` | The PathScribe API server. With it, `/api/me` decides who signed in. |

**Rules:**
- Authorities must be https (plain http only to this machine, in development).
- Problems are reported in the browser console as `[auth] …`, and the provider is not offered.
- These are build-time settings, like the live-update hub's URL. Runtime per-customer configuration is an open item (§8).

### Registering the app in Entra ID (hospital IT)

1. **App registrations → New registration.** Single tenant. Platform **Single-page application**, with two redirect URIs: `https://<pathscribe host>/auth/callback/microsoft` for sign-in and `https://<pathscribe host>/auth/signing/microsoft` for the signature-confirmation popup (Batch 344). No client secret.
2. **Token configuration:** add the optional claim `email` to the ID token.
3. **Expose an API** on the PathScribe API's registration (`access_as_user`), and grant it to the SPA registration.
4. Give PathScribe the tenant id, the SPA client id and the API scope.

## 5. The API server (ASP.NET Core): token contract and validation

**Direction (Sep 26, 2026, Pete with the development team):**
- **Shared SaaS:** hospitals sign in through a PathScribe identity broker, Microsoft Entra ID External ID. The broker speaks SAML or OIDC to each hospital (Entra ID, Okta, Ping) and plain OIDC to PathScribe. PathScribe never handles SAML.
- **Private-cloud and dedicated deployments:** these skip the broker and connect straight to the hospital's own Entra ID, which is the Batch 343 configuration.
- **Browser client:** the same in both. It speaks OIDC to one provider.

### 5.1 Token claims and issuer boundaries

**Shared SaaS path:**
- The JWT's `iss` and `aud` are the broker's and the PathScribe API's.
- The token's `tid` is **PathScribe's broker tenant, not the hospital's**. It is the same for every hospital.
- The API server **never** trusts a free-form tenant claim. It resolves the hospital organisation from the upstream identity provider the user came through, using a mapping table PathScribe controls (organisation ⇄ upstream identity provider ⇄ email domains). Confirm which claim carries the upstream provider in a test tenant before relying on it.

**Private-cloud / dedicated path:**
- The JWT comes directly from the hospital's Entra ID.
- `tid` must equal the tenant the deployment was provisioned for; any other is rejected. The client already refuses the shared `/common` endpoint (§4).

**Both paths:** standard JWT bearer validation (`Microsoft.Identity.Web` or `AddJwtBearer` with the discovery document):
- signature from the issuer's signing keys;
- expected issuer and audience;
- lifetime, with a small clock skew.

**Hub:** the SignalR hub reads the same token from the `access_token` query string (`LIVE_UPDATES_SIGNALR.md` §4). The client sends it for SSO users.

**Every endpoint** requires an authenticated caller, except the public routes: OR boards use device tokens, and consult and critical-alert links use their own tokens.

### 5.2 Identity resolution and pre-provisioning

- **No automatic account creation.** A staff record is never created because someone signed in. Hospital admins pre-provision staff by email, or SCIM does (§6).
- **Email first, then the account id.** The first successful sign-in links the token's immutable user id (`oid`, otherwise `sub`, with its issuer) to the staff record, but only if exactly one active staff record has that verified email. From then on the account id is the key, so a reassigned mailbox can't inherit a record. This is the rule in §3, applied again by the server.
- **Refused sign-ins** get 403 with a reason and are audited; nothing is created.

**`GET /api/me`:**

| Response | Body | Client does |
|---|---|---|
| 200 | `{ "profile": { id, name, email, role, initials, voiceProfile, organisationId, canViewPediatric, canViewOrchestration, canAccessCrossTenantQa, credentials, signatureUrl, firstName, middleName, lastName, defaultScanStationId } }` | Signs in with this profile |
| 401 | — | `invalid_token` |
| 403 | `{ "reason": "not_provisioned" \| "inactive" \| "ambiguous" \| "already_linked" \| "no_app_access" }` | Shows that reason |
| other | — | `server_unavailable` |

The profile is for display and routing only. Nothing the browser sends back is trusted.

### 5.3 Authorisation and tenant isolation

- **No roles in the token.** Access tokens carry identity and tenant only. PathScribe roles, lab permissions and signing authority (per lab, per jurisdiction, per participation type) live in PathScribe's database. Copying them into tokens would leave a revoked role or a deactivated user working until the token expired.
  - `scp` (for example `access_as_user`) only says the app may call the API on the user's behalf; it is not a role.
  - The one gate worth setting at the hospital is Entra's "assignment required" on the PathScribe app, so hospital IT decides who may reach PathScribe at all.
- **Checked on every request.** Three checks, in order:
  1. **The token:** valid, as in §5.1.
  2. **The staff record:** the (issuer, subject) link maps to an Active staff record in the organisation resolved in §5.1, and its roles allow the workflow.
  3. **The data:** SQL Server row-level security, with the session context set from that staff record's organisation, not from a token claim. This is what stops a lab tech at Hospital A from reading Hospital B's frozen-section board even if a query is wrong.
- **The hub** applies the same checks when a connection joins groups (`SetIntraopScope`); group names carry the tenant.

### 5.4 Signatures (Batch 344)

A signature must prove the signer was present at the moment of signing, not just that a session was open. The browser now confirms the signer before every sign-out, countersignature, finalisation and autopsy PAD/FAD (`services/auth/signerConfirmation.ts`):
- **SSO sessions:** a popup to the provider with `prompt=login`, `max_age=0` and `login_hint`. It must come back as the same account (issuer + subject), freshly authenticated: `auth_time`, or `iat` if the provider omits it, no earlier than the request. The fresh tokens go to a throwaway store and never replace the session's.
- **Demo password sessions:** the password again. The username is also required for the first signature in a sign-in session (the two-component rule for continuous sessions in 21 CFR 11.200(a)(1)).
- **Lockout:** five failed confirmations lock signing for that user for 15 minutes. Confirmations, failures and locks are all audited.

**What the server must add:** the server must not trust the browser's word that confirmation happened. Each state change that is a signature (sign-out, countersign, finalise, PAD/FAD) must carry the ID token from the confirmation popup. The server verifies it:
- signature, issuer and audience;
- the same subject as the caller's access token;
- `auth_time` within a few minutes;
- its `nonce` or `jti` never seen before, so a token can't be replayed.

Without that the transition is refused, which makes the case's move to signed depend on a verified confirmation on the server as well as in the browser.

**Batch 345: the browser already works this way against the mock services.** Each confirmation is a `SignatureConfirmation`:
- `confirmationId`, signer, action, case accession, `confirmedAt`;
- `proof`: `{ kind: 'oidc-id-token', idToken }` for SSO, null for the demo password.

`services/auth/signatureEvidence.ts` then gates every signed state change: sign-out, countersign, finalize, cytology, autopsy PAD/FAD.
- **Before the change (`accept`):** it runs the checks above, except the token's cryptographic signature: signer, action, case, 5-minute age, one use per confirmation and per ID-token hash, the same account, and a fresh `auth_time`.
- **After the change is saved (`commit`):** it writes a signature record (§5.5).
- **Paused signings:** a signing that stops at a data gate resumes with the confirmation it already accepted for that case, for up to 15 minutes.
- **Refusals:** a refused or missing confirmation stops the change before anything is written.

The API server's endpoints should take the same `SignatureConfirmation` in the signing request, run the same checks plus the signature check, and write the record with `verifiedBy: 'server'`.

### 5.5 Data

- **Staff–identity link table:**
  - **Columns:** `StaffId`, `ProviderId`, `Issuer`, `Subject`, `LinkedAt`, `LinkedBy` (`first-sign-in`, `admin` or `scim`).
  - **Uniqueness:** unique on (`Issuer`, `Subject`), and unique on (`StaffId`, `Issuer`).
- **Tenant configuration tables** (organisation, upstream identity provider, email domains, deployment type, SCIM credentials):
  - **Access:** managed only from a ForMedrix operations console that hospital admins can't reach, and that is left out of customer builds.
  - **Dedicated deployments:** the tables hold one tenant.
- **Staff, roles and signing authority** stay where they are, managed by each hospital's PathScribe admins in System → Staff and Roles.
- **Signature records** (Batch 345, `services/signatures/`): one row per signature applied to a case. Append-only; written in the same transaction as the signed state change.
  - **Columns:** `Id`, `CaseId`, `Outcome` (`signed`, `finalized`, `released_for_countersign`), `Link` (report version, autopsy snapshot + tier, or cytology sign-out record), `RecordedAt`.
  - **The evidence:**
    - confirmation id, signer id and name;
    - action and case accession;
    - method (`password`, `sso`, `biometric`);
    - `ConfirmedAt`, `VerifiedAt`, `VerifiedBy`;
    - for SSO: issuer, subject, `auth_time` and the SHA-256 of the ID token. The token itself is never stored.
  - **Used ids:** the server also keeps the confirmation ids and token hashes already used, so none can back two signatures.

## 6. SCIM 2.0 provisioning

Hospital IT can push joiners, changes and leavers from Entra ID or Okta, so that nobody has to remember to deactivate a leaver in PathScribe. SCIM covers identity and account status only.

### 6.1 Endpoints

- **Base path:** `/scim/v2`.
- **Users:** `GET` (with `filter=userName eq "…"`), `POST`, `PUT`, `PATCH` and `DELETE` on `/scim/v2/Users`, plus `/ServiceProviderConfig`, `/Schemas` and `/ResourceTypes`, which Entra's provisioning service reads.
- **Groups:** optional. Used only for an approved group-to-role mapping (§6.5).

### 6.2 Authentication

- **Tokens:** a bearer token per tenant (`scim_…`), issued, rotated and revoked from the ForMedrix operations console, and stored only as a hash.
- **Tenant binding:** the token fixes the organisation for every request it makes. Any organisation in the payload is ignored.
- **Failures:** a missing or invalid token gets `401`. Every SCIM request is audited.

### 6.3 Field mapping

| SCIM | PathScribe staff record |
|---|---|
| `id` | PathScribe's own staff id, assigned by PathScribe. It is not the hospital's id. |
| `externalId` | The hospital's permanent id for the person (Entra object id). Stored as the staff–identity link (§5.5) with `LinkedBy = scim`. |
| `userName`, `emails[type eq "work"].value` | Email, used for the first-sign-in linkage when there is no link yet |
| `name.givenName`, `name.familyName` | First and last name |
| `active` | Status Active / Inactive |

**Linking caveat on the broker path:** `externalId` is the hospital's id, but the token the API sees carries the broker's id (§5.1). So a SCIM link matches a broker sign-in only if the broker passes the upstream object id through as a claim. Otherwise the first sign-in still links by email (§5.2). On the direct path the two ids are the same.

**A SCIM-created record starts with no PathScribe roles.** It can't sign in (`no_app_access`) until a hospital PathScribe admin grants roles. So SCIM never gives anyone access to clinical data on its own.

### 6.4 Deactivation

`active: false` (PATCH or PUT), or `DELETE`:
1. The staff record becomes **Inactive**. `DELETE` also only deactivates: staff records are never removed, because signatures and audit history refer to them.
2. From the next request, every API call and hub message for that person is refused (§5.3 checks Active status on each request). The server also closes their open SignalR connections and ends their API sessions.
3. An audit entry records the deactivation, its source (SCIM, the tenant, the request id) and the time.

Reactivation (`active: true`) restores the record but not its roles or signing authority if an admin removed them in the meantime.

### 6.5 What SCIM can never change

- **Protected:** signing authority and participation types, credentials and licence numbers (NPI, GMC), jurisdictional appointments, PathScribe roles, organisation and facility access, and pediatric, orchestration and cross-tenant QA access. They are managed only in PathScribe's admin screens by the hospital's PathScribe admins.
- **Exception:** an optional group-to-role mapping that a tenant's PathScribe admin sets up and approves. It can assign basic operational roles only, never signing authority.

## 7. Tests

- `src/services/auth/*.test.ts`: the configuration rules, matching, roles, return paths, the session life cycle, the `/api/me` responses, and (Batch 344) signer confirmation, lockout and the re-authentication checks.
- `sso/ssoClient.integration.test.ts`: the real `oidc-client-ts` against a local provider (`testing/fakeOidcProvider.ts`) that checks PKCE and refuses a client secret. It covers:
  - sign-in;
  - the issuer check;
  - cancellation;
  - a forged callback;
  - refresh-token renewal.
- `sso/ssoClient.reauth.test.ts` (Batch 344): the signing popup's request (`prompt=login`, `max_age=0`, `login_hint`), its separate token store, and how its outcomes are reported.
- `signingScreens.guard.test.ts` (Batch 344): every signing screen goes through the confirmation, and has no password field of its own. Batch 345 adds that every signed state change calls the save-time check.
- `signatureEvidence.test.ts`, `linkedAccounts.test.ts` (Batch 345): the save-time check (including replay, wrong case and stale login) and unlinking.
- **Browser check (Batch 343), dev server with the local provider:**
  - sign-in with the link stored and audited;
  - reload;
  - the conflict prompt in a second tab;
  - a refused sign-in explained on the login page.
- **Browser check (Batch 344), case sign-out:**
  - **Demo build:** an empty form, a wrong password and someone else's username were refused and counted; the right credentials signed.
  - **SSO build:** the popup asked the provider for `prompt=login`, `max_age=0` and the user's email, came back and closed, and the sign-out went ahead. The session's own marker was untouched.
- **Bundle check:** a `VITE_AUTH_MODE=sso` build contains no demo account. A demo build holds only the hashes, in a separate chunk.

## 8. Open items

- **Server side** (§5, §6): token validation, the tenant mapping, `/api/me`, row-level security, the link table, signature verification (§5.4) and SCIM.
- **Server-side signature check** (§5.4). The browser builds the signing request's proof and checks it against the mock services (Batch 345), but only a server check makes it binding, because a modified browser could skip it. The signing endpoints need to accept the `SignatureConfirmation` and verify it.
- **Broker:** set up Entra External ID, confirm which claim carries the upstream identity provider, and put the email-first login routing on the login page.
- **Operations console** (ForMedrix-only) for tenants, identity-provider connections and SCIM tokens.
- **Linking accounts by hand:** the Staff screen now shows a person's linked sign-in accounts and can unlink them (Batch 345); adding a link by hand waits for the operations console or SCIM.
- **Biometric signing** for SSO builds: server-issued WebAuthn challenges. It is simulated today and offered only in demo builds.
- **OR terminal device tokens** for the hub (`LIVE_UPDATES_SIGNALR.md` §4).
- **Runtime configuration** of providers per customer, instead of build settings.
- **Signing out of the provider as well** (`end_session_endpoint`), if a customer wants it.
- **Demo passwords:** these were in the shipped bundle in plain text until Batch 343, so treat them as known and change them with `scripts/auth/hash-demo-password.mjs`.
