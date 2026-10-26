import { useState } from 'react';
import { Chips, ErrorBox, Spinner, useData } from '../components/ui';
import { getOffers, getUsage, saveSettings } from '../lib/api';
import { addDays, addMonths, money, monthStart } from '../lib/dates';
import type { Offer, Settings } from '../lib/types';

type Term = 'any' | '12' | '24';
interface Filters { fixed: boolean; noCancelFee: boolean; noMonthlyFee: boolean; green: boolean; term: Term }
const FILTER_KEY = 'ww.dealFilters';
const loadFilters = (): Filters => {
  const d: Filters = { fixed: true, noCancelFee: false, noMonthlyFee: false, green: false, term: 'any' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') }; } catch { return d; }
};

/** A "safe" deal: fixed price, no teaser rate, at least 6 months, cancel fee $100 or less. */
const safe = (o: Offer) => o.type === 'Fixed' && !o.intro && o.term >= 6 && (o.etfPerMonth ? o.etf * o.term : o.etf) <= 100;
/** Savings are counted only for the months the price is fixed (a year at most; variable offers: a year). */
const months = (o: Offer) => (o.type === 'Fixed' && o.term > 0 && o.term < 12 ? o.term : 12);
const over = (o: Offer) => (months(o) === 12 ? 'a year' : `over ${months(o)} months`);
const cents = (rate: number) => `${(rate * 100).toFixed(2).replace(/0$/, '')}¢`;

/**
 * 💲 Cheaper electricity: Duke keeps delivering it (same wires, same bill), but the electricity itself can be bought
 * from any supplier on Ohio's official list. Each offer is priced on your own last 12 months.
 */
export function Deals({ serial, today, settings, onSaved }: { serial: string; today: string; settings: Settings; onSaved: () => void }) {
  const offers = useData('offers', () => getOffers());
  const end = addDays(today, -1);
  // Same request as 📆 Months (13 months, answered from memory when already loaded); the last 365 days are used.
  const first = addMonths(monthStart(end), -12);
  const year = useData(`m:${serial}:${first}:${end}`, () => getUsage(serial, 'DAILY', first, end));
  const [f, setF] = useState<Filters>(loadFilters);
  const [shown, setShown] = useState(10);
  const [open, setOpen] = useState<number | null>(null);
  const [editSupply, setEditSupply] = useState(false);
  const setFilters = (next: Filters) => { setF(next); setShown(10); try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* ignore */ } };

  if (offers.error) return <ErrorBox error={offers.error} onRetry={offers.reload} />;
  if (year.error) return <ErrorBox error={year.error} onRetry={year.reload} />;
  if ((offers.loading && !offers.data) || (year.loading && !year.data)) return <Spinner label="Getting today’s offers and your last 12 months…" />;
  const data = offers.data!;
  const pts = (year.data?.points ?? []).filter((p) => p.t > addDays(end, -365));
  // A year of use (scaled up when fewer days are known yet).
  const yearKwh = pts.length ? (pts.reduce((s, p) => s + p.kwh, 0) / pts.length) * 365 : 0;
  const ptc = data.ptc ?? 0;
  const nowRate = settings.supply.rate || ptc;
  const nowYear = yearKwh * nowRate + settings.supply.monthlyFee * 12;
  const cost = (o: Offer) => yearKwh * o.rate + o.monthlyFee * 12;

  const list = data.offers
    .filter((o) => (!f.fixed || o.type === 'Fixed') && (!f.noCancelFee || o.etf === 0) && (!f.noMonthlyFee || o.monthlyFee === 0) && (!f.green || o.renewable >= 100) && (f.term === 'any' || o.term >= Number(f.term)))
    .sort((a, b) => cost(a) - cost(b));
  const savings = (o: Offer) => ((nowYear - cost(o)) * months(o)) / 12;
  // The safe offer that saves the most over its fixed months (a longer lock-in at a good price wins).
  const best = data.offers.filter(safe).sort((a, b) => savings(b) - savings(a))[0];
  const bestSaves = best ? savings(best) : 0;

  return (
    <div className="space-y-4">
      {/* The answer first. */}
      <section className="card space-y-3 border-accent/40">
        <p className="label">Best safe deal for your home</p>
        {best && bestSaves > 5 ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="font-display text-xl font-semibold">{best.supplier}</p>
                <p className="text-sm text-muted">{cents(best.rate)}/kWh fixed for {best.term} months{best.monthlyFee ? ` + ${money(best.monthlyFee)}/month` : ''}{best.etf ? ` · ${money(best.etf)}${best.etfPerMonth ? '/month left' : ''} to cancel early` : ' · no cancel fee'}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-semibold text-good">▼ {money(bestSaves)}</p>
                <p className="text-xs text-muted">less than now, {over(best)}</p>
              </div>
            </div>
            <OfferActions o={best} />
          </>
        ) : (
          <p className="text-sm">✅ You already pay about as little as the safe offers. Nothing worth switching for right now.</p>
        )}
        <p className="text-xs text-muted">“Safe” = fixed price, no teaser rate, 6+ months, small or no cancel fee. Priced on your last 12 months ({Math.round(yearKwh).toLocaleString()} kWh{settings.ev.cars ? ', cars included' : ''}).</p>
      </section>

      {/* What you pay now. */}
      <section className="card space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="label">You buy from now</p>
            <p>
              {settings.supply.rate ? <><b>{settings.supply.name || 'A supplier'}</b> at {cents(settings.supply.rate)}/kWh{settings.supply.monthlyFee ? ` + ${money(settings.supply.monthlyFee)}/mo` : ''}</> : <><b>Duke (standard)</b> at {cents(ptc)}/kWh</>}
              <span className="text-muted"> · about {money(nowYear)} a year for the electricity</span>
            </p>
          </div>
          <button className="btn px-3 py-1.5" onClick={() => setEditSupply(!editSupply)}>{editSupply ? 'Close' : 'Change'}</button>
        </div>
        {editSupply && <SupplyForm settings={settings} onSaved={() => { setEditSupply(false); onSaved(); }} />}
        <p className="text-xs text-muted">Duke’s standard price (“Price to Compare”) is {cents(ptc)}/kWh{data.ptcPeriod ? ` for ${data.ptcPeriod}` : ''}. It changes a few times a year. Delivery charges are the same whoever you buy from, so only this part is compared.</p>
      </section>

      {/* Every offer. */}
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">All offers</h2>
          <p className="text-xs text-muted">cheapest price first · {list.length} of {data.offers.length}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="chip" aria-pressed={f.fixed} onClick={() => setFilters({ ...f, fixed: !f.fixed })}>🔒 Fixed price</button>
          <button className="chip" aria-pressed={f.noCancelFee} onClick={() => setFilters({ ...f, noCancelFee: !f.noCancelFee })}>No cancel fee</button>
          <button className="chip" aria-pressed={f.noMonthlyFee} onClick={() => setFilters({ ...f, noMonthlyFee: !f.noMonthlyFee })}>No monthly fee</button>
          <button className="chip" aria-pressed={f.green} onClick={() => setFilters({ ...f, green: !f.green })}>🌱 100% renewable</button>
        </div>
        <Chips value={f.term} onChange={(term) => setFilters({ ...f, term })} options={[['any', 'Any length'], ['12', '12+ months'], ['24', '24+ months']]} />
        <ul className="divide-y divide-line">
          {list.slice(0, shown).map((o, i) => {
            const saves = savings(o);
            return (
              <li key={`${o.supplier}-${o.rate}-${o.term}-${i}`} className="py-2.5">
                <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.supplier}</p>
                    <p className="text-xs text-muted">
                      {cents(o.rate)} · {o.type === 'Fixed' ? `fixed ${o.term} mo` : 'variable'}
                      {o.monthlyFee ? ` · ${money(o.monthlyFee)}/mo fee` : ''}
                      {o.etf ? ` · ${money(o.etf)} cancel fee` : ''}
                      {o.renewable >= 100 ? ' · 🌱' : ''}
                    </p>
                    {(o.intro || o.type === 'Variable') && <p className="text-xs text-warn">⚠️ {o.intro ? 'Teaser price: goes up after the first months' : 'Price can change every month'}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-semibold tabular-nums ${saves > 0 ? 'text-good' : 'text-bad'}`}>{saves > 0 ? '▼' : '▲'} {money(Math.abs(saves))}</p>
                    <p className="text-xs text-muted">{over(o)}</p>
                  </div>
                </button>
                {open === i && (
                  <div className="mt-2 space-y-2 rounded-xl bg-bg p-3 text-sm">
                    {o.details && <p>{o.details}</p>}
                    {o.promo && <p>🎁 {o.promo}</p>}
                    {o.etfDetails && <p className="text-muted">Cancelling: {o.etfDetails}</p>}
                    <p className="text-muted">Renewable: {o.renewable}%{o.phone ? ` · ☎ ${o.phone}` : ''}</p>
                    <OfferActions o={o} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {shown < list.length && <button className="btn w-full" onClick={() => setShown(shown + 20)}>Show more</button>}
        <p className="text-xs text-muted">
          From Ohio’s official comparison (PUCO Energy Choice Ohio), checked {new Date(data.checkedAt).toLocaleString()}.{' '}
          <a className="underline" href={data.source} target="_blank" rel="noreferrer">See it there</a>
        </p>
      </section>

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">How switching works</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Duke still brings the power, fixes outages and sends the bill. Only the price of the electricity changes.</li>
          <li>Sign up on the supplier’s site or by phone with your Duke account number (top of your bill). It starts with your next meter reading, usually within 1–2 bills.</li>
          <li>Prefer <b>fixed</b> prices. Variable and teaser prices can jump later.</li>
          <li>Put the contract’s end date in your calendar: many renew automatically at a higher price.</li>
          <li>You can go back to Duke’s standard price any time (the supplier’s cancel fee may apply).</li>
          <li>Your city or township may also have a group deal (“aggregation”); check its website.</li>
        </ul>
      </details>
    </div>
  );
}

function OfferActions({ o }: { o: Offer }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(o.signUp || o.site) && <a className="btn-primary" href={o.signUp ?? o.site} target="_blank" rel="noreferrer">Sign up ↗</a>}
      {o.phone && <a className="btn" href={`tel:${o.phone.replace(/[^\d]/g, '')}`}>☎ Call</a>}
      {o.terms && <a className="btn" href={o.terms} target="_blank" rel="noreferrer">Contract ↗</a>}
    </div>
  );
}

/** "I already buy from a supplier": their price, so savings are counted from it. */
function SupplyForm({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [v, setV] = useState({ name: settings.supply.name, rate: settings.supply.rate ? String(settings.supply.rate) : '', fee: settings.supply.monthlyFee ? String(settings.supply.monthlyFee) : '' });
  const [err, setErr] = useState('');
  const save = async (duke: boolean) => {
    try {
      await saveSettings({ supply: duke ? { name: '', rate: 0, monthlyFee: 0 } : { name: v.name.trim(), rate: Number(v.rate) || 0, monthlyFee: Number(v.fee) || 0 } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="space-y-2 rounded-xl bg-bg p-3">
      <p className="text-xs text-muted">On your bill, under “Generation” or your supplier’s name: the price per kWh.</p>
      <input className="input" placeholder="Supplier name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" inputMode="decimal" placeholder="$/kWh, e.g. 0.0999" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />
        <input className="input" inputMode="decimal" placeholder="Monthly fee $" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!(Number(v.rate) > 0)} onClick={() => void save(false)}>Save</button>
        <button className="btn" onClick={() => void save(true)}>I’m on Duke’s standard price</button>
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}
