import { guard, json } from '../server/guard.js';
import { DukeError, meters, today, usage } from '../server/duke.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET ?meters=1[&fresh=1]: your meters. GET ?serial&interval=HOURLY|DAILY&start&end: usage (dates "YYYY-MM-DD").
 * Daily up to 400 days, hourly up to 92 days per request.
 */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'usage', 60);
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  try {
    if (q.get('meters')) return json({ meters: await meters(q.get('fresh') === '1'), today: today() });
    const interval = q.get('interval') === 'HOURLY' ? 'HOURLY' : 'DAILY';
    const start = q.get('start') ?? '';
    const end = q.get('end') ?? '';
    if (!DAY.test(start) || !DAY.test(end) || start > end) return json({ error: 'Pick a start and end date.' }, 400);
    const span = (Date.parse(end) - Date.parse(start)) / 86400_000;
    if (span > (interval === 'HOURLY' ? 92 : 400)) return json({ error: 'That range is too long.' }, 400);
    return json(await usage(q.get('serial') ?? '', interval, start, end));
  } catch (e) {
    const err = e instanceof DukeError ? e : new DukeError(e instanceof Error ? e.message : String(e));
    return json({ error: err.message, relogin: err.relogin }, err.status);
  }
}
