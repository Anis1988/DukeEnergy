import { BarChart } from '../components/Chart';
import { ErrorBox, Spinner, Stat, useData } from '../components/ui';
import { getUsage } from '../lib/api';
import { addDays, hour12, hourLong, kwh, long, money } from '../lib/dates';
import type { Settings } from '../lib/types';

export function Hourly({ serial, today, settings, day, setDay }: { serial: string; today: string; settings: Settings; day: string; setDay: (d: string) => void }) {
  const latest = addDays(today, -1);
  const weekAgo = addDays(day, -7);
  const q = useData(`h:${serial}:${day}`, () => getUsage(serial, 'HOURLY', day, day));
  const last = useData(`h:${serial}:${weekAgo}`, () => getUsage(serial, 'HOURLY', weekAgo, weekAgo));
  const byHour = new Map((q.data?.points ?? []).map((p) => [Number(p.t.slice(11, 13)), p]));
  const total = [...byHour.values()].reduce((s, p) => s + p.kwh, 0);
  const lastTotal = (last.data?.points ?? []).reduce((s, p) => s + p.kwh, 0);
  const peak = [...byHour.entries()].sort((a, b) => b[1].kwh - a[1].kwh)[0];
  // "Always on": the lowest hour between midnight and 6 AM, as watts (fridge, Wi-Fi, standby…).
  const night = [0, 1, 2, 3, 4, 5].map((h) => byHour.get(h)?.kwh).filter((v): v is number => v != null);
  const base = night.length ? Math.min(...night) * 1000 : null;

  const bars = Array.from({ length: 24 }, (_, h) => {
    const p = byHour.get(h);
    return {
      key: String(h),
      value: p?.kwh ?? null,
      label: hour12(h),
      strong: !!peak && peak[0] === h,
      tip: p ? <span><b>{p.kwh.toFixed(2)} kWh</b> · {money(p.kwh * settings.price)}<br />{hourLong(h)}–{hourLong((h + 1) % 24)}{p.temp != null && ` · ${p.temp.toFixed(0)}°F`}</span> : <span>{hourLong(h)}: no reading</span>,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="btn px-3" onClick={() => setDay(addDays(day, -1))} aria-label="Day before">‹</button>
        <input type="date" className="input min-w-0 flex-1 text-center" value={day} max={latest} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="btn px-3" onClick={() => setDay(addDays(day, 1))} disabled={day >= latest} aria-label="Next day">›</button>
      </div>
      <p className="text-center text-sm text-muted">{long(day)}</p>

      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <Spinner label="Asking Duke Energy…" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="That day" value={kwh(total)} sub={lastTotal > 0 ? `${kwh(lastTotal)} a week before` : undefined} />
            <Stat label="About" value={money(total * settings.price)} sub="energy only" />
            <Stat label="Busiest hour" value={peak ? hourLong(peak[0]) : '–'} sub={peak ? `${peak[1].kwh.toFixed(2)} kWh` : undefined} />
            <Stat label="Always on" value={base != null ? `${Math.round(base)} W` : '–'} sub="lowest night hour" />
          </div>
          <section className="card">
            <h2 className="mb-2 font-display text-lg font-semibold">Hour by hour</h2>
            {byHour.size ? <BarChart bars={bars} height={220} /> : <p className="py-8 text-center text-sm text-muted">No readings for this day yet. Try the day before.</p>}
          </section>
        </>
      )}
    </div>
  );
}
