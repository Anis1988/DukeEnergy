import { useEffect, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../lib/native';

/** The Android app's build number (GitHub run number), set when GitHub builds the app. 0 on the website. */
const APP_BUILD = Number(import.meta.env.VITE_APP_BUILD ?? 0) || 0;
const RELEASE_API = 'https://api.github.com/repos/Anis1988/DukeEnergy/releases/tags/android-latest';
const SKIP_KEY = 'ww.skipAppBuild';
const CHECK_EVERY = 30 * 60_000;

async function latestApp(): Promise<{ build: number; url: string } | null> {
  const r = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) return null;
  const j = await r.json();
  const build = Number(String(j?.body ?? '').match(/run (\d+)/)?.[1] ?? 0);
  const url = (j?.assets ?? []).find((a: { name?: string }) => a.name === 'WattWatch.apk')?.browser_download_url;
  return build && typeof url === 'string' ? { build, url } : null;
}

/** ⬆️ The app downloads the new version itself and opens Android's installer (UpdatePlugin.java). */
const Updater = registerPlugin<{ install(o: { url: string }): Promise<{ status: 'downloading' | 'allow' | 'browser' }> }>('Update');
const MESSAGES = {
  downloading: 'Downloading the update (see the notification). The installer opens when it’s ready: tap Update there.',
  allow: 'Allow Watt Watch to install updates (switch it on), come back, and tap Update again.',
  browser: 'The update opens in your browser: tap the downloaded file to install it.',
};

/** In the Android app: a banner when a newer version is on GitHub (checked on open and on return, every 30 min max). */
export function AppUpdateCheck() {
  const [next, setNext] = useState<{ build: number; url: string } | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!isNative() || !APP_BUILD) return;
    let last = 0;
    const check = () => {
      if (Date.now() - last < CHECK_EVERY) return;
      last = Date.now();
      latestApp()
        .then((r) => {
          let skipped = 0;
          try { skipped = Number(localStorage.getItem(SKIP_KEY) ?? 0); } catch { /* ignore */ }
          setNext(r && r.build > APP_BUILD && r.build !== skipped ? r : null);
        })
        .catch(() => undefined);
    };
    check();
    const h = NativeApp.addListener('resume', check);
    return () => void h.then((x) => x.remove());
  }, []);
  if (!next) return null;
  const update = async () => {
    try { setNote(MESSAGES[(await Updater.install({ url: next.url })).status]); } catch { await Browser.open({ url: next.url }); }
  };
  return (
    <div className="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <section className="card flex flex-wrap items-center gap-3 text-sm">
        <div className="min-w-[12rem] flex-1">
          <p className="label">Update available</p>
          <p>{note || `Version 1.0.${next.build} is ready (you have 1.0.${APP_BUILD}).`}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => void update()}>Update</button>
          <button className="btn" onClick={() => { try { localStorage.setItem(SKIP_KEY, String(next.build)); } catch { /* ignore */ } setNext(null); }}>Later</button>
        </div>
      </section>
    </div>
  );
}
