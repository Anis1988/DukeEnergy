import type { Offer, Offers } from '../src/lib/types.js';
import { db } from './store.js';

/**
 * 💲 Ohio's official comparison of electricity suppliers (PUCO "Energy Choice Ohio", apples-to-apples chart) for
 * Duke Energy Ohio residential customers, and Duke's "Price to Compare". The page is read as text and cached 12 h.
 * If the page layout changes, `parse` is what to update.
 */
const PAGE = 'https://energychoice.ohio.gov/ApplesToApplesComparision.aspx?Category=Electric&TerritoryId=4&RateCode=1';
const KEY = 'de:offers';

const decode = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
// Text in the offer pop-ups is escaped twice (\u003cbr/\u003e, &lt;br/&gt;): unescaped first, then the tags removed.
const text = (h: string) =>
  decode(h.replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>').replace(/\\u0026/gi, '&'))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const money = (s: string) => { const m = s.replace(/,/g, '').match(/\$\s*([\d.]+)/); return m ? Number(m[1]) : 0; };
const safeUrl = (u: string | undefined) => (u && /^https?:\/\//i.test(u) ? decode(u) : undefined);

export function parse(html: string): Offers {
  const page = text(html);
  const ptc = page.match(/Price to Compar\s?e[”"]? for the generation supply portion of your bill for the period ([^$]+?) is \$\s*([\d.]+)/i);
  const offers: Offer[] = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    if (!row.includes('retail-title')) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 10) continue;
    const [, who, rateH, typeH, greenH, introH, termH, etfH, feeH, promoH] = cells;
    const rate = Number(text(rateH));
    if (!(rate > 0 && rate < 2)) continue;
    const title = who.match(/<span class='retail-title'>([^<]+)/i)?.[1];
    const details = who.match(/showTextInDialog\("Offer Details","([\s\S]*?)"\);/)?.[1];
    const etfDetails = etfH.match(/showTextInDialog\("[^"]*","([\s\S]*?)"\);/)?.[1];
    const etfText = text(etfH.replace(/<a[\s\S]*?<\/a>/gi, ''));
    const promoDetails = promoH.match(/showTextInDialog\("[^"]*","([\s\S]*?)"\);/)?.[1];
    offers.push({
      supplier: decode(title ?? text(who).split(' P')[0]).trim(),
      phone: text(who).match(/\(\d{3}\)\s?\d{3}-\d{4}/)?.[0],
      site: safeUrl(who.match(/href='([^']+)'[^>]*>Company Url/i)?.[1]),
      signUp: safeUrl(who.match(/href='([^']+)'[^>]*>Sign Up/i)?.[1]),
      terms: safeUrl(who.match(/href='([^']+)'[^>]*>Terms of Service/i)?.[1]),
      details: details ? text(details) : undefined,
      rate,
      type: /variable/i.test(text(typeH)) ? 'Variable' : 'Fixed',
      renewable: Number(text(greenH).replace('%', '')) || 0,
      intro: /yes/i.test(text(introH)),
      term: Number(text(termH).match(/\d+/)?.[0] ?? 0),
      etf: money(etfText),
      etfPerMonth: /per (remaining )?month/i.test(etfDetails ?? '') ,
      etfDetails: etfDetails ? text(etfDetails) : undefined,
      monthlyFee: money(text(feeH)),
      promo: /yes/i.test(text(promoH)) ? (promoDetails ? text(promoDetails) : 'Yes') : undefined,
    });
  }
  return { ptc: ptc ? Number(ptc[2]) : null, ptcPeriod: ptc?.[1].trim(), offers, checkedAt: new Date().toISOString(), source: PAGE };
}

export async function getOffers(fresh = false): Promise<Offers> {
  if (!fresh) {
    const cached = await db()?.get<Offers>(KEY);
    if (cached?.offers?.length) return cached;
  }
  const r = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'text/html' } });
  if (!r.ok) throw new Error(`Energy Choice Ohio answered ${r.status}.`);
  const out = parse(await r.text());
  if (!out.offers.length) throw new Error('No offers found on Energy Choice Ohio (the page may have changed).');
  await db()?.set(KEY, out, { ex: 12 * 3600 });
  return out;
}
