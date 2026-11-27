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
if (!launcher?.shown) fail.push('104 頁面沒有出現評估標籤');
if (apiHits < 1) fail.push('沒有呼叫 104 職缺資料 API');
if (title !== JOB.data.header.jobName) fail.push(`側邊欄職稱不對：${title}`);
for (const f of ['責任制', '需配合加班', '試用期薪資打折', '抗壓性高']) if (!flags.includes(f)) fail.push(`沒抓到地雷：${f}`);
if (!hl.some(([k, n]) => k === 'jobfit-high' && n > 0)) fail.push('頁面上沒有標出高風險字詞');
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
