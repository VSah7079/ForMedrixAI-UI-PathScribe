// src/services/imageAssociation/IImageManagementSystemVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own §1.2 (System-of-Record Integration
// & Fallback Cascade) and direct guidance: "Ideally we would integrate
// with an image management system or for smaller sites on prem file
// servers." Two genuinely different real deployment models, not two
// names for the same thing — a large customer's real VNA/PACS/DAM is
// architecturally nothing like a smaller site's own local file
// server, even though both resolve to "a URL PathScribe points at."
//
// Real, deliberate design match to this app's own established vendor-
// dictionary pattern (IWsiViewerVendorService.ts) — same real
// list/add-edit-modal/deactivate shape, not a new one invented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type ImsDeploymentModel = 'enterprise_ims' | 'on_prem_file_server';

/** Real, per spec §4.1 ("secure URL tokenization — signed URLs,
 *  OAuth 2.0 bearer tokens, or mTLS"). 'none' is real and honest for
 *  a smaller site's own on-prem file server that may genuinely have
 *  no auth layer at all (e.g. an internal-network-only file share) —
 *  never forced to claim a security posture that isn't real. */
export type ImsAuthMethod = 'none' | 'signed_url' | 'oauth2_bearer' | 'mtls';

export interface ImageManagementSystemVendorEntry {
  id: string;
  /** Real product/deployment name — e.g. "Sectra VNA", "Main Site
   *  File Server". PathScribe owns the canonical schema; this is
   *  just a label, same convention as every other vendor dictionary
   *  in this app. */
  name: string;
  deploymentModel: ImsDeploymentModel;
  authMethod: ImsAuthMethod;
  /** Real, admin-configured base endpoint — a real HTTPS URL for an
   *  enterprise IMS, or a real internal file-server address for an
   *  on-prem deployment. Real, per spec §4.1's own explicit
   *  requirement: NEVER contains an embedded auth token — a
   *  short-lived token is resolved fresh at real request time (real,
   *  separate backend work), never baked into this stored string. */
  baseUrl: string;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export type NewImageManagementSystemVendorEntry = Omit<ImageManagementSystemVendorEntry, 'id' | 'isSystem' | 'sortOrder'>;

export interface IImageManagementSystemVendorService {
  getAll(): Promise<ServiceResult<ImageManagementSystemVendorEntry[]>>;
  getActive(): Promise<ServiceResult<ImageManagementSystemVendorEntry[]>>;
  getById(id: ID): Promise<ServiceResult<ImageManagementSystemVendorEntry>>;
  add(entry: NewImageManagementSystemVendorEntry): Promise<ServiceResult<ImageManagementSystemVendorEntry>>;
  update(id: ID, changes: Partial<ImageManagementSystemVendorEntry>): Promise<ServiceResult<ImageManagementSystemVendorEntry>>;
  deactivate(id: ID): Promise<ServiceResult<ImageManagementSystemVendorEntry>>;
  reactivate(id: ID): Promise<ServiceResult<ImageManagementSystemVendorEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
