// src/utils/installToastPolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 349 (PS-100): applies utils/toastPolicy.ts to every react-toastify
// toast in the app, in one place. When a toast is added, warnings, errors and
// long messages are switched to "stay until closed" (click it or its ×);
// short confirmations get a reading time that grows with their length. The
// ~50 existing toast.success / toast.error / toast.warning calls need no
// change, and new ones follow the rule automatically. A caller that sets its
// own autoClose on a toast still gets this rule; set `data: { keepAutoClose:
// true }` to opt out.
// Called once from App.tsx; the toast API is passed in so it's testable.
// ─────────────────────────────────────────────────────────────────────────────

import type { Id, ToastItem, UpdateOptions } from 'react-toastify';
import { toastAutoCloseMs, type ToastKind } from './toastPolicy';

export interface ToastApiLike {
  onChange(cb: (item: ToastItem) => void): () => void;
  update(id: Id, options: UpdateOptions): void;
}

const KIND: Record<string, ToastKind> = { success: 'success', info: 'info', warning: 'warning', error: 'error', default: 'info' };

export function installToastPolicy(api: ToastApiLike): () => void {
  return api.onChange(item => {
    if (item.status !== 'added') return;
    if ((item.data as { keepAutoClose?: boolean } | undefined)?.keepAutoClose) return;
    const kind = KIND[item.type ?? 'default'] ?? 'info';
    const text = typeof item.content === 'string' ? item.content : '';
    const ms = toastAutoCloseMs(text, kind);
    api.update(item.id, { autoClose: ms === null ? false : ms });
  });
}
