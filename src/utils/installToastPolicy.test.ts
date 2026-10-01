// src/utils/installToastPolicy.test.ts — Batch 349 (PS-100)
import { describe, it, expect } from 'vitest';
import type { ToastItem } from 'react-toastify';
import { installToastPolicy } from './installToastPolicy';

function fakeApi() {
  let cb: ((item: ToastItem) => void) | null = null;
  const updates: { id: unknown; autoClose: unknown }[] = [];
  return {
    api: { onChange: (f: (item: ToastItem) => void) => { cb = f; return () => { cb = null; }; }, update: (id: unknown, o: { autoClose?: unknown }) => { updates.push({ id, autoClose: o.autoClose }); } },
    emit: (item: Partial<ToastItem>) => cb?.({ id: 't', status: 'added', data: {}, content: '', ...item } as ToastItem),
    updates,
    subscribed: () => cb !== null,
  };
}

describe('installToastPolicy', () => {
  it('keeps warnings, errors and long messages until closed; short confirmations fade', () => {
    const f = fakeApi();
    installToastPolicy(f.api as never);
    f.emit({ id: 1, type: 'warning', content: 'Short warning' });
    f.emit({ id: 2, type: 'error', content: 'Failed' });
    f.emit({ id: 3, type: 'success', content: 'x'.repeat(200) });
    f.emit({ id: 4, type: 'success', content: 'Saved' });
    expect(f.updates).toEqual([
      { id: 1, autoClose: false }, { id: 2, autoClose: false }, { id: 3, autoClose: false }, { id: 4, autoClose: 4000 },
    ]);
  });

  it('ignores updates and removals, honours an opt-out, and can be uninstalled', () => {
    const f = fakeApi();
    const off = installToastPolicy(f.api as never);
    f.emit({ id: 1, type: 'error', status: 'updated' });
    f.emit({ id: 2, type: 'error', data: { keepAutoClose: true } });
    expect(f.updates).toEqual([]);
    off();
    expect(f.subscribed()).toBe(false);
  });
});
