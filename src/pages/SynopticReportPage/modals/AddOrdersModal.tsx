/**
 * AddOrdersModal.tsx
 * src/pages/SynopticReportPage/modals/AddOrdersModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the old, single-purpose "+ Add Specimen" button. That button
 * conflated three genuinely different tiers of the real specimen hierarchy —
 * Specimen (a new OR container of tissue) → Block (tissue cut and cassetted
 * during grossing) → Section/Level (a slide cut from a block) — under one
 * label and one flow. A specimen-tier action is rare and deliberate; a
 * block/recut or stain order is the common, routine click. This modal gives
 * each tier its own real tab instead of pretending they're the same action.
 *
 * Tab order is dynamic, not fixed — driven by what's actually likely to be
 * clicked given the case's current stage:
 *   Pre-gross-complete ('draft' | 'accessioned' — PA actively at the bench):
 *     Blocks → Specimens → Stains
 *   Post-gross-complete (pathologist territory — everything from
 *     'gross-complete' onward): Stains → Blocks → Specimens
 *
 * Specimens tab and Stains tab deliberately don't reimplement anything —
 * they hand off to the real, already-working SpecimenEditModal and
 * FlagManagerModal rather than risk the exact kind of duplicate-mechanism
 * problem found and removed once already tonight. Only Blocks/Recut is a
 * genuinely new, purpose-built form, because nothing else in the app
 * currently handles "additional cassette on an existing specimen" as its
 * own action.
 *
 * i18n note: `generatedSentence` is appended verbatim to the case's
 * persisted gross description (`onAddBlock`'s `note` argument) — real,
 * persisted diagnostic/narrative text — so it stays in English, same as
 * MicroscopicEntryPanel.tsx's (batch 154) standard-attestation text. The
 * "Will append:" preview's own chrome word is translated; the quoted
 * sentence it previews is not, since it is exactly what gets persisted.
 * `sp.label`/`sp.description` (specimen picker options) are real case data.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';
import type { Case } from '@/types/case/Case';

export type OrderTab = 'blocks' | 'specimens' | 'stains';

interface AddOrdersModalProps {
  show: boolean;
  caseData: Case | null;
  /** Specimen currently selected in the Sidebar, if any — pre-selects it
   *  in the Blocks and Stains tabs so the common case (I'm already
   *  looking at the specimen I want to act on) needs no extra click. */
  activeSpecimenId?: string | null;
  /** Force the modal to open on a specific tab, overriding the default
   *  status-driven tabOrder[0] — e.g. a keyboard shortcut or action-registry
   *  entry (ADD_ORDERS_BLOCK / ADD_ORDERS_STAIN / ADD_ORDERS_SPECIMEN) that
   *  wants to land the user directly on that tab instead of requiring a
   *  manual click. undefined (or ADD_ORDERS's generic entry) falls back to
   *  the existing status-driven default. Re-applied every time the modal
   *  opens, not just on first mount, since this component stays mounted
   *  (returns null internally) across show/hide cycles. */
  initialTab?: OrderTab;
  onClose: () => void;
  /** "Specimens" tab chosen — caller closes this modal and opens the
   *  real SpecimenEditModal, exactly as the old + Add Specimen button did. */
  onGoToAddSpecimen: () => void;
  /** "Stains" tab chosen — caller closes this modal and opens the real
   *  Flag Manager, pre-scoped to specimenId if one was selected. */
  onGoToAddStain: (specimenId?: string) => void;
  /** "Blocks/Recut" tab submitted — caller appends the generated
   *  sentence to caseData.diagnostic.grossDescription and updates the
   *  target specimen's grossing instance (cassette count/key + a
   *  mirrored note in its own comments field), then persists. */
  onAddBlock: (specimenId: string, cassetteLabel: string, note: string) => void;
}

// Real, closed set of tab ids — only the displayed label is translated.
const TAB_LABEL_KEY: Record<OrderTab, string> = {
  blocks:    'addOrdersModal.tab.blocks',
  specimens: 'addOrdersModal.tab.specimens',
  stains:    'addOrdersModal.tab.stains',
};

