// src/services/actionRegistry/resolveShortcutConflict.test.ts
import { describe, it, expect } from 'vitest';
import { resolveShortcutConflict, suggestAlternateShortcut } from './resolveShortcutConflict';
import type { SystemAction } from './IActionRegistryService';

function makeAction(over: Partial<SystemAction> = {}): SystemAction {
  return {
    id: 'act-1', label: 'Print Label', category: 'printing', shortcut: 'Ctrl+P', internalKey: 'F1+PS001',
    voiceTriggers: [], learnedTriggers: [], requiredRole: 'any', isActive: true,
    ...over,
  };
}

describe('resolveShortcutConflict', () => {
  it('returns undefined for a blank combo', () => {
    expect(resolveShortcutConflict('', 'act-1', [makeAction()])).toBeUndefined();
  });

  it('returns undefined when no other action uses this combo', () => {
    const actions = [makeAction({ id: 'act-1', shortcut: 'Ctrl+P' })];
    expect(resolveShortcutConflict('Ctrl+W', 'act-1', actions)).toBeUndefined();
  });

  it('never conflicts with the action currently being edited, even if the combo is unchanged', () => {
    const actions = [makeAction({ id: 'act-1', shortcut: 'Ctrl+P' })];
    expect(resolveShortcutConflict('Ctrl+P', 'act-1', actions)).toBeUndefined();
  });

  it('finds a real conflict with a DIFFERENT action using the same combo', () => {
    const actions = [
      makeAction({ id: 'act-1', shortcut: 'Ctrl+P' }),
      makeAction({ id: 'act-2', shortcut: 'Ctrl+W', label: 'Close Case' }),
    ];
    const conflict = resolveShortcutConflict('Ctrl+W', 'act-1', actions);
    expect(conflict?.id).toBe('act-2');
  });

  it('matches case-insensitively', () => {
    const actions = [makeAction({ id: 'act-2', shortcut: 'ctrl+w' })];
    const conflict = resolveShortcutConflict('CTRL+W', 'act-1', actions);
    expect(conflict?.id).toBe('act-2');
  });
});

describe('suggestAlternateShortcut', () => {
  it('offers Alt+Shift+<base> first when it is free', () => {
    const actions = [makeAction({ id: 'act-2', shortcut: 'Ctrl+W' })];
    expect(suggestAlternateShortcut('Ctrl+W', actions)).toBe('Alt+Shift+W');
  });

  it('strips an existing modifier prefix before building the base key', () => {
    const actions = [makeAction({ id: 'act-2', shortcut: 'Alt+Shift+W' })];
    // Alt+Shift+W is already taken, so the next candidate (Ctrl+W) should be offered,
    // built from the real bare base key "W", not "Alt+Shift+W" itself.
    expect(suggestAlternateShortcut('Alt+Shift+W', actions)).toBe('Ctrl+W');
  });

  it('falls through to Ctrl+<base> when Alt+Shift+<base> is already taken', () => {
    const actions = [
      makeAction({ id: 'act-2', shortcut: 'Alt+Shift+W' }),
    ];
    expect(suggestAlternateShortcut('W', actions)).toBe('Ctrl+W');
  });

  it('falls through to Ctrl+Shift+<base> when both earlier candidates are taken', () => {
    const actions = [
      makeAction({ id: 'act-2', shortcut: 'Alt+Shift+W' }),
      makeAction({ id: 'act-3', shortcut: 'Ctrl+W' }),
    ];
    expect(suggestAlternateShortcut('W', actions)).toBe('Ctrl+Shift+W');
  });

  it('returns undefined when every candidate is already taken', () => {
    const actions = [
      makeAction({ id: 'act-2', shortcut: 'Alt+Shift+W' }),
      makeAction({ id: 'act-3', shortcut: 'Ctrl+W' }),
      makeAction({ id: 'act-4', shortcut: 'Ctrl+Shift+W' }),
    ];
    expect(suggestAlternateShortcut('W', actions)).toBeUndefined();
  });

  it('matches candidate collisions case-insensitively', () => {
    const actions = [makeAction({ id: 'act-2', shortcut: 'alt+shift+w' })];
    expect(suggestAlternateShortcut('W', actions)).toBe('Ctrl+W');
  });
});
