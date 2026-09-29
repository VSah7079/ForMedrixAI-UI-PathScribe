// src/pages/Synoptic/useSynopticToast.ts
// The report page's own toast (SaveToast). Batch 349 (PS-100): it used to
// show every message, warnings and failures included, for 2.2 seconds with
// a green check. Now each message has a kind, and follows the app's toast
// rule (utils/toastPolicy.ts): warnings, errors and long messages stay until
// the user closes them; short confirmations fade after a reading time.
import { useState, useCallback, useRef, useEffect } from 'react';
import { toastAutoCloseMs, type ToastKind } from '@/utils/toastPolicy';

// Batch 363 (PS-72): a message carrying patient data (an accession, a
// cassette or slide id built from one) passes `{ containsPhi: true }`, and
// SaveToast tags it so the support-ticket screenshot redacts it.
export interface ShowToastOptions { containsPhi?: boolean }
export type ShowToast = (message: string, kind?: ToastKind, options?: ShowToastOptions) => void;

export function useSynopticToast() {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind; visible: boolean; containsPhi: boolean }>({ message: '', kind: 'info', visible: false, containsPhi: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);

  const showToast = useCallback<ShowToast>((message, kind = 'info', options) => {
    clear();
    setToast({ message, kind, visible: true, containsPhi: !!options?.containsPhi });
    const ms = toastAutoCloseMs(message, kind);
    if (ms !== null) timer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), ms);
  }, []);

  const dismissToast = useCallback(() => { clear(); setToast(t => ({ ...t, visible: false })); }, []);

  return { toastMsg: toast.message, toastKind: toast.kind, toastVisible: toast.visible, toastContainsPhi: toast.containsPhi, showToast, dismissToast };
}
