// src/pages/MicrotomyWorkstationPage/components/HardwarePrintPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284's own Right Panel: "device status..., print queue,
// manual print overrides, print mode toggle" plus "Dynamic Label
// Preview" and "Hardware Status Indicators."
//
// Real, honest limit on the hardware status shown here: this app has
// no live telemetry channel from a real slide printer (no equivalent
// of the Cassette Engine's own engraver_devices collection —
// EngraverMonitorPage.tsx's own README documents the same class of
// gap for that hardware). Status here is derived only from what's
// actually knowable client-side: whether a printer profile is
// configured and active, and the real outcome of the most recent
// dispatch attempt — never a fabricated "Low Media" guess.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { StainOrder } from '@/types/case/Specimen';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { SlideLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import type { SlideLabelFitWarning } from '@/utils/labels/resolveSlideLabelFitWarnings';

export interface HardwarePrintPanelProps {
  printMode: 'on_demand' | 'batch';
  onSetPrintMode: (mode: 'on_demand' | 'batch') => void;
  nextStain?: StainOrder;
  onPrintNext: () => void;
  batchSelectedCount: number;
  onPrintBatch: () => void;
  printer: PrinterProfile | null;
  printerError: string | null;
  labelLayout: SlideLabelLayoutConfig;
  fitWarnings: SlideLabelFitWarning[];
  previewStain?: StainOrder;
  specimenLabel: string;
  blockLabel: string;
}

const HardwarePrintPanel: React.FC<HardwarePrintPanelProps> = ({
  printMode, onSetPrintMode, nextStain, onPrintNext, batchSelectedCount, onPrintBatch,
  printer, printerError, labelLayout, fitWarnings, previewStain, specimenLabel, blockLabel,
}) => {
  const { t } = useTranslation();

  const hardwareStatus: 'ready' | 'error' | 'offline' = printerError ? 'error' : printer ? 'ready' : 'offline';

  return (
    <div>
      <div className="ps-microtomy-panel" style={{ marginBottom: 14 }}>
        <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.hardware.printMode')}</p>
        <div className="ps-microtomy-mode-switcher">
          <button type="button" className={`ps-microtomy-mode-btn${printMode === 'on_demand' ? ' ps-microtomy-mode-btn--active' : ''}`} onClick={() => onSetPrintMode('on_demand')}>
            {t('microtomyWorkstation.hardware.onDemand')}
          </button>
          <button type="button" className={`ps-microtomy-mode-btn${printMode === 'batch' ? ' ps-microtomy-mode-btn--active' : ''}`} onClick={() => onSetPrintMode('batch')}>
            {t('microtomyWorkstation.hardware.batch')}
          </button>
        </div>

        {printMode === 'on_demand' ? (
          <div style={{ marginTop: 12 }}>
            {nextStain ? (
              <>
                <div className="ps-microtomy-context-field">
                  {t('microtomyWorkstation.hardware.nextUnprinted')}
                  <strong>{nextStain.stainName}</strong>
                </div>
                <button type="button" className="ps-btn-primary" onClick={onPrintNext}>
                  🖨️ {t('microtomyWorkstation.hardware.printNext')}
                </button>
              </>
            ) : (
              <div className="ps-microtomy-context-field">{t('microtomyWorkstation.hardware.allPrinted')}</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="ps-microtomy-context-field">{t('microtomyWorkstation.hardware.selectedCount', { count: batchSelectedCount })}</div>
            <button type="button" className="ps-btn-primary" disabled={batchSelectedCount === 0} onClick={onPrintBatch}>
              🖨️ {t('microtomyWorkstation.hardware.printBatch')}
            </button>
          </div>
        )}
      </div>

      <div className="ps-microtomy-panel" style={{ marginBottom: 14 }}>
        <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.hardware.deviceStatus')}</p>
        <div className="ps-microtomy-hardware-card">
          <span>{printer ? `${printer.printerId} (${printer.model})` : t('microtomyWorkstation.hardware.noPrinter')}</span>
          <span className={`ps-microtomy-hardware-status ps-microtomy-hardware-status--${hardwareStatus}`}>
            {t(`microtomyWorkstation.hardware.status.${hardwareStatus}`)}
          </span>
        </div>
        {printerError && <div className="ps-microtomy-scan-error">{printerError}</div>}
      </div>

      <div className="ps-microtomy-panel">
        <p className="ps-microtomy-panel-title">{t('microtomyWorkstation.hardware.labelPreview')}</p>
        {previewStain ? (
          <>
            <div className="ps-microtomy-label-preview" style={{ aspectRatio: `${labelLayout.faceWidthMm} / ${labelLayout.faceHeightMm}` }}>
              <div className="ps-microtomy-label-preview-barcode">
                {/* Real, deliberate: a schematic module grid, not a real
                    decodable barcode — a genuine 1:1 DataMatrix render
                    needs the actual GS1 payload this preview never
                    computes. Pattern is stable, derived from the stain
                    name, purely so the illustration doesn't flicker on
                    every re-render. */}
                {Array.from({ length: 36 }).map((_, i) => (
                  <span key={i} style={{ opacity: (previewStain.stainName.charCodeAt(i % previewStain.stainName.length) + i) % 3 === 0 ? 0.15 : 1 }} />
                ))}
              </div>
              <div className="ps-microtomy-label-preview-text">
                <div>{specimenLabel}{blockLabel}</div>
                <div>{previewStain.stainName}</div>
              </div>
            </div>
            <div className="ps-microtomy-comment-meta">{labelLayout.faceWidthMm}mm × {labelLayout.faceHeightMm}mm</div>
            {fitWarnings.map((w, i) => <div key={i} className="ps-microtomy-label-preview-warning">⚠️ {w.message}</div>)}
          </>
        ) : (
          <div className="ps-microtomy-context-field">{t('microtomyWorkstation.hardware.noPreview')}</div>
        )}
      </div>
    </div>
  );
};

export default HardwarePrintPanel;
