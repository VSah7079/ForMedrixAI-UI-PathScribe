# components/LiveUpdates/

**`LiveStatusBadge.tsx`** (PS-262, Batch 342): shows an intraoperative screen's live-update state from `hooks/useLiveIntraopUpdates.ts`.
- **States:**
  - *Live* (green): the SignalR hub is connected;
  - *Local updates* (blue): no hub is configured, so only this computer's windows update instantly;
  - *Connecting…* / *Reconnecting…* (amber, pulsing);
  - *Offline* (red).
- **Tooltip:** says what's happening and that the screen refreshes every 15 seconds meanwhile.
- **Visual only:** no sound, since this runs in the OR.
- **Styling:** `.ps-live-badge*` in `pathscribe.css`; the colour comes from `--ps-hue`, and the OR wall display uses a larger size (`.ps-orboard-live-badge`).
- **Translations:** `liveUpdates.status.*` and `liveUpdates.hint.*` in all five locales.

Used on the OR Suite Live Board header and the Intraop Queue header.

---
*See [components/README.md](../README.md) for the rest of the components/ layer.*
