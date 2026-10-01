// src/components/Common/CapabilityButton.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): a button for an action that needs a capability. When
// the signed-in user doesn't hold it, the button stays visible but greyed
// out, and its tooltip names the capability (graceful degradation, Pete's
// principle 2). Batch 370: with a `context`, facility scope counts too, and
// the tooltip says when the user's facility assignment is the reason. The click handler runs only when it's held; the service
// behind the action checks again and audits.
//
// aria-disabled rather than disabled, so the tooltip still shows on hover.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCapabilities } from '@/hooks/useCapabilities';
import { capabilityDefinition, capabilityLabelKey, type CapabilityKey } from '@/services';
import type { CapabilityContext } from '@/services/authorization/evaluateCapability';

interface Props {
  capability: CapabilityKey;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
  /** Other reasons the action isn't available right now. */
  disabled?: boolean;
  /** PS-356: what the action touches (a case, a facility, all facilities), for facility scope. */
  context?: CapabilityContext;
}

export const CapabilityButton: React.FC<Props> = ({ capability, className, onClick, children, disabled, context }) => {
  const { t } = useTranslation();
  const { decide, loading } = useCapabilities();
  const decision = decide(capability, context);
  const allowed = !!decision?.allowed;
  const label = (key: string) => { const d = capabilityDefinition(key); return d ? t(capabilityLabelKey(d)) : key; };
  const title = allowed || loading || !decision ? undefined
    : decision.reason === 'outOfScope' || decision.reason === 'facilityUnknown'
      ? t('capabilities.outOfScope', { capability: label(capability) })
      : decision.reason === 'requirementNotGranted'
        ? t('capabilities.requirementMissing', { capability: label(capability), required: decision.missingRequirements.map(label).join(', ') })
        : t('capabilities.notGranted', { capability: label(capability) });
  if (disabled) return <button className={className} disabled>{children}</button>;
  return (
    <button
      className={`${className}${allowed ? '' : ' ps-cap-btn--denied'}`}
      aria-disabled={!allowed}
      title={title}
      data-capability={capability}
      onClick={() => { if (allowed) onClick(); }}
    >
      {children}
    </button>
  );
};
