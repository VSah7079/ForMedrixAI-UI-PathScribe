# scripts/

Real, local, developer-run Node scripts — never deployed, never part of the app's own build or runtime.

**Real, honest disclosure**: this README only documents what was actually built and seen this session. The real `scripts/` folder in the actual repo almost certainly has more content that was never part of any upload to this session — confirmed indirectly: `src/services/specimenDictionary/mockSpecimenDictionaryService.ts` imports from `../../../scripts/terminology-sources/specimens-starter.json`, a real file this session has never seen (it's the one, single root cause behind the same 26 pre-existing, unrelated test failures that showed up in every full-suite run this whole session). This file does not attempt to describe that file or any other real script this session never had visibility into.

## Files

- **`seedTerminology.ts`** — seeds the licensed terminology code sets into Firestore (`terminology/{system}/codes`, plus a `terminologyMeta` row per system). **Batch 324 (PS-47):** moved to the modular Admin SDK imports (`initializeApp`/`cert` from `firebase-admin/app`, `getFirestore`/`Timestamp` from `firebase-admin/firestore`), because firebase-admin 14 removed the namespaced `admin.firestore()` / `admin.credential` API. The behaviour is unchanged. It type-checks against 14 but hasn't been run here (it needs a real service account).

- **`seedEngraverDevices.ts`** — Populates `engraver_devices` with realistic sample data for local visual verification of the Engraver Monitor page (`src/pages/BatchManagement/EngraverMonitorPage.tsx`) — built specifically because that collection has no other way to get real-looking data without a real Cassette Engine connected. Seeds through the real `upsertEngraverStatus()` function (`api/webhooks/engine/_lib/`), not a raw Firestore write, so the seeded documents are guaranteed to match the real schema exactly rather than risk a hand-typed seed drifting from it. Real, deliberate variety across every real `status` value and both real warning shapes (`supplyWarnings` with real `CassetteColorDefinition` keys; free-text `warnings` for non-supply issues) — deliberately does **not** seed "multi-hopper" data, since PathScribe's own confirmed architecture never models per-hopper detail at all.

  **Real safety guardrail**: refuses to run unless `FIRESTORE_EMULATOR_HOST` is set, unless `--force` is passed explicitly — a seed script silently overwriting real device data because someone had real production credentials configured would be a genuinely bad, easy-to-hit accident otherwise.

  Run via `npm run seed:engravers` (uses `tsx`, not `ts-node` — see the real reasoning below).

  **Real tooling note, found the hard way**: this script's own imports had to go through two failed attempts before landing on `tsx`. `ts-node --esm` failed on Node's strict ESM extension-resolution rules; adding explicit `.js`/`.ts` extensions just moved the failure one level deeper, into `upsertEngraverStatus.ts`'s own existing, correct, extensionless imports (which are fine for how Vite/Vercel actually bundle the rest of this app, and shouldn't be rewritten just to accommodate a dev script). `tsx` is a bundler-aware runner that matches this project's own real `moduleResolution: "bundler"` setting and resolved the whole chain correctly on the first real, verified run. Added as a real `devDependency`.

- **`spellcheck/build-spellcheck-assets.mjs`** (Batch 336, PS-342): builds the spell-check dictionaries into `public/spellcheck/`. It takes the base Hunspell dictionaries from the `dictionary-*` dev dependencies and PathScribe's own lexicon from `spellcheck-data/`, and writes `manifest.json`, `base/`, `medical/`, `licenses/` and `NOTICE.txt` with each source's licence. **Batch 337:** German is added under the GPL. It is copied unmodified, the full GPL texts ship with it, and its source is shipped from `spellcheck-data/sources/de-DE/` or offered in writing. The script warns while the source-offer contact is still a placeholder. Run it with `npm run spellcheck:build`. The output is committed and ships as static files, so a deployment doesn't need to run it. **Batch 339:** it also reads the licensed clinical vocabularies dropped into `spellcheck-data/licensed/` (the SPECIALIST Lexicon's `LRAGR`, SNOMED CT RF2 releases, LOINC with its linguistic variants), using `spellcheck/licensedSources.mjs` and the rules in `spellcheck-data/licensed-sources.json`. Only the derived word lists ship, with attribution in `NOTICE.txt`. With no licensed folder the output is unchanged. Use `npm run spellcheck:build -- --licensed <folder>` for another folder. It is tested end to end on the synthetic samples in `spellcheck/fixtures/licensed/` by `spellcheck/licensedSources.test.mjs`.


- **`auth/hash-demo-password.mjs`** (Batch 343, PS-60): prints the stored form of a demo-account password for `src/services/auth/demo/demoAccounts.ts`. It uses PBKDF2-SHA256 with 600,000 iterations and a fresh random salt. It asks for the password without echoing it (or reads it from standard input), so the password itself never goes into the source. Use it to change the demo passwords, which were in the shipped bundle in plain text until Batch 343.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`tag-phi.mjs` still auto-tags simple cases, but its line-by-line audit over-reports (class names, comments, filters and props all match). The count that decides PS-72 is `src/services/phi/phiTagging.guard.test.ts`, which reads the code structure; see `src/services/phi/README.md`.

---
*When this folder's contents change meaningfully, update THIS file.*
