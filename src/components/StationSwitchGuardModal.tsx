// src/components/StationSwitchGuardModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Unsaved Data Present: Blocks
// immediate location switch. Pauses the scan, locks the current
// specimen container state, and pops a modal... Choices: 1. Save &
// Switch... 2. Discard & Switch... 3. Cancel: Keeps user at Station 2
// to finish editing." Real, direct implementation of that exact
// 3-choice table — see useGlobalStationSwitch.ts for the real
// save/discard wiring (the exact same saveDraftInternal()/
// discardDraft() every other real save/discard trigger already
// uses, not a second, invented path).
// ─────────────────────────────────────────────────────────────────────────────

import { useGlobalStationSwitch } from '@/hooks/useGlobalStationSwitch';

export function StationSwitchGuardModal() {
  const { pending, saveAndSwitch, discardAndSwitch, cancelSwitch } = useGlobalStationSwitch();
  if (!pending) return null;

  return (
    <div className="ps-overlay ps-station-guard-overlay">
      <div className="ps-modal-dark ps-station-guard-modal">
        <div>
          <div className="ps-station-guard-title">⚠️ Unsaved changes</div>
          <div className="ps-station-guard-subtitle">
            You have unsaved changes. Scanning "{pending.station.name}" will switch your active station — decide what happens to your current work first.
          </div>
        </div>
        <div className="ps-station-guard-actions">
          <button className="ps-station-guard-save" onClick={saveAndSwitch}>
            💾 Save &amp; Switch to {pending.station.name}
          </button>
          <button className="ps-station-guard-discard" onClick={discardAndSwitch}>
            🗑️ Discard &amp; Switch
          </button>
          <button className="ps-station-guard-cancel" onClick={cancelSwitch}>
            Cancel — stay here
          </button>
        </div>
      </div>
    </div>
  );
}

export default StationSwitchGuardModal;
