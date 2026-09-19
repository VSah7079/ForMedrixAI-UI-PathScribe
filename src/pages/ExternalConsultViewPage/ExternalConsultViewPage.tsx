// src/pages/ExternalConsultViewPage/ExternalConsultViewPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-290 — External Consult / Second-Opinion Access, the OUTSIDE half.
// Public, unauthenticated route (`/consult/:token`) — same real,
// deliberate "Station Identity, not per-user login" posture as
// /or-suite-dashboard and /facility-ops-dashboard, but for a
// completely different reason: there IS no PathScribe login for an
// outside consultant to have. The token itself is this page's entire
// authorization — see services/consultAccess/IConsultTokenService.ts's
// own header for the full, load-bearing caveat on what that actually
// means (NOT real cryptographic security).
//
// Deliberately calls mockCaseService.getCase() directly rather than
// routing through caseRouter.getCase() — caseRouter's own
// resolveCaseAccess() enforces PathScribe's INTERNAL session/tenant
// model (services/auth/caseAccessControl.ts), which has no concept of
// an external, token-bearing guest at all. A valid, Active, unexpired
// ConsultToken IS the authorization for this one, specific read — that
// is the entire point of building a token-scoped access path instead of
// just handing out a normal case URL.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockCaseService } from '@/services/cases/mockCaseService';
import { consultTokenService } from '@/services';
import type { Case } from '@/types/case/Case';
import type { ConsultToken, ConsultOpinionSignedStatus } from '@/services/consultAccess/IConsultTokenService';

interface SlideRow { stainOrderId: string; specimenLabel: string; blockLabel: string; stainName: string; }

function flattenSlides(c: Case): SlideRow[] {
  const out: SlideRow[] = [];
  for (const sp of c.specimens ?? []) {
    for (const block of sp.blocks ?? []) {
      for (const stain of block.stains ?? []) {
        out.push({ stainOrderId: stain.id, specimenLabel: sp.label, blockLabel: block.label, stainName: stain.stainName });
      }
    }
  }
  return out;
}

const shellStyle: React.CSSProperties = { minHeight: '100vh', background: '#0b1120', color: '#e2e8f0', fontFamily: 'inherit', padding: '24px 16px' };
const cardStyle: React.CSSProperties = { maxWidth: 720, margin: '0 auto', background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' };

const DisclosureBanner: React.FC = () => (
  <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
      <strong>This is a demo/pilot access link, not a production-secure one.</strong> It relies on an unsigned, opaque URL rather than real cryptographic authentication.
    </span>
  </div>
);

const ExternalConsultViewPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [tokenRecord, setTokenRecord] = useState<ConsultToken | null>(null);
  const [caseRecord, setCaseRecord] = useState<Case | null>(null);

  const [diagnosticCategory, setDiagnosticCategory] = useState('');
  const [signedStatus, setSignedStatus] = useState<ConsultOpinionSignedStatus>('Draft');
  const [opinionText, setOpinionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) { setStatus('invalid'); return; }

    consultTokenService.resolve(token).then(async res => {
      if (cancelled) return;
      if (!res.ok) { setStatus('invalid'); return; }
      const record = (res as { ok: true; data: ConsultToken }).data;
      setTokenRecord(record);

      const c = await mockCaseService.getCase(record.scope.caseId);
      if (cancelled) return;
      if (!c) { setStatus('invalid'); return; }
      setCaseRecord(c);
      setStatus('ready');
      // Recorded once per real page view, not on every resolve() —
      // see IConsultTokenService.ts's own recordAccess() doc comment.
      consultTokenService.recordAccess(record.id);
    });

    return () => { cancelled = true; };
  }, [token]);

  const handleSubmitOpinion = async () => {
    if (!tokenRecord || !caseRecord) return;
    if (!opinionText.trim()) { setSubmitError('An opinion is required before submitting.'); return; }
    setSubmitting(true);
    setSubmitError(null);
    const res = await consultTokenService.submitOpinion({
      tokenId: tokenRecord.id,
      caseId: caseRecord.id,
      consultantIdentifier: tokenRecord.consultantIdentifier,
      diagnosticCategory: diagnosticCategory.trim() || undefined,
      signedStatus,
      opinionText: opinionText.trim(),
    });
    setSubmitting(false);
    if (!res.ok) { setSubmitError((res as { ok: false; error: string }).error); return; }
    setSubmitted(true);
  };

  if (status === 'loading') {
    return <div style={shellStyle}><div style={{ ...cardStyle, padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</div></div>;
  }

  if (status === 'invalid' || !tokenRecord || !caseRecord) {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <DisclosureBanner />
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>This link is invalid or no longer active</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>It may have expired, been revoked, or never existed. Contact the ordering pathologist for a new link.</div>
          </div>
        </div>
      </div>
    );
  }

  const slides = flattenSlides(caseRecord);
  const scopedSlides = tokenRecord.scope.slideIds?.length
    ? slides.filter(s => tokenRecord.scope.slideIds!.includes(s.stainOrderId))
    : slides;

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <DisclosureBanner />

        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', marginBottom: 6 }}>PathScribe External Consult</div>
          <div style={{ fontSize: 20, fontWeight: 700 }} data-phi="accession">{caseRecord.accession?.accessionNumber}</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            {caseRecord.patient?.lastName}, {caseRecord.patient?.firstName}
            {caseRecord.patient?.dateOfBirth && <> · DOB {caseRecord.patient.dateOfBirth}</>}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {tokenRecord.scope.slideIds?.length ? `Scoped access — ${tokenRecord.scope.slideIds.length} slide(s)` : 'Full case access'} · Link expires {new Date(tokenRecord.expiresAt).toLocaleString()}
          </div>
        </div>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>Specimens & Slides</div>
          {caseRecord.specimens?.map(sp => (
            <div key={sp.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{sp.label} — {sp.description}</div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {scopedSlides.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>No slides in scope for this link.</div>
            ) : scopedSlides.map(s => (
              <div key={s.stainOrderId} style={{ fontSize: 12, color: '#cbd5e1', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                {s.specimenLabel}-{s.blockLabel} · {s.stainName}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>Your Opinion</div>
          {submitted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13, color: '#a7f3d0' }}>Your opinion has been recorded and returned to the ordering pathologist.</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Diagnostic Category (optional)</label>
                  <input type="text" value={diagnosticCategory} onChange={e => setDiagnosticCategory(e.target.value)} placeholder="e.g. Benign, Malignant, Indeterminate"
                    style={{ width: '100%', padding: '8px 10px', background: '#0b1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Status</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Draft', 'Signed'] as const).map(s => (
                      <button key={s} onClick={() => setSignedStatus(s)} style={{ padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${signedStatus === s ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.1)'}`, background: signedStatus === s ? 'rgba(16,185,129,0.15)' : 'transparent', color: signedStatus === s ? '#34d399' : '#64748b' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea value={opinionText} onChange={e => setOpinionText(e.target.value)} rows={5}
                placeholder="Enter your diagnostic impression / opinion…"
                style={{ width: '100%', padding: '10px 12px', background: '#0b1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 13, resize: 'vertical' }} />
              {submitError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{submitError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={handleSubmitOpinion} disabled={submitting} style={{ padding: '9px 20px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 8, color: '#34d399', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
                  {submitting ? 'Submitting…' : 'Submit Opinion'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExternalConsultViewPage;
