// src/services/spellcheck/mockCustomDictionaryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): mock-phase storage for personal and facility spelling
// dictionaries (localStorage via mockStorage; SQL Server behind the API in
// production). Rules are in customDictionaryRules.ts. Facility changes are
// audited; personal words are not (they affect only their owner).
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import { mockAuditService } from '../auditlog/mockAuditService';
import type { ICustomDictionaryService, CustomWordResult } from './ICustomDictionaryService';
import {
  canManageFacilityDictionary, facilityDictionaryAuditEntry, normalizeCustomWord, withCustomWord, withoutCustomWord,
  type CustomWordEntry, type CustomWordRefusal,
} from './customDictionaryRules';

export const PERSONAL_WORDS_KEY = 'spelling_personal_words_v1';
export const FACILITY_WORDS_KEY = 'spelling_facility_words_v1';

type Store = Record<string, CustomWordEntry[]>;

const MESSAGES: Record<CustomWordRefusal, string> = {
  EMPTY: 'Enter a word.',
  NOT_A_WORD: 'Only a single word can be added.',
  TOO_LONG: 'That word is too long.',
  NOT_PERMITTED: 'Only an administrator can change the facility dictionary.',
  NOT_FOUND: 'That word is not in the dictionary.',
};
const refuse = <T>(code: CustomWordRefusal): CustomWordResult<T> => ({ ok: false, code, error: MESSAGES[code] });
const ok = <T>(data: T): CustomWordResult<T> => ({ ok: true, data });

const read = (key: string) => storageGet<Store>(key, {});
const write = (key: string, store: Store) => storageSet(key, store);

export const mockCustomDictionaryService: ICustomDictionaryService = {
  async listPersonal(userId) {
    return ok(read(PERSONAL_WORDS_KEY)[userId] ?? []);
  },

  async addPersonal(userId, raw, actor) {
    const n = normalizeCustomWord(raw);
    if (n.ok === false) return refuse(n.code);
    const store = read(PERSONAL_WORDS_KEY);
    const { list } = withCustomWord(store[userId] ?? [], { word: n.word, addedBy: { userId: actor.userId, userName: actor.userName }, addedAt: new Date().toISOString() });
    write(PERSONAL_WORDS_KEY, { ...store, [userId]: list });
    return ok(list);
  },

  async removePersonal(userId, word) {
    const store = read(PERSONAL_WORDS_KEY);
    const { list, removed } = withoutCustomWord(store[userId] ?? [], word);
    if (!removed) return refuse('NOT_FOUND');
    write(PERSONAL_WORDS_KEY, { ...store, [userId]: list });
    return ok(list);
  },

  async listFacility(facilityId) {
    return ok(read(FACILITY_WORDS_KEY)[facilityId] ?? []);
  },

  async addFacility(facilityId, raw, actor, facilityLabel) {
    if (!canManageFacilityDictionary(actor.role)) return refuse('NOT_PERMITTED');
    const n = normalizeCustomWord(raw);
    if (n.ok === false) return refuse(n.code);
    const store = read(FACILITY_WORDS_KEY);
    const { list, added } = withCustomWord(store[facilityId] ?? [], { word: n.word, addedBy: { userId: actor.userId, userName: actor.userName }, addedAt: new Date().toISOString() });
    if (added) {
      write(FACILITY_WORDS_KEY, { ...store, [facilityId]: list });
      await mockAuditService.logEvent(facilityDictionaryAuditEntry('added', n.word, facilityLabel ?? facilityId, actor.userName, facilityId));
    }
    return ok(list);
  },

  async removeFacility(facilityId, word, actor, facilityLabel) {
    if (!canManageFacilityDictionary(actor.role)) return refuse('NOT_PERMITTED');
    const store = read(FACILITY_WORDS_KEY);
    const { list, removed } = withoutCustomWord(store[facilityId] ?? [], word);
    if (!removed) return refuse('NOT_FOUND');
    write(FACILITY_WORDS_KEY, { ...store, [facilityId]: list });
    await mockAuditService.logEvent(facilityDictionaryAuditEntry('removed', word, facilityLabel ?? facilityId, actor.userName, facilityId));
    return ok(list);
  },
};
