// src/components/Config/System/TypeModal.tsx
// Rewritten from scratch to avoid OXC/rolldown parse issues.
// Zero template literals in style props. Zero inline hex-alpha strings.
// All styling via CSS classes from pathscribe.css.

import React, { useState } from 'react';
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
    if (!draft.label.trim())        { setError('Label is required');        return; }
    if (!draft.abbreviation.trim()) { setError('Abbreviation is required'); return; }
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
    if (labelCollision) { setError(`A participation type named "${labelCollision.label}" already exists.`); return; }
    const abbrCollision = findDuplicate(existingEntries, { abbreviation: draft.abbreviation.trim() }, ['abbreviation'], excludeId);
    if (abbrCollision) { setError(`Abbreviation "${abbrCollision.abbreviation}" is already used by "${abbrCollision.label}".`); return; }
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
        className="fm-modal fm-modal--config"
        style={{ width: 'min(600px, 96vw)' }}
        onClick={e => e.stopPropagation()}
      >

        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">Configuration · Participation Types</div>
            <h2 className="fm-title" style={{ fontSize: 16 }}>
              {mode === 'add' ? 'Add Participation Type' : 'Edit — ' + (type?.label ?? '')}
              {isBuiltIn && (
                <span className="ps-idf-tier-badge ps-idf-tier-badge--2" style={{ marginLeft: 8 }}>
                  built-in
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="ps-client-editor-body">

          {isBuiltIn && (
            <div className="ps-sub-info-box">
              Built-in types cannot be deleted. You can edit the label, description, and colour.
            </div>
          )}

          {/* Label */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">
              Label <span className="ps-sub-label-req">*</span>
            </label>
            <input
              className="ps-sub-input"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder="e.g. Primary Pathologist"
            />
          </div>

          {/* Abbreviation */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">
              Abbreviation <span className="ps-sub-label-req">*</span>
            </label>
            <input
              className="ps-sub-input"
              value={draft.abbreviation}
              onChange={e => setDraft(d => ({ ...d, abbreviation: e.target.value }))}
              placeholder="e.g. Primary"
              maxLength={12}
            />
          </div>

          {/* Description */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Description</label>
            <input
              className="ps-sub-input"
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              placeholder="Brief description of this participation role"
            />
          </div>

          {/* Colour */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Colour</label>
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
                title="Custom colour"
              />
            </div>
            <div className="ps-type-preview-row">
              <span className="ps-type-preview-chip" style={{ background: draft.color, color: '#0f172a', opacity: 0.85 }}>
                {draft.abbreviation || 'Preview'}
              </span>
            </div>
          </div>

          {/* Capabilities */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Capabilities</label>
            <div className="ps-type-cap-list">
              {cap('canFinalize',           'Can Finalise / Sign Out',   'This role can issue the final signed report.', isBuiltIn && type?.id === 'primary')}
              {cap('requiresCountersign',   'Requires Countersign',      'Reports from this role must be countersigned by an attending.')}
              {cap('canBeAssignedTemplate', 'Can Use Report Template',   'This role can be assigned a report template for structured reporting.')}
              {cap('canViewWholeCase',      'Can View Whole Case',       'Full case access including all specimens and prior reports.')}
              {cap('allowsMultiple',        'Allows Multiple Per Case',  'More than one person can hold this role on the same case simultaneously.')}
            </div>
          </div>

          {/* Per-performing-lab sign-out authority overrides */}
          {labs.length > 0 && (
            <div className="ps-sub-field">
              <label className="ps-sub-label">Per-Performing-Lab Sign-Out Authority (optional)</label>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                Signing authority genuinely varies by jurisdiction (US CLIA/CAP vs. UK RCPath
                delegation vs. other national liability rules). Leave a lab unlisted to use the
                platform defaults above; override only where the local rule actually differs.
              </div>
              <div className="ps-type-cap-list">
                {labs.map(lab => {
                  const enabled = overrideLabIds.includes(lab.id);
                  const ov = draft.authorityOverrides?.[lab.id];
                  return (
                    <div key={lab.id} className="ps-sub-check-row ps-sub-check-row--unchecked" style={{ display: 'block' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={e => setLabOverrideEnabled(lab.id, e.target.checked)}
                          className="ps-type-cap-checkbox"
                        />
                        <span className="ps-sub-check-label">{lab.name}</span>
                      </label>
                      {enabled && (
                        <div style={{ marginTop: 8, marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                            <input type="checkbox" checked={!!ov?.canFinalize}
                              onChange={e => setLabOverrideFlag(lab.id, 'canFinalize', e.target.checked)} />
                            Can Finalise / Sign Out at this lab
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                            <input type="checkbox" checked={!!ov?.requiresCountersign}
                              onChange={e => setLabOverrideFlag(lab.id, 'requiresCountersign', e.target.checked)} />
                            Requires Countersign at this lab
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                            <input type="checkbox" checked={!!ov?.canViewWholeCase}
                              onChange={e => setLabOverrideFlag(lab.id, 'canViewWholeCase', e.target.checked)} />
                            Can View Whole Case at this lab
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
            <label className="ps-sub-label">Status</label>
            <div className="ps-sub-toggle-wrap">
              <div
                onClick={() => setDraft(d => ({ ...d, active: !d.active }))}
                className={draft.active ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
              >
                <div className={draft.active ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
              </div>
              <span className={draft.active ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>
                {draft.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {error && <div className="ps-sub-error">{error}</div>}

        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="fm-btn-cancel">Cancel</button>
            <button onClick={handleSave} className="fm-btn-apply">
              {mode === 'add' ? 'Add Type' : 'Save Changes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TypeModal;

