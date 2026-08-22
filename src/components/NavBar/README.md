# components/NavBar/

## Files

- **`NavBar.tsx`** (360 lines) — Top nav bar: search, voice controls,
  enhancement request button, external reference links (CAP/WHO/
  PathologyOutlines), messaging. Real, correctly wired to
  `AuthContext`/`MessagingContext`. No issues.
- **`NavBarScanStation.tsx`** — real fix, per direct follow-up: station
  identification moved out of any specific case entirely
  (`ScanStationPrompt.tsx` handles the real, one-time "identified at
  login" moment) — this is the always-visible, global place a tech can
  check or change it afterward, from anywhere in the app.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
