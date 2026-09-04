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

import React, { useState, useMemo, useEffect } from 'react';
import { subspecialtyService, qaActivityTypeService } from '../../../services';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import { useSpecimenDictionary } from './useSpecimenDictionary';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import { specificityScore, resolveTatEntry } from '@/components/Contribution/qualityCalculations';
import '../../../pathscribe.css';
import { useAuditLog } from '../../Audit/useAuditLog';


// ── Types ─────────────────────────────────────────────────────────────────────

export type TATType =
  | 'FIRST_TOUCH'
  | 'TOTAL_CASE'
  | 'FROZEN_SECTION'
  | 'COLD_ISCHEMIA'
  | 'GROSSING'
  | 'SIGN_OUT'
  | 'CONSULTATION_RESPONSE'   // How fast I respond to colleagues' requests
  | 'CONSULTATION_AWAITING';  // How long I wait for colleagues' responses

export type TATUrgency = 'ROUTINE' | 'STAT';

export interface TATEntry {
  id:             string;
  /** Real, deliberate widening (PS-116): was strictly `TATType` — a
   *  fixed, closed union of clinical-workflow measurements. A real QA
   *  Activity Type (PS-113/114/115) is dynamic and open-ended by
   *  design (an admin can Duplicate a new one at any time with no
   *  code change), so it can never be a member of a closed union.
   *  Still holds a real `TATType` value for every existing clinical-
   *  workflow entry — resolveTatTargetHours (qualityCalculations.ts)
   *  already treated this as a plain `string`, confirmed directly, so
   *  this widening changes zero resolution behavior for those entries.
   *  See getTatTypeLabel/getTatTypeDescription below for how a value
   *  that isn't a real TATType resolves to a real QA Activity Type's
   *  own name instead. */
  type:           string;
  targetHours:    number;
  urgency:        TATUrgency | null;   // null = all urgency levels
  facilityId:       string | null;       // null = all ordering/referring facilities
  /**
   * Real, per direct guidance: a genuinely separate dimension from
   * facilityId above, not a replacement for it — facilityId is the
   * ORDERING/REFERRING facility (who sent the case); this is the real
   * performing lab actually doing the work. A performing lab's own
   * general TAT policy and a specific ordering facility's own
   * contractual TAT agreement can both apply, independently — see
   * qualityCalculations.ts's own TatEntryForResolution for the full
   * account of how both are resolved together.
   */
  performingLabFacilityId: string | null;
  specimenId:     string | null;       // null = all specimens
  subspecialtyId: string | null;       // null = all subspecialties
  roleId:         string | null;       // null = all roles; e.g. 'Resident', 'Pathologist'
  active:         boolean;
  notes:          string;
  createdAt:      string;
}

const TAT_TYPES: TATType[] = [
  'FIRST_TOUCH', 'TOTAL_CASE', 'FROZEN_SECTION',
  'COLD_ISCHEMIA', 'GROSSING', 'SIGN_OUT',
  'CONSULTATION_RESPONSE', 'CONSULTATION_AWAITING',
];

const TAT_TYPE_LABELS: Record<TATType, string> = {
  FIRST_TOUCH:              'First Touch',
  TOTAL_CASE:               'Total Case',
  FROZEN_SECTION:           'Frozen Section',
  COLD_ISCHEMIA:            'Cold Ischaemia',
  GROSSING:                 'Grossing',
  SIGN_OUT:                 'Sign-Out',
  CONSULTATION_RESPONSE:    'Consultation — My Response',
  CONSULTATION_AWAITING:    'Consultation — Awaiting Response',
};

const TAT_TYPE_DESC: Record<TATType, string> = {
  FIRST_TOUCH:              'Received → first opened by any pathologist',
  TOTAL_CASE:               'Received → case finalised',
  FROZEN_SECTION:           'Gross submitted → verbal report issued',
  COLD_ISCHEMIA:            'Surgical excision → specimen in fixative',
  GROSSING:                 'Received → gross description saved',
  SIGN_OUT:                 'Microscopic saved → case finalised',
  CONSULTATION_RESPONSE:    'Request received → reviewer responds (second opinion / formal consult)',
  CONSULTATION_AWAITING:    'Request sent → response received from colleague or external reviewer',
};

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
function getTatTypeLabel(type: string, qaActivityTypesById: Map<string, { name: string; description?: string }>): string {
  if (isFixedTatType(type)) return TAT_TYPE_LABELS[type];
  return qaActivityTypesById.get(type)?.name ?? type;
}

