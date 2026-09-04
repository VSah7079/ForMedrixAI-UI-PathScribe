// src/components/TemplateBuilder/TemplateAssemblyPage.tsx
// ─────────────────────────────────────────────────────────────
// Report Template Assembly Page.
//
// The pathologist's view of a report template:
//   "What parts does this report contain, in what order?"
//
// Each row = one AssemblySlot:
//   [role badge]  [part name]  [specialty]  [status]  [⊗ remove]
//
// Drag rows to reorder body parts.
// Click "+ Add slot" to pick a part from the library.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ReportTemplate, AssemblySlot, AssemblyRole, ReportPart } from '../../types/reportPart';
import {
  ASSEMBLY_ROLE_LABELS, ASSEMBLY_ROLE_ICONS, ROLE_DISPLAY_ORDER,
  VALID_ROLES_FOR_PART, validateAssembly,
} from '../../types/reportPart';
import { mockReportTemplateService } from '../../services/reportTemplates/mockReportTemplateService';
import { TemplatePreviewPanel } from './TemplatePreviewPanel';
import type { ReportTemplate as OldTemplate } from '../../types/template';
import { mockReportPartService, onReportPartsChanged } from '../../services/reportParts/mockReportPartService';
import type { LabelConfig } from '../../types/template';
import { Label, TextInput, Toggle, Sel } from './TemplateInspector';
import { getOrgDocumentStyleDefault, getOrgHeaderStyleDefault, getOrgFooterStyleDefault } from '../Config/System/documentStyleConfig';
import { getActivePerformingLabs } from '../../utils/performingLabs';
import type { Facility } from '../../services/facilities/IFacilityService';

const svc  = mockReportTemplateService;
const pSvc = mockReportPartService;

// ── Page zone definitions (driven by ROLE_DISPLAY_ORDER) ───────
const PAGE1_ROLES    = ROLE_DISPLAY_ORDER.filter(r => r === 'body' || r.endsWith('-p1'));
const PAGE2PLUS_ROLES = ROLE_DISPLAY_ORDER.filter(r => r.endsWith('-p2plus'));

// ── Role badge ─────────────────────────────────────────────────

const RoleBadge: React.FC<{ role: AssemblyRole }> = ({ role }) => (
  <span className={`ps-tmpla-role-badge ps-tmpla-role-badge--${role}`}>
    <span>{ASSEMBLY_ROLE_ICONS[role]}</span>
    {ASSEMBLY_ROLE_LABELS[role]}
  </span>
);

// ── Part type badge ────────────────────────────────────────────
// (type → modifier class mapping lives directly on each usage site)

// ── StatusBadge ────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const known = status === 'published' || status === 'draft' || status === 'archived' ? status : 'draft';
  return (
    <span className={`ps-tmpla-status-badge ps-tmpla-status-badge--${known}`}>
      {status}
    </span>
  );
};

// ── Part picker modal ──────────────────────────────────────────

