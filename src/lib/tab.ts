// 側邊欄追蹤目前分頁，讀取職缺內容，並在頁面上標示地雷。
import { useCallback, useEffect, useRef, useState } from 'react';
import { extractJobInPage, highlightInPage, type ExtractResult } from './extract';
import type { Job } from './types';

export type TabState =
  | { kind: 'loading'; tabId?: number }
  | { kind: 'job'; tabId: number; job: Job }
  | { kind: 'not_job'; tabId?: number; url?: string }
  | { kind: 'no_access'; tabId: number; origin: string }
  | { kind: 'unsupported' };

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function extract(tabId: number): Promise<ExtractResult> {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: extractJobInPage });
  return res?.result as ExtractResult;
}

export function useActiveJob() {
  const [state, setState] = useState<TabState>({ kind: 'loading' });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const tab = await activeTab();
    if (!tab?.id) return setState({ kind: 'unsupported' });
    const url = tab.url || tab.pendingUrl || '';
    if (url && !/^https?:/.test(url)) return setState({ kind: 'unsupported' });
    // 同一個分頁重新讀取時保留目前畫面，避免閃爍；換分頁才顯示讀取中
    setState((prev) => (prev.kind === 'job' && prev.tabId === tab.id ? prev : { kind: 'loading', tabId: tab.id }));
    try {
      const res = await extract(tab.id);
      if (my !== seq.current) return;
      setState((prev) => {
        if (!res?.ok) return { kind: 'not_job', tabId: tab.id!, url };
        // 內容沒變就沿用同一個物件，下游不會重新計算
        if (prev.kind === 'job' && prev.job.id === res.job.id && prev.job.description === res.job.description) return prev;
        return { kind: 'job', tabId: tab.id!, job: res.job };
      });
    } catch {
      if (my !== seq.current) return;
      // 沒有權限讀這個網站：url 會是空的（沒有 tabs 權限），請使用者授權
      let origin = '';
      try {
        origin = new URL(url).origin;
      } catch {}
      setState({ kind: 'no_access', tabId: tab.id, origin });
    }
  }, []);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout>;
    const later = () => {
      clearTimeout(t);
      t = setTimeout(load, 350);
    };
    const onActivated = () => later();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (info.url || info.status === 'complete')) later();
    };
    const onFocus = () => later();
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(onFocus);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(onFocus);
    };
  }, [load]);

  /** 其他網站：請使用者授權讀取這個網站（必須在點擊時呼叫） */
  const grant = useCallback(async () => {
    const tab = await activeTab();
    let origin = state.kind === 'no_access' ? state.origin : '';
    if (!origin && tab?.url) origin = new URL(tab.url).origin;
    const ok = await chrome.permissions.request({ origins: [origin ? `${origin}/*` : 'https://*/*'] });
    if (ok) load();
  }, [state, load]);

  return { state, reload: load, grant };
}

// 依序執行，避免「清除」和「標示」同時送出時順序錯亂
let queue: Promise<unknown> = Promise.resolve();
export function highlight(tabId: number, terms: { text: string; level: string }[], focus?: string) {
  const run = async () => {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: highlightInPage, args: [terms, focus ?? null] });
      return (res?.result as { ok: boolean; count: number }) ?? { ok: false, count: 0 };
    } catch {
      return { ok: false, count: 0 };
    }
  };
  const p = queue.then(run, run);
  queue = p;
  return p;
}
