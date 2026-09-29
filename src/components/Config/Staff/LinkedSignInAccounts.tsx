// src/components/Config/Staff/LinkedSignInAccounts.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 345 (PS-60 follow-up): the single-sign-on accounts linked to this
// staff member, in Staff → edit, with Unlink. Renders and dispatches; the
// list and the unlink live in services/auth/linkedAccounts.ts. Unlinking
// takes effect at once (it isn't part of the form's Save) and is audited.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { userService, auditService } from '@/services';
import { describeLinkedAccounts, unlinkExternalIdentity, type LinkedAccountView } from '@/services/auth/linkedAccounts';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmModal from '@/components/Common/ConfirmModal';
import { formatDate } from '@/utils/formatDate';

const PROVIDER_KEYS: Record<string, string> = {
  microsoft: 'login.ssoMicrosoft',
  google: 'login.ssoGoogle',
  oidc: 'login.ssoOrganisation',
};

export const LinkedSignInAccounts: React.FC<{ staffId: string }> = ({ staffId }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<LinkedAccountView[]>([]);
  const [pending, setPending] = useState<LinkedAccountView | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    void userService.getById(staffId).then(res => setAccounts(res.ok ? describeLinkedAccounts(res.data) : []));
  }, [staffId]);
  useEffect(() => { load(); }, [load]);

  const unlink = async () => {
    const target = pending;
    setPending(null);
    if (!target) return;
    const r = await unlinkExternalIdentity(
      { staffId, issuer: target.issuer, subject: target.subject, actorName: user?.name ?? user?.id ?? 'unknown' },
      { userService, auditService },
    );
    setMessage(r.ok ? { kind: 'ok', text: t('staffTab.linkedAccounts.unlinked') } : { kind: 'error', text: t('staffTab.linkedAccounts.unlinkFailed') });
    load();
  };

  return (
    <div className="ps-conf-form-field ps-st-linked">
      <label className="ps-conf-label">{t('staffTab.linkedAccounts.title')}</label>
      <p className="ps-st-cred-desc">{t('staffTab.linkedAccounts.description')}</p>
      {accounts.length === 0 && <p className="ps-st-cred-empty">{t('staffTab.linkedAccounts.empty')}</p>}
      {accounts.length > 0 && (
        <ul className="ps-st-linked-list">
          {accounts.map(a => (
            <li key={`${a.issuer}|${a.subject}`} className="ps-st-linked-row">
              <div className="ps-st-linked-text">
                <span className="ps-st-linked-provider">{t(PROVIDER_KEYS[a.providerId] ?? 'login.ssoOrganisation')}</span>
                <span className="ps-st-linked-meta" title={`${a.issuer} · ${a.subject}`}>
                  {t('staffTab.linkedAccounts.accountLine', {
                    account: a.subjectShort,
                    date: formatDate(a.linkedAt, i18n.language),
                    how: t(`staffTab.linkedAccounts.linkedBy.${a.linkedBy}`),
                  })}
                </span>
              </div>
              <button type="button" className="ps-conf-btn-secondary ps-st-linked-unlink" onClick={() => setPending(a)}>
                {t('staffTab.linkedAccounts.unlink')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className={message.kind === 'ok' ? 'ps-st-linked-ok' : 'ps-st-error'} role="status">{message.text}</p>
      )}
      <ConfirmModal
        show={pending !== null}
        title={t('staffTab.linkedAccounts.unlinkTitle')}
        message={t('staffTab.linkedAccounts.unlinkMessage')}
        confirmLabel={t('staffTab.linkedAccounts.unlink')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { void unlink(); }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};

export default LinkedSignInAccounts;
