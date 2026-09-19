// src/pages/FacilityOpsDashboard/FacilityOpsDashboardPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-288, Enterprise Laboratory Operations Dashboard Engine. Per
// direct scope confirmation: all five department dashboard views,
// bound via a real Display Profile (services/facilityOpsDashboard/),
// carouseling between a profile's own assignedViews on a real timer
// when more than one is assigned, high-contrast alerting/SLA
// countdown styling, and an honest polling stand-in for real-time
// push — never a claim of true WebSocket/SSE push, which this app has
// no backend infrastructure for (same real, disclosed posture as
// OrSuiteDashboardPage.tsx's own header) — PLUS a real "Offline /
// Stale Data" badge whenever the last poll failed or has gone stale,
// which that earlier board does not yet have.
//
// Same real "wall-mounted display, Station-Identity-style binding,
// deliberately public/unauthenticated route" reasoning as
// OrSuiteDashboardPage.tsx/App.tsx's own routing comment — a
// Grossing/Staining/etc. bench display isn't a per-user login either.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentDisplayProfile } from '@/hooks/useCurrentDisplayProfile';
import { mockDisplayProfileService } from '@/services/facilityOpsDashboard/mockDisplayProfileService';
import { facilityService } from '@/services';
import type { DisplayProfile } from '@/services/facilityOpsDashboard/IDisplayProfileService';
import type { DashboardSummary } from '@/services/facilityOpsDashboard/IFacilityOpsDashboardTypes';
import { DASHBOARD_VIEW_REGISTRY } from './viewRegistry';
import DashboardSummaryView from './components/DashboardSummaryView';

const POLL_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = POLL_INTERVAL_MS * 2;
const DEFAULT_CAROUSEL_SECONDS = 20;

