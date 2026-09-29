# services/spellcheck/

**Multi-jurisdiction medical spell checking (PS-342).**
- **Batch 336:** built the engine.
- **Batch 337:** added German under the GPL.
- **Batch 338:** wires the checker into the report editor and plain text boxes, and removes the AI spelling check.
- **Batch 339:** adds the dictionary build step for the SPECIALIST Lexicon, SNOMED CT and LOINC. It is tested on sample files; real releases go in `spellcheck-data/licensed/` once the licences are in (PS-343).

## How a word is checked (the cascade, AC1)

`spellCascade.ts` resolves every word through these tiers, in order; the first tier that accepts it wins:

1. **Personal dictionary**: the pathologist's own words.
2. **Facility dictionary**: the lab's own words (local acronyms, shorthand).
3. **Regional check (AC2)**: a word written in the *other* English convention is flagged with this convention's form. For example, "hematology" in a UK report is flagged with "haematology". This happens before the dictionaries below could accept it.
4. **Jurisdiction medical lexicon**: PathScribe's pathology lexicon, plus (English) the SPECIALIST Lexicon's words when its release is built in.
5. **Clinical vocabularies**: words from SNOMED CT and LOINC, for every language with a release built in (Batch 339). Empty until the licensed releases are added.
6. **Base language dictionary**: Hunspell.

**Codes never reach the cascade (AC3).** `tokenizeForSpelling.ts` skips these, whatever the language:
- anything containing a digit: SNOMED ids, LOINC, ICD-10, ICD-O, TNM, CK7, Ki-67, measurements, Gleason scores, accession numbers;
- acronyms of up to 6 capital letters;
- dotted abbreviations, URLs and e-mail addresses.

Hyphenated words are checked part by part.

## Which language (Pete, Sep 26)

`resolveSpellingLocale.ts` picks the language in this order:
1. the **case's own choice**;
2. the **assigned pathologist's** profile preference;
3. the **facility's** jurisdiction default (the ordering facility);
4. **en-US**.

A language without dictionaries is skipped, never used. There are none today; the mechanism stays for any future language.

`spellingLocales.ts` holds the per-jurisdiction defaults:
- **US English:** US.
- **Canadian English:** Canada. Both US and UK medical spellings are accepted.
- **UK English (-ise):** the three UK jurisdictions and Ireland.
- **Australian English:** Australia and New Zealand. There is no packaged en-NZ dictionary.
- **Dutch:** the Netherlands and Belgium. A French-speaking Belgian lab can pick French for a case.
- **French:** France.
- **Korean:** Korea. English words in a Korean report are checked in US English.
- **German:** Germany.

## Files

- **`spellingLocales.ts`, `resolveSpellingLocale.ts`:** the languages and the rules for picking one.
- **`tokenizeForSpelling.ts`:** splits text into words and applies the pass-through rules. Korean particle stripping (`koreanLookupForms`) lets 검체를 match 검체; the particle list needs native-speaker review.
- **`spellCascade.ts`:** pure.
  - `checkWord`, `checkText` (issues with offsets and reasons `misspelled` / `regionalVariant`);
  - `suggestWord`: the regional form first, then the medical and base dictionaries' suggestions pooled and ranked by closeness to what was typed (`editDistance`; equal distances keep medical first). Batch 338 fixed a ranking bug found in the browser check: "specimin" suggested "spermatic" before "specimen";
  - `wordSetLookup`.
- **`spellEngine.ts`:** builds the tiers for one language from the files in `public/spellcheck/`, using real **Hunspell 1.7.3 compiled to WebAssembly** (`@farscrl/hunspell-wasm`).
  - **Medical tier:** a second Hunspell instance over the base `.aff` plus the medical `.dic`. Medical words therefore get plurals and possessives and show up in suggestions.
  - **Korean medical tier:** a word list, because the Korean base dictionary stores words in decomposed form.
  - **Clinical tier (Batch 339):** a third Hunspell instance over the base `.aff` plus `clinical/<locale>.dic`, so SNOMED CT and LOINC words also show up in suggestions; Korean uses `clinical/ko-KR.txt`. `suggestWord` pools the medical, clinical and base suggestions.
  - **File reading** is injected: fetch in the browser, the filesystem in tests.
