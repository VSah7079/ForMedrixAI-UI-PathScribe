// src/pages/SynopticReportPage/components/LeftReportPanel.tsx
import React, { useEffect } from 'react';
import type { Case } from '@/types/case/Case';
import { useAuth } from '@/contexts/AuthContext';
import InternalNotesDrawer from '@/components/InternalNotes/InternalNotesDrawer';
import { internalNoteService, informalReviewService } from '@/services';
import type { InformalReviewRequest } from '@/types/reports/InformalReviewRequest';
import { getMarkersFromAnswers, type MarkerAnswer } from '@/orchestrator/contextBuilder';
import { getTemplate } from '@/services/templates/templateService';
import { matchSourceText } from '@/utils/sourceTextMatching';
import MarkersPanel from './MarkersPanel';
import { buildWatermarkBackgroundImage } from './PendingReleaseWatermark';
import { mockReportReleaseService } from '@/services/reportRelease/mockReportReleaseService';

interface LeftReportPanelProps {
  caseData: Case | null;
  highlightText?: string;
  /** Fired once per highlightText change, reporting whether a real,
   *  verbatim match was actually found in the report text. Lets the
   *  right panel show an honest "source not found" indicator next to
   *  the field that triggered the highlight, instead of a silent
   *  no-op when the AI's cited source can't be located. */
  onMatchResolved?: (found: boolean) => void;
  /** Real feature, per direct follow-up: "I assume we will launch the
   *  Internal Notes Drawer when the case gets selected from the
   *  worklist or the message." Set true when arriving via the
   *  Informal Review Worklist tile or a message case link — opens the
   *  drawer immediately, skipping the extra click. */
  autoOpenNotes?: boolean;
}

// Splits text and wraps matching substring in a highlight mark.
// The ref callback fires whenever the mark mounts so we can scroll to it.
const HighlightedText: React.FC<{
  text: string;
  highlight?: string;
  onMarkMount?: (el: HTMLElement | null) => void;
}> = ({ text, highlight, onMarkMount }) => {
  if (!highlight || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        ref={onMarkMount}
        style={{
          background: 'rgba(251,191,36,0.45)',
          color: '#fde68a',
          borderRadius: 3,
          padding: '1px 4px',
          boxShadow: '0 0 0 2px rgba(251,191,36,0.5)',
          animation: 'ps-highlight-pop 0.5s ease',
        }}
      >
        {text.slice(idx, idx + highlight.length)}
      </mark>
      {text.slice(idx + highlight.length)}
    </>
  );
};

