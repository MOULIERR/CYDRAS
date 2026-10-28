// Small helpers shared by every server function.
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Wraps a handler: answers CORS preflight, turns thrown errors into plain-English JSON errors. */
export function serve(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong. Try again.' }, 500);
    }
  };
}

export function env(name: string): string {
  const g = globalThis as any;
  const v = g.Deno?.env?.get?.(name) ?? g.process?.env?.[name];
  if (!v) throw new Error(`Missing setting ${name}`);
  return v;
}

export function money(n: number): string {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Dollars to cents without floating-point surprises (117.7 -> 11770). */
export function toCents(dollars: number): number {
  return Math.round(Number(dollars) * 100);
}