- **`spellWorkerHandler.ts`:** the Web Worker's message protocol (`init`, `setCustomWords`, `check`, `suggest`). It keeps one engine per language and a verdict cache.
- **`spellcheck.worker.ts`:** the worker entry. It fetches the dictionaries from PathScribe's own static files, never an outside host, so it works in a private cloud.
- **`SpellCheckClient.ts`:** the main-thread client (`getSpellCheckClient()`). It sends only paragraphs it hasn't seen before; the worker factory is injectable for tests.
- **Personal and facility dictionaries (AC5):**
  - `customDictionaryRules.ts` holds the rules: single words only, and only the admin-tier roles may change the facility dictionary;
  - `ICustomDictionaryService.ts` / `mockCustomDictionaryService.ts` handle storage. They are exported as `customDictionaryService` from `@/services`;
  - a facility addition takes effect immediately and is audited ("Facility spelling dictionary word added/removed"). Personal words aren't audited.
- **Tests:**
  - `spellcheck.test.ts` runs the real Hunspell against the real built dictionaries, and checks that the German files are unmodified;
  - `customDictionary.test.ts`;
  - `spellCheckClient.test.ts` covers the client and worker protocol end to end, in process.

## In the report screens (Batch 338)

- **`resolveCaseSpellingContext.ts`:** everything one case needs, resolved once: the language (case choice → the assigned pathologist's `StaffUser.spellingLocale` → the ordering facility's default → en-US) and the facility dictionary, which belongs to the case's **performing lab**. Lookups are injected and a failed one falls to the next tier; it never rejects. `customWordsFor` merges session-ignored words into the personal list sent to the worker (they are never saved).
- **`editorTextBlocks.ts`:** maps between editor document positions and the paragraph text the checker sees, and splits plain text into squiggle segments for text boxes.
- **`spellMenuModel.ts`:** what the right-click menu offers: up to 5 suggestions, Ignore (this session only), Add to my dictionary, and Add to the facility dictionary for admin roles when the lab is known.
- The UI that uses these is in [`components/SpellCheck/`](../../components/SpellCheck/README.md); the per-case state is `hooks/useCaseSpellCheck.ts`.
- **Tests:** `editorIntegration.test.ts` covers the three files above and guards the wiring at source level: the report text boxes use `SpellCheckedTextarea`, the three report screens provide the context, `PathScribeEditor` installs the extension, and the AI spelling check stays retired.

## The licensed sources (Batch 339)

`scripts/spellcheck/licensedSources.mjs` turns the licensed releases in `spellcheck-data/licensed/` into word lists. The rules are set in `spellcheck-data/licensed-sources.json`; see `spellcheck-data/licensed/README.md`.

- **SPECIALIST Lexicon** (its `LRAGR` table): every inflected form of every spelling variant goes into the English medical tier. Words the language's general dictionary already accepts are left out.
- **SNOMED CT** (RF2 snapshots, any number of editions): active descriptions of active concepts in the pathology-relevant hierarchies.
  - English descriptions go to US, UK, Australian or Canadian English according to the dialect language reference sets.
  - National translations (German, French, Dutch, Korean) go by language code.
  - Case significance is kept, so "Kaposiform" is accepted but "kaposiform" isn't.
- **LOINC:** pathology, cytology, molecular and related classes, excluding deprecated codes. English names (US spelling) go to US and Canadian English; the linguistic variants feed German, French, Dutch and Korean.
- **US/UK pairs:** found in the sources (haemo-/hemo-, oe-/e-, -our/-or, -ise/-ize, -tre/-ter, -lled/-led, -ogue/-og). Each becomes a regional-variant rule, and the other spelling is dropped from that convention's lists. This happens only where that convention's dictionary rejects the other spelling, so "meter" stays correct in UK English.
- **What ships:** only the derived word lists (`medical/`, `clinical/`), with the attribution each licence requires in `NOTICE.txt`. The release files never do; a test checks this.
- **Tested** in `scripts/spellcheck/licensedSources.test.mjs`, on the synthetic samples in `scripts/spellcheck/fixtures/licensed/` (real formats, hand-written rows). The tests run the whole build and then check words with the real Hunspell:
  - a SNOMED-only word is accepted and suggested;
  - US forms are flagged in UK English and UK forms in US English, while Canadian English accepts both;
  - German Plattenepithelkarzinom and Cholangiokarzinom are accepted;
  - a Korean LOINC term is accepted with a particle;
  - inactive content and other hierarchies are left out.
- **Also checked in the browser** through the Web Worker: a sample-built SNOMED word was accepted, its misspelling offered it first, and the US form was flagged in a UK report. The sample build was then removed.

## Dictionaries and licences

`npm run spellcheck:build` (`scripts/spellcheck/build-spellcheck-assets.mjs`) writes `public/spellcheck/`: `manifest.json`, `base/`, `medical/` and `NOTICE.txt`.

