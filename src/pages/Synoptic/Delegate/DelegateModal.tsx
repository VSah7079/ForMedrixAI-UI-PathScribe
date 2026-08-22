import React, { useState, useEffect } from 'react';
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
      style={{
        padding: '9px 12px',
        background: isDragging ? 'rgba(138,180,248,0.15)' : isSelected ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isDragging ? 'rgba(138,180,248,0.4)' : isSelected ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderLeft: isSelected ? '2px solid #0891B2' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, cursor: 'grab', marginBottom: 4,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        userSelect: 'none', touchAction: 'none',
        transition: isDragging ? 'none' : 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(138,180,248,0.15)', border: '1.5px solid rgba(138,180,248,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#8AB4F8',
        }}>
          {primary.replace(/^Dr\.\s*/, '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</div>
        </div>
        <div style={{ fontSize: 14, color: '#374151', flexShrink: 0 }}>⠿</div>
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
  const { setNodeRef } = useDroppable({ id: `type-${dt.id}` });

  return (
    <div
      ref={setNodeRef}
      onClick={onSelectType}
      style={{
        padding: '10px 12px', marginBottom: 6, borderRadius: 10, cursor: 'pointer',
        background: isOver ? dt.color + '14' : isSelected ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1.5px ${isOver ? 'solid' : isSelected ? 'solid' : 'dashed'} ${isOver ? dt.color + '66' : isSelected ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.08)'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', padding: '2px 6px', borderRadius: 5, flexShrink: 0,
          background: isSelected ? dt.color + '22' : 'rgba(255,255,255,0.06)', color: isSelected ? dt.color : '#94a3b8',
        }}>
          {dt.id.replace('_', ' ')}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', flex: 1 }}>{dt.label}</span>
        {isSelected && <span style={{ color: '#0891B2', fontSize: 13, fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{dt.description}</div>
      {dt.transfersOwnership && (
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>transfers ownership</span>
      )}
      {isSelected && (
        selectedRecipientLabel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 10px', background: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.25)', borderRadius: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#7dd3fc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRecipientLabel}</span>
            <button onClick={e => { e.stopPropagation(); onClearRecipient(); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
          </div>
        ) : (
          <div style={{ marginTop: 8, padding: '6px 10px', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 7, fontSize: 11, color: '#475569', textAlign: 'center' }}>
            {isOver ? 'Drop to assign' : 'Drag a recipient here, or click one on the right'}
          </div>
        )
      )}
    </div>
  );
};

export const DelegateModal: React.FC<DelegateModalProps> = ({
  isOpen, onClose, registry, caseId, currentUserId = 'PATH-001', onDelegated, synopticInstances = []
}) => {
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
      <div className="ps-research-modal fm-modal" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="ps-research-header">
          <div>
            <div className="fm-eyebrow">Case Action · Delegation</div>
            <div className="fm-title-row">
              <span className="fm-del-persona-icon">👤</span>
              <h2 className="fm-title">Delegate Case</h2>
              {selectedDelegType && (
                <span className="fm-del-mode-badge">
                  {selectedDelegType.label}
                </span>
              )}
            </div>
          </div>
          <button className="ps-close-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Two-panel body — matches CaseTeamModal's drop-zone pattern ── */}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: 0, overflow: 'hidden' }}>

            {/* LEFT — delegation types, each a real drop zone */}
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: '16px 20px' }}>
              <div className="fm-section-label" style={{ marginBottom: 8 }}>Delegation Type</div>
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
                <div style={{ marginTop: 12 }}>
                  <div className="fm-section-label" style={{ marginBottom: 6 }}>Select Synoptic</div>
                  {synopticInstances.map(inst => {
                    const isSel = selectedInstanceId === inst.instanceId;
                    return (
                      <div
                        key={inst.instanceId}
                        onClick={() => setSelectedInstanceId(isSel ? null : inst.instanceId)}
                        style={{
                          padding: '8px 12px', marginBottom: 4, borderRadius: 8, cursor: 'pointer',
                          background: isSel ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSel ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{inst.specimenDescription}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{inst.templateName}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Note field if required — unchanged from before */}
              {selectedDelegType?.requiresNote && (
                <div style={{ marginTop: 12 }}>
                  <div className="fm-section-label" style={{ marginBottom: 4 }}>Note (required)</div>
                  <input
                    type="text"
                    placeholder="Add a note…"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="fm-del-note-textarea"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>

            {/* RIGHT — recipient directory (filter + search + draggable cards) */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
                <div className="fm-section-label" style={{ marginBottom: 8 }}>Delegate To</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {delegationType !== 'POOL' && (
                  <button
                    onClick={() => { setFilter('individuals'); }}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${filter === 'individuals' ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      background: filter === 'individuals' ? 'rgba(8,145,178,0.12)' : 'transparent',
                      color: filter === 'individuals' ? '#7dd3fc' : '#94a3b8',
                    }}
                  >
                    👤 Individual
                  </button>
                  )}
                  {delegationType === 'POOL' && (
                  <button
                    onClick={() => { setFilter('pools'); }}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${filter === 'pools' ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      background: filter === 'pools' ? 'rgba(8,145,178,0.12)' : 'transparent',
                      color: filter === 'pools' ? '#7dd3fc' : '#94a3b8',
                    }}
                  >
                    👥 Pool / Queue
                  </button>
                  )}
                </div>
                <input
                  autoFocus
                  className="fm-search-input"
                  type="text"
                  placeholder={filter === 'individuals' ? 'Search by name or role…' : 'Search pools…'}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 16px' }}>
                {loading && <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>Loading…</div>}

                {filter === 'individuals' && !loading && (
                  filteredStaff.length === 0
                    ? <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>No results for "{searchTerm}"</div>
                    : filteredStaff.map(s => (
                        <RecipientCard
                          key={s.id}
                          id={`staff-${s.id}`}
                          primary={s.name}
                          secondary={`${s.role} · ${s.subspecialty || '—'}`}
                          isSelected={selectedId === s.id}
                          onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                        />
                      ))
                )}

                {filter === 'pools' && !loading && (
                  filteredPools.length === 0
                    ? <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>No pools found</div>
                    : filteredPools.map(pool => (
                        <RecipientCard
                          key={pool.id}
                          id={`pool-${pool.id}`}
                          primary={pool.name}
                          secondary={`POOL · ${pool.memberCount} members available`}
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
              <div style={{ padding: '9px 12px', background: '#1e293b', border: '2px solid #8AB4F8', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', cursor: 'grabbing', opacity: 0.95, width: 300 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(138,180,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#8AB4F8' }}>
                    {(draggingStaff?.name ?? draggingPool?.name ?? '').replace(/^Dr\.\s*/, '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{draggingStaff?.name ?? draggingPool?.name}</div>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* ── Footer — unchanged ─────────────────────────────── */}
        <div className="fm-footer">
          <span className={'fm-footer-status' + (delegationType || selectedLabel ? ' dirty' : '')}>
            {!delegationType
              ? 'Choose a delegation type'
              : !selectedId
                ? `${selectedDelegType?.label} — choose a recipient`
                : `Delegating to ${selectedLabel} · ${selectedDelegType?.label}`
            }
          </span>
          <div className="fm-del-footer-row">
            <button className="fm-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="fm-btn-save"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {confirming ? 'Delegating…' : 'Confirm Delegation'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DelegateModal;
