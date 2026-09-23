// src/components/Common/Dropdown.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A minimal, genuinely custom single-select dropdown. Built specifically
// because a native <select>'s CLOSED box can be restyled via CSS (see
// .ps-conf-select), but its OPEN option list is rendered by the operating
// system and largely ignores CSS regardless of browser -- there is no
// CSS-only fix for a native select looking inconsistent with a dark
// custom-themed app once it's actually open.
//
// Deliberately simple: single-select, fires onSelect immediately (matches
// the "chips + add-another" pattern this was built for, where the trigger
// always shows a placeholder rather than tracking a persistent selected
// value) rather than a full combobox with search/multi-select/keyboard
// list navigation. Extend if a future use case genuinely needs more.
// ─────────────────────────────────────────────────────────────────────────────
//
// i18n note: `options[].label` and the caller-supplied `placeholder`/
// `emptyText` are the caller's own already-resolved display text, not
// literal chrome authored in this file. The one piece of UI copy this
// file itself owns is the `emptyText` fallback default, which reuses
// `searchableCombobox.defaultEmptyText` — the sibling combobox
// component's own exact-text default for the same "no options"
// fallback case.

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options:     DropdownOption[];
  placeholder: string;
  onSelect:    (value: string) => void;
  emptyText?:  string;
  className?:  string;
}

export const Dropdown: React.FC<DropdownProps> = ({ options, placeholder, onSelect, emptyText, className }) => {
  const { t } = useTranslation();
  const resolvedEmptyText = emptyText ?? t('searchableCombobox.defaultEmptyText');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={ref} className={`ps-dropdown${className ? ` ${className}` : ''}`}>
      <button type="button" className="ps-dropdown-trigger" onClick={() => setOpen(v => !v)}>
        <span className="ps-dropdown-placeholder">{placeholder}</span>
        <svg
          className={`ps-dropdown-chevron${open ? ' ps-dropdown-chevron--open' : ''}`}
          width="10" height="6" viewBox="0 0 10 6" fill="none"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="ps-dropdown-list">
          {options.length === 0 ? (
            <div className="ps-dropdown-empty">{resolvedEmptyText}</div>
          ) : options.map(opt => (
            <div
              key={opt.value}
              className="ps-dropdown-option"
              onClick={() => { onSelect(opt.value); setOpen(false); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
