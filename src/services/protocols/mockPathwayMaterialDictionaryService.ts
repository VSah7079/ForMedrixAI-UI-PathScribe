// src/services/protocols/mockPathwayMaterialDictionaryService.ts
import type {
  FixativeDictionaryEntry, IFixativeDictionaryService,
  ProcessingFormatDictionaryEntry, IProcessingFormatDictionaryService,
} from './IPathwayMaterialDictionaryService';
import type { ServiceResult, ID } from '../types';

function ok<T>(data: T): ServiceResult<T> { return { ok: true, data }; }

// ── Fixatives — real, per direct guidance covering routine surgical
// pathology, cytology, hematopathology, and specialized testing ─────────────
let FIXATIVES: FixativeDictionaryEntry[] = [
  // 1. Routine Formalin Fixatives (Surgical Pathology)
  { id: 'fx-nbf10', code: 'NBF10', name: '10% Neutral Buffered Formalin', category: 'Surgical',
    description: 'The universal standard fixative for routine histology, IHC, and gross tissue preservation.',
    isDefault: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-unbufform', code: 'UNBUFFORM', name: '10% Unbuffered Formalin / Formal Saline', category: 'Surgical',
    description: 'Used primarily in specialized or legacy tissue handling setups.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },

  // 2. Alcohol-Based Fixatives & Cytology Preservatives
  { id: 'fx-eth95', code: 'ETH95', name: '95% Ethanol', category: 'Cytology',
    description: 'Standard dry-fixed smear fixative for immediate slide prep (e.g. Pap smears, FNAs).',
    isDefault: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-cytolyt', code: 'CYTOLYT', name: 'CytoLyt / PreservCyt (ThinPrep)', category: 'Cytology',
    description: 'Methanol-based media used for liquid-based cytology collections and cell block preparations.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-cytorich', code: 'CYTORICH', name: 'CytoRich / CarboPrep (SurePath)', category: 'Cytology',
    description: 'Ethanol-based liquid-based cytology collection media.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-isopropanol', code: 'ISOPROP7080', name: '70\u201380% Isopropanol/Ethanol', category: 'Cytology',
    description: 'General slide spray fixative and specimen transport medium.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },

  // 3. Rapid Fixatives & Specialized Histology Solutions
  { id: 'fx-bouins', code: 'BOUINS', name: 'Bouin\u2019s Solution', category: 'Surgical',
    description: 'Picric acid\u2013containing fixative used for testicular biopsies, GI biopsies, and preserving nuclear detail.',
    requiresWarningLabel: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct correction ("Mercuric fixatives... are restricted
  // or phased out internationally... making Zinc Formalin the global
  // alternative") \u2014 kept as two real, distinct entries rather than
  // one combined "B-5 / Zinc Formalin" entry, since they now carry
  // genuinely different real regulatory status, not just different
  // names for the same thing (same real reasoning as the PD-L1
  // SP142/22C3 split above).
  { id: 'fx-b5', code: 'B5', name: 'B-5 Fixative (Mercuric)', category: 'Surgical',
    description: 'Mercuric-chloride-based fixative for delicate nuclear detail in bone marrow biopsies and lymph nodes. Restricted or phased out in many jurisdictions due to toxic disposal regulations \u2014 see Zinc Formalin for the modern, compliant alternative.',
    requiresWarningLabel: true, regulatoryStatus: 'Restricted', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-zincformalin', code: 'ZNFORM', name: 'Zinc Formalin', category: 'Surgical',
    description: 'Zinc-based alternative to mercuric B-5 for delicate nuclear detail in bone marrow biopsies and lymph nodes \u2014 the global standard replacement where mercuric fixatives are restricted.',
    regulatoryStatus: 'Active', version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-carnoys', code: 'CARNOYS', name: 'Carnoy\u2019s Fixative', category: 'Surgical',
    description: 'Rapid alcohol/chloroform solution useful for fast processing and clearing mucus (e.g. lymph node retrieval).',
    requiresWarningLabel: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-hollandes', code: 'HOLLANDES', name: 'Hollande\u2019s Solution', category: 'Surgical',
    description: 'Modified Bouin\u2019s used for GI tract specimens and endocrine tissues.',
    requiresWarningLabel: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  // Real, per direct follow-up (South Korea/East Asia regional
  // nuances \u2014 "non-fixing media or OCT (Optimal Cutting Temperature)
  // embedding media are routinely paired with rapid fixatives") \u2014 a
  // real, distinct, non-fixing embedding medium for frozen/intraoperative
  // section processing, genuinely different from every fixative above.
  { id: 'fx-oct', code: 'OCT', name: 'OCT (Optimal Cutting Temperature) Compound', category: 'Transport Media',
    description: 'Non-fixing embedding medium for frozen/intraoperative section processing \u2014 paired with a rapid fixative, not a fixative itself.',
    isFixative: false, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },

  // 4. Specialized Transport & Ultrastructural Media
  { id: 'fx-glut25', code: 'GLUT25', name: '2.5% Glutaraldehyde', category: 'EM',
    description: 'Primary fixative for Electron Microscopy specimen preservation.',
    isDefault: true, requiresWarningLabel: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-michels', code: 'MICHEL', name: 'Michel\u2019s Transport Medium / Zeus Medium', category: 'Transport Media',
    description: 'Buffered salt solution used to transport tissue for Direct Immunofluorescence (e.g. renal and skin biopsies) \u2014 a non-fixing buffer.',
    isDefault: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'fx-rpmi', code: 'RPMI1640', name: 'RPMI 1640 / Cell Culture Medium', category: 'Transport Media',
    description: 'Nutrient transport medium for flow cytometry and cytogenetic testing \u2014 non-fixing media.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
];

export const mockFixativeDictionaryService: IFixativeDictionaryService = {
  async getAll() {
    return ok([...FIXATIVES]);
  },
  async add(entry) {
    const created: FixativeDictionaryEntry = {
      ...entry,
      id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: 1, updatedBy: 'admin', updatedAt: new Date().toISOString(),
    };
    FIXATIVES = [...FIXATIVES, created];
    return ok(created);
  },
  async update(id: ID, changes) {
    let updated: FixativeDictionaryEntry | undefined;
    FIXATIVES = FIXATIVES.map(f => {
      if (f.id !== id) return f;
      updated = { ...f, ...changes, version: f.version + 1, updatedBy: 'admin', updatedAt: new Date().toISOString() };
      return updated;
    });
    if (!updated) return { ok: false, error: 'Not found' } as ServiceResult<FixativeDictionaryEntry>;
    return ok(updated);
  },
};

// ── Processing formats — real, per direct guidance's own confirmed set:
// the only values ever actually used across this codebase's own real
// pathways before this dictionary existed ─────────────────────────────────
let PROCESSING_FORMATS: ProcessingFormatDictionaryEntry[] = [
  { id: 'pf-standard', name: 'Standard', description: 'Standard-sized cassette \u2014 the routine format for most blocks.',
    isDefault: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'pf-megablock', name: 'Megablock', description: 'Oversized cassette for whole-mount sections (e.g. radical prostatectomy, large tissue mass resections).',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'pf-frozenblock', name: 'Frozen Block', description: 'Frozen section block format.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
  { id: 'pf-resingrid', name: 'Resin Grid', description: 'Resin-embedded grid format, used for Electron Microscopy.',
    version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(), active: true },
];

export const mockProcessingFormatDictionaryService: IProcessingFormatDictionaryService = {
  async getAll() {
    return ok([...PROCESSING_FORMATS]);
  },
  async add(entry) {
    const created: ProcessingFormatDictionaryEntry = {
      ...entry,
      id: `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: 1, updatedBy: 'admin', updatedAt: new Date().toISOString(),
    };
    PROCESSING_FORMATS = [...PROCESSING_FORMATS, created];
    return ok(created);
  },
  async update(id: ID, changes) {
    let updated: ProcessingFormatDictionaryEntry | undefined;
    PROCESSING_FORMATS = PROCESSING_FORMATS.map(p => {
      if (p.id !== id) return p;
      updated = { ...p, ...changes, version: p.version + 1, updatedBy: 'admin', updatedAt: new Date().toISOString() };
      return updated;
    });
    if (!updated) return { ok: false, error: 'Not found' } as ServiceResult<ProcessingFormatDictionaryEntry>;
    return ok(updated);
  },
};
