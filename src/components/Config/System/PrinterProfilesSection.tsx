// src/components/Config/System/PrinterProfilesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own spec, Section 2
// ("Printer Capability & Profile Registry"). Real admin UI for the
// registry — see IPrinterProfileService.ts's own header for the full
// scope reasoning (this is the real, PathScribe-side data store;
// actually detecting a real printer's capabilities is Section 8's own
// separate Local Bridge Agent responsibility).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { printerProfileService } from '../../../services';
import type { PrinterProfile, PrinterVendor, PrinterBridgeType, Facility } from '../../../services';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

type Draft = Omit<PrinterProfile, 'id' | 'createdAt' | 'updatedAt'>;

const VENDOR_LABELS: Record<PrinterVendor, string> = {
  ZEBRA_ZPL: 'Zebra (ZPL)',
  CITIZEN: 'Citizen',
  SATO: 'SATO',
  LEICA_CEREBRO: 'Leica CEREBRO',
  SAKURA_TISSUE_TEK: 'Sakura Tissue-Tek',
  OTHER: 'Other',
};

// Real, researched labels — see PrinterBridgeType's own doc comment
// in IPrinterProfileService.ts for the full reasoning behind each.
const BRIDGE_LABELS: Record<PrinterBridgeType, string> = {
  qz_tray: 'QZ Tray (vendor-agnostic — real, working integration built)',
  zebra_browser_print: 'Zebra Browser Print (Zebra-only, single vendor)',
  bartender_rest: 'BarTender Automation (server-to-server, enterprise)',
  direct_interface_engine: 'Direct via Interface Engine (no local bridge)',
  pathscribe_agent: 'PathScribe Agent (fallback — not yet built)',
  os_print_dialog: "OS Print Dialog (browser's own print queue)",
};

const emptyDraft = (defaultFacilityId?: string): Draft => ({
  printerId: '', model: '', dpi: 300, supportsDataMatrix: true, supportsGS1: true,
  zplVersion: '', maxPrintDensity: 300, moduleSize: 4, vendor: 'ZEBRA_ZPL', bridgeType: 'os_print_dialog',
  ipAddress: '', port: 9100, facilityId: defaultFacilityId ?? '', active: true,
});

