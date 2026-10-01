# components/Billing

Billing modals on the case report page.

- **`PostSignoutBillingChangeModal`:** after a case has signed out, a change to billing asks for a reason (from the reason dictionary) and a comment. Both are locked Field Requirements (`billingChangeMissing`). Voice: "confirm billing change" (`POST_SIGNOUT_BILLING_CONFIRM`).
- **`CorrectAppliedCodeModal`:** replaces an applied, already-charged billing code with a corrected one; the original is credited and the new code billed. The corrected code is a locked Field Requirement (`correctedCodeCheck`, and it must differ from the original). It needs `billing:applied-code:correct` (`CapabilityButton`; checked again in `services/billing/correctServiceCharge.ts`). Voice: "correct billing code" (`CORRECT_CODE_CONFIRM`).

Neither modal decides anything itself: the checks are in `services/fieldRequirements/reportPageChecks.ts`, and they reach services only through `@/services`.

Batch 382 (PS-359). Tests sit beside the modals.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
