// src/services/imageAssociation/mockImageUploadService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IImageUploadService. Real, deliberate
// honesty: if no active Gross Imaging vendor has a real, configured
// base URL, this returns a real, honest error — it never silently
// falls back to the seeded [DEMO ONLY] entry on a real customer's
// behalf. The demo entry exists to be explicitly selectable for a
// sales demo, not as an automatic, unnoticed substitute for a real
// customer's own missing configuration.
// ─────────────────────────────────────────────────────────────────────────────

import type { IImageUploadService, ImageUploadResult } from './IImageUploadService';
import type { ServiceResult } from '../types';
import { mockGrossImagingVendorService } from './mockGrossImagingVendorService';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 900)); // real, deliberately slow — an actual upload, not instant

export const mockImageUploadService: IImageUploadService = {
  async upload(_imageData: string, imageType: string): Promise<ServiceResult<ImageUploadResult>> {
    const vendorsResult = await mockGrossImagingVendorService.getActive();
    if (!vendorsResult.ok) return err('Could not reach the Gross Imaging vendor dictionary.');

    const configuredVendor = vendorsResult.data.find(v => v.baseUrl.trim().length > 0);
    if (!configuredVendor) {
      return err('No Gross Imaging vendor has a configured base URL yet — set one under Config \u2192 Vendor Integrations \u2192 Gross / Macro Imaging & Telepathology before capturing a photo.');
    }

    await delay();
    const imageUrl = `${configuredVendor.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(imageType)}/${Date.now()}.jpg`;
    return ok({ imageUrl, sourceSystemId: configuredVendor.id });
  },
};
