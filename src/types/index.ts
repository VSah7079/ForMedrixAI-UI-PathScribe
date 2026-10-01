// PS-67 (Batch 348): types/serviceResult.ts ({ success, data, error }) is gone;
// every service now returns ServiceResult from services/types.ts ({ ok, data } | { ok: false, error }).

import type { ProviderCredential } from '@/types/staff/ProviderCredential';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'pathologist' | 'admin' | 'lab-tech';
  initials?: string;
  voiceProfile?: string;
  // This is what's missing and causing the AuthContext errors:
  credentials?: {
    email?: string;
    password?: string;
  };
  /** Real, per direct guidance's own explicit design — sign-out
   *  permissions stored as real, scoped credentials/sub-capabilities
   *  on the user record, not a dynamic top-level role. Deliberately a
   *  separate field from `credentials` above (auth secrets) — same
   *  word, genuinely different real meaning, kept apart rather than
   *  overloading one field for two unrelated concepts. */
  providerCredentials?: ProviderCredential[];
  participationTypeIds?: string[]; // Adding this here will also fix those other 20+ errors!
}

export interface VoiceMacro {
  id: string;
  keyword: string;
  expansion: string;
  category?: 'gross' | 'micro' | 'general';
}
// As you add more types (like VoiceMacro or AIConfig), add them here:
// export * from './voiceMacros';
