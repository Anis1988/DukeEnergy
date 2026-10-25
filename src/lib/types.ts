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

export interface Settings {
  /** Price of one kWh, in dollars (all-in: energy + riders). */
  price: number;
  /** Fixed monthly charge (customer charge), in dollars. */
  fixed: number;
  /** Optional: a monthly kWh goal; 0 = none. */
  goal: number;
}
export const DEFAULT_SETTINGS: Settings = { price: 0.15, fixed: 10, goal: 0 };

export interface Status {
  connected: boolean;
  email?: string;
  since?: string;
  storage: boolean;
  settings: Settings;
}
