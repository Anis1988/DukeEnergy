/**
 * Duke Energy's own phone-app login (Auth0), the same one the open-source aiodukeenergy library uses
 * (github.com/hunterjm/aiodukeenergy). Used by the screens (to open the login page) and the server (to finish it).
 */
export const AUTH0 = 'https://login.duke-energy.com';
export const CLIENT_ID = 'PitoKqxMh8thrFF8rRlYGrAs3LbSD2dj';
export const REDIRECT_URI = 'https://login.duke-energy.com/ios/com.duke-energy.app/callback';
/** After logging in, Duke sends the browser to this address with ?code=… in it. */
export const CALLBACK_PREFIX = 'https://login.duke-energy.com/ios/';
export const AUTH0_CLIENT = btoa(JSON.stringify({ env: { iOS: '27.0', swift: '6.x' }, version: '2.19.0', name: 'Auth0.swift' }));

/** The login code from the address Duke lands on (or the code itself, pasted). */
export function codeFrom(text: string): string | null {
  const t = text.trim();
  const m = t.match(/[?&]code=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}
