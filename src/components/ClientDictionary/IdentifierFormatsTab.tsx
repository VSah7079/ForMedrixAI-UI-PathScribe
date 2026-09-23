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
//
// i18n note: this file and its FacilityDictionary twin are byte-for-
// byte identical apart from file-path/component-name references in
// comments (confirmed via diff) — no rendered string differs between
// them — so, unlike ClientEditorModal.tsx/FacilityEditorModal.tsx
// (which have real wording differences and so keep separate
// namespaces), both copies share a single `identifierFormatsTab`
// locale namespace rather than duplicating one identical translation
// set under two names.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const testPattern = (pattern: string, value: string): boolean => {
  try { return new RegExp(pattern).test(value); } catch { return false; }
};

const BARCODE_KEY: Record<string, string> = {
  '1d_code128':    'code128',
  '1d_code39':     'code39',
  '2d_datamatrix': 'datamatrix',
  '2d_qr':         'qr',
  '2d_pdf417':     'pdf417',
};

// ── Format row ────────────────────────────────────────────────────────────────

const FormatRow: React.FC<{
  format:    IdentifierFormat;
  kindLabels: Record<IdentifierKind, string>;
  barcodeLabels: Record<string, string>;
  onToggle:  (id: string, enabled: boolean) => void;
}> = ({ format, kindLabels, barcodeLabels, onToggle }) => {
  const { t } = useTranslation();
  const [testValue,  setTestValue]  = useState('');
  const [showRegex,  setShowRegex]  = useState(false);

  const KIND_COLOURS: Record<IdentifierKind, string> = {
    accession:    '#8b5cf6',
    mrn:          '#0891B2',
    slide:        '#10b981',
    requisition:  '#f59e0b',
    block:        '#64748b',
    external_ref: '#6366f1',
  };

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
            {kindLabels[format.kind]}
          </span>
          <span className="ps-idf-row-label">{format.label}</span>
          {format.tier === 1 && (
            <span className="ps-idf-tier-badge ps-idf-tier-badge--1">{t('identifierFormatsTab.tier1Badge')}</span>
          )}
          {format.tier === 2 && (
            <span className="ps-idf-tier-badge ps-idf-tier-badge--2">{t('identifierFormatsTab.tier2Badge')}</span>
          )}
          {format.navigateToCaseOnMatch && (
            <span className="ps-idf-nav-badge">{t('identifierFormatsTab.navBadge')}</span>
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
          <span key={b} className="ps-idf-barcode-chip">{barcodeLabels[b] ?? b}</span>
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
                ? t('identifierFormatsTab.testPlaceholder2d', { type: format.barcodeTypes[0] })
                : t('identifierFormatsTab.testPlaceholderGeneric', { example: format.example })}
              spellCheck={false}
            />
            {testValue && matches !== null && (
              <span className={`ps-idf-test-result${matches ? ' ps-idf-test-result--pass' : ' ps-idf-test-result--fail'}`}>
                {matches ? t('identifierFormatsTab.testMatch') : t('identifierFormatsTab.testNoMatch')}
              </span>
            )}
          </div>
          {testValue && matches !== null && (
            <div className={`ps-idf-test-banner${matches ? ' ps-idf-test-banner--pass' : ' ps-idf-test-banner--fail'}`}>
              {matches
                ? t('identifierFormatsTab.testBannerPass', {
                    value: testValue,
                    kind: kindLabels[format.kind],
                    navSuffix: format.navigateToCaseOnMatch ? t('identifierFormatsTab.testBannerNavSuffix') : '',
                  })
                : t('identifierFormatsTab.testBannerFail', { value: testValue })}
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
          {showRegex ? t('identifierFormatsTab.hidePattern') : t('identifierFormatsTab.showPattern')}
        </button>
        {format.payload2DSchema && (
          <span className="ps-idf-schema-hint">{t('identifierFormatsTab.schemaHint', { schema: format.payload2DSchema })}</span>
        )}
      </div>
      {showRegex && (
        <div className="ps-idf-regex-display">
          <code>{format.pattern}</code>
          <span className="ps-idf-regex-note">{t('identifierFormatsTab.regexNote')}</span>
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
  const { t } = useTranslation();
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
        <span className="ps-idf-locale-label">{t('identifierFormatsTab.simulateLabel')}</span>
      </div>
      <div className="ps-idf-simulate-row">
        <input
          className="ps-idf-test-input ps-idf-simulate-input"
          value={value}
          onChange={e => { setValue(e.target.value); setFired(false); }}
          onKeyDown={e => { if (e.key === 'Enter') handleRun(); }}
          placeholder={t('identifierFormatsTab.simulatePlaceholder')}
          spellCheck={false}
        />
        <button className="ps-btn-secondary ps-idf-simulate-btn" onClick={handleRun}>{t('identifierFormatsTab.simulateBtn')}</button>
      </div>
      {fired && lastScan && (
        <div className={`ps-idf-test-banner${lastScan.type !== 'unknown' ? ' ps-idf-test-banner--pass' : ' ps-idf-test-banner--fail'}`}>
          {lastScan.type === 'accession' && t('identifierFormatsTab.simulateResultAccession', { accession: lastScan.matchedAccession })}
          {lastScan.type === 'mrn' && t('identifierFormatsTab.simulateResultMrn')}
          {lastScan.type === 'unknown' && t('identifierFormatsTab.simulateResultUnknown')}
        </div>
      )}
      <div className="ps-idf-regex-note ps-idf-simulate-note">
        {t('identifierFormatsTab.simulateNote')}
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
  const { t } = useTranslation();
  const { log } = useAuditLog();
  const jurisdiction = facility.jurisdiction;
  const jLocale      = JURISDICTION_LOCALE[jurisdiction];
  const patientId    = PATIENT_ID_BY_JURISDICTION[jurisdiction];

  const KIND_LABELS: Record<IdentifierKind, string> = {
    accession:    t('identifierFormatsTab.kind.accession'),
    mrn:          t('identifierFormatsTab.kind.mrn'),
    slide:        t('identifierFormatsTab.kind.slide'),
    requisition:  t('identifierFormatsTab.kind.requisition'),
    block:        t('identifierFormatsTab.kind.block'),
    external_ref: t('identifierFormatsTab.kind.externalRef'),
  };

  const BARCODE_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(BARCODE_KEY).map(([id, key]) => [id, t(`identifierFormatsTab.barcode.${key}`)])
  );

  const LIS_OPTIONS: { value: LisPreset; label: string }[] = [
    { value: 'generic',       label: t('identifierFormatsTab.lisGeneric') },
    { value: 'copath',        label: 'CoPath' },
    { value: 'epic_beaker',   label: 'Epic Beaker' },
    { value: 'sunquest',      label: 'Sunquest' },
    { value: 'cerner_pathnet',label: 'Cerner PathNet' },
    { value: 'meditech',      label: 'Meditech' },
  ];

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
          <h3 className="ps-idf-title">{t('identifierFormatsTab.title')}</h3>
          <p className="ps-idf-subtitle">
            {facility.isEnterprise
              ? t('identifierFormatsTab.subtitleEnterprise')
              : t('identifierFormatsTab.subtitleFacility')}
            {' '}{t('identifierFormatsTab.subtitleSuffix')}
          </p>
        </div>
        {showEditor && (
          <div className="ps-idf-header-actions">
            {hasChanges && <span className="ps-idf-unsaved">{t('identifierFormatsTab.unsaved')}</span>}
            {hasChanges && (
              <button className="ps-conf-btn-primary" onClick={handleSave}>{t('identifierFormatsTab.saveChanges')}</button>
            )}
          </div>
        )}
      </div>

      {!facility.isEnterprise && (
        <div className="ps-idf-override-row">
          <input
            type="checkbox"
            id="override-identifier-formats"
            checked={overriding}
            onChange={e => handleToggleOverride(e.target.checked)}
            className="ps-idf-override-checkbox"
          />
          <label htmlFor="override-identifier-formats" className="ps-idf-override-label">
            {t('identifierFormatsTab.overrideLabel')}
          </label>
        </div>
      )}

      {!showEditor && (
        <div className="ps-idf-infobox">
          {t('identifierFormatsTab.notOverriddenPrefix')} {parentEnterprise
            ? <><strong>{parentEnterprise.name}</strong>{t('identifierFormatsTab.usesParentDefaultSuffix')}</>
            : t('identifierFormatsTab.usesEnterpriseParentDefault')} {t('identifierFormatsTab.unchanged')}
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
              <span className="ps-idf-locale-label">{t('identifierFormatsTab.jurisdictionLabel')}</span>
              <span className="ps-idf-locale-value">{jurisdiction}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">{t('identifierFormatsTab.dateFormatLabel')}</span>
              <span className="ps-idf-locale-value">{dateFormatHint(jurisdiction)}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">{t('identifierFormatsTab.timeFormatLabel')}</span>
              <span className="ps-idf-locale-value">{jLocale.timeFormat === '24h' ? t('identifierFormatsTab.hour24') : t('identifierFormatsTab.hour12')}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">{t('identifierFormatsTab.localeLabel')}</span>
              <span className="ps-idf-locale-value">{jLocale.locale}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">{t('identifierFormatsTab.spellCheckLabel')}</span>
              <span className="ps-idf-locale-value">{jLocale.spellLang}</span>
            </div>
            <div className="ps-idf-locale-row">
              <span className="ps-idf-locale-label">{t('identifierFormatsTab.patientIdStandard', { count: Math.max(enabledPatientIdFormats.length, 1) })}</span>
              <span className="ps-idf-locale-value">
                {enabledPatientIdFormats.length > 0
                  ? enabledPatientIdFormats.map(f => `${f.label} — ${f.example}`).join(', ')
                  : t('identifierFormatsTab.patientIdFallback', { label: patientId.label, format: patientId.format })}
              </span>
            </div>
          </div>

          <SimulateScanTool />

          {/* LIS preset filter */}
          <div className="ps-idf-lis-row">
            <span className="ps-idf-lis-label">{t('identifierFormatsTab.lisFilterLabel')}</span>
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
              <span className="ps-idf-section-title">{t('identifierFormatsTab.tier1Title')}</span>
              <span className="ps-idf-section-desc">
                {t('identifierFormatsTab.tier1Desc')}
              </span>
            </div>
            <div className="ps-idf-list">
              {tier1.length === 0
                ? <div className="ps-idf-empty">{t('identifierFormatsTab.tier1Empty')}</div>
                : tier1.map(f => <FormatRow key={f.id} format={f} kindLabels={KIND_LABELS} barcodeLabels={BARCODE_LABELS} onToggle={handleToggle} />)
              }
            </div>
          </div>

          {/* Tier 2 — Internal mapping */}
          <div className="ps-idf-section">
            <div className="ps-idf-section-header">
              <span className="ps-idf-section-title">{t('identifierFormatsTab.tier2Title')}</span>
              <span className="ps-idf-section-desc">
                {t('identifierFormatsTab.tier2Desc')}
              </span>
            </div>
            <div className="ps-idf-list">
              {tier2.length === 0
                ? <div className="ps-idf-empty">{t('identifierFormatsTab.tier2Empty')}</div>
                : tier2.map(f => <FormatRow key={f.id} format={f} kindLabels={KIND_LABELS} barcodeLabels={BARCODE_LABELS} onToggle={handleToggle} />)
              }
            </div>
          </div>

          {/* Enhancement request note */}
          <div className="ps-idf-enhance-note">
            {t('identifierFormatsTab.enhanceNote')}
          </div>
        </>
      )}

    </div>
  );
};

export default IdentifierFormatsTab;
