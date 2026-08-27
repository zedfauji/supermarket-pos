import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getServiceClient } from './supabase';

vi.mock('./supabase', () => ({
  getServiceClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('createRoleScopedClient', () => {
  const deleteUser = vi.fn();
  const signInWithPassword = vi.fn();

  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://example.test';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    vi.mocked(getServiceClient).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null }),
          deleteUser,
        },
      },
      from: vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) }),
    } as never);
    vi.mocked(createClient).mockReturnValue({ auth: { signInWithPassword } } as never);
    deleteUser.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });
  });

  it('creates a distinct anon-key session for the requested role', async () => {
    const { createRoleScopedClient } = await import('./rls-clients');

    await expect(createRoleScopedClient('cashier', 'denied-write')).resolves.toMatchObject({
      userId: expect.any(String),
      cleanup: expect.any(Function),
    });
    expect(createClient).toHaveBeenCalledWith(
      'https://example.test',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          storageKey: expect.stringMatching(/^e2e-rls-denied-write-/),
        }),
      })
    );
  });
});
