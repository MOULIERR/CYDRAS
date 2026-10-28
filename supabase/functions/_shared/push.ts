// Push notifications to phones through Expo's push service.
export type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown>; sound?: 'default' };

export function buildPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>): PushMessage[] {
  return [...new Set(tokens)].filter((t) => /^Expo(nent)?PushToken\[.+\]$/.test(t)).map((to) => ({ to, title, body, data, sound: 'default' }));
}

export async function sendPush(messages: PushMessage[]): Promise<{ sent: number; badTokens: string[] }> {
  if (!messages.length) return { sent: 0, badTokens: [] };
  const badTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    const out = await res.json().catch(() => ({}));
    (out?.data ?? []).forEach((r: any, k: number) => {
      if (r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered') badTokens.push(chunk[k].to);
    });
  }
  return { sent: messages.length - badTokens.length, badTokens };
}
