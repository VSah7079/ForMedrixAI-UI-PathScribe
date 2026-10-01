export interface Patient {
  id: string;
  mrn?: string;

  // ── Name — medical-grade schema (June 2026) ──────────────────────────────
  // Prefix/Given/Family/Preferred/Suffix instead of rigid First/Middle/Last,
  // which breaks for Spanish double surnames, Hungarian name order,
  // patients with no middle name, Mc/Mac variants, etc. See
  // utils/personName.ts for the shared model and formatting helpers.
  namePrefix?: string;
  /** All given/first/middle names, in the order the patient would write
   *  them. Optional despite being the "real" identity field — kept
   *  optional (not required) specifically so the 50+ existing seed
   *  Patient records across mockCaseService.ts/mockOrchestratorCaseService.ts
   *  don't all need touching at once; firstName/lastName remain the
   *  guaranteed-populated fields until a record is actually migrated.
   *  New code (Accession page) should always populate this. */
  givenNames?: string;
  /** Surname(s) — single, double (Spanish/Portuguese), hyphenated, or
   *  patronymic with spaces (Mac Donald, O'Connor). Same optionality
   *  reasoning as givenNames above. */
  familyNames?: string;
  /** What staff should actually call the patient — nickname, chosen
   *  name, or a shortened form of a long given name. Never used for
   *  identity matching. */
  preferredName?: string;
  /** Jr./Sr./II/III/IV/V or free text for anything else. */
  nameSuffix?: string;

  /** @deprecated Use givenNames. Always mirrors it — kept so the ~15
   *  existing consumers (Worklist, report letterheads, etc.) that
   *  haven't migrated to the new fields keep working unchanged. */
  firstName: string;
  /** @deprecated Use familyNames. Always mirrors it. */
  lastName: string;
  /** @deprecated Middle names are now merged into givenNames — forcing
   *  them into a single separate field is exactly the US-centric
   *  assumption the new schema exists to avoid. Kept only for any
   *  pre-migration record that still has one. */
  middleName?: string;

  dateOfBirth?: string; // ISO date
  sex?: 'M' | 'F' | 'U';

  // Optional demographic fields
  phone?: string;
  email?: string;
  address?: string;

  /** Real, per direct UI-review follow-up ("The User may need to see
   *  the LMP and other clinical history dictionaries entries"): the
   *  one, real, simple datum captured now — a single date, not a
   *  dictionary entry. Real, honest scoping: the full clinical-history
   *  dictionary (surgical/GYN procedures, disease history, oncology
   *  history, treatment history, clinical indications — six real
   *  categories) stays separate, deferred work; this field alone
   *  doesn't attempt to replace it. */
  lastMenstrualPeriod?: string; // ISO date

  /** Real, per direct guidance: the three real, standard Bethesda §1
   *  fields flagged as a real, honest gap in CytologyReportContent.ts
   *  ("no data source anywhere in this app yet") — now real fields,
   *  same simple-datum scoping as lastMenstrualPeriod above, not the
   *  full six-category clinical-history dictionary. */
  hormonalStatus?: 'premenopausal' | 'perimenopausal' | 'postmenopausal' | 'pregnant';
  /** Real, per the uploaded "Structured Clinical History Dictionary &
   *  Accessioning Integration" spec's own Acceptance Criteria 3
   *  ("Category 1 (SCR): Prompts for LMP and prior_hpv_result") — same
   *  real, simple-datum treatment as hormonalStatus above, not a
   *  dictionary item (see lastMenstrualPeriod's own doc comment and
   *  the direct "why is LMP a dictionary?" discussion this follows). */
  priorHpvResult?: 'positive' | 'negative' | 'unknown' | 'not_tested';
  priorAbnormalPapHpvHistory?: string;
  iudOrContraceptionUse?: string;
}
