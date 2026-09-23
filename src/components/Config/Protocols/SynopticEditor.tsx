/**
 * components/Config/Protocols/SynopticEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full synoptic template builder — reached via:
 *   /template-editor/new              → blank template
 *   /template-editor/:templateId      → edit existing draft
 *   /template-editor/:templateId?mode=duplicate → clone from published
 *
 * Features:
 *   • Add / rename / reorder / delete sections
 *   • Add / edit / reorder / delete fields per section
 *   • Field types: Dropdown, Radio, Checkboxes, Numeric, Free Text, Long Text
 *   • Per-field SNOMED CT + ICD-10 coding
 *   • Per-option SNOMED CT + ICD-10 coding (answer-level coding)
 *   • Required / optional toggle per field
 *   • Inline option management (add / edit / remove)
 *   • Template metadata (name, source, version, category)
 *   • Coding coverage stats in header
 *   • Preview modal (pathologist view)
 *   • Submit for review → navigates back to library
 *
 * Drop-in path: src/components/Config/Protocols/SynopticEditor.tsx
 *
 * i18n (file-by-file sweep):
 *   `field.type`/`template.source`/`template.category` are real persisted
 *   enum values. Their display labels now go through translation-key maps
 *   (`FIELD_TYPES[*].labelKey`/`abbrKey`, `CATEGORY_LABEL_KEY`) — same
 *   `XXX_LABEL_KEY` pattern used throughout this sweep — while the raw
 *   enum values themselves are unchanged as data. `SOURCE_OPTIONS`
 *   (CAP/RCPath/ICCR/RCPA/Custom) are standardized pathology
 *   governing-body abbreviations — treated as fixed vocabulary, same
 *   posture as CPT/SNOMED/ICD codes elsewhere in this sweep, and left
 *   untranslated. "SNOMED CT"/"ICD-10/11" coding-input labels and the
 *   SCT/ICD badge prefixes are likewise fixed nomenclature.
 *
 * Business-logic extraction (this batch):
 *   Semantic-version bumping was duplicated three times (duplicate-on-load
 *   patch bump, duplicate-on-fallback-load patch bump, and the header's
 *   major/minor/patch bump buttons) with three slightly different inline
 *   implementations. Consolidated into one `bumpVersion(version, part)`
 *   helper, used at all three call sites.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PROTOCOL_REGISTRY } from './protocolShared';
import { saveDraft, submitForReview, getTemplate } from '../../../services/templates/templateService';
import { TerminologyAlertBanner } from './TerminologyAlertBanner';
import { useTerminologyAlerts } from '../../../hooks/useTerminologyAlerts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType = 'dropdown' | 'radio' | 'checkboxes' | 'numeric' | 'text' | 'longtext';

/** Real, per direct guidance's own confirmed decision (PS-272): extended
 *  for real, multi-value OR-logic (e.g. a real section revealed for
 *  Whole Body, Head-and-Neck, AND Thoraco-Abdominal specimen
 *  containers alike) — the real Autopsy Grossing Synoptic's own Part B
 *  rules genuinely need this; a single answerId alone can't express
 *  it. Kept additive: answerIds is optional and checked first when
 *  present; every real, existing single-value condition (answerId
 *  alone) keeps working completely unchanged. */
export interface VisibilityCondition { fieldId: string; answerId: string; answerIds?: string[]; }

/** Real, per direct guidance's own confirmed decision (PS-272):
 *  `lexiconTermKey` added alongside — never replacing — the real,
 *  existing `snomed`/`icd` fields, the same additive-migration-seam
 *  pattern already used elsewhere in this codebase. References a
 *  real PathologyLexiconEntry.termKey (types/cytology/PathologyLexicon.ts)
 *  whenever this option represents a real, specialized diagnostic/
 *  clinical term warranting the Managed Pathology Lexicon's own
 *  narrative/validation treatment — undefined for every real option
 *  that doesn't. */
export interface FieldOption { id: string; label: string; snomed: string; icd: string; lexiconTermKey?: string; }

export interface EditorField {
  id: string; label: string; type: FieldType; required: boolean;
  snomed: string; icd: string; options: FieldOption[];
  hint?: string; visibleWhen?: VisibilityCondition;
  /** Real, per direct guidance's own confirmed tiered-validation
   *  architecture: "Tier 2: Conditional Requirements... Make
   *  downstream fields required ONLY when triggered by a parent
   *  selection." Reuses the real, existing VisibilityCondition shape
   *  rather than inventing a second one — genuinely independent of
   *  `visibleWhen` on purpose: a real field can be visible but only
   *  softly validated (Tier 3), or required only under a specific
   *  parent answer that differs from whatever made it visible in the
   *  first place. `required` above stays real, unconditional Tier 1
   *  ("Section Status / Examiner Confirmation... Specimen/Organ
   *  Status") — never overloaded to also mean "required once
   *  visible." */
  requiredIf?: VisibilityCondition;
  /** Groups related fields under one marker card in the Biomarkers display
   *  (e.g. "ER Status", "ER % Positivity", "ER Intensity" all tagged
   *  markerGroup: "ER" render as one card with those details listed
   *  together, rather than as separate, disconnected badges). Only
   *  meaningful within a template's "biomarkers" section. Falls back to
   *  the field's own label if unset, so older/untagged templates still
   *  degrade gracefully rather than breaking. */
  markerGroup?: string;
}

export interface EditorSection {
  id: string; title: string; fields: EditorField[];
  collapsed: boolean; visibleWhen?: VisibilityCondition;
}

