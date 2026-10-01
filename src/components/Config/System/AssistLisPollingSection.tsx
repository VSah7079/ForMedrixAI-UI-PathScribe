// src/components/Config/System/AssistLisPollingSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Configuration → System → Integrations → Assist LIS Ingestion (PS-87).
//
// In Assist mode the external LIS owns the case. Its updates reach
// PathScribe through the LIS ingestion layer (Pete's design, Batch 323):
// adapters (polling, HL7 v2, JSON webhook) feed one staging queue, and the
// Assist worker turns Gross Complete and Microscopic/Diagnosis Complete into
// AI synoptic drafts. This screen holds the settings (polling on/off,
// interval, and which LIS status values mean each milestone), Poll now, a
// "Test an inbound message" box, the staging queue, and the run log.
// Render and dispatch only: the rules are in services/lisIngestion/ and
// services/assistPolling/.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockAssistPollingService, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from '@/services/assistPolling/mockAssistPollingService';
import { runAssistPollNow, ingestLisMessageNow, retryFailedLisEventsNow } from '@/services/assistPolling/assistPollingRuntime';
import { assistSettingsChanged, summarizeRun } from '@/services/assistPolling/assistMilestoneRules';
import { ASSIST_MILESTONES, type AssistMilestone, type AssistPollingSettings, type AssistPollingState, type AssistPollRun } from '@/services/assistPolling/types';
import { mockLisStagingQueueService } from '@/services/lisIngestion/mockLisStagingQueueService';
import { recentEvents, countByState } from '@/services/lisIngestion/stagingRules';
import { isAdapterError, type StagedLisEvent } from '@/services/lisIngestion/types';
import { EXAMPLE_HL7_STATUS_MESSAGE } from '@/services/lisIngestion/adapters/hl7v2StatusAdapter';
import { EXAMPLE_WEBHOOK_BODY } from '@/services/lisIngestion/adapters/webhookJsonAdapter';
import { useConfigDirtyGuard } from '../configDirtyGuardContext';
import { formatDateTime } from '@/utils/formatDate';

type PushKind = 'hl7v2' | 'webhook';
const EXAMPLES: Record<PushKind, string> = { hl7v2: EXAMPLE_HL7_STATUS_MESSAGE, webhook: EXAMPLE_WEBHOOK_BODY };
const QUEUE_ROWS_SHOWN = 25;

const AssistLisPollingSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { setDirty } = useConfigDirtyGuard();
  const [state, setState] = useState<AssistPollingState | null>(null);
  const [queue, setQueue] = useState<StagedLisEvent[]>([]);
  const [draft, setDraft] = useState<AssistPollingSettings | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pushKind, setPushKind] = useState<PushKind>('hl7v2');
  const [pushText, setPushText] = useState('');
  const [pushResult, setPushResult] = useState<AssistPollRun | null>(null);

  const load = useCallback(async () => {
    const [s, q] = await Promise.all([mockAssistPollingService.getState(), mockLisStagingQueueService.load()]);
    setState(s);
    setDraft(s.settings);
    setQueue(q);
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = !!state && !!draft && assistSettingsChanged(state.settings, draft);
  useEffect(() => { setDirty(changed); }, [changed, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  if (!state || !draft) return <div className="ps-conf-loading">{t('assistLisPolling.loading')}</div>;

  const set = <K extends keyof AssistPollingSettings>(k: K, v: AssistPollingSettings[K]) => { setDraft({ ...draft, [k]: v }); setSaved(false); };
  const setRow = (i: number, patch: Partial<AssistPollingSettings['statusCrosswalk'][number]>) =>
    set('statusCrosswalk', draft.statusCrosswalk.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    const res = await mockAssistPollingService.saveSettings(draft);
    if (res.ok === false) { setErrorCode(res.error); return; }
    setErrorCode(null);
    setSaved(true);
    await load();
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); await load(); }
  };

  const handleSendMessage = () => runAction(async () => setPushResult(await ingestLisMessageNow(pushKind, pushText)));

  const runError = (run: AssistPollRun) =>
    isAdapterError(run.error) ? t(`assistLisPolling.adapterError.${run.error}`) : t('assistLisPolling.activity.lisUnreachable', { error: run.error });

  const counts = countByState(queue);
  const latest = state.runs[0];

  return (
    <div className="ps-conf-page">
      <h2 className="ps-conf-section-title">{t('assistLisPolling.title')}</h2>
      <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">{t('assistLisPolling.subtitle')}</p>

      {/* ── Settings ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('assistLisPolling.settingsCard.title')}</div>
        <div className="ps-conf-toggle-row">
          <div
            role="switch"
            aria-checked={draft.enabled}
            aria-label={t('assistLisPolling.settingsCard.enabledLabel')}
            tabIndex={0}
            onClick={() => set('enabled', !draft.enabled)}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set('enabled', !draft.enabled); } }}
            className={`ps-conf-toggle-track ${draft.enabled ? 'ps-conf-toggle-track--active' : ''}`}
          >
            <div className="ps-conf-toggle-thumb" />
          </div>
          <span className={`ps-conf-toggle-label ${draft.enabled ? 'ps-conf-toggle-label--active' : ''}`}>
            {draft.enabled ? t('assistLisPolling.settingsCard.enabled') : t('assistLisPolling.settingsCard.disabled')}
          </span>
        </div>

        <div className="ps-conf-form-field">
          <label className="ps-conf-label" htmlFor="assist-poll-interval">{t('assistLisPolling.settingsCard.intervalLabel')}</label>
          <input
            id="assist-poll-interval"
            type="number"
            min={MIN_INTERVAL_MINUTES}
            max={MAX_INTERVAL_MINUTES}
            className="ps-conf-input ps-assist-poll-interval"
            value={draft.intervalMinutes}
            onChange={e => set('intervalMinutes', Number(e.target.value))}
          />
          <p className="ps-conf-hint">{t('assistLisPolling.settingsCard.intervalHint')}</p>
        </div>

        <div className="ps-conf-card-title">{t('assistLisPolling.crosswalk.title')}</div>
        <p className="ps-conf-hint">{t('assistLisPolling.crosswalk.hint')}</p>
        <div className="ps-conf-table-wrap">
          <table className="ps-conf-table">
            <thead>
              <tr>
                <th className="ps-conf-th">{t('assistLisPolling.crosswalk.lisStatus')}</th>
                <th className="ps-conf-th">{t('assistLisPolling.crosswalk.milestone')}</th>
                <th className="ps-conf-th" aria-label={t('assistLisPolling.crosswalk.actions')} />
              </tr>
            </thead>
            <tbody>
              {draft.statusCrosswalk.map((row, i) => (
                <tr key={i} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <input
                      className="ps-conf-input"
                      value={row.lisStatus}
                      aria-label={t('assistLisPolling.crosswalk.lisStatus')}
                      placeholder={t('assistLisPolling.crosswalk.lisStatusPlaceholder')}
                      onChange={e => setRow(i, { lisStatus: e.target.value })}
                    />
                  </td>
                  <td className="ps-conf-td">
                    <select
                      className="ps-conf-select"
                      value={row.milestone}
                      aria-label={t('assistLisPolling.crosswalk.milestone')}
                      onChange={e => setRow(i, { milestone: e.target.value as AssistMilestone })}
                    >
                      {ASSIST_MILESTONES.map(m => <option key={m} value={m}>{t(`assistLisPolling.milestone.${m}`)}</option>)}
                    </select>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-secondary" onClick={() => set('statusCrosswalk', draft.statusCrosswalk.filter((_, j) => j !== i))}>
                      {t('assistLisPolling.crosswalk.remove')}
                    </button>
                  </td>
                </tr>
              ))}
              {draft.statusCrosswalk.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={3}>{t('assistLisPolling.crosswalk.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ps-assist-poll-actions">
          <button className="ps-conf-btn-secondary" onClick={() => set('statusCrosswalk', [...draft.statusCrosswalk, { lisStatus: '', milestone: 'gross_complete' }])}>
            {t('assistLisPolling.crosswalk.add')}
          </button>
        </div>

        {errorCode && <p className="ps-conf-error-text">{t(`assistLisPolling.error.${errorCode}`, { min: MIN_INTERVAL_MINUTES, max: MAX_INTERVAL_MINUTES })}</p>}
        <div className="ps-assist-poll-actions">
          <button className="ps-conf-btn-secondary" disabled={!changed} onClick={() => { setDraft(state.settings); setErrorCode(null); }}>{t('assistLisPolling.discard')}</button>
          <button className="ps-conf-btn-primary" disabled={!changed} onClick={handleSave}>{t('assistLisPolling.save')}</button>
          {saved && !changed && <span className="ps-conf-hint ps-conf-hint--success">{t('assistLisPolling.saved')}</span>}
        </div>
      </div>

      {/* ── Test an inbound message (push adapters) ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-card-title">{t('assistLisPolling.push.title')}</div>
        <p className="ps-conf-hint">{t('assistLisPolling.push.hint')}</p>
        <div className="ps-assist-poll-actions">
          <select className="ps-conf-select" value={pushKind} aria-label={t('assistLisPolling.push.format')} onChange={e => { setPushKind(e.target.value as PushKind); setPushResult(null); }}>
            <option value="hl7v2">{t('assistLisPolling.source.hl7v2')}</option>
            <option value="webhook">{t('assistLisPolling.source.webhook')}</option>
          </select>
          <button className="ps-conf-btn-secondary" onClick={() => { setPushText(EXAMPLES[pushKind]); setPushResult(null); }}>{t('assistLisPolling.push.loadExample')}</button>
        </div>
        <textarea
          className="ps-conf-input ps-assist-poll-message"
          aria-label={t('assistLisPolling.push.messageLabel')}
          placeholder={t('assistLisPolling.push.placeholder')}
          value={pushText}
          onChange={e => { setPushText(e.target.value); setPushResult(null); }}
        />
        <div className="ps-assist-poll-actions">
          <button className="ps-conf-btn-primary" disabled={busy || !pushText.trim()} onClick={handleSendMessage}>{t('assistLisPolling.push.send')}</button>
          {pushResult && (pushResult.error
            ? <span className="ps-conf-error-text">{runError(pushResult)}</span>
            : <span className="ps-conf-hint ps-conf-hint--success">{t('assistLisPolling.push.result', { staged: pushResult.staged, handled: pushResult.items.length })}</span>)}
        </div>
      </div>

      {/* ── Staging queue ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('assistLisPolling.queue.title')}</div>
          <button className="ps-conf-btn-secondary" disabled={busy || counts.failed === 0} onClick={() => runAction(retryFailedLisEventsNow)}>
            {t('assistLisPolling.queue.retryFailed')}
          </button>
        </div>
        <p className="ps-conf-hint">{t('assistLisPolling.queue.counts', { pending: counts.pending, failed: counts.failed, processed: counts.processed })}</p>
        {queue.length === 0 ? (
          <div className="ps-conf-empty-row">{t('assistLisPolling.queue.empty')}</div>
        ) : (
          <div className="ps-conf-table-wrap">
            <table className="ps-conf-table">
              <thead>
                <tr>
                  <th className="ps-conf-th">{t('assistLisPolling.queue.col.received')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.queue.col.source')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.latest.col.accession')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.latest.col.lisStatus')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.queue.col.state')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.latest.col.outcome')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.queue.col.attempts')}</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents(queue, QUEUE_ROWS_SHOWN).map(ev => (
                  <tr key={ev.id} className="ps-conf-tr">
                    <td className="ps-conf-td">{formatDateTime(ev.receivedAt, i18n.language)}</td>
                    <td className="ps-conf-td">{t(`assistLisPolling.source.${ev.source}`)}</td>
                    <td className="ps-conf-td" data-phi="accession">{ev.accession}</td>
                    <td className="ps-conf-td">{ev.lisStatus}</td>
                    <td className="ps-conf-td">{t(`assistLisPolling.queue.state.${ev.state}`)}</td>
                    <td className="ps-conf-td">{ev.error ?? (ev.outcome ? t(`assistLisPolling.outcome.${ev.outcome}`) : '—')}</td>
                    <td className="ps-conf-td">{ev.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Activity ── */}
      <div className="ps-conf-card ps-conf-card--spaced">
        <div className="ps-conf-row">
          <div className="ps-conf-card-title">{t('assistLisPolling.activity.title')}</div>
          <button className="ps-conf-btn-primary" disabled={busy} onClick={() => runAction(() => runAssistPollNow('manual'))}>
            {busy ? t('assistLisPolling.activity.polling') : t('assistLisPolling.activity.pollNow')}
          </button>
        </div>
        <p className="ps-conf-hint">
          {state.cursor
            ? t('assistLisPolling.activity.cursor', { time: formatDateTime(state.cursor, i18n.language) })
            : t('assistLisPolling.activity.noCursor')}
        </p>

        {state.runs.length === 0 ? (
          <div className="ps-conf-empty-row">{t('assistLisPolling.activity.noRuns')}</div>
        ) : (
          <div className="ps-conf-table-wrap">
            <table className="ps-conf-table">
              <thead>
                <tr>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.time')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.trigger')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.fetched')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.staged')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.drafted')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.textOnly')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.skipped')}</th>
                  <th className="ps-conf-th">{t('assistLisPolling.activity.col.failed')}</th>
                </tr>
              </thead>
              <tbody>
                {state.runs.map(run => {
                  const totals = summarizeRun(run);
                  return (
                    <tr key={run.id} className="ps-conf-tr">
                      <td className="ps-conf-td">{formatDateTime(run.startedAt, i18n.language)}</td>
                      <td className="ps-conf-td">{t(`assistLisPolling.trigger.${run.trigger}`)}</td>
                      <td className="ps-conf-td">{run.error ? runError(run) : run.fetched}</td>
                      <td className="ps-conf-td">{run.staged ?? 0}</td>
                      <td className="ps-conf-td">{totals.drafted}</td>
                      <td className="ps-conf-td">{totals.textOnly}</td>
                      <td className="ps-conf-td">{totals.skipped}</td>
                      <td className="ps-conf-td">{totals.failed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {latest && latest.items.length > 0 && (
          <>
            <div className="ps-conf-card-title">{t('assistLisPolling.latest.title')}</div>
            <div className="ps-conf-table-wrap">
              <table className="ps-conf-table">
                <thead>
                  <tr>
                    <th className="ps-conf-th">{t('assistLisPolling.latest.col.accession')}</th>
                    <th className="ps-conf-th">{t('assistLisPolling.latest.col.lisStatus')}</th>
                    <th className="ps-conf-th">{t('assistLisPolling.latest.col.milestone')}</th>
                    <th className="ps-conf-th">{t('assistLisPolling.latest.col.outcome')}</th>
                    <th className="ps-conf-th">{t('assistLisPolling.latest.col.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.items.map(item => (
                    <tr key={item.eventId ?? `${item.accession}-${item.lisStatus}`} className="ps-conf-tr">
                      <td className="ps-conf-td" data-phi="accession">{item.accession}</td>
                      <td className="ps-conf-td">{item.lisStatus}</td>
                      <td className="ps-conf-td">{item.milestone ? t(`assistLisPolling.milestone.${item.milestone}`) : '—'}</td>
                      <td className="ps-conf-td">{t(`assistLisPolling.outcome.${item.outcome}`)}</td>
                      <td className="ps-conf-td">
                        {item.outcome === 'draft_prepared'
                          ? t('assistLisPolling.latest.draftResult', { drafts: item.draftsCreated, fields: item.fieldsSuggested, pending: item.pendingReviewChanges })
                          : item.error ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssistLisPollingSection;
