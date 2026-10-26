import { useEffect, useState } from 'react';
import { Chips } from '../components/ui';
import { disconnect, getCode, getSent, saveSettings, setCode, testAlert } from '../lib/api';
import { DEFAULT_SERVER, getServer, isNative, setServer } from '../lib/native';
import { getTheme, setTheme, type Theme } from '../lib/prefs';
import type { Alerts, Meter, Settings as S, Status } from '../lib/types';

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
