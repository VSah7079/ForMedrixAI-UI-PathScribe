// src/components/Support/SupportReferenceLookup.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-350): the lab's side of a support conversation. Support
// quotes a reference (SR-7K2Q-9MXD); staff here, who may see patient data,
// find what it names. Each lookup is audited by the service.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { useAuth } from '@/contexts/AuthContext';
import { supportReferenceService, type AuditLog, type ErrorLog } from '@/services';
import type { InterfaceException } from '@/services/interfaceExceptions/IInterfaceExceptionService';
import { describeSupportTarget, type SupportTarget } from '@/services/supportReferences/supportReferenceTargets';

interface Props {
  initialRef?: string;
  data: { auditLogs: readonly AuditLog[]; errorLogs: readonly ErrorLog[]; interfaceExceptions: readonly InterfaceException[] };
  onOpenCase: (caseId: string) => void;
}

const SupportReferenceLookup: React.FC<Props> = ({ initialRef, data, onOpenCase }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [text, setText] = useState(initialRef ?? '');
  const [ref, setRef] = useState<string | null>(null);
  const [target, setTarget] = useState<SupportTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const find = async (value: string) => {
    setTarget(null); setError(null);
    const res = await supportReferenceService.resolve(value, { id: user?.id ?? 'unknown', name: user?.name ?? '' });
    if (!res.ok) { setError('error' in res ? String(res.error) : 'supportReferenceNotFound'); return; }
    setRef(res.data.ref);
    setTarget(describeSupportTarget(res.data, data));
  };

  useEffect(() => { if (initialRef) void find(initialRef); /* once, for a ?supportRef= link */ }, [initialRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ps-supportref-lookup">
      <div className="ps-supportref-lookup-title">🔖 {t('supportReference.lookup.title')}</div>
      <form className="ps-supportref-lookup-form" onSubmit={e => { e.preventDefault(); void find(text); }}>
        <input className="ps-conf-input ps-supportref-lookup-input" value={text} onChange={e => setText(e.target.value)}
          placeholder={t('supportReference.lookup.placeholder')} aria-label={t('supportReference.lookup.title')} />
        <button type="submit" className="ps-conf-btn-primary" disabled={!text.trim()}>{t('supportReference.lookup.find')}</button>
      </form>
      {error && <div className="ps-conf-error-text">{t(`supportReference.lookup.errors.${error}`)}</div>}
      {target && (
        <div className="ps-supportref-lookup-result">
          <div className="ps-supportref-lookup-kind">{t('supportReference.lookup.names', { ref, kind: t(`supportReference.kinds.${target.kind}`) })}</div>
          {!target.found && <div className="ps-supportref-lookup-muted">{t('supportReference.lookup.notLoaded')}</div>}
          {target.found && target.title && (
            <div className="ps-supportref-lookup-entry" data-phi="true">
              {target.time && <span className="ps-supportref-lookup-muted">{target.time}</span>}
              <strong>{target.title}</strong>
              {target.detail && <span>{target.detail}</span>}
            </div>
          )}
          {target.caseId && (
            <button type="button" className="ps-conf-btn-secondary" data-phi="accession" onClick={() => onOpenCase(target.caseId!)}>
              {t('supportReference.lookup.openCase', { caseId: target.caseId })}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SupportReferenceLookup;
