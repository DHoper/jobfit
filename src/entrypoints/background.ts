// 背景程式：打開側邊欄、執行 AI 評估（關掉側邊欄也會跑完）。
import { cancelEvaluation, runEvaluation } from '@/lib/evaluate';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // 讓側邊欄也能讀寫評估進度
  chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

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
