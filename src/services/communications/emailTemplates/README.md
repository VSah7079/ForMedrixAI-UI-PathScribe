# services/communications/emailTemplates/

Email subject + HTML/text body builders for the two real, tracked email-generating workflows in the app.

## Files

- **`enhancementEmailTemplates.ts`** — builds emails for enhancement requests.
- **`synopticEmailTemplates.ts`** — builds emails for synoptic template events.


## Batch 364 (PS-349, PS-350): support references

`enhancementEmailTemplates.ts`: the "Page" line is the route pattern (`/report/:caseId`), and a "Case support reference" line follows when the ticket was sent from a case. A `null` line could appear in the text version; it no longer can.

---
*See [services/README.md](../../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
