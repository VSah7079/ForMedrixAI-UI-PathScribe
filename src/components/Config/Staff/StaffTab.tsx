import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { VOICE_PROFILES, type VoiceProfileId } from '../../../constants/voiceProfiles';
import '../../../pathscribe.css';
import RoleDictionary, { Role, DEFAULT_ROLES } from './RoleDictionary';
import FppeAssignmentsSection from '../System/FppeAssignmentsSection';
import CytotechCompetencyAssignmentsSection from '../System/CytotechCompetencyAssignmentsSection';
import { userService, subspecialtyService, roleService, Subspecialty } from '../../../services';
import { ServiceResult } from '../../../services/types';
import { Dropdown } from '@/components/Common/Dropdown';

// i18n note (batch 117): role names (Role.name / StaffUser.roles),
// subspecialty names (Subspecialty.name), and VOICE_PROFILES' own
// labels (a shared, data-driven accent/language catalog defined in
// constants/voiceProfiles.ts, not authored chrome in this file) are
// all persisted/configured data and stay untranslated. StaffUser.status
// ('Active' | 'Inactive') is a persisted enum rendered in two places
// (Toggle and the StaffMembers table), so it goes through the
// STATUS_LABEL_KEY indirection below — same pattern as
// protocolShared.tsx's LIFECYCLE_LABEL_KEY — leaving the underlying
// comparison value (`u.status === 'Active'`) untouched.
const STATUS_LABEL_KEY: Record<'Active' | 'Inactive', string> = {
  Active: 'staffTab.status.active',
  Inactive: 'staffTab.status.inactive',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  credentials?: string;
  email: string;
  roles: string[];
  npi: string;
  gmcNumber?: string;
  license: string;
  phone: string;
  signatureUrl?: string;
  status: 'Active' | 'Inactive';
  voiceProfile?: string | null;
  canViewPediatric?: boolean;
  canViewOrchestration?: boolean;
  /** Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
   *  Intraoperative/Frozen Section Dashboard's own Quick Auth flow.
   *  NOTE: this file declares its own, local StaffUser instead of
   *  importing the real one from services/users/IUserService.ts —
   *  confirmed directly this is a real, pre-existing duplication
   *  (not introduced here); this field has to be kept in sync by
   *  hand across both until that's consolidated. */
  quickAuthPin?: string;
}

function initials(u: StaffUser) {
  const parts = [u.firstName, (u as any).middleName, u.lastName].filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : (parts[0]?.[0] ?? '?').toUpperCase();
}
function fullName(u: StaffUser) {
  return [u.firstName, (u as any).middleName, u.lastName].filter(Boolean).join(' ');
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-st-toggle-wrap">
      <div onClick={() => onChange(!value)} className={`ps-st-toggle-track ${value ? 'ps-st-toggle-track--on' : 'ps-st-toggle-track--off'}`}>
        <div className={`ps-st-toggle-thumb ${value ? 'ps-st-toggle-thumb--on' : 'ps-st-toggle-thumb--off'}`} />
      </div>
      <span className={value ? 'ps-st-toggle-label--on' : 'ps-st-toggle-label--off'}>
        {t(value ? STATUS_LABEL_KEY.Active : STATUS_LABEL_KEY.Inactive)}
      </span>
    </div>
  );
};

// ─── Signature Upload ─────────────────────────────────────────────────────────

