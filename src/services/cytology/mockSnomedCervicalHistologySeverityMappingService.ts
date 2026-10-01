// src/services/cytology/mockSnomedCervicalHistologySeverityMappingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per ISnomedCervicalHistologySeverityMappingService.ts's own
// header: the mock, localStorage-backed implementation.
//
// Real, per direct follow-up ("for demo, why not a synthetic SNOMED...
// it's fake and just there to show customers that once their valid
// CAP license is applied then you see real codes"): seeded with real,
// structurally-safe synthetic entries — never a real, licensed SNOMED
// CT code. Follows the exact same established safety convention as
// services/abnormalDetection/resolveSyntheticCoding.ts (see that
// file's own header for the full reasoning): every code value is
// prefixed "TEST-SNOMED-" directly IN THE CODE STRING ITSELF, and
// every description leads with "[SYNTHETIC — TEST ONLY]" — belt and
// suspenders, never mistakable for a real code even seen alone. Real
// severity scale match to resolveCytologyHistologySeverityFromSnomed.ts's
// own documented 0-5 scale (benign=0, CIN1=1, CIN2=2, CIN3/AIS=4,
// invasive=5) — demonstrates the real mapping mechanism working end to
// end, exactly what a customer needs to see before their own real
// CAP/RCPath license lets them replace these with real codes.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type {
  ISnomedCervicalHistologySeverityMappingService,
  SnomedCervicalHistologySeverityMappingEntry,
} from './ISnomedCervicalHistologySeverityMappingService';

const STORE_KEY = 'snomed_cervical_histology_severity_mapping';
const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (message: string) => ({ ok: false as const, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

const SEED: SnomedCervicalHistologySeverityMappingEntry[] = [
  { id: 'snomed-sev-seed-1', snomedCode: 'TEST-SNOMED-100001', description: '[SYNTHETIC — TEST ONLY] SNOMED Example 1 — Benign, negative for dysplasia', severityRank: 0, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'snomed-sev-seed-2', snomedCode: 'TEST-SNOMED-100002', description: '[SYNTHETIC — TEST ONLY] SNOMED Example 2 — CIN I / mild dysplasia', severityRank: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'snomed-sev-seed-3', snomedCode: 'TEST-SNOMED-100003', description: '[SYNTHETIC — TEST ONLY] SNOMED Example 3 — CIN II / moderate dysplasia', severityRank: 2, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'snomed-sev-seed-4', snomedCode: 'TEST-SNOMED-100004', description: '[SYNTHETIC — TEST ONLY] SNOMED Example 4 — CIN III / adenocarcinoma in situ', severityRank: 4, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'snomed-sev-seed-5', snomedCode: 'TEST-SNOMED-100005', description: '[SYNTHETIC — TEST ONLY] SNOMED Example 5 — Invasive squamous cell carcinoma', severityRank: 5, createdAt: '2026-01-01T00:00:00.000Z' },
];

const load = (): SnomedCervicalHistologySeverityMappingEntry[] => storageGet(STORE_KEY, SEED);
const persist = (data: SnomedCervicalHistologySeverityMappingEntry[]) => storageSet(STORE_KEY, data);

export const mockSnomedCervicalHistologySeverityMappingService: ISnomedCervicalHistologySeverityMappingService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async add(entry) {
    await delay();
    const all = load();
    if (all.some(e => e.snomedCode === entry.snomedCode)) {
      return err(`A mapping for SNOMED code "${entry.snomedCode}" already exists.`);
    }
    const created: SnomedCervicalHistologySeverityMappingEntry = {
      ...entry,
      id: 'SNOMED_HISTO_SEVERITY_' + Date.now(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...all, created];
    persist(updated);
    return ok({ ...created });
  },

  async update(id, changes) {
    await delay();
    const all = load();
    const existing = all.find(e => e.id === id);
    if (!existing) return err(`No mapping entry found with id "${id}".`);
    const updatedEntry = { ...existing, ...changes };
    persist(all.map(e => (e.id === id ? updatedEntry : e)));
    return ok(updatedEntry);
  },

  async remove(id) {
    await delay();
    const all = load();
    persist(all.filter(e => e.id !== id));
    return ok(undefined);
  },
};
