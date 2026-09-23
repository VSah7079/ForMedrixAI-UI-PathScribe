// src/pages/SynopticReportPage/components/LeftReportPanel.tsx
import React, { useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { Case } from '@/types/case/Case';
import { useAuth } from '@/contexts/AuthContext';
import InternalNotesDrawer from '@/components/InternalNotes/InternalNotesDrawer';
import { internalNoteService, informalReviewService, intraoperativeService } from '@/services';
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
  /** Real, per direct requirement: a second, independent highlight path
   *  for callers with a short, already-exact term to find (e.g. a
   *  stain name like "PAS" from the billing review panel) - the real
   *  highlightText/matchSourceText path above deliberately requires at
   *  least a 3-word phrase, since it's built for AI-cited synoptic
   *  answers where the exact wording is a genuine, meaningful
   *  question. A stain name doesn't have that shape, and shouldn't be
   *  run through the same shortening logic. When set (and highlightText
   *  isn't), this is used directly - HighlightedText's own render
   *  logic already does a plain, unrestricted substring search, so no
   *  changes were needed there at all. */
  rawHighlightText?: string;
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
      <mark ref={onMarkMount} className="ps-leftreport-highlight-mark">
        {text.slice(idx, idx + highlight.length)}
      </mark>
      {text.slice(idx + highlight.length)}
    </>
  );
};

