// src/components/ClientDictionary/IdentifierFormatsTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: relocated from
// Config/Integrations/IdentifierFormatsSection.tsx (now deleted), same
// real move LIS Integration made — out of a standalone, globally-scoped
// System screen and into the Facility editor, since the real, correct
// scope for "which identifier formats are enabled" is Enterprise-
// default-with-override (Facility.identifierFormats), not one global
// value shared by every organisation in the deployment. Real reasoning
// confirmed directly: a format's own real relevance is partly driven
// by LisPreset (copath/epic_beaker/sunquest/etc.), and "a Trust or
// Multihospital would generally have one LIS" applies here exactly as
// it did for LIS Integration - the same shared system that determines
// routing also determines which identifier/barcode formats it
// actually produces.
//
// Real, deliberate scope: jurisdiction-based candidate filtering
// (which formats are even relevant) stays exactly where it already
// correctly was - Facility.jurisdiction - just resolved from the
// facility being edited now, not SystemConfig's own global default.
// The real, separate approach for globally-scoped consumers with no
// facility context (ScannerProvider, CaseSearchBar, SearchPage) lives
// in hooks/useEnabledIdentifierFormats.ts - a real union across every
// Enterprise's own enabled set, confirmed directly ("1 is fine") as
// the right approach for that different, narrower problem.
//
// Kept as its own file, not inlined into ClientEditorModal.tsx
// directly - this is a real, substantial screen (format rows, a live
// test tool, a simulate-scan tool, LIS-preset filtering), and
// ClientEditorModal.tsx is already large. Same "one file per real
// concern, imported into the parent" pattern this app already uses
// throughout Config/.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import '../../pathscribe.css';
import { useScanner } from '../../contexts/ScannerProvider';
import { useAuditLog } from '../Audit/useAuditLog';
import {
  IDENTIFIER_FORMAT_LIBRARY,
  JURISDICTION_LOCALE,
  PATIENT_ID_BY_JURISDICTION,
  type IdentifierFormat,
  type IdentifierKind,
  type LisPreset,
} from '../../types/systemConfig';
import type { Facility, FacilityIdentifierFormatSelection } from '../../services/facilities/IFacilityService';
import { dateFormatHint } from '../../utils/formatDate';

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<IdentifierKind, string> = {
  accession:    'Accession Number',
  mrn:          'Patient Identifier',
  slide:        'Slide Barcode',
  requisition:  'Requisition Number',
  block:        'Block / Cassette ID',
  external_ref: 'External Reference',
};

const KIND_COLOURS: Record<IdentifierKind, string> = {
  accession:    '#8b5cf6',
  mrn:          '#0891B2',
  slide:        '#10b981',
  requisition:  '#f59e0b',
  block:        '#64748b',
  external_ref: '#6366f1',
};

const BARCODE_LABELS: Record<string, string> = {
  '1d_code128':    '1D Code 128',
  '1d_code39':     '1D Code 39',
  '2d_datamatrix': '2D DataMatrix',
  '2d_qr':         '2D QR',
  '2d_pdf417':     '2D PDF417',
};

