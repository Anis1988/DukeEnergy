import { BarChart } from '../components/Chart';
import { ErrorBox, Spinner, useData } from '../components/ui';
import { getUsage } from '../lib/api';
import { addDays, addMonths, kwh, monthEnd, monthName, monthStart, money } from '../lib/dates';
import type { Settings } from '../lib/types';

export function Months({ serial, today, settings }: { serial: string; today: string; settings: Settings }) {
  const end = addDays(today, -1);
  const first = addMonths(monthStart(end), -12);
  const q = useData(`m:${serial}:${first}:${end}`, () => getUsage(serial, 'DAILY', first, end));
  const months = Array.from({ length: 13 }, (_, i) => addMonths(first, i)).map((m) => {
    const pts = (q.data?.points ?? []).filter((p) => p.t.startsWith(m.slice(0, 7)));
    const used = pts.reduce((s, p) => s + p.kwh, 0);
    const temps = pts.map((p) => p.temp).filter((t): t is number => t != null);
    const partial = m === monthStart(end) || pts.length < Number(monthEnd(m).slice(8)) - 2;
    return { m, used, days: pts.length, temp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null, partial };
  });
  const sameLastYear = months[0];
  const now = months[12];

  const bars = months.map((x) => ({
    key: x.m,
    value: x.used || null,
    label: monthName(x.m).slice(0, 3),
    faint: x.partial,
    tip: <span><b>{kwh(x.used)}</b> · about {money(x.used * settings.price + settings.fixed)}<br />{monthName(x.m, 'long')} · {x.days} days{x.partial ? ' (not complete)' : ''}</span>,
  }));

  return (
    <div className="space-y-4">
      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <Spinner label="Asking Duke Energy for the last 12 months (the first time takes a little while)…" /> : (
        <>
          <section className="card">
            <h2 className="mb-2 font-display text-lg font-semibold">Month by month</h2>
            <BarChart bars={bars} height={220} />
            <p className="mt-2 text-xs text-muted">Faded bars are months with missing or not-yet-finished days.</p>
          </section>
          {sameLastYear.days > 0 && now.days > 0 && (
            <p className="card text-sm">
              Per day this month: <b>{kwh(now.used / now.days)}</b>. In {monthName(sameLastYear.m, 'long')}: <b>{kwh(sameLastYear.used / sameLastYear.days)}</b>.
            </p>
          )}
          <section className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label p-3">Month</th><th className="label p-3 text-right">kWh</th><th className="label p-3 text-right">Cost (est.)</th><th className="label hidden p-3 text-right sm:table-cell">Per day</th><th className="label p-3 text-right">Temp</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((x) => (
                  <tr key={x.m} className="border-b border-line last:border-0">
                    <td className="p-3">{monthName(x.m, 'long')}{x.partial && <span className="text-muted"> *</span>}</td>
                    <td className="p-3 text-right tabular-nums">{x.used ? x.used.toFixed(0) : '–'}</td>
                    <td className="p-3 text-right tabular-nums">{x.used ? money(x.used * settings.price + settings.fixed) : '–'}</td>
                    <td className="hidden p-3 text-right tabular-nums sm:table-cell">{x.days ? (x.used / x.days).toFixed(1) : '–'}</td>
                    <td className="p-3 text-right tabular-nums">{x.temp != null ? `${x.temp.toFixed(0)}°` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
