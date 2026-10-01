// src/components/Config/System/TATConfigSection.tsx
// Full implementation of TAT Configuration.
//
// Data model:
//   TATEntry { id, type, targetHours, urgency, facilityId, specimenId,
//               subspecialtyId, roleId, active, notes }
//
// Uniqueness guard: no two ACTIVE entries share
//   (type + urgency + facilityId + specimenId + subspecialtyId + roleId)
//   roleId added here — was previously absent from both this guard and the
//   specificity scoring below despite being a real, used field (the "Role:
//   Resident" / "Role: Pathologist" scoping visible in the real UI). Without
//   it, two different-role rules sharing every other dimension would
//   incorrectly conflict with each other, and true same-role duplicates
//   could slip through unflagged.
//
// 8-level resolution hierarchy (most-specific-wins):
//   1. facility + specimen + urgency (+ role)
//   2. facility + specimen
//   3. facility + subspecialty + urgency (+ role)
//   4. facility + subspecialty
//   5. facility only (+ role/urgency modifiers)
//   6. specimen only
//   7. role only (no institutional/anatomic scope, e.g. training-program-
//      wide "Resident" targets)
//   8. system default (no dimensions)
//
// i18n sweep (batch 59): every on-screen label, placeholder, button,
// table/filter/simulator string, and validation message now goes through
// a new `tatConfigSection` namespace. TAT_TYPE_LABELS/TAT_TYPE_DESC became
// TAT_TYPE_LABEL_KEY/TAT_TYPE_DESC_KEY (the same "*_LABEL_KEY resolves to
// an i18n key" pattern used elsewhere in this sweep), and the 4 fixed Role
// values (Resident/Fellow/Pathologist/External) got their own ROLE_LABEL_KEY/
// ROLE_GROUP_LABEL_KEY maps - the stored roleId/type values themselves are
// unchanged. getTatTypeLabel/getTatTypeDescription/formatHours are plain
// functions used outside component scope, so `t` is now threaded through
// as an explicit parameter rather than called via a hook. Real data stays
// untranslated: every resolved facility/lab/specimen/subspecialty NAME
// (facilityName/labName/specimenName/subName), real QA Activity Type names
// and admin-authored descriptions, and free-text admin notes are shown
// exactly as stored. The live "Applies to ..." resolution-preview sentence
// is built by joining several independently-translated fragments in a
// fixed English clause order - fully localizing that word order would need
// a larger content redesign and is out of scope for this pass; flagged in
// the README as a known limitation. Loop variables that previously shadowed
// the new `t` translation function (`TAT_TYPES.map(t => ...)`,
// `qaActivityTypes.map(t => ...)`, etc.) were renamed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { subspecialtyService, qaActivityTypeService, facilityService, tatTargetService } from '../../../services';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import { useSpecimenDictionary } from './useSpecimenDictionary';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import { specificityScore, resolveTatEntry } from '@/services/tatConfig/tatTargetResolution';
import '../../../pathscribe.css';
import { useAuditLog } from '../../Audit/useAuditLog';


// ── Types ─────────────────────────────────────────────────────────────────────
// Defined in types/quality/TatConfigEntry.ts (Batch 317); re-exported so
// existing imports from this file keep working.
export type { TATType, TATUrgency, TATEntry } from '@/types/quality/TatConfigEntry';
import type { TATType, TATUrgency, TATEntry } from '@/types/quality/TatConfigEntry';
import { buildTatEntry } from '@/services/tatConfig/tatConfigRules';
import { isSystemDefaultTatEntryId } from '@/services/tatConfig/systemDefaultTatEntries';
import { duplicateTatEntry } from '@/services/duplication/duplicateEntities';

const TAT_TYPES: TATType[] = [
  'FIRST_TOUCH', 'TOTAL_CASE', 'FROZEN_SECTION',
  'COLD_ISCHEMIA', 'GROSSING', 'SIGN_OUT',
  'CONSULTATION_RESPONSE', 'CONSULTATION_AWAITING',
];

const TAT_TYPE_LABEL_KEY: Record<TATType, string> = {
  FIRST_TOUCH:              'tatConfigSection.types.firstTouch.label',
  TOTAL_CASE:               'tatConfigSection.types.totalCase.label',
  FROZEN_SECTION:           'tatConfigSection.types.frozenSection.label',
  COLD_ISCHEMIA:            'tatConfigSection.types.coldIschemia.label',
  GROSSING:                 'tatConfigSection.types.grossing.label',
  SIGN_OUT:                 'tatConfigSection.types.signOut.label',
  CONSULTATION_RESPONSE:    'tatConfigSection.types.consultationResponse.label',
  CONSULTATION_AWAITING:    'tatConfigSection.types.consultationAwaiting.label',
};

const TAT_TYPE_DESC_KEY: Record<TATType, string> = {
  FIRST_TOUCH:              'tatConfigSection.types.firstTouch.desc',
  TOTAL_CASE:               'tatConfigSection.types.totalCase.desc',
  FROZEN_SECTION:           'tatConfigSection.types.frozenSection.desc',
  COLD_ISCHEMIA:            'tatConfigSection.types.coldIschemia.desc',
  GROSSING:                 'tatConfigSection.types.grossing.desc',
  SIGN_OUT:                 'tatConfigSection.types.signOut.desc',
  CONSULTATION_RESPONSE:    'tatConfigSection.types.consultationResponse.desc',
  CONSULTATION_AWAITING:    'tatConfigSection.types.consultationAwaiting.desc',
};

