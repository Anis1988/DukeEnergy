import { useState } from 'react';
import { Chips } from '../components/ui';
import { disconnect, getCode, saveSettings, setCode } from '../lib/api';
import { DEFAULT_SERVER, getServer, isNative, setServer } from '../lib/native';
import { getTheme, setTheme, type Theme } from '../lib/prefs';
import type { Meter, Settings as S, Status } from '../lib/types';

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
