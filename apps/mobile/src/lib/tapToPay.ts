// Take a card by tapping it on the back of the phone (Tap to Pay on iPhone and Android, via Stripe Terminal).
// The payment shows up on the invoice when Stripe confirms it (the server records it, not the phone).
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useState } from 'react';
import { callFunction } from './supabase';

export function useTapToPay(companyId: string) {
  const { initialize, easyConnect, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent, connectedReader } = useStripeTerminal();
  const [step, setStep] = useState<'idle' | 'connecting' | 'tap' | 'confirming' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function charge(invoiceId: string, amount?: number): Promise<boolean> {
    try {
      setStep('connecting'); setMessage('Getting the phone ready to take a card…');
      const init = await initialize();
      if (init.error) throw new Error(init.error.message);
      if (!connectedReader) {
        const { location } = await callFunction<{ location: string }>('terminal-token', { company_id: companyId });
        const c = await easyConnect({ discoveryMethod: 'tapToPay', locationId: location, merchantDisplayName: 'Cydras', tosAcceptancePermitted: true, autoReconnectOnUnexpectedDisconnect: true });
        if (c.error) throw new Error(c.error.message);
      }
      const pi = await callFunction<{ client_secret: string; amount: number }>('payment-intent', { invoice_id: invoiceId, method: 'tap_to_pay', amount });
      const r = await retrievePaymentIntent(pi.client_secret);
      if (r.error || !r.paymentIntent) throw new Error(r.error?.message ?? 'Could not start the payment');
      setStep('tap'); setMessage(`Have the customer tap their card on the back of the phone ($${pi.amount.toFixed(2)})`);
      const col = await collectPaymentMethod({ paymentIntent: r.paymentIntent });
      if (col.error || !col.paymentIntent) throw new Error(col.error?.message ?? 'The card was not read');
      setStep('confirming'); setMessage('Approving…');
      const conf = await confirmPaymentIntent({ paymentIntent: col.paymentIntent });
      if (conf.error) throw new Error(conf.error.message);
      setStep('done'); setMessage('Paid. Receipt sent to the customer.');
      return true;
    } catch (e) {
      setStep('error'); setMessage((e as Error).message);
      return false;
    }
  }
  return { charge, step, message };
}

/** Text the customer a secure link to pay by card. Needs signal. */
export async function sendPayLink(invoiceId: string) {
  return callFunction<{ url: string; amount: number }>('payment-intent', { invoice_id: invoiceId, method: 'card_link' });
}