const SignatureUpload = ({ url, onChange }: { url?: string; onChange: (url: string) => void }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };
  return (
    <div className="ps-st-sig-wrap">
      {url ? (
        <div className="ps-st-sig-preview">
          <div className="ps-st-sig-img-wrap">
            <img src={url} alt={t('staffTab.signatureUpload.alt')} className="ps-st-sig-img" />
          </div>
          <button onClick={() => onChange('')} className="ps-st-sig-remove">{t('common.remove')}</button>
        </div>
      ) : (
        <div className="ps-st-sig-dropzone" onClick={() => ref.current?.click()}>
          &#128444;&nbsp; {t('staffTab.signatureUpload.uploadPrompt')}
          <div className="ps-st-sig-hint">{t('staffTab.signatureUpload.formatHint')}</div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="ps-st-file-input-hidden" onChange={handleFile} />
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

type Draft = {
  firstName: string; middleName: string; lastName: string; credentials: string;
  email: string; roles: string[]; npi: string; gmcNumber: string; license: string;
  phone: string; signatureUrl: string; active: boolean;
  voiceProfile: string; canViewPediatric: boolean; canViewOrchestration: boolean;
  /** Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
   *  Intraoperative/Frozen Section Dashboard's own Quick Auth flow —
   *  only meaningful for a real 'Or Staff' user; see
   *  resolveStaffByQuickAuthPin.ts for how this is actually used. */
  quickAuthPin: string;
  /** Real fix, per direct confirmation: replaces the old free-text
   *  "Department" field — redundant with the real Subspecialties
   *  dictionary, which already existed (StaffTab.tsx already loaded
   *  subspecialtyService and showed a read-only "Subspecialties"
   *  column), just had no way to assign it from this editor. Local,
   *  modal-only state — the real relationship lives on
   *  Subspecialty.userIds, not on StaffUser itself; diffed against the
   *  original membership and applied via subspecialtyService.assignUser/
   *  removeUser in the parent's handleSave, after the real user id is
   *  known (needed for 'add' mode, where no id exists until save). */
  subspecialtyIds: string[];
};

const emptyDraft: Draft = {
  firstName: '', middleName: '', lastName: '', credentials: '', email: '',
  roles: [], npi: '', gmcNumber: '', license: '', phone: '',
  signatureUrl: '', active: true, voiceProfile: '', canViewPediatric: false,
  canViewOrchestration: false, subspecialtyIds: [], quickAuthPin: '',
};

interface StaffModalProps {
  mode: 'add' | 'edit';
  user?: StaffUser;
  roles: Role[];
  subspecialties: Subspecialty[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const StaffModal: React.FC<StaffModalProps> = ({ mode, user, roles, subspecialties, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(
    user ? {
      firstName: user.firstName, middleName: (user as any).middleName || '',
      lastName: user.lastName, credentials: user.credentials || '',
      email: user.email, roles: [...user.roles], npi: user.npi,
      gmcNumber: user.gmcNumber || '', license: user.license, phone: user.phone,
      signatureUrl: user.signatureUrl || '',
      active: user.status === 'Active', voiceProfile: user.voiceProfile || '',
      canViewPediatric: user.canViewPediatric ?? false,
      canViewOrchestration: (user as any).canViewOrchestration ?? false,
      subspecialtyIds: subspecialties.filter(s => s.userIds.includes(user.id)).map(s => s.id),
      quickAuthPin: user.quickAuthPin || '',
    } : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  const set = (k: keyof Draft, v: any) => {
    setDraft(prev => ({ ...prev, [k]: v }));
    setErrors(prev => ({ ...prev, [k]: '' }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.firstName.trim()) e.firstName = t('common.required');
    if (!draft.lastName.trim())  e.lastName  = t('common.required');
    if (draft.roles.length === 0) e.roles = t('staffTab.validation.atLeastOneRole');
    if (draft.email.trim() && !/\S+@\S+\.\S+/.test(draft.email)) e.email = t('staffTab.validation.invalidEmail');
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal" onClick={e => e.stopPropagation()}>

        <div className="ps-conf-modal-header ps-st-modal-header">
          <span>{mode === 'add' ? t('staffTab.modal.addStaffMember') : t('staffTab.modal.editTitle', { name: [user?.firstName, (user as any)?.middleName, user?.lastName].filter(Boolean).join(' ') })}</span>
          <button onClick={onClose} className="ps-st-modal-close" aria-label={t('common.close')}>✕</button>
        </div>

        <div className="ps-conf-modal-body">

          {/* Row 1: First | Middle | Last */}
          <div className="ps-conf-form-row--3">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.firstNameLabel')} <span className="ps-st-required">*</span></label>
              <input className={`ps-conf-input ${errors.firstName ? 'ps-conf-input--error' : ''}`}
                value={draft.firstName} onChange={e => set('firstName', e.target.value)} placeholder={t('staffTab.modal.firstNamePlaceholder')} />
              {errors.firstName && <span className="ps-st-error" data-phi="name">{errors.firstName}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.middleNameLabel')}</label>
              <input className="ps-conf-input" value={draft.middleName} onChange={e => set('middleName', e.target.value)} placeholder={t('staffTab.modal.middleNamePlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.lastNameLabel')} <span className="ps-st-required">*</span></label>
              <input className={`ps-conf-input ${errors.lastName ? 'ps-conf-input--error' : ''}`}
                value={draft.lastName} onChange={e => set('lastName', e.target.value)} placeholder={t('staffTab.modal.lastNamePlaceholder')} />
              {errors.lastName && <span className="ps-st-error" data-phi="name">{errors.lastName}</span>}
            </div>
          </div>

          {/* Row 2: Email | Role */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.emailLabel')}</label>
              <input className={`ps-conf-input ${errors.email ? 'ps-conf-input--error' : ''}`}
                value={draft.email} onChange={e => set('email', e.target.value)} placeholder={t('staffTab.modal.emailPlaceholder')} />
              {errors.email && <span className="ps-st-error">{errors.email}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.roleLabel')} <span className="ps-st-required">*</span></label>
              {draft.roles.length > 0 && (
                <div className="ps-st-role-chips">
                  {draft.roles.map(rName => {
                    const roleObj = roles.find(x => x.name === rName);
                    const color   = roleObj?.color ?? '#8AB4F8';
                    return (
                      <span key={rName} className="ps-st-role-chip"
                        style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                        {rName}
                        <span className="ps-st-role-chip-x" style={{ color }}
                          onClick={() => set('roles', draft.roles.filter(x => x !== rName))}>×</span>
                      </span>
                    );
                  })}
                </div>
              )}
              <Dropdown
                placeholder={t('staffTab.modal.rolePlaceholder')}
                options={roles.filter(r => r.name !== 'Physician' && !draft.roles.includes(r.name)).map(r => ({ value: r.name, label: r.name }))}
                emptyText={t('staffTab.modal.roleEmptyText')}
                onSelect={val => { if (val && !draft.roles.includes(val)) set('roles', [...draft.roles, val]); }}
              />
              {errors.roles && <span className="ps-st-error">{errors.roles}</span>}
            </div>
          </div>

          {/* Row 3: Phone */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('staffTab.modal.phoneLabel')}</label>
            <input className="ps-conf-input" value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder={t('staffTab.modal.phonePlaceholder')} />
          </div>

          {/* Real fix, per direct confirmation: replaces the old
              free-text Department field — redundant with the real
              Subspecialties dictionary, which is a better fit here. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('staffTab.modal.subspecialtiesLabel')}</label>
            {draft.subspecialtyIds.length > 0 && (
              <div className="ps-st-role-chips">
                {draft.subspecialtyIds.map(id => {
                  const sub = subspecialties.find(s => s.id === id);
                  if (!sub) return null;
                  return (
                    <span key={id} className="ps-st-role-chip ps-st-role-chip--subspecialty">
                      {sub.name}
                      <span className="ps-st-role-chip-x ps-st-role-chip-x--subspecialty"
                        onClick={() => set('subspecialtyIds', draft.subspecialtyIds.filter(x => x !== id))}>×</span>
                    </span>
                  );
                })}
              </div>
            )}
            <Dropdown
              placeholder={t('staffTab.modal.subspecialtyPlaceholder')}
              options={subspecialties.filter(s => s.active !== false && !draft.subspecialtyIds.includes(s.id)).map(s => ({ value: s.id, label: s.name }))}
              emptyText={t('staffTab.modal.subspecialtyEmptyText')}
              onSelect={val => { if (val && !draft.subspecialtyIds.includes(val)) set('subspecialtyIds', [...draft.subspecialtyIds, val]); }}
            />
          </div>

          {/* Row 4: Credentials */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('staffTab.modal.credentialsLabel')} <span className="ps-st-label-note">{t('staffTab.modal.credentialsNote')}</span></label>
            <input className="ps-conf-input" value={draft.credentials} onChange={e => set('credentials', e.target.value)} placeholder={t('staffTab.modal.credentialsPlaceholder')} />
          </div>

          {/* Row 5: NPI | GMC */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.npiLabel')} <span className="ps-st-label-note">{t('staffTab.modal.npiNote')}</span></label>
              <input className="ps-conf-input" value={draft.npi} onChange={e => set('npi', e.target.value)} placeholder={t('staffTab.modal.npiPlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.gmcLabel')} <span className="ps-st-label-note">{t('staffTab.modal.gmcNote')}</span></label>
              <input className="ps-conf-input" value={draft.gmcNumber} onChange={e => set('gmcNumber', e.target.value)} placeholder={t('staffTab.modal.gmcPlaceholder')} />
            </div>
          </div>

          {/* Row 6: License | Voice Profile */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.licenseLabel')}</label>
              <input className="ps-conf-input" value={draft.license} onChange={e => set('license', e.target.value)} placeholder={t('staffTab.modal.licensePlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.voiceProfileLabel')}</label>
              <select value={draft.voiceProfile} onChange={e => set('voiceProfile', e.target.value)} className="ps-conf-select">
                <option value="">{t('staffTab.modal.voiceProfileDefault')}</option>
                {VOICE_PROFILES.map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 7: Pediatric Access */}
          <div className={`ps-st-peds-row ${draft.canViewPediatric ? 'ps-st-peds-row--on' : 'ps-st-peds-row--off'}`}>
            <label className="ps-st-peds-label">
              <input type="checkbox" checked={draft.canViewPediatric}
                onChange={e => setDraft(d => ({ ...d, canViewPediatric: e.target.checked }))}
                className="ps-st-peds-checkbox" />
              <div>
                <div className={draft.canViewPediatric ? 'ps-st-peds-title--on' : 'ps-st-peds-title--off'}>
                  {t('staffTab.modal.pediatricAccessTitle')}
                </div>
                <div className="ps-st-peds-desc">
                  {t('staffTab.modal.pediatricAccessDesc')}
                </div>
              </div>
            </label>
          </div>

          {/* Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
              Intraoperative/Frozen Section Dashboard's own Quick Auth
              flow — only meaningful for a real 'Or Staff' user, since
              lab staff keep using the existing, real login. */}
          {draft.roles.includes('Or Staff') && (
            <div className="ps-mt-16">
              <label className="ps-label" htmlFor="staff-quick-auth-pin">{t('staffTab.modal.quickAuthPinLabel')}</label>
              <input id="staff-quick-auth-pin" className="ps-conf-input" maxLength={4} inputMode="numeric"
                value={draft.quickAuthPin} onChange={e => setDraft(d => ({ ...d, quickAuthPin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder={t('staffTab.modal.quickAuthPinPlaceholder')} />
              <p className="ps-conf-section-subtitle ps-mt-4">
                {t('staffTab.modal.quickAuthPinDesc')}
              </p>
            </div>
          )}

          {/* Row 7b: Orchestration Access — reuses the ps-st-peds-* classes
              (a generic access-toggle-row style, not pediatric-specific
              despite the name) rather than introducing new CSS rules. */}
          <div className={`ps-st-peds-row ${draft.canViewOrchestration ? 'ps-st-peds-row--on' : 'ps-st-peds-row--off'}`}>
            <label className="ps-st-peds-label">
              <input type="checkbox" checked={draft.canViewOrchestration}
                onChange={e => setDraft(d => ({ ...d, canViewOrchestration: e.target.checked }))}
                className="ps-st-peds-checkbox" />
              <div>
                <div className={draft.canViewOrchestration ? 'ps-st-peds-title--on' : 'ps-st-peds-title--off'}>
                  {t('staffTab.modal.orchestrationAccessTitle')}
                </div>
                <div className="ps-st-peds-desc">
                  {t('staffTab.modal.orchestrationAccessDesc')}
                </div>
              </div>
            </label>
          </div>

          {/* Row 8: Status | Signature */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.statusLabel')}</label>
              <Toggle value={draft.active} onChange={v => set('active', v)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('staffTab.modal.signatureLabel')}</label>
              <SignatureUpload url={draft.signatureUrl} onChange={url => set('signatureUrl', url)} />
            </div>
          </div>

        </div>

        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={handleSave}>
            {mode === 'add' ? t('staffTab.modal.addStaffMember') : t('staffTab.modal.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Staff Members List ───────────────────────────────────────────────────────

const StaffMembers: React.FC<{ roles: Role[] }> = ({ roles }) => {
  const { t } = useTranslation();
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [users,      setUsers]     = useState<StaffUser[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [search,     setSearch]    = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [modal,      setModal]     = useState<{ mode: 'add' | 'edit'; user?: StaffUser } | null>(null);

  React.useEffect(() => {
    userService.getAll().then((res: ServiceResult<StaffUser[]>) => {
      if ('ok' in res && res.ok) setUsers(res.data || []);
      else if ('error' in res) console.error(res.error);
      setLoading(false);
    });
    subspecialtyService.getAll().then(res => { if (res.ok) setSubspecialties(res.data); });
  }, []);

  const userSubsMap: Record<string, string[]> = {};
  subspecialties.forEach(sub => {
    sub.userIds.forEach(uid => {
      if (!userSubsMap[uid]) userSubsMap[uid] = [];
      userSubsMap[uid].push(sub.name);
    });
  });

  if (loading) return <div className="ps-st-loading">{t('staffTab.list.loading')}</div>;

  const filtered = users.filter(u => {
    // Real, per direct guidance: widened from name/email only to every
    // real identifying field a staff person might actually be found
    // by — an admin who doesn't recall a name's spelling but has an
    // NPI, or is looking someone up by phone/license, shouldn't come
    // up empty. Each field checked defensively (a person can genuinely
    // have no credentials/GMC number) rather than assuming every field
    // is always populated.
    const q = search.toLowerCase();
    const matchesSearch = !q || [
      fullName(u), u.email, u.credentials, u.npi, u.gmcNumber, u.license, u.phone,
    ].some(field => field?.toLowerCase().includes(q));
    return matchesSearch && (roleFilter === 'All' || u.roles.includes(roleFilter));
  });

  const handleSave = async (draft: Draft) => {
    const payload = {
      firstName: draft.firstName, lastName: draft.lastName, credentials: draft.credentials,
      email: draft.email, roles: draft.roles, npi: draft.npi, gmcNumber: draft.gmcNumber,
      license: draft.license, phone: draft.phone, canViewPediatric: draft.canViewPediatric,
      canViewOrchestration: draft.canViewOrchestration,
      signatureUrl: draft.signatureUrl,
      status: (draft.active ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
      voiceProfile: draft.voiceProfile === '' ? undefined : (draft.voiceProfile as VoiceProfileId),
      quickAuthPin: draft.quickAuthPin === '' ? undefined : draft.quickAuthPin,
    };
    let savedUserId: string | undefined;
    if (modal?.mode === 'add') {
      const res = await userService.add(payload);
      if (res.ok) { setUsers(prev => [...prev, res.data]); savedUserId = res.data.id; }
    } else if (modal?.user) {
      const res = await userService.update(modal.user.id, payload);
      if (res.ok) { setUsers(prev => prev.map(u => u.id === res.data.id ? res.data : u)); savedUserId = res.data.id; }
    }

    // Real fix, per direct confirmation: replaces the old free-text
    // Department field. The real relationship lives on
    // Subspecialty.userIds, not on StaffUser — diff the modal's
    // selection against the user's actual, current membership and
    // apply only the real changes. Runs after the user record is
    // saved above, since 'add' mode has no real id to assign against
    // until that point.
    if (savedUserId) {
      const currentIds = subspecialties.filter(s => s.userIds.includes(savedUserId!)).map(s => s.id);
      const toAdd = draft.subspecialtyIds.filter(id => !currentIds.includes(id));
      const toRemove = currentIds.filter(id => !draft.subspecialtyIds.includes(id));
      await Promise.all([
        ...toAdd.map(id => subspecialtyService.assignUser(id, savedUserId!)),
        ...toRemove.map(id => subspecialtyService.removeUser(id, savedUserId!)),
      ]);
      if (toAdd.length || toRemove.length) {
        const res = await subspecialtyService.getAll();
        if (res.ok) setSubspecialties(res.data);
      }
    }

    setModal(null);
  };

  const renderStaffRow = (u: StaffUser) => {
    const subs = userSubsMap[u.id] || [];
    return (
      <tr key={u.id} className="ps-st-tr">
        <td className="ps-st-td">
          <div className="ps-st-member-cell">
            <div className="ps-st-avatar">{initials(u)}</div>
            <div>
              <span className="ps-st-name" data-phi="name">{fullName(u)}</span>
              {u.credentials && <span className="ps-st-credentials">{u.credentials}</span>}
              {u.canViewPediatric && <span className="ps-st-peds-badge">{t('staffTab.list.pedsBadge')}</span>}
              {(u as any).canViewOrchestration && <span className="ps-st-peds-badge">{t('staffTab.list.orchBadge')}</span>}
              {/* Real, small marker, per direct guidance: this table is
                  now grouped by primary role only, so a secondary role
                  wouldn't otherwise be obvious at a glance without
                  checking the Role column separately. Title attribute
                  names the real secondary role(s) directly on hover,
                  not just a bare count. */}
              {u.roles.length > 1 && (
                <span className="ps-st-multirole-badge" title={t('staffTab.list.alsoTooltip', { roles: u.roles.slice(1).join(', ') })}>
                  +{u.roles.length - 1}
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="ps-st-td ps-st-td--email">{u.email}</td>
        <td className="ps-st-td">
          <div className="ps-st-role-cell">
            {u.roles.slice(0, 2).map(r => {
              const roleObj = roles.find(x => x.name === r);
              const color   = roleObj?.color ?? '#8AB4F8';
              return (
                <span key={r} className="ps-st-role-badge"
                  style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}>
                  {r}
                </span>
              );
            })}
            {u.roles.length > 2 && (
              <span className="ps-st-role-more" title={u.roles.slice(2).join(', ')}>
                +{u.roles.length - 2}
              </span>
            )}
          </div>
        </td>
        <td className="ps-st-td">
          {subs.length === 0
            ? <span className="ps-st-sub-none">{t('staffTab.list.noSubspecialties')}</span>
            : <div className="ps-st-sub-cell">
                {subs.map(s => <span key={s} className="ps-st-sub-badge">{s}</span>)}
              </div>
          }
        </td>
        <td className="ps-st-td">
          <div className="ps-st-status-cell">
            <span className={`ps-st-status-dot ${u.status === 'Active' ? 'ps-st-status-dot--active' : 'ps-st-status-dot--inactive'}`} />
            <span className={u.status === 'Active' ? 'ps-st-status-label--active' : 'ps-st-status-label--inactive'}>
              {t(STATUS_LABEL_KEY[u.status])}
            </span>
          </div>
        </td>
        <td className="ps-st-td">
          <button className="ps-st-edit-btn" onClick={() => setModal({ mode: 'edit', user: u })}>{t('common.edit')}</button>
        </td>
      </tr>
    );
  };

  const STAFF_TABLE_HEADERS = [
    t('staffTab.list.headers.staffMember'),
    t('staffTab.list.headers.email'),
    t('staffTab.list.headers.role'),
    t('staffTab.list.headers.subspecialties'),
    t('staffTab.list.headers.status'),
    t('staffTab.list.headers.actions'),
  ];

  // Real, per direct guidance (Staff member Organized under Role) —
  // revised per direct follow-up: groups the same real `filtered` list
  // (search text already applied) into one section per real role,
  // scaling to however many real roles exist (6, 60, doesn't matter —
  // this always iterates the real, live `roles` list, never a fixed
  // count). A staff member with more than one role shows under their
  // FIRST/primary role only (`u.roles[0]`) in this default,
  // "All Roles" organizational view — never duplicated across every
  // role they hold, so the same real person isn't counted twice when
  // browsing the whole roster. Physician is excluded here for the same
  // reason the existing role filter above already excludes it —
  // directory-only, no app access, not staff organized the same way.
  //
  // When a SPECIFIC role is picked from the filter dropdown instead,
  // that's a deliberate, explicit query ("show me this role's real
  // members") — real membership via `.includes()` still applies there,
  // same as before this change, so filtering to "Admin" still finds a
  // real admin even when Admin isn't their primary role. Only the
  // default, unfiltered browsing view groups strictly by primary.
  const groupsToShow = (roleFilter === 'All' ? roles.filter(r => r.name !== 'Physician') : roles.filter(r => r.name === roleFilter))
    .map(r => ({
      role: r,
      members: filtered.filter(u => roleFilter === 'All' ? u.roles[0] === r.name : u.roles.includes(r.name)),
    }))
    .filter(g => g.members.length > 0);

  // Real, defensive bucket — a staff member whose own PRIMARY role
  // doesn't match any currently real, known role (e.g. a role was
  // renamed or deleted after being assigned) never silently disappears
  // from this screen entirely; shown only when "All Roles" is
  // selected, since a specific role filter is explicitly asking to see
  // just that role's real members.
  const unassigned = roleFilter === 'All' ? filtered.filter(u => !roles.some(r => r.name === u.roles[0])) : [];

  return (
    <div className="ps-st-root">
      <div className="ps-st-header">
        <div>
          <h2 className="ps-st-title">{t('staffTab.list.pageTitle')}</h2>
          <p className="ps-st-subtitle">{t('staffTab.list.pageSubtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>{t('staffTab.list.addStaffButton')}</button>
      </div>

      <div data-capture-hide="true" className="ps-st-filter-bar">
        <input type="text" placeholder={t('staffTab.list.searchPlaceholder')} value={search}
          onChange={e => setSearch(e.target.value)} className="ps-st-search" />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          title={t('staffTab.list.roleFilterTitle')} className="ps-st-role-filter">
          <option value="All">{t('staffTab.list.allRoles')}</option>
          {roles.filter(r => r.name !== 'Physician').map(r => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>
      </div>

      {groupsToShow.map(({ role, members }) => (
        <div key={role.id} data-capture-hide="true" className="ps-st-role-group">
          <div className="ps-st-role-group-header">
            <span className="ps-st-role-badge"
              style={{ color: role.color, background: `${role.color}22`, border: `1px solid ${role.color}44` }}>
              {role.name}
            </span>
            <span className="ps-st-role-group-count">{members.length}</span>
          </div>
          <div className="ps-st-table-wrap">
            <div className="ps-st-table-scroll">
              <table className="ps-st-table">
                <thead className="ps-st-thead">
                  <tr>{STAFF_TABLE_HEADERS.map(h => <th key={h} className="ps-st-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {members.map(renderStaffRow)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div data-capture-hide="true" className="ps-st-role-group">
          <div className="ps-st-role-group-header">
            <span className="ps-st-role-badge ps-st-role-badge--neutral">
              {t('staffTab.list.noMatchingRole')}
            </span>
            <span className="ps-st-role-group-count">{unassigned.length}</span>
          </div>
          <div className="ps-st-table-wrap">
            <div className="ps-st-table-scroll">
              <table className="ps-st-table">
                <thead className="ps-st-thead">
                  <tr>{STAFF_TABLE_HEADERS.map(h => <th key={h} className="ps-st-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {unassigned.map(renderStaffRow)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {groupsToShow.length === 0 && unassigned.length === 0 && (
        <div className="ps-st-table-wrap"><p className="ps-st-subtitle ps-st-empty-hint">{t('staffTab.list.noStaffMatch')}</p></div>
      )}

      {modal && <StaffModal mode={modal.mode} user={modal.user} roles={roles} subspecialties={subspecialties} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

// ─── Staff Shell (sub-tabs) ───────────────────────────────────────────────────

type StaffSubTab = 'members' | 'roles' | 'credentialing';

const StaffTab: React.FC = () => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<StaffSubTab>('members');
  const [roles,  setRoles]  = React.useState<Role[]>(DEFAULT_ROLES);

  // Real fix, per direct guidance (Staff member Organized under Role):
  // `roles` used to only ever become the real, live role list once an
  // admin happened to visit the Role Dictionary sub-tab first (via its
  // own onRolesChange callback) — landing directly on Staff Members
  // left this stuck at the 4 hardcoded DEFAULT_ROLES for the whole
  // session. A real, easy-to-miss gap that would have silently broken
  // the new role-grouped view below: any real custom role's own
  // members would never get a group at all, since no default role
  // name would match it. Same real fetch+mapping RoleDictionary.tsx
  // itself already does, so both stay genuinely in sync regardless of
  // which sub-tab loads first.
  React.useEffect(() => {
    roleService.getAll().then(res => {
      if (res.ok) {
        const mapped = res.data.map(r => ({
          ...r,
          canViewPediatric:     (r as any).canViewPediatric ?? false,
          participationTypeIds: r.participationTypeIds ?? [],
        })) as Role[];
        setRoles(mapped);
      }
    });
  }, []);

  return (
    <div>
      <div className="ps-st-tab-bar">
        <button className={`ps-st-tab ${subTab === 'members' ? 'ps-st-tab--active' : 'ps-st-tab--inactive'}`}
          onClick={() => setSubTab('members')}>{t('staffTab.tabs.members')}</button>
        <button className={`ps-st-tab ${subTab === 'roles' ? 'ps-st-tab--active' : 'ps-st-tab--inactive'}`}
          onClick={() => setSubTab('roles')}>{t('staffTab.tabs.roles')}</button>
        <button className={`ps-st-tab ${subTab === 'credentialing' ? 'ps-st-tab--active' : 'ps-st-tab--inactive'}`}
          onClick={() => setSubTab('credentialing')}>{t('staffTab.tabs.credentialing')}</button>
      </div>
      {subTab === 'members' && <StaffMembers roles={roles} />}
      {subTab === 'roles'   && <RoleDictionary onRolesChange={setRoles} />}
      {subTab === 'credentialing' && (
        <>
          <FppeAssignmentsSection />
          <CytotechCompetencyAssignmentsSection />
        </>
      )}
    </div>
  );
};

export default StaffTab;
