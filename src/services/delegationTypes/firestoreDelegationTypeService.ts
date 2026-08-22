// Stub only — real implementation pending backend cutover.
// mockDelegationTypeService.ts is the active implementation; this satisfies the
// service interface's contract so the swap to a real backend is a
// one-line change in services/index.ts when that backend exists.

import {
  collection, doc,
  getDocs, getDoc, setDoc,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { IDelegationTypeService, DelegationType } from './IDelegationTypeService';
import { ServiceResult, ID } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COL = 'delegationTypes';

const ok  = <T>(data: T): ServiceResult<T>    => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

function fromDoc(id: string, data: Record<string, any>): DelegationType {
  return {
    id,
    label:              data.label              ?? '',
    description:        data.description        ?? '',
    transfersOwnership: data.transfersOwnership ?? false,
    requiresNote:       data.requiresNote       ?? false,
    multiAssign:        data.multiAssign        ?? false,
    color:              data.color              ?? '#94a3b8',
    active:             data.active             ?? true,
    isSystem:           data.isSystem           ?? false,
    sortOrder:          data.sortOrder          ?? 999,
    cptHint:            data.cptHint            ?? undefined,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const firestoreDelegationTypeService: IDelegationTypeService = {

  async getAll() {
    try {
      const snap = await getDocs(
        query(collection(db, COL), orderBy('sortOrder', 'asc'))
      );
      return ok(snap.docs.map(d => fromDoc(d.id, d.data())));
    } catch (e: any) {
      return err(e.message ?? 'getAll failed');
    }
  },

  async getActive() {
    try {
      const snap = await getDocs(
        query(collection(db, COL), where('active', '==', true), orderBy('sortOrder', 'asc'))
      );
      return ok(snap.docs.map(d => fromDoc(d.id, d.data())));
    } catch (e: any) {
      return err(e.message ?? 'getActive failed');
    }
  },

  async getById(id: ID) {
    try {
      const snap = await getDoc(doc(db, COL, id));
      if (!snap.exists()) return err(`DelegationType ${id} not found`);
      return ok(fromDoc(snap.id, snap.data()));
    } catch (e: any) {
      return err(e.message ?? 'getById failed');
    }
  },

  async add(dt) {
    try {
      const snap = await getDocs(query(collection(db, COL), orderBy('sortOrder', 'desc')));
      const maxOrder = snap.empty ? 0 : (snap.docs[0].data().sortOrder ?? 0);
      // Real fix, same root cause as mockDelegationTypeService.ts: the
      // caller's real, validated id — what the admin actually saw and
      // could edit on screen — used to be silently discarded in favor
      // of an auto-generated key. Fixed properly for Firestore
      // specifically using the same setDoc(doc(db, COL, explicitId))
      // pattern already established in caseRegistryService.ts, not
      // just changed what add() returns — using addDoc's own
      // auto-generated key while returning a different id back to the
      // caller would create a real, silent mismatch: a later
      // getById(id) for that same id would fail to find the document.
      // Falls back to addDoc's auto-generated key only when no id is
      // given. Not live-tested (no real backend active yet — this
      // file's own header confirms it's a stub pending cutover; see
      // PS-72 Appendix B item 6) — fixed for correctness and
      // consistency with the mock implementation, which IS tested.
      const { id: providedId, ...rest } = dt;
      const payload = {
        ...rest,
        isSystem:  false,
        sortOrder: maxOrder + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (providedId) {
        const ref = doc(db, COL, providedId);
        await setDoc(ref, payload);
        const created = await getDoc(ref);
        return ok(fromDoc(created.id, created.data()!));
      }
      const ref = await addDoc(collection(db, COL), payload);
      const created = await getDoc(ref);
      return ok(fromDoc(created.id, created.data()!));
    } catch (e: any) {
      return err(e.message ?? 'add failed');
    }
  },

  async update(id: ID, changes) {
    try {
      const ref = doc(db, COL, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return err(`DelegationType ${id} not found`);
      // Prevent callers from flipping isSystem
      const { isSystem: _ignored, ...safeChanges } = changes as any;
      await updateDoc(ref, { ...safeChanges, updatedAt: serverTimestamp() });
      const updated = await getDoc(ref);
      return ok(fromDoc(updated.id, updated.data()!));
    } catch (e: any) {
      return err(e.message ?? 'update failed');
    }
  },

  async deactivate(id: ID) {
    return firestoreDelegationTypeService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return firestoreDelegationTypeService.update(id, { active: true });
  },

  async remove(id: ID) {
    try {
      const ref  = doc(db, COL, id);
      const snap = await getDoc(ref);
      if (!snap.exists())       return err(`DelegationType ${id} not found`);
      if (snap.data().isSystem) return err(`Cannot delete system type "${id}"`);
      await deleteDoc(ref);
      return ok(undefined);
    } catch (e: any) {
      return err(e.message ?? 'remove failed');
    }
  },

};
