// src/services/digitalPathology/IWsiViewerVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "my plan was to connect to vendors that
// actually deal with the WSI. We just pass info and launch the app
// and route the unique id so that the correct scan is placed in
// their viewer." Confirmed directly first: this app has real
// scan-batch TRACKING (IWsiScanBatchService.ts — which slides got
// scanned, status updates) but nothing that actually launches a
// vendor's own real viewer — genuinely different, unbuilt real gap.
//
// Deliberately a SEPARATE dictionary from IDpVendorService.ts, not a
// field added there: that dictionary's own real job is tracking WHICH
// vendor's algorithm produced a given AiScreeningResult, for QA/
// discordance purposes — a genuinely different real concern from
// "where do I click to open this slide." RFP-APLIS-2026-GLOBAL's own
// §3.4 names Leica/Roche/Hamamatsu as real scanner/viewer hardware
// vendors. Real, per direct follow-up ("many DP vendors actually have
// their own AI or they allow other AI to connect") and confirmed via
// current research: several real companies — Paige, PathAI, Proscia —
// are genuinely BOTH an AI-analysis vendor AND a real, launchable
// image-management platform in their own right (Paige IMS bundles a
// real third-party AI marketplace; PathAI's PathOS "orchestrates both
// their own and partner models"). Existing in both dictionaries is
// not a data inconsistency — it's an accurate reflection of these
// being real companies with two genuinely different real roles. Per
// direct guidance's own framing ("contextual launch of the
// application, similar to the EMR approach"), this dictionary's real
// job is exactly that one mechanism for any real, launchable DP
// platform — never a claim about what runs inside it.
//
// Real, deliberate scope: PathScribe never implements DICOMweb/WADO-RS
// itself, never renders a slide image, and never needs a real vendor's
// actual API credentials to build this — it constructs a real launch
// URL from an admin-configured template plus one real, already-
// existing unique identifier (StainOrder.displayId, the same barcode
// a real scanner already reads off the slide) and opens it in a new
// tab, exactly the architecture per direct guidance above. The
// vendor's own real viewer application owns everything after that.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface WsiViewerVendorEntry {
  id: string;
  /** e.g. "Leica Aperio eSlide Manager", "Roche uPath", "Hamamatsu
   *  NDP.view2" — the real, specific viewer product name, per the
   *  same real "PathScribe owns the canonical schema, the real
   *  product name is just a label" reasoning as IDpVendorService.ts. */
  name: string;
  /** Real, admin-configured URL template — the one real, site-specific
   *  fact PathScribe cannot know in advance (every real deployment's
   *  own real viewer instance URL and query-parameter scheme
   *  differs). Contains the literal placeholder "{{wsiUniqueId}}",
   *  substituted with the real StainOrder.displayId at real launch
   *  time (buildWsiViewerLaunchUrl.ts) — e.g.
   *  "https://viewer.example-lab.org/view?slideId={{wsiUniqueId}}".
   *  Never a real, working URL PathScribe ships pre-filled with —
   *  same honest-absence posture as FacilityInterfaceEngineConnection's
   *  own endpoint field elsewhere in this app. */
  launchUrlTemplate: string;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export type NewWsiViewerVendorEntry = Omit<WsiViewerVendorEntry, 'id' | 'isSystem' | 'sortOrder'>;

export interface IWsiViewerVendorService {
  getAll(): Promise<ServiceResult<WsiViewerVendorEntry[]>>;
  getActive(): Promise<ServiceResult<WsiViewerVendorEntry[]>>;
  getById(id: ID): Promise<ServiceResult<WsiViewerVendorEntry>>;
  add(entry: NewWsiViewerVendorEntry): Promise<ServiceResult<WsiViewerVendorEntry>>;
  update(id: ID, changes: Partial<WsiViewerVendorEntry>): Promise<ServiceResult<WsiViewerVendorEntry>>;
  deactivate(id: ID): Promise<ServiceResult<WsiViewerVendorEntry>>;
  reactivate(id: ID): Promise<ServiceResult<WsiViewerVendorEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
