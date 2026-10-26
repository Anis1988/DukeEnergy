import { useCallback, useEffect, useState } from 'react';
import { ErrorBox, Spinner, clearData, useData } from './components/ui';
import { ApiError, getCode, getMeters, getStatus, setCode } from './lib/api';
import { addDays } from './lib/dates';
import { getServer, isNative, setServer } from './lib/native';
import { getMeter, setMeter } from './lib/prefs';
import type { Status } from './lib/types';
import { Connect } from './pages/Connect';
import { Guide } from './pages/Guide';
import { Hourly } from './pages/Hourly';
import { Insights } from './pages/Insights';
import { Months } from './pages/Months';
import { Overview } from './pages/Overview';
import { Settings } from './pages/Settings';

type Page = 'overview' | 'hours' | 'months' | 'insights' | 'settings' | 'guide';
const TABS: [Page, string, string][] = [
  ['overview', '📊', 'Overview'],
  ['hours', '⏱️', 'Hours'],
  ['months', '📆', 'Months'],
  ['insights', '💡', 'Insights'],
  ['settings', '⚙️', 'Settings'],
];
const pageFromPath = (): Page => {
  const p = window.location.pathname.replace(/^\//, '') as Page;
  return ['overview', 'hours', 'months', 'insights', 'settings', 'guide'].includes(p) ? p : 'overview';
};

export default function App() {
  const [page, setPageState] = useState<Page>(pageFromPath);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<unknown>(null);
  const [relogin, setRelogin] = useState(false);
  const [needCode, setNeedCode] = useState(!getCode());
  const [day, setDay] = useState('');
  const [serial, setSerialState] = useState(getMeter());

  const setPage = (p: Page) => {
    setPageState(p);
    window.history.pushState(null, '', p === 'overview' ? '/' : `/${p}`);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const back = () => setPageState(pageFromPath());
    const unauth = () => setNeedCode(true);
    const again = () => setRelogin(true);
    window.addEventListener('popstate', back);
    window.addEventListener('ww-unauthorized', unauth);
    window.addEventListener('ww-relogin', again);
    return () => {
      window.removeEventListener('popstate', back);
      window.removeEventListener('ww-unauthorized', unauth);
      window.removeEventListener('ww-relogin', again);
    };
  }, []);

  const loadStatus = useCallback(() => {
    setStatusError(null);
    getStatus()
      .then((s) => { setStatus(s); setNeedCode(false); })
      .catch((e) => { if (e instanceof ApiError && e.status === 401) setNeedCode(true); else setStatusError(e); });
  }, []);
  useEffect(() => { if (!needCode) loadStatus(); }, [needCode, loadStatus]);

  const connected = !!status?.connected && !relogin;
  const m = useData(connected ? 'meters' : null, () => getMeters());
  const meters = m.data?.meters ?? [];
  const meter = meters.find((x) => x.serial === serial) ?? meters.find((x) => x.serviceType === 'ELECTRIC') ?? meters[0];
  const today = m.data?.today ?? new Date().toISOString().slice(0, 10);
  const setSerial = (s: string) => { setSerialState(s); setMeter(s); };

  let body;
  if (needCode) body = <AccessCode onDone={() => setNeedCode(false)} />;
  else if (statusError) body = (
    <div className="mx-auto max-w-sm space-y-4">
      <ErrorBox error={statusError} onRetry={loadStatus} />
      {isNative() && <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); loadStatus(); }}><ServerField /><button className="btn-primary w-full">Try this address</button></form>}
    </div>
  );
  else if (!status) body = <Spinner />;
  else if (page === 'guide') body = <Guide />;
  else if (!status.storage) body = <SetupNeeded />;
  else if (!connected) body = <Connect again={relogin} onDone={() => { setRelogin(false); clearData(); m.reload(); loadStatus(); }} />;
  else if (page === 'settings') body = <Settings status={status} meters={meters} serial={meter?.serial ?? ''} setSerial={setSerial} onChange={() => { clearData(); loadStatus(); }} />;
  else if (m.error) body = <ErrorBox error={m.error} onRetry={m.reload} />;
  else if (!meter) body = <Spinner label="Finding your meter…" />;
  else if (page === 'hours') body = <Hourly serial={meter.serial} today={today} settings={status.settings} day={day || addDays(today, -1)} setDay={setDay} />;
  else if (page === 'insights') body = <Insights serial={meter.serial} today={today} settings={status.settings} onSaved={loadStatus} />;
  else if (page === 'months') body = <Months serial={meter.serial} today={today} settings={status.settings} />;
  else body = <Overview serial={meter.serial} today={today} settings={status.settings} onDay={(d) => { setDay(d); setPage('hours'); }} />;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:pb-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <button className="flex items-center gap-2" onClick={() => setPage('overview')}>
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <div className="text-left">
            <h1 className="font-display text-lg font-bold leading-tight">Watt Watch</h1>
            {meter?.address && <p className="text-xs text-muted">{meter.address}</p>}
          </div>
        </button>
        <button className="btn h-9 w-9 rounded-full p-0" aria-label="Guide" aria-pressed={page === 'guide'} onClick={() => setPage(page === 'guide' ? 'overview' : 'guide')}>❓</button>
      </header>

      {/* Tabs: at the top on big screens, at the bottom (thumb reach) on phones. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static sm:mb-4 sm:rounded-2xl sm:border">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map(([p, icon, label]) => (
            <button key={p} onClick={() => setPage(p)} aria-current={page === p ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium sm:flex-row sm:justify-center sm:gap-2 sm:py-3 sm:text-sm ${page === p ? 'text-accent' : 'text-muted'}`}>
              <span className="text-lg sm:text-base">{icon}</span>{label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1">{body}</main>
    </div>
  );
}

function AccessCode({ onDone }: { onDone: () => void }) {
  const [code, setC] = useState(getCode());
  return (
    <form className="card mx-auto max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); setCode(code); onDone(); }}>
      {isNative() && <ServerField />}
      <h2 className="font-display text-lg font-semibold">🔒 Access code</h2>
      <p className="text-sm text-muted">The password you set as <code>APP_ACCESS_TOKEN</code> on Vercel. Asked once per device.</p>
      <input className="input" type="password" autoFocus value={code} onChange={(e) => setC(e.target.value)} />
      <button className="btn-primary w-full" disabled={!code.trim()}>Continue</button>
    </form>
  );
}

function SetupNeeded() {
  return (
    <section className="card mx-auto max-w-lg space-y-2 text-sm">
      <h2 className="font-display text-lg font-semibold">One more step on Vercel</h2>
      <p>The app needs a small free database to keep your Duke login: Vercel → your project → <b>Storage</b> → Create → <b>Upstash for Redis</b> → connect it to this project, then <b>Redeploy</b>.</p>
    </section>
  );
}

/** Android app: the address of your Watt Watch website (Vercel), where the app's data comes from. */
function ServerField() {
  const [server, setS] = useState(getServer());
  return (
    <label className="block text-sm">
      <span className="label">Your site’s address</span>
      <input className="input mt-1" inputMode="url" autoCapitalize="off" autoCorrect="off" value={server} placeholder="https://your-site.vercel.app" onChange={(e) => { setS(e.target.value); setServer(e.target.value); }} />
      <span className="mt-1 block text-xs text-muted">The address you open Watt Watch at in a browser (Vercel → your project → Domains).</span>
    </label>
  );
}
