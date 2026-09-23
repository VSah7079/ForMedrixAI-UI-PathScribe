// src/pages/SynopticReportPage/components/AmendmentStatusBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Renders one N-column version matrix PER synoptic instance that has
// released amendments — a case can have multiple independently-amended
// reports. Prefers real ReportVersionRecord history (now populated for
// CoPilot amendments too, see the SynopticReportPage.tsx fix) for the
// column data; falls back to the old pairwise amendment-snapshot chain
// for older seed data (amend-seed-001/002) that predates instanceId
// tracking on ReportVersionRecord, so existing seeded demo cases don't
// go blank.
//
// Now also: real section grouping (Specimen/Tumor/Margins/...), same
// source as the finalize preview (getTemplate().template.sections) —
// and a collapse toggle per instance's matrix.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import '../../../pathscribe.css';
import { amendmentService, reportVersionService } from '@/services';
import { getTemplate } from '@/services/templates/templateService';
import type { AmendmentRecord, NotificationMethod } from '@/types/reports/AmendmentRecord';
import type { ReportVersionRecord } from '@/types/reports/ReportVersionRecord';
import { formatOrdinal } from '@/utils/formatOrdinal';

// Reuses AmendmentModal.tsx's own complete NOTIFICATION_METHOD_LABEL_KEY
// keys (all 5 NotificationMethod values — this file's previous map only
// covered 3, silently falling back to the raw enum value for the other
// two) rather than duplicating that translation content.
const NOTIFICATION_METHOD_LABEL_KEY: Record<NotificationMethod, string> = {
  verbal_phone: 'amendmentModal.notificationMethod.verbalPhone',
  secure_page: 'amendmentModal.notificationMethod.securePage',
  direct_lis_flag: 'amendmentModal.notificationMethod.directLisFlag',
  secure_email: 'amendmentModal.notificationMethod.secureEmail',
  fax: 'amendmentModal.notificationMethod.fax',
};

const formatValue = (value: unknown, t: TFunction): string => {
  if (value === undefined || value === null || value === '') return t('amendmentModal.delta.emptyValue');
  return String(value);
};

const formatDateTime = (iso?: string) => iso ? new Date(iso).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

// Reuses the same amendmentModal.version.* keys and formatOrdinal() util
// AmendmentModal.tsx's own version-history labels already use ("1st
// Amended", "2nd Amended (Most Recent)"...) — see formatOrdinal.ts for
// why a real per-locale ordinal form is needed rather than an English
// letter suffix. indexFromOriginal is 0-based here (0 = Original) where
// AmendmentModal's versionNumber is 1-based; ordinal(indexFromOriginal)
// lines up with ordinal(versionNumber - 1) there.
const versionLabel = (indexFromOriginal: number, total: number, t: TFunction, lang: string): string => {
  if (indexFromOriginal === 0) return t('amendmentModal.version.original');
  const ord = formatOrdinal(indexFromOriginal, lang);
  if (indexFromOriginal === total - 1) return t('amendmentModal.version.amendedMostRecent', { ordinal: ord });
  return t('amendmentModal.version.amended', { ordinal: ord });
};

interface InstanceGroup {
  instanceId: string;
  templateId?: string;
  /** Real, per direct guidance's own follow-up on the addendum-to-
   *  report-section display gap: each instance's own real specimen
   *  label ("Specimen A: Left breast lumpectomy"), when resolvable -
   *  a case with multiple, independently-amended reports previously
   *  showed the exact same generic "AMENDED DIAGNOSIS" header for
   *  each one, with no way to tell them apart. Undefined only when
   *  the real specimen genuinely can't be resolved (never fabricated). */
  specimenLabel?: string;
  amendments: AmendmentRecord[]; // released, sorted ascending by initiatedAt
  columns: Record<string, unknown>[]; // ascending: Original -> ... -> Most Recent
}

