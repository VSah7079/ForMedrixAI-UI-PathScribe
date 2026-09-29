// src/services/tatConfig/mockTatTargetService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: this build's TAT targets, kept in the browser under the key the
// TAT settings screen always used ('pathscribe_tat_entries_v2'), so
// existing demo edits carry over and Demo Reset still clears them. With
// nothing stored, the system defaults apply.
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';
import type { TATEntry } from '@/types/quality/TatConfigEntry';
import type { ITatTargetService, TatTargetError } from './ITatTargetService';
import { SYSTEM_DEFAULT_TAT_ENTRIES, isSystemDefaultTatEntryId } from './systemDefaultTatEntries';

export const TAT_TARGET_STORAGE_KEY = 'pathscribe_tat_entries_v2';

function load(): TATEntry[] {
  try {
    const raw = localStorage.getItem(TAT_TARGET_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TATEntry[]) : SYSTEM_DEFAULT_TAT_ENTRIES.map(e => ({ ...e }));
  } catch {
    return SYSTEM_DEFAULT_TAT_ENTRIES.map(e => ({ ...e }));
  }
}

function save(entries: TATEntry[]): void {
  try { localStorage.setItem(TAT_TARGET_STORAGE_KEY, JSON.stringify(entries)); } catch { /* storage unavailable */ }
}

const fail = (error: TatTargetError) => ({ ok: false as const, error });

export const mockTatTargetService: ITatTargetService = {
  async getAll(): Promise<ServiceResult<TATEntry[]>> {
    return { ok: true, data: load() };
  },

  async add(entry) {
    const entries = load();
    if (entries.some(e => e.id === entry.id)) return fail('duplicateId');
    save([...entries, entry]);
    return { ok: true, data: entry };
  },

  async update(entry) {
    const entries = load();
    const idx = entries.findIndex(e => e.id === entry.id);
    if (idx < 0) return fail('notFound');
    const next = [...entries];
    next[idx] = entry;
    save(next);
    return { ok: true, data: entry };
  },

  async remove(id) {
    if (isSystemDefaultTatEntryId(id)) return fail('systemDefault');
    const entries = load();
    if (!entries.some(e => e.id === id)) return fail('notFound');
    save(entries.filter(e => e.id !== id));
    return { ok: true, data: undefined };
  },
};
