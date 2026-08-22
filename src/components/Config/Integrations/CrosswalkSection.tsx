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
// time (so a known client code never has to self-learn at all), and
// tell system-learned entries apart from admin-confirmed ones.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../../pathscribe.css';
import { orderIntakeService, facilityService, specimenDictionaryService, interfaceExceptionService } from '@/services';
import type { SpecimenCodeCrosswalkEntry } from '@/services/orderIntake/IOrderIntakeService';
import type { Facility as Client } from '@/services/facilities/IFacilityService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import { SearchableCombobox } from '@/components/Common/SearchableCombobox';
import { findDuplicate } from '@/utils/validateUnique';

const CrosswalkSection: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<SpecimenCodeCrosswalkEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dictionary, setDictionary] = useState<SpecimenEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newClientId, setNewClientId] = useState('');
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

  const refresh = () => {
    Promise.all([
      orderIntakeService.listCrosswalkEntries(),
      facilityService.getAll(),
      specimenDictionaryService.getAll(),
      interfaceExceptionService.getPending(),
    ]).then(([xwalkRes, clientsRes, dictRes, exceptionsRes]) => {
      if (xwalkRes.ok) setEntries(xwalkRes.data);
      if (clientsRes.ok) setClients(clientsRes.data);
      if (dictRes.ok) setDictionary(dictRes.data);
      if (exceptionsRes.ok) setPendingUnmappedStubCount(exceptionsRes.data.filter(e => e.eventType === 'unmapped_order_code').length);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? id;
  const entryName = (id: string) => dictionary.find(d => d.id === id)?.name ?? id;

  const handleAdd = async () => {
    setError(null);
    if (!newClientId || !newExternalCode.trim() || !newDictionaryEntryId) {
      setError('Client, external code, and specimen type are all required.');
      return;
    }
    // Real, confirmed risk this closes: mockOrderIntakeService.ts's own
    // resolveOrder() does a case-insensitive .find() on exactly this
    // clientId + externalCode combination when matching an incoming
    // specimen — .find() silently returns whichever colliding entry
    // happens to come first, which can mis-map a real specimen to the
    // wrong dictionary entry. Checked here, before save, not left to a
    // silent, ambiguous collision at real order-intake time. Same code
    // string is fine across two DIFFERENT clients — only the exact
    // combination needs to be unique.
    const collision = findDuplicate(entries, { clientId: newClientId, externalCode: newExternalCode.trim() }, ['clientId', 'externalCode']);
    if (collision) {
      setError(`${clientName(newClientId)} already maps external code "${newExternalCode.trim()}" to ${entryName(collision.dictionaryEntryId)}.`);
      return;
    }
    setSaving(true);
    const res = await orderIntakeService.addCrosswalkEntry({
      clientId: newClientId,
      externalCode: newExternalCode.trim(),
      dictionaryEntryId: newDictionaryEntryId,
      createdBy: 'admin',
    });
    setSaving(false);
    if (res.ok === false) {
      setError(res.error);
    } else {
      setShowAdd(false);
      setNewClientId(''); setNewExternalCode(''); setNewDictionaryEntryId('');
      refresh();
    }
  };

  if (loading) return <div className="ps-conf-section-subtitle">Loading…</div>;

  const pendingCount = entries.filter(e => e.createdBy === 'system').length;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Specimen Code Map</h3>
          <p className="ps-conf-section-subtitle">
            Maps each client's own local specimen codes (from inbound HL7/API orders) to a real Specimen
            Dictionary entry — the same code string means different things at different sending systems, so
            entries are scoped per client. Every incoming order already consults this table automatically;
            an unrecognized code self-learns a real, pending entry here rather than blocking the order —
            review those below, or add a known mapping ahead of time so it never has to self-learn at all.
          </p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setShowAdd(true)}>+ Add Mapping</button>
      </div>

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
            ⚠ <strong>Pending Review:</strong> {pendingUnmappedStubCount} inbound order code{pendingUnmappedStubCount === 1 ? '' : 's'} received without a real dictionary match.
          </span>
          <button
            className="ps-conf-callout-banner-link"
            onClick={() => navigate('/audit?tab=interfaces&search=unmapped_order_code')}
          >
            View Unmapped Stubs in Audit Queue →
          </button>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="ps-conf-section-subtitle ps-xwalk-pending-banner">
          ⚠ {pendingCount} entr{pendingCount === 1 ? 'y was' : 'ies were'} auto-learned from an unrecognized order code — review for accuracy below.
        </div>
      )}

      <div className="ps-conf-table-wrap ps-xwalk-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">Facility</th>
              <th className="ps-conf-th">External Code</th>
              <th className="ps-conf-th">Resolves To</th>
              <th className="ps-conf-th">Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td className="ps-conf-td" colSpan={4}>No crosswalk entries yet.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td className="ps-conf-td">{clientName(e.clientId)}</td>
                <td className="ps-conf-td">{e.externalCode}</td>
                <td className="ps-conf-td">{entryName(e.dictionaryEntryId)}</td>
                <td className="ps-conf-td">
                  {e.createdBy === 'system'
                    ? <span className="ps-xwalk-source-pending">Auto-learned — pending review</span>
                    : <span className="ps-xwalk-source-confirmed">Admin-confirmed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="ps-xwalk-add-panel">
          <div className="ps-xwalk-add-panel-title">Add a mapping</div>
          {error && <div className="ps-conf-form-error">{error}</div>}
          <div className="ps-xwalk-form-row">
            <label className="ps-xwalk-form-field">
              Client
              <select className="ps-conf-select" value={newClientId} onChange={e => setNewClientId(e.target.value)}>
                <option value="">Select a facility…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="ps-xwalk-form-field">
              External code
              <input className="ps-conf-input" value={newExternalCode} onChange={e => setNewExternalCode(e.target.value)} placeholder="e.g. TISSUE-01" />
            </label>
            <label className="ps-xwalk-form-field ps-xwalk-form-field--wide">
              Resolves to specimen type
              <SearchableCombobox
                value={newDictionaryEntryId}
                onChange={setNewDictionaryEntryId}
                placeholder="Select a specimen type…"
                noMatchText="No specimen types match"
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
            <button className="ps-conf-btn-primary" disabled={saving} onClick={handleAdd}>{saving ? 'Saving…' : 'Save Mapping'}</button>
            <button className="ps-conf-btn-row" onClick={() => { setShowAdd(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrosswalkSection;
