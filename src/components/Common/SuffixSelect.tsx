// src/components/Common/SuffixSelect.tsx
// ─────────────────────────────────────────────────────────────
// Suffix (Jr./Sr./II/III/IV/V) as a dropdown for the common case, with
// an "Other…" option that reveals free text for anything else
// (professional credentials, less common generational markers). Never a
// restriction — the free-text fallback always exists.
//
// CSS-system-agnostic by design: takes selectClassName/inputClassName
// props rather than hardcoding classes, since it's reused across
// AccessionPage.tsx (ps-input-dark) and the Config screens (ps-conf-input)
// which use two different class systems.
//
// i18n note: `SUFFIX_PRESETS` ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V')
// are real, selectable name-suffix data appended to a real person's
// name — left as literal data, not translated, same as any other
// real proper-name content. The default `ariaLabel` reuses
// `physiciansSection.modal.suffixLabel` (exact-text match, the label
// already shown next to this component in PhysiciansSection.tsx);
// the placeholder and "Use list"/"Other…" reuse
// `facilityEditorModal.general.*` (exact-text matches); "None"
// reuses the generic `common.none`.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { SUFFIX_PRESETS, isPresetSuffix } from '../../utils/personName';

interface SuffixSelectProps {
  value: string;
  onChange: (v: string) => void;
  selectClassName: string;
  inputClassName: string;
  ariaLabel?: string;
}

export const SuffixSelect: React.FC<SuffixSelectProps> = ({ value, onChange, selectClassName, inputClassName, ariaLabel }) => {
  const { t } = useTranslation();
  const [customMode, setCustomMode] = useState(!isPresetSuffix(value));
  const resolvedAriaLabel = ariaLabel ?? t('physiciansSection.modal.suffixLabel');

  if (customMode) {
    return (
      <div className="ps-suffix-custom-row">
        <input
          className={inputClassName}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={t('facilityEditorModal.general.contactSuffixPlaceholder')}
          aria-label={resolvedAriaLabel}
        />
        <button type="button" className="ps-suffix-back-link" onClick={() => { setCustomMode(false); onChange(''); }}>
          {t('facilityEditorModal.general.useList')}
        </button>
      </div>
    );
  }

  return (
    <select
      className={selectClassName}
      value={value}
      aria-label={resolvedAriaLabel}
      onChange={e => {
        if (e.target.value === '__other__') { setCustomMode(true); onChange(''); }
        else onChange(e.target.value);
      }}
    >
      <option value="">{t('common.none')}</option>
      {SUFFIX_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
      <option value="__other__">{t('facilityEditorModal.general.other')}</option>
    </select>
  );
};
