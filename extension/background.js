// 背景程式：組合「個人檔案 + 職缺內容」，交給 DeepSeek 評估，回傳結構化結果。
//
// 呼叫方式（設定頁可改）：
//   1. 代理伺服器（預設、給一般使用者）：Cloudflare Worker 保管 DeepSeek 金鑰，使用者不用輸入任何東西
//   2. 直接用 DeepSeek 金鑰（給開發者自己測試）
import './rules.js'; // 讓提示詞能把「底線」的代號轉成中文名稱
import { buildMessages, parseEvaluation } from './prompt.js';

export const DEFAULT_PROXY_URL = ''; // 部署 worker/ 之後填入，例如 https://jobfit-proxy.<帳號>.workers.dev

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'evaluate') {
    evaluate(msg.job).then(
      (result) => sendResponse({ ok: true, result }),
      (e) => sendResponse({ ok: false, error: e.message }),
    );
    return true;
  }
  if (msg?.type === 'open-panel-in-tab') {
    openPanelInTab(msg.tabId).then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: e.message }),
    );
    return true;
  }
  if (msg?.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});

async function evaluate(job) {
  const { profile = {}, settings = {} } = await chrome.storage.local.get(['profile', 'settings']);
  if (!hasProfile(profile)) throw new Error('NO_PROFILE');
  const messages = buildMessages(profile, job);
  const proxyUrl = (settings.proxyUrl || DEFAULT_PROXY_URL || '').trim();

  let content;
  if (settings.apiKey) {
    content = await callDeepSeek(settings.apiKey.trim(), messages);
  } else if (proxyUrl) {
    content = await callProxy(proxyUrl, messages);
  } else {
    throw new Error('NO_ENDPOINT');
  }
  const result = parseEvaluation(content, job.ruleHits || []);
  // 碰到使用者勾選的底線：不靠 AI 判斷，直接改成「建議跳過」
  const blocked = (job.ruleHits || []).filter((h) => (profile.dealbreakerKeys || []).includes(h.key)).map((h) => h.label);
  if (blocked.length) {
    result.verdict = 'SKIP';
    result.dealbreakers_hit = [...new Set([...blocked, ...result.dealbreakers_hit])];
  }
  return result;
}

function hasProfile(p) {
  return Boolean((p.experience || '').trim() || (p.resume || '').trim() || (p.skills || '').trim());
}

async function callDeepSeek(apiKey, messages) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek 回應錯誤（HTTP ${res.status}）${res.status === 401 ? '：金鑰不正確' : ''}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callProxy(url, messages) {
  const res = await fetch(url.replace(/\/$/, '') + '/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (res.status === 429) throw new Error('今天的免費評估次數用完了，明天再來');
  if (!res.ok) throw new Error(`評估服務暫時無法使用（HTTP ${res.status}）`);
  const data = await res.json();
  return data.content || '';
}

// 在任何網站（1111、Cake、LinkedIn…）按擴充功能圖示時，把評估面板放進那個頁面
async function openPanelInTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['rules.js', 'content.js'] });
  await chrome.tabs.sendMessage(tabId, { type: 'jobfit:open' });
}
