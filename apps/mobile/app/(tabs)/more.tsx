// Account, sync status, Cydras billing (owner), and sign out.
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSession } from '../../src/lib/session';
import { supabase, callFunction } from '../../src/lib/supabase';
import { useSyncState, syncNow, failedChanges, dismiss } from '../../src/lib/sync';
import { Screen, Card, H2, Small, Button, C } from '../../src/ui/kit';
import { config } from '../../src/lib/config';

export default function More() {
  const { member, session, signOut } = useSession();
  const s = useSyncState();
  const [failed, setFailed] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  useEffect(() => { failedChanges().then(setFailed); }, [s.failed, s.version]);
  useEffect(() => {
    if (member?.role === 'owner') supabase.from('subscriptions').select('*').eq('company_id', member.company_id).maybeSingle().then(({ data }) => setSub(data));
  }, [member]);

  async function billing(plan?: string) {
    try {
      const r = await callFunction<{ url: string }>(plan ? 'billing-checkout' : 'billing-portal', { company_id: member!.company_id, plan });
      await WebBrowser.openBrowserAsync(r.url);
    } catch (e) { Alert.alert('Billing', (e as Error).message); }
  }
  const daysLeft = sub?.trial_ends_at ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <Screen>
      <Card>
        <H2>{member?.name}</H2>
        <Small>{session?.user.email} · {member?.role}</Small>
      </Card>
      <Card>
        <H2>Sync</H2>
        <Small>{s.online ? 'Online' : 'No signal'} · {s.pending} waiting to send · last synced {s.lastSync ? s.lastSync.toLocaleTimeString() : 'not yet'}</Small>
        <Button title={s.syncing ? 'Syncing…' : 'Sync now'} kind="secondary" onPress={syncNow} busy={s.syncing} />
        {failed.map((f) => (
          <View key={f.seq} style={{ gap: 6 }}>
            <Small color={C.bad}>Not saved: {f.error}</Small>
            <Button title="OK, throw it away" kind="danger" onPress={() => dismiss(f.seq)} />
          </View>
        ))}
      </Card>
      {member?.role === 'owner' && sub && (
        <Card>
          <H2>Your Cydras plan</H2>
          <Small>{sub.status === 'trialing' ? `Free trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : sub.status === 'active' ? `${sub.plan} plan · active` : sub.status === 'past_due' ? 'Payment failed. Update your card.' : 'Canceled'}</Small>
          {sub.stripe_subscription_id ? <Button title="Manage billing" kind="secondary" onPress={() => billing()} /> : <>
            <Button title="Pick Solo · $49/mo" kind="secondary" onPress={() => billing('solo')} />
            <Button title="Pick Team · $125/mo" onPress={() => billing('team')} />
            <Button title="Pick Pro · $249/mo" kind="secondary" onPress={() => billing('pro')} />
          </>}
        </Card>
      )}
      <Button title="Open the office site" kind="secondary" onPress={() => WebBrowser.openBrowserAsync(config.officeUrl)} />
      <Button title="Sign out" kind="danger" onPress={() => Alert.alert('Sign out?', s.pending ? `${s.pending} change${s.pending > 1 ? 's are' : ' is'} not sent yet. Get signal first, or they will be lost.` : 'You will need your email and password to get back in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }])} />
    </Screen>
  );
}
