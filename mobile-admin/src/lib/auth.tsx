import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ProfileSchema, type Profile } from './schemas';
import { supabase } from './supabase';

export const ALLOWED_ROLES = new Set<Profile['role']>(['admin', 'manager']);

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Set when signed in but role is not admin/manager. */
  roleDenied: boolean;
  signIn: (email: string, pin: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,email,role,is_active,locale')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = ProfileSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) setProfile(await loadProfile(data.session.user.id));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!alive) return;
      setSession(s);
      setProfile(s ? await loadProfile(s.user.id) : null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, pin: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pin });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      roleDenied: !!session && !!profile && !ALLOWED_ROLES.has(profile.role),
      signIn,
      signOut,
    }),
    [loading, session, profile, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
