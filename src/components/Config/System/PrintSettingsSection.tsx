// src/components/Config/System/PrintSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label/cassette print-
// workflow architecture: "Structure your print settings hierarchically
// so labs can enforce their own policies." Tier 1 (System/Facility-wide
// default) — mirrors Config/AI/index.tsx's own real, established
// pattern (load on mount, update() round-trips through the real
// service, loading/saving state) directly, since this is the same
// shape of settings screen.
//
// Real fix, per direct reminder: "no business logic in the UI code and
// no inline css." Rewritten to use real, named CSS classes throughout
// (pathscribe.css) — no style={{...}} anywhere in this file.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { printSettingsService } from '@/services/index';
import type { PrintSettingsConfig } from '@/services/printSettings/IPrintSettingsService';
import { LABEL_SIZE_PRESETS } from '@/types/labels/LabelSizePreset';
import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';
import { CONTAINER_TYPES } from '@/services/hardwareContainers/IHardwareContainerRegistryService';

const SYMBOLOGY_LABEL: Record<LabelBarcodeSymbology, string> = {
  code128: 'Code 128 (1D)',
  qr: 'QR Code (2D)',
  datamatrix: 'DataMatrix (2D)',
};

const PrintSettingsSection: React.FC = () => {
  const [config, setConfig] = useState<PrintSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    printSettingsService.get().then(res => {
      if (res.ok) setConfig(res.data);
      setLoading(false);
    });
  }, []);

  const update = async (changes: Partial<PrintSettingsConfig>) => {
    if (!config) return;
    setSaving(true);
    const res = await printSettingsService.update(changes);
    if (res.ok) setConfig(res.data);
    setSaving(false);
  };

  if (loading || !config) return (
    <div className="ps-conf-loading">
      Loading print settings…
    </div>
  );

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">Print Settings</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        Default label-printing behavior for this lab — individual accessioners can still override per action unless guardrails are enforced below.
      </p>

      {/* ── Default Print Behavior ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          Default Print Behavior
        </div>
        <div className="ps-conf-card-description">
          On-Demand prints each cassette label as it's logged during grossing. Batch defers all printing to an explicit, per-case bulk action.
        </div>
        <div className="ps-conf-radio-group">
          {(['on_demand', 'batch'] as const).map(mode => (
            <label key={mode} className="ps-conf-radio-label">
              <input
                type="radio"
                name="defaultPrintBehavior"
                checked={config.defaultPrintBehavior === mode}
                onChange={() => update({ defaultPrintBehavior: mode })}
                className="ps-conf-radio-input"
              />
              <span className="ps-conf-option-text">
                {mode === 'on_demand' ? 'On-Demand (per block/container)' : 'Batch (per case/order)'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Enforce Guardrails ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div>
            <div className="ps-conf-card-title">
              Enforce On-Demand Guardrails
            </div>
            <div className="ps-conf-card-description--tight">
              When on, the default above is fixed lab-wide — accessioners cannot switch to Batch for an individual case.
            </div>
          </div>
          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={config.enforceOnDemandGuardrails}
              onChange={e => update({ enforceOnDemandGuardrails: e.target.checked })}
              className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">Enabled</span>
          </label>
        </div>
      </div>

      {/* ── Scan Verification ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div>
            <div className="ps-conf-card-title">
              Require Scan Verification
            </div>
            <div className="ps-conf-card-description--tight">
              Require scanning the newly printed cassette/container barcode before advancing to the next specimen block.
            </div>
          </div>
          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={config.requireScanVerificationBeforeNextBlock}
              onChange={e => update({ requireScanVerificationBeforeNextBlock: e.target.checked })}
              className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">Enabled</span>
          </label>
        </div>
      </div>

      {/* ── Container Label Size ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          Container Label Size
        </div>
        <div className="ps-conf-card-description">
          Physical label size for specimen container labels. Requisition labels always print full-page regardless of this setting.
        </div>
        <select
          value={config.containerLabelPresetId}
          onChange={e => update({ containerLabelPresetId: e.target.value })}
          className="ps-input-dark ps-conf-select-wide"
        >
          {LABEL_SIZE_PRESETS.filter(p => p.id !== 'requisition_full_page_letter' && p.id !== 'requisition_full_page_a4').map(preset => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </div>

      {/* ── Container Barcode Symbology ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          Container Barcode Symbology
        </div>
        <div className="ps-conf-card-description">
          Applied to Batch Management's own Master Batch Barcode labels (New Container).
        </div>
        <select
          value={config.containerBarcodeSymbology}
          onChange={e => update({ containerBarcodeSymbology: e.target.value as LabelBarcodeSymbology })}
          className="ps-input-dark ps-conf-select-wide"
        >
          {(Object.keys(SYMBOLOGY_LABEL) as LabelBarcodeSymbology[]).map(s => <option key={s} value={s}>{SYMBOLOGY_LABEL[s]}</option>)}
        </select>
      </div>

      {/* ── Barcode Prefix Conventions ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          Barcode Prefix Conventions
        </div>
        <div className="ps-conf-card-description">
          Printed as {config.disposableBarcodePrefix || '…'}-{'{TYPE}'}-{'{YYYYMMDD}'}-{'{XXXX}'} on a new disposable label, or {config.rackBarcodePrefix || '…'}-{'{TYPE}'}-{'{NN}'} on a physical, laser-engraved reusable rack.
        </div>
        <div className="ps-conf-prefix-row">
          <div>
            <label className="ps-conf-prefix-field-label">Disposable Label</label>
            <input
              className="ps-input-dark ps-conf-input-code"
              value={config.disposableBarcodePrefix}
              onChange={e => update({ disposableBarcodePrefix: e.target.value.toUpperCase() })}
              maxLength={12}
            />
          </div>
          <div>
            <label className="ps-conf-prefix-field-label">Reusable Rack</label>
            <input
              className="ps-input-dark ps-conf-input-code"
              value={config.rackBarcodePrefix}
              onChange={e => update({ rackBarcodePrefix: e.target.value.toUpperCase() })}
              maxLength={12}
            />
          </div>
        </div>
      </div>

      {/* Real feature, per direct follow-up: "get through all the
          barcode and print bits." A genuine GTIN requires a real GS1
          Company Prefix, registered with GS1 US (or the applicable
          regional GS1 Member Organisation) for ForMedrixAI LLC — a
          real, separate business/legal step, not something this app
          can fabricate. Deliberately empty by default; every real
          cassette/slide GS1 DataMatrix print refuses cleanly, with a
          clear error, until a real value is entered here. */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          GS1 GTIN (Cassette / Slide Labels)
        </div>
        <div className="ps-conf-card-description">
          The AI(01) value encoded into every real, printed cassette/slide GS1 DataMatrix label. Requires a real
          GS1 Company Prefix registered for ForMedrixAI LLC (GS1 US or the applicable regional Member
          Organisation) — a separate business step. Left empty, real GS1 cassette/slide printing refuses cleanly
          rather than encoding a fabricated value.
        </div>
        <input
          className="ps-input-dark ps-conf-input-gtin"
          value={config.gs1Gtin}
          onChange={e => update({ gs1Gtin: e.target.value })}
          placeholder="e.g. 00850000000000 (not yet registered)"
          maxLength={14}
        />
      </div>

      {/* ── Container Type Codes ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          Container Type Codes
        </div>
        <div className="ps-conf-card-description">
          The short code for each real container type, used in every generated Master Batch Barcode.
        </div>
        {CONTAINER_TYPES.map(type => (
          <div key={type} className="ps-conf-container-type-row">
            <span className="ps-conf-container-type-label">{type}</span>
            <input
              className="ps-input-dark ps-conf-input-code"
              value={config.containerTypeCodes[type]}
              onChange={e => update({ containerTypeCodes: { ...config.containerTypeCodes, [type]: e.target.value.toUpperCase() } })}
              maxLength={8}
            />
          </div>
        ))}
      </div>

      {saving && (
        <div className="ps-conf-saving-indicator">Saving…</div>
      )}
    </div>
  );
};

export default PrintSettingsSection;
