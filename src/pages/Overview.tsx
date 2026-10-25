import { useState } from 'react';
import { BarChart, LineChart } from '../components/Chart';
import { Change, Chips, ErrorBox, Spinner, Stat, useData } from '../components/ui';
import { getUsage } from '../lib/api';
import { addDays, kwh, long, monthEnd, monthName, monthStart, money, short, weekday } from '../lib/dates';
import type { Point, Settings } from '../lib/types';

type Range = '7' | '30' | '90';

export function Overview({ serial, today, settings, onDay }: { serial: string; today: string; settings: Settings; onDay: (d: string) => void }) {
  const [range, setRange] = useState<Range>('30');
  const n = Number(range);
  // Duke's readings arrive the next day: the newest full day is yesterday.
  const end = addDays(today, -1);
  const start = addDays(end, -(2 * n - 1));
  // Also this whole month, for "so far".
  const mStart = monthStart(end);
  const from = start < mStart ? start : mStart;
  const q = useData(`d:${serial}:${from}:${end}`, () => getUsage(serial, 'DAILY', from, end));
  const pts = q.data?.points ?? [];
  const byDay = new Map(pts.map((p) => [p.t, p]));
  const days = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i));
  const cur = days(addDays(end, -(n - 1)), n);
  const prev = days(start, n);
  const sum = (list: string[]) => list.reduce((s, d) => s + (byDay.get(d)?.kwh ?? 0), 0);
  const have = (list: string[]) => list.filter((d) => byDay.has(d)).length;
  const total = sum(cur);
  const before = sum(prev);
  const counted = have(cur);
  const avg = counted ? total / counted : 0;
  const peak = cur.reduce<Point | null>((m, d) => { const p = byDay.get(d); return p && (!m || p.kwh > m.kwh) ? p : m; }, null);
  const cost = total * settings.price + settings.fixed * (n / 30.4);

  // This month so far + where it's heading.
  const month = days(mStart, Math.round((Date.parse(end) - Date.parse(mStart)) / 86400_000) + 1);
  const monthKwh = sum(month);
  const monthDays = have(month);
  const inMonth = Number(monthEnd(end).slice(8));
  const projected = monthDays ? (monthKwh / monthDays) * inMonth : 0;

  const bars = cur.map((d) => {
    const p = byDay.get(d);
    return {
      key: d,
      value: p?.kwh ?? null,
      label: n <= 7 ? weekday(d) : short(d).replace(/^\w+ /, ''),
      strong: !!peak && p === peak,
      tip: p ? (
        <span><b>{kwh(p.kwh)}</b> · {money(p.kwh * settings.price)}<br />{long(d)}{p.temp != null && ` · ${p.temp.toFixed(0)}°F`}</span>
      ) : <span>{long(d)}: no reading yet</span>,
    };
  });
  const temps = cur.map((d) => ({ key: d, label: n <= 7 ? weekday(d) : short(d).replace(/^\w+ /, ''), value: byDay.get(d)?.temp ?? null }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips value={range} onChange={setRange} options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} />
        <button className="btn px-3 py-1.5" onClick={q.reload} aria-label="Refresh">↻</button>
      </div>

      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <Spinner label="Asking Duke Energy…" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`Last ${n} days`} value={kwh(total)} sub={<Change now={total} before={before} />} />
            <Stat label="About" value={money(cost)} sub={`at ${money(settings.price)}/kWh + basic charge`} />
            <Stat label="Per day" value={kwh(avg)} sub={`${counted} of ${n} days read`} />
            <Stat label="Highest day" value={peak ? kwh(peak.kwh) : '–'} sub={peak ? long(peak.t) : undefined} />
          </div>

          <section className="card">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Daily use</h2>
              <p className="text-xs text-muted">Tap a day to see its hours</p>
            </div>
            <BarChart bars={bars} avg={avg} onPick={onDay} />
            {temps.some((t) => t.value != null) && (
              <>
                <p className="label mt-4">Outside temperature (average)</p>
                <LineChart points={temps} />
              </>
            )}
          </section>

          <section className="card">
            <h2 className="font-display text-lg font-semibold">{monthName(end, 'long')} so far</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><p className="label">Used</p><p className="font-display text-xl font-semibold">{kwh(monthKwh)}</p><p className="text-xs text-muted">{money(monthKwh * settings.price + settings.fixed)} so far</p></div>
              <div><p className="label">Heading for</p><p className="font-display text-xl font-semibold">{kwh(projected)}</p><p className="text-xs text-muted">about {money(projected * settings.price + settings.fixed)} for the month</p></div>
              {settings.goal > 0 && (
                <div className="col-span-2 sm:col-span-1">
                  <p className="label">Goal {kwh(settings.goal)}</p>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-grid">
                    <div className={`h-full rounded-full ${projected > settings.goal ? 'bg-warn' : 'bg-good'}`} style={{ width: `${Math.min(100, (monthKwh / settings.goal) * 100)}%` }} />
                  </div>
                  <p className={`mt-1 text-xs ${projected > settings.goal ? 'text-warn' : 'text-good'}`}>
                    {projected > settings.goal ? `⚠️ On track to go over by ${kwh(projected - settings.goal)}` : '✅ On track'}
                  </p>
                </div>
              )}
            </div>
          </section>
          {!!q.data?.missing && <p className="text-xs text-muted">Some days have no reading yet ({q.data.missing}). Duke usually fills them in within a day or two.</p>}
        </>
      )}
    </div>
  );
}
