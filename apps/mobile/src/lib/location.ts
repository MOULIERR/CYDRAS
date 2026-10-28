// GPS while clocked in. Starts when you clock in, stops when you clock out. Never runs after work.
// Pings are saved on the phone and sent with the outbox, so drive time still counts with no signal.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { call } from './sync';
import './supabase'; // makes saved storage available, even when the phone wakes the app just for GPS

const KEY = 'cydras.gpsCompany';
const store = () => (globalThis as any).localStorage as Storage | undefined;

const TASK = 'cydras-location';
let companyId: string | null = null;
const currentCompany = () => companyId ?? (companyId = store()?.getItem(KEY) ?? null);

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !currentCompany()) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  for (const l of locations ?? []) {
    await call('record_ping', {
      p_company: companyId, p_lat: l.coords.latitude, p_lng: l.coords.longitude,
      p_accuracy: l.coords.accuracy ?? null, p_speed: l.coords.speed ?? null, p_at: new Date(l.timestamp).toISOString(),
    });
  }
});

/** Ask for location. Returns 'always', 'while-using', or 'denied'. */
export async function askLocation(): Promise<'always' | 'while-using' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'always' : 'while-using';
}

export async function startShiftTracking(company: string) {
  companyId = company;
  store()?.setItem(KEY, company);
  const perm = await askLocation();
  if (perm === 'denied') return perm;
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return perm;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 150,
    deferredUpdatesInterval: 60_000,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: 'Cydras', notificationBody: 'Sharing your location while you are clocked in', notificationColor: '#F26B1D' },
  });
  return perm;
}

export async function stopShiftTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  companyId = null;
  store()?.removeItem(KEY);
}
