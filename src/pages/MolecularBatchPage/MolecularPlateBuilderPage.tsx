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
import { useTranslation } from 'react-i18next';
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
// Real label-key-map — MolecularSampleType itself (used for color
// indexing/filtering/backend) stays untouched; only the displayed
// label is resolved via i18n, at render time.
const SAMPLE_TYPE_LABEL_KEY: Record<MolecularSampleType, string> = {
  CONTROL_NTC: 'molecularPlateBuilderPage.sampleType.CONTROL_NTC',
  CONTROL_PTC_HIGH: 'molecularPlateBuilderPage.sampleType.CONTROL_PTC_HIGH',
  CONTROL_PTC_LOW: 'molecularPlateBuilderPage.sampleType.CONTROL_PTC_LOW',
  CALIBRATOR: 'molecularPlateBuilderPage.sampleType.CALIBRATOR',
  PATIENT_SPECIMEN: 'molecularPlateBuilderPage.sampleType.PATIENT_SPECIMEN',
};
const PLATE_LAYOUT_LABEL_KEY: Record<MolecularPlateLayout, string> = {
  '8_strip': 'molecularPlateBuilderPage.plateLayout.8_strip',
  '12_strip': 'molecularPlateBuilderPage.plateLayout.12_strip',
  '6_well': 'molecularPlateBuilderPage.plateLayout.6_well',
  '12_well': 'molecularPlateBuilderPage.plateLayout.12_well',
  '24_well': 'molecularPlateBuilderPage.plateLayout.24_well',
  '48_well': 'molecularPlateBuilderPage.plateLayout.48_well',
  '96_well': 'molecularPlateBuilderPage.plateLayout.96_well',
  '384_well': 'molecularPlateBuilderPage.plateLayout.384_well',
  '1536_well': 'molecularPlateBuilderPage.plateLayout.1536_well',
};

function emptyWellsFor(layout: MolecularPlateLayout): MolecularWell[] {
  const dims = MOLECULAR_PLATE_LAYOUTS[layout];
  const positions = generateWellPositionsInOrder(dims, 'row_major');
  return positions.map(wellPosition => ({ wellPosition }));
}

