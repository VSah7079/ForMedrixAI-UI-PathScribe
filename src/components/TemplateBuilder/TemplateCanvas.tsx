// src/components/TemplateBuilder/TemplateCanvas.tsx
//
// i18n (file-by-file sweep):
//   This file already had a full ps-tc-* CSS class family from earlier
//   work, so this batch is i18n-only — no CSS changes. `repeat-group`'s
//   `↺ {iterateOver}` chip and `expression-value`'s template-snippet chip
//   both surface raw internal schema identifiers/expression syntax
//   (iterateOver values, {{...}} template content) and are left
//   untranslated, same "internal schema/data-key identifiers stay
//   English" convention used throughout this sweep. The "AI" and "IF"
//   property badges are ordinary UI chrome (not fixed clinical
//   vocabulary like SNOMED/CPT codes) and are translated, same posture
//   as the AND/OR logic-operator labels translated in TemplateInspector.
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type TemplateNode,
  type TemplateNodeType,
  type SectionNode,
  CONTAINER_NODE_TYPES,
  PALETTE_ITEMS,
  createDefaultNode,
} from '../../types/template';

// ── Grid context ───────────────────────────────────────────────
const GridContext = createContext<boolean>(false);

// ── Update context ─────────────────────────────────────────────
// Allows NodeCard to update a node's colSpan via drag-resize
// without threading a callback through every level.
const UpdateContext = createContext<((id: string, colSpan: number) => void) | null>(null);

// ── Types ──────────────────────────────────────────────────────

interface Props {
  nodes: TemplateNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (nodes: TemplateNode[]) => void;
  showGrid?: boolean;
  /** When set, hides irrelevant page zones. Body parts show no header/footer zones. */
  partType?: 'header' | 'footer' | 'body';
}

// ── Helpers ────────────────────────────────────────────────────

function getChildren(node: TemplateNode): TemplateNode[] {
  if ('children' in node && Array.isArray(node.children)) return node.children;
  return [];
}

function setChildren(node: TemplateNode, children: TemplateNode[]): TemplateNode {
  if ('children' in node) return { ...node, children };
  return node;
}

/** Deep insert a new node at parentId. If parentId is null, insert at root. */
function insertNode(
  nodes: TemplateNode[],
  newNode: TemplateNode,
  parentId: string | null,
  insertIndex?: number
): TemplateNode[] {
  if (parentId === null) {
    const idx = insertIndex ?? nodes.length;
    const next = [...nodes];
    next.splice(idx, 0, newNode);
    return next;
  }
  return nodes.map(n => {
    if (n.id === parentId) {
      const children = getChildren(n);
      const idx = insertIndex ?? children.length;
      const next = [...children];
      next.splice(idx, 0, newNode);
      return setChildren(n, next);
    }
    const children = getChildren(n);
    if (children.length > 0) {
      return setChildren(n, insertNode(children, newNode, parentId, insertIndex));
    }
    return n;
  });
}

/** Remove a node by id anywhere in the tree. Returns [updatedTree, removedNode]. */
function removeNode(
  nodes: TemplateNode[],
  id: string
): [TemplateNode[], TemplateNode | null] {
  let removed: TemplateNode | null = null;
  const next = nodes.filter(n => {
    if (n.id === id) { removed = n; return false; }
    return true;
  }).map(n => {
    const children = getChildren(n);
    if (children.length > 0) {
      const [nextChildren, r] = removeNode(children, id);
      if (r) removed = r;
      return setChildren(n, nextChildren);
    }
    return n;
  });
  return [next, removed];
}

/** Update a node by id anywhere in the tree. */
export function updateNode(
  nodes: TemplateNode[],
  id: string,
  updater: (n: TemplateNode) => TemplateNode
): TemplateNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n);
    const children = getChildren(n);
    if (children.length > 0) {
      return setChildren(n, updateNode(children, id, updater));
    }
    return n;
  });
}

function isContainerType(type: TemplateNodeType): boolean {
  return CONTAINER_NODE_TYPES.includes(type);
}

function paletteColor(type: TemplateNodeType): string {
  return PALETTE_ITEMS.find(p => p.type === type)?.color ?? '#475569';
}

function paletteIcon(type: TemplateNodeType): string {
  return PALETTE_ITEMS.find(p => p.type === type)?.icon ?? '•';
}

// ── Drop zone component ────────────────────────────────────────

