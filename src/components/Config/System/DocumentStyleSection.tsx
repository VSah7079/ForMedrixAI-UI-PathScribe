/**
 * DocumentStyleSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Real feature, per direct request: "Is the system wide font style defined
 * in the css hard coded, or does the client get to select this system
 * default?" ... "yes, default to Arial."
 *
 * Confirmed by direct investigation before this existed: the report's
 * actual rendered default font was 100% hardcoded CSS with zero
 * configuration anywhere. This is the missing org-wide layer, sitting
 * beneath a per-template override (Template Assembly editor's own
 * 🖋 Style panel) and above nothing further — the hardcoded CSS is now
 * only ever reached if this resolver itself somehow fails to load.
 *
 * Architecture role:
 *   Admin-editable org default for report body text style. Read by
 *   contextBuilder.ts's buildContext() as the fallback layer beneath a
 *   template's own documentStyle.body, and applied by
 *   ReportPreviewRenderer.tsx at the report root, cascading via ordinary
 *   CSS inheritance to every field's label and value.
 *
 * Related files:
 *   Config/System/documentStyleConfig.ts ← getOrgDocumentStyleDefault/
 *                                            setOrgDocumentStyleDefault
 *   orchestrator/contextBuilder.ts       ← resolves template override ??
 *                                            org default
 *   pages/ReportPreview/ReportPreviewRenderer.tsx ← applies at the root
 *   components/TemplateBuilder/TemplateAssemblyPage.tsx ← the per-template
 *                                            override layer, same shape
 *
 * i18n sweep (batch 46): FONT_FAMILY_OPTIONS values are real font-family
 * names — proper nouns, stay untranslated, same convention as
 * FontsSection.tsx (batch 37). The header/subtitle/saved-badge markup
 * here turned out to be EXACT style matches for FontsSection.tsx's own
 * `.config-fonts-title`/`.config-fonts-description`/
 * `.config-fonts-count-badge` classes — reused directly rather than
 * duplicated. The style-preview box keeps its dynamic
 * fontFamily/fontSize/fontWeight/textDecoration/textTransform inline
 * (it renders the admin's live style selection — the whole point of
 * this page, same "genuine per-render dynamic value" exception used
 * for FontsSection.tsx's per-font `style={{fontFamily}}`), with its
 * static box styling (margin/padding/border/background/color) moved
 * to a new `.ps-docstyle__preview` class.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import {
  getOrgDocumentStyleDefault, setOrgDocumentStyleDefault,
  getOrgHeaderStyleDefault, setOrgHeaderStyleDefault,
  getOrgFooterStyleDefault, setOrgFooterStyleDefault,
} from './documentStyleConfig';
import type { LabelConfig } from '../../../types/template';
import { Label, TextInput, Toggle, Sel } from '../../TemplateBuilder/TemplateInspector';

const FONT_FAMILY_OPTIONS = [
  { value: 'Arial',           label: 'Arial' },
  { value: 'Helvetica',       label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia',         label: 'Georgia' },
  { value: 'Calibri',         label: 'Calibri' },
  { value: 'Verdana',         label: 'Verdana' },
  { value: 'Courier New',     label: 'Courier New' },
];

const GETTERS = { header: getOrgHeaderStyleDefault, body: getOrgDocumentStyleDefault, footer: getOrgFooterStyleDefault };
const SETTERS = { header: setOrgHeaderStyleDefault, body: setOrgDocumentStyleDefault, footer: setOrgFooterStyleDefault };

const CATEGORY_LABEL_KEY = {
  header: 'documentStyleSection.categories.header',
  body:   'documentStyleSection.categories.body',
  footer: 'documentStyleSection.categories.footer',
} as const;

const DocumentStyleSection: React.FC = () => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<'header' | 'body' | 'footer'>('body');
  const [style, setStyle] = useState<LabelConfig>(() => GETTERS[category]());
  const [saved, setSaved] = useState(true);

  const switchCategory = (next: 'header' | 'body' | 'footer') => {
    setCategory(next);
    setStyle(GETTERS[next]());
  };

  const update = (next: LabelConfig) => {
    setStyle(next);
    SETTERS[category](next);
    setSaved(true);
  };

  return (
    <div className="ps-docstyle-page">
      <div className="ps-docstyle__header">
        <h2 className="config-fonts-title">
          🖋 {t('documentStyleSection.title')}
        </h2>
        <p className="config-fonts-description">
          {t('documentStyleSection.subtitle')}
        </p>
        {saved && (
          <span className="config-fonts-count-badge">
            ✓ {t('documentStyleSection.saved')}
          </span>
        )}
      </div>

      <div className="ps-docstyle__tabs">
        {(['header', 'body', 'footer'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => switchCategory(cat)}
            className={`ps-docstyle__tab ps-docstyle__tab--${category === cat ? 'active' : 'inactive'}`}
          >
            {t(CATEGORY_LABEL_KEY[cat])}
          </button>
        ))}
      </div>

      <div className="ps-tinsp-stack ps-docstyle__stack">
        <Label>{t('documentStyleSection.fontFamilyLabel')}</Label>
        <Sel value={style.fontFamily ?? 'Arial'} onChange={v => update({ ...style, fontFamily: v })}
          options={FONT_FAMILY_OPTIONS} fullWidth />

        <Label>{t('documentStyleSection.fontSizeLabel')}</Label>
        <TextInput
          value={String(style.fontSize ?? 10)}
          onChange={v => update({ ...style, fontSize: parseInt(v) || 10 })}
          placeholder="10"
        />

        <div className="ps-tinsp-row ps-docstyle__toggle-row">
          <Toggle
            checked={style.weight === 'bold'}
            onChange={v => update({ ...style, weight: v ? 'bold' : 'normal' })}
            label={t('documentStyleSection.bold')}
          />
          <Toggle
            checked={style.decoration === 'underline'}
            onChange={v => update({ ...style, decoration: v ? 'underline' : 'none' })}
            label={t('documentStyleSection.underline')}
          />
        </div>

        <Label>{t('documentStyleSection.textTransformLabel')}</Label>
        <Sel value={style.transform ?? 'none'} onChange={v => update({ ...style, transform: v as LabelConfig['transform'] })}
          options={[
            { value: 'none',       label: t('documentStyleSection.transforms.none') },
            { value: 'uppercase',  label: t('documentStyleSection.transforms.uppercase') },
            { value: 'capitalize', label: t('documentStyleSection.transforms.capitalize') },
          ]} fullWidth />

        <div
          className="ps-docstyle__preview"
          style={{
            fontFamily: style.fontFamily || 'Arial',
            fontSize: `${style.fontSize ?? 10}px`,
            fontWeight: style.weight === 'bold' ? 700 : 400,
            textDecoration: style.decoration === 'underline' ? 'underline' : 'none',
            textTransform: style.transform === 'uppercase' ? 'uppercase' : style.transform === 'capitalize' ? 'capitalize' : 'none',
          }}
        >
          {t('documentStyleSection.previewText', { category: t(CATEGORY_LABEL_KEY[category]) })}
        </div>
      </div>
    </div>
  );
};

export default DocumentStyleSection;
