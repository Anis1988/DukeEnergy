import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import type { AiCheck, Offer, Verdict } from '../src/lib/types.js';
import { db } from './store.js';

/**
 * 🤖 Deep check of one supplier offer by Claude Fable 5.1 (Anthropic's most capable model): it opens the offer's live
 * sign-up page and contract with web fetch, searches for complaints and fine print with web search, and hands back a
 * verdict through the `submit_verdict` tool. Runs in the background (the app polls); kept 7 days per offer.
 */
const MODEL = 'claude-fable-5-1';
const KEEP = 7 * 86400;
const DAILY_LIMIT = Number(process.env.AI_CHECK_DAILY_LIMIT ?? 10);

export const offerId = (o: Offer) => createHash('sha1').update([o.supplier, o.rate, o.type, o.term, o.etf, o.monthlyFee, o.signUp ?? o.site ?? ''].join('|')).digest('hex').slice(0, 16);
const key = (id: string) => `de:aic:${id}`;

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

export async function startCheck(id: string): Promise<AiCheck> {
  const c: AiCheck = { id, status: 'running', startedAt: new Date().toISOString(), model: MODEL };
  await db()?.set(key(id), c, { ex: 3600 });
  return c;
}

const verdictTool: Anthropic.Beta.BetaTool = {
  name: 'submit_verdict',
  description: 'Submit the final verdict on the offer. Call this exactly once, at the end, after reading the live pages.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'headline', 'summary', 'confirmed', 'gotchas', 'positives', 'yearly_cost', 'recommendation', 'sources'],
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
      yearly_cost: { type: 'string', description: 'Electricity (supply) cost for the customer’s yearly kWh with this offer, all its fees included, vs Duke’s standard price.' },
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

Write for a non-expert in short plain sentences. Finish by calling submit_verdict exactly once.`;

function brief(o: Offer, ctx: { yearKwh: number; ptc: number | null; ptcPeriod?: string; nowRate: number; nowName: string; cars: number }): string {
  const urls = [o.signUp && `Sign-up page: ${o.signUp}`, o.terms && `Terms / contract: ${o.terms}`, o.site && `Company site: ${o.site}`].filter(Boolean).join('\n');
  return `Offer from Ohio's official comparison list (PUCO Energy Choice Ohio, Duke Energy Ohio residential):
- Supplier: ${o.supplier}${o.phone ? ` (${o.phone})` : ''}
- Price: $${o.rate}/kWh, ${o.type}${o.intro ? ', marked as an introductory price' : ''}
- Term: ${o.term ? `${o.term} months` : 'month to month'}
- Cancel fee: $${o.etf}${o.etfPerMonth ? ' per remaining month' : ''}${o.etfDetails ? ` (${o.etfDetails})` : ''}
- Monthly fee: $${o.monthlyFee}
- Renewable: ${o.renewable}%
- Offer details: ${o.details ?? 'none'}${o.promo ? `\n- Promotion: ${o.promo}` : ''}

${urls || 'No links were listed: find the offer on the supplier’s site.'}

The customer:
- Uses about ${Math.round(ctx.yearKwh).toLocaleString('en-US')} kWh a year${ctx.cars ? `, including ${ctx.cars} electric car${ctx.cars > 1 ? 's' : ''} charged at home` : ''}.
- Buys now from ${ctx.nowName} at $${ctx.nowRate}/kWh. Duke's Price to Compare is ${ctx.ptc != null ? `$${ctx.ptc}/kWh${ctx.ptcPeriod ? ` (${ctx.ptcPeriod})` : ''}` : 'unknown'}.

Check this offer and give your verdict.`;
}

/** The check itself: a manual loop (server tools may pause; the verdict arrives as a tool call). */
export async function runCheck(id: string, o: Offer, ctx: Parameters<typeof brief>[1]): Promise<void> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY from Vercel's environment
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: brief(o, ctx) }];
  let verdict: Verdict | null = null;
  let servedBy = MODEL;
  try {
    for (let turn = 0; turn < 8 && !verdict; turn++) {
      const res = await client.beta.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default', // a declined request is re-run on a fallback model in the same call
          output_config: { effort: 'high' },
          system: SYSTEM,
          tools: [
            { type: 'web_search_20260318', name: 'web_search', max_uses: 8 },
            { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: 12, max_content_tokens: 40000 },
            verdictTool,
          ],
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
    await db()?.set(key(id), { id, status: 'done', startedAt: (await getCheck(id))?.startedAt ?? new Date().toISOString(), finishedAt: new Date().toISOString(), model: servedBy, verdict } satisfies AiCheck, { ex: KEEP });
  } catch (e) {
    const msg =
      e instanceof Anthropic.AuthenticationError ? 'ANTHROPIC_API_KEY is missing or wrong (Vercel → Settings → Environment Variables).'
      : e instanceof Anthropic.RateLimitError ? 'The AI is busy right now. Try again in a minute.'
      : e instanceof Anthropic.APIError ? `The AI service answered ${e.status}: ${e.message}`
      : e instanceof Error ? e.message : String(e);
    await db()?.set(key(id), { id, status: 'error', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), model: servedBy, error: msg } satisfies AiCheck, { ex: 600 });
  }
}
