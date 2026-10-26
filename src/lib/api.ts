import { apiUrl, getServer, isNative } from './native';
import type { Meter, Settings, Status, Usage } from './types';

const CODE_KEY = 'ww.accessCode';
export const getCode = () => { try { return localStorage.getItem(CODE_KEY) ?? ''; } catch { return ''; } };
export const setCode = (c: string) => { try { localStorage.setItem(CODE_KEY, c.trim()); } catch { /* private mode */ } };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly relogin = false) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...init, headers: { 'Content-Type': 'application/json', 'X-Access-Token': getCode(), ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(isNative() ? `Could not reach ${getServer()}. Check your internet, and the site address in Settings.` : 'Could not reach the server. Check your internet connection.', 0);
  }
  const raw = await res.text().catch(() => '');
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok || data === null) {
    if (res.status === 401 && !data?.relogin) window.dispatchEvent(new Event('ww-unauthorized'));
    throw new ApiError(data?.error ?? `The server didn't answer (HTTP ${res.status}).`, res.status, !!data?.relogin);
  }
  return data as T;
}

export const getStatus = () => call<Status>('/api/connect');
export const finishLogin = (url: string, verifier: string) => call<{ connected: boolean; email?: string }>('/api/connect', { method: 'POST', body: JSON.stringify({ url, verifier }) });
export const disconnect = () => call<{ connected: boolean }>('/api/connect', { method: 'DELETE' });
export const saveSettings = (settings: Partial<Settings>) => call<{ settings: Settings }>('/api/connect', { method: 'PUT', body: JSON.stringify({ settings }) });
export const getSent = () => call<{ sent: { at: string; title: string; text: string }[] }>('/api/alerts');
export const testAlert = () => call<{ ok: boolean }>('/api/alerts', { method: 'POST', body: JSON.stringify({ test: true }) });
export const getMeters = (fresh = false) => call<{ meters: Meter[]; today: string }>(`/api/usage?meters=1${fresh ? '&fresh=1' : ''}`);
export const getUsage = (serial: string, interval: 'HOURLY' | 'DAILY', start: string, end: string) =>
  call<Usage>(`/api/usage?${new URLSearchParams({ serial, interval, start, end })}`);
