// src/services/containerTypes/mockContainerTypeService.ts
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ContainerType, IContainerTypeService } from './IContainerTypeService';

const STORAGE_KEY = 'container_types';

// Increment CONTAINER_TYPE_VERSION whenever SEED_CONTAINER_TYPES changes —
// same version-gated re-seed mechanism as mockCaseService.ts's
// MOCK_VERSION, learned the hard way earlier this session: without it, a
// stale localStorage snapshot silently wins over every future edit here,
// regardless of what Demo Reset's key list says.
const CONTAINER_TYPE_VERSION = '2'; // bumped: shortened names to real, standard catalog terms (Prefilled Formalin Vial, Specimen Container, etc.)
const VERSION_KEY = 'pathscribe_mock_container_types_version';
const storedVersion = typeof localStorage !== 'undefined' ? localStorage.getItem(VERSION_KEY) : CONTAINER_TYPE_VERSION;
if (storedVersion !== CONTAINER_TYPE_VERSION) {
  try {
    localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, CONTAINER_TYPE_VERSION);
  } catch { /* SSR / sandboxed env — ignore */ }
}

const SEED_CONTAINER_TYPES: ContainerType[] = [
  // ── Histology — Biopsies & Resections ───────────────────────────────────
  {
    id: 'small-biopsy-vial',
    name: 'Prefilled Formalin Vial',
    description: 'Small, pre-filled formalin vial for core, punch, or endoscopic biopsies.',
    category: 'histology',
    aplisMapping: 'Biopsy (Core, Punch, Endoscopic)',
    systemLogicNotes: 'Triggers standard overnight tissue processing protocols. Often mapped to high-volume, automated cassette labeling.',
    status: 'Active',
  },
  {
    id: 'medium-large-specimen-container',
    name: 'Specimen Container',
    description: 'Formalin-filled jar or bucket sized for surgical resections and organ explants.',
    category: 'histology',
    aplisMapping: 'Surgical Resection (e.g. Organ Explants, Mastectomy, Colectomy)',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step by a Pathologist or Pathologist Assistant (PA).',
    status: 'Active',
  },
  {
    id: 'fresh-dry-container',
    name: 'Fresh/Dry Container',
    description: 'Unfixed container for tissue submitted for intraoperative consultation.',
    category: 'histology',
    aplisMapping: 'Intraoperative Consultation / Frozen Section',
    systemLogicNotes: 'STAT alert. Triggers immediate pager/SMS notification to the on-call pathologist and bypasses standard accessioning queues.',
    status: 'Active',
  },

  // ── Cytology — Fluids & Smears ───────────────────────────────────────────
  {
    id: 'lbc-vial',
    name: 'LBC Vial',
    description: 'Liquid-based cytology collection vial (ThinPrep / SurePath) for Pap and non-gynecologic brushings.',
    category: 'cytology',
    aplisMapping: 'Gynecologic (Pap) or Non-Gynecologic Brushings',
    systemLogicNotes: 'Routes the order to automated slide preparation instruments and reflex molecular testing (e.g. HPV co-testing).',
    status: 'Active',
  },
  // Real, per direct guidance: distinct from the generic LBC Vial
  // above, not a duplicate - "cataloged as an approved Collection
  // Container & Preservative Media... Order entry forms require this
  // designation so the accessioning workflow knows which processing
  // instrument (e.g., ThinPrep Processor) to route the specimen to."
  // A generic LBC Vial entry can't distinguish ThinPrep's own
  // processing instrument from SurePath's separate, different one.
  {
    id: 'thinprep-vial',
    name: 'ThinPrep Vial (PreservCyt)',
    description: 'Hologic ThinPrep collection vial (PreservCyt solution) — routes specifically to the ThinPrep Processor, distinct from other liquid-based cytology systems (e.g. SurePath).',
    category: 'cytology',
    aplisMapping: 'Gynecologic (Pap) — Liquid-Based, ThinPrep Method',
    systemLogicNotes: 'Routes the order to the ThinPrep Processor specifically. Supports reflex molecular testing (e.g. HPV co-testing) from the same vial.',
    status: 'Active',
  },
  {
    id: 'fna-tube',
    name: 'FNA Tube',
    description: 'Collection tube for fine needle aspiration biopsies.',
    category: 'cytology',
    aplisMapping: 'FNA Biopsy',
    systemLogicNotes: 'Links the order to a specific anatomical site (e.g. "Thyroid FNA Nod-1") and often triggers a Rapid On-Site Evaluation (ROSE) workflow billing modifier.',
    status: 'Active',
  },
  {
    id: 'unfixed-body-fluid-container',
    name: 'Sterile Fluid Container',
    description: 'Sterile, unfixed centrifuge tube or cup for effusions, urine, CSF, or BAL specimens.',
    category: 'cytology',
    aplisMapping: 'Effusions, Urine, CSF, Bronchoalveolar Lavage (BAL)',
    systemLogicNotes: 'Sets a tight expiration timer on the dashboard — unfixed fluids degrade rapidly and must be processed or refrigerated within hours.',
    status: 'Active',
  },

  // ── Special Media — Ancillary Testing ───────────────────────────────────
  {
    id: 'rpmi-1640-media-tube',
    name: 'RPMI Tube',
    description: 'RPMI 1640 transport media tube for tissue destined for flow cytometry or cytogenetics.',
    category: 'special_media',
    aplisMapping: 'Lymph Node / Bone Marrow / Tissue for Flow Cytometry or Cytogenetics',
    systemLogicNotes: 'Prevents the system from applying standard formalin fixative logic. Automatically prints distinct routing labels for the Flow Cytometry bench.',
    status: 'Active',
  },
  {
    id: 'michels-zeus-media-vial',
    name: 'Michel\u2019s / Zeus Media Vial',
    description: 'Transport media vial for skin or renal biopsy destined for direct immunofluorescence.',
    category: 'special_media',
    aplisMapping: 'Skin / Renal Biopsy for Direct Immunofluorescence (DIF)',
    systemLogicNotes: 'Routes the specimen directly to the cryostat sectioning area for immunofluorescence protocols rather than standard paraffin embedding.',
    status: 'Active',
  },
];

const load    = (): ContainerType[] => storageGet<ContainerType[]>(STORAGE_KEY, SEED_CONTAINER_TYPES);
const persist = (data: ContainerType[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockContainerTypeService: IContainerTypeService = {
  async getAll() {
    return ok([...load()]);
  },

  async getById(id) {
    const t = load().find(c => c.id === id);
    return t ? ok({ ...t }) : err(`Container type ${id} not found`);
  },

  async create(draft) {
    const types = load();
    const newType: ContainerType = {
      ...draft,
      id: `custom-${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${Date.now().toString(36).slice(-5)}`,
    };
    persist([...types, newType]);
    return ok({ ...newType });
  },

  async update(id, changes) {
    const types = load();
    const idx = types.findIndex(c => c.id === id);
    if (idx === -1) return err(`Container type ${id} not found`);
    types[idx] = { ...types[idx], ...changes };
    persist(types);
    return ok({ ...types[idx] });
  },

  async deactivate(id) { return mockContainerTypeService.update(id, { status: 'Inactive' }); },
  async reactivate(id) { return mockContainerTypeService.update(id, { status: 'Active'   }); },
};
