// src/components/Common/CodeSearchModal.tsx
// -----------------------------------------------------------------------------
// Real feature, per direct feedback on BillingReviewPanel.tsx's own manual
// add-code and Override search: "there isn't much space, even though I like
// it in principal, its just too cramped." The narrow right panel (~350px)
// left CptCodeSearchPicker's own inline dropdown genuinely cramped and prone
// to clipping, especially with up to 20 results each carrying a description
// line. This keeps the same real principle that made Override's own
// expand-in-place redesign work — no full navigation away, the underlying
// review list is never replaced — but gives the actual search step the real
// room a proper overlay provides, using this app's own, already-established
// ps-overlay/ps-modal-dark pattern rather than inventing a new one.
//
// Real, second round of direct feedback added the "multi" mode below: "it
// would be useful to be able to add multiple codes" and "the stains need to
// be selectable if I'm going to associate the billing code to the stain."
// Override's own use (replacing one specific, already-identified suggestion)
// deliberately keeps the simpler, original single-pick-and-close behavior via
// onSelect/onSelectFreeText — a 1:1 replacement isn't a multi-add operation,
// and forcing a stain picker onto it would just be a control nobody needs.
//
// Real, third round of direct feedback: stain chips are now genuinely
// multi-select (not one-active-at-a-time) - "apply the code to all stain...
// or multiselect." A code picked while several chips are active applies to
// every one of them in a single action. Clicking a real "added this session"
// entry now highlights its own real stain via onHighlightStain, the same
// mechanism the pending-review list already uses elsewhere in this panel.
//
// Real, fourth round of direct feedback, after a real, honest admission ("I
// was just picking codes without regard to if they made sense" - two real
// specimen-level exam-complexity codes both ended up stacked on one stain):
// results are now grouped by whether the entry's own, real, hand-tagged
// level (codeMapTable.ts's own BillingDictionaryEntry.level) actually
// matches what's currently being targeted. Advisory only, same posture as
// this app's own validateCodeLevel - a real, valid reason to pick a
// differently-leveled code can still exist, so non-matching entries are
// de-emphasized, not hidden or blocked.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';

interface AddedThisSession {
  code: string;
  description: string;
  stainId: string | undefined;
  stainName: string | undefined;
}

/** Real, stable sentinel for "Block-level" as one real, selectable member
 *  of the multi-select set - a plain `null` can't itself be a Set member
 *  key alongside real string ids in a way that's simple to toggle, so this
 *  is used internally and converted back to `undefined` (this app's own,
 *  established "no specific stain" value) wherever it's actually applied. */
const BLOCK_LEVEL = '__block_level__';

// Real, persisted BillingDictionaryEntry.level enum values stay as data;
// only the displayed label is translated (same LABEL_KEY pattern used
// throughout this sweep).
const LEVEL_LABEL_KEY: Record<BillingDictionaryEntry['level'], string> = {
  specimen: 'codeSearchModal.level.specimen',
  block: 'codeSearchModal.level.block',
  stain: 'codeSearchModal.level.stain',
  decant: 'codeSearchModal.level.decant',
};