interface EditorModalProps {
  mode: 'add' | 'edit';
  entry?: PrinterProfile;
  labs: Facility[];
  defaultFacilityId?: string;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ mode, entry, labs, defaultFacilityId, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? {
    printerId: entry.printerId, model: entry.model, dpi: entry.dpi,
    supportsDataMatrix: entry.supportsDataMatrix, supportsGS1: entry.supportsGS1,
    zplVersion: entry.zplVersion, maxPrintDensity: entry.maxPrintDensity, moduleSize: entry.moduleSize,
    vendor: entry.vendor, bridgeType: entry.bridgeType, ipAddress: entry.ipAddress ?? '', port: entry.port,
    facilityId: entry.facilityId ?? '', active: entry.active,
  } : emptyDraft(defaultFacilityId));

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(prev => ({ ...prev, [field]: value }));
  const canSave = draft.printerId.trim().length > 0 && draft.model.trim().length > 0;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal" style={{ width: 560 }}>
        <div className="ps-ms-header-row">
          <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.printerId}` : 'Add Printer Profile'}</div>
          <button className="ps-ms-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Printer ID <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={draft.printerId} onChange={e => set('printerId', e.target.value)} placeholder="e.g. ZEBRA-192.168.12.85" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Model <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={draft.model} onChange={e => set('model', e.target.value)} placeholder="e.g. ZT411" />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Vendor</label>
              <select className="ps-conf-select" value={draft.vendor} onChange={e => set('vendor', e.target.value as PrinterVendor)}>
                {(Object.keys(VENDOR_LABELS) as PrinterVendor[]).map(v => <option key={v} value={v}>{VENDOR_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">ZPL Version</label>
              <input className="ps-conf-input" value={draft.zplVersion} onChange={e => set('zplVersion', e.target.value)} placeholder="e.g. 7.0" />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title="How a browser actually reaches this printer at this site — a separate, real question from which hardware brand it is.">
                Bridge Type
              </label>
              <select className="ps-conf-select" value={draft.bridgeType} onChange={e => set('bridgeType', e.target.value as PrinterBridgeType)}>
                {(Object.keys(BRIDGE_LABELS) as PrinterBridgeType[]).map(b => <option key={b} value={b}>{BRIDGE_LABELS[b]}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title="A real, shared network-pool printer reachable from more than one facility's own benches has no single owner — leave this on Global for that case.">
                Facility
              </label>
              <select className="ps-conf-select" value={draft.facilityId ?? ''} onChange={e => set('facilityId', e.target.value || undefined)}>
                <option value="">— Global (shared across facilities) —</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">DPI</label>
              <input className="ps-conf-input" type="number" value={draft.dpi} onChange={e => set('dpi', Number(e.target.value) || 0)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Max Print Density</label>
              <input className="ps-conf-input" type="number" value={draft.maxPrintDensity} onChange={e => set('maxPrintDensity', Number(e.target.value) || 0)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title="Real DataMatrix module size, in dots — directly affects real scannability at this printer's own DPI.">
                DataMatrix Module Size
              </label>
              <input className="ps-conf-input" type="number" value={draft.moduleSize} onChange={e => set('moduleSize', Number(e.target.value) || 0)} />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">IP Address</label>
              <input className="ps-conf-input" value={draft.ipAddress} onChange={e => set('ipAddress', e.target.value)} placeholder="e.g. 192.168.12.85" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Port</label>
              <input className="ps-conf-input" type="number" value={draft.port ?? ''} onChange={e => set('port', e.target.value ? Number(e.target.value) : undefined)} placeholder="9100" />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Supports DataMatrix</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('supportsDataMatrix', !draft.supportsDataMatrix)} className={`ps-conf-toggle-track ${draft.supportsDataMatrix ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Supports GS1</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('supportsGS1', !draft.supportsGS1)} className={`ps-conf-toggle-track ${draft.supportsGS1 ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Active</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={() => onSave(draft)} disabled={!canSave}>
            {mode === 'add' ? 'Add Profile' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PrinterProfilesSection: React.FC<{ selectedFacilityId?: string }> = ({ selectedFacilityId }) => {
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: PrinterProfile } | null>(null);

  const loadAll = () => { printerProfileService.getAll().then(res => { if (res.ok) setProfiles(res.data); }); };
  useEffect(() => { loadAll(); getActivePerformingLabs().then(setLabs); }, []);

  // Real, per direct guidance (group-level Facility Selector): when a
  // facility is chosen at the top of the Workstation & Hardware group,
  // this list narrows to that facility's own printers PLUS any real,
  // Global (shared network-pool) profile — a Global printer is
  // reachable from every facility's own benches by definition, so it
  // stays visible regardless of which facility is selected, same
  // most-specific-wins-but-Global-always-applies convention used
  // throughout this app's other lab-scoped dictionaries.
  const filteredProfiles = selectedFacilityId
    ? profiles.filter(p => !p.facilityId || p.facilityId === selectedFacilityId)
    : profiles;

  const facilityName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : 'Global';

  const handleSave = (draft: Draft) => {
    const promise = modal?.mode === 'edit' && modal.entry
      ? printerProfileService.update(modal.entry.id, draft)
      : printerProfileService.add(draft);
    promise.then(() => { setModal(null); loadAll(); });
  };

  const handleRemove = (id: string) => {
    printerProfileService.remove(id).then(() => loadAll());
  };

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Printer Profiles</h3>
          <p className="ps-conf-section-subtitle">
            Real printer capabilities (DPI, GS1/DataMatrix support, module size) — used to select the correct
            label template and reject jobs a printer genuinely can't handle before they're sent. Per PS-51's own
            spec: this registry is real and complete on the PathScribe side; actually detecting a connected
            printer's own capabilities is the separate Local Bridge Agent's job, not this app's.
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ Add Printer Profile</button>
        </div>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{['Printer ID', 'Model', 'Vendor', 'Bridge', 'Facility', 'DPI', 'GS1 / DataMatrix', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredProfiles.map(p => (
                <tr key={p.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">{p.printerId}</div>
                    {p.ipAddress && <div className="ps-specreq-meta">{p.ipAddress}{p.port ? `:${p.port}` : ''}</div>}
                  </td>
                  <td className="ps-conf-td">{p.model}</td>
                  <td className="ps-conf-td">{VENDOR_LABELS[p.vendor]}</td>
                  <td className="ps-conf-td">{BRIDGE_LABELS[p.bridgeType]}</td>
                  <td className="ps-conf-td">{facilityName(p.facilityId)}</td>
                  <td className="ps-conf-td">{p.dpi}</td>
                  <td className="ps-conf-td">{p.supportsGS1 && p.supportsDataMatrix ? '✓ Both' : p.supportsDataMatrix ? 'DataMatrix only' : p.supportsGS1 ? 'GS1 only' : '—'}</td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${p.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${p.active ? 'ps-conf-status-text--active' : ''}`}>{p.active ? 'Active' : 'Inactive'}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: p })}>Edit</button>
                    <button className="ps-conf-btn-row" onClick={() => handleRemove(p.id)}>Remove</button>
                  </td>
                </tr>
              ))}
              {filteredProfiles.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={9}>No printer profiles {selectedFacilityId ? 'for this facility' : 'yet'}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <EditorModal mode={modal.mode} entry={modal.entry} labs={labs} defaultFacilityId={selectedFacilityId} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default PrinterProfilesSection;