interface DropZoneProps {
  parentId: string | null;
  insertIndex: number;
  onDrop: (parentId: string | null, insertIndex: number, e: React.DragEvent) => void;
  isActive: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ parentId, insertIndex, onDrop, isActive }) => {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); onDrop(parentId, insertIndex, e); }}
      className={`ps-tc-dropzone${isActive ? ' ps-tc-dropzone--active' : ''}${over ? ' ps-tc-dropzone--over' : ''}`}
    />
  );
};

// ── Node card ─────────────────────────────────────────────────

interface NodeCardProps {
  node: TemplateNode;
  depth: number;
  selectedId: string | null;
  isDragging: boolean;
  onSelect: (id: string) => void;
  onDrop: (parentId: string | null, insertIndex: number, e: React.DragEvent) => void;
  onDelete: (id: string) => void;
}

const NodeCard: React.FC<NodeCardProps> = ({
  node,
  depth,
  selectedId,
  isDragging,
  onSelect,
  onDrop,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedId === node.id;
  const isContainer = isContainerType(node.type);
  const children = getChildren(node);
  const color = paletteColor(node.type);
  const icon = paletteIcon(node.type);

  const hasBadge =
    node.type === 'section' &&
    (node as SectionNode).ai?.enabled;

  // ── Type-specific property chips ─────────────────────────────
  // Makes invisible toggle properties visible on the canvas card
  // so the designer can see why certain things appear in the preview.
  const propertyChips: string[] = [];
  if (node.type === 'header') {
    if ((node as import('../../types/template').HeaderNode).showLogo)        propertyChips.push(t('templateCanvas.chip.logo'));
    if ((node as import('../../types/template').HeaderNode).showAccession)   propertyChips.push(t('templateCanvas.chip.accessionHash'));
    if ((node as import('../../types/template').HeaderNode).showPatientName) propertyChips.push(t('templateCanvas.chip.patient'));
    const scope = (node as import('../../types/template').HeaderNode).scope;
    if (scope && scope !== 'all') propertyChips.push(scope === 'page1' ? t('templateCanvas.chip.page1Only') : t('templateCanvas.chip.pages2Plus'));
  }
  if (node.type === 'footer') {
    if ((node as import('../../types/template').FooterNode).showPageNumbers) propertyChips.push(t('templateCanvas.chip.pageHash'));
    const scope = (node as import('../../types/template').FooterNode).scope;
    if (scope && scope !== 'all') propertyChips.push(scope === 'page1' ? t('templateCanvas.chip.page1Only') : t('templateCanvas.chip.pages2Plus'));
  }
  if (node.type === 'repeat-group') {
    // iterateOver is a real internal context-array identifier (schema
    // syntax), left untranslated — see file header.
    propertyChips.push(`↺ ${(node as import('../../types/template').RepeatGroupNode).iterateOver}`);
  }
  if (node.type === 'expression-value') {
    // Template content is the actual expression the author typed — real
    // schema syntax, left untranslated — see file header.
    const tpl = (node as import('../../types/template').ExpressionValueNode).template;
    if (tpl) propertyChips.push(tpl.length > 22 ? tpl.slice(0, 22) + '…' : tpl);
  }
  if (node.type === 'page-break') {
    propertyChips.push(t('templateCanvas.chip.always'));
  }
  if (node.type === 'column-layout') {
    const n = (node as import('../../types/template').ColumnLayoutNode).numColumns;
    propertyChips.push(t('templateCanvas.chip.colFlows', { n }));
  }
  // Column width chip — always show when not full-width
  const colSpan = node.colSpan ?? 12;
  if (colSpan < 12) {
    propertyChips.push(t('templateCanvas.chip.colSpan', { colSpan }));
  }

  const showGrid  = useContext(GridContext);
  const onUpdate  = useContext(UpdateContext);
  const wrapRef   = React.useRef<HTMLDivElement>(null);

  // ── Drag-to-resize handle ──────────────────────────────────────
  const handleResizeMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX    = e.clientX;
    const startSpan = colSpan;

    const onMove = (mv: MouseEvent) => {
      const parent = wrapRef.current?.parentElement;
      if (!parent || !onUpdate) return;
      const parentW  = parent.getBoundingClientRect().width;
      const deltaX   = mv.clientX - startX;
      const deltaCols = Math.round((deltaX / parentW) * 12);
      const next     = Math.max(1, Math.min(12, startSpan + deltaCols));
      // Snap to common fractions: 1,2,3,4,6,8,9,12
      const snaps    = [1, 2, 3, 4, 6, 8, 9, 12];
      const snapped  = snaps.reduce((a, b) => Math.abs(b - next) < Math.abs(a - next) ? b : a);
      onUpdate(node.id, snapped);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colSpan, node.id, onUpdate]);

  return (
    <div
      ref={wrapRef}
      // Per-node column span (1–12), as a custom property (Batch 367).
      style={{ '--tc-span': `span ${colSpan}` } as React.CSSProperties}
      className={`ps-tc-node-wrap${showGrid ? ' ps-tc-node-wrap--grid' : ''}`}
    >
      {/* ── Width label shown when grid is on ── */}
      {showGrid && colSpan < 12 && (
        <div className="ps-tc-width-label">
          {colSpan}/12
        </div>
      )}
      <div
        draggable
        onDragStart={e => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', 'node::' + node.id);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onSelect(node.id)}
        style={{ '--node-color': color } as React.CSSProperties}
        className={[
          'ps-tc-node-row',
          isSelected ? 'ps-tc-node-row--selected' : hovered ? 'ps-tc-node-row--hovered' : '',
          isDragging ? 'ps-tc-node-row--dragging' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* Left accent strip */}
        <div className={`ps-tc-node-accent${isSelected ? ' ps-tc-node-accent--selected' : ''}`} />

        {/* Padding spacer to account for accent strip */}
        <div className="ps-tc-node-spacer" />
        {/* Expand toggle for containers */}
        {isContainer && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
            className="ps-tc-node-expand-btn"
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
        {!isContainer && <div className="ps-tc-node-spacer-wide" />}

        {/* Icon */}
        <div className="ps-tc-node-icon">
          {icon}
        </div>

        {/* Label + property chips */}
        <div className="ps-tc-node-label-col">
          <span className={`ps-tc-node-label${isSelected ? ' ps-tc-node-label--selected' : ''}`}>
            {node.label}
          </span>
          {propertyChips.length > 0 && (
            <div className="ps-tc-node-chips">
              {propertyChips.map(chip => (
                <span key={chip} className="ps-tc-node-chip">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AI badge — WCAG: #065f46 on #d1fae5 = 7.5:1 ✓ */}
        {hasBadge && (
          <span className="ps-tc-badge ps-tc-badge--ai">
            {t('templateCanvas.badge.ai')}
          </span>
        )}

        {/* showWhen badge — WCAG: #713f12 on #fef3c7 = 8.1:1 ✓ */}
        {node.showWhen && (
          <span className="ps-tc-badge ps-tc-badge--if">
            {t('templateCanvas.badge.if')}
          </span>
        )}

        {/* Delete button */}
        {hovered && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(node.id); }}
            className="ps-tc-node-delete-btn"
            title={t('templateCanvas.removeTooltip')}
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Resize handle — drag right edge to change column width ── */}
      <div
        onMouseDown={handleResizeMouseDown}
        title={t('templateCanvas.resizeTooltip')}
        style={{ '--node-color': color } as React.CSSProperties}
        className={`ps-tc-resize-handle${hovered || isSelected ? ' ps-tc-resize-handle--visible' : ''}`}
      >
        <div className={`ps-tc-resize-bar${isSelected ? ' ps-tc-resize-bar--selected' : ''}`} />
      </div>

      {/* Children — column-layout: flat ordered list matching the flowing
          column-count preview. Content fills col 1 to bottom then overflows
          into col 2, so there is no meaningful per-column slot at authoring
          time — only ordering matters. */}
      {isContainer && expanded && node.type === 'column-layout' && (() => {
        const colNode = node as import('../../types/template').ColumnLayoutNode;
        const numCols = colNode.numColumns;
        return (
          <div className="ps-tc-collayout">

            {/* ── Column-count indicator ─────────────────────────── */}
            <div className="ps-tc-collayout-indicator">
              {/* Mini column-stripe diagram */}
              {Array.from({ length: numCols }).map((_, i) => (
                <React.Fragment key={i}>
                  <div className="ps-tc-collayout-stripe" />
                  {i < numCols - 1 && (
                    <div className="ps-tc-collayout-divider" />
                  )}
                </React.Fragment>
              ))}
              <span className="ps-tc-collayout-label">
                {t('templateCanvas.collayout.indicator', { numCols })}
              </span>
            </div>

            {/* ── Flat ordered child list ────────────────────────── */}
            <div className="ps-tc-collayout-list">
              <DropZone parentId={node.id} insertIndex={0}
                onDrop={onDrop} isActive={isDragging} />
              {colNode.children.map((child, i) => (
                <React.Fragment key={child.id}>
                  <NodeCard
                    node={child} depth={depth + 1} selectedId={selectedId}
                    isDragging={isDragging} onSelect={onSelect}
                    onDrop={onDrop} onDelete={onDelete}
                  />
                  <DropZone parentId={node.id} insertIndex={i + 1}
                    onDrop={onDrop} isActive={isDragging} />
                </React.Fragment>
              ))}
              {colNode.children.length === 0 && (
                <div className="ps-tc-collayout-empty">
                  {t('templateCanvas.collayout.empty', { numCols })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Children — 12-column grid for all other containers */}
      {isContainer && expanded && node.type !== 'column-layout' && (
        <div
          style={{ '--node-color': color } as React.CSSProperties}
          className="ps-tc-grid-children"
        >
          {/* Full-width drop zone at top */}
          <div className="ps-tc-grid-span-12">
            <DropZone parentId={node.id} insertIndex={0} onDrop={onDrop} isActive={isDragging} />
          </div>

          {/* 12-col grid wraps child cards */}
          <div className="ps-tc-grid-12">

            {children.map((child, i) => (
              <React.Fragment key={child.id}>
                <NodeCard
                  node={child}
                  depth={depth + 1}
                  selectedId={selectedId}
                  isDragging={isDragging}
                  onSelect={onSelect}
                  onDrop={onDrop}
                  onDelete={onDelete}
                />
                {/* Drop zone after each child — spans full width to keep insertion clear */}
                <div className="ps-tc-grid-span-12">
                  <DropZone parentId={node.id} insertIndex={i + 1} onDrop={onDrop} isActive={isDragging} />
                </div>
              </React.Fragment>
            ))}
          </div>

          {children.length === 0 && (
            <div className="ps-tc-grid-empty">
              {t('templateCanvas.grid.empty')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main canvas ────────────────────────────────────────────────

export const TemplateCanvas: React.FC<Props> = ({
  nodes,
  selectedId,
  onSelect,
  onChange,
  showGrid = false,
  partType,
}) => {
  const { t } = useTranslation();
  // isDragging is set on dragenter/dragleave on the canvas root so drop zones show
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0); // prevents flicker on child dragenter/dragleave

  const handleDrop = useCallback(
    (parentId: string | null, insertIndex: number, e: React.DragEvent) => {
      dragCounter.current = 0;
      setIsDragging(false);
      const data = e.dataTransfer.getData('text/plain');
      if (!data) return;

      if (data.startsWith('palette::')) {
        // New node from palette
        const type = data.replace('palette::', '') as TemplateNodeType;
        const newNode = createDefaultNode(type);
        const updated = insertNode(nodes, newNode, parentId, insertIndex);
        onChange(updated);
        onSelect(newNode.id);
      } else if (data.startsWith('node::')) {
        // Existing node being moved
        const nodeId = data.replace('node::', '');
        // Prevent dropping a container into itself
        if (parentId === nodeId) return;
        const [withoutNode, removed] = removeNode(nodes, nodeId);
        if (!removed) return;
        const updated = insertNode(withoutNode, removed, parentId, insertIndex);
        onChange(updated);
      }
    },
    [nodes, onChange, onSelect]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const [updated] = removeNode(nodes, id);
      onChange(updated);
      if (selectedId === id) onSelect('');
    },
    [nodes, onChange, selectedId, onSelect]
  );

  // ── Resize handler — called by NodeCard drag-resize handle ─────
  const handleColSpanUpdate = useCallback(
    (id: string, colSpan: number) => {
      const updated = updateNode(nodes, id, n => ({ ...n, colSpan }));
      onChange(updated);
    },
    [nodes, onChange]
  );

  return (
    <GridContext.Provider value={showGrid}>
    <UpdateContext.Provider value={handleColSpanUpdate}>
    <div
      className="ps-tc-canvas-surround"
      onDragEnter={() => { dragCounter.current++; setIsDragging(true); }}
      onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }}
      onDragOver={e => e.preventDefault()}
      onDrop={() => { dragCounter.current = 0; setIsDragging(false); }}
    >
      {/* ── Document page ── */}
      <div className="ps-tc-page">

        {/* Page 1 Header — only shown for header parts or generic templates */}
        {partType !== 'body' && partType !== 'footer' && (
          <PageZone label={t('templateCanvas.zone.page1HeaderLabel')} hint={t('templateCanvas.zone.page1HeaderHint')}
            nodes={nodes.filter(n => n.type === 'header' && (n as import('../../types/template').HeaderNode).scope !== 'pages2plus')}
            zoneNodes={nodes} selectedId={selectedId} isDragging={isDragging}
            onSelect={onSelect} onDrop={handleDrop} onDelete={handleDelete}
            zoneVariant="header" insertOffset={0}
          />
        )}

        {/* Pages 2+ Header — only shown for header parts or generic */}
        {partType !== 'body' && partType !== 'footer' && (
          <PageZone label={t('templateCanvas.zone.pages2HeaderLabel')} hint={t('templateCanvas.zone.pages2HeaderHint')}
            nodes={nodes.filter(n => n.type === 'header' && (n as import('../../types/template').HeaderNode).scope === 'pages2plus')}
            zoneNodes={nodes} selectedId={selectedId} isDragging={isDragging}
            onSelect={onSelect} onDrop={handleDrop} onDelete={handleDelete}
            zoneVariant="header--p2plus"
            insertOffset={1}
          />
        )}

        {/* Body — whole area always droppable */}
        <div
          className={`ps-tc-body${showGrid ? ' ps-tc-body--grid' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            const bodyNodes = nodes.filter(n => n.type !== 'header' && n.type !== 'footer');
            handleDrop(null, bodyNodes.length, e);
          }}
        >
          {/* Empty state — full area drop target */}
          {nodes.filter(n => n.type !== 'header' && n.type !== 'footer').length === 0 && (
            <div className={`ps-tc-body-empty${isDragging ? ' ps-tc-body-empty--dragging' : ''}`}>
              <div className="ps-tc-body-empty-icon">⊞</div>
              <div className="ps-tc-body-empty-title">
                {isDragging ? t('templateCanvas.body.releaseHint') : t('templateCanvas.body.dragHint')}
              </div>
              {!isDragging && <div className="ps-tc-body-empty-sub">
                {t('templateCanvas.body.dragSub')}
              </div>}
            </div>
          )}

          {/* Body rows — grouped by colSpan */}
          {(() => {
            const bodyNodes = nodes.filter(n => n.type !== 'header' && n.type !== 'footer');
            const rows: TemplateNode[][] = [];
            let cur: TemplateNode[] = [], used = 0;
            for (const n of bodyNodes) {
              const span = n.colSpan ?? 12;
              if (used + span > 12 && cur.length > 0) { rows.push(cur); cur = []; used = 0; }
              cur.push(n); used += span;
              if (used >= 12) { rows.push(cur); cur = []; used = 0; }
            }
            if (cur.length > 0) rows.push(cur);
            return rows.map((row, ri) => {
              const rowUsed = row.reduce((s, n) => s + (n.colSpan ?? 12), 0);
              const free = 12 - rowUsed;
              const firstIdx = bodyNodes.findIndex(n => n.id === row[0].id);
              const lastIdx  = bodyNodes.findIndex(n => n.id === row[row.length - 1].id);
              return (
                <React.Fragment key={`row-${ri}`}>
                  <DropZone parentId={null} insertIndex={firstIdx} onDrop={handleDrop} isActive={isDragging} />
                  <div className="ps-tc-row-grid">
                    {row.map(node => (
                      <NodeCard key={node.id} node={node} depth={0}
                        selectedId={selectedId} isDragging={isDragging}
                        onSelect={onSelect} onDrop={handleDrop} onDelete={handleDelete}
                      />
                    ))}
                    {free > 0 && free < 12 && (
                      // Per-row free span, as a custom property (Batch 367).
                      <div
                        style={{ '--tc-span': `span ${free}` } as React.CSSProperties}
                        className={`ps-tc-free-slot${isDragging ? ' ps-tc-free-slot--dragging' : ''}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.stopPropagation(); handleDrop(null, lastIdx + 1, e); }}
                      >
                        {isDragging ? t('templateCanvas.freeSlot.dropHere') : t('templateCanvas.freeSlot.free', { free })}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            });
          })()}
          {/* Bottom drop zone — always present once there are body nodes */}
          {nodes.filter(n => n.type !== 'header' && n.type !== 'footer').length > 0 && (
            <DropZone parentId={null}
              insertIndex={nodes.filter(n => n.type !== 'header' && n.type !== 'footer').length}
              onDrop={handleDrop} isActive={isDragging}
            />
          )}
        </div>

        {/* Pages 2+ Footer — only shown for footer parts or generic */}
        {partType !== 'body' && partType !== 'header' && (
          <PageZone label={t('templateCanvas.zone.pages2FooterLabel')} hint={t('templateCanvas.zone.pages2FooterHint')}
            nodes={nodes.filter(n => n.type === 'footer' && (n as import('../../types/template').FooterNode).scope === 'pages2plus')}
            zoneNodes={nodes} selectedId={selectedId} isDragging={isDragging}
            onSelect={onSelect} onDrop={handleDrop} onDelete={handleDelete}
            zoneVariant="footer--p2plus"
            insertOffset={nodes.length - 2}
          />
        )}

        {/* Page 1 Footer — only shown for footer parts or generic */}
        {partType !== 'body' && partType !== 'header' && (
          <PageZone label={t('templateCanvas.zone.page1FooterLabel')} hint={t('templateCanvas.zone.page1FooterHint')}
            nodes={nodes.filter(n => n.type === 'footer' && (n as import('../../types/template').FooterNode).scope !== 'pages2plus')}
            zoneNodes={nodes} selectedId={selectedId} isDragging={isDragging}
            onSelect={onSelect} onDrop={handleDrop} onDelete={handleDelete}
            zoneVariant="footer" insertOffset={nodes.length - 1}
          />
        )}
      </div>
    </div>
    </UpdateContext.Provider>
    </GridContext.Provider>
  );
};

// ── Zone chip ──────────────────────────────────────────────────
// Small badge shown in the header/footer zone label bar to surface
// active toggle properties that are otherwise invisible on the canvas.

const ZoneChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ps-tc-zone-chip">
    {children}
  </span>
);

// ── Page zone (header / footer placeholder) ────────────────────

interface PageZoneProps {
  label: string;
  hint: string;
  nodes: TemplateNode[];
  zoneNodes: TemplateNode[];
  selectedId: string | null;
  isDragging: boolean;
  onSelect: (id: string) => void;
  onDrop: (parentId: string | null, insertIndex: number, e: React.DragEvent) => void;
  onDelete: (id: string) => void;
  /** 'header' | 'footer' base zone styling, optionally with a '--p2plus' modifier */
  zoneVariant: 'header' | 'footer' | 'header--p2plus' | 'footer--p2plus';
  insertOffset: number;
}

const PageZone: React.FC<PageZoneProps> = ({
  label, hint, nodes, zoneNodes: _zoneNodes, selectedId, isDragging,
  onSelect, onDrop, onDelete, zoneVariant, insertOffset,
}) => {
  const { t } = useTranslation();
  const [zoneOver, setZoneOver] = useState(false);
  const isEmpty = nodes.length === 0;

  return (
    <div
      className={`ps-tc-zone ps-tc-zone--${zoneVariant}${zoneOver && isDragging ? ' ps-tc-zone--drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setZoneOver(true); }}
      onDragLeave={() => setZoneOver(false)}
      onDrop={e => {
        e.stopPropagation();
        setZoneOver(false);
        onDrop(null, insertOffset, e);
      }}
    >
      <div className="ps-tc-zone-label-row">
        <div className="ps-tc-zone-label">{label}</div>
        {/* Surface active toggle properties from the first header/footer node */}
        {nodes[0] && nodes[0].type === 'header' && (
          <div className="ps-tc-zone-chips">
            {(nodes[0] as import('../../types/template').HeaderNode).showLogo        && <ZoneChip>{t('templateCanvas.chip.logo')}</ZoneChip>}
            {(nodes[0] as import('../../types/template').HeaderNode).showAccession   && <ZoneChip>{t('templateCanvas.chip.accessionHash')}</ZoneChip>}
            {(nodes[0] as import('../../types/template').HeaderNode).showPatientName && <ZoneChip>{t('templateCanvas.zoneChip.patientName')}</ZoneChip>}
          </div>
        )}
        {nodes[0] && nodes[0].type === 'footer' && (
          <div className="ps-tc-zone-chips">
            {(nodes[0] as import('../../types/template').FooterNode).showPageNumbers && <ZoneChip>{t('templateCanvas.zoneChip.pageNumbers')}</ZoneChip>}
          </div>
        )}
      </div>
      {isEmpty ? (
        <div className="ps-tc-zone-hint">{hint}</div>
      ) : (
        nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            <NodeCard
              node={node}
              depth={0}
              selectedId={selectedId}
              isDragging={isDragging}
              onSelect={onSelect}
              onDrop={onDrop}
              onDelete={onDelete}
            />
            <DropZone
              parentId={null}
              insertIndex={insertOffset + i + 1}
              onDrop={onDrop}
              isActive={isDragging}
            />
          </React.Fragment>
        ))
      )}
    </div>
  );
};
