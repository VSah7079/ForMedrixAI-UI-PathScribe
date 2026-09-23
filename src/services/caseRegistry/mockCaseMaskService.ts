// src/services/caseRegistry/mockCaseMaskService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Active implementation of ICaseMaskService — same relationship to
// caseMaskService.ts (Firestore) as mockCaseService.ts has to
// FirestoreCaseService.ts: this is what the running app actually uses
// today; the Firestore version is the pending-cutover target.
//
// Real, per direct guidance: replaces mockCaseRegistryService.ts's own
// organisationId-scoped seed data — confirmed directly, the old
// DVMC/MFT/MPA/HFHS CaseMaskConfig demo records have no real Facility
// counterpart anywhere in mockFacilityService.ts's own seed data (two
// entirely separate, independently-invented demo datasets), so there's
// no honest way to carry them forward as real CaseMask records at a
// real scope — those simply lapse.
//
// The three real, existing Department records DO carry forward,
// though: mockDepartmentService.ts's own Surgical Tissue / Fluid-
// Cytology / Histology-Only-Consultation seed data used to carry
// accessionPrefix/numberSeries directly on the Department record
// itself (S/SURGICAL, NG/CYTOLOGY_NONGYN, CS/CONSULTATION) — real,
// thoughtful demo data, not placeholder — so it's preserved here as
// real, standalone CaseMask records at scopeType: 'department'
// instead, losslessly, rather than discarded along with the fields
// that used to hold it.
// ─────────────────────────────────────────────────────────────────────────────
import { ICaseMaskService } from './ICaseMaskService';
import type { CaseMaskScopeCandidate } from './resolveCaseMaskScopeCandidates';
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import {
  CaseMask, CaseMaskScopeType, DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, DEFAULT_FALLBACK_SEQUENCE_DIGITS,
} from '@/types/config/CaseMask';
import { getFacilityDateParts } from '@/utils/facilityTime';
import { renderCaseMask as renderMask } from './renderCaseMask';

const STORAGE_KEY = 'ps_case_masks_v1';

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });
const nowIso = () => new Date().toISOString();

function keyFor(scopeType: CaseMaskScopeType, scopeId: string): string {
  return `${scopeType}::${scopeId}`;
}

// ─── Seed data — real departments carried forward from Department's own
// former accessionPrefix/numberSeries fields ────────────────────────────
const SEED: Record<string, CaseMask> = {
  [keyFor('department', 'cat-surgical-tissue')]: {
    id: 'cat-surgical-tissue', scopeType: 'department', scopeId: 'cat-surgical-tissue',
    prefix: 'S', maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: 4,
    currentSequence: 0, resetSequenceAnnually: true, lastResetYear: 2026,
    updatedBy: 'system', updatedAt: nowIso(),
  },
  [keyFor('department', 'cat-fluid-cytology')]: {
    id: 'cat-fluid-cytology', scopeType: 'department', scopeId: 'cat-fluid-cytology',
    prefix: 'NG', maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: 4,
    currentSequence: 0, resetSequenceAnnually: true, lastResetYear: 2026,
    updatedBy: 'system', updatedAt: nowIso(),
  },
  [keyFor('department', 'cat-histology-only')]: {
    id: 'cat-histology-only', scopeType: 'department', scopeId: 'cat-histology-only',
    prefix: 'CS', maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: 4,
    currentSequence: 0, resetSequenceAnnually: true, lastResetYear: 2026,
    updatedBy: 'system', updatedAt: nowIso(),
  },
};

function load(): Record<string, CaseMask> {
  return storageGet<Record<string, CaseMask>>(STORAGE_KEY, SEED);
}
function persist(masks: Record<string, CaseMask>): void {
  storageSet(STORAGE_KEY, masks);
}

function needsAnnualReset(mask: Pick<CaseMask, 'resetSequenceAnnually' | 'lastResetYear'>, timezone: string): boolean {
  const { year: currentYear } = getFacilityDateParts(new Date(), timezone);
  return mask.resetSequenceAnnually && (!mask.lastResetYear || mask.lastResetYear < currentYear);
}

/** Finds the first real, defined CaseMask among the given candidates,
 *  in the order the caller supplied (most-specific first, per
 *  resolveCaseMaskScopeCandidates.ts). Pure lookup against already-
 *  loaded storage — no I/O of its own, so allocate/preview can share
 *  it without either paying for a second real load. */
