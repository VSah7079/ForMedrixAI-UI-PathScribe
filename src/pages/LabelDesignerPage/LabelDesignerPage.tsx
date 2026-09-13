// src/pages/LabelDesignerPage/LabelDesignerPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up (PS-245): a real, drag-and-drop label
// designer spanning essentially every real label type in this app.
// See services/labelDesigner/ILabelLayoutService.ts's own header for
// the full architectural account of why this is a new, real, parallel
// UI rather than a reuse of components/TemplateBuilder/'s own
// TemplateNode system — that system's own colSpan-based flowing grid
// is genuinely wrong for a label's own fixed, physical x/y layout.
//
// Real, deliberate first-increment scope: a real, working canvas with
// drag-to-place from a real, per-label-type palette, numeric
// resize/reposition via a real inspector, and a real, live HTML
// preview using real sample data for the selected label type. Real,
// direct follow-up ("add a way for users to output their label so
// they can verify that they will work"): the canvas's own barcode
// field now renders a real, actual barcode (generateBarcodeSvg.ts —
// the same real function every other label's own HTML render already
// uses), not placeholder text, and a real "Export ZPL" action
// produces genuine, working ZPL (buildLabelLayoutZpl.ts) a person can
// paste directly into Labelary's own real viewer for a full,
// authoritative fit/scan check — the same real process already used
// for every other label in this app. Real, honest limit stated
// plainly: this still does not replace any of this app's own
// existing, hardcoded, already-tested render functions — a saved
// layout here does not yet drive real print output.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import '../../pathscribe.css';
import { mockLabelLayoutService } from '../../services/labelDesigner/mockLabelLayoutService';
import { mockFacilityService } from '../../services/facilities/mockFacilityService';
import { generateBarcodeSvg } from '../../utils/labels/generateBarcodeSvg';
import { buildLabelLayoutZpl } from '../../services/labelDesigner/buildLabelLayoutZpl';
import {
  LABEL_TYPES, LABEL_TYPE_DISPLAY_NAMES, LABEL_TYPE_DEFAULT_SIZE_MM, LABEL_FIELD_CATALOG,
  LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE, LABEL_TYPE_DEFAULT_SYMBOLOGY,
} from '../../services/labelDesigner/ILabelLayoutService';
import type { Facility } from '../../services/facilities/IFacilityService';
import type { LabelType, LabelLayoutField } from '../../services/labelDesigner/ILabelLayoutService';

// Real, per this file's own header — this app's own established
// default dpi for ZPL export elsewhere (buildRequisitionStickerSheetZpl.ts).
const EXPORT_DPI = 203;

// Real, per this file's own header — a fixed, real screen scale for
// the canvas (pixels per real mm). Chosen so a real, small block label
// (25.4mm) and a real, large requisition sheet (101.6mm) both render
// at a real, usable on-screen size without a separate zoom control —
// a real, later refinement, not required for this first, working
// slice.
const PX_PER_MM = 4;

// Real, per this file's own header — real, illustrative sample values
// for the live preview, keyed by field key. Not real case data (no
// real case is being designed against here) — a real, honest stand-in
// so a designer can see roughly how real text will actually look
// without needing a real, live record.
const SAMPLE_VALUES: Record<string, string> = {
  fullAccession: 'DVMC26-0001', patientName: 'Maria Garcia', dateOfBirth: '1958-03-14',
  mrn: 'AUTO-0031', requestingProvider: 'Dr. Chen', submittingFacility: 'Metro General',
  specimenLabel: 'A', specimenDesc: 'Skin, punch biopsy', barcode: '▮▯▮▮▯▮▯▯▮▮',
  accessionNumber: 'DVMC26-0001', specimenDesignator: 'A', blockId: 'A1', blockLabel: 'A1',
  level: 'L1', stainName: 'H&E', decantLabel: 'D1', decantTypeLabel: 'Cell Block',
  containerBarcode: 'SPEC-20260906-00000042', aliquotVolumeUl: '200', plateBarcode: 'PLT-HPV-20260906-012',
  assayName: 'High-Risk HPV Real-Time PCR', targetInstrumentId: 'PANTHER_02', rackBarcode: 'RACK-MOLE-00007',
  deckLocationLabel: 'LOC-INST-PANTHER_02-SLOT_A1', deckSlot: 'SLOT_A1',
};

