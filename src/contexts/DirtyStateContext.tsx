// src/contexts/DirtyStateContext.tsx

import { createContext, useContext } from 'react';

interface DirtyStateContextValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  requestNavigate: (path: string, onProceed: (path: string) => void) => void;
  pendingPath: string | null;
  confirmNavigate: () => void;
  cancelNavigate: () => void;
  /**
   * Real feature, per direct follow-up: "Unsaved Data Present...
   * 1. Save & Switch: Flushes pending dictation/synoptic data..."
   * Whatever page currently owns the real, unsaved draft (today,
   * only SynopticReportPage.tsx) registers its own real save
   * function here — the same underlying saveDraftInternal() every
   * other real save trigger on that page already uses, not a second,
   * parallel save path invented for station-switching specifically.
   * A global handler (useGlobalStationSwitch.ts) with no page-
   * specific knowledge at all can then call whatever's currently
   * registered, or do nothing if nothing is (isDirty would be false
   * in that case anyway — nothing to save).
   */
  registerSaveHandler: (fn: (() => Promise<boolean>) | null) => void;
  /** Real, deliberate design: a getter, not the function value itself
   *  — the registered handler can change across renders (e.g. a new
   *  useCallback identity), and a caller reading this only at the
   *  moment a real scan comes in must always get the CURRENT one, not
   *  a stale closure captured whenever it last subscribed. */
  getSaveHandler: () => (() => Promise<boolean>) | null;
  /** Real feature, per direct follow-up: "2. Discard & Switch: Clears
   *  uncommitted entries and switches context." Same real
   *  registration pattern as the save handler — the real, existing
   *  discardDraft() (useDraftCache.ts), not a second, invented
   *  discard path. */
  registerDiscardHandler: (fn: (() => void) | null) => void;
  getDiscardHandler: () => (() => void) | null;
}

export const DirtyStateContext = createContext<DirtyStateContextValue>({
  isDirty: false,
  setDirty: () => {},
  requestNavigate: (_path, onProceed) => onProceed(_path),
  pendingPath: null,
  confirmNavigate: () => {},
  cancelNavigate: () => {},
  registerSaveHandler: () => {},
  getSaveHandler: () => null,
  registerDiscardHandler: () => {},
  getDiscardHandler: () => null,
});

export function useDirtyState() {
  return useContext(DirtyStateContext);
}
