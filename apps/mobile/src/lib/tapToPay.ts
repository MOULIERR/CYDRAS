// Take a card by tapping it on the back of the phone (Tap to Pay on iPhone and Android, via Stripe Terminal).
// The payment shows up on the invoice when Stripe confirms it (the server records it, not the phone).
// In Expo Go (the test app) card reading isn't available, so this turns itself off there.
import { useState, type ReactNode } from 'react';
import { createElement, Fragment } from 'react';
import { callFunction } from './supabase';
import { canTapToPay } from './env';

type Step = 'idle' | 'connecting' | 'tap' | 'confirming' | 'done' | 'error';

function useReal(companyId: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStripeTerminal } = require('@stripe/stripe-terminal-react-native');
  const { initialize, easyConnect, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent, connectedReader } = useStripeTerminal();
  const [step, setStep] = useState<Step>('idle');
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
    } catch (e) { setStep('error'); setMessage((e as Error).message); return false; }
  }
  return { charge, step, message, available: true };
}
function useOff(_c: string) {
  const [step, setStep] = useState<Step>('idle'); const [message, setMessage] = useState('');
  async function charge() { setStep('error'); setMessage("Tap to Pay works in the real Cydras app, not in the Expo Go test app. Use a pay link, cash or check."); return false; }
  return { charge, step, message, available: false };
}
export const useTapToPay: (companyId: string) => { charge: (invoiceId: string, amount?: number) => Promise<boolean>; step: Step; message: string; available: boolean } = canTapToPay ? useReal : useOff;

/** Wraps the app so card payments can work (only in the real app). */
export function PaymentsProvider({ children, companyId }: { children: ReactNode; companyId?: string }) {
  if (!canTapToPay) return createElement(Fragment, null, children);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { StripeTerminalProvider } = require('@stripe/stripe-terminal-react-native');
  return createElement(StripeTerminalProvider, { tokenProvider: async () => (await callFunction<{ secret: string }>('terminal-token', { company_id: companyId })).secret }, createElement(Fragment, null, children));
}

/** Text the customer a secure link to pay by card. Needs signal. */
export async function sendPayLink(invoiceId: string) {
  return callFunction<{ url: string; amount: number }>('payment-intent', { invoice_id: invoiceId, method: 'card_link' });
}