// Real, closed gap (per direct follow-up: "the monitors... to be done
// after the individual workstations were built"): DisplayProfile's own
// deviceToken (admin-recorded bookkeeping, see DisplayProfilesSection.tsx)
// was captured but never once consulted anywhere in this binding flow —
// any browser could bind to any profile purely by its friendly name.
// A profile with a token recorded now requires that exact token to be
// typed here before the bind completes; a profile with none set still
// binds straight from the dropdown, unchanged. This still is NOT real
// physical hardware verification — no MAC/IP a browser can actually read
// is ever compared, only a human-entered string against another
// human-entered string — it closes the specific, concrete inconsistency
// (a recorded value nothing ever checked), not the larger, still-honestly-
// disclosed "no real device binding exists" limitation (see
// services/facilityOpsDashboard/README.md).
const ProfileSetup: React.FC<{ onBound: (id: string) => void }> = ({ onBound }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<DisplayProfile[]>([]);
  const [pendingProfile, setPendingProfile] = useState<DisplayProfile | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState(false);
  useEffect(() => { mockDisplayProfileService.getActive().then(res => { if (res.ok) setProfiles(res.data); }); }, []);

  const handleSelect = (id: string) => {
    if (!id) return;
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    if (profile.deviceToken && profile.deviceToken.trim()) {
      setPendingProfile(profile);
      setTokenInput('');
      setTokenError(false);
    } else {
      onBound(profile.id);
    }
  };

  const confirmToken = () => {
    if (!pendingProfile) return;
    if (tokenInput.trim() === (pendingProfile.deviceToken ?? '').trim()) {
      onBound(pendingProfile.id);
    } else {
      setTokenError(true);
    }
  };

  if (pendingProfile) {
    return (
      <div className="ps-opsdash-setup-page">
        <div className="ps-opsdash-setup-content">
          <h1>{t('facilityOpsDashboard.confirmTokenTitle')}</h1>
          <p className="ps-opsdash-setup-description">
            {t('facilityOpsDashboard.confirmTokenDescription', { name: pendingProfile.name })}
          </p>
          <input
            className="ps-opsdash-setup-select"
            type="text"
            value={tokenInput}
            onChange={e => { setTokenInput(e.target.value); setTokenError(false); }}
            placeholder={t('facilityOpsDashboard.confirmTokenPlaceholder')}
            autoFocus
          />
          {tokenError && <p className="ps-opsdash-setup-token-error">{t('facilityOpsDashboard.confirmTokenError')}</p>}
          <p className="ps-opsdash-setup-empty">{t('facilityOpsDashboard.confirmTokenNote')}</p>
          <div className="ps-opsdash-setup-token-actions">
            <button className="ps-opsdash-btn-secondary" onClick={() => setPendingProfile(null)}>{t('common.back')}</button>
            <button className="ps-opsdash-btn-primary" onClick={confirmToken} disabled={!tokenInput.trim()}>{t('common.confirm')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-opsdash-setup-page">
      <div className="ps-opsdash-setup-content">
        <h1>{t('facilityOpsDashboard.bindDisplayTitle')}</h1>
        <p className="ps-opsdash-setup-description">{t('facilityOpsDashboard.bindDisplayDescription')}</p>
        <select className="ps-opsdash-setup-select" onChange={e => handleSelect(e.target.value)} defaultValue="">
          <option value="">{t('facilityOpsDashboard.selectProfile')}</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {profiles.length === 0 && <p className="ps-opsdash-setup-empty">{t('facilityOpsDashboard.noProfilesConfigured')}</p>}
      </div>
    </div>
  );
};

const LiveClock: React.FC = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  return <div className="ps-opsdash-clock">{now.toLocaleTimeString()}</div>;
};

const FacilityOpsDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { profileId, setProfileId } = useCurrentDisplayProfile();
  const [profile, setProfile] = useState<DisplayProfile | null>(null);
  const [facilityName, setFacilityName] = useState<string>('');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!profileId) { setProfile(null); return; }
    mockDisplayProfileService.getById(profileId).then(res => { if (res.ok) setProfile(res.data); });
  }, [profileId]);

  useEffect(() => {
    if (!profile) { setFacilityName(''); return; }
    facilityService.getAll().then(res => {
      if (res.ok) setFacilityName(res.data.find(f => f.id === profile.facilityId)?.name ?? profile.facilityId);
    });
  }, [profile]);

  const assignedViews = profile?.assignedViews ?? [];
  const currentViewId = assignedViews[carouselIndex % Math.max(assignedViews.length, 1)];
  const currentView = currentViewId ? DASHBOARD_VIEW_REGISTRY[currentViewId] : undefined;

  // Real carousel timer — only runs with more than one assigned view;
  // a single-view profile never advances, per this file's own header.
  useEffect(() => {
    if (assignedViews.length <= 1) return;
    const seconds = profile?.carouselIntervalSeconds ?? DEFAULT_CAROUSEL_SECONDS;
    const id = window.setInterval(() => setCarouselIndex(i => i + 1), Math.max(5, seconds) * 1000);
    return () => window.clearInterval(id);
  }, [assignedViews.length, profile?.carouselIntervalSeconds]);

  const refresh = useCallback(async () => {
    if (!currentView || !profile) return;
    try {
      const result = await currentView.compute(profile.facilityId);
      setSummary(result);
      setLastSuccessAt(Date.now());
    } catch {
      // Real, honest failure path — the offline/stale badge below is
      // what surfaces this to whoever's watching the wall, not a
      // thrown error on a kiosk nobody can dismiss.
    }
  }, [currentView, profile]);

  useEffect(() => { setSummary(null); refresh(); }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const isStale = useMemo(() => !lastSuccessAt || (nowTick - lastSuccessAt) > STALE_AFTER_MS, [lastSuccessAt, nowTick]);

  if (!profileId) return <ProfileSetup onBound={setProfileId} />;
  if (!profile) return <div className="ps-opsdash-loading">{t('facilityOpsDashboard.loadingProfile')}</div>;

  return (
    <div className="ps-opsdash-page">
      <div className="ps-opsdash-header">
        <div>
          <div className="ps-opsdash-header-eyebrow">{profile.name}</div>
          <div className="ps-opsdash-header-view-title">{currentView ? t(currentView.titleKey) : ''}</div>
          <div className="ps-opsdash-header-meta">{facilityName}</div>
        </div>
        <div className="ps-opsdash-header-right">
          <LiveClock />
          {isStale && <span className="ps-opsdash-offline-badge">{t('facilityOpsDashboard.offlineStaleBadge')}</span>}
          {lastSuccessAt && !isStale && (
            <span className="ps-opsdash-updated-note">{t('facilityOpsDashboard.lastUpdated', { time: new Date(lastSuccessAt).toLocaleTimeString() })}</span>
          )}
          {assignedViews.length > 1 && (
            <div className="ps-opsdash-carousel-dots">
              {assignedViews.map((v, i) => (
                <span key={v} className={`ps-opsdash-carousel-dot${i === (carouselIndex % assignedViews.length) ? ' ps-opsdash-carousel-dot--active' : ''}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      {summary ? <DashboardSummaryView summary={summary} /> : <div className="ps-opsdash-queue-empty">{t('facilityOpsDashboard.loadingData')}</div>}
    </div>
  );
};

export default FacilityOpsDashboardPage;