export const CodeSearchModal: React.FC<{
  entries: BillingDictionaryEntry[];
  /** Real, human-readable description of where a selected code will
   *  actually attach — e.g. "A1 — H&E" — shown in the header so the
   *  real targeting context (already resolved by the caller) stays
   *  visible even in this larger, separate overlay. In multi mode,
   *  this is the block-level label only (e.g. "A1") - the real, live
   *  target list is whichever stain chips are currently selected. */
  targetLabel: string;
  onClose: () => void;

  // Single-pick-and-close mode (Override's own, deliberately narrower
  // "replace this one specific suggestion" use) - unchanged from the
  // original design.
  initialValue?: string;
  onSelect?: (entry: BillingDictionaryEntry) => void;
  onSelectFreeText?: (code: string) => void;
  /** Real, per direct feedback: the real level this single-pick session
   *  is actually targeting (e.g. 'specimen' for a base-code add,
   *  'stain' for an Override replacement) - drives the same real
   *  relevant/other grouping multi mode gets from its own live stain
   *  selection. Optional - omitted, results show as one flat list,
   *  same as before this feature existed. */
  targetLevel?: BillingDictionaryEntry['level'];

  /** Real feature, per direct feedback: when provided, switches this
   *  modal into multi-code, multi-stain mode - a real, genuinely
   *  multi-select stain picker (plus a "Block-level" option, for a
   *  real code not tied to one specific stain) appears, and every code
   *  selection applies immediately, to every currently-selected
   *  target, without closing the modal - so several codes across
   *  several real stains can be added in one open session.
   *
   *  Real fix, found via direct live testing: receives every currently
   *  selected target in ONE call, not one call per target - looping N
   *  separate, synchronous onAddCode calls here previously fired N
   *  real, concurrent writes that each raced against the same stale
   *  known-version number, genuinely triggering this app's own
   *  "someone else changed this case" conflict dialog on a single
   *  local action. Same real class of bug already fixed once for
   *  "Confirm All" (see handleApproveAllBillingCodes's own comment) -
   *  the caller is expected to batch these into one atomic update the
   *  same way. */
  stains?: { stainOrderId: string; stainName: string }[];
  initialStainId?: string | null;
  onAddCode?: (code: string, stainIds: (string | undefined)[]) => void;
  /** Real, per direct guidance: preserves the "already applied" guard
   *  the old separate confirm-button flow had, now enforced here since
   *  this modal applies each code immediately rather than staging it
   *  for a later, separate confirm step. Checked once per selected
   *  target - a code can be new for some selected stains and already
   *  applied for others in the same click. */
  isAlreadyApplied?: (code: string, stainId: string | undefined) => boolean;
  /** Real feature, per direct feedback: clicking a real "added this
   *  session" entry highlights its own real stain, the same mechanism
   *  BillingReviewPanel's own pending-review list already uses. */
  onHighlightStain?: (stainId: string | undefined) => void;
}> = ({ entries, targetLabel, onClose, initialValue, onSelect, onSelectFreeText, targetLevel, stains, initialStainId, onAddCode, isAlreadyApplied, onHighlightStain }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue ?? '');
  const isMulti = !!stains && !!onAddCode;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set([initialStainId ?? BLOCK_LEVEL])
  );
  const [addedThisSession, setAddedThisSession] = useState<AddedThisSession[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const matches = entries.filter(e => {
    const q = value.trim().toLowerCase();
    return !q || e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
  });

  // Real, per direct feedback: which real levels are actually relevant
  // right now - in multi mode, live off whatever's currently selected
  // (a real stain selected makes 'stain' relevant, Block-level makes
  // 'block' relevant, both can be relevant at once with a mixed
  // selection); in single-pick mode, whatever the caller says this
  // session is really for. Empty when nothing indicates a level at
  // all - falls back to one flat, ungrouped list rather than guessing.
  const relevantLevels = new Set<BillingDictionaryEntry['level']>();
  if (isMulti) {
    if (Array.from(selectedKeys).some(k => k !== BLOCK_LEVEL)) relevantLevels.add('stain');
    if (selectedKeys.has(BLOCK_LEVEL)) relevantLevels.add('block');
  } else if (targetLevel) {
    relevantLevels.add(targetLevel);
  }
  const relevantMatches = relevantLevels.size > 0 ? matches.filter(e => relevantLevels.has(e.level)) : matches;
  const otherMatches = relevantLevels.size > 0 ? matches.filter(e => !relevantLevels.has(e.level)) : [];
  const relevantLevelHeading = Array.from(relevantLevels).map(l => t(LEVEL_LABEL_KEY[l])).join(' & ');
  const relevantLevelLower = Array.from(relevantLevels).map(l => t(LEVEL_LABEL_KEY[l]).toLowerCase()).join('/');

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setWarning(null);
  };

  const allStainsSelected = !!stains && stains.length > 0 && stains.every(s => selectedKeys.has(s.stainOrderId));
  const toggleAllStains = () => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (allStainsSelected) {
        stains!.forEach(s => next.delete(s.stainOrderId));
      } else {
        stains!.forEach(s => next.add(s.stainOrderId));
      }
      return next;
    });
    setWarning(null);
  };

  const selectedLabel = (() => {
    if (!isMulti) return '';
    const names = Array.from(selectedKeys).map(k => k === BLOCK_LEVEL ? t(LEVEL_LABEL_KEY.block) : stains?.find(s => s.stainOrderId === k)?.stainName).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return ` — ${names[0]}`;
    return ` — ${t('codeSearchModal.targetsSelected', { count: names.length })}`;
  })();

  const handlePick = (code: string, description: string) => {
    if (isMulti) {
      if (selectedKeys.size === 0) {
        setWarning(t('codeSearchModal.warnings.selectAtLeastOne', { blockLevel: t(LEVEL_LABEL_KEY.block) }));
        return;
      }
      const targets = Array.from(selectedKeys).map(k => k === BLOCK_LEVEL ? undefined : k);
      const alreadyApplied: string[] = [];
      const toApply: (string | undefined)[] = [];
      const applied: AddedThisSession[] = [];
      for (const stainId of targets) {
        if (isAlreadyApplied?.(code, stainId)) {
          alreadyApplied.push(stainId ? (stains?.find(s => s.stainOrderId === stainId)?.stainName ?? stainId) : t(LEVEL_LABEL_KEY.block));
          continue;
        }
        toApply.push(stainId);
        applied.push({ code, description, stainId, stainName: stainId ? stains?.find(s => s.stainOrderId === stainId)?.stainName : undefined });
      }
      if (toApply.length > 0) {
        onAddCode!(code, toApply);
        setAddedThisSession(prev => [...prev, ...applied]);
      }
      if (alreadyApplied.length > 0 && applied.length === 0) {
        setWarning(t('codeSearchModal.warnings.alreadyApplied', { code, targets: alreadyApplied.join(', ') }));
      } else if (alreadyApplied.length > 0) {
        setWarning(t('codeSearchModal.warnings.alreadyAppliedPartial', { code, targets: alreadyApplied.join(', ') }));
      } else {
        setWarning(null);
      }
      setValue('');
    } else {
      const entry = entries.find(e => e.code === code);
      if (entry) onSelect?.(entry); else onSelectFreeText?.(code);
      onClose();
    }
  };

  const renderResult = (entry: BillingDictionaryEntry, deEmphasized: boolean) => (
    <div
      key={entry.code}
      onClick={() => handlePick(entry.code, entry.description)}
      className={`ps-codesearch-result${deEmphasized ? ' ps-codesearch-result--deemphasized' : ''}`}
    >
      <div className="ps-codesearch-result-code">{entry.code}</div>
      <div className="ps-codesearch-result-desc">
        {entry.workRvu !== undefined
          ? t('codeSearchModal.resultDescriptionWithRvu', { description: entry.description, rvu: entry.workRvu })
          : entry.description}
      </div>
    </div>
  );

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--codesearch" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{t('codeSearchModal.title')}</span>
          <button onClick={onClose} className="ps-research-close">&#x2715;</button>
        </div>
        <div className="ps-codesearch-target-line">
          {t('codeSearchModal.applyingTo')} <strong className="ps-codesearch-target-value">{targetLabel}{selectedLabel}</strong>
        </div>

        {isMulti && (
          <div className="ps-codesearch-chip-row">
            <button
              onClick={() => toggleKey(BLOCK_LEVEL)}
              className={`ps-codesearch-chip${selectedKeys.has(BLOCK_LEVEL) ? ' ps-codesearch-chip--selected' : ''}`}
            >
              {selectedKeys.has(BLOCK_LEVEL) ? '✓ ' : ''}{t(LEVEL_LABEL_KEY.block)}
            </button>
            {stains && stains.length > 1 && (
              <button
                onClick={toggleAllStains}
                className="ps-codesearch-chip ps-codesearch-chip--all"
              >
                {allStainsSelected ? t('codeSearchModal.deselectAllStains') : t('codeSearchModal.allStains')}
              </button>
            )}
            {stains!.map(s => (
              <button
                key={s.stainOrderId}
                onClick={() => toggleKey(s.stainOrderId)}
                className={`ps-codesearch-chip${selectedKeys.has(s.stainOrderId) ? ' ps-codesearch-chip--selected' : ''}`}
              >
                {selectedKeys.has(s.stainOrderId) ? '✓ ' : ''}{s.stainName}
              </button>
            ))}
          </div>
        )}

        <input
          className="ps-conf-input"
          autoFocus
          placeholder={t('codeSearchModal.searchPlaceholder')}
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <div className={`ps-codesearch-results ${isMulti ? 'ps-codesearch-results--multi' : 'ps-codesearch-results--single'}`}>
          {matches.length > 0 ? (
            <>
              {relevantLevels.size > 0 && (
                <div className="ps-codesearch-group-heading">
                  {t('codeSearchModal.levelCodesHeading', { levels: relevantLevelHeading })}
                </div>
              )}
              {relevantMatches.length > 0 ? relevantMatches.map(e => renderResult(e, false)) : relevantLevels.size > 0 && (
                <div className="ps-codesearch-empty-note">{t('codeSearchModal.noMatchingLevelCodes', { levels: relevantLevelLower })}</div>
              )}
              {otherMatches.length > 0 && (
                <>
                  <div className="ps-codesearch-group-heading ps-codesearch-group-heading--spaced">
                    {t('codeSearchModal.otherCodes')}
                  </div>
                  {otherMatches.map(e => renderResult(e, true))}
                </>
              )}
            </>
          ) : value.trim() ? (
            <div
              onClick={() => handlePick(value.trim(), value.trim())}
              className="ps-codesearch-freetext-row"
            >
              {t('codeSearchModal.noVerifiedMatch', { value: value.trim() })}
            </div>
          ) : (
            <div className="ps-codesearch-hint-row">{t('codeSearchModal.startTyping')}</div>
          )}
        </div>

        {warning && (
          <p className="ps-codesearch-warning">{warning}</p>
        )}

        {isMulti && addedThisSession.length > 0 && (
          <div className="ps-codesearch-session-block">
            <div className="ps-codesearch-session-heading">
              {t('codeSearchModal.addedThisSession')}
            </div>
            <div className="ps-codesearch-session-list">
              {addedThisSession.map((a, i) => (
                <div
                  key={i}
                  onClick={() => onHighlightStain?.(a.stainId)}
                  className={`ps-codesearch-session-row${onHighlightStain ? ' ps-codesearch-session-row--clickable' : ''}`}
                >
                  <span className="ps-codesearch-session-code">{a.code}</span>
                  {' '}— {a.stainName ?? t(LEVEL_LABEL_KEY.block)}
                </div>
              ))}
            </div>
          </div>
        )}

        {isMulti && (
          <button className="ps-btn-primary" onClick={onClose}>
            {addedThisSession.length > 0
              ? t('codeSearchModal.doneWithCount', { count: addedThisSession.length })
              : t('codeSearchModal.done')}
          </button>
        )}
      </div>
    </div>
  );
};

export default CodeSearchModal;