// Fixed Role values offered by this screen's own Role filter/selector —
// the stored roleId keeps these exact values; only the displayed label is
// translated.
const ROLE_LABEL_KEY: Record<string, string> = {
  Resident:    'tatConfigSection.roles.resident',
  Fellow:      'tatConfigSection.roles.fellow',
  Pathologist: 'tatConfigSection.roles.pathologist',
  External:    'tatConfigSection.roles.externalReviewer',
};

const ROLE_GROUP_LABEL_KEY: Record<string, string> = {
  Resident:    'tatConfigSection.roleGroups.residents',
  Fellow:      'tatConfigSection.roleGroups.fellows',
  Pathologist: 'tatConfigSection.roleGroups.pathologists',
  External:    'tatConfigSection.roleGroups.externalReviewers',
};

function roleLabel(roleId: string | null | undefined, t: TFunction): string | null {
  if (!roleId) return null;
  const key = ROLE_LABEL_KEY[roleId];
  return key ? t(key) : roleId;
}

function roleGroupLabel(roleId: string | null | undefined, t: TFunction): string | null {
  if (!roleId) return null;
  const key = ROLE_GROUP_LABEL_KEY[roleId];
  return key ? t(key) : roleId;
}

function urgencyLabel(urgency: TATUrgency | null | undefined, t: TFunction): string {
  if (urgency === 'STAT') return t('tatConfigSection.urgencyStat');
  if (urgency === 'ROUTINE') return t('tatConfigSection.urgencyRoutine');
  return t('tatConfigSection.anyUrgency');
}

/** Real, per direct guidance (PS-116): whether a fixed clinical-
 *  workflow TATType value is what's actually stored — a type guard,
 *  not a cast, since a widened TATEntry.type is now free-form. */
function isFixedTatType(type: string): type is TATType {
  return (TAT_TYPES as string[]).includes(type);
}

/** Real, per direct guidance (PS-116): resolves a TATEntry.type value
 *  to a real display label regardless of whether it's a fixed
 *  clinical-workflow type or a real QA Activity Type id — the whole
 *  point of pointing this screen at the real registry instead of a
 *  hardcoded union is that a Custom activity (created via Duplicate,
 *  PS-115, with no code change) needs to show its own real name here
 *  too, not just the 8 original values. Falls back to the raw id only
 *  if the QA activity itself was since deleted/deactivated and is no
 *  longer in the passed-in list — a real, honest "can't resolve this"
 *  case, not silently hidden. */
function getTatTypeLabel(type: string, qaActivityTypesById: Map<string, { name: string; description?: string }>, t: TFunction): string {
  if (isFixedTatType(type)) return t(TAT_TYPE_LABEL_KEY[type]);
  return qaActivityTypesById.get(type)?.name ?? type;
}

function getTatTypeDescription(type: string, qaActivityTypesById: Map<string, { name: string; description?: string }>, t: TFunction): string | undefined {
  if (isFixedTatType(type)) return t(TAT_TYPE_DESC_KEY[type]);
  const qaType = qaActivityTypesById.get(type);
  return qaType?.description ? t('tatConfigSection.qaActivityDescPrefix', { description: qaType.description }) : undefined;
}

// ── Storage ───────────────────────────────────────────────────────────────────
// Batch 353: the targets (and the built-in defaults) are owned by
// tatTargetService (services/tatConfig/); this screen no longer keeps them
// in browser storage.

// ── Uniqueness guard ──────────────────────────────────────────────────────────
// findTatConflict / buildTatEntry live in services/tatConfig/tatConfigRules.ts.

// ── Hours formatter ───────────────────────────────────────────────────────────

function formatHours(h: number, t: TFunction): string {
  if (h < 1) return t('tatConfigSection.minutesShort', { m: Math.round(h * 60) });
  return t('tatConfigSection.hoursShort', { h });
}

// ── Blank draft ───────────────────────────────────────────────────────────────

function blankDraft(): Partial<TATEntry> {
  return {
    type: 'FIRST_TOUCH',
    targetHours: 4,
    urgency: 'ROUTINE',
    facilityId: null,
    performingLabFacilityId: null,
    specimenId: null,
    subspecialtyId: null,
    active: true,
    notes: '',
  };
}

// ── Specificity score for resolution hierarchy display ────────────────────────
// Real, per direct guidance: reuses qualityCalculations.ts's own,
// single, exported specificityScore() — was a duplicate local copy of
// the same weighting logic, confirmed directly, which is exactly the
// kind of thing that would have silently drifted out of sync the
// moment performingLabFacilityId (a new dimension) was added to only
// one of the two copies. TATEntry's own shape already matches
// TatEntryForResolution structurally, so no adapter is needed.

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

interface ModalProps {
  /** 'add' also covers Duplicate, which passes a pre-filled entry. */
  mode:         'add' | 'edit';
  entry?:       TATEntry;
  entries:      TATEntry[];
  facilities:      { id: string; name: string }[];
  labs:         { id: string; name: string }[];
  specimens:    { id: string; name: string }[];
  subspecialties: { id: string; name: string }[];
  qaActivityTypes: QaActivityType[];
  qaActivityTypesById: Map<string, { name: string; description?: string }>;
  onSave:       (e: TATEntry) => void;
  onClose:      () => void;
}

