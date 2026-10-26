import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import type { AiCheck, Offer, Situation, Verdict } from '../src/lib/types.js';
import { db, getSettings } from './store.js';
import { notify } from './alerts.js';
import { aiModel, EFFORT, type Thoroughness } from '../src/lib/aiModels.js';

/**
 * 🤖 Deep check of one supplier offer by the Anthropic model picked in Settings (Claude Fable 5.1 by default): it opens
 * the offer's live sign-up page and contract with web fetch, searches for complaints and fine print with web search,
 * and hands back a verdict through the `submit_verdict` tool. Runs in the background; results are kept (the newest per
 * offer, up to 30 offers) and listed in the app's "AI verdicts", whatever page is open.
 */
const INDEX = 'de:aichecks'; // offerId -> latest check id
const MAX_KEPT = 30;
const DAILY_LIMIT = Number(process.env.AI_CHECK_DAILY_LIMIT ?? 10);

const sha = (t: string) => createHash('sha1').update(t).digest('hex').slice(0, 16);
export const offerId = (o: Offer) => createHash('sha1').update([o.supplier, o.rate, o.type, o.term, o.etf, o.monthlyFee, o.signUp ?? o.site ?? ''].join('|')).digest('hex').slice(0, 16);
const key = (id: string) => `de:aic:${id}`;

/** Cleans what the app sent (numbers in range, short strings). */
export function cleanSituation(x: unknown): Situation {
  const v = (x ?? {}) as Record<string, any>;
  const num = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max ? n : 0);
  const str = (t: unknown, max: number) => (typeof t === 'string' ? t.slice(0, max) : '');
  const u = (v.supply ?? {}) as Record<string, unknown>;
  return {
    yearKwh: Math.round(num(v.yearKwh, 200000)),
    months: (Array.isArray(v.months) ? v.months : []).slice(0, 13).filter((m: any) => /^\d{4}-\d{2}$/.test(m?.m)).map((m: any) => ({ m: m.m, kwh: Math.round(num(m.kwh, 50000)) })),
    ptc: typeof v.ptc === 'number' ? num(v.ptc, 2) : null,
    ptcPeriod: str(v.ptcPeriod, 80) || undefined,
    price: num(v.price, 5),
    fixed: num(v.fixed, 500),
    supply: { name: str(u.name, 80), rate: num(u.rate, 2), monthlyFee: num(u.monthlyFee, 100), cancelFee: num(u.cancelFee, 2000), endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(u.endDate)) ? String(u.endDate) : '' },
    cars: Math.round(num(v.cars, 6)),
    chargerKw: num(v.chargerKw, 50),
    carKwhYear: Math.round(num(v.carKwhYear, 100000)),
    carNightShare: Math.round(num(v.carNightShare, 1) * 100) / 100,
  };
}

/** One answer per offer and situation: the same question is never paid for twice; a changed situation asks again. */
export function checkId(o: Offer, s: Situation): string {
  const rough = { ...s, yearKwh: Math.round(s.yearKwh / 250) * 250, carKwhYear: Math.round(s.carKwhYear / 250) * 250, carNightShare: Math.round(s.carNightShare * 10) / 10, months: s.months.map((m) => ({ m: m.m, kwh: Math.round(m.kwh / 50) * 50 })) };
  return sha(offerId(o) + JSON.stringify(rough));
}

export async function getCheck(id: string): Promise<AiCheck | null> {
  return (await db()?.get<AiCheck>(key(id))) ?? null;
}

/** Counts today's checks (Eastern date); false when the daily limit is reached. */
export async function takeDailySlot(): Promise<boolean> {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const k = `de:aiday:${day}`;
  const n = (await db()?.incr(k)) ?? 1;
  await db()?.expire(k, 2 * 86400);
  return n <= DAILY_LIMIT;
}

export interface AiChoice { model: string; thoroughness: Thoroughness }

