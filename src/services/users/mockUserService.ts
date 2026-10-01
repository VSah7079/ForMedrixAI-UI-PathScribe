import { IUserService, StaffUser } from './IUserService';
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ─── Seed data (Updated with standardized Voice Profiles) ─────────────────────
// organisationId added June 2026 — see IUserService.ts's own doc comment
// on the field for the full reasoning (this closes a real access-control
// gap; see caseAccessControl.ts). Users 1-10 below are the original
// generic "hospital.org" demo dataset that predates the multi-hospital/
// multi-organisation concept — assigned to ORG-DVMC since that's the
// same organisation the bulk of existing seed case data
// (originHospitalId: 'HOSP-001') already belongs to, so this doesn't
// lock any of them out of the case data they could already see.
const SEED_USERS: StaffUser[] = [
  { id: '1',  firstName: 'Sarah',   middleName: 'Li',        lastName: 'Chen',    credentials: 'MD, FCAP',    email: 'schen@hospital.org',    roles: ['Pathologist'], npi: '1234567890', license: 'MD-12345', phone: '555-0101',  status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '2',  firstName: 'James',   middleName: 'Emeka',     lastName: 'Okafor',  credentials: 'MD',  email: 'jokafor@hospital.org',  roles: ['Resident'],    npi: '1234567891', license: 'MD-12346', phone: '555-0102',  status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '3',  firstName: 'Pete',    middleName: '',           lastName: 'Nimmo',   credentials: '',   email: 'pnimmo@hospital.org',   roles: ['Admin'],       npi: '',           license: '',         phone: '555-0103',       status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '4',  firstName: 'Maria',   middleName: 'Elena',     lastName: 'Santos',  credentials: 'MD, FCAP',  email: 'msantos@hospital.org',  roles: ['Pathologist'], npi: '1234567892', license: 'MD-12347', phone: '555-0104',   status: 'Inactive', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '5',  firstName: 'Kevin',   middleName: 'James',     lastName: 'Park',    credentials: 'MD',    email: 'kpark@hospital.org',    roles: ['Resident'],    npi: '1234567893', license: 'MD-12348', phone: '555-0105',  status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '6',  firstName: 'Aisha',   middleName: 'Priya',     lastName: 'Patel',   credentials: 'MD, FCAP',   email: 'apatel@hospital.org',   roles: ['Pathologist'], npi: '1234567894', license: 'MD-12349', phone: '555-0106',       status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '7',  firstName: 'Thomas',  middleName: 'Van',       lastName: 'Nguyen',  credentials: 'MD',  email: 'tnguyen@hospital.org',  roles: ['Pathologist'], npi: '1234567895', license: 'MD-12350', phone: '555-0107',   status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '8',  firstName: 'Lisa',    middleName: '',    lastName: 'Hoffman', credentials: 'MD', email: 'lhoffman@hospital.org', roles: ['Resident'],    npi: '1234567896', license: 'MD-12351', phone: '555-0108',  status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '9',  firstName: 'Marcus',  lastName: 'Webb',    credentials: 'MD, FCAP',    email: 'mwebb@hospital.org',    roles: ['Pathologist'], npi: '1234567897', license: 'MD-12352', phone: '555-0109',      status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: '10', firstName: 'Priya',   lastName: 'Sharma',  credentials: 'MD',  email: 'psharma@hospital.org',  roles: ['Resident'],    npi: '1234567898', license: 'MD-12353', phone: '555-0110',  status: 'Active',   voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  
  // ── US / UK Demo Users ─────────────────────────────────────────────────────
  // PATH-001 added below — this ID is what AuthContext.tsx's login
  // credentials actually use for pete.nimmo@pathscribe.ai / demo@pathscribe.ai,
  // but no SEED_USERS entry existed for it before now. The pre-existing id:'3'
  // "Pete Nimmo" entry (different email, hospital.org domain) is never looked
  // up by resolveStaffFields() — that function queries by authenticatedUser.id,
  // which is always 'PATH-001' for these logins. Net effect before this fix:
  // every login as Pete Nimmo silently got canViewPediatric: false (and now
  // would have gotten canViewOrchestration: false) with no staff fields
  // resolved at all — not a Orchestration-specific bug, but found while
  // tracing this one, and worth fixing now rather than leaving a real login
  // silently broken.
  { id: 'PATH-001',    firstName: 'Pete',    lastName: 'Nimmo',        credentials: 'FCAP', canViewOrchestration: true, email: 'pete.nimmo@pathscribe.ai', roles: ['Pathologist', 'Admin'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: 'PATH-US-001', firstName: 'Amber',   lastName: 'Fehrs-Battey', credentials: 'MD, FCAP', canViewPediatric: false, canViewOrchestration: true, email: 'amber.fehrs-battey@mpa.org',  roles: ['Pathologist', 'Admin'], npi: '1234567900', license: 'MD-12360', phone: '313-555-2001', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-MPA' },
  { id: 'PATH-US-002', firstName: 'J. Mark', lastName: 'Tuthill',      credentials: 'MD, FCAP', canViewPediatric: false,      email: 'mark.tuthill@hfhs.org',       roles: ['Pathologist'], npi: '1234567901', license: 'MD-12361', phone: '313-555-2002',   status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-HFHS' },
  { id: 'PATH-UK-001', firstName: 'Paul',    lastName: 'Carter',       credentials: 'MBChB, FRCPath', canViewOrchestration: true,      email: 'paul.carter@mft.nhs.uk',      roles: ['Pathologist'], npi: '',           license: 'GMC-12362', phone: '+44-161-555-2003', status: 'Active', voiceProfile: 'EN-GB', organisationId: 'ORG-MFT' },
  { id: 'PATH-UK-002', firstName: 'Oliver',  lastName: 'Pemberton',    credentials: 'MBChB, FRCPath',    email: 'oliver.pemberton@mft.nhs.uk', roles: ['Pathologist'], npi: '',           license: 'GMC-12363', phone: '+44-161-555-2004', status: 'Active', voiceProfile: 'EN-GB', organisationId: 'ORG-MFT' },
  // canViewOrchestration + roles including 'Admin' here deliberately —
  // login credential (AuthContext.tsx) sets her session role to genuine
  // 'superadmin', per explicit request for full platform access, not
  // just clinical case access like Paul/Oliver above.
  { id: 'PATH-UK-003', firstName: 'Bronwyn', lastName: 'Prior',        credentials: 'MBChB, FRCPath', canViewOrchestration: true,      email: 'bronwyn.prior@mft.nhs.uk',    roles: ['Pathologist', 'Admin'], npi: '', license: 'GMC-12364', phone: '+44-161-555-2005', status: 'Active', voiceProfile: 'EN-GB', organisationId: 'ORG-MFT' },
  { id: 'PATH-RB-001', firstName: 'Rossana', lastName: 'Babakhani',    credentials: '', email: 'rossana.babakhani@pathscribe.ai',
  roles: ['Pathologist', 'Admin'], npi: '', license: '',  phone: '', status: 'Active',  voiceProfile: 'EN-US', canViewPediatric: true, organisationId: 'ORG-DVMC' },

  // ── PA (Pathologists' Assistant) test user — Stage 0 Requirements §4.4
  // (S0-CF-16). No PA-role SEED_USERS entry existed before this — the 'pa'
  // role itself was defined in mockRoleService.ts, but nobody carried it,
  // so the Awaiting Grossing tile / Stage 0 PA worklist path had no test
  // user to log in as and verify against. canViewOrchestration: true
  // mirrors the pattern already used on PATH-001/US-001/UK-001 above —
  // this is a flat per-user flag, not derived from the role string.
  // Batch 371: Dr. Sarah Johnson's demo sign-in (PATH-SJ-001) had no staff
  // record. It worked only because her account was superadmin; as a
  // pathologist she needs an organisation to open any case.
  { id: 'PATH-SJ-001', firstName: 'Sarah', lastName: 'Johnson', credentials: 'MD, FCAP', canViewPediatric: false, email: 'sarah.johnson@demo.pathscribe.ai', roles: ['Pathologist'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  // Batch 374: bench staff (one per new built-in bench role) and a staff
  // record for Michelle Nimmo's pathologist-admin sign-in, which had none and
  // so held no role at all.
  { id: 'ACC-001', firstName: 'Maria', lastName: 'Lopez', credentials: '', email: 'maria.lopez@demo.pathscribe.ai', roles: ['Accessioner'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: 'HT-001', firstName: 'Kevin', lastName: 'Brooks', credentials: 'HT(ASCP)', email: 'kevin.brooks@demo.pathscribe.ai', roles: ['Histotechnologist'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: 'CT-001', firstName: 'Priya', lastName: 'Desai', credentials: 'CT(ASCP)', email: 'priya.desai@demo.pathscribe.ai', roles: ['Cytotechnologist'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: 'MT-001', firstName: 'Daniel', lastName: 'Kim', credentials: 'MB(ASCP)', email: 'daniel.kim@demo.pathscribe.ai', roles: ['Molecular Technologist'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: 'PATH-MN-001', firstName: 'Michelle', lastName: 'Nimmo', credentials: '', email: 'michelle.nimmo@ai.com', roles: ['Pathologist', 'Admin'], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
  { id: 'PA-001', firstName: 'Connor', lastName: 'Whitlock', credentials: "PA(ASCP)", canViewOrchestration: true, canViewPediatric: false, email: 'connor.whitlock@pathscribe.ai', roles: ["Pathologists' Assistant (PA)"], npi: '', license: '', phone: '', status: 'Active', voiceProfile: 'EN-US', organisationId: 'ORG-DVMC' },
];

// Increment USERS_VERSION whenever SEED_USERS is changed.
const USERS_VERSION = '11'; // bumped: bench staff (ACC-001, HT-001, CT-001, MT-001) and Michelle Nimmo (PATH-MN-001), Batch 374. (10: Dr. Sarah Johnson, Batch 371.)
const USERS_VERSION_KEY = 'pathscribe_users_version';
if (localStorage.getItem(USERS_VERSION_KEY) !== USERS_VERSION) {
  localStorage.removeItem('pathscribe_mock_pathscribe_users');
  localStorage.setItem(USERS_VERSION_KEY, USERS_VERSION);
}

const load = () => {
  const data = storageGet<StaffUser[]>('pathscribe_users', SEED_USERS);
  // Migration: Ensure all loaded users have a default voice profile if missing
  return data.map(u => ({ ...u, voiceProfile: u.voiceProfile || 'EN-US' }));
};

const persist = (data: StaffUser[]) => storageSet('pathscribe_users', data);
let MOCK_USERS: StaffUser[] = load();

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockUserService: IUserService = {
  async getAll() {
    await delay();
    return ok([...MOCK_USERS]);
  },

  async getById(id: ID) {
    await delay();
    const user = MOCK_USERS.find(u => u.id === id);
    return user ? ok({ ...user }) : err(`User ${id} not found`);
  },

  async add(user) {
    await delay();
    // Default to 'EN-US' if not provided in the 'add' payload
    const newUser: StaffUser = { 
      ...user, 
      id: String(Date.now()),
      voiceProfile: user.voiceProfile || 'EN-US'
    };
    MOCK_USERS = [...MOCK_USERS, newUser];
    persist(MOCK_USERS);
    return ok({ ...newUser });
  },

  async update(id, changes) {
    await delay();
    const idx = MOCK_USERS.findIndex(u => u.id === id);
    if (idx === -1) return err(`User ${id} not found`);
    
    // Create the updated user object
    const updatedUser = { ...MOCK_USERS[idx], ...changes };
    
    MOCK_USERS = MOCK_USERS.map(u => u.id === id ? updatedUser : u);
    persist(MOCK_USERS);
    return ok(updatedUser);
  },

  async deactivate(id) {
    return mockUserService.update(id, { status: 'Inactive' });
  },

  async reactivate(id) {
    return mockUserService.update(id, { status: 'Active' });
  },
};
