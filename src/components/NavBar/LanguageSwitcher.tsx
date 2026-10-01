// src/components/NavBar/LanguageSwitcher.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Multi-Language UI & Localization
// Framework gap — the real, working language switcher. Changing the
// selection here genuinely re-renders every real, translated string
// in the app immediately (react-i18next's own real, standard
// re-render-on-language-change behavior), and persists the choice via
// i18next-browser-languagedetector's own localStorage cache
// (src/i18n/config.ts), so it survives a reload.
//
// Real fix, per direct follow-up ("still looks a bit truncated and the
// dropdown list is not very nice"): this used to be a native <select>
// wearing `.ps-nav-btn` — a class built for the NavBar's fixed 42×42
// icon-only buttons (bell, links, logout). Forcing "Eng ▾" text into
// that fixed square is exactly what was clipping it, and a native
// <option> popup can't be styled beyond text/background color, so it
// always looked like a bare OS control next to the rest of the app's
// custom-drawn panels. Replaced with the same real, established
// trigger-button + floating-menu pattern this NavBar already uses right
// next door for NavBarScanStation.tsx (.ps-navbar-station-btn/-menu) —
// an auto-width trigger sized to its own text, and a proper dark
// dropdown panel with real hover states, not a second, bespoke look.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n/config';

const LANGUAGE_CODES: Record<SupportedLanguage, string> = { en: 'EN', fr: 'FR', 'fr-BE': 'FR-BE', de: 'DE', nl: 'NL', 'nl-BE': 'NL-BE', ko: 'KO' };

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Real, standard floating-menu behavior every other panel-style
  // control in the app gets for free from being a native <select> —
  // this one has to add it back explicitly now that it's a custom div.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const current = i18n.language as SupportedLanguage;

  return (
    <div className="ps-lang-switcher-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ps-lang-switcher-btn"
        aria-label={t('language.label')}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('language.label')}
        onClick={() => setOpen(v => !v)}
      >
        {LANGUAGE_CODES[current] ?? current.toUpperCase()} <span className="ps-lang-switcher-caret">▾</span>
      </button>
      {open && (
        <div className="ps-lang-switcher-menu" role="listbox" aria-label={t('language.label')}>
          {SUPPORTED_LANGUAGES.map(lang => (
            <button
              key={lang}
              type="button"
              role="option"
              aria-selected={lang === current}
              className={`ps-lang-switcher-menu-item${lang === current ? ' ps-lang-switcher-menu-item--active' : ''}`}
              onClick={() => { i18n.changeLanguage(lang); setOpen(false); }}
            >
              {lang === current ? '✓ ' : ''}{t(`language.${lang}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
