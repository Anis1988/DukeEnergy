import { Redis } from '@upstash/redis';
import { DEFAULT_SETTINGS, type Alerts, type Ev, type Plan, type Settings } from '../src/lib/types.js';
import { LocalStore } from './localStore.js';

/**
 * Upstash Redis (Vercel → Storage → Upstash for Redis, free): the Duke login (tokens), your settings and a cache of
 * Duke's answers (past days never change, so they are asked only once).
 */
let redis: Redis | null | undefined;
export function db(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  // npm run dev without Upstash keys: a small local file instead (set by vite.config.ts, never on Vercel).
  redis = url && token ? new Redis({ url, token }) : process.env.DE_LOCAL_STORE === '1' ? (new LocalStore() as unknown as Redis) : null;
  return redis;
}
export const storeReady = () => !!db();

export async function getSettings(): Promise<Settings> {
  const saved = (await db()?.get<Partial<Settings>>('de:settings')) ?? {};
  return { ...DEFAULT_SETTINGS, ...saved, alerts: { ...DEFAULT_SETTINGS.alerts, ...saved.alerts }, plan: { ...DEFAULT_SETTINGS.plan, ...saved.plan }, ev: { ...DEFAULT_SETTINGS.ev, ...saved.ev } };
}

const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined);
const hour = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : undefined);

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const now = await getSettings();
  const a: Partial<Alerts> = s.alerts ?? {};
  const p: Partial<Plan> = s.plan ?? {};
  const e: Partial<Ev> = s.ev ?? {};
  const next: Settings = {
    price: num(s.price, 5) ?? now.price,
    fixed: num(s.fixed, 500) ?? now.fixed,
    goal: num(s.goal, 100000) ?? now.goal,
    alerts: {
      on: typeof a.on === 'boolean' ? a.on : now.alerts.on,
      pct: num(a.pct, 1000) ?? now.alerts.pct,
      // ntfy topic names: letters, digits, - and _ (a long random one is made by the app).
      topic: typeof a.topic === 'string' && /^[A-Za-z0-9_-]{0,64}$/.test(a.topic) ? a.topic : now.alerts.topic,
      goal: typeof a.goal === 'boolean' ? a.goal : now.alerts.goal,
    },
    plan: {
      name: typeof p.name === 'string' ? p.name.slice(0, 60) : now.plan.name,
      peakStart: hour(p.peakStart) ?? now.plan.peakStart,
      peakEnd: hour(p.peakEnd) ?? now.plan.peakEnd,
      weekdaysOnly: typeof p.weekdaysOnly === 'boolean' ? p.weekdaysOnly : now.plan.weekdaysOnly,
      peak: num(p.peak, 5) ?? now.plan.peak,
      offPeak: num(p.offPeak, 5) ?? now.plan.offPeak,
      nightStart: hour(p.nightStart) ?? now.plan.nightStart,
      nightEnd: hour(p.nightEnd) ?? now.plan.nightEnd,
      night: num(p.night, 5) ?? now.plan.night,
      fixed: num(p.fixed, 500) ?? now.plan.fixed,
    },
    ev: {
      cars: Number.isInteger(e.cars) && (e.cars as number) >= 0 && (e.cars as number) <= 6 ? (e.cars as number) : now.ev.cars,
      chargerKw: num(e.chargerKw, 50) || now.ev.chargerKw,
      milesPerKwh: num(e.milesPerKwh, 10) || now.ev.milesPerKwh,
      excludeFromAlerts: typeof e.excludeFromAlerts === 'boolean' ? e.excludeFromAlerts : now.ev.excludeFromAlerts,
    },
  };
  await db()?.set('de:settings', next);
  return next;
}
