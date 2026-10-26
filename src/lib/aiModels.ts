/**
 * 🤖 Anthropic models the AI check can use (⚙️ Settings → AI). `tools`: "new" = web search/fetch with dynamic filtering
 * (`_20260318`, Claude 4.6 and later), "basic" = the older versions. `fallbacks`: server-side refusal fallback
 * ("default" form) is used on the models it's documented for. `effort`: the model takes output_config.effort.
 */
export interface AiModel {
  id: string;
  name: string;
  note: string;
  tools: 'new' | 'basic';
  fallbacks: boolean;
  effort: boolean;
}

export const AI_MODELS: AiModel[] = [
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', note: 'Most capable · slowest (often 3–5 min) · ~$1–3 a check', tools: 'new', fallbacks: true, effort: true },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'Excellent · faster (1–3 min) · ~$0.50–1.50', tools: 'new', fallbacks: true, effort: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Very good · fast (about 1 min) · ~$0.20–0.60', tools: 'new', fallbacks: true, effort: true },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'Good · fastest · a few cents', tools: 'new', fallbacks: false, effort: true },
  { id: 'claude-fable-5', name: 'Claude Fable 5', note: 'Previous Fable · slow · ~$1–3', tools: 'new', fallbacks: false, effort: true },
  { id: 'claude-opus-5', name: 'Claude Opus 5', note: 'Previous Opus · ~$0.50–1.50', tools: 'new', fallbacks: true, effort: true },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', note: 'Older Opus · ~$0.50–1.50', tools: 'new', fallbacks: false, effort: true },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', note: 'Previous Sonnet · fast', tools: 'new', fallbacks: false, effort: true },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', note: 'Older Haiku · fastest · basic web tools', tools: 'basic', fallbacks: false, effort: false },
];
export const DEFAULT_AI_MODEL = 'claude-fable-5-1';
export const aiModel = (id: string): AiModel => AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];
export const modelName = (id: string | undefined) => (id ? AI_MODELS.find((m) => m.id === id)?.name ?? id : 'Claude');

/** Thoroughness → effort: quick reads less and answers sooner. */
export type Thoroughness = 'quick' | 'normal' | 'deep';
export const EFFORT: Record<Thoroughness, 'low' | 'medium' | 'high'> = { quick: 'low', normal: 'medium', deep: 'high' };