const InstanceMatrix: React.FC<{ group: InstanceGroup; liveAnswers: Record<string, unknown> | undefined }> = ({ group, liveAnswers }) => {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState<{ title: string; fieldKeys: string[] }[] | undefined>(undefined);

  useEffect(() => {
    if (!group.templateId) { setSections(undefined); return; }
    let cancelled = false;
    getTemplate(group.templateId).then(detail => {
      if (cancelled) return;
      const s = ((detail.template as any)?.sections ?? []) as any[];
      setSections(s.map(sec => ({ title: sec.title as string, fieldKeys: (sec.fields ?? []).map((f: any) => f.id as string) })));
    }).catch(e => {
      console.error(`[AmendmentStatusBanner] Could not load template sections for ${group.templateId}:`, e);
      if (!cancelled) setSections(undefined);
    });
    return () => { cancelled = true; };
  }, [group.templateId]);

  const latest = group.amendments[group.amendments.length - 1];
  // If live answers are more current than the last known column (e.g. a
  // version record hasn't been created yet for some reason), append them
  // as a defensive final column rather than silently going stale.
  const lastColJson = JSON.stringify(group.columns[group.columns.length - 1] ?? {});
  const columns = liveAnswers && JSON.stringify(liveAnswers) !== lastColJson
    ? [...group.columns, liveAnswers]
    : group.columns;

  const total = columns.length;
  const columnsDescending = [...columns].reverse();
  const rawFieldKeys = Array.from(new Set(columns.flatMap(c => Object.keys(c))));
  // Real fix, item #24: previously showed every field present in any
  // version, including the large majority that never actually changed
  // across the whole amendment history — cluttering what's meant to be
  // a "what changed" comparison with dozens of identical-value rows.
  // Only fields where at least one version's value genuinely differs
  // from another belong here; JSON.stringify handles array-valued
  // fields (e.g. tumor_site) correctly too, not just scalars.
  const allFieldKeys = rawFieldKeys.filter(k => {
    const values = columns.map(c => JSON.stringify((c as any)[k] ?? null));
    return new Set(values).size > 1;
  });

  // Group by real section structure when available; unsectioned fields
  // (present in the data but not in the template, e.g. legacy/removed
  // fields) still get shown, in their own group, rather than silently
  // dropped.
  const sectionedKeys = new Set(sections?.flatMap(s => s.fieldKeys) ?? []);
  const unsectioned = allFieldKeys.filter(k => !sectionedKeys.has(k)).sort();
  const rowGroups: { title: string | null; fieldKeys: string[] }[] = sections && sections.length > 0
    ? [
        ...sections.map(s => ({ title: s.title, fieldKeys: s.fieldKeys.filter(k => allFieldKeys.includes(k)) })),
        ...(unsectioned.length > 0 ? [{ title: t('copilotReportViewModal.otherSectionTitle'), fieldKeys: unsectioned }] : []),
      ]
    : [{ title: null, fieldKeys: allFieldKeys.sort() }];

  return (
    <div className="ps-amendment-status-row">
      <div className="ps-amendment-narrative-header-row">
        <p className="ps-amendment-narrative-header">
          {t('amendmentStatusBanner.amendedDiagnosisHeader')}{group.specimenLabel ? ` \u2014 ${group.specimenLabel}` : ''} {t('amendmentStatusBanner.timestampSuffix', { time: formatDateTime(latest.releasedAt) })}
        </p>
        <button type="button" className="ps-amendment-collapse-toggle" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? `▸ ${t('amendmentStatusBanner.showDetailsToggle')}` : `▾ ${t('synopticEditor.common.collapse')}`}
        </button>
      </div>
      <p className="ps-amendment-narrative-line"><strong>{t('copilotReportViewModal.reasonForAmendmentLabel')}</strong> {latest.explanationOfChange}</p>
      {latest.notification && (
        <p className="ps-amendment-narrative-line">
          <strong>{t('copilotReportViewModal.clinicianNotifiedLabel')}</strong> {latest.notification.clinicianName} — {t(NOTIFICATION_METHOD_LABEL_KEY[latest.notification.method])}, {formatDateTime(latest.notification.notifiedAt)}
        </p>
      )}
      <p className="ps-amendment-status-row-author">{t('amendmentModal.summary.amendedBy')} {latest.authoringPathologist.userName}</p>

      {!collapsed && (
        <table className="ps-amendment-matrix">
          <thead>
            <tr>
              <th>{t('copilotReportViewModal.diffTable.element')}</th>
              {columnsDescending.map((_, i) => (
                <th key={i}>{versionLabel(total - 1 - i, total, t, i18n.language)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowGroups.filter(g => g.fieldKeys.length > 0).map(group => (
              <React.Fragment key={group.title ?? '_flat'}>
                {group.title && (
                  <tr className="ps-amendment-matrix-section-row">
                    <td colSpan={total + 1}>{group.title}</td>
                  </tr>
                )}
                {group.fieldKeys.map(key => {
                  const rowValues = columnsDescending.map(c => c[key]);
                  const hasChange = new Set(rowValues.map(v => JSON.stringify(v))).size > 1;
                  return (
                    <tr key={key}>
                      <td>{key}</td>
                      {rowValues.map((val, i) => (
                        <td key={i} className={hasChange ? (i === 0 ? 'ps-amendment-matrix-current' : 'ps-amendment-matrix-previous') : undefined}>
                          {formatValue(val, t)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export const AmendmentStatusBanner: React.FC<{ caseId?: string; synopticReports?: any[]; specimens?: { id: string; label: string; description?: string }[] }> = ({ caseId, synopticReports, specimens }) => {
  const { t } = useTranslation();
  const [amendments, setAmendments] = useState<AmendmentRecord[]>([]);
  const [versions, setVersions] = useState<ReportVersionRecord[]>([]);

  useEffect(() => {
    if (!caseId) { setAmendments([]); setVersions([]); return; }
    Promise.all([
      amendmentService.getByCaseId(caseId),
      reportVersionService.getByCaseId(caseId),
    ]).then(([amendRes, versionRes]) => {
      if (amendRes.ok) setAmendments(amendRes.data.filter(r => r.status === 'released' && r.type === 'amendment'));
      if (versionRes.ok) setVersions(versionRes.data);
    });
  }, [caseId]);

  if (amendments.length === 0) return null;

  // Group released amendments by the instance they belong to.
  const byInstance = new Map<string, AmendmentRecord[]>();
  for (const a of amendments) {
    const instanceId = (a.originalReportSnapshot as any)?.instanceId;
    if (!instanceId) continue;
    if (!byInstance.has(instanceId)) byInstance.set(instanceId, []);
    byInstance.get(instanceId)!.push(a);
  }

  const groups: InstanceGroup[] = Array.from(byInstance.entries()).map(([instanceId, instanceAmendments]) => {
    const sorted = [...instanceAmendments].sort((a, b) => a.initiatedAt.localeCompare(b.initiatedAt));
    const liveInstance = (synopticReports ?? []).find((r: any) => r.instanceId === instanceId);

    // Prefer real version history for this instance, oldest first.
    const versionHistory = versions
      .filter(v => v.instanceId === instanceId && v.synopticAnswersSnapshot)
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map(v => v.synopticAnswersSnapshot!);

    let columns: Record<string, unknown>[];
    if (versionHistory.length > 0) {
      // Original answers come from the first amendment's snapshot (the
      // pre-edit state); version records only start existing from the
      // point releases began generating them.
      const original = (sorted[0].originalReportSnapshot as any)?.answers ?? {};
      columns = [original, ...versionHistory];
    } else {
      // Fallback for older data with no version records at all (e.g.
      // amend-seed-001/002, predating instanceId tracking): reconstruct
      // the old pairwise chain — each amendment's own "before" snapshot,
      // ending with the live current instance answers.
      columns = [
        ...sorted.map(a => (a.originalReportSnapshot as any)?.answers ?? {}),
        liveInstance?.answers ?? {},
      ];
    }

    return {
      instanceId,
      templateId: liveInstance?.templateId,
      // Real, per direct guidance's own follow-up: the instance's own
      // real specimenId (SynopticReportInstance.specimenId, already
      // present on every real synopticReports entry) resolved against
      // the real, given specimens list. Undefined, never fabricated,
      // when either piece of real data is missing.
      specimenLabel: (() => {
        const specimenId = liveInstance?.specimenId;
        const sp = specimenId ? specimens?.find(s => s.id === specimenId) : undefined;
        return sp ? `${sp.label}${sp.description ? `: ${sp.description}` : ''}` : undefined;
      })(),
      amendments: sorted,
      columns,
    };
  });

  const totalAmendments = amendments.length;

  return (
    <div className="ps-amendment-status-banner">
      <div className="ps-amendment-status-banner-header">
        <span className="ps-amendment-status-flag">{t('copilotReportViewModal.amendedFlag')}</span>
        {totalAmendments > 1 && (
          <span className="ps-amendment-status-count"> — {t('amendmentStatusBanner.amendmentsCount', { count: totalAmendments })}</span>
        )}
      </div>
      {groups.map(group => (
        <InstanceMatrix
          key={group.instanceId}
          group={group}
          liveAnswers={(synopticReports ?? []).find((r: any) => r.instanceId === group.instanceId)?.answers}
        />
      ))}
    </div>
  );
};
