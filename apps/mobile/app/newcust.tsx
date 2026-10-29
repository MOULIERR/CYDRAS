// New customer: name, home or business, phone (with OK-to-text), email, address.
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { newId } from '@cydras/core';
import { useSession } from '../src/lib/session';
import { save } from '../src/lib/sync';
import { Screen, T, Field, Button, Seg } from '../src/ui/kit';
import { useT } from '../src/ui/theme';

export default function NewCustomer() {
  const { back } = useLocalSearchParams<{ back?: string }>();
  const { member } = useSession();
  const t = useT();
  const [f, setF] = useState({ name: '', kind: 'home' as 'home' | 'business' | 'condo', contact: '', phone: '', email: '', address: '', consent: false });
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (v: any) => setF({ ...f, [k]: v });
  async function go() {
    if (!f.name.trim()) return Alert.alert("Type the customer's name");
    setBusy(true);
    const c = member!.company_id, id = newId();
    await save('customers', { id, company_id: c, name: f.name.trim(), kind: f.kind, contact: f.contact.trim() || null, notes: [] });
    if (f.phone.trim()) await save('customer_contacts', { id: newId(), company_id: c, customer_id: id, kind: 'phone', value: f.phone.trim(), label: 'Mobile', is_primary: true, sms_consent_at: f.consent ? new Date().toISOString() : null, sms_consent_source: f.consent ? `phone app, by ${member!.name}` : null });
    if (f.email.trim()) await save('customer_contacts', { id: newId(), company_id: c, customer_id: id, kind: 'email', value: f.email.trim(), label: 'Email', is_primary: true });
    if (f.address.trim()) await save('sites', { id: newId(), company_id: c, customer_id: id, address: f.address.trim(), label: 'Main', is_primary: true });
    setBusy(false);
    if (back === 'newjob') router.replace(`/newjob?c=${id}`); else router.replace(`/customer/${id}`);
  }
  return (
    <Screen bar={<Button title="Save customer" onPress={go} busy={busy} />}>
      <Seg value={f.kind} onChange={up('kind')} options={[['home', 'Home'], ['business', 'Business'], ['condo', 'Condo / HOA']]} />
      <Field label={f.kind === 'home' ? 'Name' : 'Business name'} value={f.name} onChangeText={up('name')} autoFocus />
      {f.kind !== 'home' ? <Field label="Contact person" value={f.contact} onChangeText={up('contact')} /> : null}
      <Field label="Phone" value={f.phone} onChangeText={up('phone')} keyboardType="phone-pad" />
      {f.phone.trim() ? <Pressable onPress={() => up('consent')(!f.consent)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="checkbox" accessibilityState={{ checked: f.consent }}>
        <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: f.consent ? t.ok : t.line, backgroundColor: f.consent ? t.ok : 'transparent' }} />
        <T s style={{ flex: 1 }}>The customer said it's OK to text them about appointments</T></Pressable> : null}
      <Field label="Email" value={f.email} onChangeText={up('email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Address" value={f.address} onChangeText={up('address')} placeholder="Street, city, ZIP" />
    </Screen>
  );
}