const AddOrdersModal: React.FC<AddOrdersModalProps> = ({
  show, caseData, activeSpecimenId, initialTab, onClose, onGoToAddSpecimen, onGoToAddStain, onAddBlock,
}) => {
  const { t } = useTranslation();

  // Pre-gross-complete = PA actively at the bench, hasn't finalized
  // Grossing yet. Everything from 'gross-complete' onward is
  // pathologist/microscopic territory — deliberately a simple allowlist
  // of the two "still grossing" statuses rather than trying to
  // enumerate every later status, so this stays correct even if new
  // post-gross statuses get added later.
  const isPreGrossComplete = caseData?.status === 'draft' || caseData?.status === 'accessioned';

  const tabOrder: OrderTab[] = isPreGrossComplete
    ? ['blocks', 'specimens', 'stains']
    : ['stains', 'blocks', 'specimens'];

  const [activeTab, setActiveTab] = useState<OrderTab>(initialTab ?? tabOrder[0]);

  // This component stays mounted (returns null internally, see below)
  // across show/hide cycles rather than being conditionally rendered by
  // its parent — so the useState initializer above only ever runs once,
  // on first mount. Re-apply initialTab explicitly every time the modal
  // transitions to open, so ADD_ORDERS_BLOCK/STAIN/SPECIMEN land on the
  // requested tab on every open, not just the first.
  React.useEffect(() => {
    if (show) setActiveTab(initialTab ?? tabOrder[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, initialTab]);

  // If the modal re-opens later in the case's life (grossing now done
  // when it wasn't before), land on the tab that's actually first for
  // the current status rather than whatever was last selected.
  const resolvedActiveTab = tabOrder.includes(activeTab) ? activeTab : tabOrder[0];

  // ── Blocks/Recut tab state ────────────────────────────────────────────
  const [blockSpecimenId, setBlockSpecimenId] = useState(activeSpecimenId ?? '');
  const [cassetteLabel,   setCassetteLabel]   = useState('');
  const [blockError,      setBlockError]      = useState('');

  const specimens = caseData?.specimens ?? [];
  const selectedSpecimen = specimens.find(sp => sp.id === blockSpecimenId);

  const generatedSentence = useMemo(() => {
    if (!selectedSpecimen) return '';
    const blockRef = cassetteLabel.trim() || '[block]';
    return `Specimen ${selectedSpecimen.label} represents deeper levels cut from Block ${blockRef}, ordered for advanced microscopic evaluation.`;
  }, [selectedSpecimen, cassetteLabel]);

  const handleSubmitBlock = () => {
    if (!blockSpecimenId) { setBlockError(t('addOrdersModal.blocksTab.errorSelectSpecimen')); return; }
    if (!cassetteLabel.trim()) { setBlockError(t('addOrdersModal.blocksTab.errorEnterLabel')); return; }
    setBlockError('');
    onAddBlock(blockSpecimenId, cassetteLabel.trim(), generatedSentence);
    setCassetteLabel('');
  };

  if (!show) return null;

  return (
    <div className="ps-conf-backdrop" onClick={onClose}>
      <div
        className="fm-modal fm-modal--config ps-addorders-modal"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="add-orders-title"
      >
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">
              {isPreGrossComplete ? t('addOrdersModal.eyebrow.grossingInProgress') : t('addOrdersModal.eyebrow.microscopicReview')}
            </div>
            <h2 id="add-orders-title" className="fm-title fm-title--sm">{t('addOrdersModal.title')}</h2>
          </div>
        </div>

        {/* Tabs — order itself is the signal; no separate label needed
            explaining why they're arranged this way. */}
        <div className="ps-addorders-tabs">
          {tabOrder.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`ps-addorders-tab${resolvedActiveTab === tab ? ' ps-addorders-tab--active' : ''}`}
            >
              {t(TAB_LABEL_KEY[tab])}
            </button>
          ))}
        </div>

        <div className="ps-client-editor-body">

          {resolvedActiveTab === 'blocks' && (
            <div>
              <p className="ps-addorders-tab-desc">
                {t('addOrdersModal.blocksTab.description')}
              </p>

              <label className="ps-conf-label">{t('qualityAssurance.common.specimen')}</label>
              <select
                className="ps-conf-input ps-addorders-field-spacing"
                value={blockSpecimenId}
                onChange={e => setBlockSpecimenId(e.target.value)}
              >
                <option value="">{t('addOrdersModal.blocksTab.specimenPlaceholder')}</option>
                {specimens.map(sp => (
                  <option key={sp.id} value={sp.id}>{sp.label}: {sp.description}</option>
                ))}
              </select>

              <label className="ps-conf-label">{t('addOrdersModal.blocksTab.cassetteLabel')}</label>
              <input
                className="ps-conf-input ps-addorders-field-spacing"
                placeholder={t('addOrdersModal.blocksTab.cassettePlaceholder')}
                value={cassetteLabel}
                onChange={e => setCassetteLabel(e.target.value)}
              />

              {selectedSpecimen && (
                <div className="ps-addorders-preview">
                  {t('addOrdersModal.blocksTab.willAppendPrefix')} "{generatedSentence}"
                </div>
              )}

              {blockError && <div className="ps-addorders-error">{blockError}</div>}
            </div>
          )}

          {resolvedActiveTab === 'specimens' && (
            <div>
              <p className="ps-addorders-tab-desc">
                {t('addOrdersModal.specimensTab.description')}
              </p>
              <button className="fm-btn-apply ps-addorders-continue-btn" onClick={onGoToAddSpecimen}>
                {t('addOrdersModal.specimensTab.continueButton')}
              </button>
            </div>
          )}

          {resolvedActiveTab === 'stains' && (
            <div>
              <p className="ps-addorders-tab-desc">
                {t('addOrdersModal.stainsTab.description')}
              </p>
              <button className="fm-btn-apply ps-addorders-continue-btn" onClick={() => onGoToAddStain(activeSpecimenId ?? undefined)}>
                {t('addOrdersModal.stainsTab.continueButton')}
              </button>
            </div>
          )}

        </div>

        <div className="fm-footer">
          <span className="fm-footer-status" />
          <div className="ps-addorders-footer-actions">
            <button onClick={onClose} className="fm-btn-cancel">{t('common.close')}</button>
            {resolvedActiveTab === 'blocks' && (
              <button onClick={handleSubmitBlock} className="fm-btn-apply">{t('addOrdersModal.addBlockButton')}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddOrdersModal;