const LIS_OPTIONS: { value: LisPreset; label: string }[] = [
  { value: 'generic',       label: 'Generic / All' },
  { value: 'copath',        label: 'CoPath' },
  { value: 'epic_beaker',   label: 'Epic Beaker' },
  { value: 'sunquest',      label: 'Sunquest' },
  { value: 'cerner_pathnet',label: 'Cerner PathNet' },
  { value: 'meditech',      label: 'Meditech' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const testPattern = (pattern: string, value: string): boolean => {
  try { return new RegExp(pattern).test(value); } catch { return false; }
};

// ── Format row ────────────────────────────────────────────────────────────────

const FormatRow: React.FC<{
  format:    IdentifierFormat;
  onToggle:  (id: string, enabled: boolean) => void;
}> = ({ format, onToggle }) => {
  const [testValue,  setTestValue]  = useState('');
  const [showRegex,  setShowRegex]  = useState(false);

  const matches   = testValue ? testPattern(format.pattern, testValue) : null;
  const kindColor = KIND_COLOURS[format.kind];
  const is2D      = format.barcodeTypes.some(b => b.startsWith('2d'));

  return (
    <div className={`ps-idf-row${format.enabled ? '' : ' ps-idf-row--disabled'}`}>

      {/* Header row */}
      <div className="ps-idf-row-header">
        <div className="ps-idf-row-left">
          <span
            className="ps-idf-kind-badge"
            style={{ background: kindColor + '22', color: kindColor, border: `1px solid ${kindColor}44` }}
          >
            {KIND_LABELS[format.kind]}
          </span>
          <span className="ps-idf-row-label">{format.label}</span>
          {format.tier === 1 && (
            <span className="ps-idf-tier-badge ps-idf-tier-badge--1">Tier 1 · Search</span>
          )}
          {format.tier === 2 && (
            <span className="ps-idf-tier-badge ps-idf-tier-badge--2">Tier 2 · Internal</span>
          )}
          {format.navigateToCaseOnMatch && (
            <span className="ps-idf-nav-badge">⚡ Opens case directly</span>
          )}
          {is2D && (
            <span className="ps-idf-barcode-badge ps-idf-barcode-badge--2d">2D</span>
          )}
        </div>
        <div className="ps-idf-row-right">
          <div
            className={`ps-toggle-track${format.enabled ? ' on' : ' off'}`}
            onClick={() => onToggle(format.id, !format.enabled)}
          >
            <div className="ps-toggle-thumb" />
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="ps-idf-desc">{format.description}</div>

      {/* Barcode types */}
      <div className="ps-idf-barcodes">
        {format.barcodeTypes.map(b => (
          <span key={b} className="ps-idf-barcode-chip">{BARCODE_LABELS[b] ?? b}</span>
        ))}
      </div>

      {/* Test field */}
      {format.enabled && (
        <div className="ps-idf-test-row">
          <div className="ps-idf-test-field">
            <input
              className={`ps-idf-test-input${matches === false ? ' ps-idf-test-input--fail' : matches === true ? ' ps-idf-test-input--pass' : ''}`}
              value={testValue}
              onChange={e => setTestValue(e.target.value)}
              placeholder={is2D
                ? `Scan a ${format.barcodeTypes[0]} barcode or paste payload…`
                : `Type or scan a value (e.g. ${format.example})`}
              spellCheck={false}
            />
            {testValue && matches !== null && (
              <span className={`ps-idf-test-result${matches ? ' ps-idf-test-result--pass' : ' ps-idf-test-result--fail'}`}>
                {matches ? '✓ match' : '✗ no match'}
              </span>
            )}
          </div>
          {testValue && matches !== null && (
            <div className={`ps-idf-test-banner${matches ? ' ps-idf-test-banner--pass' : ' ps-idf-test-banner--fail'}`}>
              {matches
                ? `✓ "${testValue}" matches — will be detected as ${KIND_LABELS[format.kind]}${format.navigateToCaseOnMatch ? ' and open the case directly' : ''}`
                : `✗ "${testValue}" does not match — check your test value`}
            </div>
          )}
        </div>
      )}

      {/* Regex toggle — read-only */}
      <div className="ps-idf-regex-toggle">
        <button
          className="ps-idf-regex-btn"
          onClick={() => setShowRegex(v => !v)}
        >
          {showRegex ? 'Hide pattern' : 'Show pattern'}
        </button>
        {format.payload2DSchema && (
          <span className="ps-idf-schema-hint">2D schema: {format.payload2DSchema}</span>
        )}
      </div>
      {showRegex && (
        <div className="ps-idf-regex-display">
          <code>{format.pattern}</code>
          <span className="ps-idf-regex-note">System-defined — not editable. Submit an enhancement request to modify.</span>
        </div>
      )}

    </div>
  );
};

// ── Simulate a scan ──────────────────────────────────────────────────────────
// Real, per direct guidance: this tests the real, live, GLOBAL union
// of every Enterprise's own enabled formats (useEnabledIdentifierFormats,
// which useScanner() is already backed by) - not just the one
// Enterprise/facility currently being edited here. That's a genuine,
// deliberate mismatch worth being upfront about: this tool answers
// "would a real scan be recognized right now, app-wide," which is a
// real, useful question regardless of which facility's editor it's
// launched from.

const SimulateScanTool: React.FC = () => {
  const { simulateScan, lastScan } = useScanner();
  const [value, setValue] = useState('');
  const [fired, setFired] = useState(false);

  const handleRun = () => {
    if (!value.trim()) return;
    setFired(true);
    simulateScan(value);
  };

  return (
    <div className="ps-idf-locale-card">
      <div className="ps-idf-locale-row ps-idf-simulate-label-row">
        <span className="ps-idf-locale-label">Simulate a scan (no scanner needed)</span>
      </div>
      <div className="ps-idf-simulate-row">
        <input
          className="ps-idf-test-input ps-idf-simulate-input"
          value={value}
          onChange={e => { setValue(e.target.value); setFired(false); }}
          onKeyDown={e => { if (e.key === 'Enter') handleRun(); }}
          placeholder="Type a value exactly as it would scan, e.g. SP26-4200 or 943 476 5919"
          spellCheck={false}
        />
        <button className="ps-btn-secondary ps-idf-simulate-btn" onClick={handleRun}>Simulate Scan</button>
      </div>
      {fired && lastScan && (
        <div className={`ps-idf-test-banner${lastScan.type !== 'unknown' ? ' ps-idf-test-banner--pass' : ' ps-idf-test-banner--fail'}`}>
          {lastScan.type === 'accession' && `✓ Detected as Accession Number — navigating to /case/${lastScan.matchedAccession}/synoptic, same as a real scan.`}
          {lastScan.type === 'mrn' && `✓ Detected as a Patient ID (MRN/NHS/CHI/etc.) format.`}
          {lastScan.type === 'unknown' && `✗ Didn't match any enabled Accession or Patient ID format app-wide. Check the formats are toggled on for the relevant Enterprise, or that this value's shape matches one of their patterns.`}
        </div>
      )}
      <div className="ps-idf-regex-note ps-idf-simulate-note">
        This runs the exact same detection code a real scan triggers, against the real, live union
        of every Enterprise's own enabled formats — if the value matches an enabled Accession or
        Slide format, this will navigate away from this page, same as scanning the physical label would.
      </div>
    </div>
  );
};

// ── Main tab ──────────────────────────────────────────────────────────────────

interface IdentifierFormatsTabProps {
  facility: Pick<Facility, 'jurisdiction' | 'parentId' | 'identifierFormats' | 'isEnterprise'>;
  allFacilities: Facility[];
  onChange: (selection: FacilityIdentifierFormatSelection | null) => void;
}

const IdentifierFormatsTab: React.FC<IdentifierFormatsTabProps> = ({ facility, allFacilities, onChange }) => {
  const { log } = useAuditLog();
  const jurisdiction = facility.jurisdiction;
  const jLocale      = JURISDICTION_LOCALE[jurisdiction];
  const patientId    = PATIENT_ID_BY_JURISDICTION[jurisdiction];

  const parentEnterprise = facility.parentId ? allFacilities.find(f => f.id === facility.parentId) : undefined;

  // Real, per direct guidance: a non-Enterprise facility gets an
  // explicit override toggle, off by default (inheriting), same real
  // shape as LIS Routing's own override toggle in ClientEditorModal.tsx.
  const [overriding, setOverriding] = useState(!!facility.identifierFormats);

  // Initialise from the facility's own real selection (its own
  // override, or - on an Enterprise - its own real default), falling
  // back to this facility's own real jurisdiction-matched library
  // defaults when nothing has been configured yet, same real fallback
  // behavior this app already had before this feature.
  const initFormats = useCallback((): IdentifierFormat[] => {
    const enabledIds = facility.identifierFormats?.enabledFormatIds;
    return IDENTIFIER_FORMAT_LIBRARY.map(f => {
      if (enabledIds) return { ...f, enabled: enabledIds.includes(f.id) };
      const jurisdictionMatch = f.jurisdictions.length === 0 || f.jurisdictions.includes(jurisdiction);
      return { ...f, enabled: jurisdictionMatch && f.enabled };
    });
  }, [facility.identifierFormats, jurisdiction]);

  const [formats,    setFormats]    = useState<IdentifierFormat[]>(initFormats);
  const [lisFilter,  setLisFilter]  = useState<LisPreset>('generic');
  const [hasChanges, setHasChanges] = useState(false);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    setFormats(prev => prev.map(f => f.id === id ? { ...f, enabled } : f));
    setHasChanges(true);
    const fmt = formats.find(f => f.id === id);
    if (fmt) log('identifier_format_toggled', { formatId: id, label: fmt.label, enabled });
  }, [formats, log]);

  const handleSave = () => {
    const enabledFormatIds = formats.filter(f => f.enabled).map(f => f.id);
    onChange({ enabledFormatIds });
    log('identifier_formats_saved', {
      jurisdiction,
      enabledCount: enabledFormatIds.length,
    });
    setHasChanges(false);
  };

  const handleToggleOverride = (checked: boolean) => {
    setOverriding(checked);
    if (!checked) {
      onChange(null);
      setHasChanges(false);
    } else {
      setFormats(initFormats());
    }
  };

  // Filter by LIS preset
  const visibleFormats = formats.filter(f =>
    lisFilter === 'generic'
      ? true
      : f.lisPresets.length === 0 || f.lisPresets.includes(lisFilter)
  );

  const tier1 = visibleFormats.filter(f => f.tier === 1);
  const tier2 = visibleFormats.filter(f => f.tier === 2);

  const enabledPatientIdFormats = formats.filter(f => f.kind === 'mrn' && f.enabled);

  const showEditor = facility.isEnterprise || overriding;

  return (
    <div className="ps-idf-shell">

      {/* Header */}
      <div className="ps-idf-header">
        <div className="ps-idf-header-text">
          <h3 className="ps-idf-title">Identifier Formats</h3>
          <p className="ps-idf-subtitle">
            {facility.isEnterprise
              ? "Enable the identifier patterns this Enterprise's own shared LIS produces — multiple jurisdictions can be enabled at once (e.g. US and UK simultaneously). Every affiliate inherits this unless it sets its own override."
              : "Enable the identifier patterns this facility uses, overriding its Enterprise parent's own default."}
            {' '}Slide barcodes (Tier 1) open the case directly in the Synoptic Report page when scanned.
          </p>
        </div>
        {showEditor && (
          <div className="ps-idf-header-actions">
            {hasChanges && <span className="ps-idf-unsaved">● Unsaved changes</span>}
            {hasChanges && (
              <button className="ps-conf-btn-primary" onClick={handleSave}>Save Changes</button>
            )}
          </div>
        )}
      </div>

      {!facility.isEnterprise && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
          <input
            type="checkbox"
            id="override-identifier-formats"
            checked={overriding}
            onChange={e => handleToggleOverride(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#0891b2', cursor: 'pointer' }}
          />
          <label htmlFor="override-identifier-formats" style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', cursor: 'pointer' }}>
            Override Enterprise identifier formats for this facility
          </label>
        </div>
      )}

      {!showEditor && (
        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#94a3b8' }}>
          Not overridden — this facility uses {parentEnterprise
            ? <><strong>{parentEnterprise.name}</strong>'s own enabled formats</>
            : "its Enterprise parent's own enabled formats"} unchanged.
        </div>
      )}

      {showEditor && (
        <>
          {/* Jurisdiction & locale info — a real, per-facility fallback
              default, not necessarily this facility's own live per-case
              value (a case still resolves from its own Submitting
              Client's jurisdiction first). */}
          <div className="ps-idf-locale-card">
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">This facility's jurisdiction</span>
              <span className="ps-idf-locale-value">{jurisdiction}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">Date format</span>
              <span className="ps-idf-locale-value">{dateFormatHint(jurisdiction)}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">Time format</span>
              <span className="ps-idf-locale-value">{jLocale.timeFormat === '24h' ? '24-hour' : '12-hour'}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">Locale</span>
              <span className="ps-idf-locale-value">{jLocale.locale}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">Spell check</span>
              <span className="ps-idf-locale-value">{jLocale.spellLang}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">Patient ID standard{enabledPatientIdFormats.length > 1 ? 's' : ''}</span>
              <span className="ps-idf-locale-value">
                {enabledPatientIdFormats.length > 0
                  ? enabledPatientIdFormats.map(f => `${f.label} — ${f.example}`).join(', ')
                  : `${patientId.label} — ${patientId.format} (default — no MRN-kind format currently enabled)`}
              </span>
            </div>
          </div>

          <SimulateScanTool />

          {/* LIS preset filter */}
          <div className="ps-idf-lis-row">
            <span className="ps-idf-lis-label">Filter by LIS:</span>
            <div className="ps-idf-lis-options">
              {LIS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`ps-idf-lis-btn${lisFilter === opt.value ? ' ps-idf-lis-btn--active' : ''}`}
                  onClick={() => setLisFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tier 1 — Search box + direct navigation */}
          <div className="ps-idf-section">
            <div className="ps-idf-section-header">
              <span className="ps-idf-section-title">Tier 1 — Smart Search & Direct Navigation</span>
              <span className="ps-idf-section-desc">
                These formats are detected in the Search identifier box.
                Slide barcodes (⚡) navigate directly to the Synoptic Report page.
              </span>
            </div>
            <div className="ps-idf-list">
              {tier1.length === 0
                ? <div className="ps-idf-empty">No Tier 1 formats available for this LIS filter.</div>
                : tier1.map(f => <FormatRow key={f.id} format={f} onToggle={handleToggle} />)
              }
            </div>
          </div>

          {/* Tier 2 — Internal mapping */}
          <div className="ps-idf-section">
            <div className="ps-idf-section-header">
              <span className="ps-idf-section-title">Tier 2 — Internal Mapping</span>
              <span className="ps-idf-section-desc">
                Used by the Computational Sidecar for result-to-specimen mapping and HL7 OBR segment matching.
                Not detected in the Search box.
              </span>
            </div>
            <div className="ps-idf-list">
              {tier2.length === 0
                ? <div className="ps-idf-empty">No Tier 2 formats available for this LIS filter.</div>
                : tier2.map(f => <FormatRow key={f.id} format={f} onToggle={handleToggle} />)
              }
            </div>
          </div>

          {/* Enhancement request note */}
          <div className="ps-idf-enhance-note">
            Identifier patterns are system-defined and validated. To add a new format or modify an existing one,
            submit an Enhancement Request via the nav bar.
          </div>
        </>
      )}

    </div>
  );
};

export default IdentifierFormatsTab;
