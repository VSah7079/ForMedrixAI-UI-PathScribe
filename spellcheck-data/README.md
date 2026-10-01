# spellcheck-data/

Source word lists for PathScribe's medical spell checker (PS-342). They are compiled into `public/spellcheck/` by `npm run spellcheck:build`. See [src/services/spellcheck/README.md](../src/services/spellcheck/README.md) for how they're used.

## Files

- **`en/pathology.dic.txt`:** English pathology terms that US and UK spelling write the same way.
  - **Format:** one Hunspell entry per line, `word` or `word/FLAGS`, using the SCOWL suffix flags shared by every packaged English dictionary: `S` plural, `M` possessive, `D` past, `G` -ing, `Y` -ly.
  - **Size:** about 815 entries covering general histopathology, tumour names, inflammation and circulation, anatomy, procedures, cytology, immunohistochemistry and molecular terms, grading systems, autopsy/forensic terms, and hyphen prefixes.
- **`en/variants.tsv`:** US / UK pairs (`US<TAB>UK<TAB>FLAGS`), about 160 of them: haem-/hem-, oe-/e-, ae-/e-, -ise/-ize and others.
  - **en-US** uses the US column, **en-GB and en-AU** the UK column, and **en-CA** both.
  - The other column's word is flagged as a regional variant, with this column's form suggested.
- **`licenses/`:** full licence texts shipped with the copyleft dictionaries (GPL-2.0 and GPL-3.0 for German, MPL-2.0 for French, MPL-1.1 for Korean). `source-offer-contact.txt` holds the contact printed in the GPL written offer; **replace its placeholder before release**.
- **`sources/de-DE/`:** put the upstream igerman98 source archive here (see its README). It then ships with the German dictionary as the GPL's corresponding source, and the written offer is no longer needed.
- **`licensed/`** (Batch 339): drop the licensed releases here (SPECIALIST Lexicon, SNOMED CT editions, LOINC) and rebuild. They never ship; only the derived words do. See `licensed/README.md`.
- **`licensed-sources.json`** (Batch 339): which SNOMED CT hierarchies, language reference sets and LOINC classes the build uses, and which locale each language feeds.
- **`ko/pathology.txt`:** about 150 Korean pathology terms, as bare nouns (particles are stripped at lookup). **Needs native-speaker clinical review before clinical use.**

## Rules for editing

- **Check every term** against a standard reference (WHO Classification of Tumours, CAP protocols, RCPath datasets). A misspelled entry would stop that misspelling from being flagged.
- **Put words in the right file:** a word the two conventions spell differently goes in `variants.tsv`, never in `pathology.dic.txt`.
- **Rebuild:** run `npm run spellcheck:build` after editing, then `npm test` (`src/services/spellcheck/spellcheck.test.ts` uses the built files).
- **No machine translation (Pete, Sep 26, 2026).** Never add terms produced by Google Translate or any other machine translation, including AI. A spell checker accepts every word in its lexicon as correct, so a mistranslated term would be accepted in reports and never flagged. Non-English medical terms must come from validated sources:
  - SNOMED CT national editions and translations (the common French translation, the Netherlands and Belgian editions, the German National Edition from BfArM);
  - national classifications;
  - native-speaker clinical review.

  This is the same rule as the cytology lexicon's "validated translations only".
- **No third-party lists:** these lists are authored for PathScribe. Third-party sources (the SPECIALIST Lexicon, SNOMED CT, LOINC) go in `licensed/` as downloaded, and the build derives words from them with attribution. Never paste their content into these files.
