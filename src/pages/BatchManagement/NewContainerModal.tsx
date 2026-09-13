// src/pages/BatchManagement/NewContainerModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "Container & Batch
// Label Management" — FR-1: "Container Barcode Generation & Dual-Mode
// Printing." Renamed from CreateBatchModal.tsx (this file's own earlier
// name) to match the spec's own real button label, "[ 🖨️ New Container ]"
// — a genuinely more elaborate, real flow than the original, simpler
// "Create Batch" form: real container-type selection, real dual-mode
// identifier handling (disposable vs. semi-permanent hardware), and a
// real target-workstation override.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { batchService, hardwareContainerRegistryService, printSettingsService, facilityService, stainTypeService } from '@/services';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { StainType } from '@/services';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { generateBarcodeSvg } from '@/utils/labels/generateBarcodeSvg';
import { dispatchContainerLabelPrint } from '@/utils/labels/dispatchContainerLabelPrint';
import { CONTAINER_TYPES, isHardwareEligible } from '@/services/hardwareContainers/IHardwareContainerRegistryService';
import type { ContainerType, HardwareContainer } from '@/services/hardwareContainers/IHardwareContainerRegistryService';
import { BATCH_PROCESSING_NODES } from '@/services/batches/IBatchService';
import type { Batch, BatchProcessingNode, BatchPriority } from '@/services/batches/IBatchService';
import { DECAL_SOLUTION_TYPES, DECAL_WARNING_MINUTES_BEFORE_TARGET, formatDecalDuration } from '@/services/batches/DecalBatch';
import type { DecalSolutionType } from '@/services/batches/DecalBatch';
import type { ScanStation } from '@/services/scanStations/IScanStationService';
import { DEFAULT_PRINT_SETTINGS_CONFIG } from '@/services/printSettings/IPrintSettingsService';
import type { PrintSettingsConfig } from '@/services/printSettings/IPrintSettingsService';

interface Props {
  onClose: () => void;
  onCreated: (batch: Batch) => void;
  userId: string;
  userName: string;
  stationId: string | null;
  /** Real feature, per direct, detailed specification, FR-2.2: scanning
   *  an already-registered, currently-Available rack with no active
   *  batch of its own opens this modal pre-filled to Mode B with that
   *  rack, rather than a real, honest "not found" — the tech still
   *  supplies protocol/processing node (never fabricated), but doesn't
   *  have to re-type/re-select a rack they already just scanned. */
  initialRackId?: string;
}

type IdentifierMode = 'disposable' | 'semi_permanent';

/** Real fix, per direct follow-up: "We should be consistent with
 *  respect to the scan stations. I see a scan station belonging to a
 *  workload stage." Confirmed directly: this modal previously treated
 *  Processing Node and Target Workstation as two fully independent
 *  fields with zero connection between them, even though a
 *  ScanStation already, genuinely "belongs to" a real workflowStage
 *  (IScanStationService.ts) — asking a tech to specify the same real
 *  fact twice, with no cross-check, when the station record already
 *  carries it. Exact string match only (both vocabularies were just
 *  aligned to share the identical wording, see BATCH_PROCESSING_NODES'
 *  own comment) — a station whose real workflowStage doesn't map to a
 *  real processing node at all (Accessioning/Slide Archival/Other, or
 *  simply unset — workflowStage is real, genuinely optional free text)
 *  correctly derives nothing, rather than guessing. */
function deriveNodeFromStation(station: ScanStation | undefined): BatchProcessingNode | null {
  if (!station?.workflowStage) return null;
  const match = BATCH_PROCESSING_NODES.find(n => n === station.workflowStage);
  return match ?? null;
}

