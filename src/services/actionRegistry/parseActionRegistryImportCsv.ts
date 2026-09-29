// src/services/actionRegistry/parseActionRegistryImportCsv.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// ActionsTab.tsx's bulk CSV import (Config → Actions → Bulk Import) —
// per-row validation (unknown id, duplicate id within the file,
// blocked Label/Category edits, blocked edits to a disabled action),
// in-file and global keyboard-shortcut collision detection, and
// unchanged-vs-changed detection — was written entirely inline in a
// FileReader.onload callback, with no backing service and no tests.
// Substantial, real business rules with no test coverage anywhere.
//
// This module is the pure parse-and-decide half: given the raw CSV
// text and the current action registry, it returns a structured
// per-line outcome (never a translated string — that's
// ActionsTab.tsx's own job, via i18n) plus the real set of updates to
// actually apply. It performs NO side effects (no service calls, no
// DOM) — the caller applies `updates` and builds its own user-facing
// summary from `outcomes`.
// ─────────────────────────────────────────────────────────────────────────────

import type { SystemAction } from './IActionRegistryService';

export type ActionImportRowOutcome =
  | { kind: 'unknown-id'; line: number; id: string }
  | { kind: 'duplicate-id-in-file'; line: number; id: string }
  | { kind: 'blocked-label-category-change'; line: number; label: string }
  | { kind: 'blocked-disabled'; line: number; label: string }
  | { kind: 'shortcut-duplicate-in-file'; line: number; shortcut: string; label: string }
  | { kind: 'shortcut-reserved'; line: number; shortcut: string; label: string }
  | { kind: 'no-change'; line: number }
  | { kind: 'updated'; line: number; label: string };

export interface ActionRegistryImportUpdate {
  id: string;
  shortcut: string;
  voiceTriggers: string[];
}

export interface ActionRegistryImportResult {
  /** One entry per real, parsed data row (comment lines, the header
   *  row, and any malformed row with fewer than 5 real columns are
   *  silently skipped — same as this pipeline's pre-existing
   *  behavior, not itself an error condition worth reporting). */
  outcomes: ActionImportRowOutcome[];
  /** The real changes to actually apply — every 'updated' outcome has
   *  exactly one corresponding entry here, in the same order. */
  updates: ActionRegistryImportUpdate[];
}

/**
 * Parses a bulk-import CSV (this registry's own exported format —
 * `ID (DO NOT ALTER), Label (READ ONLY), Category (READ ONLY),
 * Shortcut (UNIQUE), Voice Triggers (EDITABLE)`) against the current
 * action registry, and returns the real per-row decision for each
 * data row plus the concrete updates to apply — never mutating
 * `actions` or calling any service itself.
 *
 * Real, deliberate per-row check order (matches this pipeline's
 * pre-existing behavior exactly): unknown id → duplicate id within
 * this file → blocked Label/Category edit → blocked edit to a
 * disabled action → shortcut collision within this file → shortcut
 * already reserved by another action not in this file → real
 * change detection (no-op edits counted separately from real updates).
 */
export function parseActionRegistryImportCsv(content: string, actions: SystemAction[]): ActionRegistryImportResult {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const outcomes: ActionImportRowOutcome[] = [];
  const updates: ActionRegistryImportUpdate[] = [];
  const seenIds = new Set<string>();
  const usedShortcutsInFile = new Map<string, string>(); // shortcut -> label

  lines.forEach((line, index) => {
    const excelRow = index + 1;
    if (line.startsWith('#') || line.toLowerCase().includes('(do not alter)')) return;

    const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (parts.length < 5) return;

    const id = parts[0].replace(/["\s]/g, '');
    const label = parts[1].replace(/"/g, '').trim();
    const category = parts[2].replace(/"/g, '').trim();
    const shortcut = parts[3].replace(/"/g, '').trim().toLowerCase();
    const triggersRaw = parts[4] || '';
    const voiceTriggers = triggersRaw.replace(/"/g, '').split(';').map(trig => trig.trim()).filter(trig => trig !== '');

    const original = actions.find(a => a.id === id);

    // 1. Basic Validations
    if (!original) {
      outcomes.push({ kind: 'unknown-id', line: excelRow, id });
      return;
    }
    if (seenIds.has(id)) {
      outcomes.push({ kind: 'duplicate-id-in-file', line: excelRow, id });
      return;
    }
    if (original.label !== label || original.category !== category) {
      outcomes.push({ kind: 'blocked-label-category-change', line: excelRow, label: original.label });
      return;
    }
    if (!original.isActive) {
      outcomes.push({ kind: 'blocked-disabled', line: excelRow, label: original.label });
      return;
    }

    // 2. Shortcut Collision Detection
    if (shortcut && usedShortcutsInFile.has(shortcut)) {
      outcomes.push({ kind: 'shortcut-duplicate-in-file', line: excelRow, shortcut, label: usedShortcutsInFile.get(shortcut)! });
      return;
    }
    const globalCollision = actions.find(a => a.id !== id && a.shortcut.toLowerCase() === shortcut);
    if (shortcut && globalCollision) {
      outcomes.push({ kind: 'shortcut-reserved', line: excelRow, shortcut, label: globalCollision.label });
      return;
    }

    seenIds.add(id);
    usedShortcutsInFile.set(shortcut, label);

    // 3. Change Detection
    const hasShortcutChanged = original.shortcut.toLowerCase() !== shortcut;
    const hasTriggersChanged = JSON.stringify([...original.voiceTriggers].sort()) !== JSON.stringify([...voiceTriggers].sort());
    if (!hasShortcutChanged && !hasTriggersChanged) {
      outcomes.push({ kind: 'no-change', line: excelRow });
      return;
    }

    updates.push({ id, shortcut, voiceTriggers });
    outcomes.push({ kind: 'updated', line: excelRow, label: original.label });
  });

  return { outcomes, updates };
}
