# PathScribe Update 222 — Summary

Builds the discordance review screen this session had been designing toward — turns out to be a smaller, more honest change than initially framed, once the real, existing mechanics were checked directly.

## What was investigated first

- `DiscordanceReconciliationModal.tsx` already has everything Pete's spec asked for: the frozen section shown as context, a field for the pathologist to enter the final diagnosis/category, automatic discordance detection (`finalCategory !== frozenCategory`), and the full Delta/Severity/Root Cause/Comments form — already gated on real, structured data.
- Checked directly: this modal has exactly one render site in the entire app — the automatic trigger in `useSignOutWorkflow.ts` (wired last session). There is no separate, manual "open this whenever" path anywhere. That means every real instance of this screen opening today already IS "AI flagged" by definition — a real correction to an earlier assumption on PS-292 that a `flaggedBySystem` field would be needed to distinguish system-triggered from manually-opened records. It isn't: 100% are system-triggered already.
- Also surfaced along the way: `ReconciliationRecord.ts` (which PS-292 comments this session referenced repeatedly as the live mechanism) has actually been retired — the real, current type is `QaActivityRecord`, written via `qaActivityRecordService`. Noting this here since it affects how any future PS-292 work referencing the old type should be read.

## What changed

1. **`DiscordanceReconciliationModal.tsx`** — added a real, prominent "⚖ Automatically Flagged for Review" banner at the top, stating plainly that a frozen section triggered this review — the "AI outcome" display Pete's spec asked for, honestly scoped to what's actually true (the system detected this needs review; it doesn't compute or predict what the final diagnosis will be).

2. **`QualityTab.tsx`** — the "Concordance Rate" card now computes a real, live rate (`(total - discordant) / total` across every real `QaActivityRecord` for the frozen-final activity type) instead of the previous static mock value (`94.2`). Since every record for this activity type is already system-triggered, this rate already answers "frequency of confirmed discordance across all AI-flagged cases" directly — no new tracking field was needed to build it, per the finding above.

## Verification
`tsc` clean. Full suite: 432 files, 3748 tests, all passing (no new tests needed — no new branching logic, just a static banner and a formula replacing a hardcoded number).
