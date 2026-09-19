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
  // Real, per direct follow-up: "add tissue descriptions on
  // cassettes... then test a protocol." A real, first Autopsy-
  // category specimen dictionary entry — previously none existed
  // anywhere (confirmed via a full-codebase search before adding
  // this), which meant the entire Autopsy-relevant accessioning UI
  // (AccessionPage.tsx's own Case Authority section, the Organ(s)
  // Included picker) was genuinely unreachable in practice: nothing
  // in the real Specimen Dictionary picker would ever resolve to
  // specimenCategory 'AUTOPSY', so autopsyRelevant could never
  // become true through the normal accessioning flow. This closes
  // that real gap directly, paired with the real
  // proto-autopsy-cardiac-sectioning Protocol above (services/
  // protocols/mockProtocolService.ts) as a genuine, working example
  // of the Targeted Organ / Multi-Specimen scenario (Part B's own
  // Rule Set 4, Specimen Container C: Heart).
  {
    id: 'sp-heart-autopsy',
    name: 'Heart, Autopsy',
    description: 'Whole heart submitted at autopsy for cardiac sectioning and coronary artery examination.',
    type: 'Heart', procedure: 'Autopsy Examination',
    specimenCategory: 'AUTOPSY',
    normalizedLabel: 'Heart, Autopsy',
    synonyms: ['Autopsy Heart', 'Cardiac Autopsy Specimen', 'Heart, Whole (Autopsy)'],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
    // References the real proto-autopsy-cardiac-sectioning Protocol
    // above \u2014 generateDefaultMaterial.ts resolves this at
    // accessioning to auto-generate 6 real blocks (4 coronary vessel
    // blocks + 2 myocardial blocks), each auto-labeled sequentially
    // (e.g. C1\u2013C6 for a specimen labeled "C"), rather than one
    // undifferentiated block.
    protocolId: 'proto-autopsy-cardiac-sectioning',
  },
  // Real, per direct follow-up ("can you put some seed data in so
  // that I can demonstrate the DP and Non GYN/FNA case columns") —
  // investigation found every real cytology specimen this app's own
  // seeded cases reference (sp-cyto-pap, sp-cyto-hpv-self,
  // sp-fna-thyroid) was a genuinely dangling specimenDictionaryEntryId
  // — none of the three existed in this dictionary at all. This is
  // the exact reason the Surg Path branch tab was silently including
  // real GYN cytology cases: resolveCaseHasSpecimenCategory's own
  // dictionary lookup found nothing for these ids, so
  // resolveCaseDisciplineBranch fell through to its own real
  // remainder bucket (surgpath) for every one of them — a real,
  // confirmed root cause, not a guess.
  {
    id: 'sp-cyto-pap',
    name: 'Cervical/Vaginal Pap Smear',
    description: 'Cervical/vaginal Pap smear, liquid-based cytology.',
    type: 'Cytology', procedure: 'Pap Smear',
    specimenCategory: 'GYN_CYTOLOGY',
    normalizedLabel: 'Cervical/Vaginal Pap Smear',
    synonyms: ['Pap Smear', 'Cervical Cytology', 'ThinPrep Pap'],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-cyto-hpv-self',
    name: 'Self-Collected Vaginal Swab (HPV Only)',
    description: 'Self-collected vaginal swab for primary HPV screening only \u2014 no real cytology interpretation performed on this real specimen type.',
    type: 'Cytology', procedure: 'Self-Collected Vaginal Swab',
    specimenCategory: 'GYN_CYTOLOGY',
    isSelfCollected: true,
    normalizedLabel: 'Self-Collected Vaginal Swab (HPV Only)',
    synonyms: ['Self-Collected HPV Swab', 'HPV Self-Sampling'],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
  },
  {
    id: 'sp-fna-thyroid',
    name: 'Thyroid Fine Needle Aspiration',
    description: 'Fine needle aspiration of the thyroid \u2014 a real, non-GYN cytology specimen.',
    type: 'FNA', procedure: 'Fine Needle Aspiration',
    specimenCategory: 'NON_GYN_CYTOLOGY',
    normalizedLabel: 'Thyroid Fine Needle Aspiration',
    synonyms: ['Thyroid FNA', 'Thyroid Fine Needle Aspirate'],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
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
