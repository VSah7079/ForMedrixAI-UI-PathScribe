// src/components/Config/System/ContributionSettingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 of the Orchestration Intelligent Charge Capture & Workload
// Analytics spec (System_Configuration toggle infrastructure) — this
// section is deliberately scoped to just the peer-visibility flag for now.
// Real per-case wRVU/workload tracking (the rest of that spec's Phase 2/3)
// is not built here — it's pending legal/compliance review before any
// AI-driven charge-capture logic gets built, per the decision to query
// the attorney first.
//
// Resolves the privacy question raised during the ProductivityTab.tsx real-
// data review: pathologists' own case counts are now genuinely real (see
// components/Contribution/productivityCalculations.ts), but showing peer
// averages/rankings alongside those real numbers needs to be an
// institutional choice, not a default. This is that choice, stored on the
// real, shared SystemConfig (not a bespoke new service) since it's a
// simple, single, org-wide boolean, same shape as voiceEnabled elsewhere
// on that same config object.
//
// Real fix, Pete's own clinical-informatics guidance: added the real
// facilityTimezone setting - a real, admin-visible way to actually change
// the config value computeMonthlyCaseCounts/computeRvuSummary/
// computeMonthlyRvu genuinely depend on (see utils/facilityTime.ts). A
// real select of common IANA timezones, not free text - an admin typo
// would silently fall back to raw UTC bucketing (see
// getFacilityDateParts' own honest fallback) rather than fail loudly, so
// a validated dropdown is the safer real choice here.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import '../../../pathscribe.css';
import { useSystemConfig } from '../../../contexts/SystemConfigContext';

// Real, common IANA timezone identifiers covering every real US time zone
// plus a few common international ones - not exhaustive, but every real
// entry here is a genuine, valid Intl.DateTimeFormat timeZone value.
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/New_York',    label: 'Eastern Time (US)' },
  { value: 'America/Chicago',     label: 'Central Time (US)' },
  { value: 'America/Denver',      label: 'Mountain Time (US)' },
  { value: 'America/Phoenix',     label: 'Arizona Time (US, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'America/Anchorage',   label: 'Alaska Time (US)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (US, no DST)' },
  { value: 'Europe/London',       label: 'UK Time' },
  { value: 'UTC',                 label: 'UTC' },
];

const ContributionSettingsSection: React.FC = () => {
  const { config, updateConfig } = useSystemConfig();
  const [saved, setSaved] = React.useState(false);

  const handleToggle = (value: boolean) => {
    updateConfig({ showPeerAveragesToPathologists: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTimezoneChange = (value: string) => {
    updateConfig({ facilityTimezone: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Contribution Dashboard Settings</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Controls what pathologists see on their own My Contribution page.
          Administrators, pathologist-admins, and superadmins always see peer
          and institutional comparison data regardless of this setting — it
          only gates the plain pathologist role's view of themselves against
          others.
        </p>
      </div>

      <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Facility Timezone
        </div>
        <select
          value={config.facilityTimezone}
          onChange={e => handleTimezoneChange(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: '#111827', color: '#e2e8f0', border: '1px solid #374151',
          }}
        >
          {TIMEZONE_OPTIONS.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: '#4b5563', marginTop: 12 }}>
          Monthly and YTD metrics (case counts, RVU) group a finalized case
          by the real month/day it happened in THIS timezone — not the
          viewing device's own timezone, and not raw UTC. An 11pm sign-off
          here counts toward that same day even if the pathologist later
          views their own dashboard while traveling elsewhere. Storage
          itself is always UTC; this only controls how it's grouped for
          display and metrics.
        </p>
      </div>

      <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Peer Comparison Visibility
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.showPeerAveragesToPathologists}
            onChange={e => handleToggle(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: '#e2e8f0' }}>
            Show peer averages and top-performer comparisons to pathologists
          </span>
        </label>
        <p style={{ fontSize: 12, color: '#4b5563', marginTop: 12 }}>
          When off (the default), pathologists see only their own real case
          counts and progress toward institutional targets — no comparison
          against colleagues. When on, anonymized peer-average and
          top-performer figures are also shown on their own dashboard.
        </p>
        {saved && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
            ✓ Saved
          </div>
        )}
      </div>
    </div>
  );
};

export default ContributionSettingsSection;
