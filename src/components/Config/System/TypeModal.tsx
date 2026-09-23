// src/components/Config/System/TypeModal.tsx
// Rewritten from scratch to avoid OXC/rolldown parse issues.
// Zero template literals in style props. Zero inline hex-alpha strings.
// All styling via CSS classes from pathscribe.css.
//
// i18n sweep (batch 57, swept together with its parent
// ParticipationTypesSection.tsx): every on-screen label, placeholder, and
// validation message now goes through the participationTypesSection.modal.*
// namespace. Real data (draft.label, draft.abbreviation, draft.description,
// draft.color, lab.name) stays exactly as entered/stored - only chrome and
// static hint text are translated.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { ParticipationTypeRecord as ParticipationType, NewParticipationType } from '../../../services/participationTypes/IParticipationTypeService';
import { findDuplicate } from '../../../utils/validateUnique';
import type { Facility } from '../../../services/facilities/IFacilityService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Draft = NewParticipationType;
type AuthorityOverride = NonNullable<Draft['authorityOverrides']>[string];

interface TypeModalProps {
  mode:     'add' | 'edit';
  type?:    ParticipationType;
  existingEntries: ParticipationType[];
  labs: Facility[];
  isBuiltIn: boolean;
  onSave:   (draft: Draft) => void;
  onClose:  () => void;
}

// ── Capability row ────────────────────────────────────────────────────────────

const CapRow: React.FC<{
  label:    string;
  desc:     string;
  checked:  boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, desc, checked, disabled, onChange }) => (
  <label className={checked ? 'ps-sub-check-row ps-sub-check-row--checked' : 'ps-sub-check-row ps-sub-check-row--unchecked'}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => !disabled && onChange(e.target.checked)}
      className="ps-type-cap-checkbox"
    />
    <div>
      <div className="ps-sub-check-label">{label}</div>
      <div className="ps-sub-check-sub">{desc}</div>
    </div>
  </label>
);

// ── Colour swatch ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#8AB4F8','#60a5fa','#818cf8','#38bdf8',
  '#81C995','#4ade80','#6b7280','#f59e0b',
  '#8b5cf6','#f87171','#fb923c','#e879f9',
];

// ── Main component ────────────────────────────────────────────────────────────

