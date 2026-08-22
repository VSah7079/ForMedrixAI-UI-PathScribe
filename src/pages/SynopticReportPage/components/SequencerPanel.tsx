import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '@/pathscribe.css';
import type { Case } from '@/types/case/Case';

interface SequencerPanelProps {
  show:                   boolean;
  onClose:                () => void;
  onSave?:                (specimenOrder: string[], synopticOrders: Record<string, string[]>) => void;
  caseData:               Case | null;
  activeReportInstanceId: string | null;
  onSelectReport:         (instanceId: string, specimenId: string, reportType?: 'grossing' | 'synoptic') => void;
}

interface SpecimenRow {
  specimenId:   string;
  label:        string;
  description:  string;
  synoptics:    SynRow[];
}

interface SynRow {
  instanceId:  string;
  specimenId:  string;
  templateName:string;
  status:      string;
  filledCount: number;
  totalCount:  number;
  answers:     Record<string, unknown>;
  fieldLabels: Record<string, string>;
  fieldOrder:  string[];
}

const statusColor = (s: string) =>
  s === 'finalized' ? '#10b981' : s === 'in-progress' ? '#0891B2' : '#64748b';

const SequencerPanel: React.FC<SequencerPanelProps> = ({
  show, onClose, onSave, caseData, activeReportInstanceId, onSelectReport,
}) => {
  const [specimenOrder,     setSpecimenOrder]     = useState<string[]>([]);
  const [synopticOrders,    setSynopticOrders]     = useState<Record<string, string[]>>({});
  const [expandedSpecimens, setExpandedSpecimens]  = useState<Set<string>>(new Set());
  const [dragSrc,           setDragSrc]            = useState<{ level: 'specimen' | 'synoptic'; id: string; parentId?: string } | null>(null);
  const [isDirty,           setIsDirty]            = useState(false);

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (show) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, onClose]);

  const rows: SpecimenRow[] = useMemo(() => {
    if (!caseData) return [];
    const specimens = caseData.specimens ?? [];
    const reports   = (caseData as any).synopticReports ?? [];

    return specimens.map(sp => {
      const syns: SynRow[] = reports
        .filter((r: any) => r.specimenId === sp.id)
        .map((r: any) => ({
          instanceId:   r.instanceId,
          specimenId:   sp.id,
          templateName: r.templateName ?? r.title ?? 'Unnamed',
          status:       r.status ?? 'draft',
          filledCount:  Object.values(r.answers ?? {}).filter(v => v !== '' && v !== null && v !== undefined).length,
          totalCount:   (r.fieldOrder ?? Object.keys(r.answers ?? {})).length,
          answers:      r.answers ?? {},
          fieldLabels:  r.fieldLabels ?? {},
          fieldOrder:   r.fieldOrder ?? Object.keys(r.answers ?? {}),
        }));

      return {
        specimenId:   sp.id,
        label:        sp.label ?? sp.id,
        description:  sp.description ?? '',
        synoptics:    syns,
      };
    });
  }, [caseData]);

  // Initialise orders from rows
  useEffect(() => {
    if (show && rows.length) {
      const spOrder = rows.map(r => r.specimenId);
      const orders: Record<string, string[]> = {};
      rows.forEach(r => { orders[r.specimenId] = r.synoptics.map(s => s.instanceId); });
      setSpecimenOrder(spOrder);
      setSynopticOrders(orders);
      setExpandedSpecimens(new Set(rows.map(r => r.specimenId)));
      setIsDirty(false);
    }
  }, [show, rows]);

  const orderedRows = useMemo(
    () => specimenOrder.map(id => rows.find(r => r.specimenId === id)).filter(Boolean) as SpecimenRow[],
    [specimenOrder, rows]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedSpecimens(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Drag & drop helpers
  const onDragStartSp = (e: React.DragEvent, id: string) => {
    setDragSrc({ level: 'specimen', id });
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragStartSyn = (e: React.DragEvent, id: string, parentId: string) => {
    e.stopPropagation();
    setDragSrc({ level: 'synoptic', id, parentId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropSp = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragSrc || dragSrc.level !== 'specimen' || dragSrc.id === targetId) return;
    setSpecimenOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(dragSrc.id);
      const to   = next.indexOf(targetId);
      next.splice(from, 1);
      next.splice(to, 0, dragSrc.id);
      return next;
    });
    setIsDirty(true);
    setDragSrc(null);
  };

  const onDropSyn = (e: React.DragEvent, targetId: string, parentId: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragSrc || dragSrc.level !== 'synoptic' || dragSrc.parentId !== parentId || dragSrc.id === targetId) return;
    setSynopticOrders(prev => {
      const order = [...(prev[parentId] ?? [])];
      const from  = order.indexOf(dragSrc.id);
      const to    = order.indexOf(targetId);
      order.splice(from, 1);
      order.splice(to, 0, dragSrc.id);
      return { ...prev, [parentId]: order };
    });
    setIsDirty(true);
    setDragSrc(null);
  };

  if (!show) return null;

  const accession = (caseData as any)?.accession?.fullAccession ?? caseData?.id ?? '';

  return (
    <div className="ps-seq-overlay" onClick={onClose}>
      <div className="ps-seq-shell" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ps-seq-header">
          <div className="ps-seq-header-left">
            <div className="ps-seq-header-title-row">
              <h2 className="fm-title ps-seq-title">Report Sequencer</h2>
              {accession && <span className="ps-seq-case-badge" data-phi="accession">{accession}</span>}
            </div>
            <div className="ps-seq-subtitle">
              Drag specimens or synoptics to set transmission order · Click a row to jump to it
            </div>
          </div>
          <div className="ps-seq-header-right">
            <button className="ps-research-close" onClick={onClose} aria-label="Close sequencer">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="ps-seq-body">

          {/* LEFT — reorder panel */}
          <div className="ps-seq-left">
            {orderedRows.length === 0 ? (
              <div className="ps-seq-empty">No specimens on this case.</div>
            ) : orderedRows.map((row, ri) => {
              const isExpanded = expandedSpecimens.has(row.specimenId);
              const orderedSyns = (synopticOrders[row.specimenId] ?? [])
                .map(id => row.synoptics.find(s => s.instanceId === id))
                .filter(Boolean) as SynRow[];

              return (
                <div
                  key={row.specimenId}
                  className="ps-seq-specimen-card"
                  draggable
                  onDragStart={e => onDragStartSp(e, row.specimenId)}
                  onDragOver={e => { if (dragSrc?.level === 'specimen') e.preventDefault(); }}
                  onDrop={e => onDropSp(e, row.specimenId)}
                  onDragEnd={() => setDragSrc(null)}
                >
                  <div className="ps-seq-specimen-header" onClick={() => toggleExpand(row.specimenId)}>
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="#475569" aria-hidden="true" className="ps-seq-drag-handle">
                      <circle cx="3.5" cy="3" r="1.2"/><circle cx="8.5" cy="3" r="1.2"/>
                      <circle cx="3.5" cy="7" r="1.2"/><circle cx="8.5" cy="7" r="1.2"/>
                      <circle cx="3.5" cy="11" r="1.2"/><circle cx="8.5" cy="11" r="1.2"/>
                    </svg>
                    <span className="ps-seq-specimen-num">{ri + 1}</span>
                    <span className="ps-seq-specimen-label">{row.label}:</span>
                    <span className="ps-seq-specimen-desc">{row.description}</span>
                    <span className="ps-seq-specimen-count">{row.synoptics.length} synoptic{row.synoptics.length !== 1 ? 's' : ''}</span>
                    <span className={`ps-seq-expand-arrow${isExpanded ? ' ps-seq-expand-arrow--open' : ''}`}>▶</span>
                  </div>

                  {isExpanded && (
                    <div className="ps-seq-synoptics">
                      {orderedSyns.map((syn, si) => {
                        const isActive = syn.instanceId === activeReportInstanceId;
                        const pct = syn.totalCount > 0 ? Math.round((syn.filledCount / syn.totalCount) * 100) : 0;

                        return (
                          <div
                            key={syn.instanceId}
                            className={`ps-seq-syn-row${isActive ? ' ps-seq-syn-row--active' : ''}`}
                            draggable
                            onDragStart={e => onDragStartSyn(e, syn.instanceId, row.specimenId)}
                            onDragOver={e => { if (dragSrc?.level === 'synoptic' && dragSrc.parentId === row.specimenId) e.preventDefault(); }}
                            onDrop={e => onDropSyn(e, syn.instanceId, row.specimenId)}
                            onDragEnd={() => setDragSrc(null)}
                            onClick={() => onSelectReport(syn.instanceId, row.specimenId)}
                          >
                            <svg width="10" height="12" viewBox="0 0 12 14" fill="#475569" aria-hidden="true" className="ps-seq-drag-handle">
                              <circle cx="3.5" cy="3" r="1.2"/><circle cx="8.5" cy="3" r="1.2"/>
                              <circle cx="3.5" cy="7" r="1.2"/><circle cx="8.5" cy="7" r="1.2"/>
                              <circle cx="3.5" cy="11" r="1.2"/><circle cx="8.5" cy="11" r="1.2"/>
                            </svg>
                            <span className="ps-seq-syn-num">{si + 1}.</span>
                            <span className={`ps-seq-syn-name${isActive ? ' ps-seq-syn-name--active' : ' ps-seq-syn-name--default'}`}>
                              {syn.templateName}
                            </span>
                            <span className="ps-seq-syn-status" style={{ color: statusColor(syn.status) }}>{syn.status}</span>
                            <span className="ps-seq-syn-progress">{syn.filledCount}/{syn.totalCount}</span>
                            <div style={{ width: 36, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : '#0891B2', borderRadius: 99 }} />
                            </div>
                            {isActive && <span className="ps-seq-syn-active-badge">active</span>}
                          </div>
                        );
                      })}

                      {orderedSyns.length === 0 && (
                        <div className="ps-seq-syn-no-fields">No synoptics for this specimen</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="ps-seq-hint">
              <p>The order shown here determines how specimens appear in the generated report. Synoptic values remain unchanged — only their presentation sequence is affected. Click any synoptic row to jump to it in the editor.</p>
            </div>
          </div>

          {/* RIGHT — preview panel */}
          <div className="ps-seq-right">
            <PreviewPane
              rows={orderedRows}
              synopticOrders={synopticOrders}
              activeReportInstanceId={activeReportInstanceId}
              onSelectReport={onSelectReport}
              onClose={onClose}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="ps-seq-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>Cancel</button>
          {onSave && (
            <button className="ps-btn-primary" onClick={() => { onSave(specimenOrder, synopticOrders); onClose(); }} disabled={!isDirty}>
              Save Sequence
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

// ── Preview pane ──────────────────────────────────────────────────────────────

const PreviewPane: React.FC<{
  rows: SpecimenRow[];
  synopticOrders: Record<string, string[]>;
  activeReportInstanceId: string | null;
  onSelectReport: (instanceId: string, specimenId: string, reportType?: 'grossing' | 'synoptic') => void;
  onClose: () => void;
}> = ({ rows, synopticOrders, activeReportInstanceId, onSelectReport }) => {
  const [expandedSynoptics, setExpandedSynoptics] = useState<Set<string>>(new Set());
  if (rows.length === 0) return <div className="ps-seq-empty">No report preview available.</div>;

  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.join(', ') || '—';
    return String(v);
  };

  return (
    <div>
      {rows.map(row => {
        const ordered = (synopticOrders[row.specimenId] ?? [])
          .map(id => row.synoptics.find(s => s.instanceId === id))
          .filter(Boolean) as SynRow[];

        return (
          <div key={row.specimenId} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Specimen {row.label} — {row.description}
            </div>
            {ordered.map(syn => {
              const isActive = syn.instanceId === activeReportInstanceId;
              const answeredFields = syn.fieldOrder
                .filter(k => { const v = syn.answers[k]; return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0); })
                .map(k => ({ label: syn.fieldLabels[k] ?? k, value: fmt(syn.answers[k]) }));

              const isExpanded = expandedSynoptics.has(syn.instanceId);
              const visibleFields = isExpanded ? answeredFields : answeredFields.slice(0, 6);
              const overflow = isExpanded ? 0 : Math.max(0, answeredFields.length - 6);

              return (
                <div
                  key={syn.instanceId}
                  onClick={() => onSelectReport(syn.instanceId, row.specimenId)}
                  style={{ marginBottom: 12, padding: '12px 14px', background: isActive ? 'rgba(8,145,178,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isActive ? 'rgba(8,145,178,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 8, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {syn.templateName}
                    {isActive && <span className="ps-seq-syn-active-badge">active</span>}
                  </div>
                  {answeredFields.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>No fields completed yet</div>
                  ) : (
                    visibleFields.map(({ label, value }) => (
                      <div key={label} className="ps-seq-field-row">
                        <span className="ps-seq-field-label">{label}</span>
                        <span className="ps-seq-field-value">{value}</span>
                      </div>
                    ))
                  )}
                  {overflow > 0 && (
                    <div
                      className="ps-seq-overflow-link"
                      onClick={e => {
                        e.stopPropagation();
                        setExpandedSynoptics(prev => new Set(prev).add(syn.instanceId));
                      }}
                    >
                      +{overflow} more field{overflow !== 1 ? 's' : ''}
                    </div>
                  )}
                  {isExpanded && answeredFields.length > 6 && (
                    <div
                      className="ps-seq-collapse-link"
                      onClick={e => {
                        e.stopPropagation();
                        setExpandedSynoptics(prev => { const next = new Set(prev); next.delete(syn.instanceId); return next; });
                      }}
                    >
                      Show less
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};



export default SequencerPanel;
