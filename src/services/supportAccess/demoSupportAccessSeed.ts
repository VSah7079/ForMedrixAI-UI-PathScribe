// src/services/supportAccess/demoSupportAccessSeed.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 372: the demo organisations' starting support access settings.
//
// Every organisation starts at Approval required (Pete's default), except
// the demo organisations that have no staff member who could approve a
// request. Left at Approval required, their cases could never be reached by
// support in a demo. They start at Always allowed, so their cases stay
// visible to ForMedrixAI demo accounts and every look is still recorded in
// their support audit.
//
//   Approval required: Desert Valley, Manchester, Midwest (each has an Admin
//                      who can approve)
//   Always allowed:    Henry Ford, Fenwick and the ten
//                      international screening labs
//
// An organisation's own saved settings replace these. Demo data only: a
// real deployment has no seed, so every organisation starts at Approval
// required.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupportAccessSettings } from './supportAccessRules';

const ALWAYS_ALLOWED_IN_DEMO = [
  'c-ent-hfhs', 'c-trust-fenwick',
  'c-kr-seoul-general', 'c-de-berlin-frauenklinik', 'c-nl-amsterdam-cyto', 'c-fr-paris-cyto', 'c-be-brussels-cyto',
  'c-ca-vancouver-cyto', 'c-nz-auckland-cyto', 'c-au-sydney-cyto', 'c-ie-ncsl-dublin', 'c-ni-lagan-valley',
];

export const DEMO_SUPPORT_ACCESS_SETTINGS: Readonly<Record<string, Partial<SupportAccessSettings>>> =
  Object.fromEntries(ALWAYS_ALLOWED_IN_DEMO.map(id => [id, { policy: 'alwaysAllowed' }]));
