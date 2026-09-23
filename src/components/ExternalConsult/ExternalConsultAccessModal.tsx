// src/components/ExternalConsult/ExternalConsultAccessModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-290 — External Consult / Second-Opinion Access. Pathologist-facing
// entry point: issue a scoped, time-limited link for an outside
// consultant, see/revoke what's already been issued for this case.
//
// Mirrors RequestReview/RequestReviewModal.tsx's own real conventions
// (ps-overlay/ps-modal-dark shell, ReactDOM.createPortal, inline-style
// buttons) rather than inventing a new modal shape, per this app's own
// established "match the existing sibling" guidance.
//
// LOUD, DELIBERATE DISCLOSURE — read before changing this file: every
// view here carries a visible warning that the issued link is NOT real,
// cryptographically-secured external access. See
// services/consultAccess/IConsultTokenService.ts's own header for the
// full reasoning. Never remove or soften that banner without the same
// real backend (PS-291) this domain is deliberately waiting on.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import type { Case } from '@/types/case/Case';
import { consultTokenService } from '@/services';
import type { ConsultToken } from '@/services/consultAccess/IConsultTokenService';
import { resolveConsultTokenStatus } from '@/services/consultAccess/IConsultTokenService';
import { computeDefaultConsultTokenExpiry } from '@/services/consultAccess/computeDefaultConsultTokenExpiry';

interface ExternalConsultAccessModalProps {
  isOpen: boolean;
  caseData: Case | null;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
}

interface SlideOption { stainOrderId: string; label: string; }

function flattenSlides(c: Case): SlideOption[] {
  const out: SlideOption[] = [];
  for (const sp of c.specimens ?? []) {
    for (const block of sp.blocks ?? []) {
      for (const stain of block.stains ?? []) {
        out.push({ stainOrderId: stain.id, label: `${sp.label}-${block.label} · ${stain.stainName}` });
      }
    }
  }
  return out;
}

const STATUS_COLOR: Record<string, string> = { Active: '#10b981', Expired: '#f59e0b', Revoked: '#ef4444' };
// The real status value (used for the color lookup above, and as the
// underlying data) stays untouched; only the displayed badge text is
// translated via this label-key map — same pattern as WorklistPage's
// FILTER_LABEL_KEY / MolecularPlateBuilderPage's SAMPLE_TYPE_LABEL_KEY.
const STATUS_LABEL_KEY: Record<string, string> = {
  Active:  'externalConsultAccessModal.status.active',
  Expired: 'externalConsultAccessModal.status.expired',
  Revoked: 'externalConsultAccessModal.status.revoked',
};

const DisclosureBanner: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="eca-disclosure-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="eca-disclosure-icon"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span className="eca-disclosure-text">
        <strong>{t('externalConsultAccessModal.disclosureTitle')}</strong> {t('externalConsultAccessModal.disclosureBody')}
      </span>
    </div>
  );
};