const TATModal: React.FC<ModalProps> = ({
  mode, entry, entries, facilities, labs, specimens, subspecialties, qaActivityTypes, qaActivityTypesById, onSave, onClose
}) => {
  const { t } = useTranslation();
  const isEdit = mode === 'edit';
  const [draft, setDraft] = useState<Partial<TATEntry>>(
    entry ? { ...entry } : blankDraft()
  );
  const [error, setError] = useState('');

  const set = <K extends keyof TATEntry>(k: K, v: TATEntry[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  // Validation, the scope-conflict check and add-vs-edit (by mode, never by
  // whether an entry was passed in) live in services/tatConfig/tatConfigRules.ts.
  const handleSave = () => {
    const result = buildTatEntry(draft, mode, entry, entries, {
      now: new Date().toISOString(),
      newId: () => 'tat-' + Date.now(),
    });
    if (result.ok === false) {
      if (result.error === 'typeRequired') setError(t('tatConfigSection.modal.errorTypeRequired'));
      else if (result.error === 'hoursRequired') setError(t('tatConfigSection.modal.errorHoursRequired'));
      else if (result.conflict) {
        setError(
          t('tatConfigSection.modal.conflictError', {
            type: getTatTypeLabel(result.conflict.type, qaActivityTypesById, t),
            urgency: urgencyLabel(result.conflict.urgency, t),
          })
        );
      }
      return;
    }
    onSave(result.entry);
  };

  const isSystem = isEdit && !!entry?.id && isSystemDefaultTatEntryId(entry.id);

  return (
    <div className="ps-conf-backdrop">
      <div
        className="fm-modal fm-modal--config ps-tatconfig__modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">{t('tatConfigSection.modal.eyebrow')}</div>
            <h2 className="fm-title ps-participationtypes__modal-title">
              {isEdit ? t('tatConfigSection.modal.titleEdit') : t('tatConfigSection.modal.titleAdd')}
              {isSystem && (
                <span className="ps-idf-tier-badge ps-idf-tier-badge--2 ps-participationtypes__builtin-badge">
                  {t('tatConfigSection.modal.systemBadge')}
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="ps-client-editor-body">

          {isSystem && (
            <div className="ps-sub-info-box">
              {t('tatConfigSection.modal.systemInfo')}
            </div>
          )}

          {/* TAT Type */}
          <div className="ps-sub-field">
            <label className="ps-sub-label" htmlFor="tat-rule-type">{t('tatConfigSection.modal.typeLabel')} <span className="ps-sub-label-req">*</span></label>
            <select
              id="tat-rule-type"
              className="ps-conf-select"
              value={draft.type ?? ''}
              onChange={e => set('type', e.target.value)}
            >
              <optgroup label={t('tatConfigSection.modal.clinicalWorkflowGroup')}>
                {TAT_TYPES.map(tt => (
                  <option key={tt} value={tt}>{t(TAT_TYPE_LABEL_KEY[tt])}</option>
                ))}
              </optgroup>
              {qaActivityTypes.length > 0 && (
                <optgroup label={t('tatConfigSection.modal.qaActivitiesGroup')}>
                  {qaActivityTypes.map(qt => (
                    <option key={qt.id} value={qt.id}>{qt.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {draft.type && (
              <div className="ps-tat-hint-text ps-tat-hint-text--mt4">
                {getTatTypeDescription(draft.type, qaActivityTypesById, t)}
              </div>
            )}
          </div>

          {/* Target Hours + Urgency row */}
          <div className="ps-tat-two-col-row">
            <div className="ps-sub-field">
              <label className="ps-sub-label" htmlFor="tat-rule-target-hours">{t('tatConfigSection.modal.targetHoursLabel')} <span className="ps-sub-label-req">*</span></label>
              <input
                id="tat-rule-target-hours"
                type="number"
                className="ps-sub-input"
                min={0.1}
                step={0.25}
                value={draft.targetHours ?? ''}
                onChange={e => set('targetHours', parseFloat(e.target.value) || 0)}
              />
              {draft.targetHours && draft.targetHours > 0 && (
                <div className="ps-tat-hint-text ps-tat-hint-text--mt4">
                  {t('tatConfigSection.modal.targetHoursEquals', { formatted: formatHours(draft.targetHours, t) })}
                </div>
              )}
            </div>

            <div className="ps-sub-field">
              <label className="ps-sub-label" htmlFor="tat-rule-urgency">{t('tatConfigSection.modal.urgencyLabel')}</label>
              <select
                id="tat-rule-urgency"
                className="ps-conf-select"
                value={draft.urgency ?? ''}
                onChange={e => set('urgency', (e.target.value || null) as TATUrgency | null)}
              >
                <option value="">{t('tatConfigSection.modal.urgencyAnyOption')}</option>
                <option value="ROUTINE">{t('tatConfigSection.modal.urgencyRoutineOption')}</option>
                <option value="STAT">{t('tatConfigSection.modal.urgencyStatOption')}</option>
              </select>
            </div>
          </div>

          {/* Applies To — structured matching filters */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('tatConfigSection.modal.appliesToLabel')}</label>
            <div className="ps-tat-scope-hint">
              <Trans i18nKey="tatConfigSection.modal.appliesToHint" components={{ strong: <strong /> }} />
            </div>
            <div className="ps-diff-list">
              <select
                className="ps-conf-select"
                aria-label={t('tatConfigSection.modal.performingLabAria')}
                value={draft.performingLabFacilityId ?? ''}
                onChange={e => set('performingLabFacilityId', e.target.value || null)}
              >
                <option value="">{t('tatConfigSection.modal.allPerformingLabsOption')}</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label={t('tatConfigSection.modal.orderingFacilityAria')}
                value={draft.facilityId ?? ''}
                onChange={e => set('facilityId', e.target.value || null)}
              >
                <option value="">{t('tatConfigSection.modal.allOrderingFacilitiesOption')}</option>
                {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label={t('tatConfigSection.modal.specimenAria')}
                value={draft.specimenId ?? ''}
                onChange={e => set('specimenId', e.target.value || null)}
              >
                <option value="">{t('tatConfigSection.modal.allSpecimenTypesOption')}</option>
                {specimens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label={t('tatConfigSection.modal.subspecialtyAria')}
                value={draft.subspecialtyId ?? ''}
                onChange={e => set('subspecialtyId', e.target.value || null)}
              >
                <option value="">{t('tatConfigSection.modal.allSubspecialtiesOption')}</option>
                {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label={t('tatConfigSection.modal.roleAria')}
                value={draft.roleId ?? ''}
                onChange={e => set('roleId', e.target.value || null)}
              >
                <option value="">{t('tatConfigSection.modal.allRolesOption')}</option>
                <option value="Resident">{t(ROLE_LABEL_KEY.Resident)}</option>
                <option value="Fellow">{t(ROLE_LABEL_KEY.Fellow)}</option>
                <option value="Pathologist">{t(ROLE_LABEL_KEY.Pathologist)}</option>
                <option value="External">{t(ROLE_LABEL_KEY.External)}</option>
              </select>
            </div>

            {/* Live resolution preview */}
            {(() => {
              const parts: string[] = [];
              const labName      = labs.find(l => l.id === draft.performingLabFacilityId)?.name;
              const facilityName  = facilities.find(cl => cl.id === draft.facilityId)?.name;
              const specimenName = specimens.find(s => s.id === draft.specimenId)?.name;
              const subName     = subspecialties.find(s => s.id === draft.subspecialtyId)?.name;
              const roleName    = roleGroupLabel((draft as any).roleId, t);
              const urgency     = draft.urgency;

              if (urgency)      parts.push(urgency === 'STAT' ? t('tatConfigSection.urgencyStat') : t('tatConfigSection.urgencyRoutine'));
              if (roleName)     parts.push(roleName);
              if (specimenName) parts.push(t('tatConfigSection.modal.previewSpecimen', { name: specimenName }));
              if (subName)      parts.push(t('tatConfigSection.modal.previewSubspecialty', { name: subName }));
              if (labName)      parts.push(t('tatConfigSection.modal.previewPerformedAt', { name: labName }));
              if (facilityName)   parts.push(t('tatConfigSection.modal.previewOrderedBy', { name: facilityName }));

              const preview = parts.length === 0
                ? t('tatConfigSection.modal.previewSystemDefault')
                : t('tatConfigSection.modal.previewAppliesTo', { parts: parts.join(', ') });

              return (
                <div className="ps-tat-scope-preview">
                  <span className="ps-tat-scope-preview__icon">→</span>
                  <span className="ps-tat-scope-preview__text">{preview}</span>
                </div>
              );
            })()}
          </div>

          {/* Admin notes — free text, no effect on matching */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('tatConfigSection.modal.notesLabel')} <span className="ps-sub-label-hint">{t('tatConfigSection.modal.notesHint')}</span></label>
            <input
              className="ps-sub-input"
              value={draft.notes ?? ''}
              placeholder={t('tatConfigSection.modal.notesPlaceholder')}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {/* Active toggle */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">{t('tatConfigSection.modal.statusLabel')}</label>
            <div className="ps-sub-toggle-wrap">
              <div
                onClick={() => set('active', !draft.active)}
                className={draft.active ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
              >
                <div className={draft.active ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
              </div>
              <span className={draft.active ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>
                {draft.active ? t('common.active') : t('common.inactive')}
              </span>
            </div>
          </div>

          {error && <div className="ps-sub-error ps-tat-hint-text--mt4">{error}</div>}

        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div className="ps-rulemodal__footer-actions">
            <button onClick={onClose} className="fm-btn-cancel">{t('common.cancel')}</button>
            <button onClick={handleSave} className="fm-btn-apply">
              {isEdit ? t('tatConfigSection.modal.saveChangesBtn') : t('tatConfigSection.modal.addRuleBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Resolution simulator ──────────────────────────────────────────────────────

interface SimulatorProps {
  entries:        TATEntry[];
  facilities:        { id: string; name: string }[];
  labs:           { id: string; name: string }[];
  specimens:      { id: string; name: string }[];
  subspecialties: { id: string; name: string }[];
  qaActivityTypes: QaActivityType[];
  qaActivityTypesById: Map<string, { name: string; description?: string }>;
}

const ResolutionSimulator: React.FC<SimulatorProps> = ({
  entries, facilities, labs, specimens, subspecialties, qaActivityTypes, qaActivityTypesById
}) => {
  const { t } = useTranslation();
  const [simFacility,       setSimFacility]       = useState('');
  const [simLab,          setSimLab]          = useState('');
  const [simSpecimen,     setSimSpecimen]      = useState('');
  const [simSubspecialty, setSimSubspecialty]  = useState('');
  const [simUrgency,      setSimUrgency]       = useState<TATUrgency>('ROUTINE');

  // Real, per direct guidance (PS-116): simulates against every real
  // type this screen's own rule-creation dropdown now offers — the
  // fixed clinical-workflow 8 plus every real, active QA Activity Type
  // — so a QA-activity TAT rule shows up here too, not just the
  // original 8. Same reasoning as the filter buttons/entries table:
  // a rule an admin can create but can't preview would be a real,
  // inconsistent half-feature.
  const allSimTypes = useMemo(() => [...TAT_TYPES, ...qaActivityTypes.map(qt => qt.id)], [qaActivityTypes]);

  // Real, per direct guidance ("a TAT time could have two
  // components... the Performing lab and the other is the Ordering
  // Client"): calls the exact same resolveTatEntry() the real, live
  // TAT-outlier pipeline uses (qualityCalculations.ts) — replaces a
  // real, hand-maintained 7-case priority list that was already a
  // second, independent reimplementation of the same resolution logic
  // before this fix, and had already fallen out of sync (it never
  // covered every real combination the actual resolver's generic
  // specificity scoring handles, e.g. subspecialty + specimen
  // together). A resolution simulator showing anything other than
  // exactly what the real resolver would compute isn't a simulator,
  // it's a second opinion.
  const results = useMemo<Array<{ type: string; match: TATEntry | null }>>(() => {
    const active = entries.filter(e => e.active);
    return allSimTypes.map(type => ({
      type,
      match: resolveTatEntry(active, type, {
        facilityId: simFacility || undefined,
        performingLabFacilityId: simLab || undefined,
        specimenId: simSpecimen || undefined,
        subspecialtyId: simSubspecialty || undefined,
        urgency: simUrgency,
      }) as TATEntry | null,
    }));
  }, [entries, simFacility, simLab, simSpecimen, simSubspecialty, simUrgency, allSimTypes]);

  return (
    <div className="ps-tat-sim-shell">
      <div className="ps-tat-sim-header">
        <span className="ps-tatconfig__sim-title">
          {t('tatConfigSection.simulator.title')}
        </span>
        <span className="ps-tat-hint-text">
          {t('tatConfigSection.simulator.subtitle')}
        </span>
      </div>

      <div className="ps-tat-sim-controls">
        <select className="ps-conf-select" aria-label={t('tatConfigSection.modal.performingLabAria')} value={simLab} onChange={e => setSimLab(e.target.value)}>
          <option value="">{t('tatConfigSection.simulator.noSpecificLab')}</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label={t('tatConfigSection.modal.orderingFacilityAria')} value={simFacility} onChange={e => setSimFacility(e.target.value)}>
          <option value="">{t('tatConfigSection.simulator.noSpecificFacility')}</option>
          {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label={t('tatConfigSection.modal.specimenAria')} value={simSpecimen} onChange={e => setSimSpecimen(e.target.value)}>
          <option value="">{t('tatConfigSection.simulator.noSpecificSpecimen')}</option>
          {specimens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label={t('tatConfigSection.modal.subspecialtyAria')} value={simSubspecialty} onChange={e => setSimSubspecialty(e.target.value)}>
          <option value="">{t('tatConfigSection.simulator.noSpecificSubspecialty')}</option>
          {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label={t('tatConfigSection.modal.urgencyLabel')} value={simUrgency} onChange={e => setSimUrgency(e.target.value as TATUrgency)}>
          <option value="ROUTINE">{t('tatConfigSection.urgencyRoutine')}</option>
          <option value="STAT">{t('tatConfigSection.urgencyStat')}</option>
        </select>
      </div>

      <div className="ps-tat-sim-results">
        {results.map(({ type, match }) => (
          <div key={type} className="ps-tat-sim-row">
            <span className="ps-tat-type-badge">{getTatTypeLabel(type, qaActivityTypesById, t)}</span>
            {match ? (
              <>
                <span className="ps-tat-sim-target">{formatHours(match.targetHours, t)}</span>
                <span className="ps-tat-sim-source">
                  {isSystemDefaultTatEntryId(match.id) ? t('tatConfigSection.simulator.sourceSystemDefault') : t('tatConfigSection.simulator.sourceCustomRule')}
                  {match.notes && ' · ' + match.notes}
                </span>
              </>
            ) : (
              <span className="ps-tat-sim-none">{t('tatConfigSection.simulator.noMatch')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main section ──────────────────────────────────────────────────────────────

const TATConfigSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries,   setEntries]   = useState<TATEntry[]>([]);
  const reloadEntries = () => tatTargetService.getAll().then(res => { if (res.ok) setEntries(res.data); });
  useEffect(() => { reloadEntries(); }, []);
  const { log } = useAuditLog();
  const [modal,     setModal]     = useState<{ mode: 'add' | 'edit'; entry?: TATEntry } | null>(null);
  const [filter,    setFilter]    = useState<string>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  // Real, per direct guidance ("we should be able to filter the main
  // list by Performing and/or Ordering facility"): two genuinely
  // independent filters — see facilityFiltered below for the real
  // "an unscoped entry always stays visible" semantics.
  const [performingLabFilter, setPerformingLabFilter] = useState('');
  const [orderingFacilityFilter, setOrderingFacilityFilter] = useState('');
  const [showSim,   setShowSim]   = useState(false);

  // Real, per direct guidance (PS-116): points this screen's own type
  // selector at the real QA Activity registry (PS-113/114/115)
  // instead of only the 8 hardcoded clinical-workflow TATType values,
  // so a QA Lead defining a new activity (or duplicating one, with no
  // code change) automatically gets a real TAT category available for
  // it. Deliberately only the review-with-outcome archetype
  // (QaActivityType), not QaSupervisionAssignmentType — a supervision
  // period (e.g. FPPE) has no discrete "completed in N hours" event to
  // measure a turnaround against, confirmed directly against that
  // archetype's own real shape (an ongoing period with a running case
  // count, not a single reviewed-by-when event).
  const [qaActivityTypes, setQaActivityTypes] = useState<QaActivityType[]>([]);
  useEffect(() => {
    qaActivityTypeService.getAll().then(res => {
      if (res.ok) setQaActivityTypes(res.data.filter(qt => qt.active));
    });
  }, []);
  const qaActivityTypesById = useMemo(
    () => new Map(qaActivityTypes.map(qt => [qt.id, { name: qt.name, description: qt.description }])),
    [qaActivityTypes]
  );


  // Live data from real services — subspecialties was previously read from
  // a separate, disconnected in-memory React Context (contexts/
  // useSubspecialties.tsx) that only ever had 2 hardcoded entries and
  // never persisted edits. Migrated to the same subspecialtyService every
  // other subspecialty-aware admin screen (Routing Rules, FPPE
  // Assignments, Case Pool Assignment, etc.) already uses.
  const [subspecialties, setSubspecialties] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    subspecialtyService.getAll().then(res => {
      if (res.ok) setSubspecialties(res.data);
    });
  }, []);
  const { dictionary: specimens } = useSpecimenDictionary();

  const [allFacilities, setAllFacilities] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    facilityService.getAll().then(res => {
      if (res.ok) {
        setAllFacilities(
          res.data
            .filter((c: any) => c.status !== 'Inactive') // was 'inactive' (lowercase) — Facility.status is 'Active'|'Inactive' (capitalized), so this never matched and inactive facilities incorrectly appeared in the dropdown
            .map((c: any) => ({ id: c.id, name: c.name }))
        );
      }
    });
  }, []);

  const facilities = allFacilities;

  // Real, per direct guidance ("a TAT time could have two components...
  // the Performing lab and the other is the Ordering Client"): a
  // genuinely separate list from facilities/allFacilities above — every
  // active performing lab, not every active facility.
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { getActivePerformingLabs().then(l => setLabs(l.map(f => ({ id: f.id, name: f.name })))); }, []);

  const specimenList = useMemo(
    () => specimens.map(s => ({ id: s.id, name: s.name })),
    [specimens]
  );

  const subspecialtyList = useMemo(
    () => subspecialties.map(s => ({ id: s.id, name: s.name })),
    [subspecialties]
  );

  // Batch 353: saves go through tatTargetService. Add vs update comes from
  // the editor's mode (a duplicate is an add), not from whether the id is
  // already in the list; the service refuses to delete a system default.
  const handleSave = async (saved: TATEntry) => {
    const mode = modal?.mode ?? 'add';
    const res = mode === 'edit' ? await tatTargetService.update(saved) : await tatTargetService.add(saved);
    if (res.ok) {
      if (mode === 'edit') log('tat_entry_updated', { id: saved.id, type: saved.type, changes: [`targetHours: ${saved.targetHours}h`] });
      else log('tat_entry_created', { type: saved.type, targetHours: saved.targetHours, facilityId: saved.facilityId ?? null, roleId: saved.roleId ?? null });
    }
    await reloadEntries();
    setModal(null);
  };

  const toggleActive = async (id: string) => {
    const target = entries.find(e => e.id === id);
    if (!target) return;
    const res = await tatTargetService.update({ ...target, active: !target.active });
    if (res.ok) log('tat_entry_toggled', { id, type: target.type, active: !target.active });
    await reloadEntries();
  };

  const deleteEntry = async (id: string) => {
    const target = entries.find(e => e.id === id);
    const res = await tatTargetService.remove(id);
    if (res.ok && target) log('tat_entry_deleted', { id, type: target.type });
    await reloadEntries();
  };

  const displayed = entries
    .filter(e => filter === 'ALL' || e.type === filter)
    .filter(e => showInactive ? true : e.active)
    .sort((a, b) => specificityScore(b) - specificityScore(a));

  const facilityName   = (id: string | null) => id ? (facilities.find(c => c.id === id)?.name ?? id) : null;
  const labName       = (id: string | null) => id ? (labs.find(l => l.id === id)?.name ?? id) : null;
  const specimenName = (id: string | null) => id ? (specimenList.find(s => s.id === id)?.name ?? id) : null;
  const subName      = (id: string | null) => id ? (subspecialtyList.find(s => s.id === id)?.name ?? id) : null;

  // Real, per direct guidance ("we should be able to filter the main
  // list by Performing and/or Ordering facility"): two genuinely
  // independent filters, both optional. An entry with no
  // performingLabFacilityId set always stays visible under a
  // Performing Lab filter — it's Enterprise-wide by definition, so it
  // applies at that lab too; same logic for an entry with no facilityId
  // under an Ordering Facility filter.
  const facilityFiltered = displayed
    .filter(e => !performingLabFilter || !e.performingLabFacilityId || e.performingLabFacilityId === performingLabFilter)
    .filter(e => !orderingFacilityFilter || !e.facilityId || e.facilityId === orderingFacilityFilter);

  // Real, per direct guidance ("there are enterprise level TAT when an
  // entry has no associated Performing Facility or Ordering Facility
  // defined... at the top of the list"): an entry with ONLY an
  // ordering facility set (no performing lab) is folded in here too —
  // without a specific lab it still applies universally across every
  // performing lab, it just additionally narrows to one ordering
  // facility, so it belongs conceptually with the other Enterprise-wide
  // entries rather than under any one lab's own section.
  const enterpriseEntries = facilityFiltered.filter(e => !e.performingLabFacilityId);

  // Real, per direct guidance ("the next Group are the Individual
  // Performing Facility sorted by the Ordering Facility"): one real
  // section per performing lab with at least one matching entry,
  // sorted by lab name; within each section, entries with no ordering
  // facility (apply to every orderer at this lab) come first, then the
  // rest sorted by their own real ordering facility's name — already-
  // specificity-sorted entries (from `displayed` above) keep that
  // relative order within each of those two sub-groups.
  const performingLabGroups = labs
    .map(lab => ({
      lab,
      entries: facilityFiltered
        .filter(e => e.performingLabFacilityId === lab.id)
        .slice()
        .sort((a, b) => {
          const an = a.facilityId ? (facilityName(a.facilityId) ?? '') : '';
          const bn = b.facilityId ? (facilityName(b.facilityId) ?? '') : '';
          if (!an && bn) return -1;
          if (an && !bn) return 1;
          if (!an && !bn) return 0;
          return an.localeCompare(bn);
        }),
    }))
    .filter(g => g.entries.length > 0)
    .sort((a, b) => a.lab.name.localeCompare(b.lab.name));

  // Real, per direct guidance: extracted so the same real row markup
  // renders identically whether it's under the Enterprise tier or a
  // specific Performing Facility's own section — one real
  // implementation, not one copy per section that could drift.
  const renderRow = (e: TATEntry) => {
    const isSystem = isSystemDefaultTatEntryId(e.id);
    const scopeParts = [
      labName(e.performingLabFacilityId),
      facilityName(e.facilityId),
      specimenName(e.specimenId),
      subName(e.subspecialtyId),
      (e as any).roleId ? t('tatConfigSection.roleScope', { role: roleLabel((e as any).roleId, t) }) : null,
    ].filter(Boolean);

    return (
      <tr key={e.id} className={e.active ? undefined : 'ps-tatconfig__row--inactive'}>
        <td className="ps-sub-td">
          <span className="ps-tat-type-badge ps-tatconfig__type-badge--mr8">
            {getTatTypeLabel(e.type, qaActivityTypesById, t)}
            {(e as any).roleId && <span className="ps-tatconfig__role-suffix"> · {roleLabel((e as any).roleId, t)}</span>}
          </span>
          {isSystem && <span className="ps-del-tag ps-tatconfig__lock-icon">🔒</span>}
        </td>
        <td className="ps-sub-td">
          <strong className="ps-tatconfig__target">{formatHours(e.targetHours, t)}</strong>
        </td>
        <td className="ps-sub-td">
          <span className={e.urgency === 'STAT' ? 'ps-tatconfig__urgency--stat' : 'ps-tatconfig__urgency--routine'}>
            {e.urgency ? urgencyLabel(e.urgency, t) : t('tatConfigSection.anyUrgency')}
          </span>
        </td>
        <td className="ps-sub-td">
          {scopeParts.length === 0 ? (
            <span className="ps-tatconfig__scope-default">{t('tatConfigSection.scopeDefault')}</span>
          ) : (
            <div className="ps-tatconfig__scope-list">
              {scopeParts.map((s, i) => (
                <span key={i} className="ps-tatconfig__scope-item">{s}</span>
              ))}
            </div>
          )}
        </td>
        <td className="ps-sub-td">
          <span className="ps-tatconfig__scope-item">{e.notes || '—'}</span>
        </td>
        <td className="ps-sub-td">
          <div className="ps-sub-toggle-wrap">
            <div
              onClick={() => toggleActive(e.id)}
              className={e.active ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
            >
              <div className={e.active ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
            </div>
          </div>
        </td>
        <td className="ps-sub-td ps-participationtypes__td--right">
          <div className="ps-tatconfig__actions-row">
            <button
              className="ps-sub-edit-btn"
              onClick={() => setModal({ mode: 'edit', entry: e })}
            >
              {t('common.edit')}
            </button>
            <button
              className="ps-sub-edit-btn"
              onClick={() => setModal({ mode: 'add', entry: duplicateTatEntry(e, isSystem) })}
            >
              {t('common.duplicate')}
            </button>
            {!isSystem && (
              <button
                className="ps-del-delete-btn"
                aria-label={t('common.delete')}
                onClick={() => deleteEntry(e.id)}
              >
                ✕
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const tableHeaders: Array<{ key: string; label: string; className?: string }> = [
    { key: 'type',    label: t('tatConfigSection.table.type'),    className: 'ps-tatconfig__col-type' },
    { key: 'target',  label: t('tatConfigSection.table.target'),  className: 'ps-tatconfig__col-target' },
    { key: 'urgency', label: t('tatConfigSection.table.urgency'), className: 'ps-tatconfig__col-urgency' },
    { key: 'scope',   label: t('tatConfigSection.table.scope'),   className: 'ps-tatconfig__col-scope' },
    { key: 'notes',   label: t('tatConfigSection.table.notes'),   className: 'ps-tatconfig__col-notes' },
    { key: 'status',  label: t('tatConfigSection.table.status'),  className: 'ps-tatconfig__col-status' },
    { key: 'actions', label: t('tatConfigSection.table.actions'), className: 'ps-tatconfig__col-actions' },
  ];

  const hierarchyLevels = [
    t('tatConfigSection.hierarchy.specimenUrgency'),
    t('tatConfigSection.hierarchy.specimen'),
    t('tatConfigSection.hierarchy.subspecialtyUrgency'),
    t('tatConfigSection.hierarchy.subspecialty'),
    t('tatConfigSection.hierarchy.facilityOnly'),
    t('tatConfigSection.hierarchy.specimenOnly'),
    t('tatConfigSection.hierarchy.systemDefault'),
  ];

  return (
    <div className="ps-tat-shell">

      {/* Header */}
      <div className="ps-tat-header">
        <div>
          <h2 className="ps-sub-title">{t('tatConfigSection.title')}</h2>
          <p className="ps-sub-subtitle">
            {t('tatConfigSection.subtitle')}
          </p>
        </div>
        <div className="ps-rulemodal__footer-actions">
          <button
            className={showSim ? 'ps-tat-sim-btn ps-tat-sim-btn--active' : 'ps-tat-sim-btn'}
            onClick={() => setShowSim(v => !v)}
          >
            {t('tatConfigSection.simulatorBtn')}
          </button>
          <button
            className="ps-section-add-btn"
            onClick={() => setModal({ mode: 'add' })}
          >
            {t('tatConfigSection.addRuleBtn')}
          </button>
        </div>
      </div>

      {/* Resolution hierarchy info */}
      <div className="ps-tat-hierarchy-box">
        <div className="ps-tatconfig__hierarchy-title">
          {t('tatConfigSection.hierarchyTitle')}
        </div>
        <div className="ps-tat-hierarchy-list">
          {hierarchyLevels.map((level, i) => (
            <span key={i} className="ps-tat-hierarchy-item">
              <span className="ps-tat-hierarchy-num">{i + 1}</span>
              {level}
            </span>
          ))}
        </div>
      </div>

      {/* Simulator */}
      {showSim && (
        <ResolutionSimulator
          entries={entries}
          facilities={facilities}
          labs={labs}
          specimens={specimenList}
          subspecialties={subspecialtyList}
          qaActivityTypes={qaActivityTypes}
          qaActivityTypesById={qaActivityTypesById}
        />
      )}

      {/* Filters */}
      <div className="ps-tat-filters">
        <div className="ps-tatconfig__filter-buttons">
          {(['ALL', ...TAT_TYPES, ...qaActivityTypes.map(qt => qt.id)]).map(typeId => (
            <button
              key={typeId}
              onClick={() => setFilter(typeId)}
              className={filter === typeId ? 'ps-tat-filter-btn ps-tat-filter-btn--active' : 'ps-tat-filter-btn'}
            >
              {typeId === 'ALL' ? t('tatConfigSection.filterAllTypes') : getTatTypeLabel(typeId, qaActivityTypesById, t)}
            </button>
          ))}
        </div>
        {/* Real, per direct guidance: two genuinely independent
            facility filters, usable together or separately. */}
        <div className="ps-tatconfig__facility-filters">
          <select className="ps-conf-select" aria-label={t('tatConfigSection.filterByPerformingLabAria')} value={performingLabFilter} onChange={e => setPerformingLabFilter(e.target.value)}>
            <option value="">{t('tatConfigSection.allPerformingLabs')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="ps-conf-select" aria-label={t('tatConfigSection.filterByOrderingFacilityAria')} value={orderingFacilityFilter} onChange={e => setOrderingFacilityFilter(e.target.value)}>
            <option value="">{t('tatConfigSection.allOrderingFacilities')}</option>
            {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label className="ps-sub-toggle-wrap ps-tatconfig__toggle-label">
          <div
            onClick={() => setShowInactive(v => !v)}
            className={showInactive ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
          >
            <div className={showInactive ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
          </div>
          <span className="ps-tat-hint-text">{t('common.showInactive')}</span>
        </label>
      </div>

      {/* Table */}
      <div className="ps-tat-table-wrap">
        <table className="ps-sub-table">
          <colgroup>
            {tableHeaders.map(h => <col key={h.key} className={h.className} />)}
          </colgroup>
          <thead>
            <tr>
              {tableHeaders.map(h => (
                <th key={h.key} className={h.key === 'actions' ? 'ps-sub-th ps-participationtypes__td--right' : 'ps-sub-th'}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enterpriseEntries.length === 0 && performingLabGroups.length === 0 && (
              <tr>
                <td colSpan={7} className="ps-sub-td ps-tatconfig__empty-row">
                  {t('tatConfigSection.emptyRow')}
                </td>
              </tr>
            )}
            {enterpriseEntries.length > 0 && (
              <>
                <tr>
                  <td colSpan={7} className="ps-tat-group-header">{t('tatConfigSection.enterpriseGroup', { count: enterpriseEntries.length })}</td>
                </tr>
                {enterpriseEntries.map(renderRow)}
              </>
            )}
            {performingLabGroups.map(({ lab, entries: labEntries }) => (
              <React.Fragment key={lab.id}>
                <tr>
                  <td colSpan={7} className="ps-tat-group-header">{t('tatConfigSection.labGroup', { name: lab.name, count: labEntries.length })}</td>
                </tr>
                {labEntries.map(renderRow)}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <TATModal
          mode={modal.mode}
          entry={modal.entry}
          entries={entries}
          facilities={facilities}
          labs={labs}
          specimens={specimenList}
          subspecialties={subspecialtyList}
          qaActivityTypes={qaActivityTypes}
          qaActivityTypesById={qaActivityTypesById}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

    </div>
  );
};

export default TATConfigSection;
