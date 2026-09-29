// src/components/TemplateBuilder/TemplateInspector.tsx
// ─────────────────────────────────────────────────────────────
// Right-panel inspector for the Template Builder.
// Covers all 18 node types with full property editors.
//
// i18n (file-by-file sweep):
//   Every dot-notation / curly-brace / pipe-syntax placeholder or default
//   value in this file (e.g. "synoptic.tumorType", "{{patient.name}}",
//   "grade1|Grade 1") is a literal example of the exact syntax a template
//   author must type — the app's internal binding-key/expression schema is
//   English regardless of UI language, so translating these would actively
//   mislead the author about what to type. All such examples are left as
//   literal, untranslated text (not even routed through i18n), consistent
//   with this sweep's "internal schema/data-key identifiers stay English"
//   convention. `node.type` (the "Inspector" header's type tag) is the
//   same kind of internal schema identifier and is likewise left as-is.
//   Two hint boxes (ParagraphEditor, RichTextBlockEditor) mix translatable
//   prose with inline bold/code formatting around specific words — these
//   use react-i18next's <Trans> component (its first use in this codebase)
//   rather than this sweep's usual "split into pre/bold/post keys" pattern,
//   since a multi-clause sentence chunked that way reads naturally in
//   English but produces broken word order once translated (German verb
//   position, Korean SOV order, etc.) — <Trans> keeps each hint as one
//   coherent, correctly-ordered sentence per locale.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type {
  TemplateNode,
  LabelConfig,
  SectionNode,
  TextFieldNode,
  ParagraphNode,
  RichTextBlockNode,
  DropdownNode,
  NumberNode,
  DateNode,
  ComputedNode,
  StaticLabelNode,
  RepeatGroupNode,
  ColumnLayoutNode,
  TemplateRefNode,
  PageBreakNode,
  IfBlockNode,
  SwitchBlockNode,
  ExpressionValueNode,
  HeaderNode,
  FooterNode,
  ImageEmbedNode,
  ConditionalExpression,
  ExpressionClause,
  ExpressionOperator,
  AiGenerationConfig,
} from '../../types/template';

interface Props {
  node: TemplateNode | null;
  onUpdate: (updated: TemplateNode) => void;
}

// ── Primitive field components ─────────────────────────────────
// These are generic, pre-translated-string-in / string-out wrappers used
// by every editor below, so none of them need useTranslation() themselves.

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ps-tinsp-label">{children}</div>
);

export const TextInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}> = ({ value, onChange, placeholder, mono }) => (
  <input
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className={`ps-tinsp-input${mono ? ' ps-tinsp-input--mono' : ''}`}
  />
);

const Textarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  height?: number;
  mono?: boolean;
}> = ({ value, onChange, placeholder, height = 72, mono }) => (
  <textarea
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ '--tinsp-textarea-h': `${height}px` } as React.CSSProperties}
    className={`ps-tinsp-input ps-tinsp-textarea${mono ? ' ps-tinsp-input--mono' : ''}`}
  />
);

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className="ps-tinsp-toggle-row">
    <div
      onClick={() => onChange(!checked)}
      className={`ps-tinsp-toggle-track${checked ? ' ps-tinsp-toggle-track--on' : ''}`}
    >
      <div className={`ps-tinsp-toggle-thumb${checked ? ' ps-tinsp-toggle-thumb--on' : ''}`} />
    </div>
    <span className="ps-tinsp-toggle-label">{label}</span>
  </label>
);

