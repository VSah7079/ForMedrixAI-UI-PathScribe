// src/components/Config/System/FieldRequirementsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-359 (Batch 376): which fields each page requires before saving, for the
// administrator's own organisation. Locked fields are always required and
// show why; the others have a Required switch. The catalog, the rules and
// the save are in services/fieldRequirements/; this screen shows and
// dispatches.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import {
  fieldRequirementService, FIELD_REQUIREMENT_PAGE_IDS,
  type FieldRequirementPageId, type FieldGroup, type ResolvedFieldRequirement,
} from '@/services';
import { useCapabilities } from '@/hooks/useCapabilities';

const GROUPS: FieldGroup[] = ['patient', 'order', 'specimens', 'blocks', 'fixation', 'specimenDetails', 'revisions', 'criticalFindings',
  'holds', 'comments', 'delegation', 'biopsyArray', 'blockChanges', 'discordance', 'billingChanges'];

const FieldRequirementsSection: React.FC = () => {
  const { t } = useTranslation();
  const capabilities = useCapabilities();
  const canManage = capabilities.has('config:field-requirements:manage');
  const [page, setPage] = useState<FieldRequirementPageId>('accession');
  const [organisation, setOrganisation] = useState<{ id: string; name: string } | null>(null);
  const [fields, setFields] = useState<ResolvedFieldRequirement[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const org = await fieldRequirementService.sessionOrganisation();
    setOrganisation(org);
    setFields(await fieldRequirementService.forOrganisation(org?.id ?? null, page));
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (f: ResolvedFieldRequirement) => {
    if (!organisation) return;
    const r = await fieldRequirementService.setRequired(organisation.id, page, f.id, !f.required);
    setMessage(r.ok === false ? `fieldRequirements.refusals.${r.reason}` : null);
    await load();
  };

  return (
    <div className="ps-conf-page ps-fieldreq">
      <h2 className="ps-conf-section-title">{t('fieldRequirements.title')}</h2>
      <p className="ps-conf-section-subtitle">{t('fieldRequirements.subtitle')}</p>
      {message && <div className="ps-fieldreq-message" role="status">{t(message)}</div>}
      {!organisation && <p className="ps-fieldreq-note">{t('fieldRequirements.noOrganisation')}</p>}
      {organisation && !canManage && !capabilities.loading && <p className="ps-fieldreq-note">{t('fieldRequirements.readOnly')}</p>}

      <div className="ps-fieldreq-toolbar">
        <label className="ps-conf-label" htmlFor="fieldreq-page">{t('fieldRequirements.page')}</label>
        <select id="fieldreq-page" className="ps-conf-select ps-fieldreq-page" value={page} onChange={e => setPage(e.target.value as FieldRequirementPageId)}>
          {FIELD_REQUIREMENT_PAGE_IDS.map(p => <option key={p} value={p}>{t(`fieldRequirements.pages.${p}`)}</option>)}
        </select>
        {organisation && <span className="ps-fieldreq-org">{t('fieldRequirements.forOrganisation', { organisation: organisation.name })}</span>}
      </div>

      {GROUPS.map(g => {
        const inGroup = fields.filter(f => f.group === g);
        if (inGroup.length === 0) return null;
        return (
          <section key={g} className="ps-fieldreq-card" aria-labelledby={`fieldreq-${g}`}>
            <h3 id={`fieldreq-${g}`} className="ps-fieldreq-heading">{t(`fieldRequirements.groups.${g}`)}</h3>
            <ul className="ps-fieldreq-list">
              {inGroup.map(f => (
                <li key={f.id} className="ps-fieldreq-row">
                  <div className="ps-fieldreq-name">
                    <span className="ps-fieldreq-label">{t(`fieldRequirements.fields.${page}.${f.id}`)}</span>
                    {f.hint && <span className="ps-fieldreq-hint">{t(`fieldRequirements.hints.${f.hint}`)}</span>}
                    {!f.hint && f.perSpecimen && <span className="ps-fieldreq-hint">{t('fieldRequirements.perSpecimen')}</span>}
                    {!f.hint && f.perBlock && <span className="ps-fieldreq-hint">{t('fieldRequirements.perBlock')}</span>}
                    {f.autoFilled && <span className="ps-fieldreq-hint">{t('fieldRequirements.autoFilled')}</span>}
                  </div>
                  {f.locked ? (
                    <div className="ps-fieldreq-locked">
                      <span className="ps-fieldreq-badge ps-fieldreq-badge--locked">🔒 {t('fieldRequirements.alwaysRequired')}</span>
                      <span className="ps-fieldreq-reason">{t(`fieldRequirements.lockReasons.${f.lockReason}`)}</span>
                    </div>
                  ) : (
                    <label className="ps-fieldreq-switch">
                      <input type="checkbox" checked={f.required} disabled={!canManage || !organisation}
                        onChange={() => { void toggle(f); }} />
                      <span>{t('fieldRequirements.required')}</span>
                      {f.changed && <span className="ps-fieldreq-badge ps-fieldreq-badge--changed">{t('fieldRequirements.changedFromDefault')}</span>}
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

export default FieldRequirementsSection;
