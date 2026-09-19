# PathScribe Update 220 — Summary

Two things: a real correction to how PAD/FAD snapshots capture diagnostic content, and the real settings that let a customer control the concordance-review behavior decided earlier this session.

## Part 1 — Real report text in PAD/FAD snapshots (correcting an earlier overcomplication)

Direct correction received: "the Final Diagnosis in an Autopsy report is a cause of death, what else could it be? That data exist as does the PAD data — let's not over complicate things here." Right call — no dedicated `AutopsyReportContent`/cause-of-death type is needed. `Case.orchSections` (Gross Description, Diagnosis, etc.) is the same, real, generic report-text mechanism every specialty already writes to.

- `signAutopsyReport.ts`: `AutopsyReportSnapshot.frozenPayload` now captures real `orchSections` content (id/label/text per section) instead of the earlier placeholder (`{ scope, jurisdiction }`).
- The countersign comparison snapshots (both the resident's release and the attending's completion) now include the same real section text, flattened into the existing generic key-value shape — the delta computation actually reflects real diagnostic changes now, not just scope/jurisdiction.
- `SynopticReportPage.tsx`'s sign handler now saves any unsaved draft text (`writeCaseDraft`) before signing, so the snapshot captures what the pathologist actually just wrote.
- 2 new tests confirming real section text is captured correctly in both the direct-sign and countersign-release paths.

Net effect: `padSnapshot`/`fadSnapshot` now hold real, comparable diagnostic content — a PAD-vs-FAD concordance screen is buildable directly on top of this now, not blocked on anything further. PS-292 updated to correct the earlier, overcomplicated framing.

## Part 2 — Real, persisted settings for the concordance-review behavior

New service, mirroring the Post-Sign-Out Release Buffer's own proven org-default/facility-override shape exactly (`ReportReleaseOrgConfig`/`Facility.releaseBufferOverride`) — not a new pattern invented for this feature:

- **`IConcordanceReviewSettingsService.ts`** / **`mockConcordanceReviewSettingsService.ts`** — two independent settings, both defaulting to enabled (an opt-out, not opt-in, posture, per this session's own "make it configurable so it can be avoided" framing): `aiComparisonEnabled` (does the automatic preliminary-vs-final comparison run at all) and `reviewScreenEnabled` (does the mandatory review screen appear at sign-out). 6 tests, mirroring the release buffer's own real facility-override test pattern exactly (real `mockFacilityService`, not mocked).
- **`Facility.concordanceReviewSettingsOverride`** — new, optional field on `IFacilityService.ts`, same `inheritSystemDefault` shape as `releaseBufferOverride`.
- **`ConcordanceReviewSettingsSection.tsx`** — the real, org-wide default config screen, wired into Config → System → Administration & Compliance, right next to Post-Sign-Out Release Buffer (same group).

Deliberately not Autopsy-specific: this governs the concordance-review behavior broadly — the frozen-vs-final case already real today, and any future PAD-vs-FAD equivalent now unblocked by Part 1 above.

## Verification
`tsc` clean throughout. Full suite: 432 files, 3743 tests, all passing (up from 431/3737 — 1 new test file, 6 new tests for the settings service, plus the 2 new signAutopsyReport tests already counted in that delta).

Verified visually, end-to-end, in the running app: navigated to the new config screen, toggled "Require Review Screen at Sign-Out" off, reloaded the page fully, and confirmed the setting correctly persisted (`false` → still `false` after reload). No page errors at any point.
