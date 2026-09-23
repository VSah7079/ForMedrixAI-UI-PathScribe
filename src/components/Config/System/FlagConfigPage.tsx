import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import '../../../pathscribe.css';
import { Flag } from '../../../services/flags/IFlagService';
import { IconKey } from '../../../types/smarttag.types';
import { flagService } from '../../../services';
import { COMP_AUDIT } from '../../../constants/computationalActions';
import { useAuditLog } from '../../Audit/useAuditLog';
import AutoCreatedBanner from '../../Flags/AutoCreatedBanner';

// ─── Constants ────────────────────────────────────────────────────────────────

// Data-key-stays-English, label-is-translated: 1-5 remain the real,
// stored Flag.severity values; this map only translates the
// displayed severity name.
const SEVERITY_LABEL_KEY: Record<number, string> = {
  1: 'flagConfigPage.severity.informational',
  2: 'flagConfigPage.severity.low',
  3: 'flagConfigPage.severity.medium',
  4: 'flagConfigPage.severity.high',
  5: 'flagConfigPage.severity.critical',
};

// Data-key-stays-English, label-is-translated: 'Case'/'Specimen'
// remain the real, stored Flag.level values, reused as the radio/
// filter/table display text everywhere this value appears.
const LEVEL_LABEL_KEY: Record<'Case' | 'Specimen', string> = {
  Case: 'flagConfigPage.levels.case',
  Specimen: 'flagConfigPage.levels.specimen',
};

