# services/staff/

Rules about staff members' jurisdiction-scoped credentials. Pure functions, each with tests.

## Files

- **`resolveNormalizedCredentialCapabilities.ts`** — the one place a raw, jurisdiction-specific credential is normalized into a PathScribe capability key, and only while it is active (right jurisdiction, inside its effective and expiry dates).
  - `CYTO_ADVANCED_SPECIALIST`: the UK Advanced Specialist cytology sign-out, plus the NL and DE equivalents.
  - `FORENSIC_AUTOPSY_SIGNOUT` (Batch 331, PS-327): may sign a forensic autopsy in that jurisdiction. It comes from `MEDICOLEGAL_APPOINTMENT` (any jurisdiction's medical examiner / forensic pathologist / coroner's pathologist appointment) or `UK_HO_REGISTERED_FORENSIC_PATHOLOGIST`.
  - `KNOWN_CREDENTIAL_TYPES` lists the raw types the Staff editor offers.
- **`resolveHasAdvancedSignOutCertification.ts`** — the cytology advanced sign-out check built on the above.
- **`providerCredentialRules.ts`** (Batch 331) — the Staff editor's rules:
  - validation, per row: type, issuing body, jurisdiction, effective date, and expiry not before effective;
  - normalization;
  - `providerCredentialChangeDetail`, the literal-English audit detail written when an administrator adds or removes a credential.

## staffAdministration.ts (Batch 370, PS-356)

`saveStaffMember` is the only way screens change staff records. It needs two capabilities:
- `config:staff:edit` for any save;
- `config:staff-access:assign` as well when the save changes roles, facilities, pediatric, orchestration or cross-tenant QA access, or jurisdictional credentials (`staffAccessChanges`). Adding someone always counts, because a new record needs a role.

Audit entries:
- **"Staff access changed"** (`staffAccessChangeDetail`) records roles, facilities and flags, before → after. It is new.
- **"Staff credentials changed"** is the credentials entry. It moved here from `StaffTab.tsx`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
