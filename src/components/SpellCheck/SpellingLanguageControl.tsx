// src/components/SpellCheck/SpellingLanguageControl.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): shows which spelling language this report is checked
// in and why (this case's choice / the pathologist's preference / the
// facility default), and lets the pathologist change it for this case
// (Pete, Sep 26). "Use default" clears the case's choice. Replaces the old
// "British/American English" badge of the retired AI spelling check.
// Renders nothing outside a SpellCheckProvider.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SPELLING_LOCALE_ORDER, SPELLING_LOCALES, type SpellingLocale } from '@/services/spellcheck/spellingLocales';
import { useSpellCheckContext } from './SpellCheckContext';

const DEFAULT_VALUE = '__default__';

export const SpellingLanguageControl: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const ctx = useSpellCheckContext();
  const [saving, setSaving] = useState(false);
  const selectId = useId();
  if (!ctx) return null;

  const change = async (value: string) => {
    if (!ctx.setCaseLocale) return;
    setSaving(true);
    try { await ctx.setCaseLocale(value === DEFAULT_VALUE ? null : (value as SpellingLocale)); }
    finally { setSaving(false); }
  };

  const sourceText = t(`spellCheck.language.source.${ctx.source}`);
  return (
    <div className={`ps-spelllang${className ? ` ${className}` : ''}`}>
      {ctx.setCaseLocale
        ? <label className="ps-spelllang__label" htmlFor={selectId}>{t('spellCheck.language.label')}</label>
        : <span className="ps-spelllang__label">{t('spellCheck.language.label')}</span>}
      {ctx.setCaseLocale ? (
        <select
          id={selectId}
          className="ps-spelllang__select"
          value={ctx.source === 'case' ? ctx.locale : DEFAULT_VALUE}
          disabled={saving}
          onChange={e => change(e.target.value)}
          title={sourceText}
        >
          <option value={DEFAULT_VALUE}>{t('spellCheck.language.useDefault')}</option>
          {SPELLING_LOCALE_ORDER.filter(l => SPELLING_LOCALES[l].available).map(l => (
            <option key={l} value={l}>{t(`spellCheck.locales.${l}`)}</option>
          ))}
        </select>
      ) : null}
      <span className="ps-spelllang__source">{t('spellCheck.language.current', { locale: t(`spellCheck.locales.${ctx.locale}`), source: sourceText })}</span>
      {ctx.unavailableChoice && (
        <span className="ps-spelllang__notice">{t('spellCheck.language.unavailable', { choice: t(`spellCheck.locales.${ctx.unavailableChoice}`) })}</span>
      )}
    </div>
  );
};
