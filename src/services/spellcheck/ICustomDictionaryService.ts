// src/services/spellcheck/ICustomDictionaryService.ts
// PS-342 (Batch 336): personal and facility spelling dictionaries (AC5).
import type { CustomWordEntry, CustomWordRefusal } from './customDictionaryRules';

export type CustomWordResult<T> = { ok: true; data: T } | { ok: false; error: string; code: CustomWordRefusal };

export interface DictionaryActor { userId: string; userName: string; role?: string }

export interface ICustomDictionaryService {
  listPersonal(userId: string): Promise<CustomWordResult<CustomWordEntry[]>>;
  /** Idempotent: adding a word already there returns the list unchanged. */
  addPersonal(userId: string, word: string, actor: DictionaryActor): Promise<CustomWordResult<CustomWordEntry[]>>;
  removePersonal(userId: string, word: string): Promise<CustomWordResult<CustomWordEntry[]>>;
  listFacility(facilityId: string): Promise<CustomWordResult<CustomWordEntry[]>>;
  /** Admin-tier only; takes effect at once and is audited. */
  addFacility(facilityId: string, word: string, actor: DictionaryActor, facilityLabel?: string): Promise<CustomWordResult<CustomWordEntry[]>>;
  removeFacility(facilityId: string, word: string, actor: DictionaryActor, facilityLabel?: string): Promise<CustomWordResult<CustomWordEntry[]>>;
}
