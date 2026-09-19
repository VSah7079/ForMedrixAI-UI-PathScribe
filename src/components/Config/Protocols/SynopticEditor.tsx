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
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
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
  id: uid(), title: 'New Section', fields: [], collapsed: false,
});

const blankTemplate = (): EditorTemplate => ({
  id: uid(), name: '', source: 'Custom', version: '1.0.0', category: '', sections: [blankSection()],
});

const FIELD_TYPES: { value: FieldType; label: string; abbr: string; color: string; hasOptions: boolean }[] = [
  { value: 'dropdown',  label: 'Dropdown',  abbr: 'DROP', color: '#0891B2', hasOptions: true  },
  { value: 'radio',     label: 'Radio',     abbr: 'RDIO', color: '#7c3aed', hasOptions: true  },
  { value: 'checkboxes',label: 'Checkbox',  abbr: 'CHKB', color: '#0d9488', hasOptions: true  },
  { value: 'numeric',   label: 'Numeric',   abbr: 'NUM',  color: '#b45309', hasOptions: false },
  { value: 'text',      label: 'Free Text', abbr: 'TEXT', color: '#475569', hasOptions: false },
  { value: 'longtext',  label: 'Long Text', abbr: 'PARA', color: '#334155', hasOptions: false },
];

const SOURCE_OPTIONS   = ['CAP', 'RCPath', 'ICCR', 'RCPA', 'Custom'];
const CATEGORY_OPTIONS = ['BREAST', 'COLON', 'PROSTATE', 'LUNG', 'LIVER', 'KIDNEY', 'PLACENTA', 'SKIN', 'OTHER'];

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

const T = {
  bg: '#0f172a', surface: '#1e293b', card: '#0f1e35', border: '#334155',
  accent: '#0891B2', text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b', dimmer: '#475569',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '12px',
  color: T.text, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: T.dim, textTransform: 'uppercase',
  letterSpacing: '0.07em', display: 'block', marginBottom: '5px',
};

// ─── Mini shared components ───────────────────────────────────────────────────

const IconBtn: React.FC<{ onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode }> = ({
  onClick, title, danger, children,
}) => (
  <button
    onClick={onClick} title={title}
    style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
      borderRadius: '5px', fontSize: '13px', color: danger ? '#f87171' : T.dimmer,
      lineHeight: 1, transition: 'all 0.12s', fontFamily: 'inherit',
    }}
    onMouseEnter={e => { e.currentTarget.style.color = danger ? '#ef4444' : T.text; e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { e.currentTarget.style.color = danger ? '#f87171' : T.dimmer; e.currentTarget.style.background = 'none'; }}
  >
    {children}
  </button>
);

const CodingInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; color: string; placeholder: string }> = ({
  label, value, onChange, color, placeholder,
}) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: '9px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{label}</div>
    <input
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px', padding: '5px 8px' }}
      onFocus={e => (e.currentTarget.style.borderColor = color)}
      onBlur={e  => (e.currentTarget.style.borderColor = T.border)}
    />
  </div>
);

// ─── OptionRow ────────────────────────────────────────────────────────────────

