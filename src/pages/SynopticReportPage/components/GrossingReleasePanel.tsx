// src/pages/SynopticReportPage/components/GrossingReleasePanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up describing the real grossing-
// station workflow: "The PA sees the pre-resolved default cassettes
// queued up on screen (e.g., 'Block A1: GREEN / MESH'). The PA can
// accept them as-is, adjust the block count (e.g., add A2 or delete
// A1), or override the resolved color."
//
// Shown only for a specimen with at least one real, still-'Pending'
// block that hydrateGrossingBlocks.ts has already resolved a
// cassetteColorId for — a real specimen with no such blocks renders
// nothing extra at all, same posture as every other conditional
// section in MaterialTreePanel.tsx.
//
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 2c (per direct instruction): the real, primary UX side of the
// triage gate — useSpecimenBlockManagement.ts's own
// handleReleaseGrossingBlocks is the real, enforced backstop, but a
// tech should never have to click Release and get bounced by an error
// toast when this panel can simply disable the button and show why,
// with a fast path to resolve it right here (check off the real
// checklist, or override with a reason) rather than navigating
// elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CassetteColorControl from '../modals/CassetteColorControl';
import type { HistologyBlock, SpecimenTriage } from '@/types/case/Specimen';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';
import { isTriagePending } from '@/pages/WorklistPage/PendingGrossingTriageTile';

interface GrossingReleasePanelProps {
  specimenLabel: string;
  pendingBlocks: HistologyBlock[];
  cassetteColors: CassetteColorDefinition[];
  onOverrideColor: (blockId: string, colorId: string) => void;
  onRemove: (blockId: string) => void;
  onRelease: (blockIds: string[]) => void;
  /** Real, additive — per Specimen.triage's own doc comment. Undefined
   *  for a specimen whose protocol never required triage — this panel
   *  renders exactly as it always did in that case. */
  triage?: SpecimenTriage;
  onConfirmChecklistItem: (itemIndex: number, confirmed: boolean) => void;
  onOverrideTriage: (reason: string) => void;
}

const GrossingReleasePanel: React.FC<GrossingReleasePanelProps> = ({
  specimenLabel, pendingBlocks, cassetteColors, onOverrideColor, onRemove, onRelease,
  triage, onConfirmChecklistItem, onOverrideTriage,
}) => {
  const { t } = useTranslation();
  const [overrideReasonInput, setOverrideReasonInput] = useState('');

  if (pendingBlocks.length === 0) return null;

  // Real fix, found by this app's own inline-CSS/business-logic sweep:
  // this used to be a second, independent copy of "is this specimen's
  // triage resolved" alongside PendingGrossingTriageTile.tsx's own
  // isTriagePending() (exported "for direct unit testing" — the
  // designated real source of truth) and the actual release-blocking
  // gate in useSpecimenBlockManagement.ts. All three already agreed,
  // but nothing enforced that; now this reuses the one real, tested
  // predicate instead of a parallel copy.
  const triageResolved = !isTriagePending(triage);
  const triageBlocking = !triageResolved;

  return (
    <div className="ps-grossing-release-panel">
      <div className="ps-grossing-release-panel-title">
        {t('grossingRelease.cassettesResolved', { count: pendingBlocks.length })}
      </div>
      {pendingBlocks.map(block => (
        <div key={block.id} className="ps-grossing-release-row">
          <div className="ps-grossing-release-label">{t('grossingRelease.blockLabel', { specimenLabel, blockLabel: block.label })}</div>
          <CassetteColorControl
            colorId={block.cassetteColorId}
            overridden={block.cassetteColorOverridden}
            colors={cassetteColors}
            onChange={colorId => onOverrideColor(block.id, colorId)}
          />
          <button
            type="button"
            className="ps-grossing-release-remove"
            onClick={() => onRemove(block.id)}
            title={t('grossingRelease.removeBlockTitle', { specimenLabel, blockLabel: block.label })}
          >
            ×
          </button>
        </div>
      ))}

      {triage && (
        <div className={`ps-grossing-triage-panel${triageBlocking ? ' ps-grossing-triage-panel--blocking' : ''}`}>
          <div className="ps-grossing-triage-title">
            {triageResolved ? t('grossingRelease.triageResolved') : t('grossingRelease.triageRequired')}
          </div>
          {!triage.overrideReason && (
            <ul className="ps-grossing-triage-checklist">
              {triage.checklistItems.map((ci, i) => (
                <li key={i} className="ps-grossing-triage-checklist-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={ci.confirmed}
                      onChange={e => onConfirmChecklistItem(i, e.target.checked)}
                    />
                    {ci.item}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {triage.overrideReason && (
            <div className="ps-grossing-triage-override-note">
              {t('grossingRelease.overriddenNote', { reason: triage.overrideReason })}
            </div>
          )}
          {triageBlocking && (
            <div className="ps-grossing-triage-override-row">
              <input
                type="text"
                className="ps-batch-text-input"
                placeholder={t('grossingRelease.overrideReasonPlaceholder')}
                value={overrideReasonInput}
                onChange={e => setOverrideReasonInput(e.target.value)}
              />
              <button
                type="button"
                className="ps-btn-secondary"
                disabled={!overrideReasonInput.trim()}
                onClick={() => { onOverrideTriage(overrideReasonInput.trim()); setOverrideReasonInput(''); }}
              >
                {t('grossingRelease.overrideAndRelease')}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="ps-teal-action-btn ps-teal-action-btn--block"
        disabled={triageBlocking}
        title={triageBlocking ? t('grossingRelease.releaseBlockedTitle') : undefined}
        onClick={() => onRelease(pendingBlocks.map(b => b.id))}
      >
        🖨️ {t('grossingRelease.releaseAndPrintAll')}
      </button>
    </div>
  );
};

export default GrossingReleasePanel;
