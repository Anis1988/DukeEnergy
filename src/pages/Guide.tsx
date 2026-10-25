import { BarChart } from '../components/Chart';
import { Stat } from '../components/ui';

/** 📖 How to use it, in plain words, with a made-up example. */
export function Guide() {
  const sample = [18, 22, 19, 31, 24, 20, 17].map((v, i) => ({
    key: String(i),
    value: v,
    label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    strong: v === 31,
    tip: <span><b>{v} kWh</b> (example)</span>,
  }));
  return (
    <div className="mx-auto max-w-lg space-y-4 text-sm">
      <section className="card space-y-2">
        <h2 className="font-display text-lg font-semibold">📖 How it works</h2>
        <p>Watt Watch shows the electricity your home uses, from your Duke Energy smart meter.</p>
        <p><b>Readings come a day late.</b> Duke sends each day’s numbers the next day, so “yesterday” is the newest.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">📊 Overview</h3>
        <p>Your last 7, 30 or 90 days: the total, about how much it cost, the average per day, and the highest day (dark bar). The dashed line is your average. Tap a bar to see that day hour by hour.</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Last 7 days" value="151 kWh" sub="▼ 8% less than before" tone="good" />
          <Stat label="About" value="$24.95" sub="example" />
        </div>
        <BarChart bars={sample} height={150} avg={21.6} />
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">⏱️ Hours</h3>
        <p>One day, hour by hour. <b>Busiest hour</b> is when you used the most. <b>Always on</b> is what your home uses even at night (fridge, Wi-Fi, things on standby); lowering it saves every hour of every day.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">📆 Months</h3>
        <p>The last 13 months side by side, with the average outside temperature, so you can compare this month with the same month last year.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">💲 Costs</h3>
        <p>Set your price per kWh and basic charge in ⚙️ Settings (look at a recent bill). All costs are estimates.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">🔑 Connecting</h3>
        <p>You log in once on Duke’s own page. On the website, copy the address of the page you land on and paste it in. The Android app does that part by itself.</p>
      </section>
    </div>
  );
}
