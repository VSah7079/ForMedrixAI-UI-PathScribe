// src/pages/SynopticReportPage/components/AddSynopticModal.tsx
// Two-panel Flag Manager style modal for adding synoptic reports.

import React, { useState, useEffect, useRef } from 'react';
import { TemplateRequestModal } from '@/components/TemplateRequest/TemplateRequestModal';
import type { Case, SynopticReportInstance } from '@/types/case/Case';
import { suggestSynopticTemplates } from '@/services/templateSuggestions/synopticTemplateSuggestionService';
import { templateSuggestionSignalService } from '@/services';
import type { SynopticTemplateSuggestion } from '@/services/templateSuggestions/ISynopticTemplateSuggestionService';

interface Protocol {
  id:   string;
  name: string;
  source?: string;
  category?: string;
}

interface AddSynopticModalProps {
  caseData:            Case | null;
  availableProtocols:  Protocol[];
  onClose:             () => void;
  onAdd:               (instances: SynopticReportInstance[], updatedCase: Case) => void;
}

const AddSynopticModal: React.FC<AddSynopticModalProps> = ({
  caseData,
  availableProtocols,
  onClose,
  onAdd,
}) => {
  const [selectedSpecimenIds, setSelectedSpecimenIds] = useState<string[]>([]);
  const [selectedProtocol,    setSelectedProtocol]    = useState('');
  const [protocolSearch,      setProtocolSearch]      = useState('');
  const [learnPairing,        setLearnPairing]        = useState(true);
  const [showRequestModal,    setShowRequestModal]    = useState(false);
  const [suggestions,         setSuggestions]         = useState<SynopticTemplateSuggestion[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const specimens      = caseData?.specimens ?? [];
  const existingReports = caseData?.synopticReports ?? [];

  // Fetch AI template suggestions once, on open — real callAi() call,
  // confidence-scored, matching on specimen description text since the
  // structured Specimen Dictionary link (sp._entry?.type/site) is only
  // populated transiently during accession and isn't persisted onto the
  // case's own Specimen records. A suggestion here is advisory only —
  // it's surfaced as a badge in the protocol list, never auto-selected.
  useEffect(() => {
    if (specimens.length === 0 || availableProtocols.length === 0) return;
    let cancelled = false;
    suggestSynopticTemplates({
      specimens: specimens.map(sp => ({
        specimenId: sp.id,
        specimenLabel: sp.label,
        specimenDesc: sp.description,
      })),
      availableTemplates: availableProtocols.map(p => ({
        id: p.id, name: p.name, category: p.category ?? 'Other',
      })),
      clientId: caseData?.order?.clientId,
    }).then(result => {
      if (!cancelled) setSuggestions(result.suggestions);
    }).catch(() => { /* suggestion fetch failing must never block manual selection */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.id]);

  // Auto-focus search on open
  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 100); }, []);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const filteredProtocols = availableProtocols.filter(p =>
    !protocolSearch.trim() ||
    p.name.toLowerCase().includes(protocolSearch.toLowerCase()) ||
    (p.source ?? '').toLowerCase().includes(protocolSearch.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(protocolSearch.toLowerCase())
  );

  const selectedProtocolObj = availableProtocols.find(p => p.id === selectedProtocol);

  // Highest-confidence suggestion among the currently selected specimens,
  // for the currently visible protocol list — advisory badge only.
  const suggestionForTemplate = (templateId: string) =>
    suggestions.find(s => s.templateId === templateId && selectedSpecimenIds.includes(s.specimenId));

  const toggleSpecimen = (id: string) => {
    setSelectedSpecimenIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const canAdd = selectedSpecimenIds.length > 0 && !!selectedProtocol;

  const handleAdd = () => {
    if (!caseData || !canAdd) return;
    const now  = new Date().toISOString();
    const name = selectedProtocolObj?.name ?? selectedProtocol;

    // Migrate legacy if needed
    const base: SynopticReportInstance[] = existingReports.length > 0
      ? [...existingReports]
      : caseData.synopticTemplateId
        ? [{
            instanceId:   `legacy_${caseData.synopticTemplateId}`,
            specimenId:   specimens[0]?.id ?? '',
            templateId:   caseData.synopticTemplateId,
            templateName: availableProtocols.find(p => p.id === caseData.synopticTemplateId)?.name
              ?? caseData.synopticTemplateId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            answers:   caseData.synopticAnswers ?? {},
            status:    'draft' as const,
            createdAt: now,
            updatedAt: now,
          }]
        : [];

    const newInstances: SynopticReportInstance[] = selectedSpecimenIds.map(specId => ({
      instanceId:   `${specId}_${selectedProtocol}_${Date.now()}`,
      specimenId:   specId,
      templateId:   selectedProtocol,
      templateName: name,
      answers:      {},
      status:       'draft' as const,
      createdAt:    now,
      updatedAt:    now,
    }));

    const updatedCase: Case = {
      ...caseData,
      synopticReports:   [...base, ...newInstances],
      synopticTemplateId: undefined,
      synopticAnswers:    undefined,
    };

    onAdd(newInstances, updatedCase);

    // Wire "Learn this pairing" to something real. Previously this
    // checkbox toggled its own color and nothing else — checked the
    // actual submit path directly and confirmed learnPairing was never
    // read anywhere beyond its own styling. Records one signal per
    // specimen, comparing the pathologist's actual choice against
    // whatever suggestion (if any) was shown for it.
    if (learnPairing && caseData) {
      for (const specId of selectedSpecimenIds) {
        const suggestion = suggestions.find(s => s.specimenId === specId);
        const outcome = !suggestion
          ? 'manual_no_suggestion'
          : suggestion.templateId === selectedProtocol
            ? 'accepted'
            : 'overridden';
        templateSuggestionSignalService.recordSignal({
          caseId: caseData.id,
          accessionNumber: caseData.accession?.accessionNumber ?? '',
          specimenId: specId,
          suggestedTemplateId: suggestion?.templateId,
          suggestedTemplateName: suggestion?.templateName,
          suggestedConfidence: suggestion?.confidence,
          chosenTemplateId: selectedProtocol,
          chosenTemplateName: name,
          outcome,
          subspecialtyId: (caseData as any)?.subspecialtyId,
        }).catch(() => { /* signal recording must never block adding the report itself */ });
      }
    }

    onClose();
  };

  // Badge for source
  const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
    if (!source) return null;
    const isRCPath = source === 'RCPath';
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
        background: isRCPath ? 'rgba(8,145,178,0.15)' : 'rgba(139,92,246,0.15)',
        color:      isRCPath ? '#38bdf8'               : '#a78bfa',
        border:    `1px solid ${isRCPath ? 'rgba(8,145,178,0.3)' : 'rgba(139,92,246,0.3)'}`,
        marginLeft: 6, flexShrink: 0,
      }}>
        {source}
      </span>
    );
  };

  return (
    <>
    <div className="ps-overlay" onClick={onClose}>
      <div
        className="ps-research-modal"
        style={{ width: 980, height: '80vh', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="ps-research-header">
          <div>
            <div className="fm-eyebrow">Synoptic Reporting</div>
            <div className="fm-title-row">
              <h2 className="fm-title">Add Synoptic Report</h2>
              {selectedSpecimenIds.length > 0 && (
                <span className="fm-active-badge">{selectedSpecimenIds.length} selected</span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: '2px 8px', lineHeight: 1, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >✕</button>
        </div>

        {/* ── Two-panel body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left — Specimens */}
          <div style={{
            width: 320, flexShrink: 0, borderRight: '1px solid rgba(51,65,85,0.9)',
            overflowY: 'auto', padding: '12px 0',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em',
              color: '#0891B2', padding: '4px 20px 10px',
            }}>
              Select Specimens
            </div>

            {specimens.map(spec => {
              const isSelected = selectedSpecimenIds.includes(spec.id);
              const hasReport  = existingReports.some(r => r.specimenId === spec.id);
              return (
                <div
                  key={spec.id}
                  onClick={() => toggleSpecimen(spec.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 20px', cursor: 'pointer',
                    background: isSelected ? 'rgba(8,145,178,0.12)' : 'transparent',
                    borderLeft: `3px solid ${isSelected ? '#0891B2' : 'transparent'}`,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    background: isSelected ? '#0891B2' : 'transparent',
                    border: `2px solid ${isSelected ? '#0891B2' : 'rgba(255,255,255,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}>
                    {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: '#e2e8f0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: '#38bdf8' }}>{spec.label}:</span>{' '}{spec.description}
                    </div>
                    {hasReport && (
                      <div style={{ fontSize: 10, color: '#10b981', marginTop: 2 }}>
                        ✓ Report exists
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right — Protocol search & selection */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Search */}
            <div style={{ padding: '14px 20px 0', borderBottom: '1px solid rgba(51,65,85,0.9)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 12,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={selectedProtocol ? (selectedProtocolObj?.name ?? '') : protocolSearch}
                  onChange={e => { setProtocolSearch(e.target.value); setSelectedProtocol(''); }}
                  placeholder="Search protocols by name, source, or organ…"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit',
                  }}
                />
                {(protocolSearch || selectedProtocol) && (
                  <button onClick={() => { setProtocolSearch(''); setSelectedProtocol(''); }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>
                    ×
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
                {['All', 'CAP', 'RCPath', 'BREAST', 'COLON', 'PROSTATE', 'LUNG'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => setProtocolSearch(tag === 'All' ? '' : tag)}
                    style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', border: '1px solid',
                      background: (tag === 'All' && !protocolSearch) || protocolSearch.toLowerCase() === tag.toLowerCase()
                        ? 'rgba(8,145,178,0.2)' : 'transparent',
                      borderColor: (tag === 'All' && !protocolSearch) || protocolSearch.toLowerCase() === tag.toLowerCase()
                        ? 'rgba(8,145,178,0.5)' : 'rgba(255,255,255,0.1)',
                      color: (tag === 'All' && !protocolSearch) || protocolSearch.toLowerCase() === tag.toLowerCase()
                        ? '#38bdf8' : '#64748b',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Protocol list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {filteredProtocols.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                  No protocols match your search
                </div>
              ) : filteredProtocols.map(p => {
                const isSelected = selectedProtocol === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProtocol(isSelected ? '' : p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 20px', cursor: 'pointer',
                      background: isSelected ? 'rgba(8,145,178,0.12)' : 'transparent',
                      borderLeft: `3px solid ${isSelected ? '#0891B2' : 'transparent'}`,
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(8,145,178,0.12)' : 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#e2e8f0' : '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-phi="name">{p.name}</span>
                      <SourceBadge source={p.source} />
                      {(() => {
                        const match = suggestionForTemplate(p.id);
                        if (!match) return null;
                        return (
                          <span
                            title={match.reason}
                            style={{
                              marginLeft: 8, flexShrink: 0, fontSize: 10, fontWeight: 700,
                              color: '#a78bfa', background: 'rgba(167,139,250,0.12)',
                              border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4,
                              padding: '2px 6px',
                            }}
                          >
                            ✨ Suggested · {match.confidence}%
                          </span>
                        );
                      })()}
                    </div>
                    {isSelected && (
                      <span style={{ color: '#0891B2', fontSize: 13, fontWeight: 800, marginLeft: 12, flexShrink: 0 }}>
                        ✓ Applied
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Request a template link */}
            <div style={{ borderTop: '1px solid rgba(51,65,85,0.6)', padding: '10px 20px', textAlign: 'center' }}>
              <button
                onClick={() => setShowRequestModal(true)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: '#64748b', fontFamily: 'inherit',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                  padding: '2px 0',
                }}
              >
                Don't see what you need? Request a template →
              </button>
            </div>

            {/* Learn pairing */}
            <div style={{ borderTop: '1px solid rgba(51,65,85,0.9)', padding: '12px 20px' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                cursor: 'pointer',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  background: learnPairing ? '#10b981' : 'transparent',
                  border: `2px solid ${learnPairing ? '#10b981' : 'rgba(255,255,255,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}
                  onClick={() => setLearnPairing(p => !p)}
                >
                  {learnPairing && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>🤖 Learn this pairing</div>
                  <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 1 }}>AI will suggest this protocol for similar specimens in future cases</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid rgba(51,65,85,0.9)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--ps-grad-header, rgba(0,0,0,0.2))',
        }}>
          <div style={{ fontSize: 12, color: '#475569' }}>
            {canAdd
              ? `Adding "${selectedProtocolObj?.name}" to ${selectedSpecimenIds.length} specimen${selectedSpecimenIds.length > 1 ? 's' : ''}`
              : 'Select specimen(s) and a protocol to continue'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fm-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              style={{
                padding: '9px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: canAdd ? 'pointer' : 'not-allowed', border: 'none',
                background: canAdd ? '#0891B2' : 'rgba(8,145,178,0.2)',
                color: canAdd ? '#fff' : '#475569',
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}
            >
              Add Report
            </button>
          </div>
        </div>
      </div>
    </div>
      {showRequestModal && (
        <TemplateRequestModal onClose={() => setShowRequestModal(false)} />
      )}
    </>
  );
};

export default AddSynopticModal;
