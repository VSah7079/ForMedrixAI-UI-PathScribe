// src/hooks/useCaseSpellCheck.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): orchestrates spell checking for one case, for a
// report screen to pass to <SpellCheckProvider>. Decisions live in
// services/spellcheck/ (resolveCaseSpellingContext, customDictionaryRules);
// this hook loads, keeps the Web Worker in sync, and exposes the actions.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { customDictionaryService, facilityService, userService } from '@/services';
import { resolveCasePerformingLabScope } from '@/services/facilities/resolveCasePerformingLabScope';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { resolveAuditActor } from '@/services/participationTypes/saveParticipationType';
import { getSpellCheckClient } from '@/services/spellcheck/SpellCheckClient';
import { customWordsFor, resolveCaseSpellingContext, type CaseSpellingContext } from '@/services/spellcheck/resolveCaseSpellingContext';
import type { CustomWordEntry } from '@/services/spellcheck/customDictionaryRules';
import type { SpellingLocale } from '@/services/spellcheck/spellingLocales';
import type { SpellCheckContextValue } from '@/components/SpellCheck/SpellCheckContext';

export interface CaseSpellCheckInput {
  caseId?: string | null;
  orderingFacilityId?: string | null;
  assignedPathologistId?: string | null;
  caseOverride?: string | null;
  /** Saves the per-case choice; omit on screens that can't save it. */
  saveCaseOverride?: (locale: SpellingLocale | null) => Promise<void>;
}

const deps = {
  getFacility: async (id: string) => {
    const r = await facilityService.getById(id);
    return r.ok ? { id: r.data.id, name: r.data.name, jurisdiction: r.data.jurisdiction } : null;
  },
  getPerformingLabId: async (orderingFacilityId: string) => (await resolveCasePerformingLabScope(orderingFacilityId)).performingLabFacilityId,
  getStaffSpellingPreference: async (staffId: string) => {
    const r = await userService.getById(staffId);
    return r.ok ? r.data.spellingLocale : undefined;
  },
};

export function useCaseSpellCheck(input: CaseSpellCheckInput): SpellCheckContextValue | null {
  const { caseId, orderingFacilityId, assignedPathologistId, caseOverride, saveCaseOverride } = input;
  const session = getSessionUser();
  const userId = session?.id;
  const [ctx, setCtx] = useState<CaseSpellingContext | null>(null);
  const [personal, setPersonal] = useState<CustomWordEntry[]>([]);
  const [facility, setFacility] = useState<CustomWordEntry[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const client = useMemo(() => getSpellCheckClient(), []);
  const saveRef = useRef(saveCaseOverride);
  saveRef.current = saveCaseOverride;

  // Language and facility dictionary for this case.
  useEffect(() => {
    if (!caseId) { setCtx(null); return; }
    let cancelled = false;
    resolveCaseSpellingContext({ orderingFacilityId, assignedPathologistId, caseOverride }, deps)
      .then(c => { if (!cancelled) setCtx(c); });
    return () => { cancelled = true; };
  }, [caseId, orderingFacilityId, assignedPathologistId, caseOverride]);

  // Word lists.
  useEffect(() => {
    if (!userId) return;
    customDictionaryService.listPersonal(userId).then(r => { if (r.ok) setPersonal(r.data); });
  }, [userId]);
  useEffect(() => {
    const id = ctx?.facilityDictionaryId;
    if (!id) { setFacility([]); return; }
    customDictionaryService.listFacility(id).then(r => { if (r.ok) setFacility(r.data); });
  }, [ctx?.facilityDictionaryId]);

  // Keep the worker in step; bump the revision so editors re-check.
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const words = customWordsFor(personal, facility, ignored);
    client.prepare(ctx.locale, words)
      .then(() => client.setCustomWords(words))
      .then(() => { if (!cancelled) { setReady(true); setRevision(r => r + 1); } })
      .catch(e => console.error('[useCaseSpellCheck] spell checker failed to load:', e));
    return () => { cancelled = true; };
  }, [client, ctx, personal, facility, ignored]);

  const actor = useCallback(() => ({ ...resolveAuditActor(getSessionUser()), role: getSessionUser()?.role }), []);

  const addToPersonal = useCallback(async (word: string) => {
    if (!userId) return;
    const r = await customDictionaryService.addPersonal(userId, word, actor());
    if (r.ok) setPersonal(r.data);
  }, [userId, actor]);

  const addToFacility = useCallback(async (word: string) => {
    if (!ctx?.facilityDictionaryId) return false;
    const r = await customDictionaryService.addFacility(ctx.facilityDictionaryId, word, actor(), ctx.facilityDictionaryLabel);
    if (r.ok) setFacility(r.data);
    return r.ok;
  }, [ctx?.facilityDictionaryId, ctx?.facilityDictionaryLabel, actor]);

  const ignore = useCallback((word: string) => setIgnored(list => (list.includes(word) ? list : [...list, word])), []);

  const setCaseLocale = useCallback(async (locale: SpellingLocale | null) => {
    await saveRef.current?.(locale);
  }, []);

  return useMemo(() => (ctx ? {
    locale: ctx.locale,
    source: ctx.source,
    ...(ctx.unavailableChoice ? { unavailableChoice: ctx.unavailableChoice } : {}),
    ...(ctx.facilityDictionaryId ? { facilityDictionaryId: ctx.facilityDictionaryId, facilityDictionaryLabel: ctx.facilityDictionaryLabel } : {}),
    role: session?.role,
    client,
    revision,
    ready,
    addToPersonal,
    addToFacility,
    ignore,
    ...(saveCaseOverride ? { setCaseLocale } : {}),
  } : null), [ctx, session?.role, client, revision, ready, addToPersonal, addToFacility, ignore, saveCaseOverride, setCaseLocale]);
}
