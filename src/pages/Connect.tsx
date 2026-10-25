import { useState } from 'react';
import { finishLogin } from '../lib/api';
import { CALLBACK_PREFIX, codeFrom } from '../lib/dukeConfig';
import { isNative, nativeLogin } from '../lib/native';
import { clearVerifier, loginUrl, savedVerifier } from '../lib/pkce';

/**
 * Connecting to Duke: log in on Duke's own page (it has a "not a robot" check, so it can't be done for you), then
 * hand the app the address Duke lands on. The Android app catches that address by itself.
 */
export function Connect({ onDone, again }: { onDone: () => void; again?: boolean }) {
  const [step, setStep] = useState<1 | 2>(savedVerifier() ? 2 : 1);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const finish = async (address: string) => {
    if (/[?&]error=access_denied/.test(address)) {
      setError(isNative()
        ? 'Duke refused the login. Tap “Open Duke login” and try again.'
        : 'Duke refused the login because it saw a computer or Android browser (it only accepts iPhones there). Follow “Not on an iPhone?” under step 1, then do step 1 again.');
      return;
    }
    if (!codeFrom(address)) {
      setError('No login code in that address. Copy the whole address of the page Duke showed after you logged in (it has “code=” in it).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await finishLogin(address, savedVerifier());
      clearVerifier();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    setError('');
    const url = await loginUrl();
    if (isNative()) {
      try {
        const landed = await nativeLogin(url, CALLBACK_PREFIX);
        await finish(landed);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (!/cancel/i.test(m)) setError(m);
      }
      return;
    }
    window.open(url, '_blank', 'noopener');
    setStep(2);
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setPasted(t);
      if (codeFrom(t) || /error=/.test(t)) void finish(t);
    } catch {
      setError('Your browser did not allow pasting with the button: long-press the box and choose Paste.');
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="card">
        <h2 className="font-display text-xl font-semibold">{again ? 'Connect to Duke Energy again' : 'Connect your Duke Energy account'}</h2>
        <p className="mt-1 text-sm text-muted">
          {again ? 'Duke ended the login (this happens after a long time, or if you changed your password). ' : ''}
          You log in once on Duke Energy’s own page. Your password never goes through this app; it only keeps the
          login pass Duke gives back, on your own server.
        </p>
      </section>

      <section className={`card ${step === 1 ? 'border-accent/50' : ''}`}>
        <p className="label">Step 1</p>
        <p className="mt-1 text-sm">Log in with your Duke Energy email and password.</p>
        <button className="btn-primary mt-3 w-full" onClick={() => void open()} disabled={busy}>🔑 Open Duke login</button>
        {!isNative() && !IPHONE && <NotIphone />}
      </section>

      {!isNative() && (
        <section className={`card ${step === 2 ? 'border-accent/50' : ''}`}>
          <p className="label">Step 2</p>
          <p className="mt-1 text-sm">
            After you log in, Duke shows a “Not Found” or “Access Denied” page. <b>That’s normal</b>: the code is in its address. Copy that page’s
            whole address (tap the address bar → copy), come back here and paste it.
          </p>
          <textarea
            className="input mt-3 h-24 resize-none font-mono text-xs"
            placeholder="https://login.duke-energy.com/ios/…?code=…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn flex-1" onClick={() => void paste()} disabled={busy}>📋 Paste</button>
            <button className="btn-primary flex-1" onClick={() => void finish(pasted)} disabled={busy || !pasted.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
          </div>
          <p className="mt-2 text-xs text-muted">The address works only once and for a few minutes. If it fails, do step 1 again.</p>
        </section>
      )}

      {error && <p className="card border-bad/40 text-sm text-bad">⚠️ {error}</p>}
      {busy && isNative() && <p className="text-center text-sm text-muted">Connecting…</p>}
    </div>
  );
}

const IPHONE = /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Duke's login gives a code only to iPhones (it is the iPhone app's login): other browsers get
 * "error=access_denied". The Android app pretends to be an iPhone by itself; in a computer browser it's one setting.
 */
function NotIphone() {
  return (
    <details className="mt-3 rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm" open>
      <summary className="cursor-pointer font-semibold text-warn">⚠️ Not on an iPhone? Read this first</summary>
      <p className="mt-2">Duke’s login only works when it thinks you’re on an iPhone; otherwise it ends with <code>error=access_denied</code>.</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li><b>Android phone:</b> use the Watt Watch Android app instead. It handles this for you.</li>
        <li><b>Chrome or Edge on a computer:</b> tap Open Duke login, then in that new tab press <b>F12</b>, then <b>Ctrl+Shift+M</b> (Mac: Cmd+Shift+M), pick an <b>iPhone</b> at the top of the page, and press <b>F5</b> to reload. Log in there.</li>
        <li><b>Firefox:</b> same idea: in the new tab press <b>Ctrl+Shift+M</b>, pick an iPhone, reload.</li>
        <li><b>Safari on a Mac:</b> Develop menu → User Agent → an iPhone Safari, then reload.</li>
      </ul>
    </details>
  );
}
