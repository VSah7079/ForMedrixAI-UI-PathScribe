// src/pages/OutboundDispatchTrailSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Audit Log → Interfaces → Outbound Dispatches (Jira PS-86, Batch 318).
//
// A historical trail of what PathScribe sent out. It is not an error queue:
// failed sends of the other outbound types live in the Outbound Interface DLQ
// sub-tab beside this one. Phase 1 per Pete's scoping on PS-86 covers
// Category E (OrderCreated, sent at accession), the one outbound type with a
// persisted event log (services/interfaceEngine/). Categories C/D/F are a
// later phase.
//
// Each row shows the send outcome (delivered / failed / recorded-before-
// outcomes-were-tracked). Clicking a row opens the exact JSON payload that was
// sent, as an expandable tree, with Copy Payload.
//
// Why there is no HL7 (ER7) view: PathScribe sends JSON, and the interface
// engine builds the HL7 message (the posture of every payload builder in
// services/). Rendering "the HL7 that was sent" here would mean inventing a
// message PathScribe never produced, so the drawer says so instead.
//
// Render-and-dispatch only: joining, filtering and counting are in
// services/interfaceEngine/buildDispatchTrail.ts.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { mockInterfaceEngineService } from '@/services/interfaceEngine/mockInterfaceEngineService';
import type { OrderCreatedDispatchRecord } from '@/services/interfaceEngine/IInterfaceEngineService';
import { filterDispatchTrail, countDispatchTrail, type DispatchTrailFilter } from '@/services/interfaceEngine/buildDispatchTrail';
import { getOrganisationDisplayName } from '@/services/organisation/organisationService';
import { formatAuditTimestamp } from '@/utils/formatDate';

const STATUS_LABEL_KEY: Record<OrderCreatedDispatchRecord['status'], string> = {
  delivered: 'outboundDispatchTrail.status.delivered',
  failed:    'outboundDispatchTrail.status.failed',
  recorded:  'outboundDispatchTrail.status.recorded',
};

const FILTER_LABEL_KEY: Record<DispatchTrailFilter, string> = {
  all:       'outboundDispatchTrail.filter.all',
  delivered: 'outboundDispatchTrail.filter.delivered',
  failed:    'outboundDispatchTrail.filter.failed',
  recorded:  'outboundDispatchTrail.filter.recorded',
};

// Reuses the Outbound Interface DLQ's labels for the same three error codes.
const ERROR_LABEL_KEY: Record<NonNullable<OrderCreatedDispatchRecord['errorCode']>, string> = {
  DISPATCH_TIMEOUT:     'outboundInterfaceDlq.errorLabel.dispatchTimeout',
  DISPATCH_UNREACHABLE: 'outboundInterfaceDlq.errorLabel.engineUnreachable',
  DISPATCH_REJECTED:    'outboundInterfaceDlq.errorLabel.dispatchRejected',
};

// ─── JSON tree ────────────────────────────────────────────────────────────────
// Native <details> give expand/collapse with no state. Keys and values are the
// payload's own data and are never translated.

const JsonValue: React.FC<{ value: unknown }> = ({ value }) => {
  if (value === null) return <span className="ps-dispatch-json-null">null</span>;
  if (typeof value === 'string') return <span className="ps-dispatch-json-string">"{value}"</span>;
  if (typeof value === 'number' || typeof value === 'boolean') return <span className="ps-dispatch-json-literal">{String(value)}</span>;
  return <span className="ps-dispatch-json-null">{String(value)}</span>;
};

const JsonNode: React.FC<{ label?: string; value: unknown; depth: number }> = ({ label, value, depth }) => {
  const isArray = Array.isArray(value);
  const isObject = !isArray && typeof value === 'object' && value !== null;
  if (!isArray && !isObject) {
    return (
      <div className="ps-dispatch-json-leaf">
        {label !== undefined && <span className="ps-dispatch-json-key">{label}: </span>}
        <JsonValue value={value} />
      </div>
    );
  }
  const entries: [string, unknown][] = isArray ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as object);
  const bracket = isArray ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) {
    return (
      <div className="ps-dispatch-json-leaf">
        {label !== undefined && <span className="ps-dispatch-json-key">{label}: </span>}
        <span className="ps-dispatch-json-punct">{bracket[0]}{bracket[1]}</span>
      </div>
    );
  }
  return (
    <details className="ps-dispatch-json-branch" open={depth < 2}>
      <summary>
        {label !== undefined && <span className="ps-dispatch-json-key">{label}: </span>}
        <span className="ps-dispatch-json-punct">{bracket[0]}</span>
        <span className="ps-dispatch-json-size">{entries.length}</span>
        <span className="ps-dispatch-json-punct">{bracket[1]}</span>
      </summary>
      <div className="ps-dispatch-json-children">
        {entries.map(([k, v]) => <JsonNode key={k} label={k} value={v} depth={depth + 1} />)}
      </div>
    </details>
  );
};

// ─── Payload drawer ───────────────────────────────────────────────────────────

