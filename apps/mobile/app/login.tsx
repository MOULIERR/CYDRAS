import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { Screen, H1, Field, Button, Small, C } from '../src/ui/kit';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert('Could not sign in', error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : error.message);
  }
  async function reset() {
    if (!email.trim()) return Alert.alert('Type your email first');
    await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert('Check your email', 'We sent a link to make a new password.');
  }
  return (
    <Screen>
      <H1>Cydras</H1>
      <Small>Sign in to see your jobs.</Small>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
      <Button title="Sign in" onPress={signIn} busy={busy} />
      <Button title="Forgot password" kind="secondary" onPress={reset} />
      <Text style={{ fontSize: 16, color: C.muted, textAlign: 'center', marginTop: 8 }}>
        New shop? <Link href="/signup" style={{ color: C.accent, fontWeight: '800' }}>Start a free trial</Link>{'\n\n'}
        Got an invite code? <Link href="/join" style={{ color: C.accent, fontWeight: '800' }}>Join your team</Link>
      </Text>
    </Screen>
  );
}
