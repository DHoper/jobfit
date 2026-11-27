// 呼叫 AI：預設走站方的代理（使用者不用金鑰）；開發者可以在設定頁直接填 DeepSeek 金鑰。
import type { Settings } from './types';

// 部署 worker/ 之後填入，例如 https://jobfit-proxy.<帳號>.workers.dev
export const DEFAULT_PROXY_URL = '';
export const DEFAULT_MODEL = 'deepseek-chat';

type Msg = { role: 'system' | 'user'; content: string };

export class AiError extends Error {
  constructor(
    public code: 'NO_ENDPOINT' | 'RATE_LIMIT' | 'AUTH' | 'NETWORK' | 'SERVER' | 'FORMAT',
    message: string,
  ) {
    super(message);
  }
}

export function hasEndpoint(s: Settings) {
  return Boolean((s.apiKey || '').trim() || (s.proxyUrl || DEFAULT_PROXY_URL).trim());
}

async function once(settings: Settings, messages: Msg[], temperature: number, signal?: AbortSignal): Promise<{ content: string; model: string }> {
  const apiKey = (settings.apiKey || '').trim();
  const proxy = (settings.proxyUrl || DEFAULT_PROXY_URL).trim().replace(/\/$/, '');
  const model = (settings.model || '').trim() || DEFAULT_MODEL;
  if (!apiKey && !proxy) throw new AiError('NO_ENDPOINT', '還沒設定 AI 評估服務');

  let res: Response;
  try {
    res = apiKey
      ? await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature, max_tokens: 2000, response_format: { type: 'json_object' } }),
        })
      : await fetch(`${proxy}/evaluate`, {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, temperature }),
        });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError('NETWORK', '連不到評估服務，請檢查網路後再試一次');
  }
  if (res.status === 429) throw new AiError('RATE_LIMIT', '今天的免費評估次數用完了，明天會重新計算');
  if (res.status === 401 || res.status === 403) throw new AiError('AUTH', apiKey ? 'DeepSeek 金鑰不正確，請到設定頁確認' : '評估服務拒絕了這個請求');
  if (!res.ok) throw new AiError('SERVER', `評估服務暫時無法使用（HTTP ${res.status}），稍後再試`);
  const data = await res.json();
  const content = apiKey ? data.choices?.[0]?.message?.content : data.content;
  return { content: content || '', model: data.model || model };
}

/** 呼叫一次；回傳格式驗證失敗就再試一次 */
export async function chatJson<T>(
  settings: Settings,
  messages: Msg[],
  parse: (content: string, model: string) => T,
  opts: { temperature?: number; signal?: AbortSignal } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    const { content, model } = await once(settings, messages, opts.temperature ?? 0.2, opts.signal);
    try {
      return parse(content, model);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new AiError('FORMAT', `AI 回傳的格式不正確，請再試一次（${(lastErr as Error)?.message ?? ''}）`);
}
