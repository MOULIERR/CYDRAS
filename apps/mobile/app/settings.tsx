// Preferences on this phone: light or dark, which maps app opens for directions.
import { View } from 'react-native';
import { Screen, Eyebrow, Seg, T } from '../src/ui/kit';
import { useTheme } from '../src/ui/theme';
import { inExpoGo } from '../src/lib/env';

export default function Settings() {
  const { prefs, setPref } = useTheme();
  return <Screen>
    <View style={{ gap: 8 }}><Eyebrow>Look</Eyebrow><Seg value={prefs.theme} onChange={(v) => setPref('theme', v)} options={[['system', 'Phone setting'], ['light', 'Light'], ['dark', 'Dark']]} /></View>
    <View style={{ gap: 8 }}><Eyebrow>Maps app for directions</Eyebrow><Seg value={prefs.mapApp} onChange={(v) => setPref('mapApp', v)} options={[['ask', 'Ask'], ['google', 'Google'], ['apple', 'Apple'], ['waze', 'Waze']]} /></View>
    <T s size={14}>Company settings (texts, prices, team, categories) are on the office website.</T>
    {inExpoGo ? <T s size={13}>You're using the Expo Go test app. Card payments, background location and push alerts work in the real Cydras app.</T> : null}
  </Screen>;
}
