// src/services/phi/phiToast.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 363 (PS-72): a react-toastify message that the support-ticket
// screenshot redacts, for code outside components (services, hooks). The
// component form is components/Common/PhiToastMessage.tsx; both render
// `<span data-phi="true">`, which services/phiSelectors.ts redacts.
//
//   toast.warn(phiToastContent(i18n.t('hl7Notifications.blockException', { accession, … })));
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';

export function phiToastContent(text: string): React.ReactElement {
  return React.createElement('span', { 'data-phi': 'true' }, text);
}

/** The text of a message built by phiToastContent (for tests). */
export function phiToastText(message: unknown): string {
  if (typeof message === 'string') return message;
  const el = message as { props?: { children?: unknown } } | null;
  return typeof el?.props?.children === 'string' ? el.props.children : '';
}
