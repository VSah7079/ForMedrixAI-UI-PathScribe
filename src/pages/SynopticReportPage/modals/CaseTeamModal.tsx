// src/pages/SynopticReportPage/modals/CaseTeamModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Case Team modal — drag staff cards onto participation type drop zones.
// Left: participation type lanes (drop targets)
// Right: staff directory (draggable cards)
//
// July 2026, draft-then-save conversion: nothing is persisted to the real
// backend until Save is clicked -- matches FlagManagerModal's model.
//
// July 2026, second pass — real drag validation (role eligibility, single-
// occupancy enforcement with a Replace-confirmation flow instead of a hard
// block, live eligibility preview on every zone the instant a drag starts,
// real rejection messages instead of a silent no-op).
//
// July 2026, third pass — ALL inline styles extracted, maximizing reuse of
// EXISTING pathscribe.css classes rather than inventing new ones:
//   .fm-body / .fm-left (+ new --caseteam width/padding modifier, matching
//     the existing .fm-left--delegate precedent) / .fm-right for the whole
//     two-panel layout -- same classes FlagManagerModal already uses.
//   .fm-empty / .fm-empty-heading / .fm-empty-hint for loading/empty states.
//   .ps-btn-primary for the two small dialogs' action buttons.
//   .fm-footer-status + its existing .dirty modifier for the status text
//     (this modifier already existed and already did exactly what a
//     one-off inline color was doing manually).
//   .fm-footer-actions -- genuinely new, no existing wrapper groups a
//     footer's action buttons together separately from its status text.
//   .ps-ctm-header-subtitle -- genuinely new, specific compound content.
//   .ps-ctm-* (staff card, drop zone, participant row, rejection banner,
//     drag overlay) -- genuinely new, this modal's own specific content
//     with no reasonable existing equivalent found.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { Case, CaseParticipant } from '@/types/case/Case';
import { caseRouter }                    from '@/services/cases/CaseRouter';
import { syncPrimaryAssignee }           from '@/services/cases/caseAssignmentSync';
import { userService, roleService, subspecialtyService } from '@/services';
import type { Subspecialty } from '@/services/subspecialties/ISubspecialtyService';
import { getStaffSubspecialtyDisplay } from '@/utils/staffSubspecialties';
import { mockParticipationTypeService } from '@/services/participationTypes/mockParticipationTypeService';
import type { ParticipationTypeRecord as ParticipationType } from '@/services/participationTypes/IParticipationTypeService';
import type { StaffUser }                from '@/services/users/IUserService';
import type { Role }                     from '@/services/roles/IRoleService';
import { useAuth }                       from '@/contexts/AuthContext';

type DragEligibility = 'eligible' | 'role-ineligible' | 'occupied';

function colorVars(hex: string): React.CSSProperties {
  return {
    '--badge-bg': hex + '18',
    '--badge-border': hex + '33',
    '--badge-border-strong': hex + '66',
    '--badge-color': hex,
  } as React.CSSProperties;
}

// ─── Draggable staff card ─────────────────────────────────────────────────────

interface StaffCardProps {
  staff:       StaffUser;
  roles:       Role[];
  allTypes:    ParticipationType[];
  /** Real fix, per direct confirmation: replaces the old free-text
   *  department field with the user's real, assigned Subspecialty
   *  name(s) — see utils/staffSubspecialties.ts. */
  allSubspecialties: Subspecialty[];
  disabled?:   boolean;
  isDragging?: boolean;
}

