# Watt Watch (Duke Energy usage)

See the electricity your home uses, from your Duke Energy smart meter: daily, hour by hour and month by month, with
estimated costs, your busiest hour, what's "always on" at night, and a monthly goal. Works on the phone (website,
or the Android app from the `android` branch).

> A personal app, not made by or linked to Duke Energy. It reads your data the way Duke's phone app does (same
> approach as the open-source [aiodukeenergy](https://github.com/hunterjm/aiodukeenergy) library used by Home
> Assistant). If Duke changes its app, `server/duke.ts` may need an update.

## Set up (Vercel)

1. Vercel → Add New → Project → import `DukeEnergy` from GitHub → Deploy (settings come from `vercel.json`).
2. Project → Storage → Create → **Upstash for Redis** (free) → connect it to the project (keeps your Duke login and a
   cache of past days).
3. Project → Settings → Environment Variables: `APP_ACCESS_TOKEN` = any long password (you type it once per device).
4. Deployments → ⋯ → Redeploy, open the site, enter the access code.
5. **Connect to Duke**: tap *Open Duke login*, log in on Duke's page. It ends on an "Access Denied" page: that's
   expected, copy that page's address, come back and paste it. (The Android app does this part by itself.)
6. ⚙️ Settings → your price per kWh and basic charge (from a recent bill).

## Android app

Branch `android` builds an APK on GitHub (Actions → "Android app"), published on the `android-latest` release: open
that page on the phone and tap `WattWatch.apk`. The app talks to your Vercel site (GitHub → Settings → Secrets and
variables → Actions → Variables → `WATTWATCH_URL`, or change it in the app's Settings).

## Run it on your computer

Needs Node.js 22.

```bash
npm install
cp .env.example .env.local   # set APP_ACCESS_TOKEN
npm run dev                  # http://localhost:5173
```

Without Upstash keys, the login and cache are kept in `.local/store.json`.