const OptionRow: React.FC<{
  option: FieldOption; index: number; total: number;
  onChange: (patch: Partial<FieldOption>) => void;
  onRemove: () => void; onMove: (dir: -1 | 1) => void;
}> = ({ option, index, total, onChange, onRemove, onMove }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: `1px solid ${expanded ? 'rgba(8,145,178,0.25)' : T.border}` }}>
        <span style={{ color: T.dimmer, fontSize: '11px', cursor: 'grab', flexShrink: 0 }}>⠿</span>
        <input
          value={option.label} onChange={e => onChange({ label: e.target.value })}
          placeholder="Option label…"
          style={{ ...inputStyle, flex: 1, padding: '4px 7px', fontSize: '12px' }}
          onFocus={e => (e.currentTarget.style.borderColor = T.accent)}
          onBlur={e  => (e.currentTarget.style.borderColor = T.border)}
        />
        {option.snomed && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(8,145,178,0.15)', color: '#38bdf8', fontFamily: 'monospace', flexShrink: 0 }}>SCT</span>}
        {option.icd    && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontFamily: 'monospace', flexShrink: 0 }}>ICD</span>}
        <IconBtn onClick={() => setExpanded(x => !x)} title="Edit coding">{expanded ? '▲' : '⌥'}</IconBtn>
        <IconBtn onClick={() => onMove(-1)} title="Move up"  >{index === 0           ? ' ' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title="Move down">{index === total - 1   ? ' ' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title="Remove option">✕</IconBtn>
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', background: 'rgba(8,145,178,0.04)', border: `1px solid rgba(8,145,178,0.15)`, borderTop: 'none', borderRadius: '0 0 6px 6px', marginTop: '-1px' }}>
          <CodingInput label="SNOMED CT" value={option.snomed} onChange={v => onChange({ snomed: v })} color="#38bdf8" placeholder="e.g. 413448000" />
          <CodingInput label="ICD-10/11" value={option.icd}    onChange={v => onChange({ icd: v })}    color="#a78bfa" placeholder="e.g. C18.9" />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: open ? '#1a2744' : T.surface, border: `1px solid ${open ? 'rgba(8,145,178,0.3)' : T.border}`, borderRadius: open ? '9px 9px 0 0' : '9px', transition: 'all 0.12s' }}>
        <span style={{ color: T.dimmer, fontSize: '13px', cursor: 'grab', flexShrink: 0 }}>⠿</span>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); setTypeOpen(x => !x); }} title="Change field type" style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', border: `1px solid ${ftInfo.color}50`, background: `${ftInfo.color}18`, color: ftInfo.color, fontFamily: 'monospace', letterSpacing: '0.04em', transition: 'all 0.12s', lineHeight: 1.6 }}>
            {ftInfo.abbr} ▾
          </button>
          {typeOpen && (
            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: '#1e293b', border: `1px solid ${T.border}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: '130px' }}>
              {FIELD_TYPES.map(ft => (
                <button key={ft.value} onClick={() => { onChange({ type: ft.value, options: [] }); setTypeOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', background: field.type === ft.value ? `${ft.color}18` : 'transparent', color: field.type === ft.value ? ft.color : T.muted, fontSize: '12px', fontWeight: field.type === ft.value ? 700 : 400, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (field.type !== ft.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { if (field.type !== ft.value) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px', background: `${ft.color}20`, color: ft.color, fontFamily: 'monospace' }}>{ft.abbr}</span>
                  {ft.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <input value={field.label} onChange={e => onChange({ label: e.target.value })} placeholder="Field label…" onClick={e => e.stopPropagation()} style={{ ...inputStyle, flex: 1, fontSize: '13px', fontWeight: 600, padding: '5px 9px' }} onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.select(); }} onBlur={e => (e.currentTarget.style.borderColor = T.border)} />

        <button onClick={e => { e.stopPropagation(); onChange({ required: !field.required }); }} style={{ padding: '3px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: 'none', flexShrink: 0, fontFamily: 'inherit', background: field.required ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: field.required ? '#f87171' : T.dimmer, transition: 'all 0.15s' }}>
          {field.required ? 'Required' : 'Optional'}
        </button>

        {hasCode && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {field.snomed && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }} title="SNOMED coded" />}
            {field.icd    && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a78bfa' }} title="ICD coded" />}
          </div>
        )}

        {field.visibleWhen && <span title="Has visibility condition" style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', flexShrink: 0, letterSpacing: '0.02em' }}>IF</span>}

        <IconBtn onClick={() => setOpen(x => !x)} title={open ? 'Collapse' : 'Expand'}>
          <span style={{ transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>›</span>
        </IconBtn>
        <IconBtn onClick={() => onMove(-1)} title="Move up"  >{index === 0         ? '' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title="Move down">{index === total - 1 ? '' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title="Delete field">🗑</IconBtn>
      </div>

      {open && (
        <div style={{ background: '#131c30', border: `1px solid rgba(8,145,178,0.2)`, borderTop: 'none', borderRadius: '0 0 9px 9px', padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '160px', flexShrink: 0 }}>
              <label style={labelStyle}>Field Type</label>
              <select value={field.type} onChange={e => onChange({ type: e.target.value as FieldType, options: [] })} style={{ ...inputStyle, cursor: 'pointer' }} onFocus={e => (e.currentTarget.style.borderColor = T.accent)} onBlur={e => (e.currentTarget.style.borderColor = T.border)}>
                {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.abbr} — {ft.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hint / Helper Text <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <input value={field.hint ?? ''} onChange={e => onChange({ hint: e.target.value })} placeholder="Shown below the field in the report form…" style={inputStyle} onFocus={e => (e.currentTarget.style.borderColor = T.accent)} onBlur={e => (e.currentTarget.style.borderColor = T.border)} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Field-level Coding</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <CodingInput label="SNOMED CT" value={field.snomed} onChange={v => onChange({ snomed: v })} color="#38bdf8" placeholder="e.g. 363346000" />
              <CodingInput label="ICD-10/11" value={field.icd}    onChange={v => onChange({ icd: v })}    color="#a78bfa" placeholder="e.g. C18.0" />
            </div>
          </div>

          {ftInfo.hasOptions && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Answer Options <span style={{ color: T.dimmer, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— click ⌥ on any option to add SNOMED/ICD</span></label>
                <button onClick={addOption} style={{ padding: '4px 11px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: `1px solid rgba(8,145,178,0.3)`, background: 'rgba(8,145,178,0.1)', color: T.accent, fontFamily: 'inherit' }}>+ Add Answer Option</button>
              </div>
              {field.options.length === 0 && <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: T.dimmer, borderRadius: '7px', border: `1px dashed ${T.border}` }}>No answer options yet — click + Add Answer Option</div>}
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
  const addField    = () => onChange({ fields: [...section.fields, blankField()] });
  const updateField = (fId: string, patch: Partial<EditorField>) => onChange({ fields: section.fields.map(f => f.id === fId ? { ...f, ...patch } : f) });
  const removeField = (fId: string) => onChange({ fields: section.fields.filter(f => f.id !== fId) });
  const moveField   = (fId: string, dir: -1 | 1) => {
    const arr = [...section.fields]; const i = arr.findIndex(f => f.id === fId);
    if (i + dir < 0 || i + dir >= arr.length) return;
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]]; onChange({ fields: arr });
  };

  return (
    <div style={{ marginBottom: '16px', borderRadius: '12px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: section.visibleWhen ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.03)', borderBottom: section.collapsed ? 'none' : `1px solid ${T.border}`, borderTop: section.visibleWhen ? '2px solid rgba(251,191,36,0.25)' : 'none' }}>
        <span style={{ color: T.dimmer, fontSize: '14px', cursor: 'grab', flexShrink: 0 }}>⠿</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: T.dimmer, flexShrink: 0 }}>§{index + 1}</span>
        <input value={section.title} onChange={e => onChange({ title: e.target.value })} style={{ ...inputStyle, fontSize: '14px', fontWeight: 700, flex: 1, background: 'transparent', border: '1px solid transparent', padding: '4px 8px' }} onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.select(); }} onBlur={e => (e.currentTarget.style.borderColor = 'transparent')} />
        <span style={{ fontSize: '11px', color: T.dim, flexShrink: 0 }}>{section.fields.length} field{section.fields.length !== 1 ? 's' : ''}</span>
        {section.visibleWhen && <span title="Has visibility condition" style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', flexShrink: 0, letterSpacing: '0.02em' }}>IF</span>}
        <IconBtn onClick={() => onChange({ collapsed: !section.collapsed })} title={section.collapsed ? 'Expand' : 'Collapse'}>
          <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: section.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
        </IconBtn>
        <IconBtn onClick={() => onMove(-1)} title="Move up"  >{index === 0         ? '' : '↑'}</IconBtn>
        <IconBtn onClick={() => onMove(1)}  title="Move down">{index === total - 1 ? '' : '↓'}</IconBtn>
        <IconBtn onClick={onRemove} danger title="Delete section">🗑</IconBtn>
      </div>

      {!section.collapsed && (
        <div style={{ padding: '0 16px', background: 'rgba(255,255,255,0.01)', borderBottom: `1px solid ${T.border}` }}>
          <ConditionPicker condition={section.visibleWhen} template={template} onChange={c => onChange({ visibleWhen: c })} />
          <div style={{ height: '14px' }} />
        </div>
      )}

      {!section.collapsed && (
        <div style={{ padding: '14px 16px', background: T.bg }}>
          {section.fields.length === 0 && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: T.dimmer, borderRadius: '8px', border: `1px dashed ${T.border}`, marginBottom: '10px' }}>No fields yet — add one below</div>}
          {section.fields.map((field, fi) => (
            <FieldCard key={field.id} field={field} index={fi} total={section.fields.length} template={template} onChange={patch => updateField(field.id, patch)} onRemove={() => removeField(field.id)} onMove={dir => moveField(field.id, dir)} />
          ))}
          <button onClick={addField} style={{ width: '100%', padding: '9px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: `1px dashed rgba(8,145,178,0.3)`, background: 'rgba(8,145,178,0.05)', color: T.accent, fontFamily: 'inherit', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(8,145,178,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(8,145,178,0.05)'}>
            + Add Field
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
  const choices   = allChoiceFields(template).filter(f => f.id !== excludeFieldId);
  const enabled   = !!condition;
  const srcField  = choices.find(f => f.id === condition?.fieldId);

  return (
    <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '8px', border: `1px solid ${enabled ? 'rgba(251,191,36,0.3)' : T.border}`, background: enabled ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: enabled ? '12px' : 0 }}>
        <button onClick={() => onChange(enabled ? undefined : { fieldId: '', answerId: '' })} style={{ width: '34px', height: '18px', borderRadius: '99px', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, background: enabled ? '#f59e0b' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', left: enabled ? '18px' : '2px' }} />
        </button>
        <span style={{ fontSize: '12px', fontWeight: 600, color: enabled ? '#fbbf24' : T.dim }}>
          {enabled ? 'Shown only when...' : 'Always visible'}
        </span>
        {!enabled && choices.length === 0 && <span style={{ fontSize: '11px', color: T.dimmer, fontStyle: 'italic' }}>(add a Dropdown, Radio, or Checkbox field first)</span>}
      </div>

      {enabled && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, color: '#fbbf24' }}>When field</label>
            <select value={condition?.fieldId ?? ''} onChange={e => onChange({ fieldId: e.target.value, answerId: '' })} style={{ ...inputStyle, borderColor: condition?.fieldId ? T.border : '#f59e0b' }} onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')} onBlur={e => (e.currentTarget.style.borderColor = condition?.fieldId ? T.border : '#f59e0b')}>
              <option value="">— pick a field —</option>
              {choices.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, color: '#fbbf24' }}>Answer is</label>
            <select value={condition?.answerId ?? ''} onChange={e => onChange({ ...condition!, answerId: e.target.value })} disabled={!srcField} style={{ ...inputStyle, borderColor: condition?.answerId ? T.border : (srcField ? '#f59e0b' : T.border), opacity: srcField ? 1 : 0.5 }} onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')} onBlur={e => (e.currentTarget.style.borderColor = condition?.answerId ? T.border : (srcField ? '#f59e0b' : T.border))}>
              <option value="">— pick an answer —</option>
              {srcField?.options.map(o => <option key={o.id} value={o.id}>{o.label || '(unlabelled option)'}</option>)}
            </select>
          </div>
        </div>
      )}

      {enabled && condition?.fieldId && !condition?.answerId && <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px' }}>⚠ Select an answer to complete this condition</div>}
      {enabled && !condition?.fieldId && choices.length > 0  && <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px' }}>⚠ Select a field to trigger this condition</div>}
      {enabled && choices.length === 0 && <div style={{ fontSize: '11px', color: '#f87171', marginTop: '6px' }}>⚠ No Dropdown, Radio, or Checkbox fields available as triggers</div>}
    </div>
  );
};

// ─── Preview Modal (live — evaluates conditions) ──────────────────────────────

const PreviewModal: React.FC<{ template: EditorTemplate; onClose: () => void }> = ({ template, onClose }) => {
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
      <div onClick={e => e.stopPropagation()} style={{ width: '660px', maxHeight: '88vh', background: '#fff', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{template.name || 'Untitled Template'}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{template.source} · v{template.version} · Pathologist preview — conditions are live</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => setAnswers({})} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>Reset</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {template.sections.map(sec => {
            const secVisible = isVisible(sec.visibleWhen, answers);
            return (
              <div
                key={sec.id}
                style={{
                  // FIX TS1117: removed duplicate marginBottom — only the conditional one remains
                  marginBottom: secVisible ? '28px' : 0,
                  transition: 'opacity 0.2s',
                  opacity: secVisible ? 1 : 0,
                  pointerEvents: secVisible ? 'auto' : 'none',
                  height: secVisible ? 'auto' : 0,
                  overflow: secVisible ? 'visible' : 'hidden',
                }}
              >
                {sec.visibleWhen && <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⟳</span> Conditional section</div>}
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '2px solid #0f172a', paddingBottom: '5px', marginBottom: '14px' }}>{sec.title}</div>

                {sec.fields.map(f => {
                  const fVisible = isVisible(f.visibleWhen, answers);
                  if (!secVisible) return null;
                  return (
                    <div key={f.id} style={{ marginBottom: fVisible ? '14px' : 0, maxHeight: fVisible ? '200px' : 0, overflow: 'hidden', opacity: fVisible ? 1 : 0, transition: 'all 0.2s ease', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                      <div style={{ width: '200px', flexShrink: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                          {f.label || '(unlabelled)'}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
                          {f.visibleWhen && <span style={{ marginLeft: '5px', fontSize: '9px', color: '#f59e0b', fontWeight: 700 }}>COND</span>}
                        </div>
                        {(f.snomed || f.icd) && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                            {f.snomed && <span style={{ fontSize: '9px', fontFamily: 'monospace', padding: '1px 5px', borderRadius: '3px', background: '#e0f2fe', color: '#0369a1' }}>SCT {f.snomed}</span>}
                            {f.icd    && <span style={{ fontSize: '9px', fontFamily: 'monospace', padding: '1px 5px', borderRadius: '3px', background: '#ede9fe', color: '#7c3aed' }}>ICD {f.icd}</span>}
                          </div>
                        )}
                        {f.hint && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px', fontStyle: 'italic' }}>{f.hint}</div>}
                      </div>
                      <div style={{ flex: 1 }}>
                        {f.type === 'dropdown' && <select value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', color: '#475569', background: '#fff' }}><option value="">Select…</option>{f.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
                        {f.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>{f.options.map(o => <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}><input type="radio" name={f.id} value={o.id} checked={answers[f.id] === o.id} onChange={() => setAnswer(f.id, o.id)} style={{ accentColor: '#0891B2' }} />{o.label}</label>)}</div>}
                        {f.type === 'checkboxes' && <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>{f.options.map(o => { const cur = (answers[f.id] as string[]) ?? []; return <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}><input type="checkbox" value={o.id} checked={cur.includes(o.id)} onChange={() => setAnswer(f.id, cur.includes(o.id) ? cur.filter(x => x !== o.id) : [...cur, o.id])} style={{ accentColor: '#0891B2' }} />{o.label}</label>; })}</div>}
                        {f.type === 'numeric'  && <input type="number" value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} style={{ width: '120px', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px' }} />}
                        {f.type === 'text'     && <input type="text"   value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px' }} />}
                        {f.type === 'longtext' && <textarea rows={3}   value={(answers[f.id] as string) ?? ''} onChange={e => setAnswer(f.id, e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', resize: 'vertical' }} />}
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
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
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
        const t = detail.template;
        const bumpPatch = (v: string) => { const [maj, min, pat] = v.split('.').map(Number); return `${maj}.${min}.${(pat || 0) + 1}`; };
        setTemplate(isDuplicate ? { ...t, id: uid(), name: `${t.name} (Copy)`, version: bumpPatch(t.version) } : t);
      })
      .catch(() => {
        const source = PROTOCOL_REGISTRY.find(p => p.id === templateId);
        if (source) {
          setTemplate({ id: isDuplicate ? uid() : source.id, name: isDuplicate ? `${source.name} (Copy)` : source.name, source: source.source, version: isDuplicate ? (() => { const [a,b,c] = source.version.split('.').map(Number); return `${a}.${b}.${(c||0)+1}`; })() : source.version, category: source.category, sections: [blankSection()] });
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
    if (!template.name.trim()) return 'Template name is required';
    const duplicate = PROTOCOL_REGISTRY.find(p => p.name.toLowerCase() === template.name.trim().toLowerCase() && p.id !== template.id);
    if (duplicate) return `A template named "${duplicate.name}" already exists`;
    return null;
  })();

  const handleSaveDraft = async () => {
    if (nameError) { setSaveError(nameError); return; }
    setIsSaving(true); setSaveError(null);
    try { await saveDraft(template); setIsDirty(false); } catch (err: any) { setSaveError(err?.message ?? 'Save failed — please try again'); } finally { setIsSaving(false); }
  };

  const handleSubmitForReview = async () => {
    setShowSubmitConfirm(false);
    if (nameError) { setSaveError(nameError); return; }
    setIsSaving(true); setSaveError(null);
    try { await saveDraft(template); await submitForReview(template.id); navigate('/configuration?tab=protocols&section=review'); } catch (err: any) { setSaveError(err?.message ?? 'Submit failed — please try again'); setIsSaving(false); }
  };

  const cov = calcCoverage(template);
  const { alerts, isLoading: alertsLoading, dismiss: dismissAlert, revalidate } = useTerminologyAlerts(template);

  if (templateLoading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: T.muted }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⏳</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading template…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, backgroundImage: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)', color: T.text, fontFamily: "'Inter', sans-serif" }}>

      {/* ── Nav bar ── */}
      <nav style={{ padding: '12px 40px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => guardedNavigate(backTarget)} style={{ padding: '7px 14px', borderRadius: '7px', border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.muted, cursor: 'pointer', fontSize: '13px', fontWeight: 500, fontFamily: 'inherit' }} onMouseEnter={e => (e.currentTarget.style.color = T.text)} onMouseLeave={e => (e.currentTarget.style.color = T.muted)}>← Protocols</button>
          <div style={{ fontSize: '13px', color: T.dimmer, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span onClick={() => guardedNavigate(backTarget)} style={{ cursor: 'pointer', color: T.dim }} onMouseEnter={e => (e.currentTarget.style.color = T.accent)} onMouseLeave={e => (e.currentTarget.style.color = T.dim)}>Protocols</span>
            <span style={{ color: T.border }}>›</span>
            <span style={{ color: T.text, fontWeight: 600 }}>{isDuplicate ? `Duplicate — ${template.name || 'Untitled'}` : isNew ? (template.name ? template.name : 'New Template') : (template.name || 'Untitled')}</span>
            {(isNew && !template.name) && <span style={{ fontSize: '11px', color: T.dimmer, fontStyle: 'italic' }}>— enter a name above</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveError && <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 500 }}>⚠ {saveError}</span>}
          {alerts.some(a => a.severity === 'error')   && <span style={{ fontSize: '12px', color: '#f87171',  fontWeight: 500 }}>🚫 Deprecated codes</span>}
          {!alerts.some(a => a.severity === 'error') && alerts.some(a => a.severity === 'warning') && <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 500 }}>⚠️ Terminology warnings</span>}
          {isDirty && !isSaving && <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 500 }}>● Unsaved changes</span>}
          {isSaving && <span style={{ fontSize: '12px', color: T.dim, fontWeight: 500 }}>Saving…</span>}
          <button onClick={() => setShowPreview(true)} style={{ padding: '7px 14px', borderRadius: '7px', border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit' }} onMouseEnter={e => e.currentTarget.style.color = T.text} onMouseLeave={e => e.currentTarget.style.color = T.muted}>👁 Preview</button>
          <button onClick={handleSaveDraft} disabled={isSaving} style={{ padding: '7px 14px', borderRadius: '7px', border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: isSaving ? T.dim : T.muted, cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', opacity: isSaving ? 0.6 : 1 }} onMouseEnter={e => { if (!isSaving) e.currentTarget.style.color = T.text; }} onMouseLeave={e => e.currentTarget.style.color = isSaving ? T.dim : T.muted}>{isSaving ? '…' : '💾 Save Draft'}</button>
          <button onClick={() => setShowSubmitConfirm(true)} disabled={isSaving} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid rgba(8,145,178,0.4)', background: 'rgba(8,145,178,0.15)', color: T.accent, cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s', opacity: isSaving ? 0.6 : 1 }} onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = 'rgba(8,145,178,0.25)'; }} onMouseLeave={e => e.currentTarget.style.background = 'rgba(8,145,178,0.15)'}>📤 Submit for Review</button>
        </div>
      </nav>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', gap: '24px', padding: '28px 40px 80px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* ── Request Details Banner (shown when opened from a template request message) ── */}
        {fromRequest && requestMeta && (
          <div style={{
            position: 'absolute', left: 40, right: 40, top: 72,
            padding: '12px 20px', borderRadius: 10, zIndex: 50,
            background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.3)',
            display: 'flex', alignItems: 'flex-start', gap: 16, fontSize: 13,
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📋</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                Template Request from {requestMeta.requestedByName}
                <span style={{
                  marginLeft: 10, fontSize: 11, fontWeight: 700, padding: '2px 8px',
                  borderRadius: 20, background: 'rgba(8,145,178,0.18)', color: '#38bdf8',
                  textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle',
                }}>
                  {requestMeta.urgency}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', fontSize: 12 }}>
                {[
                  ['Standard', requestMeta.standard],
                  ['Organ', requestMeta.organ],
                  ['Procedure', requestMeta.procedure],
                  ['Base', requestMeta.baseTemplateName ?? 'None specified'],
                ].map(([l, v]) => (
                  <span key={l} style={{ color: '#64748b' }}>
                    {l}: <strong style={{ color: '#cbd5e1' }}>{v}</strong>
                  </span>
                ))}
              </div>
              {requestMeta.keyFields && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 11, color: '#38bdf8', cursor: 'pointer' }}>
                    View requested fields
                  </summary>
                  <pre style={{
                    margin: '6px 0 0', padding: '8px 12px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.25)', color: '#94a3b8',
                    fontSize: 11, fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                  }}>{requestMeta.keyFields}</pre>
                </details>
              )}
            </div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {registryEntry?.status === 'needs_changes' && registryEntry.reviewNote && (
            <div style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '14px' }}>↩️</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f87171' }}>Changes Requested</span>
                {registryEntry.reviewedBy && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>by <strong style={{ color: '#cbd5e1' }}>{registryEntry.reviewedBy}</strong>{registryEntry.reviewedAt && <> · {new Date(registryEntry.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}</span>}
              </div>
              <div style={{ fontSize: '13px', color: '#fca5a5', lineHeight: 1.6 }}>{registryEntry.reviewNote}</div>
            </div>
          )}

          <TerminologyAlertBanner alerts={alerts} isLoading={alertsLoading} onDismiss={dismissAlert} onRevalidate={revalidate} />

          {/* Template metadata */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '18px 20px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>Template Metadata</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Template Name</label>
                <input value={template.name} onChange={e => { update({ name: e.target.value }); setSaveError(null); }} placeholder="e.g. CAP Colon Resection" style={{ ...inputStyle, fontSize: '15px', fontWeight: 700, borderColor: nameError && template.name ? '#f87171' : undefined }} onFocus={e => (e.currentTarget.style.borderColor = nameError && template.name ? '#f87171' : T.accent)} onBlur={e => (e.currentTarget.style.borderColor = nameError && template.name ? '#f87171' : T.border)} />
                {nameError && template.name && <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>⚠ {nameError}</div>}
              </div>
              <div>
                <label style={labelStyle}>Source / Governing Body</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {SOURCE_OPTIONS.map(s => <button key={s} onClick={() => update({ source: s })} style={{ padding: '4px 14px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.12s', border: `1px solid ${template.source === s ? 'rgba(8,145,178,0.4)' : T.border}`, background: template.source === s ? 'rgba(8,145,178,0.15)' : 'rgba(255,255,255,0.03)', color: template.source === s ? T.accent : T.dim }}>{s}</button>)}
                </div>
              </div>
              <div style={{ width: '170px' }}>
                <label style={labelStyle}>Version</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: T.text, minWidth: '52px', textAlign: 'center' }}>{template.version || '1.0.0'}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {(['MAJOR', 'MINOR', 'PATCH'] as const).map((part, i) => (
                      <button key={part} title={`Bump ${part}`} onClick={() => { const [maj, min, pat] = (template.version || '1.0.0').split('.').map(Number); const next = i === 0 ? `${maj + 1}.0.0` : i === 1 ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`; update({ version: next }); }} style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace', border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.dim, transition: 'all 0.12s', letterSpacing: '0.04em' }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.dim; }}>+{part}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Anatomical Category</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {CATEGORY_OPTIONS.map(cat => <button key={cat} onClick={() => update({ category: cat })} style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.12s', border: `1px solid ${template.category === cat ? 'rgba(8,145,178,0.4)' : T.border}`, background: template.category === cat ? 'rgba(8,145,178,0.15)' : 'rgba(255,255,255,0.03)', color: template.category === cat ? T.accent : T.dim }}>{cat}</button>)}
                </div>
              </div>
            </div>
          </div>

          {template.sections.map((sec, si) => (
            <SectionCard key={sec.id} section={sec} index={si} total={template.sections.length} template={template} onChange={patch => updateSection(sec.id, patch)} onRemove={() => removeSection(sec.id)} onMove={dir => moveSection(sec.id, dir)} />
          ))}

          <button onClick={addSection} style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: `2px dashed rgba(8,145,178,0.25)`, background: 'transparent', color: T.accent, fontFamily: 'inherit', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(8,145,178,0.05)'; e.currentTarget.style.borderColor = 'rgba(8,145,178,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(8,145,178,0.25)'; }}>+ Add Section</button>
        </div>

        {/* ── Right: stats sidebar ── */}
        <div style={{ width: '220px', flexShrink: 0 }}>
          <div style={{ position: 'sticky', top: '76px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: T.dimmer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Coding Coverage</div>
              {[{ label: 'SNOMED CT', pct: cov.snomed, color: '#38bdf8' }, { label: 'ICD-10/11', pct: cov.icd, color: '#a78bfa' }, { label: 'Answer-level', pct: cov.answerLevel, color: '#4ade80' }].map(bar => (
                <div key={bar.label} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '11px', color: T.muted }}>{bar.label}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: bar.pct >= 80 ? '#10B981' : bar.pct >= 50 ? '#fbbf24' : '#f87171' }}>{bar.pct}%</span>
                  </div>
                  <div style={{ height: '3px', background: T.border, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${bar.pct}%`, height: '100%', background: bar.color, borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${T.border}`, fontSize: '11px', color: T.dimmer }}>{cov.totalFields} field{cov.totalFields !== 1 ? 's' : ''} · {template.sections.length} section{template.sections.length !== 1 ? 's' : ''}</div>
            </div>

            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: T.dimmer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Readiness</div>
              {[{ label: 'Template name', ok: !!template.name }, { label: 'Category set', ok: !!template.category }, { label: 'At least 1 section', ok: template.sections.length > 0 }, { label: 'At least 1 field', ok: cov.totalFields > 0 }, { label: 'SNOMED ≥ 80%', ok: cov.snomed >= 80 }].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: item.ok ? '#10B981' : '#f87171', flexShrink: 0 }}>{item.ok ? '✓' : '○'}</span>
                  <span style={{ fontSize: '11px', color: item.ok ? T.muted : T.dimmer }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px', borderRadius: '9px', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', fontSize: '11px', color: T.dimmer, lineHeight: 1.6 }}>
              <span style={{ color: '#a78bfa', fontWeight: 600 }}>💡 Tip — </span>
              Click ⌥ on any answer option to add SNOMED CT and ICD codes at the answer level.
            </div>
          </div>
        </div>
      </div>

      {showPreview && <PreviewModal template={template} onClose={() => setShowPreview(false)} />}

      {showSubmitConfirm && (
        <div className="ps-overlay" style={{ zIndex: 9500 }} onClick={() => setShowSubmitConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '420px', background: T.surface, borderRadius: '14px', border: `1px solid ${T.border}`, boxShadow: '0 25px 50px rgba(0,0,0,0.6)', padding: '24px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: T.text, marginBottom: '8px' }}>Submit for Review?</div>
            <p style={{ fontSize: '13px', color: T.muted, lineHeight: 1.7, margin: '0 0 20px' }}>This will move <strong>{template.name || 'this template'}</strong> to the Review Queue and notify admins and clinical leads. You won't be able to edit it until it's returned for changes.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSubmitConfirm(false)} className="ps-conf-btn-secondary">Cancel</button>
              <button onClick={handleSubmitForReview} className="ps-conf-btn-teal-accent" style={{ fontWeight: 700 }}>Submit for Review →</button>
            </div>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <div className="ps-overlay" style={{ zIndex: 9500 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '420px', background: T.surface, borderRadius: '14px', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', padding: '24px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: T.text, marginBottom: '8px' }}>Unsaved Changes</div>
            <p style={{ fontSize: '13px', color: T.muted, lineHeight: 1.7, margin: '0 0 20px' }}>You have unsaved changes to <strong>{template.name || 'this template'}</strong>. Would you like to save a draft before leaving, or discard your changes?</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowDiscardConfirm(false); setPendingNavTarget(null); }} style={{ padding: '9px 18px', borderRadius: '8px', border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Keep Editing</button>
              <button onClick={() => { setIsDirty(false); setShowDiscardConfirm(false); if (pendingNavTarget) navigate(pendingNavTarget); setPendingNavTarget(null); }} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Discard Changes</button>
              <button onClick={async () => { if (nameError) { setSaveError(nameError); setShowDiscardConfirm(false); return; } await handleSaveDraft(); setShowDiscardConfirm(false); if (pendingNavTarget) navigate(pendingNavTarget); setPendingNavTarget(null); }} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid rgba(8,145,178,0.4)', background: 'rgba(8,145,178,0.15)', color: T.accent, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>💾 Save Draft &amp; Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SynopticEditor;
