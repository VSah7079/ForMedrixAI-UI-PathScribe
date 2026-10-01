import { IRoleService, Role } from './IRoleService';
import { ServiceResult, ID } from '../types';
import { DEFAULT_ROLE_PERMISSIONS } from '../../constants/systemActions';
import { storageGet, storageSet } from '../mockStorage';
import { SYSTEM_ROLE_IDS, mergeBuiltInRoles, renameRoleInList, withoutRetiredRoleFields } from './systemRoles';
import { applyCapabilitySeeds, lockPlatformRoles } from '../authorization/capabilitySeeds';
import { roleCapabilityProblem } from '../authorization/roleCapabilityRules';

const SEED_ROLES: Role[] = [
  // participationTypeIds added per real CLIA/CAP/ACGME eligibility matrix
  // (Pete, July 2026): sign-out authority (primary, attending/co-sign,
  // frozen section — time-critical intraoperative diagnosis) is restricted
  // to credentialed Pathologists. Hands-on/collaborative work (grossing,
  // consultant review) is open to both. 'resident' here is the
  // PARTICIPATION TYPE ("Resident/Fellow" slot for supervised primary
  // drafting), distinct from this being the Resident ROLE — see Pete's own
  // suggested "Resident / Primary Drafter" alternative workflow.
  { id: 'pathologist', name: 'Pathologist', description: 'Licensed pathologist with full clinical case access and sign-out authority.',   color: '#8AB4F8', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Pathologist'], builtIn: true, participationTypeIds: ['primary', 'grossing', 'attending', 'consultant', 'frozen', 'second_opinion']  },
  { id: 'resident',    name: 'Resident',    description: 'Pathology resident with case access and co-sign capability.',                    color: '#81C995', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Resident'],    builtIn: true, participationTypeIds: ['grossing', 'consultant', 'resident', 'second_opinion']  },
  // participationTypeIds: ['prelim'] is a BEST GUESS, same caveat as PA's
  // ['grossing'] below — not yet confirmed against the real Participation
  // Types data file. Maps conceptually to a type described in passing as
  // "drafts the [report] under supervision, requires attending [sign-out]"
  // which fits Fellow's pre-sign-out autonomy, but the real id is unverified.
  { id: 'fellow',      name: 'Fellow',      description: 'Subspecialty fellow with near-attending drafting autonomy. Manages cases independently through a complete draft report; attending still officially signs out.', color: '#4DD0E1', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Fellow'], builtIn: true, participationTypeIds: ['prelim'] },
  // NOTE — "PA" = Pathologists' Assistant (PA(ASCP)/AAPA), NOT the
  // general-healthcare "Physician Assistant". Worth keeping that
  // disambiguation in the description shown in the UI, not just here —
  // someone configuring Staff later won't have this comment in front of
  // them.
  // participationTypeIds: ['grossing'] is a BEST GUESS at the real
  // Participation Type id from the Admin Guide's "Grossing" type — not
  // yet confirmed against the actual Participation Types data file.
  // Verify before relying on this for real case-participation gating.
  { id: 'pa',          name: "Pathologists' Assistant (PA)", description: "Performs macroscopic examination, grossing, and specimen description. Distinct certified profession (PA(ASCP)/AAPA) — not the general-healthcare 'Physician Assistant.' No microscopic, diagnosis, or sign-out access.", color: '#F28B82', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Pathologists Assistant'], builtIn: true, participationTypeIds: ['grossing'] },
  { id: 'admin',       name: 'Admin',       description: 'System administrator with configuration access but no clinical case access.',    color: '#FDD663', caseAccess: false, configAccess: true,  permissions: DEFAULT_ROLE_PERMISSIONS['Admin'],       builtIn: true  },
  { id: 'physician',   name: 'Physician',   description: 'External ordering physician. Directory only — no app access.',                   color: '#C084FC', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Physician'],   builtIn: true  },
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
  // Intraoperative/Frozen Section Dashboard's own Location-First +
  // Quick Auth design. Same real "directory only — no app access"
  // posture as Physician above — OR staff never log into the main
  // app; they exist here only to be resolved by quickAuthPin
  // (resolveStaffByQuickAuthPin.ts) and attributed on the OR
  // terminal's own audit log.
  { id: 'or-staff',    name: 'Or Staff',    description: 'Operating room staff (RN, circulator, surgeon) using the Intraoperative Dashboard\'s quick-auth PIN. Directory only — no general app access.', color: '#93C5FD', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Or Staff'],   builtIn: true  },
  // Built-in template governance roles (Batch 329, PS-63). Fixed ids from
  // systemRoles.ts: the rules find them by id, so renaming one here keeps
  // it working. Drafting: Template Author (Admin inherits). Approving and
  // publishing: Template Approver, Lab Director or Admin.
  { id: SYSTEM_ROLE_IDS.TEMPLATE_AUTHOR,   name: 'Template Author',   description: 'Drafts and edits synoptic templates and submits them for review. Cannot approve or publish.', color: '#A5B4FC', caseAccess: false, configAccess: true, permissions: DEFAULT_ROLE_PERMISSIONS['Template Author'], builtIn: true },
  { id: SYSTEM_ROLE_IDS.TEMPLATE_APPROVER, name: 'Template Approver', description: 'Reviews, approves and publishes synoptic templates written by others.', color: '#6EE7B7', caseAccess: false, configAccess: true, permissions: DEFAULT_ROLE_PERMISSIONS['Template Approver'], builtIn: true },
  { id: SYSTEM_ROLE_IDS.LAB_DIRECTOR,      name: 'Lab Director',      description: 'Laboratory director. Signs off and publishes synoptic templates written by others.', color: '#FCA5A5', caseAccess: false, configAccess: true, permissions: DEFAULT_ROLE_PERMISSIONS['Lab Director'], builtIn: true },
  // PS-355 (Batch 369). QA Reviewer is added alongside someone's main role
  // (a pathologist with QA duties), so it brings no case or configuration
  // access of its own. Superadmin is PathScribe platform support: held only
  // through a support sign-in, never assigned to staff, and granted every
  // capability as a role rather than by a bypass in the check. Their
  // starting capabilities are in services/authorization/capabilitySeeds.ts.
  { id: SYSTEM_ROLE_IDS.QA_REVIEWER, name: 'QA Reviewer', description: 'Exports quality-assurance reports and report change history. Given alongside a staff member\'s main role.', color: '#FDBA74', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['QA Reviewer'], builtIn: true },
  // Batch 374 (Pete: Home shows only the tiles a user may open). Bench staff
  // had no built-in role, so no one would hold the bench screens by default.
  // They handle cases (case access) but configure nothing. Their screens are
  // in services/authorization/capabilitySeeds.ts.
  { id: SYSTEM_ROLE_IDS.ACCESSIONER,            name: 'Accessioner',            description: 'Receives specimens and accessions new cases.', color: '#D9F99D', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Accessioner'], builtIn: true, participationTypeIds: [] },
  { id: SYSTEM_ROLE_IDS.HISTOTECHNOLOGIST,      name: 'Histotechnologist',      description: 'Processes, embeds, cuts and stains tissue; runs histology batches and slide distribution.', color: '#E879F9', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Histotechnologist'], builtIn: true, participationTypeIds: [] },
  { id: SYSTEM_ROLE_IDS.CYTOTECHNOLOGIST,       name: 'Cytotechnologist',       description: 'Prepares and screens cytology specimens.', color: '#2DD4BF', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Cytotechnologist'], builtIn: true, participationTypeIds: [] },
  { id: SYSTEM_ROLE_IDS.MOLECULAR_TECHNOLOGIST, name: 'Molecular Technologist', description: 'Runs molecular testing: plates, racks and molecular batches.', color: '#94A3B8', caseAccess: true, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Molecular Technologist'], builtIn: true, participationTypeIds: [] },
  { id: SYSTEM_ROLE_IDS.SUPERADMIN,  name: 'Superadmin',  description: 'PathScribe platform support. Held only through a PathScribe support sign-in; cannot be given to staff.', color: '#F472B6', caseAccess: true, configAccess: true, permissions: DEFAULT_ROLE_PERMISSIONS['Superadmin'], builtIn: true, assignable: false },
];

// Migration (Batch 329): a catalog stored before a built-in role existed
// gains it on load; roles already stored, and any admin edits, are kept.
// PS-355 (Batch 369): built-in roles are then offered any seed capability
// they haven't been offered before (a removal by an administrator sticks).
const load = () => {
  const stored = storageGet<Role[]>('pathscribe_roles', SEED_ROLES);
  const { roles: merged, added } = mergeBuiltInRoles(stored, SEED_ROLES);
  const { roles: seeded, changed } = applyCapabilitySeeds(merged);
  // Batch 371: Superadmin always holds the whole catalog (ForMedrixAI's, not
  // the hospital's, to change).
  const { roles: locked, changed: relocked } = lockPlatformRoles(seeded);
  // PS-356 (Batch 370): drop the role-level switches that were never enforced.
  const { roles, stripped } = withoutRetiredRoleFields(locked);
  if (added.length || changed || relocked || stripped) storageSet('pathscribe_roles', roles);
  return roles;
};
const persist = (data: Role[]) => storageSet('pathscribe_roles', data);
let MOCK_ROLES: Role[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

async function renameRoleOnStaff(oldName: string, newName: string): Promise<void> {
  const { mockUserService } = await import('../users/mockUserService');
  const res = await mockUserService.getAll();
  if (!res.ok) return;
  for (const u of res.data) {
    const next = renameRoleInList(u.roles ?? [], oldName, newName);
    if (next.join('\u0000') !== (u.roles ?? []).join('\u0000')) await mockUserService.update(u.id, { roles: next });
  }
}

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
    const problem = roleCapabilityProblem(role.capabilities ?? [], { assignable: role.assignable });
    if (problem) return err(problem);
    const newRole: Role = { ...role, id: role.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() };
    MOCK_ROLES = [...MOCK_ROLES, newRole];
    persist(MOCK_ROLES);
    return ok({ ...newRole });
  },

  async update(id, changes) {
    await delay();
    const idx = MOCK_ROLES.findIndex(r => r.id === id);
    if (idx === -1) return err(`Role ${id} not found`);
    // Batch 371: the platform role (Superadmin) isn't a hospital's to change.
    if (MOCK_ROLES[idx].assignable === false) return err(`Role ${id} is managed by ForMedrixAI and can't be changed here`);
    if (changes.capabilities) {
      const problem = roleCapabilityProblem(changes.capabilities, { assignable: MOCK_ROLES[idx].assignable });
      if (problem) return err(problem);
    }
    const before = MOCK_ROLES[idx];
    MOCK_ROLES = MOCK_ROLES.map(r => r.id === id ? { ...r, ...changes } : r);
    persist(MOCK_ROLES);
    // Staff records hold role names, so a rename is carried over to them
    // (Batch 329); otherwise renaming a role would silently remove it from
    // everyone who has it.
    const newName = changes.name?.trim();
    if (newName && newName !== before.name) await renameRoleOnStaff(before.name, newName);
    return ok({ ...MOCK_ROLES[idx] });
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
