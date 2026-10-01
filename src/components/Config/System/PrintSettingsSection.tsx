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
//
// Real, Stage B addition, per direct guidance (Workstation & Hardware
// redesign): Tier 2 — a real, per-facility override
// (IFacilityPrintSettingsService.ts) — is live. With no facility
// selected at the group level (selectedFacilityId undefined), this
// screen behaves exactly as it always has: reads and edits the one,
// real, global Tier 1 config directly. With a facility selected:
//   - no override yet → the form shows the INHERITED, effective values
//     read-only, with a banner making that inheritance explicit and a
//     real "+ Create Facility Override" action — editing here would
//     otherwise be genuinely ambiguous between "change the shared
//     default for every facility" and "start a new override," so the
//     UI never lets that ambiguity exist.
//   - a real override exists → the form is editable again, now writing
//     to that facility's own override record specifically, with a
//     "Revert to System Default" action that deletes it outright.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { printSettingsService, facilityPrintSettingsService, printerProfileService } from '@/services/index';
import type { PrintSettingsConfig } from '@/services/printSettings/IPrintSettingsService';
import type { FacilityPrintSettings } from '@/services/printSettings/IFacilityPrintSettingsService';
import { resolveEffectivePrintSettings } from '@/services/printSettings/IFacilityPrintSettingsService';
import { LABEL_SIZE_PRESETS } from '@/types/labels/LabelSizePreset';
import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';
import { CONTAINER_TYPES } from '@/services/hardwareContainers/IHardwareContainerRegistryService';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import type { Facility } from '@/services';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import CassetteLabelLayoutEditor from './CassetteLabelLayoutEditor';

// Data-key-stays-English, label-is-translated: the stored
// LabelBarcodeSymbology values ('code128'/'qr'/'datamatrix') stay the
// real, persisted config values — only the displayed option text is
// translated.
const SYMBOLOGY_LABEL_KEY: Record<LabelBarcodeSymbology, string> = {
  code128: 'printSettingsSection.symbology.code128',
  qr: 'printSettingsSection.symbology.qr',
  datamatrix: 'printSettingsSection.symbology.datamatrix',
};

