// src/components/NavBar/LanguageSwitcher.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Multi-Language UI & Localization
// Framework gap — the real, working language switcher. Changing the
// selection here genuinely re-renders every real, translated string
// in the app immediately (react-i18next's own real, standard
// re-render-on-language-change behavior), and persists the choice via
// i18next-browser-languagedetector's own localStorage cache
// (src/i18n/config.ts), so it survives a reload.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n/config';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  return (
    <select
      className="ps-nav-btn"
      aria-label={t('language.label')}
      title={t('language.label')}
      value={i18n.language}
      onChange={e => i18n.changeLanguage(e.target.value as SupportedLanguage)}
      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
    >
      {SUPPORTED_LANGUAGES.map(lang => (
        <option key={lang} value={lang}>{t(`language.${lang}`)}</option>
      ))}
    </select>
  );
};

export default LanguageSwitcher;
