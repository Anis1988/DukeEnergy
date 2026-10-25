import { guard, json } from '../server/guard.js';
import { connect, disconnect, DukeError, loadLogin } from '../server/duke.js';
import { getSettings, saveSettings, storeReady } from '../server/store.js';
import { codeFrom } from '../src/lib/dukeConfig.js';
import type { Status } from '../src/lib/types.js';

/**
 * GET: connected or not + your settings. POST {code|url, verifier}: finish connecting to Duke.
 * PUT {settings}: save settings. DELETE: disconnect (the Duke login is removed from the server).
 */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'connect', 60);
  if (blocked) return blocked;
  const login = await loadLogin().catch(() => null);
  const body: Status = { connected: !!login, email: login?.email, since: login?.since, storage: storeReady(), settings: await getSettings() };
  return json(body);
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req, 'connect-post', 10);
  if (blocked) return blocked;
  if (!storeReady()) return json({ error: 'Add Upstash Redis to the Vercel project first (Storage → Upstash for Redis), then redeploy.' }, 503);
  const b = (await req.json().catch(() => ({}))) as { code?: string; url?: string; verifier?: string };
  const code = codeFrom(b.code ?? b.url ?? '');
  if (!code) return json({ error: 'No login code in that address. Copy the whole address of the page Duke showed after you logged in.' }, 400);
  if (!b.verifier || !/^[A-Za-z0-9_-]{43,128}$/.test(b.verifier)) return json({ error: 'Start again with "Open Duke login" on this device.' }, 400);
  try {
    const login = await connect(code, b.verifier);
    return json({ connected: true, email: login.email });
  } catch (e) {
    const err = e instanceof DukeError ? e : new DukeError(e instanceof Error ? e.message : String(e));
    const hint = err.status === 401 ? ' The code works once and only for a few minutes: tap "Open Duke login" and try again.' : '';
    return json({ error: err.message + hint }, err.status === 401 ? 400 : err.status);
  }
}

export async function PUT(req: Request): Promise<Response> {
  const blocked = guard(req, 'settings', 20);
  if (blocked) return blocked;
  const b = (await req.json().catch(() => ({}))) as { settings?: Record<string, unknown> };
  return json({ settings: await saveSettings(b.settings ?? {}) });
}

export async function DELETE(req: Request): Promise<Response> {
  const blocked = guard(req, 'disconnect', 10);
  if (blocked) return blocked;
  await disconnect();
  return json({ connected: false });
}
