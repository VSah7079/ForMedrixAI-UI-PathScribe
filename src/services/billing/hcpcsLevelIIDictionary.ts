// src/services/billing/hcpcsLevelIIDictionary.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own "HCPCS Level II Pre-loading" best
// practice: unlike CPT (AMA copyrighted, see codeMapTable.ts's own
// PS-92 header), HCPCS Level II codes and their real, official
// descriptions are public domain (CMS-maintained) - safe to fully
// embed and bundle in this app's own core software, no license
// required, no synthetic-placeholder treatment needed.
//
// Real, verified descriptions - confirmed via direct search against
// hcpcsdata.com's own "2026 HCPCS Code" pages and CMS's own NCCI
// Policy Manual (Chapters X/XII, revision date 1/1/2026), not assumed
// from training data. Scoped to the HCPCS Level II codes actually
// relevant to anatomic pathology/laboratory billing (this app's own
// real domain) - the Medicare-mandated prostate needle biopsy
// substitution for CPT 88305 (G0416), molecular pathology physician
// interpretation (G0452), and the real family of Pap/cervical-vaginal
// cytopathology screening codes (G0123/G0124/G0141/G0143/G0144/G0145/
// G0148) - never the full, many-thousand-entry universal HCPCS Level
// II code set.
// ─────────────────────────────────────────────────────────────────────────────

export interface HcpcsLevelIIEntry {
  code: string;
  description: string;
}

export const HCPCS_LEVEL_II_DICTIONARY: HcpcsLevelIIEntry[] = [
  {
    code: 'G0416',
    description: 'Surgical pathology, gross and microscopic examinations, for prostate needle biopsy, any method',
  },
  {
    code: 'G0452',
    description: 'Molecular pathology procedure; physician interpretation and report',
  },
  {
    code: 'G0123',
    description: 'Screening cytopathology, cervical or vaginal (any reporting system), collected in preservative fluid, automated thin layer preparation, screening by cytotechnologist under physician supervision',
  },
  {
    code: 'G0124',
    description: 'Screening cytopathology, cervical or vaginal (any reporting system), collected in preservative fluid, automated thin layer preparation, requiring interpretation by physician',
  },
  {
    code: 'G0141',
    description: 'Screening cytopathology smears, cervical or vaginal, performed by automated system, with manual rescreening, requiring interpretation by physician',
  },
  {
    code: 'G0143',
    description: 'Screening cytopathology, cervical or vaginal (any reporting system), collected in preservative fluid, automated thin layer preparation, with manual screening and rescreening by cytotechnologist under physician supervision',
  },
  {
    code: 'G0144',
    description: 'Screening cytopathology, cervical or vaginal (any reporting system), collected in preservative fluid, automated thin layer preparation, with screening by automated system, under physician supervision',
  },
  {
    code: 'G0145',
    description: 'Screening cytopathology, cervical or vaginal (any reporting system), collected in preservative fluid, automated thin layer preparation, with screening by automated system and manual rescreening under physician supervision',
  },
  {
    code: 'G0148',
    description: 'Screening cytopathology smears, cervical or vaginal, performed by automated system with manual rescreening',
  },
];
