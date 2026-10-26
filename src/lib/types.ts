export interface Meter {
  serial: string;
  serviceType: string; // ELECTRIC, GAS…
  account: string; // last 4 digits only
  address: string;
}

export interface Point {
  /** Local time: "2026-10-24" (daily) or "2026-10-24T13" (hourly). */
  t: string;
  kwh: number;
  temp: number | null;
}

export interface Usage {
  points: Point[];
  /** Days or hours Duke has no reading for (yet). */
  missing: number;
  cached?: boolean;
}

export interface Alerts {
  on: boolean;
  /** Tell me when a day is this much (%) above the usual (average of the 14 days before). */
  pct: number;
  /** ntfy.sh topic the phone subscribes to (a long random name: anyone who knows it can read the alerts). */
  topic: string;
  /** Also warn once a month when the month is heading over the goal. */
  goal: boolean;
}

/** A time-of-use plan to compare with (hours are 0–23, "end" not included). */
export interface Plan {
  name: string;
  peakStart: number;
  peakEnd: number;
  /** Peak price only on Monday–Friday. */
  weekdaysOnly: boolean;
  peak: number;
  offPeak: number;
  /** Optional cheap overnight window (same start and end = none). */
  nightStart: number;
  nightEnd: number;
  night: number;
  /** The plan's fixed monthly charge. */
  fixed: number;
}

/** 🚗 Electric cars charged at home (found in the hourly use: several hours well above the house's normal). */
export interface Ev {
  /** Number of cars; 0 = no car (nothing is looked for). */
  cars: number;
  /** One charger's power in kW (Level 2 is usually 7–11 kW; a normal outlet ~1.4 kW). */
  chargerKw: number;
  /** For the miles estimate. */
  milesPerKwh: number;
  /** High-use alerts look at the house without car charging. */
  excludeFromAlerts: boolean;
}

export interface Settings {
  /** Price of one kWh, in dollars (all-in: energy + riders). */
  price: number;
  /** Fixed monthly charge (customer charge), in dollars. */
  fixed: number;
  /** Optional: a monthly kWh goal; 0 = none. */
  goal: number;
  alerts: Alerts;
  plan: Plan;
  ev: Ev;
}

/** Example numbers only: the real ones are in the plan's terms (Duke or your supplier). */
export const PLAN_PRESETS: Record<string, Plan> = {
  peak: { name: 'Peak / off-peak', peakStart: 14, peakEnd: 19, weekdaysOnly: true, peak: 0.28, offPeak: 0.12, nightStart: 0, nightEnd: 0, night: 0.12, fixed: 10 },
  nights: { name: 'Free nights', peakStart: 0, peakEnd: 0, weekdaysOnly: false, peak: 0.19, offPeak: 0.19, nightStart: 21, nightEnd: 6, night: 0, fixed: 10 },
  three: { name: 'Peak / off-peak / overnight', peakStart: 14, peakEnd: 19, weekdaysOnly: true, peak: 0.3, offPeak: 0.13, nightStart: 23, nightEnd: 6, night: 0.08, fixed: 10 },
};

export const DEFAULT_SETTINGS: Settings = {
  price: 0.15,
  fixed: 10,
  goal: 0,
  alerts: { on: false, pct: 40, topic: '', goal: true },
  plan: PLAN_PRESETS.peak,
  ev: { cars: 0, chargerKw: 7.2, milesPerKwh: 3.5, excludeFromAlerts: true },
};

export interface Status {
  connected: boolean;
  email?: string;
  since?: string;
  storage: boolean;
  /** CRON_SECRET is set on Vercel (only Vercel's scheduler can start the morning check). */
  cronSecret: boolean;
  settings: Settings;
}
