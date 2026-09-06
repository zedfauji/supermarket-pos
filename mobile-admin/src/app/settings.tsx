import Constants from 'expo-constants';
import { Alert } from 'react-native';

import { Button, Card, Divider, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useStoreName } from '@/lib/common-queries';
import { SUPABASE_URL } from '@/lib/supabase';

export default function SettingsScreen() {
  const { profile, signOut } = useAuth();
  const storeName = useStoreName();

  const doSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to use this app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen padTop>
      <Card>
        <Row title={profile?.name ?? '—'} subtitle={profile?.email ?? 'No email on file'} icon="person-outline" />
        <Divider />
        <Row title={profile?.role ?? '—'} subtitle="Role" icon="shield-checkmark-outline" />
      </Card>

      <Card>
        <Row title={storeName.data ?? 'Store'} subtitle="Store name" icon="storefront-outline" />
        <Divider />
        <Row title={SUPABASE_URL || 'Not configured'} subtitle="Server — change via .env" icon="server-outline" />
        <Divider />
        <Row title={Constants.expoConfig?.version ?? '—'} subtitle="App version" icon="information-circle-outline" />
      </Card>

      <Button title="Sign out" tone="danger" icon="log-out-outline" onPress={doSignOut} />
    </Screen>
  );
}
