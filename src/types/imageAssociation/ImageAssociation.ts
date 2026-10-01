// src/types/imageAssociation/ImageAssociation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Architectural & Integration Overview" spec's
// own §1.1 (Reference-Only Storage Model) and §2.1 (URL Association
// Data Model): PathScribe stores image/PDF associations exclusively
// as metadata records pointing at external media hosts — never the
// binary payload itself. Real, direct motivation confirmed: "I didn't
// want to store large PDF reports or image captures in the cloud."
//
// Real, deliberate scope against this session's own prior work:
// this is a genuinely NEW, spec-compliant model — it does NOT yet
// replace `types/case/Material.ts`'s own DigitalAsset (which stores a
// base64 data: URL inline, confirmed non-compliant with §1.1).
// Migrating CameraCaptureControl.tsx onto this model is real,
// separate, deferred work (per direct guidance, item 3 of this
// scoping) — kept out of this pass so it doesn't get done twice.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per the spec's own named examples (§2.1) — kept as a plain
 *  string, not a closed union: the spec explicitly gives these as
 *  examples ("e.g., Gross Specimen..."), not an exhaustive list, and
 *  a real customer's own Enterprise Image Management System may use
 *  its own category vocabulary PathScribe has no reason to reject. */
export type ImageAssociationType = string;

export interface ImageAssociation {
  /** Real, per spec: a stable id for this metadata record itself —
   *  distinct from assetId below, which is the real, existing
   *  PathScribe entity (specimen/block/case) this image is
   *  associated WITH. */
  id: string;
  /** Real, per spec's own `asset_id` — the real PathScribe entity
   *  (e.g. a HistologyBlock.id, Specimen.id) this association
   *  belongs to. Deliberately a plain string, not a typed union of
   *  entity kinds — same reasoning as DigitalAsset's own real,
   *  established "second, parallel relationship to material
   *  children" design, kept consistent here. */
  assetId: string;
  /** Real, per spec's own `image_url` — a fully-qualified HTTPS
   *  endpoint. Never a data: URL, never raw bytes — see this file's
   *  header for why. */
  imageUrl: string;
  imageType: ImageAssociationType;
  /** Real, per spec's own `source_system_id` — which configured
   *  Image Management System vendor (see
   *  IImageManagementSystemVendorService.ts) this URL resolves
   *  against. */
  sourceSystemId: string;
  /** Real, per spec's own `fallback_url` — optional, explicitly
   *  declared. See resolveImageUrlWithFallback.ts for the real
   *  resolution logic this feeds into. */
  fallbackUrl?: string;
  createdAt: string;
  createdBy?: string;
}
