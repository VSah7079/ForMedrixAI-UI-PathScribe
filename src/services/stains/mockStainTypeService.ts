// src/services/stains/mockStainTypeService.ts

import type { ServiceResult, ID } from '../types';
import type { IStainTypeService, StainType } from './IStainService';

let STAIN_TYPES: StainType[] = [
  { id: 'st-he',    name: 'H&E',                     category: 'Routine',       version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pas',   name: 'PAS',                     category: 'Special Stain', description: 'Periodic acid–Schiff — fungal elements, basement membranes, glycogen.', defaultBillingCode: 'SPECIAL-STAIN', requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Liver (glycogen) / Kidney (basement membrane)', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-gms',   name: 'GMS',                     category: 'Special Stain', description: 'Grocott\u2019s methenamine silver — fungal organisms.', defaultBillingCode: 'SPECIAL-STAIN', requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Known fungal-positive tissue', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-trichrome', name: 'Trichrome',           category: 'Special Stain', description: 'Collagen/fibrosis assessment.', defaultBillingCode: 'SPECIAL-STAIN', requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Liver (fibrosis)', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-ki67',  name: 'Ki-67',                   category: 'IHC', antibodyClone: '30-9', vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Tonsil', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-er',    name: 'ER',                      category: 'IHC', antibodyClone: 'SP1',  vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Breast', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pr',    name: 'PR',                       category: 'IHC', antibodyClone: '1E2',  vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Breast', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-her2',  name: 'HER2',                     category: 'IHC', antibodyClone: '4B5',  vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Breast', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, demo-labeled 88344 (multiplex antibody stain) - a genuine,
  // defensible case for a per-stain override, not the generic rule:
  // "Dual Stain" means p63 and CK5/6 are two separately identifiable
  // antibodies applied to the SAME slide, which real CPT guidance
  // (verified via direct search) codes as 88344 rather than as two
  // separate 88342/88341 charges.
  { id: 'st-p63-ck56', name: 'p63/CK5/6 Dual Stain', category: 'IHC', description: 'Myoepithelial/basal marker dual stain — invasive vs. in-situ breast lesions.', defaultBillingCode: 'P63-CK56-DUAL', excludeFromIhcSequenceCounting: true, defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Breast', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pdl1',  name: 'PD-L1',                    category: 'IHC', antibodyClone: 'SP142', vendor: 'Ventana', defaultTurnaroundHours: 48, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Tonsil', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, distinct entry - NOT a rename of the SP142 entry above. 22C3
  // (Dako/Agilent PD-L1 IHC 22C3 pharmDx) and SP142 (Ventana) are
  // genuinely different, separately FDA-approved companion diagnostic
  // assays used for different indications (22C3: NSCLC/CPS scoring;
  // SP142: triple-negative breast) - real, different vendors, real,
  // different clones, not the same test under two names.
  { id: 'st-pdl1-22c3', name: 'PD-L1 (22C3)',         category: 'IHC', antibodyClone: '22C3', vendor: 'Dako/Agilent', defaultTurnaroundHours: 48, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Tonsil', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct guidance's own worked example - "HER2 FISH...
  // typically targets ERBB2 and CEP17 as a 2-probe dual-color set."
  // 2 real, default targets -> billingRule resolves to 1 unit base +
  // 1 unit add-on (see calculateMolecularUnits.ts's own worked test
  // for this exact case).
  { id: 'st-her2-fish', name: 'HER2 FISH', category: 'Molecular', methodology: 'FISH_ANATOMIC', description: 'Dual-probe HER2/CEP17 FISH — manual direct count.', defaultTargets: [
      { id: 'mt-erbb2', symbol: 'ERBB2', detail: '17q12', targetType: 'PROBE', active: true },
      { id: 'mt-cep17', symbol: 'CEP17', detail: '17p11.1-q11.1', targetType: 'PROBE', active: true },
    ], billingRule: { billingModel: 'BASE_ADDON', baseCptCode: 'FISH-MANUAL-BASE', addOnCptCode: 'FISH-MANUAL-ADDL', multiplexCptCode: 'FISH-MANUAL-MULTIPLEX' },
    defaultTurnaroundHours: 72, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct guidance's own worked example - "Lymphoma FISH
  // Panel -> Pre-configured Probe Set: [IGH, BCL2, MYC, CCND1]
  // (Default Count: 4)." 4 real, default targets -> billingRule
  // resolves to 1 unit of the real multiplex code (>= the default
  // 3-target threshold), not base+addon stacked.
  { id: 'st-lymphoma-fish-panel', name: 'Lymphoma FISH Panel', category: 'Molecular', methodology: 'FISH_ANATOMIC', description: 'Order-group FISH panel — specific probe subset selected per clinical indication or preliminary flow/morphology findings.', defaultTargets: [
      { id: 'mt-igh', symbol: 'IGH', detail: '14q32', targetType: 'PROBE', active: true },
      { id: 'mt-bcl2', symbol: 'BCL2', detail: '18q21', targetType: 'PROBE', active: true },
      { id: 'mt-myc', symbol: 'MYC', detail: '8q24', targetType: 'PROBE', active: true },
      { id: 'mt-ccnd1', symbol: 'CCND1', detail: '11q13', targetType: 'PROBE', active: true },
    ], billingRule: { billingModel: 'BASE_ADDON', baseCptCode: 'FISH-MANUAL-BASE', addOnCptCode: 'FISH-MANUAL-ADDL', multiplexCptCode: 'FISH-MANUAL-MULTIPLEX' },
    defaultTurnaroundHours: 96, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct guidance ("Cytology GYN will be coming soon") -
  // the real "Orderable Test / Method Modifier" tier: Papanicolaou
  // (Pap) stain, structured as two distinct method entries rather than
  // one - conventional smear vs. liquid-based (ThinPrep) genuinely
  // bill different real CPT codes (see PAP-CONVENTIONAL/PAP-THINPREP
  // in the Billing Dictionary). The OTHER real tier (ThinPrep as an
  // approved Collection Container & Preservative Media) lives
  // separately, in the Container Type dictionary
  // (mockContainerTypeService.ts's own 'thinprep-vial' entry) - never
  // duplicated here.
  { id: 'st-pap-conventional', name: 'Pap Smear, Conventional', category: 'Cytology', description: 'Conventional (direct) Pap smear, Bethesda system reporting.', defaultBillingCode: 'PAP-CONVENTIONAL', defaultTurnaroundHours: 48, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pap-thinprep', name: 'Pap Smear, Liquid-Based (ThinPrep)', category: 'Cytology', description: 'Liquid-based Pap using the ThinPrep method - requires a ThinPrep/PreservCyt Vial at collection (Container Type dictionary).', defaultBillingCode: 'PAP-THINPREP', defaultTurnaroundHours: 48, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per PS-284 (Microtomy Workstation)'s own Cytology & Decanting
  // panel: "Stain Quick-Toggle: Pap Stain, Diff-Quik/Wright-Giemsa,
  // H&E." Pap (both methods) and H&E (st-he, Routine) already existed
  // in this dictionary; Diff-Quik/Wright-Giemsa (the standard rapid,
  // air-dried Romanowsky stain used for on-site adequacy checks and
  // non-GYN cytology) was the one genuinely missing entry.
  { id: 'st-diffquik', name: 'Diff-Quik / Wright-Giemsa', category: 'Cytology', description: 'Rapid Romanowsky-type stain for air-dried cytology smears — on-site adequacy assessment, non-GYN cytology.', defaultTurnaroundHours: 4, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct guidance's own HPV test suite. Molecular/
  // PCR_SINGLE - a real, nucleic-acid-based test, the same
  // generalized methodology this dictionary was built to support
  // beyond FISH from the start. Each a simple, flat single-code test
  // with no real target-count dimension (unlike FISH), so
  // defaultBillingCode is the right mechanism here - the same generic
  // "this stain's own configured code always wins" path PIN4-PANEL
  // already uses, not billingRule/calculateMolecularUnits.
  { id: 'st-hpv-highrisk-screen', name: 'HPV High-Risk Screening', category: 'Molecular', methodology: 'PCR_SINGLE', description: 'High-risk HPV types, pooled result. Billed alone when genotyping is not also ordered.', defaultBillingCode: 'HPV-HIGHRISK-SCREEN', defaultTurnaroundHours: 72, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-hpv-genotyping', name: 'HPV Genotyping', category: 'Molecular', methodology: 'PCR_SINGLE', description: 'Individually reported HPV types 16/18 (includes 45 if performed).', defaultBillingCode: 'HPV-GENOTYPING', defaultTurnaroundHours: 72, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct guidance's own "Reflex" suite member - confirmed
  // via direct search this is a real, conditional ordering pattern
  // (screen first; genotyping only fires as a real reflex if the
  // screen comes back positive), not a distinct third CPT code.
  // Honest, disclosed limitation: defaultBillingCode only covers the
  // always-billed initial screen (87624) - this app has no real,
  // conditional result-based billing logic yet, so the reflex
  // genotyping charge (87625), when it actually fires, must still be
  // applied manually today (e.g. via the Code Search Modal), not
  // auto-generated by this dictionary entry alone.
  { id: 'st-hpv-reflex', name: 'HPV High-Risk Screening with Reflex Genotyping', category: 'Molecular', methodology: 'PCR_SINGLE', description: 'Orders the high-risk screen; genotyping (HPV-GENOTYPING) is a real, conditional reflex that only fires on a positive screen result and must currently be applied manually when it does - this app has no automated, result-triggered billing yet.', defaultBillingCode: 'HPV-HIGHRISK-SCREEN', defaultTurnaroundHours: 72, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct decision: MMR (mismatch repair) IHC is read as 4
  // separate antibodies, each its own real, billable stain - normal
  // IHC-FIRST/IHC-ADDL sequencing applies across all 4, same as any
  // other IHC panel with more than one antibody (e.g. ER/PR/HER2
  // above), not a single bundled multiplex code the way a genuine
  // one-slide dual stain (p63/CK5/6 below) gets.
  { id: 'st-mlh1',  name: 'MLH1',                     category: 'IHC', antibodyClone: 'M1',        vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Colon (normal mucosa)', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-msh2',  name: 'MSH2',                     category: 'IHC', antibodyClone: 'G219-1129', vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Colon (normal mucosa)', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-msh6',  name: 'MSH6',                     category: 'IHC', antibodyClone: 'SP93',      vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Colon (normal mucosa)', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'st-pms2',  name: 'PMS2',                     category: 'IHC', antibodyClone: 'EPR3947',   vendor: 'Ventana', defaultTurnaroundHours: 24, requiresTargetControl: true, allowControlAutoAppend: true, defaultControlTissueType: 'Colon (normal mucosa)', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
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
