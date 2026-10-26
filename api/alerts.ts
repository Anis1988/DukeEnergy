import { guard, json } from '../server/guard.js';
import { notify, runAlerts, type Sent } from '../server/alerts.js';
import { db, getSettings } from '../server/store.js';

/**
 * GET from Vercel's cron (vercel.json, every morning): the alert check. GET from the app: the last notifications.
 * POST {test: true} from the app: a test notification.
 */
function fromCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`;
  return (req.headers.get('user-agent') ?? '').startsWith('vercel-cron');
}

export async function GET(req: Request): Promise<Response> {
  if (fromCron(req)) {
    try {
      return json(await runAlerts());
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  const blocked = guard(req, 'alerts', 30);
  if (blocked) return blocked;
  return json({ sent: (await db()?.get<Sent[]>('de:sent')) ?? [] });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'alerts-test', 5);
  if (blocked) return blocked;
  const b = (await req.json().catch(() => ({}))) as { test?: boolean; run?: boolean };
  const s = await getSettings();
  if (!s.alerts.topic) return json({ error: 'Save a topic first.' }, 400);
  try {
    if (b.run) return json(await runAlerts());
    await notify(s.alerts.topic, 'Watt Watch test', 'Notifications work. You’ll hear from me when a day is unusually high.', 'white_check_mark');
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}
