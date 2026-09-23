import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { IActionRegistryService } from '../../../services/actionRegistry/IActionRegistryService';
import { userService, subspecialtyService } from '../../../services';
import { getStaffSubspecialtyDisplay } from '../../../utils/staffSubspecialties';
import type { StaffUser, Subspecialty } from '../../../services';
import { mockDelegationTypeService } from '../../../services/delegationTypes/mockDelegationTypeService';
import { delegateCase } from '../../../services/cases/mockCaseService';

interface Pool {
  id: string;
  name: string;
  subspecialty: string;
  memberCount: number;
}

interface SynopticOption {
  instanceId: string;
  specimenDescription: string;
  templateName: string;
}

interface DelegateModalProps {
  isOpen: boolean;
  onClose: () => void;
  registry: IActionRegistryService;
  caseId?: string;
  currentUserId?: string;
  onDelegated?: () => void;
  synopticInstances?: SynopticOption[];
}

// ─── Draggable recipient card — staff or pool ────────────────────────────────

interface RecipientCardProps {
  id: string; // 'staff-<id>' or 'pool-<id>'
  primary: string;
  secondary: string;
  isSelected: boolean;
  onClick: () => void;
}

const RecipientCard: React.FC<RecipientCardProps> = ({ id, primary, secondary, isSelected, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`ps-delegate-recipient-card${isDragging ? ' ps-delegate-recipient-card--dragging' : isSelected ? ' ps-delegate-recipient-card--selected' : ''}`}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined }}
    >
      <div className="ps-delegate-recipient-row">
        <div className="ps-delegate-recipient-avatar">
          {primary.replace(/^Dr\.\s*/, '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
        </div>
        <div className="ps-delegate-recipient-info">
          <div className="ps-delegate-recipient-primary">{primary}</div>
          <div className="ps-delegate-recipient-secondary">{secondary}</div>
        </div>
        <div className="ps-delegate-recipient-grip">⠿</div>
      </div>
    </div>
  );
};

// ─── Delegation type — now a real drop zone ───────────────────────────────────

interface TypeZoneProps {
  dt: any;
  isSelected: boolean;
  isOver: boolean;
  selectedRecipientLabel: string | null;
  onSelectType: () => void;
  onClearRecipient: () => void;
}

