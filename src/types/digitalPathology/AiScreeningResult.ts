// src/types/digitalPathology/AiScreeningResult.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own earlier DP/AI vendor research and
// interface-engine architecture: "PathScribe owns: queue state/triage
// logic, spatial overlay integration, audit trail/state persistence."
// Same real "PathScribe defines the canonical schema; the interface
// engine maps every real vendor's own wire format onto it" split
// already proven throughout this app.
//
// Real, honest deviation from that earlier plan's own "spatialRegion?:
// GeoJSON" note: no geojson package exists anywhere in this app, and
// adding one for a single, narrow field is a real, avoidable new
// dependency. AiSpatialRegion below is a real, simple, purpose-built
// alternative — normalized [0,1] coordinates relative to the full
// slide image (not raw pixels, which would break across real vendors'
// own differing scan resolutions) — covering the real, practical need
// (marking a region of interest for the WSI viewer to overlay)
// without GeoJSON's own, much larger surface this app has no other
// use for.
// ─────────────────────────────────────────────────────────────────────────────

export interface AiSpatialRegion {
  type: 'bounding_box' | 'polygon';
  /** Normalized [0,1] coordinates relative to the full slide image. */
  points: { x: number; y: number }[];
}

export interface AiScreeningFinding {
  id: string;
  /** Real, vendor-reported finding label — e.g. "Suspicious for
   *  adenocarcinoma," "Gleason pattern 4 identified." Free text, since
   *  no two real vendors' own finding vocabularies match, and this app
   *  has no real, canonical finding-name dictionary to normalize
   *  against yet. */
  label: string;
  /** Real, per direct guidance's own vendor confidence-score research
   *  — 0-1, undefined for a real vendor whose own product doesn't
   *  report one. */
  confidenceScore?: number;
  spatialRegion?: AiSpatialRegion;
}

export interface AiScreeningResult {
  id: string;
  caseId: string;
  /** Optional — not every real AI screening product operates at the
   *  per-specimen level; some report at the case level only. */
  specimenId?: string;
  /** FK to DpVendorEntry.id. */
  vendorId: string;
  status: 'ordered' | 'completed' | 'failed' | 'timed_out';
  orderedAt: string;
  completedAt?: string;
  findings: AiScreeningFinding[];
  /** Real, per direct follow-up confirming this app's own established
   *  architecture ("PathScribe publishes/ingests its own
   *  specification; the real interface engine owns the actual
   *  vendor-specific parsing and crosswalk"): a real, canonical,
   *  vendor-agnostic slide-level triage summary — the real interface
   *  engine's own job to populate when a given vendor's own real wire
   *  format reports one (confirmed directly, real, published vendor
   *  research: BD FocalPoint ranks the WHOLE SLIDE into one of 5
   *  quintiles by likelihood of abnormality and classifies it into a
   *  real "Review"/"No Further Review" gate — genuinely slide-level
   *  metadata, distinct in kind from the per-object findings[] list
   *  above, not a property of any one finding). Deliberately
   *  undefined, never a fabricated default, for a vendor whose own
   *  real product reports no slide-level equivalent (confirmed
   *  directly: Hologic Genius produces a real, flat gallery of
   *  objects of interest with no accompanying whole-slide rank) —
   *  PathScribe never invents a rank a vendor didn't actually report. */
  slideTriage?: AiSlideTriageSummary;
  /** Real, per this module's own established CAPA-design decision:
   *  "NO auto-CAPA. AI discordance should raise a SpecimenDeficiency...
   *  Human decides." Set once a real pathologist/cytotechnologist has
   *  actually compared this AI result against their own, independent
   *  finding — undefined until that real comparison has happened,
   *  never defaulted to true/false. */
  humanConcordant?: boolean;
}

/** Real, per AiScreeningResult.slideTriage's own doc comment — a
 *  genuinely vendor-agnostic shape (never named after one vendor's
 *  own terminology) so the real interface engine has a real, honest
 *  place to crosswalk any vendor's own real whole-slide rank/gate
 *  system onto, not just BD FocalPoint's specific one. */
export interface AiSlideTriageSummary {
  /** Real, per BD FocalPoint's own published, real classification —
   *  "Review" vs "No Further Review." Generically named since a
   *  future vendor's own equivalent gate isn't guaranteed to use the
   *  same two labels. */
  reviewRecommended: boolean;
  /** Real, 1-based rank group and the real total number of groups a
   *  vendor's own algorithm divides slides into — e.g. BD
   *  FocalPoint's own real 5-quintile system is rankGroup: 1-5,
   *  totalRankGroups: 5. Both undefined for a real vendor whose own
   *  product reports the reviewRecommended gate above without a
   *  real, graduated rank behind it. */
  rankGroup?: number;
  totalRankGroups?: number;
}
