// src/components/TemplateBuilder/PartBuilderPage.tsx
// ─────────────────────────────────────────────────────────────
// Full-screen editor for a single ReportPart.
// Reuses TemplateCanvas, TemplateInspector, and TemplatePalette
// exactly as-is — they operate on TemplateNode[] regardless of
// whether they're inside a Part or an old-style Template.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ReportPart, ReportPartType } from '../../types/reportPart';
import type { TemplateNode } from '../../types/template';
import { TemplatePalette }   from './TemplatePalette';
import { TemplateCanvas, updateNode } from './TemplateCanvas';
import { TemplateInspector } from './TemplateInspector';
import { mockReportPartService } from '../../services/reportParts/mockReportPartService';
import { getActivePerformingLabs } from '../../utils/performingLabs';
import type { Facility } from '../../services/facilities/IFacilityService';

const svc = mockReportPartService;

// ── Type config ────────────────────────────────────────────────

const TYPE_CONFIG: Record<ReportPartType, { icon: string }> = {
  header: { icon: '▲' },
  footer: { icon: '▼' },
  body:   { icon: '▬' },
};

// Real, persisted ReportPartType enum values stay as data; only the
// displayed label is translated (this sweep's usual LABEL_KEY pattern).
const TYPE_LABEL_KEY: Record<ReportPartType, string> = {
  header: 'partBuilderPage.type.header',
  footer: 'partBuilderPage.type.footer',
  body:   'partBuilderPage.type.body',
};

// ── Save state ─────────────────────────────────────────────────

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

// ── Main page ──────────────────────────────────────────────────

