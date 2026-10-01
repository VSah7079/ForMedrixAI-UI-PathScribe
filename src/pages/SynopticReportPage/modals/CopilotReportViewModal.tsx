// src/pages/SynopticReportPage/modals/CopilotReportViewModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// What "print" actually means for CoPilot, per direct clarification:
// PathScribe's real output in this mode is the completed synoptic data
// sent back to the LIS — there's no separate narrative document the way
// Orchestration has one. So this shows exactly that: the same resolved
// fields (label + display value) that make up the outbound payload, one
// section per synoptic instance/specimen.
//
// Deliberately does NOT go through REPORT_PDF_ENDPOINT / ReportLab —
// that pipeline is built around Orchestration's bodyAssembly/sections
// structure, and forcing CoPilot data through it produced a blank page
// even once the underlying data was populated (confirmed directly: the
// server-side template needs real sections to draw, not just answers
// sitting in the payload with nothing telling it what to render). This
// uses real browser printing instead — fully within this app's control,
// no dependency on server-side rendering logic that can't be verified
// from here.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { ResolvedAnswer } from '@/orchestrator/contextBuilder';

// Real, persisted notification-method enum values stay as data; only the
// displayed label is translated (this sweep's usual LABEL_KEY pattern).
const NOTIFICATION_METHOD_LABEL_KEY: Record<string, string> = {
  verbal_phone: 'copilotReportViewModal.notificationMethod.verbalPhone',
  secure_page: 'copilotReportViewModal.notificationMethod.securePage',
  direct_lis_flag: 'copilotReportViewModal.notificationMethod.directLisFlag',
};

export interface CopilotReportVersionOption {
  versionNumber: number;
  label: string;
  releasedAt: string;
  createdByName: string;
  answers: ResolvedAnswer[];
  /** Present for amended versions (undefined for Original) — the
   *  amendment's own reason/notification narrative, per feedback:
   *  print output must include this, not just the field values. */
  explanationOfChange?: string;
  notification?: { clinicianName: string; method: string; notifiedAt: string };
  /** "Originally Reported As" — only the fields that actually changed
   *  vs the immediately-previous version. */
  changedFromPrevious?: { fieldLabel: string; previousValue: unknown; currentValue: unknown }[];
}

export interface CopilotReportInstance {
  instanceId: string;
  specimenId: string;
  specimenLabel: string;
  specimenDesc?: string;
  templateName: string;
  answers: ResolvedAnswer[];
  /** Real section structure (Specimen/Tumor/Margins/...), same source
   *  as PreFinalisationModal's preview — was requested here too but
   *  never actually wired in. */
  sections?: { title: string; fieldKeys: string[] }[];
  /** Present only when 2+ released versions exist for this instance —
   *  lets the user pick which version's data to include in print/LIS
   *  output, instead of always the live current answers. */
  versions?: CopilotReportVersionOption[];
}

interface Props {
  show: boolean;
  onClose: () => void;
  accession: string;
  patient: string;
  mrn: string;
  instances: CopilotReportInstance[];
}