const PrintSettingsSection: React.FC<{ selectedFacilityId?: string }> = ({ selectedFacilityId }) => {
  const { t } = useTranslation();
  const [globalConfig, setGlobalConfig] = useState<PrintSettingsConfig | null>(null);
  const [facilityOverride, setFacilityOverride] = useState<FacilityPrintSettings | null>(null);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [printerProfiles, setPrinterProfiles] = useState<PrinterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);
  useEffect(() => { printerProfileService.getAll().then(res => { if (res.ok) setPrinterProfiles(res.data); }); }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      printSettingsService.get(),
      selectedFacilityId ? facilityPrintSettingsService.getForFacility(selectedFacilityId) : Promise.resolve({ ok: true, data: null } as const),
    ]).then(([g, f]) => {
      if (g.ok) setGlobalConfig(g.data);
      if (f.ok) setFacilityOverride(f.data);
      setLoading(false);
    });
  }, [selectedFacilityId]);

  const hasOverride = !!facilityOverride;
  // Real, deliberate read model: the form always renders these
  // EFFECTIVE values (global with the override merged on top, if any)
  // regardless of which mode it's in — an admin viewing an inherited
  // screen should see the real numbers that actually apply, not a
  // blank slate.
  const effective: PrintSettingsConfig | null = globalConfig
    ? resolveEffectivePrintSettings(globalConfig, facilityOverride)
    : null;

  // Real, deliberate branch — see this file's own header for the full
  // "why" behind read-only-when-inheriting.
  const readOnly = !!selectedFacilityId && !hasOverride;

  const update = async (changes: Partial<PrintSettingsConfig>) => {
    if (!effective || readOnly) return;
    setSaving(true);
    if (selectedFacilityId) {
      const res = await facilityPrintSettingsService.update(selectedFacilityId, changes);
      if (res.ok) setFacilityOverride(res.data);
    } else {
      const res = await printSettingsService.update(changes);
      if (res.ok) setGlobalConfig(res.data);
    }
    setSaving(false);
  };

  const handleCreateOverride = async () => {
    if (!selectedFacilityId || !globalConfig) return;
    setSaving(true);
    // Real, deliberate starting point: seeds the new override from the
    // CURRENT global values (IFacilityPrintSettingsService.create's own
    // doc comment explains why) — never an empty/partial record.
    const res = await facilityPrintSettingsService.create(selectedFacilityId, { ...globalConfig });
    if (res.ok) setFacilityOverride(res.data);
    setSaving(false);
  };

  const handleRevertOverride = async () => {
    if (!selectedFacilityId) return;
    setSaving(true);
    await facilityPrintSettingsService.remove(selectedFacilityId);
    setFacilityOverride(null);
    setSaving(false);
  };

  if (loading || !effective) return (
    <div className="ps-conf-loading">
      {t('printSettingsSection.loading')}
    </div>
  );

  const facilityName = selectedFacilityId ? (labs.find(l => l.id === selectedFacilityId)?.name ?? selectedFacilityId) : '';

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('printSettingsSection.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
        {t('printSettingsSection.subtitle')}
      </p>

      {selectedFacilityId && !hasOverride && (
        <div className="ps-conf-callout-banner">
          <span className="ps-conf-callout-banner-text">
            ℹ️ <Trans i18nKey="printSettingsSection.banner.inheriting" values={{ facilityName }} components={{ strong: <strong /> }} />
          </span>
          <button className="ps-conf-callout-banner-link" onClick={handleCreateOverride} disabled={saving}>{t('printSettingsSection.banner.createOverride')}</button>
        </div>
      )}
      {selectedFacilityId && hasOverride && (
        <div className="ps-conf-callout-banner">
          <span className="ps-conf-callout-banner-text">
            ✓ <Trans i18nKey="printSettingsSection.banner.overrideActive" values={{ facilityName }} components={{ strong: <strong /> }} />
          </span>
          <button className="ps-conf-callout-banner-link" onClick={handleRevertOverride} disabled={saving}>{t('printSettingsSection.banner.revertOverride')}</button>
        </div>
      )}

      {/* ── Default Print Behavior ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.defaultBehavior.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.defaultBehavior.description')}
        </div>
        <div className="ps-conf-radio-group">
          {(['on_demand', 'batch'] as const).map(mode => (
            <label key={mode} className="ps-conf-radio-label">
              <input
                type="radio"
                name="defaultPrintBehavior"
                checked={effective.defaultPrintBehavior === mode}
                onChange={() => update({ defaultPrintBehavior: mode })}
                disabled={readOnly}
                className="ps-conf-radio-input"
              />
              <span className="ps-conf-option-text">
                {mode === 'on_demand' ? t('printSettingsSection.defaultBehavior.onDemandOption') : t('printSettingsSection.defaultBehavior.batchOption')}
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
              {t('printSettingsSection.guardrails.title')}
            </div>
            <div className="ps-conf-card-description--tight">
              {t('printSettingsSection.guardrails.description')}
            </div>
          </div>
          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={effective.enforceOnDemandGuardrails}
              onChange={e => update({ enforceOnDemandGuardrails: e.target.checked })}
              disabled={readOnly}
              className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('printSettingsSection.enabledLabel')}</span>
          </label>
        </div>
      </div>

      {/* ── Scan Verification ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div>
            <div className="ps-conf-card-title">
              {t('printSettingsSection.scanVerification.title')}
            </div>
            <div className="ps-conf-card-description--tight">
              {t('printSettingsSection.scanVerification.description')}
            </div>
          </div>
          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={effective.requireScanVerificationBeforeNextBlock}
              onChange={e => update({ requireScanVerificationBeforeNextBlock: e.target.checked })}
              disabled={readOnly}
              className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('printSettingsSection.enabledLabel')}</span>
          </label>
        </div>
      </div>

      {/* ── Container Label Size ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.containerLabelSize.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.containerLabelSize.description')}
        </div>
        {/* LABEL_SIZE_PRESETS (types/labels/LabelSizePreset.ts) is a shared,
            foundational constant, not owned by this component - each
            preset's own `name` is left untouched here, same "shared
            display-label constant left untouched" precedent as
            MATERIAL_TYPE_LABEL/BILLING_TYPE_LABEL elsewhere in this sweep. */}
        <select
          value={effective.containerLabelPresetId}
          onChange={e => update({ containerLabelPresetId: e.target.value })}
          disabled={readOnly}
          className="ps-input-dark ps-conf-select-wide"
        >
          {LABEL_SIZE_PRESETS.filter(p => p.id !== 'requisition_full_page_letter' && p.id !== 'requisition_full_page_a4').map(preset => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </div>

      {/* ── Requisition Label Size ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.requisitionLabelSize.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.requisitionLabelSize.description')}
        </div>
        <select
          value={effective.requisitionLabelPresetId}
          onChange={e => update({ requisitionLabelPresetId: e.target.value })}
          disabled={readOnly}
          className="ps-input-dark ps-conf-select-wide"
        >
          {LABEL_SIZE_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </div>

      {/* ── Container Label Printer Profile ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.containerPrinterProfile.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.containerPrinterProfile.description')}
        </div>
        <select
          value={effective.containerLabelPrinterProfileId ?? ''}
          onChange={e => update({ containerLabelPrinterProfileId: e.target.value || undefined })}
          disabled={readOnly}
          className="ps-input-dark ps-conf-select-wide"
        >
          <option value="">{t('printSettingsSection.useBrowserDialogOption')}</option>
          {printerProfiles.map(p => <option key={p.id} value={p.id}>{p.printerId} ({p.model}, {p.bridgeType})</option>)}
        </select>
        <span className="ps-conf-field-hint">{t('printSettingsSection.qzTrayHint')}</span>
      </div>

      {/* ── Molecular Label Printer Profile ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.molecularPrinterProfile.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.molecularPrinterProfile.description')}
        </div>
        <select
          value={effective.molecularLabelPrinterProfileId ?? ''}
          onChange={e => update({ molecularLabelPrinterProfileId: e.target.value || undefined })}
          disabled={readOnly}
          className="ps-input-dark ps-conf-select-wide"
        >
          <option value="">{t('printSettingsSection.useBrowserDialogOption')}</option>
          {printerProfiles.map(p => <option key={p.id} value={p.id}>{p.printerId} ({p.model}, {p.bridgeType})</option>)}
        </select>
        <span className="ps-conf-field-hint">{t('printSettingsSection.qzTrayHint')}</span>
      </div>

      {/* ── Requisition Label Printer Profile ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.requisitionPrinterProfile.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.requisitionPrinterProfile.description')}
        </div>
        <select
          value={effective.requisitionLabelPrinterProfileId ?? ''}
          onChange={e => update({ requisitionLabelPrinterProfileId: e.target.value || undefined })}
          disabled={readOnly}
          className="ps-input-dark ps-conf-select-wide"
        >
          <option value="">{t('printSettingsSection.useBrowserDialogOption')}</option>
          {printerProfiles.map(p => <option key={p.id} value={p.id}>{p.printerId} ({p.model}, {p.bridgeType})</option>)}
        </select>
        <span className="ps-conf-field-hint">{t('printSettingsSection.qzTrayHint')}</span>
      </div>

      {/* ── Container Barcode Symbology ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.containerBarcodeSymbology.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.containerBarcodeSymbology.description')}
        </div>
        <select
          value={effective.containerBarcodeSymbology}
          onChange={e => update({ containerBarcodeSymbology: e.target.value as LabelBarcodeSymbology })}
          disabled={readOnly}
          className="ps-input-dark ps-conf-select-wide"
        >
          {(Object.keys(SYMBOLOGY_LABEL_KEY) as LabelBarcodeSymbology[]).map(s => <option key={s} value={s}>{t(SYMBOLOGY_LABEL_KEY[s])}</option>)}
        </select>
      </div>

      {/* ── Barcode Prefix Conventions ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.barcodePrefixConventions.title')}
        </div>
        <div className="ps-conf-card-description">
          {/* {TYPE}/{YYYYMMDD}/{XXXX}/{NN} below are literal format-token
              text shown to the admin (single braces) - not i18next
              interpolation syntax (which uses double braces), so they
              pass through the translation string unchanged. */}
          {t('printSettingsSection.barcodePrefixConventions.description', {
            disposablePrefix: effective.disposableBarcodePrefix || '…',
            rackPrefix: effective.rackBarcodePrefix || '…',
          })}
        </div>
        <div className="ps-conf-prefix-row">
          <div>
            <label className="ps-conf-prefix-field-label">{t('printSettingsSection.barcodePrefixConventions.disposableLabel')}</label>
            <input
              className="ps-input-dark ps-conf-input-code"
              value={effective.disposableBarcodePrefix}
              onChange={e => update({ disposableBarcodePrefix: e.target.value.toUpperCase() })}
              disabled={readOnly}
              maxLength={12}
            />
          </div>
          <div>
            <label className="ps-conf-prefix-field-label">{t('printSettingsSection.barcodePrefixConventions.reusableRackLabel')}</label>
            <input
              className="ps-input-dark ps-conf-input-code"
              value={effective.rackBarcodePrefix}
              onChange={e => update({ rackBarcodePrefix: e.target.value.toUpperCase() })}
              disabled={readOnly}
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
          {t('printSettingsSection.gs1Gtin.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.gs1Gtin.description')}
        </div>
        <input
          className="ps-input-dark ps-conf-input-gtin"
          value={effective.gs1Gtin}
          onChange={e => update({ gs1Gtin: e.target.value })}
          disabled={readOnly}
          placeholder={t('printSettingsSection.gs1Gtin.placeholder')}
          maxLength={14}
        />
      </div>

      {/* Real, per direct follow-up: "I'm not sure the cassette label
          size is correct... allow the admin to enter/edit the
          parameters in order for them to ensure safety." */}
      <CassetteLabelLayoutEditor
        value={effective.cassetteLabelLayout}
        readOnly={readOnly}
        onChange={changes => update({ cassetteLabelLayout: { ...effective.cassetteLabelLayout, ...changes } })}
      />

      {/* ── Container Type Codes ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">
          {t('printSettingsSection.containerTypeCodes.title')}
        </div>
        <div className="ps-conf-card-description">
          {t('printSettingsSection.containerTypeCodes.description')}
        </div>
        {CONTAINER_TYPES.map(type => (
          <div key={type} className="ps-conf-container-type-row">
            <span className="ps-conf-container-type-label">{type}</span>
            <input
              className="ps-input-dark ps-conf-input-code"
              value={effective.containerTypeCodes[type]}
              onChange={e => update({ containerTypeCodes: { ...effective.containerTypeCodes, [type]: e.target.value.toUpperCase() } })}
              disabled={readOnly}
              maxLength={8}
            />
          </div>
        ))}
      </div>

      {saving && (
        <div className="ps-conf-saving-indicator">{t('printSettingsSection.savingIndicator')}</div>
      )}
    </div>
  );
};

export default PrintSettingsSection;
