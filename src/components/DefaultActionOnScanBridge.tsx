// src/components/DefaultActionOnScanBridge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289's own comment thread — mounts
// useDefaultActionOnScan() exactly once, at the app root, same real
// "hook as a component" pattern as MaterialScanTrackingBridge.tsx.
// Renders nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useDefaultActionOnScan } from '@/hooks/useDefaultActionOnScan';

export function DefaultActionOnScanBridge(): null {
  useDefaultActionOnScan();
  return null;
}

export default DefaultActionOnScanBridge;
