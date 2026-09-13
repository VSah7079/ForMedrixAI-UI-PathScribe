import { IRoleService, Role } from './IRoleService';
import { ServiceResult, ID } from '../types';
import { DEFAULT_ROLE_PERMISSIONS } from '../../constants/systemActions';
import { storageGet, storageSet } from '../mockStorage';

const SEED_ROLES: Role[] = [
  // participationTypeIds added per real CLIA/CAP/ACGME eligibility matrix
  // (Pete, July 2026): sign-out authority (primary, attending/co-sign,
  // frozen section — time-critical intraoperative diagnosis) is restricted
  // to credentialed Pathologists. Hands-on/collaborative work (grossing,
  // consultant review) is open to both. 'resident' here is the
  // PARTICIPATION TYPE ("Resident/Fellow" slot for supervised primary
  // drafting), distinct from this being the Resident ROLE — see Pete's own
  // suggested "Resident / Primary Drafter" alternative workflow.
  { id: 'pathologist', name: 'Pathologist', canViewPediatric: false, canViewOrchestration: false, description: 'Licensed pathologist with full clinical case access and sign-out authority.',   color: '#8AB4F8', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Pathologist'], builtIn: true, participationTypeIds: ['primary', 'grossing', 'attending', 'consultant', 'frozen', 'second_opinion']  },
  { id: 'resident',    name: 'Resident',    canViewPediatric: false, canViewOrchestration: false,    description: 'Pathology resident with case access and co-sign capability.',                    color: '#81C995', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Resident'],    builtIn: true, participationTypeIds: ['grossing', 'consultant', 'resident', 'second_opinion']  },
  // participationTypeIds: ['prelim'] is a BEST GUESS, same caveat as PA's
  // ['grossing'] below — not yet confirmed against the real Participation
  // Types data file. Maps conceptually to a type described in passing as
  // "drafts the [report] under supervision, requires attending [sign-out]"
  // which fits Fellow's pre-sign-out autonomy, but the real id is unverified.
  { id: 'fellow',      name: 'Fellow',      canViewPediatric: false, canViewOrchestration: false, description: 'Subspecialty fellow with near-attending drafting autonomy. Manages cases independently through a complete draft report; attending still officially signs out.', color: '#4DD0E1', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Fellow'], builtIn: true, participationTypeIds: ['prelim'] },
  // NOTE — "PA" = Pathologists' Assistant (PA(ASCP)/AAPA), NOT the
  // general-healthcare "Physician Assistant". Worth keeping that
  // disambiguation in the description shown in the UI, not just here —
  // someone configuring Staff later won't have this comment in front of
  // them.
  // participationTypeIds: ['grossing'] is a BEST GUESS at the real
  // Participation Type id from the Admin Guide's "Grossing" type — not
  // yet confirmed against the actual Participation Types data file.
  // Verify before relying on this for real case-participation gating.
  { id: 'pa',          name: "Pathologists' Assistant (PA)", canViewPediatric: false, canViewOrchestration: false, description: "Performs macroscopic examination, grossing, and specimen description. Distinct certified profession (PA(ASCP)/AAPA) — not the general-healthcare 'Physician Assistant.' No microscopic, diagnosis, or sign-out access.", color: '#F28B82', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Pathologists Assistant'], builtIn: true, participationTypeIds: ['grossing'] },
  { id: 'admin',       name: 'Admin',       canViewPediatric: false, canViewOrchestration: false,       description: 'System administrator with configuration access but no clinical case access.',    color: '#FDD663', caseAccess: false, configAccess: true,  permissions: DEFAULT_ROLE_PERMISSIONS['Admin'],       builtIn: true  },
  { id: 'physician',   name: 'Physician',   canViewPediatric: false, canViewOrchestration: false,   description: 'External ordering physician. Directory only — no app access.',                   color: '#C084FC', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Physician'],   builtIn: true  },
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
  // Intraoperative/Frozen Section Dashboard's own Location-First +
  // Quick Auth design. Same real "directory only — no app access"
  // posture as Physician above — OR staff never log into the main
  // app; they exist here only to be resolved by quickAuthPin
  // (resolveStaffByQuickAuthPin.ts) and attributed on the OR
  // terminal's own audit log.
  { id: 'or-staff',    name: 'Or Staff',    canViewPediatric: false, canViewOrchestration: false,   description: 'Operating room staff (RN, circulator, surgeon) using the Intraoperative Dashboard\'s quick-auth PIN. Directory only — no general app access.', color: '#93C5FD', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Or Staff'],   builtIn: true  },
];

const load = () => storageGet<Role[]>('pathscribe_roles', SEED_ROLES);
const persist = (data: Role[]) => storageSet('pathscribe_roles', data);
let MOCK_ROLES: Role[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockRoleService: IRoleService = {
  async getAll() {
    await delay();
    return ok([...MOCK_ROLES]);
  },

  async getById(id: ID) {
    await delay();
    const role = MOCK_ROLES.find(r => r.id === id);
    return role ? ok({ ...role }) : err(`Role ${id} not found`);
  },

  async add(role) {
    await delay();
    const newRole: Role = { ...role, id: role.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() };
    MOCK_ROLES = [...MOCK_ROLES, newRole];
    persist(MOCK_ROLES);
    return ok({ ...newRole });
  },

  async update(id, changes) {
    await delay();
    const idx = MOCK_ROLES.findIndex(r => r.id === id);
    if (idx === -1) return err(`Role ${id} not found`);
    MOCK_ROLES = MOCK_ROLES.map(r => r.id === id ? { ...r, ...changes } : r);
    persist(MOCK_ROLES);
    return ok({ ...MOCK_ROLES[idx], ...changes });
  },

  async delete(id) {
    await delay();
    const role = MOCK_ROLES.find(r => r.id === id);
    if (!role) return err(`Role ${id} not found`);
    if (role.builtIn) return err(`Cannot delete built-in role "${role.name}"`);
    MOCK_ROLES = MOCK_ROLES.filter(r => r.id !== id);
    persist(MOCK_ROLES);
    return ok(undefined);
  },
};
