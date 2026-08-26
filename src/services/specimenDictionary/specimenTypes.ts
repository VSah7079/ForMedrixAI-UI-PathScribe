export interface SpecimenEntry {
  id: string;
  name: string;
  description?: string;
  subspecialty?: string;
  type: string;
  procedure: string;
  site?: string;
  laterality?: string;
  normalizedLabel: string;
  synonyms: string[];
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
  /**
   * References SpecimenCategory.id (Specimen Category Dictionary —
   * src/services/specimenCategories/ISpecimenCategoryService.ts). Optional
   * and additive: existing entries without it fall back to whatever
   * category resolution infers from `type` at read time, so this doesn't
   * break any entry seeded before this field existed.
   */
  specimenCategoryId?: string;
  /**
   * Real fix, per direct guidance: the lab's own AMA license covers real
   * coders populating this - this app never fabricates the mapping
   * itself. The base surgical pathology CPT code (88302-88309) this
   * specific specimen type should default to at sign-out, e.g. "Breast
   * core needle biopsy" -> 88305. Optional and additive, same reasoning
   * as specimenCategoryId: existing entries without it simply fall back
   * to the generic, honest rule-based default
   * (ruleBasedDefaultCptCodes in services/billing/codeMapTable.ts)
   * rather than breaking. Deliberately NOT validated against
   * CODE_MAP_TABLE at the type level - a real coder may set a real,
   * correct code (e.g. 88309) this app's own small, curated table
   * doesn't carry a verified work RVU value for yet; that's a separate,
   * honest gap (see codeMapTable.ts's own header), not a reason to
   * block a real coder from recording the real code here.
   */
  defaultBaseCptCode?: string;
  /**
   * Real, per direct guidance's own detailed spec ("Default Assignment
   * (Smart Preset): when a specimen is accessioned or selected from
   * the dictionary... default complexity and its initial CPT code
   * based on the dictionary template"). What this specimen type
   * normally is - e.g. "Gallbladder - Calculous" defaults to
   * GROSS_ONLY, "Colon resection" defaults to GROSS_AND_MICRO. Copied
   * onto the real Specimen.complexity when this entry is selected,
   * then freely overridable per specimen - this dictionary default
   * never changes because one specific case's specimen was declared
   * differently.
   */
  defaultComplexity?: import('@/types/case/Specimen').SpecimenComplexity;
  /**
   * Real, per direct guidance: only meaningful when defaultComplexity
   * is GROSS_ONLY. The real, specimen-type-specific CPT code
   * (88302-88309) to use if a pathologist overrides this specimen's
   * own complexity up to GROSS_AND_MICRO. Same "the lab's own AMA
   * license covers this, this app never fabricates the mapping"
   * posture as defaultBaseCptCode above - genuinely different
   * specimen types warrant genuinely different micro-level codes, and
   * this app has no honest way to guess which one applies without a
   * real coder configuring it here. Undefined means no real coder has
   * set one yet - an upgrade to GROSS_AND_MICRO with no code
   * configured here honestly clears the suggested base code for
   * manual review rather than guessing.
   */
  microUpgradeBaseCptCode?: string;
  /**
   * When true, this specimen type requires processing.processedAt (the
   * fixative-added timestamp — cold ischemia time = collection to
   * fixation gap, tracked per CAP/ASCO biomarker guidance, e.g. breast
   * ER/PR/HER2) to be documented before the case can be signed out.
   * Enforced in SynopticReportPage.tsx's finalizeCase() as a hard block
   * — raises a Specimen Deficiency if missing, same pattern as the
   * order-import dictionary-match deficiency. Toggleable via the
   * Specimen Dictionary admin screen (SpecimenDictionarySection.tsx).
   */
  requireFixativeTimeBeforeSignout?: boolean;
  /**
   * Stable matching key for spreadsheet import — added June 2026 when
   * porting the working spreadsheet import/export UI from the old,
   * disconnected Specimen model (which had this field) onto this, the
   * real one. Optional: entries without one match by name alone on
   * re-import, same fallback the old system used.
   */
  specimenCode?: string;
  /**
   * Ported from services/specimens/ISpecimenService.ts (June 2026) — that
   * system was confirmed fully dead (zero real callers anywhere in the
   * app, only barrel re-exports pointing at nothing), but its concept of
   * per-specimen-type default stains was genuinely useful and its 12-row
   * seed data had real, sensible clinical defaults (e.g. Breast Core
   * Biopsy: H&E, ER, PR). Deliberately NOT auto-applied onto existing
   * SpecimenEntry records via pattern/name matching — getting a stain
   * assumption wrong on the wrong specimen type is a real clinical-
   * accuracy risk, not something to guess at automatically. The old
   * seed data is preserved in this file's git history / the deleted
   * service if a human wants to apply it deliberately via the Add/Edit
   * modal or spreadsheet.
   */
  defaultStains?: string[];
  /** Free-text grossing/processing guidance for this specimen type — e.g.
   *  "Submit all cores", "Decal per protocol". Same porting note as
   *  defaultStains above. */
  processingNotes?: string;

  /**
   * Optional reference into the standalone Protocol dictionary
   * (services/protocols/IProtocolService.ts) — NOT an embedded object.
   * Deliberately migrated to a reference: wildly different specimen
   * types genuinely share identical processing workflows (a
   * gallbladder, an appendix, a benign skin shave, and an antral
   * gastric biopsy might all use the same "Standard Small Biopsy"
   * protocol) — embedding would mean updating a shared routine
   * requires editing every specimen type that happens to use it, with
   * zero connection between the copies once they exist. A lab manager
   * updates the one master Protocol here; it cascades to every
   * specimen type that references it.
   *
   * Most specimen types won't have one — deferring to the existing
   * defaultStains/single-block behavior is correct for anything that's
   * genuinely just "one specimen, one block."
   */
  protocolId?: string;

  /** Governance trio matching Client/Physician/SpecimenCategory's
   *  "unblock now, admin reviews after" pattern — added alongside
   *  findOrCreateByName below. Deliberately additive to the existing
   *  active:boolean rather than a new tri-state status field: active
   *  has 6 real consumers already (AccessionPage, SpecimenEditModal,
   *  SearchPage, SpecimenDictionarySection, TATConfigSection,
   *  SubspecialtiesSection per this file's sibling interface's own
   *  header note) and doesn't need to change meaning — an auto-created
   *  entry is seeded active:true (order processing must never block on
   *  an unmatched specimen code) and separately flagged here for admin
   *  review, rather than sitting inactive/unusable until reviewed. */
  autoCreated?: boolean;
  autoCreatedAt?: string;
  autoCreatedNote?: string;
}
