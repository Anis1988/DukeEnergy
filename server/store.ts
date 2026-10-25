import { Redis } from '@upstash/redis';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/types.js';
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
  return { ...DEFAULT_SETTINGS, ...((await db()?.get<Partial<Settings>>('de:settings')) ?? {}) };
}
export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined);
  const now = await getSettings();
  const next: Settings = {
    price: num(s.price, 5) ?? now.price,
    fixed: num(s.fixed, 500) ?? now.fixed,
    goal: num(s.goal, 100000) ?? now.goal,
  };
  await db()?.set('de:settings', next);
  return next;
}
