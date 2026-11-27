// 背景程式：打開側邊欄、執行 AI 評估（關掉側邊欄也會跑完）。
import { cancelEvaluation, runEvaluation } from '@/lib/evaluate';
import { scheduleBadge } from '@/lib/badge';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // 讓側邊欄也能讀寫評估進度
  chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

  // 工具列圖示顯示地雷數
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url || info.status === 'complete') scheduleBadge(tabId, tab.url);
  });
  // 切換分頁時補算（例如安裝前就開著的分頁）
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab) scheduleBadge(tabId, tab.url);
  });
  // 瀏覽器啟動、安裝或更新後，已經開著的職缺頁也算一次
  const scanAll = async () => {
    for (const tab of await chrome.tabs.query({})) if (tab.id) scheduleBadge(tab.id, tab.url);
  };
  chrome.runtime.onStartup.addListener(scanAll);
  chrome.runtime.onInstalled.addListener(scanAll);
  // 評估完成或底線改了，更新目前分頁的數字
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !(changes.records || changes.profile)) return;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id) scheduleBadge(tab.id, tab.url);
  });

  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('/options.html#welcome') });
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'open-side-panel' && sender.tab?.id) {
      // 必須在使用者點擊的當下呼叫，所以不能先 await 其他東西
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, error: String(e) }),
      );
      return true;
    }
    if (msg?.type === 'evaluate') {
      runEvaluation(msg.job, msg.hits);
      return false;
    }
    if (msg?.type === 'cancel-evaluate') {
      cancelEvaluation(msg.id);
      return false;
    }
    if (msg?.type === 'open-options') {
      chrome.runtime.openOptionsPage();
    }
    return false;
  });
});