export async function startCheck(id: string, o: Offer, ai: AiChoice): Promise<AiCheck> {
  const c: AiCheck = { id, offerId: offerId(o), supplier: o.supplier, rate: o.rate, term: o.term, type: o.type, status: 'running', startedAt: new Date().toISOString(), model: ai.model, thoroughness: ai.thoroughness };
  await db()?.set(key(id), c);
  await db()?.hset(INDEX, { [c.offerId!]: id });
  return c;
}

/** Every kept check, newest first (the app's "AI verdicts"); only the newest 30 offers are kept. */
export async function listChecks(): Promise<AiCheck[]> {
  const r = db();
  if (!r) return [];
  const idx = ((await r.hgetall<Record<string, string>>(INDEX)) ?? {}) as Record<string, string>;
  const out: AiCheck[] = [];
  for (const [oid, id] of Object.entries(idx)) {
    const c = await getCheck(id);
    if (c) out.push(c);
    else await r.hdel(INDEX, oid);
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const old of out.slice(MAX_KEPT)) {
    await r.hdel(INDEX, old.offerId ?? '');
    await r.del(key(old.id));
  }
  return out.slice(0, MAX_KEPT);
}

/** Saves the end of a check (keeps who/what it was about from the start). */
async function finish(id: string, patch: Partial<AiCheck>): Promise<AiCheck> {
  const start = (await getCheck(id)) ?? ({ id, startedAt: new Date().toISOString() } as AiCheck);
  const done: AiCheck = { ...start, ...patch, finishedAt: new Date().toISOString() };
  await db()?.set(key(id), done);
  return done;
}

const verdictTool: Anthropic.Beta.BetaTool = {
  name: 'submit_verdict',
  description: 'Submit the final verdict on the offer. Call this exactly once, at the end, after reading the live pages.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'headline', 'summary', 'confirmed', 'gotchas', 'positives', 'yearly_cost', 'for_you', 'recommendation', 'sources'],
    properties: {
      verdict: { type: 'string', enum: ['good', 'caution', 'avoid'], description: 'good = no meaningful catch; caution = real catches the customer must manage; avoid = misleading or likely to cost more than Duke’s standard price.' },
      headline: { type: 'string', description: 'One short sentence, plain words.' },
      summary: { type: 'string', description: '2–4 plain sentences for a non-expert.' },
      confirmed: {
        type: 'object',
        additionalProperties: false,
        required: ['rate', 'term', 'cancel_fee', 'monthly_fee', 'after_term', 'other_fees'],
        properties: {
          rate: { type: 'string', description: 'Price per kWh as found on the live pages, and whether it matches the state list.' },
          term: { type: 'string' },
          cancel_fee: { type: 'string' },
          monthly_fee: { type: 'string' },
          after_term: { type: 'string', description: 'What happens when the term ends: auto-renewal, new price, notice.' },
          other_fees: { type: 'string', description: 'Any other charges, deposits, credit checks, minimum-use charges; "none found" if none.' },
        },
      },
      gotchas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['severity', 'issue', 'detail', 'source'],
          properties: {
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            issue: { type: 'string', description: 'A few words.' },
            detail: { type: 'string', description: 'What it means for the customer, plain words, with the exact wording or number when available.' },
            source: { type: 'string', description: 'URL where this was found, or "state list".' },
          },
        },
      },
      positives: { type: 'array', items: { type: 'string' } },
      yearly_cost: { type: 'string', description: 'Electricity (supply) cost for the customer’s yearly kWh with this offer, all its fees included, vs what they pay now and vs Duke’s standard price.' },
      for_you: { type: 'string', description: 'How this offer fits THIS household in 2–5 plain sentences: their seasons, their electric cars and night charging (and Duke’s Rate TD-CPP), their current supplier contract and its cancel fee or end date, and upcoming changes to Duke’s Price to Compare.' },
      recommendation: { type: 'string', description: 'What the customer should do, in 1–3 plain sentences (e.g. sign up and set a reminder for the end date).' },
      sources: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['title', 'url'], properties: { title: { type: 'string' }, url: { type: 'string' } } },
      },
    },
  },
};

