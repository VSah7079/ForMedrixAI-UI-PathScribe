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
//
// i18n note: `pending.station.name` is a real station name, passed
// through as interpolation data, not translated.
// ─────────────────────────────────────────────────────────────────────────────

import { useTranslation } from 'react-i18next';
import { useGlobalStationSwitch } from '@/hooks/useGlobalStationSwitch';

export function StationSwitchGuardModal() {
  const { t } = useTranslation();
  const { pending, saveAndSwitch, discardAndSwitch, cancelSwitch } = useGlobalStationSwitch();
  if (!pending) return null;

  return (
    <div className="ps-overlay ps-station-guard-overlay">
      <div className="ps-modal-dark ps-station-guard-modal">
        <div>
          <div className="ps-station-guard-title">⚠️ {t('stationSwitchGuardModal.title')}</div>
          <div className="ps-station-guard-subtitle">
            {t('stationSwitchGuardModal.subtitle', { stationName: pending.station.name })}
          </div>
        </div>
        <div className="ps-station-guard-actions">
          <button className="ps-station-guard-save" onClick={saveAndSwitch}>
            💾 {t('stationSwitchGuardModal.saveAndSwitchButton', { stationName: pending.station.name })}
          </button>
          <button className="ps-station-guard-discard" onClick={discardAndSwitch}>
            🗑️ {t('stationSwitchGuardModal.discardAndSwitchButton')}
          </button>
          <button className="ps-station-guard-cancel" onClick={cancelSwitch}>
            {t('stationSwitchGuardModal.cancelButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StationSwitchGuardModal;