const PartPicker: React.FC<{
  role: AssemblyRole;
  labFilter: string;
  labs: Facility[];
  onPick: (part: ReportPart) => void;
  onClose: () => void;
}> = ({ role, labFilter, labs, onPick, onClose }) => {
  const validTypes = Object.entries(VALID_ROLES_FOR_PART)
    .filter(([, roles]) => roles.includes(role))
    .map(([t]) => t);

  const [parts, setParts] = useState<ReportPart[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadPickerParts = useCallback(() => {
    pSvc.getAll({ partType: validTypes[0] as any }).then(r => {
      if (r.ok) setParts(r.data);
      setLoading(false);
    });
  }, [validTypes]);

  useEffect(() => {
    loadPickerParts();
    return onReportPartsChanged(loadPickerParts);
  }, [loadPickerParts]);

  // Real, per direct guidance ("Parts Library... should also be tied
  // to a Performing Lab facility"): no lab selected shows every real
  // part unfiltered (same "All Facilities means no filter" convention
  // as the Workstation & Hardware group-level selector) — a specific
  // lab shows that lab's own parts plus every Global one, never a
  // lab-specific part belonging to a DIFFERENT lab.
  const filtered = parts.filter(p =>
    p.status === 'published' &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase())) &&
    (!labFilter || !p.performingLabFacilityId || p.performingLabFacilityId === labFilter)
  );
  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : 'Global';

  return (
    <div className="ps-tmpla-picker-overlay" onClick={onClose}>
      <div className="ps-tmpla-picker-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ps-tmpla-picker-header">
          <div className="ps-tmpla-picker-title">
            Select a Part
          </div>
          <div className="ps-tmpla-picker-subtitle">
            Adding to slot: <RoleBadge role={role} />
          </div>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search parts…"
            className="ps-tmpla-picker-search"
          />
        </div>
        {/* List */}
        <div className="ps-tmpla-picker-list">
          {loading && <div className="ps-tmpla-picker-loading">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="ps-tmpla-picker-empty">No published parts found</div>
          )}
          {filtered.map(part => (
            <div
              key={part.id}
              onClick={() => onPick(part)}
              className="ps-tmpla-picker-row"
            >
              <div className={`ps-tmpla-picker-row-icon ps-tmpla-picker-row-icon--${part.partType}`}>
                {part.partType === 'header' ? '▲' : part.partType === 'footer' ? '▼' : '▬'}
              </div>
              <div className="ps-tmpla-picker-row-info">
                <div className="ps-tmpla-picker-row-name">
                  {part.name}
                </div>
                <div className="ps-tmpla-picker-row-desc">
                  {part.description ?? `${part.specialty} · ${part.partType}`}
                </div>
              </div>
              <div className="ps-tmpla-picker-row-status">
                {part.status}
              </div>
              <div className="ps-tmpla-picker-row-status">
                {labName(part.performingLabFacilityId)}
              </div>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div className="ps-tmpla-picker-footer">
          <button onClick={onClose} className="ps-tmpla-picker-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Persistent Parts Panel (left sidebar) ──────────────────────

const PART_TYPE_CONFIG = {
  header: { label: 'Header Parts', icon: '▲', roles: ['header-p1', 'header-p2plus'] as AssemblyRole[] },
  body:   { label: 'Body Parts',   icon: '▬', roles: ['body'] as AssemblyRole[]                      },
  footer: { label: 'Footer Parts', icon: '▼', roles: ['footer-p1', 'footer-p2plus'] as AssemblyRole[]},
};

const PartsPanel: React.FC<{
  activeRole:  AssemblyRole | null;
  usedPartIds: Set<string>;
  labFilter:   string;
  labs:        Facility[];
  onLabFilterChange: (labId: string) => void;
  onAdd:       (part: ReportPart, role: AssemblyRole) => void;
}> = ({ activeRole, usedPartIds, labFilter, labs, onLabFilterChange, onAdd }) => {
  const [parts, setParts] = useState<ReportPart[]>([]);
  const [search, setSearch] = useState('');

  const loadParts = useCallback(() => {
    pSvc.getAll().then(r => {
      if (r.ok) setParts(r.data.filter((p: ReportPart) => p.status === 'published'));
    });
  }, []);

  useEffect(() => {
    loadParts();
    return onReportPartsChanged(loadParts);
  }, [loadParts]);

  const filtered = parts.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase())) &&
    (!labFilter || !p.performingLabFacilityId || p.performingLabFacilityId === labFilter)
  );

  return (
    <aside className="ps-tmpla-panel">
      {/* Panel header */}
      <div className="ps-tmpla-panel-header">
        <div className="ps-tmpla-panel-title">
          Part Library
        </div>
        {activeRole ? (
          <div className="ps-tmpla-panel-hint ps-tmpla-panel-hint--active">
            Click a part to add → {ASSEMBLY_ROLE_LABELS[activeRole]}
          </div>
        ) : (
          <div className="ps-tmpla-panel-hint">
            Click a zone "+" to start adding
          </div>
        )}
      </div>

      {/* Search */}
      <div className="ps-tmpla-panel-search-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search parts…"
          className="ps-tmpla-panel-search"
        />
      </div>

      {/* Real, per direct guidance ("Parts Library... should also be
          tied to a Performing Lab facility") — shared with the
          PartPicker modal via the same lifted labFilter state, so
          browsing here and picking via "+ Add slot" always agree on
          which lab's context is active. */}
      {labs.length > 0 && (
        <div className="ps-tmpla-panel-search-wrap">
          <select className="ps-conf-select" value={labFilter} onChange={e => onLabFilterChange(e.target.value)}>
            <option value="">All Labs (Global + every lab)</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Part groups */}
      <div className="ps-tmpla-panel-groups">
        {(Object.entries(PART_TYPE_CONFIG) as [string, typeof PART_TYPE_CONFIG['body']][]).map(([type, cfg]) => {
          const group = filtered.filter(p => p.partType === type);
          if (group.length === 0) return null;

          // Dim group when active role doesn't match this type
          const groupActive = !activeRole || cfg.roles.includes(activeRole);

          return (
            <div key={type} className={`ps-tmpla-panel-group${groupActive ? '' : ' ps-tmpla-panel-group--dimmed'}`}>
              {/* Group header */}
              <div className="ps-tmpla-panel-group-header">
                <span>{cfg.icon}</span> {cfg.label}
                <span className="ps-tmpla-panel-group-count">
                  {group.length}
                </span>
              </div>

              {/* Part rows */}
              {group.map(part => {
                const canAdd = activeRole && cfg.roles.includes(activeRole);
                const alreadyUsed = usedPartIds.has(part.id);
                return (
                  <div
                    key={part.id}
                    title={canAdd ? `Add to ${ASSEMBLY_ROLE_LABELS[activeRole!]}` : 'Select a zone first'}
                    onClick={() => canAdd && onAdd(part, activeRole!)}
                    className={`ps-tmpla-panel-row${canAdd ? ' ps-tmpla-panel-row--addable' : ''}`}
                  >
                    <div className="ps-tmpla-panel-row-icon">
                      {type === 'header' ? '▲' : type === 'footer' ? '▼' : '▬'}
                    </div>
                    <div className="ps-tmpla-panel-row-info">
                      <div className="ps-tmpla-panel-row-name">
                        {part.name}
                      </div>
                      {part.description && (
                        <div className="ps-tmpla-panel-row-desc">
                          {part.description}
                        </div>
                      )}
                    </div>
                    {alreadyUsed && (
                      <span className="ps-tmpla-panel-row-check">✓</span>
                    )}
                    {canAdd && !alreadyUsed && (
                      <span className="ps-tmpla-panel-row-plus">+</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

// ── Slot row ───────────────────────────────────────────────────

const SlotRow: React.FC<{
  slot: AssemblySlot;
  /** Current part name, resolved live by the caller — falls back to slot.partName if unresolved */
  displayName: string;
  dragging: boolean;
  onDragStart: () => void;
  onRemove: () => void;
  onToggle: () => void;
  onEdit: () => void;
}> = ({ slot, displayName, dragging, onDragStart, onRemove, onToggle, onEdit }) => {
  const draggableRole = slot.role === 'body';

  const rowClass = [
    'ps-tmpla-slotrow',
    draggableRole ? 'ps-tmpla-slotrow--draggable' : '',
    slot.enabled ? '' : 'ps-tmpla-slotrow--disabled',
    dragging ? 'ps-tmpla-slotrow--dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      draggable={draggableRole}
      onDragStart={onDragStart}
      className={rowClass}
    >
      {/* Drag handle — body only */}
      <div className={`ps-tmpla-slotrow-handle${draggableRole ? ' ps-tmpla-slotrow-handle--draggable' : ''}`}>
        {draggableRole ? '⠿' : '⠀'}
      </div>

      {/* Role badge */}
      <RoleBadge role={slot.role} />

      {/* Part name + description */}
      <div className="ps-tmpla-slotrow-info">
        <div className="ps-tmpla-slotrow-name">
          {displayName}
        </div>
      </div>

      {/* Actions */}
      <div className="ps-tmpla-slotrow-actions">
        {/* Enable/disable */}
        <button onClick={onToggle} title={slot.enabled ? 'Disable slot' : 'Enable slot'}
          className={`ps-tmpla-slotrow-toggle${slot.enabled ? ' ps-tmpla-slotrow-toggle--on' : ''}`}>
          {slot.enabled ? '●' : '○'}
        </button>
        {/* Edit part */}
        <button onClick={onEdit} title="Edit this part" className="ps-tmpla-slotrow-edit">
          Edit part
        </button>
        {/* Remove */}
        <button onClick={onRemove} title="Remove from template" className="ps-tmpla-slotrow-remove">
          ✕
        </button>
      </div>
    </div>
  );
};

// ── Add slot button ────────────────────────────────────────────

const AddSlotRow: React.FC<{ role: AssemblyRole; onAdd: () => void; activeRole?: AssemblyRole | null }> = ({ role, onAdd }) => (
  <button onClick={onAdd} className="ps-tmpla-addslot">
    <span className="ps-tmpla-addslot-icon">+</span>
    <span className="ps-tmpla-addslot-label">
      Add {ASSEMBLY_ROLE_LABELS[role]}
    </span>
  </button>
);

// ── Document style editor ──────────────────────────────────────
// Real feature, per direct request: template-wide default body style
// ("most everything gets rendered in Arial 10pt"), cascading to every
// component via ordinary CSS inheritance (see
// ReportPreviewRenderer.tsx). No "position" control here — unlike
// LabelConfigEditor (TemplateInspector.tsx, per-field styling),
// there's no single "label" to position at the whole-document level;
// this editor only exposes the properties that are actually
// meaningful at this scope.

const FONT_FAMILY_OPTIONS = [
  { value: 'Arial',           label: 'Arial' },
  { value: 'Helvetica',       label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia',         label: 'Georgia' },
  { value: 'Calibri',         label: 'Calibri' },
  { value: 'Verdana',         label: 'Verdana' },
  { value: 'Courier New',     label: 'Courier New' },
];

const DocumentStyleEditor: React.FC<{ style: LabelConfig; onChange: (s: LabelConfig) => void }> = ({ style, onChange }) => (
  <div className="ps-tinsp-stack">
    <Label>Font family</Label>
    <Sel value={style.fontFamily ?? 'Arial'} onChange={v => onChange({ ...style, fontFamily: v })}
      options={FONT_FAMILY_OPTIONS} fullWidth />

    <Label>Font size (px)</Label>
    <TextInput
      value={String(style.fontSize ?? 10)}
      onChange={v => onChange({ ...style, fontSize: parseInt(v) || 10 })}
      placeholder="10"
    />

    <div className="ps-tinsp-row" style={{ marginTop: 4 }}>
      <Toggle
        checked={style.weight === 'bold'}
        onChange={v => onChange({ ...style, weight: v ? 'bold' : 'normal' })}
        label="Bold"
      />
      <Toggle
        checked={style.decoration === 'underline'}
        onChange={v => onChange({ ...style, decoration: v ? 'underline' : 'none' })}
        label="Underline"
      />
    </div>

    <Label>Text transform</Label>
    <Sel value={style.transform ?? 'none'} onChange={v => onChange({ ...style, transform: v as LabelConfig['transform'] })}
      options={[
        { value: 'none',       label: 'As typed' },
        { value: 'uppercase',  label: 'UPPERCASE' },
        { value: 'capitalize', label: 'Capitalize' },
      ]} fullWidth />

    <div
      style={{
        marginTop: 8, padding: '10px 12px', borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)',
        fontFamily: style.fontFamily || 'Arial',
        fontSize: `${style.fontSize ?? 10}px`,
        fontWeight: style.weight === 'bold' ? 700 : 400,
        textDecoration: style.decoration === 'underline' ? 'underline' : 'none',
        textTransform: style.transform === 'uppercase' ? 'uppercase' : style.transform === 'capitalize' ? 'capitalize' : 'none',
        color: '#f1f5f9',
      }}
    >
      Preview — most report text renders this way unless a component overrides it.
    </div>
  </div>
);

// ── Main page ──────────────────────────────────────────────────

export const TemplateAssemblyPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [picker, setPicker]     = useState<AssemblyRole | null>(null);
  const [activeRole, setActiveRole] = useState<AssemblyRole | null>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resolvedParts, setResolvedParts] = useState<ReportPart[]>([]);
  const [nameActive, setNameActive] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleCategory, setStyleCategory] = useState<'header' | 'body' | 'footer'>('body');
  const orgDocumentStyleDefault = getOrgDocumentStyleDefault();
  const orgHeaderStyleDefault = getOrgHeaderStyleDefault();
  const orgFooterStyleDefault = getOrgFooterStyleDefault();
  // Live id -> Part lookup, kept in sync with the Part Library. Used to resolve
  // each slot's CURRENT part name on render, rather than the frozen partName
  // snapshot stored on the slot at the moment it was added — see Known
  // Limitations in the Admin Guide for why this previously went stale.
  const [partsById, setPartsById] = useState<Record<string, ReportPart>>({});
  // Real, per direct guidance ("Parts Library... should also be tied
  // to a Performing Lab facility") — lifted here (not local to
  // PartsPanel) specifically so the picker modal (PartPicker, opened
  // separately) and the always-visible sidebar agree on the same real
  // lab context, rather than two independent filters that could
  // silently disagree.
  const [labs, setLabs] = useState<Facility[]>([]);
  const [labFilter, setLabFilter] = useState('');
  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  useEffect(() => {
    const loadPartsById = () => {
      mockReportPartService.getAll().then(r => {
        if (r.ok) {
          const map: Record<string, ReportPart> = {};
          r.data.forEach((p: ReportPart) => { map[p.id] = p; });
          setPartsById(map);
        }
      });
    };
    loadPartsById();
    return onReportPartsChanged(loadPartsById);
  }, []);

  /** Resolve a slot's display name live; falls back to the slot's own
   *  snapshot if the part has since been archived/deleted or hasn't loaded yet. */
  const resolveSlotName = useCallback((slot: AssemblySlot) =>
    partsById[slot.partId]?.name ?? slot.partName,
  [partsById]);

  // Load
  useEffect(() => {
    // Treat both undefined (no :templateId param in route) and 'new' as a blank template.
    // Without this, navigating to /admin/templates/new leaves templateId=undefined,
    // the !templateId guard fires, setLoading(false) is never called, and the page
    // is permanently stuck on "Loading template…".
    if (!templateId || templateId === 'new') {
      // Initialise a blank template in local state — no service call.
      // It will be persisted the first time the user saves (Publish / auto-save).
      const blank = {
        id:                 `tmpl-${Date.now()}`,
        name:               'New Report Template',
        specialty:          'general',
        subspecialty:       undefined,
        standard:           'custom',
        status:             'draft',
        orchestrationEnabled: false,
        institutionId:      'PATHSCRIBE',
        createdBy:          'user',
        createdAt:          new Date().toISOString(),
        updatedAt:          new Date().toISOString(),
        version:            '1.0.0',
        assembly:           [],
        nodes:              [],
      } as unknown as ReportTemplate;
      setTemplate(blank);
      setLoading(false);
      return;
    }
    svc.getById(templateId).then(r => {
      if (r.ok) setTemplate({ ...r.data, assembly: r.data.assembly ?? [] });
      else if (r.ok === false) setError(r.error);
      setLoading(false);
    });
  }, [templateId]);

  const save = useCallback(async (updated: ReportTemplate) => {
    setSaving(true);
    // Try update first; if not found (new template), create instead
    const r = await svc.save(updated).catch(() => null);
    if (r?.ok) {
      setTemplate(r.data);
      // Update URL if template was just created (id may have been a temp 'new' id)
      if (window.location.pathname.includes('/new')) {
        window.history.replaceState({}, '', `/admin/templates/${r.data.id}/edit`);
      }
    } else {
      // First save — template doesn't exist in store yet, create it
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...createPayload } = updated;
      const c = await svc.create(createPayload);
      if (c.ok) {
        setTemplate(c.data);
        window.history.replaceState({}, '', `/admin/templates/${c.data.id}/edit`);
      } else {
        if (c.ok === false) setError(c.error ?? 'Failed to save');
      }
    }
    setSaving(false);
  }, []);

  const updateAssembly = useCallback((assembly: AssemblySlot[]) => {
    if (!template) return;
    const updated = { ...template, assembly };
    setTemplate(updated);
    save(updated);
  }, [template, save]);

  // Slot operations
  const addSlot = useCallback((role: AssemblyRole, part: ReportPart) => {
    if (!template) return;
    const bodyOrder = template.assembly.filter(s => s.role === 'body').length;
    const newSlot: AssemblySlot = {
      slotId: crypto.randomUUID(),
      partId: part.id, partName: part.name, partType: part.partType,
      role, enabled: true,
      order: role === 'body' ? bodyOrder : 0,
    };
    updateAssembly([...template.assembly, newSlot]);
    setPicker(null);
  }, [template, updateAssembly]);

  const removeSlot = useCallback((slotId: string) => {
    if (!template) return;
    updateAssembly(template.assembly.filter(s => s.slotId !== slotId));
  }, [template, updateAssembly]);

  const toggleSlot = useCallback((slotId: string) => {
    if (!template) return;
    updateAssembly(template.assembly.map(s => s.slotId === slotId ? { ...s, enabled: !s.enabled } : s));
  }, [template, updateAssembly]);

  // Validation — computed once per render, displayed as warnings below error banner
  const validation = template ? validateAssembly(template) : null;

  // ── Hooks that must come before any early return ─────────────
  // IDs already in assembly — shown as ✓ in panel
  const usedPartIds = React.useMemo(
    () => new Set((template?.assembly ?? []).map((s: AssemblySlot) => s.partId)),
    [template?.assembly]
  );

  const handlePanelAdd = useCallback((part: ReportPart, role: AssemblyRole) => {
    addSlot(role, part);
    setActiveRole(null);
  }, [addSlot]);

  if (loading) return <div className="ps-tmpla-loading">Loading template…</div>;
  if (!template) return <div className="ps-tmpla-loading">Template not found.</div>;

  // Group slots by role display order
  const slotsByRole = (role: AssemblyRole) =>
    template.assembly
      .filter(s => s.role === role)
      .sort((a, b) => a.order - b.order);

  const bodySlots = slotsByRole('body');

  // ── Reorder body via dataTransfer (reliable) ─────────────────
  const handleBodyDragStart = (e: React.DragEvent, slotId: string) => {
    e.dataTransfer.setData('text/plain', slotId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingSlotId(slotId);
  };

  const handleBodyDrop = (e: React.DragEvent, targetSlotId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/plain');
    if (!fromId || fromId === targetSlotId || !template) return;
    const bodySlots = template.assembly.filter(s => s.role === 'body');
    const others    = template.assembly.filter(s => s.role !== 'body');
    const fromIdx   = bodySlots.findIndex(s => s.slotId === fromId);
    const toIdx     = bodySlots.findIndex(s => s.slotId === targetSlotId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...bodySlots];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    updateAssembly([...others, ...reordered.map((s, i) => ({ ...s, order: i }))]);
    setDraggingSlotId(null);
  };

  return (
    <div className="ps-tmpla-root">

      {/* ── Topbar ── */}
      <header className="ps-tmpla-topbar">
        <div className="ps-tmpla-top-left">
          <button
            onClick={() => navigate(-1)}
            className="ps-tmpla-back-btn"
            title="Back to templates"
          >
            ←
          </button>
          <div className="ps-tmpla-name-block">
            <div
              className="ps-tmpla-name-wrap"
              onMouseEnter={() => setNameActive(true)}
              onMouseLeave={() => setNameActive(false)}
            >
              <input value={template.name}
                onChange={e => setTemplate({ ...template, name: e.target.value })}
                onFocus={() => setNameActive(true)}
                onBlur={() => { setNameActive(false); save(template); }}
                title="Click to edit template name"
                className="ps-tmpla-name-input" />
              {nameActive && <span className="ps-tmpla-name-pencil">✎</span>}
            </div>
            <div className="ps-tmpla-name-sub">{template.specialty || 'General'} · {template.standard ?? 'Custom'}</div>
          </div>
        </div>
        <div className="ps-tmpla-top-right">
          <span className="ps-tmpla-save-indicator">{saving ? '⟳ Saving…' : '✓ Saved'}</span>
          <StatusBadge status={template.status} />
          <button onClick={() => setStyleOpen(o => !o)} className="ps-tmpla-btn">
            🖋 Style
          </button>
          <button onClick={async () => {
            if (!template) return;
            const slotsInOrder = template.assembly.filter(s => s.enabled);
            const partResults = await Promise.all(slotsInOrder.map(s => mockReportPartService.getById(s.partId)));
            setResolvedParts(partResults.filter(r => r.ok).map(r => (r as { ok: true; data: ReportPart }).data));
            setPreviewOpen(true);
          }} className="ps-tmpla-btn ps-tmpla-btn--preview">
            Preview
          </button>
          <button onClick={async () => { const r = await svc.publish(template.id); if (r.ok) setTemplate(r.data); }}
            disabled={template.status === 'published'}
            className={`ps-tmpla-btn ps-tmpla-btn--publish${template.status === 'published' ? ' ps-tmpla-btn--published' : ''}`}>
            {template.status === 'published' ? 'Published' : 'Publish'}
          </button>
        </div>
      </header>

      {/* ── Document style panel ──
           Real feature, per direct request. org-default shown as
           placeholder text when the template hasn't set its own —
           makes it visible at a glance which layer is actually
           governing right now, without the template silently
           inheriting something invisible. */}
      {styleOpen && (
        <div className="ps-partb-meta-panel">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['header', 'body', 'footer'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setStyleCategory(cat)}
                className={`ps-partb-btn${styleCategory === cat ? ' ps-partb-btn--grid-on' : ''}`}
                style={{ textTransform: 'capitalize' }}
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 10, fontSize: 12, color: '#94a3b8' }}>
            Default {styleCategory} text style for this template. Falls back to
            the org-wide {styleCategory} default (
            {(styleCategory === 'header' ? orgHeaderStyleDefault : styleCategory === 'footer' ? orgFooterStyleDefault : orgDocumentStyleDefault).fontFamily},{' '}
            {(styleCategory === 'header' ? orgHeaderStyleDefault : styleCategory === 'footer' ? orgFooterStyleDefault : orgDocumentStyleDefault).fontSize}px
            ) when not set here. Individual components can still override
            this for specific fields (e.g. Final Diagnosis bold and
            capitalized).
          </div>
          <DocumentStyleEditor
            style={
              template.documentStyle?.[styleCategory]
              ?? (styleCategory === 'header' ? orgHeaderStyleDefault : styleCategory === 'footer' ? orgFooterStyleDefault : orgDocumentStyleDefault)
            }
            onChange={next => save({ ...template, documentStyle: { ...template.documentStyle, [styleCategory]: next } })}
          />
        </div>
      )}

      {/* ── Body: left panel + canvas ── */}
      <div className="ps-tmpla-body">

        {/* Persistent Parts Panel */}
        <PartsPanel
          activeRole={activeRole}
          usedPartIds={usedPartIds}
          labFilter={labFilter}
          labs={labs}
          onLabFilterChange={setLabFilter}
          onAdd={handlePanelAdd}
        />

        {/* ── Two-page canvas ── */}
        <div className="ps-tmpla-canvas">

          {/* Service errors */}
          {error && (
            <div className="ps-tmpla-error-banner">
              {error}
            </div>
          )}

          {/* Assembly validation warnings */}
          {validation && !(validation as any).valid && (
            <div className="ps-tmpla-warn-banner">
              <strong>Assembly issues:</strong>
              <ul>
                {((validation as any).errors ?? []).map((msg: string, i: number) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Description */}
          <div className="ps-tmpla-desc">
            <div className="ps-tmpla-desc-title">
              {template.name}
            </div>
            <div className="ps-tmpla-desc-sub">
              Drag body parts to reorder · Click a zone to assign or change a part · Toggle ● to enable/disable
            </div>
          </div>

          {/* Two-column page layout — zones driven by PAGE1_ROLES / PAGE2PLUS_ROLES */}
          <div className="ps-tmpla-canvas-grid">

            {/* ── Page 1 ── */}
            <div>
              <div className="ps-tmpla-page-label">Page 1</div>
              <div className="ps-tmpla-page-card">
                {PAGE1_ROLES.map(role => {
                  if (role === 'body') return (
                    <React.Fragment key="body">
                      <div className="ps-tmpla-zone-header ps-tmpla-zone-header--spaced">
                        <span className="ps-tmpla-zone-icon">▬</span>
                        <span className="ps-tmpla-zone-title">Body</span>
                        <span className="ps-tmpla-zone-meta">
                          {bodySlots.filter(s => s.enabled).length} active · drag to reorder
                        </span>
                      </div>
                      {bodySlots.length === 0 && (
                        <div className="ps-tmpla-body-empty">
                          No body parts added yet
                        </div>
                      )}
                      {bodySlots.map((slot, i) => (
                        <div key={slot.slotId} draggable
                          onDragStart={e => handleBodyDragStart(e, slot.slotId)}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => handleBodyDrop(e, slot.slotId)}
                          onDragEnd={() => setDraggingSlotId(null)}
                          className={`ps-tmpla-body-row${draggingSlotId === slot.slotId ? ' ps-tmpla-body-row--dragging' : ''}`}
                        >
                          <span className="ps-tmpla-body-row-handle">⠿</span>
                          <span className="ps-tmpla-body-row-index">{i + 1}</span>
                          <span className="ps-tmpla-body-row-badge">Body</span>
                          <span className={`ps-tmpla-body-row-name${slot.enabled ? '' : ' ps-tmpla-body-row-name--disabled'}`}>{resolveSlotName(slot)}</span>
                          <button onClick={() => toggleSlot(slot.slotId)} title={slot.enabled ? 'Disable' : 'Enable'}
                            className={`ps-tmpla-body-row-toggle${slot.enabled ? ' ps-tmpla-body-row-toggle--on' : ''}`}>
                            {slot.enabled ? '●' : '○'}
                          </button>
                          <button onClick={() => navigate(`/admin/parts/${slot.partId}/edit`)}
                            className="ps-tmpla-body-row-edit">
                            Edit part
                          </button>
                          <button onClick={() => removeSlot(slot.slotId)}
                            className="ps-tmpla-body-row-remove">
                            ✕
                          </button>
                        </div>
                      ))}
                      <AddSlotRow role="body" onAdd={() => setActiveRole(r => r === 'body' ? null : 'body')} activeRole={activeRole} />
                    </React.Fragment>
                  );
                  const icon = role.startsWith('header') ? '▲' : '▼';
                  const label = role.startsWith('header') ? 'Header' : 'Footer';
                  return (
                    <React.Fragment key={role}>
                      <div className={`ps-tmpla-zone-header${role !== PAGE1_ROLES[0] ? ' ps-tmpla-zone-header--spaced' : ''}`}>
                        <span className="ps-tmpla-zone-icon">{icon}</span>
                        <span className="ps-tmpla-zone-title">{label}</span>
                      </div>
                      {slotsByRole(role).map(slot => (
                        <SlotRow key={slot.slotId} slot={slot} displayName={resolveSlotName(slot)}
                          dragging={false} onDragStart={() => {}}
                          onEdit={() => navigate(`/admin/parts/${slot.partId}/edit`)}
                          onRemove={() => removeSlot(slot.slotId)}
                          onToggle={() => toggleSlot(slot.slotId)}
                        />
                      ))}
                      <AddSlotRow role={role} onAdd={() => setActiveRole(r => r === role ? null : role)} activeRole={activeRole} />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* ── Pages 2+ ── */}
            <div>
              <div className="ps-tmpla-page-label">Pages 2+</div>
              <div className="ps-tmpla-page-card">
                {PAGE2PLUS_ROLES.map((role, i) => {
                  const icon = role.startsWith('header') ? '▲' : '▼';
                  const label = role.startsWith('header') ? 'Header' : 'Footer';
                  return (
                    <React.Fragment key={role}>
                      <div className={`ps-tmpla-zone-header${i > 0 ? ' ps-tmpla-zone-header--spaced' : ''}`}>
                        <span className="ps-tmpla-zone-icon">{icon}</span>
                        <span className="ps-tmpla-zone-title">{label}</span>
                      </div>
                      {slotsByRole(role).map(slot => (
                        <SlotRow key={slot.slotId} slot={slot} displayName={resolveSlotName(slot)}
                          dragging={false} onDragStart={() => {}}
                          onEdit={() => navigate(`/admin/parts/${slot.partId}/edit`)}
                          onRemove={() => removeSlot(slot.slotId)}
                          onToggle={() => toggleSlot(slot.slotId)}
                        />
                      ))}
                      <AddSlotRow role={role} onAdd={() => setActiveRole(r => r === role ? null : role)} activeRole={activeRole} />
                      {/* Body reference sits between header and footer on pages 2+ */}
                      {role.startsWith('header') && (
                        <>
                          <div className="ps-tmpla-zone-header ps-tmpla-zone-header--spaced">
                            <span className="ps-tmpla-zone-icon">▬</span>
                            <span className="ps-tmpla-zone-title">Body</span>
                            <span className="ps-tmpla-zone-meta">same as Page 1</span>
                          </div>
                          <div className="ps-tmpla-body-continue">
                            {bodySlots.length === 0 ? 'No body parts — add them in Page 1'
                              : `${bodySlots.length} part${bodySlots.length !== 1 ? 's' : ''} continue across all pages`}
                          </div>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

          </div>{/* end two-column grid */}
        </div>{/* end canvas scroll area */}
      </div>{/* end body flex wrapper */}

      {/* ── Part picker modal ── */}
      {picker && (
        <PartPicker role={picker} labFilter={labFilter} labs={labs} onPick={part => addSlot(picker, part)}
          onClose={() => setPicker(null)} />
      )}

      {/* ── Preview panel ── */}
      {previewOpen && template && (() => {
        const flatNodes = resolvedParts.flatMap(p => p.nodes);
        const syntheticTemplate: OldTemplate = {
          id: template.id, name: template.name, specialty: template.specialty,
          standard: template.standard, status: template.status,
          orchestrationEnabled: template.orchestrationEnabled,
          institutionId: template.institutionId, createdBy: template.createdBy,
          createdAt: template.createdAt, updatedAt: template.updatedAt,
          version: template.version, nodes: flatNodes,
        };
        return <TemplatePreviewPanel template={syntheticTemplate} onClose={() => setPreviewOpen(false)} />;
      })()}

    </div>
  );
};

export default TemplateAssemblyPage;
