// src/services/reasons/mockReasonDictionaryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance - matches mockResolutionTypeService.ts's own
// established pattern exactly (storage-backed, add/update/deactivate/
// reactivate), extended with a real `category` filter so this one
// service can back multiple, genuinely distinct reason taxonomies
// without each needing its own copy of this same scaffolding.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ReasonDictionaryEntry, IReasonDictionaryService } from '@/types/reasons/ReasonDictionaryEntry';

// Real, per direct guidance's own detailed billing context this
// session - post-signout billing changes are genuinely one of a small
// number of things that can happen after a case finalizes, and each
// one needs a real, specific, honest reason a billing specialist would
// actually select, not filler options.
const SEED_REASONS: ReasonDictionaryEntry[] = [
  {
    id: 'psbc-coding-error', category: 'POST_SIGNOUT_BILLING_CHANGE',
    name: 'Coding error identified', status: 'Active',
    description: 'A QA audit, payer rejection, or internal review found the originally billed code was incorrect for the documented specimen/procedure.',
  },
  {
    id: 'psbc-payer-rejection', category: 'POST_SIGNOUT_BILLING_CHANGE',
    name: 'Payer rejection — resubmission', status: 'Active',
    description: 'The original claim was rejected by the payer and requires a corrected code before resubmission.',
  },
  {
    id: 'psbc-late-ancillary', category: 'POST_SIGNOUT_BILLING_CHANGE',
    name: 'Late-arriving ancillary result', status: 'Active',
    description: 'A special stain, IHC, or molecular result completed after sign-out changed which code genuinely applies.',
  },
  {
    id: 'psbc-clerical-error', category: 'POST_SIGNOUT_BILLING_CHANGE',
    name: 'Clerical/data-entry error', status: 'Active',
    description: 'The wrong code was applied by mistake at the time of sign-out — a straightforward correction, not a clinical or coding-rule dispute.',
  },
  {
    id: 'psbc-audit-finding', category: 'POST_SIGNOUT_BILLING_CHANGE',
    name: 'Internal QA billing audit finding', status: 'Active',
    description: 'Identified through the Code Review Pool (manual flag or random sample) — see the linked billing deficiency record for the specific finding.',
  },

  // Real, per direct guidance's own detailed post-sign-out revision
  // taxonomy - every code, name, and example below matches that
  // guidance verbatim. Category 1: Supplemental Information (triggers
  // Addendum status).
  {
    id: 'ADD_MOLECULAR', category: 'ADDENDUM', status: 'Active',
    name: 'Molecular/Genomic Results',
    description: 'Mandatory detail of new findings, e.g. "HER2 FISH results received and appended."',
  },
  {
    id: 'ADD_IHC', category: 'ADDENDUM', status: 'Active',
    name: 'Immunohistochemistry/Special Stains',
    description: 'Mandatory detail of new findings, e.g. new IHC/special stain results received and appended.',
  },
  {
    id: 'ADD_CONSULT', category: 'ADDENDUM', status: 'Active',
    name: 'External Consultation/Expert Opinion',
    description: 'Mandatory detail of new findings, e.g. outside consultation opinion received and appended.',
  },
  {
    id: 'ADD_TUMOR_BOARD', category: 'ADDENDUM', status: 'Active',
    name: 'Tumor Board Discussion',
    description: 'Mandatory detail of new findings, e.g. tumor board discussion outcome appended.',
  },

  // Category 2: Clinical / Diagnostic Revision (triggers Amended status).
  {
    id: 'AMEND_DIAG', category: 'AMENDMENT', status: 'Active',
    name: 'Diagnostic Interpretation Revision',
    description: 'Mandatory justification for diagnostic shift.',
  },
  {
    id: 'AMEND_MARGIN', category: 'AMENDMENT', status: 'Active',
    name: 'Surgical Margin Re-evaluation',
    description: 'Mandatory justification, e.g. "Margin status revised from negative to focally positive upon re-review of slide B2."',
  },
  {
    id: 'AMEND_STAGE', category: 'AMENDMENT', status: 'Active',
    name: 'Pathologic Staging Change',
    description: 'Mandatory justification for a pathologic staging revision.',
  },
  {
    id: 'AMEND_TISSUE', category: 'AMENDMENT', status: 'Active',
    name: 'Specimen/Site Reclassification',
    description: 'Mandatory justification for a specimen or organ site reclassification.',
  },

  // Category 3: Clerical / Administrative Correction (triggers
  // Corrected status).
  {
    id: 'CORR_TYPO', category: 'CORRECTION', status: 'Active',
    name: 'Typographical Error',
    description: 'Brief explanation of correction.',
  },
  {
    id: 'CORR_DEMO', category: 'CORRECTION', status: 'Active',
    name: 'Patient/Demographic Information Update',
    description: 'Brief explanation of correction, e.g. updated patient ID or demographic detail.',
  },
  {
    id: 'CORR_CLIN', category: 'CORRECTION', status: 'Active',
    name: 'Ordering Provider Update',
    description: 'Brief explanation of correction, e.g. "Corrected misspelling of ordering physician\u2019s last name in metadata."',
  },
  {
    id: 'CORR_SPEC', category: 'CORRECTION', status: 'Active',
    name: 'Specimen Labeling Correction',
    description: 'Brief explanation of correction, e.g. corrected tissue source or specimen label.',
  },
];

const STORAGE_KEY = 'reason_dictionary_entries_v1';
const load    = (): ReasonDictionaryEntry[] => storageGet<ReasonDictionaryEntry[]>(STORAGE_KEY, SEED_REASONS);
const persist = (data: ReasonDictionaryEntry[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockReasonDictionaryService: IReasonDictionaryService = {
  async getAll(category) {
    await delay();
    return ok(load().filter(r => r.category === category));
  },

  async add(entry) {
    await delay();
    const all = load();
    const newEntry: ReasonDictionaryEntry = { ...entry, id: 'reason-' + Date.now() };
    persist([...all, newEntry]);
    return ok(newEntry);
  },

  async update(id, changes) {
    await delay();
    const all = load();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return err(`Reason dictionary entry ${id} not found`);
    const updated = { ...all[idx], ...changes };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async deactivate(id) { return mockReasonDictionaryService.update(id, { status: 'Inactive' }); },
  async reactivate(id) { return mockReasonDictionaryService.update(id, { status: 'Active' }); },
};
