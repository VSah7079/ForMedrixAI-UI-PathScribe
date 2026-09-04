/**
 * ConfigSearchBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Search bar for ConfigurationPage. Searches CONFIG_SEARCH_INDEX by label,
 * synonyms, and description, and navigates to the matched setting's tab on
 * selection.
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
import { CONFIG_SEARCH_INDEX, ConfigSearchEntry, ConfigTabId } from '../../../constants/configSearchIndex';

interface ConfigSearchBarProps {
  onNavigate: (tabId: ConfigTabId, section?: string) => void;
}

function scoreEntry(entry: ConfigSearchEntry, query: string): number {
  const q = query.toLowerCase().trim();
  const label = entry.label.toLowerCase();
  if (!q) return 0;
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (entry.synonyms.some(s => s.toLowerCase().includes(q))) return 40;
  if (entry.description.toLowerCase().includes(q)) return 20;
  return 0;
}

const ConfigSearchBar: React.FC<ConfigSearchBarProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return CONFIG_SEARCH_INDEX
      .map(entry => ({ entry, score: scoreEntry(entry, query) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(r => r.entry);
  }, [query]);

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
        placeholder="Search settings…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="Search configuration settings"
      />
      {open && query.trim() && (
        <div className="ps-config-search__results">
          {results.length === 0
            ? <div className="ps-config-search__empty">No settings found for "{query}"</div>
            : results.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                className={`ps-config-search__result${i === activeIdx ? ' active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => selectEntry(entry)}
              >
                <div className="ps-config-search__result-label">{entry.label}</div>
                <div className="ps-config-search__result-desc">{entry.description}</div>
                <span className="ps-config-search__result-tab">{entry.tabLabel}</span>
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
};

export default ConfigSearchBar;
