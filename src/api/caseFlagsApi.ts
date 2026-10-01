// src/api/caseFlagsApi.ts
// Flag operations — delegates to mockCaseService which now persists to localStorage.
// Replace with real API calls when the backend is ready.

import { CaseWithFlags, FlagInstance } from '../types/flagsRuntime';
import { mockCaseService } from '../services/cases/mockCaseService';

// Real, confirmed resolution to the architectural conflict this file
// used to document here (Jira PS-57): Case.caseFlags/Specimen.
// specimenFlags now correctly declare FlagInstance[] — this file's
// own shape all along — rather than the old CaseFlag[]/SpecimenFlag[]
// (an inline flag-definition copy no real application workflow ever
// produced). SearchPage.tsx's own two consumers of these same fields
// fixed alongside this change, resolving flagDefinitionId against the
// real flag catalog instead of expecting display fields inline. The
// `as any` casts this file used to need are gone — they were masking
// exactly this mismatch, not doing anything else.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplyFlagPayload {
  caseId: string;
  flagDefinitionId: string;
  specimenId?: string;
}

export interface DeleteFlagPayload {
  caseId: string;
  flagInstanceId: string;
  specimenId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInstance(flagDefinitionId: string): FlagInstance {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    flagDefinitionId,
    appliedAt: new Date().toISOString(),
    appliedBy: 'current-user',
    source: 'product',
    deletedAt: null,
    deletedBy: null,
  };
}

function toCaseWithFlags(c: any): CaseWithFlags {
  return {
    id: c.id,
    accession: c.accession?.fullAccession ?? c.accession?.accessionNumber ?? c.accession ?? c.id,
    flags: Array.isArray(c.caseFlags) ? c.caseFlags : [],
    specimens: (c.specimens ?? []).map((sp: any) => ({
      ...sp,
      flags: Array.isArray(sp.specimenFlags) ? sp.specimenFlags : [],
    })),
  };
}

// ─── applyFlags ───────────────────────────────────────────────────────────────

export async function applyFlags(payload: ApplyFlagPayload): Promise<CaseWithFlags> {
  const c = await mockCaseService.getCase(payload.caseId);
  if (!c) throw new Error(`Case ${payload.caseId} not found`);

  const inst = makeInstance(payload.flagDefinitionId);

  if (payload.specimenId) {
    const specimens = (c.specimens ?? []).map((sp) => {
      if (sp.id !== payload.specimenId) return sp;
      const flags: FlagInstance[] = Array.isArray(sp.specimenFlags) ? sp.specimenFlags : [];
      if (flags.some(f => f.flagDefinitionId === payload.flagDefinitionId && !f.deletedAt)) return sp;
      return { ...sp, specimenFlags: [...flags, inst] };
    });
    await mockCaseService.updateCase(payload.caseId, { specimens });
  } else {
    const flags: FlagInstance[] = Array.isArray(c.caseFlags) ? c.caseFlags : [];
    if (!flags.some(f => f.flagDefinitionId === payload.flagDefinitionId && !f.deletedAt)) {
      await mockCaseService.updateCase(payload.caseId, { caseFlags: [...flags, inst] });
    }
  }

  const updated = await mockCaseService.getCase(payload.caseId);
  return toCaseWithFlags(updated);
}

// ─── deleteFlags ──────────────────────────────────────────────────────────────

export async function deleteFlags(payload: DeleteFlagPayload): Promise<CaseWithFlags> {
  const c = await mockCaseService.getCase(payload.caseId);
  if (!c) throw new Error(`Case ${payload.caseId} not found`);

  const now = new Date().toISOString();

  if (payload.specimenId) {
    const specimens = (c.specimens ?? []).map((sp) => {
      if (sp.id !== payload.specimenId) return sp;
      const flags: FlagInstance[] = Array.isArray(sp.specimenFlags) ? sp.specimenFlags : [];
      return {
        ...sp,
        specimenFlags: flags.map(f =>
          f.id === payload.flagInstanceId
            ? { ...f, deletedAt: now, deletedBy: 'current-user' }
            : f
        ),
      };
    });
    await mockCaseService.updateCase(payload.caseId, { specimens });
  } else {
    const flags: FlagInstance[] = Array.isArray(c.caseFlags) ? c.caseFlags : [];
    await mockCaseService.updateCase(payload.caseId, {
      caseFlags: flags.map(f =>
        f.id === payload.flagInstanceId
          ? { ...f, deletedAt: now, deletedBy: 'current-user' }
          : f
      ),
    });
  }

  const updated = await mockCaseService.getCase(payload.caseId);
  return toCaseWithFlags(updated);
}
