import { AUTH0, AUTH0_CLIENT, CLIENT_ID, REDIRECT_URI } from './dukeConfig';

const KEY = 'ww.pkce';
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/**
 * Step 1 of connecting: a one-time secret is made on this device (kept until step 2) and Duke's login page address
 * is built with its fingerprint (PKCE), like Duke's own app does.
 */
export async function loginUrl(): Promise<string> {
  const verifier = b64url(random(32));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  try { localStorage.setItem(KEY, verifier); } catch { /* private mode */ }
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'openid profile email offline_access',
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    response_mode: 'query',
    state: b64url(random(32)),
    nonce: b64url(random(32)),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    auth0Client: AUTH0_CLIENT,
  });
  return `${AUTH0}/authorize?${p}`;
}
export const savedVerifier = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const clearVerifier = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