export const CopilotReportViewModal: React.FC<Props> = ({ show, onClose, accession, patient, mrn, instances }) => {
  const { t } = useTranslation();
  // Default every instance to its most recent version.
  const [selectedVersion, setSelectedVersion] = React.useState<Record<string, number>>({});
  const [activeInstanceId, setActiveInstanceId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!show) return;
    const defaults: Record<string, number> = {};
    instances.forEach(inst => {
      if (inst.versions && inst.versions.length > 0) {
        defaults[inst.instanceId] = inst.versions[inst.versions.length - 1].versionNumber;
      }
    });
    setSelectedVersion(defaults);
    setActiveInstanceId(instances[0]?.instanceId ?? null);
  }, [show, instances]);

  if (!show) return null;

  const handlePrint = () => {
    // ROOT FIX for the persistent blank-print issue — every previous fix
    // patched one more ancestor in the ps-overlay/ps-synrp-root/ps-app-root
    // chain, and each time revealed another one Chrome's actual print
    // engine handled differently than on-screen print-media emulation
    // (confirmed via DevTools: emulation showed correct, real dimensions
    // on the print area, but the native print dialog stayed blank —
    // meaning the two rendering paths genuinely diverge here). Rather
    // than keep chasing that chain, this grabs the already-rendered
    // print area's HTML (reflecting exactly whatever versions are
    // currently selected) and opens it in a brand new, empty window —
    // no modal, no overlay, no app shell, nothing to escape or clip.
    const printArea = document.getElementById('ps-copilot-print-area');
    if (!printArea) return;
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      alert(t('copilotReportViewModal.popupBlockedAlert'));
      return;
    }
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${t('copilotReportViewModal.printWindowTitle', { accession })}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #000; padding: 32px; }
  .ps-copilot-report-header { display: flex; gap: 24px; font-size: 12pt; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #ccc; }
  .ps-copilot-report-section { margin-bottom: 22px; }
  .ps-copilot-report-section-title { font-size: 13pt; font-weight: 700; color: #0891B2; margin-bottom: 8px; }
  .ps-copilot-report-section-version-tag { margin-left: 10px; font-size: 9pt; font-weight: 700; color: #0891B2; }
  .ps-copilot-report-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  .ps-copilot-report-field-label { padding: 6px 12px 6px 0; color: #444; width: 45%; vertical-align: top; }
  .ps-copilot-report-field-value { padding: 6px 0; color: #000; font-weight: 500; }
  .ps-copilot-report-section-row td { font-size: 9pt; font-weight: 800; color: #000; letter-spacing: 0.08em; text-transform: uppercase; padding-top: 14px; padding-bottom: 5px; border-bottom: 1px solid #999; }
  .ps-copilot-report-amendment-narrative { background: #fff7ed; border: 1px solid #d97706; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 10.5pt; line-height: 1.6; }
  .ps-copilot-report-amendment-flag { font-size: 9pt; font-weight: 800; color: #d97706; letter-spacing: 0.08em; margin-bottom: 4px; }
  .ps-copilot-report-diff-table { margin-bottom: 14px; }
  .ps-copilot-report-diff-table th { text-align: left; font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 6px; border-bottom: 1px solid #ccc; }
  .ps-copilot-report-diff-previous { color: #666; text-decoration: line-through; }
  .ps-copilot-report-diff-current { color: #000; font-weight: 600; }
  @media print { @page { margin: 18mm 20mm; } }
</style>
</head>
<body>${printArea.innerHTML}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    // Give the new document a moment to actually paint (fonts/layout)
    // before invoking print — calling print() immediately is a common
    // cause of blank output in new-window printing.
    setTimeout(() => { printWindow.print(); }, 250);
  };

  const formatDateTime = (iso?: string) => iso ? new Date(iso).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Group instances by specimen for the left panel, numbered in order
  // of first appearance — mirrors how the case's specimens are ordered.
  const specimenOrder: string[] = [];
  const bySpecimen = new Map<string, { label: string; desc?: string; instances: CopilotReportInstance[] }>();
  instances.forEach(inst => {
    if (!bySpecimen.has(inst.specimenId)) {
      specimenOrder.push(inst.specimenId);
      bySpecimen.set(inst.specimenId, { label: inst.specimenLabel, desc: inst.specimenDesc, instances: [] });
    }
    bySpecimen.get(inst.specimenId)!.instances.push(inst);
  });

  const scrollToInstance = (instanceId: string) => {
    setActiveInstanceId(instanceId);
    document.getElementById(`ps-copilot-report-instance-${instanceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ps-overlay ps-overlay--copilot-report" data-capture-hide="true">
      <div className="ps-copilot-report-view ps-copilot-report-view--two-pane">
        <div className="ps-copilot-report-view-toolbar" data-print-hide="true">
          <span className="ps-copilot-report-view-title">{t('copilotReportViewModal.toolbarTitle')}</span>
          <div>
            <button className="ps-btn-ghost-dark" onClick={handlePrint}>🖨 {t('copilotReportViewModal.printButton')}</button>
            <button className="ps-btn-ghost-dark" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>

        <div className="ps-copilot-report-body-split">
          {/* LEFT — specimen / synoptic / version selection */}
          <div className="ps-copilot-report-left" data-print-hide="true">
            {specimenOrder.map((specimenId, si) => {
              const sp = bySpecimen.get(specimenId)!;
              return (
                <div key={specimenId} className="ps-copilot-report-specimen-card">
                  <div className="ps-copilot-report-specimen-header">
                    <span className="ps-copilot-report-specimen-num">{si + 1}</span>
                    <div>
                      <div className="ps-copilot-report-specimen-name">{sp.label}: {sp.desc ?? sp.instances[0]?.templateName}</div>
                      <div className="ps-copilot-report-specimen-count">{t('copilotReportViewModal.synopticCount', { count: sp.instances.length })}</div>
                    </div>
                  </div>

                  {sp.instances.map(inst => {
                    const hasVersions = inst.versions && inst.versions.length > 1;
                    const activeVersionNumber = selectedVersion[inst.instanceId];
                    return (
                      <div key={inst.instanceId} className="ps-copilot-report-instance-block">
                        <button
                          className={`ps-copilot-report-instance-row${activeInstanceId === inst.instanceId ? ' ps-copilot-report-instance-row--active' : ''}`}
                          onClick={() => scrollToInstance(inst.instanceId)}
                        >
                          {inst.templateName}
                        </button>
                        {hasVersions && inst.versions!.slice().reverse().map(v => (
                          <button
                            key={v.versionNumber}
                            onClick={() => { setSelectedVersion(prev => ({ ...prev, [inst.instanceId]: v.versionNumber })); scrollToInstance(inst.instanceId); }}
                            className={`ps-copilot-report-version-row${v.versionNumber === activeVersionNumber ? ' ps-copilot-report-version-row--active' : ''}`}
                          >
                            <span className="ps-copilot-report-version-badge">V.{v.versionNumber}</span>
                            <span className="ps-copilot-report-version-label">{v.label}</span>
                            <span className="ps-copilot-report-version-meta">{formatDateTime(v.releasedAt)} — {v.createdByName}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <p className="ps-copilot-report-left-hint">
              {t('copilotReportViewModal.versionSelectHint')}
            </p>
          </div>

          {/* RIGHT — live preview, reflects every current selection, exactly what prints */}
          <div className="ps-copilot-report-right">
            <div className="ps-copilot-report-view-body" id="ps-copilot-print-area">
              <div className="ps-copilot-report-header">
                <div data-phi="accession"><strong>{t('copilotReportViewModal.accessionLabel')}</strong> {accession}</div>
                <div data-phi="name"><strong>{t('copilotReportViewModal.patientLabel')}</strong> {patient}</div>
                <div data-phi="mrn"><strong>{t('copilotReportViewModal.mrnLabel')}</strong> {mrn}</div>
              </div>

              {instances.length === 0 && (
                <p className="ps-copilot-report-empty">{t('copilotReportViewModal.noDataAvailable')}</p>
              )}

              {instances.map(inst => {
                const hasVersions = inst.versions && inst.versions.length > 1;
                const activeVersionNumber = selectedVersion[inst.instanceId];
                const activeVersion = hasVersions ? inst.versions!.find(v => v.versionNumber === activeVersionNumber) : undefined;
                const displayedAnswers = activeVersion ? activeVersion.answers : inst.answers;

                return (
                  <div key={inst.instanceId} id={`ps-copilot-report-instance-${inst.instanceId}`} className="ps-copilot-report-section">
                    <h3 className="ps-copilot-report-section-title">
                      {t('copilotReportViewModal.specimenSectionTitle', { label: inst.specimenLabel, templateName: inst.templateName })}
                      {activeVersion && <span className="ps-copilot-report-section-version-tag">{activeVersion.label}</span>}
                    </h3>

                    {activeVersion?.explanationOfChange && (
                      <div className="ps-copilot-report-amendment-narrative">
                        <div className="ps-copilot-report-amendment-flag">{t('copilotReportViewModal.amendedFlag')}</div>
                        <p><strong>{t('copilotReportViewModal.reasonForAmendmentLabel')}</strong> {activeVersion.explanationOfChange}</p>
                        {activeVersion.notification && (
                          <p><strong>{t('copilotReportViewModal.clinicianNotifiedLabel')}</strong> {activeVersion.notification.clinicianName} — {NOTIFICATION_METHOD_LABEL_KEY[activeVersion.notification.method] ? t(NOTIFICATION_METHOD_LABEL_KEY[activeVersion.notification.method]) : activeVersion.notification.method}, {formatDateTime(activeVersion.notification.notifiedAt)}</p>
                        )}
                      </div>
                    )}

                    {activeVersion?.changedFromPrevious && activeVersion.changedFromPrevious.length > 0 && (
                      <table className="ps-copilot-report-table ps-copilot-report-diff-table">
                        <thead>
                          <tr>
                            <th>{t('copilotReportViewModal.diffTable.element')}</th>
                            <th>{t('copilotReportViewModal.diffTable.originallyReported')}</th>
                            <th>{t('copilotReportViewModal.diffTable.currentlyReported')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeVersion.changedFromPrevious.map((c, i) => (
                            <tr key={i}>
                              <td className="ps-copilot-report-field-label">{c.fieldLabel}</td>
                              <td className="ps-copilot-report-field-value ps-copilot-report-diff-previous">{String(c.previousValue ?? '') || t('copilotReportViewModal.emptyValue')}</td>
                              <td className="ps-copilot-report-field-value ps-copilot-report-diff-current">{String(c.currentValue ?? '') || t('copilotReportViewModal.emptyValue')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <table className="ps-copilot-report-table">
                      <tbody>
                        {(() => {
                          const answerByFieldId = new Map(displayedAnswers.map(a => [a.fieldId, a]));
                          const sectionedIds = new Set(inst.sections?.flatMap(s => s.fieldKeys) ?? []);
                          const unsectioned = displayedAnswers.filter(a => !sectionedIds.has(a.fieldId));
                          const rowGroups: { title: string | null; items: ResolvedAnswer[] }[] =
                            inst.sections && inst.sections.length > 0
                              ? [
                                  ...inst.sections.map(s => ({
                                    title: s.title,
                                    items: s.fieldKeys.map(k => answerByFieldId.get(k)).filter((a): a is ResolvedAnswer => !!a),
                                  })),
                                  ...(unsectioned.length > 0 ? [{ title: t('copilotReportViewModal.otherSectionTitle'), items: unsectioned }] : []),
                                ]
                              : [{ title: null, items: displayedAnswers }];
                          return rowGroups.filter(g => g.items.length > 0).map(group => (
                            <React.Fragment key={group.title ?? '_flat'}>
                              {group.title && (
                                <tr className="ps-copilot-report-section-row"><td colSpan={2}>{group.title}</td></tr>
                              )}
                              {group.items.map(a => (
                                <tr key={a.fieldId}>
                                  <td className="ps-copilot-report-field-label">{a.fieldLabel}</td>
                                  <td className="ps-copilot-report-field-value">{a.displayValue || '—'}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
