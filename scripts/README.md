# scripts/

Real, local, developer-run Node scripts — never deployed, never part of the app's own build or runtime.

**Real, honest disclosure**: this README only documents what was actually built and seen this session. The real `scripts/` folder in the actual repo almost certainly has more content that was never part of any upload to this session — confirmed indirectly: `src/services/specimenDictionary/mockSpecimenDictionaryService.ts` imports from `../../../scripts/terminology-sources/specimens-starter.json`, a real file this session has never seen (it's the one, single root cause behind the same 26 pre-existing, unrelated test failures that showed up in every full-suite run this whole session). This file does not attempt to describe that file or any other real script this session never had visibility into.

## Files

- **`seedEngraverDevices.ts`** — Populates `engraver_devices` with realistic sample data for local visual verification of the Engraver Monitor page (`src/pages/BatchManagement/EngraverMonitorPage.tsx`) — built specifically because that collection has no other way to get real-looking data without a real Cassette Engine connected. Seeds through the real `upsertEngraverStatus()` function (`api/webhooks/engine/_lib/`), not a raw Firestore write, so the seeded documents are guaranteed to match the real schema exactly rather than risk a hand-typed seed drifting from it. Real, deliberate variety across every real `status` value and both real warning shapes (`supplyWarnings` with real `CassetteColorDefinition` keys; free-text `warnings` for non-supply issues) — deliberately does **not** seed "multi-hopper" data, since PathScribe's own confirmed architecture never models per-hopper detail at all.

  **Real safety guardrail**: refuses to run unless `FIRESTORE_EMULATOR_HOST` is set, unless `--force` is passed explicitly — a seed script silently overwriting real device data because someone had real production credentials configured would be a genuinely bad, easy-to-hit accident otherwise.

  Run via `npm run seed:engravers` (uses `tsx`, not `ts-node` — see the real reasoning below).

  **Real tooling note, found the hard way**: this script's own imports had to go through two failed attempts before landing on `tsx`. `ts-node --esm` failed on Node's strict ESM extension-resolution rules; adding explicit `.js`/`.ts` extensions just moved the failure one level deeper, into `upsertEngraverStatus.ts`'s own existing, correct, extensionless imports (which are fine for how Vite/Vercel actually bundle the rest of this app, and shouldn't be rewritten just to accommodate a dev script). `tsx` is a bundler-aware runner that matches this project's own real `moduleResolution: "bundler"` setting and resolved the whole chain correctly on the first real, verified run. Added as a real `devDependency`.

---
*When this folder's contents change meaningfully, update THIS file.*
