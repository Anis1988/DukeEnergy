import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface Bar {
  key: string;
  value: number | null;
  /** Shown under the bar (only some are shown when crowded). */
  label: string;
  /** Tooltip lines. */
  tip: ReactNode;
  /** Drawn in the strong colour (the peak, today…). */
  strong?: boolean;
  /** Drawn faded (not final yet, or missing). */
  faint?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const fmtTick = (v: number) => (v >= 10 ? v.toFixed(0) : String(Math.round(v * 100) / 100));

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PAD = { top: 10, right: 6, bottom: 22, left: 34 };

/** Bars for one measure (kWh). Hover or tap a bar for its numbers. */
export function BarChart({ bars, height = 200, unit = 'kWh', avg, onPick }: { bars: Bar[]; height?: number; unit?: string; avg?: number; onPick?: (key: string) => void }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value ?? 0), avg ?? 0));
  const iw = Math.max(0, w - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const slot = bars.length ? iw / bars.length : 0;
  const gap = Math.min(2 + slot * 0.18, 6);
  const bw = Math.max(1, slot - gap);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(bars.length / Math.max(1, Math.floor(iw / 38))));
  const ticks = [0, max / 2, max];

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !slot) return null;
    const i = Math.floor((clientX - r.left - PAD.left) / slot);
    return i >= 0 && i < bars.length ? i : null;
  };
  const h = hover !== null ? bars[hover] : null;

  return (
    <div
      ref={ref}
      className="relative w-full select-none touch-pan-y"
      style={{ height }}
      onPointerMove={(e) => setHover(pick(e.clientX))}
      onPointerDown={(e) => setHover(pick(e.clientX))}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      onClick={(e) => {
        const i = pick(e.clientX);
        if (i !== null && onPick) onPick(bars[i].key);
      }}
      role="img"
      aria-label={`Bar chart, ${bars.length} bars, in ${unit}`}
    >
      {w > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="stroke-grid" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px]">{fmtTick(t)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            if (b.value == null || b.value <= 0) return null;
            const x = PAD.left + i * slot + gap / 2;
            const top = y(b.value);
            const r = Math.min(4, bw / 2, PAD.top + ih - top);
            const base = PAD.top + ih;
            const d = `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`;
            return <path key={b.key} d={d} className={b.strong ? 'fill-strong' : 'fill-bar'} opacity={b.faint ? 0.45 : hover === null || hover === i ? 1 : 0.6} />;
          })}
          {avg !== undefined && avg > 0 && (
            <g>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(avg)} y2={y(avg)} className="stroke-ink" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
              <text x={w - PAD.right} y={y(avg) - 4} textAnchor="end" className="fill-muted text-[10px]">avg {fmtTick(avg)}</text>
            </g>
          )}
          {bars.map((b, i) =>
            i % every === 0 ? (
              <text key={b.key} x={PAD.left + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">{b.label}</text>
            ) : null,
          )}
          {hover !== null && <rect x={PAD.left + hover * slot} y={PAD.top} width={slot} height={ih} className="fill-ink" opacity={0.05} />}
        </svg>
      )}
      {h && (
        <div
          className="tip"
          style={{ left: Math.min(Math.max(PAD.left + (hover! + 0.5) * slot, 70), w - 70), top: 0 }}
        >
          {h.tip}
        </div>
      )}
    </div>
  );
}

