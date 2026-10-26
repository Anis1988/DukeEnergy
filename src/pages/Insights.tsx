import { useState } from 'react';
import { ScatterChart } from '../components/Chart';
import { ErrorBox, Spinner, Stat, useData } from '../components/ui';
import { getUsage, saveSettings } from '../lib/api';
import { addDays, addMonths, hourLong, kwh, long, monthStart, money } from '../lib/dates';
import { comparePlan, weatherFit } from '../lib/insights';
import { PLAN_PRESETS, type Plan, type Settings } from '../lib/types';

export function Insights({ serial, today, settings, onSaved }: { serial: string; today: string; settings: Settings; onSaved: () => void }) {
  return (
    <div className="space-y-4">
      <Weather serial={serial} today={today} settings={settings} />
      <PlanCheck serial={serial} today={today} settings={settings} onSaved={onSaved} />
    </div>
  );
}

/* ---------- 🌡️ Weather effect ---------- */

function Weather({ serial, today, settings }: { serial: string; today: string; settings: Settings }) {
  const end = addDays(today, -1);
  const first = addMonths(monthStart(end), -12);
  // Same request as 📆 Months: answered from memory when that tab was opened first.
  const q = useData(`m:${serial}:${first}:${end}`, () => getUsage(serial, 'DAILY', first, end));
  const pts = q.data?.points ?? [];
  const fit = weatherFit(pts);

  let body;
  if (q.error) body = <ErrorBox error={q.error} onRetry={q.reload} />;
  else if (q.loading && !q.data) body = <Spinner label="Reading the last 12 months…" />;
  else if (!fit) body = <p className="text-sm text-muted">Not enough days with a temperature yet (needs 30).</p>;
  else {
    const withTemp = pts.filter((p) => p.temp != null);
    const heating = withTemp.reduce((s, p) => s + fit.heat * Math.max(0, fit.balance - p.temp!), 0);
    const cooling = withTemp.reduce((s, p) => s + fit.cool * Math.max(0, p.temp! - fit.balance), 0);
    const all = withTemp.reduce((s, p) => s + p.kwh, 0);
    const share = (v: number) => `${Math.round((v / all) * 100)}%`;
    // Last 30 days against what the weather alone would predict.
    const recent = withTemp.filter((p) => p.t > addDays(end, -30));
    const actual = recent.reduce((s, p) => s + p.kwh, 0);
    const expected = recent.reduce((s, p) => s + Math.max(0, fit.predict(p.temp!)), 0);
    const diff = expected > 0 ? ((actual - expected) / expected) * 100 : 0;
    body = (
      <>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="1° colder" value={fit.heat > 0.05 ? `+${money(fit.heat * settings.price)}` : 'none'} sub={fit.heat > 0.05 ? `a day (+${fit.heat.toFixed(2)} kWh) below ${fit.balance}°F` : `below ${fit.balance}°F`} />
          <Stat label="1° hotter" value={fit.cool > 0.05 ? `+${money(fit.cool * settings.price)}` : 'none'} sub={fit.cool > 0.05 ? `a day (+${fit.cool.toFixed(2)} kWh) above ${fit.balance}°F` : `above ${fit.balance}°F`} />
          <Stat label="Mild day" value={Math.max(0, fit.base).toFixed(1)} sub={`kWh a day at ${fit.balance}°F`} />
        </div>
        <ScatterChart
          points={withTemp.map((p) => ({ key: p.t, x: p.temp!, y: p.kwh, tip: <span><b>{kwh(p.kwh)}</b> at {p.temp!.toFixed(0)}°F<br />{long(p.t)}</span> }))}
          curve={fit.predict}
        />
        <p className="text-xs text-muted">Each dot is a day. The line is what the weather alone predicts{fit.r2 < 0.4 ? ' (a loose fit: weather explains only part of your use)' : ''}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-bg p-3 text-sm">
            <p className="label">Last 12 months, roughly</p>
            <p className="mt-1">🔥 Heating <b>{share(heating)}</b> · ❄️ Cooling <b>{share(cooling)}</b> · 🏠 Everything else <b>{share(all - heating - cooling)}</b></p>
          </div>
          {recent.length >= 14 && (
            <div className="rounded-xl bg-bg p-3 text-sm">
              <p className="label">Last 30 days, for their weather</p>
              <p className={`mt-1 ${Math.abs(diff) < 5 ? '' : diff > 0 ? 'text-bad' : 'text-good'}`}>
                {Math.abs(diff) < 5 ? '• About as expected' : diff > 0 ? `▲ ${diff.toFixed(0)}% more than expected` : `▼ ${Math.abs(diff).toFixed(0)}% less than expected`}
                <span className="text-muted"> ({kwh(actual)} vs {kwh(expected)})</span>
              </p>
            </div>
          )}
        </div>
      </>
    );
  }
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">🌡️ Weather effect</h2>
        <p className="text-sm text-muted">How much heating and cooling cost you, from your daily use and the outside temperature.</p>
      </div>
      {body}
    </section>
  );
}

