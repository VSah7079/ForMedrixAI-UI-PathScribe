// src/services/intraopDashboard/resolveStaffByQuickAuthPin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('resolveStaffByQuickAuthPin — real, per the given design brief\'s "Fast User Context Switching"', () => {
  it('real, a genuine or-staff PIN match authenticates correctly', async () => {
    const { userService } = await import('../index');
    const { resolveStaffByQuickAuthPin } = await import('./resolveStaffByQuickAuthPin');

    const created = await userService.add({
      firstName: 'Jane', lastName: 'Doe', email: 'jdoe@example.org', roles: ['or-staff'],
      npi: '', license: '', phone: '', status: 'Active', quickAuthPin: '4471',
    });
    expect(created.ok).toBe(true);

    const result = await resolveStaffByQuickAuthPin('4471');
    expect(result.outcome).toBe('authenticated');
    expect(result.staff?.firstName).toBe('Jane');
  });

  it('real, a genuinely unknown PIN is honestly not-found', async () => {
    const { resolveStaffByQuickAuthPin } = await import('./resolveStaffByQuickAuthPin');
    const result = await resolveStaffByQuickAuthPin('9999');
    expect(result.outcome).toBe('not-found');
  });

  it('real, a PIN matching a real staff member who is NOT or-staff is refused, never a back door into the lab\'s own login', async () => {
    const { userService } = await import('../index');
    const { resolveStaffByQuickAuthPin } = await import('./resolveStaffByQuickAuthPin');

    await userService.add({
      firstName: 'Dr.', lastName: 'Smith', email: 'smith@example.org', roles: ['pathologist'],
      npi: '', license: '', phone: '', status: 'Active', quickAuthPin: '1234',
    });

    const result = await resolveStaffByQuickAuthPin('1234');
    expect(result.outcome).toBe('invalid-role');
  });

  it('real, an empty PIN is honestly not-found, never matching by accident against an unset field', async () => {
    const { resolveStaffByQuickAuthPin } = await import('./resolveStaffByQuickAuthPin');
    const result = await resolveStaffByQuickAuthPin('');
    expect(result.outcome).toBe('not-found');
  });
});
