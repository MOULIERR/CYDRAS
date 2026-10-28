import Constants from 'expo-constants';
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
export const config = {
  supabaseUrl: extra.supabaseUrl,
  supabaseAnonKey: extra.supabaseAnonKey,
  officeUrl: extra.officeUrl,
  easProjectId: (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined,
};
