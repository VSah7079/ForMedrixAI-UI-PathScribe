// src/services/stains/mockStainTypeService.ts

import type { ServiceResult, ID } from '../types';
import type { IStainTypeService, StainType } from './IStainService';

let STAIN_TYPES: StainType[] = [
  { id: 'st-he',    name: 'H&E',                     category: 'Routine',       version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pas',   name: 'PAS',                     category: 'Special Stain', description: 'Periodic acid–Schiff — fungal elements, basement membranes, glycogen.', defaultBillingCode: '88312', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-gms',   name: 'GMS',                     category: 'Special Stain', description: 'Grocott\u2019s methenamine silver — fungal organisms.', defaultBillingCode: '88312', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-trichrome', name: 'Trichrome',           category: 'Special Stain', description: 'Collagen/fibrosis assessment.', defaultBillingCode: '88312', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-ki67',  name: 'Ki-67',                   category: 'IHC', antibodyClone: '30-9', vendor: 'Ventana', defaultTurnaroundHours: 24, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-er',    name: 'ER',                      category: 'IHC', antibodyClone: 'SP1',  vendor: 'Ventana', defaultTurnaroundHours: 24, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pr',    name: 'PR',                       category: 'IHC', antibodyClone: '1E2',  vendor: 'Ventana', defaultTurnaroundHours: 24, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-her2',  name: 'HER2',                     category: 'IHC', antibodyClone: '4B5',  vendor: 'Ventana', defaultTurnaroundHours: 24, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, demo-labeled 88344 (multiplex antibody stain) - a genuine,
  // defensible case for a per-stain override, not the generic rule:
  // "Dual Stain" means p63 and CK5/6 are two separately identifiable
  // antibodies applied to the SAME slide, which real CPT guidance
  // (verified via direct search) codes as 88344 rather than as two
  // separate 88342/88341 charges.
  { id: 'st-p63-ck56', name: 'p63/CK5/6 Dual Stain', category: 'IHC', description: 'Myoepithelial/basal marker dual stain — invasive vs. in-situ breast lesions.', defaultBillingCode: '88344', excludeFromIhcSequenceCounting: true, defaultTurnaroundHours: 24, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pdl1',  name: 'PD-L1',                    category: 'IHC', antibodyClone: 'SP142', vendor: 'Ventana', defaultTurnaroundHours: 48, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Immunofluorescence conjugates — the standard renal biopsy IF panel.
  // Genuinely different technique from IHC (fluorescent-conjugated,
  // not chromogenic), hence the separate category rather than folding
  // these into IHC. Panel composition here is illustrative "preference
  // card" seed data per the engineering feedback this was built from —
  // not asserted as every lab's exact required panel.
  { id: 'st-igg',   name: 'IgG',  category: 'Immunofluorescence', description: 'Renal IF panel.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-iga',   name: 'IgA',  category: 'Immunofluorescence', description: 'Renal IF panel.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-igm',   name: 'IgM',  category: 'Immunofluorescence', description: 'Renal IF panel.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-c3',    name: 'C3',   category: 'Immunofluorescence', description: 'Renal IF panel.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-c1q',   name: 'C1q',  category: 'Immunofluorescence', description: 'Renal IF panel.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-kappa', name: 'Kappa', category: 'Immunofluorescence', description: 'Renal IF panel — light chain.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-lambda', name: 'Lambda', category: 'Immunofluorescence', description: 'Renal IF panel — light chain.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Not a stain in the traditional sense — an EM contrast/staining
  // agent for ultra-thin sections. Modeled here anyway since our
  // current Block/StainOrder shape has no separate concept for this;
  // flagged honestly rather than silently mislabeled.
  { id: 'st-uranyl-lead', name: 'Uranyl Acetate / Lead Citrate', category: 'Other', description: 'Electron microscopy contrast staining, not a light-microscopy stain.', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
];

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export const mockStainTypeService: IStainTypeService = {
  async getAll() {
    return ok([...STAIN_TYPES]);
  },
  async add(entry) {
    const created: StainType = {
      ...entry,
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: 1, updatedBy: 'admin', updatedAt: new Date().toISOString(),
    };
    STAIN_TYPES = [...STAIN_TYPES, created];
    return ok(created);
  },
  async update(id: ID, changes) {
    let updated: StainType | undefined;
    STAIN_TYPES = STAIN_TYPES.map(s => {
      if (s.id !== id) return s;
      updated = { ...s, ...changes, version: s.version + 1, updatedBy: 'admin', updatedAt: new Date().toISOString() };
      return updated;
    });
    if (!updated) return { ok: false, error: 'Not found' } as ServiceResult<StainType>;
    return ok(updated);
  },
};