const LeftReportPanel: React.FC<LeftReportPanelProps> = ({ caseData, highlightText, rawHighlightText, onMatchResolved, autoOpenNotes }) => {
  const { t } = useTranslation();
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

  // Real fix, per direct follow-up ("I never see Preliminary Diagnosis
  // ... I expected to see it in the synoptic reporting tab under the
  // full patient report"): this panel is the read-only, case-level
  // summary — genuinely distinct from Report Draft's live orchestrator
  // narrative. It already read every other case-level diagnostic field
  // (grossDescription/microscopicDescription/ancillaryStudies) but
  // never diagnostic.preliminaryImpression, even though that's the
  // real, wired field (see Case.ts's own doc comment: added
  // specifically because "no Preliminary Diagnosis Text Field
  // exist[ed]" — bound to the real prelim_body_surgpath_impression
  // report part, and read by buildOruR01Payload.ts for outbound HL7).
  // Genuinely missing here, not a display choice.
  //
  // Direct follow-up added a second, related gap in the same summary:
  // the Intraoperative/Frozen Section Diagnosis — real data too
  // (IntraopSpecimen.frozenSectionDiagnosis), but it doesn't live on
  // Case.diagnostic at all; it's set on the IntraoperativeEntry the
  // case was merged from (services/intraop/mockIntraoperativeService.ts),
  // linked via mergedIntoCaseId. Same lookup pattern already
  // established in useSignOutWorkflow.ts's own Frozen-to-Permanent
  // Reconciliation check, reused here rather than a second, divergent
  // one: getAll(), find the merged session for this case, read each
  // specimen's own frozenSectionDiagnosis (a case can have more than
  // one specimen frozen, each with its own separate call).
  const [intraopDiagnosisText, setIntraopDiagnosisText] = React.useState<string | null>(null);
  useEffect(() => {
    if (!caseData?.id) { setIntraopDiagnosisText(null); return; }
    let cancelled = false;
    intraoperativeService.getAll().then(res => {
      if (cancelled || !res.ok) return;
      const mergedSession = res.data.find(e => e.status === 'merged' && e.mergedIntoCaseId === caseData.id);
      const withDx = (mergedSession?.specimens ?? []).filter(s => s.frozenSectionDiagnosis);
      setIntraopDiagnosisText(
        withDx.length > 0
          ? withDx.map(s => `${s.specimenLabel}: ${s.frozenSectionDiagnosis}`).join('\n')
          : null
      );
    }).catch(() => { if (!cancelled) setIntraopDiagnosisText(null); });
    return () => { cancelled = true; };
  }, [caseData?.id]);

  const notRecorded = t('leftReportPanel.notRecorded');
  const sections = caseData ? [
    { title: t('leftReportPanel.sections.clinicalHistory'),         text: caseData.order?.clinicalIndication ?? notRecorded },
    { title: t('leftReportPanel.sections.intraopDiagnosis'),        text: intraopDiagnosisText ?? notRecorded },
    { title: t('leftReportPanel.sections.grossDescription'),        text: caseData.diagnostic?.grossDescription ?? notRecorded },
    { title: t('leftReportPanel.sections.microscopicFindings'),     text: caseData.diagnostic?.microscopicDescription ?? notRecorded },
    { title: t('leftReportPanel.sections.preliminaryDiagnosis'),    text: caseData.diagnostic?.preliminaryImpression ?? notRecorded },
    { title: t('leftReportPanel.sections.ancillaryStudies'),        text: caseData.diagnostic?.ancillaryStudies ?? notRecorded },
  ] : [];

  // Extract the quoted phrase from source strings like 'Gross: "2.3 × 1.8 × 1.5 cm"'
  // Falls back to progressively shorter word sequences if the full phrase isn't found.
  // Shared with the finalize-time proactive check — see sourceTextMatching.ts.
  const matchResult = React.useMemo(
    () => matchSourceText(highlightText, caseData),
    [highlightText, caseData]
  );

  const matchPhrase = rawHighlightText ?? matchResult.phrase;

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
      className="ps-leftreport-panel"
      style={{
        // Real fix: background-image + backgroundAttachment: 'local'
        // scrolls WITH this element's own content, tiling the real,
        // configured watermark text across the full scrollable height
        // — not just the initially-visible viewport. See
        // PendingReleaseWatermark.tsx's own header comment for the
        // real bug this specifically avoids. Genuinely dynamic — built
        // from the org's own configured watermark text — so this stays
        // inline rather than a fixed CSS rule.
        backgroundImage: isPendingRelease && watermarkText ? buildWatermarkBackgroundImage(watermarkText) : undefined,
        backgroundRepeat: isPendingRelease && watermarkText ? 'repeat' : undefined,
        backgroundAttachment: isPendingRelease && watermarkText ? 'local' : undefined,
      }}
    >
      {/* Header row */}
      <div className="ps-leftreport-header-row">
        <h3 className="ps-leftreport-header-title">
          📋 {t('leftReportPanel.header.title')}
        </h3>
        {caseData && (
          <button
            onClick={() => setNotesOpen(true)}
            title={pendingReview ? t('leftReportPanel.notesButton.reviewTooltip', { name: pendingReview.toUserName }) : undefined}
            className={`ps-leftreport-notes-btn${pendingReview ? ' ps-leftreport-notes-btn--pending' : ''}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            {t('leftReportPanel.notesButton.label')}
            {pendingReview && (
              <span className="ps-leftreport-review-badge">
                {t('leftReportPanel.notesButton.reviewReady')}
              </span>
            )}
            {!pendingReview && unreadNoteCount > 0 && (
              <span className="ps-leftreport-unread-badge">
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

      <div className="ps-leftreport-lis-notice">
        🔒 <span><Trans i18nKey="leftReportPanel.lisNotice" components={{ strong: <strong /> }} /></span>
      </div>

      {!caseData ? (
        <p className="ps-leftreport-empty-text">{t('leftReportPanel.noCaseLoaded')}</p>
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
              { label: t('leftReportPanel.patientInfo.case'),    value: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber ?? '—', mono: true },
              { label: t('leftReportPanel.patientInfo.mrn'),     value: caseData.patient?.mrn ?? '—' },
              { label: t('leftReportPanel.patientInfo.patient'), value: caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : '—' },
              { label: t('leftReportPanel.patientInfo.dob'),     value: caseData.patient?.dateOfBirth ? new Date(caseData.patient.dateOfBirth).toLocaleDateString() : '—' },
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
            <div key={s.title} className="ps-leftreport-section">
              <h4 className="ps-leftreport-section-title">
                {s.title}
              </h4>
              <p className="ps-leftreport-section-body">
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
