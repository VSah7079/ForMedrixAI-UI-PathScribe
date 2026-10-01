// src/services/imageAssociation/IGrossImagingVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research: a genuinely distinct real vendor
// category from both WSI viewer vendors and generic Image Management
// Systems — point-of-capture workflow tools for the gross/cut-up
// bench (annotation, dimension measurement, side-by-side serial-
// section comparison, live telepathology streaming), not a passive
// storage target and not a whole-slide viewer. Real, confirmed
// examples: PAX-it!/PAXcam (MIS Incorporated, Villa Park IL),
// Smart In Media PathoZoom® (Cologne, Germany — widespread UK NHS/
// European deployment), Milestone Medical MacroPATH (UK-focused
// gross macro-imaging hardware).
//
// Directly unblocks the deferred "item 3" migration of
// CameraCaptureControl.tsx's own real, existing (but non-compliant —
// base64 inline) gross/block-face photo capture: this is the real
// vendor category that capture should eventually hand off to.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface GrossImagingVendorEntry {
  id: string;
  name: string;
  /** Real, per spec §4.1's own posture, reused here for consistency
   *  across every vendor category in this file's own real "Vendor
   *  Integrations" grouping. */
  authMethod: 'none' | 'signed_url' | 'oauth2_bearer' | 'mtls';
  baseUrl: string;
  /** Real, per direct research — whether this vendor's own real
   *  product supports live telepathology streaming (PathoZoom®,
   *  PAX-it!) vs static capture/annotation only (MacroPATH) —
   *  genuinely different real capability, not assumed uniform across
   *  this category. */
  supportsTelepathology: boolean;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export type NewGrossImagingVendorEntry = Omit<GrossImagingVendorEntry, 'id' | 'isSystem' | 'sortOrder'>;

export interface IGrossImagingVendorService {
  getAll(): Promise<ServiceResult<GrossImagingVendorEntry[]>>;
  getActive(): Promise<ServiceResult<GrossImagingVendorEntry[]>>;
  getById(id: ID): Promise<ServiceResult<GrossImagingVendorEntry>>;
  add(entry: NewGrossImagingVendorEntry): Promise<ServiceResult<GrossImagingVendorEntry>>;
  update(id: ID, changes: Partial<GrossImagingVendorEntry>): Promise<ServiceResult<GrossImagingVendorEntry>>;
  deactivate(id: ID): Promise<ServiceResult<GrossImagingVendorEntry>>;
  reactivate(id: ID): Promise<ServiceResult<GrossImagingVendorEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
