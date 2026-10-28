import { config } from './config.js';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
let cooldownUntil = 0;
let cooldownReason = '';

export class RateLimitedError extends Error {
  constructor(public readonly until: number, public readonly provider: string) {
    super(provider + ' rate limited until ' + new Date(until).toLocaleTimeString());
    this.name = 'RateLimitedError';
  }
}

export function aiRateLimitStatus() {
  return { aiCooldownUntil: cooldownUntil, aiCooldownReason: cooldownReason };
}

function retryAfterMs(response: Response): number {
  const retry = response.headers.get('retry-after');
  if (retry) {
    const seconds = Number(retry);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retry);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 15 * 60 * 1000;
}

export async function ai(messages: Message[], json = false) {
  if (Date.now() < cooldownUntil) throw new RateLimitedError(cooldownUntil, 'OpenRouter');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
        'X-Title': 'Memecoin X Scout'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages: [{ role: 'system', content: config().ai.systemPrompt }, ...messages],
        temperature: 0.3,
        ...(json ? { response_format: { type: 'json_object' } } : {})
      }),
      signal: controller.signal
    });
    if (response.status === 429) {
      cooldownUntil = Date.now() + Math.max(60000, Math.min(retryAfterMs(response), 60 * 60 * 1000));
      cooldownReason = 'OpenRouter returned HTTP 429; respecting Retry-After where provided';
      throw new RateLimitedError(cooldownUntil, 'OpenRouter');
    }
    const payload = await response.json() as any;
    if (!response.ok) throw new Error('OpenRouter ' + response.status + ': ' + JSON.stringify(payload).slice(0, 400));
    return String(payload.choices?.[0]?.message?.content || '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

export async function classify(profile: object) {
  const result = await ai([{
    role: 'user',
    content: 'Classify this public X profile from observed evidence only. Return JSON keys category (project, likely_project, founder, influencer, unrelated, uncertain), chain (name or Unknown), confidence (integer 0-100), reason (short). Profile: ' + JSON.stringify(profile).slice(0, 10000)
  }], true);
  const data = JSON.parse(result);
  const allowed = ['project', 'likely_project', 'founder', 'influencer', 'unrelated', 'uncertain'];
  return {
    category: allowed.includes(data.category) ? data.category : 'uncertain',
    chain: String(data.chain || 'Unknown').slice(0, 60),
    confidence: Math.max(0, Math.min(100, Number(data.confidence) || 0)),
    reason: String(data.reason || '').slice(0, 600)
  };
}
