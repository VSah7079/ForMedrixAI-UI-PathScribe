# PathScribe Update 272 — PS-83: Work RVU values for the 4 gapped billing codes

## What changed

Added real Work RVU values for the four billing codes PS-83 flagged as
honestly-unverified (`IHC-ADDL`, `PIN4-PANEL`, `FROZEN-FIRST`, `FROZEN-ADDL`),
sourced via web search since the authoritative CMS PPRRVU file itself isn't
something I could parse directly:

| Billing Code | CPT | Work RVU |
|---|---|---|
| IHC-ADDL | 88341 | 0.55 |
| PIN4-PANEL | 88344 | 0.75 |
| FROZEN-FIRST | 88331 | 1.16 |
| FROZEN-ADDL | 88332 | 0.58 |

Source: findacode.com. Internally consistent (each "additional" code prices
below its "first" counterpart, as expected) and close to — but not
identical to — the 2015 RUC figure the ticket itself already flagged as too
stale (1.19 for 88331 then vs. 1.16 now — plausible decade-plus drift, not
a red flag).

Per your note that this is seed data the customer validates themselves, I
went ahead and entered these rather than holding for further verification.

## How it was entered — matches the append-only versioning discipline already in place

Each code's existing version-1 row (`ACTIVE`, no RVU — the version every
real charge still resolves against today) was left untouched. Added a new
version-2 row per code, `status: 'PENDING_APPROVAL'`, with an honest
`changeReason` disclosing the source and telling whoever reviews it to
validate against their own current fee schedule before approving. This is
the same posture the seed data already uses for its one other pending
example (billing code `88307`) — not a new pattern.

Live-verified in the browser: all four show up correctly on the
**Pending Billing Rule Approvals** screen (Configuration → System →
Financial & Revenue Lookups) with their RVU, source, and change reason
visible, and a real Approve click on one of them worked cleanly (four-eyes
check passed, since the seed entries are attributed to `system-seed`, not
your own account) and removed it from the pending queue as expected — no
special-casing needed, the existing approval workflow just works with this
data as-is. Whoever reviews these still has to click Approve — nothing
here went live on its own.

## Test suite update

One existing test explicitly locked in the *old* state ("these four seed
entries honestly carry no RVU"). Updated it to check the *new* two-version
state instead — version 1 still carries no RVU (unchanged, still
`ACTIVE`), version 2 carries the new RVU and is `PENDING_APPROVAL` — rather
than deleting or weakening the check.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: 476/476 test
  files, 4154/4154 tests passing.
- **Live browser check** (Playwright): Billing Dictionary and Pending
  Billing Rule Approvals pages, zero console errors, one real Approve
  action exercised successfully.

## Files changed

- `src/services/billing/mockBillingRuleService.ts`
- `src/services/billing/mockBillingRuleService.test.ts`
