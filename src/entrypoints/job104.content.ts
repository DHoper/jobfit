// 104 職缺頁右側的小標籤：當下顯示偵測到幾個地雷，點一下打開側邊欄看完整評估。
// 放在 Shadow DOM 裡，不受網站樣式影響，也不會影響網站。
import { extractJobInPage } from '@/lib/extract';
import { checkRules } from '@/lib/rules';
import { BRAND, MARK_PATH } from '@/lib/brand';

export default defineContentScript({
  matches: ['https://www.104.com.tw/*'],
  runAt: 'document_idle',
  main() {
    const host = document.createElement('div');
    host.id = 'jobfit-launcher';
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; right: 0; top: 42%;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        button {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 10px 8px 12px 10px; border: 0; border-radius: 12px 0 0 12px; cursor: pointer;
          background: #0F1733; color: #fff; box-shadow: -4px 6px 18px rgba(15,23,51,.28);
          font: 600 13px/1.25 'PingFang TC','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif;
          transform: translateX(3px); transition: transform .15s ease;
        }
        button:hover { transform: translateX(0); }
        button:focus-visible { outline: 2px solid #FFC93C; outline-offset: 2px; }
        svg { width: 24px; height: 24px; }
        .label { writing-mode: vertical-rl; letter-spacing: .14em; }
        .count {
          min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
          display: grid; place-items: center; font-size: 11px; letter-spacing: 0;
          background: #FFC93C; color: #0F1733;
        }
        .count.high { background: #E5484D; color: #fff; }
        .count[hidden] { display: none; }
        .label.apply { color: #6EE7A1; } .label.maybe { color: #FFC93C; } .label.skip { color: #FF8A8A; }
        @media (prefers-reduced-motion: reduce) { button { transition: none; } }
      </style>
      <button type="button" aria-label="${BRAND.name}：評估這個職缺">
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#FFC93C"/><path d="${MARK_PATH}" fill="#0F1733" stroke="#0F1733" stroke-width="1.2" stroke-linejoin="round"/></svg>
        <span class="label">評估職缺</span>
        <span class="count" hidden></span>
      </button>`;
    const btn = root.querySelector('button')!;
    const count = root.querySelector<HTMLElement>('.count')!;
    const label = root.querySelector<HTMLElement>('.label')!;
    const VERDICT = { APPLY: ['建議投', 'apply'], MAYBE: ['再想想', 'maybe'], SKIP: ['別投', 'skip'] } as const;
    let jobId = '';
    // 評估過的職缺：標籤直接顯示結論
    const showVerdict = async () => {
      const { records = {} } = await chrome.storage.local.get('records');
      const v = (records as Record<string, { evaluation?: { verdict: keyof typeof VERDICT } }>)[jobId]?.evaluation?.verdict;
      label.className = 'label' + (v ? ` ${VERDICT[v][1]}` : '');
      label.textContent = v ? VERDICT[v][0] : '評估職缺';
    };
    chrome.storage.onChanged.addListener((c, area) => area === 'local' && c.records && jobId && showVerdict());
    btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-side-panel' }));

    // 104 是單頁應用程式：換頁不會重新載入，所以監看網址
    let last = '';
    const refresh = async () => {
      if (location.href === last) return;
      last = location.href;
      const onJob = /^\/job\/[a-z0-9]+/i.test(location.pathname);
      host.style.display = onJob ? '' : 'none';
      count.hidden = true;
      if (!onJob) return;
      if (!host.isConnected) document.documentElement.appendChild(host);
      jobId = '';
      showVerdict();
      const res = await extractJobInPage();
      if (!res.ok || location.href !== last) return;
      jobId = res.job.id;
      showVerdict();
      const hits = checkRules(res.job);
      if (!hits.length) return;
      const high = hits.filter((h) => h.level === 'high').length;
      count.textContent = String(hits.length);
      count.classList.toggle('high', high > 0);
      count.hidden = false;
      btn.setAttribute('aria-label', `${BRAND.name}：偵測到 ${hits.length} 個地雷${high ? `，其中 ${high} 個高風險` : ''}，點一下看評估`);
    };
    document.documentElement.appendChild(host);
    refresh();
    setInterval(refresh, 1000);
  },
});
