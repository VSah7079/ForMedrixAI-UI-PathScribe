# services/communications/

Generic email/notification transport plus domain-specific notification builders.

**Pattern:** Barrel-exported (import from services/communications, not individual files).

## Files

- **`index.ts`** — Public API surface — sendEmail, resolveByRoles/resolveTemplateOwner/mergeRecipients, sendSynopticNotification.
- **`notificationService.ts`** — Generic transport.
- **`recipientResolver.ts`** — Role-based recipient resolution.
- **`synopticNotificationService.ts`** — Domain-specific: high-stakes synoptic audit event notifications.
- **`emailTemplates/`** — HTML/text email template builders.

## Notes

- **Real, new consumer (PS-287, Sep 2026):** `sendEmail()` (transport-only, unchanged) is now also how `pages/AddOnOrderPage/hooks/useAddOnOrderStation.ts` fires the spec's own "Pathologist Notification Loop" — a real, fire-and-forget alert to the ordering pathologist when a tech flags a block-exhaustion exception. No domain-specific builder file added here (unlike `synopticNotificationService.ts`) since the subject/body are simple enough to build inline; worth promoting to its own builder if a second real caller ever needs the same shape.


## Batch 364 (PS-349, PS-350): support references

`emailTemplates/enhancementEmailTemplates.ts`: support ticket emails show the page type and the case's support reference, never the case number.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*