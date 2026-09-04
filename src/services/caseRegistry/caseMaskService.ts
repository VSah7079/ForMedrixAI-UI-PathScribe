// src/services/caseRegistry/caseMaskService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Stub only — real implementation pending backend cutover.
// mockCaseMaskService.ts is the active implementation; this satisfies
// ICaseMaskService's contract so the swap to a real backend is a
// one-line change wherever the active service is selected, matching the
// same relationship FirestoreCaseService.ts has to mockCaseService.ts.
//
// Real, per direct guidance: replaces caseRegistryService.ts's own
// organisationId-keyed collection with the new, simpler scope model —
// confirmed directly before rebuilding this file specifically (not
// just the mock): the prior Firestore version had already drifted
// behind the mock's own feature set (no department override, no
// site-independent-sequence, no {CAT}/{DEPT} tokens) before this pass,
// so it's rebuilt from the new ICaseMaskService contract directly
// rather than patched forward from its own, already-stale state.
//
// Collection layout
// ─────────────────
//  /caseMasks/{scopeType}::{scopeId} — one CaseMask document per real
//  scope point (a Department, a performing-lab Facility, or the
//  Facility where isEnterprise is true).
//
// Uses the shared `db` instance from '@/firebase' rather than calling
// getFirestore() per method — same deliberate choice as
// caseRegistryService.ts's own predecessor for this exact reason:
// allocateNextCaseNumber runs inside a runTransaction callback, and a
// single shared db instance is the more conventional pattern for that.
// ─────────────────────────────────────────────────────────────────────────────
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '@/firebase';
import type { ServiceResult } from '../types';
import {
  CaseMask, CaseMaskScopeType, DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, DEFAULT_FALLBACK_SEQUENCE_DIGITS,
} from '@/types/config/CaseMask';
import type { ICaseMaskService } from './ICaseMaskService';
import type { CaseMaskScopeCandidate } from './resolveCaseMaskScopeCandidates';
import { getFacilityDateParts } from '@/utils/facilityTime';

const COLLECTION_NAME = 'caseMasks';

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

function keyFor(scopeType: CaseMaskScopeType, scopeId: string): string {
  return `${scopeType}::${scopeId}`;
}

function renderMask(pattern: string, prefix: string, seq: number, sequenceDigits: number, timezone: string): string {
  const { year: year4num } = getFacilityDateParts(new Date(), timezone);
  const year4 = String(year4num);
  const year2 = year4.slice(-2);

  return pattern
    .split('{PREFIX}').join(prefix)
    .split('{YEAR:4}').join(year4)
    .split('{YEAR:2}').join(year2)
    .replace(/\{SEQ:(\d+)\}/, (_m, digits) => String(seq).padStart(Number(digits) || sequenceDigits, '0'));
}

function needsAnnualReset(mask: Pick<CaseMask, 'resetSequenceAnnually' | 'lastResetYear'>, timezone: string): boolean {
  const { year: currentYear } = getFacilityDateParts(new Date(), timezone);
  return mask.resetSequenceAnnually && (!mask.lastResetYear || mask.lastResetYear < currentYear);
}