const PayloadDrawer: React.FC<{ record: OrderCreatedDispatchRecord; onClose: () => void }> = ({ record, onClose }) => {
  const { t } = useTranslation();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = () => {
    navigator.clipboard
      .writeText(JSON.stringify(record.payload, null, 2))
      .then(() => setCopy('copied'), () => setCopy('failed'));
  };

  return (
    <div className="ps-ms-overlay" onClick={onClose}>
      <div className="ps-ms-modal ps-ms-modal--grid" role="dialog" aria-modal="true" aria-label={t('outboundDispatchTrail.drawer.title')} onClick={e => e.stopPropagation()}>
        <div className="ps-ms-header">{t('outboundDispatchTrail.drawer.title')}</div>
        <div className="ps-ms-body">
          <dl className="ps-dispatch-meta">
            <dt>{t('outboundDispatchTrail.col.messageId')}</dt><dd className="ps-dispatch-mono">{record.payload.messageId}</dd>
            <dt>{t('outboundDispatchTrail.col.category')}</dt><dd>{t('outboundDispatchTrail.categoryE')}</dd>
            <dt>{t('outboundDispatchTrail.col.status')}</dt>
            <dd>
              <span className={`ps-dispatch-status ps-dispatch-status--${record.status}`}>{t(STATUS_LABEL_KEY[record.status])}</span>
              {record.attempts !== undefined && <span className="ps-dispatch-attempts">{t('outboundDispatchTrail.attempts', { count: record.attempts })}</span>}
            </dd>
            {record.error && (
              <>
                <dt>{t('outboundDispatchTrail.drawer.error')}</dt>
                <dd>{record.errorCode ? `${t(ERROR_LABEL_KEY[record.errorCode])}: ` : ''}{record.error}</dd>
              </>
            )}
          </dl>
          <p className="ps-conf-hint">{t('outboundDispatchTrail.drawer.jsonNote')}</p>
          <div className="ps-dispatch-json" data-phi="true">
            <JsonNode value={record.payload} depth={0} />
          </div>
        </div>
        <div className="ps-ms-footer">
          {copy === 'copied' && <span className="ps-conf-hint ps-conf-hint--success">{t('outboundDispatchTrail.drawer.copied')}</span>}
          {copy === 'failed' && <span className="ps-conf-hint ps-conf-hint--warning">{t('outboundDispatchTrail.drawer.copyFailed')}</span>}
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.close')}</button>
          <button className="ps-ms-btn-apply" onClick={handleCopy}>{t('outboundDispatchTrail.drawer.copyPayload')}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Section ─────────────────────────────────────────────────────────────────

const OutboundDispatchTrailSection: React.FC = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<OrderCreatedDispatchRecord[]>([]);
  const [filter, setFilter] = useState<DispatchTrailFilter>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<OrderCreatedDispatchRecord | null>(null);

  useEffect(() => {
    mockInterfaceEngineService.listDispatchTrail().then(r => { if (r.ok) setRecords(r.data); });
  }, []);

  const counts = useMemo(() => countDispatchTrail(records), [records]);
  const shown = useMemo(() => filterDispatchTrail(records, filter, search), [records, filter, search]);

  return (
    <>
      <p className="ps-conf-hint">{t('outboundDispatchTrail.intro')}</p>
      <div className="ps-auditlog-filter-row">
        <div className="ps-auditlog-pill-group">
          {(['all', 'delivered', 'failed', 'recorded'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`ps-auditlog-pill${filter === f ? ' ps-auditlog-pill--active-teal' : ''}`}>
              {t(FILTER_LABEL_KEY[f])}
              <span className="ps-auditlog-pill-badge">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="ps-auditlog-filter-divider" />
        <div className="ps-auditlog-search-wrap ps-auditlog-search-wrap--narrow">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('outboundDispatchTrail.searchPlaceholder')}
            className="ps-auditlog-select ps-auditlog-search-input"
          />
        </div>
      </div>

      <div className="ps-table-scroll-wrap" tabIndex={0} role="region" aria-label={t('outboundDispatchTrail.scrollAria')}>
        <div className="ps-auditlog-table">
          <div className="ps-auditlog-thead ps-auditlog-thead--dispatch">
            <div>{t('outboundDispatchTrail.col.timestamp')}</div>
            <div>{t('outboundDispatchTrail.col.messageId')}</div>
            <div>{t('outboundDispatchTrail.col.category')}</div>
            <div>{t('outboundDispatchTrail.col.messageType')}</div>
            <div>{t('outboundDispatchTrail.col.accession')}</div>
            <div>{t('outboundDispatchTrail.col.target')}</div>
            <div>{t('outboundDispatchTrail.col.status')}</div>
          </div>
          <div className="ps-auditlog-tbody">
            {shown.length === 0 ? (
              <div className="ps-auditlog-empty">
                <div className="ps-auditlog-empty-text">{t('outboundDispatchTrail.emptyText')}</div>
              </div>
            ) : shown.map(r => (
              <button key={r.payload.messageId} type="button" className="ps-auditlog-row ps-auditlog-row--dispatch" onClick={() => setOpen(r)}>
                <div className="ps-auditlog-cell-time">{formatAuditTimestamp(r.payload.eventTimestamp)}</div>
                <div className="ps-dispatch-mono">{r.payload.messageId}</div>
                <div>{t('outboundDispatchTrail.categoryEShort')}</div>
                <div className="ps-dispatch-mono">{r.payload.eventType}</div>
                <div data-phi="accession">{r.payload.order.placerOrderNumber}</div>
                <div>{getOrganisationDisplayName(r.payload.facilityId) ?? r.payload.facilityId ?? '—'}</div>
                <div>
                  <span className={`ps-dispatch-status ps-dispatch-status--${r.status}`}>{t(STATUS_LABEL_KEY[r.status])}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ps-auditlog-count-footer">{t('outboundDispatchTrail.footerCount', { shown: shown.length, total: records.length })}</div>

      {open && <PayloadDrawer record={open} onClose={() => setOpen(null)} />}
    </>
  );
};

export default OutboundDispatchTrailSection;
