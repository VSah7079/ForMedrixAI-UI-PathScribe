# services/phi/

Keeping patient data out of support-ticket screenshots (PS-72).

When a user sends an Enhancement Request, `hooks/useScreenCapture.ts` takes a screenshot and covers every element matching `services/phiSelectors.ts`: mostly `data-phi="…"` attributes. Patient data the UI shows *outside* such an element ends up in the screenshot. This folder finds those places and keeps them from coming back.

## Files

- **`phiRenderAudit.ts`**: `auditPhiRendering(fileName, text)` reads a file with TypeScript's parser and returns each place it shows patient data outside a redacted element.
  - **Patient data:** name, date of birth or age, MRN or patient identifier, NHS number, accession or case number (a case's id is its case number in this app), and patient contact or insurance fields. It is recognised from property paths (`c.patient.lastName`, `log.caseId`), from local constants built from them, from `{ accession: … }`-style translation values, and from `.map` rows traced back to the list they came from. Staff names are not patient PHI (Pete's scope decision, recorded in `scripts/tag-phi.mjs`).
  - **Shown:** a JSX child, an `<input>`/`<textarea>` value, a `<Trans values>`, or a toast message (`toast…()`, the report page's `showToast()`).
  - **Redacted:** the element or an enclosing one has `data-phi`/`data-pii` or a PHI class; a toast is wrapped in `PhiToastMessage`/`phiToastContent()` or marked `{ containsPhi: true }`; a `<Trans>`'s `components` carry `data-phi`.
  - **Not counted:** class names, translation keys, comments, conditions, counts (`.length`), props handed to another component (checked in that component's file), `renderX()` helpers (checked where they build JSX), `xFor(id)` lookups, and invented sample data (`MOCK_…`, `SAMPLE_…`).
- **`phiTagging.guard.test.ts`**: runs the audit over all of `src/` (1,000+ files, about 5 s). No exception list: the app passes with zero findings. A mutation check strips the worklist's tags and confirms the audit notices.
- **`phiRenderAudit.test.ts`**: what it finds and what it rightly ignores.
- **`phiToast.ts`**: `phiToastContent(text)` for a redacted react-toastify message from code outside components (the `hl7/` notifications); `phiToastText()` reads it back in tests.

## Fixing a failure

Tag the element the message names, usually `data-phi="<kind>"` on the element that shows the value (`name`, `dob`, `mrn`, `accession`, or `true`). For a report-page toast pass `{ containsPhi: true }`; for any other toast wrap it in `PhiToastMessage` (components) or `phiToastContent()` (services).

## Limits

- It reads names, not types. A value under a name that says nothing (`const x = c.accession…` rendered as `{x}` is traced, but a value from an unrelated function is not) can be missed, so Batch 363 also checked twenty screens in the browser for any visible text containing a seeded patient's name, MRN, date of birth or accession outside a redacted element. None remained.
- Free text that happens to contain an identifier (audit detail, interface-exception reasons) can't be seen by any code check; those cells are tagged as a whole.
- `scripts/tag-phi.mjs` still auto-tags simple cases, but its line-by-line audit over-reports; use the guard here for the real count.

## Batch 368: a blind spot found

`VersionHistoryModal` showed the snapshot's patient name, MRN and date of birth without `data-phi`. The values came from a label/value list built by a helper (`snapshotFields`), and the check can't see through that. The screen is tagged now; the check still can't follow values passed through such lists.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
