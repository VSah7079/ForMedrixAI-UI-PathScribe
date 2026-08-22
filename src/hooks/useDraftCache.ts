// src/hooks/useDraftCache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 of the Inactivity Timeout & Draft Recovery spec.
//
// Usage sketch (see SynopticReportPage.tsx for the real, wired usage):
//
//   const { hasExistingDraft, existingDraftPayload, existingDraftSavedAt,
//           confirmRestore, discardDraft } =
//     useDraftCache(user?.id ?? null, caseId, currentFormState);
//
//   // Once hasExistingDraft is true, existingDraftPayload is already
//   // available — compute a diff against currentFormState and show it
//   // (DraftRecoveryModal) BEFORE the user decides anything, rather than
//   // fetching only after they click Restore. If they restore, apply
//   // existingDraftPayload to your own state yourself, then call
//   // confirmRestore() to clear the cache entry. If they discard, call
//   // discardDraft() instead.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { mockDraftCacheService } from '@/services/drafts/mockDraftCacheService';

const DEBOUNCE_MS = 1000; // matches the spec's Drafts:DebounceIntervalMs default

interface UseDraftCacheResult<T> {
  /** True if a draft existed BEFORE this hook started auto-saving (i.e. a
   *  real prior-session draft, not one just created by this mount). Checked
   *  once on mount/entityId-change; does not update afterward. */
  hasExistingDraft: boolean;
  /** The cached payload itself, available as soon as hasExistingDraft is
   *  true — lets the caller compute/show a diff before asking the user
   *  to decide anything. */
  existingDraftPayload: T | null;
  existingDraftSavedAt: string | null;
  /** Call after you've applied existingDraftPayload to your own state —
   *  clears the cache entry so the same draft doesn't prompt again. */
  confirmRestore: () => void;
  /** Clears the cached draft without applying it. */
  discardDraft: () => void;
}

export function useDraftCache<T>(
  userId: string | null,
  entityId: string | null,
  currentState: T,
  enabled: boolean = true,
): UseDraftCacheResult<T> {
  const [hasExistingDraft, setHasExistingDraft]         = useState(false);
  const [existingDraftPayload, setExistingDraftPayload] = useState<T | null>(null);
  const [existingDraftSavedAt, setExistingDraftSavedAt] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Check for a pre-existing draft once per userId+entityId ────────────────
  // Real bug found and fixed here, per direct report: "timeout worked,
  // but no restore dialog appeared on re-entry." Traced precisely — the
  // service call itself always succeeded; the draft was silently lost
  // between finding it and setting state. Root cause: this effect used
  // to guard against re-checking via a `checkedKeyRef` ref, redundant
  // with React's own dependency-array mechanism (which already only
  // re-runs this effect when enabled/userId/entityId genuinely change).
  // That redundant guard actively broke React 18 Strict Mode's
  // mount → cleanup → re-mount cycle (active here — see main.tsx):
  // the first invocation started the real getDraft() call and set the
  // ref; Strict Mode's cleanup marked that same closure `cancelled`;
  // the second, surviving invocation saw the ref already set and
  // skipped calling getDraft() again entirely; the first call's
  // promise then resolved successfully but was discarded because its
  // own closure had been marked cancelled. The draft was being found
  // every time and thrown away every time. Removing the redundant ref
  // guard lets the second, surviving invocation make the real call.
  useEffect(() => {
    if (!enabled || !userId || !entityId) return;

    let cancelled = false;
    mockDraftCacheService.getDraft<T>(userId, entityId).then(res => {
      if (cancelled || !res.ok || !res.data) return;
      setHasExistingDraft(true);
      setExistingDraftPayload(res.data.payload);
      setExistingDraftSavedAt(res.data.savedAt);
    });
    return () => { cancelled = true; };
  }, [enabled, userId, entityId]);

  // ── Debounced auto-save on every currentState change ────────────────────────
  useEffect(() => {
    if (!enabled || !userId || !entityId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mockDraftCacheService.saveDraft(userId, entityId, currentState);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [enabled, userId, entityId, currentState]);

  const confirmRestore = useCallback(() => {
    if (!userId || !entityId) return;
    mockDraftCacheService.clearDraft(userId, entityId);
    setHasExistingDraft(false);
    setExistingDraftPayload(null);
  }, [userId, entityId]);

  const discardDraft = useCallback(() => {
    if (!userId || !entityId) return;
    mockDraftCacheService.clearDraft(userId, entityId);
    setHasExistingDraft(false);
    setExistingDraftPayload(null);
  }, [userId, entityId]);

  return { hasExistingDraft, existingDraftPayload, existingDraftSavedAt, confirmRestore, discardDraft };
}
