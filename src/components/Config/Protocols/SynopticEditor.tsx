/**
 * components/Config/Protocols/SynopticEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full synoptic template builder — reached via:
 *   /template-editor/new              → blank template
 *   /template-editor/:templateId      → edit existing draft
 *   /template-editor/:templateId?mode=duplicate  → new protocol copied from this one
 *   /template-editor/:templateId?mode=newVersion → next version of a published
 *                                                   protocol (replaces it when published)
 *   Copy rules: services/templates/protocolLifecycle.ts (Batch 317, PS-73).
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
 * Business-logic extraction:
 *   Semantic-version bumping was duplicated three times with slightly
 *   different inline implementations; consolidated into one
 *   `bumpVersion(version, part)`, which Batch 317 moved to
 *   services/templates/protocolLifecycle.ts together with the
 *   Duplicate/New Version copy rules and the protocol-name uniqueness rule.
 *   Batch 317 also removed every inline style from this file (per-state
 *   colours are ps-syned-* classes; the one remaining style prop sets only
 *   the --ps-pct custom property).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PROTOCOL_REGISTRY } from './protocolShared';
import { saveDraft, submitForReview, getTemplate, canCurrentUserDraftTemplates } from '../../../services/templates/templateService';
import { bumpVersion, prepareProtocolCopy, findProtocolNameConflict, editorUrlAfterSave, type ProtocolCopyKind } from '@/services/templates/protocolLifecycle';
import { formatDateTime } from '@/utils/formatDate';
import { TerminologyAlertBanner } from './TerminologyAlertBanner';
import { useTerminologyAlerts } from '../../../hooks/useTerminologyAlerts';
import { calcTemplateCoverage, SNOMED_PUBLISH_THRESHOLD } from '../../../services/templates/templatePublishingRules';

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
  /** Set on a New Version draft: the published protocol it will replace
   *  (see services/templates/protocolLifecycle.ts). */
  supersedesId?: string;
  /** Set on any Duplicate / New Version: the protocol it was copied from.
   *  The first save inherits that protocol's registry-only attributes
   *  (isDiagnostic, type, group), which this editor doesn't show. */
  copiedFromId?: string;
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

// bumpVersion lives in services/templates/protocolLifecycle.ts (Batch 317).

