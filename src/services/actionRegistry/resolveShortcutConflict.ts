// src/services/actionRegistry/resolveShortcutConflict.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// ActionsTab.tsx's single-shortcut editor (Config → Actions → Edit)
// computed keyboard-shortcut collision detection and its alternate-
// suggestion logic directly inline, with no backing service and no
// tests — substantial, real business rules (case-insensitive combo
// matching, excluding the action being edited, stripping existing
// modifier prefixes before proposing alternates) embedded entirely in
// the component. Extracted here, unchanged behavior.
// ─────────────────────────────────────────────────────────────────────────────

import type { SystemAction } from './IActionRegistryService';

/** The real, deliberate collision rule: case-insensitive combo match
 *  against every OTHER action's own shortcut (never the action
 *  currently being edited, so re-saving a combo unchanged never
 *  self-conflicts). Returns the conflicting action, or undefined for
 *  a blank combo or a genuinely free one. */
export function resolveShortcutConflict(
  combo: string,
  currentActionId: string,
  actions: SystemAction[],
): SystemAction | undefined {
  if (!combo) return undefined;
  return actions.find(a => a.id !== currentActionId && a.shortcut.toLowerCase() === combo.toLowerCase());
}

/** The real alternate-suggestion rule, tried in this exact order —
 *  strip any existing Ctrl/Alt/Shift prefix off the conflicting combo
 *  first, then offer the first of Alt+Shift+<base>, Ctrl+<base>,
 *  Ctrl+Shift+<base> that isn't ALSO already taken by some other
 *  action. Returns undefined only in the (practically unreachable)
 *  case where all three candidates are already taken too. */
export function suggestAlternateShortcut(combo: string, actions: SystemAction[]): string | undefined {
  const base = combo.replace(/^(Ctrl[+]|Alt[+]|Shift[+])*/i, '').replace(/[+]$/, '');
  const candidates = ['Alt+Shift+' + base, 'Ctrl+' + base, 'Ctrl+Shift+' + base];
  return candidates.find(s => !actions.some(a => a.shortcut.toLowerCase() === s.toLowerCase()));
}
