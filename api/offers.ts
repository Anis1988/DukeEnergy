import { waitUntil } from '@vercel/functions';
import { guard, json } from '../server/guard.js';
import { getOffers } from '../server/offers.js';
import { getCheck, offerId, runCheck, startCheck, takeDailySlot } from '../server/aicheck.js';

/**
 * GET [?fresh=1]: Duke's Price to Compare + every supplier offer for Duke Energy Ohio homes (Energy Choice Ohio).
 * GET ?check=<id>: an AI deep check (running / done / error).
 * POST {id, ctx}: start an AI deep check of that offer (it runs in the background, ~1–5 minutes).
 */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'offers', 60);
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  try {
    const check = q.get('check');
    if (check) {
      const c = await getCheck(check);
      if (!c) return json({ id: check, status: 'none' });
      // A check that never finished (the server stopped it at its time limit).
      if (c.status === 'running' && Date.now() - Date.parse(c.startedAt) > 6 * 60_000) return json({ ...c, status: 'error', error: 'The check took too long and was stopped. Try again.' });
      return json(c);
    }
    const offers = await getOffers(q.get('fresh') === '1');
    return json({ ...offers, offers: offers.offers.map((o) => ({ ...o, id: offerId(o) })) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'offers-check', 6);
  if (blocked) return blocked;
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'Add ANTHROPIC_API_KEY in Vercel (Settings → Environment Variables), then redeploy.' }, 503);
  const b = (await req.json().catch(() => ({}))) as { id?: string; fresh?: boolean; ctx?: Record<string, unknown> };
  const id = String(b.id ?? '');
  // The offer comes from the server's own copy of the state list, never from the request.
  const offer = (await getOffers()).offers.find((o) => offerId(o) === id);
  if (!offer) return json({ error: 'That offer is no longer on the state list. Refresh the offers.' }, 404);
  const existing = await getCheck(id);
  if (existing?.status === 'running' && Date.now() - Date.parse(existing.startedAt) < 6 * 60_000) return json(existing);
  if (existing?.status === 'done' && !b.fresh) return json(existing);
  if (!(await takeDailySlot())) return json({ error: `Today’s AI checks are used up (${process.env.AI_CHECK_DAILY_LIMIT ?? 10} a day). Try again tomorrow.` }, 429);
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : 0);
  const c = b.ctx ?? {};
  const ctx = {
    yearKwh: num(c.yearKwh, 200000),
    ptc: typeof c.ptc === 'number' ? num(c.ptc, 2) : null,
    ptcPeriod: typeof c.ptcPeriod === 'string' ? c.ptcPeriod.slice(0, 80) : undefined,
    nowRate: num(c.nowRate, 2),
    nowName: typeof c.nowName === 'string' ? c.nowName.slice(0, 80) : 'Duke (standard)',
    cars: Math.round(num(c.cars, 6)),
  };
  const started = await startCheck(id);
  waitUntil(runCheck(id, offer, ctx));
  return json(started, 202);
}
