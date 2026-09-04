// src/components/Config/System/ScanStationsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Admin config screen for
// stations. You said 'not yet' earlier — still true. Only the 8
// seeded stations exist; nobody can rename or add one without editing
// source." Same real table+modal pattern as ContainerTypesSection —
// full create/edit, deactivate rather than delete, not a fixed list.
// The service layer (services/scanStations/) already had full CRUD
// built and unused since the station-tracking work earlier this
// session; this is that CRUD's real, missing UI.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockScanStationService } from '../../../services/scanStations/mockScanStationService';
import { SCAN_STATION_WORKFLOW_STAGES } from '../../../services/scanStations/IScanStationService';
import type { ScanStation } from '../../../services/scanStations/IScanStationService';
import { printStationLabel, printAllStationLabels } from '../../../utils/labels/printStationLabels';
import { printerProfileService } from '../../../services';
import type { PrinterProfile, Facility } from '../../../services';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { validateScanStationDraft } from '../../../services/scanStations/validateScanStationDraft';
import type { ScanStationDraftValidationErrors } from '../../../services/scanStations/validateScanStationDraft';

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<ScanStation, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { active: boolean };

const emptyDraft: Draft = {
  // Real fix, per direct guidance: was 'lab-main' — a fake, hardcoded
  // default that doesn't correspond to any real Facility record and
  // let the free-text field always trivially validate. A scan
  // station's own facilityId is a real reference (see
  // IScanStationService.ts's own doc comment — "same real,
  // established scoping as Location.facilityId"), so an unselected
  // default has to be genuinely empty, not a plausible-looking string
  // standing in for a real choice.
  name: '', barcodeCode: '', facilityId: '', workflowStage: SCAN_STATION_WORKFLOW_STAGES[0], active: true, printerIp: '',
  supportsEngraving: false, supportsPrinting: false, cassetteSlidePrinterProfileId: '',
};

interface ScanStationModalProps {
  mode: 'add' | 'edit';
  station?: ScanStation;
  labs: Facility[];
  defaultFacilityId?: string;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const ScanStationModal: React.FC<ScanStationModalProps> = ({ mode, station, labs, defaultFacilityId, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(
    station
      ? { ...station, active: station.status !== 'Inactive' }
      : { ...emptyDraft, facilityId: defaultFacilityId ?? emptyDraft.facilityId }
  );
  const [errors, setErrors] = useState<ScanStationDraftValidationErrors>({});
  const [printerProfiles, setPrinterProfiles] = useState<PrinterProfile[]>([]);

  useEffect(() => {
    printerProfileService.getAll().then(res => { if (res.ok) setPrinterProfiles(res.data); });
  }, []);

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  // Real fix, per direct reminder: "no business logic in the UI
  // code." The real validation rules now live in
  // validateScanStationDraft.ts — this component only calls it.
  const validate = () => validateScanStationDraft(draft);

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? 'Add Scan Station' : `Edit — ${station?.name}`}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Station Name <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Grossing Station 4" />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Barcode Code <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.barcodeCode ? 'ps-conf-input--error' : ''}`}
              value={draft.barcodeCode} onChange={e => set('barcodeCode', e.target.value.toUpperCase())} placeholder="e.g. GROSSING-04" />
            {errors.barcodeCode ? (
              <span className="ps-conf-error-text">{errors.barcodeCode}</span>
            ) : (
              <span className="ps-conf-field-hint">Printed on this station's physical label as STATION:{draft.barcodeCode || '…'}</span>
            )}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="station-workflow-stage">Workflow Stage</label>
            <select id="station-workflow-stage" className="ps-conf-select" value={draft.workflowStage} onChange={e => set('workflowStage', e.target.value)}>
              {SCAN_STATION_WORKFLOW_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </div>

          {/* Real feature, per direct follow-up: "network printer IP
              assignment per station." Optional — most stations don't
              have a real, directly-attached label printer; a real
              printerIp is what dispatchContainerLabelPrint.ts uses as
              its own real target once a batch created at this station
              actually prints. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Printer IP</label>
            <input className="ps-conf-input" value={draft.printerIp ?? ''} onChange={e => set('printerIp', e.target.value)} placeholder="e.g. 10.20.4.12 (optional)" />
            <span className="ps-conf-field-hint">The network label printer physically attached to this bench, if any.</span>
          </div>

          {/* Real feature, per direct follow-up: "I would like to
              support both slide engraving and printed labels."
              Deliberately two independent toggles, not a single
              choice — a station can support neither, either, or
              both. dispatchCassetteLabel.ts/dispatchSlideLabel.ts's
              own real engraver-stub dispatch remains genuinely
              correct for supportsEngraving; supportsPrinting is the
              new, real, parallel path via this station's own
              cassetteSlidePrinterProfileId. */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title="Real, physical engraver hardware (Leica CEREBRO, etc.) at this station. The dispatch itself remains a real, honest stub pending vendor integration — this toggle only controls whether it's attempted.">
                Supports Engraving
              </label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('supportsEngraving', !draft.supportsEngraving)} className={`ps-conf-toggle-track ${draft.supportsEngraving ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title="Print real, GS1 DataMatrix cassette/slide labels via a QZ Tray-, Interface Engine-, or agent-bridged printer at this station.">
                Supports Printing
              </label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('supportsPrinting', !draft.supportsPrinting)} className={`ps-conf-toggle-track ${draft.supportsPrinting ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
          </div>

          {draft.supportsPrinting && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Cassette/Slide Printer Profile <span className="ps-conf-required">*</span></label>
              <select className={`ps-conf-select ${errors.cassetteSlidePrinterProfileId ? 'ps-conf-input--error' : ''}`} value={draft.cassetteSlidePrinterProfileId ?? ''} onChange={e => set('cassetteSlidePrinterProfileId', e.target.value)}>
                <option value="">— Select a printer profile —</option>
                {printerProfiles.map(p => <option key={p.id} value={p.id}>{p.printerId} ({p.model})</option>)}
              </select>
              {errors.cassetteSlidePrinterProfileId ? (
                <span className="ps-conf-error-text">{errors.cassetteSlidePrinterProfileId}</span>
              ) : (
                <span className="ps-conf-field-hint">
                  Real, required when Supports Printing is on — deliberately separate from Printer IP above, since
                  cassette/slide GS1 labels need the printer's own real bridge type and GS1/DataMatrix capabilities,
                  not just an address.
                </span>
              )}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Facility <span className="ps-conf-required">*</span></label>
            <select className={`ps-conf-select ${errors.facilityId ? 'ps-conf-input--error' : ''}`}
              value={draft.facilityId} onChange={e => set('facilityId', e.target.value)}>
              <option value="">— Select a performing lab —</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.facilityId && <span className="ps-conf-error-text">{errors.facilityId}</span>}
            <span className="ps-conf-field-hint">Which real performing lab this bench physically sits in — distinct from a referring facility.</span>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? 'Add Station' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main ScanStationsSection ───────────────────────────────────────────────────
const ScanStationsSection: React.FC<{ selectedFacilityId?: string }> = ({ selectedFacilityId }) => {
  const [stations,     setStations]     = useState<ScanStation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; station?: ScanStation } | null>(null);
  // Real fix, per direct guidance: a scan station's own facility is a
  // real, existing performing lab (see IScanStationService.ts's own
  // ScanStation.facilityId doc comment) — loaded here from the real
  // registry, same shared utility every other lab-scoped dictionary in
  // this app already uses, not free text an admin has to type
  // correctly by hand.
  const [labs, setLabs] = useState<Facility[]>([]);

  useEffect(() => {
    mockScanStationService.getAll().then(res => {
      if (res.ok) setStations(res.data);
      setLoading(false);
    });
    getActivePerformingLabs().then(setLabs);
  }, []);

  const filtered = stations.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.barcodeCode.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || s.status === statusFilter;
    // Real, per direct guidance (group-level Facility Selector): unlike
    // Printer Profiles' own Global-fallback, a scan station has no
    // "shared across facilities" concept — it's a real, physical bench
    // sitting in exactly one real place — so this is a plain equality
    // filter, not a most-specific-wins-but-Global-applies one.
    const matchFacility = !selectedFacilityId || s.facilityId === selectedFacilityId;
    return matchSearch && matchStatus && matchFacility;
  });

  const handleSave = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await mockScanStationService.create(payload);
      if (res.ok) setStations(prev => [...prev, res.data]);
    } else if (modal?.station) {
      const res = await mockScanStationService.update(modal.station.id, payload);
      if (res.ok) setStations(prev => prev.map(s => s.id === res.data.id ? res.data : s));
    }
    setModal(null);
  };

