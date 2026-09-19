# PathScribe Update 224 — Summary

Direct question: "Does a Preliminary Diagnosis Text Field exist?" No, it didn't — a real gap in last update's own work, caught before it went further. Fixed for the Surg Path side; a bigger, separate finding surfaced along the way for the Cytology side.

## The direct answer, and the fix

`prelim_body_surgpath_impression` (update-223) bound its "Preliminary impression" field to `specimen.preliminaryImpression` — a field that doesn't exist anywhere in the real data model. Checked the established, working precedent (`grossDescription`/`microscopicDescription`) directly rather than guessing at the right shape: both are real, but live on `Case.diagnostic` (`DiagnosticMetadata`, `types/case/Case.ts`) as case-level, single-string fields — not per-specimen ones, despite the existing `grossPart`/`microPart` templates wrapping them in a specimen repeat-group.

Fixed accordingly:
- Added `DiagnosticMetadata.preliminaryImpression` — the real field, matching `grossDescription`'s own case-level shape.
- Also added the other fields this same gap affected across the rest of update-223's own new parts, since the same binding-key-with-no-real-field pattern was present there too: `specialStainsStatus`, `ihcStatus`, `decalcificationStatus`, `molecularStatus`, `recutStatus` (Ancillary Testing Status), and `reviewerRole`, `preliminaryRecordedAt`, `criticalValueCommunicated`, `criticalValueRecipient`, `criticalValueNotifiedAt`, `criticalValueNotes` (Preliminary Reviewer Attestation / Critical Value Log).
- `prelim_body_surgpath_impression` itself: removed the incorrect per-specimen repeat-group wrapper and rebound to the real `diagnostic.preliminaryImpression`, matching `clinicalPart`'s own simple, non-repeated pattern.

## A bigger, separate finding surfaced while investigating this

Checked whether the two new Cytology templates (GYN, Non-GYN/FNA) from update-223 have the same problem — they do, but for a more fundamental reason. Confirmed directly: `CytologyScreeningPage.tsx` (the real Cytology sign-out UI) never references `mockReportTemplateService` or `ReportTemplate` at all — zero matches. Cytology has its own, entirely separate sign-out system (`mockCytologySignOutRecordService`, per an earlier PS-292 finding), completely disconnected from the orchestrator template/rendering pipeline (`ReportPreviewRenderer.tsx`, `contextBuilder.ts`) these templates were built into.

This means the two Cytology Preliminary templates are structurally valid `ReportTemplate` records — they appear correctly in the picker, list the right slots — but are functionally unreachable: no real Cytology case today would ever actually render through them, since Cytology's own sign-out flow doesn't know this template system exists. The Surg Path template doesn't have this problem — `SynopticReportPage.tsx` does use the real template system — so only that one's binding-key gap was the kind of thing a straightforward field addition could fix.

**Not fixed here — flagged on PS-292 instead**, since connecting Cytology's own sign-out system to the template engine (or building the equivalent binding surface Cytology would actually use) is a substantially larger, separate piece of work than this update's own scope.

## Verification
`tsc` clean. Full suite: 432 files, 3748 tests, all passing (no new tests — this fixes binding keys and adds type fields on existing, already-tested infrastructure).