const ExternalConsultAccessModal: React.FC<ExternalConsultAccessModalProps> = ({ isOpen, caseData, currentUserId, currentUserName, onClose }) => {
  const { t } = useTranslation();
  const [view, setView] = useState<'list' | 'issue' | 'created'>('list');
  const [tokens, setTokens] = useState<ConsultToken[]>([]);
  const [loading, setLoading] = useState(true);

  // Issue form state
  const [consultantIdentifier, setConsultantIdentifier] = useState('');
  const [consultantOrganization, setConsultantOrganization] = useState('');
  const [note, setNote] = useState('');
  const [scopeMode, setScopeMode] = useState<'full' | 'slides'>('full');
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTokens = () => {
    if (!caseData) return;
    setLoading(true);
    consultTokenService.getByCaseId(caseData.id).then(res => {
      if (res.ok) setTokens(res.data.slice().sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()));
      setLoading(false);
    });
  };

  useEffect(() => {
    if (isOpen) {
      setView('list');
      setConsultantIdentifier(''); setConsultantOrganization(''); setNote('');
      setScopeMode('full'); setSelectedSlideIds([]); setIssueError(null); setCreatedLink(null); setCopied(false);
      loadTokens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caseData?.id]);

  if (!isOpen) return null;

  const slideOptions = caseData ? flattenSlides(caseData) : [];
  const previewExpiry = computeDefaultConsultTokenExpiry(new Date());
  const caseLabel = caseData ? `${caseData.patient?.lastName}, ${caseData.patient?.firstName}` : undefined;

  const handleIssue = async () => {
    if (!caseData) return;
    if (!consultantIdentifier.trim()) { setIssueError(t('externalConsultAccessModal.consultantRequired')); return; }
    if (scopeMode === 'slides' && selectedSlideIds.length === 0) { setIssueError(t('externalConsultAccessModal.selectAtLeastOneSlide')); return; }

    setIssuing(true);
    setIssueError(null);
    const res = await consultTokenService.issue({
      scope: {
        caseId: caseData.id,
        caseAccessionNumber: caseData.accession?.accessionNumber ?? caseData.id,
        slideIds: scopeMode === 'slides' ? selectedSlideIds : undefined,
      },
      issuedByUserId: currentUserId,
      issuedByName: currentUserName,
      consultantIdentifier: consultantIdentifier.trim(),
      consultantOrganization: consultantOrganization.trim() || undefined,
      note: note.trim() || undefined,
    });
    setIssuing(false);

    if (!res.ok) { setIssueError((res as { ok: false; error: string }).error); return; }
    setCreatedLink(`${window.location.origin}/consult/${res.data.token}`);
    setView('created');
  };

  const handleRevoke = async (id: string) => {
    await consultTokenService.revoke(id, currentUserId);
    loadTokens();
  };

  const toggleSlide = (id: string) => {
    setSelectedSlideIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the link is still shown, selectable by hand */ }
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} className="ps-overlay">
      <div onClick={e => e.stopPropagation()} className="ps-modal-dark ps-review-req-shell eca-modal">
        {/* Header */}
        <div className="eca-header">
          <div>
            <div className="eca-header-eyebrow">
              {t('externalConsultAccessModal.eyebrow')}
            </div>
            <div className="eca-header-title">
              {view === 'issue' ? t('externalConsultAccessModal.issueTitle') : view === 'created' ? t('externalConsultAccessModal.createdTitle') : t('externalConsultAccessModal.listTitle')}
            </div>
            {caseLabel && <div className="eca-header-case" data-phi="true">{caseData?.accession?.accessionNumber} · {caseLabel}</div>}
          </div>
          <button onClick={onClose} className="ps-close-btn" aria-label={t('externalConsultAccessModal.close')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="eca-body">
          <DisclosureBanner />

          {view === 'list' && (
            <>
              <button
                onClick={() => setView('issue')}
                className="eca-issue-btn"
              >
                {t('externalConsultAccessModal.issueNewLink')}
              </button>

              {loading ? (
                <div className="eca-list-empty">{t('externalConsultAccessModal.loading')}</div>
              ) : tokens.length === 0 ? (
                <div className="eca-list-empty">{t('externalConsultAccessModal.noLinksYet')}</div>
              ) : (
                <div className="eca-token-list">
                  {tokens.map(tok => {
                    const status = resolveConsultTokenStatus(tok);
                    return (
                      <div key={tok.id} className="eca-token-card">
                        <div className="eca-token-row">
                          <div className="eca-token-info">
                            {/* Not data-phi: this is the outside consultant's
                                own name, not patient-identifying data. */}
                            <div className="eca-token-identifier">{tok.consultantIdentifier}</div>
                            {tok.consultantOrganization && <div className="eca-token-org">{tok.consultantOrganization}</div>}
                            <div className="eca-token-meta">
                              {tok.scope.slideIds?.length
                                ? t('externalConsultAccessModal.slideCount', { count: tok.scope.slideIds.length })
                                : t('externalConsultAccessModal.fullCase')}
                              {' · '}{t('externalConsultAccessModal.issuedAt', { date: new Date(tok.issuedAt).toLocaleString() })}
                              {' · '}{t('externalConsultAccessModal.expiresAt', { date: new Date(tok.expiresAt).toLocaleString() })}
                            </div>
                            {tok.accessCount > 0 && (
                              <div className="eca-token-viewed">
                                {t('externalConsultAccessModal.viewedCount', {
                                  count: tok.accessCount,
                                  last: tok.lastAccessedAt ? new Date(tok.lastAccessedAt).toLocaleString() : '—',
                                })}
                              </div>
                            )}
                          </div>
                          <div className="eca-token-actions">
                            <span
                              className="eca-status-badge"
                              style={{
                                '--eca-status-color': STATUS_COLOR[status],
                                '--eca-status-border': `${STATUS_COLOR[status]}55`,
                                '--eca-status-bg': `${STATUS_COLOR[status]}18`,
                              } as React.CSSProperties}
                            >
                              {t(STATUS_LABEL_KEY[status] ?? status)}
                            </span>
                            {status === 'Active' && (
                              <button onClick={() => handleRevoke(tok.id)} className="eca-revoke-btn">{t('externalConsultAccessModal.revoke')}</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === 'issue' && (
            <>
              <div>
                <div className="fm-eyebrow">{t('externalConsultAccessModal.consultantIdentifierLabel')} <span className="ps-conf-required">*</span></div>
                <input type="text" placeholder={t('externalConsultAccessModal.consultantIdentifierPlaceholder')} value={consultantIdentifier} onChange={e => setConsultantIdentifier(e.target.value)} className="ps-modal-dark-input" />
                <div className="eca-field-hint">{t('externalConsultAccessModal.noDirectoryLookupHint')}</div>
              </div>

              <div>
                <div className="fm-eyebrow">{t('externalConsultAccessModal.organizationLabel')} <span className="rrm-optional-label">{t('externalConsultAccessModal.optional')}</span></div>
                <input type="text" placeholder={t('externalConsultAccessModal.organizationPlaceholder')} value={consultantOrganization} onChange={e => setConsultantOrganization(e.target.value)} className="ps-modal-dark-input" />
              </div>

              <div>
                <div className="fm-eyebrow">{t('externalConsultAccessModal.accessScopeLabel')}</div>
                <div className="eca-scope-row">
                  {(['full', 'slides'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setScopeMode(m)}
                      className="eca-scope-btn"
                      style={{
                        '--eca-scope-border': scopeMode === m ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.1)',
                        '--eca-scope-bg':     scopeMode === m ? 'rgba(16,185,129,0.15)' : 'transparent',
                        '--eca-scope-color':  scopeMode === m ? '#34d399' : '#64748b',
                      } as React.CSSProperties}
                    >
                      {m === 'full' ? t('externalConsultAccessModal.fullCaseOption') : t('externalConsultAccessModal.specificSlidesOption')}
                    </button>
                  ))}
                </div>
                {scopeMode === 'slides' && (
                  <div className="eca-slide-list">
                    {slideOptions.length === 0 ? (
                      <div className="eca-slide-list-empty">{t('externalConsultAccessModal.noSlidesRecorded')}</div>
                    ) : slideOptions.map(s => (
                      <label key={s.stainOrderId} className="eca-slide-option">
                        <input type="checkbox" checked={selectedSlideIds.includes(s.stainOrderId)} onChange={() => toggleSlide(s.stainOrderId)} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="fm-eyebrow">{t('externalConsultAccessModal.noteLabel')} <span className="rrm-optional-label">{t('externalConsultAccessModal.noteHint')}</span></div>
                <textarea placeholder={t('externalConsultAccessModal.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} rows={2} className="ps-modal-dark-input rrm-textarea" />
              </div>

              <div className="eca-expiry-note">
                {t('externalConsultAccessModal.defaultLifespan')}{' '}
                {t('externalConsultAccessModal.expiresAround')} <strong className="rrm-strong">{previewExpiry.toLocaleString()}</strong>.
              </div>

              {issueError && <div className="eca-issue-error">{issueError}</div>}

              <div className="eca-form-actions">
                <button onClick={() => setView('list')} className="rrm-cancel-btn">{t('externalConsultAccessModal.back')}</button>
                <button onClick={handleIssue} disabled={issuing} className="eca-submit-btn" style={{ '--eca-submit-cursor': issuing ? 'default' : 'pointer' } as React.CSSProperties}>
                  {issuing ? t('externalConsultAccessModal.issuing') : t('externalConsultAccessModal.issueLink')}
                </button>
              </div>
            </>
          )}

          {view === 'created' && createdLink && (
            <>
              <div className="eca-created-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="eca-created-notice-text">{t('externalConsultAccessModal.linkCreatedNotice')}</span>
              </div>
              <div className="eca-created-link-row">
                <input readOnly value={createdLink} className="ps-modal-dark-input eca-created-link-input" onFocus={e => e.currentTarget.select()} />
                <button onClick={handleCopy} className="eca-copy-btn">
                  {copied ? t('externalConsultAccessModal.copied') : t('externalConsultAccessModal.copy')}
                </button>
              </div>
              <div className="eca-done-row">
                <button onClick={() => { setView('list'); loadTokens(); }} className="eca-done-btn">
                  {t('externalConsultAccessModal.done')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExternalConsultAccessModal;
