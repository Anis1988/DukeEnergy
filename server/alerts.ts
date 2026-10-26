import { DukeError, meters, today, usage } from './duke.js';
import { db, getSettings } from './store.js';
import { findCharging } from '../src/lib/insights.js';

/**
 * 🔔 The morning check (Vercel cron, once a day): a day well above your usual, the month heading over its goal, or
 * the Duke login lost → one notification on your phone through ntfy (free app; you subscribe to your topic).
 * Each day / month is judged once (`de:al:*`), so a second run never repeats a notification.
 */
const SITE = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (s: string, n: number) => { const d = new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400_000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const longDay = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

export interface Sent { at: string; title: string; text: string }

export async function notify(topic: string, title: string, text: string, tags = 'zap'): Promise<void> {
  const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: { Title: title, Tags: tags, ...(SITE ? { Click: SITE } : {}) },
    body: text,
  });
  if (!r.ok) throw new Error(`ntfy answered ${r.status}.`);
  const list = ((await db()?.get<Sent[]>('de:sent')) ?? []).slice(0, 19);
  await db()?.set('de:sent', [{ at: new Date().toISOString(), title, text }, ...list]);
}

/** Once per key (kept 40 days). */
async function first(key: string): Promise<boolean> {
  const got = await db()?.set(`de:al:${key}`, '1', { nx: true, ex: 40 * 86400 });
  return got !== null;
}

export async function runAlerts(): Promise<{ checked: string[]; sent: string[] }> {
  const s = await getSettings();
  const out = { checked: [] as string[], sent: [] as string[] };
  if (!s.alerts.on || !s.alerts.topic) return out;
  const end = addDays(today(), -1);
  let pts;
  let car = new Map<string, number>();
  try {
    const m = (await meters()).find((x) => x.serviceType === 'ELECTRIC') ?? (await meters())[0];
    if (!m) return out;
    const start = addDays(end, -20);
    // The whole month too, for the goal.
    const from = `${end.slice(0, 8)}01` < start ? `${end.slice(0, 8)}01` : start;
    pts = (await usage(m.serial, 'DAILY', from, end)).points;
    // 🚗 Car charging doesn't make a day "high": it is taken out (found in the hourly use).
    if (s.ev.cars > 0 && s.ev.excludeFromAlerts) {
      try {
        car = findCharging((await usage(m.serial, 'HOURLY', addDays(end, -16), end)).points, s.ev.chargerKw).byDay;
      } catch { /* hourly not available: whole-house numbers are used */ }
    }
  } catch (e) {
    if (e instanceof DukeError && e.relogin) {
      const week = Math.floor(Date.now() / (7 * 86400_000));
      if (await first(`relogin:${week}`)) {
        await notify(s.alerts.topic, 'Watt Watch lost the Duke connection', 'Open the app and tap Connect again to keep your usage coming.', 'warning');
        out.sent.push('relogin');
      }
      return out;
    }
    throw e;
  }
  const byDay = new Map(pts.map((p) => [p.t, p.kwh]));
  // The house alone (minus car charging), for the high-day check; the goal counts everything.
  const house = new Map(pts.map((p) => [p.t, Math.max(0, p.kwh - (car.get(p.t) ?? 0))]));

  // The last 3 days that have a reading and were not judged yet (Duke sometimes fills days in late).
  for (const d of [addDays(end, -2), addDays(end, -1), end]) {
    const kwh = house.get(d);
    if (kwh == null) continue;
    const before = Array.from({ length: 14 }, (_, i) => house.get(addDays(d, -(i + 1)))).filter((v): v is number => v != null);
    if (before.length < 7) continue;
    if (!(await first(`day:${d}`))) continue;
    out.checked.push(d);
    const usual = before.reduce((a, b) => a + b, 0) / before.length;
    const pct = ((kwh - usual) / usual) * 100;
    if (pct >= s.alerts.pct) {
      await notify(s.alerts.topic, `High use: ${kwh.toFixed(1)} kWh`, `${longDay(d)}: ${kwh.toFixed(1)} kWh, ${pct.toFixed(0)}% above your usual ${usual.toFixed(1)} kWh/day (about $${((kwh - usual) * s.price).toFixed(2)} extra)${car.get(d) ? `, not counting ${car.get(d)!.toFixed(1)} kWh of car charging` : ''}.`, 'chart_with_upwards_trend');
      out.sent.push(d);
    }
  }

  // The month heading over the goal (from the 7th, once a month).
  if (s.alerts.goal && s.goal > 0 && Number(end.slice(8)) >= 7) {
    const month = [...byDay.entries()].filter(([d]) => d.startsWith(end.slice(0, 7)));
    const used = month.reduce((a, [, v]) => a + v, 0);
    const daysIn = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0)).getUTCDate();
    const projected = month.length ? (used / month.length) * daysIn : 0;
    if (projected > s.goal && (await first(`goal:${end.slice(0, 7)}`))) {
      await notify(s.alerts.topic, 'Heading over your monthly goal', `So far ${used.toFixed(0)} kWh; at this pace about ${projected.toFixed(0)} kWh this month (goal ${s.goal}).`, 'warning');
      out.sent.push('goal');
    }
  }
  return out;
}
