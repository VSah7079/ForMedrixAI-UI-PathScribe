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
  check or change it afterward, from anywhere in the app. Also resolves
  the effective station's own `WorkstationGroup` (PS-289) on every
  change, pushing its `functionalArea`/default action group into the
  Action Registry automatically. **Real fix (Sep 2026):** the one piece
  PS-289's own addendum named and never delivered — a real "🔬 Go to
  Bench" button now appears here whenever that group has a real
  `dedicatedPageRoute` set (and the group is Active), deep-linking
  straight to `/workstations/microtomy`, `/workstations/embedding`, or
  `/workstations/slide-distribution` in one click. No route set (the
  honest default — groups seed empty) means no button, never a
  disabled placeholder.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
