import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Local runs only (npm run dev without Upstash keys): the few Redis commands the app uses, kept in
 * .local/store.json, so the AI limit and ⭐ Saved work on your computer. Never used on Vercel.
 */
type Entry = { v: unknown; exp?: number };
const FILE = '.local/store.json';

export class LocalStore {
  private data: Record<string, Entry> = {};
  constructor() {
    try { this.data = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* first run */ }
  }
  private save() {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(this.data));
  }
  private live(key: string): Entry | undefined {
    const e = this.data[key];
    if (e?.exp && e.exp < Date.now()) { delete this.data[key]; return undefined; }
    return e;
  }
  private hash(key: string): Record<string, unknown> {
    return (this.live(key)?.v as Record<string, unknown> | undefined) ?? {};
  }
  async get<T>(key: string): Promise<T | null> { return (this.live(key)?.v as T) ?? null; }
  async set(key: string, v: unknown, opts?: { ex?: number }) { this.data[key] = { v, exp: opts?.ex ? Date.now() + opts.ex * 1000 : undefined }; this.save(); return 'OK'; }
  async del(key: string) { delete this.data[key]; this.save(); return 1; }
  async incr(key: string) { const n = Number(this.live(key)?.v ?? 0) + 1; this.data[key] = { ...this.data[key], v: n }; this.save(); return n; }
  async decr(key: string) { const n = Number(this.live(key)?.v ?? 0) - 1; this.data[key] = { ...this.data[key], v: n }; this.save(); return n; }
  async expire(key: string, s: number) { if (this.data[key]) { this.data[key].exp = Date.now() + s * 1000; this.save(); } return 1; }
  async mget<T>(...keys: string[]): Promise<T> { return keys.map((k) => this.live(k)?.v ?? null) as T; }
  async hgetall<T>(key: string): Promise<T | null> { return this.hash(key) as T; }
  async hget<T>(key: string, f: string): Promise<T | null> { return (this.hash(key)[f] as T) ?? null; }
  async hexists(key: string, f: string) { return f in this.hash(key) ? 1 : 0; }
  async hlen(key: string) { return Object.keys(this.hash(key)).length; }
  async hset(key: string, fields: Record<string, unknown>) { this.data[key] = { v: { ...this.hash(key), ...fields } }; this.save(); return Object.keys(fields).length; }
  async hdel(key: string, f: string) { const h = this.hash(key); delete h[f]; this.data[key] = { v: h }; this.save(); return 1; }
}
