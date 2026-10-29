// Sync: what's waiting to send, and anything the server refused (with the reason).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSyncState, syncNow, failedChanges, dismiss } from '../src/lib/sync';
import { Screen, Card, T, Button } from '../src/ui/kit';
import { useT } from '../src/ui/theme';

export default function Sync() {
  const s = useSyncState();
  const t = useT();
  const [failed, setFailed] = useState<any[]>([]);
  useEffect(() => { failedChanges().then(setFailed); }, [s.failed, s.version]);
  return <Screen>
    <Card><T b>{s.online ? 'Online' : 'No signal'}</T><T s>{s.pending} waiting to send · last synced {s.lastSync ? s.lastSync.toLocaleTimeString() : 'not yet'}</T></Card>
    <Button title={s.syncing ? 'Syncing…' : 'Sync now'} kind="secondary" onPress={syncNow} busy={s.syncing} />
    {failed.map((f) => <Card key={f.seq} style={{ gap: 8 }}><T b color={t.bad}>Not saved</T><T s>{f.error}</T><Button small kind="danger" title="OK, throw it away" onPress={() => dismiss(f.seq)} /></Card>)}
    <T s size={14}>Everything you do is saved on this phone first, so it works in an attic with no signal. It sends on its own when signal comes back.</T>
  </Screen>;
}
