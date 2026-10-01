// src/pages/SynopticReportPage/components/AddSynopticModal.tsx
// Two-panel Flag Manager style modal for adding synoptic reports.

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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

// Real search/filter tag values, matched as literal substrings against
// protocol name/source/category text — the values themselves must stay
// the fixed English keywords the underlying data actually contains.
// 'CAP'/'RCPath' are governing-body abbreviations (fixed vocabulary,
// never translated); the organ tags get a separate display-only label.
const FILTER_TAGS = ['All', 'CAP', 'RCPath', 'BREAST', 'COLON', 'PROSTATE', 'LUNG'] as const;
const ORGAN_TAG_LABEL_KEY: Record<string, string> = {
  BREAST:   'addSynopticModal.filters.breast',
  COLON:    'addSynopticModal.filters.colon',
  PROSTATE: 'addSynopticModal.filters.prostate',
  LUNG:     'addSynopticModal.filters.lung',
};

const AddSynopticModal: React.FC<AddSynopticModalProps> = ({
  caseData,
  availableProtocols,
  onClose,
  onAdd,
}) => {
  const { t } = useTranslation();
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
      facilityId: caseData?.order?.facilityId,
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

  // Badge for source — 'RCPath' vs everything else (typically 'CAP')
  // are real governing-body-sourced protocols; both abbreviations stay
  // literal, only the badge's visual variant differs.
  const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
    if (!source) return null;
    const isRCPath = source === 'RCPath';
    return (
      <span className={`ps-addsyn-source-badge${isRCPath ? ' ps-addsyn-source-badge--rcpath' : ''}`}>
        {source}
      </span>
    );
  };

  return (
    <>
    <div className="ps-overlay" onClick={onClose}>
      <div
        className="ps-research-modal ps-addsyn-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="ps-research-header">
          <div>
            <div className="fm-eyebrow">{t('addSynopticModal.eyebrow')}</div>
            <div className="fm-title-row">
              <h2 className="fm-title">{t('addSynopticModal.title')}</h2>
              {selectedSpecimenIds.length > 0 && (
                <span className="fm-active-badge">{t('addSynopticModal.selectedBadge', { count: selectedSpecimenIds.length })}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="ps-addsyn-close-btn">✕</button>
        </div>

        {/* ── Two-panel body ── */}
        <div className="ps-addsyn-body">

          {/* Left — Specimens */}
          <div className="ps-addsyn-left">
            <div className="ps-addsyn-panel-eyebrow">
              {t('addSynopticModal.selectSpecimens')}
            </div>

            {specimens.map(spec => {
              const isSelected = selectedSpecimenIds.includes(spec.id);
              const hasReport  = existingReports.some(r => r.specimenId === spec.id);
              return (
                <div
                  key={spec.id}
                  onClick={() => toggleSpecimen(spec.id)}
                  className={`ps-addsyn-specimen-row${isSelected ? ' ps-addsyn-specimen-row--selected' : ''}`}
                >
                  {/* Checkbox */}
                  <div className={`ps-addsyn-checkbox${isSelected ? ' ps-addsyn-checkbox--checked' : ''}`}>
                    {isSelected && <span className="ps-addsyn-checkbox-check">✓</span>}
                  </div>

                  <div className="ps-addsyn-specimen-info">
                    <div className="ps-addsyn-specimen-name">
                      <span className="ps-addsyn-specimen-label">{spec.label}:</span>{' '}{spec.description}
                    </div>
                    {hasReport && (
                      <div className="ps-addsyn-specimen-report-exists">
                        ✓ {t('addSynopticModal.reportExists')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right — Protocol search & selection */}
          <div className="ps-addsyn-right">

            {/* Search */}
            <div className="ps-addsyn-search-wrap">
              <div className="ps-addsyn-search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={selectedProtocol ? (selectedProtocolObj?.name ?? '') : protocolSearch}
                  onChange={e => { setProtocolSearch(e.target.value); setSelectedProtocol(''); }}
                  placeholder={t('addSynopticModal.search.placeholder')}
                  className="ps-addsyn-search-input"
                />
                {(protocolSearch || selectedProtocol) && (
                  <button onClick={() => { setProtocolSearch(''); setSelectedProtocol(''); }}
                    className="ps-addsyn-search-clear">
                    ×
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div className="ps-addsyn-pills">
                {FILTER_TAGS.map(tag => {
                  const isActive = (tag === 'All' && !protocolSearch) || protocolSearch.toLowerCase() === tag.toLowerCase();
                  const label = tag === 'All' ? t('addSynopticModal.filters.all')
                    : (tag === 'CAP' || tag === 'RCPath') ? tag
                    : t(ORGAN_TAG_LABEL_KEY[tag]);
                  return (
                    <button
                      key={tag}
                      onClick={() => setProtocolSearch(tag === 'All' ? '' : tag)}
                      className={`ps-addsyn-pill${isActive ? ' ps-addsyn-pill--active' : ''}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Protocol list */}
            <div className="ps-addsyn-protocol-list">
              {filteredProtocols.length === 0 ? (
                <div className="ps-addsyn-empty">
                  {t('addSynopticModal.protocolList.empty')}
                </div>
              ) : filteredProtocols.map(p => {
                const isSelected = selectedProtocol === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProtocol(isSelected ? '' : p.id)}
                    className={`ps-addsyn-protocol-row${isSelected ? ' ps-addsyn-protocol-row--selected' : ''}`}
                  >
                    <div className="ps-addsyn-protocol-info">
                      <span className={`ps-addsyn-protocol-name${isSelected ? ' ps-addsyn-protocol-name--selected' : ''}`} data-phi="name">{p.name}</span>
                      <SourceBadge source={p.source} />
                      {(() => {
                        const match = suggestionForTemplate(p.id);
                        if (!match) return null;
                        return (
                          <span title={match.reason} className="ps-addsyn-suggestion-badge">
                            ✨ {t('addSynopticModal.protocolList.suggested', { confidence: match.confidence })}
                          </span>
                        );
                      })()}
                    </div>
                    {isSelected && (
                      <span className="ps-addsyn-applied-badge">
                        ✓ {t('addSynopticModal.protocolList.applied')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Request a template link */}
            <div className="ps-addsyn-request-wrap">
              <button
                onClick={() => setShowRequestModal(true)}
                className="ps-addsyn-request-btn"
              >
                {t('addSynopticModal.requestTemplate.button')} →
              </button>
            </div>

            {/* Learn pairing */}
            <div className="ps-addsyn-learn-wrap">
              <label className="ps-addsyn-learn-label">
                <div className={`ps-addsyn-checkbox${learnPairing ? ' ps-addsyn-checkbox--checked ps-addsyn-checkbox--checked-learn' : ''}`}
                  onClick={() => setLearnPairing(p => !p)}
                >
                  {learnPairing && <span className="ps-addsyn-checkbox-check">✓</span>}
                </div>
                <div>
                  <div className="ps-addsyn-learn-title">🤖 {t('addSynopticModal.learnPairing.title')}</div>
                  <div className="ps-addsyn-learn-desc">{t('addSynopticModal.learnPairing.description')}</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="ps-addsyn-footer">
          <div className="ps-addsyn-footer-status">
            {canAdd
              ? t('addSynopticModal.footer.addingStatus', { name: selectedProtocolObj?.name, count: selectedSpecimenIds.length })
              : t('addSynopticModal.footer.selectPrompt')}
          </div>
          <div className="ps-addsyn-footer-btns">
            <button className="fm-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="ps-addsyn-add-btn"
            >
              {t('addSynopticModal.footer.addReport')}
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