function getTatTypeDescription(type: string, qaActivityTypesById: Map<string, { name: string; description?: string }>): string | undefined {
  if (isFixedTatType(type)) return TAT_TYPE_DESC[type];
  const qaType = qaActivityTypesById.get(type);
  return qaType?.description ? `QA Activity: ${qaType.description}` : undefined;
}

// ── System defaults ───────────────────────────────────────────────────────────

export const SYSTEM_DEFAULTS: TATEntry[] = [
  { id: 'sys-ft-r',  type: 'FIRST_TOUCH',    targetHours: 4,    urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ft-s',  type: 'FIRST_TOUCH',    targetHours: 1,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-tc-r',  type: 'TOTAL_CASE',     targetHours: 24,   urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-tc-s',  type: 'TOTAL_CASE',     targetHours: 4,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-fs-r',  type: 'FROZEN_SECTION', targetHours: 0.5,  urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-fs-s',  type: 'FROZEN_SECTION', targetHours: 0.33, urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ci',    type: 'COLD_ISCHEMIA',  targetHours: 1,    urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-gr-r',  type: 'GROSSING',       targetHours: 4,    urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-gr-s',  type: 'GROSSING',       targetHours: 2,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-so-r',  type: 'SIGN_OUT',              targetHours: 4,    urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null,           active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-so-s',  type: 'SIGN_OUT',              targetHours: 2,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null,           active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  // Consultation — Response (how fast I reply to requests sent to me)
  { id: 'sys-cr-res',type: 'CONSULTATION_RESPONSE', targetHours: 24,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Resident',     active: true, notes: 'Resident / Fellow — training programme standard', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-cr-pat',type: 'CONSULTATION_RESPONSE', targetHours: 48,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Pathologist',  active: true, notes: 'Pathologist — informal peer review', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-cr-ext',type: 'CONSULTATION_RESPONSE', targetHours: 120,  urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'External',     active: true, notes: 'External / formal consult — 5 working days', createdAt: '2024-01-01T00:00:00Z' },
  // Consultation — Awaiting (how long before I chase up outstanding requests)
  { id: 'sys-ca-res',type: 'CONSULTATION_AWAITING', targetHours: 24,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Resident',     active: true, notes: 'Resident / Fellow — escalate if no response', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ca-pat',type: 'CONSULTATION_AWAITING', targetHours: 48,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Pathologist',  active: true, notes: 'Pathologist — chase after 48h', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ca-ext',type: 'CONSULTATION_AWAITING', targetHours: 120,  urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'External',     active: true, notes: 'External / formal consult — 5 working days', createdAt: '2024-01-01T00:00:00Z' },
];

// ── Storage ───────────────────────────────────────────────────────────────────

export const TAT_STORAGE_KEY = 'pathscribe_tat_entries_v2'; // v2: added roleId + consultation types

function loadEntries(): TATEntry[] {
  try {
    const raw = localStorage.getItem(TAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : SYSTEM_DEFAULTS;
  } catch { return SYSTEM_DEFAULTS; }
}

function saveEntries(entries: TATEntry[]) {
  try { localStorage.setItem(TAT_STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

// ── Uniqueness guard ──────────────────────────────────────────────────────────

function findConflict(
  entries: TATEntry[],
  draft: Partial<TATEntry>,
  excludeId?: string
): TATEntry | null {
  return entries.find(e =>
    e.active &&
    e.id !== excludeId &&
    e.type           === draft.type &&
    e.urgency        === (draft.urgency ?? null) &&
    e.facilityId       === (draft.facilityId ?? null) &&
    e.performingLabFacilityId === (draft.performingLabFacilityId ?? null) &&
    e.specimenId     === (draft.specimenId ?? null) &&
    e.subspecialtyId === (draft.subspecialtyId ?? null) &&
    e.roleId         === (draft.roleId ?? null)
  ) ?? null;
}

// ── Hours formatter ───────────────────────────────────────────────────────────

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h === Math.floor(h)) return `${h}h`;
  return `${h}h`;
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
  entry, entries, facilities, labs, specimens, subspecialties, qaActivityTypes, qaActivityTypesById, onSave, onClose
}) => {
  const isEdit = !!entry;
  const [draft, setDraft] = useState<Partial<TATEntry>>(
    entry ? { ...entry } : blankDraft()
  );
  const [error, setError] = useState('');

  const set = <K extends keyof TATEntry>(k: K, v: TATEntry[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const handleSave = () => {
    if (!draft.type) { setError('TAT type is required'); return; }
    if (!draft.targetHours || draft.targetHours <= 0) {
      setError('Target hours must be greater than 0');
      return;
    }
    const conflict = findConflict(entries, draft, entry?.id);
    if (conflict) {
      setError(
        'An active rule already exists for this combination (' +
        getTatTypeLabel(conflict.type, qaActivityTypesById) + ' · ' +
        (conflict.urgency ?? 'Any urgency') + '). ' +
        'Deactivate the existing rule first.'
      );
      return;
    }
    const now = new Date().toISOString();
    const saved: TATEntry = {
      id:             entry?.id ?? ('tat-' + Date.now()),
      type:           draft.type!,
      targetHours:    draft.targetHours!,
      urgency:        draft.urgency ?? null,
      facilityId:       draft.facilityId ?? null,
      performingLabFacilityId: draft.performingLabFacilityId ?? null,
      specimenId:     draft.specimenId ?? null,
      subspecialtyId: draft.subspecialtyId ?? null,
      // No form UI sets this yet — same null-default pattern as the
      // other scoping fields above; TATEntry itself already supports
      // per-role targets (see seed data), just not exposed in this
      // form's UI.
      roleId:         null,
      active:         draft.active ?? true,
      notes:          draft.notes ?? '',
      createdAt:      entry?.createdAt ?? now,
    };
    onSave(saved);
  };

  const isSystem = entry?.id?.startsWith('sys-');

  return (
    <div className="ps-conf-backdrop">
      <div
        className="fm-modal fm-modal--config"
        style={{ width: 'min(640px, 96vw)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">Configuration · TAT Configuration</div>
            <h2 className="fm-title" style={{ fontSize: 16 }}>
              {isEdit ? 'Edit TAT Rule' : 'Add TAT Rule'}
              {isSystem && (
                <span className="ps-idf-tier-badge ps-idf-tier-badge--2" style={{ marginLeft: 8 }}>
                  system default
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="ps-client-editor-body">

          {isSystem && (
            <div className="ps-sub-info-box">
              System defaults can be edited but not deleted. Deactivating a system default
              removes it from the resolution hierarchy — make sure a custom rule covers the gap.
            </div>
          )}

          {/* TAT Type */}
          <div className="ps-sub-field">
            <label className="ps-sub-label" htmlFor="tat-rule-type">TAT Type <span className="ps-sub-label-req">*</span></label>
            <select
              id="tat-rule-type"
              className="ps-conf-select"
              value={draft.type ?? ''}
              onChange={e => set('type', e.target.value)}
            >
              <optgroup label="Clinical Workflow">
                {TAT_TYPES.map(t => (
                  <option key={t} value={t}>{TAT_TYPE_LABELS[t]}</option>
                ))}
              </optgroup>
              {qaActivityTypes.length > 0 && (
                <optgroup label="QA Activities">
                  {qaActivityTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {draft.type && (
              <div className="ps-tat-hint-text ps-tat-hint-text--mt4">
                {getTatTypeDescription(draft.type, qaActivityTypesById)}
              </div>
            )}
          </div>

          {/* Target Hours + Urgency row */}
          <div className="ps-tat-two-col-row">
            <div className="ps-sub-field">
              <label className="ps-sub-label" htmlFor="tat-rule-target-hours">Target Hours <span className="ps-sub-label-req">*</span></label>
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
                  = {formatHours(draft.targetHours)}
                </div>
              )}
            </div>

            <div className="ps-sub-field">
              <label className="ps-sub-label" htmlFor="tat-rule-urgency">Urgency</label>
              <select
                id="tat-rule-urgency"
                className="ps-conf-select"
                value={draft.urgency ?? ''}
                onChange={e => set('urgency', (e.target.value || null) as TATUrgency | null)}
              >
                <option value="">Any (Routine + STAT)</option>
                <option value="ROUTINE">Routine only</option>
                <option value="STAT">STAT only</option>
              </select>
            </div>
          </div>

          {/* Applies To — structured matching filters */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Applies To</label>
            <div className="ps-tat-scope-hint">
              These filters determine <strong>which cases this rule matches</strong>.
              Leave a filter blank to match all values for that dimension.
              The more filters set, the higher the resolution priority — a rule
              with Performing Lab + Ordering Facility overrides one with either alone.
              Performing Lab and Ordering Facility are genuinely separate — a lab's
              own general TAT policy and a specific ordering facility's own contractual
              TAT agreement can both apply independently.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select
                className="ps-conf-select"
                aria-label="Performing Lab"
                value={draft.performingLabFacilityId ?? ''}
                onChange={e => set('performingLabFacilityId', e.target.value || null)}
              >
                <option value="">All performing labs</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label="Ordering Facility"
                value={draft.facilityId ?? ''}
                onChange={e => set('facilityId', e.target.value || null)}
              >
                <option value="">All ordering facilities</option>
                {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label="Specimen type"
                value={draft.specimenId ?? ''}
                onChange={e => set('specimenId', e.target.value || null)}
              >
                <option value="">All specimen types</option>
                {specimens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label="Subspecialty"
                value={draft.subspecialtyId ?? ''}
                onChange={e => set('subspecialtyId', e.target.value || null)}
              >
                <option value="">All subspecialties</option>
                {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select
                className="ps-conf-select"
                aria-label="Role"
                value={draft.roleId ?? ''}
                onChange={e => set('roleId', e.target.value || null)}
              >
                <option value="">All roles</option>
                <option value="Resident">Resident</option>
                <option value="Fellow">Fellow</option>
                <option value="Pathologist">Pathologist</option>
                <option value="External">External reviewer</option>
              </select>
            </div>

            {/* Live resolution preview */}
            {(() => {
              const parts: string[] = [];
              const labName      = labs.find(l => l.id === draft.performingLabFacilityId)?.name;
              const facilityName  = facilities.find(cl => cl.id === draft.facilityId)?.name;
              const specimenName = specimens.find(s => s.id === draft.specimenId)?.name;
              const subName     = subspecialties.find(s => s.id === draft.subspecialtyId)?.name;
              const roleName    = (draft as any).roleId;
              const urgency     = draft.urgency;

              if (urgency)      parts.push(urgency === 'STAT' ? 'STAT' : 'Routine');
              if (roleName)     parts.push(roleName + 's');
              if (specimenName) parts.push(specimenName + ' specimens');
              if (subName)      parts.push(subName + ' subspecialty');
              if (labName)      parts.push('performed at ' + labName);
              if (facilityName)   parts.push('ordered by ' + facilityName);

              const preview = parts.length === 0
                ? 'This is a system default — applies to all cases'
                : 'Applies to ' + parts.join(', ');

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
            <label className="ps-sub-label">Admin Notes <span className="ps-sub-label-hint">(optional — no effect on matching)</span></label>
            <input
              className="ps-sub-input"
              value={draft.notes ?? ''}
              placeholder="e.g. Added per MFT SLA negotiated Jan 2025, reviewed by Dr. Carter"
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {/* Active toggle */}
          <div className="ps-sub-field">
            <label className="ps-sub-label">Status</label>
            <div className="ps-sub-toggle-wrap">
              <div
                onClick={() => set('active', !draft.active)}
                className={draft.active ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
              >
                <div className={draft.active ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
              </div>
              <span className={draft.active ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>
                {draft.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {error && <div className="ps-sub-error" style={{ marginTop: 4 }}>{error}</div>}

        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="fm-btn-cancel">Cancel</button>
            <button onClick={handleSave} className="fm-btn-apply">
              {isEdit ? 'Save Changes' : 'Add Rule'}
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
  const allSimTypes = useMemo(() => [...TAT_TYPES, ...qaActivityTypes.map(t => t.id)], [qaActivityTypes]);

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
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
          Resolution Simulator
        </span>
        <span className="ps-tat-hint-text">
          See which rule wins for a given case
        </span>
      </div>

      <div className="ps-tat-sim-controls">
        <select className="ps-conf-select" aria-label="Performing Lab" value={simLab} onChange={e => setSimLab(e.target.value)}>
          <option value="">No specific performing lab</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label="Ordering Facility" value={simFacility} onChange={e => setSimFacility(e.target.value)}>
          <option value="">No specific ordering facility</option>
          {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label="Specimen type" value={simSpecimen} onChange={e => setSimSpecimen(e.target.value)}>
          <option value="">No specific specimen</option>
          {specimens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label="Subspecialty" value={simSubspecialty} onChange={e => setSimSubspecialty(e.target.value)}>
          <option value="">No specific subspecialty</option>
          {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="ps-conf-select" aria-label="Urgency" value={simUrgency} onChange={e => setSimUrgency(e.target.value as TATUrgency)}>
          <option value="ROUTINE">Routine</option>
          <option value="STAT">STAT</option>
        </select>
      </div>

      <div className="ps-tat-sim-results">
        {results.map(({ type, match }) => (
          <div key={type} className="ps-tat-sim-row">
            <span className="ps-tat-type-badge">{getTatTypeLabel(type, qaActivityTypesById)}</span>
            {match ? (
              <>
                <span className="ps-tat-sim-target">{formatHours(match.targetHours)}</span>
                <span className="ps-tat-sim-source">
                  {match.id.startsWith('sys-') ? 'system default' : 'custom rule'}
                  {match.notes && ' · ' + match.notes}
                </span>
              </>
            ) : (
              <span className="ps-tat-sim-none">No matching rule</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main section ──────────────────────────────────────────────────────────────

const TATConfigSection: React.FC = () => {
  const [entries,   setEntries]   = useState<TATEntry[]>(loadEntries);
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
      if (res.ok) setQaActivityTypes(res.data.filter(t => t.active));
    });
  }, []);
  const qaActivityTypesById = useMemo(
    () => new Map(qaActivityTypes.map(t => [t.id, { name: t.name, description: t.description }])),
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
    mockFacilityService.getAll().then(res => {
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

  const persist = (next: TATEntry[]) => { setEntries(next); saveEntries(next); };

  const handleSave = (saved: TATEntry) => {
    const idx   = entries.findIndex(e => e.id === saved.id);
    if (idx >= 0) {
      const next = [...entries];
      next[idx] = saved;
      persist(next);
      log('tat_entry_updated', { id: saved.id, type: saved.type, changes: [`targetHours: ${saved.targetHours}h`] });
    } else {
      persist([...entries, saved]);
      log('tat_entry_created', { type: saved.type, targetHours: saved.targetHours, facilityId: saved.facilityId ?? null, roleId: (saved as any).roleId ?? null });
    }
    setModal(null);
  };

  // Real fix, found via a direct audit: these are the actual, wired
  // functions the Delete/Toggle buttons below call — but a separate,
  // never-wired duplicate pair (_handleEntryDelete/_handleEntryToggle,
  // now removed) had audit log() calls these never did. Neither version
  // was strictly complete on its own: this pair had the real
  // system-default protection below, the duplicates had the logging.
  // Merged here rather than picking one side and losing the other.
  const toggleActive = (id: string) => {
    const target = entries.find(e => e.id === id);
    persist(entries.map(e => e.id === id ? { ...e, active: !e.active } : e));
    if (target) log('tat_entry_toggled', { id, type: target.type, active: !target.active });
  };

  const deleteEntry = (id: string) => {
    if (id.startsWith('sys-')) return; // system defaults cannot be deleted
    const target = entries.find(e => e.id === id);
    persist(entries.filter(e => e.id !== id));
    if (target) log('tat_entry_deleted', { id, type: target.type });
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
    const isSystem = e.id.startsWith('sys-');
    const scopeParts = [
      labName(e.performingLabFacilityId),
      facilityName(e.facilityId),
      specimenName(e.specimenId),
      subName(e.subspecialtyId),
      (e as any).roleId ? `Role: ${(e as any).roleId}` : null,
    ].filter(Boolean);

    return (
      <tr key={e.id} style={{ opacity: e.active ? 1 : 0.5 }}>
        <td className="ps-sub-td">
          <span className="ps-tat-type-badge" style={{ marginRight: 8 }}>
            {getTatTypeLabel(e.type, qaActivityTypesById)}
            {(e as any).roleId && <span style={{ opacity: 0.75, fontWeight: 500 }}> · {(e as any).roleId}</span>}
          </span>
          {isSystem && <span className="ps-del-tag" style={{ marginLeft: 6 }}>🔒</span>}
        </td>
        <td className="ps-sub-td">
          <strong style={{ color: '#e2e8f0' }}>{formatHours(e.targetHours)}</strong>
        </td>
        <td className="ps-sub-td">
          <span style={{ fontSize: 12, color: e.urgency === 'STAT' ? '#f59e0b' : '#94a3b8' }}>
            {e.urgency ?? 'Any'}
          </span>
        </td>
        <td className="ps-sub-td">
          {scopeParts.length === 0 ? (
            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>System default</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {scopeParts.map((s, i) => (
                <span key={i} style={{ fontSize: 12, color: '#94a3b8' }}>{s}</span>
              ))}
            </div>
          )}
        </td>
        <td className="ps-sub-td">
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{e.notes || '—'}</span>
        </td>
        <td className="ps-sub-td">
          <div className="ps-sub-toggle-wrap">
            <div
              onClick={() => toggleActive(e.id)}
              className={e.active ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
              style={{ cursor: 'pointer' }}
            >
              <div className={e.active ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
            </div>
          </div>
        </td>
        <td className="ps-sub-td" style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              className="ps-sub-edit-btn"
              onClick={() => setModal({ mode: 'edit', entry: e })}
            >
              Edit
            </button>
            {!isSystem && (
              <button
                className="ps-del-delete-btn"
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

  return (
    <div className="ps-tat-shell">

      {/* Header */}
      <div className="ps-tat-header">
        <div>
          <h2 className="ps-sub-title">TAT Configuration</h2>
          <p className="ps-sub-subtitle">
            Turnaround time targets per type, urgency, facility, specimen, and subspecialty.
            The most specific matching rule wins at runtime.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={showSim ? 'ps-tat-sim-btn ps-tat-sim-btn--active' : 'ps-tat-sim-btn'}
            onClick={() => setShowSim(v => !v)}
          >
            ⚡ Simulator
          </button>
          <button
            className="ps-section-add-btn"
            onClick={() => setModal({ mode: 'add' })}
          >
            + Add Rule
          </button>
        </div>
      </div>

      {/* Resolution hierarchy info */}
      <div className="ps-tat-hierarchy-box">
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8AB4F8', marginBottom: 6 }}>
          Resolution Hierarchy (most specific wins)
        </div>
        <div className="ps-tat-hierarchy-list">
          {[
            'Facility + Specimen + Urgency',
            'Facility + Specimen',
            'Facility + Subspecialty + Urgency',
            'Facility + Subspecialty',
            'Facility only',
            'Specimen only',
            'System default (fallback)',
          ].map((level, i) => (
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['ALL', ...TAT_TYPES, ...qaActivityTypes.map(t => t.id)]).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={filter === t ? 'ps-tat-filter-btn ps-tat-filter-btn--active' : 'ps-tat-filter-btn'}
            >
              {t === 'ALL' ? 'All Types' : getTatTypeLabel(t, qaActivityTypesById)}
            </button>
          ))}
        </div>
        {/* Real, per direct guidance: two genuinely independent
            facility filters, usable together or separately. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="ps-conf-select" aria-label="Filter by Performing Lab" value={performingLabFilter} onChange={e => setPerformingLabFilter(e.target.value)}>
            <option value="">All Performing Labs</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="ps-conf-select" aria-label="Filter by Ordering Facility" value={orderingFacilityFilter} onChange={e => setOrderingFacilityFilter(e.target.value)}>
            <option value="">All Ordering Facilities</option>
            {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label className="ps-sub-toggle-wrap" style={{ cursor: 'pointer' }}>
          <div
            onClick={() => setShowInactive(v => !v)}
            className={showInactive ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}
          >
            <div className={showInactive ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
          </div>
          <span className="ps-tat-hint-text">Show inactive</span>
        </label>
      </div>

      {/* Table */}
      <div className="ps-tat-table-wrap">
        <table className="ps-sub-table">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Type','Target','Urgency','Scope','Notes','Status','Actions'].map(h => (
                <th key={h} className="ps-sub-th" style={{ textAlign: h === 'Actions' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enterpriseEntries.length === 0 && performingLabGroups.length === 0 && (
              <tr>
                <td colSpan={7} className="ps-sub-td" style={{ textAlign: 'center', color: '#475569', padding: '20px 0' }}>
                  No rules match the current filter.
                </td>
              </tr>
            )}
            {enterpriseEntries.length > 0 && (
              <>
                <tr>
                  <td colSpan={7} className="ps-tat-group-header">Enterprise ({enterpriseEntries.length})</td>
                </tr>
                {enterpriseEntries.map(renderRow)}
              </>
            )}
            {performingLabGroups.map(({ lab, entries: labEntries }) => (
              <React.Fragment key={lab.id}>
                <tr>
                  <td colSpan={7} className="ps-tat-group-header">{lab.name} ({labEntries.length})</td>
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
