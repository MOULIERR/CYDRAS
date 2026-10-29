// Supply houses: the shop's distributors (set up on the office website → Supply houses).
// Call, get directions, and see account numbers and hours.
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSession, isManager } from '../../src/lib/session';
import { useCompany, openMaps } from '../../src/lib/data';
import { config } from '../../src/lib/config';
import { Screen, Card, T, SearchBox, SmallBtn, Button, Icon, Chips, Chip } from '../../src/ui/kit';
import { useT, useTheme } from '../../src/ui/theme';

export default function Supply() {
  const { member } = useSession();
  const t = useT();
  const { prefs } = useTheme();
  const company = useCompany();
  const [q, setQ] = useState('');
  const [fav, setFav] = useState(false);
  const all: any[] = company?.settings?.suppliers ?? [];
  const list = all.filter((d) => (!fav || d.fav) && (!q || JSON.stringify(d).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(!!b.fav) - Number(!!a.fav) || String(a.name).localeCompare(String(b.name)));
  return (
    <Screen>
      <SearchBox value={q} onChangeText={setQ} placeholder="Search store or brand" />
      <Chips><Chip label="All" on={!fav} onPress={() => setFav(false)} /><Chip label="★ Favorites" on={fav} onPress={() => setFav(true)} /></Chips>
      <View style={{ gap: 10 }}>{list.map((d, i) => <Card key={i} style={{ gap: 4 }}>
        <T b size={18}>{d.fav ? '★ ' : ''}{d.name}</T>
        {d.branch || d.addr || d.address ? <Pressable onPress={() => openMaps(d.addr ?? d.address ?? d.branch, prefs.mapApp)} style={{ flexDirection: 'row', gap: 6 }}><Icon name="pin" size={16} color={t.accent} /><T s style={{ flex: 1 }}>{d.addr ?? d.address ?? d.branch}</T></Pressable> : null}
        {d.carries || d.brands ? <T s size={14}>{d.carries ?? d.brands}</T> : null}
        {d.hours ? <T s size={14}>Hours: {d.hours}</T> : null}
        {d.acct && isManager(member) ? <T s mono size={14}>Account # {d.acct}</T> : null}
        {d.rep ? <T s size={14}>Rep: {d.rep}</T> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>{d.phone ? <SmallBtn title="Call" icon="phone" onPress={() => Linking.openURL(`tel:${d.phone}`)} /> : null}{d.addr || d.address ? <SmallBtn title="Directions" icon="nav" onPress={() => openMaps(d.addr ?? d.address, prefs.mapApp)} /> : null}</View>
      </Card>)}</View>
      {!all.length ? <Card style={{ alignItems: 'center', gap: 10 }}><Icon name="store" size={30} color={t.muted} /><T s style={{ textAlign: 'center' }}>No supply houses yet. The owner adds the shop's distributors, account numbers and hours on the office website.</T>
        {isManager(member) ? <Button small kind="secondary" title="Open the office website" onPress={() => WebBrowser.openBrowserAsync(`${config.officeUrl}/supply`)} /> : null}</Card> : null}
    </Screen>
  );
}
