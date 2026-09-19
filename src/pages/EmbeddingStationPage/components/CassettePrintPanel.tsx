// src/pages/EmbeddingStationPage/components/CassettePrintPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-285's own Right Panel: "device status..., On-Demand
// Reprint/Re-labeling for a damaged or wax-obscured cassette label...
// Reason Log: mandatory reason prompt for any reprint." Same real
// "device status derived only from what's actually knowable
// client-side, never a fabricated telemetry guess" posture as
// HardwarePrintPanel.tsx's own header comment — reused verbatim here
// for the cassette printer.
//
// The mandatory reason prompt itself is a real ps-overlay/ps-modal-dark
// modal, owned by the parent page (EmbeddingStationPage.tsx) — this
// panel only requests it (onRequestReprint), same "child requests,
// parent owns the modal" shape as MicrotomyWorkstationPage.tsx's own
// pendingRemoval flow.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import type { CassetteReprintReason } from '@/types/case/Specimen';

export interface CassettePrintPanelProps {
  printer: PrinterProfile | null;
  printerError: string | null;
  labelLayout: CassetteLabelLayoutConfig;
  specimenLabel: string;
  blockLabel: string;
  cassetteReprintCount?: number;
  lastCassetteReprintReason?: CassetteReprintReason;
  onRequestReprint: () => void;
  reprintInFlight: boolean;
  reprintFeedback: string | null;
}

const CassettePrintPanel: React.FC<CassettePrintPanelProps> = ({
  printer, printerError, labelLayout, specimenLabel, blockLabel,
  cassetteReprintCount, lastCassetteReprintReason, onRequestReprint, reprintInFlight, reprintFeedback,
}) => {
  const { t } = useTranslation();
  const hardwareStatus: 'ready' | 'error' | 'offline' = printerError ? 'error' : printer ? 'ready' : 'offline';

  return (
    <div>
      <div className="ps-embedding-panel" style={{ marginBottom: 14 }}>
        <p className="ps-embedding-panel-title">{t('embeddingStation.hardware.deviceStatus')}</p>
        <div className="ps-embedding-hardware-card">
          <span>{printer ? `${printer.printerId} (${printer.model})` : t('embeddingStation.hardware.noPrinter')}</span>
          <span className={`ps-embedding-hardware-status ps-embedding-hardware-status--${hardwareStatus}`}>
            {t(`embeddingStation.hardware.status.${hardwareStatus}`)}
          </span>
        </div>
        {printerError && <div className="ps-embedding-scan-error">{printerError}</div>}
      </div>

      <div className="ps-embedding-panel" style={{ marginBottom: 14 }}>
        <p className="ps-embedding-panel-title">{t('embeddingStation.hardware.reprint')}</p>
        <button type="button" className="ps-btn-primary" disabled={reprintInFlight} onClick={onRequestReprint}>
          🖨️ {t('embeddingStation.hardware.reprintCassette')}
        </button>
        {typeof cassetteReprintCount === 'number' && cassetteReprintCount > 0 && (
          <div className="ps-embedding-context-field" style={{ marginTop: 8 }}>
            {t('embeddingStation.hardware.reprintCount', { count: cassetteReprintCount })}
            {lastCassetteReprintReason && <strong>{lastCassetteReprintReason}</strong>}
          </div>
        )}
        {reprintFeedback && <div className="ps-embedding-scan-error">{reprintFeedback}</div>}
      </div>

      <div className="ps-embedding-panel">
        <p className="ps-embedding-panel-title">{t('embeddingStation.hardware.labelPreview')}</p>
        <div className="ps-embedding-label-preview" style={{ aspectRatio: `${labelLayout.faceWidthMm} / ${labelLayout.faceHeightMm}`, border: '1px solid rgba(148,163,184,0.3)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          <div style={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {/* Real, deliberate: a schematic module grid, same honest
                "not a pixel-exact DataMatrix render" posture as
                HardwarePrintPanel.tsx's own slide label preview. */}
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ width: 3, height: 3, background: '#e2e8f0', opacity: (specimenLabel.charCodeAt(0) + i) % 3 === 0 ? 0.15 : 1 }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#e2e8f0' }}>{specimenLabel}{blockLabel}</div>
        </div>
        <div className="ps-embedding-comment-meta">{labelLayout.faceWidthMm}mm × {labelLayout.faceHeightMm}mm</div>
      </div>
    </div>
  );
};

export default CassettePrintPanel;
