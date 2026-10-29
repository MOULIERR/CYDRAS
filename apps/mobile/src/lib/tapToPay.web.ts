// Web preview only: no card reader.
import { createElement, Fragment, useState, type ReactNode } from 'react';
import { callFunction } from './supabase';
export function useTapToPay(_c: string) {
  const [step, setStep] = useState<'idle' | 'error'>('idle'); const [message, setMessage] = useState('');
  return { charge: async (_i: string, _a?: number) => { setStep('error'); setMessage('Tap to Pay works in the phone app.'); return false; }, step: step as any, message, available: false };
}
export function PaymentsProvider({ children }: { children: ReactNode; companyId?: string }) { return createElement(Fragment, null, children); }
export async function sendPayLink(invoiceId: string) { return callFunction<{ url: string; amount: number }>('payment-intent', { invoice_id: invoiceId, method: 'card_link' }); }
