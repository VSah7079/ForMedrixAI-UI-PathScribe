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

const LEVEL_LABEL: Record<BillingDictionaryEntry['level'], string> = {
  specimen: 'Specimen-level',
  block: 'Block-level',
  stain: 'Stain-level',
  decant: 'Decant-level',
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
    const names = Array.from(selectedKeys).map(k => k === BLOCK_LEVEL ? 'Block-level' : stains?.find(s => s.stainOrderId === k)?.stainName).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return ` — ${names[0]}`;
    return ` — ${names.length} targets selected`;
  })();

  const handlePick = (code: string, description: string) => {
    if (isMulti) {
      if (selectedKeys.size === 0) {
        setWarning('Select at least one stain or Block-level first.');
        return;
      }
      const targets = Array.from(selectedKeys).map(k => k === BLOCK_LEVEL ? undefined : k);
      const alreadyApplied: string[] = [];
      const toApply: (string | undefined)[] = [];
      const applied: AddedThisSession[] = [];
      for (const stainId of targets) {
        if (isAlreadyApplied?.(code, stainId)) {
          alreadyApplied.push(stainId ? (stains?.find(s => s.stainOrderId === stainId)?.stainName ?? stainId) : 'Block-level');
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
        setWarning(`${code} is already applied to ${alreadyApplied.join(', ')}.`);
      } else if (alreadyApplied.length > 0) {
        setWarning(`${code} was already applied to ${alreadyApplied.join(', ')} — added to the rest.`);
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
      style={{
        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(148,163,184,0.12)',
        opacity: deEmphasized ? 0.55 : 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{entry.code}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
        {entry.description}{entry.workRvu !== undefined ? ` · RVU ${entry.workRvu}` : ''}
      </div>
    </div>
  );

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark" style={{ width: 'min(560px, 92vw)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">Search Billing Codes</span>
          <button onClick={onClose} className="ps-research-close">&#x2715;</button>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Applying to: <strong style={{ color: '#e2e8f0' }}>{targetLabel}{selectedLabel}</strong>
        </div>

        {isMulti && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              onClick={() => toggleKey(BLOCK_LEVEL)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                border: selectedKeys.has(BLOCK_LEVEL) ? '1.5px solid #22d3ee' : '1px solid rgba(148,163,184,0.3)',
                background: selectedKeys.has(BLOCK_LEVEL) ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.02)',
                color: selectedKeys.has(BLOCK_LEVEL) ? '#67e8f9' : '#94a3b8',
              }}
            >
              {selectedKeys.has(BLOCK_LEVEL) ? '✓ ' : ''}Block-level
            </button>
            {stains && stains.length > 1 && (
              <button
                onClick={toggleAllStains}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                  border: '1px dashed rgba(148,163,184,0.4)', background: 'rgba(255,255,255,0.02)', color: '#94a3b8',
                }}
              >
                {allStainsSelected ? 'Deselect all stains' : 'All stains'}
              </button>
            )}
            {stains!.map(s => (
              <button
                key={s.stainOrderId}
                onClick={() => toggleKey(s.stainOrderId)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                  border: selectedKeys.has(s.stainOrderId) ? '1.5px solid #22d3ee' : '1px solid rgba(148,163,184,0.3)',
                  background: selectedKeys.has(s.stainOrderId) ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.02)',
                  color: selectedKeys.has(s.stainOrderId) ? '#67e8f9' : '#94a3b8',
                }}
              >
                {selectedKeys.has(s.stainOrderId) ? '✓ ' : ''}{s.stainName}
              </button>
            ))}
          </div>
        )}

        <input
          className="ps-conf-input"
          autoFocus
          placeholder="e.g. 88342 — search by code or description"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <div style={{ overflowY: 'auto', maxHeight: isMulti ? '35vh' : '50vh', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {matches.length > 0 ? (
            <>
              {relevantLevels.size > 0 && (
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', margin: '2px 0' }}>
                  {Array.from(relevantLevels).map(l => LEVEL_LABEL[l]).join(' & ')} codes
                </div>
              )}
              {relevantMatches.length > 0 ? relevantMatches.map(e => renderResult(e, false)) : relevantLevels.size > 0 && (
                <div style={{ padding: '6px 12px', color: '#64748b', fontSize: 11 }}>No matching {Array.from(relevantLevels).map(l => LEVEL_LABEL[l].toLowerCase()).join('/')} codes found.</div>
              )}
              {otherMatches.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', margin: '10px 0 2px' }}>
                    Other codes
                  </div>
                  {otherMatches.map(e => renderResult(e, true))}
                </>
              )}
            </>
          ) : value.trim() ? (
            <div
              onClick={() => handlePick(value.trim(), value.trim())}
              style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: '1px dashed rgba(148,163,184,0.3)', color: '#94a3b8', fontSize: 12 }}
            >
              No matching verified codes — use "{value.trim()}" as entered
            </div>
          ) : (
            <div style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>Start typing to search.</div>
          )}
        </div>

        {warning && (
          <p style={{ fontSize: 11, color: '#f59e0b', margin: 0 }}>{warning}</p>
        )}

        {isMulti && addedThisSession.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
              Added this session
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {addedThisSession.map((a, i) => (
                <div
                  key={i}
                  onClick={() => onHighlightStain?.(a.stainId)}
                  style={{ fontSize: 12, color: '#94a3b8', cursor: onHighlightStain ? 'pointer' : 'default' }}
                >
                  <span style={{ color: '#34d399', fontWeight: 700 }}>{a.code}</span>
                  {' '}— {a.stainName ?? 'Block-level'}
                </div>
              ))}
            </div>
          </div>
        )}

        {isMulti && (
          <button className="ps-btn-primary" onClick={onClose}>
            Done{addedThisSession.length > 0 ? ` (${addedThisSession.length} added)` : ''}
          </button>
        )}
      </div>
    </div>
  );
};

export default CodeSearchModal;
