export interface EnterpriseFeatures {
  reportingPlusEnabled: boolean; // default false
  /** Real, per direct guidance (PS-105): a genuine enterprise-level
   *  kill switch for the Abnormal Detection capability — deliberately
   *  NOT resolved through isFeatureEnabled()'s existing "hospital
   *  overrides enterprise, either direction" logic. That logic is
   *  correct for reportingPlusEnabled (a facility should be able to
   *  turn a nice-to-have feature on or off for itself either way), but
   *  wrong here: "If the enterprise level is disabled then the
   *  performing facility level is disabled and cannot be overridden."
   *  See resolveAbnormalDetectionEnabled() (services/abnormalDetection/)
   *  for the real, separate resolution logic this actually uses.
   *  Default true — this is an opt-out safety feature, not an
   *  opt-in one. */
  abnormalDetectionEnabled: boolean; // default true
}

export interface EnterpriseConfig {
  id: string;
  name: string;
  features: EnterpriseFeatures;
}