// Sends a text through Twilio. Each shop texts from its own business number (registered for 10DLC).
import { env, HttpError } from './http.ts';
import { toForm } from './form.ts';

export async function sendTwilioSms(from: string, to: string, body: string, statusCallback?: string): Promise<{ sid: string; status: string }> {
  const sid = env('TWILIO_ACCOUNT_SID');
  const auth = btoa(`${sid}:${env('TWILIO_AUTH_TOKEN')}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toForm({ From: from, To: to, Body: body, StatusCallback: statusCallback }),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, data?.message ?? 'The text could not be sent');
  return { sid: data.sid, status: data.status };
}
