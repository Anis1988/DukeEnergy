// Shared request guard for the server functions (Vercel): same-origin, access code, rate limit.

const hits = new Map<string, number[]>();

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function rateLimited(req: Request, name: string, maxPerMinute: number): Response | null {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const key = `${name}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= maxPerMinute) return json({ error: 'Too many requests, slow down.' }, 429, { 'Retry-After': '30' });
  recent.push(now);
  hits.set(key, recent);
  return null;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  // The Android app (branch "android") runs its screens from https://localhost; it still needs the access code.
  if (origin === 'https://localhost' || origin === 'capacitor://localhost') return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
/** For the app's own calls: same origin + APP_ACCESS_TOKEN (required) + rate limit. */
export function guard(req: Request, name: string, maxPerMinute = 30): Response | null {
  if (!sameOrigin(req)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return json({ error: 'Set APP_ACCESS_TOKEN in Vercel first (Settings → Environment Variables), then redeploy.' }, 503);
  if (!safeEqual(req.headers.get('x-access-token') ?? '', token)) return json({ error: 'Missing or wrong access code.' }, 401);
  return rateLimited(req, name, maxPerMinute);
}
