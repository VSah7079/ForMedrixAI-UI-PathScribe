// src/pages/SlideDistributionStationPage/components/DestinationControlPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-286's own Right Panel (Action & Destination Controls):
// "Destination toggle (Physical Checkout vs. Digital Scanner
// Ingestion), Pathologist/Subspecialty quick-picker grid, Scanner/Rack
// selection controls." Also implements "Automatic Routing Logic:
// pre-populates default attending/primary reading service for Physical
// Checkout from the case's existing LIS assignment" — the parent
// passes the real, already-resolved default (Case.assignedTo/
// Case.subspecialtyId, via useSlideDistributionStation's own
// resolveDefaultRouting), applied here only as a starting point the
// tech can still override, never a silent, un-overridable auto-assign.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffUser } from '@/services/users/IUserService';
import type { Subspecialty } from '@/services/subspecialties/ISubspecialtyService';
import type { SlideQueueItem } from '../hooks/useSlideDistributionStation';
import type { PhysicalAssignment, ScannerAssignment } from '@/utils/slideDistributionOperations';

export type DestinationMode = 'physical' | 'digital';

export interface DestinationControlPanelProps {
  activeItem: SlideQueueItem | undefined;
  pathologists: StaffUser[];
  subspecialties: Subspecialty[];
  defaultRouting: { pathologistId?: string; pathologistName?: string; subspecialtyId?: string };
  onAssignPhysical: (assignment: PhysicalAssignment) => void;
  onAssignScanner: (assignment: ScannerAssignment) => void;
  feedback: string | null;
  /** Real, per the header's own "Selected Destination Mode" context
   *  field — lifted to the page so the header can display it, rather
   *  than staying trapped as this panel's own local state. */
  mode: DestinationMode;
  onModeChange: (mode: DestinationMode) => void;
}

