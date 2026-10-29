// More: you, your work tools, money (managers), settings, help, sign out. Like the phone mockup.
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { workedMinutes, hm } from '@cydras/core';
import { useSession, isManager } from '../../src/lib/session';
import { useRows, useSyncState } from '../../src/lib/sync';
import { useCompany } from '../../src/lib/data';
import { config } from '../../src/lib/config';
import { Screen, Card, H2, T, Eyebrow, Menu, MenuItem, Avatar } from '../../src/ui/kit';

const ROLE: Record<string, string> = { owner: 'Owner', supervisor: 'Supervisor', tech: 'Tech', apprentice: 'Apprentice' };

export default function More() {
  const { member, signOut } = useSession();
  const s = useSyncState();
  const company = useCompany();
  const open = useRows<any>('time_entries', (e) => e.member_id === member?.id && !e.clock_out, [member?.id])[0];
  const tasks = useRows<any>('tasks', (x) => x.assigned_to === member?.id && !x.done_at, [member?.id]);
  if (!member) return null;
  const mgr = isManager(member), owner = member.role === 'owner';
  const web = (p: string) => WebBrowser.openBrowserAsync(`${config.officeUrl}${p}`);
  const out = () => Alert.alert('Log out?', s.pending ? `${s.pending} change${s.pending > 1 ? 's are' : ' is'} not sent yet. Get signal first, or they will be lost.` : 'You will need your email and password to get back in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: signOut }]);
  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={member.name} size={60} />
        <View style={{ flex: 1 }}><H2>{member.name}</H2><T s>{company?.name ?? ''} · {ROLE[member.role]}</T></View>
      </Card>
      <View><Eyebrow style={{ marginBottom: 8 }}>Work</Eyebrow><Menu>
        <MenuItem icon="list" title="Team tasks" sub={tasks.length ? `${tasks.length} open for you` : 'Nothing on your list'} onPress={() => router.push('/tasks')} />
        <MenuItem icon="clock" title="Timesheet" sub={open ? `Clocked in · ${hm(workedMinutes(open))} today` : 'Not clocked in'} onPress={() => router.push('/time')} />
        <MenuItem icon="truck" title="My truck" sub="Parts on your truck" onPress={() => router.push('/truck')} />
        <MenuItem icon="tag" title="Price book" sub="Prices for every task" onPress={() => router.push('/pricebook')} />
        <MenuItem icon="chat" title="Team chat" onPress={() => router.push('/teamchat')} last />
      </Menu></View>
      {mgr ? <View><Eyebrow style={{ marginBottom: 8 }}>Office</Eyebrow><Menu>
        <MenuItem icon="money" title="Unpaid invoices" sub="Who owes you" onPress={() => router.push('/unpaid')} />
        <MenuItem icon="calendar" title="New appointment" onPress={() => router.push('/newjob')} />
        <MenuItem icon="map" title="Live map" sub="Opens the office website" onPress={() => web('/live')} />
        {owner ? <MenuItem icon="chart" title="Reports & revenue" sub="Opens the office website" onPress={() => web('/revenue')} /> : null}
        <MenuItem icon="globe" title="Office website" sub="Dispatch board, team, settings and more" onPress={() => web('/')} last />
      </Menu></View> : null}
      <View><Eyebrow style={{ marginBottom: 8 }}>Settings</Eyebrow><Menu>
        <MenuItem icon="gear" title="Preferences" sub="Look, maps app, Today layout" onPress={() => router.push('/settings')} />
        <MenuItem icon="refresh" title="Sync" sub={s.online ? (s.pending ? `${s.pending} waiting to send` : 'Everything is sent') : 'No signal'} onPress={() => router.push('/sync')} last />
      </Menu></View>
      <Menu>
        <MenuItem icon="gift" title="Refer a friend" sub="Give a free month, get a free month" onPress={() => web('/refer')} />
        <MenuItem icon="help" title="Help & support" onPress={() => router.push('/help')} />
        <MenuItem icon="doc" title="About & legal" sub="Terms, privacy, version" onPress={() => web('/legal')} last />
      </Menu>
      <Menu><MenuItem icon="out" title="Log out" danger onPress={out} last /></Menu>
    </Screen>
  );
}
