import '../src/lib/location'; // registers the background GPS task before anything else
import { Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import { SessionProvider, useSession } from '../src/lib/session';
import { callFunction } from '../src/lib/supabase';
import { listenForTaps } from '../src/lib/push';
import { C } from '../src/ui/kit';

function Gate() {
  const { session, member, loading } = useSession();
  const seg = useSegments();
  useEffect(() => listenForTaps(), []);
  useEffect(() => {
    if (loading) return;
    const inAuth = seg[0] === 'login' || seg[0] === 'signup' || seg[0] === 'join';
    if (!session && !inAuth) router.replace('/login');
    else if (session && !member && seg[0] !== 'signup' && seg[0] !== 'join') router.replace('/join');
    else if (session && member && inAuth) router.replace('/');
  }, [session, member, loading, seg]);
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.card }, headerTintColor: C.ink, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Sign in', headerBackVisible: false }} />
      <Stack.Screen name="signup" options={{ title: 'Start free trial' }} />
      <Stack.Screen name="join" options={{ title: 'Join your team' }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
    </Stack>
  );
}

function Payments({ children }: { children: React.ReactNode }) {
  const { member } = useSession();
  return (
    <StripeTerminalProvider tokenProvider={async () => (await callFunction<{ secret: string }>('terminal-token', { company_id: member?.company_id })).secret}>
      <>{children}</>
    </StripeTerminalProvider>
  );
}

export default function Root() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Payments><Gate /></Payments>
    </SessionProvider>
  );
}
