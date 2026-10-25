import { AUTH0, AUTH0_CLIENT, CLIENT_ID, REDIRECT_URI } from '../src/lib/dukeConfig.js';
import type { Meter, Point, Usage } from '../src/lib/types.js';
import { db } from './store.js';

/**
 * Duke Energy's phone-app servers, the way the open-source aiodukeenergy library talks to them
 * (github.com/hunterjm/aiodukeenergy). Not an official API: if Duke changes its app, this file is what to update.
 *
 * Login: Auth0 (login.duke-energy.com) gives an id token → Duke's /login/auth-token turns it into an API token
 * (30 min). The Auth0 refresh token keeps you logged in, so you log in only once.
 */
const API = 'https://api-v2.cma.duke-energy.app';
const DE_CLIENT_ID = 'HO2JKfv2dVuXhLHhleDr1s6fgVlPduGxVBO6GaS3dDjE7Kp8';
const DE_CLIENT_SECRET = 'g4236o8ROFMD4JuVI4tsgLY7NiIEGXQgzzCnH9RiRrvFC6IN4KFg3A6dBmGIIuW6';
const UA = 'Duke%20Energy/1374 CFNetwork/3896.100.1.2.1 Darwin/27.0.0';
/** Duke's whole service area is on Eastern time (the API wants local dates). */
const TZ = 'America/New_York';

const LOGIN = 'de:login';
const METERS = 'de:meters';
const LOCK = 'de:lock';

export class DukeError extends Error {
  constructor(message: string, readonly status = 502, readonly relogin = false) {
    super(message);
  }
}

interface Login {
  access: string;
  refresh?: string;
  id: string;
  email?: string;
  userId?: string;
  /** Duke API token and when it runs out (ms). */
  de?: string;
  deExp?: number;
  since: string;
}

function claims(jwt: string | undefined): Record<string, any> {
  try {
    const part = (jwt ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}
const expired = (jwt: string | undefined) => {
  const exp = Number(claims(jwt).exp);
  return !exp || exp * 1000 < Date.now() + 60_000;
};

async function auth0Token(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; id_token: string }> {
  const r = await fetch(`${AUTH0}/oauth/token`, {
    method: 'POST',
    headers: { 'accept-language': 'en_US', 'auth0-client': AUTH0_CLIENT, 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA },
    body: JSON.stringify({ client_id: CLIENT_ID, ...body }),
  });
  const text = await r.text();
  if (!r.ok) {
    let why = '';
    try { why = JSON.parse(text).error_description ?? ''; } catch { /* not JSON */ }
    throw new DukeError(`Duke's login said no (${r.status}${why ? `: ${why}` : ''}).`, r.status >= 500 ? 502 : 401, r.status < 500);
  }
  return JSON.parse(text);
}

export const loadLogin = async () => (await db()?.get<Login>(LOGIN)) ?? null;
const saveLogin = async (l: Login) => void (await db()?.set(LOGIN, l));
export async function disconnect(): Promise<void> {
  await db()?.del(LOGIN);
  await db()?.del(METERS);
}

/** Step 2 of connecting: the code from the address Duke landed on (+ the secret made on the device in step 1). */
export async function connect(code: string, verifier: string): Promise<Login> {
  const t = await auth0Token({ grant_type: 'authorization_code', code_verifier: verifier, code, redirect_uri: REDIRECT_URI });
  const c = claims(t.id_token);
  const login: Login = { access: t.access_token, refresh: t.refresh_token, id: t.id_token, email: c.email, userId: c.internal_identifier, since: new Date().toISOString() };
  await dukeToken(login);
  await db()?.del(METERS);
  return login;
}

async function dukeToken(l: Login): Promise<string> {
  const r = await fetch(`${API}/login/auth-token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${DE_CLIENT_ID}:${DE_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      platform: 'iOS',
      'User-Agent': UA,
    },
    body: JSON.stringify({ idToken: l.id }),
  });
  if (!r.ok) throw new DukeError(`Duke's server refused the login (${r.status}). Connect again in Settings.`, r.status >= 500 ? 502 : 401, r.status < 500);
  const j = await r.json();
  l.de = j.access_token;
  l.deExp = Date.now() + (Number(j.expires_in) || 1800) * 1000;
  if (j.internalUserID) l.userId = j.internalUserID;
  await saveLogin(l);
  return l.de!;
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * A valid Duke API token. Several requests may arrive at once: one refreshes (a short lock in Redis), the others wait
 * and use its result (Auth0 replaces the refresh token each time, so two refreshes at once would log you out).
 */
async function apiToken(force = false): Promise<{ token: string; login: Login }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const l = await loadLogin();
    if (!l) throw new DukeError('Not connected to Duke Energy yet.', 409, true);
    if (!force && l.de && (l.deExp ?? 0) > Date.now() + 60_000) return { token: l.de, login: l };
    const got = await db()?.set(LOCK, '1', { nx: true, ex: 25 });
    if (got === null) {
      await sleep(1000);
      force = false;
      continue;
    }
    try {
      if (expired(l.access) || expired(l.id)) {
        if (!l.refresh) throw new DukeError('Your Duke login ran out. Connect again in Settings.', 401, true);
        const t = await auth0Token({ grant_type: 'refresh_token', refresh_token: l.refresh });
        l.access = t.access_token;
        l.id = t.id_token;
        l.refresh = t.refresh_token ?? l.refresh;
      }
      return { token: await dukeToken(l), login: l };
    } finally {
      await db()?.del(LOCK);
    }
  }
  throw new DukeError('Duke is busy, try again in a moment.', 503);
}

async function call<T>(method: 'GET' | 'POST', path: string, data: Record<string, string>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { token } = await apiToken(attempt > 0);
    const url = new URL(API + path);
    if (method === 'GET') for (const [k, v] of Object.entries(data)) url.searchParams.set(k, v);
    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', platform: 'iOS', 'User-Agent': UA },
      body: method === 'POST' ? JSON.stringify(data) : undefined,
    });
    if (r.status === 401 && attempt === 0) continue; // the API token was refused: get a fresh one once
    if (!r.ok) throw new DukeError(`Duke's server answered ${r.status} (${path}).`, r.status === 401 ? 401 : 502, r.status === 401);
    return (await r.json()) as T;
  }
}

