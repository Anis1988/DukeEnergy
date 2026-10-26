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
        <h3 className="font-semibold">💡 Insights</h3>
        <p><b>🌡️ Weather effect:</b> each dot is a day (outside temperature → kWh). From them the app works out what one degree colder or hotter costs you a day, and how much of your year went to heating and cooling. “For their weather” tells you if the last 30 days were more or less than the weather explains.</p>
        <p><b>⏰ Time-of-use plan:</b> some plans charge more in the afternoon peak and less at night. Pick an example or type in a real offer’s hours and prices; the app prices your real hour-by-hour use from the last 8 weeks on it and compares with what you pay now. The slider shows what moving some use (laundry, dishwasher, car charging) out of the peak would change.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">🚗 Electric cars</h3>
        <p>Set how many cars you charge at home and your charger’s power in ⚙️ Settings. The app spots charging in your hourly use (several hours far above your home’s normal level) and shows in 💡 Insights how much the cars use and cost, about how many miles that is, and what charging in a plan’s cheap hours would save. ⏱️ Hours marks the charging hours, and “high use” alerts leave car charging out, so a charging night doesn’t set them off.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">💲 Deals</h3>
        <p>In Ohio, Duke always delivers your power, but you can buy the electricity itself from another supplier, often cheaper. 💲 Deals reads Ohio’s official list of offers for Duke homes and prices each one on your own last 12 months. The top card is the best <b>safe</b> deal (fixed price, no teaser rate, small or no cancel fee) and how much it saves a year. Below, every offer with filters; tap one for its details, then Sign up or Call. If you already have a supplier, tap Change and type its price so savings are counted from it.</p>
        <p><b>🤖 Ask AI:</b> the AI only runs when you tap “Ask AI about this offer” (under the best deal, or inside an offer). The AI you pick in ⚙️ Settings → AI (Claude Fable 5.1 is the most capable and slowest; Sonnet and Haiku are much faster), with Quick, Normal or Deep thoroughness, opens the supplier’s live sign-up page and contract, looks up complaints, and judges the offer for <b>your</b> situation: what you pay now (Duke or your supplier, its cancel fee and end date), your month-by-month use, your cars and night charging, and Duke’s next price change. You get ✅ Looks good, ⚠️ Be careful or ⛔ Avoid, a “For you” part, each catch it found with links, and what to do. While it works, a violet bar above the tabs follows it on every page, and says “AI verdict ready” when it’s done (also a phone notification if alerts are on). Everything the AI wrote is inside a violet “🤖 From the AI” box with the model’s name. Every verdict is kept: they are listed in “🤖 AI verdicts” at the top of Deals, and offers you asked about show a 🤖 badge. Asking again about the same offer shows the saved answer for free; “Ask again” starts a new check. AI can be wrong, so still read the contract before signing.</p>
        <p><b>⚡ With electric cars:</b> a card shows what your cars cost a year, what a cheaper supplier saves on them, and Duke’s official night rate (Rate TD-CPP: cheaper midnight–5 AM every day, dearer 2–8 PM on summer weekdays) with the cars charging after midnight, for the cars and for your whole home. ⭐ Rate TD-CPP is also a choice in 💡 Insights → time-of-use plan.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">🔔 Alerts</h3>
        <p>In ⚙️ Settings → Alerts: install the free ntfy app, subscribe to your topic, switch alerts on. Each morning you get a notification if yesterday was much higher than usual (you choose how much), if the month is heading over your goal, or if the Duke connection needs you.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">💲 Costs</h3>
        <p>Set your price per kWh and basic charge in ⚙️ Settings (look at a recent bill). All costs are estimates.</p>
      </section>
      <section className="card space-y-2">
        <h3 className="font-semibold">🔑 Connecting</h3>
        <p>You log in once on Duke’s own page. On the website, copy the address of the page you land on and paste it in. Duke’s login only accepts iPhones, so on a computer switch the browser to “iPhone” first (the Connect screen shows how). The Android app does all of this by itself.</p>
      </section>
    </div>
  );
}
