# components/SpellCheck/

**The report screens' spell checking (PS-342, Batch 338).** This folder holds the UI side; the engine and all the decisions are in [`services/spellcheck/`](../../services/spellcheck/README.md).

## How a screen turns it on

A report screen calls `useCaseSpellCheck` (`hooks/useCaseSpellCheck.ts`) with the case's ordering facility, assigned pathologist and per-case choice, then wraps its content in `<SpellCheckProvider value={…}>`. Everything inside is then checked in that case's language:

| Screen | Case, pathologist, per-case choice |
|---|---|
| `SynopticReportPage` | `order.facilityId`, `order.assignedTo`, `Case.spellingLocaleOverride` (saved with `caseRouter.updateCase` and the page's version check) |
| `CytologyScreeningPage` | the same fields; the choice is saved with `caseRouter.updateCase` |
| `IntraopQueuePage` | the session's facility and `performedBy` pathologist. There is no case yet, so there's no per-case choice and the control is read-only |

Outside a provider, `PathScribeEditor` and `SpellCheckedTextarea` fall back to the browser's own spell check, so admin screens and other text are unaffected.

## Files

- **`SpellCheckContext.tsx`:** the context (`SpellCheckProvider`, `useSpellCheckContext`): language, why it was chosen, the facility dictionary, the worker client, a `revision` that changes whenever the language or word lists change, and the actions (add to my dictionary, add to the facility dictionary, ignore, set the case's language).
- **`spellCheckExtension.ts`:** the TipTap/ProseMirror plugin `PathScribeEditor` installs. It is always installed and reads the context through a ref, since TipTap fixes extensions when the editor is created.
  - It checks after typing pauses for 300 ms (`DEBOUNCE_MS`) in the Web Worker, and only paragraphs the worker hasn't seen.
  - Squiggles are decorations that move with edits; a result for an older version of the document is thrown away and re-requested.
  - A right-click on a squiggle opens the menu; anywhere else the browser's menu is used.
  - `requestSpellRecheck(view)` re-checks after a language or word-list change.
- **`SpellCheckedTextarea.tsx`:** a drop-in `<textarea>`. Inside a provider it draws squiggles on a layer behind the text box: the layer and the box share one grid cell and the same class, so they are the same size and the text lines up, and the layer scrolls with the box. A replacement goes through the textarea's native value setter and an `input` event, so the parent's `onChange` runs as if the word had been typed.
- **`SpellCheckMenu.tsx`:** the right-click menu (a portal to `document.body`): suggestions, Ignore for this session, Add to my dictionary, and Add to the facility dictionary for admin roles. Arrow keys move and Escape closes. What it offers comes from `services/spellcheck/spellMenuModel.ts`.
- **`SpellingLanguageControl.tsx`:** shows the language and why it applies ("English (United Kingdom) (facility default)"), and lets the pathologist choose another for this case, or **Default** to clear the choice. It replaced the retired AI check's "British/American English" badge in the report editor's header, and also sits in the microscopic entry panel, the cytology screening header and the intraop capture form.

## Styling

All in `pathscribe.css` (`ps-spell`, `ps-spelltext`, `ps-spellmenu`, `ps-spelllang`). Red squiggles mark misspellings; blue ones mark the other English convention's spelling (for example "color" in a UK report). The menu's position is passed as `--spellmenu-x` / `--spellmenu-y`.

## Verified in the browser (Batch 338)

On a UK case (Royal Manchester Centre, facility default en-GB):
- British spellings were accepted and "specimin" / "recieved" were flagged;
- the menu offered "specimen" first and replaced the word;
- Add to my dictionary cleared the squiggle;
- switching the case to US English flagged "tumour", "haemorrhage" and "colour" in blue, the choice was saved on the case, and **Default** went back to the facility's language.

Frame gaps stayed at 16.8 ms at most while typing. The Case Hold note, the cytology notes and the intraop quick gross were also checked; the squiggles lined up with the text.

---
*See [components/README.md](../README.md) for the rest of the components/ layer.*
