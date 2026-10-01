// src/pages/SynopticReportPage/components/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal from '@/components/Common/ConfirmModal';
import type { Case, ProtocolChange } from '@/types/case/Case';
import type { SpecimenLisStatus } from '@/types/case/Specimen';
import type { CaseComment } from '@/types/case/CaseComment';

interface SidebarProps {
  caseData: Case | null;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  activeSpecimenId?: string;
  onSelectSpecimen?: (specimenId: string) => void;
  onAddSynoptic?: () => void;
  onAddMicroscopic?: (specimenId: string) => void;
  onEditSpecimen?: (specimenId: string) => void;
  
  onOpenCaseComment?: () => void;
  onOpenSpecimenComment?: (specimenId: string) => void;
  hasCaseComment?: boolean;
  onOpenRetentionHold?: () => void;
  hasActiveRetentionHold?: boolean;
  onOpenCaseHold?: () => void;
  hasActiveCaseHold?: boolean;
  specimenComments?: Record<string, CaseComment[]>;
  activeReportInstanceId?: string;
  onSelectReport?: (instanceId: string, specimenId: string, reportType: 'grossing' | 'microscopic' | 'synoptic') => void;
  onDeleteReport?: (instanceId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * Stage 2 background-check results awaiting pathologist review (status
   * 'pending' — see ProtocolChange.reviewStatus in Case.ts). Drives the
   * small persistent badge shown next to an affected specimen row,
   * mirroring RightSynopticPanel.tsx's AI field-suggestion badge
   * language (confidence-colored pill) but at the whole-synoptic level
   * rather than per-field. Defaults to caseData.pendingProtocolChanges
   * if not explicitly passed, but accepted as a prop so the page can
   * filter/override if needed.
   */
  pendingProtocolChanges?: ProtocolChange[];
  /**
   * Opens ProtocolChangeModal for on-demand review, the same modal Stage
   * 1/2's blocking checks already use — just a voluntary entry point
   * here (clicking the badge) instead of a forced one. Page-controlled
   * (Sidebar doesn't own modal state for this, same pattern as every
   * other onX callback here), and intentionally not specimen-filtered:
   * mirrors ProtocolChangeModal's existing design, which already renders
   * multiple specimens' changes together in one review session.
   */
  onReviewProtocolChanges?: () => void;
}

type DotStatus = 'complete' | 'partial' | 'empty';

// Persisted-enum-style label maps — translate only the displayed label.
const DOT_STATUS_LABEL_KEY: Record<DotStatus, string> = {
  complete: 'sidebar.dotStatus.complete',
  partial:  'sidebar.dotStatus.partial',
  empty:    'sidebar.dotStatus.empty',
};

const StatusDot: React.FC<{ status: DotStatus }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <span className="ps-status-dot-wrap" title={t(DOT_STATUS_LABEL_KEY[status])}>
      <span className={`ps-status-dot ps-syn-status-dot--${status}`} />
    </span>
  );
};

// ── LIS status badge ─────────────────────────────────────────────────────────
const LIS_BADGE: Record<Exclude<SpecimenLisStatus, 'lis_owned' | 'local_only'>, { labelKey: string; className: string }> = {
  pending_sync:  { labelKey: 'sidebar.lisStatus.pendingSync',  className: 'ps-sp-lis-badge ps-sp-lis-badge--pending'  },
  sync_sent:     { labelKey: 'sidebar.lisStatus.syncSent',     className: 'ps-sp-lis-badge ps-sp-lis-badge--sent'     },
  sync_rejected: { labelKey: 'sidebar.lisStatus.syncRejected', className: 'ps-sp-lis-badge ps-sp-lis-badge--rejected' },
};

const LisStatusBadge: React.FC<{ status?: SpecimenLisStatus }> = ({ status }) => {
  const { t } = useTranslation();
  if (!status || status === 'lis_owned' || status === 'local_only') return null;
  const badge = LIS_BADGE[status as keyof typeof LIS_BADGE];
  if (!badge) return null;
  return <span className={badge.className}>{t(badge.labelKey)}</span>;
};

const REPORT_TYPE_LABEL_KEY: Record<'grossing' | 'microscopic' | 'synoptic', string> = {
  grossing: 'sidebar.reportType.grossing',
  microscopic: 'sidebar.reportType.microscopic',
  synoptic: 'sidebar.reportType.synoptic',
};

