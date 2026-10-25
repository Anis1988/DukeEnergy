/** Per device: light or dark (a switch in Settings), and the meter last picked. */
export type Theme = 'light' | 'dark';
export const getTheme = (): Theme => { try { return localStorage.getItem('ww.theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
export function setTheme(t: Theme): void {
  try { localStorage.setItem('ww.theme', t); } catch { /* private mode */ }
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0E1418' : '#F4F6F3');
}
export const getMeter = () => { try { return localStorage.getItem('ww.meter') ?? ''; } catch { return ''; } };
export const setMeter = (s: string) => { try { localStorage.setItem('ww.meter', s); } catch { /* ignore */ } };
