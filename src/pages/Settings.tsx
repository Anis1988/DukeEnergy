import { useEffect, useState } from 'react';
import { Chips } from '../components/ui';
import { disconnect, getCode, getSent, saveSettings, setCode, testAlert } from '../lib/api';
import { DEFAULT_SERVER, getServer, isNative, setServer } from '../lib/native';
import { getTheme, setTheme, type Theme } from '../lib/prefs';
import { AI_MODELS, aiModel, type Thoroughness } from '../lib/aiModels';
import type { Alerts, Ev, Meter, Settings as S, Status } from '../lib/types';

export function Settings({ status, meters, serial, setSerial, onChange }: { status: Status; meters: Meter[]; serial: string; setSerial: (s: string) => void; onChange: () => void }) {
  const [form, setForm] = useState({ price: String(status.settings.price), fixed: String(status.settings.fixed), goal: String(status.settings.goal || '') });
  const [saved, setSaved] = useState('');
  const [theme, setT] = useState<Theme>(getTheme());
  const [code, setC] = useState(getCode());
  const [server, setS] = useState(getServer());

  const save = async () => {
    const next: Partial<S> = { price: Number(form.price), fixed: Number(form.fixed), goal: Number(form.goal || 0) };
    try {
      await saveSettings(next);
      setSaved('✅ Saved');
      onChange();
    } catch (e) {
      setSaved(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="card">
        <h2 className="font-display text-lg font-semibold">🔌 Duke Energy</h2>
        {status.connected ? (
          <>
            <p className="mt-1 text-sm">Connected{status.email ? <> as <b>{status.email}</b></> : ''}{status.since ? ` since ${new Date(status.since).toLocaleDateString()}` : ''}.</p>
            {meters.length > 1 && (
              <label className="mt-3 block text-sm">
                <span className="label">Meter</span>
                <select className="input mt-1" value={serial} onChange={(e) => setSerial(e.target.value)}>
                  {meters.map((m) => <option key={m.serial} value={m.serial}>{m.serviceType.toLowerCase()} · {m.address || `account …${m.account}`}</option>)}
                </select>
              </label>
            )}
            <div className="mt-3 flex gap-2">
              <button className="btn flex-1" onClick={() => window.dispatchEvent(new Event('ww-relogin'))}>Connect again</button>
              <button
                className="btn flex-1 text-bad"
                onClick={async () => {
                  if (!confirm('Disconnect from Duke Energy? The login is removed from your server.')) return;
                  await disconnect().catch(() => undefined);
                  onChange();
                }}
              >Disconnect</button>
            </div>
          </>
        ) : <p className="mt-1 text-sm text-muted">Not connected.</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">💲 Your price</h2>
        <p className="text-sm text-muted">From your bill: the total for electricity divided by the kWh used is the easiest all-in price. Used for every “about $” in the app.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm"><span className="label">Per kWh ($)</span><input className="input mt-1" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label className="text-sm"><span className="label">Basic charge / month ($)</span><input className="input mt-1" inputMode="decimal" value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} /></label>
        </div>
        <label className="block text-sm"><span className="label">Monthly goal (kWh, optional)</span><input className="input mt-1" inputMode="numeric" placeholder="e.g. 900" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={() => void save()}>Save</button>
          <span className="text-sm">{saved}</span>
        </div>
      </section>

      <AiSection status={status} onChange={onChange} />

      <CarsSection status={status} onChange={onChange} />

      <AlertsSection status={status} onChange={onChange} />

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">🌗 Look</h2>
        <Chips value={theme} onChange={(t) => { setT(t); setTheme(t); }} options={[['light', '☀️ Light'], ['dark', '🌙 Dark']]} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">📱 This device</h2>
        <label className="block text-sm"><span className="label">Access code</span><input className="input mt-1" type="password" value={code} onChange={(e) => setC(e.target.value)} onBlur={() => { setCode(code); onChange(); }} /></label>
        {isNative() && (
          <label className="block text-sm">
            <span className="label">Your site’s address</span>
            <input className="input mt-1" value={server} placeholder={DEFAULT_SERVER} onChange={(e) => setS(e.target.value)} onBlur={() => { setServer(server); onChange(); }} />
          </label>
        )}
      </section>

      <p className="px-1 text-xs text-muted">
        Watt Watch is a personal app, not made by or linked to Duke Energy. It reads your usage the way Duke’s phone app
        does, so if Duke changes its app this may stop working until it is updated. Costs are estimates; your bill is
        what counts.
      </p>
    </div>
  );
}

const newTopic = () => `wattwatch-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')}`;

/** 🔔 Morning alerts through ntfy (a free notification app): the server checks yesterday every morning. */
function AlertsSection({ status, onChange }: { status: Status; onChange: () => void }) {
  const [a, setA] = useState<Alerts>({ ...status.settings.alerts, topic: status.settings.alerts.topic || newTopic() });
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<{ at: string; title: string; text: string }[]>([]);
  useEffect(() => { getSent().then((r) => setSent(r.sent)).catch(() => undefined); }, []);
  const save = async (next: Alerts, msg = '✅ Saved') => {
    try {
      await saveSettings({ alerts: next });
      setNote(msg);
      onChange();
    } catch (e) {
      setNote(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const test = async () => {
    setNote('Sending…');
    try {
      await saveSettings({ alerts: a });
      await testAlert();
      setNote('✅ Sent: it should pop up on your phone in a few seconds.');
    } catch (e) {
      setNote(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <section className="card space-y-3">
      <h2 className="font-display text-lg font-semibold">🔔 Alerts</h2>
      <p className="text-sm text-muted">Every morning the server looks at yesterday. If it was much higher than usual (or the month is heading over your goal, or the Duke login stopped), your phone gets a notification.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Install the free <b>ntfy</b> app (Play Store or App Store).</li>
        <li>In ntfy tap <b>+</b>, and subscribe to this topic:</li>
      </ol>
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1 font-mono text-sm" readOnly value={a.topic} onFocus={(e) => e.target.select()} />
        <button className="btn" onClick={() => void navigator.clipboard?.writeText(a.topic).then(() => setNote('📋 Copied'))}>Copy</button>
      </div>
      <p className="text-xs text-muted">Keep the topic private: anyone who knows it can read these alerts.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={a.on} onChange={(e) => { const next = { ...a, on: e.target.checked }; setA(next); void save(next, e.target.checked ? '✅ Alerts on' : 'Alerts off'); }} />
        Send me alerts
      </label>
      <label className="block text-sm">
        <span className="label">Alert when a day is at least this much above usual</span>
        <select className="input mt-1" value={a.pct} onChange={(e) => { const next = { ...a, pct: Number(e.target.value) }; setA(next); void save(next); }}>
          {[20, 30, 40, 50, 75, 100].map((p) => <option key={p} value={p}>{p}% more</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={a.goal} onChange={(e) => { const next = { ...a, goal: e.target.checked }; setA(next); void save(next); }} />
        Also when the month is heading over my goal
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={() => void test()}>Send a test</button>
        <span className="text-sm">{note}</span>
      </div>
      <CronSecret on={status.cronSecret} />
      {sent.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Last alerts ({sent.length})</summary>
          <ul className="mt-2 space-y-2">
            {sent.slice(0, 10).map((x) => (
              <li key={x.at} className="rounded-lg bg-bg p-2"><b>{x.title}</b><br /><span className="text-muted">{new Date(x.at).toLocaleString()}</span><br />{x.text}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** 🚗 Electric cars charged at home. */
function CarsSection({ status, onChange }: { status: Status; onChange: () => void }) {
  const [ev, setEv] = useState<Ev>(status.settings.ev);
  const [form, setForm] = useState({ kw: String(ev.chargerKw), mi: String(ev.milesPerKwh) });
  const [note, setNote] = useState('');
  const save = async (next: Ev) => {
    setEv(next);
    try {
      await saveSettings({ ev: next });
      setNote('✅ Saved');
      onChange();
    } catch (e) {
      setNote(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };
  return (
    <section className="card space-y-3">
      <h2 className="font-display text-lg font-semibold">🚗 Electric cars</h2>
      <p className="text-sm text-muted">The app finds car charging in your hourly use (several hours well above your home’s normal level) and shows its cost in 💡 Insights and ⏱️ Hours.</p>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <label><span className="label">Cars</span>
          <select className="input mt-1" value={ev.cars} onChange={(e) => void save({ ...ev, cars: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}
          </select>
        </label>
        <label><span className="label">Charger kW</span>
          <input className="input mt-1" inputMode="decimal" value={form.kw} onChange={(e) => setForm({ ...form, kw: e.target.value })} onBlur={() => void save({ ...ev, chargerKw: num(form.kw, ev.chargerKw) })} />
        </label>
        <label><span className="label">Miles / kWh</span>
          <input className="input mt-1" inputMode="decimal" value={form.mi} onChange={(e) => setForm({ ...form, mi: e.target.value })} onBlur={() => void save({ ...ev, milesPerKwh: num(form.mi, ev.milesPerKwh) })} />
        </label>
      </div>
      <p className="text-xs text-muted">Charger kW: a wall charger (Level 2) is usually 7.2–11.5 kW; it’s on the charger or in the car’s app. Miles / kWh: about 3–4 for most cars.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={ev.excludeFromAlerts} onChange={(e) => void save({ ...ev, excludeFromAlerts: e.target.checked })} />
        Don’t count car charging in “high use” alerts
      </label>
      {note && <p className="text-sm">{note}</p>}
    </section>
  );
}

/**
 * CRON_SECRET lives in Vercel (only Vercel's scheduler can send it), so the app can't store it: it makes a strong
 * one to copy and says whether Vercel has one.
 */
function CronSecret({ on }: { on: boolean }) {
  const [secret, setSecret] = useState('');
  const make = () => setSecret(Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join(''));
  return (
    <details className="rounded-xl bg-bg p-3 text-sm">
      <summary className="cursor-pointer">{on ? '✅ Morning check protected (CRON_SECRET is set)' : '🔐 Protect the morning check (optional)'}</summary>
      <div className="mt-2 space-y-2">
        <p className="text-muted">With a <code>CRON_SECRET</code>, only Vercel’s scheduler can start the morning check. It has to be added on Vercel (the app can’t set it):</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><button className="btn px-3 py-1.5" onClick={make}>Make a secret</button></li>
          {secret && (
            <li>
              <div className="flex gap-2">
                <input className="input min-w-0 flex-1 py-2 font-mono text-xs" readOnly value={secret} onFocus={(e) => e.target.select()} />
                <button className="btn px-3 py-1.5" onClick={() => void navigator.clipboard?.writeText(secret)}>Copy</button>
              </div>
            </li>
          )}
          <li>Vercel → your project → <b>Settings → Environment Variables</b> → Add: name <code>CRON_SECRET</code>, value = the secret → Save.</li>
          <li><b>Deployments</b> → ⋯ on the latest → <b>Redeploy</b>. This line then shows ✅.</li>
        </ol>
      </div>
    </details>
  );
}

/** 🤖 Which Anthropic model checks offers, and how thoroughly (faster = cheaper, reads less). */
function AiSection({ status, onChange }: { status: Status; onChange: () => void }) {
  const [ai, setAi] = useState(status.settings.ai);
  const [note, setNote] = useState('');
  const save = async (next: typeof ai) => {
    setAi(next);
    try {
      await saveSettings({ ai: next });
      setNote('✅ Saved');
      onChange();
    } catch (e) {
      setNote(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <section className="card space-y-3 border-ai/40">
      <h2 className="font-display text-lg font-semibold text-ai">🤖 AI</h2>
      <p className="text-sm text-muted">Used only when you tap “Ask AI” on an offer in 💲 Deals. Bigger models judge better but take longer and cost more.</p>
      <label className="block text-sm">
        <span className="label">Model</span>
        <select className="input mt-1" value={ai.model} onChange={(e) => void save({ ...ai, model: e.target.value })}>
          {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted">{aiModel(ai.model).note}</span>
      </label>
      <div className="text-sm">
        <span className="label">Thoroughness</span>
        <div className="mt-1">
          <Chips<Thoroughness> value={ai.thoroughness} onChange={(t) => void save({ ...ai, thoroughness: t })} options={[['quick', '⚡ Quick'], ['normal', 'Normal'], ['deep', '🔍 Deep']]} />
        </div>
        <span className="mt-1 block text-xs text-muted">
          {ai.thoroughness === 'quick' ? 'Reads the sign-up page and contract, a couple of searches: fastest and cheapest.' : ai.thoroughness === 'deep' ? 'Reads more pages and thinks longer: slowest, most careful.' : 'A good balance.'}
          {' '}The server stops a check after 5 minutes; if that happens, pick a faster model or Quick.
        </span>
      </div>
      {note && <p className="text-sm">{note}</p>}
    </section>
  );
}
