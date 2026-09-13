// src/services/imageAssociation/resolveImageAssociationEmbedKind.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §3.1 (raster image embedding) vs §3.2 (PDF page
// merging) — genuinely different embedding techniques, so this
// association needs to know which one applies. Real signal: the file
// extension on the real, resolved image_url — the one fact actually
// available about a real, external asset without fetching it first.
// ─────────────────────────────────────────────────────────────────────────────

export type ImageAssociationEmbedKind = 'raster_image' | 'pdf_page';

export function resolveImageAssociationEmbedKind(imageUrl: string): ImageAssociationEmbedKind {
  const path = imageUrl.split('?')[0].split('#')[0].toLowerCase();
  return path.endsWith('.pdf') ? 'pdf_page' : 'raster_image';
}
