// src/pages/MolecularBatchPage/MolecularPlateBuilderPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Continue with the plate/well layout
// UI") — Phase 2 of the given "Full Molecular Testing Execution
// Module" specification, §3.1/§3.2.
//
// Real, deliberate scope for this phase: full batch creation +
// plate/well editing for a NEW batch. An already-created batch opens
// in a real, view-only mode here — editing a batch's own plate layout
// after creation (re-gating, re-validating in-flight wells) is a real,
// separate concern not attempted in this phase.
//
// Real, deliberate reuse: scan-to-well listens to the same real,
// global PATHSCRIBE_SCAN event this app's own ScannerProvider already
// dispatches (contexts/ScannerProvider.tsx) — no second, competing
// scan-detection mechanism.
//
// Real, honest "Auto-populate" scope: this app has no real, existing
// worklist of pending specimens to pull from for this feature yet
// (that integration is real, separate, later work) — so auto-populate
// marks the next N empty wells as PATIENT_SPECIMEN in the requested
// fill order, ready for a tech to scan each real specimen into its
// own designated well afterward — matching the real, physical lab
// workflow (decide the layout, then scan specimens in) rather than
// fabricating specimen data that was never actually scanned.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../pathscribe.css';
import { mockMolecularBatchService } from '../../services/molecular/mockMolecularBatchService';
import { resolveMolecularReagentLotGating } from '../../services/molecular/resolveMolecularReagentLotGating';
import { resolveMolecularControlRequirementValidation } from '../../services/molecular/resolveMolecularControlRequirementValidation';
import { mockMolecularAssayControlRuleService } from '../../services/molecular/mockMolecularAssayControlRuleService';
import { generateWellPositionsInOrder } from '../../services/molecular/resolveMolecularBarcodes';
import {
  MOLECULAR_PLATE_LAYOUTS, MOLECULAR_REAGENT_COMPONENT_TYPES, MOLECULAR_SAMPLE_TYPES,
} from '../../services/molecular/IMolecularBatchService';
import type {
  MolecularBatch, MolecularPlateLayout, MolecularReagentLot, MolecularWell, MolecularSampleType,
  MolecularReagentComponentType, NewMolecularBatch,
} from '../../services/molecular/IMolecularBatchService';
import { getSessionUser } from '../../services/auth/caseAccessControl';
import type { MolecularAssayControlRule } from '../../services/molecular/IMolecularAssayControlRuleService';
import { printMolecularSpecimenLabels, printMolecularPlateLabel, printMolecularDeckLocationLabel } from '../../utils/labels/printMolecularLabels';
import { useCurrentScanStation } from '../../hooks/useCurrentScanStation';
import { mockScanStationService } from '../../services/scanStations/mockScanStationService';
import { workcenterTabForStatus } from '../MolecularWorkcenterPage/MolecularWorkcenterPage';
import { resolveMolecularMovementRecord } from '../../services/molecular/resolveMolecularMovementRecord';
import { resolveMolecularHistoricalTrace } from '../../services/molecular/resolveMolecularHistoricalTrace';
import { dispatchMolecularWorklist } from '../../services/molecular/dispatchMolecularWorklist';
import { mockMolecularExtractionRackService } from '../../services/molecular/mockMolecularExtractionRackService';
import { mockStainTypeService } from '../../services/stains/mockStainTypeService';
import type { StainType } from '../../services/stains/IStainService';

const SAMPLE_TYPE_COLOR: Record<MolecularSampleType, string> = {
  CONTROL_NTC: '#ef4444', CONTROL_PTC_HIGH: '#10B981', CONTROL_PTC_LOW: '#65A30D',
  CALIBRATOR: '#8B5CF6', PATIENT_SPECIMEN: '#38bdf8',
};
const SAMPLE_TYPE_LABEL: Record<MolecularSampleType, string> = {
  CONTROL_NTC: 'NTC', CONTROL_PTC_HIGH: 'PTC (High)', CONTROL_PTC_LOW: 'PTC (Low)',
  CALIBRATOR: 'Calibrator', PATIENT_SPECIMEN: 'Specimen',
};

function emptyWellsFor(layout: MolecularPlateLayout): MolecularWell[] {
  const dims = MOLECULAR_PLATE_LAYOUTS[layout];
  const positions = generateWellPositionsInOrder(dims, 'row_major');
  return positions.map(wellPosition => ({ wellPosition }));
}

const MolecularPlateBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const { batchId } = useParams<{ batchId: string }>();
  const isNew = batchId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [existingBatch, setExistingBatch] = useState<MolecularBatch | null>(null);

  const [assayCode, setAssayCode] = useState('');
  const [assayName, setAssayName] = useState('');
  // Real, per direct follow-up ("wouldn't we use the existing process
  // catalog to define the assays?") — the real, existing Diagnostic
  // Catalog's own Molecular-category entries; assayName above is now
  // derived from the selected entry's own real name, never
  // independently typed.
  const [molecularAssayTypes, setMolecularAssayTypes] = useState<StainType[]>([]);
  useEffect(() => {
    mockStainTypeService.getAll().then(res => {
      if (res.ok) setMolecularAssayTypes(res.data.filter(t => t.category === 'Molecular' && t.active));
    });
  }, []);
  const [targetInstrumentId, setTargetInstrumentId] = useState('');
  const [deckSlot, setDeckSlot] = useState('');
  const [plateLayout, setPlateLayout] = useState<MolecularPlateLayout>('96_well');
  const [reagentLots, setReagentLots] = useState<MolecularReagentLot[]>([]);
  // Real, per the given specification's own §3.2 "Dynamic Control
  // Rules"/"Position Enforcements" — fetched once, since real,
  // admin-defined rules don't change per keystroke the way this
  // page's own live reagent-lot gating already reacts to.
  const [controlRules, setControlRules] = useState<MolecularAssayControlRule[]>([]);
  useEffect(() => {
    mockMolecularAssayControlRuleService.getAll().then(res => { if (res.ok) setControlRules(res.data); });
  }, []);
  const [wells, setWells] = useState<MolecularWell[]>(() => emptyWellsFor('96_well'));
  const [selectedWellPos, setSelectedWellPos] = useState<string | null>(null);
  const [armedForScan, setArmedForScan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedTraceWellPos, setExpandedTraceWellPos] = useState<string | null>(null);
  const [dispatchPanelOpen, setDispatchPanelOpen] = useState(false);
  const [scannedPlateBarcode, setScannedPlateBarcode] = useState<string | undefined>(undefined);
  const [scannedDeckLocationLabel, setScannedDeckLocationLabel] = useState<string | undefined>(undefined);
  const [armedDispatchScanTarget, setArmedDispatchScanTarget] = useState<'plate' | 'deck' | null>(null);
  const [dispatchResultMessage, setDispatchResultMessage] = useState<string | null>(null);
  // Real, per direct guidance on Clone & Supersede over live-editing
  // an already-created batch — see mockMolecularBatchService.ts's own
  // cloneAndSupersede() header for the full architectural reasoning.
  const [clonePanelOpen, setClonePanelOpen] = useState(false);
  const [cloneReason, setCloneReason] = useState('');
  const [cloning, setCloning] = useState(false);
  const [cloneResultMessage, setCloneResultMessage] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);

  // Real, per this file's own header (§5.1): the real, already-
  // established, sticky, per-device scan station (useCurrentScanStation.ts)
  // — never a station typed or guessed per scan.
  const { stationId } = useCurrentScanStation();
  const [stationName, setStationName] = useState<string>('Unknown Station');
  useEffect(() => {
    if (!stationId) { setStationName('Unknown Station'); return; }
    mockScanStationService.getById(stationId).then(res => { if (res.ok) setStationName(res.data.name); });
  }, [stationId]);

  useEffect(() => {
    if (isNew || !batchId) return;
    mockMolecularBatchService.getById(batchId).then(res => {
      if (res.ok) setExistingBatch(res.data);
      setLoading(false);
    });
  }, [batchId, isNew]);

  // Real, per this file's own header: listens to the same real, global
  // scan event this app's own ScannerProvider already dispatches — no
  // second, competing scan mechanism.
  useEffect(() => {
    if (!armedForScan || !selectedWellPos) return;
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { raw: string; matchedAccession?: string } | undefined;
      if (!detail?.raw) return;
      await assignSpecimenToWell(detail.raw, detail.matchedAccession);
    };
    window.addEventListener('PATHSCRIBE_SCAN', handler);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', handler);
  }, [armedForScan, selectedWellPos, stationId, stationName]);

  // Real, per direct follow-up: "If the scan doesn't work, they need
  // a way to input the specimen manually." Confirmed directly before
  // building this — no fallback existed when a barcode is damaged,
  // unreadable, or a scanner malfunctions. Real, shared core logic —
  // extracted so the manual path produces the exact same real rack-
  // lookup, movement-record, and well-assignment outcome as a
  // successful scan, never a second, divergent code path.
  const assignSpecimenToWell = async (raw: string, matchedAccession?: string) => {
    if (!selectedWellPos) return;
    const session = getSessionUser();
    const byUserId = session?.id ?? 'unknown';
    const byUserName = session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : 'Unknown User';
    const movementContext = { byUserId, byUserName, stationId: stationId ?? 'unknown', stationName };

    const rackLookup = await mockMolecularExtractionRackService.findPositionByContainerBarcode(raw);
    const priorMovements = rackLookup.ok && rackLookup.data ? (rackLookup.data.position.movementHistory ?? []) : [];
    const fromLevel = rackLookup.ok && rackLookup.data ? 'secondary_rack' : 'primary_vial';
    const fromBarcode = rackLookup.ok && rackLookup.data ? `${rackLookup.data.rack.rackBarcode}:${rackLookup.data.position.positionLabel}` : raw;
    const movement = resolveMolecularMovementRecord(
      fromLevel, 'plate_well', fromBarcode, `well:${selectedWellPos}`, movementContext,
    );
    setWells(prev => {
      const idx = prev.findIndex(w => w.wellPosition === selectedWellPos);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx], containerBarcode: raw, accessionNumber: matchedAccession ?? updated[idx].accessionNumber,
        movementHistory: [...priorMovements, ...(updated[idx].movementHistory ?? []), movement],
      };
      return updated;
    });
    setArmedForScan(false);
    // Real, per this file's own header: auto-advance to the next
    // empty PATIENT_SPECIMEN well, so a tech can scan a whole rack of
    // specimens in sequence without re-selecting a well each time.
    setWells(prev => {
      const currentIdx = prev.findIndex(w => w.wellPosition === selectedWellPos);
      const next = prev.slice(currentIdx + 1).find(w => w.sampleType === 'PATIENT_SPECIMEN' && !w.containerBarcode);
      if (next) { setSelectedWellPos(next.wellPosition); setArmedForScan(true); }
      return prev;
    });
  };

  const [manualWellEntryOpen, setManualWellEntryOpen] = useState(false);
  const [manualWellEntryValue, setManualWellEntryValue] = useState('');
  const handleManualWellEntrySubmit = async () => {
    const trimmed = manualWellEntryValue.trim();
    if (!trimmed) return;
    // Real, honest posture: a manually-typed barcode has no real
    // accession auto-match the way a real scan's own resolution
    // pipeline (ScannerProvider) provides — left undefined, same as
    // any other real, unmatched scan.
    await assignSpecimenToWell(trimmed, undefined);
    setManualWellEntryValue('');
    setManualWellEntryOpen(false);
  };

  // Real, per the given specification's own §3.4 "Scan-to-Verify
  // Workflow" — a real, separate scan listener for dispatch
  // verification, distinct from the well-scanning listener above
  // (different context: verifying the plate/deck location, not
  // assigning a specimen to a well). Same real, established
  // PATHSCRIBE_SCAN event, no second scan mechanism.
  useEffect(() => {
    if (!armedDispatchScanTarget) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { raw: string } | undefined;
      if (!detail?.raw) return;
      if (armedDispatchScanTarget === 'plate') setScannedPlateBarcode(detail.raw);
      else setScannedDeckLocationLabel(detail.raw);
      setArmedDispatchScanTarget(null);
    };
    window.addEventListener('PATHSCRIBE_SCAN', handler);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', handler);
  }, [armedDispatchScanTarget]);

  const handleDispatchWorklist = async () => {
    if (!existingBatch) return;
    setDispatching(true);
    setDispatchResultMessage(null);
    try {
      const result = await dispatchMolecularWorklist(existingBatch, scannedPlateBarcode, scannedDeckLocationLabel, getSessionUser());
      if (result.dispatched) {
        setDispatchResultMessage('Worklist dispatched successfully.');
        const refreshed = await mockMolecularBatchService.getById(existingBatch.id);
        if (refreshed.ok) setExistingBatch(refreshed.data);
        setDispatchPanelOpen(false);
      } else if ('reason' in result) {
        setDispatchResultMessage(result.reason);
      }
    } finally {
      setDispatching(false);
    }
  };

  const handleCloneAndSupersede = async () => {
    if (!existingBatch) return;
    setCloning(true);
    setCloneResultMessage(null);
    try {
      const session = getSessionUser();
      const byUserId = session?.id ?? 'unknown';
      const byUserName = session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : 'Unknown User';
      const result = await mockMolecularBatchService.cloneAndSupersede(existingBatch.id, cloneReason, byUserId, byUserName);
      if (result.ok) {
        // Real, per this action's own real purpose — this batch is
        // now a real, terminal, superseded record; the real, live
        // work continues on its own real, new clone.
        navigate(`/molecular-batch/${result.data.id}`);
      } else {
        setCloneResultMessage('error' in result ? result.error : 'Unknown error cloning this batch.');
      }
    } finally {
      setCloning(false);
    }
  };

  const handleLayoutChange = (layout: MolecularPlateLayout) => {
    setPlateLayout(layout);
    setWells(emptyWellsFor(layout));
    setSelectedWellPos(null);
  };

  const addReagentLot = () => {
    setReagentLots(prev => [...prev, { componentType: 'MASTER_MIX', lotNumber: '', expirationDate: '', qcStatus: 'pending' }]);
  };
  const updateReagentLot = (index: number, changes: Partial<MolecularReagentLot>) => {
    setReagentLots(prev => prev.map((lot, i) => (i === index ? { ...lot, ...changes } : lot)));
  };
  const removeReagentLot = (index: number) => setReagentLots(prev => prev.filter((_, i) => i !== index));

  const updateWell = (position: string, changes: Partial<MolecularWell>) => {
    setWells(prev => prev.map(w => (w.wellPosition === position ? { ...w, ...changes } : w)));
  };

  const handleAutoPopulate = (order: 'row_major' | 'column_major') => {
    const dims = MOLECULAR_PLATE_LAYOUTS[plateLayout];
    const orderedPositions = generateWellPositionsInOrder(dims, order);
    setWells(prev => {
      const byPos = new Map(prev.map(w => [w.wellPosition, w]));
      for (const pos of orderedPositions) {
        const well = byPos.get(pos);
        if (well && !well.sampleType) byPos.set(pos, { ...well, sampleType: 'PATIENT_SPECIMEN' });
      }
      return orderedPositions.map(pos => byPos.get(pos)!);
    });
  };

  const gating = resolveMolecularReagentLotGating(reagentLots, wells);
  const controlCheck = resolveMolecularControlRequirementValidation(assayCode.trim(), wells, controlRules);
  const selectedWell = wells.find(w => w.wellPosition === selectedWellPos);
  const dims = MOLECULAR_PLATE_LAYOUTS[plateLayout];

  const handleCreate = async () => {
    const session = getSessionUser();
    setSaveError(null);
    if (!assayCode.trim() || !assayName.trim() || !targetInstrumentId.trim()) {
      setSaveError('Assay code, assay name, and target instrument are all required.');
      return;
    }
    setSaving(true);
    try {
      const newBatch: NewMolecularBatch = {
        assayCode: assayCode.trim(), assayName: assayName.trim(), targetInstrumentId: targetInstrumentId.trim(),
        deckSlot: deckSlot.trim() || undefined, plateLayout, reagentLots,
        wells: wells.filter(w => w.sampleType !== undefined),
        createdByUserId: session?.id ?? 'unknown', createdByUserName: session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : 'Unknown User',
      };
      const res = await mockMolecularBatchService.create(newBatch);
      if ('error' in res) { setSaveError(res.error); return; }
      navigate(`/molecular-batch/${res.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ps-conf-loading">Loading…</div>;

  const displayWells = existingBatch ? (existingBatch.wells.length > 0 ? existingBatch.wells : emptyWellsFor(existingBatch.plateLayout)) : wells;
  const displayDims = existingBatch ? MOLECULAR_PLATE_LAYOUTS[existingBatch.plateLayout] : dims;
  const readOnly = !isNew;

  return (
    <div className="ps-app-root" style={{ padding: '28px 32px 60px', maxWidth: 1200, margin: '0 auto' }}>
      <button className="ps-btn-small" onClick={() => navigate(`/molecular${existingBatch ? `?tab=${workcenterTabForStatus(existingBatch.status)}` : ''}`)} style={{ marginBottom: 16 }}>← Back to Batches</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ps-text)', margin: 0 }}>
          {isNew ? 'New Molecular Batch' : `${existingBatch?.batchBarcode} — ${existingBatch?.assayName}`}
        </h1>
        {existingBatch && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ps-btn-small" onClick={() => printMolecularPlateLabel(existingBatch)}>🖨️ Plate Label</button>
            <button className="ps-btn-small" onClick={() => printMolecularDeckLocationLabel(existingBatch)}>🖨️ Deck Location Label</button>
            <button className="ps-btn-small" onClick={() => printMolecularSpecimenLabels(existingBatch)}>🖨️ Specimen Labels</button>
            {!existingBatch.worklistDispatchedAt && existingBatch.status !== 'superseded' && (
              <button className="ps-btn-small" onClick={() => setDispatchPanelOpen(o => !o)}>📡 Dispatch Worklist</button>
            )}
            {existingBatch.status !== 'superseded' && (
              <button className="ps-btn-small" onClick={() => setClonePanelOpen(o => !o)}>🧬 Clone & Supersede</button>
            )}
          </div>
        )}
      </div>

      {/* Real, per direct guidance on Clone & Supersede — a real,
          terminal batch always shows which real batch replaced it,
          rather than silently going stale with no forward pointer. */}
      {existingBatch?.supersededByBatchId && (
        <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: '#f59e0b18', border: '1px solid #f59e0b33', color: '#f59e0b', fontSize: 13, fontWeight: 600 }}>
          ⚠ This batch was superseded on {new Date(existingBatch.supersededAt!).toLocaleString()} by {existingBatch.supersededByUserName} — "{existingBatch.supersededReason}". <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate(`/molecular-batch/${existingBatch.supersededByBatchId}`)}>View the real, replacement batch →</span>
        </div>
      )}
      {/* Real, per the same guidance — a real clone always shows
          which real batch it was cloned from, closing the real, 1:1
          audit trail in both directions. */}
      {existingBatch?.clonedFromBatchId && (
        <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: '#38bdf818', border: '1px solid #38bdf833', color: '#38bdf8', fontSize: 13, fontWeight: 600 }}>
          🧬 This batch is a real clone of <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate(`/molecular-batch/${existingBatch.clonedFromBatchId}`)}>a superseded, earlier batch</span> — every real patient specimen well was reset and requires a fresh scan.
        </div>
      )}

      {existingBatch?.worklistDispatchedAt && (
        <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: '#10B98118', border: '1px solid #10B98133', color: '#10B981', fontSize: 13, fontWeight: 600 }}>
          ✓ Worklist dispatched at {new Date(existingBatch.worklistDispatchedAt).toLocaleString()}
        </div>
      )}

      {existingBatch && clonePanelOpen && (
        <div style={{ marginBottom: 20, border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Clone & Supersede</h3>
          <p style={{ fontSize: 12, color: 'var(--ps-text-muted)', marginTop: 0 }}>
            Per direct guidance: this batch is never edited in place. This creates a real, new, draft batch with the same real assay/instrument/plate configuration and real control assignments carried over — but every real patient specimen well resets and must be re-scanned. This batch becomes a real, terminal, superseded record.
          </p>
          <label className="ps-label" htmlFor="mb-clone-reason">Reason (required)</label>
          <textarea
            id="mb-clone-reason"
            className="ps-input-dark"
            style={{ width: '100%', minHeight: 60, marginBottom: 12 }}
            value={cloneReason}
            onChange={e => setCloneReason(e.target.value)}
            placeholder="e.g. Well A03 specimen was mis-scanned; re-running with corrected accession"
          />
          {cloneResultMessage && (
            <div style={{ marginBottom: 14, fontSize: 12, color: '#ef4444' }}>{cloneResultMessage}</div>
          )}
          <button className="ps-conf-btn-secondary" disabled={cloning || !cloneReason.trim()} onClick={handleCloneAndSupersede}>
            {cloning ? 'Cloning…' : 'Confirm Clone & Supersede'}
          </button>
        </div>
      )}

      {existingBatch && dispatchPanelOpen && (
        <div style={{ marginBottom: 20, border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Dispatch Worklist — Scan Verification</h3>
          <p style={{ fontSize: 12, color: 'var(--ps-text-muted)', marginTop: 0 }}>
            Per §3.4, both the target plate and the instrument deck location must be scanned and confirmed to match before the outbound worklist is dispatched.
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <label className="ps-label">Plate Barcode</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>{scannedPlateBarcode ?? '— not scanned —'}</span>
                <button className="ps-btn-small" style={{ background: armedDispatchScanTarget === 'plate' ? '#38bdf8' : undefined }} onClick={() => setArmedDispatchScanTarget('plate')}>
                  {armedDispatchScanTarget === 'plate' ? '📡 Waiting…' : '📷 Scan'}
                </button>
              </div>
            </div>
            <div>
              <label className="ps-label">Deck Location Barcode</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>{scannedDeckLocationLabel ?? '— not scanned —'}</span>
                <button className="ps-btn-small" style={{ background: armedDispatchScanTarget === 'deck' ? '#38bdf8' : undefined }} onClick={() => setArmedDispatchScanTarget('deck')}>
                  {armedDispatchScanTarget === 'deck' ? '📡 Waiting…' : '📷 Scan'}
                </button>
              </div>
            </div>
          </div>
          {dispatchResultMessage && (
            <div style={{ marginTop: 14, fontSize: 12, color: dispatchResultMessage.startsWith('Worklist dispatched') ? '#10B981' : '#ef4444' }}>{dispatchResultMessage}</div>
          )}
          <button className="ps-conf-btn-secondary" style={{ marginTop: 14 }} disabled={dispatching || !scannedPlateBarcode || !scannedDeckLocationLabel} onClick={handleDispatchWorklist}>
            {dispatching ? 'Dispatching…' : 'Confirm Dispatch'}
          </button>
        </div>
      )}

      {isNew && (
        <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Batch Info</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <label className="ps-label" htmlFor="mb-assay-code">Assay</label>
              <select id="mb-assay-code" className="ps-input-dark" style={{ width: '100%' }} value={assayCode}
                onChange={e => {
                  const selected = molecularAssayTypes.find(t => t.id === e.target.value);
                  setAssayCode(e.target.value);
                  setAssayName(selected?.name ?? '');
                }}>
                <option value="">— select assay —</option>
                {molecularAssayTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="ps-label" htmlFor="mb-instrument">Target Instrument</label>
              <input id="mb-instrument" className="ps-input-dark" value={targetInstrumentId} onChange={e => setTargetInstrumentId(e.target.value)} placeholder="e.g. PANTHER_02" />
            </div>
            <div>
              <label className="ps-label" htmlFor="mb-deck-slot">Deck Slot</label>
              <input id="mb-deck-slot" className="ps-input-dark" value={deckSlot} onChange={e => setDeckSlot(e.target.value)} placeholder="e.g. SLOT_A1" />
            </div>
            <div>
              <label className="ps-label" htmlFor="mb-plate-layout">Plate Layout</label>
              <select id="mb-plate-layout" className="ps-input-dark" value={plateLayout} onChange={e => handleLayoutChange(e.target.value as MolecularPlateLayout)}>
                <option value="8_strip">8-well strip (1×8)</option>
                <option value="12_strip">12-well strip (1×12)</option>
                <option value="6_well">6-well (2×3)</option>
                <option value="12_well">12-well (3×4)</option>
                <option value="24_well">24-well (4×6)</option>
                <option value="48_well">48-well (6×8)</option>
                <option value="96_well">96-well (8×12)</option>
                <option value="384_well">384-well (16×24)</option>
                <option value="1536_well">1536-well (32×48)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {isNew && (
        <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Reagent Lots</h3>
          {reagentLots.map((lot, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="ps-label">Component</label>
                <select className="ps-input-dark" value={lot.componentType} onChange={e => updateReagentLot(i, { componentType: e.target.value as MolecularReagentComponentType })}>
                  {MOLECULAR_REAGENT_COMPONENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="ps-label">Lot Number</label>
                <input className="ps-input-dark" value={lot.lotNumber} onChange={e => updateReagentLot(i, { lotNumber: e.target.value })} />
              </div>
              <div>
                <label className="ps-label">Expiration</label>
                <input className="ps-input-dark" type="date" value={lot.expirationDate.slice(0, 10)} onChange={e => updateReagentLot(i, { expirationDate: new Date(e.target.value).toISOString() })} />
              </div>
              <div>
                <label className="ps-label">QC Status</label>
                <select className="ps-input-dark" value={lot.qcStatus} onChange={e => updateReagentLot(i, { qcStatus: e.target.value as MolecularReagentLot['qcStatus'] })}>
                  <option value="signed_off">Signed Off</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <button className="ps-btn-small" onClick={() => removeReagentLot(i)}>Remove</button>
            </div>
          ))}
          <button className="ps-conf-btn-secondary" onClick={addReagentLot}>+ Add Reagent Lot</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 20, flex: 1, minWidth: 400 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Plate Layout ({displayDims.rows}×{displayDims.columns})</h3>
            {isNew && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ps-btn-small" onClick={() => handleAutoPopulate('row_major')}>Auto-fill (Row-Major)</button>
                <button className="ps-btn-small" onClick={() => handleAutoPopulate('column_major')}>Auto-fill (Column-Major)</button>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${displayDims.columns}, minmax(0, 1fr))`, gap: 3, overflowX: 'auto' }}>
            {displayWells.map(w => {
              const color = w.sampleType ? SAMPLE_TYPE_COLOR[w.sampleType] : undefined;
              const isSelected = w.wellPosition === selectedWellPos;
              return (
                <button
                  key={w.wellPosition}
                  onClick={() => !readOnly && setSelectedWellPos(w.wellPosition)}
                  title={w.sampleType ? `${w.wellPosition}: ${SAMPLE_TYPE_LABEL[w.sampleType]}${w.accessionNumber ? ` — ${w.accessionNumber}` : ''}` : w.wellPosition}
                  style={{
                    aspectRatio: '1', minWidth: 28, borderRadius: 4, fontSize: 8, fontWeight: 600,
                    background: color ? `${color}30` : '#1f2937', border: isSelected ? '2px solid #fff' : `1px solid ${color ?? '#374151'}`,
                    color: color ?? '#6b7280', cursor: readOnly ? 'default' : 'pointer', padding: 0,
                  }}>
                  {w.wellPosition}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', fontSize: 11 }}>
            {MOLECULAR_SAMPLE_TYPES.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: `${SAMPLE_TYPE_COLOR[t]}30`, border: `1px solid ${SAMPLE_TYPE_COLOR[t]}` }} />
                <span style={{ color: '#9ca3af' }}>{SAMPLE_TYPE_LABEL[t]}</span>
              </div>
            ))}
          </div>
        </div>

        {isNew && selectedWell && (
          <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 20, width: 280 }}>
            <h4 style={{ marginTop: 0 }}>Well {selectedWell.wellPosition}</h4>
            <label className="ps-label">Sample Type</label>
            <select className="ps-input-dark" style={{ width: '100%', marginBottom: 10 }} value={selectedWell.sampleType ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { sampleType: (e.target.value || undefined) as MolecularSampleType | undefined })}>
              <option value="">— unassigned —</option>
              {MOLECULAR_SAMPLE_TYPES.map(t => <option key={t} value={t}>{SAMPLE_TYPE_LABEL[t]}</option>)}
            </select>

            {selectedWell.sampleType && selectedWell.sampleType !== 'PATIENT_SPECIMEN' && (
              <>
                <label className="ps-label">Control Lot Number</label>
                <input className="ps-input-dark" style={{ width: '100%', marginBottom: 10 }} value={selectedWell.controlInfo?.controlLotNumber ?? ''}
                  onChange={e => updateWell(selectedWell.wellPosition, { controlInfo: { controlId: selectedWell.controlInfo?.controlId ?? e.target.value, controlLotNumber: e.target.value, controlExpirationDate: selectedWell.controlInfo?.controlExpirationDate ?? '', expectedValue: selectedWell.controlInfo?.expectedValue ?? 'NEGATIVE' } })} />
                <label className="ps-label">Control Expiration</label>
                <input className="ps-input-dark" style={{ width: '100%', marginBottom: 10 }} type="date"
                  onChange={e => updateWell(selectedWell.wellPosition, { controlInfo: { controlId: selectedWell.controlInfo?.controlId ?? '', controlLotNumber: selectedWell.controlInfo?.controlLotNumber ?? '', controlExpirationDate: new Date(e.target.value).toISOString(), expectedValue: selectedWell.controlInfo?.expectedValue ?? 'NEGATIVE' } })} />
              </>
            )}

            {selectedWell.sampleType === 'PATIENT_SPECIMEN' && (
              <>
                <label className="ps-label">Container Barcode</label>
                <input className="ps-input-dark" style={{ width: '100%', marginBottom: 6 }} value={selectedWell.containerBarcode ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { containerBarcode: e.target.value })} />
                <button className="ps-btn-small" style={{ width: '100%', marginBottom: 10, background: armedForScan ? '#38bdf8' : undefined }} onClick={() => setArmedForScan(a => !a)}>
                  {armedForScan ? '📡 Waiting for scan…' : '📷 Scan to Fill'}
                </button>
                {!manualWellEntryOpen ? (
                  <button className="ps-btn-small" style={{ width: '100%', marginBottom: 10 }} onClick={() => setManualWellEntryOpen(true)}>
                    ⌨️ Scan not working? Enter specimen ID manually
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <input
                      className="ps-input"
                      autoFocus
                      placeholder="Specimen / container barcode"
                      value={manualWellEntryValue}
                      onChange={e => setManualWellEntryValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleManualWellEntrySubmit(); }}
                    />
                    <button className="ps-btn-small" onClick={handleManualWellEntrySubmit} disabled={!manualWellEntryValue.trim()}>Fill</button>
                    <button className="ps-btn-small" onClick={() => { setManualWellEntryOpen(false); setManualWellEntryValue(''); }}>Cancel</button>
                  </div>
                )}
                <label className="ps-label">Accession Number</label>
                <input className="ps-input-dark" style={{ width: '100%', marginBottom: 10 }} value={selectedWell.accessionNumber ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { accessionNumber: e.target.value })} />
                {/* Real, direct correction, per direct follow-up + full
                    spec audit: §4.1's own worked example carries a real
                    aliquot_volume_ul for a real patient specimen well,
                    but no real UI input ever existed to capture it —
                    the field was threaded through the type and the
                    outbound payload builder, but nothing upstream ever
                    set it for a real, user-created well. */}
                <label className="ps-label">Aliquot Volume (µL)</label>
                <input className="ps-input-dark" type="number" min={0} style={{ width: '100%', marginBottom: 10 }} value={selectedWell.aliquotVolumeUl ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { aliquotVolumeUl: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </>
            )}
          </div>
        )}
      </div>

      {isNew && (
        <div style={{ marginTop: 20, border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          {!gating.allowed && (
            <div style={{ marginBottom: 14, fontSize: 12, color: '#ef4444' }}>
              {gating.failures.map((f, i) => <div key={i}>⚠️ {f.componentType} ({f.lotNumber || '—'}): {f.reason.replace(/_/g, ' ')}</div>)}
            </div>
          )}
          {!controlCheck.satisfied && (
            <div style={{ marginBottom: 14, fontSize: 12, color: '#ef4444' }}>
              {controlCheck.violations.map((v, i) => (
                <div key={i}>
                  ⚠️ {v.reason === 'missing'
                    ? `${v.sampleType} is required for this assay but not present on this plate`
                    : `${v.sampleType} must be at ${v.expectedPosition} but was found at ${v.actualPosition}`}
                </div>
              ))}
            </div>
          )}
          {saveError && <div style={{ marginBottom: 14, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
          <button className="ps-conf-btn-secondary" disabled={saving} onClick={handleCreate}>{saving ? 'Creating…' : 'Create Batch'}</button>
        </div>
      )}

      {existingBatch?.reviewStatus && (
        <div style={{ marginTop: 20, border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Run Results</h3>
          {existingBatch.reviewStatus === 'BLOCKED' && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: '#ef444418', border: '1px solid #ef444433', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
              ⚠️ Blocked from auto-verification — one or more controls on this run failed. Results require manual review before sign-out.
            </div>
          )}
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr>
                    <th className="ps-conf-th">Well</th>
                    <th className="ps-conf-th">Accession</th>
                    <th className="ps-conf-th">Ct Value</th>
                    <th className="ps-conf-th">Internal Control Ct</th>
                    <th className="ps-conf-th">Interpretation</th>
                    <th className="ps-conf-th">Flag</th>
                    <th className="ps-conf-th">Trace</th>
                  </tr>
                </thead>
                <tbody>
                  {(existingBatch.results ?? []).map((r, i) => {
                    const isExpanded = expandedTraceWellPos === r.well_position;
                    const trace = isExpanded ? resolveMolecularHistoricalTrace([existingBatch], { accessionNumber: r.accession_number }) : null;
                    return (
                      <React.Fragment key={i}>
                        <tr className="ps-conf-tr">
                          <td className="ps-conf-td">{r.well_position}</td>
                          <td className="ps-conf-td">{r.accession_number ?? '—'}</td>
                          <td className="ps-conf-td">{r.raw_data.ct_value ?? '—'}</td>
                          <td className="ps-conf-td">{r.raw_data.internal_control_ct ?? '—'}</td>
                          <td className="ps-conf-td">{r.interpretation}</td>
                          <td className="ps-conf-td">{r.flag}</td>
                          <td className="ps-conf-td">
                            <button className="ps-btn-small" onClick={() => setExpandedTraceWellPos(isExpanded ? null : r.well_position)}>
                              {isExpanded ? 'Hide' : 'Trace'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && trace && (
                          <tr>
                            <td colSpan={7} style={{ background: '#00000022', padding: 14, fontSize: 12 }}>
                              <div><strong>Plate UUID:</strong> {trace.plateUuid}</div>
                              <div><strong>Plate barcode:</strong> {trace.plateBarcode}</div>
                              <div><strong>Deck location:</strong> {trace.targetInstrumentId}{trace.deckSlot ? ` / ${trace.deckSlot}` : ' (no deck slot recorded)'}</div>
                              <div><strong>Batch created by:</strong> {trace.createdByUserName} ({trace.createdByUserId})</div>
                              <div><strong>Reagent lots:</strong> {trace.reagentLots.map(l => `${l.componentType} (${l.lotNumber})`).join(', ') || '—'}</div>
                              <div style={{ marginTop: 8 }}><strong>Movement history:</strong></div>
                              {trace.movementHistory.length === 0 && <div>No tracked movement recorded for this specimen.</div>}
                              {trace.movementHistory.map((m, mi) => (
                                <div key={mi}>
                                  {m.fromLevel.replace('_', ' ')} → {m.toLevel.replace('_', ' ')} — {m.byUserName} at {m.stationName} — {new Date(m.at).toLocaleString()}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {(!existingBatch.results || existingBatch.results.length === 0) && (
                    <tr><td className="ps-conf-empty-row" colSpan={7}>No per-well results received yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MolecularPlateBuilderPage;
