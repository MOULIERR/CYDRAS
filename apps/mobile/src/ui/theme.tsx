// Cydras phone look, same as the phone mockup: charcoal, off-white and safety orange,
// Barlow fonts, big tap targets for gloves and sunlight. Follows the phone's light/dark setting.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export const LIGHT = {
  bg: '#f7f7f5', surface: '#ffffff', ink: '#1f2326', muted: '#62676c', line: '#e2e2e0',
  accent: '#f26b1d', accentInk: '#1f2326', steel: '#2b2f33', steelInk: '#ffffff',
  ok: '#1f8a4c', warn: '#b86a00', bad: '#c42b2b', chip: '#f1f1ef', accentSoft: '#fdeee5', me: '#2b2f33', meInk: '#ffffff', dark: false,
};
export const DARK: typeof LIGHT = {
  bg: '#17191b', surface: '#212427', ink: '#f1eee8', muted: '#a3a7ab', line: '#34383c',
  accent: '#ff7a2e', accentInk: '#17191b', steel: '#0f1112', steelInk: '#f1eee8',
  ok: '#3fb872', warn: '#e2962a', bad: '#ef5b5b', chip: '#2c3034', accentSoft: '#3a2617', me: '#3b4045', meInk: '#f1eee8', dark: true,
};
export type Theme = typeof LIGHT;

export const F = {
  display: 'BarlowCondensed_700Bold', displaySemi: 'BarlowCondensed_600SemiBold',
  body: 'Barlow_400Regular', med: 'Barlow_500Medium', semi: 'Barlow_600SemiBold', bold: 'Barlow_700Bold',
  mono: 'IBMPlexMono_500Medium',
};

// Small saved settings on this phone (look, maps app). Kept in the phone's local storage.
export type Prefs = { theme: 'system' | 'light' | 'dark'; mapApp: 'ask' | 'google' | 'apple' | 'waze'; dash: 'timeline' | 'classic' };
const DEF: Prefs = { theme: 'system', mapApp: 'ask', dash: 'timeline' };
const KEY = 'cydras.prefs';
const store = () => (globalThis as any).localStorage as Storage | undefined;
function readPrefs(): Prefs { try { return { ...DEF, ...JSON.parse(store()?.getItem(KEY) ?? '{}') }; } catch { return DEF; } }

type Ctx = { t: Theme; prefs: Prefs; setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void };
const ThemeCtx = createContext<Ctx>({ t: LIGHT, prefs: DEF, setPref: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const sys = useColorScheme();
  const [prefs, setPrefs] = useState<Prefs>(DEF);
  useEffect(() => setPrefs(readPrefs()), []);
  const value = useMemo<Ctx>(() => {
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && sys === 'dark');
    return {
      t: dark ? DARK : LIGHT, prefs,
      setPref: (k, v) => setPrefs((p) => { const n = { ...p, [k]: v }; try { store()?.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }),
    };
  }, [prefs, sys]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
export const useT = () => useContext(ThemeCtx).t;

export const shadow = (t: Theme) => (t.dark ? {} : { shadowColor: '#1f2326', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 });
