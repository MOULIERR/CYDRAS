// Rules for texting customers. Kept separate so they can be tested without sending anything.

export type Contact = { value: string; sms_consent_at: string | null; opted_out_at: string | null };
export type SmsKind = 'manual' | 'on_my_way' | 'reminder' | 'receipt' | 'estimate' | 'review' | 'marketing' | 'booking' | 'system';

/** US numbers to E.164 (+19545550131). Returns null if it isn't a usable phone number. */
export function toE164(raw: string): string | null {
  const d = (raw || '').replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(d)) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

/** Hour of the day (0-23) in the shop's time zone. */
export function localHour(date: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date);
  return Number(h) % 24;
}

export const STOP_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out', 'revoke'];
export const START_WORDS = ['start', 'unstop', 'yes'];

export function inboundKeyword(body: string): 'stop' | 'start' | 'help' | null {
  const w = (body || '').trim().toLowerCase();
  if (STOP_WORDS.includes(w)) return 'stop';
  if (START_WORDS.includes(w)) return 'start';
  if (w === 'help' || w === 'info') return 'help';
  return null;
}

/**
 * Decide whether a text may go out.
 * - Nobody who replied STOP gets texts.
 * - Marketing needs written consent, must end with opt-out wording, and only goes out 8 AM to 8 PM local
 *   (Florida Telephone Solicitation Act). Other texts about a job the customer booked are allowed with any consent on file.
 */
export function checkSms(contact: Contact | null, kind: SmsKind, now: Date, timeZone: string): { ok: true } | { ok: false; reason: string } {
  if (!contact) return { ok: false, reason: 'This customer has no mobile number' };
  if (!toE164(contact.value)) return { ok: false, reason: 'This phone number does not look right' };
  if (contact.opted_out_at) return { ok: false, reason: 'This customer replied STOP. They do not get texts.' };
  if (!contact.sms_consent_at) return { ok: false, reason: 'This customer has not agreed to get texts yet' };
  if (kind === 'marketing') {
    const h = localHour(now, timeZone);
    if (h < 8 || h >= 20) return { ok: false, reason: 'Marketing texts only go out between 8 AM and 8 PM' };
  }
  return { ok: true };
}

export function withFooter(body: string, kind: SmsKind, company: string): string {
  const b = body.trim();
  if (kind === 'marketing' && !/reply stop/i.test(b)) return `${b}\n\n${company}: Reply STOP to opt out.`;
  return b;
}