// field.type is a real persisted enum (EditorField.type) — labelKey/abbrKey
// are the translation-key indirection for its display, same XXX_LABEL_KEY
// pattern used throughout this sweep; `value` itself is untouched data.
// Each type's badge colour is .ps-syned-ftype--<value> in pathscribe.css.
const FIELD_TYPES: { value: FieldType; labelKey: string; abbrKey: string; hasOptions: boolean }[] = [
  { value: 'dropdown',   labelKey: 'synopticEditor.fieldType.dropdown.label',   abbrKey: 'synopticEditor.fieldType.dropdown.abbr',   hasOptions: true  },
  { value: 'radio',      labelKey: 'synopticEditor.fieldType.radio.label',     abbrKey: 'synopticEditor.fieldType.radio.abbr',      hasOptions: true  },
  { value: 'checkboxes', labelKey: 'synopticEditor.fieldType.checkboxes.label',abbrKey: 'synopticEditor.fieldType.checkboxes.abbr', hasOptions: true  },
  { value: 'numeric',    labelKey: 'synopticEditor.fieldType.numeric.label',   abbrKey: 'synopticEditor.fieldType.numeric.abbr',    hasOptions: false },
  { value: 'text',       labelKey: 'synopticEditor.fieldType.text.label',      abbrKey: 'synopticEditor.fieldType.text.abbr',       hasOptions: false },
  { value: 'longtext',   labelKey: 'synopticEditor.fieldType.longtext.label',  abbrKey: 'synopticEditor.fieldType.longtext.abbr',   hasOptions: false },
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
// calcTemplateCoverage lives in services/templates/templatePublishingRules.ts
// (PS-63), so the publish check uses the same figure this editor shows.
const calcCoverage = (template: EditorTemplate) => calcTemplateCoverage(template);

// ─── Style tokens ─────────────────────────────────────────────────────────────
// None: every colour, including per-state ones (focus, selected field type,
// condition toggle, coverage bands), is a ps-syned-* CSS class (Batch 317).

/** Coding-coverage band for the sidebar bars (colours in pathscribe.css). */
const editorCoverageLevel = (pct: number): 'good' | 'fair' | 'poor' => (pct >= 80 ? 'good' : pct >= 50 ? 'fair' : 'poor');

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
// `system` picks the coding system's colour (.ps-syned-coding--snomed/--icd).
const CodingInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; system: 'snomed' | 'icd'; placeholderKey: string }> = ({
  label, value, onChange, system, placeholderKey,
}) => {
  const { t } = useTranslation();
  return (
    <div className={`ps-flex-1 ps-syned-coding--${system}`}>
      <div className="ps-syned-coding-input-label">{label}</div>
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={t(placeholderKey)}
        className="ps-syned-coding-input"
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
    <div className="ps-mb-4">
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
          <CodingInput label="SNOMED CT" value={option.snomed} onChange={v => onChange({ snomed: v })} system="snomed" placeholderKey="synopticEditor.coding.optionSnomedPlaceholder" />
          <CodingInput label="ICD-10/11" value={option.icd} onChange={v => onChange({ icd: v })} system="icd" placeholderKey="synopticEditor.coding.optionIcdPlaceholder" />
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
    <div className="ps-mb-8">
      <div className={`ps-syned-field-header${open ? ' ps-syned-field-header--open' : ''}`}>
        <span className="ps-syned-grab-handle ps-fs-13">⠿</span>

        <div className="ps-syned-type-badge-wrap">
          <button
            onClick={e => { e.stopPropagation(); setTypeOpen(x => !x); }}
            title={t('synopticEditor.field.changeTypeTooltip')}
            className={`ps-syned-type-badge-btn ps-syned-ftype--${field.type}`}
          >
            {t(ftInfo.abbrKey)} ▾
          </button>
          {typeOpen && (
            <div onClick={e => e.stopPropagation()} className="ps-syned-type-menu">
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.value}
                  onClick={() => { onChange({ type: ft.value, options: [] }); setTypeOpen(false); }}
                  className={`ps-syned-type-menu-item ps-syned-ftype--${ft.value}${field.type === ft.value ? ' ps-syned-type-menu-item--selected' : ''}`}
                >
                  <span className="ps-syned-type-menu-abbr">{t(ft.abbrKey)}</span>
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
          <div className="ps-syned-coded-dots">
            {field.snomed && <span className="ps-syned-coded-dot ps-syned-coded-dot--snomed" title={t('synopticEditor.field.snomedCodedTooltip')} />}
            {field.icd    && <span className="ps-syned-coded-dot ps-syned-coded-dot--icd" title={t('synopticEditor.field.icdCodedTooltip')} />}
          </div>
        )}

        {field.visibleWhen && <span title={t('synopticEditor.common.hasConditionTooltip')} className="ps-syned-condition-badge">{t('synopticEditor.common.conditionalBadge')}</span>}

        <IconBtn onClick={() => setOpen(x => !x)} title={open ? t('synopticEditor.common.collapse') : t('synopticEditor.common.expand')}>
          <span className={`ps-syned-chevron${open ? ' ps-syned-chevron--rot90' : ''}`}>›</span>
        </IconBtn>
        <IconBtn onClick={() => onMove(-1)} title={t('synopticEditor.common.moveUp')}  >{index === 0         ? '' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title={t('synopticEditor.common.moveDown')}>{index === total - 1 ? '' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title={t('synopticEditor.field.deleteTooltip')}>🗑</IconBtn>
      </div>

      {open && (
        <div className="ps-syned-field-body">
          <div className="ps-syned-field-row">
            <div className="ps-syned-field-type-wrap">
              <label className="ps-syned-label">{t('synopticEditor.field.fieldTypeLabel')}</label>
              <select value={field.type} onChange={e => onChange({ type: e.target.value as FieldType, options: [] })} className="ps-syned-input ps-syned-select">
                {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{t(ft.abbrKey)} — {t(ft.labelKey)}</option>)}
              </select>
            </div>
            <div className="ps-flex-1">
              <label className="ps-syned-label">{t('synopticEditor.field.hintLabel')} <span className="ps-syned-label-note">{t('synopticEditor.field.optionalTag')}</span></label>
              <input value={field.hint ?? ''} onChange={e => onChange({ hint: e.target.value })} placeholder={t('synopticEditor.field.hintPlaceholder')} className="ps-syned-input" />
            </div>
          </div>

          <div className="ps-mb-14">
            <label className="ps-syned-label">{t('synopticEditor.field.codingLabel')}</label>
            <div className="ps-syned-coding-row">
              <CodingInput label="SNOMED CT" value={field.snomed} onChange={v => onChange({ snomed: v })} system="snomed" placeholderKey="synopticEditor.coding.fieldSnomedPlaceholder" />
              <CodingInput label="ICD-10/11" value={field.icd} onChange={v => onChange({ icd: v })} system="icd" placeholderKey="synopticEditor.coding.fieldIcdPlaceholder" />
            </div>
          </div>

          {ftInfo.hasOptions && (
            <div>
              <div className="ps-syned-options-header">
                <label className="ps-syned-label ps-mb-0">{t('synopticEditor.field.answerOptionsLabel')} <span className="ps-syned-label-note ps-syned-label-note--dimmer">{t('synopticEditor.field.answerOptionsHint')}</span></label>
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
      <div className={`ps-syned-section-header${section.visibleWhen ? ' ps-syned-section-header--conditional' : ''}${section.collapsed ? ' ps-syned-section-header--collapsed' : ''}`}>
        <span className="ps-syned-grab-handle ps-fs-14">⠿</span>
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
          <span className={`ps-syned-chevron${section.collapsed ? ' ps-syned-chevron--rot-90' : ''}`}>▾</span>
        </IconBtn>
        <IconBtn onClick={() => onMove(-1)} title={t('synopticEditor.common.moveUp')}  >{index === 0         ? '' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title={t('synopticEditor.common.moveDown')}>{index === total - 1 ? '' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title={t('synopticEditor.section.deleteTooltip')}>🗑</IconBtn>
      </div>

      {!section.collapsed && (
        <div className="ps-syned-section-condition-wrap">
          <ConditionPicker condition={section.visibleWhen} template={template} onChange={c => onChange({ visibleWhen: c })} />
          <div className="ps-syned-condition-spacer" />
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
      <div className={`ps-syned-condition-toggle-row${enabled ? ' ps-syned-condition-toggle-row--expanded' : ''}`}>
        <button onClick={() => onChange(enabled ? undefined : { fieldId: '', answerId: '' })} className={`ps-syned-condition-toggle${enabled ? ' ps-syned-condition-toggle--on' : ''}`}>
          <span className="ps-syned-condition-toggle-knob" />
        </button>
        <span className={`ps-syned-condition-status${enabled ? ' ps-syned-condition-status--on' : ''}`}>
          {enabled ? t('synopticEditor.condition.shownOnlyWhen') : t('synopticEditor.condition.alwaysVisible')}
        </span>
        {!enabled && choices.length === 0 && <span className="ps-syned-condition-hint">{t('synopticEditor.condition.addFieldFirstHint')}</span>}
      </div>

      {enabled && (
        <div className="ps-syned-condition-fields-row">
          <div className="ps-flex-1">
            <label className="ps-syned-label ps-syned-label--amber">{t('synopticEditor.condition.whenFieldLabel')}</label>
            <select
              value={condition?.fieldId ?? ''} onChange={e => onChange({ fieldId: e.target.value, answerId: '' })}
              className={`ps-syned-input ps-syned-select ps-syned-select--condition${condition?.fieldId ? '' : ' ps-syned-select--needs-value'}`}
            >
              <option value="">{t('synopticEditor.condition.pickFieldOption')}</option>
              {choices.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div className="ps-flex-1">
            <label className="ps-syned-label ps-syned-label--amber">{t('synopticEditor.condition.answerIsLabel')}</label>
            <select
              value={condition?.answerId ?? ''} onChange={e => onChange({ ...condition!, answerId: e.target.value })} disabled={!srcField}
              className={`ps-syned-input ps-syned-select ps-syned-select--condition${!condition?.answerId && srcField ? ' ps-syned-select--needs-value' : ''}`}
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
          <div className="ps-syned-preview-header-actions">
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
                className={`ps-syned-preview-section ${secVisible ? 'ps-syned-preview-section--visible' : 'ps-syned-preview-section--hidden'}`}
              >
                {sec.visibleWhen && <div className="ps-syned-preview-conditional-label"><span>⟳</span> {t('synopticEditor.preview.conditionalSectionLabel')}</div>}
                <div className="ps-syned-preview-section-title">{sec.title}</div>

                {sec.fields.map(f => {
                  const fVisible = isVisible(f.visibleWhen, answers);
                  if (!secVisible) return null;
                  return (
                    <div key={f.id} className={`ps-syned-preview-field-row ${fVisible ? 'ps-syned-preview-field-row--visible' : 'ps-syned-preview-field-row--hidden'}`}>
                      <div className="ps-syned-preview-field-label-wrap">
                        <div className="ps-syned-preview-field-label">
                          {f.label || t('synopticEditor.preview.unlabelledField')}{f.required && <span className="ps-syned-preview-required-mark"> *</span>}
                          {f.visibleWhen && <span className="ps-syned-preview-cond-tag">{t('synopticEditor.preview.conditionalFieldBadge')}</span>}
                        </div>
                        {(f.snomed || f.icd) && (
                          <div className="ps-syned-preview-code-row">
                            {f.snomed && <span className="ps-syned-preview-code-badge ps-syned-preview-code-badge--snomed">SCT {f.snomed}</span>}
                            {f.icd    && <span className="ps-syned-preview-code-badge ps-syned-preview-code-badge--icd">ICD {f.icd}</span>}
                          </div>
                        )}
                        {f.hint && <div className="ps-syned-preview-field-hint">{f.hint}</div>}
                      </div>
                      <div className="ps-flex-1">
                        {f.type === 'dropdown' && <select value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input ps-syned-preview-select"><option value="">{t('synopticEditor.preview.selectPlaceholder')}</option>{f.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
                        {f.type === 'radio' && <div className="ps-syned-preview-choice-col">{f.options.map(o => <label key={o.id} className="ps-syned-preview-choice-label"><input type="radio" name={f.id} value={o.id} checked={answers[f.id] === o.id} onChange={() => setAnswer(f.id, o.id)} className="ps-syned-preview-choice-input" />{o.label}</label>)}</div>}
                        {f.type === 'checkboxes' && <div className="ps-syned-preview-choice-col">{f.options.map(o => { const cur = (answers[f.id] as string[]) ?? []; return <label key={o.id} className="ps-syned-preview-choice-label"><input type="checkbox" value={o.id} checked={cur.includes(o.id)} onChange={() => setAnswer(f.id, cur.includes(o.id) ? cur.filter(x => x !== o.id) : [...cur, o.id])} className="ps-syned-preview-choice-input" />{o.label}</label>; })}</div>}
                        {f.type === 'numeric'  && <input type="number" value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input ps-syned-preview-input--numeric" />}
                        {f.type === 'text'     && <input type="text"   value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input" />}
                        {f.type === 'longtext' && <textarea rows={3}   value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} className="ps-syned-preview-input ps-syned-preview-input--longtext" />}
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
  const { t, i18n }     = useTranslation();
  const navigate         = useNavigate();
  const { templateId }   = useParams<{ templateId: string }>();
  const [searchParams]   = useSearchParams();
  const modeParam    = searchParams.get('mode');
  const copyKind: ProtocolCopyKind | null = modeParam === 'duplicate' || modeParam === 'newVersion' ? modeParam : null;
  const isDuplicate  = copyKind === 'duplicate';
  const isNewVersion = copyKind === 'newVersion';
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
    // A copy is a new protocol: the source's review state/notes don't apply to it.
    const entry = copyKind ? null : PROTOCOL_REGISTRY.find(p => p.id === templateId) ?? null;
    setRegistryEntry(entry);
    // Duplicate / New Version: the editor opens a COPY with a new id; the
    // source is never edited. What changes on the copy (name, version,
    // lineage) is decided in services/templates/protocolLifecycle.ts.
    const asCopy = (loaded: EditorTemplate) =>
      copyKind ? prepareProtocolCopy(loaded, copyKind, { copyName: name => t('common.copyOfName', { name }), newId: uid }) : loaded;
    getTemplate(templateId)
      .then(detail => setTemplate(asCopy(detail.template)))
      .catch(() => {
        const source = PROTOCOL_REGISTRY.find(p => p.id === templateId);
        if (source) {
          setTemplate(asCopy({ id: source.id, name: source.name, source: source.source, version: source.version, category: source.category, sections: [blankSection()] }));
        }
      })
      .finally(() => setTemplateLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, isNew, copyKind]);

  const [showPreview, setShowPreview]             = useState(false);
  const [isDirty, setIsDirty]                     = useState(false);
  const [isSaving, setIsSaving]                   = useState(false);
  const [saveError, setSaveError]                 = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNavTarget, setPendingNavTarget]   = useState<string | null>(null);
  // PS-63 (Batch 329): drafting needs the Template Author role (Admin
  // inherits). Without it the editor opens read-only. null = still checking.
  const [canDraft, setCanDraft]                   = useState<boolean | null>(null);
  React.useEffect(() => {
    let live = true;
    canCurrentUserDraftTemplates().then(ok => { if (live) setCanDraft(ok); }).catch(() => { if (live) setCanDraft(false); });
    return () => { live = false; };
  }, []);
  const readOnly = canDraft === false;
  /** The message for a failed save or submit; a refused drafting check has
   *  its own translated text. */
  const saveFailureMessage = (err: any, fallbackKey: string) =>
    err?.code === 'NOT_TEMPLATE_AUTHOR' ? t('synopticEditor.errors.notTemplateAuthor') : (err?.message ?? t(fallbackKey));

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

  // Name must be unique among live protocols; a New Version keeps its
  // predecessor's name on purpose (rule: findProtocolNameConflict).
  const nameError: string | null = (() => {
    if (!template.name.trim()) return t('synopticEditor.metadata.nameRequiredError');
    const duplicate = findProtocolNameConflict(PROTOCOL_REGISTRY, template);
    if (duplicate) return t('synopticEditor.metadata.nameDuplicateError', { name: duplicate.name });
    return null;
  })();

  const handleSaveDraft = async () => {
    if (nameError) { setSaveError(nameError); return; }
    setIsSaving(true); setSaveError(null);
    try {
      await saveDraft(template);
      setIsDirty(false);
      // A new template or a copy now exists under its own id: point the
      // address bar at it, so a refresh reopens this protocol instead of
      // starting another copy.
      const next = editorUrlAfterSave(templateId, template.id, fromSection);
      if (next) navigate(next, { replace: true });
    } catch (err: any) { setSaveError(saveFailureMessage(err, 'synopticEditor.errors.saveFailed')); } finally { setIsSaving(false); }
  };

  const handleSubmitForReview = async () => {
    setShowSubmitConfirm(false);
    if (nameError) { setSaveError(nameError); return; }
    setIsSaving(true); setSaveError(null);
    try { await saveDraft(template); await submitForReview(template.id); navigate('/configuration?tab=protocols&section=review'); } catch (err: any) { setSaveError(saveFailureMessage(err, 'synopticEditor.errors.submitFailed')); setIsSaving(false); }
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
    { label: `SNOMED ≥ ${SNOMED_PUBLISH_THRESHOLD}%`, ok: cov.snomed >= SNOMED_PUBLISH_THRESHOLD },
  ];

  if (templateLoading) {
    return (
      <div className="ps-syned-loading-screen">
        <div className="ps-syned-loading-inner">
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
                : isNewVersion
                ? t('synopticEditor.nav.breadcrumbNewVersion', { name: template.name || t('synopticEditor.nav.breadcrumbUntitled'), version: template.version })
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
          <button onClick={handleSaveDraft} disabled={isSaving || readOnly} className="ps-syned-save-btn">{isSaving ? '…' : t('synopticEditor.nav.saveDraftButton')}</button>
          <button onClick={() => setShowSubmitConfirm(true)} disabled={isSaving || readOnly} className="ps-syned-submit-btn">{t('synopticEditor.nav.submitForReviewButton')}</button>
        </div>
      </nav>

      {readOnly && (
        <div className="ps-syned-readonly-banner" role="status">{t('synopticEditor.readOnly.notTemplateAuthor')}</div>
      )}

      {/* ── Main layout ── */}
      <div className="ps-syned-main">

        {/* ── Request Details Banner (shown when opened from a template request message) ── */}
        {fromRequest && requestMeta && (
          <div className="ps-syned-request-banner">
            <span className="ps-syned-request-icon">📋</span>
            <div className="ps-flex-1-minw-0">
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
                <details className="ps-mt-6">
                  <summary className="ps-syned-request-summary">
                    {t('synopticEditor.requestBanner.viewRequestedFields')}
                  </summary>
                  <pre className="ps-syned-request-pre">{requestMeta.keyFields}</pre>
                </details>
              )}
            </div>
          </div>
        )}
        <div className="ps-flex-1-minw-0">
          {registryEntry?.status === 'needs_changes' && registryEntry.reviewNote && (
            <div className="ps-syned-changes-banner">
              <div className="ps-syned-changes-header">
                <span className="ps-fs-14">↩️</span>
                <span className="ps-syned-changes-title">{t('synopticEditor.changesRequested.title')}</span>
                {registryEntry.reviewedBy && <span className="ps-syned-changes-by">{t('synopticEditor.changesRequested.byPrefix')} <strong className="ps-syned-changes-by-name">{registryEntry.reviewedBy}</strong>{registryEntry.reviewedAt && <> · {formatDateTime(registryEntry.reviewedAt, i18n.language)}</>}</span>}
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
                  className={`ps-syned-input ps-syned-template-name-input${nameError && template.name ? ' ps-syned-input--error' : ''}`}
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
              <div className="ps-syned-version-wrap">
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
                { label: 'SNOMED CT', pct: cov.snomed, kind: 'snomed' },
                { label: 'ICD-10/11', pct: cov.icd, kind: 'icd' },
                { labelKey: 'synopticEditor.sidebar.answerLevelLabel', pct: cov.answerLevel, kind: 'answer' },
              ].map(bar => (
                <div key={bar.label ?? bar.labelKey} className={`ps-mb-10 ps-syned-covbar--${bar.kind}`}>
                  <div className="ps-syned-coverage-bar-header">
                    <span className="ps-syned-coverage-bar-label">{bar.label ?? t(bar.labelKey!)}</span>
                    <span className={`ps-syned-coverage-bar-pct ps-syned-coverage-bar-pct--${editorCoverageLevel(bar.pct)}`}>{bar.pct}%</span>
                  </div>
                  <div className="ps-syned-coverage-bar-track">
                    <div className="ps-syned-coverage-bar-fill" style={{ '--ps-pct': `${bar.pct}%` } as React.CSSProperties} />
                  </div>
                </div>
              ))}
              <div className="ps-syned-coverage-summary">{t('synopticEditor.common.fieldCount', { count: cov.totalFields })} · {t('synopticEditor.common.sectionCount', { count: template.sections.length })}</div>
            </div>

            <div className="ps-syned-sidebar-card">
              <div className="ps-syned-sidebar-card-title">{t('synopticEditor.sidebar.readinessTitle')}</div>
              {readinessItems.map(item => (
                <div key={item.labelKey ?? item.label} className="ps-syned-readiness-row">
                  <span className={`ps-syned-readiness-icon ps-syned-readiness-icon--${item.ok ? 'ok' : 'todo'}`}>{item.ok ? '✓' : '○'}</span>
                  <span className={`ps-syned-readiness-label ps-syned-readiness-label--${item.ok ? 'ok' : 'todo'}`}>{item.labelKey ? t(item.labelKey) : item.label}</span>
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
        <div className="ps-overlay ps-overlay--syned-confirm" onClick={() => setShowSubmitConfirm(false)}>
          <div onClick={e => e.stopPropagation()} className="ps-syned-confirm-modal">
            <div className="ps-syned-confirm-title">{t('synopticEditor.submitConfirm.title')}</div>
            <p className="ps-syned-confirm-body">{t('synopticEditor.submitConfirm.body', { name: template.name || t('synopticEditor.submitConfirm.defaultTemplateName') })}</p>
            <div className="ps-syned-confirm-actions">
              <button onClick={() => setShowSubmitConfirm(false)} className="ps-conf-btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSubmitForReview} className="ps-conf-btn-teal-accent">{t('synopticEditor.submitConfirm.confirmButton')}</button>
            </div>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <div className="ps-overlay ps-overlay--syned-confirm">
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
