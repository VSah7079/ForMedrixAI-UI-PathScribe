# PathScribe Update 216 — Summary

A real, visible rendering bug found while capturing two documentation screenshots (the Accession organ picker and the Autopsy SynopticReportPage banners) — not something either screenshot request itself asked for fixing, but too visible to leave once found.

## The bug

Several places in the UI intended to show a warning symbol (⚠) or an em dash (—) but instead literally displayed the escape codes themselves on screen — `\u26a0`, `\u2014`, `\u2013` — as plain text.

Root cause: these characters were typed as raw text directly between JSX tags (`<div>\u26a0 Autopsy...</div>`) or inside a JSX attribute string (`title="...A\u2013Z)"`), rather than inside an actual JavaScript string or template literal. JSX text content and JSX attribute strings don't interpret backslash escapes the way a real JS string does — only `{...}`-wrapped expressions and genuine string/template literals do. The distinction matters because dozens of other, correct uses of the same escape codes already exist throughout this codebase inside real string literals — the bug was never the escape codes themselves, only the eight specific places they'd been placed outside of one.

## What changed

**`SynopticReportPage.tsx`** — 8 instances fixed:
- The Organ Retention Tier dropdown's 5 option labels ("— not yet recorded —", "Tier 0 — No Retention", etc.)
- The Autopsy "Temporary Accession, Written Authorization Pending" banner title
- The Autopsy "Ready for Body Release" banner title and its summary line

**`BillingLogsSection.tsx`** — 1 instance fixed: the "Patient Name Range (A–Z)" section label, a JSX attribute string value.

Checked the rest of the codebase for the same mistake pattern (any `.tsx` file using these escape codes) — every other instance found was already correctly inside a real string or template literal and renders fine; these were the only broken ones.

## Verification
`tsc` clean. Full suite: 429 files, 3715 tests, all passing (this was a text-rendering fix with no logic change, so no new tests were needed). Verified visually end-to-end — the Autopsy banner now shows the real ⚠ and — characters instead of the literal escape text.
