// src/components/Config/System/RuleModal.tsx
// Extracted from RoutingRulesSection to avoid OXC/rolldown parse issues
// with chevron SVG template literals in co-located component functions.
//
// i18n sweep (batch 48): every on-screen string converted to the new
// `ruleModal` namespace. No real data here to keep in English — every
// string is UI chrome (labels, hints, buttons, validation messages).
// The removable-keyword "x" glyph stays as a plain symbol (not real
// language text) but now carries a translated aria-label for
// accessibility.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { RoutingRule, findRoutingRulePriorityConflict } from '../../../services/cases/casePoolAssignmentService';
import { Subspecialty } from '../../../services/subspecialties/ISubspecialtyService';

// ─── Rule Modal ───────────────────────────────────────────────────────────────

const RuleModal: React.FC<{
  mode:   'add' | 'edit';
  rule?:  RoutingRule;
  pools:  Subspecialty[];
  allRules: RoutingRule[];
  onSave: (rule: Omit<RoutingRule, 'id' | 'builtIn'>) => void;
  onClose: () => void;
}> = ({ mode, rule, pools, allRules, onSave, onClose }) => {
  const { t } = useTranslation();
  const [subspecialtyId, setSubspecialtyId] = useState(rule?.subspecialtyId ?? (pools[0]?.id ?? ''));
  const [keywords,       setKeywords]       = useState<string[]>(rule?.keywords ?? []);
  const [keywordInput,   setKeywordInput]   = useState('');
  const [priority,       setPriority]       = useState(rule?.priority ?? 100);
  const [active,         setActive]         = useState(rule?.active ?? true);
  const [note,           setNote]           = useState(rule?.note ?? '');
  const [error,          setError]          = useState('');

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw) return;
    if (keywords.includes(kw)) { setError(t('ruleModal.errors.keywordDuplicate', { keyword: kw })); return; }
    setKeywords(prev => [...prev, kw]);
    setKeywordInput('');
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }
  };

  const handleSave = () => {
    if (!subspecialtyId) { setError(t('ruleModal.errors.selectPool')); return; }
    if (keywords.length === 0) { setError(t('ruleModal.errors.addKeyword')); return; }
    // Exclude the rule itself only when editing it; a duplicate is a new rule (PS-73).
    const conflict = findRoutingRulePriorityConflict(allRules, priority, mode === 'edit' ? rule?.id : undefined);
    if (conflict) {
      setError(t('ruleModal.errors.priorityConflict', { priority }));
      return;
    }
    onSave({ subspecialtyId, keywords, priority, active, note: note.trim() || undefined });
  };

  return (
    <div className="ps-conf-backdrop">
      <div className="fm-modal fm-modal--config ps-rulemodal__modal" onClick={e => e.stopPropagation()}>
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">{t('ruleModal.eyebrow')}</div>
            <h2 className="fm-title ps-rulemodal__title">{mode === 'add' ? t('ruleModal.titleAdd') : t('ruleModal.titleEdit')}</h2>
          </div>
        </div>
        <div className="ps-client-editor-body">

          {/* Pool */}
          <div>
            <label className="ps-rulemodal__label">{t('ruleModal.poolLabel')} <span className="ps-rulemodal__required">*</span></label>
            {pools.length === 0 ? (
              <div className="ps-rulemodal__warning">
                {t('ruleModal.noPoolsWarning')}
              </div>
            ) : (
              <select value={subspecialtyId} onChange={e => setSubspecialtyId(e.target.value)} className="ps-conf-select">
                {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label className="ps-rulemodal__label">{t('ruleModal.keywordsLabel')} <span className="ps-rulemodal__required">*</span></label>
            <div className="ps-rulemodal__hint">
              {t('ruleModal.keywordsHint')}
            </div>
            <div className="ps-rulemodal__row">
              <input
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('ruleModal.keywordPlaceholder')}
                className="ps-rulemodal__input ps-rulemodal__input--flex"
              />
              <button onClick={addKeyword} className="ps-conf-btn-teal-accent ps-rulemodal__add-btn">
                {t('common.add')}
              </button>
            </div>
            {keywords.length === 0 ? (
              <div className="ps-rulemodal__empty-keywords">
                {t('ruleModal.noKeywordsYet')}
              </div>
            ) : (
              <div className="ps-rulemodal__keyword-list">
                {keywords.map(kw => (
                  <span key={kw} className="ps-rulemodal__keyword-chip">
                    {kw}
                    <span onClick={() => setKeywords(prev => prev.filter(k => k !== kw))}
                      role="button" aria-label={t('ruleModal.removeKeywordAriaLabel', { keyword: kw })}
                      className="ps-rulemodal__keyword-remove">x</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="ps-rulemodal__label">{t('ruleModal.priorityLabel')}</label>
            <div className="ps-rulemodal__priority-row">
              <input type="number" min={1} max={999} value={priority}
                onChange={e => setPriority(parseInt(e.target.value) || 1)}
                className="ps-rulemodal__input ps-rulemodal__input--number" />
              <span className="ps-rulemodal__priority-hint">
                {t('ruleModal.priorityHint')}
              </span>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="ps-rulemodal__label">{t('ruleModal.noteLabel')}</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder={t('ruleModal.notePlaceholder')}
              className="ps-rulemodal__input" />
          </div>

          {/* Active toggle */}
          <div className="ps-rulemodal__toggle-row">
            <div onClick={() => setActive(v => !v)}
              className={`ps-sub-toggle-track${active ? ' ps-sub-toggle-track--on' : ' ps-sub-toggle-track--off'}`}>
              <div className={`ps-sub-toggle-thumb${active ? ' ps-sub-toggle-thumb--on' : ' ps-sub-toggle-thumb--off'}`} />
            </div>
            <span className={`ps-rulemodal__active-label${active ? ' ps-rulemodal__active-label--on' : ' ps-rulemodal__active-label--off'}`}>{active ? t('common.active') : t('common.inactive')}</span>
          </div>

          {error && <div className="ps-rulemodal__error">{error}</div>}
        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div className="ps-rulemodal__footer-actions">
            <button onClick={onClose} className="fm-btn-cancel">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={keywords.length === 0 || !subspecialtyId} className="fm-btn-apply">
              {mode === 'add' ? t('ruleModal.saveAdd') : t('ruleModal.saveEdit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuleModal;