| Language | Base dictionary | Licence | Medical tier |
|---|---|---|---|
| en-US / en-GB / en-AU / en-CA | SCOWL-based (`dictionary-en*`) | MIT and BSD | PathScribe lexicon (`spellcheck-data/en/`) |
| fr-FR | Dicollecte (`dictionary-fr`) | MPL-2.0 | none yet |
| nl-NL | OpenTaal (`dictionary-nl`) | BSD-3 or CC-BY-3.0 | none yet |
| ko-KR | hunspell-dict-ko (`dictionary-ko`) | used under MPL-1.1 | PathScribe Korean seed list (needs review) |
| de-DE | igerman98 (`dictionary-de`) | GPL-2.0 or GPL-3.0; used under the GPL (Pete, Sep 26) | none yet; core terms such as "Karzinom" are missing |

### German and the GPL (Batch 337)

German is used under the GPL. The build script (`scripts/spellcheck/build-spellcheck-assets.mjs`) keeps to these conditions:
- **Unmodified:** `public/spellcheck/base/de-DE.aff` and `de-DE.dic` are byte-for-byte copies of the published files. Never edit them; a test compares them against `node_modules/dictionary-de/`.
- **Separate:** they are data files that the Web Worker fetches at run time. They are not compiled into PathScribe's code.
- **Licence:** the full GPL-2.0 and GPL-3.0 texts ship in `public/spellcheck/licenses/`, and the author's notice is in `NOTICE.txt`.
- **Source:** anything placed in `spellcheck-data/sources/de-DE/` (the upstream igerman98 archive) is shipped in `public/spellcheck/source/de-DE/`. Until then, `NOTICE.txt` carries the GPL written offer, and the build prints a warning while `spellcheck-data/licenses/source-offer-contact.txt` still holds its placeholder.

**Before release:**
- have a lawyer confirm that this arrangement satisfies the GPL, especially for dictionaries served to customers' browsers;
- add either the source archive or a real contact address for source requests.

The same folder ships the full MPL-2.0 (French) and MPL-1.1 (Korean) texts.

## Where non-English medical terms come from

**No machine translation (Pete, Sep 26, 2026).** Every word in the lexicon counts as "correct", so a mistranslated term would be accepted and never flagged.

Non-English medical tiers are built only from validated sources, through the Batch 339 build step:

| Language | Validated source |
|---|---|
| German | SNOMED CT German National Edition (BfArM, published yearly; the 5th edition was November 2025) |
| French | SNOMED CT common French translation (Belgium, Canada, Switzerland, Luxembourg and France; more than 77,000 concepts by 2020), published in the member countries' national editions |
| Dutch (Netherlands) | SNOMED CT Netherlands Edition (Nictiz). The Nictiz licence is free in member countries and lets vendors sublicense to their users |
| Dutch and French (Belgium) | SNOMED CT Belgian extension (FPS Public Health) |
| Korean | KOSTOM, the national terminology, is no longer updated. Korean terms come from the national disease classification plus native-speaker curation |

## Measured

- **Report screens (Batch 338, dev server, Chromium):** squiggles appear about 300 ms after typing stops (the 300 ms pause plus the check); frame gaps stayed at 16.8 ms at most while typing continuously into the report editor.

- **Browser** (Chromium, real worker):
  - UK English loads in about 260–300 ms, and a 5,000-word document is checked in about 20–25 ms;
  - main-thread frame gaps stay at about 16 ms while checking (AC4); a re-check of unchanged text comes from memory;
  - Korean loads and checks in about 750 ms.
- **Production build:** the worker bundles as one file of about 1.2 MB, including the WASM.
- **Download sizes, once per language:** English base about 0.55 MB; German 1.1 MB; French 1.4 MB; Dutch 2.5 MB; Korean 14 MB (an 11 MB affix file). Hosting should serve them compressed.

## Known limits

- **Medical coverage** is the curated lexicon until the licensed releases are built in: about 815 English entries plus 163 US/UK pairs, and about 150 Korean terms.
- **No medical words yet for German, French or Dutch** until their SNOMED CT editions (and LOINC translations) are built in. German is the weakest of the three: its general dictionary lacks even "Karzinom" and "Adenokarzinom", so German reports will show false flags on medical terms until then.
- **Inflections in other languages:** SNOMED CT and LOINC mostly give singular forms. English gets plurals from the SPECIALIST Lexicon; German, French and Dutch plurals are only accepted where the base dictionary or the terms themselves have them. French and Dutch base dictionaries accept the core terms tested (carcinome, adénocarcinome, carcinoom).
- **`@farscrl/hunspell-wasm`** declares Node ≥ 24. Since Batch 341 the project is on Node 24 too, so npm no longer warns; the full suite passes on 24.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
