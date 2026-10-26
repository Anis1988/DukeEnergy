import { useEffect, useState } from 'react';
import { modelName } from '../lib/aiModels';
import { useAiChecks } from '../lib/aiChecks';
import type { AiCheck, Offer, Situation } from '../lib/types';

export const VERDICT = {
  good: { icon: '✅', label: 'Looks good', tone: 'text-good' },
  caution: { icon: '⚠️', label: 'Be careful', tone: 'text-warn' },
  avoid: { icon: '⛔', label: 'Avoid', tone: 'text-bad' },
} as const;
const SEV = { high: '🔴', medium: '🟠', low: '🟡' } as const;
const THOROUGH = { quick: 'Quick', normal: 'Normal', deep: 'Deep' } as const;

const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return now;
}

/** The violet "From the AI" frame: everything inside it was written by the AI, nothing outside. */
export function AiBox({ c, children }: { c: AiCheck; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-ai/60 bg-ai/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 bg-ai/15 px-3 py-1.5 text-xs font-semibold text-ai">
        <span>🤖 FROM THE AI · {modelName(c.model)}{c.thoroughness ? ` · ${THOROUGH[c.thoroughness]}` : ''}</span>
        <span className="font-normal">{new Date(c.finishedAt ?? c.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div className="space-y-3 p-3 text-sm">{children}</div>
    </div>
  );
}

/** A finished verdict, in full. */
export function VerdictBox({ c }: { c: AiCheck }) {
  const v = c.verdict!;
  const look = VERDICT[v.verdict];
  return (
    <AiBox c={c}>
      <div>
        <p className={`font-display text-lg font-semibold ${look.tone}`}>{look.icon} {look.label}</p>
        <p className="font-medium">{v.headline}</p>
      </div>
      <p>{v.summary}</p>
      {v.for_you && (
        <div className="rounded-lg bg-card p-2.5">
          <p className="label">For you</p>
          <p className="mt-0.5">{v.for_you}</p>
        </div>
      )}
      {v.gotchas.length > 0 && (
        <div>
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
        <div>
          <p className="label">Good points</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{v.positives.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <details>
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
      <p><b>What to do:</b> {v.recommendation}</p>
      {v.sources.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted">Sources ({v.sources.length})</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {v.sources.filter((s) => /^https?:\/\//.test(s.url)).map((s, i) => <li key={i}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></li>)}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted">AI can be wrong: read the contract before signing.</p>
    </AiBox>
  );
}

/**
 * 🤖 Ask AI: nothing is sent until the user taps. The check runs on the server and is followed app-wide (the bar above
 * the tabs), so any page can be opened meanwhile; the verdict is kept and shows here and in "AI verdicts".
 */
export function AiCheckPanel({ offer, situation }: { offer: Offer; situation: Situation }) {
  const { forOffer, ask } = useAiChecks();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const c = offer.id ? forOffer(offer.id) : undefined;
  const now = useNow(c?.status === 'running');
  if (!offer.id) return null;
  const go = async (fresh: boolean) => {
    setBusy(true);
    setErr(await ask(offer.id!, situation, fresh));
    setBusy(false);
  };

  if (c?.status === 'running') {
    return (
      <AiBox c={c}>
        <div className="flex items-center gap-3" role="status">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ai/30 border-t-ai" />
          <div>
            <p><b>Reading the supplier’s website and contract…</b> {clock(now - Date.parse(c.startedAt))}</p>
            <p className="text-xs text-muted">You can open other pages or close the app: it keeps going, and the verdict will be here.</p>
          </div>
        </div>
      </AiBox>
    );
  }
  if (c?.status === 'done' && c.verdict) {
    return (
      <div className="space-y-2">
        <VerdictBox c={c} />
        <button className="btn px-3 py-1.5 text-xs" onClick={() => void go(true)} disabled={busy}>🤖 Ask again (new check)</button>
        {err && <p className="text-xs text-bad">⚠️ {err}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-ai/40 p-3 text-sm">
      <button className="btn w-full border-ai/50 text-ai" onClick={() => void go(false)} disabled={busy}>{busy ? 'Asking…' : '🤖 Ask AI about this offer'}</button>
      <p className="text-xs text-muted">Only when you tap. The AI (model in ⚙️ Settings → AI) reads this offer’s live website and contract and judges it for your situation. You can leave the page while it works.</p>
      {c?.status === 'error' && <p className="text-xs text-bad">Last try failed: {c.error}</p>}
      {err && <p className="text-xs text-bad">⚠️ {err}</p>}
    </div>
  );
}
