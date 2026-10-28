import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '../../src/ui/kit';

import type { ColorValue } from 'react-native';
const icon = (e: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 20, color }}>{e}</Text>;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.accent, headerTitleStyle: { fontWeight: '800' }, tabBarLabelStyle: { fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('👥') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
