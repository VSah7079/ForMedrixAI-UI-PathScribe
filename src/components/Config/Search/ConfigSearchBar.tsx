/**
 * ConfigSearchBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Search bar for ConfigurationPage. Searches CONFIG_SEARCH_INDEX by label,
 * synonyms, and description, and navigates to the matched setting's tab on
 * selection.
 *
 * i18n note: `entry.labelKey`/`entry.descriptionKey` are resolved with
 * `t()` at render AND at scoring time (a search for the French wording of
 * a setting should still find it) — see configSearchIndex.ts's own i18n
 * note for how each key was chosen (reused exact-text key vs. a new
 * `configSearchIndex.entries.<id>.*` key). `entry.synonyms` are real,
 * internal search-matching data (not displayed anywhere) and are
 * deliberately left as literal English keywords, out of scope. The result
 * row's tab pill is resolved from `entry.tabId` via the same
 * `configuration.tabs.<id>` keys the main Configuration page's own tab
 * strip already uses, rather than storing a duplicate translated string
 * per entry.
 *
 * Real, per direct report ("the top level search in config found the
 * entry, but when clicked on, it did not go to the setting"): now also
 * deep-links to the specific section within a tab when the matched
 * entry has one (`ConfigSearchEntry.section`) — reuses the same real
 * `PATHSCRIBE_SYSTEM_NAVIGATE` custom event AppShell.tsx's own
 * config-link chat messages already dispatch, not a new mechanism.
 * Entries without a confirmed section (see configSearchIndex.ts's own
 * notes on `sys-jurisdiction`/`sys-info`) still fall back to the
 * original tab-only navigation — a real result, just not as precise
 * as it could be, rather than navigating nowhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIG_SEARCH_INDEX, ConfigSearchEntry, ConfigTabId } from '../../../constants/configSearchIndex';

interface ConfigSearchBarProps {
  onNavigate: (tabId: ConfigTabId, section?: string) => void;
}

function scoreEntry(entry: ConfigSearchEntry, query: string, t: (key: string) => string): number {
  const q = query.toLowerCase().trim();
  const label = t(entry.labelKey).toLowerCase();
  if (!q) return 0;
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (entry.synonyms.some(s => s.toLowerCase().includes(q))) return 40;
  if (t(entry.descriptionKey).toLowerCase().includes(q)) return 20;
  return 0;
}

const ConfigSearchBar: React.FC<ConfigSearchBarProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return CONFIG_SEARCH_INDEX
      .map(entry => ({ entry, score: scoreEntry(entry, query, t) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(r => r.entry);
  }, [query, t]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectEntry = (entry: ConfigSearchEntry) => {
    onNavigate(entry.tabId, entry.section);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[activeIdx]) selectEntry(results[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="ps-config-search" ref={wrapRef}>
      <span className="ps-config-search__icon">&#128269;</span>
      <input
        className="ps-config-search__input"
        type="text"
        placeholder={t('configSearchIndex.searchPlaceholder')}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label={t('configSearchIndex.searchAriaLabel')}
      />
      {open && query.trim() && (
        <div className="ps-config-search__results">
          {results.length === 0
            ? <div className="ps-config-search__empty">{t('configSearchIndex.noResults', { query })}</div>
            : results.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                className={`ps-config-search__result${i === activeIdx ? ' active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => selectEntry(entry)}
              >
                <div className="ps-config-search__result-label">{t(entry.labelKey)}</div>
                <div className="ps-config-search__result-desc">{t(entry.descriptionKey)}</div>
                <span className="ps-config-search__result-tab">{t(`configuration.tabs.${entry.tabId}`)}</span>
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
};

export default ConfigSearchBar;