/* ---------- ⏰ Time-of-use plan check ---------- */

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function PlanCheck({ serial, today, settings, onSaved }: { serial: string; today: string; settings: Settings; onSaved: () => void }) {
  const [plan, setPlan] = useState<Plan>(settings.plan);
  const [shift, setShift] = useState(0);
  const [note, setNote] = useState('');
  const end = addDays(today, -1);
  const start = addDays(end, -55);
  const q = useData(`hh:${serial}:${start}:${end}`, () => getUsage(serial, 'HOURLY', start, end));
  const r = q.data ? comparePlan(q.data.points, plan, settings.price, settings.fixed) : null;
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => { setPlan({ ...plan, [k]: v }); setNote(''); };
  const save = async () => {
    try {
      await saveSettings({ plan });
      setNote('✅ Saved');
      onSaved();
    } catch (e) {
      setNote(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const hourSelect = (k: 'peakStart' | 'peakEnd' | 'nightStart' | 'nightEnd') => (
    <select className="input mt-1 py-2" value={plan[k]} onChange={(e) => set(k, Number(e.target.value))}>
      {HOURS.map((h) => <option key={h} value={h}>{hourLong(h)}</option>)}
    </select>
  );
  const priceInput = (k: 'peak' | 'offPeak' | 'night' | 'fixed') => (
    <input className="input mt-1 py-2" inputMode="decimal" value={plan[k]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) set(k, v); }} />
  );

  const total = r ? r.kwh.peak + r.kwh.night + r.kwh.off : 0;
  const saving = r ? r.nowMonth - r.shifted(shift) : 0;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">⏰ Would a time-of-use plan save money?</h2>
        <p className="text-sm text-muted">Your real hour-by-hour use from the last 8 weeks, priced on a plan where some hours cost more and others less. Enter the plan’s real hours and prices (from Duke or a supplier’s offer); the ones shown are examples.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(PLAN_PRESETS).map(([k, p]) => (
          <button key={k} className="chip" aria-pressed={plan.name === p.name} onClick={() => { setPlan(p); setNote(''); }}>{p.name}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label><span className="label">Peak from</span>{hourSelect('peakStart')}</label>
        <label><span className="label">Peak until</span>{hourSelect('peakEnd')}</label>
        <label><span className="label">Peak $/kWh</span>{priceInput('peak')}</label>
        <label><span className="label">Other hours $/kWh</span>{priceInput('offPeak')}</label>
        <label><span className="label">Overnight from</span>{hourSelect('nightStart')}</label>
        <label><span className="label">Overnight until</span>{hourSelect('nightEnd')}</label>
        <label><span className="label">Overnight $/kWh</span>{priceInput('night')}</label>
        <label><span className="label">Monthly charge $</span>{priceInput('fixed')}</label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={plan.weekdaysOnly} onChange={(e) => set('weekdaysOnly', e.target.checked)} />
        Peak price on weekdays only
      </label>
      <p className="text-xs text-muted">Same “from” and “until” = no such hours. Overnight wins where the two overlap.</p>
      <div className="flex items-center gap-3">
        <button className="btn" onClick={() => void save()}>Save this plan</button>
        <span className="text-sm">{note}</span>
      </div>

      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <Spinner label="Reading 8 weeks of hourly use (the first time takes a little while)…" /> : !r ? (
        <p className="text-sm text-muted">Not enough hourly readings yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Your plan now" value={money(r.nowMonth)} sub={`a month (${money(settings.price)}/kWh + ${money(settings.fixed)})`} />
            <Stat
              label={plan.name}
              value={money(r.planMonth)}
              tone={r.planMonth < r.nowMonth ? 'good' : 'bad'}
              sub={r.planMonth < r.nowMonth ? `a month · ▼ saves about ${money((r.nowMonth - r.planMonth) * 12)}/year` : `a month · ▲ costs about ${money((r.planMonth - r.nowMonth) * 12)}/year more`}
            />
          </div>
          <div>
            <p className="label">When you use electricity</p>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-grid">
              <div className="h-full bg-bad" style={{ width: `${(r.kwh.peak / total) * 100}%` }} />
              <div className="h-full bg-bar" style={{ width: `${(r.kwh.off / total) * 100}%` }} />
              <div className="h-full bg-strong" style={{ width: `${(r.kwh.night / total) * 100}%` }} />
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-bad" />Peak {Math.round((r.kwh.peak / total) * 100)}%</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-bar" />Other {Math.round((r.kwh.off / total) * 100)}%</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-strong" />Overnight {Math.round((r.kwh.night / total) * 100)}%</span>
            </p>
          </div>
          {r.kwh.peak > 0 && (
            <div className="rounded-xl bg-bg p-3 text-sm">
              <label className="block">
                <span className="label">If you moved {Math.round(shift * 100)}% of peak use to other hours</span>
                <input type="range" min={0} max={0.8} step={0.05} value={shift} onChange={(e) => setShift(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--accent))]" />
              </label>
              <p className="mt-1">
                {plan.name}: <b>{money(r.shifted(shift))}/mo</b>
                {' · '}
                <span className={saving > 0 ? 'text-good' : 'text-bad'}>{saving > 0 ? `▼ ${money(saving * 12)}/year less than now` : `▲ ${money(-saving * 12)}/year more than now`}</span>
              </p>
              <p className="mt-1 text-xs text-muted">Things that can move: dishwasher, laundry, dryer, car charging, pool pump.</p>
            </div>
          )}
          <p className="text-xs text-muted">Based on {r.days} days. Summer and winter can differ: check again in another season.</p>
        </>
      )}
    </section>
  );
}