const NewContainerModal: React.FC<Props> = ({ onClose, onCreated, userId, userName, stationId, initialRackId }) => {
  const { t } = useTranslation();
  const [containerType, setContainerType] = useState<ContainerType>(CONTAINER_TYPES[0]);
  const [processingNode, setProcessingNode] = useState<BatchProcessingNode>(BATCH_PROCESSING_NODES[0]);
  const [nodeAutoDerived, setNodeAutoDerived] = useState(false);
  const [protocol, setProtocol] = useState('');
  const [priority, setPriority] = useState<BatchPriority>('Routine');
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>(initialRackId ? 'semi_permanent' : 'disposable');
  const [rackId, setRackId] = useState(initialRackId ?? '');
  // Real feature, per direct, detailed specification: "Decal /
  // Special Processing Batch Attributes." Only meaningful (and only
  // shown below) when processingNode === 'Decal / Special Processing'
  // — see DecalBatch.ts's own header. Hours/minutes as two real,
  // human-friendly inputs (matching the spec's own "4 hours" wording)
  // rather than asking a tech to type raw minutes; combined into one
  // real targetDurationMinutes value on create.
  const [solutionType, setSolutionType] = useState<DecalSolutionType>(DECAL_SOLUTION_TYPES[0]);
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
  // Laboratory Specimen Referral gap — the real, existing Facility
  // dictionary's own reference_lab-role entries, fetched fresh so a
  // newly added reference lab is immediately selectable here too.
  const [referenceLabs, setReferenceLabs] = useState<Facility[]>([]);
  const [referralDestinationFacilityId, setReferralDestinationFacilityId] = useState('');
  const [referralTestRequested, setReferralTestRequested] = useState('');
  useEffect(() => {
    facilityService.getAll().then(res => {
      if (res.ok) setReferenceLabs(res.data.filter(f => f.roles.includes('reference_lab')));
    });
  }, []);
  // Real, additive — per 'Cytology Staining' (Batch.cytologyStainTypeId's
  // own doc comment). Same real "node-specific required field, fetched
  // from the real dictionary" pattern as referenceLabs above.
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [cytologyStainTypeId, setCytologyStainTypeId] = useState('');
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
  }, []);
  const [targetHours, setTargetHours] = useState(4);
  const [targetMinutesExtra, setTargetMinutesExtra] = useState(0);

  // Real feature, per the spec's own FR-1.2 "Target Workstation Node:
  // Auto-populates active workstation ID with manual override
  // options." Auto-populated from the real, current, sticky scan
  // station (useCurrentScanStation, same real source
  // MaterialTreePanel.tsx's own station indicator already uses); the
  // dropdown itself lists every real, active ScanStation for a manual
  // override, not the spec's own hardcoded worked examples ("Processor
  // 01, Stainer 02") — this app's own real station registry already
  // has real names, no need to invent a second, parallel list.
  const [targetStationId, setTargetStationId] = useState<string | null>(stationId);
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [availableRacks, setAvailableRacks] = useState<HardwareContainer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBatch, setCreatedBatch] = useState<Batch | null>(null);
  // Real feature, per direct follow-up: "Admin Config screen for
  // Container Label Management." Real, admin-configured symbology and
  // rack-prefix convention — was a hardcoded 'code128' literal and a
  // hardcoded "RACK-" string directly in this file before
  // PrintSettingsConfig grew these fields (Config > System > Print
  // Settings).
  const [printSettings, setPrintSettings] = useState<PrintSettingsConfig>(DEFAULT_PRINT_SETTINGS_CONFIG);

  useEffect(() => {
    printSettingsService.get().then(res => { if (res.ok) setPrintSettings(res.data); });
  }, []);

  useEffect(() => {
    mockScanStationService.getAll().then(res => { if (res.ok) setStations(res.data.filter(s => s.status === 'Active')); });
  }, []);

  // Real, initial derivation — once real station data has loaded,
  // check whether the already-sticky current station (targetStationId,
  // from useCurrentScanStation via the stationId prop) carries a real
  // workflowStage this modal can trust, and default Processing Node
  // to it — rather than always defaulting to BATCH_PROCESSING_NODES[0]
  // regardless of what bench the tech is actually standing at.
  useEffect(() => {
    if (!targetStationId || stations.length === 0) return;
    const derived = deriveNodeFromStation(stations.find(s => s.id === targetStationId));
    if (derived) { setProcessingNode(derived); setNodeAutoDerived(true); }
  }, [stations, targetStationId]);

  const handleStationChange = (newStationId: string | null) => {
    setTargetStationId(newStationId);
    const derived = deriveNodeFromStation(stations.find(s => s.id === newStationId));
    if (derived) { setProcessingNode(derived); setNodeAutoDerived(true); }
    else { setNodeAutoDerived(false); }
  };

  useEffect(() => {
    if (!initialRackId) return;
    hardwareContainerRegistryService.getByRackId(initialRackId).then(res => {
      if ('ok' in res && res.ok) setContainerType(res.data.containerType);
    });
  }, [initialRackId]);

  useEffect(() => {
    if (!isHardwareEligible(containerType)) { setIdentifierMode('disposable'); return; }
    hardwareContainerRegistryService.getAll().then(res => {
      if (res.ok) setAvailableRacks(res.data.filter(c => c.containerType === containerType && c.status === 'Available'));
    });
  }, [containerType]);

  const isDecalNode = processingNode === 'Decal / Special Processing';
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
  // Laboratory Specimen Referral gap — same real "node-specific
  // required fields" pattern as isDecalNode above.
  const isReferralNode = processingNode === 'External Referral';
  // Real, additive — same real "node-specific required field" pattern
  // as isDecalNode/isReferralNode above.
  const isCytologyStainingNode = processingNode === 'Cytology Staining';
  const targetDurationMinutes = targetHours * 60 + targetMinutesExtra;
  const canCreate = protocol.trim().length > 0
    && (identifierMode === 'disposable' || rackId.trim().length > 0)
    && (!isDecalNode || targetDurationMinutes > 0)
    && (!isReferralNode || referralDestinationFacilityId.trim().length > 0)
    && (!isCytologyStainingNode || cytologyStainTypeId.trim().length > 0);

  // Real, derived (not stateful) mismatch check — recomputed on every
  // render from whatever's currently selected, so it stays correct
  // even after a manual override of either field individually, not
  // just right after an auto-fill. Only a real, positive mismatch
  // (the station has a real, mapped stage AND it differs) triggers
  // this — a station with no workflowStage, or one that maps to
  // nothing (Accessioning/Slide Archival/Other), is correctly silent
  // here rather than a false-positive warning.
  const selectedStation = stations.find(s => s.id === targetStationId);
  const stationDerivedNode = deriveNodeFromStation(selectedStation);
  const stationNodeMismatch = stationDerivedNode !== null && stationDerivedNode !== processingNode;

  const handleCreate = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const res = await batchService.create({
      processingNode, protocol: protocol.trim(), priority,
      stationId: targetStationId ?? undefined,
      createdByUserId: userId, createdByUserName: userName,
      containerType, identifierMode,
      rackId: identifierMode === 'semi_permanent' ? rackId.trim() : undefined,
      solutionType: isDecalNode ? solutionType : undefined,
      targetDurationMinutes: isDecalNode ? targetDurationMinutes : undefined,
      referralDestinationFacilityId: isReferralNode ? referralDestinationFacilityId : undefined,
      referralTestRequested: isReferralNode ? (referralTestRequested.trim() || undefined) : undefined,
      cytologyStainTypeId: isCytologyStainingNode ? cytologyStainTypeId : undefined,
    });
    setBusy(false);
    if ('error' in res) { setError(res.error); return; }
    setCreatedBatch(res.data);
    // Real, honest record alongside the real, working window.print()
    // call below (fired when the tech actually clicks Print) — only
    // for a real, new disposable label; Mode B checks a rack out but
    // never prints a new one.
    if (identifierMode === 'disposable') {
      dispatchContainerLabelPrint({
        masterBarcode: res.data.masterBarcode,
        printerIp: selectedStation?.printerIp,
        symbology: printSettings.containerBarcodeSymbology,
        labelSizePresetId: printSettings.containerLabelPresetId,
      }).catch(() => {});
    }
  };

  const barcodeSvg = createdBatch ? generateBarcodeSvg(createdBatch.masterBarcode, printSettings.containerBarcodeSymbology, { includeText: true }) : null;

  return (
    <div className="ps-overlay ps-batch-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-batch-create-modal" onClick={e => e.stopPropagation()}>
        {!createdBatch ? (
          <>
            <div className="ps-batch-modal-header">
              <div className="ps-batch-modal-title">🖨️ {t('newContainerModal.title')}</div>
              <button className="ps-mth-close" onClick={onClose}>✕</button>
            </div>
            <div className="ps-batch-modal-body">
              <label className="ps-batch-field-label">{t('newContainerModal.containerType')}</label>
              <select className="ps-batch-select" value={containerType} onChange={e => setContainerType(e.target.value as ContainerType)}>
                {CONTAINER_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>

              <label className="ps-batch-field-label">{t('newContainerModal.targetWorkstation')}</label>
              <select className="ps-batch-select" value={targetStationId ?? ''} onChange={e => handleStationChange(e.target.value || null)}>
                <option value="">{t('newContainerModal.noStation')}</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}{s.workflowStage ? ` (${s.workflowStage})` : ''}</option>)}
              </select>

              <label className="ps-batch-field-label">{t('newContainerModal.processingNode')}</label>
              <select
                className="ps-batch-select"
                value={processingNode}
                onChange={e => { setProcessingNode(e.target.value as BatchProcessingNode); setNodeAutoDerived(false); }}
              >
                {BATCH_PROCESSING_NODES.map(node => <option key={node} value={node}>{t(`batchManagement.nodes.${node}`)}</option>)}
              </select>
              {/* Real feature, per direct follow-up: "we should be
                  consistent with respect to the scan stations. I see a
                  scan station belonging to a workload stage." A
                  station already, genuinely carries its own real
                  workflowStage — surfacing that connection here
                  (confirmation when it drove the field, a real warning
                  when the tech has since picked something else) rather
                  than asking for the same real fact twice with no
                  cross-check. */}
              {nodeAutoDerived && !stationNodeMismatch && (
                <div className="ps-batch-node-hint">{t('newContainerModal.autoSetFromStation', { station: selectedStation?.name })}</div>
              )}
              {stationNodeMismatch && (
                <div className="ps-batch-node-hint ps-batch-node-hint--warn">
                  {t('newContainerModal.stationMismatchWarning', { station: selectedStation?.name, node: stationDerivedNode ? t(`batchManagement.nodes.${stationDerivedNode}`) : stationDerivedNode })}
                </div>
              )}

              <label className="ps-batch-field-label">{t('newContainerModal.protocolLabel')}</label>
              <input
                className="ps-batch-text-input"
                type="text"
                placeholder={t('newContainerModal.protocolPlaceholder')}
                value={protocol}
                onChange={e => setProtocol(e.target.value)}
              />

              <label className="ps-batch-field-label">{t('newContainerModal.priority')}</label>
              <div className="ps-batch-priority-toggle">
                <button
                  className={`ps-batch-priority-btn${priority === 'Routine' ? ' ps-batch-priority-btn--active' : ''}`}
                  onClick={() => setPriority('Routine')}
                >
                  {t('newContainerModal.routine')}
                </button>
                <button
                  className={`ps-batch-priority-btn ps-batch-priority-btn--stat${priority === 'STAT' ? ' ps-batch-priority-btn--active' : ''}`}
                  onClick={() => setPriority('STAT')}
                >
                  {t('newContainerModal.stat')}
                </button>
              </div>

              {/* Real feature, per direct, detailed specification:
                  "Decal / Special Processing Batch Attributes." Only
                  shown for this one real processing node — Solution
                  Type is a real, closed set (downstream alert timing
                  depends on knowing which real solution is in use);
                  Start Timestamp isn't a field here at all, since
                  Batch.createdAt (set the moment "Generate & Print" is
                  pressed) already IS the real start of the decal
                  clock — see DecalBatch.ts's own getDecalTimerState. */}
              {isDecalNode && (
                <>
                  <label className="ps-batch-field-label">{t('newContainerModal.solutionType')}</label>
                  <select className="ps-batch-select" value={solutionType} onChange={e => setSolutionType(e.target.value as DecalSolutionType)}>
                    {DECAL_SOLUTION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label className="ps-batch-field-label">{t('newContainerModal.targetDuration')}</label>
                  <div className="ps-batch-duration-row">
                    <div className="ps-batch-duration-field">
                      <input
                        className="ps-batch-text-input ps-batch-duration-input"
                        type="number" min={0} max={99}
                        value={targetHours}
                        onChange={e => setTargetHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      />
                      <span className="ps-batch-duration-unit">{t('newContainerModal.hours')}</span>
                    </div>
                    <div className="ps-batch-duration-field">
                      <input
                        className="ps-batch-text-input ps-batch-duration-input"
                        type="number" min={0} max={59}
                        value={targetMinutesExtra}
                        onChange={e => setTargetMinutesExtra(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      />
                      <span className="ps-batch-duration-unit">{t('newContainerModal.minutes')}</span>
                    </div>
                  </div>
                  <div className="ps-batch-duration-hint">
                    {t('newContainerModal.warningAlertAt', { duration: formatDecalDuration(Math.max(0, targetDurationMinutes - DECAL_WARNING_MINUTES_BEFORE_TARGET)), minutesBefore: DECAL_WARNING_MINUTES_BEFORE_TARGET })}
                  </div>
                </>
              )}

              {/* Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
                  Inter-Laboratory Specimen Referral gap — only shown for
                  this one real processing node. Destination is a real
                  Facility carrying the reference_lab role, never a
                  free-text destination name. */}
              {isReferralNode && (
                <>
                  <label className="ps-batch-field-label">{t('newContainerModal.referenceLabDestination')}</label>
                  <select className="ps-batch-select" value={referralDestinationFacilityId} onChange={e => setReferralDestinationFacilityId(e.target.value)}>
                    <option value="">{t('newContainerModal.selectReferenceLab')}</option>
                    {referenceLabs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  {referenceLabs.length === 0 && (
                    <div className="ps-batch-duration-hint">
                      {t('newContainerModal.noReferenceLabConfigured')}
                    </div>
                  )}

                  <label className="ps-batch-field-label">{t('newContainerModal.testPanelRequested')}</label>
                  <input
                    className="ps-batch-text-input"
                    value={referralTestRequested}
                    onChange={e => setReferralTestRequested(e.target.value)}
                    placeholder={t('newContainerModal.testPanelPlaceholder')}
                  />
                </>
              )}

              {/* Real, additive — per 'Cytology Staining' (Batch.
                  cytologyStainTypeId's own doc comment). Only shown for
                  this one real processing node. Real FK into the Stain
                  Dictionary (the "Diagnostic Catalog"), never a
                  free-text stain name. */}
              {isCytologyStainingNode && (
                <>
                  <label className="ps-batch-field-label">{t('newContainerModal.stainProtocol')}</label>
                  <select className="ps-batch-select" value={cytologyStainTypeId} onChange={e => setCytologyStainTypeId(e.target.value)}>
                    <option value="">{t('newContainerModal.selectStainProtocol')}</option>
                    {stainTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </>
              )}

              {/* Real feature, per the spec's own FR-1.2 "Container
                  Identifier Mode." Ad-Hoc Batch is never hardware-
                  eligible (isHardwareEligible), so this toggle only
                  shows for the three real, physical container types. */}
              {isHardwareEligible(containerType) && (
                <>
                  <label className="ps-batch-field-label">{t('newContainerModal.containerIdentifierMode')}</label>
                  <div className="ps-batch-priority-toggle">
                    <button
                      className={`ps-batch-priority-btn${identifierMode === 'disposable' ? ' ps-batch-priority-btn--active' : ''}`}
                      onClick={() => setIdentifierMode('disposable')}
                      title={t('newContainerModal.disposableLabelTitle')}
                    >
                      {t('newContainerModal.disposableLabel')}
                    </button>
                    <button
                      className={`ps-batch-priority-btn${identifierMode === 'semi_permanent' ? ' ps-batch-priority-btn--active' : ''}`}
                      onClick={() => setIdentifierMode('semi_permanent')}
                      title={t('newContainerModal.reusableRackTitle')}
                    >
                      {t('newContainerModal.reusableRack')}
                    </button>
                  </div>

                  {identifierMode === 'semi_permanent' && (
                    <>
                      <label className="ps-batch-field-label">{t('newContainerModal.rackId')}</label>
                      <input
                        className="ps-batch-text-input"
                        type="text"
                        placeholder={t('newContainerModal.rackIdPlaceholder', { example: `${printSettings.rackBarcodePrefix}-${printSettings.containerTypeCodes[containerType]}-04` })}
                        value={rackId}
                        onChange={e => setRackId(e.target.value)}
                      />
                      {availableRacks.length > 0 && (
                        <div className="ps-batch-rack-picker">
                          {availableRacks.map(r => (
                            <button key={r.id} className="ps-batch-rack-chip" onClick={() => setRackId(r.rackId)}>
                              {r.rackId}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {error && <div className="ps-batch-modal-error">{error}</div>}
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
              <button className="ps-btn-primary" disabled={!canCreate || busy} onClick={handleCreate}>
                {busy ? t('newContainerModal.generating') : identifierMode === 'disposable' ? t('newContainerModal.generateAndPrint') : t('newContainerModal.startSession')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ps-batch-modal-header">
              <div className="ps-batch-modal-title">
                {createdBatch.identifierMode === 'semi_permanent' ? t('newContainerModal.sessionStarted') : t('newContainerModal.containerCreated')}
              </div>
              <button className="ps-mth-close" onClick={() => onCreated(createdBatch)}>✕</button>
            </div>
            <div className="ps-batch-modal-body ps-batch-barcode-body">
              {createdBatch.identifierMode === 'semi_permanent' ? (
                <div className="ps-batch-barcode-label">
                  {t('newContainerModal.rackCheckedOutNoPrint', { barcode: createdBatch.masterBarcode })}
                </div>
              ) : (
                <>
                  <div className="ps-batch-barcode-label">{t('newContainerModal.printInstructions')}</div>
                  {barcodeSvg && (
                    <div className="ps-batch-barcode-svg-wrap" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                  )}
                </>
              )}
              <div className="ps-batch-barcode-value">{createdBatch.masterBarcode}</div>
              <div className="ps-batch-barcode-meta">{createdBatch.containerType} · {t(`batchManagement.nodes.${createdBatch.processingNode}`)} · {createdBatch.protocol} · {createdBatch.priority}</div>
            </div>
            <div className="ps-batch-modal-footer">
              {createdBatch.identifierMode !== 'semi_permanent' && (
                <button className="ps-btn-secondary" onClick={() => window.print()}>🖨️ {t('newContainerModal.print')}</button>
              )}
              <button className="ps-btn-primary" onClick={() => onCreated(createdBatch)}>{t('newContainerModal.continueScanItems')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NewContainerModal;
