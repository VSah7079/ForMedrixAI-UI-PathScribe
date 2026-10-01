/**
 * SystemConfigContext.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * React context, provider, and hook for PathScribe system-level configuration.
 *
 * Three layers of config, loaded independently:
 *
 *   1. SystemConfig        — local system settings (LIS toggles, voice, etc.)
 *                            Loaded from localStorage, edited in Config UI.
 *
 *   2. EnterpriseConfig    — top-level org settings (feature flags for the
 *                            whole network). Will be Firestore-backed in prod.
 *
 *   3. HospitalConfig      — per-hospital overrides. Hospital-level features
 *                            take precedence over enterprise-level defaults.
 *                            Will be Firestore-backed in prod.
 *
 * Feature resolution:
 *   Use isFeatureEnabled('reportingPlusEnabled') rather than reading
 *   enterprise/hospital config directly. The helper applies the override
 *   hierarchy: hospital → enterprise → false.
 *
 * Usage:
 *   const { config, updateConfig, enterpriseConfig, hospitalConfig,
 *           isFeatureEnabled } = useSystemConfig();
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';

import { SystemConfig, DEFAULT_SYSTEM_CONFIG } from '../types/systemConfig';
import type { EnterpriseConfig, EnterpriseFeatures } from '@app-types/config/EnterpriseConfig';
import type { HospitalConfig } from '@app-types/config/HospitalConfig';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_ENTERPRISE_FEATURES: EnterpriseFeatures = {
  reportingPlusEnabled: false,
  abnormalDetectionEnabled: true,
};

const DEFAULT_ENTERPRISE_CONFIG: EnterpriseConfig = {
  id:       'ENT-DEFAULT',
  name:     'PathScribe Enterprise',
  features: DEFAULT_ENTERPRISE_FEATURES,
};

const DEFAULT_HOSPITAL_CONFIG: HospitalConfig = {
  id:           'HOSP-001',
  name:         'Default Hospital',
  enterpriseId: 'ENT-DEFAULT',
  features:     { reportingPlusEnabled: true },
};

// ─── Persistence helpers ──────────────────────────────────────────────────────

// v2: UK accession + NHS Number formats now enabled by default (see
// DEFAULT_SYSTEM_CONFIG's own comment) — bumped so existing sessions with
// a persisted v1 config actually pick up the new default instead of the
// shallow merge below silently keeping their old US-only identifierFormats
// forever.
const LS_VERSION = 'v2';
// Exported so other modules that read the persisted config directly from
// localStorage (outside React context — e.g. firestoreCodeService.ts,
// which needs to work from seed scripts too) use the real, current key
// rather than hardcoding their own copy of it. That's exactly how
// firestoreCodeService.ts silently broke when LS_VERSION bumped to v2 —
// it had its own hardcoded 'pathscribe_system_config_v1' string.
const LS_KEY = `pathscribe_system_config_${LS_VERSION}`;
const LS_ENT_KEY = `pathscribe_enterprise_config_${LS_VERSION}`;
const LS_HSP_KEY = `pathscribe_hospital_config_${LS_VERSION}`;

function loadSystemConfig(): SystemConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const merged: SystemConfig = raw
      ? { ...DEFAULT_SYSTEM_CONFIG, ...JSON.parse(raw) as Partial<SystemConfig> }
      : { ...DEFAULT_SYSTEM_CONFIG };
    const envVoice = import.meta.env?.VITE_VOICE_ENABLED;
    if (envVoice === 'false') merged.voiceEnabled = false;
    return merged;
  } catch { return { ...DEFAULT_SYSTEM_CONFIG }; }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) as Partial<T> } : { ...fallback };
  } catch { return { ...fallback }; }
}

function saveJson<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface SystemConfigContextValue {
  // ── System config ───────────────────────────────────────────────────────
  config:        SystemConfig;
  updateConfig:  (patch: Partial<SystemConfig>) => void;
  resetConfig:   () => void;

  // ── Enterprise + Hospital config ────────────────────────────────────────
  enterpriseConfig:        EnterpriseConfig;
  hospitalConfig:          HospitalConfig;
  updateEnterpriseConfig:  (patch: Partial<EnterpriseConfig>) => void;
  updateHospitalConfig:    (patch: Partial<HospitalConfig>)    => void;

  /**
   * Resolves a feature flag through the override hierarchy:
   *   hospital.features → enterprise.features → false
   *
   * Example:
   *   const reportingPlus = isFeatureEnabled('reportingPlusEnabled');
   */
  isFeatureEnabled: (feature: keyof EnterpriseFeatures) => boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SystemConfigContext = createContext<SystemConfigContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SystemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const [config,           setConfig]           = useState<SystemConfig>(loadSystemConfig);
  const [enterpriseConfig, setEnterpriseConfig] = useState<EnterpriseConfig>(() => loadJson(LS_ENT_KEY, DEFAULT_ENTERPRISE_CONFIG));
  const [hospitalConfig,   setHospitalConfig]   = useState<HospitalConfig>(()   => loadJson(LS_HSP_KEY, DEFAULT_HOSPITAL_CONFIG));

  // Persist all three configs whenever they change
  useEffect(() => { saveJson(LS_KEY,     config);           }, [config]);
  useEffect(() => { saveJson(LS_ENT_KEY, enterpriseConfig); }, [enterpriseConfig]);
  useEffect(() => { saveJson(LS_HSP_KEY, hospitalConfig);   }, [hospitalConfig]);

  const updateConfig = useCallback((patch: Partial<SystemConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_SYSTEM_CONFIG });
  }, []);

  const updateEnterpriseConfig = useCallback((patch: Partial<EnterpriseConfig>) => {
    setEnterpriseConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const updateHospitalConfig = useCallback((patch: Partial<HospitalConfig>) => {
    setHospitalConfig(prev => ({ ...prev, ...patch }));
  }, []);

  // Hospital overrides enterprise — if hospital explicitly sets a feature,
  // that value wins regardless of the enterprise default.
  const isFeatureEnabled = useCallback((feature: keyof EnterpriseFeatures): boolean => {
    const hospitalVal  = hospitalConfig.features[feature];
    const enterpriseVal = enterpriseConfig.features[feature];
    // Hospital value takes precedence; fall back to enterprise; default false
    return hospitalVal ?? enterpriseVal ?? false;
  }, [hospitalConfig, enterpriseConfig]);

  return (
    <SystemConfigContext.Provider value={{
      config, updateConfig, resetConfig,
      enterpriseConfig, hospitalConfig,
      updateEnterpriseConfig, updateHospitalConfig,
      isFeatureEnabled,
    }}>
      {children}
    </SystemConfigContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useSystemConfig = (): SystemConfigContextValue => {
  const ctx = useContext(SystemConfigContext);
  if (!ctx) throw new Error(
    'useSystemConfig must be used within a <SystemConfigProvider>. ' +
    'Add <SystemConfigProvider> to your app root in main.tsx or App.tsx.'
  );
  return ctx;
};
