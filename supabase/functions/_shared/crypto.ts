// Signature checks for webhooks (Stripe and Twilio), using the built-in Web Crypto API.
const enc = new TextEncoder();

async function hmac(alg: 'SHA-256' | 'SHA-1', key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: alg }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Stripe-Signature header: t=TIMESTAMP,v1=HEX. Rejects anything older than 5 minutes. */
export async function verifyStripe(payload: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSec - t) > 300) return false;
  const want = hex(await hmac('SHA-256', secret, `${t}.${payload}`));
  return header.split(',').filter((p) => p.startsWith('v1=')).some((p) => safeEqual(p.slice(3), want));
}

/** Twilio X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). */
export async function verifyTwilio(url: string, params: Record<string, string>, header: string | null, authToken: string): Promise<boolean> {
  if (!header) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return safeEqual(b64(await hmac('SHA-1', authToken, data)), header);
}

export async function signStripeForTest(payload: string, secret: string, t: number): Promise<string> {
  return `t=${t},v1=${hex(await hmac('SHA-256', secret, `${t}.${payload}`))}`;
}
export async function signTwilioForTest(url: string, params: Record<string, string>, token: string): Promise<string> {
  return b64(await hmac('SHA-1', token, url + Object.keys(params).sort().map((k) => k + params[k]).join('')));
}
