// src/components/Config/Integrations/CrosswalkSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real admin UI for the Specimen Code Crosswalk - closes a real gap
// flagged directly: services/orderIntake/'s SpecimenCodeCrosswalkEntry
// and its listCrosswalkEntries/addCrosswalkEntry methods were real and
// already implemented, with zero UI anywhere to view or manage them.
//
// Real, working end-to-end already, per direct investigation:
// resolveOrder() already consults this table on every incoming order,
// and already self-learns a new "pending" entry (createdBy: 'system')
// when nothing matches, rather than blocking. This screen is the
// missing piece: a place to SEE that table, add a real entry ahead of
// time (so a known facility code never has to self-learn at all), and
// tell system-learned entries apart from admin-confirmed ones.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '@/utils/csv';
import '../../../pathscribe.css';
import { orderIntakeService, facilityService, specimenDictionaryService, interfaceExceptionService } from '@/services';
import type { SpecimenCodeCrosswalkEntry } from '@/services/orderIntake/IOrderIntakeService';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import { SearchableCombobox } from '@/components/Common/SearchableCombobox';
import { findDuplicate } from '@/utils/validateUnique';

const CrosswalkSection: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SpecimenCodeCrosswalkEntry[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [dictionary, setDictionary] = useState<SpecimenEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newFacilityId, setNewFacilityId] = useState('');
  const [newExternalCode, setNewExternalCode] = useState('');
  const [newDictionaryEntryId, setNewDictionaryEntryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Real, new — per direct guidance on the Order Types & Inbound Rules
  // banner: a real, precise count of PENDING unmapped_order_code
  // InterfaceExceptions specifically (services/interfaceExceptions/) —
  // deliberately distinct from pendingCount below (self-learned
  // crosswalk entries that already exist in this table). An unmapped
  // stub means the crosswalk had NO entry at all, even after
  // self-learning — a real, different, upstream signal.
  const [pendingUnmappedStubCount, setPendingUnmappedStubCount] = useState(0);

  // ── Spreadsheet import/export — same two-step preview-then-apply
  // shape as Stain Dictionary/Specimen Dictionary, matched rather than
  // reinvented.
  const xwalkImportFileInputRef = useRef<HTMLInputElement>(null);
  type XwalkImportRow = { clientId: string; clientName: string; externalCode: string; dictionaryEntryId: string; entryName: string; existingId?: string; error?: string };
  const [xwalkImportPreview, setXwalkImportPreview] = useState<XwalkImportRow[] | null>(null);

  const refresh = () => {
    Promise.all([
      orderIntakeService.listCrosswalkEntries(),
      facilityService.getAll(),
      specimenDictionaryService.getAll(),
      interfaceExceptionService.getPending(),
    ]).then(([xwalkRes, facilitiesRes, dictRes, exceptionsRes]) => {
      if (xwalkRes.ok) setEntries(xwalkRes.data);
      if (facilitiesRes.ok) setFacilities(facilitiesRes.data);
      if (dictRes.ok) setDictionary(dictRes.data);
      if (exceptionsRes.ok) setPendingUnmappedStubCount(exceptionsRes.data.filter(e => e.eventType === 'unmapped_order_code').length);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const resolveFacilityName = (id: string) => facilities.find(c => c.id === id)?.name ?? id;
  const entryName = (id: string) => dictionary.find(d => d.id === id)?.name ?? id;

  const handleAdd = async () => {
    setError(null);
    if (!newFacilityId || !newExternalCode.trim() || !newDictionaryEntryId) {
      setError(t('crosswalkSection.addPanel.requiredError'));
      return;
    }
    // Real, confirmed risk this closes: mockOrderIntakeService.ts's own
    // resolveOrder() does a case-insensitive .find() on exactly this
    // clientId + externalCode combination when matching an incoming
    // specimen — .find() silently returns whichever colliding entry
    // happens to come first, which can mis-map a real specimen to the
    // wrong dictionary entry. Checked here, before save, not left to a
    // silent, ambiguous collision at real order-intake time. Same code
    // string is fine across two DIFFERENT facilities — only the exact
    // combination needs to be unique.
    const collision = findDuplicate(entries, { clientId: newFacilityId, externalCode: newExternalCode.trim() }, ['clientId', 'externalCode']);
    if (collision) {
      setError(t('crosswalkSection.addPanel.collisionError', { facility: resolveFacilityName(newFacilityId), code: newExternalCode.trim(), entry: entryName(collision.dictionaryEntryId) }));
      return;
    }
    setSaving(true);
    const res = await orderIntakeService.addCrosswalkEntry({
      clientId: newFacilityId,
      externalCode: newExternalCode.trim(),
      dictionaryEntryId: newDictionaryEntryId,
      createdBy: 'admin',
    });
    setSaving(false);
    if (res.ok === false) {
      setError(res.error);
    } else {
      setShowAdd(false);
      setNewFacilityId(''); setNewExternalCode(''); setNewDictionaryEntryId('');
      refresh();
    }
  };

  const handleDownloadCrosswalk = () => {
    const rows = entries.map(e => ({
      Facility: resolveFacilityName(e.clientId), ExternalCode: e.externalCode, ResolvesTo: entryName(e.dictionaryEntryId),
      Source: e.createdBy === 'system' ? 'Auto-learned' : 'Admin-confirmed',
    }));
    downloadCsv('SpecimenCodeCrosswalk.csv', toCsv(rows));
  };

  const handleXwalkFileUpload = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(t('crosswalkSection.upload.invalidFileType', { fileName: file.name }));
      return;
    }
    const text = await readFileAsText(file);
    const rows: any[] = parseCsv(text);

    const get = (row: any, ...keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); return ''; };
    const preview: XwalkImportRow[] = rows.map(row => {
        const facilityName = get(row, 'Facility', 'Client', 'facility', 'client');
        const externalCode = get(row, 'ExternalCode', 'External Code', 'externalCode');
        const specimenName = get(row, 'ResolvesTo', 'Resolves To', 'SpecimenType', 'Specimen Type', 'resolvesTo');

        const matchedFacility = facilities.find(c => c.name.toLowerCase() === facilityName.toLowerCase());
        const matchedEntry  = dictionary.find(d => d.name.toLowerCase() === specimenName.toLowerCase());
        const existing = matchedFacility
          ? entries.find(e => e.clientId === matchedFacility.id && e.externalCode.toLowerCase() === externalCode.toLowerCase())
          : undefined;

        let rowError: string | undefined;
        if (!facilityName || !matchedFacility) rowError = t('crosswalkSection.preview.errors.facilityNotFound', { facilityName });
        else if (!externalCode) rowError = t('crosswalkSection.preview.errors.externalCodeRequired');
        else if (!specimenName || !matchedEntry) rowError = t('crosswalkSection.preview.errors.specimenTypeNotFound', { specimenName });

        return {
          clientId: matchedFacility?.id ?? '', clientName: facilityName,
          externalCode, dictionaryEntryId: matchedEntry?.id ?? '', entryName: specimenName,
          existingId: existing?.id, error: rowError,
        };
    }).filter(r => r.externalCode || r.clientName);

    setXwalkImportPreview(preview);
  };

  const handleApplyXwalkImport = async () => {
    if (!xwalkImportPreview) return;
    const valid = xwalkImportPreview.filter(r => !r.error);
    await Promise.all(valid.map(r =>
      r.existingId
        ? orderIntakeService.updateCrosswalkEntry(r.existingId, { dictionaryEntryId: r.dictionaryEntryId })
        : orderIntakeService.addCrosswalkEntry({ clientId: r.clientId, externalCode: r.externalCode, dictionaryEntryId: r.dictionaryEntryId, createdBy: 'admin' })
    ));
    setXwalkImportPreview(null);
    refresh();
  };

  if (loading) return <div className="ps-conf-section-subtitle">{t('crosswalkSection.loading')}</div>;

  const pendingCount = entries.filter(e => e.createdBy === 'system').length;

  // ── Spreadsheet import/export — same two-step preview-then-apply
  // shape as Stain Dictionary/Specimen Dictionary, matched rather than
  // reinvented. Facility and specimen type are matched by NAME (not
  // id, which a real customer's spreadsheet has no way to know) —
  // unresolvable names are surfaced as a real, visible error on that
  // row rather than silently skipped or guessed at.
  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('crosswalkSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('crosswalkSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={handleDownloadCrosswalk}>{t('crosswalkSection.exportButton')}</button>
        <button className="ps-conf-btn-secondary" onClick={() => xwalkImportFileInputRef.current?.click()}>{t('crosswalkSection.importSpreadsheetButton')}</button>
        <input ref={xwalkImportFileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handleXwalkFileUpload(e.target.files[0]); e.target.value = ''; }} />
        <button className="ps-conf-btn-primary" onClick={() => setShowAdd(true)}>{t('crosswalkSection.addMappingButton')}</button>
      </div>

      {xwalkImportPreview && (
        <div className="ps-conf-import-preview">
          <p>
            {(() => {
              const readyCount = xwalkImportPreview.filter(r => !r.error).length;
              const updateCount = xwalkImportPreview.filter(r => !r.error && r.existingId).length;
              const newCount = xwalkImportPreview.filter(r => !r.error && !r.existingId).length;
              const skippedCount = xwalkImportPreview.filter(r => r.error).length;
              return skippedCount > 0
                ? t('crosswalkSection.preview.summaryWithErrors', { count: readyCount, updateCount, newCount, skippedCount })
                : t('crosswalkSection.preview.summaryNoErrors', { count: readyCount, updateCount, newCount });
            })()}
          </p>
          {xwalkImportPreview.filter(r => r.error).map((r, i) => (
            <div key={i} className="ps-conf-error-text">{r.clientName || t('crosswalkSection.preview.blankPlaceholder')} / {r.externalCode || t('crosswalkSection.preview.blankPlaceholder')}: {r.error}</div>
          ))}
          <button className="ps-conf-btn-primary" onClick={handleApplyXwalkImport} disabled={xwalkImportPreview.every(r => r.error)}>{t('crosswalkSection.preview.applyButton')}</button>
          <button className="ps-conf-btn-row" onClick={() => setXwalkImportPreview(null)}>{t('common.cancel')}</button>
        </div>
      )}

      {/* Real, new — per direct guidance: a real, prominent, actionable
          callout for pending unmapped_order_code InterfaceExceptions
          specifically (services/interfaceExceptions/) — a real,
          upstream signal distinct from pendingCount below (self-learned
          entries that already exist in THIS table). An unmapped stub
          means the crosswalk had no entry at all, even after
          self-learning. Deep-links into the real, independent
          Interface Log tab (?tab=interfaces), extended with a real
          ?search= term that its own filter already matches against
          eventType — no new filtering mechanism needed, confirmed
          directly before building this. Real, per the later Interface
          Log redesign: interfaces is now its own real top-level tab,
          not a pill within Error Log — this link was updated to match;
          the old ?tab=errors&pill=interfaces scheme still works too
          (AuditLogPage.tsx keeps real backward compat for it). */}
      {pendingUnmappedStubCount > 0 && (
        <div className="ps-conf-callout-banner">
          <span className="ps-conf-callout-banner-text">
            ⚠ <strong>{t('crosswalkSection.unmappedBanner.pendingReviewLabel')}</strong> {t('crosswalkSection.unmappedBanner.message', { count: pendingUnmappedStubCount })}
          </span>
          <button
            className="ps-conf-callout-banner-link"
            onClick={() => navigate('/audit?tab=interfaces&search=unmapped_order_code')}
          >
            {t('crosswalkSection.unmappedBanner.viewLink')}
          </button>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="ps-conf-section-subtitle ps-xwalk-pending-banner">
          {t('crosswalkSection.pendingBanner', { count: pendingCount })}
        </div>
      )}

      <div className="ps-conf-table-wrap ps-xwalk-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">{t('crosswalkSection.headers.facility')}</th>
              <th className="ps-conf-th">{t('crosswalkSection.headers.externalCode')}</th>
              <th className="ps-conf-th">{t('crosswalkSection.headers.resolvesTo')}</th>
              <th className="ps-conf-th">{t('crosswalkSection.headers.source')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td className="ps-conf-td" colSpan={4}>{t('crosswalkSection.emptyState')}</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td className="ps-conf-td">{resolveFacilityName(e.clientId)}</td>
                <td className="ps-conf-td">{e.externalCode}</td>
                <td className="ps-conf-td">{entryName(e.dictionaryEntryId)}</td>
                <td className="ps-conf-td">
                  {e.createdBy === 'system'
                    ? <span className="ps-xwalk-source-pending">{t('crosswalkSection.sourcePending')}</span>
                    : <span className="ps-xwalk-source-confirmed">{t('crosswalkSection.sourceConfirmed')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="ps-xwalk-add-panel">
          <div className="ps-xwalk-add-panel-title">{t('crosswalkSection.addPanel.title')}</div>
          {error && <div className="ps-conf-form-error">{error}</div>}
          <div className="ps-xwalk-form-row">
            <label className="ps-xwalk-form-field">
              {t('crosswalkSection.addPanel.facilityLabel')}
              <select className="ps-conf-select" value={newFacilityId} onChange={e => setNewFacilityId(e.target.value)}>
                <option value="">{t('crosswalkSection.addPanel.facilityPlaceholder')}</option>
                {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="ps-xwalk-form-field">
              {t('crosswalkSection.addPanel.externalCodeLabel')}
              <input className="ps-conf-input" value={newExternalCode} onChange={e => setNewExternalCode(e.target.value)} placeholder={t('crosswalkSection.addPanel.externalCodePlaceholder')} />
            </label>
            <label className="ps-xwalk-form-field ps-xwalk-form-field--wide">
              {t('crosswalkSection.addPanel.resolvesToLabel')}
              <SearchableCombobox
                value={newDictionaryEntryId}
                onChange={setNewDictionaryEntryId}
                placeholder={t('crosswalkSection.addPanel.specimenComboboxPlaceholder')}
                noMatchText={t('crosswalkSection.addPanel.specimenComboboxNoMatch')}
                options={dictionary.map(d => ({
                  id: d.id,
                  label: d.name,
                  sublabel: [d.procedure, d.type].filter(Boolean).join(' · '),
                  searchText: d.synonyms.join(' '),
                }))}
              />
            </label>
          </div>
          <div className="ps-xwalk-form-actions">
            <button className="ps-conf-btn-primary" disabled={saving} onClick={handleAdd}>{saving ? t('crosswalkSection.addPanel.saving') : t('crosswalkSection.addPanel.saveButton')}</button>
            <button className="ps-conf-btn-row" onClick={() => { setShowAdd(false); setError(null); }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrosswalkSection;
