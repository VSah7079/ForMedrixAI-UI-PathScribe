// src/components/MaterialScanTrackingBridge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "the tracking event should occur no
// matter what page your on in pathscribe, just need access to the
// NavBar Scan." Mounts useGlobalMaterialScanTracking() exactly once,
// at the app root (App.tsx, alongside ScannerProvider itself) — never
// tied to any specific page or case being open. Renders nothing; this
// is a real, deliberate "hook as a component" pattern purely so it
// can sit at the JSX tree's own top level next to the other real,
// app-wide providers, not because it has any UI of its own.
//
// Real fix, per direct follow-up: "Phase 3 — the sibling-propagation
// confirmation system from a few turns back is still sitting there...
// it should come out." This file briefly grew a real confirmation
// modal for that system (a scan resolving to a legacy, tagged shared
// block would hold off and ask before acting) — removed along with
// the rest of that system now that Case.matrixBlocks[] makes it
// structurally unnecessary. Back to rendering nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useGlobalMaterialScanTracking } from '@/hooks/useGlobalMaterialScanTracking';

export function MaterialScanTrackingBridge(): null {
  useGlobalMaterialScanTracking();
  return null;
}

export default MaterialScanTrackingBridge;
