// 個人檔案設定頁：輸入時自動儲存到 chrome.storage.local
const $ = (s) => document.querySelector(s);
const savedEl = $('#saved');
let profile = {};
let settings = {};

// ---------- 分頁 ----------
document.querySelectorAll('[role="tab"]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
    if (tab.dataset.tab === 'history') renderHistory();
  }),
);

// ---------- 載入與自動儲存 ----------
async function load() {
  ({ profile = {}, settings = {} } = await chrome.storage.local.get(['profile', 'settings']));
  document.querySelectorAll('[data-key]').forEach((el) => (el.value = profile[el.dataset.key] || ''));
  document.querySelectorAll('[data-setting]').forEach((el) => (el.value = settings[el.dataset.setting] || ''));
  renderDealbreakers();
}

let timer;
function save() {
  clearTimeout(timer);
  savedEl.textContent = '儲存中…';
  timer = setTimeout(async () => {
    await chrome.storage.local.set({ profile, settings });
    savedEl.textContent = '已儲存';
  }, 400);
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.key) profile[el.dataset.key] = el.value;
  else if (el.dataset.setting) settings[el.dataset.setting] = el.value;
  else return;
  save();
});

function renderDealbreakers() {
  const chosen = new Set(profile.dealbreakerKeys || []);
  $('#dealbreakerChecks').innerHTML = globalThis.JOBFIT_RULES.map(
    (r) => `<label class="check"><input type="checkbox" value="${r.key}" ${chosen.has(r.key) ? 'checked' : ''}><span><b>${r.label}</b><small>${r.why}</small></span></label>`,
  ).join('');
  $('#dealbreakerChecks').addEventListener('change', () => {
    profile.dealbreakerKeys = [...document.querySelectorAll('#dealbreakerChecks input:checked')].map((i) => i.value);
    save();
  });
}

// ---------- 匯出／匯入 ----------
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'jobfit', version: 1, profile }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `投準個人檔案-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.profile || typeof data.profile !== 'object') throw new Error();
    if (!confirm('匯入會取代目前的個人檔案，確定嗎？')) return;
    profile = data.profile;
    await chrome.storage.local.set({ profile });
    await load();
    savedEl.textContent = '已匯入';
  } catch {
    alert('這個檔案不是投準匯出的個人檔案。');
  } finally {
    e.target.value = '';
  }
});

// ---------- 評估紀錄 ----------
const VERDICT = { APPLY: '建議投', MAYBE: '可以考慮', SKIP: '建議跳過' };
async function renderHistory() {
  const all = await chrome.storage.local.get(null);
  const items = Object.entries(all)
    .filter(([k]) => k.startsWith('eval:'))
    .map(([, v]) => v)
    .sort((a, b) => (b.evaluatedAt || '').localeCompare(a.evaluatedAt || ''));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('#historyList').innerHTML = items.length
    ? `<ul class="history">${items
        .map(
          (r) => `<li>
            <span class="badge ${String(r.verdict).toLowerCase()}">${VERDICT[r.verdict] || r.verdict}</span>
            <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a>
            <span class="score">${r.score} 分</span>
            <p>${esc(r.summary)}</p>
          </li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">還沒有評估過任何職缺。打開 104 的職缺頁，按右下角的「評估這個職缺」。</p>';
}

$('#clearHistory').addEventListener('click', async () => {
  if (!confirm('確定要清除所有評估紀錄嗎？個人檔案不會被刪除。')) return;
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('eval:')));
  savedEl.textContent = '已清除評估紀錄';
});

load();
