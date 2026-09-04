/**
 * AllProtocolsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the complete protocol library across all lifecycle states.
 * Consumed by index.tsx (ProtocolsTab).
 *
 * Adds a status filter pill-bar (All / Draft / In Review / Needs Changes /
 * Approved / Published) above the grouped list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { useNavigate } from 'react-router-dom';
import {
  Protocol,
  useProtocols,
  LifecycleState,
  LIFECYCLE_STYLES,
  SOURCE_STYLES,
  CATEGORY_COLORS,
  LIFECYCLE_ORDER,
  LifecycleBadge,
  CoverageBar,
  UploadProtocolModal,
  BuildCustomiseModal,
} from './protocolShared';
import {
  ActionBtn,
  OutlineBtn,
  TealBtn,
  SearchBar,
  CategoryGroup,
  EmptyState,
} from './ActiveProtocolsSection';

type StatusFilter = 'all' | LifecycleState;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all',           label: 'All'           },
  { id: 'published',     label: 'Published'     },
  { id: 'approved',      label: 'Approved'      },
  { id: 'in_review',     label: 'In Review'     },
  { id: 'needs_changes', label: 'Needs Changes' },
  { id: 'draft',         label: 'Draft'         },
];

// ─── ProtocolCard (all-protocols variant — shows both reviewer + editor) ──────

const ProtocolCard: React.FC<{ protocol: Protocol }> = ({ protocol: p }) => {
  const navigate        = useNavigate();
  const [open, setOpen] = useState(false);
  const catColor        = CATEGORY_COLORS[p.category] ?? '#64748b';
  const srcStyle        = SOURCE_STYLES[p.source]     ?? SOURCE_STYLES.Custom;

  const stepIndex = LIFECYCLE_ORDER.indexOf(
    p.status === 'needs_changes' ? 'in_review' : p.status
  );

  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
          background: open ? '#1a2744' : '#1e293b',
          border: `1px solid ${open ? 'rgba(8,145,178,0.3)' : '#334155'}`,
          borderRadius: open ? '10px 10px 0 0' : '10px',
          cursor: 'pointer', transition: 'all 0.12s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = '#243050'; e.currentTarget.style.borderColor = '#475569'; }}}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.borderColor = '#334155'; }}}
      >
        <div style={{ width: '3px', height: '36px', borderRadius: '2px', background: catColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px' }} data-phi="name">{p.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{p.version}</span>
            <span style={{ color: '#334155' }}>&bull;</span>
            <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', padding: '1px 7px', borderRadius: '4px', background: srcStyle.bg, color: srcStyle.color }}>{p.source}</span>
            <span style={{ color: '#334155' }}>&bull;</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{p.type}</span>
            <span style={{ color: '#334155' }}>&bull;</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{p.owner}</span>
          </div>
        </div>
        <LifecycleBadge state={p.status} />
        <span style={{ fontSize: '16px', color: '#475569', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', marginLeft: '4px', flexShrink: 0 }}>›</span>
      </div>

      {open && (
        <div style={{ background: '#131c30', border: '1px solid rgba(8,145,178,0.2)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px 20px 18px' }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid #1e293b' }}>
            {[
              { label: 'Sections',      value: Math.max(1, Math.round(p.fields / 7)) },
              { label: 'Fields',        value: p.fields },
              { label: 'Last Modified', value: p.lastModified },
              { label: 'Owner',         value: p.owner },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '16px', flex: 1, minWidth: '220px', alignItems: 'flex-end' }}>
              <CoverageBar pct={p.snomedPct} label="SNOMED CT" />
              <CoverageBar pct={p.icdPct}    label="ICD-10/11" />
            </div>
          </div>

          {/* Review note */}
          {p.reviewNote && (
            <div style={{ padding: '9px 13px', marginBottom: '14px', borderRadius: '7px', background: p.status === 'needs_changes' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${p.status === 'needs_changes' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, fontSize: '12px', color: p.status === 'needs_changes' ? '#f87171' : '#fbbf24', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0 }}>{p.status === 'needs_changes' ? '↩️' : '⚠️'}</span>
              {p.reviewNote}
            </div>
          )}

          {/* Lifecycle tracker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
            {LIFECYCLE_ORDER.map((s, i) => {
              const sStyle = LIFECYCLE_STYLES[s];
              const isCurrent = i === stepIndex;
              const isPast    = i < stepIndex;
              return (
                <React.Fragment key={s}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, flexShrink: 0, background: isPast ? 'rgba(16,185,129,0.2)' : isCurrent ? sStyle.bg : '#1e293b', color: isPast ? '#10B981' : isCurrent ? sStyle.color : '#334155', border: `1px solid ${isPast ? 'rgba(16,185,129,0.4)' : isCurrent ? sStyle.border : '#334155'}` }}>
                      {isPast ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? sStyle.color : isPast ? '#475569' : '#334155', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{s.replace('_', ' ')}</span>
                  </div>
                  {i < LIFECYCLE_ORDER.length - 1 && <span style={{ color: '#64748b', fontSize: '12px', flexShrink: 0 }}>—</span>}
                </React.Fragment>
              );
            })}
            {p.status === 'needs_changes' && (
              <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>↩ Needs Changes</span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {p.status === 'published'
              ? <ActionBtn color="#38bdf8" bg="rgba(56,189,248,0.1)" border="rgba(56,189,248,0.25)" onClick={() => navigate(`/template-review/${p.id}`)}>👁 View Protocol</ActionBtn>
              : <ActionBtn color="#0891B2" bg="rgba(8,145,178,0.15)" border="rgba(8,145,178,0.35)" onClick={() => navigate(`/template-review/${p.id}`)}>🔍 Open Reviewer</ActionBtn>
            }
            {p.status !== 'published' && <ActionBtn onClick={() => navigate(`/template-editor/${p.id}?from=all`)}>✏️ Open Editor</ActionBtn>}
            <ActionBtn onClick={() => {}}>📋 Duplicate</ActionBtn>
            <ActionBtn onClick={() => {}}>{'{ }'} Export JSON</ActionBtn>
            {p.status === 'published' && <ActionBtn onClick={() => {}}>🔁 New Version</ActionBtn>}
            <ActionBtn danger onClick={() => {}}>🗑 Archive</ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const AllProtocolsSection: React.FC = () => {
  const navigate                          = useNavigate();
  const [search,       setSearch]         = useState('');
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showBuild,  setShowBuild]  = useState(false);

  const allProtocols = useProtocols();
  const filtered = allProtocols.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.source.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const grouped = filtered.reduce<Record<string, Protocol[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>📚 All Protocols</div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Complete library of all templates across all lifecycle states.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
          <OutlineBtn onClick={() => setShowUpload(true)}>📤 Upload Protocol</OutlineBtn>
          <TealBtn    onClick={() => setShowBuild(true)}>🔬 Build / Customise</TealBtn>
        </div>
      </div>

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {STATUS_FILTERS.map(f => {
          const active   = statusFilter === f.id;
          const lcStyle  = f.id !== 'all' ? LIFECYCLE_STYLES[f.id as LifecycleState] : null;
          const count    = f.id === 'all' ? allProtocols.length : allProtocols.filter(p => p.status === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
                background: active ? (lcStyle ? lcStyle.bg : 'rgba(8,145,178,0.15)') : 'rgba(255,255,255,0.04)',
                color:      active ? (lcStyle ? lcStyle.color : '#0891B2') : '#64748b',
                border:     `1px solid ${active ? (lcStyle ? lcStyle.border : 'rgba(8,145,178,0.3)') : '#334155'}`,
              }}
            >
              {f.label} <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Groups */}
      {Object.entries(grouped).map(([cat, items]) => (
        <CategoryGroup key={cat} category={cat} count={items.length}>
          {items.map(p => <ProtocolCard key={p.id} protocol={p} />)}
        </CategoryGroup>
      ))}

      {filtered.length === 0 && <EmptyState search={search} />}

      {showUpload && <UploadProtocolModal onClose={() => setShowUpload(false)} />}
      {showBuild && (
        <BuildCustomiseModal
          onClose={() => setShowBuild(false)}
          onBuildBlank={() => { setShowBuild(false); navigate('/template-editor/new'); }}
          onBuildFromTemplate={id => { setShowBuild(false); navigate(`/template-editor/${id}?mode=duplicate&from=all`); }}
        />
      )}
    </div>
  );
};

export default AllProtocolsSection;
