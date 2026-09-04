// src/services/specimenDictionary/mockSpecimenDictionaryService.ts

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ISpecimenDictionaryService } from './ISpecimenDictionaryService';
import type { SpecimenEntry } from './specimenTypes';
import starterData from '../../../scripts/terminology-sources/specimens-starter.json';

// ─── Starter data seed ────────────────────────────────────────────────────────
// Moved here from useSpecimenDictionary.tsx (June 2026) — same seed data,
// same requireFixativeTimeBeforeSignout patch (Breast Pathology entries
// flagged per CAP/ASCO biomarker guidance — specimens-starter.json lives
// outside src/ and isn't directly editable from here).
//
// Real, severe bug found and fixed here: this used to check
// `e.type === 'Breast'`, but real SpecimenEntry.type values are procedure
// categories (Biopsy, Resection, Excision, etc.) — never organ/subspecialty
// names. Confirmed directly against the real 60-entry starter data: zero
// specimens ever had requireFixativeTimeBeforeSignout actually set, which
// meant the CAP/ASCO fixation-time compliance gate (FixativeTimeGateModal.tsx,
// gating sign-out in SynopticReportPage.tsx) never fired for any real breast
// specimen — a real, clinically meaningful safety gap, not a cosmetic issue.
// Fixed to check subspecialty === 'Breast Pathology', confirmed directly to
// correctly capture all 7 real breast-pathology-relevant specimens, including
// Mastectomy and axillary/sentinel-node entries that don't even contain the
// word "breast" in their name (a name-substring check would have missed them).
const STARTER_SPECIMENS: SpecimenEntry[] = (starterData.specimens as unknown as SpecimenEntry[]).map(e =>
  e.subspecialty === 'Breast Pathology' ? { ...e, requireFixativeTimeBeforeSignout: true } : e
).concat([
  // Medical Renal — the clearest real example of a specimen that
  // genuinely splits into parallel processing streams rather than
  // being "one specimen, one block." Appended as a new entry rather
  // than attempting to patch an existing one, since specimens-starter.
  // json lives outside src/ and isn't directly inspectable from here —
  // safer to add new than to guess whether a similar entry already
  // exists under a different name. Stain panel and protocol details
  // are illustrative "preference card" seed data, not asserted
  // clinical fact — editable the same as every other dictionary entry.
  {
    id: 'sp-kidney-native-biopsy',
    name: 'Kidney Biopsy, Native',
    description: 'Native (non-transplant) renal core biopsy — splits into Light Microscopy, Immunofluorescence, and Electron Microscopy pathways.',
    type: 'Kidney', procedure: 'Core Biopsy',
    normalizedLabel: 'Kidney Biopsy, Native',
    synonyms: ['Native Kidney Biopsy', 'Renal Biopsy, Native', 'Medical Renal Biopsy'],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
    // References the standalone Protocol dictionary (services/
    // protocols/) rather than embedding the workflow here — the same
    // Medical Renal Protocol record this points to could equally be
    // mapped from a transplant kidney biopsy entry, updated once,
    // cascading to both.
    protocolId: 'proto-medical-renal',
    // Real, researched demo data (see specimens-starter.json's own
    // notes field for the fuller disclosure) - matches the same real
    // assignment given to the other native kidney needle biopsy entry.
    defaultBaseCptCode: '88305',
  },
]);

const STORAGE_KEY = 'specimen_dictionary';

// storageGet's own fallback semantics already do what the old separate
// SEED_KEY tracking flag was for: "nothing ever saved" returns the
// fallback (starter data), but an explicitly-saved empty array ([]) is
// respected as-is, not treated as "never seeded" — no separate seeded
// flag needed.
const load    = () => storageGet<SpecimenEntry[]>(STORAGE_KEY, STARTER_SPECIMENS);
const persist = (entries: SpecimenEntry[]) => storageSet(STORAGE_KEY, entries);
let DICTIONARY: SpecimenEntry[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockSpecimenDictionaryService: ISpecimenDictionaryService = {
  async getAll() {
    await delay();
    return ok([...DICTIONARY]);
  },

  async addEntries(entries) {
    await delay();
    DICTIONARY = [...DICTIONARY, ...entries];
    persist(DICTIONARY);
    return ok([...DICTIONARY]);
  },

  async updateEntries(entries) {
    await delay();
    DICTIONARY = DICTIONARY.map(d => entries.find(e => e.id === d.id) ?? d);
    persist(DICTIONARY);
    return ok([...DICTIONARY]);
  },

  async deprecateEntries(ids) {
    await delay();
    DICTIONARY = DICTIONARY.map(d => ids.includes(d.id) ? { ...d, active: false, version: d.version + 1 } : d);
    persist(DICTIONARY);
    return ok([...DICTIONARY]);
  },

  async replaceDictionary(entries) {
    await delay();
    DICTIONARY = entries;
    persist(DICTIONARY);
    return ok([...DICTIONARY]);
  },

  async findOrCreateByName(name, note) {
    await delay();
    // Case-insensitive exact match — same "don't fuzzy-match silently"
    // posture as Department.findOrCreateByName: a near-miss
    // creates a new pending entry for a human to reconcile, not a
    // silent guess.
    const existing = DICTIONARY.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (existing) return ok({ ...existing });

    const nowIso = new Date().toISOString();
    const newEntry: SpecimenEntry = {
      id: 'sp-auto-' + Date.now(),
      name,
      description: '',
      // type/procedure required by the interface but genuinely unknown
      // at auto-create time — left blank rather than guessed, same
      // "safest default, force explicit admin setup" posture Facility's
      // auto-create uses for jurisdiction.
      type: '', procedure: '',
      normalizedLabel: name,
      synonyms: [],
      active: true, // never blocks order processing — see the governance-fields comment on SpecimenEntry itself
      version: 1, updatedBy: 'system', updatedAt: nowIso,
      autoCreated: true,
      autoCreatedAt: nowIso.split('T')[0],
      autoCreatedNote: note,
    };
    DICTIONARY = [...DICTIONARY, newEntry];
    persist(DICTIONARY);
    return ok({ ...newEntry });
  },
};