export interface EditorTemplate {
  id: string; name: string; source: string;
  version: string; category: string; sections: EditorSection[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const blankField = (): EditorField => ({
  id: uid(), label: '', type: 'dropdown', required: false, snomed: '', icd: '', options: [],
});

const blankSection = (): EditorSection => ({
  id: uid(), title: '', fields: [], collapsed: false,
});

const blankTemplate = (): EditorTemplate => ({
  id: uid(), name: '', source: 'Custom', version: '1.0.0', category: '', sections: [blankSection()],
});

/** Consolidated semver bump, replacing three separate inline
 *  implementations (see file header). Falls back to 1.0.0 for an
 *  empty/unset version, same fallback every original call site used. */
function bumpVersion(version: string, part: 'major' | 'minor' | 'patch'): string {
  const [maj, min, pat] = (version || '1.0.0').split('.').map(Number);
  if (part === 'major') return `${maj + 1}.0.0`;
  if (part === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${(pat || 0) + 1}`;
}

// field.type is a real persisted enum (EditorField.type) — labelKey/abbrKey
// are the translation-key indirection for its display, same XXX_LABEL_KEY
// pattern used throughout this sweep; `value` itself is untouched data.
const FIELD_TYPES: { value: FieldType; labelKey: string; abbrKey: string; color: string; hasOptions: boolean }[] = [
  { value: 'dropdown',   labelKey: 'synopticEditor.fieldType.dropdown.label',   abbrKey: 'synopticEditor.fieldType.dropdown.abbr',   color: '#0891B2', hasOptions: true  },
  { value: 'radio',      labelKey: 'synopticEditor.fieldType.radio.label',     abbrKey: 'synopticEditor.fieldType.radio.abbr',      color: '#7c3aed', hasOptions: true  },
  { value: 'checkboxes', labelKey: 'synopticEditor.fieldType.checkboxes.label',abbrKey: 'synopticEditor.fieldType.checkboxes.abbr', color: '#0d9488', hasOptions: true  },
  { value: 'numeric',    labelKey: 'synopticEditor.fieldType.numeric.label',   abbrKey: 'synopticEditor.fieldType.numeric.abbr',    color: '#b45309', hasOptions: false },
  { value: 'text',       labelKey: 'synopticEditor.fieldType.text.label',      abbrKey: 'synopticEditor.fieldType.text.abbr',       color: '#475569', hasOptions: false },
  { value: 'longtext',   labelKey: 'synopticEditor.fieldType.longtext.label',  abbrKey: 'synopticEditor.fieldType.longtext.abbr',   color: '#334155', hasOptions: false },
];

// Standardized pathology governing-body abbreviations (College of American
// Pathologists / Royal College of Pathologists / International
// Collaboration on Cancer Reporting / Royal College of Pathologists of
// Australasia / a "Custom" catch-all for this fixed set) — persisted as
// `template.source` and matched by substring elsewhere (e.g.
// TemplateRenderer.tsx's getTerms()). Treated as fixed vocabulary, same
// posture as CPT/SNOMED/ICD codes elsewhere in this sweep, and
// deliberately left untranslated.
const SOURCE_OPTIONS = ['CAP', 'RCPath', 'ICCR', 'RCPA', 'Custom'];

// template.category is a real persisted enum — CATEGORY_LABEL_KEY is the
// translation-key indirection for its pill display, same XXX_LABEL_KEY
// pattern used throughout this sweep.
const CATEGORY_OPTIONS = ['BREAST', 'COLON', 'PROSTATE', 'LUNG', 'LIVER', 'KIDNEY', 'PLACENTA', 'SKIN', 'OTHER'];
const CATEGORY_LABEL_KEY: Record<string, string> = {
  BREAST:   'synopticEditor.category.breast',
  COLON:    'synopticEditor.category.colon',
  PROSTATE: 'synopticEditor.category.prostate',
  LUNG:     'synopticEditor.category.lung',
  LIVER:    'synopticEditor.category.liver',
  KIDNEY:   'synopticEditor.category.kidney',
  PLACENTA: 'synopticEditor.category.placenta',
  SKIN:     'synopticEditor.category.skin',
  OTHER:    'synopticEditor.category.other',
};

// ─── Coverage calculation ─────────────────────────────────────────────────────

function calcCoverage(template: EditorTemplate) {
  const allFields  = template.sections.flatMap(s => s.fields);
  const total      = allFields.length;
  if (total === 0) return { snomed: 0, icd: 0, answerLevel: 0, totalFields: 0 };

  const snomedFields  = allFields.filter(f => f.snomed).length;
  const icdFields     = allFields.filter(f => f.icd).length;
  const optionFields  = allFields.filter(f => f.options.length > 0);
  const totalOptions  = optionFields.flatMap(f => f.options).length;
  const codedOptions  = optionFields.flatMap(f => f.options).filter(o => o.snomed).length;

  return {
    snomed:      Math.round((snomedFields / total) * 100),
    icd:         Math.round((icdFields    / total) * 100),
    answerLevel: totalOptions > 0 ? Math.round((codedOptions / totalOptions) * 100) : 0,
    totalFields: total,
  };
}

// ─── Style tokens ─────────────────────────────────────────────────────────────
// Kept for the handful of genuinely per-instance dynamic colors (field-type
// color, selected/hover/focus state) that stay inline below; every static
// use has moved to the new ps-syned-* CSS class family.

// Trimmed to the handful of tokens still referenced inline for genuinely
// dynamic values (focus/selected-state colors); every other original
// token (bg/surface/card/text) moved into the ps-syned-* CSS classes
// as literal hex values and is dead here now — removed.
const T = {
  border: '#334155', accent: '#0891B2', muted: '#94a3b8', dim: '#64748b', dimmer: '#475569',
};

// ─── Mini shared components ───────────────────────────────────────────────────

const IconBtn: React.FC<{ onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode }> = ({
  onClick, title, danger, children,
}) => (
  <button
    onClick={onClick} title={title}
    className={`ps-syned-icon-btn${danger ? ' ps-syned-icon-btn--danger' : ''}`}
  >
    {children}
  </button>
);

// `label` is fixed coding-system nomenclature ("SNOMED CT" / "ICD-10/11")
// — same posture as the SCT/ICD badge prefixes elsewhere in this sweep —
// and is deliberately a literal, not a translation key. `placeholderKey`
// IS translated: only its "e.g." prefix is real prose, the sample code
// itself is fixed data embedded in the translated string.
const CodingInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; color: string; placeholderKey: string }> = ({
  label, value, onChange, color, placeholderKey,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ flex: 1 }}>
      <div className="ps-syned-coding-input-label" style={{ color }}>{label}</div>
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={t(placeholderKey)}
        className="ps-syned-coding-input"
        style={{ ['--syned-focus' as any]: color }}
      />
    </div>
  );
};

// ─── OptionRow ────────────────────────────────────────────────────────────────

const OptionRow: React.FC<{
  option: FieldOption; index: number; total: number;
  onChange: (patch: Partial<FieldOption>) => void;
  onRemove: () => void; onMove: (dir: -1 | 1) => void;
}> = ({ option, index, total, onChange, onRemove, onMove }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: '4px' }}>
      <div className={`ps-syned-option-row${expanded ? ' ps-syned-option-row--expanded' : ''}`}>
        <span className="ps-syned-grab-handle">⠿</span>
        <input
          value={option.label} onChange={e => onChange({ label: e.target.value })}
          placeholder={t('synopticEditor.option.labelPlaceholder')}
          className="ps-syned-option-input"
        />
        {/* SCT/ICD are fixed coding-system prefixes — same posture as
            elsewhere in this sweep, left untranslated. */}
        {option.snomed && <span className="ps-syned-coding-badge ps-syned-coding-badge--snomed">SCT</span>}
        {option.icd    && <span className="ps-syned-coding-badge ps-syned-coding-badge--icd">ICD</span>}
        <IconBtn onClick={() => setExpanded(x => !x)} title={t('synopticEditor.option.editCodingTooltip')}>{expanded ? '▲' : '⌥'}</IconBtn>
        <IconBtn onClick={() => onMove(-1)} title={t('synopticEditor.common.moveUp')}  >{index === 0           ? ' ' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title={t('synopticEditor.common.moveDown')}>{index === total - 1   ? ' ' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title={t('synopticEditor.option.removeTooltip')}>✕</IconBtn>
      </div>
      {expanded && (
        <div className="ps-syned-option-coding-panel">
          <CodingInput label="SNOMED CT" value={option.snomed} onChange={v => onChange({ snomed: v })} color="#38bdf8" placeholderKey="synopticEditor.coding.optionSnomedPlaceholder" />
          <CodingInput label="ICD-10/11" value={option.icd} onChange={v => onChange({ icd: v })} color="#a78bfa" placeholderKey="synopticEditor.coding.optionIcdPlaceholder" />
        </div>
      )}
    </div>
  );
};

const CHOICE_TYPES = ['dropdown', 'radio', 'checkboxes'];

// ─── FieldCard ────────────────────────────────────────────────────────────────

const FieldCard: React.FC<{
  field: EditorField; index: number; total: number; template: EditorTemplate;
  onChange: (patch: Partial<EditorField>) => void;
  onRemove: () => void; onMove: (dir: -1 | 1) => void;
}> = ({ field, index, total, template, onChange, onRemove, onMove }) => {
  const { t } = useTranslation();
  const [open, setOpen]         = useState(() => CHOICE_TYPES.includes(field.type));
  const ftInfo                  = FIELD_TYPES.find(f => f.value === field.type)!;
  const [typeOpen, setTypeOpen] = useState(false);

  React.useEffect(() => { if (CHOICE_TYPES.includes(field.type)) setOpen(true); }, [field.type]);

  const addOption    = () => onChange({ options: [...field.options, { id: uid(), label: '', snomed: '', icd: '' }] });
  const updateOption = (optId: string, patch: Partial<FieldOption>) => onChange({ options: field.options.map(o => o.id === optId ? { ...o, ...patch } : o) });
  const removeOption = (optId: string) => onChange({ options: field.options.filter(o => o.id !== optId) });
  const moveOption   = (optId: string, dir: -1 | 1) => {
    const arr = [...field.options]; const i = arr.findIndex(o => o.id === optId);
    if (i + dir < 0 || i + dir >= arr.length) return;
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]]; onChange({ options: arr });
  };

  const hasCode = field.snomed || field.icd;

  return (
    <div style={{ marginBottom: '8px' }}>
      <div className={`ps-syned-field-header${open ? ' ps-syned-field-header--open' : ''}`}>
        <span className="ps-syned-grab-handle" style={{ fontSize: '13px' }}>⠿</span>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setTypeOpen(x => !x); }}
            title={t('synopticEditor.field.changeTypeTooltip')}
            className="ps-syned-type-badge-btn"
            style={{ borderColor: `${ftInfo.color}50`, background: `${ftInfo.color}18`, color: ftInfo.color }}
          >
            {t(ftInfo.abbrKey)} ▾
          </button>
          {typeOpen && (
            <div onClick={e => e.stopPropagation()} className="ps-syned-type-menu">
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.value}
                  onClick={() => { onChange({ type: ft.value, options: [] }); setTypeOpen(false); }}
                  className={`ps-syned-type-menu-item${field.type === ft.value ? ' ps-syned-type-menu-item--selected' : ''}`}
                  style={{
                    background: field.type === ft.value ? `${ft.color}18` : undefined,
                    color: field.type === ft.value ? ft.color : undefined,
                    fontWeight: field.type === ft.value ? 700 : 400,
                  }}
                >
                  <span className="ps-syned-type-menu-abbr" style={{ background: `${ft.color}20`, color: ft.color }}>{t(ft.abbrKey)}</span>
                  {t(ft.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={field.label} onChange={e => onChange({ label: e.target.value })}
          placeholder={t('synopticEditor.field.labelPlaceholder')}
          onClick={e => e.stopPropagation()}
          className="ps-syned-field-label-input"
          onFocus={e => e.currentTarget.select()}
        />

        <button onClick={e => { e.stopPropagation(); onChange({ required: !field.required }); }} className={`ps-syned-required-toggle${field.required ? ' ps-syned-required-toggle--required' : ''}`}>
          {field.required ? t('synopticEditor.field.requiredBadge') : t('synopticEditor.field.optionalBadge')}
        </button>

        {hasCode && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {field.snomed && <span className="ps-syned-coded-dot" style={{ background: '#38bdf8' }} title={t('synopticEditor.field.snomedCodedTooltip')} />}
            {field.icd    && <span className="ps-syned-coded-dot" style={{ background: '#a78bfa' }} title={t('synopticEditor.field.icdCodedTooltip')} />}
          </div>
        )}

        {field.visibleWhen && <span title={t('synopticEditor.common.hasConditionTooltip')} className="ps-syned-condition-badge">{t('synopticEditor.common.conditionalBadge')}</span>}

        <IconBtn onClick={() => setOpen(x => !x)} title={open ? t('synopticEditor.common.collapse') : t('synopticEditor.common.expand')}>
          <span className="ps-syned-chevron" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
        </IconBtn>
        <IconBtn onClick={() => onMove(-1)} title={t('synopticEditor.common.moveUp')}  >{index === 0         ? '' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title={t('synopticEditor.common.moveDown')}>{index === total - 1 ? '' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title={t('synopticEditor.field.deleteTooltip')}>🗑</IconBtn>
      </div>

      {open && (
        <div className="ps-syned-field-body">
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '160px', flexShrink: 0 }}>
              <label className="ps-syned-label">{t('synopticEditor.field.fieldTypeLabel')}</label>
              <select value={field.type} onChange={e => onChange({ type: e.target.value as FieldType, options: [] })} className="ps-syned-input ps-syned-select">
                {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{t(ft.abbrKey)} — {t(ft.labelKey)}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="ps-syned-label">{t('synopticEditor.field.hintLabel')} <span className="ps-syned-label-note">{t('synopticEditor.field.optionalTag')}</span></label>
              <input value={field.hint ?? ''} onChange={e => onChange({ hint: e.target.value })} placeholder={t('synopticEditor.field.hintPlaceholder')} className="ps-syned-input" />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label className="ps-syned-label">{t('synopticEditor.field.codingLabel')}</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <CodingInput label="SNOMED CT" value={field.snomed} onChange={v => onChange({ snomed: v })} color="#38bdf8" placeholderKey="synopticEditor.coding.fieldSnomedPlaceholder" />
              <CodingInput label="ICD-10/11" value={field.icd} onChange={v => onChange({ icd: v })} color="#a78bfa" placeholderKey="synopticEditor.coding.fieldIcdPlaceholder" />
            </div>
          </div>

          {ftInfo.hasOptions && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="ps-syned-label" style={{ marginBottom: 0 }}>{t('synopticEditor.field.answerOptionsLabel')} <span className="ps-syned-label-note" style={{ color: T.dimmer }}>{t('synopticEditor.field.answerOptionsHint')}</span></label>
                <button onClick={addOption} className="ps-syned-add-option-btn">{t('synopticEditor.field.addAnswerOptionButton')}</button>
              </div>
              {field.options.length === 0 && <div className="ps-syned-empty-note">{t('synopticEditor.field.noOptionsYet')}</div>}
              {field.options.map((opt, oi) => (
                <OptionRow key={opt.id} option={opt} index={oi} total={field.options.length} onChange={patch => updateOption(opt.id, patch)} onRemove={() => removeOption(opt.id)} onMove={dir => moveOption(opt.id, dir)} />
              ))}
            </div>
          )}
          <ConditionPicker condition={field.visibleWhen} template={template} excludeFieldId={field.id} onChange={c => onChange({ visibleWhen: c })} />
        </div>
      )}
    </div>
  );
};

// ─── SectionCard ──────────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  section: EditorSection; index: number; total: number; template: EditorTemplate;
  onChange: (patch: Partial<EditorSection>) => void;
  onRemove: () => void; onMove: (dir: -1 | 1) => void;
}> = ({ section, index, total, template, onChange, onRemove, onMove }) => {
  const { t } = useTranslation();
  const addField    = () => onChange({ fields: [...section.fields, blankField()] });
  const updateField = (fId: string, patch: Partial<EditorField>) => onChange({ fields: section.fields.map(f => f.id === fId ? { ...f, ...patch } : f) });
  const removeField = (fId: string) => onChange({ fields: section.fields.filter(f => f.id !== fId) });
  const moveField   = (fId: string, dir: -1 | 1) => {
    const arr = [...section.fields]; const i = arr.findIndex(f => f.id === fId);
    if (i + dir < 0 || i + dir >= arr.length) return;
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]]; onChange({ fields: arr });
  };

  return (
    <div className="ps-syned-section-card">
      <div
        className="ps-syned-section-header"
        style={{
          background: section.visibleWhen ? 'rgba(251,191,36,0.04)' : undefined,
          borderTop: section.visibleWhen ? '2px solid rgba(251,191,36,0.25)' : undefined,
          borderBottom: section.collapsed ? 'none' : `1px solid ${T.border}`,
        }}
      >
        <span className="ps-syned-grab-handle" style={{ fontSize: '14px' }}>⠿</span>
        <span className="ps-syned-section-num">§{index + 1}</span>
        <input
          value={section.title} onChange={e => onChange({ title: e.target.value })}
          placeholder={t('synopticEditor.section.titlePlaceholder')}
          className="ps-syned-section-title-input"
          onFocus={e => e.currentTarget.select()}
        />
        <span className="ps-syned-section-field-count">{t('synopticEditor.common.fieldCount', { count: section.fields.length })}</span>
        {section.visibleWhen && <span title={t('synopticEditor.common.hasConditionTooltip')} className="ps-syned-condition-badge">{t('synopticEditor.common.conditionalBadge')}</span>}
        <IconBtn onClick={() => onChange({ collapsed: !section.collapsed })} title={section.collapsed ? t('synopticEditor.common.expand') : t('synopticEditor.common.collapse')}>
          <span className="ps-syned-chevron" style={{ transform: section.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
        </IconBtn>
        <IconBtn onClick={() => onMove(-1)} title={t('synopticEditor.common.moveUp')}  >{index === 0         ? '' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title={t('synopticEditor.common.moveDown')}>{index === total - 1 ? '' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title={t('synopticEditor.section.deleteTooltip')}>🗑</IconBtn>
      </div>

      {!section.collapsed && (
        <div className="ps-syned-section-condition-wrap">
          <ConditionPicker condition={section.visibleWhen} template={template} onChange={c => onChange({ visibleWhen: c })} />
          <div style={{ height: '14px' }} />
        </div>
      )}

      {!section.collapsed && (
        <div className="ps-syned-section-body">
          {section.fields.length === 0 && <div className="ps-syned-empty-note ps-syned-empty-note--section">{t('synopticEditor.section.noFieldsYet')}</div>}
          {section.fields.map((field, fi) => (
            <FieldCard key={field.id} field={field} index={fi} total={section.fields.length} template={template} onChange={patch => updateField(field.id, patch)} onRemove={() => removeField(field.id)} onMove={dir => moveField(field.id, dir)} />
          ))}
          <button onClick={addField} className="ps-syned-add-field-btn">
            {t('synopticEditor.section.addFieldButton')}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Condition utilities ──────────────────────────────────────────────────────

function allChoiceFields(template: EditorTemplate): { id: string; label: string; options: FieldOption[] }[] {
  return template.sections.flatMap(s =>
    s.fields.filter(f => CHOICE_TYPES.includes(f.type) && f.label).map(f => ({ id: f.id, label: f.label, options: f.options }))
  );
}

export function isVisible(condition: VisibilityCondition | undefined, answers: Record<string, string | string[]>): boolean {
  if (!condition) return true;
  const val = answers[condition.fieldId];
  if (!val) return false;
  // Real, per PS-272's own confirmed multi-value extension — checked
  // first, before falling back to the original, real single-value
  // answerId check below, so every real, existing condition keeps
  // working completely unchanged.
  if (condition.answerIds && condition.answerIds.length > 0) {
    if (Array.isArray(val)) return val.some(v => condition.answerIds!.includes(v));
    return condition.answerIds.includes(val);
  }
  if (Array.isArray(val)) return val.includes(condition.answerId);
  return val === condition.answerId;
}

// ─── ConditionPicker ──────────────────────────────────────────────────────────

const ConditionPicker: React.FC<{
  condition: VisibilityCondition | undefined; template: EditorTemplate;
  excludeFieldId?: string; onChange: (c: VisibilityCondition | undefined) => void;
}> = ({ condition, template, excludeFieldId, onChange }) => {
  const { t }     = useTranslation();
  const choices   = allChoiceFields(template).filter(f => f.id !== excludeFieldId);
  const enabled   = !!condition;
  const srcField  = choices.find(f => f.id === condition?.fieldId);

  return (
    <div className={`ps-syned-condition-picker${enabled ? ' ps-syned-condition-picker--enabled' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: enabled ? '12px' : 0 }}>
        <button onClick={() => onChange(enabled ? undefined : { fieldId: '', answerId: '' })} className="ps-syned-condition-toggle" style={{ background: enabled ? '#f59e0b' : 'rgba(255,255,255,0.1)' }}>
          <span className="ps-syned-condition-toggle-knob" style={{ left: enabled ? '18px' : '2px' }} />
        </button>
        <span className="ps-syned-condition-status" style={{ color: enabled ? '#fbbf24' : T.dim }}>
          {enabled ? t('synopticEditor.condition.shownOnlyWhen') : t('synopticEditor.condition.alwaysVisible')}
        </span>
        {!enabled && choices.length === 0 && <span className="ps-syned-condition-hint">{t('synopticEditor.condition.addFieldFirstHint')}</span>}
      </div>

      {enabled && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="ps-syned-label" style={{ color: '#fbbf24' }}>{t('synopticEditor.condition.whenFieldLabel')}</label>
            <select
              value={condition?.fieldId ?? ''} onChange={e => onChange({ fieldId: e.target.value, answerId: '' })}
              className="ps-syned-input ps-syned-select"
              style={{ borderColor: condition?.fieldId ? T.border : '#f59e0b' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
              onBlur={e => (e.currentTarget.style.borderColor = condition?.fieldId ? T.border : '#f59e0b')}
            >
              <option value="">{t('synopticEditor.condition.pickFieldOption')}</option>
              {choices.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="ps-syned-label" style={{ color: '#fbbf24' }}>{t('synopticEditor.condition.answerIsLabel')}</label>
            <select
              value={condition?.answerId ?? ''} onChange={e => onChange({ ...condition!, answerId: e.target.value })} disabled={!srcField}
              className="ps-syned-input ps-syned-select"
              style={{ borderColor: condition?.answerId ? T.border : (srcField ? '#f59e0b' : T.border), opacity: srcField ? 1 : 0.5 }}
              onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
              onBlur={e => (e.currentTarget.style.borderColor = condition?.answerId ? T.border : (srcField ? '#f59e0b' : T.border))}
            >
              <option value="">{t('synopticEditor.condition.pickAnswerOption')}</option>
              {srcField?.options.map(o => <option key={o.id} value={o.id}>{o.label || t('synopticEditor.condition.unlabelledOption')}</option>)}
            </select>
          </div>
        </div>
      )}

      {enabled && condition?.fieldId && !condition?.answerId && <div className="ps-syned-condition-warning">{t('synopticEditor.condition.selectAnswerWarning')}</div>}
      {enabled && !condition?.fieldId && choices.length > 0  && <div className="ps-syned-condition-warning">{t('synopticEditor.condition.selectFieldWarning')}</div>}
      {enabled && choices.length === 0 && <div className="ps-syned-condition-warning ps-syned-condition-warning--error">{t('synopticEditor.condition.noChoiceFieldsWarning')}</div>}
    </div>
  );
};

// ─── Preview Modal (live — evaluates conditions) ──────────────────────────────

const PreviewModal: React.FC<{ template: EditorTemplate; onClose: () => void }> = ({ template, onClose }) => {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const setAnswer = (fieldId: string, val: string | string[]) => {
    setAnswers(prev => {
      const next = { ...prev, [fieldId]: val };
      template.sections.forEach(sec => {
        if (!isVisible(sec.visibleWhen, next)) { sec.fields.forEach(f => { delete next[f.id]; }); }
        else { sec.fields.forEach(f => { if (!isVisible(f.visibleWhen, next)) delete next[f.id]; }); }
      });
      return next;
    });
  };

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="ps-syned-preview-modal">
        <div className="ps-syned-preview-header">
          <div>
            <div className="ps-syned-preview-title">{template.name || t('synopticEditor.preview.untitledTemplate')}</div>
            <div className="ps-syned-preview-subtitle">{t('synopticEditor.preview.subtitle', { source: template.source, version: template.version })}</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => setAnswers({})} className="ps-syned-preview-reset-btn">{t('synopticEditor.preview.resetButton')}</button>
            <button onClick={onClose} className="ps-syned-preview-close-btn">✕</button>
          </div>
        </div>

        <div className="ps-syned-preview-body">
          {template.sections.map(sec => {
            const secVisible = isVisible(sec.visibleWhen, answers);
            return (
              <div
                key={sec.id}
                style={{
                  marginBottom: secVisible ? '28px' : 0,
                  transition: 'opacity 0.2s',
                  opacity: secVisible ? 1 : 0,
                  pointerEvents: secVisible ? 'auto' : 'none',
                  height: secVisible ? 'auto' : 0,
                  overflow: secVisible ? 'visible' : 'hidden',
                }}
              >
                {sec.visibleWhen && <div className="ps-syned-preview-conditional-label"><span>⟳</span> {t('synopticEditor.preview.conditionalSectionLabel')}</div>}
                <div className="ps-syned-preview-section-title">{sec.title}</div>

                {sec.fields.map(f => {
                  const fVisible = isVisible(f.visibleWhen, answers);
                  if (!secVisible) return null;
                  return (
                    <div key={f.id} style={{ marginBottom: fVisible ? '14px' : 0, maxHeight: fVisible ? '200px' : 0, overflow: 'hidden', opacity: fVisible ? 1 : 0, transition: 'all 0.2s ease', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                      <div style={{ width: '200px', flexShrink: 0 }}>
                        <div className="ps-syned-preview-field-label">
                          {f.label || t('synopticEditor.preview.unlabelledField')}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
                          {f.visibleWhen && <span className="ps-syned-preview-cond-tag">{t('synopticEditor.preview.conditionalFieldBadge')}</span>}
                        </div>
                        {(f.snomed || f.icd) && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                            {f.snomed && <span className="ps-syned-preview-code-badge ps-syned-preview-code-badge--snomed">SCT {f.snomed}</span>}
                            {f.icd    && <span className="ps-syned-preview-code-badge ps-syned-preview-code-badge--icd">ICD {f.icd}</span>}
                          </div>
                        )}
                        {f.hint && <div className="ps-syned-preview-field-hint">{f.hint}</div>}
                      </div>
                      <div style={{ flex: 1 }}>
                        {f.type === 'dropdown' && <select value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input ps-syned-preview-select"><option value="">{t('synopticEditor.preview.selectPlaceholder')}</option>{f.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
                        {f.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>{f.options.map(o => <label key={o.id} className="ps-syned-preview-choice-label"><input type="radio" name={f.id} value={o.id} checked={answers[f.id] === o.id} onChange={() => setAnswer(f.id, o.id)} style={{ accentColor: '#0891B2' }} />{o.label}</label>)}</div>}
                        {f.type === 'checkboxes' && <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>{f.options.map(o => { const cur = (answers[f.id] as string[]) ?? []; return <label key={o.id} className="ps-syned-preview-choice-label"><input type="checkbox" value={o.id} checked={cur.includes(o.id)} onChange={() => setAnswer(f.id, cur.includes(o.id) ? cur.filter(x => x !== o.id) : [...cur, o.id])} style={{ accentColor: '#0891B2' }} />{o.label}</label>; })}</div>}
                        {f.type === 'numeric'  && <input type="number" value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input" style={{ width: '120px' }} />}
                        {f.type === 'text'     && <input type="text"   value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input" />}
                        {f.type === 'longtext' && <textarea rows={3}   value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input" style={{ resize: 'vertical' }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const SynopticEditor: React.FC = () => {
  const { t }           = useTranslation();
  const navigate         = useNavigate();
  const { templateId }   = useParams<{ templateId: string }>();
  const [searchParams]   = useSearchParams();
  const isDuplicate  = searchParams.get('mode') === 'duplicate';
  const fromRequest  = searchParams.get('fromRequest') === 'true';
  const requestMeta  = searchParams.get('meta') ? JSON.parse(decodeURIComponent(searchParams.get('meta')!)) : null;
  const fromSection  = searchParams.get('from');
  const backTarget   = fromSection === 'review' ? '/configuration?tab=protocols&section=review' : '/configuration?tab=protocols';
  const isNew        = !templateId || templateId === 'new';

  const [template, setTemplate]           = useState<EditorTemplate>(blankTemplate);
  const [templateLoading, setTemplateLoading] = useState(!isNew);
  const [registryEntry, setRegistryEntry] = useState<import('./protocolShared').Protocol | null>(null);

  React.useEffect(() => {
    if (isNew || !templateId) return;
    setTemplateLoading(true);
    const entry = PROTOCOL_REGISTRY.find(p => p.id === templateId) ?? null;
    setRegistryEntry(entry);
    getTemplate(templateId)
      .then(detail => {
        const loaded = detail.template;
        setTemplate(isDuplicate ? { ...loaded, id: uid(), name: `${loaded.name} (Copy)`, version: bumpVersion(loaded.version, 'patch') } : loaded);
      })
      .catch(() => {
        const source = PROTOCOL_REGISTRY.find(p => p.id === templateId);
        if (source) {
          setTemplate({ id: isDuplicate ? uid() : source.id, name: isDuplicate ? `${source.name} (Copy)` : source.name, source: source.source, version: isDuplicate ? bumpVersion(source.version, 'patch') : source.version, category: source.category, sections: [blankSection()] });
        }
      })
      .finally(() => setTemplateLoading(false));
  }, [templateId, isNew, isDuplicate]);

  const [showPreview, setShowPreview]             = useState(false);
  const [isDirty, setIsDirty]                     = useState(false);
  const [isSaving, setIsSaving]                   = useState(false);
  const [saveError, setSaveError]                 = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNavTarget, setPendingNavTarget]   = useState<string | null>(null);

  const guardedNavigate = (target: string) => { if (isDirty) { setPendingNavTarget(target); setShowDiscardConfirm(true); } else { navigate(target); } };

  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const update        = useCallback((patch: Partial<EditorTemplate>) => { setTemplate(prev => ({ ...prev, ...patch })); setIsDirty(true); }, []);
  const updateSection = useCallback((sId: string, patch: Partial<EditorSection>) => { setTemplate(prev => ({ ...prev, sections: prev.sections.map(s => s.id === sId ? { ...s, ...patch } : s) })); setIsDirty(true); }, []);
  const addSection    = () => { setTemplate(prev => ({ ...prev, sections: [...prev.sections, blankSection()] })); setIsDirty(true); };
  const removeSection = (sId: string) => { setTemplate(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== sId) })); setIsDirty(true); };
  const moveSection   = (sId: string, dir: -1 | 1) => {
    setTemplate(prev => {
      const arr = [...prev.sections]; const i = arr.findIndex(s => s.id === sId);
      if (i + dir < 0 || i + dir >= arr.length) return prev;
      [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]]; return { ...prev, sections: arr };
    }); setIsDirty(true);
  };

  const nameError: string | null = (() => {
    if (!template.name.trim()) return t('synopticEditor.metadata.nameRequiredError');
    const duplicate = PROTOCOL_REGISTRY.find(p => p.name.toLowerCase() === template.name.trim().toLowerCase() && p.id !== template.id);
    if (duplicate) return t('synopticEditor.metadata.nameDuplicateError', { name: duplicate.name });
    return null;
  })();

  const handleSaveDraft = async () => {
    if (nameError) { setSaveError(nameError); return; }
    setIsSaving(true); setSaveError(null);
    try { await saveDraft(template); setIsDirty(false); } catch (err: any) { setSaveError(err?.message ?? t('synopticEditor.errors.saveFailed')); } finally { setIsSaving(false); }
  };

  const handleSubmitForReview = async () => {
    setShowSubmitConfirm(false);
    if (nameError) { setSaveError(nameError); return; }
    setIsSaving(true); setSaveError(null);
    try { await saveDraft(template); await submitForReview(template.id); navigate('/configuration?tab=protocols&section=review'); } catch (err: any) { setSaveError(err?.message ?? t('synopticEditor.errors.submitFailed')); setIsSaving(false); }
  };

  const cov = calcCoverage(template);
  const { alerts, isLoading: alertsLoading, dismiss: dismissAlert, revalidate } = useTerminologyAlerts(template);

  // Readiness checklist — the SNOMED-coverage item is fixed coding-system
  // vocabulary plus a numeric threshold with no natural-language content
  // to translate (same posture as SCT/ICD elsewhere), so it keeps a plain
  // label instead of a translation key; every other item is real UI prose
  // and goes through t().
  const readinessItems: { labelKey?: string; label?: string; ok: boolean }[] = [
    { labelKey: 'synopticEditor.readiness.templateName',  ok: !!template.name },
    { labelKey: 'synopticEditor.readiness.categorySet',   ok: !!template.category },
    { labelKey: 'synopticEditor.readiness.atLeastOneSection', ok: template.sections.length > 0 },
    { labelKey: 'synopticEditor.readiness.atLeastOneField',   ok: cov.totalFields > 0 },
    { label: 'SNOMED ≥ 80%', ok: cov.snomed >= 80 },
  ];

  if (templateLoading) {
    return (
      <div className="ps-syned-loading-screen">
        <div style={{ textAlign: 'center', color: T.muted }}>
          <div className="ps-syned-loading-icon">⏳</div>
          <div className="ps-syned-loading-text">{t('synopticEditor.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-syned-page">

      {/* ── Nav bar ── */}
      <nav className="ps-syned-nav">
        <div className="ps-syned-nav-left">
          <button onClick={() => guardedNavigate(backTarget)} className="ps-syned-back-btn">{t('synopticEditor.nav.back')}</button>
          <div className="ps-syned-breadcrumb">
            <span onClick={() => guardedNavigate(backTarget)} className="ps-syned-breadcrumb-link">{t('synopticEditor.nav.breadcrumbProtocols')}</span>
            <span className="ps-syned-breadcrumb-sep">›</span>
            <span className="ps-syned-breadcrumb-current">
              {isDuplicate
                ? t('synopticEditor.nav.breadcrumbDuplicate', { name: template.name || t('synopticEditor.nav.breadcrumbUntitled') })
                : isNew
                  ? (template.name ? template.name : t('synopticEditor.nav.breadcrumbNewTemplate'))
                  : (template.name || t('synopticEditor.nav.breadcrumbUntitled'))}
            </span>
            {(isNew && !template.name) && <span className="ps-syned-breadcrumb-hint">{t('synopticEditor.nav.breadcrumbEnterNameHint')}</span>}
          </div>
        </div>
        <div className="ps-syned-nav-right">
          {saveError && <span className="ps-syned-alert ps-syned-alert--error">⚠ {saveError}</span>}
          {alerts.some(a => a.severity === 'error')   && <span className="ps-syned-alert ps-syned-alert--error">{t('synopticEditor.nav.deprecatedCodes')}</span>}
          {!alerts.some(a => a.severity === 'error') && alerts.some(a => a.severity === 'warning') && <span className="ps-syned-alert ps-syned-alert--warning">{t('synopticEditor.nav.terminologyWarnings')}</span>}
          {isDirty && !isSaving && <span className="ps-syned-unsaved">{t('synopticEditor.nav.unsavedChanges')}</span>}
          {isSaving && <span className="ps-syned-saving">{t('synopticEditor.nav.saving')}</span>}
          <button onClick={() => setShowPreview(true)} className="ps-syned-preview-btn">{t('synopticEditor.nav.previewButton')}</button>
          <button onClick={handleSaveDraft} disabled={isSaving} className="ps-syned-save-btn">{isSaving ? '…' : t('synopticEditor.nav.saveDraftButton')}</button>
          <button onClick={() => setShowSubmitConfirm(true)} disabled={isSaving} className="ps-syned-submit-btn">{t('synopticEditor.nav.submitForReviewButton')}</button>
        </div>
      </nav>

      {/* ── Main layout ── */}
      <div className="ps-syned-main">

        {/* ── Request Details Banner (shown when opened from a template request message) ── */}
        {fromRequest && requestMeta && (
          <div className="ps-syned-request-banner">
            <span className="ps-syned-request-icon">📋</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ps-syned-request-title">
                {t('synopticEditor.requestBanner.title', { name: requestMeta.requestedByName })}
                <span className="ps-syned-request-urgency">
                  {requestMeta.urgency}
                </span>
              </div>
              <div className="ps-syned-request-meta-row">
                {[
                  [t('synopticEditor.requestBanner.standard'), requestMeta.standard],
                  [t('synopticEditor.requestBanner.organ'), requestMeta.organ],
                  [t('synopticEditor.requestBanner.procedure'), requestMeta.procedure],
                  [t('synopticEditor.requestBanner.base'), requestMeta.baseTemplateName ?? t('synopticEditor.requestBanner.noneSpecified')],
                ].map(([l, v]) => (
                  <span key={l} className="ps-syned-request-meta-item">
                    {l}: <strong className="ps-syned-request-meta-value">{v}</strong>
                  </span>
                ))}
              </div>
              {requestMeta.keyFields && (
                <details style={{ marginTop: 6 }}>
                  <summary className="ps-syned-request-summary">
                    {t('synopticEditor.requestBanner.viewRequestedFields')}
                  </summary>
                  <pre className="ps-syned-request-pre">{requestMeta.keyFields}</pre>
                </details>
              )}
            </div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {registryEntry?.status === 'needs_changes' && registryEntry.reviewNote && (
            <div className="ps-syned-changes-banner">
              <div className="ps-syned-changes-header">
                <span style={{ fontSize: '14px' }}>↩️</span>
                <span className="ps-syned-changes-title">{t('synopticEditor.changesRequested.title')}</span>
                {registryEntry.reviewedBy && <span className="ps-syned-changes-by">{t('synopticEditor.changesRequested.byPrefix')} <strong className="ps-syned-changes-by-name">{registryEntry.reviewedBy}</strong>{registryEntry.reviewedAt && <> · {new Date(registryEntry.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}</span>}
              </div>
              <div className="ps-syned-changes-note">{registryEntry.reviewNote}</div>
            </div>
          )}

          <TerminologyAlertBanner alerts={alerts} isLoading={alertsLoading} onDismiss={dismissAlert} onRevalidate={revalidate} />

          {/* Template metadata */}
          <div className="ps-syned-metadata-card">
            <div className="ps-syned-metadata-title">{t('synopticEditor.metadata.title')}</div>
            <div className="ps-syned-metadata-grid">
              <div className="ps-syned-metadata-full">
                <label className="ps-syned-label">{t('synopticEditor.metadata.nameLabel')}</label>
                <input
                  value={template.name} onChange={e => { update({ name: e.target.value }); setSaveError(null); }}
                  placeholder={t('synopticEditor.metadata.namePlaceholder')}
                  className="ps-syned-input ps-syned-template-name-input"
                  style={{ borderColor: nameError && template.name ? '#f87171' : undefined }}
                  onFocus={e => (e.currentTarget.style.borderColor = nameError && template.name ? '#f87171' : T.accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = nameError && template.name ? '#f87171' : T.border)}
                />
                {nameError && template.name && <div className="ps-syned-field-error">⚠ {nameError}</div>}
              </div>
              <div>
                <label className="ps-syned-label">{t('synopticEditor.metadata.sourceLabel')}</label>
                <div className="ps-syned-pill-row">
                  {/* SOURCE_OPTIONS are fixed governing-body abbreviations — left untranslated, see file header. */}
                  {SOURCE_OPTIONS.map(s => (
                    <button key={s} onClick={() => update({ source: s })} className={`ps-syned-pill${template.source === s ? ' ps-syned-pill--selected' : ''}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ width: '170px' }}>
                <label className="ps-syned-label">{t('synopticEditor.metadata.versionLabel')}</label>
                <div className="ps-syned-version-row">
                  <span className="ps-syned-version-value">{template.version || '1.0.0'}</span>
                  <div className="ps-syned-version-btns">
                    {([
                      ['major', t('synopticEditor.metadata.versionPart.major')],
                      ['minor', t('synopticEditor.metadata.versionPart.minor')],
                      ['patch', t('synopticEditor.metadata.versionPart.patch')],
                    ] as const).map(([part, partLabel]) => (
                      <button
                        key={part}
                        title={t('synopticEditor.metadata.bumpTooltip', { part: partLabel })}
                        onClick={() => update({ version: bumpVersion(template.version, part) })}
                        className="ps-syned-version-btn"
                      >
                        +{partLabel}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ps-syned-metadata-full">
                <label className="ps-syned-label">{t('synopticEditor.metadata.categoryLabel')}</label>
                <div className="ps-syned-pill-row">
                  {CATEGORY_OPTIONS.map(cat => (
                    <button key={cat} onClick={() => update({ category: cat })} className={`ps-syned-pill ps-syned-pill--category${template.category === cat ? ' ps-syned-pill--selected' : ''}`}>{t(CATEGORY_LABEL_KEY[cat])}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {template.sections.map((sec, si) => (
            <SectionCard key={sec.id} section={sec} index={si} total={template.sections.length} template={template} onChange={patch => updateSection(sec.id, patch)} onRemove={() => removeSection(sec.id)} onMove={dir => moveSection(sec.id, dir)} />
          ))}

          <button onClick={addSection} className="ps-syned-add-section-btn">{t('synopticEditor.section.addSectionButton')}</button>
        </div>

        {/* ── Right: stats sidebar ── */}
        <div className="ps-syned-sidebar">
          <div className="ps-syned-sidebar-inner">
            <div className="ps-syned-sidebar-card">
              <div className="ps-syned-sidebar-card-title">{t('synopticEditor.sidebar.codingCoverageTitle')}</div>
              {/* SNOMED CT / ICD-10/11 are fixed coding-system nomenclature,
                  left untranslated; "Answer-level" is a computed UI metric
                  label and is translated. */}
              {[
                { label: 'SNOMED CT', pct: cov.snomed, color: '#38bdf8' },
                { label: 'ICD-10/11', pct: cov.icd, color: '#a78bfa' },
                { labelKey: 'synopticEditor.sidebar.answerLevelLabel', pct: cov.answerLevel, color: '#4ade80' },
              ].map(bar => (
                <div key={bar.label ?? bar.labelKey} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span className="ps-syned-coverage-bar-label">{bar.label ?? t(bar.labelKey!)}</span>
                    <span className="ps-syned-coverage-bar-pct" style={{ color: bar.pct >= 80 ? '#10B981' : bar.pct >= 50 ? '#fbbf24' : '#f87171' }}>{bar.pct}%</span>
                  </div>
                  <div className="ps-syned-coverage-bar-track">
                    <div className="ps-syned-coverage-bar-fill" style={{ width: `${bar.pct}%`, background: bar.color }} />
                  </div>
                </div>
              ))}
              <div className="ps-syned-coverage-summary">{t('synopticEditor.common.fieldCount', { count: cov.totalFields })} · {t('synopticEditor.common.sectionCount', { count: template.sections.length })}</div>
            </div>

            <div className="ps-syned-sidebar-card">
              <div className="ps-syned-sidebar-card-title">{t('synopticEditor.sidebar.readinessTitle')}</div>
              {readinessItems.map(item => (
                <div key={item.labelKey ?? item.label} className="ps-syned-readiness-row">
                  <span className="ps-syned-readiness-icon" style={{ color: item.ok ? '#10B981' : '#f87171' }}>{item.ok ? '✓' : '○'}</span>
                  <span className="ps-syned-readiness-label" style={{ color: item.ok ? T.muted : T.dimmer }}>{item.labelKey ? t(item.labelKey) : item.label}</span>
                </div>
              ))}
            </div>

            <div className="ps-syned-tip-box">
              <span className="ps-syned-tip-label">💡 {t('synopticEditor.sidebar.tipLabel')} — </span>
              {t('synopticEditor.sidebar.tipText')}
            </div>
          </div>
        </div>
      </div>

      {showPreview && <PreviewModal template={template} onClose={() => setShowPreview(false)} />}

      {showSubmitConfirm && (
        <div className="ps-overlay" style={{ zIndex: 9500 }} onClick={() => setShowSubmitConfirm(false)}>
          <div onClick={e => e.stopPropagation()} className="ps-syned-confirm-modal">
            <div className="ps-syned-confirm-title">{t('synopticEditor.submitConfirm.title')}</div>
            <p className="ps-syned-confirm-body">{t('synopticEditor.submitConfirm.body', { name: template.name || t('synopticEditor.submitConfirm.defaultTemplateName') })}</p>
            <div className="ps-syned-confirm-actions">
              <button onClick={() => setShowSubmitConfirm(false)} className="ps-conf-btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSubmitForReview} className="ps-conf-btn-teal-accent" style={{ fontWeight: 700 }}>{t('synopticEditor.submitConfirm.confirmButton')}</button>
            </div>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <div className="ps-overlay" style={{ zIndex: 9500 }}>
          <div onClick={e => e.stopPropagation()} className="ps-syned-confirm-modal ps-syned-confirm-modal--danger">
            <div className="ps-syned-confirm-title">{t('synopticEditor.discardConfirm.title')}</div>
            <p className="ps-syned-confirm-body">{t('synopticEditor.discardConfirm.body', { name: template.name || t('synopticEditor.submitConfirm.defaultTemplateName') })}</p>
            <div className="ps-syned-confirm-actions">
              <button onClick={() => { setShowDiscardConfirm(false); setPendingNavTarget(null); }} className="ps-syned-keep-editing-btn">{t('synopticEditor.discardConfirm.keepEditingButton')}</button>
              <button onClick={() => { setIsDirty(false); setShowDiscardConfirm(false); if (pendingNavTarget) navigate(pendingNavTarget); setPendingNavTarget(null); }} className="ps-syned-discard-btn">{t('synopticEditor.discardConfirm.discardButton')}</button>
              <button onClick={async () => { if (nameError) { setSaveError(nameError); setShowDiscardConfirm(false); return; } await handleSaveDraft(); setShowDiscardConfirm(false); if (pendingNavTarget) navigate(pendingNavTarget); setPendingNavTarget(null); }} className="ps-syned-save-and-leave-btn">{t('synopticEditor.discardConfirm.saveDraftAndLeaveButton')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SynopticEditor;
