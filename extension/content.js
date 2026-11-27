// 職缺頁上的評估按鈕與結果面板。
// 104：職缺頁（/job/...）自動出現右下角按鈕。
// 其他求職網站：按瀏覽器上的擴充功能圖示 →「評估這個頁面」時才放進來。
// 面板放在 Shadow DOM 裡，不會被網站的樣式影響，也不會影響網站。
// 品牌圖示：準星裡的勾
var MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#FFC93C"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="#0F1733" stroke-width="2.4"/><path d="M16 4.5v5M16 22.5v5M4.5 16h5M22.5 16h5" stroke="#0F1733" stroke-width="2.4" stroke-linecap="round"/><path d="m12.4 16.2 2.5 2.5 4.8-5" fill="none" stroke="#0F1733" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

(() => {
  if (window.__jobfitLoaded) return;
  window.__jobfitLoaded = true;

  const host = document.createElement('div');
  host.id = 'jobfit-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; right: 20px; bottom: 20px;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS()}</style>
    <button class="fab" part="fab" aria-label="評估這個職缺">
      <span class="fab-mark">${MARK}</span><span>評估這個職缺</span>
    </button>
    <aside class="panel" hidden role="dialog" aria-label="投準：職缺評估">
      <header class="head">
        <span class="brand">${MARK}<b>投準</b></span>
        <button class="icon close" aria-label="關閉">✕</button>
      </header>
      <div class="body"></div>
    </aside>`;
  document.documentElement.appendChild(host);

  const fab = shadow.querySelector('.fab');
  const panel = shadow.querySelector('.panel');
  const body = shadow.querySelector('.body');
  shadow.querySelector('.close').addEventListener('click', () => toggle(false));
  fab.addEventListener('click', () => toggle(true));

  const is104 = location.hostname === 'www.104.com.tw';
  const isJobPage = () => !is104 || location.pathname.startsWith('/job/');
  let manual = !is104; // 非 104 的頁面是使用者手動叫出來的

  // 104 是單頁應用程式，換頁不會重新載入，所以定時檢查網址
  let lastUrl = '';
  setInterval(() => {
    const show = manual || isJobPage();
    fab.hidden = !show || !panel.hidden;
    if (!show) panel.hidden = true;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (!panel.hidden) renderIdle();
    }
  }, 800);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'jobfit:open') {
      manual = true;
      toggle(true);
    }
  });

  async function toggle(open) {
    panel.hidden = !open;
    fab.hidden = open;
    if (open) {
      const cached = await getCached();
      cached ? renderResult(cached, true) : renderIdle();
    }
  }

  // ---------- 讀取職缺內容 ----------
  function readJob() {
    // 不依賴網站的版面結構：直接取主要內容的文字，交給 AI 理解
    const candidates = [document.querySelector('main'), document.querySelector('article'), document.querySelector('[role="main"]'), document.body];
    const root = candidates.find((el) => el && el.innerText && el.innerText.trim().length > 300) || document.body;
    const text = root.innerText.replace(/\n{3,}/g, '\n\n').trim();
    const h1 = document.querySelector('h1')?.innerText?.trim();
    return { url: location.href.split('#')[0], title: h1 || document.title, text, ruleHits: globalThis.jobfitCheckRules(text) };
  }

  const cacheKey = () => `eval:${location.href.split(/[?#]/)[0]}`;
  async function getCached() {
    const k = cacheKey();
    return (await chrome.storage.local.get(k))[k] || null;
  }

  // ---------- 畫面 ----------
  function renderIdle() {
    const job = readJob();
    body.innerHTML = `
      <p class="lead">對照你的個人檔案，判斷這個職缺值不值得投。</p>
      <button class="btn primary go">開始評估</button>
      <button class="btn ghost settings">編輯個人檔案</button>
      ${job.ruleHits.length ? `<div class="quick"><p class="label">先看到 ${job.ruleHits.length} 個可能地雷</p>${flagsHtml(job.ruleHits.map((h) => ({ flag: h.label, quote: h.quote, why: h.why, level: h.level })))}</div>` : ''}`;
    body.querySelector('.go').addEventListener('click', run);
    body.querySelector('.settings').addEventListener('click', openOptions);
  }

  async function run() {
    const job = readJob();
    body.innerHTML = `<div class="loading"><span class="spinner"></span><p>正在對照你的經歷分析這個職缺…</p><p class="hint">大約需要 10–30 秒</p></div>`;
    const resp = await chrome.runtime.sendMessage({ type: 'evaluate', job }).catch((e) => ({ ok: false, error: e.message }));
    if (!resp?.ok) return renderError(resp?.error);
    const result = { ...resp.result, title: job.title, url: job.url };
    await chrome.storage.local.set({ [cacheKey()]: result });
    renderResult(result, false);
  }

  function renderError(err) {
    if (err === 'NO_PROFILE') {
      body.innerHTML = `<p class="lead">還沒有個人檔案。先填一下你的經歷和偏好，評估才有依據，大約 5 分鐘。</p><button class="btn primary settings">填寫個人檔案</button>`;
    } else if (err === 'NO_ENDPOINT') {
      body.innerHTML = `<p class="lead">還沒設定 AI 評估服務。到設定頁的「進階設定」填入代理網址或 DeepSeek 金鑰。</p><button class="btn primary settings">打開設定</button>`;
    } else {
      body.innerHTML = `<p class="lead">評估沒有完成：${esc(err || '未知錯誤')}</p><button class="btn primary go">再試一次</button>`;
      body.querySelector('.go').addEventListener('click', run);
    }
    body.querySelector('.settings')?.addEventListener('click', openOptions);
  }

  const VERDICT = {
    APPLY: { text: '建議投', cls: 'apply' },
    MAYBE: { text: '可以考慮', cls: 'maybe' },
    SKIP: { text: '建議跳過', cls: 'skip' },
  };

  function renderResult(r, fromCache) {
    const v = VERDICT[r.verdict] || VERDICT.MAYBE;
    const ruleFlags = (r.rule_hits || []).map((h) => ({ flag: h.label, quote: h.quote, why: h.why, level: h.level }));
    const aiFlags = (r.red_flags || []).filter((f) => !ruleFlags.some((x) => x.flag === f.flag));
    body.innerHTML = `
      <div class="verdict ${v.cls}">
        <div><p class="v-text">${v.text}</p><p class="v-sum">${esc(r.summary)}</p></div>
        <div class="score" aria-label="符合度 ${r.score} 分"><b>${r.score}</b><span>符合度</span></div>
      </div>
      ${r.dealbreakers_hit?.length ? section('碰到你的底線', list(r.dealbreakers_hit), 'danger') : ''}
      ${ruleFlags.length || aiFlags.length ? section('地雷', flagsHtml([...ruleFlags, ...aiFlags])) : ''}
      ${r.matches?.length ? section('你符合的', r.matches.map((m) => `<li><b>${esc(m.requirement)}</b><span>${esc(m.evidence)}</span></li>`).join(''), 'list') : ''}
      ${r.gaps?.length ? section('你缺的', r.gaps.map((g) => `<li><b>${esc(g.requirement)}</b><span>${esc(g.note)}</span></li>`).join(''), 'list') : ''}
      ${r.pros?.length ? section('優點', list(r.pros)) : ''}
      ${r.cons?.length ? section('缺點', list(r.cons)) : ''}
      ${r.resume_tips?.length ? section('履歷要強調', list(r.resume_tips)) : ''}
      ${r.questions_to_ask?.length ? section('面試時問清楚', list(r.questions_to_ask)) : ''}
      <p class="meta">${fromCache ? '這是之前的評估結果，' : ''}評估於 ${new Date(r.evaluatedAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}</p>
      <button class="btn ghost go">重新評估</button>`;
    body.querySelector('.go').addEventListener('click', run);
  }

  function section(title, inner, kind = '') {
    const isList = inner.startsWith('<li');
    return `<section class="sec ${kind}"><h3>${esc(title)}</h3>${isList ? `<ul>${inner}</ul>` : inner}</section>`;
  }
  const list = (items) => items.map((t) => `<li>${esc(typeof t === 'string' ? t : JSON.stringify(t))}</li>`).join('');
  function flagsHtml(flags) {
    return `<ul class="flags">${flags
      .map((f) => `<li class="lv-${f.level || 'medium'}"><b>${esc(f.flag)}</b>${f.quote ? `<q>${esc(f.quote)}</q>` : ''}<span>${esc(f.why || '')}</span></li>`)
      .join('')}</ul>`;
  }
  function openOptions() {
    chrome.runtime.sendMessage({ type: 'open-options' });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 樣式 ----------
  function CSS() {
    return `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .fab, .panel, .btn { font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif; }
    .fab {
      display: inline-flex; align-items: center; gap: 10px; height: 52px; padding: 0 20px 0 14px;
      border: 0; border-radius: 999px; cursor: pointer;
      background: #0F1733; color: #fff; font-size: 15px; font-weight: 700;
      box-shadow: 0 10px 30px rgba(15, 23, 51, .35);
    }
    .fab:hover { background: #18244A; }
    .fab:focus-visible, .btn:focus-visible, .icon:focus-visible { outline: 3px solid #FFC93C; outline-offset: 2px; }
    .fab-mark svg, .brand svg { width: 26px; height: 26px; display: block; }
    .panel {
      width: min(420px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: auto;
      background: #fff; color: #182447; border-radius: 18px;
      box-shadow: 0 24px 70px rgba(15, 23, 51, .35); font-size: 14px; line-height: 1.6;
    }
    .head {
      position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px 12px 16px; background: #0F1733; color: #fff;
    }
    .brand { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; }
    .icon { background: none; border: 0; color: rgba(255,255,255,.75); font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
    .icon:hover { color: #fff; background: rgba(255,255,255,.1); }
    .body { padding: 16px; }
    .lead { margin: 0 0 14px; color: #4E5A78; }
    .label { margin: 0 0 6px; font-weight: 700; }
    .btn {
      display: block; width: 100%; height: 44px; margin-top: 10px; border-radius: 999px; cursor: pointer;
      font-size: 15px; font-weight: 700; border: 1px solid #D5DBE5; background: #fff; color: #182447;
    }
    .btn.primary { background: #FFC93C; border-color: #FFC93C; }
    .btn.primary:hover { background: #FFD666; }
    .btn.ghost:hover { border-color: #7D879F; }
    .loading { text-align: center; padding: 28px 0 18px; color: #4E5A78; }
    .loading p { margin: 6px 0 0; }
    .hint { font-size: 12px; color: #7D879F; }
    .spinner {
      display: inline-block; width: 34px; height: 34px; border-radius: 50%;
      border: 4px solid #EEF1F6; border-top-color: #FFC93C; animation: spin .9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
    .verdict { display: flex; justify-content: space-between; gap: 14px; padding: 14px; border-radius: 14px; margin-bottom: 14px; }
    .verdict.apply { background: #E6F5EC; } .verdict.maybe { background: #FFF5D6; } .verdict.skip { background: #FDE8E6; }
    .v-text { margin: 0; font-size: 20px; font-weight: 800; }
    .apply .v-text { color: #187A44; } .maybe .v-text { color: #8A5A00; } .skip .v-text { color: #B42318; }
    .v-sum { margin: 4px 0 0; color: #182447; }
    .score { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 64px; }
    .score b { font-size: 28px; line-height: 1; }
    .score span { font-size: 11px; color: #4E5A78; margin-top: 4px; }
    .sec { margin: 0 0 14px; }
    .sec h3 { margin: 0 0 6px; font-size: 14px; }
    .sec.danger h3 { color: #B42318; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 0 0 6px; }
    .sec.list ul, .flags { list-style: none; padding: 0; }
    .sec.list li, .flags li { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 10px; background: #F5F7FA; }
    .sec.list li span, .flags li span { color: #4E5A78; font-size: 13px; }
    .flags li { border-left: 3px solid #F0B429; }
    .flags li.lv-high { border-left-color: #D92D20; }
    .flags li.lv-low { border-left-color: #98A2B3; }
    q { display: block; margin: 2px 0; font-size: 12.5px; color: #7D879F; quotes: '「' '」'; }
    .quick { margin-top: 18px; }
    .meta { margin: 6px 0 0; font-size: 12px; color: #7D879F; }`;
  }
})();
