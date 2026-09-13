// src/services/cytology/resolveUpdatedCodingFromModalSubmission.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed decision: Cytology needs
// the same real, per-specimen billing/diagnosis code architecture
// Surgical Pathology already uses (SynopticReportPage.tsx's own
// handleAddCodesToSpecimens) — "Billing units for Non-GYN cytology
// and FNAs are driven per specimen/site... Case-level-only coding
// makes charge generation and compliance auditing much more
// difficult." This is the CORE, genuinely reusable data-
// transformation logic extracted as a fresh, standalone, pure
// function — NOT a copy-paste of Surgical's own inline
// implementation, and NOT a modification to it either. Surgical's own
// handler stays untouched; this exists so Cytology has its own real,
// tested version of the same real logic, honestly scoped down to
// what Cytology's own, real, simpler save mechanism (a direct
// caseRouter.updateCase, no orchestration-mode charge/credit ledger,
// no concurrency version tracking) actually needs and can support —
// see this module's own README for the full, honest account of what
// was deliberately left out and why.
// ─────────────────────────────────────────────────────────────────────────────

interface ModalCode {
  system: 'ICD' | 'SNOMED' | 'ICD-O' | 'CPT' | string;
  code: string;
  display: string;
  specimenId?: string;
}

interface SpecimenLike {
  id: string;
  coding?: {
    icd10?: { code: string; description: string }[];
    snomed?: { code: string; description: string }[];
    icdO?: { code: string; description: string }[];
    cpt?: string[];
  };
}

export interface ResolvedCodingUpdate<TSpecimen extends SpecimenLike> {
  // Real, per the actual, declared CaseCoding type
  // (types/case/Case.ts) — bare code strings, not the full
  // {code, description} objects. Real, honest note: Surgical
  // Pathology's own equivalent handler stores full objects here via
  // an `as any` type bypass, a real, pre-existing mismatch against
  // CaseCoding's own declared string[] shape — not perpetuated here;
  // this function stores what the real, declared type actually says.
  newCoding: { icd10: string[]; snomed: string[] };
  updatedSpecimens: TSpecimen[];
  /** Real, per specimen — CPT codes newly present that weren't there
   *  before, for real audit-logging purposes (never a financial
   *  charge on this screen — see this module's own README). */
  additionsBySpecimen: Map<string, string[]>;
  /** Real, per specimen — CPT codes that were present before and are
   *  no longer, for real audit-logging purposes. */
  removalsBySpecimen: Map<string, string[]>;
}

export function resolveUpdatedCodingFromModalSubmission<TSpecimen extends SpecimenLike>(
  specimens: TSpecimen[],
  codes: ModalCode[],
): ResolvedCodingUpdate<TSpecimen> {
  const newIcd = codes.filter(c => c.system === 'ICD' && !c.specimenId);
  const newIcd10BySpecimenId = new Map<string, { code: string; description: string }[]>();
  codes.filter(c => c.system === 'ICD' && c.specimenId).forEach(c => {
    const specId = c.specimenId!;
    if (!newIcd10BySpecimenId.has(specId)) newIcd10BySpecimenId.set(specId, []);
    newIcd10BySpecimenId.get(specId)!.push({ code: c.code, description: c.display });
  });

  const newIcdOBySpecimenId = new Map<string, { code: string; description: string }[]>();
  codes.filter(c => c.system === 'ICD-O' && c.specimenId).forEach(c => {
    const specId = c.specimenId!;
    if (!newIcdOBySpecimenId.has(specId)) newIcdOBySpecimenId.set(specId, []);
    newIcdOBySpecimenId.get(specId)!.push({ code: c.code, description: c.display });
  });

  const newSnomed = codes.filter(c => c.system === 'SNOMED' && !c.specimenId);
  const newSnomedBySpecimenId = new Map<string, { code: string; description: string }[]>();
  codes.filter(c => c.system === 'SNOMED' && c.specimenId).forEach(c => {
    const specId = c.specimenId!;
    if (!newSnomedBySpecimenId.has(specId)) newSnomedBySpecimenId.set(specId, []);
    newSnomedBySpecimenId.get(specId)!.push({ code: c.code, description: c.display });
  });

  const newCptBySpecimenId = new Map<string, string[]>();
  codes.filter(c => c.system === 'CPT').forEach(c => {
    if (!c.specimenId) return; // a CPT code with no real specimen target isn't meaningful to apply
    if (!newCptBySpecimenId.has(c.specimenId)) newCptBySpecimenId.set(c.specimenId, []);
    newCptBySpecimenId.get(c.specimenId)!.push(c.code);
  });

  const additionsBySpecimen = new Map<string, string[]>();
  const removalsBySpecimen = new Map<string, string[]>();
  const updatedSpecimens = specimens.map((sp) => {
    const hadExistingIcd10 = (sp.coding?.icd10 ?? []).length > 0;
    const hasIcd10Change = newIcd10BySpecimenId.has(sp.id) || hadExistingIcd10;
    const hadExistingSnomed = (sp.coding?.snomed ?? []).length > 0;
    const hasSnomedChange = newSnomedBySpecimenId.has(sp.id) || hadExistingSnomed;
    const hadExistingIcdO = (sp.coding?.icdO ?? []).length > 0;
    const hasIcdOChange = newIcdOBySpecimenId.has(sp.id) || hadExistingIcdO;
    if (!newCptBySpecimenId.has(sp.id) && !hasIcd10Change && !hasSnomedChange && !hasIcdOChange && !(sp.coding?.cpt ?? []).length) return sp;

    const oldList = [...(sp.coding?.cpt ?? [])];
    const newList = [...(newCptBySpecimenId.get(sp.id) ?? [])];
    const remaining = [...oldList];
    const added: string[] = [];
    for (const code of newList) {
      const idx = remaining.indexOf(code);
      if (idx !== -1) remaining.splice(idx, 1);
      else added.push(code);
    }
    if (added.length) additionsBySpecimen.set(sp.id, added);
    if (remaining.length) removalsBySpecimen.set(sp.id, remaining);

    return {
      ...sp,
      coding: {
        ...(sp.coding ?? {}),
        cpt: newList,
        icd10: hasIcd10Change ? newIcd10BySpecimenId.get(sp.id) : sp.coding?.icd10,
        snomed: hasSnomedChange ? newSnomedBySpecimenId.get(sp.id) : sp.coding?.snomed,
        icdO: hasIcdOChange ? newIcdOBySpecimenId.get(sp.id) : sp.coding?.icdO,
      },
    };
  });

  return {
    newCoding: { icd10: newIcd.map(c => c.code), snomed: newSnomed.map(c => c.code) },
    updatedSpecimens,
    additionsBySpecimen,
    removalsBySpecimen,
  };
}
