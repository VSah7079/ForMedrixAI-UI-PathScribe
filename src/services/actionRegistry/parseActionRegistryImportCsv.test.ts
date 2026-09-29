// src/services/actionRegistry/parseActionRegistryImportCsv.test.ts
import { describe, it, expect } from 'vitest';
import { parseActionRegistryImportCsv } from './parseActionRegistryImportCsv';
import type { SystemAction } from './IActionRegistryService';

function makeAction(over: Partial<SystemAction> = {}): SystemAction {
  return {
    id: 'act-print', label: 'Print Label', category: 'printing', shortcut: 'Ctrl+P', internalKey: 'F1+PS001',
    voiceTriggers: ['print label'], learnedTriggers: [], requiredRole: 'any', isActive: true,
    ...over,
  };
}

const HEADER = 'ID (DO NOT ALTER), Label (READ ONLY), Category (READ ONLY), Shortcut (UNIQUE), Voice Triggers (EDITABLE)';

describe('parseActionRegistryImportCsv', () => {
  it('a real change (shortcut edited) produces one "updated" outcome and one matching update', () => {
    const actions = [makeAction()];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+Shift+P","print label"`;
    const { outcomes, updates } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toEqual([{ kind: 'updated', line: 2, label: 'Print Label' }]);
    expect(updates).toEqual([{ id: 'act-print', shortcut: 'ctrl+shift+p', voiceTriggers: ['print label'] }]);
  });

  it('an unchanged row (same shortcut, same triggers) produces "no-change" and no update', () => {
    const actions = [makeAction()];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+P","print label"`;
    const { outcomes, updates } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toEqual([{ kind: 'no-change', line: 2 }]);
    expect(updates).toHaveLength(0);
  });

  it('reordered voice triggers alone do not count as "changed" — compared as a set, not by order', () => {
    const actions = [makeAction({ voiceTriggers: ['print label', 'print this'] })];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+P","print this; print label"`;
    const { outcomes } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toEqual([{ kind: 'no-change', line: 2 }]);
  });

  it('a genuinely unknown id is rejected', () => {
    const csv = `${HEADER}\nact-ghost,"Ghost","printing","Ctrl+G",""`;
    const { outcomes, updates } = parseActionRegistryImportCsv(csv, [makeAction()]);
    expect(outcomes).toEqual([{ kind: 'unknown-id', line: 2, id: 'act-ghost' }]);
    expect(updates).toHaveLength(0);
  });

  it('the SAME id appearing twice in one file is rejected the second time', () => {
    const actions = [makeAction()];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+Shift+P","print label"\nact-print,"Print Label","printing","Ctrl+Alt+P","print label"`;
    const { outcomes } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes[0].kind).toBe('updated');
    expect(outcomes[1]).toEqual({ kind: 'duplicate-id-in-file', line: 3, id: 'act-print' });
  });

  it('editing Label or Category is blocked, even with a real, otherwise-valid shortcut change', () => {
    const actions = [makeAction()];
    const csv = `${HEADER}\nact-print,"Renamed Label","printing","Ctrl+Shift+P","print label"`;
    const { outcomes, updates } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toEqual([{ kind: 'blocked-label-category-change', line: 2, label: 'Print Label' }]);
    expect(updates).toHaveLength(0);
  });

  it('editing a disabled action is blocked, even though isActive isn’t a CSV column at all', () => {
    const actions = [makeAction({ isActive: false })];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+Shift+P","print label"`;
    const { outcomes, updates } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toEqual([{ kind: 'blocked-disabled', line: 2, label: 'Print Label' }]);
    expect(updates).toHaveLength(0);
  });

  it('two rows in the same file claiming the same NEW shortcut collide with each other', () => {
    const actions = [
      makeAction({ id: 'act-print', shortcut: 'Ctrl+P' }),
      makeAction({ id: 'act-close', label: 'Close Case', shortcut: 'Ctrl+W' }),
    ];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+X","print label"\nact-close,"Close Case","printing","Ctrl+X",""`;
    const { outcomes } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes[0].kind).toBe('updated');
    expect(outcomes[1]).toEqual({ kind: 'shortcut-duplicate-in-file', line: 3, shortcut: 'ctrl+x', label: 'Print Label' });
  });

  it('a shortcut already reserved by an action NOT in this file is rejected as a real, global collision', () => {
    const actions = [
      makeAction({ id: 'act-print', shortcut: 'Ctrl+P' }),
      makeAction({ id: 'act-close', label: 'Close Case', shortcut: 'Ctrl+W' }),
    ];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+W","print label"`;
    const { outcomes } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toEqual([{ kind: 'shortcut-reserved', line: 2, shortcut: 'ctrl+w', label: 'Close Case' }]);
  });

  it('comment lines and the header row are silently skipped, not reported as errors', () => {
    const actions = [makeAction()];
    const csv = [
      '# ================================================================================',
      '# pathscribe SYSTEM ACTION REGISTRY - EDITING RULES',
      HEADER,
      'act-print,"Print Label","printing","Ctrl+Shift+P","print label"',
    ].join('\n');
    const { outcomes } = parseActionRegistryImportCsv(csv, actions);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe('updated');
  });

  it('the "# ^ DISABLED" marker row for an inactive action is also silently skipped as a comment', () => {
    const actions = [makeAction({ isActive: false })];
    const csv = `${HEADER}\n# ^ DISABLED — not voice/keyboard-eligible; editing this row's Shortcut/Voice Triggers below will not make it functional.\nact-print,"Print Label","printing","Ctrl+Shift+P","print label"`;
    const { outcomes } = parseActionRegistryImportCsv(csv, actions);
    // Only the real data row produces an outcome (blocked, since the action is inactive) —
    // the comment line above it contributes nothing.
    expect(outcomes).toEqual([{ kind: 'blocked-disabled', line: 3, label: 'Print Label' }]);
  });

  it('a malformed row with fewer than 5 real columns is silently skipped, not reported as an error', () => {
    const csv = `${HEADER}\nact-print,"Print Label","printing"`;
    const { outcomes } = parseActionRegistryImportCsv(csv, [makeAction()]);
    expect(outcomes).toHaveLength(0);
  });

  it('an empty Voice Triggers field results in an empty voiceTriggers array, not [""]', () => {
    const actions = [makeAction({ shortcut: 'Ctrl+P' })];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+Shift+P",""`;
    const { updates } = parseActionRegistryImportCsv(csv, actions);
    expect(updates[0].voiceTriggers).toEqual([]);
  });

  it('multiple semicolon-separated voice triggers are split and trimmed', () => {
    const actions = [makeAction({ shortcut: 'Ctrl+P' })];
    const csv = `${HEADER}\nact-print,"Print Label","printing","Ctrl+Shift+P"," print label ; quick print "`;
    const { updates } = parseActionRegistryImportCsv(csv, actions);
    expect(updates[0].voiceTriggers).toEqual(['print label', 'quick print']);
  });
});
