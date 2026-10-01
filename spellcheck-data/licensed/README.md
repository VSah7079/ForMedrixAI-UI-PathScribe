# spellcheck-data/licensed/

**Where the licensed clinical vocabularies go (PS-342, Batch 339).** Put the release files here exactly as downloaded, then run `npm run spellcheck:build`. The build reads them and writes only the derived word lists to `public/spellcheck/` (`medical/` and `clinical/`), with each source's attribution in `NOTICE.txt`.

**Never ship or commit the release files themselves.** Their licences cover PathScribe's use, not redistribution. Keep them out of delta zips; the `.gitignore` here ignores everything except this README.

## Layout

```
spellcheck-data/licensed/
  specialist/   the SPECIALIST Lexicon release; the build uses its LRAGR table (anywhere inside)
  snomed/       one folder per SNOMED CT RF2 release, unzipped (International, US, UK, Australian,
                Canadian, Netherlands, Belgian, German, French... any number); the build finds the
                Snapshot concept, description and language reference set files anywhere inside
  loinc/        the LOINC release: Loinc.csv and the LinguisticVariants/ folder
```

Any of the three can be missing; the build uses what's there. To use another folder: `npm run spellcheck:build -- --licensed <folder>`.

## Where each comes from

| Source | Where | Licence |
|---|---|---|
| SPECIALIST Lexicon | NLM Lexical Systems Group (lhncbc.nlm.nih.gov/LSG), "Lexicon" release | Open; attribution |
| SNOMED CT International and US editions | NLM UMLS Terminology Services (uts.nlm.nih.gov) | SNOMED CT Affiliate Licence (via UMLS in the US) |
| SNOMED CT member national editions | SNOMED International MLDS (Belgium, Netherlands, Germany, France, Korea, New Zealand...); UK via NHS TRUD; Canada via Infoway; Australia via the Australian Digital Health Agency | Affiliate Licence plus each National Release Centre's terms. See Jira PS-343 |
| LOINC | loinc.org (free account) | LOINC License |

## What the build takes (`spellcheck-data/licensed-sources.json`)

- **SNOMED CT:**
  - **Concepts:** only active descriptions of active concepts in these hierarchies: morphologic abnormality, disorder, finding, body structure, cell, cell structure, specimen, procedure, organism, substance, qualifier value, observable entity.
  - **English spelling:** follows the language reference sets. The US refset feeds en-US; the GB and NHS clinical refsets feed en-GB; the Australian refset feeds en-AU (else UK English); the Canadian refset feeds en-CA (else US plus UK). **Check the refset ids in the JSON against your releases:** the build lists any language refset it found but doesn't map.
  - **Other languages:** go by language code (de, fr, nl, ko).
- **LOINC:** names in the PATH, CYTO, MOLPATH, CELLMARK, HEM/BC and MICRO classes, excluding deprecated codes.
  - **English:** LOINC is written in US English, so its English names feed en-US and en-CA only.
  - **Translations:** the linguistic variants (de, fr, nl, ko) feed those languages.
- **SPECIALIST Lexicon:** every inflected form of every spelling variant, into the English medical tier. US/UK pairs it contains become regional-variant rules, but only where the dictionary for that convention rejects the other spelling.

**Memory:** a full International release takes about 20–40 seconds and under 1 GB of memory. This was measured on a synthetic release of 400,000 concepts and 1.2 million descriptions. If Node runs out of memory, set `NODE_OPTIONS=--max-old-space-size=4096`.
