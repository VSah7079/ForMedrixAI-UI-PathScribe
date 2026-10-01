# components/Config/Models/

AI model performance/version comparison tab.

**Pattern:** Single clean component over `services/models/`.

## Files

- **`index.tsx`** — `ModelsTab`: the current organisation's adopted models (PS-58, Batch 320).
  - Name, vendor and type come from the global ForMedrixAI catalog. Status, default, accuracy and cases processed are this organisation's adoption record, so another organisation's view is unaffected by anything done here.
  - The subtitle now says so.
  - **Set Default:** asks `canBecomeDefault` (`Config/AI/resolveVoiceAiModel.ts`) before calling the service, then re-reads the list rather than working out itself which other defaults cleared. That decision is in `services/models/modelAdoption.ts → applyDefault`. A Voice Dictation model still needs a PASS-graded, reported Validation Study before it can become the default, because becoming the default is the moment it goes live.
  - **Facilities Approved:** uses `facilitiesPinnedToModel` (`services/models/modelAdoption.ts`).
  - **Labels and formatting:** vendor labels come from the shared `services/models/modelLabels.ts`. Accuracy and case counts are formatted in the user's locale (`modelsTab.accuracyValue`).

## Notes

- Models arrive here two ways: the organisation's starter adoptions, or adoption from the ForMedrixAI store (`ValidationStudies/ModelStoreModal.tsx`). A newly adopted model is always Beta, not the default, with zero cases.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