function findEffectiveMask(candidates: CaseMaskScopeCandidate[], masks: Record<string, CaseMask>): CaseMask | undefined {
  for (const c of candidates) {
    const found = masks[keyFor(c.scopeType, c.scopeId)];
    if (found) return found;
  }
  return undefined;
}

export const mockCaseMaskService: ICaseMaskService = {
  async getMask(scopeType, scopeId) {
    const masks = load();
    return ok(masks[keyFor(scopeType, scopeId)] ?? null);
  },

  async getAllMasks() {
    const masks = load();
    return ok(Object.values(masks));
  },

  async saveMask(mask) {
    const masks = load();
    const key = keyFor(mask.scopeType, mask.scopeId);
    masks[key] = { ...mask, id: mask.scopeId, updatedAt: nowIso() };
    persist(masks);
    return ok(masks[key]);
  },

  async deleteMask(scopeType, scopeId) {
    const masks = load();
    const key = keyFor(scopeType, scopeId);
    if (!masks[key]) return err(`No CaseMask defined for ${scopeType}:${scopeId}`);
    delete masks[key];
    persist(masks);
    return ok(undefined);
  },

  async allocateNextCaseNumber(candidates, timezone) {
    const masks = load();
    const effective = findEffectiveMask(candidates, masks);

    if (!effective) {
      console.info(
        `[caseMask] No CaseMask defined for any real scope (${candidates.map(c => `${c.scopeType}:${c.scopeId}`).join(', ') || 'none resolved'}) — using default fallback scheme (${DEFAULT_FALLBACK_MASK}).`
      );
      // Same real, org-namespace-free fallback the old system used
      // when nothing was configured — a single, shared fallback
      // counter for every genuinely unconfigured case. Real, honest
      // limitation carried forward unchanged: two different,
      // unconfigured cases share this one counter, same as before.
      const fallbackKey = keyFor('enterprise', '__fallback__');
      const existing = masks[fallbackKey];
      const nextSeq = needsAnnualReset(existing ?? { resetSequenceAnnually: true }, timezone) ? 1 : (existing?.currentSequence ?? 0) + 1;
      const { year: resetYear } = getFacilityDateParts(new Date(), timezone);
      masks[fallbackKey] = {
        id: '__fallback__', scopeType: 'enterprise', scopeId: '__fallback__',
        prefix: DEFAULT_FALLBACK_PREFIX, maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: DEFAULT_FALLBACK_SEQUENCE_DIGITS,
        currentSequence: nextSeq, resetSequenceAnnually: true, lastResetYear: resetYear,
        updatedBy: 'system', updatedAt: nowIso(),
      };
      persist(masks);
      return ok(renderMask(DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, nextSeq, DEFAULT_FALLBACK_SEQUENCE_DIGITS, timezone));
    }

    const nextSeq = needsAnnualReset(effective, timezone) ? 1 : effective.currentSequence + 1;
    const { year: resetYear } = getFacilityDateParts(new Date(), timezone);
    masks[keyFor(effective.scopeType, effective.scopeId)] = { ...effective, currentSequence: nextSeq, lastResetYear: resetYear, updatedAt: nowIso() };
    persist(masks);

    return ok(renderMask(effective.maskPattern, effective.prefix, nextSeq, effective.sequenceDigits, timezone));
  },

  async previewNextCaseNumber(candidates, timezone) {
    const masks = load();
    const effective = findEffectiveMask(candidates, masks);

    if (!effective) {
      const fallbackExisting = masks[keyFor('enterprise', '__fallback__')];
      const nextSeq = needsAnnualReset(fallbackExisting ?? { resetSequenceAnnually: true }, timezone) ? 1 : (fallbackExisting?.currentSequence ?? 0) + 1;
      return ok(renderMask(DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, nextSeq, DEFAULT_FALLBACK_SEQUENCE_DIGITS, timezone));
    }

    const nextSeq = needsAnnualReset(effective, timezone) ? 1 : effective.currentSequence + 1;
    return ok(renderMask(effective.maskPattern, effective.prefix, nextSeq, effective.sequenceDigits, timezone));
  },
};
