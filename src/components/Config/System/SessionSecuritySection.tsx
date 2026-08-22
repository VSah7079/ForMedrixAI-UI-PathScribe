// src/components/Config/System/SessionSecuritySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Org-wide default for idle session timeout (Phase 1 of the Inactivity
// Timeout & Draft Recovery spec, complete). Per-performing-lab
// overrides are set on the Facility Configuration edit modal instead — this
// screen only controls the org-wide fallback used when a lab has no
// override, or when no case is currently open (Worklist, Home, etc.).
//
// Deliberately its own small section rather than folded into
// RetentionSection.tsx (a related-sounding but conceptually different
// concept — how long DATA is retained, not how long an ACTIVE SESSION
// stays live) — also a natural home for Phase 2/3's related settings
// (draft retention days, encryption toggle) once those are built, rather
// than needing a second new section added later.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockSessionTimeoutService } from '../../../services/session/mockSessionTimeoutService';

const PRESET_MINUTES = [5, 10, 15, 20, 30, 60];

const SessionSecuritySection: React.FC = () => {
  const [minutes, setMinutes] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    mockSessionTimeoutService.getOrgDefault().then(res => {
      if (res.ok) setMinutes(res.data);
      setLoading(false);
    });
  }, []);

  const handleChange = async (value: number) => {
    setMinutes(value);
    const res = await mockSessionTimeoutService.setOrgDefault(value);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Session Security</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Automatic logoff after a period of inactivity — a HIPAA Security Rule
          technical safeguard. Individual performing labs can require a
          stricter or more relaxed value via their own entry in the Client
          Dictionary; this is the org-wide default used everywhere else.
        </p>
      </div>

      <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Idle Timeout (org-wide default)
        </div>
        <select
          value={minutes}
          onChange={e => handleChange(Number(e.target.value))}
          disabled={loading}
          className="ps-conf-select"
          style={{ width: 240 }}
        >
          {PRESET_MINUTES.map(m => (
            <option key={m} value={m}>{m} minutes</option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: '#4b5563', marginTop: 12 }}>
          A warning is shown 60 seconds before the session actually expires,
          giving the user a chance to stay logged in.
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

export default SessionSecuritySection;