const DestinationControlPanel: React.FC<DestinationControlPanelProps> = ({
  activeItem, pathologists, subspecialties, defaultRouting, onAssignPhysical, onAssignScanner, feedback, mode, onModeChange,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [pathologistId, setPathologistId] = useState<string | undefined>(undefined);
  const [subspecialtyId, setSubspecialtyId] = useState<string | undefined>(undefined);
  const [slideFolderId, setSlideFolderId] = useState('');
  const [trayNumber, setTrayNumber] = useState('');
  const [courierBagId, setCourierBagId] = useState('');
  const [scannerInstrumentId, setScannerInstrumentId] = useState('');
  const [rackId, setRackId] = useState('');
  const [slotPosition, setSlotPosition] = useState('');

  // Real, per this file's own header — pre-fill from the real
  // case-level default the moment a NEW, not-yet-routed slide becomes
  // active; never overwrite a slide that's already been explicitly
  // routed, and never fight the tech's own in-progress edits on the
  // same slide (keyed on queueId, not on every render).
  useEffect(() => {
    if (!activeItem) return;
    setSearch(''); setSlideFolderId(''); setTrayNumber(''); setCourierBagId('');
    setScannerInstrumentId(''); setRackId(''); setSlotPosition('');
    if (activeItem.stain.distributionDestination === 'digital') {
      onModeChange('digital');
      setPathologistId(undefined); setSubspecialtyId(undefined);
    } else {
      onModeChange('physical');
      setPathologistId(activeItem.stain.assignedPathologistId ?? defaultRouting.pathologistId);
      setSubspecialtyId(activeItem.stain.assignedSubspecialtyId ?? defaultRouting.subspecialtyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.queueId]);

  const filteredPathologists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pathologists;
    return pathologists.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }, [pathologists, search]);

  const filteredSubspecialties = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subspecialties;
    return subspecialties.filter(s => s.name.toLowerCase().includes(q));
  }, [subspecialties, search]);

  if (!activeItem) {
    return <div className="ps-slidedist-panel"><div className="ps-slidedist-empty">{t('slideDistribution.destination.selectFirst')}</div></div>;
  }

  const handlePathologistPick = (id: string) => { setPathologistId(prev => prev === id ? undefined : id); setSubspecialtyId(undefined); };
  const handleSubspecialtyPick = (id: string) => { setSubspecialtyId(prev => prev === id ? undefined : id); setPathologistId(undefined); };

  const handleAssignPhysicalClick = () => {
    const pathologist = pathologists.find(p => p.id === pathologistId);
    onAssignPhysical({
      pathologistId, pathologistName: pathologist ? `${pathologist.firstName} ${pathologist.lastName}` : undefined,
      subspecialtyId, slideFolderId: slideFolderId || undefined, trayNumber: trayNumber || undefined, courierBagId: courierBagId || undefined,
    });
  };

  const handleAssignScannerClick = () => {
    onAssignScanner({ scannerInstrumentId: scannerInstrumentId || undefined, rackId: rackId || undefined, slotPosition: slotPosition || undefined });
  };

  return (
    <div>
      <div className="ps-slidedist-panel" style={{ marginBottom: 14 }}>
        <p className="ps-slidedist-panel-title">{t('slideDistribution.destination.title')}</p>
        <div className="ps-slidedist-destination-toggle">
          <button type="button" className={`ps-slidedist-toggle-btn${mode === 'physical' ? ' ps-slidedist-toggle-btn--active' : ''}`} onClick={() => onModeChange('physical')}>
            {t('slideDistribution.destination.physical')}
          </button>
          <button type="button" className={`ps-slidedist-toggle-btn${mode === 'digital' ? ' ps-slidedist-toggle-btn--active' : ''}`} onClick={() => onModeChange('digital')}>
            {t('slideDistribution.destination.digital')}
          </button>
        </div>

        {mode === 'physical' ? (
          <>
            <input
              type="text" className="ps-slidedist-search-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('slideDistribution.destination.searchPlaceholder') ?? ''}
            />
            <div className="ps-slidedist-picker-grid">
              {filteredPathologists.map(p => (
                <button
                  key={p.id} type="button"
                  className={`ps-slidedist-picker-chip${pathologistId === p.id ? ' ps-slidedist-picker-chip--active' : ''}`}
                  onClick={() => handlePathologistPick(p.id)}
                >
                  Dr. {p.lastName}
                </button>
              ))}
              {filteredSubspecialties.map(s => (
                <button
                  key={s.id} type="button"
                  className={`ps-slidedist-picker-chip${subspecialtyId === s.id ? ' ps-slidedist-picker-chip--active' : ''}`}
                  onClick={() => handleSubspecialtyPick(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>

            <label className="ps-slidedist-field-label">{t('slideDistribution.destination.slideFolderId')}</label>
            <input type="text" className="ps-slidedist-field-input" value={slideFolderId} onChange={e => setSlideFolderId(e.target.value)} />
            <label className="ps-slidedist-field-label">{t('slideDistribution.destination.trayNumber')}</label>
            <input type="text" className="ps-slidedist-field-input" value={trayNumber} onChange={e => setTrayNumber(e.target.value)} />
            <label className="ps-slidedist-field-label">{t('slideDistribution.destination.courierBagId')}</label>
            <input type="text" className="ps-slidedist-field-input" value={courierBagId} onChange={e => setCourierBagId(e.target.value)} />

            <button type="button" className="ps-btn-primary" onClick={handleAssignPhysicalClick} disabled={!pathologistId && !subspecialtyId && !slideFolderId && !trayNumber && !courierBagId}>
              ✅ {t('slideDistribution.destination.confirmPhysical')}
            </button>
          </>
        ) : (
          <>
            <label className="ps-slidedist-field-label">{t('slideDistribution.destination.scannerInstrument')}</label>
            <input type="text" className="ps-slidedist-field-input" value={scannerInstrumentId} onChange={e => setScannerInstrumentId(e.target.value)} placeholder="e.g. Leica Aperio GT450 #2" />
            <label className="ps-slidedist-field-label">{t('slideDistribution.destination.rackId')}</label>
            <input type="text" className="ps-slidedist-field-input" value={rackId} onChange={e => setRackId(e.target.value)} placeholder="e.g. Rack ID 102" />
            <label className="ps-slidedist-field-label">{t('slideDistribution.destination.slotPosition')}</label>
            <input type="text" className="ps-slidedist-field-input" value={slotPosition} onChange={e => setSlotPosition(e.target.value)} placeholder="e.g. Slot 14" />

            <button type="button" className="ps-btn-primary" onClick={handleAssignScannerClick} disabled={!scannerInstrumentId}>
              ✅ {t('slideDistribution.destination.confirmDigital')}
            </button>
          </>
        )}
        {feedback && <div className="ps-slidedist-scan-error" style={{ marginTop: 8 }}>{feedback}</div>}
      </div>
    </div>
  );
};

export default DestinationControlPanel;
