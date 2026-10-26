import { guard, json } from '../server/guard.js';
import { getOffers } from '../server/offers.js';

/** GET [?fresh=1]: Duke's Price to Compare + every supplier offer for Duke Energy Ohio homes (Energy Choice Ohio). */
export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req, 'offers', 20);
  if (blocked) return blocked;
  try {
    return json(await getOffers(new URL(req.url).searchParams.get('fresh') === '1'));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}
