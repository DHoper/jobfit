// 端對端測試：把建置好的擴充功能載入 Chrome，在模擬的 104 職缺頁上測右側標籤、讀取資料、頁面標示。
// 用法：npm run build && npm run e2e（可用 CHROME_PATH 指定 Chrome）
// Load the real built extension into Chrome and exercise it on a mocked 104 job page.
import puppeteer from 'puppeteer-core';

const EXT = new URL('../.output/chrome-mv3', import.meta.url).pathname;
const OUT = new URL('../.output/e2e/', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const JOB = {
  data: {
    header: { jobName: '資深後端工程師（Go）', custName: '鼎昇數位支付股份有限公司' },
    jobDetail: {
      jobDescription: '負責金流平台後端 API 開發。<br>本職務為責任制，上線前需配合加班。<br>試用期三個月，試用期間薪資 9 折。',
      salary: '月薪 70,000~95,000元', addressRegion: '台北市內湖區', addressDetail: '', workPeriod: '日班', vacationPolicy: '週休二日',
      remoteWork: { description: '每週可遠端 2 天' },
    },
    condition: { workExp: '5年以上', edu: '大學', specialty: [{ description: 'Go' }], skill: [{ description: '後端工程' }], other: '抗壓性高者佳' },
    welfare: { tag: ['員工旅遊'], welfare: '年終視公司營運狀況發放' },
  },
};
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>104 job</title></head><body>
<main><h1>資深後端工程師（Go）</h1><p>負責金流平台後端 API 開發。</p><p>本職務為責任制，上線前需配合加班。</p>
<p>試用期三個月，試用期間薪資 9 折。</p><p>抗壓性高者佳</p>${'<p>其他內容</p>'.repeat(20)}</main></body></html>`;

const browser = await puppeteer.launch({
  dumpio: Boolean(process.env.DEBUG),
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  enableExtensions: [EXT],
  args: ['--no-sandbox'], protocolTimeout: 30000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
await page.setRequestInterception(true);
let apiHits = 0;
page.on('request', (req) => {
  const u = req.url();
  if (u.startsWith('https://www.104.com.tw/job/ajax/content/')) {
    apiHits++;
    return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(JOB) });
  }
  if (u.startsWith('https://www.104.com.tw/')) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
  req.continue();
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('https://www.104.com.tw/job/8x2kq', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
const launcher = await page.evaluate(() => {
  const h = document.getElementById('jobfit-launcher');
  return h ? { shown: h.style.display !== 'none', rect: h.getBoundingClientRect().toJSON() } : null;
});
console.log('launcher', JSON.stringify(launcher), 'apiHits', apiHits);
await page.screenshot({ path: OUT + 'e2e-104.png' });

// Find extension id from service worker target
const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 10000 });
const extId = new URL(sw.url()).host;
console.log('extId', extId);

// Open the real side panel page in a tab; point "active tab" at the 104 tab, keep scripting real.
const tabId = await (async () => {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  const id = await p.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.104.com.tw/*' }))[0].id);
  // seed a profile with a dealbreaker so the conflict path shows
  await p.evaluate(() => chrome.storage.local.set({ schema: 2, profile: { experience: 'Go 後端 6 年', dealbreakers: ['responsibility'], salaryFloor: { amount: 60000, unit: 'month' } } }));
  await p.close();
  return id;
})();
const panel = await browser.newPage();
await panel.setViewport({ width: 400, height: 1400, deviceScaleFactor: 2 });
await panel.evaluateOnNewDocument((id) => {
  const q = chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query = async (o) => (o && o.active ? [{ id, active: true, url: 'https://www.104.com.tw/job/8x2kq' }] : q(o));
}, tabId);
panel.on('pageerror', (e) => console.log('PANEL PAGEERROR', e.message));
panel.on('console', (m) => m.type() === 'error' && console.log('PANEL CONSOLE', m.text()));
await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2000));
const title = await panel.$eval('h1', (e) => e.textContent).catch(() => null);
const flags = await panel.$$eval('section button span.font-semibold', (els) => els.map((e) => e.textContent));
console.log('panel title', title, 'flags', JSON.stringify(flags));
await panel.screenshot({ path: OUT + 'e2e-panel.png' });
// highlight applied in page?
await new Promise((r) => setTimeout(r, 1500));
const hl = await page.evaluate(() => [...CSS.highlights.keys()].map((k) => [k, CSS.highlights.get(k).size]));
console.log('highlights', JSON.stringify(hl));
const fail = [];

// ---------- 工具列圖示上的地雷數 ----------
await page.bringToFront(); // 切回職缺分頁時會重新計算
await new Promise((r) => setTimeout(r, 2500));
const badge = await (async () => {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  const b = await p.evaluate(async (id) => ({ text: await chrome.action.getBadgeText({ tabId: id }), title: await chrome.action.getTitle({ tabId: id }) }), tabId);
  await p.close();
  return b;
})();
console.log('badge', JSON.stringify(badge));

// ---------- 上傳 PDF / Word 履歷 ----------
const fs = await import('node:fs');
const os = await import('node:os');
const pathMod = await import('node:path');
const { zipSync, strToU8 } = await import('fflate');
const tmp = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'bileizhen-'));
const pdfMaker = await browser.newPage();
await pdfMaker.setContent('<html><body style="font-family:sans-serif"><h1>陳大文</h1><p>後端工程師，負責訂單系統 API，尖峰 3,000 QPS。</p><p>技能：Go、PostgreSQL、Redis、Kubernetes</p><p>樂購科技｜後端工程師｜2021–2024</p></body></html>');
const pdfPath = pathMod.join(tmp, 'resume.pdf');
await pdfMaker.pdf({ path: pdfPath });
await pdfMaker.close();
const docxPath = pathMod.join(tmp, 'resume.docx');
fs.writeFileSync(docxPath, zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>林小美</w:t></w:r></w:p><w:p><w:r><w:t>前端工程師｜React</w:t></w:r></w:p><w:p><w:r><w:t>負責電商網站結帳流程改版，轉換率提升 12%，帶領 3 人前端小組。</w:t></w:r></w:p></w:body></w:document>') }));
async function upload(file) {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${extId}/options.html#profile`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => chrome.storage.local.set({ profile: {} }));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 800));
  const input = await p.$('input[type=file]');
  await input.uploadFile(file);
  await p.waitForFunction(() => (document.querySelector('textarea')?.value || '').length > 5 || document.querySelector('[data-sonner-toast]'), { timeout: 15000 }).catch(() => {});
  const v = await p.$eval('textarea', (t) => t.value);
  const toasts = await p.$$eval('[data-sonner-toast]', (els) => els.map((e) => e.textContent));
  if (!v) console.log('upload toast', file, toasts);
  await p.close();
  return v;
}
const pdfText = await upload(pdfPath);
const docxText = await upload(docxPath);
console.log('pdf', JSON.stringify(pdfText.slice(0, 80)), 'docx', JSON.stringify(docxText));