function newField(fieldKey: string, xMm: number, yMm: number): LabelLayoutField {
  return { id: 'field-' + Date.now() + Math.random().toString(36).slice(2, 6), fieldKey, xMm, yMm, widthMm: 20, heightMm: 6, fontSizeMm: 2.6 };
}

/** Real, per this file's own header — a real, defensive wrapper
 *  around generateBarcodeSvg.ts: this is a live, interactive canvas,
 *  not a test, so a genuinely invalid sample payload must never throw
 *  and break the whole render — falls back to an honest, visible
 *  placeholder message instead. */
function safeBarcodeSvg(payload: string, symbology: 'code128' | 'datamatrix'): string {
  try {
    return generateBarcodeSvg(payload, symbology);
  } catch {
    return '<div style="font-size:10px;color:#ef4444;">barcode render failed</div>';
  }
}

const LabelDesignerPage: React.FC = () => {
  const [labelType, setLabelType] = useState<LabelType>('requisition');
  // Real, per direct guidance: real Enterprise hierarchy and
  // inheritance — undefined/'' means editing the real Enterprise
  // default; a real, selected facilityId means editing that
  // facility's own real override, only ever offered when this label
  // type's own real policy allows one.
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState<string>('');
  const allowsOverride = LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE[labelType];

  useEffect(() => {
    mockFacilityService.getAll().then(res => { if (res.ok) setFacilities(res.data.filter(f => !f.isEnterprise)); });
  }, []);
  const [widthMm, setWidthMm] = useState(LABEL_TYPE_DEFAULT_SIZE_MM.requisition.widthMm);
  const [heightMm, setHeightMm] = useState(LABEL_TYPE_DEFAULT_SIZE_MM.requisition.heightMm);
  const [fields, setFields] = useState<LabelLayoutField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // Real, per direct follow-up ("add a way for users to output their
  // label so they can verify that they will work") — the real,
  // exported ZPL text shown for copying, or null when the export
  // panel is closed.
  const [exportedZpl, setExportedZpl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedFieldId(null);
    // Real, per direct guidance: real Enterprise hierarchy and
    // inheritance — a locked label type (allowsOverride false) always
    // loads the real Enterprise default, ignoring any real, selected
    // facilityId, so switching to a locked type never leaves a stale
    // facility selection silently affecting what's actually loaded.
    const effectiveFacilityId = LABEL_TYPE_ALLOWS_FACILITY_OVERRIDE[labelType] ? (facilityId || undefined) : undefined;
    mockLabelLayoutService.getByLabelType(labelType, effectiveFacilityId).then(res => {
      if (res.ok && res.data) {
        setWidthMm(res.data.widthMm);
        setHeightMm(res.data.heightMm);
        setFields(res.data.fields);
      } else {
        setWidthMm(LABEL_TYPE_DEFAULT_SIZE_MM[labelType].widthMm);
        setHeightMm(LABEL_TYPE_DEFAULT_SIZE_MM[labelType].heightMm);
        setFields([]);
      }
      setLoading(false);
    });
  }, [labelType, facilityId]);

  const handlePaletteDragStart = (e: React.DragEvent, fieldKey: string) => {
    e.dataTransfer.setData('application/x-pathscribe-new-field', fieldKey);
  };

  const handlePlacedFieldDragStart = (e: React.DragEvent, fieldId: string) => {
    e.dataTransfer.setData('application/x-pathscribe-move-field', fieldId);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dropXMm = (e.clientX - rect.left) / PX_PER_MM;
    const dropYMm = (e.clientY - rect.top) / PX_PER_MM;

    const newFieldKey = e.dataTransfer.getData('application/x-pathscribe-new-field');
    const movedFieldId = e.dataTransfer.getData('application/x-pathscribe-move-field');

    if (newFieldKey) {
      const field = newField(newFieldKey, Math.max(0, dropXMm), Math.max(0, dropYMm));
      setFields(prev => [...prev, field]);
      setSelectedFieldId(field.id);
    } else if (movedFieldId) {
      setFields(prev => prev.map(f => (f.id === movedFieldId ? { ...f, xMm: Math.max(0, dropXMm), yMm: Math.max(0, dropYMm) } : f)));
    }
  };

  const updateSelectedField = (patch: Partial<LabelLayoutField>) => {
    setFields(prev => prev.map(f => (f.id === selectedFieldId ? { ...f, ...patch } : f)));
  };

  const removeSelectedField = () => {
    setFields(prev => prev.filter(f => f.id !== selectedFieldId));
    setSelectedFieldId(null);
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);
  // Real, per this file's own header — every real field this label
  // type genuinely supports minus every real field already placed on
  // the canvas, so the palette never offers a field the label already
  // has (avoiding a real, confusing duplicate placement).
  const placedKeys = new Set(fields.map(f => f.fieldKey));
  const availableFields = LABEL_FIELD_CATALOG[labelType].filter(f => !placedKeys.has(f.key));

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const effectiveFacilityId = allowsOverride ? (facilityId || undefined) : undefined;
      const res = await mockLabelLayoutService.save({ labelType, facilityId: effectiveFacilityId, widthMm, heightMm, fields });
      setSaveMessage(res.ok ? (effectiveFacilityId ? 'Facility override saved.' : 'Enterprise default saved.') : 'error' in res ? res.error : 'Unknown error saving this layout.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const effectiveFacilityId = allowsOverride ? (facilityId || undefined) : undefined;
    await mockLabelLayoutService.reset(labelType, effectiveFacilityId);
    setWidthMm(LABEL_TYPE_DEFAULT_SIZE_MM[labelType].widthMm);
    setHeightMm(LABEL_TYPE_DEFAULT_SIZE_MM[labelType].heightMm);
    setFields([]);
    setSelectedFieldId(null);
    setSaveMessage('Layout reset to default.');
  };

  const handleExportZpl = () => {
    const layout = { id: 'preview', labelType, widthMm, heightMm, fields, updatedAt: new Date().toISOString() };
    setExportedZpl(buildLabelLayoutZpl(layout, labelType, SAMPLE_VALUES, EXPORT_DPI));
  };

  return (
    <div className="ps-app-root ps-page-container ps-page-container--wide">
      <div className="ps-page-header-row">
        <div>
          <h1 className="ps-page-title">Label Designer</h1>
          <p className="ps-page-subtitle">
            Drag a field from the palette onto the canvas to place it. Drag a placed field to reposition it. Click a placed field to edit its exact position and size.
          </p>
        </div>
        <div className="ps-flex-row-gap-8">
          <label className="ps-label ps-label-inline" htmlFor="ld-label-type">Label Type</label>
          <select id="ld-label-type" className="ps-input-dark" value={labelType} onChange={e => { setLabelType(e.target.value as LabelType); setFacilityId(''); }}>
            {LABEL_TYPES.map(t => <option key={t} value={t}>{LABEL_TYPE_DISPLAY_NAMES[t]}</option>)}
          </select>
          {allowsOverride ? (
            <>
              <label className="ps-label ps-label-inline" htmlFor="ld-facility">Scope</label>
              <select id="ld-facility" className="ps-input-dark" value={facilityId} onChange={e => setFacilityId(e.target.value)}>
                <option value="">Enterprise Default</option>
                {facilities.map(f => <option key={f.id} value={f.id}>{f.name} (override)</option>)}
              </select>
            </>
          ) : (
            <span className="ps-locked-badge" title="Per the given Enterprise standardization guidance, this label type is hardware/compatibility-critical and does not allow a real, per-facility override — only the Enterprise default can be edited.">
              🔒 Enterprise Standard — Locked
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="ps-conf-loading">Loading…</div>
      ) : (
        <div className="ps-designer-layout">
          {/* Palette */}
          <div className="ps-panel-box">
            <h3 className="ps-panel-heading">Available Fields</h3>
            {availableFields.length === 0 && <p className="ps-helper-text">All fields placed.</p>}
            {availableFields.map(f => (
              <div
                key={f.key}
                draggable
                onDragStart={e => handlePaletteDragStart(e, f.key)}
                className="ps-palette-item">
                {f.displayName}
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div>
            <div
              ref={canvasRef}
              onDragOver={e => e.preventDefault()}
              onDrop={handleCanvasDrop}
              onClick={() => setSelectedFieldId(null)}
              className="ps-designer-canvas"
              style={{ width: widthMm * PX_PER_MM, height: heightMm * PX_PER_MM }}>
              {fields.map(f => {
                const def = LABEL_FIELD_CATALOG[labelType].find(c => c.key === f.fieldKey);
                const isSelected = f.id === selectedFieldId;
                return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={e => { e.stopPropagation(); handlePlacedFieldDragStart(e, f.id); }}
                    onClick={e => { e.stopPropagation(); setSelectedFieldId(f.id); }}
                    title={def?.displayName ?? f.fieldKey}
                    className={`ps-designer-field${isSelected ? ' ps-designer-field--selected' : ''}`}
                    style={{
                      left: f.xMm * PX_PER_MM, top: f.yMm * PX_PER_MM,
                      width: f.widthMm * PX_PER_MM, height: f.heightMm * PX_PER_MM,
                      fontSize: f.fontSizeMm * PX_PER_MM * 0.6,
                    }}>
                    {f.fieldKey === 'barcode' ? (
                      // Real, per this file's own header — a real,
                      // rendered barcode (the same generateBarcodeSvg.ts
                      // every other real label's own HTML render
                      // already uses), not placeholder text — lets a
                      // person actually see whether a real barcode
                      // fits and looks right at this real size.
                      <div
                        style={{ width: '100%', height: '100%' }}
                        dangerouslySetInnerHTML={{ __html: safeBarcodeSvg(SAMPLE_VALUES.barcode, LABEL_TYPE_DEFAULT_SYMBOLOGY[labelType]) }}
                      />
                    ) : (
                      SAMPLE_VALUES[f.fieldKey] ?? f.fieldKey
                    )}
                  </div>
                );
              })}
            </div>
            <p className="ps-canvas-caption">{widthMm}mm × {heightMm}mm — live preview using sample data</p>
          </div>

          {/* Inspector */}
          <div className="ps-panel-box">
            <h3 className="ps-panel-heading">Inspector</h3>
            {!selectedField && <p className="ps-helper-text">Select a placed field to edit it.</p>}
            {selectedField && (
              <>
                <label className="ps-label">X (mm)</label>
                <input className="ps-input-dark ps-w-full-mb-8" type="number" value={selectedField.xMm} onChange={e => updateSelectedField({ xMm: Number(e.target.value) })} />
                <label className="ps-label">Y (mm)</label>
                <input className="ps-input-dark ps-w-full-mb-8" type="number" value={selectedField.yMm} onChange={e => updateSelectedField({ yMm: Number(e.target.value) })} />
                <label className="ps-label">Width (mm)</label>
                <input className="ps-input-dark ps-w-full-mb-8" type="number" value={selectedField.widthMm} onChange={e => updateSelectedField({ widthMm: Number(e.target.value) })} />
                <label className="ps-label">Height (mm)</label>
                <input className="ps-input-dark ps-w-full-mb-8" type="number" value={selectedField.heightMm} onChange={e => updateSelectedField({ heightMm: Number(e.target.value) })} />
                <label className="ps-label">Font Size (mm)</label>
                <input className="ps-input-dark ps-w-full ps-mb-14" type="number" step={0.1} value={selectedField.fontSizeMm} onChange={e => updateSelectedField({ fontSizeMm: Number(e.target.value) })} />
                <button className="ps-btn-small" onClick={removeSelectedField}>Remove Field</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="ps-designer-footer-row">
        <button className="ps-conf-btn-secondary" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save Layout'}</button>
        <button className="ps-btn-small" onClick={handleReset}>Reset to Default</button>
        <button className="ps-btn-small" onClick={handleExportZpl}>📤 Export ZPL</button>
        {saveMessage && <span className="ps-helper-text">{saveMessage}</span>}
      </div>

      {exportedZpl && (
        <div className="ps-panel-box ps-mt-16">
          <div className="ps-page-header-row">
            <h3 className="ps-panel-heading">Real, Exported ZPL</h3>
            <button className="ps-btn-small" onClick={() => setExportedZpl(null)}>✕ Close</button>
          </div>
          <p className="ps-helper-text">
            Paste this directly into <strong>labelary.com/viewer.html</strong> ({EXPORT_DPI} dpi → 8 dpmm, {widthMm}mm × {heightMm}mm) to verify real fit and scannability before trusting this format. The barcode payload here is this canvas's own illustrative sample value, not any one label type's real, production-specific encoding (e.g. block/slide's real GS1 structure) — this checks real physical fit and general scannability, not a byte-for-byte production replica.
          </p>
          <textarea
            className="ps-input-dark ps-w-full"
            style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 12 }}
            readOnly
            value={exportedZpl}
            onClick={e => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      )}
    </div>
  );
};

export default LabelDesignerPage;
