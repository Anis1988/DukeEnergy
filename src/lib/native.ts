import { Capacitor, registerPlugin } from '@capacitor/core';

/** True inside the Android app (branch "android"), false on the website. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * The app has no server of its own: it talks to the website's server functions (Vercel). The address is built in
 * (VITE_API_BASE) and can be changed in Settings. On the website the paths stay relative ("/api/…").
 */
const SERVER_KEY = 'ww.server';
export const DEFAULT_SERVER = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'https://duke-energy-anis.vercel.app';
export const getServer = (): string => {
  try { return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER; } catch { return DEFAULT_SERVER; }
};
export function setServer(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  try {
    if (!clean || clean === DEFAULT_SERVER) localStorage.removeItem(SERVER_KEY);
    else localStorage.setItem(SERVER_KEY, /^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
  } catch { /* private mode */ }
}
export const apiUrl = (path: string): string => (isNative() && path.startsWith('/') ? getServer() + path : path);

/**
 * Android app only: Duke's login page opens inside the app, and the app catches the address Duke lands on
 * (DukeLoginPlugin.java), so there is nothing to copy. Resolves with that address.
 */
const DukeLogin = registerPlugin<{ open(o: { url: string; catchPrefix: string }): Promise<{ url: string }> }>('DukeLogin');
export const nativeLogin = (url: string, catchPrefix: string) => DukeLogin.open({ url, catchPrefix }).then((r) => r.url);
