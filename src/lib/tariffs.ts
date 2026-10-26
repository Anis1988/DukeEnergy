import type { Plan } from './types';

/**
 * Duke Energy Ohio's official rates (PUCO Electric No. 19): Rate RS, the standard residential rate, and Rate TD-CPP,
 * its optional time-of-day rate. Only the distribution energy charge differs by hour; the generation part (or a
 * supplier's price) is the same in every hour. Sheets 30 and 32, effective January 3, 2023.
 */
export const TARIFF_SOURCE = 'https://dam.assets.ohio.gov/image/upload/puco.ohio.gov/empliibrary/files/docketing/tariffs/Electric/Duke%20Energy%20Ohio%20-%20Electric/Duke%20PUCO%2019%20Schedules%20of%20Rates,%20Classifications,%20Rules%20andRegulations.pdf';
export const RS_DISTRIBUTION = 0.039693;
export const TDCPP = {
  discount: 0.030884, // midnight–5 AM, every day
  offPeak: 0.038605,
  onPeak: 0.057908, // 2–8 PM Mon–Fri, May–September
  criticalPeak: 0.096514, // up to 10 announced days a year
};

/** Rate TD-CPP as a plan: your all-in price, moved up or down by the difference from Rate RS in each period. */
export function tdcppPlan(price: number, fixed: number): Plan {
  const d = (r: number) => Math.max(0, Math.round((price + r - RS_DISTRIBUTION) * 10000) / 10000);
  return {
    name: 'Duke Rate TD-CPP',
    peakStart: 14,
    peakEnd: 20,
    weekdaysOnly: true,
    summerOnly: true,
    peak: d(TDCPP.onPeak),
    offPeak: d(TDCPP.offPeak),
    nightStart: 0,
    nightEnd: 5,
    night: d(TDCPP.discount),
    fixed, // same $8 customer charge as Rate RS
  };
}
