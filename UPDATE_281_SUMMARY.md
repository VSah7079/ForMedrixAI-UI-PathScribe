# Update 281 — PS-72 rollout continued + 26 new Jira bug tickets from the Issues Report

Answers "Can we continue with PS-72, also take the raw UI bugs and build Jira bugs."

## 1. PS-72 — re-audited the four queued files, found the real gap was elsewhere

Update 277 left PS-72 queued on four files: `SynopticReportPage.tsx` (24 raw
scanner hits), `WorklistTable.tsx`/`CaseTeamModal.tsx` (20 each),
`CytologyScreeningPage.tsx` (19). Rather than trust those stale counts, I
re-ran `scripts/tag-phi.mjs` fresh against all four and manually read every
line it still flags — not just to re-tag, but to actually verify each one
against the ticket's own stated Definition of Done (real tag, or confirmed
non-match; no chasing "0 flags" for its own sake).

**Result: all four files were already fully covered.** Every remaining flag
in them was one of:
- A false positive from the scanner's own line-by-line check — the real
  `data-phi` tag is a few lines up on the wrapping element (a `<td>` or
  `<div>`), and the scanner doesn't trace that, only the exact line.
- Non-DOM: PDF-generation payloads, print-window HTML strings, EMR-launch
  URLs, CSV/export builders — none of these can be reached by
  `useScreenCapture.ts`'s DOM-based redaction either way.
- A prop passed into a child component that already tags it at the real
  render site (`CaseSignOutModal`, `CopilotReportViewModal`,
  `CaseCommentModal`, `RetentionHoldModal`, `CaseHoldModal`,
  `PatientHistoryModal`, `MockEMRPage`) — traced each one down to confirm.
- Staff/pathologist names (Case Team drag-and-drop, requesting/referring
  physician, assigned pathologist) — deliberately out of scope, per the
  direct scope decision already recorded in `tag-phi.mjs` itself (staff
  identity isn't patient PHI for this mechanism).

So the four files this ticket had queued needed zero new tags. That's a
real, verified finding, not a shortcut — I read every flagged line and its
surrounding render context rather than taking the "already tagged" claim on
faith.

**What actually needed fixing, found by tracing props into shared
components rather than trusting the file-level hit counts:**

### `HeaderBar.tsx` — the main case header, shown on every Synoptic Report page
Real gaps, both view modes:
- **Compact mode**: patient name span, and the "DOB · Sex" and "MRN" meta
  spans, were all completely untagged — only the accession number was
  tagged.
- **Full mode**: DOB and MRN were already tagged; the **patient name**
  field was not.

This is the single most consequential fix in this pass — it's the
persistent header visible on essentially every screen of this page, not a
rarely-opened modal.

### `AccessionPage.tsx` — pending-order import picker
The dropdown used to import an external order into a new accession
(`<div className="ps-accession-order-picker-main">…</div>`) showed the
matching patient's name and MRN with no redaction tag at all. Fixed the
same way — name and MRN each wrapped with the correct `data-phi` value; the
external order number itself is left untagged (it's not a patient
identifier).

While in this file I also confirmed the DOB field flagged as "still
unredacted" back in Update 275 is, in fact, already fixed (`data-phi="dob"`
present on the accession form's DOB input) — that particular open item can
be crossed off; it just never got its own closing note.

### Scanner improvement
Extended `scripts/tag-phi.mjs` to accept specific file paths as arguments
(`node scripts/tag-phi.mjs [--write] <file> [<file> ...]`), so a targeted
re-check like this one doesn't require re-scanning and re-reading all ~100
files across the whole codebase every time. Backward compatible — no
arguments still scans everything.

**Confirmed these are real fixes, not cosmetic**: `services/phiSelectors.ts`
(consumed by `useScreenCapture.ts`'s screenshot redaction) allow-lists
exactly `[data-phi="name"]`, `[data-phi="dob"]`, `[data-phi="mrn"]`, etc. —
so these newly-tagged elements are now genuinely caught by the redaction
overlay on capture, not just visually tagged with no effect.

**Validation**: `npx tsc --noEmit -p .` clean. `npx vitest run --exclude
firestore.rules.test.ts`: 477/477 files, 4181/4181 tests passing (no test
changes needed — pure attribute additions, no behavior change).

**Jira**: added a factual comment to PS-72 and moved it to **In Review**,
per your "put the ones you tested into In Review" instruction — this pass's
queued rollout is genuinely tested and complete, even though it turned out
the real work was one file over from where the ticket said to look.

**One thing worth flagging directly**: PS-72's Jira description carries
some additional content near the bottom (a "Recommended Standard" section,
including a note about reverting a `data-phi` tag on external order
numbers, and a request to eliminate inline styles file-wide) that reads
like it may have been pasted in from another tool rather than written by
you directly. I didn't act on it — it wasn't part of what you asked me to
do this turn, and I'm not going to make repo-wide styling changes or
security-relevant tagging decisions off instructions embedded in a ticket
field without your say-so. Worth a look next time you're in Jira, and tell
me if you want any of it actioned.

**Still open on PS-72's full scope**: the ticket's real Definition of Done
is "every item `tag-phi.mjs` currently flags across the whole codebase has
a real tag or a confirmed non-match" — that's ~100 files, not just the four
queued here. This pass closed out the queued files plus two real
cross-cutting gaps; it did not attempt the remaining files codebase-wide.
Say the word if you want that broader sweep next.

## 2. Raw UI bugs → real Jira tickets

Created **26 new Bug tickets, PS-295 through PS-320**, one per Issues
Report item that didn't already have a PS-number and wasn't already
addressed:

Items 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
21, 22, 23, 24, 25, 26, 28 → PS-295–PS-320 (verified all 26 exist in real
Jira with correct summaries, all currently **To Do**).

Deliberately excluded:
- **Item 5** — already tracked as PS-97.
- **Item 27** — already shipped, per Update 271's own regression notes
  (no PS-number was ever assigned to it).
- **Item 29 ("Search")** — the source document doesn't give enough detail
  to write a real, actionable ticket from. I'm not going to invent
  acceptance criteria for it. If you have more context or a screenshot,
  send it over and I'll open a proper ticket.

## Files changed

- `scripts/tag-phi.mjs` — added optional file-path arguments
- `src/pages/SynopticReportPage/components/HeaderBar.tsx`
- `src/pages/AccessionPage/AccessionPage.tsx`
