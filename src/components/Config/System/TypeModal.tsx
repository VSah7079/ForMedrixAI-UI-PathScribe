// src/components/Config/System/TypeModal.tsx
// Rewritten from scratch to avoid OXC/rolldown parse issues.
// Zero template literals in style props. Zero inline hex-alpha strings.
// All styling via CSS classes from pathscribe.css. The two genuinely
// per-instance values (a swatch's own colour, the live preview chip's
// chosen colour) are passed only as the --swatch-color custom property,
// consumed by real CSS rules — never a raw inline CSS declaration.
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
import type { ParticipationTypeRecord as ParticipationType, NewParticipationType, AuthorityFlag } from '../../../services/participationTypes/IParticipationTypeService';
import { AUTHORITY_FLAGS } from '../../../services/participationTypes/IParticipationTypeService';
import type { ResolvedAuthorityFlag } from '../../../services/participationTypes/authorityProvenance';
import {
  buildFacilityAuthorityRows, toggleFacilityOverride, setFacilityOverrideFlag, initialJustifications,
} from '../../../services/participationTypes/facilityAuthorityEditor';
import { findDuplicate } from '../../../utils/validateUnique';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { Jurisdiction } from '../../../types/systemConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

type Draft = NewParticipationType;

interface TypeModalProps {
  mode:     'add' | 'edit';
  type?:    ParticipationType;
  existingEntries: ParticipationType[];
  labs: Facility[];
  isBuiltIn: boolean;
  /** `justifications` — per facility id, the justification text the
   *  admin entered for that facility's override in this session. The
   *  parent passes it to saveParticipationTypeWithAudit()
   *  (services/participationTypes/saveParticipationType.ts), which
   *  stamps provenance and writes the audit trail. */
  onSave:   (draft: Draft, justifications: Record<string, string>) => void;
  onClose:  () => void;
}

