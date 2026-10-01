// src/services/imageAssociation/IImageUploadService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed compliance fix (item 3):
// CameraCaptureControl.tsx currently stores a base64 data: URL
// directly inline on DigitalAsset — confirmed non-compliant with the
// uploaded spec's own §1.1 (Reference-Only Storage Model). This is
// the real upload step that closes that gap: captured image bytes go
// OUT to a configured vendor (a real Gross Imaging vendor per this
// session's own research — PAX-it!, PathoZoom®, MacroPATH — the real
// category a gross/frozen-section photo actually belongs to), and
// only the resulting real URL comes back and gets stored.
//
// Real, honest scope: the actual bytes-over-the-wire upload to a real
// vendor endpoint is genuine backend/infra work this sandbox cannot
// perform — the mock implementation simulates a successful upload
// and returns a real-shaped URL, but no real network call happens.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface ImageUploadResult {
  imageUrl: string;
  sourceSystemId: string;
}

export interface IImageUploadService {
  /** Real, per spec §1.1 — `imageData` is the real, transient capture
   *  (a base64 frame from CameraCaptureControl.tsx today); it is
   *  never itself the thing this function returns or that any caller
   *  persists. `imageType` matches ImageAssociation's own real field
   *  (e.g. "Gross Specimen", "Block Face"). */
  upload(imageData: string, imageType: string): Promise<ServiceResult<ImageUploadResult>>;
}