export const Sel: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  fullWidth?: boolean;
}> = ({ value, onChange, options, fullWidth }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`ps-tinsp-select${fullWidth ? ' ps-tinsp-select--full' : ''}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const Div: React.FC<{ label: string }> = ({ label }) => (
  <div className="ps-tinsp-divider">{label}</div>
);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ps-tinsp-row">{children}</div>
);

// ── Conditional expression builder ─────────────────────────────

const useOperators = (): { value: ExpressionOperator; label: string }[] => {
  const { t } = useTranslation();
  return [
    { value: '==',       label: t('templateInspector.operator.equals') },
    { value: '!=',       label: t('templateInspector.operator.notEquals') },
    { value: '>',        label: t('templateInspector.operator.greaterThan') },
    { value: '<',        label: t('templateInspector.operator.lessThan') },
    { value: '>=',       label: t('templateInspector.operator.greaterOrEqual') },
    { value: '<=',       label: t('templateInspector.operator.lessOrEqual') },
    { value: 'notEmpty', label: t('templateInspector.operator.notEmpty') },
    { value: 'isEmpty',  label: t('templateInspector.operator.isEmpty') },
    { value: 'contains', label: t('templateInspector.operator.contains') },
  ];
};

const ExpressionBuilder: React.FC<{
  expression: ConditionalExpression;
  onChange: (e: ConditionalExpression) => void;
  title: string;
}> = ({ expression, onChange, title }) => {
  const { t } = useTranslation();
  const OPERATORS = useOperators();
  const add = () => onChange({ ...expression, clauses: [...expression.clauses, { field: '', operator: '==', value: '' }] });
  const upd = (i: number, p: Partial<ExpressionClause>) =>
    onChange({ ...expression, clauses: expression.clauses.map((c, idx) => idx === i ? { ...c, ...p } : c) });
  const rm  = (i: number) => onChange({ ...expression, clauses: expression.clauses.filter((_, idx) => idx !== i) });

  return (
    <div className="ps-tinsp-expr-box">
      <div className="ps-tinsp-expr-header">
        <span className="ps-tinsp-expr-title">{title}</span>
        <Sel value={expression.logic} onChange={v => onChange({ ...expression, logic: v as 'AND' | 'OR' })}
          options={[
            { value: 'AND', label: t('templateInspector.logic.and') },
            { value: 'OR',  label: t('templateInspector.logic.or') },
          ]} />
      </div>
      {expression.clauses.map((c, i) => (
        <div key={i} className="ps-tinsp-clause-row">
          {/* "context.field" is an example binding-key path — internal
              schema syntax, deliberately left untranslated (see file header). */}
          <input value={c.field} onChange={e => upd(i, { field: e.target.value })}
            placeholder="context.field" className="ps-tinsp-input ps-tinsp-input--mono ps-tinsp-col ps-tinsp-col--w80" />
          <Sel value={c.operator} onChange={v => upd(i, { operator: v as ExpressionOperator })} options={OPERATORS} />
          {!['notEmpty','isEmpty'].includes(c.operator) && (
            <input value={String(c.value ?? '')} onChange={e => upd(i, { value: e.target.value })}
              placeholder={t('templateInspector.expressionBuilder.valuePlaceholder')} className="ps-tinsp-input ps-tinsp-col ps-tinsp-col--w60" />
          )}
          <button onClick={() => rm(i)} className="ps-tinsp-rm-btn">✕</button>
        </div>
      ))}
      <button onClick={add} className="ps-tinsp-add-btn">{t('templateInspector.expressionBuilder.addConditionButton')}</button>
    </div>
  );
};

// ── AI config ──────────────────────────────────────────────────

const AiConfigEditor: React.FC<{
  config: AiGenerationConfig;
  onChange: (c: AiGenerationConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-tinsp-stack">
      <Toggle checked={config.enabled} onChange={v => onChange({ ...config, enabled: v })}
        label={t('templateInspector.aiConfig.enableToggle')} />
      {config.enabled && (<>
        <Label>{t('templateInspector.aiConfig.systemInstructionLabel')}</Label>
        <Textarea value={config.systemInstruction ?? ''} height={80}
          onChange={v => onChange({ ...config, systemInstruction: v })}
          placeholder={t('templateInspector.aiConfig.systemInstructionPlaceholder')} />
        <Row>
          <div className="ps-tinsp-col">
            <Label>{t('templateInspector.aiConfig.maxTokensLabel')}</Label>
            <TextInput value={String(config.maxTokens ?? 1024)}
              onChange={v => onChange({ ...config, maxTokens: parseInt(v) || 1024 })} />
          </div>
          <div className="ps-tinsp-col">
            <Label>{t('templateInspector.aiConfig.temperatureLabel')}</Label>
            <TextInput value={String(config.temperature ?? 0.3)}
              onChange={v => onChange({ ...config, temperature: parseFloat(v) || 0.3 })} />
          </div>
        </Row>
      </>)}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Per-type editors — all 18 types
// ─────────────────────────────────────────────────────────────

// ── Content ───────────────────────────────────────────────────

const TextFieldEditor: React.FC<{ node: TextFieldNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.textField.divLabel')} />
    <Label>{t('templateInspector.textField.bindingKeyLabel')}</Label>
    <TextInput value={node.bindingKey} onChange={v => u({ ...node, bindingKey: v })} placeholder="synoptic.tumorType" mono />
    <Label>{t('templateInspector.textField.placeholderLabel')}</Label>
    <TextInput value={node.placeholder ?? ''} onChange={v => u({ ...node, placeholder: v })} />
    <Label>{t('templateInspector.textField.validationRegexLabel')}</Label>
    <TextInput value={node.validationRegex ?? ''} onChange={v => u({ ...node, validationRegex: v })} placeholder={t('templateInspector.textField.validationRegexPlaceholder')} mono />
    <Row>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.textField.maxLengthLabel')}</Label>
        <TextInput value={String(node.maxLength ?? '')} onChange={v => u({ ...node, maxLength: parseInt(v) || undefined })} placeholder="∞" />
      </div>
    </Row>
  </>);
};

const ParagraphEditor: React.FC<{ node: ParagraphNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.nodeName.dataParagraph')} />
    <div className="ps-tinsp-hint-box">
      <Trans i18nKey="templateInspector.paragraph.hint" components={{
        strong: <strong className="ps-tinsp-hint-strong" />,
        accent: <strong className="ps-tinsp-hint-accent" />,
        code: <code className="ps-tinsp-hint-mono" />,
        br: <br />,
      }} />
    </div>
    <Label>{t('templateInspector.paragraph.bindingKeySourceLabel')}</Label>
    <TextInput value={node.bindingKey} onChange={v => u({ ...node, bindingKey: v })} placeholder="diagnostic.grossDescription" mono />
    <div className="ps-tinsp-bindkeys-wrap">
      <a href="#" onClick={e => { e.preventDefault(); }} className="ps-tinsp-bindkeys-link">
        {t('templateInspector.paragraph.commonBindingKeysLink')}
      </a>
      {/* The binding-key paths below are real internal schema identifiers
          — left as literal, untranslated example text (see file header). */}
      <div className="ps-tinsp-bindkeys-list">
        diagnostic.grossDescription<br />
        diagnostic.microscopicDescription<br />
        diagnostic.ancillaryStudies<br />
        diagnostic.comment<br />
        order.clinicalIndication<br />
        specimen.grossDescription
      </div>
    </div>
    <div className="ps-tinsp-toggle-stack--symmetric ps-tinsp-stack">
      <Toggle checked={node.richText ?? true}    onChange={v => u({ ...node, richText: v })}   label={t('templateInspector.paragraph.richTextToggle')} />
      <Toggle checked={node.aiWritable ?? true}  onChange={v => u({ ...node, aiWritable: v })} label={t('templateInspector.paragraph.aiWritableToggle')} />
    </div>
  </>);
};

// ── Rich Text Block editor ─────────────────────────────────────
// For freeform prose authored directly in the template.

const RichTextBlockEditor: React.FC<{ node: RichTextBlockNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.nodeName.richTextBlock')} />
    <div className="ps-tinsp-hint-box">
      <Trans i18nKey="templateInspector.richTextBlock.hint" components={{
        strong: <strong className="ps-tinsp-hint-strong" />,
      }} />
    </div>
    <Label>{t('templateInspector.richTextBlock.contentLabel')}</Label>
    <Textarea
      value={node.content}
      onChange={v => u({ ...node, content: v })}
      placeholder={t('templateInspector.richTextBlock.contentPlaceholder')}
      height={120}
    />
    <Label>{t('templateInspector.richTextBlock.textAlignLabel')}</Label>
    <Sel value={node.textAlign ?? 'left'} onChange={v => u({ ...node, textAlign: v as RichTextBlockNode['textAlign'] })}
      options={[
        { value: 'left',   label: t('templateInspector.align.left') },
        { value: 'center', label: t('templateInspector.align.center') },
        { value: 'right',  label: t('templateInspector.align.right') },
      ]} fullWidth />
    <Label>{t('templateInspector.richTextBlock.fontSizeLabel')}</Label>
    <TextInput value={String(node.fontSize ?? 13)} onChange={v => u({ ...node, fontSize: parseInt(v) || 13 })} placeholder="13" />
  </>);
};

// ── Label config editor ────────────────────────────────────────
// Controls how the field label appears in the printed report.

const LabelConfigEditor: React.FC<{ config: LabelConfig; onChange: (c: LabelConfig) => void }> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const POSITION_OPTIONS = [
    { value: 'adjacent', label: t('templateInspector.labelConfig.position.adjacent') },
    { value: 'above',    label: t('templateInspector.labelConfig.position.above') },
    { value: 'none',     label: t('templateInspector.labelConfig.position.none') },
  ];

  // Dynamic preview values (arbitrary fontSize + boolean-derived states) are
  // passed through as CSS custom properties so the actual property/value
  // pairs stay defined in pathscribe.css rather than as inline style rules.
  const previewVars: React.CSSProperties = {
    ['--lc-fontsize' as string]: `${config.fontSize ?? (config.position === 'above' ? 12 : 11)}px`,
    ['--lc-weight' as string]: config.weight === 'bold' ? 700 : 600,
    ['--lc-decoration' as string]: config.decoration === 'underline' ? 'underline' : 'none',
    ['--lc-transform' as string]: config.transform === 'uppercase' ? 'uppercase' : config.transform === 'capitalize' ? 'capitalize' : 'none',
  };

  return (
    <div className="ps-tinsp-stack">
      <Label>{t('templateInspector.labelConfig.positionLabel')}</Label>
      <Sel value={config.position} onChange={v => onChange({ ...config, position: v as LabelConfig['position'] })}
        options={POSITION_OPTIONS} fullWidth />

      {config.position !== 'none' && (<>
        <Label>{t('templateInspector.labelConfig.transformLabel')}</Label>
        <Sel value={config.transform ?? 'uppercase'} onChange={v => onChange({ ...config, transform: v as LabelConfig['transform'] })}
          options={[
            { value: 'uppercase',  label: t('templateInspector.labelConfig.transform.uppercase') },
            { value: 'capitalize', label: t('templateInspector.labelConfig.transform.capitalize') },
            { value: 'none',       label: t('templateInspector.labelConfig.transform.asTyped') },
          ]} fullWidth />

        <div className="ps-tinsp-row ps-mt-4">
          <Toggle
            checked={config.weight === 'bold'}
            onChange={v => onChange({ ...config, weight: v ? 'bold' : 'normal' })}
            label={t('templateInspector.labelConfig.boldToggle')}
          />
          <Toggle
            checked={config.decoration === 'underline'}
            onChange={v => onChange({ ...config, decoration: v ? 'underline' : 'none' })}
            label={t('templateInspector.labelConfig.underlineToggle')}
          />
        </div>

        <Label>{t('templateInspector.labelConfig.fontSizeLabel')}</Label>
        <TextInput
          value={String(config.fontSize ?? (config.position === 'above' ? 12 : 11))}
          onChange={v => onChange({ ...config, fontSize: parseInt(v) || 11 })}
          placeholder={config.position === 'above' ? '12' : '11'}
        />

        {/* Live preview */}
        <div className="ps-tinsp-preview-box" style={previewVars}>
          <div className="ps-tinsp-preview-caption">{t('templateInspector.labelConfig.previewCaption')}</div>
          {config.position === 'above' ? (
            <>
              <div className="ps-tinsp-preview-label">{t('templateInspector.labelConfig.previewFieldLabel')}</div>
              <div className="ps-tinsp-preview-value">{t('templateInspector.labelConfig.previewValueText')}</div>
            </>
          ) : (
            <div className="ps-tinsp-preview-row">
              <span className="ps-tinsp-preview-label">{t('templateInspector.labelConfig.previewFieldLabel')}</span>
              <span className="ps-tinsp-preview-value">{t('templateInspector.labelConfig.previewValueText')}</span>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
};

const DropdownEditor: React.FC<{ node: DropdownNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.dropdown.divLabel')} />
    <Label>{t('templateInspector.dropdown.bindingKeyLabel')}</Label>
    <TextInput value={node.bindingKey} onChange={v => u({ ...node, bindingKey: v })} placeholder="synoptic.grade" mono />
    <div className="ps-tinsp-toggle-stack--symmetric ps-tinsp-stack">
      <Toggle checked={node.multi ?? false}          onChange={v => u({ ...node, multi: v })}          label={t('templateInspector.dropdown.multiSelectToggle')} />
      <Toggle checked={node.allowFreeText ?? false}  onChange={v => u({ ...node, allowFreeText: v })}  label={t('templateInspector.dropdown.allowFreeTextToggle')} />
    </div>
    <Label>{t('templateInspector.dropdown.optionsLabel')}</Label>
    <Textarea
      value={(node.options ?? []).map(o => `${o.value}|${o.label}`).join('\n')}
      onChange={v => u({ ...node, options: v.split('\n').filter(Boolean).map(line => {
        const [val, lbl] = line.split('|');
        return { value: val?.trim() ?? '', label: lbl?.trim() ?? val?.trim() ?? '' };
      }) })}
      placeholder={t('templateInspector.dropdown.optionsPlaceholder')}
      height={100} mono
    />
  </>);
};

const NumberEditor: React.FC<{ node: NumberNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.number.divLabel')} />
    <Label>{t('templateInspector.number.bindingKeyLabel')}</Label>
    <TextInput value={node.bindingKey} onChange={v => u({ ...node, bindingKey: v })} placeholder="synoptic.size" mono />
    <Row>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.number.unitLabel')}</Label>
        <TextInput value={node.unit ?? ''} onChange={v => u({ ...node, unit: v })} placeholder="mm" />
      </div>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.number.decimalPlacesLabel')}</Label>
        <TextInput value={String(node.decimalPlaces ?? '')} onChange={v => u({ ...node, decimalPlaces: parseInt(v) || undefined })} placeholder="1" />
      </div>
    </Row>
    <Row>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.number.minLabel')}</Label>
        <TextInput value={String(node.min ?? '')} onChange={v => u({ ...node, min: parseFloat(v) || undefined })} placeholder="0" />
      </div>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.number.maxLabel')}</Label>
        <TextInput value={String(node.max ?? '')} onChange={v => u({ ...node, max: parseFloat(v) || undefined })} placeholder="∞" />
      </div>
    </Row>
    <Label>{t('templateInspector.number.unitOptionsLabel')}</Label>
    <TextInput value={(node.unitOptions ?? []).join(', ')}
      onChange={v => u({ ...node, unitOptions: v.split(',').map(s => s.trim()).filter(Boolean) })}
      placeholder="mm, cm" />
  </>);
};

const DateEditor: React.FC<{ node: DateNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.date.divLabel')} />
    <Label>{t('templateInspector.date.bindingKeyLabel')}</Label>
    <TextInput value={node.bindingKey} onChange={v => u({ ...node, bindingKey: v })} placeholder="diagnostic.issuedDate" mono />
    <Label>{t('templateInspector.date.formatLabel')}</Label>
    <Sel value={node.format ?? 'date'} onChange={v => u({ ...node, format: v as DateNode['format'] })}
      options={[
        { value: 'date',     label: t('templateInspector.date.format.date') },
        { value: 'datetime', label: t('templateInspector.date.format.datetime') },
        { value: 'year',     label: t('templateInspector.date.format.year') },
      ]} fullWidth />
    <div className="ps-tinsp-toggle-stack">
      <Toggle checked={node.defaultToToday ?? false} onChange={v => u({ ...node, defaultToToday: v })} label={t('templateInspector.date.defaultToTodayToggle')} />
    </div>
  </>);
};

const ComputedEditor: React.FC<{ node: ComputedNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.computed.divLabel')} />
    <Label>{t('templateInspector.computed.expressionLabel')}</Label>
    <Textarea value={node.expression} onChange={v => u({ ...node, expression: v })}
      placeholder="e.g. specimens.length + ' specimens submitted'" height={60} mono />
    <Label>{t('templateInspector.computed.outputTypeLabel')}</Label>
    <Sel value={node.outputType ?? 'text'} onChange={v => u({ ...node, outputType: v as ComputedNode['outputType'] })}
      options={[
        { value: 'text',   label: t('templateInspector.computed.outputType.text') },
        { value: 'number', label: t('templateInspector.computed.outputType.number') },
        { value: 'date',   label: t('templateInspector.computed.outputType.date') },
      ]} fullWidth />
    <Label>{t('templateInspector.computed.unitLabel')}</Label>
    <TextInput value={node.unit ?? ''} onChange={v => u({ ...node, unit: v })} placeholder="e.g. mm" />
  </>);
};

const StaticLabelEditor: React.FC<{ node: StaticLabelNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.staticLabel.divLabel')} />
    <Label>{t('templateInspector.staticLabel.textLabel')}</Label>
    <Textarea value={node.text} onChange={v => u({ ...node, text: v })} height={56} />
    <Label>{t('templateInspector.staticLabel.variantLabel')}</Label>
    <Sel value={node.variant ?? 'body'} onChange={v => u({ ...node, variant: v as StaticLabelNode['variant'] })}
      options={[
        { value: 'h1',      label: t('templateInspector.staticLabel.variant.h1') },
        { value: 'h2',      label: t('templateInspector.staticLabel.variant.h2') },
        { value: 'h3',      label: t('templateInspector.staticLabel.variant.h3') },
        { value: 'body',    label: t('templateInspector.staticLabel.variant.body') },
        { value: 'caption', label: t('templateInspector.staticLabel.variant.caption') },
      ]} fullWidth />
    <Row>
      <Toggle checked={node.bold ?? false}   onChange={v => u({ ...node, bold: v })}   label={t('templateInspector.staticLabel.boldToggle')} />
      <Toggle checked={node.italic ?? false} onChange={v => u({ ...node, italic: v })} label={t('templateInspector.staticLabel.italicToggle')} />
    </Row>
  </>);
};

// ── Structure ──────────────────────────────────────────────────

const SectionEditor: React.FC<{ node: SectionNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.section.divLabel')} />
    <Label>{t('templateInspector.section.printHeadingLabel')}</Label>
    <TextInput value={node.printHeading ?? ''} onChange={v => u({ ...node, printHeading: v })} placeholder={t('templateInspector.section.printHeadingPlaceholder')} />
    <div className="ps-tinsp-toggle-stack">
      <Toggle checked={node.collapsible ?? true}       onChange={v => u({ ...node, collapsible: v })}       label={t('templateInspector.section.collapsibleToggle')} />
      <Toggle checked={node.defaultCollapsed ?? false} onChange={v => u({ ...node, defaultCollapsed: v })} label={t('templateInspector.section.startCollapsedToggle')} />
    </div>
    <Div label={t('templateInspector.section.aiGenerationDivLabel')} />
    <AiConfigEditor config={node.ai ?? { enabled: false }} onChange={ai => u({ ...node, ai })} />
  </>);
};

const RepeatGroupEditor: React.FC<{ node: RepeatGroupNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.repeatGroup.divLabel')} />
    <Label>{t('templateInspector.repeatGroup.iterateOverLabel')}</Label>
    {/* Option values/labels here name real context arrays (internal schema
        identifiers) — left untranslated, see file header. */}
    <Sel value={node.iterateOver} onChange={v => u({ ...node, iterateOver: v })}
      options={[
        { value: 'specimens',       label: 'specimens' },
        { value: 'synopticReports', label: 'synopticReports' },
        { value: 'diagnoses',       label: 'diagnoses' },
      ]} fullWidth />
    <Label>{t('templateInspector.repeatGroup.itemAliasLabel')}</Label>
    <TextInput value={node.itemAlias ?? 'item'} onChange={v => u({ ...node, itemAlias: v })} placeholder={t('templateInspector.repeatGroup.itemAliasPlaceholder')} mono />
    <Row>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.repeatGroup.minItemsLabel')}</Label>
        <TextInput value={String(node.minItems ?? '')} onChange={v => u({ ...node, minItems: parseInt(v) || undefined })} placeholder="0" />
      </div>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.repeatGroup.maxItemsLabel')}</Label>
        <TextInput value={String(node.maxItems ?? '')} onChange={v => u({ ...node, maxItems: parseInt(v) || undefined })} placeholder="∞" />
      </div>
    </Row>
  </>);
};

const ColumnLayoutEditor: React.FC<{ node: ColumnLayoutNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.columnLayout.divLabel')} />
    <Label>{t('templateInspector.columnLayout.numColumnsLabel')}</Label>
    <div className="ps-tinsp-colbtn-row">
      {([2, 3, 4] as const).map(n => (
        <button key={n} onClick={() => u({ ...node, numColumns: n })}
          className={`ps-tinsp-colbtn${node.numColumns === n ? ' ps-tinsp-colbtn--active' : ''}`}>
          <div className="ps-tinsp-colbtn-icon">
            {n === 2 ? '⫿' : n === 3 ? '|||' : '||||'}
          </div>
          {t('templateInspector.columnLayout.colCount', { count: n })}
        </button>
      ))}
    </div>
    <Label>{t('templateInspector.columnLayout.columnGapLabel')}</Label>
    <TextInput value={String(node.columnGap ?? 16)} onChange={v => u({ ...node, columnGap: parseInt(v) || 16 })} placeholder="16" />
    <div className="ps-tinsp-hint-line">
      {t('templateInspector.columnLayout.hint', { pct: Math.round(100 / node.numColumns) })}
    </div>
  </>);
};

const TemplateRefEditor: React.FC<{ node: TemplateRefNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.templateRef.divLabel')} />
    <Label>{t('templateInspector.templateRef.refTemplateIdLabel')}</Label>
    <TextInput value={node.refTemplateId} onChange={v => u({ ...node, refTemplateId: v })} placeholder="standard_surgical_pathology" mono />
    <Label>{t('templateInspector.templateRef.refTemplateNameLabel')}</Label>
    <TextInput value={node.refTemplateName ?? ''} onChange={v => u({ ...node, refTemplateName: v })} placeholder={t('templateInspector.templateRef.refTemplateNamePlaceholder')} />
    <Div label={t('templateInspector.templateRef.contextOverridesDivLabel')} />
    <Label>{t('templateInspector.templateRef.contextOverridesLabel')}</Label>
    <Textarea
      value={Object.entries(node.contextOverrides ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
      onChange={raw => {
        const overrides: Record<string, string> = {};
        raw.split('\n').filter(Boolean).forEach(line => {
          const [k, ...rest] = line.split('=');
          if (k) overrides[k.trim()] = rest.join('=').trim();
        });
        u({ ...node, contextOverrides: overrides });
      }}
      placeholder={"specimenId={{specimen.id}}\ntemplateName=Breast Invasive"}
      height={72} mono
    />
  </>);
};

const PageBreakEditor: React.FC<{ node: PageBreakNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.pageBreak.divLabel')} />
    <Label>{t('templateInspector.pageBreak.behaviourLabel')}</Label>
    <Sel value={node.breakBehavior ?? 'always'} onChange={v => u({ ...node, breakBehavior: v as PageBreakNode['breakBehavior'] })}
      options={[
        { value: 'always', label: t('templateInspector.pageBreak.behaviour.always') },
        { value: 'avoid',  label: t('templateInspector.pageBreak.behaviour.avoid') },
        { value: 'auto',   label: t('templateInspector.pageBreak.behaviour.auto') },
      ]} fullWidth />
  </>);
};

// ── Conditional ────────────────────────────────────────────────

const IfBlockEditor: React.FC<{ node: IfBlockNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.ifBlock.divLabel')} />
    <ExpressionBuilder
      expression={node.condition}
      onChange={condition => u({ ...node, condition })}
      title={t('templateInspector.ifBlock.showChildrenWhenTitle')}
    />
    <div className="ps-mt-8">
      <Label>{t('templateInspector.ifBlock.elseBranchLabel')}</Label>
      <div className="ps-tinsp-hint-line--block">
        {t('templateInspector.ifBlock.elseHint', { count: (node.elseChildren ?? []).length })}
      </div>
    </div>
  </>);
};

const SwitchBlockEditor: React.FC<{ node: SwitchBlockNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.switchBlock.divLabel')} />
    <Label>{t('templateInspector.switchBlock.switchOnLabel')}</Label>
    <TextInput value={node.switchOn} onChange={v => u({ ...node, switchOn: v })} placeholder="primarySynoptic.answers.grade" mono />
    <Div label={t('templateInspector.switchBlock.casesDivLabel')} />
    {node.cases.map((c, i) => (
      <div key={c.id} className="ps-tinsp-expr-box ps-tinsp-expr-box--spaced">
        <div className="ps-tinsp-case-head">
          <span className="ps-tinsp-case-title">{t('templateInspector.switchBlock.caseLabel', { n: i + 1 })}</span>
          <button onClick={() => u({ ...node, cases: node.cases.filter((_, idx) => idx !== i) })} className="ps-tinsp-rm-btn">✕</button>
        </div>
        <Label>{t('templateInspector.switchBlock.caseLabelField')}</Label>
        <TextInput value={c.label} onChange={v => u({ ...node, cases: node.cases.map((x, idx) => idx === i ? { ...x, label: v } : x) })} />
        <ExpressionBuilder
          expression={c.when}
          onChange={when => u({ ...node, cases: node.cases.map((x, idx) => idx === i ? { ...x, when } : x) })}
          title={t('templateInspector.switchBlock.whenTitle')}
        />
      </div>
    ))}
    <button className="ps-tinsp-add-btn" onClick={() => u({ ...node, cases: [...node.cases, {
      id: crypto.randomUUID(), label: t('templateInspector.switchBlock.caseLabel', { n: node.cases.length + 1 }),
      when: { logic: 'AND', clauses: [] }, children: [],
    }] })}>
      {t('templateInspector.switchBlock.addCaseButton')}
    </button>
  </>);
};

const ExpressionValueEditor: React.FC<{ node: ExpressionValueNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.expressionValue.divLabel')} />
    <Label>{t('templateInspector.expressionValue.templateStringLabel')}</Label>
    <Textarea value={node.template} onChange={v => u({ ...node, template: v })}
      placeholder="{{patient.name}}, {{patient.age}} years old" height={56} mono />
    <div className="ps-tinsp-hint-line">
      <Trans i18nKey="templateInspector.expressionValue.hint" components={{ code: <code /> }} />
    </div>
    <Label>{t('templateInspector.expressionValue.fallbackLabel')}</Label>
    <TextInput value={node.fallback ?? ''} onChange={v => u({ ...node, fallback: v })} placeholder="—" />
  </>);
};

// ── Layout ─────────────────────────────────────────────────────

const usePageScopeOptions = () => {
  const { t } = useTranslation();
  return [
    { value: 'all',        label: t('templateInspector.pageScope.all') },
    { value: 'page1',      label: t('templateInspector.pageScope.page1') },
    { value: 'pages2plus', label: t('templateInspector.pageScope.pages2plus') },
  ];
};

const HeaderEditor: React.FC<{ node: HeaderNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  const pageScopeOptions = usePageScopeOptions();
  return (<>
    <Div label={t('templateInspector.header.divLabel')} />
    <Label>{t('templateInspector.header.pageScopeLabel')}</Label>
    <Sel value={node.scope} onChange={v => u({ ...node, scope: v as HeaderNode['scope'] })}
      options={pageScopeOptions} fullWidth />
    <Label>{t('templateInspector.header.heightLabel')}</Label>
    <TextInput value={String(node.height ?? 90)} onChange={v => u({ ...node, height: parseInt(v) || 90 })} placeholder="90" />
    <Div label={t('templateInspector.header.contentDivLabel')} />
    <div className="ps-tinsp-toggle-stack--flush ps-tinsp-stack">
      <Toggle checked={node.showLogo ?? true}        onChange={v => u({ ...node, showLogo: v })}        label={t('templateInspector.header.showLogoToggle')} />
      <Toggle checked={node.showAccession ?? true}   onChange={v => u({ ...node, showAccession: v })}   label={t('templateInspector.header.showAccessionToggle')} />
      <Toggle checked={node.showPatientName ?? true} onChange={v => u({ ...node, showPatientName: v })} label={t('templateInspector.header.showPatientNameToggle')} />
    </div>
    <Label>{t('templateInspector.header.customHtmlLabel')}</Label>
    <Textarea value={node.htmlTemplate ?? ''} onChange={v => u({ ...node, htmlTemplate: v })}
      placeholder="<div>{{institution.name}}</div>" height={72} mono />
  </>);
};

const FooterEditor: React.FC<{ node: FooterNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  const pageScopeOptions = usePageScopeOptions();
  return (<>
    <Div label={t('templateInspector.footer.divLabel')} />
    <Label>{t('templateInspector.footer.pageScopeLabel')}</Label>
    <Sel value={node.scope} onChange={v => u({ ...node, scope: v as FooterNode['scope'] })}
      options={pageScopeOptions} fullWidth />
    <Label>{t('templateInspector.footer.heightLabel')}</Label>
    <TextInput value={String(node.height ?? 40)} onChange={v => u({ ...node, height: parseInt(v) || 40 })} placeholder="40" />
    <Div label={t('templateInspector.footer.contentDivLabel')} />
    <div className="ps-tinsp-toggle-stack--flush ps-tinsp-stack">
      <Toggle checked={node.showPageNumbers ?? true} onChange={v => u({ ...node, showPageNumbers: v })} label={t('templateInspector.footer.showPageNumbersToggle')} />
    </div>
    {node.showPageNumbers && (<>
      <Label>{t('templateInspector.footer.pageNumberFormatLabel')}</Label>
      {/* Default value is a real template-expression the rendering engine
          parses ({{page.number}} syntax) — left untranslated, see file header. */}
      <TextInput value={node.pageNumberFormat ?? 'Page {{page.number}} of {{page.total}}'}
        onChange={v => u({ ...node, pageNumberFormat: v })} mono />
    </>)}
    <Label>{t('templateInspector.footer.customHtmlLabel')}</Label>
    <Textarea value={node.htmlTemplate ?? ''} onChange={v => u({ ...node, htmlTemplate: v })}
      placeholder="<div>Page {{page.number}}</div>" height={72} mono />
  </>);
};

const ImageEmbedEditor: React.FC<{ node: ImageEmbedNode; u: (n: TemplateNode) => void }> = ({ node, u }) => {
  const { t } = useTranslation();
  return (<>
    <Div label={t('templateInspector.imageEmbed.divLabel')} />
    <Label>{t('templateInspector.imageEmbed.staticUrlLabel')}</Label>
    <TextInput value={node.src ?? ''} onChange={v => u({ ...node, src: v })} placeholder="https://…/logo.png" />
    <Label>{t('templateInspector.imageEmbed.bindingKeyLabel')}</Label>
    <TextInput value={node.bindingKey ?? ''} onChange={v => u({ ...node, bindingKey: v })} placeholder="institution.logoUrl" mono />
    <Label>{t('templateInspector.imageEmbed.altTextLabel')}</Label>
    <TextInput value={node.alt ?? ''} onChange={v => u({ ...node, alt: v })} placeholder={t('templateInspector.imageEmbed.altTextPlaceholder')} />
    <Label>{t('templateInspector.imageEmbed.captionLabel')}</Label>
    <TextInput value={node.caption ?? ''} onChange={v => u({ ...node, caption: v })} placeholder={t('templateInspector.imageEmbed.captionPlaceholder')} />
    <Label>{t('templateInspector.imageEmbed.alignmentLabel')}</Label>
    <Sel value={node.alignment ?? 'left'} onChange={v => u({ ...node, alignment: v as ImageEmbedNode['alignment'] })}
      options={[
        { value: 'left',   label: t('templateInspector.align.left') },
        { value: 'center', label: t('templateInspector.align.center') },
        { value: 'right',  label: t('templateInspector.align.right') },
        { value: 'full',   label: t('templateInspector.imageEmbed.alignment.full') },
      ]} fullWidth />
    <Row>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.imageEmbed.widthLabel')}</Label>
        <TextInput value={String(node.width ?? '')} onChange={v => u({ ...node, width: parseInt(v) || undefined })} placeholder={t('templateInspector.imageEmbed.autoPlaceholder')} />
      </div>
      <div className="ps-tinsp-col">
        <Label>{t('templateInspector.imageEmbed.heightLabel')}</Label>
        <TextInput value={String(node.height ?? '')} onChange={v => u({ ...node, height: parseInt(v) || undefined })} placeholder={t('templateInspector.imageEmbed.autoPlaceholder')} />
      </div>
    </Row>
  </>);
};

// ── Main inspector ─────────────────────────────────────────────

export const TemplateInspector: React.FC<Props> = ({ node, onUpdate }) => {
  const { t } = useTranslation();

  if (!node) {
    return (
      <aside className="ps-tinsp-panel">
        <div className="ps-tinsp-header"><span className="ps-tinsp-title">{t('templateInspector.panel.title')}</span></div>
        <div className="ps-tinsp-empty">
          <div className="ps-tinsp-empty-icon">⊙</div>
          <div className="ps-tinsp-empty-text">{t('templateInspector.panel.emptyText')}</div>
        </div>
      </aside>
    );
  }

  const u = onUpdate;

  return (
    <aside className="ps-tinsp-panel">
      <div className="ps-tinsp-header">
        <span className="ps-tinsp-title">{t('templateInspector.panel.title')}</span>
        {/* node.type is a real internal schema identifier (e.g. "text-field",
            "if-block") shown verbatim as a developer-facing tag — left
            untranslated, see file header. */}
        <span className="ps-tinsp-type-tag">{node.type}</span>
      </div>

      <div className="ps-tinsp-body">
        {/* ── Base fields (all types) ── */}
        <Div label={t('templateInspector.general.sectionLabel')} />
        <Label>{t('templateInspector.general.labelFieldLabel')}</Label>
        <TextInput value={node.label} onChange={v => u({ ...node, label: v })} />

        {/* Column width — drag handle on canvas is the primary way;
            this is the fallback for precise control */}
        <Label>{t('templateInspector.general.widthLabel')}</Label>
        <div className="ps-tinsp-width-row">
          <input
            type="range" min={1} max={12} step={1}
            value={node.colSpan ?? 12}
            onChange={e => u({ ...node, colSpan: parseInt(e.target.value) })}
            className="ps-tinsp-range"
          />
          <span className="ps-tinsp-width-pct">
            {Math.round(((node.colSpan ?? 12) / 12) * 100)}%
          </span>
        </div>
        <div className="ps-tinsp-width-hint">
          {t('templateInspector.general.widthHint')}
        </div>

        <div className="ps-tinsp-toggle-stack--symmetric ps-tinsp-stack">
          <Toggle checked={node.required ?? false}        onChange={v => u({ ...node, required: v })}        label={t('templateInspector.general.requiredToggle')} />
          <Toggle checked={node.hideIfEmpty ?? false}     onChange={v => u({ ...node, hideIfEmpty: v })}     label={t('templateInspector.general.hideIfEmptyToggle')} />
          <Toggle checked={node.fhirExport ?? false}      onChange={v => u({ ...node, fhirExport: v })}      label={t('templateInspector.general.fhirExportToggle')} />
          <Toggle checked={node.isFinalDiagnosisField ?? false} onChange={v => u({ ...node, isFinalDiagnosisField: v })} label={t('templateInspector.general.finalDiagnosisToggle')} />
          <Toggle checked={node.pageBreakBefore ?? false} onChange={v => u({ ...node, pageBreakBefore: v })} label={t('templateInspector.general.pageBreakBeforeToggle')} />
        </div>

        {/* ── Type-specific editors ── */}
        {node.type === 'text-field'       && <TextFieldEditor      node={node} u={u} />}
        {node.type === 'paragraph'        && <ParagraphEditor      node={node} u={u} />}
        {node.type === 'rich-text-block'  && <RichTextBlockEditor  node={node as RichTextBlockNode} u={u} />}
        {node.type === 'dropdown'         && <DropdownEditor       node={node} u={u} />}
        {node.type === 'number'           && <NumberEditor         node={node} u={u} />}
        {node.type === 'date'             && <DateEditor           node={node} u={u} />}
        {node.type === 'computed'         && <ComputedEditor       node={node} u={u} />}
        {node.type === 'static-label'     && <StaticLabelEditor    node={node} u={u} />}
        {node.type === 'section'          && <SectionEditor        node={node} u={u} />}
        {node.type === 'repeat-group'     && <RepeatGroupEditor    node={node} u={u} />}
        {node.type === 'column-layout'    && <ColumnLayoutEditor   node={node as ColumnLayoutNode} u={u} />}
        {node.type === 'template-ref'     && <TemplateRefEditor    node={node} u={u} />}
        {node.type === 'page-break'       && <PageBreakEditor      node={node} u={u} />}
        {node.type === 'if-block'         && <IfBlockEditor        node={node} u={u} />}
        {node.type === 'switch-block'     && <SwitchBlockEditor    node={node} u={u} />}
        {node.type === 'expression-value' && <ExpressionValueEditor node={node} u={u} />}
        {node.type === 'header'           && <HeaderEditor         node={node} u={u} />}
        {node.type === 'footer'           && <FooterEditor         node={node} u={u} />}
        {node.type === 'image-embed'      && <ImageEmbedEditor     node={node} u={u} />}

        {/* ── Label formatting (all types except containers) ──
             Real fix, per direct confirmation: 'section' removed from
             this exclusion — a section's printHeading is real, visible
             text in the rendered report (see ReportPreviewRenderer.tsx's
             rp-node-section-heading), exactly the kind of label this
             panel exists to style. It was excluded here alongside
             genuine non-applicable containers (column-layout,
             repeat-group, if-block, switch-block — structural wrappers
             with no label of their own) for no distinguishing reason;
             checked directly, node.labelConfig was always a valid field
             on SectionNode via BaseNode, just never exposed. */}
        {!['column-layout', 'repeat-group', 'if-block', 'switch-block', 'header', 'footer', 'page-break', 'static-label', 'rich-text-block'].includes(node.type) && (
          <>
            <Div label={t('templateInspector.labelFormatting.sectionLabel')} />
            <LabelConfigEditor
              config={node.labelConfig ?? {
                position: ['paragraph'].includes(node.type) ? 'above' : 'adjacent',
                transform: 'uppercase',
                weight: 'normal',
                decoration: 'none',
              }}
              onChange={labelConfig => u({ ...node, labelConfig })}
            />
          </>
        )}

        {/* ── Visibility condition (all types) ── */}
        <Div label={t('templateInspector.visibility.sectionLabel')} />
        <ExpressionBuilder
          expression={node.showWhen ?? { logic: 'AND', clauses: [] }}
          onChange={expr => u({ ...node, showWhen: expr.clauses.length > 0 ? expr : undefined })}
          title={t('templateInspector.visibility.showWhenTitle')}
        />
      </div>
    </aside>
  );
};
