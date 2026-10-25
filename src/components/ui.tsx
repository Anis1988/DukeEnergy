import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../lib/api';

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="card min-w-0 p-3.5">
      <p className="label truncate">{label}</p>
      <p className="mt-1 truncate font-display text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-muted'}`}>{sub}</p>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  const relogin = error instanceof ApiError && error.relogin;
  return (
    <div className="card border-bad/40 text-sm">
      <p className="font-semibold text-bad">⚠️ {relogin ? 'Duke login needed' : 'Something went wrong'}</p>
      <p className="mt-1 text-muted">{msg}</p>
      <div className="mt-3 flex gap-2">
        {relogin && <button className="btn-primary" onClick={() => window.dispatchEvent(new Event('ww-relogin'))}>Connect again</button>}
        {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

/** A row of choices (only one is on). */
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button key={v} className="chip" aria-pressed={v === value} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/** Up/down compared with before: an arrow and a word, never colour alone. */
export function Change({ now, before, unit = '' }: { now: number; before: number; unit?: string }) {
  if (!(before > 0)) return <span className="text-muted">no earlier data</span>;
  const pct = ((now - before) / before) * 100;
  const tone = Math.abs(pct) < 3 ? 'text-muted' : pct > 0 ? 'text-bad' : 'text-good';
  return <span className={tone}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '•'} {Math.abs(pct).toFixed(0)}% {pct > 0 ? 'more' : 'less'} than before{unit}</span>;
}

/** Loads data for the given key; keeps the last answer per key while the app is open. */
const memo = new Map<string, unknown>();
export function useData<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown; loading: boolean }>({ key, loading: !!key, data: key ? (memo.get(key) as T | undefined) : undefined });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const cached = memo.get(key) as T | undefined;
    setState({ key, data: cached, loading: !cached });
    if (cached && tick === 0) return;
    load()
      .then((data) => { memo.set(key, data); if (live) setState({ key, data, loading: false }); })
      .catch((error) => live && setState({ key, error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { ...state, reload: () => { if (key) memo.delete(key); setTick((t) => t + 1); } };
}
export const clearData = () => memo.clear();
