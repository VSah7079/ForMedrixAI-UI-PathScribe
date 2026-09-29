// src/utils/toastPolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 349 (PS-100, Pete: "Complex warning messages in the Toast is hard to
// read and disappears too fast. Perhaps warning messages should be more
// persistent and have the user click off them"): how long a toast stays.
//
//   • Warnings and errors stay until the user closes them.
//   • Any message long enough to need reading (over LONG_MESSAGE_CHARS)
//     stays until closed too, whatever its kind.
//   • Short confirmations ("Draft saved") fade, after a time that grows with
//     the length of the text: 4 s minimum, 9 s maximum.
//
// Used by both toast systems: react-toastify (utils/installToastPolicy.ts,
// installed once in App.tsx, so every toast.* call follows it) and the report
// page's own toast (pages/Synoptic/useSynopticToast.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export const LONG_MESSAGE_CHARS = 120;
export const MIN_TOAST_MS = 4_000;
export const MAX_TOAST_MS = 9_000;
/** Reading time added per character of text. */
export const MS_PER_CHAR = 50;

/** Milliseconds before the toast closes by itself, or null: stays until closed. */
export function toastAutoCloseMs(message: string, kind: ToastKind = 'info'): number | null {
  if (kind === 'warning' || kind === 'error') return null;
  const length = message.trim().length;
  if (length > LONG_MESSAGE_CHARS) return null;
  return Math.min(MAX_TOAST_MS, Math.max(MIN_TOAST_MS, 2_000 + length * MS_PER_CHAR));
}