const SYSTEM = `You check retail electricity supply offers for a homeowner in Duke Energy Ohio territory (Ohio's Energy Choice market) and find any catch before they sign up.

Duke Energy Ohio keeps delivering the power and billing; the supplier only sells the generation part. Compare against Duke's standard "Price to Compare".

Work from live sources, not memory:
- Open the offer's sign-up page and its terms/contract (the URLs given) with web_fetch; follow links to the Ohio contract summary or terms of service PDF when present.
- Search for the supplier's complaints, PUCO actions, and reviews (e.g. PUCO, BBB, Ohio Attorney General), and for this exact plan's terms if the pages are thin.
- Check that the live price, term, cancel fee and monthly fee match the state list; look for: teaser or introductory pricing, variable pricing after the term, automatic renewal and the renewal price, notice periods, monthly or hidden fees, deposits or credit checks, minimum-use charges, conditions on rebates or rewards, price valid only for online sign-up, enrolment-date limits, and anything that would surprise an ordinary customer.
- If a page can't be read, say so in the gotchas rather than guessing.

Judge the offer for THIS household, not in general (their situation is in the request):
- Compare with what they pay now (their current supplier, or Duke's standard Price to Compare) and with staying on Duke. Search for Duke Energy Ohio's next scheduled Price to Compare change (it resets around June 1 and December 1) and say whether locking a fixed price looks wise.
- Use their month-by-month use: a high-use season changes which offer is best and what a variable price would cost.
- If they have electric cars: say what the offer means for charging, and check whether a customer who buys from a supplier can also take Duke Energy Ohio's optional time-of-day Rate TD-CPP (cheaper midnight–5 AM); say clearly if that is unknown.
- If they are on a supplier contract now: account for its cancel fee and end date (switching early may cost more than it saves).
- The verdict is about whether THEY should take this offer now.

Write for a non-expert in short plain sentences. Finish by calling submit_verdict exactly once.`;

function brief(o: Offer, s: Situation): string {
  const urls = [o.signUp && `Sign-up page: ${o.signUp}`, o.terms && `Terms / contract: ${o.terms}`, o.site && `Company site: ${o.site}`].filter(Boolean).join('\n');
  const now = s.supply.rate
    ? `a supplier, ${s.supply.name || 'name not given'}, at $${s.supply.rate}/kWh${s.supply.monthlyFee ? ` + $${s.supply.monthlyFee}/month` : ''}${s.supply.cancelFee ? `; cancel fee $${s.supply.cancelFee}` : ''}${s.supply.endDate ? `; contract ends ${s.supply.endDate}` : '; contract end date not given'}`
    : "Duke's standard price (Price to Compare), no supplier contract";
  const months = s.months.length ? s.months.map((m) => `${m.m}: ${m.kwh} kWh`).join(', ') : 'not available';
  const cars = s.cars
    ? `${s.cars} electric car${s.cars > 1 ? 's' : ''} charged at home (${s.chargerKw} kW charger), about ${s.carKwhYear.toLocaleString('en-US')} kWh a year for the cars, ${Math.round(s.carNightShare * 100)}% of it charged midnight–5 AM. They want to charge as cheaply as possible, ideally off-peak.`
    : 'No electric car.';
  return `Offer from Ohio's official comparison list (PUCO Energy Choice Ohio, Duke Energy Ohio residential):
- Supplier: ${o.supplier}${o.phone ? ` (${o.phone})` : ''}
- Price: $${o.rate}/kWh, ${o.type}${o.intro ? ', marked as an introductory price' : ''}
- Term: ${o.term ? `${o.term} months` : 'month to month'}
- Cancel fee: $${o.etf}${o.etfPerMonth ? ' per remaining month' : ''}${o.etfDetails ? ` (${o.etfDetails})` : ''}
- Monthly fee: $${o.monthlyFee}
- Renewable: ${o.renewable}%
- Offer details: ${o.details ?? 'none'}${o.promo ? `\n- Promotion: ${o.promo}` : ''}

${urls || 'No links were listed: find the offer on the supplier’s site.'}

This household (Duke Energy Ohio residential customer, smart meter):
- Buys electricity now from: ${now}.
- Duke's Price to Compare: ${s.ptc != null ? `$${s.ptc}/kWh${s.ptcPeriod ? ` (${s.ptcPeriod})` : ''}` : 'unknown'}. Their all-in price on the bill is about $${s.price}/kWh plus $${s.fixed}/month basic charge (delivery charges stay with Duke whatever they choose).
- Use: about ${s.yearKwh.toLocaleString('en-US')} kWh a year. Month by month: ${months}.
- Cars: ${cars}

Check this offer for them and give your verdict.`;
}

