# Working on this repo

- Two branches: `main` = the website (Vercel deploys it); `android` = `main` + Capacitor (`android/`, `capacitor.config.ts`, `.github/workflows/android.yml`) building the APK on GitHub (release `android-latest`). Change shared code on `main`, then merge `main` into `android`. Vercel ignores the `android` branch (`vercel.json` there).
- Phone-friendly is required: check a 390px-wide layout for any UI change, in light and dark (every colour is a CSS variable in `src/index.css`, read by `tailwind.config.js`).
- Keep the Guide (`src/pages/Guide.tsx`) up to date with user-visible changes, in plain everyday words.
- Duke Energy has no public API: `server/duke.ts` copies the phone app's calls (as in github.com/hunterjm/aiodukeenergy). Login is Auth0 with a CAPTCHA, so the user logs in on Duke's page; the website asks them to paste the address Duke lands on (`https://login.duke-energy.com/ios/...?code=`), the Android app catches it in its own WebView (`DukeLoginPlugin.java`). PKCE verifier is made on the device (`src/lib/pkce.ts`). Tokens live in Redis `de:login`; refreshes take a lock (`de:lock`) because Auth0 rotates refresh tokens.
- Usage is cached per chunk (`de:u:...`): days older than 3 days 60 days, recent ones 30 minutes. Daily requests go month by month, hourly week by week.
- Server imports end in `.js` (Vercel runs `api/` as Node ESM without bundling). `npm run dev` serves `api/*.ts` too (`vite.config.ts`).
- Every API call needs `APP_ACCESS_TOKEN` (header `X-Access-Token`): the Duke login is stored on the server.
- Do not add automated tests unless asked.
- `android` branch only: `src/components/AppUpdate.tsx` (update banner from the GitHub release, mounted in `src/main.tsx`), `UpdatePlugin.java`, `DukeLoginPlugin.java` + `LoginActivity.java`, the sideload keystore (fixed key so new APKs install over old ones).
