// 產生商店截圖與介面預覽：用模擬的 chrome API 打開建置好的頁面，拍 1280×800 截圖。
// 用法：npm run build && npm run screenshots（可用 CHROME_PATH 指定 Chrome）
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = (p) => new URL(p, import.meta.url).pathname;
const ROOT = here('../../.output/chrome-mv3');
const OUT = here('../../docs/store/');
const shim = fs.readFileSync(here('./shim.js'), 'utf8');
const extra = { '/store.html': fs.readFileSync(here('./store.html')) };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = extra[u.pathname];
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!body) {
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    body = fs.readFileSync(p);
  }
  const type = u.pathname.endsWith('.html') ? 'text/html' : u.pathname.endsWith('.js') ? 'text/javascript' : u.pathname.endsWith('.css') ? 'text/css' : 'image/png';
  if (type === 'text/html') body = body.toString().replace('<head>', `<head><script>${shim}</script>`);
  res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
  res.end(body);
}).listen(5178);

const q = (h, sub, extra = '') => `h=${encodeURIComponent(h)}&sub=${encodeURIComponent(sub)}${extra}`;
const shots = [
  { file: '1-flags.png', url: `store.html?s=pre&${q('打開職缺，地雷馬上標出來', '責任制、薪資面議、綁約違約金等 27 種台灣職缺地雷，直接在頁面上用螢光筆畫出原文。')}` },
  { file: '2-verdict.png', url: `store.html?s=eval&${q('對照你的經歷，告訴你該不該投', '逐項列出你符合、部分符合或缺少的要求，每一項都引用你自己的經歷。', `&scroll=${encodeURIComponent('需求對照')}`)}` },
  { file: '3-tracker.png', url: 'options.html?s=pre#records' },
];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
fs.mkdirSync(OUT, { recursive: true });
for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:5178/${s.url}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: OUT + s.file });
  await page.close();
  console.log('✓', s.file);
}
await browser.close();
server.close();