const MolecularPlateBuilderPage: React.FC = () => {
  const { t } = useTranslation();
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
      if (res.ok) setMolecularAssayTypes(res.data.filter(at => at.category === 'Molecular' && at.active));
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
  // Real bug fix, found while converting: this used to be a single
  // `dispatchResultMessage: string | null`, with the success/failure
  // color decided by string-matching the *displayed* text
  // (`.startsWith('Worklist dispatched')`) — which only worked because
  // that text was a hardcoded English literal. Once the success
  // message is translated, that match would silently break in every
  // other locale. Tracking success as its own boolean fixes this.
  const [dispatchResult, setDispatchResult] = useState<{ message: string; success: boolean } | null>(null);
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
    setDispatchResult(null);
    try {
      const result = await dispatchMolecularWorklist(existingBatch, scannedPlateBarcode, scannedDeckLocationLabel, getSessionUser());
      if (result.dispatched) {
        setDispatchResult({ message: t('molecularPlateBuilderPage.dispatchSuccess'), success: true });
        const refreshed = await mockMolecularBatchService.getById(existingBatch.id);
        if (refreshed.ok) setExistingBatch(refreshed.data);
        setDispatchPanelOpen(false);
      } else if ('reason' in result) {
        setDispatchResult({ message: result.reason, success: false });
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
        setCloneResultMessage('error' in result ? result.error : t('molecularPlateBuilderPage.genericCloneError'));
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
      setSaveError(t('molecularPlateBuilderPage.requiredFieldsError'));
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

  if (loading) return <div className="ps-conf-loading">{t('molecularPlateBuilderPage.loading')}</div>;

  const displayWells = existingBatch ? (existingBatch.wells.length > 0 ? existingBatch.wells : emptyWellsFor(existingBatch.plateLayout)) : wells;
  const displayDims = existingBatch ? MOLECULAR_PLATE_LAYOUTS[existingBatch.plateLayout] : dims;
  const readOnly = !isNew;

  return (
    <div className="ps-app-root ps-page-container ps-page-container--wide">
      <button className="ps-btn-small ps-back-btn" onClick={() => navigate(`/molecular${existingBatch ? `?tab=${workcenterTabForStatus(existingBatch.status)}` : ''}`)}>{t('molecularPlateBuilderPage.backToBatches')}</button>
      <div className="mb-header-row">
        <h1 className="mb-title">
          {isNew ? t('molecularPlateBuilderPage.newBatchTitle') : `${existingBatch?.batchBarcode} — ${existingBatch?.assayName}`}
        </h1>
        {existingBatch && (
          <div className="ps-flex-row-gap-8">
            <button className="ps-btn-small" onClick={() => printMolecularPlateLabel(existingBatch)}>{t('molecularPlateBuilderPage.plateLabel')}</button>
            <button className="ps-btn-small" onClick={() => printMolecularDeckLocationLabel(existingBatch)}>{t('molecularPlateBuilderPage.deckLocationLabel')}</button>
            <button className="ps-btn-small" onClick={() => printMolecularSpecimenLabels(existingBatch)}>{t('molecularPlateBuilderPage.specimenLabels')}</button>
            {!existingBatch.worklistDispatchedAt && existingBatch.status !== 'superseded' && (
              <button className="ps-btn-small" onClick={() => setDispatchPanelOpen(o => !o)}>{t('molecularPlateBuilderPage.dispatchWorklist')}</button>
            )}
            {existingBatch.status !== 'superseded' && (
              <button className="ps-btn-small" onClick={() => setClonePanelOpen(o => !o)}>{t('molecularPlateBuilderPage.cloneAndSupersede')}</button>
            )}
          </div>
        )}
      </div>

      {/* Real, per direct guidance on Clone & Supersede — a real,
          terminal batch always shows which real batch replaced it,
          rather than silently going stale with no forward pointer. */}
      {existingBatch?.supersededByBatchId && (
        <div className="mb-banner mb-banner--warning ps-mb-20">
          {t('molecularPlateBuilderPage.supersededBanner', {
            date: new Date(existingBatch.supersededAt!).toLocaleString(),
            name: existingBatch.supersededByUserName,
            reason: existingBatch.supersededReason,
          })} <span className="mb-link" onClick={() => navigate(`/molecular-batch/${existingBatch.supersededByBatchId}`)}>{t('molecularPlateBuilderPage.viewReplacementBatch')}</span>
        </div>
      )}
      {/* Real, per the same guidance — a clone always shows which
          batch it was cloned from, closing the 1:1 audit trail in
          both directions. Real copy cleanup found while converting:
          this banner and the one above both had the code comments'
          own "real, " rhetorical qualifier bleeding into actual
          user-facing copy ("a real clone of a superseded, earlier
          batch", "the real, replacement batch") — cleaned up to
          plain English before translating, so it isn't carried into
          every locale. */}
      {existingBatch?.clonedFromBatchId && (() => {
        const linkText = t('molecularPlateBuilderPage.supersededEarlierBatch');
        const full = t('molecularPlateBuilderPage.clonedFromBanner', { link: linkText });
        const idx = full.indexOf(linkText);
        return (
          <div className="mb-banner mb-banner--info ps-mb-20">
            🧬 {idx === -1 ? full : (
              <>
                {full.slice(0, idx)}
                <span className="mb-link" onClick={() => navigate(`/molecular-batch/${existingBatch.clonedFromBatchId}`)}>{linkText}</span>
                {full.slice(idx + linkText.length)}
              </>
            )}
          </div>
        );
      })()}

      {existingBatch?.worklistDispatchedAt && (
        <div className="mb-banner mb-banner--success ps-mb-20">
          {t('molecularPlateBuilderPage.worklistDispatchedAt', { date: new Date(existingBatch.worklistDispatchedAt).toLocaleString() })}
        </div>
      )}

      {existingBatch && clonePanelOpen && (
        <div className="mb-panel ps-mb-20">
          <h3 className="ps-panel-title">{t('molecularPlateBuilderPage.clonePanelTitle')}</h3>
          <p className="ps-helper-text ps-panel-title">
            {t('molecularPlateBuilderPage.clonePanelDescription')}
          </p>
          <label className="ps-label" htmlFor="mb-clone-reason">{t('molecularPlateBuilderPage.reasonRequiredLabel')}</label>
          <textarea
            id="mb-clone-reason"
            className="ps-input-dark mb-textarea"
            value={cloneReason}
            onChange={e => setCloneReason(e.target.value)}
            placeholder={t('molecularPlateBuilderPage.reasonPlaceholder')}
          />
          {cloneResultMessage && (
            <div className="ps-error-text">{cloneResultMessage}</div>
          )}
          <button className="ps-conf-btn-secondary" disabled={cloning || !cloneReason.trim()} onClick={handleCloneAndSupersede}>
            {cloning ? t('molecularPlateBuilderPage.cloning') : t('molecularPlateBuilderPage.confirmCloneAndSupersede')}
          </button>
        </div>
      )}

      {existingBatch && dispatchPanelOpen && (
        <div className="mb-panel ps-mb-20">
          <h3 className="ps-panel-title">{t('molecularPlateBuilderPage.dispatchPanelTitle')}</h3>
          <p className="ps-helper-text ps-panel-title">
            {t('molecularPlateBuilderPage.dispatchPanelDescription')}
          </p>
          <div className="mb-flex-gap-20-wrap">
            <div>
              <label className="ps-label">{t('molecularPlateBuilderPage.plateBarcodeLabel')}</label>
              <div className="ps-flex-row-gap-8">
                <span className="ps-fs-12">{scannedPlateBarcode ?? t('molecularPlateBuilderPage.notScanned')}</span>
                <button className={`ps-btn-small${armedDispatchScanTarget === 'plate' ? ' ps-btn-small--armed' : ''}`} onClick={() => setArmedDispatchScanTarget('plate')}>
                  {armedDispatchScanTarget === 'plate' ? t('molecularPlateBuilderPage.waitingScan') : t('molecularPlateBuilderPage.scan')}
                </button>
              </div>
            </div>
            <div>
              <label className="ps-label">{t('molecularPlateBuilderPage.deckLocationBarcodeLabel')}</label>
              <div className="ps-flex-row-gap-8">
                <span className="ps-fs-12">{scannedDeckLocationLabel ?? t('molecularPlateBuilderPage.notScanned')}</span>
                <button className={`ps-btn-small${armedDispatchScanTarget === 'deck' ? ' ps-btn-small--armed' : ''}`} onClick={() => setArmedDispatchScanTarget('deck')}>
                  {armedDispatchScanTarget === 'deck' ? t('molecularPlateBuilderPage.waitingScan') : t('molecularPlateBuilderPage.scan')}
                </button>
              </div>
            </div>
          </div>
          {dispatchResult && (
            <div className="mb-result-text" style={{ '--mb-result-color': dispatchResult.success ? '#10B981' : '#ef4444' } as React.CSSProperties}>{dispatchResult.message}</div>
          )}
          <button className="ps-conf-btn-secondary ps-mt-14" disabled={dispatching || !scannedPlateBarcode || !scannedDeckLocationLabel} onClick={handleDispatchWorklist}>
            {dispatching ? t('molecularPlateBuilderPage.dispatching') : t('molecularPlateBuilderPage.confirmDispatch')}
          </button>
        </div>
      )}

      {isNew && (
        <div className="mb-panel ps-mb-20">
          <h3 className="ps-panel-title">{t('molecularPlateBuilderPage.batchInfoTitle')}</h3>
          <div className="mb-flex-gap-12-wrap">
            <div className="mb-field-wide">
              <label className="ps-label" htmlFor="mb-assay-code">{t('molecularPlateBuilderPage.assayLabel')}</label>
              <select id="mb-assay-code" className="ps-input-dark ps-w-full" value={assayCode}
                onChange={e => {
                  const selected = molecularAssayTypes.find(at => at.id === e.target.value);
                  setAssayCode(e.target.value);
                  setAssayName(selected?.name ?? '');
                }}>
                <option value="">{t('molecularPlateBuilderPage.selectAssayOption')}</option>
                {molecularAssayTypes.map(at => <option key={at.id} value={at.id}>{at.name}</option>)}
              </select>
            </div>
            <div>
              <label className="ps-label" htmlFor="mb-instrument">{t('molecularPlateBuilderPage.targetInstrumentLabel')}</label>
              <input id="mb-instrument" className="ps-input-dark" value={targetInstrumentId} onChange={e => setTargetInstrumentId(e.target.value)} placeholder={t('molecularPlateBuilderPage.instrumentPlaceholder')} />
            </div>
            <div>
              <label className="ps-label" htmlFor="mb-deck-slot">{t('molecularPlateBuilderPage.deckSlotLabel')}</label>
              <input id="mb-deck-slot" className="ps-input-dark" value={deckSlot} onChange={e => setDeckSlot(e.target.value)} placeholder={t('molecularPlateBuilderPage.deckSlotPlaceholder')} />
            </div>
            <div>
              <label className="ps-label" htmlFor="mb-plate-layout">{t('molecularPlateBuilderPage.plateLayoutLabel')}</label>
              <select id="mb-plate-layout" className="ps-input-dark" value={plateLayout} onChange={e => handleLayoutChange(e.target.value as MolecularPlateLayout)}>
                {(Object.keys(PLATE_LAYOUT_LABEL_KEY) as MolecularPlateLayout[]).map(layoutKey => (
                  <option key={layoutKey} value={layoutKey}>{t(PLATE_LAYOUT_LABEL_KEY[layoutKey])}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {isNew && (
        <div className="mb-panel ps-mb-20">
          <h3 className="ps-panel-title">{t('molecularPlateBuilderPage.reagentLotsTitle')}</h3>
          {reagentLots.map((lot, i) => (
            <div key={i} className="mb-reagent-row">
              <div>
                <label className="ps-label">{t('molecularPlateBuilderPage.componentLabel')}</label>
                <select className="ps-input-dark" value={lot.componentType} onChange={e => updateReagentLot(i, { componentType: e.target.value as MolecularReagentComponentType })}>
                  {MOLECULAR_REAGENT_COMPONENT_TYPES.map(rt => <option key={rt} value={rt}>{rt.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="ps-label">{t('molecularPlateBuilderPage.lotNumberLabel')}</label>
                <input className="ps-input-dark" value={lot.lotNumber} onChange={e => updateReagentLot(i, { lotNumber: e.target.value })} />
              </div>
              <div>
                <label className="ps-label">{t('molecularPlateBuilderPage.expirationLabel')}</label>
                <input className="ps-input-dark" type="date" value={lot.expirationDate.slice(0, 10)} onChange={e => updateReagentLot(i, { expirationDate: new Date(e.target.value).toISOString() })} />
              </div>
              <div>
                <label className="ps-label">{t('molecularPlateBuilderPage.qcStatusLabel')}</label>
                <select className="ps-input-dark" value={lot.qcStatus} onChange={e => updateReagentLot(i, { qcStatus: e.target.value as MolecularReagentLot['qcStatus'] })}>
                  <option value="signed_off">{t('molecularPlateBuilderPage.qcSignedOff')}</option>
                  <option value="pending">{t('molecularPlateBuilderPage.qcPending')}</option>
                  <option value="failed">{t('molecularPlateBuilderPage.qcFailed')}</option>
                </select>
              </div>
              <button className="ps-btn-small" onClick={() => removeReagentLot(i)}>{t('molecularPlateBuilderPage.removeButton')}</button>
            </div>
          ))}
          <button className="ps-conf-btn-secondary" onClick={addReagentLot}>{t('molecularPlateBuilderPage.addReagentLot')}</button>
        </div>
      )}

      <div className="mb-flex-gap-20-wrap">
        <div className="mb-plate-panel">
          <div className="mb-flex-between-mb14">
            <h3 className="ps-panel-title">{t('molecularPlateBuilderPage.plateLayoutHeading', { rows: displayDims.rows, columns: displayDims.columns })}</h3>
            {isNew && (
              <div className="ps-flex-row-gap-8">
                <button className="ps-btn-small" onClick={() => handleAutoPopulate('row_major')}>{t('molecularPlateBuilderPage.autoFillRowMajor')}</button>
                <button className="ps-btn-small" onClick={() => handleAutoPopulate('column_major')}>{t('molecularPlateBuilderPage.autoFillColumnMajor')}</button>
              </div>
            )}
          </div>
          <div className="mb-plate-grid" style={{ '--mb-plate-cols': `repeat(${displayDims.columns}, minmax(0, 1fr))` } as React.CSSProperties}>
            {displayWells.map(w => {
              const color = w.sampleType ? SAMPLE_TYPE_COLOR[w.sampleType] : undefined;
              const isSelected = w.wellPosition === selectedWellPos;
              return (
                <button
                  key={w.wellPosition}
                  onClick={() => !readOnly && setSelectedWellPos(w.wellPosition)}
                  title={w.sampleType ? `${w.wellPosition}: ${t(SAMPLE_TYPE_LABEL_KEY[w.sampleType])}${w.accessionNumber ? ` — ${w.accessionNumber}` : ''}` : w.wellPosition}
                  className="mb-well-btn"
                  style={{
                    '--mb-well-bg': color ? `${color}30` : '#1f2937',
                    '--mb-well-border': isSelected ? '2px solid #fff' : `1px solid ${color ?? '#374151'}`,
                    '--mb-well-color': color ?? '#6b7280',
                    '--mb-well-cursor': readOnly ? 'default' : 'pointer',
                  } as React.CSSProperties}>
                  {w.wellPosition}
                </button>
              );
            })}
          </div>
          <div className="mb-legend-row">
            {MOLECULAR_SAMPLE_TYPES.map(st => (
              <div key={st} className="mb-legend-item">
                <div className="mb-legend-swatch" style={{ '--mb-swatch-bg': `${SAMPLE_TYPE_COLOR[st]}30`, '--mb-swatch-border': SAMPLE_TYPE_COLOR[st] } as React.CSSProperties} />
                <span className="mb-legend-label">{t(SAMPLE_TYPE_LABEL_KEY[st])}</span>
              </div>
            ))}
          </div>
        </div>

        {isNew && selectedWell && (
          <div className="mb-well-panel">
            <h4 className="ps-panel-title">{t('molecularPlateBuilderPage.wellHeading', { position: selectedWell.wellPosition })}</h4>
            <label className="ps-label">{t('molecularPlateBuilderPage.sampleTypeLabel')}</label>
            <select className="ps-input-dark ps-w-full ps-mb-10" value={selectedWell.sampleType ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { sampleType: (e.target.value || undefined) as MolecularSampleType | undefined })}>
              <option value="">{t('molecularPlateBuilderPage.unassignedOption')}</option>
              {MOLECULAR_SAMPLE_TYPES.map(st => <option key={st} value={st}>{t(SAMPLE_TYPE_LABEL_KEY[st])}</option>)}
            </select>

            {selectedWell.sampleType && selectedWell.sampleType !== 'PATIENT_SPECIMEN' && (
              <>
                <label className="ps-label">{t('molecularPlateBuilderPage.controlLotNumberLabel')}</label>
                <input className="ps-input-dark ps-w-full ps-mb-10" value={selectedWell.controlInfo?.controlLotNumber ?? ''}
                  onChange={e => updateWell(selectedWell.wellPosition, { controlInfo: { controlId: selectedWell.controlInfo?.controlId ?? e.target.value, controlLotNumber: e.target.value, controlExpirationDate: selectedWell.controlInfo?.controlExpirationDate ?? '', expectedValue: selectedWell.controlInfo?.expectedValue ?? 'NEGATIVE' } })} />
                <label className="ps-label">{t('molecularPlateBuilderPage.controlExpirationLabel')}</label>
                <input className="ps-input-dark ps-w-full ps-mb-10" type="date"
                  onChange={e => updateWell(selectedWell.wellPosition, { controlInfo: { controlId: selectedWell.controlInfo?.controlId ?? '', controlLotNumber: selectedWell.controlInfo?.controlLotNumber ?? '', controlExpirationDate: new Date(e.target.value).toISOString(), expectedValue: selectedWell.controlInfo?.expectedValue ?? 'NEGATIVE' } })} />
              </>
            )}

            {selectedWell.sampleType === 'PATIENT_SPECIMEN' && (
              <>
                <label className="ps-label">{t('molecularPlateBuilderPage.containerBarcodeLabel')}</label>
                <input className="ps-input-dark ps-w-full ps-mb-6" value={selectedWell.containerBarcode ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { containerBarcode: e.target.value })} />
                <button className={`ps-btn-small ps-w-full ps-mb-10${armedForScan ? ' ps-btn-small--armed' : ''}`} onClick={() => setArmedForScan(a => !a)}>
                  {armedForScan ? t('molecularPlateBuilderPage.waitingForScan') : t('molecularPlateBuilderPage.scanToFill')}
                </button>
                {!manualWellEntryOpen ? (
                  <button className="ps-btn-small ps-w-full ps-mb-10" onClick={() => setManualWellEntryOpen(true)}>
                    {t('molecularPlateBuilderPage.manualEntryPrompt')}
                  </button>
                ) : (
                  <div className="ps-flex-row-gap-8 ps-mb-10">
                    <input
                      className="ps-input"
                      autoFocus
                      placeholder={t('molecularPlateBuilderPage.manualEntryPlaceholder')}
                      value={manualWellEntryValue}
                      onChange={e => setManualWellEntryValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleManualWellEntrySubmit(); }}
                    />
                    <button className="ps-btn-small" onClick={handleManualWellEntrySubmit} disabled={!manualWellEntryValue.trim()}>{t('molecularPlateBuilderPage.fill')}</button>
                    <button className="ps-btn-small" onClick={() => { setManualWellEntryOpen(false); setManualWellEntryValue(''); }}>{t('molecularPlateBuilderPage.cancel')}</button>
                  </div>
                )}
                <label className="ps-label">{t('molecularPlateBuilderPage.accessionNumberLabel')}</label>
                <input className="ps-input-dark ps-w-full ps-mb-10" value={selectedWell.accessionNumber ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { accessionNumber: e.target.value })} />
                {/* Real, direct correction, per direct follow-up + full
                    spec audit: §4.1's own worked example carries a real
                    aliquot_volume_ul for a real patient specimen well,
                    but no real UI input ever existed to capture it —
                    the field was threaded through the type and the
                    outbound payload builder, but nothing upstream ever
                    set it for a real, user-created well. */}
                <label className="ps-label">{t('molecularPlateBuilderPage.aliquotVolumeLabel')}</label>
                <input className="ps-input-dark ps-w-full ps-mb-10" type="number" min={0} value={selectedWell.aliquotVolumeUl ?? ''} onChange={e => updateWell(selectedWell.wellPosition, { aliquotVolumeUl: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </>
            )}
          </div>
        )}
      </div>

      {isNew && (
        <div className="mb-panel ps-mt-20">
          {!gating.allowed && (
            <div className="ps-error-text">
              {gating.failures.map((f, i) => <div key={i}>{t('molecularPlateBuilderPage.gatingFailure', { componentType: f.componentType, lotNumber: f.lotNumber || '—', reason: f.reason.replace(/_/g, ' ') })}</div>)}
            </div>
          )}
          {!controlCheck.satisfied && (
            <div className="ps-error-text">
              {controlCheck.violations.map((v, i) => (
                <div key={i}>
                  ⚠️ {v.reason === 'missing'
                    ? t('molecularPlateBuilderPage.controlMissing', { sampleType: v.sampleType })
                    : t('molecularPlateBuilderPage.controlMismatch', { sampleType: v.sampleType, expectedPosition: v.expectedPosition, actualPosition: v.actualPosition })}
                </div>
              ))}
            </div>
          )}
          {saveError && <div className="ps-error-text">{saveError}</div>}
          <button className="ps-conf-btn-secondary" disabled={saving} onClick={handleCreate}>{saving ? t('molecularPlateBuilderPage.creating') : t('molecularPlateBuilderPage.createBatch')}</button>
        </div>
      )}

      {existingBatch?.reviewStatus && (
        <div className="mb-panel ps-mt-20">
          <h3 className="ps-panel-title">{t('molecularPlateBuilderPage.runResultsTitle')}</h3>
          {existingBatch.reviewStatus === 'BLOCKED' && (
            <div className="mb-banner mb-banner--error ps-mb-14">
              {t('molecularPlateBuilderPage.blockedBanner')}
            </div>
          )}
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colWell')}</th>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colAccession')}</th>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colCtValue')}</th>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colInternalControlCt')}</th>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colInterpretation')}</th>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colFlag')}</th>
                    <th className="ps-conf-th">{t('molecularPlateBuilderPage.colTrace')}</th>
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
                              {isExpanded ? t('molecularPlateBuilderPage.hide') : t('molecularPlateBuilderPage.trace')}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && trace && (
                          <tr>
                            <td colSpan={7} className="mb-trace-cell">
                              <div><strong>{t('molecularPlateBuilderPage.tracePlateUuid')}</strong> {trace.plateUuid}</div>
                              <div><strong>{t('molecularPlateBuilderPage.tracePlateBarcode')}</strong> {trace.plateBarcode}</div>
                              <div><strong>{t('molecularPlateBuilderPage.traceDeckLocation')}</strong> {trace.targetInstrumentId}{trace.deckSlot ? ` / ${trace.deckSlot}` : t('molecularPlateBuilderPage.noDeckSlotRecorded')}</div>
                              <div><strong>{t('molecularPlateBuilderPage.traceCreatedBy')}</strong> {trace.createdByUserName} ({trace.createdByUserId})</div>
                              <div><strong>{t('molecularPlateBuilderPage.traceReagentLots')}</strong> {trace.reagentLots.map(l => `${l.componentType} (${l.lotNumber})`).join(', ') || '—'}</div>
                              <div className="ps-mt-8"><strong>{t('molecularPlateBuilderPage.traceMovementHistory')}</strong></div>
                              {trace.movementHistory.length === 0 && <div>{t('molecularPlateBuilderPage.noMovementRecorded')}</div>}
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
                    <tr><td className="ps-conf-empty-row" colSpan={7}>{t('molecularPlateBuilderPage.noResultsYet')}</td></tr>
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
