import { waitUntil } from '@vercel/functions';
import { guard, json } from '../server/guard.js';
import { getOffers } from '../server/offers.js';
import { checkId, cleanSituation, getCheck, listChecks, offerId, runCheck, startCheck, takeDailySlot } from '../server/aicheck.js';
import { getSettings } from '../server/store.js';
import type { AiCheck } from '../src/lib/types.js';

/** A check that never finished (the server stopped it at its 5-minute limit) shows as failed. */
const stale = (c: AiCheck): AiCheck =>
  c.status === 'running' && Date.now() - Date.parse(c.startedAt) > 6 * 60_000 ? { ...c, status: 'error', error: 'The check took longer than the server allows (5 minutes) and was stopped. Pick a faster model or “Quick” in Settings → AI, then ask again.' } : c;

/**
 * GET [?fresh=1]: Duke's Price to Compare + every supplier offer for Duke Energy Ohio homes (Energy Choice Ohio).
 * GET ?check=<id>: one AI deep check (running / done / error). GET ?checks=1: every saved AI verdict.
 * POST {id, situation, fresh?}: only when the user taps “Ask AI”: the saved answer for this offer and situation,
 * or a new AI deep check (runs in the background, ~1–5 minutes).
 */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'offers', 60);
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  try {
    // Saved AI verdicts (reading them never runs the AI).
    if (q.get('checks')) return json({ checks: (await listChecks()).map(stale) });
    const check = q.get('check');
    if (check) {
      const c = await getCheck(check);
      return json(c ? stale(c) : { id: check, status: 'none' });
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
  const b = (await req.json().catch(() => ({}))) as { id?: string; fresh?: boolean; situation?: unknown };
  // The offer comes from the server's own copy of the state list, never from the request.
  const offer = (await getOffers()).offers.find((o) => offerId(o) === String(b.id ?? ''));
  if (!offer) return json({ error: 'That offer is no longer on the state list. Refresh the offers.' }, 404);
  const situation = cleanSituation(b.situation);
  const id = checkId(offer, situation);
  // Asked before for the same offer and situation: the saved answer, free.
  const existing = await getCheck(id);
  if (existing?.status === 'running' && Date.now() - Date.parse(existing.startedAt) < 6 * 60_000) return json(existing);
  if (existing?.status === 'done' && !b.fresh) return json({ ...existing, saved: true });
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'Add ANTHROPIC_API_KEY in Vercel (Settings → Environment Variables), then redeploy.' }, 503);
  if (!(await takeDailySlot())) return json({ error: `Today’s AI checks are used up (${process.env.AI_CHECK_DAILY_LIMIT ?? 10} a day). Try again tomorrow.` }, 429);
  const { ai } = await getSettings();
  const started = await startCheck(id, offer, ai);
  waitUntil(runCheck(id, offer, situation, ai));
  return json(started, 202);
}
