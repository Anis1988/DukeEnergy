import { useState } from 'react';
import { BarChart, ScatterChart } from '../components/Chart';
import { ErrorBox, Spinner, Stat, useData } from '../components/ui';
import { getUsage, saveSettings } from '../lib/api';
import { addDays, addMonths, hourLong, kwh, long, monthStart, money, short } from '../lib/dates';
import { band, comparePlan, findCharging, weatherFit } from '../lib/insights';
import { PLAN_PRESETS, type Plan, type Settings, type Usage } from '../lib/types';

type Hourly = ReturnType<typeof useData<Usage>>;

export function Insights({ serial, today, settings, onSaved, onSettings }: { serial: string; today: string; settings: Settings; onSaved: () => void; onSettings: () => void }) {
  // 8 weeks of hourly use: shared by 🚗 Car charging and ⏰ the plan check (one request).
  const end = addDays(today, -1);
  const start = addDays(end, -55);
  const hourly = useData(`hh:${serial}:${start}:${end}`, () => getUsage(serial, 'HOURLY', start, end));
  return (
    <div className="space-y-4">
      <Weather serial={serial} today={today} settings={settings} />
      <Charging q={hourly} settings={settings} onSettings={onSettings} />
      <PlanCheck q={hourly} settings={settings} onSaved={onSaved} />
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

/* ---------- 🚗 Car charging ---------- */

function Charging({ q, settings, onSettings }: { q: Hourly; settings: Settings; onSettings: () => void }) {
  const ev = settings.ev;
  if (ev.cars === 0) {
    return (
      <section className="card flex flex-wrap items-center gap-3 text-sm">
        <p className="min-w-[12rem] flex-1">🚗 Electric car at home? Tell the app in Settings and it will find the charging in your use.</p>
        <button className="btn" onClick={onSettings}>Set up</button>
      </section>
    );
  }
  let body;
  if (q.error) body = <ErrorBox error={q.error} onRetry={q.reload} />;
  else if (q.loading && !q.data) body = <Spinner label="Reading 8 weeks of hourly use…" />;
  else {
    const pts = q.data?.points ?? [];
    const found = findCharging(pts, ev.chargerKw);
    const days = [...new Set(pts.map((p) => p.t.slice(0, 10)))].sort();
    const last30 = days.slice(-30);
    const car30 = last30.reduce((s, d) => s + (found.byDay.get(d) ?? 0), 0);
    const all30 = pts.filter((p) => last30.includes(p.t.slice(0, 10))).reduce((s, p) => s + p.kwh, 0);
    const sessions30 = found.sessions.filter((x) => last30.includes(x.start.slice(0, 10)));
    // When the cars charge, priced on the saved time-of-use plan.
    const plan = settings.plan;
    const byBand = { peak: 0, off: 0, night: 0 };
    for (const [t, k] of found.byHour) byBand[band(plan, t.slice(0, 10), Number(t.slice(11, 13)))] += k;
    const cheapest = Math.min(plan.offPeak, plan.nightStart !== plan.nightEnd ? plan.night : Infinity);
    const scale = found.total > 0 ? car30 / found.total : 0;
    const onPlanNow = (byBand.peak * plan.peak + byBand.off * plan.offPeak + byBand.night * plan.night) * scale;
    const onPlanBest = found.total * cheapest * scale;
    const bars = days.map((d) => ({
      key: d,
      value: found.byDay.get(d) ?? null,
      label: short(d).replace(/^\w+ /, ''),
      tip: <span><b>{kwh(found.byDay.get(d) ?? 0)}</b> car charging · {money((found.byDay.get(d) ?? 0) * settings.price)}<br />{long(d)}</span>,
    }));
    body = found.total < 1 ? (
      <p className="text-sm text-muted">No charging found in the last 8 weeks. If your cars charge from a normal outlet (about 1.4 kW), it’s too small to tell apart from the house; set the charger power in Settings.</p>
    ) : (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cars, 30 days" value={kwh(car30)} sub={`${Math.round((car30 / Math.max(1, all30)) * 100)}% of all your use`} />
          <Stat label="Cost" value={money(car30 * settings.price)} sub={`about ${money((car30 * settings.price) / Math.max(1, ev.cars))} a car`} />
          <Stat label="Miles (est.)" value={Math.round(car30 * ev.milesPerKwh).toLocaleString()} sub={`${money(settings.price / ev.milesPerKwh)} a mile`} />
          <Stat label="Charges" value={String(sessions30.length)} sub={sessions30.length ? `about ${kwh(car30 / sessions30.length)} each` : undefined} />
        </div>
        <BarChart bars={bars} height={170} />
        {plan.peak > cheapest && (
          <div className="rounded-xl bg-bg p-3 text-sm">
            <p className="label">On “{plan.name}”</p>
            <p className="mt-1">
              {Math.round((byBand.peak / found.total) * 100)}% of your charging is in peak hours. Charging the way you do now would cost <b>{money(onPlanNow)}</b> a month on that plan;
              {' '}all in its cheapest hours, <b>{money(onPlanBest)}</b>
              {onPlanNow - onPlanBest > 0.5 && <span className="text-good"> (▼ {money((onPlanNow - onPlanBest) * 12)}/year)</span>}.
              {' '}Most cars and chargers let you schedule charging.
            </p>
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Recent sessions</summary>
          <ul className="mt-2 divide-y divide-line">
            {[...found.sessions].reverse().slice(0, 12).map((x) => (
              <li key={x.start} className="flex justify-between gap-3 py-1.5">
                <span>{short(x.start.slice(0, 10))}, {hourLong(Number(x.start.slice(11, 13)))} · {x.hours} h</span>
                <span className="tabular-nums">{kwh(x.kwh)} · {money(x.kwh * settings.price)}</span>
              </li>
            ))}
          </ul>
        </details>
        <p className="text-xs text-muted">Found from your hourly use: hours far above your home’s normal level. Big heaters or a pool heater can look similar; one-hour loads like a dryer are left out.</p>
      </>
    );
  }
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">🚗 Car charging</h2>
        <p className="text-sm text-muted">{ev.cars} {ev.cars === 1 ? 'car' : 'cars'}, {ev.chargerKw} kW charging, last 8 weeks.</p>
      </div>
      {body}
    </section>
  );
}

/* ---------- ⏰ Time-of-use plan check ---------- */

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function PlanCheck({ q, settings, onSaved }: { q: Hourly; settings: Settings; onSaved: () => void }) {
  const [plan, setPlan] = useState<Plan>(settings.plan);
  const [shift, setShift] = useState(0);
  const [note, setNote] = useState('');
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
