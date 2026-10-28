/** Turns {a:{b:1},c:[x,y]} into Stripe's form style: a[b]=1&c[0]=x&c[1]=y */
export function toForm(obj: Record<string, unknown>, prefix = ''): string {
  const out: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${k}[${i}]`, x));
    else if (typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([kk, vv]) => add(`${k}[${kk}]`, vv));
    else out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  };
  Object.entries(obj).forEach(([k, v]) => add(prefix ? `${prefix}[${k}]` : k, v));
  return out.join('&');
}
