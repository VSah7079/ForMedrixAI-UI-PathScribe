# Update 282 — Corrected commercial logos, and a full-tree snapshot to stop the file-gap problem for good

## 1. Full snapshot — why, and what it is

Your last two test runs surfaced a pattern, not two isolated bugs:

- `resolveParticipationTypeAuthority is not a function` — your tree was missing
  `IParticipationTypeService.ts`'s real export from **Update 279**.
- `Failed to resolve import "@/components/Common/PhiToastMessage"` — your tree
  is missing a file created all the way back in **Update 274**.

Two different updates, six numbers apart, both with a file that never
landed. Chasing this one zip at a time risks a third gap turning up next
week. So instead of another delta, this update is a **complete, current
snapshot** of `src/`, `public/`, `scripts/`, and the root config files
(`package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`,
`vitest.config.ts`) — everything needed to build and test, taken directly
from the tree these test runs have been validating against all along.

**How to use it**: extract it over your existing `pathscribe-ai` folder,
letting it overwrite every file it contains (it does not touch
`node_modules`, so run `npm install` afterward in case `package.json`
changed dependencies since your last sync — it has, `xlsx` was removed
back in Update 275). This sidesteps the question of which past zip did or
didn't fully land — after this, your tree matches what's actually been
tested here, file for file.

One thing this snapshot does **not** touch: the stray `update-267-277`
folder inside your project root that's still causing 2 of your test
failures (`Cannot find module '.../mockBatchService'`). That folder isn't
part of the live app — it's a leftover staging extraction — so it's not in
this snapshot, and vitest is picking up its test file even though the
folder is missing files it needs. Move or delete it (or exclude it in
`vitest.config.ts`) and those 2 failures go away; they aren't fixable from
inside the snapshot since they're not live source.

## 2. Corrected logos

Replaced the wrong ForMedrixAI logo, and filled in a real, separate gap I
found while doing it: the PathScribe logo file the app has been trying to
load (`/pathscribe-logo-clean.svg`, referenced in the nav bar and the login
page) has never actually existed in `public/` — that image has been broken
since before this session's history starts.

- **`public/formedrix-logo-capM-dark.png`** — replaced with your corrected
  artwork (the full lockup: icon, wordmark, and tagline together). Per your
  call, I dropped the separate, live "Precision • Care • Innovation" text
  that used to render next to it on the login page (it existed only because
  the *old* logo file didn't have a readable tagline baked in at that size —
  your new artwork does, so keeping both would have shown it twice). Removed
  the now-dead CSS for that separate text, left a comment explaining why.
- **`public/pathscribe-logo-clean.png`** (new) — the PathScribe logo from
  your zip, filling the previously-broken reference. Updated the two places
  that reference it (`NavBar.tsx`, `LoginPage.tsx`) from the `.svg` path
  that never existed to this real `.png`. **Note**: this is a raster PNG,
  not a true vector — I don't have a vector-conversion tool in this
  environment to turn your `.ai`/`.eps`/`.pdf` source into a real `.svg`.
  It's sized generously (1400px wide) so it stays crisp at the small sizes
  it's actually displayed at, but if you have (or can get from your
  designer) a real `.svg` export, that'd be the more correct long-term
  asset.
- Did **not** touch the app's favicon or `pathscribe-icon-180.png` — both
  already match your current brand style reasonably well, and you didn't
  flag them as wrong. Say the word if you want those redone from the same
  source art.

## Validation

- `npx tsc --noEmit -p .`: clean.
- `npx vitest run --exclude firestore.rules.test.ts`: 477/477 files,
  4181/4181 tests passing (no test touches either logo or the login page,
  so this is unchanged from before — the logo swap has no logic to break).

## Files changed

- `public/formedrix-logo-capM-dark.png` (replaced)
- `public/pathscribe-logo-clean.png` (new)
- `src/pages/LoginPage.tsx`
- `src/components/NavBar/NavBar.tsx`
- `src/pathscribe.css`
