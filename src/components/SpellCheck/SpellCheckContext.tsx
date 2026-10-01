// src/components/SpellCheck/SpellCheckContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): the spell-check context a report screen provides.
// The report editor (PathScribeEditor) and SpellCheckedTextarea read it;
// outside a provider they fall back to the browser's own spell check, so
// admin screens and other non-report text are unaffected.
// The value comes from hooks/useCaseSpellCheck.ts.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext } from 'react';
import type { SpellCheckClient } from '@/services/spellcheck/SpellCheckClient';
import type { SpellingLocale } from '@/services/spellcheck/spellingLocales';
import type { SpellingLocaleSource } from '@/services/spellcheck/resolveSpellingLocale';

export interface SpellCheckContextValue {
  locale: SpellingLocale;
  source: SpellingLocaleSource;
  /** A higher-priority choice that couldn't be used (no dictionary). */
  unavailableChoice?: SpellingLocale;
  facilityDictionaryId?: string;
  facilityDictionaryLabel?: string;
  /** The signed-in user's role, for the facility-dictionary permission. */
  role?: string;
  client: SpellCheckClient;
  /** Changes whenever the language or the word lists change; editors re-check. */
  revision: number;
  /** False until the language and word lists have loaded. */
  ready: boolean;
  addToPersonal(word: string): Promise<void>;
  /** Resolves false when refused (not permitted / no facility). */
  addToFacility(word: string): Promise<boolean>;
  ignore(word: string): void;
  /** Present when the screen can save a per-case language choice; null clears it. */
  setCaseLocale?(locale: SpellingLocale | null): Promise<void>;
}

const Ctx = createContext<SpellCheckContextValue | null>(null);

export const SpellCheckProvider: React.FC<{ value: SpellCheckContextValue | null; children: React.ReactNode }> = ({ value, children }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

/** The screen's spell-check context, or null outside a report screen. */
export function useSpellCheckContext(): SpellCheckContextValue | null {
  return useContext(Ctx);
}