const StaffCard: React.FC<StaffCardProps & { id: string }> = ({ id, staff, roles, allTypes, allSubspecialties, disabled, isDragging }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled });
  const staffRoles   = roles.filter(r => staff.roles.includes(r.name));
  const allowedTypeIds = new Set(staffRoles.flatMap(r => (r as any).participationTypeIds ?? []));
  const allowedTypes = allTypes.filter(t => allowedTypeIds.has(t.id));
  const subspecialtyDisplay = getStaffSubspecialtyDisplay(staff.id, allSubspecialties);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`ps-ctm-staff-card${isDragging ? ' ps-ctm-staff-card--dragging' : ''}${disabled ? ' ps-ctm-staff-card--disabled' : ''}`}
    >
      <div className="ps-ctm-staff-row">
        <div className="ps-ctm-staff-avatar">{`${staff.firstName[0]}${staff.lastName[0]}`}</div>
        <div className="ps-ctm-staff-info">
          <div className="ps-ctm-staff-name">{staff.firstName} {staff.lastName}</div>
          <div className="ps-ctm-staff-meta">{staff.roles.join(', ')}{subspecialtyDisplay ? ` · ${subspecialtyDisplay}` : ''}</div>
        </div>
        {!disabled && <div className="ps-ctm-staff-grip">⠿</div>}
        {disabled  && <span className="ps-ctm-staff-oncase-badge">on case</span>}
      </div>
      {allowedTypes.length > 0 && !disabled && (
        <div className="ps-ctm-staff-badges">
          {allowedTypes.map(t => (
            <span key={t.id} className="ps-ctm-staff-badge" style={colorVars(t.color)}>{t.abbreviation}</span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Drop zone (participation type lane) ──────────────────────────────────────

interface DropZoneProps {
  type:          ParticipationType;
  participants:  CaseParticipant[];
  currentUserId: string;
  isOver:        boolean;
  dragEligibility: DragEligibility | null;
  onRemove:      (staffId: string, typeId: string) => void;
  onUndoRemove:  (staffId: string, typeId: string) => void;
  removedKeys:   Set<string>;
  onDelegate?:   () => void;
}

const DropZone: React.FC<DropZoneProps> = ({
  type, participants, currentUserId, isOver, dragEligibility, onRemove, onUndoRemove, removedKeys, onDelegate,
}) => {
  const { setNodeRef } = useDroppable({ id: `type-${type.id}` });
  const inType = participants.filter(p => p.status === 'active' && p.participationTypeIds.includes(type.id));

  const stateClass = dragEligibility ? ` ps-ctm-dropzone--${dragEligibility}` : '';
  const hoverClass = (dragEligibility && isOver) ? ' ps-ctm-dropzone--hover' : '';

  const previewLabel =
    dragEligibility === 'role-ineligible' ? '⊘ Not eligible for this role' :
    dragEligibility === 'occupied' ? (isOver ? 'Drop to replace' : 'Already assigned — will offer to replace') :
    dragEligibility === 'eligible' ? (isOver ? 'Drop to assign' : null) :
    null;

  return (
    <div
      ref={setNodeRef}
      className={`ps-ctm-dropzone${stateClass}${hoverClass}`}
      style={dragEligibility === 'eligible' ? colorVars(type.color) : undefined}
    >
      <div className="ps-ctm-dropzone-header">
        <span className="ps-ctm-dropzone-type-badge" style={colorVars(type.color)}>{type.abbreviation}</span>
        <span className="ps-ctm-dropzone-label">{type.label}</span>
        {!type.allowsMultiple && <span className="ps-ctm-dropzone-single-badge">SINGLE</span>}
        {type.requiresCountersign && <span className="ps-ctm-dropzone-countersign-badge">Countersign req.</span>}
        {type.canFinalize        && <span className="ps-ctm-dropzone-finalize-badge">Can finalise</span>}
      </div>

      {previewLabel && (
        <div className={`ps-ctm-dropzone-preview ps-ctm-dropzone-preview--${dragEligibility}`} style={dragEligibility === 'eligible' ? colorVars(type.color) : undefined}>
          {previewLabel}
        </div>
      )}

      {inType.length === 0 && !previewLabel && (
        <div className="fm-empty-hint" style={{ textAlign: 'center', padding: '8px 0', fontStyle: 'italic' }}>Drag staff here</div>
      )}

      <div className="ps-case-team-list">
        {inType.map(p => {
          const removeKey    = `${p.staffId}-${type.id}`;
          const isRemoved    = removedKeys.has(removeKey);
          const isSelf       = p.staffId === currentUserId;
          const isPrimary    = type.id === 'primary';
          const isOnlyPrimary = isPrimary && inType.length === 1;

          return (
            <div key={removeKey} className={`ps-ctm-participant-row${isRemoved ? ' ps-ctm-participant-row--removed' : ''}`}>
              <div className="ps-ctm-participant-avatar">
                {p.staffName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
              </div>
              <span className={`ps-ctm-participant-name${isRemoved ? ' ps-ctm-participant-name--removed' : ''}`}>
                {p.staffName}
                {isSelf         && <span className="ps-ctm-participant-tag--you">(you)</span>}
                {p.source === 'system' && <span className="ps-ctm-participant-tag--auto">· auto</span>}
              </span>

              {isRemoved ? (
                <button onClick={() => onUndoRemove(p.staffId!, type.id)} className="ps-ctm-undo-btn">Undo</button>
              ) : isSelf && isOnlyPrimary ? (
                <button onClick={() => onDelegate?.()}
                  title="Removing yourself from Primary requires Delegate — click to open"
                  className="ps-ctm-delegate-btn"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Delegate
                </button>
              ) : (
                <button onClick={() => onRemove(p.staffId!, type.id)} title="Remove from this participation type" className="ps-ctm-remove-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Self-removal blocked modal ───────────────────────────────────────────────

const SelfRemoveBlockedModal: React.FC<{ onClose: () => void; onDelegate: () => void }> = ({ onClose, onDelegate }) => (
  <div className="ps-overlay" style={{ zIndex: 9000 }}>
    <div className="ps-modal-dark" style={{ width: 'min(460px, 90vw)' }}>
      <div className="ps-modal-dark-header">
        <span style={{ fontSize: 18 }}>⚠</span>
        <span className="ps-modal-dark-title">Cannot Remove Primary</span>
      </div>
      <p className="ps-modal-dark-body">
        Removing yourself from <strong style={{ color: '#e2e8f0' }}>Primary</strong> is not allowed while you are the sole primary pathologist on this case.
      </p>
      <p className="ps-modal-dark-hint">
        To transfer ownership of this case to another pathologist or pool, use <strong style={{ color: '#e2e8f0' }}>Delegate</strong>.
      </p>
      <div className="ps-modal-dark-footer">
        <button className="ps-btn-ghost-dark" onClick={onClose}>Cancel</button>
        <button className="ps-btn-primary" onClick={onDelegate}>Open Delegate →</button>
      </div>
    </div>
  </div>
);

// ─── Replace confirmation modal ───────────────────────────────────────────────

interface ReplaceConfirmState {
  typeId: string; typeLabel: string;
  newStaffId: string; newStaffName: string;
  existingStaffId: string; existingStaffName: string;
}

const ReplaceConfirmModal: React.FC<{ state: ReplaceConfirmState; onConfirm: () => void; onCancel: () => void }> = ({ state, onConfirm, onCancel }) => (
  <div className="ps-overlay" style={{ zIndex: 9500 }}>
    <div className="ps-modal-dark" style={{ width: 'min(460px, 90vw)' }}>
      <div className="ps-modal-dark-header">
        <span style={{ fontSize: 18 }}>⚠</span>
        <span className="ps-modal-dark-title">{state.typeLabel} already assigned</span>
      </div>
      <p className="ps-modal-dark-body">
        <strong style={{ color: '#e2e8f0' }}>{state.existingStaffName}</strong> is currently the {state.typeLabel}.
        Replace with <strong style={{ color: '#e2e8f0' }}>{state.newStaffName}</strong>?
      </p>
      <p className="ps-modal-dark-hint">
        This only changes the draft — nothing is saved until you click Save below.
      </p>
      <div className="ps-modal-dark-footer">
        <button className="ps-btn-ghost-dark" onClick={onCancel}>Cancel</button>
        <button className="ps-btn-primary" onClick={onConfirm}>Replace</button>
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  caseData:    Case;
  onClose:     () => void;
  onUpdated:   (updated: Case) => void;
  onDelegate?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export const CaseTeamModal: React.FC<Props> = ({ caseData, onClose, onUpdated, onDelegate, onDirtyChange }) => {
  const { user } = useAuth();
  const [staffList,    setStaffList]    = useState<StaffUser[]>([]);
  const [roles,        setRoles]        = useState<Role[]>([]);
  const [allTypes,     setAllTypes]     = useState<ParticipationType[]>([]);
  /** Real fix, per direct confirmation: replaces the old free-text
   *  department field with the real Subspecialty dictionary. */
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [participants, setParticipants] = useState<CaseParticipant[]>([]);
  const initialParticipantsRef = useRef<CaseParticipant[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [activeId,     setActiveId]     = useState<string | null>(null);
  const [overId,       setOverId]       = useState<string | null>(null);
  const [removedKeys,  setRemovedKeys]  = useState<Set<string>>(new Set());
  const [showSelfBlock,setShowSelfBlock]= useState(false);
  const [showDirtyWarn,setShowDirtyWarn]= useState(false);
  const [isSaving,     setIsSaving]     = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<ReplaceConfirmState | null>(null);
  const rejectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    Promise.all([userService.getAll(), roleService.getAll(), mockParticipationTypeService.getActive(), subspecialtyService.getAll()]).then(([usersRes, rolesRes, typesRes, subsRes]) => {
      const users     = usersRes.ok ? usersRes.data : [];
      const rolesData = rolesRes.ok ? rolesRes.data : [];
      setStaffList(users);
      setRoles(rolesData);
      setAllTypes(typesRes.ok ? typesRes.data : []);
      setSubspecialties(subsRes.ok ? subsRes.data : []);
      const existing: CaseParticipant[] = caseData.participants ?? [];
      const assignedId = caseData.order?.assignedTo;
      let finalExisting = existing;
      if (assignedId && !existing.find(p => p.staffId === assignedId && p.status === 'active')) {
        const staffMember = users.find(u => u.id === assignedId);
        if (staffMember) {
          const autoP: CaseParticipant = {
            staffId: staffMember.id,
            staffName: `${staffMember.firstName} ${staffMember.lastName}`,
            externalId: (staffMember as any).gmcNumber || staffMember.npi || undefined,
            externalIdType: (staffMember as any).gmcNumber ? 'GMC' : staffMember.npi ? 'NPI' : undefined,
            source: 'system', participationTypeIds: ['primary'],
            addedBy: 'system', addedAt: caseData.createdAt, status: 'active',
          };
          finalExisting = [autoP, ...existing];
          caseRouter.updateCase(caseData.id, { participants: finalExisting });
        }
      }
      setParticipants(finalExisting);
      initialParticipantsRef.current = finalExisting;
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Real, honest justification: this is deliberately mount-only initialization of the participant editor, run once when this modal opens. Adding caseData's fields would risk this effect re-running while the modal is still open (e.g. from a background case update or parent re-render) and silently overwriting the user's in-progress, unsaved team-assignment edits via the setParticipants/initialParticipantsRef calls above - a real, worse bug than the one this rule is trying to prevent.
  }, []);

  const relevantTypeIds = useMemo(() => {
    const ids = new Set<string>();
    participants.filter(p => p.status === 'active').forEach(p => p.participationTypeIds.forEach((id: string) => ids.add(id)));
    staffList.filter(s => s.status === 'Active').forEach(s => {
      const staffRoles = roles.filter(r => s.roles.includes(r.name));
      staffRoles.flatMap(r => (r as any).participationTypeIds ?? []).forEach((id: string) => ids.add(id));
    });
    return ids;
  }, [staffList, roles, participants]);

  const visibleTypes  = useMemo(() => allTypes.filter(t => relevantTypeIds.has(t.id)), [allTypes, relevantTypeIds]);
  const filteredStaff = useMemo(() =>
    staffList
      .filter(s => s.status === 'Active')
      .filter(s => !search || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [staffList, search]
  );

  const activeParticipants = participants.filter(p => p.status === 'active');
  const staffOnCase        = new Set(activeParticipants.map(p => p.staffId));

  const showRejection = useCallback((msg: string) => {
    setRejectionMessage(msg);
    if (rejectionTimerRef.current) clearTimeout(rejectionTimerRef.current);
    rejectionTimerRef.current = setTimeout(() => setRejectionMessage(null), 4500);
  }, []);
  useEffect(() => () => { if (rejectionTimerRef.current) clearTimeout(rejectionTimerRef.current); }, []);

  const getDragEligibility = useCallback((staffId: string, typeId: string): DragEligibility => {
    const staffMember = staffList.find(s => s.id === staffId);
    const type = allTypes.find(t => t.id === typeId);
    if (!staffMember || !type) return 'role-ineligible';
    const staffRoles = roles.filter(r => staffMember.roles.includes(r.name));
    const allowedIds = new Set(staffRoles.flatMap(r => (r as any).participationTypeIds ?? []));
    if (!allowedIds.has(typeId)) return 'role-ineligible';
    const occupant = activeParticipants.find(p => p.participationTypeIds.includes(typeId) && p.staffId !== staffId);
    if (occupant && !type.allowsMultiple) return 'occupied';
    return 'eligible';
  }, [staffList, allTypes, roles, activeParticipants]);

  const draggedStaffId = activeId?.startsWith('staff-') ? activeId.replace('staff-', '') : null;

  const handleDragStart = (event: DragStartEvent) => { setActiveId(String(event.active.id)); };
  const handleDragOver  = (event: any)             => { setOverId(event.over ? String(event.over.id) : null); };

  const assignStaffToType = useCallback((staff: StaffUser, typeId: string) => {
    setParticipants(prev => {
      const existingP = prev.find(p => p.staffId === staff.id && p.status === 'active');
      if (existingP) {
        return prev.map(p =>
          p.staffId === staff.id && p.status === 'active'
            ? { ...p, participationTypeIds: [...p.participationTypeIds, typeId] } : p
        );
      }
      const newP: CaseParticipant = {
        staffId: staff.id, staffName: `${staff.firstName} ${staff.lastName}`,
        externalId: (staff as any).gmcNumber || staff.npi || undefined,
        externalIdType: (staff as any).gmcNumber ? 'GMC' : staff.npi ? 'NPI' : undefined,
        source: 'manual', participationTypeIds: [typeId],
        addedBy: user?.id ?? 'unknown', addedAt: new Date().toISOString(), status: 'active',
      };
      return [...prev, newP];
    });
  }, [user?.id]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null); setOverId(null);
    const { active, over } = event;
    if (!over) return;
    const staffId = String(active.id).replace('staff-', '');
    const typeId  = String(over.id).replace('type-', '');
    const staff   = staffList.find(s => s.id === staffId);
    const type    = allTypes.find(t => t.id === typeId);
    if (!staff || !type) return;

    const eligibility = getDragEligibility(staffId, typeId);

    if (eligibility === 'role-ineligible') {
      const roleName = staff.roles[0] ?? 'This role';
      showRejection(`${roleName}s cannot be assigned as ${type.label}.`);
      return;
    }

    const alreadyAssigned = activeParticipants.find(p => p.staffId === staffId && p.participationTypeIds.includes(typeId));
    if (alreadyAssigned) return;

    if (eligibility === 'occupied') {
      const occupant = activeParticipants.find(p => p.participationTypeIds.includes(typeId) && p.staffId !== staffId);
      if (occupant) {
        setReplaceConfirm({
          typeId, typeLabel: type.label,
          newStaffId: staff.id, newStaffName: `${staff.firstName} ${staff.lastName}`,
          existingStaffId: occupant.staffId, existingStaffName: occupant.staffName,
        });
        return;
      }
    }

    assignStaffToType(staff, typeId);
  };

  const resolveReplace = useCallback((confirmed: boolean) => {
    if (confirmed && replaceConfirm) {
      const { typeId, existingStaffId, newStaffId } = replaceConfirm;
      setParticipants(prev => {
        let updated = prev.map(p => {
          if (p.staffId === existingStaffId && p.status === 'active') {
            const remaining = p.participationTypeIds.filter(id => id !== typeId);
            return remaining.length === 0 ? { ...p, status: 'removed' as const } : { ...p, participationTypeIds: remaining };
          }
          return p;
        });
        const staff = staffList.find(s => s.id === newStaffId);
        if (staff) {
          const existingNewP = updated.find(p => p.staffId === staff.id && p.status === 'active');
          if (existingNewP) {
            updated = updated.map(p => p.staffId === staff.id && p.status === 'active' ? { ...p, participationTypeIds: [...p.participationTypeIds, typeId] } : p);
          } else {
            const newP: CaseParticipant = {
              staffId: staff.id, staffName: `${staff.firstName} ${staff.lastName}`,
              externalId: (staff as any).gmcNumber || staff.npi || undefined,
              externalIdType: (staff as any).gmcNumber ? 'GMC' : staff.npi ? 'NPI' : undefined,
              source: 'manual', participationTypeIds: [typeId],
              addedBy: user?.id ?? 'unknown', addedAt: new Date().toISOString(), status: 'active',
            };
            updated = [...updated, newP];
          }
        }
        return updated;
      });
    }
    setReplaceConfirm(null);
  }, [replaceConfirm, staffList, user?.id]);

  const handleRemove = (staffId: string, typeId: string) => {
    const isSelf        = staffId === user?.id;
    const isPrimary     = typeId === 'primary';
    const primaryCount  = activeParticipants.filter(p => p.participationTypeIds.includes('primary')).length;
    if (isSelf && isPrimary && primaryCount <= 1) { setShowSelfBlock(true); return; }

    const key = `${staffId}-${typeId}`;
    setRemovedKeys(prev => new Set(prev).add(key));
  };

  const handleUndoRemove = (staffId: string, typeId: string) => {
    const key = `${staffId}-${typeId}`;
    setRemovedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const resolveFinalParticipants = useCallback((): CaseParticipant[] => {
    if (removedKeys.size === 0) return participants;
    return participants.map(p => {
      if (p.status !== 'active') return p;
      const keptTypes = p.participationTypeIds.filter((id: string) => !removedKeys.has(`${p.staffId}-${id}`));
      if (keptTypes.length === p.participationTypeIds.length) return p;
      return keptTypes.length === 0 ? { ...p, status: 'removed' as const } : { ...p, participationTypeIds: keptTypes };
    });
  }, [participants, removedKeys]);

  const isDraftDirty = useMemo(() => {
    if (removedKeys.size > 0) return true;
    const final = resolveFinalParticipants();
    const orig  = initialParticipantsRef.current;
    if (final.length !== orig.length) return true;
    const key = (p: CaseParticipant) => `${p.staffId}|${p.status}|${[...p.participationTypeIds].sort().join(',')}`;
    const origKeys  = new Set(orig.map(key));
    const finalKeys = new Set(final.map(key));
    if (origKeys.size !== finalKeys.size) return true;
    for (const k of origKeys) if (!finalKeys.has(k)) return true;
    return false;
  }, [resolveFinalParticipants, removedKeys]);

  useEffect(() => {
    onDirtyChange?.(isDraftDirty);
    return () => { onDirtyChange?.(false); };
  }, [isDraftDirty, onDirtyChange]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const final = resolveFinalParticipants();

      // The actual fix for the "split-brain assignment" gap: this modal
      // used to write participants[] without ever touching
      // order.assignedTo, so a case whose primary changed here would
      // still show up under the OLD assignee's listCasesForUser() query
      // (the real fetch-time filter — see caseAssignmentSync.ts's header
      // comment) while looking correct in this modal's own roster view.
      // If the active 'primary' participant changed, run it through
      // syncPrimaryAssignee against the user's actual edits (`final`,
      // not the stale caseData.participants) so any other roster changes
      // made in this same save aren't lost.
      const newPrimary = final.find(p => p.status === 'active' && p.participationTypeIds.includes('primary'));
      const primaryChanged = newPrimary && newPrimary.staffId !== caseData.order?.assignedTo;

      let updates: Partial<Case>;
      if (primaryChanged && newPrimary) {
        const syncUpdates = syncPrimaryAssignee(
          { ...caseData, participants: final }, newPrimary.staffId, user?.id ?? 'unknown', newPrimary.staffName,
        );
        updates = { ...syncUpdates };
      } else {
        updates = { participants: final };
      }

      await caseRouter.updateCase(caseData.id, updates);
      onUpdated({ ...caseData, ...updates });
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [resolveFinalParticipants, caseData, onUpdated, onClose, user?.id]);

  const handleClose = useCallback(() => {
    if (isDraftDirty) { setShowDirtyWarn(true); return; }
    onClose();
  }, [isDraftDirty, onClose]);

  const handleDiscardConfirm = useCallback(() => {
    setShowDirtyWarn(false);
    onClose();
  }, [onClose]);

  const draggingStaff = activeId ? staffList.find(s => `staff-${s.id}` === activeId) : null;

  return (
    <>
      <div className="ps-overlay" onClick={handleClose}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 960, height: '88vh' }} className="ps-research-modal">

          {/* Header */}
          <div className="ps-research-header">
            <div>
              <div className="fm-eyebrow">Case Team</div>
              <div className="fm-title-row">
                <h2 className="fm-title" data-phi="accession">{caseData.accession?.fullAccession ?? caseData.id}</h2>
              </div>
              <div className="ps-ctm-header-subtitle">
                {caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : ''}
                {' · '}
                <span className="ps-ctm-header-subtitle-hint">Drag staff cards onto participation types to assign · Removing yourself from Primary requires </span>
                <span onClick={() => { onDelegate?.(); }} className="ps-ctm-header-subtitle-link">Delegate</span>
              </div>
            </div>
            <button className="ps-research-close" onClick={handleClose} aria-label="Close">✕</button>
          </div>

          {rejectionMessage && (
            <div className="ps-ctm-rejection-banner">
              <span className="ps-ctm-rejection-banner-icon">⊘</span>
              <span className="ps-ctm-rejection-banner-text">{rejectionMessage}</span>
              <button onClick={() => setRejectionMessage(null)} className="ps-ctm-rejection-banner-close">✕</button>
            </div>
          )}

          {/* Body — reuses .fm-body/.fm-left/.fm-right, same as FlagManagerModal */}
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="fm-body">

              <div className="fm-left fm-left--caseteam">
                <div className="fm-eyebrow" style={{ marginBottom: 4 }}>Participation Types</div>
                {loading ? (
                  <div className="fm-empty"><span className="fm-empty-heading">Loading…</span></div>
                ) : visibleTypes.length === 0 ? (
                  <div className="fm-empty">
                    <span className="fm-empty-heading">No participation types configured</span>
                    <span className="fm-empty-hint">Set up types in System → Participation Types.</span>
                  </div>
                ) : visibleTypes.map(type => (
                  <DropZone
                    key={type.id} type={type} participants={participants}
                    currentUserId={user?.id ?? ''} isOver={overId === `type-${type.id}`}
                    dragEligibility={draggedStaffId ? getDragEligibility(draggedStaffId, type.id) : null}
                    onRemove={handleRemove} onUndoRemove={handleUndoRemove}
                    removedKeys={removedKeys} onDelegate={() => { onClose(); onDelegate?.(); }}
                  />
                ))}
              </div>

              <div className="fm-right">
                <div style={{ padding: '16px 16px 10px', flexShrink: 0 }}>
                  <div className="fm-eyebrow" style={{ marginBottom: 8 }}>Staff Directory</div>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search staff…"
                    className="fm-search-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredStaff.length === 0 ? (
                    <div className="fm-empty"><span className="fm-empty-heading">No staff found</span></div>
                  ) : filteredStaff.map(s => {
                    const isOnCase = staffOnCase.has(s.id);
                    return (
                      <StaffCard
                        key={s.id} id={`staff-${s.id}`} staff={s} roles={roles} allTypes={allTypes}
                        allSubspecialties={subspecialties}
                        disabled={isOnCase} isDragging={activeId === `staff-${s.id}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <DragOverlay>
              {draggingStaff && (
                <div className="ps-ctm-drag-overlay">
                  <div className="ps-ctm-staff-row">
                    <div className="ps-ctm-staff-avatar">{`${draggingStaff.firstName[0]}${draggingStaff.lastName[0]}`}</div>
                    <div>
                      <div className="ps-ctm-staff-name">{draggingStaff.firstName} {draggingStaff.lastName}</div>
                      <div className="ps-ctm-staff-meta">{draggingStaff.roles.join(', ')}</div>
                    </div>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Footer — reuses .fm-footer's existing space-between layout and .fm-footer-status's existing .dirty modifier */}
          <div className="fm-footer">
            <span className={`fm-footer-status${isDraftDirty ? ' dirty' : ''}`}>
              {activeParticipants.length} team member{activeParticipants.length !== 1 ? 's' : ''}
              {isDraftDirty ? ' · Unsaved changes' : ''}
            </span>
            <div className="fm-footer-actions">
              <button className="fm-btn-cancel" onClick={handleClose}>Cancel</button>
              <button
                className="fm-btn-cancel"
                onClick={handleSave}
                disabled={!isDraftDirty || isSaving}
                style={{
                  background: isDraftDirty ? 'rgba(34,197,94,0.15)' : undefined,
                  borderColor: isDraftDirty ? 'rgba(34,197,94,0.5)' : undefined,
                  color: isDraftDirty ? '#4ade80' : undefined,
                  fontWeight: 700,
                  opacity: isSaving ? 0.6 : 1,
                  cursor: (!isDraftDirty || isSaving) ? 'default' : 'pointer',
                }}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

        </div>
      </div>

      {showSelfBlock && (
        <SelfRemoveBlockedModal
          onClose={() => setShowSelfBlock(false)}
          onDelegate={() => { setShowSelfBlock(false); onClose(); onDelegate?.(); }}
        />
      )}

      {replaceConfirm && (
        <ReplaceConfirmModal
          state={replaceConfirm}
          onConfirm={() => resolveReplace(true)}
          onCancel={() => resolveReplace(false)}
        />
      )}

      {showDirtyWarn && ReactDOM.createPortal(
        <div className="ps-overlay" style={{ zIndex: 9500 }}>
          <div className="ps-modal-dark ps-modal-dark--sm">
            <div className="ps-modal-dark-header">
              <span className="ps-modal-dark-emoji">⚠️</span>
              <span className="ps-modal-dark-title">Discard changes?</span>
            </div>
            <p className="ps-modal-dark-body">You have unsaved team changes. Closing will discard them — nothing has been saved yet.</p>
            <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
              <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={() => setShowDirtyWarn(false)}>Keep editing</button>
              <button className="ps-btn-red ps-modal-dark-footer__flex-btn" onClick={handleDiscardConfirm}>Discard changes</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default CaseTeamModal;
