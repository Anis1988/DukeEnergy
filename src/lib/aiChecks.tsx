import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { askAi, getAiChecks } from './api';
import type { AiCheck, Situation } from './types';

/**
 * 🤖 Every AI check, app-wide: loaded once (saved verdicts, free to read), and while one is running it is followed
 * every 6 s whatever page is open. When it finishes, `ready` holds it for the "verdict ready" banner.
 */
interface Ctx {
  checks: AiCheck[];
  forOffer: (offerId: string) => AiCheck | undefined;
  /** Starts a check (or gets the saved answer); resolves with an error message, or '' when it went through. */
  ask: (offerId: string, situation: Situation, fresh: boolean) => Promise<string>;
  ready: AiCheck | null;
  dismiss: () => void;
}
const AiChecks = createContext<Ctx | null>(null);
export const useAiChecks = () => useContext(AiChecks)!;

export function AiChecksProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [checks, setChecks] = useState<AiCheck[]>([]);
  const [ready, setReady] = useState<AiCheck | null>(null);
  const running = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { checks: list } = await getAiChecks();
      // Running before, finished now: announce it.
      const done = list.find((c) => running.current.has(c.id) && c.status !== 'running');
      if (done) setReady(done);
      running.current = new Set(list.filter((c) => c.status === 'running').map((c) => c.id));
      setChecks(list);
    } catch { /* offline: try again on the next tick */ }
  }, []);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  const anyRunning = checks.some((c) => c.status === 'running');
  useEffect(() => {
    if (!anyRunning) return;
    const t = window.setInterval(() => void load(), 6000);
    return () => window.clearInterval(t);
  }, [anyRunning, load]);

  const ask = async (offerId: string, situation: Situation, fresh: boolean) => {
    try {
      const c = await askAi(offerId, situation, fresh);
      if (c.status === 'running') running.current.add(c.id);
      setChecks((list) => [c, ...list.filter((x) => x.offerId !== c.offerId)]);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  return (
    <AiChecks.Provider value={{ checks, forOffer: (id) => checks.find((c) => c.offerId === id), ask, ready, dismiss: () => setReady(null) }}>
      {children}
    </AiChecks.Provider>
  );
}
