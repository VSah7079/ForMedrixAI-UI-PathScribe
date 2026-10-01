// src/services/cytology/cytologySynopticTemplateRegistry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed decision: the 5 real,
// already-existing CAP/RCPath Non-GYN cytology templates
// (data/templates/Cytology/), not invented mock templates. Real,
// honest scope: no real, structured specimen-site tag exists yet
// (confirmed before this registry was built — see this app's own
// Specimen type) for auto-selecting the right template from a real
// case, so the drawer's own picker lets a real user choose directly
// rather than guessing from free-text specimen descriptions.
// ─────────────────────────────────────────────────────────────────────────────

import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';
import thyroid from '@/data/templates/Cytology/cytology_thyroid_fna_cytology.json';
import pancreaticobiliary from '@/data/templates/Cytology/cytology_pancreaticobiliary_cytology.json';
import salivaryGland from '@/data/templates/Cytology/cytology_salivary_gland_fna_cytology.json';
import lymphNode from '@/data/templates/Cytology/cytology_lymph_node_fna_cytology.json';
import urine from '@/data/templates/Cytology/cytology_urine_cytology.json';

export const CYTOLOGY_SYNOPTIC_TEMPLATES: SynopticTemplate[] = [
  thyroid, pancreaticobiliary, salivaryGland, lymphNode, urine,
] as SynopticTemplate[];

export function resolveCytologySynopticTemplateById(templateId: string): SynopticTemplate | undefined {
  return CYTOLOGY_SYNOPTIC_TEMPLATES.find(t => t.id === templateId);
}
