/**
 * FlagRow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A single quality-flag row for the Quality Flags panel on the
 * Contribution Dashboard.
 *
 * Extracted from ContributionDashboardPage.tsx (Pass 8 props work).
 * Import path: src/components/Contribution/FlagRow.tsx
 *
 * Usage:
 *   <FlagRow
 *     id="PSA-2024-1182"
 *     label="PSA-2024-1182"
 *     value="Missing margin comment"
 *     severity="low"
 *     onClick={() => navigate(`/cases/PSA-2024-1182`)}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { pathscribeTheme } from "@theme/pathscribeTheme";
import type { ContributionFlag, Severity } from "../../types/ContributionDashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
export interface FlagRowProps extends ContributionFlag {}

// ─────────────────────────────────────────────────────────────────────────────
// Severity token maps
// Kept local to this component — the dashboard page no longer needs them.
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_BG: Record<Severity, string> = {
  high:   "rgba(249,115,22,0.12)",   // semantic.warning tint
  medium: "rgba(56,189,248,0.12)",   // semantic.info tint
  low:    "rgba(34,197,94,0.12)",    // semantic.success tint
};

const SEVERITY_COLOR: Record<Severity, string> = {
  high:   pathscribeTheme.colors.semantic.warning,
  medium: pathscribeTheme.colors.semantic.info,
  low:    pathscribeTheme.colors.semantic.success,
};

const SEVERITY_LABEL_KEY: Record<Severity, string> = {
  high:   'flagRow.severity.high',
  medium: 'flagRow.severity.medium',
  low:    'flagRow.severity.low',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const FlagRow: React.FC<FlagRowProps> = ({
  label,
  value,
  severity = "low",
  onClick,
}) => {
  const { t } = useTranslation();
  const bg    = SEVERITY_BG[severity];
  const color = SEVERITY_COLOR[severity];

  return (
    <div
      onClick={onClick}
      className="fr-row"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {/* Left: case ID + issue description */}
      <div className="fr-row-info">
        <span className="fr-row-label">
          {label}
        </span>
        <span className="fr-row-value">
          {value}
        </span>
      </div>

      {/* Right: severity badge */}
      <span
        className="fr-row-badge"
        style={{ '--fr-badge-bg': bg, '--fr-badge-color': color } as React.CSSProperties}
      >
        {t(SEVERITY_LABEL_KEY[severity])}
      </span>
    </div>
  );
};

export default FlagRow;
