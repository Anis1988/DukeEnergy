import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app (branch "android"): the same screens as the website, talking to the live site's server. */
const config: CapacitorConfig = {
  appId: 'app.wattwatch',
  appName: 'Watt Watch',
  webDir: 'build',
  backgroundColor: '#F4F6F3',
  plugins: {
    // Requests go through Android itself (not the web view), so the live server answers without CORS limits.
    CapacitorHttp: { enabled: true },
    SystemBars: { style: 'LIGHT', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
