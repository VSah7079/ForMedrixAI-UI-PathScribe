// src/components/Common/SearchableCombobox.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A genuine searchable combobox — real fix for item #69 ("Can the
// specimen type search be contains?"). The existing Dropdown.tsx
// component in this same folder is explicitly, deliberately a plain
// single-select with no search, per its own header comment:
// "Extend if a future use case genuinely needs more." This is that
// extension, not a separate, disconnected component — same overall
// shell/list visual language (reuses .ps-dropdown-trigger/-list/-option
// styling), same click-outside-to-close and Escape-to-close behavior.
//
// What's genuinely new here, beyond Dropdown.tsx:
//   - A real text input filters the option list as you type, matching
//     "contains" anywhere in the label (or any extra searchText a
//     caller supplies — e.g. synonyms), not just prefix-matching the
//     way scrolling/typing into a native <select> effectively does.
//   - The trigger shows the currently selected option's own label
//     once one is chosen, not a static placeholder — this needs to
//     work as a real field with a persistent value, not just a
//     one-shot "pick something, fire an action" trigger.
//   - Full keyboard list navigation (Up/Down/Enter/Escape), since a
//     search-driven list is far more natural to drive from the
//     keyboard than a click-only one.
//
// i18n note: `placeholder`/`emptyText`/`noMatchText` are optional caller-
// supplied props — most callers pass their own already-translated text,
// so the defaults below (this component's own fallback copy, used when a
// caller doesn't override them) are translated here rather than as plain
// string defaults, since a hook can't be called inside a destructuring
// default.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';

export interface ComboboxOption {
  id: string;
  label: string;
  /** Optional secondary line shown dimmed under the label — e.g. a
   *  specimen type's procedure/site, to help tell apart similarly-
   *  named entries once the list is filtered down. */
  sublabel?: string;
  /** Extra text "contains" search should also match against, beyond
   *  the label itself — e.g. synonyms. Genuinely useful here: several
   *  real specimen dictionary entries carry synonyms a pathologist
   *  might type instead of the canonical name (e.g. "Renal Biopsy"
   *  finding "Kidney Biopsy, Native"), and search should honor that,
   *  not just match the display label verbatim. */
  searchText?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  /** Selected option's id, or '' for none selected. */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  /** Shown when the filter text matches nothing — distinct from
   *  emptyText (which covers "there are no options at all"). */
  noMatchText?: string;
  className?: string;
  disabled?: boolean;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  options, value, onChange, placeholder, emptyText,
  noMatchText, className, disabled = false,
}) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('searchableCombobox.defaultPlaceholder');
  const resolvedEmptyText = emptyText ?? t('searchableCombobox.defaultEmptyText');
  const resolvedNoMatchText = noMatchText ?? t('searchableCombobox.defaultNoMatchText');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel?.toLowerCase().includes(q) ?? false) ||
      (o.searchText?.toLowerCase().includes(q) ?? false)
    );
  }, [options, query]);

  // Reset the filter text and highlight whenever the list opens fresh,
  // rather than carrying over whatever was typed last time it was open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightedIndex(0);
      // Focus after the input actually mounts (it's conditionally
      // rendered on `open`), not before.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const commitSelection = (option: ComboboxOption) => {
    onChange(option.id);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlightedIndex];
      if (target) commitSelection(target);
      return;
    }
  };

  return (
    <div ref={rootRef} className={`ps-combobox${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="ps-dropdown-trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'ps-combobox-selected-label' : 'ps-dropdown-placeholder'}>
          {selected ? selected.label : resolvedPlaceholder}
        </span>
        <svg
          className={`ps-dropdown-chevron${open ? ' ps-dropdown-chevron--open' : ''}`}
          width="10" height="6" viewBox="0 0 10 6" fill="none"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="ps-dropdown-list ps-combobox-list">
          <div className="ps-combobox-search-wrap">
            <input
              ref={inputRef}
              type="text"
              className="ps-combobox-search-input"
              placeholder={t('searchableCombobox.typeToFilterPlaceholder')}
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlightedIndex(0); }}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-expanded={open}
              aria-controls="ps-combobox-listbox"
              aria-autocomplete="list"
            />
          </div>
          <div id="ps-combobox-listbox" role="listbox">
            {options.length === 0 ? (
              <div className="ps-dropdown-empty">{resolvedEmptyText}</div>
            ) : filtered.length === 0 ? (
              <div className="ps-dropdown-empty">{resolvedNoMatchText}</div>
            ) : filtered.map((opt, i) => (
              <div
                key={opt.id}
                role="option"
                aria-selected={opt.id === value}
                className={`ps-dropdown-option ps-combobox-option${i === highlightedIndex ? ' ps-combobox-option--highlighted' : ''}${opt.id === value ? ' ps-combobox-option--selected' : ''}`}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => commitSelection(opt)}
              >
                <div>{opt.label}</div>
                {opt.sublabel && <div className="ps-combobox-option-sublabel">{opt.sublabel}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableCombobox;