const TypeZone: React.FC<TypeZoneProps> = ({ dt, isSelected, isOver, selectedRecipientLabel, onSelectType, onClearRecipient }) => {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: `type-${dt.id}` });

  return (
    <div
      ref={setNodeRef}
      onClick={onSelectType}
      className="ps-delegate-type-zone"
      style={{
        background: isOver ? dt.color + '14' : isSelected ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1.5px ${isOver ? 'solid' : isSelected ? 'solid' : 'dashed'} ${isOver ? dt.color + '66' : isSelected ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="ps-delegate-type-zone-row">
        {/* dt.id/label/description are real, admin-configurable
            delegation-type data (mockDelegationTypeService.ts's own
            create() lets a site define custom types beyond the 7
            seeded defaults) — same "real, admin-editable dictionary
            stays untranslated" precedent as colorNames in
            EngraverMonitorPage.tsx, not static UI copy. */}
        <span className="ps-delegate-type-zone-id-badge" style={{
          background: isSelected ? dt.color + '22' : undefined, color: isSelected ? dt.color : undefined,
        }}>
          {dt.id.replace('_', ' ')}
        </span>
        <span className="ps-delegate-type-zone-label">{dt.label}</span>
        {isSelected && <span className="ps-delegate-type-zone-check">✓</span>}
      </div>
      <div className="ps-delegate-type-zone-desc">{dt.description}</div>
      {dt.transfersOwnership && (
        <span className="ps-delegate-type-zone-transfer-note">{t('delegateModal.transfersOwnership')}</span>
      )}
      {isSelected && (
        selectedRecipientLabel ? (
          <div className="ps-delegate-type-zone-recipient-chip">
            <span className="ps-delegate-type-zone-recipient-label">{selectedRecipientLabel}</span>
            <button onClick={e => { e.stopPropagation(); onClearRecipient(); }} className="ps-delegate-type-zone-recipient-clear">✕</button>
          </div>
        ) : (
          <div className="ps-delegate-type-zone-drop-hint">
            {isOver ? t('delegateModal.dropToAssign') : t('delegateModal.dragOrClickHint')}
          </div>
        )
      )}
    </div>
  );
};

export const DelegateModal: React.FC<DelegateModalProps> = ({
  isOpen, onClose, registry, caseId, currentUserId = 'PATH-001', onDelegated, synopticInstances = []
}) => {
  const { t } = useTranslation();
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [searchTerm,         setSearchTerm]         = useState('');
  const [selectedId,         setSelectedId]         = useState<string | null>(null);
  const [filter,             setFilter]             = useState<'individuals' | 'pools'>('individuals');
  const [confirming,         setConfirming]         = useState(false);
  const [delegationType,     setDelegationType]     = useState<string | null>(null);
  const [note,               setNote]               = useState('');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [delegationTypes,    setDelegationTypes]    = useState<any[]>([]);
  const [staff,              setStaff]              = useState<{id:string;name:string;role:string;subspecialty:string}[]>([]);
  const [loading,            setLoading]            = useState(false);
  const [activeId,           setActiveId]           = useState<string | null>(null);
  const [overId,             setOverId]             = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const contextPools: Pool[] = subspecialties
    .filter(s => s.active)
    .map(s => ({
      id: s.id,
      name: s.name,
      subspecialty: s.name,
      memberCount: s.userIds?.length ?? 0,
    }));

  // Real fix, per direct follow-up: "How is it possible to apply an
  // individual to the Move To Pool delegation Type?" Move to Pool's
  // own definition is "any available pathologist" (a workgroup
  // queue) — never one specific, named person — so the moment it's
  // selected, the directory should show pools, not individuals, and
  // vice versa the moment any other type is selected. Also clears any
  // already-selected recipient that no longer makes sense for the
  // newly-selected type (e.g. switching away from Move to Pool with a
  // pool already picked).
  useEffect(() => {
    const shouldShowPools = delegationType === 'POOL';
    setFilter(shouldShowPools ? 'pools' : 'individuals');
    setSelectedId(prev => {
      if (!prev) return prev;
      const isCurrentSelectionAPool = contextPools.some(p => p.id === prev);
      return isCurrentSelectionAPool === shouldShowPools ? prev : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegationType]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm(''); setSelectedId(null); setConfirming(false);
      setDelegationType(null); setNote(''); setSelectedInstanceId(null);
      setLoading(true);
      Promise.all([
        userService.getAll(),
        mockDelegationTypeService.getActive(),
        subspecialtyService.getAll(),
      ]).then(([usersResult, typesResult, subspecialtiesResult]) => {
        const allSubspecialties = subspecialtiesResult.ok ? subspecialtiesResult.data : [];
        if (usersResult.ok) {
          const delegates = usersResult.data
            .filter((u: StaffUser) =>
              u.id !== currentUserId &&
              u.roles.some(r => r === 'Pathologist' || r === 'Resident')
            )
            .map((u: StaffUser) => {
              const prefix = u.credentials ? 'Dr. ' : '';
              const parts   = [u.firstName, u.middleName, u.lastName].filter(Boolean);
              return {
                id:          u.id,
                name:        prefix + parts.join(' '),
                role:        u.roles.find(r => r === 'Pathologist' || r === 'Resident') ?? u.roles[0] ?? 'Staff',
                // Real fix, per direct confirmation: replaces the old
                // free-text department field with the real, assigned
                // Subspecialty name(s) — this field was already
                // called "subspecialty" but was incorrectly reading
                // department instead of the real relationship.
                subspecialty: getStaffSubspecialtyDisplay(u.id, allSubspecialties),
              };
            });
          setStaff(delegates);
        }
        if (typesResult.ok) setDelegationTypes(typesResult.data);
        if (subspecialtiesResult.ok) setSubspecialties(subspecialtiesResult.data);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [isOpen, currentUserId]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = registry.onAction((actionId) => {
      if (actionId === 'CLOSE_MODAL' || actionId === 'NAVIGATE_BACK') onClose();
    });
    return () => unsubscribe();
  }, [isOpen, registry, onClose]);

  // Real fix, per direct follow-up: "How is it possible to apply an
  // individual to the Move To Pool delegation Type?" Confirmed
  // directly: the filter toggle below (Individual / Pool) was
  // completely independent of the selected delegation type — a user
  // could pick "Move to Pool" and still switch to "Individual" and
  // drag a named staff member onto it, even though that type's own
  // definition is "any available pathologist" (a workgroup queue),
  // not one specific, named person. The real fix lives at the filter
  // level below (auto-synced to the delegation type, with the
  // inapplicable toggle hidden entirely) rather than here — emptying
  // these arrays alone would just turn into a confusing, unexplained
  // "no results" state if the two ever got out of sync.
  const filteredStaff = staff.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.subspecialty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPools = contextPools.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.subspecialty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedStaff     = staff.find(s => s.id === selectedId);
  const selectedPool      = contextPools.find(p => p.id === selectedId);
  const selectedLabel     = selectedStaff?.name ?? selectedPool?.name ?? null;
  const selectedDelegType = delegationTypes.find(d => d.id === delegationType);

  const canConfirm =
    !!delegationType &&
    !!selectedId &&
    !confirming &&
    !(selectedDelegType?.requiresNote && !note) &&
    !(delegationType === 'SYNOPTIC_ASSIGN' && synopticInstances.length > 0 && !selectedInstanceId);

  // ── drag handling — sets BOTH delegationType and selectedId at once ──────────
  // Click-to-select (below, on each type zone and each recipient card) still
  // works independently -- this is a faster additive gesture, not a
  // replacement. Deliberately does NOT auto-confirm: dropping only sets the
  // selection, same as clicking would -- the explicit Confirm Delegation
  // button is still required before anything real happens. A couple of
  // these delegation types transfer case ownership; a single accidental
  // drag is a much easier mistake than a deliberate click sequence, so the
  // final confirm step stays mandatory regardless of how the selection was made.
  const handleDragStart = (event: DragStartEvent) => { setActiveId(String(event.active.id)); };
  const handleDragOver  = (event: any)             => { setOverId(event.over ? String(event.over.id) : null); };
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null); setOverId(null);
    const { active, over } = event;
    if (!over) return;
    const recipientId = String(active.id).replace(/^(staff|pool)-/, '');
    const typeId = String(over.id).replace('type-', '');
    setDelegationType(typeId);
    setSelectedId(recipientId);
    setSelectedInstanceId(null);
  };

  const draggingStaff = activeId?.startsWith('staff-') ? staff.find(s => `staff-${s.id}` === activeId) : null;
  const draggingPool  = activeId?.startsWith('pool-')  ? contextPools.find(p => `pool-${p.id}` === activeId) : null;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    try {
      if (caseId) {
        if (delegationType === 'SYNOPTIC_ASSIGN' && selectedInstanceId) {
          const { assignSynoptic } = await import('../../../services/cases/mockCaseService');
          await assignSynoptic(
            caseId, selectedInstanceId,
            selectedId ?? '', selectedLabel ?? '',
            currentUserId, true, note || undefined,
          );
        } else {
          const isPool = selectedPool !== undefined;
          await delegateCase({
            caseId, requestorId: currentUserId, delegationType: delegationType!,
            targetUserId:   isPool ? undefined : (selectedId ?? undefined),
            targetUserName: isPool ? undefined : (selectedLabel ?? undefined),
            targetPoolId:   isPool ? (selectedId ?? undefined) : undefined,
            targetPoolName: isPool ? selectedLabel ?? undefined : undefined,
            note: note || undefined,
          });
        }
      }
      onDelegated?.();
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-research-modal fm-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="ps-research-header">
          <div>
            <div className="fm-eyebrow">{t('delegateModal.eyebrow')}</div>
            <div className="fm-title-row">
              <span className="fm-del-persona-icon">👤</span>
              <h2 className="fm-title">{t('delegateModal.title')}</h2>
              {selectedDelegType && (
                <span className="fm-del-mode-badge">
                  {selectedDelegType.label}
                </span>
              )}
            </div>
          </div>
          <button className="ps-close-btn" onClick={onClose} aria-label={t('delegateModal.close')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Two-panel body — matches CaseTeamModal's drop-zone pattern ── */}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="ps-delegate-body">

            {/* LEFT — delegation types, each a real drop zone */}
            <div className="ps-delegate-left-panel">
              <div className="fm-section-label fm-section-label--mb8">{t('delegateModal.delegationTypeLabel')}</div>
              {delegationTypes.map(dt => (
                <TypeZone
                  key={dt.id}
                  dt={dt}
                  isSelected={delegationType === dt.id}
                  isOver={overId === `type-${dt.id}`}
                  selectedRecipientLabel={delegationType === dt.id ? selectedLabel : null}
                  onSelectType={() => {
                    const isSel = delegationType === dt.id;
                    setDelegationType(isSel ? null : dt.id);
                    if (!isSel) setSelectedInstanceId(null);
                  }}
                  onClearRecipient={() => setSelectedId(null)}
                />
              ))}

              {/* Synoptic picker — unchanged from before */}
              {delegationType === 'SYNOPTIC_ASSIGN' && synopticInstances.length > 0 && (
                <div className="ps-delegate-synoptic-section">
                  <div className="fm-section-label fm-section-label--mb6">{t('delegateModal.selectSynoptic')}</div>
                  {synopticInstances.map(inst => {
                    const isSel = selectedInstanceId === inst.instanceId;
                    return (
                      <div
                        key={inst.instanceId}
                        onClick={() => setSelectedInstanceId(isSel ? null : inst.instanceId)}
                        className={`ps-delegate-synoptic-item${isSel ? ' ps-delegate-synoptic-item--selected' : ''}`}
                      >
                        <div className="ps-delegate-synoptic-item-title">{inst.specimenDescription}</div>
                        <div className="ps-delegate-synoptic-item-subtitle">{inst.templateName}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Note field if required — unchanged from before */}
              {selectedDelegType?.requiresNote && (
                <div className="ps-delegate-note-section">
                  <div className="fm-section-label fm-section-label--sm">{t('delegateModal.noteRequired')}</div>
                  <input
                    type="text"
                    placeholder={t('delegateModal.notePlaceholder')}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="fm-del-note-textarea ps-delegate-note-input"
                  />
                </div>
              )}
            </div>

            {/* RIGHT — recipient directory (filter + search + draggable cards) */}
            <div className="ps-delegate-right-panel">
              <div className="ps-delegate-right-header">
                <div className="fm-section-label fm-section-label--mb8">{t('delegateModal.delegateToLabel')}</div>
                <div className="ps-delegate-filter-row">
                  {delegationType !== 'POOL' && (
                  <button
                    onClick={() => { setFilter('individuals'); }}
                    className={`ps-delegate-filter-btn${filter === 'individuals' ? ' ps-delegate-filter-btn--active' : ''}`}
                  >
                    👤 {t('delegateModal.individualFilter')}
                  </button>
                  )}
                  {delegationType === 'POOL' && (
                  <button
                    onClick={() => { setFilter('pools'); }}
                    className={`ps-delegate-filter-btn${filter === 'pools' ? ' ps-delegate-filter-btn--active' : ''}`}
                  >
                    👥 {t('delegateModal.poolFilter')}
                  </button>
                  )}
                </div>
                <input
                  autoFocus
                  className="fm-search-input ps-delegate-search-input"
                  type="text"
                  placeholder={filter === 'individuals' ? t('delegateModal.searchIndividuals') : t('delegateModal.searchPools')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="ps-delegate-list">
                {loading && <div className="ps-delegate-empty">{t('delegateModal.loading')}</div>}

                {filter === 'individuals' && !loading && (
                  filteredStaff.length === 0
                    ? <div className="ps-delegate-empty">{t('delegateModal.noResultsFor', { query: searchTerm })}</div>
                    : filteredStaff.map(s => (
                        <RecipientCard
                          key={s.id}
                          id={`staff-${s.id}`}
                          primary={s.name}
                          secondary={t('delegateModal.staffSecondary', { role: s.role, subspecialty: s.subspecialty || '—' })}
                          isSelected={selectedId === s.id}
                          onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                        />
                      ))
                )}

                {filter === 'pools' && !loading && (
                  filteredPools.length === 0
                    ? <div className="ps-delegate-empty">{t('delegateModal.noPoolsFound')}</div>
                    : filteredPools.map(pool => (
                        <RecipientCard
                          key={pool.id}
                          id={`pool-${pool.id}`}
                          primary={pool.name}
                          secondary={t('delegateModal.poolSecondary', { count: pool.memberCount })}
                          isSelected={selectedId === pool.id}
                          onClick={() => setSelectedId(selectedId === pool.id ? null : pool.id)}
                        />
                      ))
                )}
              </div>
            </div>
          </div>

          <DragOverlay>
            {(draggingStaff || draggingPool) && (
              <div className="ps-delegate-drag-overlay-card">
                <div className="ps-delegate-drag-overlay-row">
                  <div className="ps-delegate-drag-overlay-avatar">
                    {(draggingStaff?.name ?? draggingPool?.name ?? '').replace(/^Dr\.\s*/, '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                  </div>
                  <div className="ps-delegate-drag-overlay-name">{draggingStaff?.name ?? draggingPool?.name}</div>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* ── Footer — unchanged ─────────────────────────────── */}
        <div className="fm-footer">
          <span className={'fm-footer-status' + (delegationType || selectedLabel ? ' dirty' : '')}>
            {!delegationType
              ? t('delegateModal.chooseDelegationType')
              : !selectedId
                ? t('delegateModal.chooseRecipient', { typeLabel: selectedDelegType?.label })
                : t('delegateModal.delegatingTo', { recipient: selectedLabel, typeLabel: selectedDelegType?.label })
            }
          </span>
          <div className="fm-del-footer-row">
            <button className="fm-btn-cancel" onClick={onClose}>{t('delegateModal.cancel')}</button>
            <button
              className="fm-btn-save"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {confirming ? t('delegateModal.delegating') : t('delegateModal.confirmDelegation')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DelegateModal;
