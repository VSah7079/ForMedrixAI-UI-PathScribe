/**
 * components/Config/System/GoverningBodiesSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Super-admin only. Configure which governing bodies are active in the
 * Synoptic Library and nightly sync.
 *
 * Standard bodies (CAP, RCPath, ICCR, RCPA, CAP-ACP, EU, KR): toggle,
 * plus retention-figure editing. Custom bodies: full CRUD with ID
 * conflict guard.
 *
 * Real, architectural fix, per direct follow-up: "if CAP or RCPath or
 * some other governmental agency changes their rule, then we need to
 * actually release software in order to stay compliant." This is now
 * the real, one place a super-admin updates a real, published
 * retention figure without a code release — see
 * services/governingBodies/IGoverningBodyService.ts's own header for
 * the full architecture this closes.
 *
 * Real fix, found via direct audit: this file previously re-declared
 * its own, separate GoverningBody interface and its own, separate
 * DEFAULT_BODIES seed array — a real, second copy of both that could
 * silently drift from services/governingBodies/'s own real ones.
 * Both now imported directly instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { governingBodyService, authorizationService } from '@/services';
import { saveGoverningBodies } from '@/services/governingBodies/governingBodyAdministration';
import { useCapabilities } from '@/hooks/useCapabilities';
import type { GoverningBody, RetentionPolicyVersion } from '@/services/governingBodies/IGoverningBodyService';
import type { RetainableMaterialType } from '@/services/retentionPolicy/RetentionPolicy';
import { MATERIAL_TYPE_LABEL, formatRetentionPeriod } from '@/services/retentionPolicy/RetentionPolicy';
import type { Jurisdiction } from '@/types/systemConfig';
import { JURISDICTION_LABELS } from '@/types/systemConfig';

// MATERIAL_TYPE_LABEL (RetentionPolicy.ts) and JURISDICTION_LABELS
// (types/systemConfig.ts) are both shared constants also consumed by
// several other, not-yet-converted files (SpecimenCategoriesSection,
// DepartmentsSection, DisposalQueuePage, PendingBatchQueuePage for the
// former; CytologyQcRulesSection, EnterpriseRollupTab,
// InspectionModeTab, FacilityTable/FacilityEditorModal, AccessionPage
// for the latter) —
// left untouched here, same as BILLING_TYPE_LABEL was left untouched
// in batch 62's BillingDictionarySection pass. Converting either is a
// separate, cross-cutting future initiative, not this file's own scope.

const ALL_JURISDICTIONS = Object.keys(JURISDICTION_LABELS) as Jurisdiction[];
const ALL_MATERIAL_TYPES: RetainableMaterialType[] = ['block', 'slide', 'wet_tissue'];

// ── Toggle ────────────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  checked:   boolean;
  onChange:  (v: boolean) => void;
  disabled?: boolean;
  color?:    string;
}> = ({ checked, onChange, disabled = false, color = '#0891B2' }) => {
  // Only two colors are ever actually passed in this file (the
  // default cyan and BodyRow's sync-toggle purple), so these map to
  // two small, scoped modifier classes rather than a genuinely
  // arbitrary inline color.
  const colorClass = color === '#a78bfa' ? 'ps-gov-toggle--purple' : 'ps-gov-toggle--cyan';
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={`ps-toggle-track ${colorClass}${checked ? ' on' : ' off'}${disabled ? ' disabled' : ''}`}
    >
      <div className="ps-toggle-thumb" />
    </div>
  );
};

// ── Body Modal (label/fullName/region/website — custom bodies only) ───────────

const BodyModal: React.FC<{
  initial?:    GoverningBody;
  existingIds: string[];
  onClose:     () => void;
  onSave:      (body: GoverningBody) => void;
}> = ({ initial, existingIds, onClose, onSave }) => {
  const { t } = useTranslation();
  const isEdit = !!initial;

  const [label,    setLabel]    = useState(initial?.label    ?? '');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [region,   setRegion]   = useState(initial?.region   ?? '');
  const [website,  setWebsite]  = useState(initial?.website  ?? '');

  // PS-73/75 dictionary-rollout note (deliberate no-op here, not an
  // oversight): custom governing bodies already have real uniqueness —
  // derivedId below IS the uniqueness key, and idConflict already
  // blocks a colliding one on create. No separate PS-73 name-uniqueness
  // check is needed on top of that. PS-75 (performing-lab scoping)
  // doesn't apply to this dictionary either — a governing body's real
  // axis of variation is `jurisdictions` (a body applies to specific
  // jurisdictions, not specific performing labs), which this record
  // already has. Adding performingLabFacilityId here would be a
  // redundant, conceptually wrong second axis for the same thing
  // `jurisdictions` already models correctly.
  const derivedId  = label.trim().toUpperCase().replace(/\s+/g, '_');
  const idConflict = !isEdit && existingIds.includes(derivedId);
  const canSubmit  = !!(label.trim() && fullName.trim() && !idConflict);

  const handleSave = () => {
    if (!canSubmit) return;
    onSave({
      id:          isEdit ? initial!.id : derivedId,
      label:       label.trim().toUpperCase(),
      fullName:    fullName.trim(),
      region:      region.trim(),
      website:     website.trim(),
      enabled:     initial?.enabled     ?? true,
      syncEnabled: initial?.syncEnabled ?? false,
      isCustom:    true,
      jurisdictions:            initial?.jurisdictions,
      retentionPolicyVersions:  initial?.retentionPolicyVersions,
    });
    onClose();
  };

  return (
    <div className="ps-conf-backdrop">
      <div className="fm-modal fm-modal--config ps-govmodal--add" onClick={e => e.stopPropagation()}>

        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">{t('governingBodiesSection.bodyModal.eyebrow')}</div>
            <h2 className="fm-title ps-govmodal-title--sm">
              {isEdit ? t('governingBodiesSection.bodyModal.editHeader', { label: initial!.label }) : t('governingBodiesSection.bodyModal.addHeader')}
            </h2>
          </div>
          <button onClick={onClose} className="fm-btn-cancel ps-govmodal-btn-close">✕</button>
        </div>
        <div className="ps-client-editor-body">

          <div className="ps-body-modal-field">
            <label className="ps-body-modal-label">
              {t('governingBodiesSection.bodyModal.abbreviationLabel')} <span className="ps-body-modal-label-req">*</span>
              {isEdit && <span className="ps-body-modal-label-note">{t('governingBodiesSection.bodyModal.cannotBeChangedNote')}</span>}
            </label>
            <input
              value={label}
              onChange={e => !isEdit && setLabel(e.target.value)}
              disabled={isEdit}
              placeholder={t('governingBodiesSection.bodyModal.abbreviationPlaceholder')}
              className={[
                'ps-body-modal-input',
                'ps-body-modal-input--mono',
                isEdit     ? 'ps-body-modal-input--disabled' : '',
                idConflict ? 'ps-body-modal-input--error'    : '',
              ].filter(Boolean).join(' ')}
            />
            {idConflict && (
              <div className="ps-body-modal-error">
                <Trans i18nKey="governingBodiesSection.bodyModal.idConflictError" values={{ id: derivedId }} components={{ strong: <strong /> }} />
              </div>
            )}
          </div>

          <div className="ps-body-modal-field">
            <label className="ps-body-modal-label">
              {t('governingBodiesSection.bodyModal.fullNameLabel')} <span className="ps-body-modal-label-req">*</span>
            </label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder={t('governingBodiesSection.bodyModal.fullNamePlaceholder')}
              className="ps-body-modal-input"
            />
          </div>

          <div className="ps-body-modal-field-row">
            <div className="ps-body-modal-field">
              <label className="ps-body-modal-label">{t('governingBodiesSection.bodyModal.regionLabel')}</label>
              <input
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder={t('governingBodiesSection.bodyModal.regionPlaceholder')}
                className="ps-body-modal-input"
              />
            </div>
            <div className="ps-body-modal-field">
              <label className="ps-body-modal-label">{t('governingBodiesSection.bodyModal.websiteLabel')}</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder={t('governingBodiesSection.bodyModal.websitePlaceholder')}
                className="ps-body-modal-input"
              />
            </div>
          </div>

          {!isEdit && (
            <div className="ps-body-modal-note">
              <span className="ps-body-modal-note-label">ℹ️ {t('governingBodiesSection.bodyModal.noteLabel')}</span>
              {t('governingBodiesSection.bodyModal.noteBody')}
            </div>
          )}

          <div className="fm-footer">
            <span className="fm-footer-status" />
            <div className="ps-sub-footer-actions">
              <button onClick={onClose} className="fm-btn-cancel">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={!canSubmit} className="fm-btn-apply">
                {isEdit ? t('governingBodiesSection.saveChangesBtn') : t('governingBodiesSection.bodyModal.addHeader')}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Retention Modal (retentionPolicyVersions + jurisdictions — any body) ──────
// Real, architectural fix, per direct follow-up: "it depends entirely
// on whether the regulation lengthens or shortens the retention
// period... statutory grandfathering clauses." This modal never edits
// an existing version in place — it shows the real, immutable version
// history and only ever adds a new one, with an explicit, required
// choice of whether that new version is retroactive
// (applyToExistingInventory). Defaults to prospective/grandfathered
// (unchecked) — a super-admin publishing a shorter figure must
// explicitly opt into retroactive application, never get it from an
// unchecked default.

const VersionRow: React.FC<{ v: RetentionPolicyVersion }> = ({ v }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-gov-version-row">
      <div className="ps-gov-version-row-head">
        <span className="ps-gov-version-label">{t('governingBodiesSection.versionRow.header', { version: v.version, date: v.effectiveDate })}</span>
        <span className={`ps-gov-version-badge ${v.applyToExistingInventory ? 'ps-gov-version-badge--retroactive' : 'ps-gov-version-badge--prospective'}`}>
          {v.applyToExistingInventory ? t('governingBodiesSection.versionRow.retroactiveBadge') : t('governingBodiesSection.versionRow.prospectiveBadge')}
        </span>
      </div>
      <div className="ps-gov-version-figures">
        {t('governingBodiesSection.figuresLine', { block: formatRetentionPeriod(v.block), slide: formatRetentionPeriod(v.slide), wet: formatRetentionPeriod(v.wet_tissue) })}
      </div>
      <div className="ps-gov-version-source">{v.sourceNote}</div>
    </div>
  );
};

const RetentionModal: React.FC<{
  body:    GoverningBody;
  onClose: () => void;
  onSave:  (patch: Partial<GoverningBody>) => void;
}> = ({ body, onClose, onSave }) => {
  const { t } = useTranslation();
  const existingVersions = (body.retentionPolicyVersions ?? []).slice().sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>(body.jurisdictions ?? []);
  const [showAddVersion, setShowAddVersion] = useState(existingVersions.length === 0);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState<Record<RetainableMaterialType, string>>({ block: '', slide: '', wet_tissue: '' });
  const [sourceNote, setSourceNote] = useState('');
  const [applyToExisting, setApplyToExisting] = useState(false);

  const toggleJurisdiction = (j: Jurisdiction) => {
    setJurisdictions(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]);
  };

  // Real, deliberate requirement — a real version without a real
  // sourceNote would be exactly the "bare number, no citation" gap
  // this whole app's own established practice exists to avoid (see
  // RetentionPolicy.ts's own header). All three material-type figures
  // required too — a partial version silently falling through to
  // "undefined" for one material type is a real, easy-to-miss mistake
  // for a super-admin to make under time pressure.
  // Renamed callback params from the original `t` to `mt` (material
  // type) — this component also has a real useTranslation() `t` in
  // scope, and the original `t => [t, ...]` shadowed it within these
  // two callbacks (harmless today since neither callback body called
  // the real `t()`, but the same shadowing pattern flagged and fixed
  // in DemoResetTab.tsx's own i18n pass — same fix here, pre-emptively).
  const parsedDays = Object.fromEntries(ALL_MATERIAL_TYPES.map(mt => [mt, parseInt(days[mt], 10)])) as Record<RetainableMaterialType, number>;
  const allDaysValid = ALL_MATERIAL_TYPES.every(mt => Number.isFinite(parsedDays[mt]) && parsedDays[mt] > 0);
  const canSubmit = allDaysValid && sourceNote.trim().length > 0 && !!effectiveDate;

  const handleSaveJurisdictions = () => {
    onSave({ jurisdictions: jurisdictions.length > 0 ? jurisdictions : undefined });
  };

  const handleAddVersion = () => {
    if (!canSubmit) return;
    const nextVersionNumber = existingVersions.length + 1;
    const newVersion: RetentionPolicyVersion = {
      version: `v${nextVersionNumber}`,
      effectiveDate,
      ...parsedDays,
      sourceNote: sourceNote.trim(),
      applyToExistingInventory: applyToExisting,
      createdAt: new Date().toISOString(),
      createdBy: 'super-admin',
    };
    onSave({
      jurisdictions: jurisdictions.length > 0 ? jurisdictions : undefined,
      retentionPolicyVersions: [...(body.retentionPolicyVersions ?? []), newVersion],
    });
    onClose();
  };

  const handleClearAll = () => {
    onSave({ retentionPolicyVersions: undefined });
    onClose();
  };

  return (
    <div className="ps-conf-backdrop">
      <div className="fm-modal fm-modal--config ps-govmodal--retention" onClick={e => e.stopPropagation()}>

        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">{t('governingBodiesSection.retentionModal.eyebrow')}</div>
            <h2 className="fm-title ps-govmodal-title--sm">{t('governingBodiesSection.retentionModal.title', { label: body.label })}</h2>
          </div>
          <button onClick={onClose} className="fm-btn-cancel ps-govmodal-btn-close">✕</button>
        </div>
        <div className="ps-client-editor-body">

          <div className="ps-body-modal-field">
            <label className="ps-body-modal-label">{t('governingBodiesSection.retentionModal.jurisdictionsLabel')}</label>
            <div className="ps-gov-jur-row">
              {ALL_JURISDICTIONS.map(j => (
                <button
                  key={j} type="button" onClick={() => { toggleJurisdiction(j); }}
                  className={`ps-gov-jur-chip${jurisdictions.includes(j) ? ' ps-gov-jur-chip--active' : ''}`}
                >
                  {JURISDICTION_LABELS[j]}
                </button>
              ))}
            </div>
            <div className="ps-gov-jur-footer">
              <div className="ps-gov-jur-hint">
                {t('governingBodiesSection.retentionModal.jurisdictionsHint')}
              </div>
              <button onClick={handleSaveJurisdictions} className="ps-btn-ghost-dark ps-gov-jur-save-btn">{t('governingBodiesSection.retentionModal.saveJurisdictionsBtn')}</button>
            </div>
          </div>

          <div className="ps-gov-version-heading">
            {t('governingBodiesSection.retentionModal.versionHistoryHeading', { count: existingVersions.length })}
          </div>
          {existingVersions.length === 0 && (
            <div className="ps-gov-version-empty">{t('governingBodiesSection.retentionModal.noVersionsYet')}</div>
          )}
          {existingVersions.map(v => <VersionRow key={v.version} v={v} />)}

          {!showAddVersion ? (
            <button onClick={() => setShowAddVersion(true)} className="ps-section-add-btn ps-gov-add-version-btn">+ {t('governingBodiesSection.retentionModal.addVersionBtn')}</button>
          ) : (
            <div className="ps-gov-newversion-box">
              <div className="ps-gov-newversion-heading">
                {t('governingBodiesSection.retentionModal.newVersionHeading', { version: body.retentionPolicyVersions?.length ? `v${body.retentionPolicyVersions.length + 1}` : 'v1' })}
              </div>

              <div className="ps-body-modal-field-row">
                <div className="ps-body-modal-field">
                  <label className="ps-body-modal-label">{t('governingBodiesSection.retentionModal.effectiveDateLabel')}</label>
                  <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="ps-body-modal-input ps-body-modal-input--mono" />
                </div>
              </div>

              <div className="ps-body-modal-field-row">
                {ALL_MATERIAL_TYPES.map(mt => (
                  <div className="ps-body-modal-field" key={mt}>
                    <label className="ps-body-modal-label">{MATERIAL_TYPE_LABEL[mt]} {t('governingBodiesSection.retentionModal.daysUnit')}</label>
                    <input
                      value={days[mt]}
                      onChange={e => setDays(prev => ({ ...prev, [mt]: e.target.value }))}
                      placeholder={t('governingBodiesSection.retentionModal.daysPlaceholder')}
                      className="ps-body-modal-input ps-body-modal-input--mono"
                    />
                    {days[mt] && Number.isFinite(parseInt(days[mt], 10)) && parseInt(days[mt], 10) > 0 && (
                      <div className="ps-gov-hint-sm">{t('governingBodiesSection.retentionModal.approxHint', { period: formatRetentionPeriod(parseInt(days[mt], 10)) })}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="ps-body-modal-field">
                <label className="ps-body-modal-label">
                  {t('governingBodiesSection.retentionModal.sourceLabel')} <span className="ps-body-modal-label-req">*</span>
                </label>
                <textarea
                  value={sourceNote}
                  onChange={e => setSourceNote(e.target.value)}
                  placeholder={t('governingBodiesSection.retentionModal.sourcePlaceholder')}
                  className="ps-body-modal-input"
                  rows={3}
                />
              </div>

              <label className="ps-gov-checkbox-row">
                <input type="checkbox" checked={applyToExisting} onChange={e => setApplyToExisting(e.target.checked)} className="ps-gov-checkbox-input" />
                <span className="ps-gov-checkbox-label">
                  {t('governingBodiesSection.retentionModal.retroactiveLabel')}
                  <div className="ps-gov-hint-sm">
                    {t('governingBodiesSection.retentionModal.retroactiveHint')}
                  </div>
                </span>
              </label>

              <div className="ps-gov-newversion-actions">
                <button onClick={() => setShowAddVersion(false)} className="fm-btn-cancel">{t('common.cancel')}</button>
                <button onClick={handleAddVersion} disabled={!canSubmit} className="fm-btn-apply">{t('governingBodiesSection.retentionModal.publishBtn')}</button>
              </div>
            </div>
          )}

          <div className="fm-footer ps-gov-fm-footer--mt">
            {existingVersions.length > 0 && (
              <button onClick={handleClearAll} className="fm-btn-cancel ps-gov-danger-text">{t('governingBodiesSection.retentionModal.clearHistoryBtn')}</button>
            )}
            {existingVersions.length === 0 && <span className="fm-footer-status" />}
            <button onClick={onClose} className="fm-btn-cancel">{t('common.close')}</button>
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Body Row ──────────────────────────────────────────────────────────────────

const BodyRow: React.FC<{
  body:         GoverningBody;
  isSuperAdmin: boolean;
  onUpdate:     (patch: Partial<GoverningBody>) => void;
  canRemove:    boolean;
  onEdit?:      () => void;
  onRemove?:    () => void;
  onEditRetention: () => void;
}> = ({ body, isSuperAdmin, onUpdate, canRemove, onEdit, onRemove, onEditRetention }) => {
  const { t } = useTranslation();
  return (
    <div className={`ps-gov-row${body.enabled ? '' : ' ps-gov-row--disabled'}`}>

      <div>
        <div className="ps-gov-row-name">
          {body.label}
          {body.isCustom && <span className="ps-gov-custom-badge ps-gov-custom-badge--ml">{t('governingBodiesSection.bodyRow.customBadge')}</span>}
        </div>
        <div className="ps-gov-row-fullname">
          {body.fullName}
          {body.website && (
            <a href={body.website} target="_blank" rel="noreferrer" className="ps-gov-row-link">↗</a>
          )}
        </div>
        {(() => {
          const versions = body.retentionPolicyVersions ?? [];
          const current = versions
            .filter(v => new Date(v.effectiveDate) <= new Date())
            .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
          if (!current) {
            return <div className="ps-gov-hint-xs">{t('governingBodiesSection.noRetentionFigures')}</div>;
          }
          return (
            <div className="ps-gov-hint-xs">
              {t('governingBodiesSection.figuresLine', { block: formatRetentionPeriod(current.block), slide: formatRetentionPeriod(current.slide), wet: formatRetentionPeriod(current.wet_tissue) })}
              {versions.length > 1 ? ` · ${t('governingBodiesSection.versionsOnFile', { count: versions.length })}` : ''}
              {body.jurisdictions?.length ? ` · ${body.jurisdictions.join(', ')}` : ` · ${t('governingBodiesSection.notLinkedToJurisdiction')}`}
            </div>
          );
        })()}
      </div>

      <div className="ps-gov-row-region">{body.region}</div>

      <Toggle
        checked={body.enabled}
        onChange={v => onUpdate({ enabled: v, syncEnabled: v ? body.syncEnabled : false })}
        disabled={!isSuperAdmin}
      />

      <Toggle
        checked={body.syncEnabled}
        onChange={v => onUpdate({ syncEnabled: v })}
        disabled={!isSuperAdmin || !body.enabled}
        color="#a78bfa"
      />

      <div className="ps-gov-row-actions">
        {isSuperAdmin && (
          <button className="ps-btn-ghost-dark ps-gov-row-action-btn" onClick={onEditRetention}>
            🕐 {t('governingBodiesSection.bodyRow.retentionBtn')}
          </button>
        )}
        {canRemove && onEdit && (
          <button className="ps-btn-ghost-dark ps-gov-row-action-btn" onClick={onEdit}>
            {t('common.edit')}
          </button>
        )}
        {canRemove && onRemove && (
          <button className="ps-gov-remove-btn" onClick={onRemove} title={t('governingBodiesSection.bodyRow.removeTitle')}>✕</button>
        )}
      </div>

    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

// Batch 371: editing is for ForMedrixAI platform support only
// (platform:governing-bodies:manage, held only by Superadmin). Everyone
// else sees the settings read-only; the save service checks again.
const GoverningBodiesSection: React.FC = () => {
  const { t } = useTranslation();
  const isSuperAdmin = useCapabilities().has('platform:governing-bodies:manage');
  const [bodies,     setBodies]     = useState<GoverningBody[]>([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editTarget, setEditTarget] = useState<GoverningBody | null>(null);
  const [retentionTarget, setRetentionTarget] = useState<GoverningBody | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);

  // Real load — the empty array above is only the pre-load fallback
  // so the list isn't empty for one render (was previously its own,
  // separate, duplicated DEFAULT_BODIES constant — see this file's
  // own header for why that's gone now).
  useEffect(() => {
    governingBodyService.getAll().then(setBodies).catch(() => {});
  }, []);

  const updateBody = (id: string, patch: Partial<GoverningBody>) => { setBodies(p => p.map(b => b.id === id ? { ...b, ...patch } : b)); setHasChanges(true); };
  const removeBody = (id: string)                                  => { setBodies(p => p.filter(b => b.id !== id));                       setHasChanges(true); };
  const handleAdd  = (body: GoverningBody)                         => { setBodies(p => [...p, body]);                                      setHasChanges(true); };
  const handleEdit = (body: GoverningBody)                         => { setBodies(p => p.map(b => b.id === body.id ? body : b));           setHasChanges(true); };
  // Real fix, found via a direct audit: this used to be
  // `/* TODO: persist */ setHasChanges(false);` — every toggle, edit,
  // add, and remove only ever touched in-memory React state, and this
  // handler cleared the "unsaved changes" indicator as if a save had
  // genuinely happened. A page refresh silently discarded everything.
  // Now actually calls the real service, and — importantly — only
  // clears hasChanges and the error state on a CONFIRMED successful
  // save, surfacing a real failure instead of hiding it the same way
  // the old version hid the fact that nothing was ever saved at all.
  const handleSave = async () => {
    setSaveError(null);
    try {
      const res = await saveGoverningBodies(bodies, { authorization: authorizationService, service: governingBodyService });
      if (res.ok === false) { setSaveError(t('governingBodiesSection.superAdminRequired')); return; }
      setHasChanges(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('governingBodiesSection.saveFailedDefault'));
    }
  };

  const standardBodies = bodies.filter(b => !b.isCustom);
  const customBodies   = bodies.filter(b =>  b.isCustom);
  const allIds         = bodies.map(b => b.id);

  return (
    <div className="ps-gov-shell">

      <div className="ps-gov-header">
        <div className="ps-gov-header-text">
          <h3 className="ps-gov-title">{t('governingBodiesSection.title')}</h3>
          <p className="ps-gov-subtitle">
            {t('governingBodiesSection.subtitle')}
            {!isSuperAdmin && <span className="ps-gov-subtitle-warn"> · {t('governingBodiesSection.superAdminRequired')}</span>}
          </p>
        </div>
        <div className="ps-gov-header-actions">
          {hasChanges && <span className="ps-gov-unsaved">● {t('governingBodiesSection.unsavedChanges')}</span>}
          {saveError && <span className="ps-gov-save-error">{saveError}</span>}
          {isSuperAdmin && hasChanges && <button className="ps-conf-btn-primary" onClick={handleSave}>{t('governingBodiesSection.saveChangesBtn')}</button>}
          {isSuperAdmin && <button className="ps-section-add-btn" onClick={() => setShowAdd(true)}>+ {t('governingBodiesSection.addCustomBodyBtn')}</button>}
        </div>
      </div>

      <div className="ps-gov-callout">
        <span className="ps-gov-callout-icon">🔬</span>
        <div>
          <div className="ps-gov-callout-title">{t('governingBodiesSection.callout.title')}</div>
          <div className="ps-gov-callout-body">
            {t('governingBodiesSection.callout.body')}
          </div>
        </div>
      </div>

      <div className="ps-gov-col-headers">
        {[
          t('governingBodiesSection.columnHeaders.governingBody'),
          t('governingBodiesSection.columnHeaders.region'),
          t('common.active'),
          t('governingBodiesSection.columnHeaders.autoSync'),
          '',
        ].map((h, i) => (
          <div key={i} className="ps-gov-col-header">{h}</div>
        ))}
      </div>

      {standardBodies.map(body => (
        <BodyRow key={body.id} body={body} isSuperAdmin={isSuperAdmin}
          onUpdate={patch => updateBody(body.id, patch)} canRemove={false}
          onEditRetention={() => setRetentionTarget(body)} />
      ))}

      {customBodies.length > 0 && (
        <>
          <div className="ps-gov-divider-row">
            <span className="ps-gov-divider-label">{t('governingBodiesSection.customLabel')}</span>
            <div className="ps-gov-divider-line" />
          </div>
          <p className="ps-gov-custom-note">
            {t('governingBodiesSection.customNote')}
          </p>
          {customBodies.map(body => (
            <BodyRow key={body.id} body={body} isSuperAdmin={isSuperAdmin}
              onUpdate={patch => updateBody(body.id, patch)} canRemove={isSuperAdmin}
              onEdit={() => setEditTarget(body)} onRemove={() => removeBody(body.id)}
              onEditRetention={() => setRetentionTarget(body)} />
          ))}
        </>
      )}

      {showAdd && <BodyModal existingIds={allIds} onClose={() => setShowAdd(false)} onSave={handleAdd} />}
      {editTarget && <BodyModal initial={editTarget} existingIds={allIds} onClose={() => setEditTarget(null)} onSave={handleEdit} />}
      {retentionTarget && (
        <RetentionModal
          body={retentionTarget}
          onClose={() => setRetentionTarget(null)}
          onSave={patch => updateBody(retentionTarget.id, patch)}
        />
      )}

    </div>
  );
};

export default GoverningBodiesSection;
