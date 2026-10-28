// New shop sign-up: makes the login, the company, and a 14-day free trial. No card needed to start.
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/lib/session';
import { Screen, H1, Field, Button, Small, Card, C } from '../src/ui/kit';

const PLANS = [{ k: 'solo', n: 'Solo', p: '$49/mo', s: '1 user' }, { k: 'team', n: 'Team', p: '$125/mo', s: 'Up to 5' }, { k: 'pro', n: 'Pro', p: '$249/mo', s: 'Up to 10' }];

export default function Signup() {
  const { session, refresh } = useSession();
  const [f, setF] = useState({ company: '', name: '', email: '', password: '', plan: 'team' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function go() {
    if (!f.company.trim() || !f.name.trim()) return Alert.alert('Add your company name and your name');
    if (!agree) return Alert.alert('Please agree to the Terms and Privacy Policy');
    setBusy(true);
    try {
      if (!session) {
        if (f.password.length < 8) throw new Error('Use at least 8 characters for the password');
        const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password });
        if (error) throw error;
        if (!data.session) { Alert.alert('Check your email', 'Tap the link we sent, then sign in to finish setting up.'); return; }
      }
      const { error } = await supabase.rpc('create_company', { p_name: f.company.trim(), p_owner_name: f.name.trim(), p_plan: f.plan });
      if (error) throw error;
      await refresh();
    } catch (e) {
      Alert.alert('Could not finish', (e as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <Screen>
      <H1>Start your free trial</H1>
      <Small>14 days free. No card needed. Cancel anytime.</Small>
      <Field label="Company name" value={f.company} onChangeText={up('company')} placeholder="Coastal Air & Heat" />
      <Field label="Your name" value={f.name} onChangeText={up('name')} />
      {!session && <>
        <Field label="Email" value={f.email} onChangeText={up('email')} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={f.password} onChangeText={up('password')} secureTextEntry placeholder="At least 8 characters" />
      </>}
      <Text style={{ fontWeight: '700', fontSize: 15 }}>Plan (you pick when the trial ends)</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PLANS.map((p) => (
          <Pressable key={p.k} onPress={() => up('plan')(p.k)} style={{ flex: 1 }}>
            <Card style={{ borderColor: f.plan === p.k ? C.accent : C.line, borderWidth: 2, padding: 10, gap: 2 }}>
              <Text style={{ fontWeight: '800' }}>{p.n}</Text><Small>{p.p}</Small><Small>{p.s}</Small>
            </Card>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 22 }}>{agree ? '☑' : '☐'}</Text>
        <Small>I agree to the Cydras Terms of Service and Privacy Policy.</Small>
      </Pressable>
      <Button title="Start free trial" onPress={go} busy={busy} />
    </Screen>
  );
}