  const handleToggleStatus = async (s: ScanStation) => {
    const res = s.status === 'Active' ? await mockScanStationService.deactivate(s.id) : await mockScanStationService.reactivate(s.id);
    if (res.ok) setStations(prev => prev.map(x => x.id === s.id ? res.data : x));
  };

  if (loading) return <div className="ps-conf-loading">Loading scan stations...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Scan Stations</h3>
          <p className="ps-conf-section-subtitle">
            Real, physical bench locations a terminal can identify itself as (login prompt, NavBar) and a printed
            barcode label can switch to mid-workflow. 8 defaults are seeded to start from — name, barcode code, and
            workflow stage are yours to set for your own real benches.
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ Add Scan Station</button>
      </div>

      {/* Real feature, per direct follow-up: "Station barcode label
          generation itself... someone would have to hand-write
          STATION:GROSSING-03 on a barcode by some other means."
          Real, working print — same proven window.open()-based
          pipeline every other real label in this app already uses. */}
      <div className="ps-conf-form-row">
        <button
          className="ps-conf-btn-row"
          onClick={() => printAllStationLabels(stations.filter(s => s.status === 'Active'))}
          disabled={stations.filter(s => s.status === 'Active').length === 0}
        >
          🖨️ Print All Active Station Labels
        </button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by name or barcode code..." value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Station', 'Barcode Code', 'Workflow Stage', 'Facility', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">📍 {s.name}</div>
                  </td>
                  <td className="ps-conf-td"><code>STATION:{s.barcodeCode}</code></td>
                  <td className="ps-conf-td">{s.workflowStage || '—'}</td>
                  <td className="ps-conf-td">{labs.find(l => l.id === s.facilityId)?.name ?? s.facilityId}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${s.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${s.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{s.status}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => printStationLabel(s)}>🖨️ Print Label</button>
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', station: s })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(s)}>
                        {s.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>No scan stations match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <ScanStationModal mode={modal.mode} station={modal.station} labs={labs} defaultFacilityId={selectedFacilityId} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default ScanStationsSection;
