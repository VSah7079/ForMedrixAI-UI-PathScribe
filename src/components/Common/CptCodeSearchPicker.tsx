// src/components/Common/CptCodeSearchPicker.tsx
// -----------------------------------------------------------------------------
// Extracted from components/Config/System/BillingDictionarySection.tsx, where
// it was originally built private/inline for that screen's own "search by
// CPT code or description" field. Promoted here, per direct requirement, so
// pages/SynopticReportPage/components/BillingReviewPanel.tsx's own new
// manual add-code feature can reuse the identical, real, already-proven
// search UI rather than duplicate it - same real reasoning as every other
// component in this folder (see this folder's own README.md).
//
// Real, controlled component: value/onChange carry the real, current CPT
// value (supports typing a genuinely new code not yet in the dictionary -
// never blocks manual entry), onSelect fires additionally when a real
// dictionary match is picked, so the caller can also auto-fill
// description/RVU from that same real match.
// -----------------------------------------------------------------------------
//
// i18n note: `e.code`/`e.description` are real dictionary data, kept
// as-is; "RVU" is a standardized billing abbreviation (Relative Value
// Unit) and stays literal. The placeholder and the description+RVU
// concatenation reuse `codeSearchModal.searchPlaceholder`/
// `.resultDescriptionWithRvu` (exact-text matches from the sibling
// Search Billing Codes modal this component was extracted alongside).
// The empty-state message is worded differently from that modal's own
// `codeSearchModal.noVerifiedMatch` (which echoes the typed value back;
// this one doesn't), so it got its own new key rather than a
// same-topic-different-wording reuse.

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Real, per direct guidance's own follow-up: generalized from a
 *  BillingDictionaryEntry-specific type to this minimal, structural
 *  shape - BillingDictionaryEntry already satisfies it, and this lets
 *  a real, different dictionary (HcpcsLevelIIEntry,
 *  hcpcsLevelIIDictionary.ts) reuse this exact same, proven search
 *  component without any type coercion. */
export interface SearchableCodeEntry {
  code: string;
  description: string;
  workRvu?: number;
}

export function CptCodeSearchPicker<T extends SearchableCodeEntry>({ entries, value, onChange, onSelect, disabled, hasError }: {
  entries: T[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (entry: T) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const matches = entries
    .filter(e => {
      const q = value.trim().toLowerCase();
      return !q || e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    })
    .slice(0, 20);

  return (
    <div className="ps-protocol-stainselect ps-protocol-stainselect--no-margin" ref={wrapRef}>
      <input
        className={`ps-conf-input ${hasError ? 'ps-conf-input--error' : ''}`}
        placeholder={t('codeSearchModal.searchPlaceholder')}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        disabled={disabled}
      />
      {open && matches.length > 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          {matches.map(e => (
            <div key={e.code} className="ps-protocol-stainselect-option ps-protocol-stainselect-option--code-col"
              onMouseDown={() => { onSelect(e); setOpen(false); }}>
              <span>{e.code}</span>
              <span className="ps-protocol-stainselect-option-cat">
                {e.workRvu !== undefined ? t('codeSearchModal.resultDescriptionWithRvu', { description: e.description, rvu: e.workRvu }) : e.description}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && value.trim() && matches.length === 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          <div className="ps-protocol-stainselect-empty">{t('cptCodeSearchPicker.noMatchingCodes')}</div>
        </div>
      )}
    </div>
  );
}

export default CptCodeSearchPicker;
