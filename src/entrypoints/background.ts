// 背景程式：點擴充功能圖示時打開側邊欄；104 頁面上的按鈕也透過這裡打開。
export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

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
    if (msg?.type === 'open-options') {
      chrome.runtime.openOptionsPage();
    }
    return false;
  });
});
