// src/components/Config/configDirtyGuardContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, minimal bridge (PS-128) between a Config tab's own local "unsaved
// draft" state and ConfigurationPage.tsx's own tab-switch / search-nav /
// voice-nav navigation, which — before this fix — had zero awareness of any
// nested tab's own dirty state and would silently discard in-progress edits.
//
// Deliberately NOT a general "any Config screen can register under any key"
// registry: ConfigurationPage.tsx's own renderActiveTab() only ever mounts
// ONE tab at a time, so there is only ever one real "current tab" whose
// dirty state could matter to an outgoing navigation. A single shared
// setDirty(boolean) is enough; there's no second tab around to collide with.
//
// This is opt-in, not automatic. A tab that never calls setDirty(true) is
// simply never dirty from ConfigurationPage.tsx's point of view — today
// that's every Config tab except Macros (see MacroPanel.tsx, the first real
// consumer). The other ~30 Config admin screens (dictionaries, routing
// rules, etc.) each manage their own add/edit state inside their own
// modal-based CRUD flows rather than an inline, page-persistent draft the
// way Macros/Protocols-review do, so this page-level guard genuinely
// doesn't apply to them the same way — a real, disclosed scope limit, not
// an oversight. See PS-128's own Jira comment for the full account.
//
// Real, deliberate default: a component that calls useConfigDirtyGuard()
// outside of ConfigurationPage's own provider (e.g. a unit test that mounts
// MacroPanel standalone, or some future route that reuses MacroPanel
// elsewhere) gets a harmless no-op setDirty rather than a thrown error —
// there's simply no page-level guard to report to in that case.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from 'react';

export interface ConfigDirtyGuardContextValue {
  /** Called by the currently-active tab whenever its own local unsaved-draft state changes. */
  setDirty: (dirty: boolean) => void;
}

const noopContextValue: ConfigDirtyGuardContextValue = { setDirty: () => {} };

export const ConfigDirtyGuardContext = createContext<ConfigDirtyGuardContextValue>(noopContextValue);

export function useConfigDirtyGuard(): ConfigDirtyGuardContextValue {
  return useContext(ConfigDirtyGuardContext);
}