/** A thin line for one measure (outside temperature), with a crosshair. */
export function LineChart({ points, height = 120, unit = '°F' }: { points: { key: string; label: string; value: number | null }[]; height?: number; unit?: string }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) / 10) * 10;
  const hi = Math.ceil(Math.max(...vals) / 10) * 10 || lo + 10;
  const iw = Math.max(0, w - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const slot = points.length ? iw / points.length : 0;
  const x = (i: number) => PAD.left + i * slot + slot / 2;
  const y = (v: number) => PAD.top + ih - ((v - lo) / Math.max(1, hi - lo)) * ih;
  let d = '';
  points.forEach((p, i) => {
    if (p.value == null) return;
    d += `${d && points[i - 1]?.value != null ? 'L' : 'M'}${x(i)},${y(p.value)}`;
  });
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(iw / 38))));
  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !slot) return null;
    const i = Math.floor((clientX - r.left - PAD.left) / slot);
    return i >= 0 && i < points.length ? i : null;
  };
  const hp = hover !== null ? points[hover] : null;
  return (
    <div
      ref={ref}
      className="relative w-full select-none touch-pan-y"
      style={{ height }}
      onPointerMove={(e) => setHover(pick(e.clientX))}
      onPointerDown={(e) => setHover(pick(e.clientX))}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      role="img"
      aria-label={`Line chart in ${unit}`}
    >
      {w > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {[lo, hi].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="stroke-grid" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px]">{t}°</text>
            </g>
          ))}
          <path d={d} fill="none" className="stroke-temp" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (i % every === 0 ? <text key={p.key} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">{p.label}</text> : null))}
          {hp && hp.value != null && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + ih} className="stroke-ink" opacity={0.25} />
              <circle cx={x(hover!)} cy={y(hp.value)} r={4} className="fill-temp stroke-card" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hp && hp.value != null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hover!), 50), w - 50), top: 0 }}>
          <b>{hp.value.toFixed(0)}{unit}</b> · {hp.label}
        </div>
      )}
    </div>
  );
}

/** Dots (one per day: temperature → kWh) and the fitted curve. Hover or tap near a dot for its day. */
export function ScatterChart({ points, curve, height = 240 }: { points: { key: string; x: number; y: number; tip: ReactNode }[]; curve?: (x: number) => number; height?: number }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const lo = Math.floor(Math.min(...points.map((p) => p.x)) / 10) * 10;
  const hi = Math.ceil(Math.max(...points.map((p) => p.x)) / 10) * 10 || lo + 10;
  const max = niceMax(Math.max(...points.map((p) => p.y)));
  const pad = { ...PAD, bottom: 26 };
  const iw = Math.max(0, w - pad.left - pad.right);
  const ih = height - pad.top - pad.bottom;
  const x = (v: number) => pad.left + ((v - lo) / Math.max(1, hi - lo)) * iw;
  const y = (v: number) => pad.top + ih - (Math.min(v, max) / max) * ih;
  let d = '';
  if (curve) for (let t = lo; t <= hi; t += 0.5) d += `${d ? 'L' : 'M'}${x(t)},${y(Math.max(0, curve(t)))}`;
  const xTicks = Array.from({ length: Math.floor((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10);
  const pick = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    let bestI = -1, bestD = 24 ** 2;
    points.forEach((p, i) => { const dd = (x(p.x) - (cx - r.left)) ** 2 + (y(p.y) - (cy - r.top)) ** 2; if (dd < bestD) { bestD = dd; bestI = i; } });
    return bestI >= 0 ? bestI : null;
  };
  const hp = hover !== null ? points[hover] : null;
  return (
    <div
      ref={ref}
      className="relative w-full select-none touch-pan-y"
      style={{ height }}
      onPointerMove={(e) => setHover(pick(e.clientX, e.clientY))}
      onPointerDown={(e) => setHover(pick(e.clientX, e.clientY))}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      role="img"
      aria-label="Daily use against outside temperature"
    >
      {w > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} className="stroke-grid" strokeWidth={1} />
              <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px]">{fmtTick(t)}</text>
            </g>
          ))}
          {xTicks.map((t) => <text key={t} x={x(t)} y={height - 8} textAnchor="middle" className="fill-muted text-[10px]">{t}°F</text>)}
          {points.map((p, i) => <circle key={p.key} cx={x(p.x)} cy={y(p.y)} r={hover === i ? 5 : 3} className="fill-bar" opacity={hover === null || hover === i ? 0.75 : 0.35} />)}
          {d && <path d={d} fill="none" className="stroke-strong" strokeWidth={2} strokeLinejoin="round" />}
          {hp && <circle cx={x(hp.x)} cy={y(hp.y)} r={6} fill="none" className="stroke-ink" strokeWidth={1.5} />}
        </svg>
      )}
      {hp && <div className="tip" style={{ left: Math.min(Math.max(x(hp.x), 80), w - 80), top: Math.max(0, y(hp.y) - 8) }}>{hp.tip}</div>}
    </div>
  );
}