const FLAG_LABEL_KEYS: Record<AuthorityFlag, string> = {
  canFinalize:         'participationTypesSection.modal.overrideFinalize',
  requiresCountersign: 'participationTypesSection.modal.overrideCountersign',
  canViewWholeCase:    'participationTypesSection.modal.overrideFullView',
};

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
  const { t, i18n } = useTranslation();

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
    // Carried so a Duplicate keeps the source's country scope and per-country
    // authority (PS-73); an edit re-saves the same values it loaded.
    icon:                  type?.icon,
    jurisdictionProfiles:  type?.jurisdictionProfiles,
    scopedJurisdictions:   type?.scopedJurisdictions,
  });

  const [error, setError] = useState('');

  // ── Facility-level sign-out authority — transparent, break-glass, audited ──
  // Render-and-dispatch only (standing rule: no business logic in
  // components). Which labs to show, what a new override seeds from,
  // unsaved/pending-removal state, and each flag's value + source all
  // come from services/participationTypes/facilityAuthorityEditor.ts;
  // provenance stamping and the audit trail happen in the parent's save
  // (services/participationTypes/saveParticipationType.ts).
  const [justifications, setJustifications] = useState<Record<string, string>>(() => initialJustifications(type));
  const authorityRows = buildFacilityAuthorityRows(type, draft, labs);

  const setLabOverrideEnabled = (lab: Facility, enabled: boolean) =>
    setDraft(d => ({ ...d, authorityOverrides: toggleFacilityOverride(type, d, lab, enabled) }));

  const setLabOverrideFlag = (labId: string, flag: AuthorityFlag, value: boolean) =>
    setDraft(d => ({ ...d, authorityOverrides: setFacilityOverrideFlag(d.authorityOverrides, labId, flag, value) }));

  const jurisdictionName = (j: Jurisdiction) => t(`jurisdictionNames.${j}`);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(i18n.language);
  };

  const sourceText = (r: ResolvedAuthorityFlag, unsaved: boolean): string => {
    if (r.source === 'facility') {
      if (unsaved) return t('participationTypesSection.modal.authority.sourceFacilityPending');
      if (r.overriddenBy && r.overriddenAt) {
        return t('participationTypesSection.modal.authority.sourceFacility', { name: r.overriddenBy.userName, date: formatDate(r.overriddenAt) });
      }
      return t('participationTypesSection.modal.authority.sourceFacilityLegacy');
    }
    if (r.source === 'jurisdiction' && r.jurisdiction) {
      return t('participationTypesSection.modal.authority.sourceJurisdiction', { jurisdiction: jurisdictionName(r.jurisdiction) });
    }
    return t('participationTypesSection.modal.authority.sourcePlatform');
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
    onSave(draft, justifications);
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
                  {t('participationTypesSecticlson.builtInBadge')}
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
                  style={{ '--swatch-color': c } as React.CSSProperties}
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
              <span className="ps-type-preview-chip" style={{ '--swatch-color': draft.color } as React.CSSProperties}>
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

          {/* Per-facility sign-out authority — active rule + source of truth, break-glass override, audited */}
          {authorityRows.length > 0 && (
            <div className="ps-sub-field">
              <label className="ps-sub-label">{t('participationTypesSection.modal.perLabLabel')}</label>
              <div className="ps-participationtypes__modal-hint">
                {t('participationTypesSection.modal.perLabHint')}
              </div>
              <div className="ps-type-cap-list">
                {authorityRows.map(({ facility: lab, enabled, pendingRemoval, unsaved, resolved, regulatoryNote }) => {
                  const override = draft.authorityOverrides?.[lab.id];
                  const justificationId = `ps-ptauth-justification-${lab.id}`;
                  return (
                    <div key={lab.id} className="ps-ptauth-lab" data-testid={`ptauth-lab-${lab.id}`}>
                      <div className="ps-ptauth-lab__head">
                        <span className="ps-sub-check-label">{lab.name}</span>
                        {lab.jurisdiction && <span className="ps-ptauth-lab__jurisdiction">{jurisdictionName(lab.jurisdiction)}</span>}
                      </div>

                      <div className="ps-ptauth-rules">
                        {AUTHORITY_FLAGS.map(flag => {
                          const r = resolved[flag];
                          return (
                            <div key={flag} className="ps-ptauth-rule">
                              {enabled ? (
                                <label className="ps-ptauth-rule__label">
                                  <input
                                    type="checkbox"
                                    checked={!!override?.[flag]}
                                    onChange={e => setLabOverrideFlag(lab.id, flag, e.target.checked)}
                                  />
                                  {t(FLAG_LABEL_KEYS[flag])}
                                </label>
                              ) : (
                                <span className="ps-ptauth-rule__label">
                                  {t('participationTypesSection.modal.authority.ruleWithValue', {
                                    flag: t(FLAG_LABEL_KEYS[flag]),
                                    value: r.value ? t('participationTypesSection.modal.authority.ruleYes') : t('participationTypesSection.modal.authority.ruleNo'),
                                  })}
                                </span>
                              )}
                              <span className={`ps-ptauth-source ps-ptauth-source--${r.source}`}>{sourceText(r, unsaved)}</span>
                            </div>
                          );
                        })}
                      </div>

                      {regulatoryNote && (
                        <div className="ps-ptauth-note">
                          {t('participationTypesSection.modal.authority.regulatoryBasis', { note: regulatoryNote })}
                        </div>
                      )}

                      {(enabled || pendingRemoval) && (
                        <div className="ps-ptauth-justification">
                          {pendingRemoval && (
                            <div className="ps-ptauth-pending-removal">{t('participationTypesSection.modal.authority.pendingRemoval')}</div>
                          )}
                          <label className="ps-sub-label" htmlFor={justificationId}>{t('participationTypesSection.modal.authority.justificationLabel')}</label>
                          <textarea
                            id={justificationId}
                            className="ps-sub-input ps-ptauth-justification__input"
                            rows={2}
                            value={justifications[lab.id] ?? ''}
                            placeholder={t('participationTypesSection.modal.authority.justificationPlaceholder')}
                            onChange={e => setJustifications(j => ({ ...j, [lab.id]: e.target.value }))}
                          />
                        </div>
                      )}

                      <div className="ps-ptauth-actions">
                        {enabled ? (
                          <button type="button" className="fm-btn-cancel ps-ptauth-btn" onClick={() => setLabOverrideEnabled(lab, false)}>
                            {t('participationTypesSection.modal.authority.revertButton')}
                          </button>
                        ) : (
                          <button type="button" className="fm-btn-apply ps-ptauth-btn" onClick={() => setLabOverrideEnabled(lab, true)}>
                            {pendingRemoval ? t('participationTypesSection.modal.authority.keepButton') : t('participationTypesSection.modal.authority.overrideButton')}
                          </button>
                        )}
                      </div>
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
