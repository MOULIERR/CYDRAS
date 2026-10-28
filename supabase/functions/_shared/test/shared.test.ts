import { describe, it, expect } from 'vitest';
import { checkSms, toE164, inboundKeyword, withFooter, localHour } from '../sms.ts';
import { mapStatus, remainingTrialEnd, planFromPrice } from '../billing.ts';
import { verifyStripe, verifyTwilio, signStripeForTest, signTwilioForTest } from '../crypto.ts';
import { toForm } from '../form.ts';
import { balanceDue, refundable } from '../balance.ts';
import { buildPush } from '../push.ts';
import { toCents } from '../http.ts';

const ok = { value: '(954) 555-0131', sms_consent_at: '2026-10-01', opted_out_at: null };

describe('texting rules', () => {
  it('formats US numbers', () => {
    expect(toE164('(954) 555-0131')).toBe('+19545550131');
    expect(toE164('1-954-555-0131')).toBe('+19545550131');
    expect(toE164('555-0131')).toBeNull();
  });
  it('never texts someone who replied STOP or never agreed', () => {
    expect(checkSms({ ...ok, opted_out_at: '2026-10-02' }, 'on_my_way', new Date(), 'America/New_York')).toMatchObject({ ok: false });
    expect(checkSms({ ...ok, sms_consent_at: null }, 'receipt', new Date(), 'America/New_York')).toMatchObject({ ok: false });
    expect(checkSms(ok, 'on_my_way', new Date(), 'America/New_York')).toEqual({ ok: true });
  });
  it('marketing only goes out 8 AM to 8 PM shop time', () => {
    const night = new Date('2026-10-23T02:30:00Z'); // 10:30 PM in Florida
    const noon = new Date('2026-10-23T16:00:00Z');  // noon in Florida
    expect(localHour(night, 'America/New_York')).toBe(22);
    expect(checkSms(ok, 'marketing', night, 'America/New_York')).toMatchObject({ ok: false });
    expect(checkSms(ok, 'marketing', noon, 'America/New_York')).toEqual({ ok: true });
    expect(checkSms(ok, 'on_my_way', night, 'America/New_York')).toEqual({ ok: true });
  });
  it('adds "Reply STOP" to marketing texts', () => {
    expect(withFooter('AC tune-up season!', 'marketing', 'Coastal Air')).toMatch(/Reply STOP to opt out/);
    expect(withFooter('On my way', 'on_my_way', 'Coastal Air')).toBe('On my way');
  });
  it('understands STOP and START replies', () => {
    expect(inboundKeyword(' Stop ')).toBe('stop');
    expect(inboundKeyword('UNSUBSCRIBE')).toBe('stop');
    expect(inboundKeyword('start')).toBe('start');
    expect(inboundKeyword('stop by at 3?')).toBeNull();
  });
});

describe('Cydras billing', () => {
  it('maps Stripe states', () => {
    expect(mapStatus('active')).toBe('active');
    expect(mapStatus('unpaid')).toBe('past_due');
    expect(mapStatus('incomplete_expired')).toBe('canceled');
  });
  it('keeps the rest of the free trial when the owner pays early', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect(remainingTrialEnd('2026-11-01T12:00:00Z', now)).toBe(Math.floor(Date.parse('2026-11-01T12:00:00Z') / 1000));
    expect(remainingTrialEnd('2026-10-24T00:00:00Z', now)).toBeNull();
  });
  it('finds the plan from the Stripe price', () => {
    expect(planFromPrice('price_t', { solo: 'price_s', team: 'price_t', pro: 'price_p' })).toBe('team');
  });
});

describe('webhook signatures', () => {
  it('accepts real Stripe signatures and rejects fakes and old ones', async () => {
    const body = '{"id":"evt_1"}', secret = 'whsec_test', t = 1_800_000_000;
    const h = await signStripeForTest(body, secret, t);
    expect(await verifyStripe(body, h, secret, t + 10)).toBe(true);
    expect(await verifyStripe(body + ' ', h, secret, t + 10)).toBe(false);
    expect(await verifyStripe(body, h, 'wrong', t + 10)).toBe(false);
    expect(await verifyStripe(body, h, secret, t + 3600)).toBe(false);
  });
  it('accepts real Twilio signatures only', async () => {
    const url = 'https://x.supabase.co/functions/v1/twilio-inbound', p = { From: '+19545550131', Body: 'STOP' };
    const sig = await signTwilioForTest(url, p, 'tok');
    expect(await verifyTwilio(url, p, sig, 'tok')).toBe(true);
    expect(await verifyTwilio(url, { ...p, Body: 'START' }, sig, 'tok')).toBe(false);
  });
});

describe('money math', () => {
  it('encodes Stripe forms', () => {
    expect(decodeURIComponent(toForm({ a: { b: 1 }, c: ['x', 'y'], d: undefined }))).toBe('a[b]=1&c[0]=x&c[1]=y');
  });
  it('works out what is still owed, ignoring removed payments and subtracting refunds', () => {
    const pays = [
      { amount: 100, refunded_amount: 0, voided_at: null, status: 'succeeded' },
      { amount: 50, refunded_amount: 0, voided_at: '2026-10-01', status: 'succeeded' },
      { amount: 30, refunded_amount: 10, voided_at: null, status: 'succeeded' },
      { amount: 99, refunded_amount: 0, voided_at: null, status: 'failed' },
    ];
    expect(balanceDue(176.55, pays)).toBe(56.55);
    expect(refundable({ ...pays[2], method: 'card_link' })).toBe(20);
    expect(toCents(117.7)).toBe(11770);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it('only pushes to real Expo tokens, once each', () => {
    expect(buildPush(['ExponentPushToken[a]', 'ExponentPushToken[a]', 'junk'], 't', 'b')).toHaveLength(1);
  });
});
