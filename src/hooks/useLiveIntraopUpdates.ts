// src/hooks/useLiveIntraopUpdates.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: keeps an intraoperative screen current. Subscribes to live
// updates for `scope` and calls `onChange` (the screen's own re-read) when
// something inside it changes — bursts coalesced into one call — and after
// every reconnection. It also polls: every 15 s without a live connection,
// every 60 s as a safety net while live (liveUpdatePolicy.ts). Returns the
// connection state for the screen's status badge. `scope` null = not yet
// known (nothing subscribed).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { liveUpdateService } from '@/services';
import type { ILiveUpdateService } from '@/services/liveUpdates/ILiveUpdateService';
import type { IntraopScope } from '@/services/liveUpdates/liveUpdateContract';
import { COALESCE_MS, fallbackPollIntervalMs, scopeKey, type LiveConnectionState } from '@/services/liveUpdates/liveUpdatePolicy';

export function useLiveIntraopUpdates(
  scope: IntraopScope | null,
  onChange: () => void,
  service: ILiveUpdateService = liveUpdateService,
): LiveConnectionState {
  const [state, setState] = useState<LiveConnectionState>(() => (scope ? service.getState() : 'idle'));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = scopeKey(scope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    const current = scopeRef.current;
    if (!current) { setState('idle'); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; onChangeRef.current(); }, COALESCE_MS);
    };
    const subscription = service.subscribeIntraop(current, changed);
    const offState = service.onStateChange(setState);
    const offResync = service.onResync(changed);
    setState(service.getState());
    return () => {
      subscription.unsubscribe();
      offState();
      offResync();
      if (timer) clearTimeout(timer);
    };
  }, [key, service]);

  useEffect(() => {
    if (!key) return;
    const poll = setInterval(() => onChangeRef.current(), fallbackPollIntervalMs(state));
    return () => clearInterval(poll);
  }, [key, state]);

  return state;
}
