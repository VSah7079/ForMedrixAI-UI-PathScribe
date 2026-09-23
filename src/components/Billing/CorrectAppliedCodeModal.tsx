// src/components/Billing/CorrectAppliedCodeModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own follow-up: "post-signout additions
// may be required if the wrong code was billed... the original bill
// is credited and the new billing code submitted." A deliberate,
// separate, standalone modal rather than mirroring
// BillingReviewPanel.tsx's own expand-in-place override pattern (used
// for overriding a pending, pre-charge AI suggestion) - correcting an
// already-applied, already-charged code is a genuinely different,
// less frequent, higher-stakes action that warrants a clear, focused
// prompt of its own.
//
// Real, per direct guidance's own follow-up on dictionary-backed
// fields: the corrected code is searched against the same real,
// existing RVU Code Map (mockRvuCodeMapService.ts) that
// NewVersionModal/AddCodeModal already use via CptCodeSearchPicker -
// never a raw free-text field when a real dictionary exists. Still
// supports typing a genuinely new code not yet in the dictionary
// (CptCodeSearchPicker's own real, established behavior) - a real
// billing specialist correcting a code isn't blocked just because
// this specific code hasn't been catalogued yet.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CptCodeSearchPicker } from '@/components/Common/CptCodeSearchPicker';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import type { BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';

export interface CorrectAppliedCodeModalProps {
  originalCode: string;
  onConfirm: (newCode: string) => void;
  onCancel: () => void;
}

export const CorrectAppliedCodeModal: React.FC<CorrectAppliedCodeModalProps> = ({ originalCode, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [newCode, setNewCode] = useState('');
  const [rvuEntries, setRvuEntries] = useState<BillingDictionaryEntry[]>([]);
  useEffect(() => {
    mockRvuCodeMapService.getActiveVersion().then(res => {
      if (res.ok && res.data) setRvuEntries(res.data.entries);
    });
  }, []);
  const canConfirm = newCode.trim().length > 0 && newCode.trim() !== originalCode;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{t('correctAppliedCodeModal.header')}</div>
        <div className="ps-ms-body">
          {/* Real copy cleanup, same "leaked rhetorical tic" pattern
              found elsewhere in this sweep (see MolecularPlateBuilderPage):
              this UI string had picked up this codebase's own comment
              habit of qualifying things as "Real, ..." — cleaned to
              plain English before translating. */}
          <p className="ps-fixgate-intro">
            {t('correctAppliedCodeModal.intro', { originalCode })}
          </p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="correct-applied-code-input">{t('correctAppliedCodeModal.correctedCodeLabel')} <span className="ps-conf-required">*</span></label>
            <CptCodeSearchPicker
              entries={rvuEntries}
              value={newCode}
              onChange={setNewCode}
              onSelect={entry => setNewCode(entry.code)}
            />
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onCancel}>{t('correctAppliedCodeModal.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canConfirm}
            onClick={() => onConfirm(newCode.trim())}
          >
            {t('correctAppliedCodeModal.correctCode')}
          </button>
        </div>
      </div>
    </div>
  );
};