// Real, internal icon-set identifiers (IconKey union) shown as-is —
// these are technical keys the admin matches against the icon system,
// not natural-language labels, so they're left untranslated per the
// "internal schema/data-key identifiers stay English" convention.
const ICON_KEY_OPTIONS: IconKey[] = [
  'ihc', 'fish', 'molecular', 'flow-cytometry',
  'cytogenetics', 'micro', 'coag', 'generic-lab',
];

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-flagcfg-toggle-row">
      <div
        onClick={() => onChange(!value)}
        className={`ps-flagcfg-toggle-track ${value ? 'ps-flagcfg-toggle-track--on' : 'ps-flagcfg-toggle-track--off'}`}
      >
        <div className={`ps-flagcfg-toggle-knob ${value ? 'ps-flagcfg-toggle-knob--on' : 'ps-flagcfg-toggle-knob--off'}`} />
      </div>
      <span className={`ps-flagcfg-toggle-label ${value ? 'ps-flagcfg-toggle-label--on' : 'ps-flagcfg-toggle-label--off'}`}>
        {value ? t('common.active') : t('common.inactive')}
      </span>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const FlagConfigPage: React.FC = () => {
  const { t } = useTranslation();
  const { log } = useAuditLog();
  const modalRef = useRef<HTMLDivElement>(null);
  const [flags,         setFlags]         = useState<Flag[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [editingFlag,   setEditingFlag]   = useState<Flag | null>(null);
  useFocusTrap(modalRef, showModal);

  // ── Form state ────────────────────────────────────────────────────────────
  const [name,          setName]          = useState('');
  const [description,   setDescription]   = useState('');
  const [level,         setLevel]         = useState<'Case' | 'Specimen'>('Case');
  const [lisCode,       setLisCode]       = useState('');
  const [active,        setActive]        = useState(true);
  const [severity,      setSeverity]      = useState<1|2|3|4|5>(1);

  // Icon is now a universal field, not gated behind a Computational/
  // Administrative toggle — that distinction turned out to be
  // vestigial (see IFlagService.ts's Flag.tagClass comment) and its
  // removal fixed a real bug: FlagManagerModal was filtering out every
  // COMPUTATIONAL-tagged flag, hiding them from the only place a flag
  // could actually be applied.
  const [iconKey,          setIconKey]          = useState<IconKey>('generic-lab');

  // ── Filter state ──────────────────────────────────────────────────────────
  const [errors,        setErrors]        = useState<{ name?: string }>({});
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState<'All' | 'Active' | 'Inactive'>('All');
  const [levelFilter,   setLevelFilter]   = useState<'All' | 'Case' | 'Specimen'>('All');
  const [reviewingAutoCreated, setReviewingAutoCreated] = useState(false);

  useEffect(() => { loadFlags(); }, []);

  const loadFlags = async () => {
    setLoading(true);
    const res = await flagService.getAll();
    if (res.ok) setFlags(res.data);
    setLoading(false);
  };

  // ── Auto-created flags ────────────────────────────────────────────────────

  const autoCreatedFlags = flags.filter(f => f.autoCreated && f.status === 'Active');

  const handleReviewAutoCreated = () => {
    setReviewingAutoCreated(true);
    setSearch('');
    setStatusFilter('All');
    setLevelFilter('All');
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const resetForm = () => {
    setName(''); setDescription(''); setLevel('Case'); setLisCode('');
    setActive(true); setSeverity(1);
    setIconKey('generic-lab'); setErrors({});
  };

  const openAddModal = () => {
    setEditingFlag(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (flag: Flag) => {
    setEditingFlag(flag);
    setName(flag.name);
    setDescription(flag.description ?? '');
    setLevel(flag.level);
    setLisCode(flag.lisCode);
    setActive(flag.status === 'Active');
    setSeverity(flag.severity);
    setIconKey(flag.iconKey ?? 'generic-lab');
    setErrors({});
    setShowModal(true);
  };

  const requestSave = () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = t('flagConfigPage.modal.nameRequiredError');
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setShowModal(false);
    setShowConfirm(true);
  };

  const buildPayload = (): Omit<Flag, 'id'> => ({
    name, description, level, lisCode, severity, iconKey,
    status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
    autoCreated: false,
  });

  const confirmSave = async () => {
    const payload = buildPayload();

    if (editingFlag) {
      const res = await flagService.update(editingFlag.id, payload);
      if (res.ok) {
        setFlags(prev => prev.map(f => f.id === res.data.id ? res.data : f));
        // Audit: track changes
        const changes: string[] = [];
        if (name        !== editingFlag.name)                         changes.push('name');
        if (description !== (editingFlag.description ?? ''))          changes.push('description');
        if (lisCode     !== (editingFlag.lisCode ?? ''))              changes.push('lisCode');

        if (!active && editingFlag.status === 'Active') {
          log(COMP_AUDIT.CONFIG_FLAG_DEACTIVATED, { flagId: editingFlag.id, flagName: editingFlag.name });
        }
        if (changes.length > 0) {
          log(COMP_AUDIT.CONFIG_FLAG_UPDATED, { flagId: editingFlag.id, changes });
        }
      }
    } else {
      const res = await flagService.add(payload);
      if (res.ok) {
        setFlags(prev => [...prev, res.data]);
        // Audit: new flag
        log(COMP_AUDIT.CONFIG_FLAG_CREATED, {
          flagId: res.data.id, flagName: name, lisCode
        });
      }
    }
    setShowConfirm(false);
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = flags.filter(f => {
    if (reviewingAutoCreated) return !!f.autoCreated;
    const matchSearch = !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.lisCode ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' ||
      (statusFilter === 'Active' ? f.status === 'Active' : f.status === 'Inactive');
    const matchLevel  = levelFilter === 'All' || f.level === levelFilter;
    return matchSearch && matchStatus && matchLevel;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Auto-created banner ── */}
      {autoCreatedFlags.length > 0 && (
        <AutoCreatedBanner flags={autoCreatedFlags} onReview={handleReviewAutoCreated} />
      )}

      {reviewingAutoCreated && (
        <div className="ps-flagcfg-reviewbar">
          <span className="ps-flagcfg-reviewbar-text">
            {t('flagConfigPage.autoCreatedReviewBanner', { count: autoCreatedFlags.length })}
          </span>
          <button className="ps-conf-btn-secondary" onClick={() => setReviewingAutoCreated(false)}>
            {t('flagConfigPage.clearFilterButton')}
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('flagConfigPage.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('flagConfigPage.subtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary" onClick={openAddModal}>{t('flagConfigPage.addFlagButton')}</button>
      </div>

      {/* ── Filters ── */}
      {!reviewingAutoCreated && (
        <div className="ps-flagcfg-filters-row">
          <input
            type="text"
            placeholder={t('flagConfigPage.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-conf-search ps-flagcfg-search--flex"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
            <option value="All">{t('flagConfigPage.statusFilter.all')}</option>
            <option value="Active">{t('common.active')}</option>
            <option value="Inactive">{t('common.inactive')}</option>
          </select>
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value as any)} className="ps-conf-select">
            <option value="All">{t('flagConfigPage.levelFilter.all')}</option>
            <option value="Case">{t(LEVEL_LABEL_KEY.Case)}</option>
            <option value="Specimen">{t(LEVEL_LABEL_KEY.Specimen)}</option>
          </select>
        </div>
      )}

      {/* ── Table ── */}
      <table className="ps-flagcfg-table">
        <thead>
          <tr>
            <th className="ps-conf-th">{t('flagConfigPage.headers.name')}</th>
            <th className="ps-conf-th">{t('flagConfigPage.headers.level')}</th>
            <th className="ps-conf-th">{t('flagConfigPage.headers.lisCode')}</th>
            <th className="ps-conf-th">{t('flagConfigPage.headers.severity')}</th>
            <th className="ps-conf-th">{t('flagConfigPage.headers.status')}</th>
            <th className="ps-conf-th">{t('flagConfigPage.headers.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(flag => (
            <tr key={flag.id}>
              <td className="ps-conf-td">
                {flag.name}
                {flag.autoCreated && (
                  <span className="ps-flagcfg-lis-badge">
                    {t('flagConfigPage.lisImportBadge')}
                  </span>
                )}
              </td>
              <td className="ps-conf-td ps-flagcfg-td-muted">{t(LEVEL_LABEL_KEY[flag.level])}</td>
              <td className="ps-conf-td ps-flagcfg-td-muted">{flag.lisCode}</td>
              <td className="ps-conf-td ps-flagcfg-td-muted">
                {t(SEVERITY_LABEL_KEY[flag.severity])} ({flag.severity})
              </td>
              <td className="ps-conf-td">
                <div className="ps-flagcfg-status-wrap">
                  <span className={`ps-flagcfg-status-dot ${flag.status === 'Active' ? 'ps-flagcfg-status-dot--active' : 'ps-flagcfg-status-dot--inactive'}`} />
                  <span className={`ps-flagcfg-status-text ${flag.status === 'Active' ? 'ps-flagcfg-status-text--active' : 'ps-flagcfg-status-text--inactive'}`}>
                    {flag.status === 'Active' ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
              </td>
              <td className="ps-conf-td">
                <button className="ps-conf-btn-row" onClick={() => openEditModal(flag)}>{t('common.edit')}</button>
              </td>
            </tr>
          ))}
          {!loading && filtered.length === 0 && (
            <tr>
              <td className="ps-conf-td ps-flagcfg-td-muted" colSpan={7}>
                {t('flagConfigPage.emptyRow')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal fm-modal--config ps-flagcfg-modal--wide" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="flag-modal-title"
            onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">{t('flagConfigPage.modal.eyebrow')}</div>
                <h2 id="flag-modal-title" className="fm-title fm-title--sm">{editingFlag ? t('flagConfigPage.modal.editTitle') : t('flagConfigPage.modal.createTitle')}</h2>
              </div>
            </div>
            <div className="ps-client-editor-body">

              {/* No more Administrative/Computational toggle here — that
                  distinction turned out to be vestigial (see
                  IFlagService.ts's Flag.tagClass comment) and removing
                  it fixed a real bug: FlagManagerModal was filtering
                  out every COMPUTATIONAL-tagged flag, hiding them from
                  the only place a flag could actually be applied.
                  Every flag is just a flag now — one form, one set of
                  fields, attachable to a case, a specimen, or both. */}
              <label className="ps-conf-label">{t('flagConfigPage.modal.nameLabel')} <span className="ps-flagcfg-required-mark">*</span></label>
              <input value={name} onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: '' })); }}
                className={`ps-conf-input ps-flagcfg-name-input ${errors.name ? 'ps-flagcfg-name-input--error' : ''}`} placeholder={t('flagConfigPage.modal.namePlaceholder')} />
              {errors.name && <div className="ps-flagcfg-error-text">{errors.name}</div>}

              <label className="ps-conf-label">{t('flagConfigPage.modal.descriptionLabel')}</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="ps-conf-input ps-flagcfg-description-textarea" placeholder={t('flagConfigPage.modal.descriptionPlaceholder')} />

              <div className="ps-flagcfg-field-row">
                <div className="ps-flagcfg-field-flex1">
                  <label className="ps-conf-label">{t('flagConfigPage.modal.levelLabel')}</label>
                  <div className="ps-flagcfg-level-radios">
                    {(['Case', 'Specimen'] as const).map(l => (
                      <label key={l} className="ps-flagcfg-level-radio-label">
                        <input type="radio" checked={level === l} onChange={() => setLevel(l)} />
                        {t(LEVEL_LABEL_KEY[l])}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="ps-flagcfg-field-flex1">
                  <label className="ps-conf-label">{t('flagConfigPage.modal.severityLabel')}</label>
                  <select value={severity} onChange={e => setSeverity(Number(e.target.value) as 1|2|3|4|5)} className="ps-conf-input ps-flagcfg-input--nomb">
                    {Object.entries(SEVERITY_LABEL_KEY).map(([v, key]) => <option key={v} value={v}>{v} — {t(key)}</option>)}
                  </select>
                </div>
              </div>

              <div className="ps-flagcfg-field-row">
                <div className="ps-flagcfg-field-flex1">
                  <label className="ps-conf-label">{t('flagConfigPage.modal.lisCodeLabel')}</label>
                  <input value={lisCode} onChange={e => setLisCode(e.target.value)}
                    className="ps-conf-input ps-flagcfg-input--nomb" placeholder={t('flagConfigPage.modal.lisCodePlaceholder')} />
                </div>
                <div className="ps-flagcfg-icon-field">
                  <label className="ps-conf-label">{t('flagConfigPage.modal.iconLabel')}</label>
                  <select className="ps-conf-input ps-flagcfg-input--nomb" value={iconKey} onChange={e => setIconKey(e.target.value as IconKey)}>
                    {ICON_KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>

            <label className="ps-conf-label ps-flagcfg-status-label">{t('flagConfigPage.modal.statusLabel')}</label>
            <Toggle value={active} onChange={setActive} />

            </div>{/* /body */}
            <div className="fm-footer">
              <span className="fm-footer-status" />
              <div className="ps-flagcfg-footer-actions">
                <button onClick={() => setShowModal(false)} className="fm-btn-cancel">{t('common.cancel')}</button>
                <button onClick={requestSave} className="fm-btn-apply">{t('common.save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {showConfirm && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal fm-modal--config ps-flagcfg-modal--narrow" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">{t('flagConfigPage.modal.eyebrow')}</div>
                <h2 className="fm-title fm-title--sm">{editingFlag ? t('flagConfigPage.modal.saveChangesTitle') : t('flagConfigPage.modal.createTitle')}</h2>
              </div>
            </div>
            <div className="ps-client-editor-body">
              <p className="ps-flagcfg-confirm-text">
                {t('flagConfigPage.modal.confirmText')}
              </p>
            </div>
            <div className="fm-footer">
              <span className="fm-footer-status" />
              <div className="ps-flagcfg-footer-actions">
                <button onClick={() => setShowConfirm(false)} className="fm-btn-cancel">{t('common.cancel')}</button>
                <button onClick={confirmSave} className="fm-btn-apply">{t('common.confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FlagConfigPage;
