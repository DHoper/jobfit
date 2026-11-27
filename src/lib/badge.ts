// 工具列圖示上的數字：在支援的求職網站打開職缺時，不用點開就知道有幾個地雷。
import { extractJobInPage, type ExtractResult } from './extract';
import { checkRules } from './rules';
import { BRAND } from './brand';
import type { JobRecord, Profile } from './types';

const JOB_HOSTS = /^https:\/\/www\.(104\.com\.tw|1111\.com\.tw|cake\.me|cakeresume\.com|yourator\.co|linkedin\.com)\//;
const VERDICT_WORD = { APPLY: '建議投', MAYBE: '再想想', SKIP: '別投' } as const;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function scheduleBadge(tabId: number, url: string | undefined) {
  clearTimeout(timers.get(tabId));
  if (!url || !JOB_HOSTS.test(url)) {
    clearBadge(tabId);
    return;
  }
  // 單頁應用程式換頁後內容晚一點才出現，等一下再讀
  timers.set(tabId, setTimeout(() => updateBadge(tabId), 1200));
}

async function clearBadge(tabId: number) {
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  await chrome.action.setTitle({ tabId, title: `${BRAND.name}：打開職缺評估` }).catch(() => {});
}

export async function updateBadge(tabId: number) {
  let res: ExtractResult | undefined;
  try {
    [{ result: res } = { result: undefined }] = (await chrome.scripting.executeScript({ target: { tabId }, func: extractJobInPage })) as { result: ExtractResult }[];
  } catch {
    return clearBadge(tabId);
  }
  if (!res?.ok) return clearBadge(tabId);
  const { profile = {}, records = {} } = (await chrome.storage.local.get(['profile', 'records'])) as { profile?: Profile; records?: Record<string, JobRecord> };
  const hits = checkRules(res.job, profile.keywords);
  const verdict = records[res.job.id]?.evaluation?.verdict;
  const high = hits.filter((h) => h.level === 'high').length;
  const blocked = hits.some((h) => h.id.startsWith('kw:') || (profile.dealbreakers || []).includes(h.id));

  await chrome.action.setBadgeText({ tabId, text: hits.length ? String(hits.length) : verdict ? '✓' : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: blocked || high || verdict === 'SKIP' ? '#E5484D' : hits.length ? '#FFC93C' : '#17804A' });
  await chrome.action.setBadgeTextColor?.({ tabId, color: blocked || high || verdict === 'SKIP' || (!hits.length && verdict) ? '#FFFFFF' : '#0F1733' });
  const parts = [
    verdict ? `評估結果：${VERDICT_WORD[verdict]}` : '',
    blocked ? '碰到你的底線' : '',
    hits.length ? `${hits.length} 個地雷：${hits.slice(0, 4).map((h) => h.label).join('、')}${hits.length > 4 ? '…' : ''}` : '沒有偵測到常見地雷',
  ].filter(Boolean);
  await chrome.action.setTitle({ tabId, title: `${BRAND.name}｜${parts.join('｜')}` });
}