/* ---------- Accounts and meters ---------- */

type RawMeter = Record<string, any> & { account: Record<string, any> };

async function rawMeters(fresh = false): Promise<RawMeter[]> {
  if (!fresh) {
    const cached = await db()?.get<RawMeter[]>(METERS);
    if (cached?.length) return cached;
  }
  const { login } = await apiToken();
  const list = await call<{ accounts: Record<string, any>[]; relatedBpNumber: string }>('GET', '/account-list', {
    email: login.email ?? '',
    internalUserID: login.userId ?? '',
    fetchFreshData: 'true',
  });
  const out: RawMeter[] = [];
  for (const acc of list.accounts ?? []) {
    const details = await call<{ meterInfo?: Record<string, any>[] }>('GET', '/account-details-v2', {
      email: login.email ?? '',
      srcSysCd: acc.srcSysCd,
      srcAcctId: acc.srcAcctId,
      primaryBpNumber: acc.primaryBpNumber,
      relatedBpNumber: list.relatedBpNumber,
    });
    for (const m of details.meterInfo ?? []) out.push({ ...m, account: acc });
  }
  await db()?.set(METERS, out, { ex: 12 * 3600 });
  return out;
}

export async function meters(fresh = false): Promise<Meter[]> {
  return (await rawMeters(fresh)).map((m) => {
    const a = m.account.serviceAddressParsed ?? {};
    return {
      serial: String(m.serialNum),
      serviceType: String(m.serviceType ?? 'ELECTRIC'),
      account: String(m.account.accountNumber ?? '').slice(-4),
      address: [a.addressLine1, a.city].filter(Boolean).join(', '),
    };
  });
}

/* ---------- Dates (local, Eastern time) ---------- */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** "YYYY-MM-DD" ↔ a UTC Date used as a plain calendar date. */
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s: string, n: number) => ymd(new Date(day(s).getTime() + n * 86400_000));
const mdY = (s: string) => { const [y, m, d] = s.split('-'); return `${m}/${d}/${y}`; };
const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86400_000);

function easternNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  const offset = String(p.timeZoneName).replace('GMT', '') || '+00:00';
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}.${pad(new Date().getMilliseconds(), 3)}`, offset };
}
export const today = () => easternNow().date;

/**
 * Duke's "date" field: hourly = the start day at the current time; daily = the start month at today's day, minus
 * one day (copied from aiodukeenergy, which copied the phone app).
 */
function dateParam(interval: 'HOURLY' | 'DAILY', start: string): string {
  const now = easternNow();
  if (interval === 'HOURLY') return `${start}T${now.time}${now.offset}`;
  const [y, m] = start.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = addDays(`${y}-${pad(m)}-${pad(Math.min(Number(now.date.slice(8)), last))}`, -1);
  return `${d}T${now.time}${now.offset}`;
}

const hourLabel = (h: number) => `${pad(h % 12 === 0 ? 12 : h % 12)} ${h < 12 ? 'AM' : 'PM'}`;
const dayLabel = (s: string) => { const [y, m, d] = s.split('-'); return `${Number(m)}/${d}/${y}`; };

/**
 * Duke answers a plain list ("01 PM" or "10/24/2026" + usage), with gaps for missing readings and a repeated hour
 * when the clocks go back. Same walk as aiodukeenergy: each expected hour/day is matched to the next entry.
 */
export function parse(arr: { date: string; usage: string | number; temperatureAvg?: number | string | null }[], interval: 'HOURLY' | 'DAILY', start: string, end: string): Usage {
  const days = daysBetween(start, end) + 1;
  const expected = interval === 'HOURLY' ? days * 24 : days;
  const total = arr.length + expected; // the walk stops at the end date
  const points: Point[] = [];
  let missing = 0;
  let offset = 0;
  let dup = 0;
  for (let i = 0; i < total; i++) {
    const k = interval === 'HOURLY' ? i - dup : i;
    const d = interval === 'HOURLY' ? addDays(start, Math.floor(k / 24)) : addDays(start, k);
    if (d > end) break;
    const hour = k % 24;
    const n = i - offset;
    if (n >= arr.length) { missing++; continue; }
    if (n > 0 && arr[n].date === arr[n - 1].date) { dup++; continue; }
    if (arr[n].date !== (interval === 'HOURLY' ? hourLabel(hour) : dayLabel(d))) { missing++; offset++; continue; }
    const kwh = Number(arr[n].usage);
    if (!(kwh > 0)) { missing++; continue; }
    const temp = arr[n].temperatureAvg == null || arr[n].temperatureAvg === '' ? null : Number(arr[n].temperatureAvg);
    points.push({ t: interval === 'HOURLY' ? `${d}T${pad(hour)}` : d, kwh: Math.round(kwh * 1000) / 1000, temp: Number.isFinite(temp) ? temp : null });
  }
  return { points, missing };
}

async function usageChunk(m: RawMeter, interval: 'HOURLY' | 'DAILY', start: string, end: string): Promise<Usage> {
  const key = `de:u:${m.serialNum}:${interval}:${start}:${end}`;
  const cached = await db()?.get<Usage>(key);
  if (cached) return { ...cached, cached: true };
  const iso = (s: string | undefined) => (s ? mdY(String(s).slice(0, 10)) : '');
  const res = await call<{ usageArray?: any[] }>('POST', '/account/usage/graph', {
    srcSysCd: m.account.srcSysCd,
    srcAcctId: m.account.srcAcctId,
    srcAcctId2: m.account.srcAcctId2 || '',
    meterSerialNumber: m.serialNum,
    serviceType: m.serviceType,
    intervalFrequency: interval,
    periodType: interval === 'HOURLY' ? 'DAY' : 'BILLINGCYCLE',
    date: dateParam(interval, start),
    agrmtStartDt: iso(m.agreementActiveDate),
    agrmtEndDt: iso(m.agreementEndDate),
    meterCertDt: iso(m.meterCertificationDate),
    startDate: mdY(start),
    endDate: mdY(end),
    zipCode: m.account.serviceAddressParsed?.zipCode ?? '',
  });
  const out = parse(res.usageArray ?? [], interval, start, end);
  // Days more than 3 days old are final: kept 60 days. Recent ones may still fill in: asked again after 30 minutes.
  const final = daysBetween(end, today()) > 3;
  await db()?.set(key, out, { ex: final ? 60 * 86400 : 1800 });
  return out;
}

/** Usage from `start` to `end` (inclusive, "YYYY-MM-DD"): asked month by month (daily) or week by week (hourly). */
export async function usage(serial: string, interval: 'HOURLY' | 'DAILY', start: string, end: string): Promise<Usage> {
  const list = await rawMeters();
  const m = list.find((x) => String(x.serialNum) === serial) ?? list.find((x) => x.serviceType === 'ELECTRIC') ?? list[0];
  if (!m) throw new DukeError('No meter was found on your Duke account.', 404);
  const last = today();
  if (end > last) end = last;
  const chunks: [string, string][] = [];
  for (let s = start; s <= end; ) {
    const e = interval === 'DAILY'
      ? (() => { const [y, mo] = s.split('-').map(Number); return ymd(new Date(Date.UTC(y, mo, 0))); })()
      : addDays(s, 6);
    chunks.push([s, e < end ? e : end]);
    s = addDays(e, 1);
  }
  const out: Usage = { points: [], missing: 0, cached: true };
  for (const [s, e] of chunks) {
    const u = await usageChunk(m, interval, s, e);
    out.points.push(...u.points);
    out.missing += u.missing;
    out.cached &&= !!u.cached;
  }
  return out;
}
