// src/components/Config/System/CassetteLabelLayoutEditor.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "allow the admin to enter/edit the
// parameters in order for them to ensure safety" — plus the direct
// follow-up asking whether there's a real way to actually see and
// test-print the result. Deliberately a separate, focused component
// rather than folded into PrintSettingsSection.tsx's own, already
// substantial file — the live SVG preview and safety-warning logic
// below are real, standalone concerns that read better on their own.
//
// Real, deliberate scope limit on the live preview and safety check
// below: both use the same, real, conservative 26-module DataMatrix
// estimate resolveCassetteLabelFitWarning.ts already established —
// the real printer firmware decides the real, final grid size at
// print time from the real payload length, which this component
// never has in hand at config-edit time either. This preview shows
// an honest, worst-case estimate, not a guarantee of the exact,
// final barcode size.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import '../../../pathscribe.css';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';
import { resolveCassetteLabelFitWarnings, CONSERVATIVE_DATAMATRIX_MODULE_COUNT } from '@/utils/labels/resolveCassetteLabelFitWarning';
import { printerProfileService } from '@/services/index';
import { printCassetteLabel } from '@/utils/labels/printCassetteSlideLabel';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

// Real, named angle presets from direct, real-world correction — a
// quick-start for an admin who knows their cassette model's own angle
// but doesn't want to look up or type exact mm values; both remain
// fully editable afterward, since exact dimensions genuinely vary by
// real vendor (Leica, Sakura, Primera) within each angle.
const ANGLE_PRESETS: { id: string; label: string; widthMm: number; heightMm: number }[] = [
  { id: '45deg', label: '45° cassette (~28.2 × 8.0mm)', widthMm: 28.2, heightMm: 8.0 },
  { id: '35deg', label: '35° cassette (~28.5 × 7.0mm)', widthMm: 28.5, heightMm: 7.0 },
];

// Real sample content matching the reference layout discussed —
// accession, specimen+block, patient name, tissue description —
// purely for this preview; never sent anywhere.
const SAMPLE_LINES = ['PS2026-8821', 'A - 1', 'SMITH, JANE', 'BREAST, LEFT'];

interface CassetteLabelLayoutEditorProps {
  value: CassetteLabelLayoutConfig;
  onChange: (changes: Partial<CassetteLabelLayoutConfig>) => void;
  readOnly: boolean;
}

