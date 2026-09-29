# components/ExternalConsult/

**NEW (Sep 2026)** — PS-290. The internal, pathologist-facing half of
External Consult / Second-Opinion Access — issuing and managing links.
The outside consultant's own read/opinion-submission view is a separate,
public route (`pages/ExternalConsultViewPage/`), not this folder.

## Files

- **`ExternalConsultAccessModal.tsx`** — mirrors
  `RequestReview/RequestReviewModal.tsx`'s own real conventions
  (`ps-overlay`/`ps-modal-dark` shell, `ReactDOM.createPortal`) rather
  than inventing a new modal shape. Three views: a list of tokens already
  issued for this case (status badge, revoke), an issuance form
  (consultant identifier/organization/note, Full Case vs. Specific Slides
  scope, a live default-lifespan preview), and a post-issuance screen with
  the copyable link. Wired into `SynopticReportPage/components/
  BottomActionBar.tsx` (a new "🌐 Consult" action, alongside "🔍 Req.
  Review") — receives the same `caseData`/`user` props that modal already
  does, no new data plumbing needed.

## Real, load-bearing disclosure

Every view in `ExternalConsultAccessModal.tsx` carries a visible red
banner stating this is not real, production-secure external access — see
`services/consultAccess/IConsultTokenService.ts`'s own header for why.
Do not remove or soften it without the real backend (PS-291) this domain
is deliberately waiting on.

## Batch 367 (PS-74): no inline CSS

`ExternalConsultAccessModal.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