// ---------- 其他網站（全部是模擬頁面）----------
const OTHER = {
  'https://www.linkedin.com/jobs/view/4012345678/': `<h1 class="top-card-layout__title">Senior Backend Engineer</h1>
    <a class="topcard__org-name-link">Nimbus Cloud</a><div id="job-details"><p>Build payment APIs in Go.</p><p>本職務為責任制，需配合加班。</p>${'<p>More details about the role.</p>'.repeat(5)}</div>`,
  'https://www.yourator.co/companies/kuma/jobs/45': `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Platform Engineer', hiringOrganization: { name: 'Kuma Data' }, baseSalary: { value: { minValue: 60000, maxValue: 90000, unitText: 'MONTH' } }, description: '<p>維運 Kubernetes 平台與 CI/CD。</p><p>錄取前需完成帶回家作業。</p><p>' + '團隊介紹。'.repeat(20) + '</p>' })}</script><h1>Platform Engineer</h1>`,
  'https://www.1111.com.tw/': `<h1>1111 人力銀行</h1><main>${'<p>熱門職缺推薦與求職新聞。</p>'.repeat(40)}</main>`,
};
page.on('request', () => {});
const other = await browser.newPage();
await other.setRequestInterception(true);
other.on('request', (req) => {
  const body = OTHER[req.url()];
  if (body) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>` });
  req.continue();
});
async function panelFor(url) {
  await other.goto(url, { waitUntil: 'domcontentloaded' });
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  const id = await p.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  await p.close();
  const sp = await browser.newPage();
  await sp.setViewport({ width: 400, height: 900 });
  await sp.evaluateOnNewDocument((id, u) => {
    const q = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (o) => (o && o.active ? [{ id, active: true, url: u }] : q(o));
  }, id, url);
  await sp.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await sp.evaluate(() => ({
    title: document.querySelector('h1')?.textContent || null,
    empty: document.querySelector('h2')?.textContent || null,
    flags: [...document.querySelectorAll('section button span.font-semibold')].map((e) => e.textContent),
    meta: document.querySelector('dl')?.textContent || '',
  }));
  await sp.close();
  return r;
}
const li = await panelFor('https://www.linkedin.com/jobs/view/4012345678/');
console.log('linkedin', JSON.stringify(li));
const yo = await panelFor('https://www.yourator.co/companies/kuma/jobs/45');
console.log('yourator', JSON.stringify(yo));
const home = await panelFor('https://www.1111.com.tw/');
console.log('1111 home', JSON.stringify(home));

if (!launcher?.shown) fail.push('104 頁面沒有出現評估標籤');
if (apiHits < 1) fail.push('沒有呼叫 104 職缺資料 API');
if (title !== JOB.data.header.jobName) fail.push(`側邊欄職稱不對：${title}`);
for (const f of ['責任制', '需配合加班', '試用期薪資打折', '抗壓性高']) if (!flags.includes(f)) fail.push(`沒抓到地雷：${f}`);
if (!hl.some(([k, n]) => k === 'jobfit-high' && n > 0)) fail.push('頁面上沒有標出高風險字詞');
if (li.title !== 'Senior Backend Engineer' || !li.flags.includes('責任制')) fail.push('LinkedIn 職缺讀取或地雷偵測失敗');
if (yo.title !== 'Platform Engineer' || !yo.meta.includes('Kuma Data') || !yo.meta.includes("月薪 60,000~90,000 元") || !yo.flags.includes('面試前需完成作業')) fail.push('Yourator（JSON-LD）讀取失敗');
if (home.title || home.empty !== '這頁不是職缺頁') fail.push('1111 首頁被誤當成職缺');
if (badge.text !== '5' || !badge.title.includes('責任制')) fail.push(`工具列圖示的地雷數不對：${JSON.stringify(badge)}`);
if (!pdfText.includes('陳大文') || !pdfText.includes('3,000 QPS')) fail.push('PDF 履歷讀取失敗');
if (!docxText.includes('林小美') || !docxText.includes('前端工程師｜React')) fail.push('Word 履歷讀取失敗');
await page.bringToFront(); await page.screenshot({ path: OUT + 'e2e-104-marked.png' });
// launcher label after a fake evaluation record
await panel.evaluate(() => chrome.storage.local.get('records').then(({ records = {} }) => chrome.storage.local.set({ records: { ...records, '104:8x2kq': { id: '104:8x2kq', url: '', site: '104', title: 't', ruleHits: [], status: 'saved', createdAt: '', updatedAt: '', evaluation: { verdict: 'SKIP', score: 30, summary: '', requirements: [], red_flags: [], pros: [], cons: [], questions_to_ask: [], resume_tips: [], dealbreakers_hit: [], evaluatedAt: new Date().toISOString() } } } })));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: OUT + 'e2e-104-verdict.png', clip: { x: 1100, y: 250, width: 100, height: 300 } });
await page.bringToFront();
await browser.close();
if (fail.length) {
  console.error('失敗：\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('全部通過，截圖在 .output/e2e/');
