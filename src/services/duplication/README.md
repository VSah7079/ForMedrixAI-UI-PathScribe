# services/duplication/

Which admin screens offer **Duplicate**, and what a copy keeps or clears (Jira PS-73, Batch 317).

**Pattern:** pure functions, no storage. Components call these and open their ordinary **Add** form pre-filled with the result. Saving goes through the screen's normal `add()`/`create()`, which assigns the real id.

## Files

- **`duplicatePolicy.ts`**: the registry of decisions. Each entry names the screen's file, whether it offers Duplicate, the category from Pete's framework, and a one-line reason.
  - **Allowed** categories: `complex-configuration`, `template-entity`, `multi-site-variant`.
  - **Not allowed** categories: `real-person-or-entity`, `flat-lookup`, `transactional-or-audit`.
- **`duplicateEntities.ts`**: one pure `duplicateX()` per entity. Each function:
  - deep-copies with `structuredClone`;
  - sets the placeholder id `DUPLICATE_PLACEHOLDER_ID` (`'__clone__'`);
  - marks the name through a caller-supplied, localized `CopyNameFormatter` (`name => t('common.copyOfName', { name })`);
  - clears identity and matching-key fields (accession prefix/series, specimen code and synonyms, gene symbol, printer id/IP, facility assigning authority/CLIA/address/contacts, participation-type abbreviation, facility overrides and regional titles);
  - drops built-in/system status.

  The QA type copy is the one exception to the placeholder id: that screen upserts by id, so `duplicateQaType` returns a real fresh id. Case Pool Assignment likewise assigns its `rule-custom-…` id itself.
- **`duplicateEntities.test.ts`**: one test group per entity.
- **`duplicatePolicy.guard.test.ts`**: source-level enforcement:
  - no Duplicate action where the policy says no;
  - a Duplicate action where it says yes;
  - every component anywhere under `src/` that renders a Duplicate label is registered as allowed;
  - no hard-coded English copy marker (`"(Copy)"`, `"Copy of …"`) anywhere in `src/`;
  - `common.copyOfName` exists in all five languages;
  - no inline CSS (and no imperative `element.style` writes) in the covered screens and the protocol files.

## Decisions (Sep 2026)

| Offers Duplicate | Screens |
|---|---|
| Complex configuration | Facility, Stain Dictionary (types, sectioning protocols, macros, molecular targets), Processing Protocols, synoptic protocols (All/Active), Case Pool routing, Routing Rules, Cassette Routing, TAT/escalation, Abnormal Trigger Rules, QA Configuration Center, Cytology QC Rules, Role Dictionary, Billing Dictionary, Participation Types |
| Template entity | Specimen Categories, Specimen Dictionary, Report Parts, Report Templates, Action Groups |
| Multi-site variant | Printer Profiles, Workstation Groups |

| No Duplicate | Why |
|---|---|
| Physicians | A real person; a copy is a wrong person. |
| Container Types, Delegation Types, RVU code map rows, Cassette Colors | Flat lookups of a few fields. |

Two copies deliberately start **inactive**: cassette routing rules and abnormal trigger rules. An unchanged copy of either matches exactly what its source matches, so it must not act on real cases until the admin has made the change it was copied for.

## Adding Duplicate to a new screen

1. Add an entry to `DUPLICATE_POLICY` with the category and reason. The guard test fails without one.
2. Add a `duplicateX()` here, with tests, clearing any identity/matching-key fields.
3. In the screen, open the Add form with `{ mode: 'add', entry: duplicateX(source, name => t('common.copyOfName', { name })) }`.
4. Make sure the save path decides add-vs-update from `mode`, never from whether an entry was passed in (a duplicate passes one for an add). Also check that fields the form doesn't display carry over on an add.

## Batch 356

**Instruments** (`InstrumentsSection.tsx`) are recorded as no-Duplicate (`real-person-or-entity`). An instrument is one physical device with its own code on batches and labels.

## Batch 358

The Instruments entry became **Equipment** (`EquipmentSection.tsx`), no-Duplicate (`real-person-or-entity`).

## Batch 359

**Grossing Hardware** (`GrossingHardwareSection.tsx`) is recorded as no-Duplicate (`flat-lookup`). A duplicated printer profile no longer copies its register device (`equipmentId`).

## Batch 369 (PS-355)

`duplicateRole` keeps the source's capabilities but drops `assignable` and `seededCapabilities`, so a copy of Superadmin is an ordinary custom role that can be given to staff.

## Batch 371

`duplicateRole` drops ForMedrixAI platform-only capabilities, since a copy is always a hospital role.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
