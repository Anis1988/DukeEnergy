/** Calendar dates as "YYYY-MM-DD" strings (no time zones involved). */
const pad = (n: number) => String(n).padStart(2, '0');
const d = (s: string) => new Date(`${s}T00:00:00Z`);
export const ymd = (x: Date) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
export const addDays = (s: string, n: number) => ymd(new Date(d(s).getTime() + n * 86400_000));
export const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
export const addMonths = (s: string, n: number) => { const x = d(monthStart(s)); x.setUTCMonth(x.getUTCMonth() + n); return ymd(x); };
export const monthEnd = (s: string) => addDays(addMonths(s, 1), -1);
export const weekday = (s: string) => d(s).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
export const short = (s: string) => d(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const long = (s: string) => d(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const monthName = (s: string, len: 'short' | 'long' = 'short') => d(s).toLocaleDateString('en-US', { month: len, ...(len === 'long' ? { year: 'numeric' } : {}), timeZone: 'UTC' });
export const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
export const hourLong = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

export const kwh = (v: number) => `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} kWh`;
export const money = (v: number) => `$${v.toFixed(2)}`;
