// src/services/auth/sessionRole.test.ts — PS-60 (Batch 343)
import { describe, it, expect } from 'vitest';
import type { StaffUser } from '../users/IUserService';
import { buildSsoSessionProfile, deriveSessionRole, resolvePostSignInPath } from './sessionRole';

const catalogue = [
  { id: 'pathologist', name: 'Pathologist', caseAccess: true, configAccess: false },
  { id: 'resident', name: 'Resident', caseAccess: true, configAccess: false },
  { id: 'admin', name: 'Admin', caseAccess: false, configAccess: true },
  { id: 'physician', name: 'Physician', caseAccess: false, configAccess: false },
  { id: 'or-staff', name: 'Or Staff', caseAccess: false, configAccess: false },
];

describe('deriveSessionRole', () => {
  it('maps case and configuration access to the app role', () => {
    expect(deriveSessionRole(['Pathologist'], catalogue)).toBe('pathologist');
    expect(deriveSessionRole(['Resident'], catalogue)).toBe('pathologist');
    expect(deriveSessionRole(['Admin'], catalogue)).toBe('admin');
    expect(deriveSessionRole(['Pathologist', 'Admin'], catalogue)).toBe('pathologist-admin');
  });
  it('matches role names without regard to case, or role ids', () => {
    expect(deriveSessionRole([' pathologist ', 'ADMIN'], catalogue)).toBe('pathologist-admin');
    expect(deriveSessionRole(['or-staff', 'resident'], catalogue)).toBe('pathologist');
  });
  it('directory-only roles, unknown roles and no roles give no app access', () => {
    expect(deriveSessionRole(['Physician'], catalogue)).toBeNull();
    expect(deriveSessionRole(['Or Staff'], catalogue)).toBeNull();
    expect(deriveSessionRole(['Superadmin'], catalogue)).toBeNull();
    expect(deriveSessionRole([], catalogue)).toBeNull();
    expect(deriveSessionRole(undefined, catalogue)).toBeNull();
  });
});

describe('buildSsoSessionProfile', () => {
  const s: StaffUser = {
    id: 'PATH-UK-001', firstName: 'Paul', lastName: 'Carter', email: 'paul.carter@mft.nhs.uk', roles: ['Pathologist'],
    npi: '', license: 'GMC-1', phone: '', status: 'Active', voiceProfile: 'EN-GB', credentials: 'MBChB, FRCPath',
    organisationId: 'ORG-MFT', canViewOrchestration: true,
  };
  it('builds the session from the staff record', () => {
    expect(buildSsoSessionProfile(s, 'pathologist', 'microsoft')).toEqual({
      id: 'PATH-UK-001', name: 'Paul Carter', email: 'paul.carter@mft.nhs.uk', role: 'pathologist', initials: 'PC', voiceProfile: 'EN-GB',
      canViewPediatric: false, canViewOrchestration: true, canAccessCrossTenantQa: false, credentials: 'MBChB, FRCPath',
      signatureUrl: undefined, firstName: 'Paul', middleName: undefined, lastName: 'Carter', organisationId: 'ORG-MFT', defaultScanStationId: undefined,
      authMethod: 'sso', ssoProviderId: 'microsoft',
    });
  });
  it('falls back sensibly for a sparse record', () => {
    const p = buildSsoSessionProfile({ ...s, firstName: '', lastName: '', voiceProfile: null }, 'admin', 'oidc');
    expect(p).toMatchObject({ name: 'paul.carter@mft.nhs.uk', initials: '?', voiceProfile: 'EN-US', role: 'admin' });
  });
});

describe('resolvePostSignInPath', () => {
  it('returns a safe in-app path', () => {
    expect(resolvePostSignInPath('/cases/S26-1?tab=report#top')).toBe('/cases/S26-1?tab=report#top');
  });
  it('goes home for the sign-in pages themselves, other sites, and junk', () => {
    for (const t of ['/login', '/login?x=1', '/auth/callback/microsoft', '//evil.example', '/\\evil.example', 'https://evil.example', '', undefined, 42]) {
      expect(resolvePostSignInPath(t)).toBe('/');
    }
    expect(resolvePostSignInPath('/loginhelp')).toBe('/loginhelp');
  });
});
