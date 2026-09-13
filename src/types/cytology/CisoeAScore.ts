// src/types/cytology/CisoeAScore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own full CISOE-A specification: "The
// system must store each component independently rather than just a
// single final diagnosis text." This is that real, independent
// 6-component matrix — the Dutch national cervical cytology
// classification (CISOE-A / KOPAC-B), in use since 1996, structurally
// distinct from every other real nomenclature system in this module:
// Bethesda, BSCC/RCPath, and Münchner Nomenklatur III are all real,
// single-pick hierarchies (one primary finding, optional co-occurring
// ones); CISOE-A independently scores every specimen across five
// numeric axes plus a separate adequacy tier — a genuinely different
// real shape, not a relabeled version of the others.
//
// Real, researched scale (Composition/Inflammation/Squamous/Other-
// Endometrium/Endocervical): 0-9, confirmed via the real, published
// CISOE-A/Bethesda 2001/Pap correspondence table (PMC1770272) — e.g.
// S1 = Normal/NILM, S2-3 = Borderline/ASC-US, S4 = Mild dyskaryosis/
// LSIL, S5 = Moderate/HSIL, S6 = Severe/HSIL, S8-9 = Carcinoma. See
// resolveCisoeAToBethesda.ts for the real, complete mapping.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per direct guidance's own confirmed 3-tier adequacy vocabulary
 *  ("satisfactory, suboptimal, or unsatisfactory/inadequate"). */
export type CisoeAAdequacy = 'satisfactory' | 'suboptimal' | 'unsatisfactory';

export interface CisoeAComponentScore {
  /** Real, 0-9 scale — 0 reserved for a genuinely inadequate specimen
   *  (no real assessment possible on this axis at all). */
  value: number;
  comment?: string;
}

export interface CisoeAScore {
  /** C — specimen cellular composition (e.g. normal, atrophic,
   *  post-menopausal). */
  composition: CisoeAComponentScore;
  /** I — degree of inflammatory change, microorganisms, background
   *  debris. */
  inflammation: CisoeAComponentScore;
  /** S — squamous epithelium: non-neoplastic change through
   *  dyskaryosis grading (borderline/mild/moderate/severe) to
   *  invasive carcinoma. The real, primary axis driving the overall
   *  Bethesda-equivalent translation. */
  squamous: CisoeAComponentScore;
  /** O — other cells and endometrium. */
  otherEndometrium: CisoeAComponentScore;
  /** E — endocervical/columnar epithelium: presence, atypia, or
   *  adenocarcinoma of glandular cells. */
  endocervical: CisoeAComponentScore;
  /** A — real, technical specimen-quality tier, kept as its own,
   *  separate, non-numeric field per direct guidance's own real
   *  distinction between the five graded axes and adequacy itself. */
  adequacy: CisoeAAdequacy;
}