const Sidebar: React.FC<SidebarProps> = ({
  caseData,
  activeSpecimenId,
  onSelectSpecimen,
  onAddSynoptic,
  onAddMicroscopic,
  onEditSpecimen,
  
  onOpenCaseComment,
  onOpenSpecimenComment,
  hasCaseComment = false,
  onOpenRetentionHold,
  hasActiveRetentionHold = false,
  onOpenCaseHold,
  hasActiveCaseHold = false,
  specimenComments = {},
  activeReportInstanceId,
  onSelectReport,
  onDeleteReport,
  collapsed = false,
  onToggleCollapse,
  pendingProtocolChanges,
  onReviewProtocolChanges,
}) => {
  const { t } = useTranslation();
  const specimens = caseData?.specimens ?? [];
  // Falls back to reading straight off caseData if the page doesn't pass
  // this explicitly — same default-to-source-data pattern as
  // caseData.synopticReports/grossingReports being read directly below,
  // rather than requiring every caller to thread it through manually.
  const pendingChanges = pendingProtocolChanges ?? caseData?.pendingProtocolChanges ?? [];
  const hasPendingChangeForSpecimen = (specimenId: string): boolean =>
    pendingChanges.some(c => c.specimenId === specimenId && (c.reviewStatus ?? 'pending') === 'pending');
  const [confirmDeleteId,   setConfirmDeleteId]   = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>('');
  const [expandedIds,       setExpandedIds]       = useState<Set<string>>(new Set());

  useEffect(() => {
    if (specimens.length > 0) setExpandedIds(new Set(specimens.map(s => s.id)));
  }, [caseData?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className={`ps-syn-sidebar ${collapsed ? 'collapsed' : 'expanded'}`}>

      {/* ── COLLAPSED: icon rail ─────────────────────────────── */}
      {collapsed && (
        <div className="ps-syn-rail">
          <button className="ps-syn-rail-toggle" onClick={onToggleCollapse} title={t('sidebar.expandTitle')}>
            ›
          </button>

          {specimens.map(sp => {
            const grossingInstances = (caseData?.grossingReports ?? []).filter(r => r.specimenId === sp.id);
            const instances  = (caseData?.synopticReports ?? []).filter(r => r.specimenId === sp.id);
            const allInstances = [...grossingInstances, ...instances];
            const hasAnswers = allInstances.some(r =>
              Object.values(r.answers ?? {}).some(v => v !== '' && !(Array.isArray(v) && !v.length))
            );
            const isActive = activeSpecimenId === sp.id;
            const hasPendingChange = hasPendingChangeForSpecimen(sp.id);
            return (
              <button
                key={sp.id}
                className={`ps-syn-rail-btn${isActive ? ' active' : ''}`}
                onClick={() => {
                  onSelectSpecimen?.(sp.id);
                  const first = allInstances[0];
                  if (first) {
                    const isGrossing = grossingInstances.some(g => g.instanceId === first.instanceId);
                    onSelectReport?.(first.instanceId, sp.id, isGrossing ? 'grossing' : 'synoptic');
                  }
                }}
                title={hasPendingChange
                  ? t('sidebar.rail.titleWithReviewHint', { label: sp.label, description: sp.description })
                  : t('sidebar.rail.title', { label: sp.label, description: sp.description })}
              >
                <span className="ps-syn-rail-letter">{sp.label}</span>
                <span className={`ps-status-dot ps-syn-rail-dot${hasAnswers ? ' ps-syn-rail-dot--has-answers' : ''}`} />
                {hasPendingChange && (
                  <span
                    onClick={e => { e.stopPropagation(); onReviewProtocolChanges?.(); }}
                    className="ps-syn-rail-pending-dot"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── EXPANDED: full content ────────────────────────────── */}
      {!collapsed && (
        <div className="ps-syn-sidebar-content">

          <button className="ps-syn-sidebar-toggle" onClick={onToggleCollapse} title={t('sidebar.collapseTitle')}>
            ‹
          </button>

          {/* Case comment */}
          <div
            className={`ps-syn-comment-btn${hasCaseComment ? ' has-comment' : ''}`}
            onClick={() => onOpenCaseComment?.()}
            role="button" tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpenCaseComment?.()}
          >
            <span className="ps-syn-comment-icon">💬</span>
            <div className="ps-syn-flex-fill">
              <div className="ps-syn-comment-label">
                {hasCaseComment ? t('sidebar.caseComment.edit') : `+ ${t('sidebar.caseComment.add')}`}
              </div>
              {hasCaseComment && <div className="ps-syn-comment-sublabel">{t('sidebar.caseComment.sublabel')}</div>}
            </div>
            {hasCaseComment && <span className="ps-syn-comment-check">✓</span>}
          </div>

          {/* Real feature, per direct follow-up: "Retention Hold UI on
              AccessionPage — not wired." AccessionPage.tsx already has
              a real, working flow for placing a hold at the moment a
              case is created — the real, remaining gap this closes is
              an entry point for an ALREADY-accessioned case: placing
              a new hold later, or releasing an active one. Same real
              ps-syn-comment-btn pattern as Case Comment immediately
              above — a case-level toggle action, not a specimen-level
              one. */}
          <div
            className={`ps-syn-comment-btn${hasActiveRetentionHold ? ' has-comment' : ''}`}
            onClick={() => onOpenRetentionHold?.()}
            role="button" tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpenRetentionHold?.()}
          >
            <span className="ps-syn-comment-icon">🔒</span>
            <div className="ps-syn-flex-fill">
              <div className="ps-syn-comment-label">
                {hasActiveRetentionHold ? t('sidebar.retentionHold.active') : t('sidebar.retentionHold.label')}
              </div>
              {hasActiveRetentionHold && <div className="ps-syn-comment-sublabel">{t('sidebar.retentionHold.sublabel')}</div>}
            </div>
            {hasActiveRetentionHold && <span className="ps-syn-comment-check ps-syn-comment-check--alert">●</span>}
          </div>

          {/* Real feature, per direct follow-up: "putting a case on
              Hold at the case level makes sense if there is something
              truly wrong... add a tile in their worklist for Cases on
              Hold. Then remove the whole deferred bit." Deliberately a
              separate entry from Retention Hold immediately above —
              same real ps-syn-comment-btn pattern, but a genuinely
              different concept (see types/case/CaseHold.ts's own
              header): this one gates finalize on an active,
              not-yet-done case, not disposal on an already-finalized
              one. */}
          <div
            className={`ps-syn-comment-btn${hasActiveCaseHold ? ' has-comment' : ''}`}
            onClick={() => onOpenCaseHold?.()}
            role="button" tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpenCaseHold?.()}
          >
            <span className="ps-syn-comment-icon">⛔</span>
            <div className="ps-syn-flex-fill">
              <div className="ps-syn-comment-label">
                {hasActiveCaseHold ? t('sidebar.caseHold.active') : t('sidebar.caseHold.label')}
              </div>
              {hasActiveCaseHold && <div className="ps-syn-comment-sublabel">{t('sidebar.caseHold.sublabel')}</div>}
            </div>
            {hasActiveCaseHold && <span className="ps-syn-comment-check ps-syn-comment-check--alert">●</span>}
          </div>

          {/* Section label */}
          <div className="ps-syn-section-label">{t('sidebar.sectionLabel')}</div>

          {/* Specimen rows */}
          {specimens.map(specimen => {
            const isExpanded = expandedIds.has(specimen.id);
            const isActive   = activeSpecimenId === specimen.id;

            const grossingInstances = (caseData?.grossingReports ?? []).filter(r => r.specimenId === specimen.id)
              .map(r => ({ ...r, reportType: 'grossing' as const }));
            // Real feature, per direct follow-up: "the next logical step
            // is to generate a Microscopic Description... Perhaps a gap
            // in our orchestration flow." Mapped into the same generic
            // row shape (templateName/answers) the row renderer below
            // already expects, rather than forking that rendering logic
            // for a third, structurally different type — a free-text
            // narrative has no real "template," so templateName here is
            // a synthetic, display-only label, and answers is always
            // empty (this row's own real "has content" signal is
            // text.trim().length > 0, checked directly in the label
            // below, not the generic hasAnswers check other rows use).
            const microscopicInstances = (caseData?.microscopicReports ?? []).filter(r => r.specimenId === specimen.id)
              .map(r => ({ ...r, templateName: 'Microscopic Description', answers: {}, reportType: 'microscopic' as const }));
            const instances = (caseData?.synopticReports ?? []).filter(r => r.specimenId === specimen.id)
              .map(r => ({ ...r, reportType: 'synoptic' as const }));
            const legacyId  = !instances.length && caseData?.synopticTemplateId;
            const legacyRows = legacyId ? [{
              instanceId:   '__legacy__',
              templateId:   caseData!.synopticTemplateId!,
              templateName: (caseData!.synopticTemplateId!).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              answers:      caseData?.synopticAnswers ?? {},
              status:       'draft' as const,
              specimenId:   specimen.id,
              createdAt: '', updatedAt: '',
              reportType:   'synoptic' as const,
            }] : [];
            // Grossing rows first — matches real workflow order (gross,
            // then microscopic/synoptic), and lets the sidebar visually
            // separate the two kinds of report the same way accession →
            // grossing → sign-out treats them as sequential stages.
            const allRows = [...grossingInstances, ...microscopicInstances, ...(instances.length > 0 ? instances : legacyRows)];

            const specimenHasAnswers = allRows.some(r =>
              Object.values(r.answers ?? {}).some(v => v !== '' && !(Array.isArray(v) && !v.length))
            );
            const specimenDot: DotStatus = allRows.length === 0 ? 'empty' : specimenHasAnswers ? 'partial' : 'empty';
            // Same unverified count as each individual report row below,
            // summed across the whole specimen — visible even while
            // collapsed, so a pathologist can see at a glance which
            // specimens have something still needing review without
            // having to expand every one of them first.
            const specimenUnverifiedCount = allRows.reduce((sum, r) =>
              sum + Object.values((r as any).aiSuggestions ?? {}).filter((s: any) => s?.verification === 'unverified').length,
            0);

            return (
              <div key={specimen.id}>
                <div
                  className={`ps-syn-specimen-row${isActive ? ' active' : ''}`}
                  onClick={() => {
                    if (allRows.length === 0) { onSelectSpecimen?.(specimen.id); onAddSynoptic?.(); }
                    else { toggleExpand(specimen.id); onSelectSpecimen?.(specimen.id); }
                  }}
                  title={t('sidebar.specimenRow.title', { label: specimen.label, description: specimen.description })}
                  role="button" tabIndex={0}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleExpand(specimen.id)}
                >
                  <span className={`ps-syn-expand-arrow${isExpanded ? ' open' : ''}${allRows.length === 0 ? ' hidden' : ''}`}>
                    ▶
                  </span>

                  <div className="ps-syn-flex-fill">
                    <div className="ps-syn-specimen-label">
                      <span className="ps-syn-specimen-label-letter">{specimen.label}:</span>{' '}
                      {specimen.description}
                    </div>
                    <LisStatusBadge status={specimen.lisStatus} />
                  </div>

                  {specimenUnverifiedCount > 0 && (
                    <span
                      title={`${t('sidebar.specimenRow.unverifiedCount', { count: specimenUnverifiedCount })} ${t('sidebar.specimenRow.acrossReports', { count: allRows.length })}`}
                      className="ps-syn-unverified-badge"
                    >
                      {t('sidebar.specimenRow.unverifiedBadge', { count: specimenUnverifiedCount })}
                    </span>
                  )}

                  <span
                    className={`ps-specimen-comment-btn${(specimenComments[specimen.id]?.length ?? 0) > 0 ? ' ps-specimen-comment-btn--active' : ''}`}
                    onClick={e => { e.stopPropagation(); onOpenSpecimenComment?.(specimen.id); }}
                    title={(specimenComments[specimen.id]?.length ?? 0) > 0 ? t('sidebar.specimenRow.viewAddComment') : t('sidebar.specimenRow.addComment')}
                  >💬</span>

                  <span
                    className="ps-specimen-edit-btn"
                    onClick={e => { e.stopPropagation(); onEditSpecimen?.(specimen.id); }}
                    title={t('sidebar.specimenRow.editDetails')}
                  >✏️</span>

                  {hasPendingChangeForSpecimen(specimen.id) && (
                    <span
                      onClick={e => { e.stopPropagation(); onReviewProtocolChanges?.(); }}
                      title={t('sidebar.specimenRow.reviewHint')}
                      className="ps-syn-review-badge"
                    >
                      <span className="ps-syn-review-badge-icon">⚠</span> {t('sidebar.specimenRow.review')}
                    </span>
                  )}

                  <StatusDot status={specimenDot} />
                </div>

                {isExpanded && (
                  <div className="ps-syn-instance-list">
                    {allRows.map(inst => {
                      const isActiveInst = activeReportInstanceId === inst.instanceId ||
                        (!activeReportInstanceId && inst.instanceId === '__legacy__');
                      const filledCount = Object.values(inst.answers ?? {}).filter(v =>
                        v !== '' && !(Array.isArray(v) && !v.length)
                      ).length;
                      const instDot: DotStatus = filledCount > 0 ? 'partial' : 'empty';
                      // Real fix, per direct request: previously the only way to
                      // discover a different specimen's report still had
                      // unconfirmed AI suggestions was to open it directly — this
                      // surfaces it right in the sidebar instead. Deliberately
                      // counts ANY unverified AI suggestion on this report (not
                      // narrowed to required fields only), since that needs each
                      // report's own template fetched to know which fields are
                      // required — a real, addressable next step, not done here
                      // to avoid introducing new async fetching into a component
                      // that doesn't currently have any.
                      const unverifiedCount = Object.values((inst as any).aiSuggestions ?? {}).filter(
                        (s: any) => s?.verification === 'unverified'
                      ).length;

                      return (
                        <div
                          key={inst.instanceId}
                          className={`ps-syn-instance-row${isActiveInst ? ' active' : ''}`}
                          onClick={() => onSelectReport?.(inst.instanceId, specimen.id, inst.reportType)}
                        >
                          <div className="ps-syn-flex-fill">
                            <div className="ps-syn-instance-name">
                              <span className={`ps-syn-instance-type-label ps-syn-instance-type-label--${inst.reportType}`}>
                                {t(REPORT_TYPE_LABEL_KEY[inst.reportType])}
                              </span>
                              {inst.reportType === 'microscopic'
                                ? ((inst as any).status === 'draft' ? t('sidebar.microscopic.draftUnsaved') : (inst as any).text?.trim() ? t('sidebar.microscopic.saved') : t('sidebar.microscopic.savedBlank'))
                                : inst.templateName}
                            </div>
                            <div
                              className={`ps-syn-instance-meta${unverifiedCount > 0 ? ' ps-syn-instance-meta--unverified' : ''}`}
                              title={unverifiedCount > 0 ? t('sidebar.instance.unverifiedOnReport', { count: unverifiedCount }) : undefined}
                            >
                              {inst.reportType === 'microscopic'
                                ? (() => { const len = ((inst as any).text ?? '').trim().length; return len > 0 ? t('sidebar.microscopic.characterCount', { count: len }) : t('sidebar.microscopic.noNarrativeYet'); })()
                                : <>{t('sidebar.instance.fieldsAnswered', { count: filledCount })}{unverifiedCount > 0 && ` · ${t('sidebar.instance.unverifiedSuffix', { count: unverifiedCount })}`}</>}
                            </div>
                          </div>
                          <StatusDot status={instDot} />
                          {/* Real fix (PS-315 — "Trash-can icon is
                              almost invisible next to the synoptic
                              report, compared to the codes"): root
                              cause was ps-btn-icon-danger's own base
                              rule — opacity: 0, only reaching opacity:
                              1 on :hover of this whole row. That's not
                              low contrast, it's genuinely not rendered
                              at all until the pointer happens to be
                              over this exact row. The billing code
                              rows immediately next to this sidebar in
                              the same page (BillingReviewPanel.tsx's
                              own applied-code and suggested-code delete
                              buttons — the real "codes" being compared
                              against) already use this same
                              ps-btn-icon-danger class plus a real
                              ps-btn-icon-danger--visible modifier that
                              forces opacity: 1 permanently. Added that
                              same modifier here so this delete button
                              matches that same, already-established
                              always-visible treatment instead of the
                              hover-only one. */}
                          {inst.instanceId !== '__legacy__' && inst.reportType !== 'microscopic' && onDeleteReport && (
                            <button
                              type="button"
                              className="ps-btn-icon-danger ps-btn-icon-danger--visible"
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmDeleteId(inst.instanceId);
                                setConfirmDeleteName(inst.templateName);
                              }}
                              title={t('sidebar.instance.removeReport')}
                            >🗑</button>
                          )}
                        </div>
                      );
                    })}
                    {/* Real feature, per direct follow-up: "the next
                        logical step is to generate a Microscopic
                        Description." Only shown once — a specimen
                        that already has a Microscopic row (even a
                        blank, deliberately-skipped one) selects that
                        real row above instead of offering to create a
                        second one. */}
                    {microscopicInstances.length === 0 && (
                      <button
                        type="button"
                        className="ps-syn-instance-row ps-syn-add-microscopic-btn"
                        onClick={() => onAddMicroscopic?.(specimen.id)}
                      >
                        <span className="ps-syn-add-microscopic-label">+ {t('sidebar.addMicroscopic')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button className="ps-syn-add-btn" onClick={() => onAddSynoptic?.()}>
            <span className="ps-syn-add-icon">+</span> {t('sidebar.addSynoptic')}
          </button>

        </div>
      )}

      <ConfirmModal
        show={!!confirmDeleteId}
        title={t('sidebar.confirmDelete.title')}
        message={t('sidebar.confirmDelete.message', { name: confirmDeleteName })}
        confirmLabel={t('sidebar.confirmDelete.confirm')}
        cancelLabel={t('sidebar.confirmDelete.cancel')}
        onConfirm={() => { if (confirmDeleteId) onDeleteReport?.(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
};

export default Sidebar;
