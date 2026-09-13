// src/pages/MolecularBatchPage/MolecularRackLoadingPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Implement the load into extraction
// rack workflow step (§5.1's secondary_rack stage)." The real, missing
// workflow step this module's own type system (Phase 8) already
// anticipated but nothing emitted: a tech scans a real specimen vial
// and places it at a real, specific position on a real extraction
// rack, ahead of eventual plate loading. This is that real step.
//
// Real, deliberate reuse: the same, already-established
// PATHSCRIBE_SCAN event and useCurrentScanStation()/getSessionUser()
// pattern the plate builder's own scan-to-well flow already uses — no
// second, competing scan mechanism, no separate station/user
// resolution logic.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../pathscribe.css';
import { mockMolecularExtractionRackService } from '../../services/molecular/mockMolecularExtractionRackService';
import { resolveMolecularMovementRecord } from '../../services/molecular/resolveMolecularMovementRecord';
import { useCurrentScanStation } from '../../hooks/useCurrentScanStation';
import { mockScanStationService } from '../../services/scanStations/mockScanStationService';
import { getSessionUser } from '../../services/auth/caseAccessControl';
import type { MolecularExtractionRack } from '../../services/molecular/IMolecularExtractionRackService';

const MolecularRackLoadingPage: React.FC = () => {
  const navigate = useNavigate();
  const { rackId } = useParams<{ rackId: string }>();
  const isNew = rackId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [rack, setRack] = useState<MolecularExtractionRack | null>(null);
  const [capacity, setCapacity] = useState(24);
  const [creating, setCreating] = useState(false);

  const [selectedPositionLabel, setSelectedPositionLabel] = useState<string | null>(null);
  const [armedForScan, setArmedForScan] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { stationId } = useCurrentScanStation();
  const [stationName, setStationName] = useState<string>('Unknown Station');
  useEffect(() => {
    if (!stationId) { setStationName('Unknown Station'); return; }
    mockScanStationService.getById(stationId).then(res => { if (res.ok) setStationName(res.data.name); });
  }, [stationId]);

  useEffect(() => {
    if (isNew || !rackId) return;
    mockMolecularExtractionRackService.getById(rackId).then(res => {
      if (res.ok) setRack(res.data);
      setLoading(false);
    });
  }, [rackId, isNew]);

  useEffect(() => {
    if (!armedForScan || !selectedPositionLabel || !rack) return;
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { raw: string; matchedAccession?: string } | undefined;
      if (!detail?.raw) return;
      setArmedForScan(false);
      await loadSpecimenAtSelectedPosition(detail.raw, detail.matchedAccession);
    };
    window.addEventListener('PATHSCRIBE_SCAN', handler);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', handler);
  }, [armedForScan, selectedPositionLabel, rack, stationId, stationName]);

  // Real, per direct follow-up: "If the scan doesn't work, they need
  // a way to input the specimen manually." Confirmed directly before
  // building this — there was no fallback at all when a barcode is
  // damaged, unreadable, or a scanner malfunctions; a tech was
  // genuinely stuck with no way to proceed. Real, shared core logic
  // — extracted so the manual path produces the exact same real
  // movement record and rack-loading outcome as a successful scan,
  // never a second, divergent code path.
  const loadSpecimenAtSelectedPosition = async (raw: string, matchedAccession?: string) => {
    if (!selectedPositionLabel || !rack) return;
    setLoadError(null);

    const session = getSessionUser();
    const byUserId = session?.id ?? 'unknown';
    const byUserName = session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : 'Unknown User';
    const movement = resolveMolecularMovementRecord(
      'primary_vial', 'secondary_rack', raw, `${rack.rackBarcode}:${selectedPositionLabel}`,
      { byUserId, byUserName, stationId: stationId ?? 'unknown', stationName },
    );

    const res = await mockMolecularExtractionRackService.loadSpecimenIntoPosition(
      rack.id, selectedPositionLabel,
      { accessionNumber: matchedAccession, containerBarcode: raw },
      movement,
    );
    if (!res.ok) { setLoadError('error' in res ? res.error : 'Unknown error loading specimen into rack.'); return; }
    setRack(res.data);

    // Real, per the plate builder's own established pattern: auto-
    // advance to the next real, empty position so a tech can load a
    // whole rack of specimens in sequence without re-selecting each
    // time.
    const next = res.data.positions.find(p => !p.containerBarcode);
    if (next) { setSelectedPositionLabel(next.positionLabel); setArmedForScan(true); }
  };

  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntryValue, setManualEntryValue] = useState('');
  const handleManualEntrySubmit = async () => {
    const trimmed = manualEntryValue.trim();
    if (!trimmed) return;
    // Real, honest posture: a manually-typed barcode has no real
    // accession auto-match the way a real scan's own resolution
    // pipeline provides (ScannerProvider) — matchedAccession is left
    // undefined, same as any other real, unmatched scan; the tech's
    // own real, typed containerBarcode is still recorded faithfully.
    await loadSpecimenAtSelectedPosition(trimmed, undefined);
    setManualEntryValue('');
    setManualEntryOpen(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const session = getSessionUser();
      const res = await mockMolecularExtractionRackService.create({
        capacity,
        createdByUserId: session?.id ?? 'unknown',
        createdByUserName: session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : 'Unknown User',
      });
      if (res.ok) navigate(`/molecular-rack/${res.data.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="ps-conf-loading">Loading…</div>;

  return (
    <div className="ps-app-root ps-page-container ps-page-container--narrow">
      <button className="ps-btn-small ps-back-btn" onClick={() => navigate('/molecular-rack')}>← Back to Racks</button>

      {isNew && (
        <div className="ps-panel-box">
          <h1 className="ps-section-title">New Extraction Rack</h1>
          <label className="ps-label" htmlFor="rack-capacity">Capacity</label>
          <input id="rack-capacity" className="ps-input-dark" type="number" min={1} max={384} value={capacity} onChange={e => setCapacity(Number(e.target.value) || 1)} />
          <div className="ps-mt-16">
            <button className="ps-conf-btn-secondary" disabled={creating} onClick={handleCreate}>{creating ? 'Creating…' : 'Create Rack'}</button>
          </div>
        </div>
      )}

      {!isNew && rack && (
        <>
          <h1 className="ps-section-title">{rack.rackBarcode}</h1>
          <p className="ps-helper-text">
            Select an empty position, then scan a specimen vial to load it — per §5.1, this records the primary_vial → secondary_rack movement with the current user and station.
          </p>
          {loadError && <div className="ps-error-text">{loadError}</div>}
          <div className="ps-rack-position-grid">
            {rack.positions.map(p => {
              const isSelected = p.positionLabel === selectedPositionLabel;
              const occupied = !!p.containerBarcode;
              return (
                <button
                  key={p.positionLabel}
                  onClick={() => !occupied && setSelectedPositionLabel(p.positionLabel)}
                  title={occupied ? `${p.positionLabel}: ${p.containerBarcode}${p.accessionNumber ? ` — ${p.accessionNumber}` : ''}` : `Position ${p.positionLabel} — empty`}
                  className={`ps-rack-position${occupied ? ' ps-rack-position--occupied' : ''}${isSelected ? ' ps-rack-position--selected' : ''}`}>
                  {p.positionLabel}
                </button>
              );
            })}
          </div>
          {selectedPositionLabel && (
            <>
              <button className={`ps-btn-small ps-mt-16${armedForScan ? ' ps-btn-small--armed' : ''}`} onClick={() => setArmedForScan(a => !a)}>
                {armedForScan ? `📡 Waiting for scan into position ${selectedPositionLabel}…` : `📷 Scan into position ${selectedPositionLabel}`}
              </button>
              {!manualEntryOpen ? (
                <button className="ps-btn-small ps-mt-16" onClick={() => setManualEntryOpen(true)}>
                  ⌨️ Scan not working? Enter specimen ID manually
                </button>
              ) : (
                <div className="ps-mt-16" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="ps-input"
                    autoFocus
                    placeholder="Specimen / container barcode"
                    value={manualEntryValue}
                    onChange={e => setManualEntryValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleManualEntrySubmit(); }}
                  />
                  <button className="ps-btn-small" onClick={handleManualEntrySubmit} disabled={!manualEntryValue.trim()}>Load</button>
                  <button className="ps-btn-small" onClick={() => { setManualEntryOpen(false); setManualEntryValue(''); }}>Cancel</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default MolecularRackLoadingPage;
