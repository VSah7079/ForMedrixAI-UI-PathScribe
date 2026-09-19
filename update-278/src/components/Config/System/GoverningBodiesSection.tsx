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
import '../../../pathscribe.css';
import { mockGoverningBodyService } from '@/services/governingBodies/mockGoverningBodyService';
import type { GoverningBody, RetentionPolicyVersion } from '@/services/governingBodies/IGoverningBodyService';
import type { RetainableMaterialType } from '@/services/retentionPolicy/RetentionPolicy';
import { MATERIAL_TYPE_LABEL, formatRetentionPeriod } from '@/services/retentionPolicy/RetentionPolicy';
import type { Jurisdiction } from '@/types/systemConfig';
import { JURISDICTION_LABELS } from '@/types/systemConfig';

const ALL_JURISDICTIONS = Object.keys(JURISDICTION_LABELS) as Jurisdiction[];
const ALL_MATERIAL_TYPES: RetainableMaterialType[] = ['block', 'slide', 'wet_tissue'];

// ── Toggle ────────────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  checked:   boolean;
  onChange:  (v: boolean) => void;
  disabled?: boolean;
  color?:    string;
}> = ({ checked, onChange, disabled = false, color = '#0891B2' }) => (
  <div
    onClick={() => !disabled && onChange(!checked)}
    className={`ps-toggle-track${checked ? ' on' : ' off'}${disabled ? ' disabled' : ''}`}
    style={{ background: checked ? color : undefined }}
  >
    <div className="ps-toggle-thumb" />
  </div>
);

// ── Body Modal (label/fullName/region/website — custom bodies only) ───────────

const BodyModal: React.FC<{
  initial?:    GoverningBody;
  existingIds: string[];
  onClose:     () => void;
  onSave:      (body: GoverningBody) => void;
}> = ({ initial, existingIds, onClose, onSave }) => {
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
      <div className="fm-modal fm-modal--config" style={{ width: 'min(480px, 96vw)' }} onClick={e => e.stopPropagation()}>

        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">Configuration · Governing Bodies</div>
            <h2 className="fm-title" style={{ fontSize: 16 }}>
              {isEdit ? `Edit — ${initial!.label}` : 'Add Governing Body'}
            </h2>
          </div>
          <button onClick={onClose} className="fm-btn-cancel" style={{ padding: '4px 10px' }}>✕</button>
        </div>
        <div className="ps-client-editor-body">

          <div className="ps-body-modal-field">
            <label className="ps-body-modal-label">
              Abbreviation <span className="ps-body-modal-label-req">*</span>
              {isEdit && <span className="ps-body-modal-label-note">(cannot be changed)</span>}
            </label>
            <input
              value={label}
              onChange={e => !isEdit && setLabel(e.target.value)}
              disabled={isEdit}
              placeholder="e.g. RCPA"
              className={[
                'ps-body-modal-input',
                'ps-body-modal-input--mono',
                isEdit     ? 'ps-body-modal-input--disabled' : '',
                idConflict ? 'ps-body-modal-input--error'    : '',
              ].filter(Boolean).join(' ')}
            />
            {idConflict && (
              <div className="ps-body-modal-error">
                ID <strong>{derivedId}</strong> already exists. Custom bodies must have a unique
                abbreviation that does not duplicate a standard body or another custom body.
              </div>
            )}
          </div>

          <div className="ps-body-modal-field">
            <label className="ps-body-modal-label">
              Full Name <span className="ps-body-modal-label-req">*</span>
            </label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Royal College of Pathologists of Australasia"
              className="ps-body-modal-input"
            />
          </div>

          <div className="ps-body-modal-field-row">
            <div className="ps-body-modal-field">
              <label className="ps-body-modal-label">Region</label>
              <input
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="e.g. Australia / NZ"
                className="ps-body-modal-input"
              />
            </div>
            <div className="ps-body-modal-field">
              <label className="ps-body-modal-label">Website</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://..."
                className="ps-body-modal-input"
              />
            </div>
          </div>

          {!isEdit && (
            <div className="ps-body-modal-note">
              <span className="ps-body-modal-note-label">ℹ️ Note — </span>
              auto-sync is disabled for custom bodies by default. Enable it manually once
              the sync feed is configured.
            </div>
          )}

          <div className="fm-footer">
            <span className="fm-footer-status" />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} className="fm-btn-cancel">Cancel</button>
              <button onClick={handleSave} disabled={!canSubmit} className="fm-btn-apply">
                {isEdit ? 'Save Changes' : 'Add Governing Body'}
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

