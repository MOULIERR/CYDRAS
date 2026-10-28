// Push notifications: "New job assigned", customer texts, schedule changes.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { config } from './config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerForPush(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Jobs and messages', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: config.easProjectId })).data;
  await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS });
  return token;
}

/** Tapping a notification opens the right screen. */
export function listenForTaps() {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const d = r.notification.request.content.data as { screen?: string; job_id?: string };
    if (d?.screen === 'job' && d.job_id) router.push(`/job/${d.job_id}`);
  });
  return () => sub.remove();
}
