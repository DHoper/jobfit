const status = document.getElementById('status');

document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById('evalBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) {
    status.textContent = '這個頁面不能評估，請先打開一個職缺頁。';
    return;
  }
  const resp = await chrome.runtime.sendMessage({ type: 'open-panel-in-tab', tabId: tab.id });
  if (resp?.ok) window.close();
  else status.textContent = `無法在這個頁面開啟：${resp?.error || '未知錯誤'}`;
});

// 提醒還沒填個人檔案
chrome.storage.local.get('profile').then(({ profile = {} }) => {
  const filled = ['experience', 'resume', 'skills'].some((k) => (profile[k] || '').trim());
  if (!filled) status.textContent = '還沒填個人檔案，先按「編輯個人檔案」，大約 5 分鐘。';
});