/** The check itself: a manual loop (server tools may pause; the verdict arrives as a tool call). */
export async function runCheck(id: string, o: Offer, situation: Situation, ai: AiChoice): Promise<void> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY from Vercel's environment
  const m = aiModel(ai.model);
  const quick = ai.thoroughness === 'quick';
  const tools: Anthropic.Beta.BetaToolUnion[] =
    m.tools === 'new'
      ? [
          { type: 'web_search_20260318', name: 'web_search', max_uses: quick ? 3 : 5 },
          { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: quick ? 4 : 8, max_content_tokens: 30000 },
          verdictTool,
        ]
      : [
          { type: 'web_search_20250305', name: 'web_search', max_uses: quick ? 3 : 5 },
          { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: quick ? 4 : 8, max_content_tokens: 30000 },
          verdictTool,
        ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: brief(o, situation) }];
  let verdict: Verdict | null = null;
  let servedBy = m.id;
  try {
    for (let turn = 0; turn < 8 && !verdict; turn++) {
      const res = await client.beta.messages
        .stream({
          model: m.id,
          max_tokens: 32000,
          ...(m.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}), // a declined request is re-run on a fallback model in the same call
          ...(m.effort ? { output_config: { effort: EFFORT[ai.thoroughness] } } : {}),
          system: SYSTEM + (quick ? '\n\nBe quick: read the sign-up page and the contract, do at most two searches, then give your verdict.' : ''),
          tools,
          messages,
        })
        .finalMessage();
      servedBy = res.model;
      if (res.stop_reason === 'refusal') throw new Error('The AI declined to check this offer.');
      const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'submit_verdict');
      if (call) {
        verdict = call.input as Verdict;
        break;
      }
      messages.push({ role: 'assistant', content: res.content });
      // pause_turn: a long server-tool turn was paused; sending the history back resumes it.
      if (res.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Please finish now and call submit_verdict with what you found.' });
    }
    if (!verdict) throw new Error('The AI did not finish its check. Try again.');
    await finish(id, { status: 'done', model: servedBy, verdict });
    await tell(`🤖 AI verdict: ${LABEL[verdict.verdict]}`, `${o.supplier} (${(o.rate * 100).toFixed(2)}¢): ${verdict.headline}`);
  } catch (e) {
    const msg =
      e instanceof Anthropic.AuthenticationError ? 'ANTHROPIC_API_KEY is missing or wrong (Vercel → Settings → Environment Variables).'
      : e instanceof Anthropic.NotFoundError ? `The model ${m.name} isn’t available to your API key. Pick another one in Settings → AI.`
      : e instanceof Anthropic.RateLimitError ? 'The AI is busy right now. Try again in a minute.'
      : e instanceof Anthropic.APIError ? `The AI service answered ${e.status}: ${e.message}`
      : e instanceof Error ? e.message : String(e);
    await finish(id, { status: 'error', model: servedBy, error: msg });
  }
}

const LABEL = { good: '✅ Looks good', caution: '⚠️ Be careful', avoid: '⛔ Avoid' } as const;

/** A phone notification through ntfy when alerts are set up (Settings → Alerts); never fails the check. */
async function tell(title: string, text: string): Promise<void> {
  try {
    const s = await getSettings();
    if (s.alerts.on && s.alerts.topic) await notify(s.alerts.topic, title, text, 'robot');
  } catch { /* the verdict is saved either way */ }
}
