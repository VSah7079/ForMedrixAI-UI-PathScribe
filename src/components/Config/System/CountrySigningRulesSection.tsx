// src/components/Config/System/CountrySigningRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-341 (Batch 335): System → Clinical Lookups → Country Signing Rules.
//
// The platform-level editor for each participation type's per-country
// profile: the local title, the three signing-authority flags (each either
// the platform default or an explicit yes/no), the regulatory basis, and,
// for a country-scoped role such as the UK Biomedical Scientist, whether it
// is offered in that country.
//
// Only a platform administrator may change these; everyone else sees them
// read-only. A single lab's exception stays in Participation Types → Edit.
// Every save needs a reason and is audited per participation type.
//
// Render and dispatch only: rows, permission, validation, provenance and
// audit are in services/participationTypes/countryProfileEditor.ts and
// saveCountryProfiles.ts.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auditService, participationTypeService } from '@/services';
import type { AuthorityFlag, ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';
import { AUTHORITY_FLAGS } from '@/services/participationTypes/IParticipationTypeService';
import {
  buildCountryProfileRows, canEditCountrySigningRules, changedCountryRowIds, COUNTRY_RULE_JURISDICTIONS,
  isCountryRowEditable, toggleCountryOffered, type CountryProfileRow, type FlagChoice,
} from '@/services/participationTypes/countryProfileEditor';
import { saveCountryProfilesWithAudit } from '@/services/participationTypes/saveCountryProfiles';
import { resolveAuditActor } from '@/services/participationTypes/saveParticipationType';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { formatDate } from '@/utils/formatDate';
import type { Jurisdiction } from '@/types/systemConfig';

const FLAG_CHOICES: FlagChoice[] = ['inherit', 'yes', 'no'];

const CountrySigningRulesSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const session = getSessionUser();
  const canEdit = canEditCountrySigningRules(session?.role);

  const [types, setTypes] = useState<ParticipationTypeRecord[]>([]);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('GB_EW');
  const [original, setOriginal] = useState<CountryProfileRow[]>([]);
  const [rows, setRows] = useState<CountryProfileRow[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback((j: Jurisdiction) => {
    participationTypeService.getAll().then(res => {
      if (res.ok === false) { setError(t('countrySigningRules.errors.loadFailed')); return; }
      setTypes(res.data);
      const built = buildCountryProfileRows(res.data, j);
      setOriginal(built);
      setRows(built);
    });
  }, [t]);

  useEffect(() => { load(jurisdiction); }, [load, jurisdiction]);

  const changed = changedCountryRowIds(original, rows);
  const dirty = changed.length > 0;

  const patchRow = (typeId: string, patch: (r: CountryProfileRow) => CountryProfileRow) => {
    setNotice(null);
    setRows(rs => rs.map(r => (r.typeId === typeId ? patch(r) : r)));
  };

  const discard = () => { setRows(original); setReason(''); setError(null); };

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveCountryProfilesWithAudit(
      { types, jurisdiction, original, edited: rows, actor: { ...resolveAuditActor(session), role: session?.role }, reason },
      { typeService: participationTypeService, auditService },
    );
    setBusy(false);
    if (res.ok === false) {
      const names = (res.typeIds ?? []).map(id => types.find(x => x.id === id)?.label ?? id).join(t('countrySigningRules.listSeparator'));
      setError(t(`countrySigningRules.errors.${res.code}`, { types: names }));
      return;
    }
    setNotice(t('countrySigningRules.saved', { count: res.savedTypeIds.length, country: t(`jurisdictionNames.${jurisdiction}`) }));
    setReason('');
    load(jurisdiction);
  };

  const flagOptionLabel = (row: CountryProfileRow, flag: AuthorityFlag, c: FlagChoice) => {
    if (c === 'inherit') {
      return t('countrySigningRules.flagInherit', { value: row.platformDefaults[flag] ? t('countrySigningRules.yes') : t('countrySigningRules.no') });
    }
    return c === 'yes' ? t('countrySigningRules.yes') : t('countrySigningRules.no');
  };

  const scopeLabel = (row: CountryProfileRow) =>
    row.scope === 'global' ? t('countrySigningRules.scope.global')
      : row.scope === 'offered' ? t('countrySigningRules.scope.offered')
        : t('countrySigningRules.scope.notOffered');

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('countrySigningRules.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('countrySigningRules.subtitle')}</p>
        </div>
      </div>

      <div className="ps-sub-info-box ps-csr-banner">
        {canEdit ? t('countrySigningRules.platformNotice') : t('countrySigningRules.readOnlyNotice')}
      </div>

      <div className="ps-csr-toolbar">
        <label className="ps-conf-label" htmlFor="ps-csr-country">{t('countrySigningRules.countryLabel')}</label>
        <select
          id="ps-csr-country"
          className="ps-conf-select ps-csr-country"
          value={jurisdiction}
          disabled={dirty}
          onChange={e => { setNotice(null); setError(null); setJurisdiction(e.target.value as Jurisdiction); }}
        >
          {COUNTRY_RULE_JURISDICTIONS.map(j => <option key={j} value={j}>{t(`jurisdictionNames.${j}`)}</option>)}
        </select>
        {dirty && <span className="ps-conf-hint ps-conf-hint--warning">{t('countrySigningRules.switchBlocked')}</span>}
      </div>

      {error && <p className="ps-conf-error-text">{error}</p>}
      {notice && <p className="ps-conf-hint ps-conf-hint--success">{notice}</p>}

      <div className="ps-csr-list">
        {rows.map(row => {
          const editable = canEdit && isCountryRowEditable(row);
          const isChanged = changed.includes(row.typeId);
          const titleId = `ps-csr-title-${row.typeId}`;
          const noteId = `ps-csr-note-${row.typeId}`;
          return (
            <div
              key={row.typeId}
              data-testid={`csr-row-${row.typeId}`}
              className={`ps-csr-card${isChanged ? ' ps-csr-card--changed' : ''}${row.scope === 'notOffered' ? ' ps-csr-card--muted' : ''}`}
              style={{ '--ps-hue': row.color } as React.CSSProperties}
            >
              <div className="ps-csr-card__head">
                <span className="ps-csr-card__dot" />
                <span className="ps-csr-card__type">{row.typeLabel}</span>
                {!row.active && <span className="ps-csr-badge">{t('countrySigningRules.inactive')}</span>}
                <span className={`ps-csr-badge ps-csr-badge--${row.scope}`}>{scopeLabel(row)}</span>
                {row.scope !== 'global' && canEdit && (
                  <button type="button" className="ps-conf-btn-row" onClick={() => patchRow(row.typeId, toggleCountryOffered)}>
                    {row.scope === 'offered' ? t('countrySigningRules.stopOffering') : t('countrySigningRules.offerHere')}
                  </button>
                )}
                {isChanged && <span className="ps-csr-badge ps-csr-badge--changed">{t('countrySigningRules.unsaved')}</span>}
              </div>

              <div className="ps-csr-grid">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label" htmlFor={titleId}>{t('countrySigningRules.localTitle')}</label>
                  <input
                    id={titleId}
                    className="ps-conf-input"
                    value={row.localTitle}
                    disabled={!editable}
                    placeholder={t('countrySigningRules.localTitlePlaceholder', { label: row.typeLabel })}
                    onChange={e => patchRow(row.typeId, r => ({ ...r, localTitle: e.target.value }))}
                  />
                </div>
                {AUTHORITY_FLAGS.map(flag => (
                  <div key={flag} className="ps-conf-form-field">
                    <label className="ps-conf-label" htmlFor={`ps-csr-${flag}-${row.typeId}`}>{t(`countrySigningRules.flags.${flag}`)}</label>
                    <select
                      id={`ps-csr-${flag}-${row.typeId}`}
                      className="ps-conf-select"
                      value={row.flags[flag]}
                      disabled={!editable}
                      onChange={e => patchRow(row.typeId, r => ({ ...r, flags: { ...r.flags, [flag]: e.target.value as FlagChoice } }))}
                    >
                      {FLAG_CHOICES.map(c => <option key={c} value={c}>{flagOptionLabel(row, flag, c)}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor={noteId}>{t('countrySigningRules.regulatoryNote')}</label>
                <textarea
                  id={noteId}
                  className="ps-conf-input ps-csr-note"
                  rows={2}
                  value={row.regulatoryNote}
                  disabled={!editable}
                  placeholder={t('countrySigningRules.regulatoryNotePlaceholder')}
                  onChange={e => patchRow(row.typeId, r => ({ ...r, regulatoryNote: e.target.value }))}
                />
              </div>

              {row.lastChange && (
                <div className="ps-conf-hint">
                  {t('countrySigningRules.lastChange', { name: row.lastChange.userName, date: formatDate(row.lastChange.at, i18n.language), reason: row.lastChange.reason ?? '—' })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="ps-conf-card ps-csr-savebar">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="ps-csr-reason">
              {t('countrySigningRules.reasonLabel')} <span className="ps-conf-required">*</span>
            </label>
            <input
              id="ps-csr-reason"
              className="ps-conf-input"
              value={reason}
              disabled={!dirty}
              placeholder={t('countrySigningRules.reasonPlaceholder')}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <div className="ps-csr-savebar__actions">
            <span className="ps-conf-hint">{dirty ? t('countrySigningRules.changedCount', { count: changed.length }) : t('countrySigningRules.noChanges')}</span>
            <button type="button" className="ps-conf-btn-secondary" disabled={!dirty || busy} onClick={discard}>{t('countrySigningRules.discard')}</button>
            <button type="button" className="ps-conf-btn-primary" disabled={!dirty || busy} onClick={save}>{t('countrySigningRules.save')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CountrySigningRulesSection;
