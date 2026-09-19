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
const CONTAINER_TYPE_VERSION = '3'; // bumped: added capacityMl/defaultFixativeId/isPrefilled, size-specific jars/buckets, SurePath/CytoLyt/EM vial entries, per direct guidance
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
    defaultFixativeId: 'fx-nbf10', isPrefilled: true,
    status: 'Active',
  },
  {
    id: 'medium-large-specimen-container',
    name: 'Specimen Container',
    description: 'Formalin-filled jar or bucket sized for surgical resections and organ explants.',
    category: 'histology',
    aplisMapping: 'Surgical Resection (e.g. Organ Explants, Mastectomy, Colectomy)',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step by a Pathologist or Pathologist Assistant (PA).',
    defaultFixativeId: 'fx-nbf10', isPrefilled: true,
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
  // Real, per direct guidance's own recommended ProcessingContainer
  // seed set — real, size-specific jars genuinely distinct from the
  // generic "Prefilled Formalin Vial"/"Specimen Container" entries
  // above, which never captured a real capacity at all.
  { id: 'jar-20ml-prefilled', name: '20 mL Prefilled Jar', description: '20 mL prefilled 10% NBF container — standard for skin, punch, and small endoscopic GI biopsies.',
    category: 'histology', aplisMapping: 'Skin / Punch / Small Endoscopic GI Biopsy',
    systemLogicNotes: 'Triggers standard overnight tissue processing protocols.',
    capacityMl: 20, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },
  { id: 'jar-40ml-prefilled', name: '40 mL Prefilled Jar', description: '40 mL prefilled 10% NBF container — standard for single core biopsies and small FNA cell blocks.',
    category: 'histology', aplisMapping: 'Single Core Biopsy / Small FNA Cell Block',
    systemLogicNotes: 'Triggers standard overnight tissue processing protocols.',
    capacityMl: 40, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },
  { id: 'jar-60ml-empty', name: '60 mL Dry/Empty Screw-Cap Pot', description: 'Dry, empty screw-cap pot for fresh tissue, frozen section, or custom fixative fill.',
    category: 'histology', aplisMapping: 'Fresh Tissue / Frozen Section / Custom Fixative Fill',
    systemLogicNotes: 'No default fixative — bench fills at accession or grossing per the specific real protocol.',
    capacityMl: 60, isPrefilled: false, status: 'Active' },
  { id: 'jar-120ml-prefilled', name: '120 mL Prefilled Jar', description: '120 mL prefilled 10% NBF container — excision biopsies, gallbladders, small organs.',
    category: 'histology', aplisMapping: 'Excision Biopsy / Gallbladder / Small Organ',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step by a Pathologist or Pathologist Assistant (PA).',
    capacityMl: 120, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },
  { id: 'bucket-500ml', name: '500 mL Specimen Container', description: 'Small resections — e.g. appendix, small bowel segments.',
    category: 'histology', aplisMapping: 'Small Resection (Appendix, Small Bowel Segment)',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step by a Pathologist or Pathologist Assistant (PA).',
    capacityMl: 500, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },
  { id: 'bucket-1l', name: '1 Litre Specimen Bucket', description: 'Mastectomies, colon resections, thyroidectomies.',
    category: 'histology', aplisMapping: 'Mastectomy / Colon Resection / Thyroidectomy',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step by a Pathologist or Pathologist Assistant (PA).',
    capacityMl: 1000, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },
  { id: 'bucket-2-5l', name: '2.5 Litre Specimen Tub', description: 'Large resections, radical prostatectomies, hysterectomies.',
    category: 'histology', aplisMapping: 'Large Resection / Radical Prostatectomy / Hysterectomy',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step; real, common candidate for a Megablock processing format at grossing.',
    capacityMl: 2500, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },
  { id: 'bucket-5l', name: '5+ Litre Specimen Container / Pail', description: 'Panniculectomies, amputations, large bulky tumors.',
    category: 'histology', aplisMapping: 'Panniculectomy / Amputation / Large Bulky Tumor',
    systemLogicNotes: 'Flags the order for a mandatory Gross Examination step by a Pathologist or Pathologist Assistant (PA).',
    capacityMl: 5000, defaultFixativeId: 'fx-nbf10', isPrefilled: true, status: 'Active' },

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
    capacityMl: 20, defaultFixativeId: 'fx-cytolyt', isPrefilled: true,
    status: 'Active',
  },
  // Real, per direct guidance, same real reasoning as the ThinPrep
  // split above — SurePath routes to its own, separate real
  // processing instrument (the BD PrepStain/SurePath processor), not
  // ThinPrep's. The generic LBC Vial entry above never distinguished
  // this, same real gap the ThinPrep entry was originally split out
  // to fix, just not carried through to SurePath at the time.
  {
    id: 'surepath-vial',
    name: 'SurePath Vial (CytoRich)',
    description: 'BD SurePath collection vial (CytoRich solution) — routes specifically to the SurePath/PrepStain processor, distinct from ThinPrep.',
    category: 'cytology',
    aplisMapping: 'Gynecologic (Pap) — Liquid-Based, SurePath Method',
    systemLogicNotes: 'Routes the order to the SurePath/PrepStain processor specifically.',
    capacityMl: 10, defaultFixativeId: 'fx-cytorich', isPrefilled: true,
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
  // Real, per direct guidance — the CytoLyt tube itself (needle
  // rinses / cell block prep), genuinely distinct from the generic
  // FNA Tube above, which carries no fixative/solution of its own.
  {
    id: 'cytolyt-tube',
    name: 'CytoLyt Solution Tube',
    description: 'CytoLyt solution tube for FNA needle rinses and cell block preparation.',
    category: 'cytology',
    aplisMapping: 'FNA Needle Rinse / Cell Block Prep',
    systemLogicNotes: 'Routes to cell block processing; supports reflex molecular testing from the same tube.',
    capacityMl: 30, defaultFixativeId: 'fx-cytolyt', isPrefilled: true,
    status: 'Active',
  },
  {
    id: 'unfixed-body-fluid-container',
    name: 'Sterile Fluid Container',
    description: 'Sterile, unfixed centrifuge tube or cup for effusions, urine, CSF, or BAL specimens.',
    category: 'cytology',
    aplisMapping: 'Effusions, Urine, CSF, Bronchoalveolar Lavage (BAL)',
    systemLogicNotes: 'Sets a tight expiration timer on the dashboard — unfixed fluids degrade rapidly and must be processed or refrigerated within hours.',
    capacityMl: 50, isPrefilled: false,
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
    defaultFixativeId: 'fx-rpmi', isPrefilled: true,
    status: 'Active',
  },
  {
    id: 'michels-zeus-media-vial',
    name: 'Michel\u2019s / Zeus Media Vial',
    description: 'Transport media vial for skin or renal biopsy destined for direct immunofluorescence.',
    category: 'special_media',
    aplisMapping: 'Skin / Renal Biopsy for Direct Immunofluorescence (DIF)',
    systemLogicNotes: 'Routes the specimen directly to the cryostat sectioning area for immunofluorescence protocols rather than standard paraffin embedding.',
    defaultFixativeId: 'fx-michels', isPrefilled: true,
    status: 'Active',
  },
  // Real, per direct guidance — a real, distinct EM-specific
  // glutaraldehyde vial, genuinely different capacity/purpose from
  // the RPMI/Michel's transport vials above.
  {
    id: 'em-glutaraldehyde-vial',
    name: '2.5% Glutaraldehyde EM Vial',
    description: 'Renal or muscle biopsy specimen vial for electron microscopy.',
    category: 'special_media',
    aplisMapping: 'Renal / Muscle Biopsy for Electron Microscopy',
    systemLogicNotes: 'Routes the order to the EM lab; bypasses standard paraffin embedding entirely.',
    capacityMl: 5, defaultFixativeId: 'fx-glut25', isPrefilled: true,
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
