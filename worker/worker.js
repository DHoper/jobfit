// 投準的 AI 代理（Cloudflare Worker）
// 保管站方的 DeepSeek 金鑰，讓使用者不用自己申請、輸入任何金鑰。
//
// 部署：
//   1. npm i -g wrangler && wrangler login
//   2. cd worker && wrangler deploy
//   3. wrangler secret put DEEPSEEK_API_KEY   （貼上金鑰）
//   4. 把部署後的網址填進 extension/background.js 的 DEFAULT_PROXY_URL
//
// 保護措施：
//   - 只接受投準擴充功能送來的請求（Origin 檢查，可在 wrangler.toml 設定允許的擴充功能 ID）
//   - 每個 IP 每天最多 DAILY_LIMIT 次（需要綁定 KV：RATE）
//   - 只轉送評估需要的欄位，固定使用 deepseek-chat 模型

const DAILY_LIMIT = 30;
const MAX_INPUT_CHARS = 40000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = isAllowedOrigin(origin, env);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (url.pathname !== '/evaluate' || request.method !== 'POST') return json({ error: 'not found' }, 404, cors);
    if (!allowed) return json({ error: 'forbidden' }, 403, cors);

    // 每日次數限制
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.RATE) {
      const key = `${new Date().toISOString().slice(0, 10)}:${ip}`;
      const used = Number((await env.RATE.get(key)) || 0);
      if (used >= DAILY_LIMIT) return json({ error: 'daily limit reached' }, 429, cors);
      await env.RATE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400, cors);
    }
    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter((m) => (m.role === 'system' || m.role === 'user') && typeof m.content === 'string')
          .slice(0, 2)
      : [];
    const size = messages.reduce((n, m) => n + m.content.length, 0);
    if (!messages.length || size > MAX_INPUT_CHARS) return json({ error: 'bad request' }, 400, cors);

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.2, response_format: { type: 'json_object' } }),
    });
    if (!res.ok) return json({ error: `upstream ${res.status}` }, 502, cors);
    const data = await res.json();
    // 不記錄任何使用者內容，只回傳模型的輸出
    return json({ content: data.choices?.[0]?.message?.content || '' }, 200, cors);
  },
};

function isAllowedOrigin(origin, env) {
  if (!origin.startsWith('chrome-extension://')) return false;
  const ids = (env.ALLOWED_EXTENSION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !ids.length || ids.includes(origin.replace('chrome-extension://', ''));
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
