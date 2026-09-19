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

const DisclosureBanner: React.FC = () => (
  <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8 }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span style={{ fontSize: 11, color: '#fca5a5', lineHeight: 1.5 }}>
      <strong>Demo/pilot only — not real security.</strong> This link is an opaque, unsigned string with no server-side validation behind it. Do not send it to a real external party outside a trusted demo environment. Real, cryptographic token issuance depends on PS-291's own Interface Engine backend, which does not exist yet.
    </span>
  </div>
);

const ExternalConsultAccessModal: React.FC<ExternalConsultAccessModalProps> = ({ isOpen, caseData, currentUserId, currentUserName, onClose }) => {
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
    if (!consultantIdentifier.trim()) { setIssueError('A consultant name or identifier is required.'); return; }
    if (scopeMode === 'slides' && selectedSlideIds.length === 0) { setIssueError('Select at least one slide, or switch to Full Case access.'); return; }

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
      <div onClick={e => e.stopPropagation()} className="ps-modal-dark ps-review-req-shell" style={{ maxWidth: 560 }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid rgba(51,65,85,0.9)', background: 'radial-gradient(circle at top left, rgba(239,68,68,0.08), transparent 55%), #0b1120', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', marginBottom: 4 }}>
              External Consult / Second Opinion
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
              {view === 'issue' ? 'Issue Consult Link' : view === 'created' ? 'Link Created' : 'External Consult Access'}
            </div>
            {caseLabel && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{caseData?.accession?.accessionNumber} · {caseLabel}</div>}
          </div>
          <button onClick={onClose} className="ps-close-btn" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
          <DisclosureBanner />

          {view === 'list' && (
            <>
              <button
                onClick={() => setView('issue')}
                style={{ alignSelf: 'flex-start', padding: '8px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8, color: '#34d399', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                + Issue New Consult Link
              </button>

              {loading ? (
                <div style={{ padding: '16px 12px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>Loading…</div>
              ) : tokens.length === 0 ? (
                <div style={{ padding: '16px 12px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>No consult links issued for this case yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tokens.map(t => {
                    const status = resolveConsultTokenStatus(t);
                    return (
                      <div key={t.id} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{t.consultantIdentifier}</div>
                            {t.consultantOrganization && <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.consultantOrganization}</div>}
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                              {t.scope.slideIds?.length ? `${t.scope.slideIds.length} slide(s)` : 'Full case'} · Issued {new Date(t.issuedAt).toLocaleString()} · Expires {new Date(t.expiresAt).toLocaleString()}
                            </div>
                            {t.accessCount > 0 && <div style={{ fontSize: 11, color: '#64748b' }}>Viewed {t.accessCount}× — last {t.lastAccessedAt ? new Date(t.lastAccessedAt).toLocaleString() : '—'}</div>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}55`, background: `${STATUS_COLOR[status]}18`, borderRadius: 999, padding: '2px 8px' }}>{status}</span>
                            {status === 'Active' && (
                              <button onClick={() => handleRevoke(t.id)} style={{ fontSize: 11, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Revoke</button>
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
                <div className="fm-eyebrow">Consultant Identifier <span style={{ color: '#ef4444' }}>*</span></div>
                <input type="text" placeholder="e.g. Dr. Jane Reviewer, Outside Hospital Dept. of Pathology" value={consultantIdentifier} onChange={e => setConsultantIdentifier(e.target.value)} className="ps-modal-dark-input" />
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Free text — there's no real external-directory lookup to select from.</div>
              </div>

              <div>
                <div className="fm-eyebrow">Organization <span style={{ fontWeight: 400, color: '#334155' }}>(optional)</span></div>
                <input type="text" placeholder="e.g. Memorial Pathology Associates" value={consultantOrganization} onChange={e => setConsultantOrganization(e.target.value)} className="ps-modal-dark-input" />
              </div>

              <div>
                <div className="fm-eyebrow">Access Scope</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['full', 'slides'] as const).map(m => (
                    <button key={m} onClick={() => setScopeMode(m)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${scopeMode === m ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.1)'}`, background: scopeMode === m ? 'rgba(16,185,129,0.15)' : 'transparent', color: scopeMode === m ? '#34d399' : '#64748b' }}>
                      {m === 'full' ? 'Full Case' : 'Specific Slides'}
                    </button>
                  ))}
                </div>
                {scopeMode === 'slides' && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 8 }}>
                    {slideOptions.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#64748b' }}>No slides recorded on this case yet.</div>
                    ) : slideOptions.map(s => (
                      <label key={s.stainOrderId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedSlideIds.includes(s.stainOrderId)} onChange={() => toggleSlide(s.stainOrderId)} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="fm-eyebrow">Note <span style={{ fontWeight: 400, color: '#334155' }}>(optional, internal only — never shown to the consultant)</span></div>
                <textarea placeholder="e.g. Requesting a second opinion on the deep margin call." value={note} onChange={e => setNote(e.target.value)} rows={2} className="ps-modal-dark-input" style={{ resize: 'vertical' }} />
              </div>

              <div style={{ fontSize: 11, color: '#64748b' }}>
                Default lifespan: 24 hours (72 hours if that window would span a weekend). This link would expire around <strong style={{ color: '#94a3b8' }}>{previewExpiry.toLocaleString()}</strong>.
              </div>

              {issueError && <div style={{ fontSize: 12, color: '#ef4444' }}>{issueError}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setView('list')} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>Back</button>
                <button onClick={handleIssue} disabled={issuing} style={{ padding: '8px 20px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 8, color: '#34d399', fontSize: 13, fontWeight: 600, cursor: issuing ? 'default' : 'pointer' }}>
                  {issuing ? 'Issuing…' : 'Issue Link'}
                </button>
              </div>
            </>
          )}

          {view === 'created' && createdLink && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: 12, color: '#a7f3d0' }}>Consult link created. Copy it and share it through whatever channel you'd use for this consultant.</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={createdLink} className="ps-modal-dark-input" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} onFocus={e => e.currentTarget.select()} />
                <button onClick={handleCopy} style={{ padding: '8px 14px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8, color: '#34d399', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setView('list'); loadTokens(); }} style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Done
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