const CassetteLabelLayoutEditor: React.FC<CassetteLabelLayoutEditorProps> = ({ value, onChange, readOnly }) => {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [testGtin, setTestGtin] = useState<string>('');
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  React.useEffect(() => {
    printerProfileService.getAll().then(res => {
      if (res.ok) {
        setPrinters(res.data);
        if (res.data.length > 0) setSelectedPrinterId(res.data[0].id);
      }
    });
  }, []);

  const warnings = useMemo(() => resolveCassetteLabelFitWarnings(value), [value]);
  const barcodeSizeMm = CONSERVATIVE_DATAMATRIX_MODULE_COUNT * value.moduleSizeMm;

  // Real, deliberate large scale factor (10x) — the real face is only
  // ~7-8mm tall, far too small to usefully inspect on screen at 1:1.
  const scale = 10;
  const svgWidth = value.faceWidthMm * scale;
  const svgHeight = value.faceHeightMm * scale;
  const marginPx = 0.5 * scale;
  const barcodePx = barcodeSizeMm * scale;
  const fontPx = value.fontHeightMm * scale;
  const textXPx = barcodePx + marginPx * 2;

  const handleSendTestPrint = async () => {
    if (!selectedPrinterId) return;
    const printer = printers.find(p => p.id === selectedPrinterId);
    if (!printer) return;
    setSendingTest(true);
    setTestStatus(null);
    const result = await printCassetteLabel(
      {
        fullAccession: 'PS2026-8821', specimenLabel: 'A', blockLabel: '1', cassetteId: 'PS2026-8821A1',
        patientName: 'SMITH, JANE', tissueDescription: 'BREAST, LEFT',
      },
      printer,
      testGtin,
      value,
    );
    setSendingTest(false);
    setTestStatus(result.ok
      ? { ok: true, message: `Test label sent to ${printer.model} (${printer.printerId}). Check the physical print against a real cassette before rolling this out.` }
      : { ok: false, message: (result as { ok: false; message: string }).message });
  };

  return (
    <div className="ps-conf-card ps-conf-card--spaced">
      <div className="ps-conf-card-title">Cassette Label Layout</div>
      <div className="ps-conf-card-description">
        The real, physical dimensions of the cassette face this label prints onto — genuinely varies by cassette
        vendor (Leica, Sakura, Primera) and by the cassette's own 35°/45° angle. Getting this wrong means content
        prints past the real edge of the cassette, or a barcode too small to scan reliably.
      </div>

      <div className="ps-cassette-layout-preset-row">
        {ANGLE_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            className="ps-conf-callout-banner-link"
            disabled={readOnly}
            onClick={() => onChange({ faceWidthMm: preset.widthMm, faceHeightMm: preset.heightMm })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="ps-cassette-layout-fields">
        <label className="ps-label">
          Face width (mm)
          <input
            className="ps-input-dark"
            type="number" step="0.1" min="1"
            value={value.faceWidthMm}
            disabled={readOnly}
            onChange={e => onChange({ faceWidthMm: Number(e.target.value) })}
          />
        </label>
        <label className="ps-label">
          Face height (mm)
          <input
            className="ps-input-dark"
            type="number" step="0.1" min="1"
            value={value.faceHeightMm}
            disabled={readOnly}
            onChange={e => onChange({ faceHeightMm: Number(e.target.value) })}
          />
        </label>
        <label className="ps-label">
          Barcode module size (mm)
          <input
            className="ps-input-dark"
            type="number" step="0.01" min="0.05"
            value={value.moduleSizeMm}
            disabled={readOnly}
            onChange={e => onChange({ moduleSizeMm: Number(e.target.value) })}
          />
        </label>
        <label className="ps-label">
          Text line height (mm)
          <input
            className="ps-input-dark"
            type="number" step="0.1" min="0.5"
            value={value.fontHeightMm}
            disabled={readOnly}
            onChange={e => onChange({ fontHeightMm: Number(e.target.value) })}
          />
        </label>
      </div>

      {/* Real, per direct follow-up: "allow the admin to enter/edit
          the parameters in order for them to ensure safety" — every
          real problem found, not just the first. */}
      {warnings.length > 0 && (
        <div className="ps-cassette-layout-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="ps-conf-callout-banner ps-cassette-layout-warning">
              <span className="ps-conf-callout-banner-text">⚠ {w.message}</span>
            </div>
          ))}
        </div>
      )}
      {warnings.length === 0 && (
        <div className="ps-cassette-layout-ok">
          ✓ This configuration has room for a real, worst-case label at this module and font size.
        </div>
      )}

      {/* Real, per direct follow-up: "is there a test to actually
          generate a label print or etch so the admin can physically
          see and test with?" — a real, scaled visual preview first
          (see this component's own header for its honest limits),
          then a real test print below. */}
      <div className="ps-cassette-layout-preview-wrap">
        <div className="ps-cassette-layout-preview-label">
          Live preview (10× scale) — sample data, never sent anywhere
        </div>
        <svg
          className="ps-cassette-layout-preview-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
        >
          <rect x={0} y={0} width={svgWidth} height={svgHeight} className="ps-cassette-preview-face" />
          <rect x={marginPx} y={marginPx} width={barcodePx} height={barcodePx} className="ps-cassette-preview-barcode" />
          {SAMPLE_LINES.map((line, i) => (
            <text
              key={i}
              x={textXPx}
              y={marginPx + i * fontPx + fontPx * 0.8}
              className="ps-cassette-preview-text"
              fontSize={fontPx}
            >
              {line}
            </text>
          ))}
        </svg>
      </div>

      <div className="ps-cassette-layout-testprint">
        <div className="ps-conf-card-title ps-cassette-layout-testprint-title">Send a real test print</div>
        <div className="ps-conf-card-description">
          Prints the sample data above through a real, connected printer profile — hold the result against an
          actual cassette before rolling this configuration out.
        </div>
        <div className="ps-cassette-layout-testprint-row">
          <select
            className="ps-input-dark"
            value={selectedPrinterId}
            onChange={e => setSelectedPrinterId(e.target.value)}
            disabled={printers.length === 0}
          >
            {printers.length === 0 && <option value="">No printer profiles configured</option>}
            {printers.map(p => (
              <option key={p.id} value={p.id}>{p.model} ({p.printerId})</option>
            ))}
          </select>
          <input
            className="ps-input-dark"
            placeholder="Test GTIN (e.g. 00850000000000)"
            value={testGtin}
            onChange={e => setTestGtin(e.target.value)}
            maxLength={14}
          />
          <button
            type="button"
            className="ps-conf-callout-banner-link"
            disabled={sendingTest || !selectedPrinterId || !testGtin.trim()}
            onClick={handleSendTestPrint}
          >
            {sendingTest ? 'Sending…' : 'Send Test Print'}
          </button>
        </div>
        {testStatus && (
          <div className={testStatus.ok ? 'ps-cassette-layout-ok' : 'ps-cassette-layout-warning'}>
            {testStatus.ok ? '✓ ' : '⚠ '}{testStatus.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default CassetteLabelLayoutEditor;
