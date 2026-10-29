import '../src/lib/location'; // registers the background GPS task before anything else
import { Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../src/lib/session';
import { listenForTaps } from '../src/lib/push';
import { PaymentsProvider } from '../src/lib/tapToPay';
import { ThemeProvider, useT, F } from '../src/ui/theme';
import { Loading } from '../src/ui/kit';

function Gate() {
  const { session, member, loading } = useSession();
  const t = useT();
  const seg = useSegments();
  useEffect(() => listenForTaps(), []);
  useEffect(() => {
    if (loading) return;
    const inAuth = seg[0] === 'login' || seg[0] === 'signup' || seg[0] === 'join';
    if (!session && !inAuth) router.replace('/login');
    else if (session && !member && seg[0] !== 'signup' && seg[0] !== 'join') router.replace('/join');
    else if (session && member && inAuth) router.replace('/');
  }, [session, member, loading, seg]);
  if (loading) return <Loading />;
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.ink, headerShadowVisible: false, headerTitleStyle: { fontFamily: F.display, fontSize: 24 }, headerBackTitle: 'Back', contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', headerBackVisible: false }} />
        <Stack.Screen name="signup" options={{ title: 'Start free trial' }} />
        <Stack.Screen name="join" options={{ title: 'Join your team' }} />
        <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
        <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
        <Stack.Screen name="thread/[id]" options={{ title: 'Texts' }} />
        <Stack.Screen name="teamchat" options={{ title: 'Team chat' }} />
        <Stack.Screen name="newjob" options={{ title: 'New appointment', presentation: 'modal' }} />
        <Stack.Screen name="newcust" options={{ title: 'New customer', presentation: 'modal' }} />
        <Stack.Screen name="tasks" options={{ title: 'Team tasks' }} />
        <Stack.Screen name="time" options={{ title: 'Timesheet' }} />
        <Stack.Screen name="truck" options={{ title: 'My truck' }} />
        <Stack.Screen name="pricebook" options={{ title: 'Price book' }} />
        <Stack.Screen name="unpaid" options={{ title: 'Unpaid invoices' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="sync" options={{ title: 'Sync' }} />
        <Stack.Screen name="help" options={{ title: 'Help & support' }} />
      </Stack>
    </>
  );
}

function Pay({ children }: { children: React.ReactNode }) {
  const { member } = useSession();
  return <PaymentsProvider companyId={member?.company_id}>{children}</PaymentsProvider>;
}

export default function Root() {
  const [fonts] = useFonts({ Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, IBMPlexMono_500Medium });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {!fonts ? <Loading /> : <SessionProvider><Pay><Gate /></Pay></SessionProvider>}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
