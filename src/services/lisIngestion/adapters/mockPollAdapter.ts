// src/services/lisIngestion/adapters/mockPollAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Poll adapter (PS-87): the stand-in for "ask the LIS what changed since the
// last poll". Its results go into the staging queue like any pushed message.
//
// A real source depends on the site's LIS and needs its integration guide:
// a FHIR DiagnosticReport search on _lastUpdated (the NHS path
// FHIRCaseService.ts scaffolds), an HL7 query through the interface engine,
// or a vendor API. Whatever it is, it only has to return NormalizedLisUpdate[]
// in the LIS's own status vocabulary; the site's crosswalk maps those to
// milestones.
//
// Demo data: three seeded Assist cases.
//   MFT26-8809-POOL   "GROSSED"        → Gross Complete draft
//   S26-4417-BX-001   "MICRO_COMPLETE" → full draft (gross + micro + dx)
//   MPA26-1006-POOL   "RECEIVED"       → no milestone, ignored
// The text below is sample clinical wording written for the demo.
// ─────────────────────────────────────────────────────────────────────────────

import type { LisPollAdapter, NormalizedLisUpdate } from '../types';

const DEMO_SNAPSHOTS: readonly NormalizedLisUpdate[] = [
  {
    accession: 'MPA26-1006-POOL',
    lisStatus: 'RECEIVED',
    updatedAt: '2026-09-24T13:50:00.000Z',
  },
  {
    accession: 'MFT26-8809-POOL',
    lisStatus: 'GROSSED',
    updatedAt: '2026-09-24T14:05:00.000Z',
    grossText: 'Right hemicolectomy specimen, 32 cm, received fresh. Obstructing tumour in caecum, 5.8 cm. Tumour perforates the serosal surface at one point.',
  },
  {
    accession: 'S26-4417-BX-001',
    lisStatus: 'MICRO_COMPLETE',
    updatedAt: '2026-09-24T14:20:00.000Z',
    grossText: 'Received fresh labeled "right hemicolectomy" is a 28 cm segment of right colon with attached terminal ileum. A fungating tumor measuring 3.8 × 3.2 cm is identified in the ascending colon.',
    microscopicText: 'Sections show a moderately differentiated adenocarcinoma invading through the muscularis propria into pericolonic adipose tissue. Lymphovascular invasion is identified. Proximal, distal and radial margins are free of tumor (closest, radial, 1.2 cm). Two of eighteen lymph nodes contain metastatic carcinoma.',
    diagnosisText: 'Colon, right, hemicolectomy: invasive adenocarcinoma, moderately differentiated, pT3 pN1b; margins negative.',
  },
];

export const mockPollAdapter: LisPollAdapter = {
  source: 'poll',
  async fetchChangedSince(since) {
    await new Promise(r => setTimeout(r, 400));
    return DEMO_SNAPSHOTS.filter(s => since === null || s.updatedAt > since).map(s => ({ ...s }));
  },
};
