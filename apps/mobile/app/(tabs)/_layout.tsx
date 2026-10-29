// Bottom tabs, same as the phone mockup: Today, Schedule, Customers, Texts, Supply, More.
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useT, F } from '../../src/ui/theme';
import { Icon } from '../../src/ui/icons';
import { useUnread } from '../../src/lib/inbox';

function TabIcon({ name, color, focused, badge }: { name: string; color: string; focused: boolean; badge?: number }) {
  const t = useT();
  return <View>
    <View style={{ paddingHorizontal: 14, paddingVertical: 3, borderRadius: 999, backgroundColor: focused ? t.accentSoft : 'transparent' }}><Icon name={name} size={24} color={focused ? t.accent : color} /></View>
    {badge ? <View style={{ position: 'absolute', top: -4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: t.bad, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 11 }}>{badge}</Text></View> : null}
  </View>;
}

export default function TabsLayout() {
  const t = useT();
  const unread = useUnread();
  const opt = (title: string, icon: string, badge?: number) => ({ title, tabBarIcon: ({ color, focused }: { color: any; focused: boolean }) => <TabIcon name={icon} color={String(color)} focused={focused} badge={badge} /> });
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line, height: 70, paddingTop: 6 },
      tabBarLabelStyle: { fontFamily: F.semi, fontSize: 10.5, letterSpacing: 0, marginBottom: 6 }, tabBarItemStyle: { paddingHorizontal: 0 },
      headerStyle: { backgroundColor: t.surface }, headerShadowVisible: false, headerTintColor: t.ink, headerTitleStyle: { fontFamily: F.display, fontSize: 24 }, headerTitleAlign: 'left',
      sceneStyle: { backgroundColor: t.bg },
    }}>
      <Tabs.Screen name="index" options={opt('Today', 'today')} />
      <Tabs.Screen name="schedule" options={opt('Schedule', 'calendar')} />
      <Tabs.Screen name="customers" options={opt('Customers', 'users')} />
      <Tabs.Screen name="inbox" options={opt('Texts', 'chat', unread)} />
      <Tabs.Screen name="supply" options={opt('Supply', 'store')} />
      <Tabs.Screen name="more" options={opt('More', 'more')} />
    </Tabs>
  );
}
