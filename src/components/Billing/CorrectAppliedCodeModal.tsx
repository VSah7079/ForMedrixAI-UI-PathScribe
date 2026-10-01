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
//
// Batch 382 (PS-359, and Pete: keep today's users): the corrected code is a
// locked Field Requirement (reportPageChecks.correctedCodeCheck; it must
// also differ from the code being corrected). The correction credits the
// original charge and bills the new one, so it needs
// billing:applied-code:correct (checked in services/billing, greyed out
// here). Correct can be said ("correct billing code", CORRECT_CODE_CONFIRM).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CptCodeSearchPicker } from '@/components/Common/CptCodeSearchPicker';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { actionRegistryService, correctedCodeCheck, reportFieldRequired, rvuCodeMapService } from '@/services';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useFieldRequirements } from '@/hooks/useFieldRequirements';
import { formatList } from '@/utils/formatList';
import type { BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';

export interface CorrectAppliedCodeModalProps {
  originalCode: string;
  /** The case whose charge is corrected, for the permission's facility scope. */
  caseId?: string;
  onConfirm: (newCode: string) => void;
  onCancel: () => void;
}

export const CorrectAppliedCodeModal: React.FC<CorrectAppliedCodeModalProps> = ({ originalCode, caseId, onConfirm, onCancel }) => {
  const { t, i18n } = useTranslation();
  const requirements = useFieldRequirements('report');
  const { decide } = useCapabilities();
  const [newCode, setNewCode] = useState('');
  const [rvuEntries, setRvuEntries] = useState<BillingDictionaryEntry[]>([]);
  useEffect(() => {
    rvuCodeMapService.getActiveVersion().then(res => {
      if (res.ok && res.data) setRvuEntries(res.data.entries);
    });
  }, []);
  const check = correctedCodeCheck(newCode, originalCode, requirements);
  const canConfirm = check.missing.length === 0 && !check.sameAsOriginal;
  const context = caseId ? { caseId } : undefined;
  const confirm = () => { if (canConfirm && decide('billing:applied-code:correct', context)?.allowed) onConfirm(newCode.trim()); };

  // Voice/keyboard "correct billing code": the same Correct, with the same checks.
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => actionRegistryService.onAction((actionId: string) => {
    if (actionId === 'CORRECT_CODE_CONFIRM') confirmRef.current();
  }), []);

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
            <label className="ps-conf-label" htmlFor="correct-applied-code-input">{t('correctAppliedCodeModal.correctedCodeLabel')} {reportFieldRequired(requirements, 'correctedBillingCode') && <span className="ps-conf-required">*</span>}</label>
            <CptCodeSearchPicker
              entries={rvuEntries}
              value={newCode}
              onChange={setNewCode}
              onSelect={entry => setNewCode(entry.code)}
            />
          </div>
          {check.missing.length > 0 && (
            <p className="ps-field-still-required" role="status">
              {t('fieldRequirements.stillRequired', { fields: formatList(check.missing.map(id => t(`fieldRequirements.fields.report.${id}`)), i18n.language) })}
            </p>
          )}
          {check.sameAsOriginal && (
            <p className="ps-field-still-required" role="status">{t('correctAppliedCodeModal.sameAsOriginal', { originalCode })}</p>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onCancel}>{t('correctAppliedCodeModal.cancel')}</button>
          <CapabilityButton
            capability="billing:applied-code:correct"
            context={context}
            className="ps-conf-btn-primary"
            disabled={!canConfirm}
            onClick={confirm}
          >
            {t('correctAppliedCodeModal.correctCode')}
          </CapabilityButton>
        </div>
      </div>
    </div>
  );
};