export const caseMaskService: ICaseMaskService = {
  async getMask(scopeType, scopeId) {
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, keyFor(scopeType, scopeId)));
      return ok(snap.exists() ? (snap.data() as CaseMask) : null);
    } catch (e) {
      return err(`caseMaskService.getMask failed for ${scopeType}:${scopeId}: ${(e as Error).message}`);
    }
  },

  async getAllMasks() {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      return ok(snap.docs.map(d => d.data() as CaseMask));
    } catch (e) {
      return err(`caseMaskService.getAllMasks failed: ${(e as Error).message}`);
    }
  },

  async saveMask(mask) {
    try {
      const record: CaseMask = { ...mask, id: mask.scopeId, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, COLLECTION_NAME, keyFor(mask.scopeType, mask.scopeId)), record);
      return ok(record);
    } catch (e) {
      return err(`caseMaskService.saveMask failed for ${mask.scopeType}:${mask.scopeId}: ${(e as Error).message}`);
    }
  },

  async deleteMask(scopeType, scopeId) {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, keyFor(scopeType, scopeId)));
      return ok(undefined);
    } catch (e) {
      return err(`caseMaskService.deleteMask failed for ${scopeType}:${scopeId}: ${(e as Error).message}`);
    }
  },

  async allocateNextCaseNumber(candidates: CaseMaskScopeCandidate[], timezone) {
    try {
      const result = await runTransaction(db, async (transaction) => {
        // Real read of every real candidate up front — Firestore
        // transactions require all reads before any write, so the
        // "try each candidate in order, use the first real one"
        // resolution has to happen against these snapshots, not via
        // sequential getDoc calls the way a non-transactional caller
        // could.
        const snaps = await Promise.all(
          candidates.map(c => transaction.get(doc(db, COLLECTION_NAME, keyFor(c.scopeType, c.scopeId))))
        );
        const effectiveIndex = snaps.findIndex(s => s.exists());

        if (effectiveIndex === -1) {
          console.info(
            `[caseMaskService] No CaseMask defined for any real scope (${candidates.map(c => `${c.scopeType}:${c.scopeId}`).join(', ') || 'none resolved'}) — using default fallback scheme (${DEFAULT_FALLBACK_MASK}).`
          );
          const fallbackRef = doc(db, COLLECTION_NAME, keyFor('enterprise', '__fallback__'));
          const fallbackSnap = await transaction.get(fallbackRef);
          const fallback = fallbackSnap.exists() ? (fallbackSnap.data() as CaseMask) : undefined;
          const nextSeq = needsAnnualReset(fallback ?? { resetSequenceAnnually: true }, timezone) ? 1 : (fallback?.currentSequence ?? 0) + 1;
          const { year: resetYear } = getFacilityDateParts(new Date(), timezone);
          transaction.set(fallbackRef, {
            id: '__fallback__', scopeType: 'enterprise', scopeId: '__fallback__',
            prefix: DEFAULT_FALLBACK_PREFIX, maskPattern: DEFAULT_FALLBACK_MASK, sequenceDigits: DEFAULT_FALLBACK_SEQUENCE_DIGITS,
            currentSequence: nextSeq, resetSequenceAnnually: true, lastResetYear: resetYear,
            updatedBy: 'system', updatedAt: new Date().toISOString(),
          });
          return renderMask(DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, nextSeq, DEFAULT_FALLBACK_SEQUENCE_DIGITS, timezone);
        }

        const effective = snaps[effectiveIndex].data() as CaseMask;
        const effectiveCandidate = candidates[effectiveIndex];
        const nextSeq = needsAnnualReset(effective, timezone) ? 1 : effective.currentSequence + 1;
        const { year: resetYear } = getFacilityDateParts(new Date(), timezone);

        transaction.update(doc(db, COLLECTION_NAME, keyFor(effectiveCandidate.scopeType, effectiveCandidate.scopeId)), {
          currentSequence: nextSeq,
          lastResetYear: resetYear,
          updatedAt: new Date().toISOString(),
        });

        return renderMask(effective.maskPattern, effective.prefix, nextSeq, effective.sequenceDigits, timezone);
      });

      return ok(result);
    } catch (e) {
      return err(`caseMaskService.allocateNextCaseNumber failed: ${(e as Error).message}`);
    }
  },

  async previewNextCaseNumber(candidates, timezone) {
    try {
      for (const c of candidates) {
        const snap = await getDoc(doc(db, COLLECTION_NAME, keyFor(c.scopeType, c.scopeId)));
        if (snap.exists()) {
          const mask = snap.data() as CaseMask;
          const nextSeq = needsAnnualReset(mask, timezone) ? 1 : mask.currentSequence + 1;
          return ok(renderMask(mask.maskPattern, mask.prefix, nextSeq, mask.sequenceDigits, timezone));
        }
      }
      const fallbackSnap = await getDoc(doc(db, COLLECTION_NAME, keyFor('enterprise', '__fallback__')));
      const fallback = fallbackSnap.exists() ? (fallbackSnap.data() as CaseMask) : undefined;
      const nextSeq = needsAnnualReset(fallback ?? { resetSequenceAnnually: true }, timezone) ? 1 : (fallback?.currentSequence ?? 0) + 1;
      return ok(renderMask(DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, nextSeq, DEFAULT_FALLBACK_SEQUENCE_DIGITS, timezone));
    } catch (e) {
      return err(`caseMaskService.previewNextCaseNumber failed: ${(e as Error).message}`);
    }
  },
};
