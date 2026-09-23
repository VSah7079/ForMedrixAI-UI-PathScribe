// src/components/Common/PatientIdStatusDot.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: "UI Status Indicator Component."
// A colored status dot next to a patient ID field, with a real, hoverable
// tooltip explaining the status — jurisdiction-aware (NHS Number's own
// real HL7 status code for England & Wales; locally-derived Green/Red for
// CHI/H&C, which carry no such code at all — see patientIdStatus.ts's own
// header comment for the full reasoning this component defers to entirely,
// rather than re-deciding any of it here). A small, presentational
// component only — all real logic lives in computePatientIdStatus().
//
// i18n note: computePatientIdStatus() is a plain utility with no
// useTranslation() of its own, so it returns translation keys
// (labelKey/tooltipKey/tooltipParams/innerKeys) rather than rendered
// text — resolved here, the one place that actually has `t()`. Any
// `innerKeys` entry (a nested validation-reason or NHS status-code
// description key) is resolved first, then substituted into the
// outer tooltip translation.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Jurisdiction } from '@/types/systemConfig';
import { computePatientIdStatus } from '@/utils/patientIdStatus';
import '@/pathscribe.css';

interface Props {
  jurisdiction: Jurisdiction;
  rawId: string | undefined | null;
  /** Only ever meaningful for GB_EW (NHS Number) — see
   *  computePatientIdStatus's own doc comment. Passing undefined for
   *  every other jurisdiction is correct, expected behavior, not a
   *  missing-data problem. */
  hl7StatusCode?: string;
  /** Compact (12px) by default, for inline use next to a label; 'lg'
   *  (16px) for a more prominent, standalone placement. */
  size?: 'sm' | 'lg';
}

const DOT_COLOR: Record<string, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  gray: '#94a3b8',
};

export const PatientIdStatusDot: React.FC<Props> = ({ jurisdiction, rawId, hl7StatusCode, size = 'sm' }) => {
  const { t } = useTranslation();
  const status = computePatientIdStatus(jurisdiction, rawId, hl7StatusCode);
  const px = size === 'lg' ? 10 : 8;
  const tooltipParams: Record<string, unknown> = { ...status.tooltipParams };
  if (status.innerKeys) {
    for (const [param, key] of Object.entries(status.innerKeys)) tooltipParams[param] = t(key);
  }
  const label = t(status.labelKey);
  const tooltip = t(status.tooltipKey, tooltipParams);
  return (
    <span
      className="ps-patient-id-status-dot"
      role="img"
      aria-label={`${label}: ${tooltip}`}
      title={tooltip}
      style={{
        display: 'inline-block',
        width: px,
        height: px,
        borderRadius: '50%',
        flexShrink: 0,
        background: DOT_COLOR[status.color],
        boxShadow: `0 0 4px ${DOT_COLOR[status.color]}99`,
        cursor: 'default',
      }}
    />
  );
};

export default PatientIdStatusDot;
