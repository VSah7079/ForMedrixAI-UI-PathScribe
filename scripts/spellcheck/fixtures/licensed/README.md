# Sample licensed sources (test fixtures)

**Synthetic samples, not licensed content.** These files follow the real formats of the SPECIALIST Lexicon (`LRAGR`), SNOMED CT RF2 snapshots and LOINC (`Loinc.csv`, linguistic variants), but every row was written by hand for PathScribe's tests. The concept, description and refset member ids are made up; only the language reference set, type, acceptability and case-significance ids are the real metadata ids. `licensedSources.test.mjs` builds the dictionaries from them.

Real release files go in `spellcheck-data/licensed/` and never ship; see `spellcheck-data/licensed/README.md`.