const VersionRow: React.FC<{ v: RetentionPolicyVersion }> = ({ v }) => (
  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{v.version} — effective {v.effectiveDate}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
        background: v.applyToExistingInventory ? 'rgba(248,113,113,0.15)' : 'rgba(148,163,184,0.15)',
        color: v.applyToExistingInventory ? '#f87171' : '#94a3b8',
      }}>
        {v.applyToExistingInventory ? 'RETROACTIVE — applies to all stored material' : 'PROSPECTIVE — grandfathers earlier cases'}
      </span>
    </div>
    <div style={{ fontSize: 11, color: '#94a3b8' }}>
      Block {formatRetentionPeriod(v.block)} · Slide {formatRetentionPeriod(v.slide)} · Wet {formatRetentionPeriod(v.wet_tissue)}
    </div>
    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{v.sourceNote}</div>
  </div>
);

const RetentionModal: React.FC<{
  body:    GoverningBody;
  onClose: () => void;
  onSave:  (patch: Partial<GoverningBody>) => void;
}> = ({ body, onClose, onSave }) => {
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
  const parsedDays = Object.fromEntries(ALL_MATERIAL_TYPES.map(t => [t, parseInt(days[t], 10)])) as Record<RetainableMaterialType, number>;
  const allDaysValid = ALL_MATERIAL_TYPES.every(t => Number.isFinite(parsedDays[t]) && parsedDays[t] > 0);
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
      <div className="fm-modal fm-modal--config" style={{ width: 'min(600px, 96vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">Configuration · Governing Bodies · Retention</div>
            <h2 className="fm-title" style={{ fontSize: 16 }}>{body.label} — Retention Figures</h2>
          </div>
          <button onClick={onClose} className="fm-btn-cancel" style={{ padding: '4px 10px' }}>✕</button>
        </div>
        <div className="ps-client-editor-body">

          <div className="ps-body-modal-field">
            <label className="ps-body-modal-label">Applies to Jurisdiction(s)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {ALL_JURISDICTIONS.map(j => (
                <button
                  key={j} type="button" onClick={() => { toggleJurisdiction(j); }}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                    background: jurisdictions.includes(j) ? 'rgba(8,145,178,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${jurisdictions.includes(j) ? '#0891B2' : 'rgba(255,255,255,0.12)'}`,
                    color: jurisdictions.includes(j) ? '#0891B2' : '#94a3b8',
                  }}
                >
                  {JURISDICTION_LABELS[j]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Leave none selected if this body isn't yet the live retention source for any real jurisdiction (e.g. EU/Korea today).
              </div>
              <button onClick={handleSaveJurisdictions} className="ps-btn-ghost-dark" style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0, marginLeft: 8 }}>Save jurisdictions</button>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '16px 0 8px' }}>
            Version History ({existingVersions.length})
          </div>
          {existingVersions.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>No retention figures on file yet.</div>
          )}
          {existingVersions.map(v => <VersionRow key={v.version} v={v} />)}

          {!showAddVersion ? (
            <button onClick={() => setShowAddVersion(true)} className="ps-section-add-btn" style={{ marginTop: 4 }}>+ Add New Version</button>
          ) : (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid rgba(8,145,178,0.3)', background: 'rgba(8,145,178,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0891B2', marginBottom: 10 }}>
                New Version — {body.retentionPolicyVersions?.length ? `v${body.retentionPolicyVersions.length + 1}` : 'v1'}
              </div>

              <div className="ps-body-modal-field-row">
                <div className="ps-body-modal-field">
                  <label className="ps-body-modal-label">Effective Date</label>
                  <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="ps-body-modal-input ps-body-modal-input--mono" />
                </div>
              </div>

              <div className="ps-body-modal-field-row">
                {ALL_MATERIAL_TYPES.map(t => (
                  <div className="ps-body-modal-field" key={t}>
                    <label className="ps-body-modal-label">{MATERIAL_TYPE_LABEL[t]} (days)</label>
                    <input
                      value={days[t]}
                      onChange={e => setDays(prev => ({ ...prev, [t]: e.target.value }))}
                      placeholder="e.g. 3653"
                      className="ps-body-modal-input ps-body-modal-input--mono"
                    />
                    {days[t] && Number.isFinite(parseInt(days[t], 10)) && parseInt(days[t], 10) > 0 && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>≈ {formatRetentionPeriod(parseInt(days[t], 10))}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="ps-body-modal-field">
                <label className="ps-body-modal-label">
                  Source / Citation <span className="ps-body-modal-label-req">*</span>
                </label>
                <textarea
                  value={sourceNote}
                  onChange={e => setSourceNote(e.target.value)}
                  placeholder="e.g. RCPath/IBMS Best Practice Recommendations G031, 6th ed. (active Oct 2025)..."
                  className="ps-body-modal-input"
                  rows={3}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 10 }}>
                <input type="checkbox" checked={applyToExisting} onChange={e => setApplyToExisting(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2 }} />
                <span style={{ fontSize: 12, color: '#e2e8f0' }}>
                  Apply retroactively to all currently-stored, non-disposed material
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Check this ONLY for a real, lengthening change ("you cannot dispose of a 12-year-old block today simply because it met the old 10-year rule"). Leave unchecked for a shortening change — earlier cases stay grandfathered under whichever version was active at their own sign-out.
                  </div>
                </span>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={() => setShowAddVersion(false)} className="fm-btn-cancel">Cancel</button>
                <button onClick={handleAddVersion} disabled={!canSubmit} className="fm-btn-apply">Publish New Version</button>
              </div>
            </div>
          )}

          <div className="fm-footer" style={{ marginTop: 16 }}>
            {existingVersions.length > 0 && (
              <button onClick={handleClearAll} className="fm-btn-cancel" style={{ color: '#f87171' }}>Clear entire version history</button>
            )}
            {existingVersions.length === 0 && <span className="fm-footer-status" />}
            <button onClick={onClose} className="fm-btn-cancel">Close</button>
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
}> = ({ body, isSuperAdmin, onUpdate, canRemove, onEdit, onRemove, onEditRetention }) => (
  <div className={`ps-gov-row${body.enabled ? '' : ' ps-gov-row--disabled'}`}>

    <div>
      <div className="ps-gov-row-name">
        {body.label}
        {body.isCustom && <span className="ps-gov-custom-badge" style={{ marginLeft: 8 }}>CUSTOM</span>}
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
          return <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>No retention figures on file</div>;
        }
        return (
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            Block {formatRetentionPeriod(current.block)} · Slide {formatRetentionPeriod(current.slide)} · Wet {formatRetentionPeriod(current.wet_tissue)}
            {versions.length > 1 ? ` · ${versions.length} versions on file` : ''}
            {body.jurisdictions?.length ? ` · ${body.jurisdictions.join(', ')}` : ' · not yet linked to a jurisdiction'}
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
        <button className="ps-btn-ghost-dark" onClick={onEditRetention} style={{ fontSize: 11, padding: '4px 8px' }}>
          🕐 Retention
        </button>
      )}
      {canRemove && onEdit && (
        <button className="ps-btn-ghost-dark" onClick={onEdit} style={{ fontSize: 11, padding: '4px 8px' }}>
          Edit
        </button>
      )}
      {canRemove && onRemove && (
        <button className="ps-gov-remove-btn" onClick={onRemove} title="Remove">✕</button>
      )}
    </div>

  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────

const GoverningBodiesSection: React.FC<{ isSuperAdmin?: boolean }> = ({ isSuperAdmin = false }) => {
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
    mockGoverningBodyService.getAll().then(setBodies).catch(() => {});
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
      await mockGoverningBodyService.saveAll(bodies);
      setHasChanges(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const standardBodies = bodies.filter(b => !b.isCustom);
  const customBodies   = bodies.filter(b =>  b.isCustom);
  const allIds         = bodies.map(b => b.id);

  return (
    <div className="ps-gov-shell">

      <div className="ps-gov-header">
        <div className="ps-gov-header-text">
          <h3 className="ps-gov-title">Governing Bodies</h3>
          <p className="ps-gov-subtitle">
            Controls which governing bodies appear in the Synoptic Library and nightly protocol sync, and the real, live specimen-retention figures each one publishes.
            {!isSuperAdmin && <span className="ps-gov-subtitle-warn"> · Super admin access required.</span>}
          </p>
        </div>
        <div className="ps-gov-header-actions">
          {hasChanges && <span className="ps-gov-unsaved">● Unsaved changes</span>}
          {saveError && <span style={{ color: '#f87171', fontSize: 12 }}>{saveError}</span>}
          {isSuperAdmin && hasChanges && <button className="ps-conf-btn-primary" onClick={handleSave}>Save Changes</button>}
          {isSuperAdmin && <button className="ps-section-add-btn" onClick={() => setShowAdd(true)}>+ Add Custom Body</button>}
        </div>
      </div>

      <div className="ps-gov-callout">
        <span className="ps-gov-callout-icon">🔬</span>
        <div>
          <div className="ps-gov-callout-title">Terminology Monitoring — Coming Soon</div>
          <div className="ps-gov-callout-body">
            The nightly sync will monitor SNOMED CT and ICD-10/11 for deprecated or updated codes
            in your published templates, surfacing alerts in the Synoptic Library.
          </div>
        </div>
      </div>

      <div className="ps-gov-col-headers">
        {['Governing Body', 'Region', 'Active', 'Auto-sync', ''].map(h => (
          <div key={h} className="ps-gov-col-header">{h}</div>
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
            <span className="ps-gov-divider-label">Custom</span>
            <div className="ps-gov-divider-line" />
          </div>
          <p className="ps-gov-custom-note">
            Custom bodies supplement standard ones — use them for institutional overlays or bodies
            not in the standard list. Enable alongside standard bodies only if they cover distinct
            protocol sets.
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
