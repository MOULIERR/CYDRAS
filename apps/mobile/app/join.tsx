// Employees join with the invite code the owner or supervisor gave them.
import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/lib/session';
import { Screen, H1, Field, Button, Small } from '../src/ui/kit';

export default function Join() {
  const { session, refresh, signOut } = useSession();
  const [f, setF] = useState({ code: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    try {
      if (!session) {
        const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password });
        if (error) throw error;
        if (!data.session) { Alert.alert('Check your email', 'Tap the link we sent, sign in, then type your code again.'); return; }
      }
      const { error } = await supabase.rpc('accept_invite', { p_code: f.code.trim() });
      if (error) throw error;
      await refresh();
      router.replace('/');
    } catch (e) { Alert.alert('Could not join', (e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Screen>
      <H1>Join your team</H1>
      <Small>Type the 8-letter code your boss gave you.</Small>
      <Field label="Invite code" value={f.code} onChangeText={(v) => setF({ ...f, code: v.toUpperCase() })} autoCapitalize="characters" placeholder="AB12CD34" />
      {!session && <>
        <Field label="Your email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Make a password" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secureTextEntry />
      </>}
      <Button title="Join" onPress={join} busy={busy} />
      {session && <Button title="Start my own company instead" kind="secondary" onPress={() => router.push('/signup')} />}
      {session && <Button title="Sign out" kind="secondary" onPress={signOut} />}
    </Screen>
  );
}