const TypeModal: React.FC<TypeModalProps> = ({ mode, type, existingEntries, labs, isBuiltIn, onSave, onClose }) => {
  const { t } = useTranslation();

  const [draft, setDraft] = useState<Draft>({
    label:                 type?.label                 ?? '',
    abbreviation:          type?.abbreviation          ?? '',
    description:           type?.description           ?? '',
    canFinalize:           type?.canFinalize           ?? false,
    requiresCountersign:   type?.requiresCountersign   ?? false,
    canBeAssignedTemplate: type?.canBeAssignedTemplate ?? false,
    canViewWholeCase:      type?.canViewWholeCase      ?? false,
    allowsMultiple:        type?.allowsMultiple        ?? true,
    color:                 type?.color                 ?? '#8AB4F8',
    active:                type?.active                ?? true,
    requiresNote:          type?.requiresNote          ?? false,
    authorityOverrides:    type?.authorityOverrides    ?? undefined,
  });

  const [error, setError] = useState('');

  // Per-lab sign-out-authority overrides — real, per direct ruling that
  // a rigid global bright line can't hold across jurisdictions (US
  // CLIA/CAP vs. UK RCPath delegation vs. France/Germany/South Korea's
  // personal-liability mandates). Toggling a lab "on" seeds it with
  // this type's own current platform-default flags (so turning
  // override on never silently changes behavior until the admin
  // actually edits something), toggling it back off removes the lab's
  // entry entirely — reverting cleanly to the platform default rather
  // than leaving a stale, now-hidden override behind.
  const overrideLabIds = Object.keys(draft.authorityOverrides ?? {});

  const setLabOverrideEnabled = (labId: string, enabled: boolean) => {
    setDraft(d => {
      const next = { ...(d.authorityOverrides ?? {}) };
      if (enabled) {
        next[labId] = {
          canFinalize: d.canFinalize,
          requiresCountersign: d.requiresCountersign,
          canViewWholeCase: d.canViewWholeCase,
        };
      } else {
        delete next[labId];
      }
      return { ...d, authorityOverrides: Object.keys(next).length > 0 ? next : undefined };
    });
  };

  const setLabOverrideFlag = (labId: string, key: keyof AuthorityOverride, value: boolean) => {
    setDraft(d => ({
      ...d,
      authorityOverrides: {
        ...(d.authorityOverrides ?? {}),
        [labId]: { ...(d.authorityOverrides?.[labId] ?? {}), [key]: value },
      },
    }));
  };

  const handleSave = () => {
    if (!draft.label.trim())        { setError(t('participationTypesSection.modal.errorLabelRequired'));        return; }
    if (!draft.abbreviation.trim()) { setError(t('participationTypesSection.modal.errorAbbrRequired')); return; }
    // PS-73: label AND abbreviation uniqueness — real gap, since
    // abbreviation is displayed as a compact chip in CaseTeamModal.tsx
    // (two types sharing "PRIM" would be genuinely ambiguous there),
    // and label is the full name shown everywhere else. Deliberately
    // GLOBAL, not scoped by performing lab (unlike Container Types/
    // Specimen Categories/Cassette Colors) — this dictionary encodes
    // case-team sign-out authority (canFinalize/requiresCountersign/
    // canViewWholeCase), a compliance-critical mechanism, not an
    // operational convenience. Silently forking what "Primary
    // Pathologist" is allowed to do per lab is a real risk this
    // screen shouldn't introduce on its own — flag to Pete before
    // ever adding that axis here.
    const excludeId = mode === 'edit' ? type?.id : undefined;
    const labelCollision = findDuplicate(existingEntries, { label: draft.label.trim() }, ['label'], excludeId);
    if (labelCollision) { setError(t('participationTypesSection.modal.errorLabelDuplicate', { label: labelCollision.label })); return; }
    const abbrCollision = findDuplicate(existingEntries, { abbreviation: draft.abbreviation.trim() }, ['abbreviation'], excludeId);
    if (abbrCollision) { setError(t('participationTypesSection.modal.errorAbbrDuplicate', { abbr: abbrCollision.abbreviation, label: abbrCollision.label })); return; }
    setError('');
    onSave(draft);
  };

  const cap = (key: keyof Draft, label: string, desc: string, disabled = false) => (
    <CapRow
      key={key as string}
      label={label}
      desc={desc}
      checked={!!draft[key]}
      disabled={disabled}
      onChange={v => setDraft(d => ({ ...d, [key]: v }))}
    />
  );

  return (
    <div className="ps-conf-backdrop">
      <div
        className="fm-modal fm-modal--config ps-rulemodal__modal"
        onClick={e => e.stopPropagation()}
      >

        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">{t('participationTypesSection.modal.eyebrow')}</div>
            <h2 className="fm-title ps-participationtypes__modal-title">
              {mode === 'add' ? t('participationTypesSection.modal.titleAdd') : t('participationTypesSection.modal.titleEdit', { label: type?.label ?? '' })}
              {isBuiltIn && (
                <span className="ps-idf-tier-badge ps-idf-tier-badge--2 ps-participationtypes__builtin-badge">
                  {t('participationTypesSection.builtInBadge')}
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="ps-client-editor-body">

          {isBuiltIn && (
            <div className="ps-sub-info-box">
              {t('participationTypesSection.modal.builtInInfo')}
            </div>
          )}

          {/* Label */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">
              {t('participationTypesSection.modal.labelLabel')} <span className="ps-sub-label-req">*</span>
            </label>
            <input
              className="ps-sub-input"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder={t('participationTypesSection.modal.labelPlaceholder')}
            />
          </div>

          {/* Abbreviation */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">
              {t('participationTypesSection.modal.abbreviationLabel')} <span className="ps-sub-label-req">*</span>
            </label>
            <input
              className="ps-sub-input"
              value={draft.abbreviation}
              onChange={e => setDraft(d => ({ ...d, abbreviation: e.target.value }))}
              placeholder={t('participationTypesSection.modal.abbreviationPlaceholder')}
              maxLength={12}
            />
          </div>

          {/* Description */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('participationTypesSection.modal.descriptionLabel')}</label>
            <input
              className="ps-sub-input"
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              placeholder={t('participationTypesSection.modal.descriptionPlaceholder')}
            />
          </div>

          {/* Colour */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('participationTypesSection.modal.colourLabel')}</label>
            <div className="ps-type-color-row">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={draft.color === c ? 'ps-type-color-swatch ps-type-color-swatch--active' : 'ps-type-color-swatch'}
                  style={{ background: c }}
                  onClick={() => setDraft(d => ({ ...d, color: c }))}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={draft.color}
                onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                className="ps-type-color-input"
                title={t('participationTypesSection.modal.customColourTitle')}
              />
            </div>
            <div className="ps-type-preview-row">
              <span className="ps-type-preview-chip" style={{ background: draft.color, color: '#0f172a', opacity: 0.85 }}>
                {draft.abbreviation || t('participationTypesSection.modal.previewFallback')}
              </span>
            </div>
          </div>

          {/* Capabilities */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('participationTypesSection.modal.capabilitiesLabel')}</label>
            <div className="ps-type-cap-list">
              {cap('canFinalize',           t('participationTypesSection.modal.capFinalizeLabel'),   t('participationTypesSection.modal.capFinalizeDesc'), isBuiltIn && type?.id === 'primary')}
              {cap('requiresCountersign',   t('participationTypesSection.modal.capCountersignLabel'), t('participationTypesSection.modal.capCountersignDesc'))}
              {cap('canBeAssignedTemplate', t('participationTypesSection.modal.capTemplateLabel'),    t('participationTypesSection.modal.capTemplateDesc'))}
              {cap('canViewWholeCase',      t('participationTypesSection.modal.capFullViewLabel'),    t('participationTypesSection.modal.capFullViewDesc'))}
              {cap('allowsMultiple',        t('participationTypesSection.modal.capMultiLabel'),       t('participationTypesSection.modal.capMultiDesc'))}
            </div>
          </div>

          {/* Per-performing-lab sign-out authority overrides */}
          {labs.length > 0 && (
            <div className="ps-sub-field">
              <label className="ps-sub-label">{t('participationTypesSection.modal.perLabLabel')}</label>
              <div className="ps-participationtypes__modal-hint">
                {t('participationTypesSection.modal.perLabHint')}
              </div>
              <div className="ps-type-cap-list">
                {labs.map(lab => {
                  const enabled = overrideLabIds.includes(lab.id);
                  const ov = draft.authorityOverrides?.[lab.id];
                  return (
                    <div key={lab.id} className="ps-sub-check-row ps-sub-check-row--unchecked ps-participationtypes__lab-row">
                      <label className="ps-participationtypes__lab-row-label">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={e => setLabOverrideEnabled(lab.id, e.target.checked)}
                          className="ps-type-cap-checkbox"
                        />
                        <span className="ps-sub-check-label">{lab.name}</span>
                      </label>
                      {enabled && (
                        <div className="ps-participationtypes__lab-overrides">
                          <label className="ps-participationtypes__lab-override-checkbox">
                            <input type="checkbox" checked={!!ov?.canFinalize}
                              onChange={e => setLabOverrideFlag(lab.id, 'canFinalize', e.target.checked)} />
                            {t('participationTypesSection.modal.overrideFinalize')}
                          </label>
                          <label className="ps-participationtypes__lab-override-checkbox">
                            <input type="checkbox" checked={!!ov?.requiresCountersign}
                              onChange={e => setLabOverrideFlag(lab.id, 'requiresCountersign', e.target.checked)} />
                            {t('participationTypesSection.modal.overrideCountersign')}
                          </label>
                          <label className="ps-participationtypes__lab-override-checkbox">
                            <input type="checkbox" checked={!!ov?.canViewWholeCase}
                              onChange={e => setLabOverrideFlag(lab.id, 'canViewWholeCase', e.target.checked)} />
                            {t('participationTypesSection.modal.overrideFullView')}
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active toggle */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('participationTypesSection.modal.statusLabel')}</label>
            <div className="ps-sub-toggle-wrap">
              <div
                onClick={() => setDraft(d => ({ ...d, active: !d.active }))}
                className={draft.active ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
              >
                <div className={draft.active ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
              </div>
              <span className={draft.active ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>
                {draft.active ? t('common.active') : t('common.inactive')}
              </span>
            </div>
          </div>

          {error && <div className="ps-sub-error">{error}</div>}

        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div className="ps-rulemodal__footer-actions">
            <button onClick={onClose} className="fm-btn-cancel">{t('common.cancel')}</button>
            <button onClick={handleSave} className="fm-btn-apply">
              {mode === 'add' ? t('participationTypesSection.modal.addTypeBtn') : t('participationTypesSection.modal.saveChangesBtn')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TypeModal;
