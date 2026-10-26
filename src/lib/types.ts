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
  /** Peak price only May–September (Duke's summer). */
  summerOnly: boolean;
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

/** 💲 One supplier offer from Energy Choice Ohio (the electricity itself; Duke still delivers it). */
export interface Offer {
  /** Set by the server (for AI checks). */
  id?: string;
  supplier: string;
  phone?: string;
  site?: string;
  signUp?: string;
  terms?: string;
  details?: string;
  /** $ per kWh. */
  rate: number;
  type: 'Fixed' | 'Variable';
  /** % renewable. */
  renewable: number;
  /** An introductory price (changes after the first months). */
  intro: boolean;
  /** Months (0 = month to month). */
  term: number;
  /** Early termination (cancel) fee in $; per remaining month when etfPerMonth. */
  etf: number;
  etfPerMonth: boolean;
  etfDetails?: string;
  monthlyFee: number;
  promo?: string;
}
export interface Offers {
  /** Duke's standard generation price ($/kWh), for the period below. */
  ptc: number | null;
  ptcPeriod?: string;
  offers: Offer[];
  checkedAt: string;
  source: string;
}

/** 🤖 The AI's deep check of one offer (its live website, contract and reputation). */
export interface Gotcha {
  severity: 'high' | 'medium' | 'low';
  issue: string;
  detail: string;
  source: string;
}
export interface Verdict {
  verdict: 'good' | 'caution' | 'avoid';
  headline: string;
  summary: string;
  confirmed: { rate: string; term: string; cancel_fee: string; monthly_fee: string; after_term: string; other_fees: string };
  gotchas: Gotcha[];
  positives: string[];
  yearly_cost: string;
  /** How the offer fits this household (usage, seasons, cars, current contract, Duke's night rate). */
  for_you: string;
  recommendation: string;
  sources: { title: string; url: string }[];
}
export interface AiCheck {
  id: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  model?: string;
  verdict?: Verdict;
  error?: string;
}

/** Who you buy the electricity from now (Duke delivers it either way). rate 0 = Duke's standard price. */
export interface Supply {
  name: string;
  rate: number;
  monthlyFee: number;
  /** Current supplier contract: cancel fee ($) and end date ("YYYY-MM-DD"), when known. */
  cancelFee: number;
  endDate: string;
}

/** 🤖 Your situation with Duke, sent with an AI check (no account numbers, no address). */
export interface Situation {
  yearKwh: number;
  months: { m: string; kwh: number }[];
  ptc: number | null;
  ptcPeriod?: string;
  /** All-in price per kWh and basic charge from Settings. */
  price: number;
  fixed: number;
  supply: Supply;
  cars: number;
  chargerKw: number;
  carKwhYear: number;
  /** Share of car charging between midnight and 5 AM (0–1). */
  carNightShare: number;
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
  supply: Supply;
}

/** Example numbers only: the real ones are in the plan's terms (Duke or your supplier). */
export const PLAN_PRESETS: Record<string, Plan> = {
  peak: { name: 'Peak / off-peak', peakStart: 14, peakEnd: 19, weekdaysOnly: true, summerOnly: false, peak: 0.28, offPeak: 0.12, nightStart: 0, nightEnd: 0, night: 0.12, fixed: 10 },
  nights: { name: 'Free nights', peakStart: 0, peakEnd: 0, weekdaysOnly: false, summerOnly: false, peak: 0.19, offPeak: 0.19, nightStart: 21, nightEnd: 6, night: 0, fixed: 10 },
  three: { name: 'Peak / off-peak / overnight', peakStart: 14, peakEnd: 19, weekdaysOnly: true, summerOnly: false, peak: 0.3, offPeak: 0.13, nightStart: 23, nightEnd: 6, night: 0.08, fixed: 10 },
};

export const DEFAULT_SETTINGS: Settings = {
  price: 0.15,
  fixed: 10,
  goal: 0,
  alerts: { on: false, pct: 40, topic: '', goal: true },
  plan: PLAN_PRESETS.peak,
  ev: { cars: 0, chargerKw: 7.2, milesPerKwh: 3.5, excludeFromAlerts: true },
  supply: { name: '', rate: 0, monthlyFee: 0, cancelFee: 0, endDate: '' },
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
