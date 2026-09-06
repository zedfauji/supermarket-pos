import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorBox } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SUPABASE_URL } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signOut, roleDenied, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || pin.length < 4) return;
    setBusy(true);
    setError(null);
    const e = await signIn(email, pin);
    setBusy(false);
    if (e) setError(e === 'Invalid login credentials' ? 'Wrong email or PIN.' : e);
  };

  if (roleDenied) {
    return (
      <View style={[s.root, { paddingTop: insets.top + space[8] }]}>
        <Ionicons name="lock-closed" size={36} color={colors.warning} />
        <Text style={s.title}>Managers only</Text>
        <Text style={s.sub}>
          {profile?.name ?? 'This account'} is signed in as {profile?.role}. This app is for admins and managers.
        </Text>
        <Button title="Sign out" tone="ghost" onPress={() => { void signOut(); }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[s.root, { paddingTop: insets.top + space[8], paddingBottom: insets.bottom + space[4] }]}>
        <View style={s.brand}>
          <View style={s.mark}>
            <Ionicons name="storefront" size={26} color={colors.brandForeground} />
          </View>
          <Text style={s.title}>POS Admin</Text>
          <Text style={s.sub}>Sign in with your staff email and PIN.</Text>
        </View>

        <View style={{ gap: space[3] }}>
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
            style={s.input}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="PIN"
            placeholder="PIN"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            secureTextEntry
            textContentType="password"
            maxLength={8}
            value={pin}
            onChangeText={setPin}
            onSubmitEditing={() => { void submit(); }}
            style={s.input}
            returnKeyType="go"
          />
          {error ? <ErrorBox message={error} /> : null}
          <Button title="Sign in" onPress={() => { void submit(); }} loading={busy} disabled={!email || pin.length < 4} />
        </View>

        <Text style={s.foot}>{SUPABASE_URL.replace(/^https?:\/\//, '')}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space[6], gap: space[8], justifyContent: 'center' },
  brand: { alignItems: 'center', gap: space[3] },
  mark: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.display, color: colors.foreground, textAlign: 'center' },
  sub: { ...type.body, color: colors.mutedForeground, textAlign: 'center' },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.card,
    color: colors.foreground,
    paddingHorizontal: space[4],
    ...type.body,
    fontSize: 16,
  },
  foot: { ...type.small, color: colors.sidebarMuted, textAlign: 'center', marginTop: 'auto' },
});
