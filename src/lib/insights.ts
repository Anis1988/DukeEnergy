import type { Plan, Point } from './types';

/* ---------- ⏰ Time-of-use plan check ---------- */

const inWindow = (h: number, start: number, end: number) => (start === end ? false : start < end ? h >= start && h < end : h >= start || h < end);
const weekend = (day: string) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());

export type Band = 'peak' | 'night' | 'off';
/** Which price an hour gets: overnight first (it may cover weekends too), then peak, else off-peak. */
export function band(plan: Plan, day: string, h: number): Band {
  if (inWindow(h, plan.nightStart, plan.nightEnd)) return 'night';
  if (inWindow(h, plan.peakStart, plan.peakEnd) && !(plan.weekdaysOnly && weekend(day))) return 'peak';
  return 'off';
}

export interface PlanResult {
  days: number;
  kwh: Record<Band, number>;
  /** Energy cost over the period. */
  now: number;
  plan: number;
  /** Per 30 days, with each plan's fixed charge. */
  nowMonth: number;
  planMonth: number;
  /** Plan cost per 30 days if `shift` (0–1) of peak use moved to off-peak hours. */
  shifted: (shift: number) => number;
}

export function comparePlan(points: Point[], plan: Plan, price: number, fixed: number): PlanResult | null {
  const kwh: Record<Band, number> = { peak: 0, night: 0, off: 0 };
  const days = new Set<string>();
  for (const p of points) {
    const day = p.t.slice(0, 10);
    days.add(day);
    kwh[band(plan, day, Number(p.t.slice(11, 13)))] += p.kwh;
  }
  if (days.size < 7) return null;
  const total = kwh.peak + kwh.night + kwh.off;
  const scale = 30.4 / days.size;
  const planCost = (k: Record<Band, number>) => k.peak * plan.peak + k.night * plan.night + k.off * plan.offPeak;
  return {
    days: days.size,
    kwh,
    now: total * price,
    plan: planCost(kwh),
    nowMonth: total * price * scale + fixed,
    planMonth: planCost(kwh) * scale + plan.fixed,
    shifted: (shift) => planCost({ ...kwh, peak: kwh.peak * (1 - shift), off: kwh.off + kwh.peak * shift }) * scale + plan.fixed,
  };
}

/* ---------- 🌡️ Weather effect ---------- */

export interface WeatherFit {
  /** Balance temperature (°F): below it heating starts, above it cooling. */
  balance: number;
  /** kWh per day with no heating or cooling. */
  base: number;
  /** kWh per day for each °F below / above the balance temperature. */
  heat: number;
  cool: number;
  /** How well the line fits (0–1). */
  r2: number;
  days: number;
  predict: (temp: number) => number;
}

/** Solves a 3×3 linear system (Gaussian elimination); null when it has no single answer. */
function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-9) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row, i) => row[3] / row[i]);
}

/**
 * kWh/day = base + heat × (degrees below B) + cool × (degrees above B), the classic "degree-day" model; B is tried
 * from 50 to 72 °F and the best fit kept. Needs at least 30 days with a temperature.
 */
export function weatherFit(points: Point[]): WeatherFit | null {
  const rows = points.filter((p) => p.temp != null && p.kwh > 0) as (Point & { temp: number })[];
  if (rows.length < 30) return null;
  const mean = rows.reduce((s, p) => s + p.kwh, 0) / rows.length;
  const total = rows.reduce((s, p) => s + (p.kwh - mean) ** 2, 0);
  let best: WeatherFit | null = null;
  for (let b = 50; b <= 72; b++) {
    const x = rows.map((p) => [1, Math.max(0, b - p.temp), Math.max(0, p.temp - b)]);
    const m = [0, 1, 2].map((i) => [0, 1, 2].map((j) => x.reduce((s, r) => s + r[i] * r[j], 0)));
    const v = [0, 1, 2].map((i) => x.reduce((s, r, k) => s + r[i] * rows[k].kwh, 0));
    let c = solve3(m, v);
    if (!c) {
      // All days on one side of B (e.g. only summer so far): fit base + that side only.
      const side = x.some((r) => r[1] > 0) ? 1 : 2;
      const n = rows.length, sx = x.reduce((s, r) => s + r[side], 0), sxx = x.reduce((s, r) => s + r[side] ** 2, 0);
      const sy = rows.reduce((s, p) => s + p.kwh, 0), sxy = x.reduce((s, r, k) => s + r[side] * rows[k].kwh, 0);
      const d = n * sxx - sx * sx;
      if (Math.abs(d) < 1e-9) continue;
      const slope = (n * sxy - sx * sy) / d;
      c = side === 1 ? [(sy - slope * sx) / n, slope, 0] : [(sy - slope * sx) / n, 0, slope];
    }
    const [base, heat, cool] = [c[0], Math.max(0, c[1]), Math.max(0, c[2])];
    const predict = (t: number) => base + heat * Math.max(0, b - t) + cool * Math.max(0, t - b);
    const err = rows.reduce((s, p) => s + (p.kwh - predict(p.temp)) ** 2, 0);
    const r2 = total > 0 ? 1 - err / total : 0;
    if (!best || r2 > best.r2) best = { balance: b, base, heat, cool, r2, days: rows.length, predict };
  }
  return best;
}
