import { useEffect, useRef, useState } from 'react';
import { askAi, getAiCheck } from '../lib/api';
import type { AiCheck, Offer, Situation } from '../lib/types';

const LOOK = {
  good: { icon: '✅', label: 'Looks good', tone: 'text-good border-good/40 bg-good/5' },
  caution: { icon: '⚠️', label: 'Be careful', tone: 'text-warn border-warn/40 bg-warn/5' },
  avoid: { icon: '⛔', label: 'Avoid', tone: 'text-bad border-bad/40 bg-bad/5' },
} as const;
const SEV = { high: '🔴', medium: '🟠', low: '🟡' } as const;

/**
 * 🤖 Ask AI: nothing is sent until the user taps the button. Then the server gives back the saved answer for this
 * offer and situation (free) or starts a new check: the AI reads the offer's live website and contract and judges it
 * against the household's own situation with Duke. Runs on the server (1–5 minutes), so the screen can be left.
 */
export function AiCheckPanel({ offer, situation }: { offer: Offer; situation: Situation }) {
  const [c, setC] = useState<(AiCheck & { saved?: boolean }) | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<number>();
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(timer.current); window.clearInterval(t); };
  }, []);
  if (!offer.id) return null;

  const poll = (id: string) => {
    getAiCheck(id)
      .then((r) => {
        if (r.status === 'none') return;
        setC(r as AiCheck);
        if (r.status === 'running') timer.current = window.setTimeout(() => poll(id), 6000);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  const ask = async (fresh: boolean) => {
    setErr('');
    setBusy(true);
    try {
      const r = await askAi(offer.id!, situation, fresh);
      setC(r);
      window.clearTimeout(timer.current);
      if (r.status === 'running') timer.current = window.setTimeout(() => poll(r.id), 5000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!c || c.status === 'error') {
    return (
      <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
        <button className="btn w-full" onClick={() => void ask(false)} disabled={busy}>{busy ? 'Asking…' : '🤖 Ask AI about this offer'}</button>
        <p className="text-xs text-muted">Only when you tap. Claude (Anthropic’s most capable AI) reads this offer’s live website and contract and judges it for your situation (what you pay now, your seasons{situation.cars ? ', your cars and night charging' : ''}). About $1–3 a check, 1–5 minutes; an answer you already got is shown again for free.</p>
        {c?.error && <p className="text-xs text-bad">Last try failed: {c.error}</p>}
        {err && <p className="text-xs text-bad">⚠️ {err}</p>}
      </div>
    );
  }

  if (c.status === 'running') {
    const secs = Math.max(0, Math.round((now - Date.parse(c.startedAt)) / 1000));
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm" role="status">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
        <div>
          <p><b>🤖 Reading the supplier’s website and contract…</b></p>
          <p className="text-xs text-muted">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} so far · usually 1–5 minutes · you can leave this screen and tap Ask AI again later</p>
        </div>
      </div>
    );
  }

  const v = c.verdict!;
  const look = LOOK[v.verdict];
  return (
    <div className={`space-y-3 rounded-xl border p-3 text-sm ${look.tone}`}>
      <div>
        <p className="font-display text-lg font-semibold">{look.icon} {look.label}</p>
        <p className="font-medium text-ink">{v.headline}</p>
      </div>
      <p className="text-ink">{v.summary}</p>
      {v.for_you && (
        <div className="rounded-lg bg-card/70 p-2.5 text-ink">
          <p className="label">For you</p>
          <p className="mt-0.5">{v.for_you}</p>
        </div>
      )}
      {v.gotchas.length > 0 && (
        <div className="text-ink">
          <p className="label">Catches found</p>
          <ul className="mt-1 space-y-1.5">
            {[...v.gotchas].sort((a, b) => 'hml'.indexOf(a.severity[0]) - 'hml'.indexOf(b.severity[0])).map((g, i) => (
              <li key={i}>
                {SEV[g.severity]} <b>{g.issue}</b>: {g.detail}
                {/^https?:\/\//.test(g.source) && <> <a className="text-xs text-muted underline" href={g.source} target="_blank" rel="noreferrer">source</a></>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.positives.length > 0 && (
        <div className="text-ink">
          <p className="label">Good points</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{v.positives.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <details className="text-ink">
        <summary className="cursor-pointer text-muted">What the live pages say</summary>
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">Price</dt><dd>{v.confirmed.rate}</dd>
          <dt className="text-muted">Term</dt><dd>{v.confirmed.term}</dd>
          <dt className="text-muted">Cancel fee</dt><dd>{v.confirmed.cancel_fee}</dd>
          <dt className="text-muted">Monthly fee</dt><dd>{v.confirmed.monthly_fee}</dd>
          <dt className="text-muted">After the term</dt><dd>{v.confirmed.after_term}</dd>
          <dt className="text-muted">Other fees</dt><dd>{v.confirmed.other_fees}</dd>
          <dt className="text-muted">Your year</dt><dd>{v.yearly_cost}</dd>
        </dl>
      </details>
      <p className="text-ink"><b>What to do:</b> {v.recommendation}</p>
      {v.sources.length > 0 && (
        <details className="text-ink">
          <summary className="cursor-pointer text-muted">Sources ({v.sources.length})</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {v.sources.filter((s) => /^https?:\/\//.test(s.url)).map((s, i) => <li key={i}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></li>)}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>🤖 {c.saved ? 'Saved answer from' : 'Checked'} {new Date(c.finishedAt ?? c.startedAt).toLocaleString()}. AI can be wrong: read the contract before signing.</span>
        <button className="btn px-3 py-1.5" onClick={() => void ask(true)} disabled={busy}>Ask again (new check)</button>
      </div>
    </div>
  );
}