const PartBuilderPage: React.FC = () => {
  const { t } = useTranslation();
  const { partId } = useParams<{ partId: string }>();
  const navigate   = useNavigate();

  const [part, setPart]         = useState<ReportPart | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [labs, setLabs] = useState<Facility[]>([]);
  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ───────────────────────────────────────────────────

  useEffect(() => {
    if (!partId || partId === 'new') {
      // Blank part — start with a picker
      setLoading(false);
      return;
    }
    svc.getById(partId).then(r => {
      if (r.ok) setPart(r.data);
      setLoading(false);
    });
  }, [partId]);

  // ── Auto-save ──────────────────────────────────────────────

  useEffect(() => {
    if (saveState !== 'unsaved' || !part) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaveState('saving');
      const isNew = !partId || partId === 'new';
      const r = isNew
        ? await svc.create(part)
        : await svc.save(part);
      if (r.ok) {
        setPart(r.data);
        setSaveState('saved');
        if (isNew) navigate(`/admin/parts/${r.data.id}/edit`, { replace: true });
      } else {
        setSaveState('error');
      }
    }, 1000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [saveState, part, partId, navigate]);

  const markUnsaved = useCallback((updated: ReportPart) => {
    setPart(updated);
    setSaveState('unsaved');
  }, []);

  // ── Node operations ────────────────────────────────────────

  const handleNodesChange = useCallback((nodes: TemplateNode[]) => {
    if (!part) return;
    markUnsaved({ ...part, nodes });
  }, [part, markUnsaved]);

  const handleNodeUpdate = useCallback((updated: TemplateNode) => {
    if (!part) return;
    const nodes = updateNode(part.nodes, updated.id, () => updated);
    markUnsaved({ ...part, nodes });
  }, [part, markUnsaved]);

  const selectedNode = selectedId && part
    ? findNode(part.nodes, selectedId)
    : null;

  // ── New part type picker ───────────────────────────────────

  if (!loading && !part && (!partId || partId === 'new')) {
    return <NewPartTypePicker onPick={type => {
      const blank: ReportPart = {
        id: crypto.randomUUID(), name: t('partBuilderPage.defaultNewPartName', { typeLabel: t(TYPE_LABEL_KEY[type]) }),
        partType: type, specialty: 'General', status: 'draft',
        nodes: [], institutionId: '', createdBy: 'current-user',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        version: '1.0.0',
      };
      setPart(blank);
      setSaveState('unsaved');
    }} onBack={() => navigate(-1)} />;
  }

  if (loading) return (
    <div className="ps-partb-loading">
      {t('partBuilderPage.loadingPart')}
    </div>
  );

  if (!part) return (
    <div className="ps-partb-loading ps-partb-loading--error">
      {t('partBuilderPage.partNotFound')}
    </div>
  );

  const tc = TYPE_CONFIG[part.partType];

  return (
    <div className="ps-partb-root">
      {/* ── Topbar ── */}
      <header className="ps-partb-topbar">
        <div className="ps-partb-top-left">
          <button onClick={() => navigate(-1)} className="ps-partb-back-btn">←</button>
          <div className={`ps-partb-type-chip ps-partb-type-chip--${part.partType}`}>
            {tc.icon}
          </div>
          <div className="ps-partb-name-block">
            <input
              value={part.name}
              onChange={e => markUnsaved({ ...part, name: e.target.value })}
              className="ps-partb-name-input"
            />
            <div className="ps-partb-name-sub">
              {t(TYPE_LABEL_KEY[part.partType])} · {part.specialty}
            </div>
          </div>
        </div>

        <div className="ps-partb-top-right">
          <span className="ps-partb-save-indicator">
            {saveState === 'saving' ? `⟳ ${t('partBuilderPage.saveState.saving')}`
              : saveState === 'saved' ? `✓ ${t('partBuilderPage.saveState.saved')}`
              : saveState === 'unsaved' ? `● ${t('partBuilderPage.saveState.unsaved')}`
              : `✕ ${t('partBuilderPage.saveState.error')}`}
          </span>
          <button
            onClick={() => setShowGrid(g => !g)}
            className={`ps-partb-btn${showGrid ? ' ps-partb-btn--grid-on' : ''}`}
          >
            ⊞ {showGrid ? t('partBuilderPage.gridOn') : t('partBuilderPage.gridOff')}
          </button>
          <button onClick={() => setMetaOpen(o => !o)} className="ps-partb-btn">
            {t('partBuilderPage.settingsButton')}
          </button>
          <button
            onClick={async () => {
              const r = await svc.publish(part.id);
              if (r.ok) setPart(r.data);
            }}
            disabled={part.status === 'published'}
            className={`ps-partb-btn${part.status === 'published' ? ' ps-partb-btn--published' : ' ps-partb-btn--publish'}`}
          >
            {part.status === 'published' ? t('partBuilderPage.publishedButton') : t('partBuilderPage.publishButton')}
          </button>
        </div>
      </header>

      {/* ── Settings panel ── */}
      {metaOpen && (
        <div className="ps-partb-meta-panel">
          <div className="ps-partb-meta-grid">
            {(['header','body','footer'] as ReportPartType[]).map(type => (
              <label key={type} className="ps-partb-meta-radio">
                <input type="radio" name="partType" value={type} checked={part.partType === type}
                  onChange={() => markUnsaved({ ...part, partType: type })} />
                <span className="ps-partb-meta-radio-label">
                  {TYPE_CONFIG[type].icon} {t(TYPE_LABEL_KEY[type])}
                </span>
              </label>
            ))}
            <div>
              <div className="ps-partb-meta-label">{t('partBuilderPage.specialtyLabel')}</div>
              <input value={part.specialty} onChange={e => markUnsaved({ ...part, specialty: e.target.value })}
                placeholder={t('partBuilderPage.specialtyPlaceholder')} className="ps-partb-meta-input" />
            </div>
            <div>
              <div className="ps-partb-meta-label">{t('partBuilderPage.descriptionLabel')}</div>
              <input value={part.description ?? ''} onChange={e => markUnsaved({ ...part, description: e.target.value })}
                placeholder={t('partBuilderPage.descriptionPlaceholder')} className="ps-partb-meta-input" />
            </div>
            <div>
              <div className="ps-partb-meta-label">{t('partBuilderPage.standardLabel')}</div>
              {/* CAP/RCPath are fixed governing-body vocabulary, kept
                  literal per this app's established convention. */}
              <select value={part.standard ?? ''} onChange={e => markUnsaved({ ...part, standard: e.target.value as ReportPart['standard'] })}
                className="ps-partb-meta-select">
                <option value="">{t('partBuilderPage.standardNone')}</option>
                <option value="CAP">CAP</option>
                <option value="RCPath">RCPath</option>
                <option value="custom">{t('partBuilderPage.standardCustom')}</option>
              </select>
            </div>
            <div>
              <div className="ps-partb-meta-label">{t('partBuilderPage.performingLabLabel')}</div>
              <select value={part.performingLabFacilityId ?? ''} onChange={e => markUnsaved({ ...part, performingLabFacilityId: e.target.value || undefined })}
                className="ps-partb-meta-select">
                <option value="">{t('partBuilderPage.performingLabGlobalOption')}</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── 3-panel layout ── */}
      <div className="ps-partb-body">
        <TemplatePalette />

        <div className="ps-partb-canvas-wrapper">
          <div className="ps-partb-canvas-toolbar">
            <span className="ps-partb-canvas-count">
              {t('partBuilderPage.componentCount', { count: countNodes(part.nodes) })}
            </span>
            {selectedId && (
              <button onClick={() => setSelectedId(null)}
                className="ps-partb-clear-selection">
                {t('partBuilderPage.clearSelection')}
              </button>
            )}
          </div>
          <TemplateCanvas
            nodes={part.nodes}
            selectedId={selectedId}
            onSelect={id => setSelectedId(id || null)}
            onChange={handleNodesChange}
            showGrid={showGrid}
            partType={part.partType}
          />
        </div>

        <TemplateInspector node={selectedNode} onUpdate={handleNodeUpdate} />
      </div>
    </div>
  );
};

// ── New part type picker ───────────────────────────────────────

const NewPartTypePicker: React.FC<{
  onPick: (type: ReportPartType) => void;
  onBack: () => void;
}> = ({ onPick, onBack }) => {
  const { t } = useTranslation();
  const descriptionKey: Record<ReportPartType, string> = {
    header: 'partBuilderPage.picker.description.header',
    body:   'partBuilderPage.picker.description.body',
    footer: 'partBuilderPage.picker.description.footer',
  };
  return (
    <div className="ps-partb-picker-shell">
      <div className="ps-partb-picker-intro">
        <div className="ps-partb-picker-title">
          {t('partBuilderPage.picker.title')}
        </div>
        <div className="ps-partb-picker-sub">
          {t('partBuilderPage.picker.subtitle')}
        </div>
      </div>
      <div className="ps-partb-picker-cards">
        {(['header', 'body', 'footer'] as ReportPartType[]).map(type => {
          const tc = TYPE_CONFIG[type];
          return (
            <button key={type} onClick={() => onPick(type)}
              className={`ps-partb-picker-card ps-partb-picker-card--${type}`}
            >
              <div className={`ps-partb-picker-card-icon ps-partb-picker-card-icon--${type}`}>{tc.icon}</div>
              <div className="ps-partb-picker-card-title">
                {t(TYPE_LABEL_KEY[type])}
              </div>
              <div className="ps-partb-picker-card-desc">
                {t(descriptionKey[type])}
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={onBack} className="ps-partb-picker-back">
        ← {t('common.back')}
      </button>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────

function findNode(nodes: TemplateNode[], id: string): TemplateNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const children = 'children' in n ? (n as { children: TemplateNode[] }).children : [];
    if (children.length > 0) { const f = findNode(children, id); if (f) return f; }
  }
  return null;
}

function countNodes(nodes: TemplateNode[]): number {
  let c = nodes.length;
  for (const n of nodes) {
    if ('children' in n && Array.isArray((n as { children: TemplateNode[] }).children))
      c += countNodes((n as { children: TemplateNode[] }).children);
  }
  return c;
}

export default PartBuilderPage;
