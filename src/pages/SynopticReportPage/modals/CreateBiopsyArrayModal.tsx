/**
 * CreateBiopsyArrayModal.tsx
 * src/pages/SynopticReportPage/modals/CreateBiopsyArrayModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Real feature, per direct confirmation: "I wanted to be able to assign each
 * core to a specific section of a single block... This is a grossing
 * activity." Select two or more specimens whose tissue is going into one
 * shared cassette, assign a cassette label, and the positions are simply
 * the order they were selected in (adjustable by re-ordering before saving)
 * — deliberately as simple as possible, no drag-and-drop, no separate
 * position-picker UI.
 *
 * Also handles editing an existing array (per direct request completing
 * the feature: "allowing edits of the Biopsy array") — pass
 * existingCassetteId + initialSelectedIds to open in edit mode. The
 * cassette label is locked once created — renaming would mean
 * handleUpdateBiopsyArray also has to handle changing the array's own
 * identity, which wasn't asked for; dissolve-and-recreate covers that
 * rare case without adding complexity to the common one.
 *
 * i18n note: `existingCassetteId` is a real, user-assigned cassette
 * label (data), embedded via interpolation in otherwise-translated
 * strings (the edit-mode title, the dissolve-confirmation prompt).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';
import type { Specimen } from '@/types/case/Specimen';

interface CreateBiopsyArrayModalProps {
  specimens: Specimen[];
  onSave: (specimenIds: string[], cassetteLabel: string) => void;
  onClose: () => void;
  /** Real feature, per direct confirmation: set both of these to open
   *  in edit mode instead of create mode. */
  existingCassetteId?: string;
  initialSelectedIds?: string[];
  /** Only meaningful in edit mode — a direct, explicit "undo the
   *  whole array" action, clearer than editing the selection down to
   *  zero specimens. */
  onDissolve?: () => void;
}

const CreateBiopsyArrayModal: React.FC<CreateBiopsyArrayModalProps> = ({
  specimens, onSave, onClose, existingCassetteId, initialSelectedIds, onDissolve,
}) => {
  const { t } = useTranslation();
  const isEditMode = !!existingCassetteId;
  // Order IS the position — position 1 is whichever specimen was
  // selected first, etc. Deliberately no separate re-ordering UI for
  // v1: click to add in the order tissue will actually sit in the
  // block, click again to remove. Simplest possible interaction that
  // still produces a real, meaningful position number.
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds ?? []);
  const [cassetteLabel, setCassetteLabel] = useState(existingCassetteId ?? '');
  const [confirmingDissolve, setConfirmingDissolve] = useState(false);

  const toggle = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const canSave = selectedIds.length >= 2 && cassetteLabel.trim().length > 0;

  return (
    <div onClick={onClose} className="ps-biopsyarray-overlay">
      <div onClick={e => e.stopPropagation()} className="ps-biopsyarray-modal">
        <div className="ps-biopsyarray-header">
          <div className="ps-biopsyarray-title">
            {isEditMode ? t('createBiopsyArrayModal.editTitle', { id: existingCassetteId }) : t('createBiopsyArrayModal.createTitle')}
          </div>
          <div className="ps-biopsyarray-subtitle">
            {isEditMode
              ? t('createBiopsyArrayModal.editSubtitle')
              : t('createBiopsyArrayModal.createSubtitle')}
          </div>
        </div>

        <div className="ps-biopsyarray-body">
          <div className="ps-biopsyarray-section-label">
            {t('createBiopsyArrayModal.cassetteLabelHeading')}
          </div>
          <input
            value={cassetteLabel}
            onChange={e => setCassetteLabel(e.target.value)}
            placeholder={t('createBiopsyArrayModal.cassetteLabelPlaceholder')}
            disabled={isEditMode}
            title={isEditMode ? t('createBiopsyArrayModal.cassetteLabelLockedTooltip') : undefined}
            className={`ps-biopsyarray-input${isEditMode ? ' ps-biopsyarray-input--disabled' : ''}`}
          />

          <div className="ps-biopsyarray-section-label">
            {t('createBiopsyArrayModal.specimensHeading', { count: selectedIds.length })}
          </div>
          {specimens.map(sp => {
            const idx = selectedIds.indexOf(sp.id);
            const selected = idx !== -1;
            return (
              <div
                key={sp.id}
                onClick={() => toggle(sp.id)}
                className={`ps-biopsyarray-specimen-row${selected ? ' ps-biopsyarray-specimen-row--selected' : ''}`}
              >
                <div className={`ps-biopsyarray-position-badge${selected ? ' ps-biopsyarray-position-badge--selected' : ''}`}>
                  {selected ? idx + 1 : ''}
                </div>
                <div>
                  <div className="ps-biopsyarray-specimen-label">{t('createBiopsyArrayModal.specimenPrefix', { label: sp.label })}</div>
                  <div className="ps-biopsyarray-specimen-desc">{sp.description}</div>
                </div>
              </div>
            );
          })}
          {selectedIds.length === 1 && (
            <div className="ps-biopsyarray-warning">
              {isEditMode
                ? t('createBiopsyArrayModal.dropToOneWarningEdit')
                : t('createBiopsyArrayModal.dropToOneWarningCreate')}
            </div>
          )}

          {isEditMode && onDissolve && (
            <div className="ps-biopsyarray-dissolve-section">
              {!confirmingDissolve ? (
                <button
                  onClick={() => setConfirmingDissolve(true)}
                  className="ps-biopsyarray-dissolve-btn"
                >
                  🗑 {t('createBiopsyArrayModal.dissolveButton')}
                </button>
              ) : (
                <div className="ps-biopsyarray-dissolve-confirm-row">
                  <span className="ps-biopsyarray-dissolve-confirm-text">{t('createBiopsyArrayModal.dissolveConfirmPrompt', { id: existingCassetteId })}</span>
                  <button
                    onClick={onDissolve}
                    className="ps-biopsyarray-confirm-dissolve-btn"
                  >
                    {t('createBiopsyArrayModal.confirmDissolveButton')}
                  </button>
                  <button
                    onClick={() => setConfirmingDissolve(false)}
                    className="ps-biopsyarray-dissolve-cancel-btn"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ps-biopsyarray-footer">
          <button
            onClick={onClose}
            className="ps-biopsyarray-cancel-btn"
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={!canSave}
            onClick={() => canSave && onSave(selectedIds, cassetteLabel.trim())}
            className={`ps-biopsyarray-save-btn${canSave ? ' ps-biopsyarray-save-btn--enabled' : ''}`}
          >
            {isEditMode ? t('createBiopsyArrayModal.saveChangesButton') : t('createBiopsyArrayModal.createTitle')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateBiopsyArrayModal;
