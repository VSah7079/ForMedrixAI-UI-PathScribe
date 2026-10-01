// src/components/SpecimenPicker/SpecimenDictionaryPicker.tsx
// ─────────────────────────────────────────────────────────────
// Searchable lookup modal for picking a Specimen Dictionary entry —
// replaces a plain <select>/<optgroup>. A native dropdown works for a
// handful of entries; once the dictionary has hundreds (the real target
// size), a flat scrolling list with no search is unusable. Same
// search+list pattern already established elsewhere (order picker,
// facility affiliation picker) rather than a new one-off design.
// ─────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { SpecimenEntry } from '../../services/specimenDictionary/specimenTypes';

interface Props {
  dictionary: SpecimenEntry[];
  currentEntryId?: string;
  onSelect: (entry: SpecimenEntry | null) => void; // null = explicit "Custom specimen"
  onClose: () => void;
}

export const SpecimenDictionaryPicker: React.FC<Props> = ({ dictionary, currentEntryId, onSelect, onClose }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const active = dictionary.filter(e => e.active);
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      (e.site ?? '').toLowerCase().includes(q) ||
      e.procedure.toLowerCase().includes(q) ||
      (e.synonyms ?? []).some(s => s.toLowerCase().includes(q))
    );
  }, [dictionary, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, SpecimenEntry[]>();
    for (const e of filtered) {
      // 'Other' here is an internal grouping key only, not displayed
      // directly — real per-org dictionary type values (e.g. "Breast",
      // "Skin") stay untranslated as admin-configured dictionary data;
      // only the fallback-bucket label is translated at render time.
      const key = e.type || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="ps-ms-overlay" onClick={onClose}>
      <div className="ps-ms-modal ps-ms-modal--wide ps-specimen-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="ps-ms-header">{t('specimenDictionaryPicker.header')}</div>

        <div className="ps-ms-body ps-specimen-picker-body">
          <input
            autoFocus
            className="ps-input-dark"
            placeholder={t('specimenDictionaryPicker.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <button
            className={`ps-specimen-picker-item ps-specimen-picker-item--custom${!currentEntryId ? ' ps-specimen-picker-item--selected' : ''}`}
            onClick={() => { onSelect(null); onClose(); }}
          >
            {t('specimenDictionaryPicker.customSpecimen')}
          </button>

          <div className="ps-specimen-picker-list">
            {grouped.length === 0 ? (
              <div className="ps-specimen-picker-empty">{t('specimenDictionaryPicker.noMatches', { search })}</div>
            ) : grouped.map(([type, entries]) => (
              <div key={type} className="ps-specimen-picker-group">
                <div className="ps-specimen-picker-group-label">
                  {type === 'Other' ? t('specimenDictionaryPicker.otherGroup') : type}
                </div>
                {entries.map(e => (
                  <button
                    key={e.id}
                    className={`ps-specimen-picker-item${currentEntryId === e.id ? ' ps-specimen-picker-item--selected' : ''}`}
                    onClick={() => { onSelect(e); onClose(); }}
                  >
                    <div className="ps-specimen-picker-item-name">{e.name}</div>
                    {(e.procedure || e.site || e.laterality) && (
                      <div className="ps-specimen-picker-item-meta">
                        {[e.procedure, e.site, e.laterality].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('specimenDictionaryPicker.cancel')}</button>
        </div>
      </div>
    </div>
  );
};
