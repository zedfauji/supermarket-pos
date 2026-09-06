import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Expo inlines EXPO_PUBLIC_* at build time. See .env.example.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env missing: copy .env.example to .env in mobile-admin/');
}

// ponytail: AsyncStorage, not SecureStore — Supabase session JSON exceeds SecureStore's
// 2 KB per-key limit on Android. Upgrade path: LargeSecureStore (AES key in SecureStore,
// ciphertext in AsyncStorage) if a security review asks for it.
// Fallbacks keep the module loadable under jest (no .env); real runs always have .env.
export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_ANON_KEY || 'missing-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is foregrounded (Supabase RN guidance).
AppState.addEventListener('change', state => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