const LeftReportPanel: React.FC<LeftReportPanelProps> = ({ caseData, highlightText, onMatchResolved, autoOpenNotes }) => {
  const { user } = useAuth();
  const [notesOpen, setNotesOpen] = React.useState(!!autoOpenNotes);
  const [unreadNoteCount, setUnreadNoteCount] = React.useState(0);
  // Real feature, per direct follow-up: "if there is a review that
  // hasn't been opened, I would like to have some sort of effect in
  // synopticreportpage's Internal Notes button." A real, published-
  // but-not-yet-seen-by-the-requester InformalReviewRequest for this
  // exact case, where the current user is the one who originally
  // asked for the review. Never guesses — only a real, matched request
  // triggers this, and it's cleared the moment the drawer is opened.
  const [pendingReview, setPendingReview] = React.useState<InformalReviewRequest | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Real feature, per direct specification: Post-Sign-Out Release
  // Buffer, Phase 3. The real, org-configured watermark text — fetched
  // once per mount, not re-resolved on every render. watermarkText is
  // deliberately enterprise-only (see ReportReleaseOrgConfig's own doc
  // comment), so a plain getOrgDefault() suffices here — no per-
  // facility async resolution needed the way resolveBufferForCase()
  // itself requires.
  const isPendingRelease = caseData?.status === 'pending-release';
  const [watermarkText, setWatermarkText] = React.useState('');
  useEffect(() => {
    if (!isPendingRelease) return;
    mockReportReleaseService.getOrgDefault().then(res => {
      if (res.ok) setWatermarkText(res.data.watermarkText);
    });
  }, [isPendingRelease]);

  // Count shared notes by other authors — proxy for "unread colleague notes"
  useEffect(() => {
    if (!caseData) return;
    // Real fix, found while wiring the Informal Review effect: this
    // resolution was missing the same `?? caseData.id` fallback the
    // real InternalNotesDrawer instantiation below already has — a
    // case with neither accession.fullAccession nor accessionNumber
    // set would silently skip this fetch entirely (the early return
    // below), while the drawer itself still worked fine via its own
    // fallback. Same accession value both places now.
    const accession = caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? caseData.id ?? '';
    if (!accession) return;
    internalNoteService.getForCase(accession, user?.id ?? 'u1').then(result => {
      if (result.ok) {
        const count = result.data.filter(n => n.authorId !== (user?.id ?? 'u1') && n.visibility === 'shared').length;
        setUnreadNoteCount(count);
      }
    }).catch(() => {});
  }, [caseData, user?.id]);

  // Real feature, per direct follow-up: find a real, published,
  // not-yet-seen review the current user originally requested on this
  // case, to drive the button's visual effect.
  useEffect(() => {
    if (!caseData?.id || !user?.id) { setPendingReview(null); return; }
    informalReviewService.getSentByRequester(user.id).then(res => {
      if (!res.ok) return;
      const match = res.data.find(r => r.caseId === caseData.id && r.status === 'published');
      setPendingReview(match ?? null);
    }).catch(() => {});
  }, [caseData?.id, user?.id]);

  // Opening the drawer while a real, published review is waiting is
  // the real "seen" event — closes the request out and clears the
  // button's effect immediately, not on some separate, extra action.
  useEffect(() => {
    if (notesOpen && pendingReview) {
      informalReviewService.markSeenByRequester(pendingReview.id).catch(() => {});
      setPendingReview(null);
    }
  }, [notesOpen, pendingReview]);
  

  // Phase D of the biomarker display work. Resolves
  // markers across ALL of this case's synoptic report instances (a case can
  // have more than one specimen, each with its own template) -- template-
  // agnostic by design via getMarkersFromAnswers(), so this works
  // automatically for any template with a "biomarkers" section, present or
  // future, with zero changes needed here.
  const [markers, setMarkers] = React.useState<MarkerAnswer[]>([]);
  useEffect(() => {
    if (!caseData?.synopticReports?.length) { setMarkers([]); return; }
    let cancelled = false;
    Promise.all(
      caseData.synopticReports.map(async (inst: any) => {
        const detail = await getTemplate(inst.templateId);
        return detail ? getMarkersFromAnswers(inst.answers ?? {}, detail.template) : [];
      })
    ).then(results => {
      if (!cancelled) setMarkers(results.flat());
    }).catch(() => { if (!cancelled) setMarkers([]); });
    return () => { cancelled = true; };
  }, [caseData?.synopticReports]);

  const sections = caseData ? [
    { title: 'CLINICAL HISTORY',     text: caseData.order?.clinicalIndication ?? '(not recorded)' },
    { title: 'GROSS DESCRIPTION',    text: caseData.diagnostic?.grossDescription ?? '(not recorded)' },
    { title: 'MICROSCOPIC FINDINGS', text: caseData.diagnostic?.microscopicDescription ?? '(not recorded)' },
    { title: 'ANCILLARY STUDIES',    text: caseData.diagnostic?.ancillaryStudies ?? '(not recorded)' },
  ] : [];

  // Extract the quoted phrase from source strings like 'Gross: "2.3 × 1.8 × 1.5 cm"'
  // Falls back to progressively shorter word sequences if the full phrase isn't found.
  // Shared with the finalize-time proactive check — see sourceTextMatching.ts.
  const matchResult = React.useMemo(
    () => matchSourceText(highlightText, caseData),
    [highlightText, caseData]
  );

  const matchPhrase = matchResult.phrase;

  // Report whether the highlight actually resolved, once per
  // highlightText change — lets the right panel show an honest
  // indicator next to the field instead of a silent no-op.
  useEffect(() => {
    if (highlightText) onMatchResolved?.(matchResult.found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightText, matchResult.found]);

  // Scroll the panel to bring the highlighted mark into view whenever it changes
  const handleMarkMount = React.useCallback((el: HTMLElement | null) => {
    if (el && scrollRef.current) {
      // Small delay so the DOM has settled before we measure
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#111827',
        // Real fix: background-image + backgroundAttachment: 'local'
        // scrolls WITH this element's own content, tiling the real,
        // configured watermark text across the full scrollable height
        // — not just the initially-visible viewport. See
        // PendingReleaseWatermark.tsx's own header comment for the
        // real bug this specifically avoids.
        backgroundImage: isPendingRelease && watermarkText ? buildWatermarkBackgroundImage(watermarkText) : undefined,
        backgroundRepeat: isPendingRelease && watermarkText ? 'repeat' : undefined,
        backgroundAttachment: isPendingRelease && watermarkText ? 'local' : undefined,
        borderRight: '1px solid rgba(8,145,178,0.3)',
        overflowY: 'auto',
        padding: '16px 32px 32px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes ps-highlight-pop {
          0%   { background: rgba(251,191,36,0.9); box-shadow: 0 0 0 4px rgba(251,191,36,0.7); }
          100% { background: rgba(251,191,36,0.45); box-shadow: 0 0 0 2px rgba(251,191,36,0.5); }
        }
        @keyframes ps-review-waiting-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.55); }
          50%      { box-shadow: 0 0 0 6px rgba(139,92,246,0); }
        }
      `}</style>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid rgba(8,145,178,0.4)', paddingBottom: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          📋 Full Patient Report
        </h3>
        {caseData && (
          <button
            onClick={() => setNotesOpen(true)}
            title={pendingReview ? `${pendingReview.toUserName} published an informal review — click to view` : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px',
              background: pendingReview ? 'rgba(139,92,246,0.16)' : 'rgba(8,145,178,0.12)',
              border: pendingReview ? '1px solid rgba(139,92,246,0.55)' : '1px solid rgba(8,145,178,0.3)',
              borderRadius: '6px', color: pendingReview ? '#a78bfa' : '#0891B2',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s', position: 'relative',
              animation: pendingReview ? 'ps-review-waiting-pulse 1.8s ease-in-out infinite' : undefined,
            }}
            onMouseEnter={e => e.currentTarget.style.background = pendingReview ? 'rgba(139,92,246,0.28)' : 'rgba(8,145,178,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = pendingReview ? 'rgba(139,92,246,0.16)' : 'rgba(8,145,178,0.12)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Internal Notes
            {pendingReview && (
              <span style={{ background: '#8B5CF6', color: '#fff', borderRadius: '10px', padding: '0 6px', height: 16, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                Review Ready
              </span>
            )}
            {!pendingReview && unreadNoteCount > 0 && (
              <span style={{ background: '#F59E0B', color: '#000', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {unreadNoteCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Internal Notes Drawer */}
      {notesOpen && caseData && (
        <InternalNotesDrawer
          accession={caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? caseData.id ?? ''}
          userId={user?.id ?? 'u1'}
          userName={user?.name ?? 'Unknown'}
          onClose={() => setNotesOpen(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.2)', borderRadius: '6px', marginBottom: '16px', fontSize: '11px', color: '#38bdf8' }}>
        🔒 <span>Received from LIS — <strong>read-only</strong>.</span>
      </div>

      {!caseData ? (
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>No case loaded.</p>
      ) : (
        <>
          {/* Patient info row — compact single row, CAP two-identifier
              minimum (Pete: case number, MRN, Name, DOB). Sex/Priority
              dropped from always-visible display -- not patient
              identifiers, and keeping this simple rather than adding
              another toggle/overlay so soon after removing the broken
              full-screen review feature. Case number kept even though
              it's a case (not patient) identifier -- it's what ties this
              panel to a specific specimen while scrolling a long report. */}
          <div className="ps-patient-info-row">
            {[
              { label: 'Case',    value: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? '—', mono: true },
              { label: 'MRN',     value: caseData.patient?.mrn ?? '—' },
              { label: 'Patient', value: caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '—' },
              { label: 'DOB',     value: caseData.patient?.dateOfBirth ? new Date(caseData.patient.dateOfBirth).toLocaleDateString() : '—' },
            ].map(({ label, value, mono }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <span className="ps-patient-info-sep">·</span>}
                <span className="ps-patient-info-label">{label}</span>
                <span className={`ps-patient-info-value${mono ? ' ps-patient-info-value--mono' : ''}`}>{value}</span>
              </React.Fragment>
            ))}
          </div>

          <MarkersPanel markers={markers} />

          {/* Report sections */}
          {sections.map(s => (
            <div key={s.title} style={{ marginBottom: '28px', borderLeft: '3px solid rgba(8,145,178,0.4)', paddingLeft: '14px' }}>
              <h4 style={{
                fontSize: '11px', fontWeight: 800, color: '#0891B2',
                marginBottom: '10px', letterSpacing: '1px',
                textTransform: 'uppercase' as const,
              }}>
                {s.title}
              </h4>
              <p style={{ color: '#cbd5e1', fontSize: '13.5px', lineHeight: 1.75, margin: 0 }}>
                <HighlightedText text={s.text} highlight={matchPhrase} onMarkMount={handleMarkMount} />
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default LeftReportPanel;
