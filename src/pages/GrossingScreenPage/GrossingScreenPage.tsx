// src/pages/GrossingScreenPage/GrossingScreenPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 3: "New workflow surface between accessioning and sign-out. The
// grossing tech operates here; the pathologist does not." A
// deliberately separate, dedicated page from SynopticReportPage.tsx
// (the pathologist's own reporting surface) — reuses the exact same
// real Specimen/HistologyBlock/StainOrder data model (no parallel
// schema), routed via the same real case-access-control loader
// (synopticLoader — see App.tsx) since a grossing tech needs the same
// real pediatric/orchestration access checks a pathologist does.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { protocolService, stainTypeService, batchService, actionRegistryService } from '@/services';
import { canCompleteGrossingFrom } from '@/services/grossing/grossingCompletion';
import { VOICE_CONTEXT } from '@/constants/systemActions';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { formatList } from '@/utils/formatList';
import { formatDateTime } from '@/utils/formatDate';
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock } from '@/types/case/Specimen';
import type { Protocol, ProtocolPathway } from '@/services/protocols/IProtocolService';
import type { StainType } from '@/services/stains/IStainService';
import type { Batch } from '@/services/batches/IBatchService';
import { useGrossingScreen } from './hooks/useGrossingScreen';

function findPathwayForBlock(protocol: Protocol | undefined, block: HistologyBlock): ProtocolPathway | undefined {
  if (!protocol || !block.sourcePathwayName) return undefined;
  return protocol.pathways.find(p => p.pathwayName === block.sourcePathwayName);
}

const GrossingScreenPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [fovByDisplayId, setFovByDisplayId] = useState<Map<string, { masterBarcode: string; fovCount?: number }>>(new Map());
  const [concurrencyConflict, setConcurrencyConflict] = useState<{ actualVersion: number } | null>(null);
  const knownVersionRef = useRef(0);
  const [addStainForBlock, setAddStainForBlock] = useState<{ specimenId: string; blockId: string } | null>(null);
  const [selectedStainId, setSelectedStainId] = useState('');
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!caseId) return;
    caseRouter.getCase(caseId).then(c => { setCaseData(c ?? null); knownVersionRef.current = (c as any)?.version ?? 0; setIsLoaded(true); });
  }, [caseId]);

  useEffect(() => {
    protocolService.getAll().then(res => { if (res.ok) setProtocols(res.data); });
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
    // Real, per the spec's own cytology block-table column "Imager
    // batch · FOV count" — built once from every real batch's own
    // items, keyed by displayId (the same real identifier a
    // StainOrder/decant slide already carries), rather than a second,
    // separate per-slide fetch for each row.
    batchService.getAll().then(res => {
      if (!res.ok) return;
      const map = new Map<string, { masterBarcode: string; fovCount?: number }>();
      for (const batch of res.data as Batch[]) {
        for (const item of batch.items) {
          map.set(item.displayId, { masterBarcode: batch.masterBarcode, fovCount: item.fovCount });
        }
      }
      setFovByDisplayId(map);
    });
  }, []);

  const {
    missingItems, handleCompleteGrossing, completeRefusal,
    secondaryReviewSpecimens, pendingProtocolConfirmation, confirmCompleteWithoutProtocol, cancelCompleteWithoutProtocol,
    completionReview,
    handleAddBlock, handleRemoveBlock, handleAddStain, handleRemoveStain,
    pendingStainRemoval, confirmPendingStainRemoval, cancelPendingStainRemoval,
    handleUpdatePieceCount, handleRecordFixationEnded, handleConfirmFixativeRatio,
    handleRaiseFixationDeficiency, specimensWithOpenFixationDeficiency,
  } = useGrossingScreen({ caseData, setCaseData: setCaseData as any, signingUser: user, knownVersionRef, setConcurrencyConflict });

  // Batch 378 (Pete): Complete grossing can be asked for by voice or keyboard
  // too ("complete grossing", Alt+Shift+F9, action GROSSING_COMPLETE). The
  // service decides whether it can happen, exactly as for the button.
  // Batch 379: the "complete without a protocol?" confirmation can be
  // answered the same way (GROSSING_COMPLETE_CONFIRM / _CANCEL).
  useEffect(() => {
    actionRegistryService.setCurrentContext(VOICE_CONTEXT.GROSSING);
    const unsubscribe = actionRegistryService.onAction((actionId: string) => {
      if (actionId === 'GROSSING_COMPLETE') void handleCompleteGrossing();
      else if (actionId === 'GROSSING_COMPLETE_CONFIRM' && pendingProtocolConfirmation) void confirmCompleteWithoutProtocol();
      else if (actionId === 'GROSSING_COMPLETE_CANCEL' && pendingProtocolConfirmation) cancelCompleteWithoutProtocol();
    });
    return () => { unsubscribe(); actionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST); };
  }, [handleCompleteGrossing, pendingProtocolConfirmation, confirmCompleteWithoutProtocol, cancelCompleteWithoutProtocol]);

  const onRemoveBlock = useCallback(async (specimenId: string, blockId: string) => {
    const result = await handleRemoveBlock(specimenId, blockId);
    if (!result.ok) window.alert(t('grossingScreen.removeBlockFailed'));
  }, [handleRemoveBlock, t]);

  const onRemoveStainClick = useCallback(async (specimenId: string, blockId: string, stainId: string) => {
    await handleRemoveStain(specimenId, blockId, stainId);
  }, [handleRemoveStain]);

  const toggleAudit = (specimenId: string) => {
    setExpandedAudit(prev => {
      const next = new Set(prev);
      if (next.has(specimenId)) next.delete(specimenId); else next.add(specimenId);
      return next;
    });
  };

  if (!isLoaded) return <div className="ps-grossing-screen-loading">{t('common.loading')}</div>;
  if (!caseData) return <div className="ps-grossing-screen-loading">{t('grossingScreen.caseNotFound')}</div>;

  return (
    <div className="ps-grossing-screen-page">
      <div className="ps-grossing-screen-header">
        <button className="ps-btn-secondary" onClick={() => navigate(`/case/${caseId}/synoptic`)}>
          {t('grossingScreen.backToCase')}
        </button>
        <h1 className="ps-grossing-screen-title" data-phi="accession">{t('grossingScreen.pageTitle', { accession: caseData.accession?.fullAccession ?? caseData.id })}</h1>
      </div>

      {/* Batch 378 (PS-359): Complete grossing, checked against the
          organisation's Grossing field requirements. */}
      <div className="ps-grossing-complete-bar">
        {caseData.status === 'gross-complete' ? (
          <>
            <span className="ps-grossing-complete-done">✓ {t('grossingScreen.complete.done')}</span>
            {completionReview && completionReview.routedForReview.length > 0 && (
              <p className="ps-grossing-complete-review" role="status">
                {t('grossingScreen.complete.routedForReview', { count: completionReview.routedForReview.length, specimens: formatList(completionReview.routedForReview, i18n.language) })}
              </p>
            )}
            {completionReview && completionReview.reviewNotRaised.length > 0 && (
              <p className="ps-grossing-complete-error" role="alert">
                {t('grossingScreen.complete.reviewNotRaised', { count: completionReview.reviewNotRaised.length, specimens: formatList(completionReview.reviewNotRaised, i18n.language) })}
              </p>
            )}
          </>
        ) : canCompleteGrossingFrom(caseData.status) ? (
          <>
            <CapabilityButton capability="case:grossing:complete" className="ps-btn-primary"
              context={{ caseId: caseData.id, facilityId: caseData.order?.facilityId ?? null }}
              disabled={missingItems.length > 0} onClick={() => { void handleCompleteGrossing(); }}>
              {t('grossingScreen.complete.button')}
            </CapabilityButton>
            {missingItems.length > 0 && (
              <p className="ps-grossing-complete-missing" role="status">
                {t('fieldRequirements.stillRequired', { fields: formatList(missingItems.map(m => m.where.length
                  ? t('grossingScreen.complete.missingAt', { field: t(`fieldRequirements.fields.grossing.${m.fieldId}`), where: formatList(m.where, i18n.language) })
                  : t(`fieldRequirements.fields.grossing.${m.fieldId}`)), i18n.language) })}
              </p>
            )}
            {missingItems.length === 0 && secondaryReviewSpecimens.length > 0 && (
              <p className="ps-grossing-complete-review" role="status">
                {t('grossingScreen.complete.reviewNotice', { count: secondaryReviewSpecimens.length, specimens: formatList(secondaryReviewSpecimens, i18n.language) })}
              </p>
            )}
            {completeRefusal && completeRefusal !== 'missing' && completeRefusal !== 'needsConfirmation' && (
              <p className="ps-grossing-complete-error" role="alert">{t(`grossingScreen.complete.refusals.${completeRefusal}`)}</p>
            )}
          </>
        ) : (
          <span className="ps-grossing-complete-past">{t('grossingScreen.complete.pastGrossing')}</span>
        )}
      </div>

      {(caseData.specimens ?? []).map((sp: Specimen) => {
        const protocol = sp.protocolSnapshot ? protocols.find(p => p.id === sp.protocolSnapshot!.id) : undefined;
        const blocks = sp.blocks ?? [];
        const decants = sp.decants ?? [];
        const protocolModified = blocks.some(b => b.userModified);
        const overrides = sp.grossingOverrides ?? [];
        // Real — the block-kind pathways this specimen's own protocol
        // offers for a real "Add Block" (another instance of that
        // same pathway's own defaults). A specimen with no
        // protocolSnapshot, or whose protocol has no block-kind
        // pathway, simply has nothing to add from — Add Block doesn't
        // render at all rather than offering a meaningless choice.
        const addableBlockPathways = (protocol?.pathways ?? []).filter(p => p.materialKind === 'block');

        return (
          <div key={sp.id} className="ps-grossing-specimen-section">
            <div className="ps-grossing-protocol-header">
              <div className="ps-grossing-protocol-specimen">{t('grossingScreen.specimenHeader', { label: sp.label, description: sp.description })}</div>
              {sp.protocolSnapshot ? (
                <div className="ps-grossing-protocol-info">
                  {t('grossingScreen.protocolVersion', { name: sp.protocolSnapshot.name, version: sp.protocolSnapshot.version })}
                  {protocolModified && <span className="ps-grossing-protocol-modified-badge">{t('grossingScreen.protocolModified')}</span>}
                </div>
              ) : (
                <div className="ps-grossing-protocol-info ps-grossing-protocol-info--none">{t('grossingScreen.noProtocol')}</div>
              )}
            </div>

            {/* Real, per direct request (ISO 15189 traceability) —
                record only, no gating. Fixation end is the real,
                natural moment tissue actually leaves the fixative at
                grossing; the ratio confirmation is a real, qualitative
                judgment call, not a computed number — see
                Specimen.ts's own doc comments for the full reasoning. */}
            <div className="ps-grossing-fixation-tracking">
              <div className="ps-grossing-fixation-field">
                <span className="ps-grossing-fixation-label">{t('grossingScreen.fixation.endedLabel')}</span>
                {sp.processing?.fixationEndedAt ? (
                  <span className="ps-grossing-fixation-value">{formatDateTime(sp.processing.fixationEndedAt, i18n.language)}</span>
                ) : (
                  <button type="button" className="ps-grossing-fixation-action" onClick={() => handleRecordFixationEnded(sp.id)}>
                    {t('grossingScreen.fixation.recordNow')}
                  </button>
                )}
              </div>
              <div className="ps-grossing-fixation-field">
                <span className="ps-grossing-fixation-label">{t('grossingScreen.fixation.ratioLabel')}</span>
                {sp.processing?.fixativeToTissueRatioConfirmation ? (
                  <span className="ps-grossing-fixation-value">
                    {t('grossingScreen.fixation.ratioConfirmedBy', {
                      name: sp.processing.fixativeToTissueRatioConfirmation.userName,
                      when: formatDateTime(sp.processing.fixativeToTissueRatioConfirmation.confirmedAt, i18n.language),
                    })}
                  </span>
                ) : (
                  <button type="button" className="ps-grossing-fixation-action" onClick={() => handleConfirmFixativeRatio(sp.id)}>
                    {t('grossingScreen.fixation.confirmRatio')}
                  </button>
                )}
              </div>
              {/* Real, per direct decision — a human, not a gate, raises
                  this. Only offered while real fixation data is
                  genuinely still missing; once both are recorded above,
                  there's nothing left to flag. */}
              {(!sp.processing?.fixationEndedAt || !sp.processing?.fixativeToTissueRatioConfirmation) && (
                specimensWithOpenFixationDeficiency.has(sp.id) ? (
                  <div className="ps-grossing-fixation-field">
                    <span className="ps-grossing-fixation-value ps-grossing-fixation-value--flagged">{t('grossingScreen.fixation.deficiencyRaised')}</span>
                  </div>
                ) : (
                  <div className="ps-grossing-fixation-field">
                    <button type="button" className="ps-grossing-fixation-action ps-grossing-fixation-action--deficiency" onClick={() => handleRaiseFixationDeficiency(sp.id)}>
                      {t('grossingScreen.fixation.raiseDeficiency')}
                    </button>
                  </div>
                )
              )}
            </div>

            {blocks.length > 0 && (
              <table className="ps-grossing-block-table">
                <thead>
                  <tr>
                    <th>{t('grossingScreen.col.blockId')}</th>
                    <th>{t('grossingScreen.col.pieceCount')}</th>
                    <th>{t('grossingScreen.col.stains')}</th>
                    <th>{t('grossingScreen.col.status')}</th>
                    <th>{t('grossingScreen.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map(block => {
                    const pathway = findPathwayForBlock(protocol, block);
                    const allowedIds = pathway?.allowedAdditionalStainTypeIds;
                    const availableStainTypes = allowedIds ? stainTypes.filter(s => allowedIds.includes(s.id)) : stainTypes;
                    return (
                      <tr key={block.id} className={block.userModified ? 'ps-grossing-block-row--modified' : ''}>
                        <td>{sp.label}{block.label}</td>
                        <td>
                          <input
                            type="number" min={0} className="ps-grossing-piece-count-input"
                            defaultValue={block.pieceCount ?? ''}
                            onBlur={e => {
                              const n = parseInt(e.target.value, 10);
                              if (!isNaN(n) && n !== block.pieceCount) handleUpdatePieceCount(sp.id, block.id, n);
                            }}
                          />
                        </td>
                        <td>
                          <ul className="ps-grossing-stain-list">
                            {block.stains.map(stain => (
                              <li key={stain.id} className={stain.userAdded ? 'ps-grossing-stain--user-added' : 'ps-grossing-stain--auto'}>
                                <span>{stain.stainName}</span>
                                <span className="ps-grossing-stain-flag">
                                  {stain.userAdded ? t('grossingScreen.userAdded') : t('grossingScreen.autoGenerated')}
                                </span>
                                <button
                                  type="button" className="ps-grossing-stain-remove"
                                  title={t('grossingScreen.removeStainTitle')}
                                  onClick={() => onRemoveStainClick(sp.id, block.id, stain.id)}
                                >×</button>
                              </li>
                            ))}
                          </ul>
                          {addStainForBlock?.specimenId === sp.id && addStainForBlock.blockId === block.id ? (
                            <div className="ps-grossing-add-stain-row">
                              <select className="ps-batch-select" value={selectedStainId} onChange={e => setSelectedStainId(e.target.value)}>
                                <option value="">{t('grossingScreen.selectStain')}</option>
                                {availableStainTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                              <button
                                type="button" className="ps-btn-secondary" disabled={!selectedStainId}
                                onClick={() => {
                                  const st = stainTypes.find(s => s.id === selectedStainId);
                                  if (st) handleAddStain(sp.id, block.id, st);
                                  setAddStainForBlock(null); setSelectedStainId('');
                                }}
                              >{t('common.add')}</button>
                              <button type="button" className="ps-grossing-stain-remove" onClick={() => setAddStainForBlock(null)}>×</button>
                            </div>
                          ) : (
                            <button type="button" className="ps-grossing-add-stain-link" onClick={() => setAddStainForBlock({ specimenId: sp.id, blockId: block.id })}>
                              + {t('grossingScreen.addStain')}
                            </button>
                          )}
                        </td>
                        <td>{block.status}</td>
                        <td>
                          <button
                            type="button" className="ps-btn-secondary"
                            disabled={block.status !== 'Pending'}
                            title={block.status !== 'Pending' ? t('grossingScreen.removeBlockedTitle', { status: block.status }) : undefined}
                            onClick={() => onRemoveBlock(sp.id, block.id)}
                          >
                            {t('grossingScreen.removeBlock')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {decants.length > 0 && (
              <table className="ps-grossing-block-table">
                <thead>
                  <tr>
                    <th>{t('grossingScreen.col.slideId')}</th>
                    <th>{t('grossingScreen.col.stain')}</th>
                    <th>{t('grossingScreen.col.imagerBatch')}</th>
                    <th>{t('grossingScreen.col.fovCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {decants.flatMap(decant => decant.stains.map(stain => {
                    const fov = stain.displayId ? fovByDisplayId.get(stain.displayId) : undefined;
                    return (
                      <tr key={stain.id}>
                        <td>{stain.displayId ?? `${sp.label}${decant.label}`}</td>
                        <td>{stain.stainName}</td>
                        <td>{fov?.masterBarcode ?? t('grossingScreen.notYetImaged')}</td>
                        <td>{fov?.fovCount ?? '—'}</td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            )}

            {addableBlockPathways.length > 0 && (
              <div className="ps-grossing-add-block-row">
                {addableBlockPathways.map(pathway => (
                  <button key={pathway.id} type="button" className="ps-btn-secondary" onClick={() => handleAddBlock(sp.id, pathway)}>
                    + {t('grossingScreen.addBlock', { pathwayName: pathway.pathwayName })}
                  </button>
                ))}
              </div>
            )}

            <div className="ps-grossing-audit-panel">
              <button className="ps-grossing-audit-header" onClick={() => toggleAudit(sp.id)}>
                <span>{t('grossingScreen.auditPanelTitle', { count: overrides.length })}</span>
                <span>{expandedAudit.has(sp.id) ? '▾' : '▸'}</span>
              </button>
              {expandedAudit.has(sp.id) && (
                <div className="ps-grossing-audit-body">
                  {overrides.length === 0 ? (
                    <div className="ps-grossing-audit-empty">{t('grossingScreen.noOverrides')}</div>
                  ) : (
                    overrides.map((ov, i) => (
                      <div key={i} className="ps-grossing-audit-row">
                        {t('grossingScreen.auditEntry', {
                          blockLabel: ov.blockLabel, field: t(`grossingScreen.auditField.${ov.field}`),
                          originalValue: ov.originalValue, newValue: ov.newValue, actor: ov.actor,
                          timestamp: formatDateTime(ov.timestamp, i18n.language),
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {pendingStainRemoval && (
        <div className="ps-overlay" onClick={cancelPendingStainRemoval}>
          <div className="ps-modal-dark" onClick={e => e.stopPropagation()}>
            <div className="ps-batch-modal-header">
              <div className="ps-batch-modal-title">{t('grossingScreen.confirmRemoveStainTitle')}</div>
            </div>
            <div className="ps-batch-modal-body">
              <p>{t('grossingScreen.confirmRemoveStainBody')}</p>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={cancelPendingStainRemoval}>{t('common.cancel')}</button>
              <button className="ps-btn-primary" onClick={confirmPendingStainRemoval}>{t('grossingScreen.confirmRemove')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch 379 (Pete): the organisation has switched off the protocol
          rule, and some specimens have no protocol. Completing routes each
          of them for secondary review. */}
      {pendingProtocolConfirmation && (
        <div className="ps-overlay" onClick={cancelCompleteWithoutProtocol}>
          <div className="ps-modal-dark" role="alertdialog" aria-labelledby="grossing-no-protocol-title" onClick={e => e.stopPropagation()}>
            <div className="ps-batch-modal-header">
              <div id="grossing-no-protocol-title" className="ps-batch-modal-title">{t('grossingScreen.complete.withoutProtocol.title')}</div>
            </div>
            <div className="ps-batch-modal-body">
              <p>{t('grossingScreen.complete.withoutProtocol.body', { count: pendingProtocolConfirmation.length })}</p>
              <p className="ps-grossing-complete-review">
                {t('grossingScreen.complete.withoutProtocol.specimens', { count: pendingProtocolConfirmation.length, specimens: formatList(pendingProtocolConfirmation, i18n.language) })}
              </p>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={cancelCompleteWithoutProtocol}>{t('common.cancel')}</button>
              <button className="ps-btn-primary" onClick={() => { void confirmCompleteWithoutProtocol(); }}>{t('grossingScreen.complete.withoutProtocol.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {concurrencyConflict && (
        <div className="ps-overlay">
          <div className="ps-modal-dark">
            <div className="ps-batch-modal-body">{t('grossingScreen.concurrencyConflict')}</div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-primary" onClick={() => window.location.reload()}>{t('grossingScreen.reload')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrossingScreenPage;
