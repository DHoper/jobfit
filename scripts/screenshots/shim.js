// Mock chrome.* APIs so built extension pages render in a normal tab for screenshots.
(() => {
  const P = new URLSearchParams(location.search);
  const scenario = P.get('s') || 'pre';
  const job = {
    id: '104:8x2kq', url: 'https://www.104.com.tw/job/8x2kq', site: '104',
    title: '資深後端工程師（Go / 金流平台）', company: '鼎昇數位支付股份有限公司', location: '台北市內湖區（每週可遠端 2 天）',
    salaryText: '月薪 70,000~95,000元', experience: '5年以上', education: '大學以上', skills: ['Go', 'PostgreSQL', 'Kubernetes'],
    description: '負責金流平台後端 API 設計與開發，處理每日百萬筆交易。\n本職務為責任制，產品上線前需配合加班。\n抗壓性高、能獨立作業者佳。\n試用期三個月，試用期間薪資 9 折。\n其他主管交辦事項。',
    requirements: '上班時段：09:00~18:00\n休假制度：週休二日', benefits: '年終視公司營運狀況發放、員工旅遊',
    source: 'api', fetchedAt: new Date().toISOString(),
  };
  const evaluation = {
    verdict: 'MAYBE', score: 72,
    summary: '技術方向很對口，你的 Go 與金流經驗是加分；但責任制加上線前加班，跟你「不想長期加班」的偏好衝突，面試時先問清楚實際工時再決定。',
    requirements: [
      { requirement: '5 年以上後端經驗', status: 'met', evidence: '你在兩家公司累積 6 年後端經驗' },
      { requirement: 'Go 與高併發系統', status: 'met', evidence: '訂單系統改寫成 Go，尖峰 3,000 QPS' },
      { requirement: '金流或支付領域', status: 'partial', evidence: '做過電商結帳串接，但沒碰過清分對帳' },
      { requirement: 'Kubernetes 維運', status: 'gap', evidence: '個人檔案沒有提到容器編排，屬於可補的缺口' },
    ],
    red_flags: [{ flag: '加班常態化', quote: '產品上線前需配合加班', why: '加上責任制，加班很可能沒有加班費' }],
    pros: ['技術棧與你目前的經驗高度重疊', '薪資上限高於你的底線 1.5 萬', '每週可遠端 2 天'],
    cons: ['責任制與上線前加班，工時不透明', '試用期薪資打九折'],
    questions_to_ask: ['過去半年團隊平均每月加班幾小時？'],
    resume_tips: ['把「訂單系統改寫成 Go、尖峰 3,000 QPS」放在經歷第一條', '電商結帳串接寫出交易量與對接的金流商'],
    dealbreakers_hit: [], model: 'deepseek-chat', evaluatedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  };
  const now = Date.now();
  const rec = (id, title, company, verdict, score, status, h, hits) => ({
    id, url: 'https://www.104.com.tw/job/' + id, site: '104', title, company, salaryText: '月薪 60,000~80,000元',
    ruleHits: hits || [], evaluation: verdict ? { ...evaluation, verdict, score } : undefined, status,
    createdAt: new Date(now - h * 3600e3).toISOString(), updatedAt: new Date(now - h * 3600e3).toISOString(),
  });
  const high = [{ id: 'responsibility', label: '責任制', level: 'high', why: '' }];
  const records = {
    a: rec('a', '後端工程師（電商平台）', '樂購科技', 'APPLY', 86, 'interview', 5),
    b: rec('b', 'Senior Backend Engineer', 'Nimbus Cloud', 'APPLY', 81, 'applied', 30),
    c: rec('c', '軟體工程師（責任制）', '宏碁網通', 'SKIP', 34, 'skipped', 50, high),
    d: rec('d', 'Golang 工程師', '小橘創新', 'MAYBE', 64, 'saved', 80),
    e: rec('e', '資深 PHP 工程師', '某某媒體', undefined, 0, 'saved', 120, high),
    f: rec('f', 'Platform Engineer', 'Kuma Data', 'APPLY', 77, 'rejected', 200),
  };
  if (scenario === 'eval') records[job.id] = { ...rec(job.id, job.title, job.company, 'MAYBE', 72, 'saved', 0.05), evaluation };
  const profile = scenario === 'noprofile' ? {} : {
    title: '後端工程師', years: '6 年', experience: '樂購科技｜後端工程師｜2021–至今\n負責訂單系統 API', skills: 'Go、PostgreSQL、Redis、AWS',
    stories: '', goals: '往金融科技的平台工程發展', salaryFloor: { amount: 70000, unit: 'month' }, dealbreakers: scenario === 'conflict' ? ['responsibility'] : ['not_employee', 'upfront_fee'],
    resume: '',
  };
  const store = { profile, settings: { proxyUrl: 'https://mock.workers.dev' }, records, schema: 2 };
  const listeners = [];
  const ev = () => ({ addListener() {}, removeListener() {} });
  window.chrome = {
    storage: {
      local: {
        async get(k) {
          if (k == null) return { ...store };
          const keys = Array.isArray(k) ? k : [k];
          return Object.fromEntries(keys.filter((x) => x in store).map((x) => [x, structuredClone(store[x])]));
        },
        async set(o) {
          const changes = {};
          for (const [k, v] of Object.entries(o)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
          listeners.forEach((l) => l(changes, 'local'));
        },
        async remove() {},
      },
      session: { async get() { return {}; }, async set() {} },
      onChanged: { addListener: (l) => listeners.push(l), removeListener() {} },
    },
    tabs: {
      async query() { return [{ id: 1, active: true, url: scenario === 'nojob' ? 'chrome://newtab' : job.url }]; },
      onActivated: ev(), onUpdated: ev(), create() {},
    },
    windows: { onFocusChanged: ev() },
    scripting: {
      async executeScript(o) {
        if (o.args) return [{ result: { ok: true, count: 4 } }];
        return [{ result: scenario === 'notjob' ? { ok: false, reason: 'not_job' } : { ok: true, job } }];
      },
    },
    permissions: { async request() { return true; } },
    runtime: { getURL: (p) => p, getManifest: () => ({ version: '0.2.0' }), sendMessage() {}, openOptionsPage() {} },
  };
  const realFetch = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).includes('mock.workers.dev')) {
      await new Promise((r) => setTimeout(r, 400));
      return new Response(JSON.stringify({ content: JSON.stringify(evaluation) }), { status: 200 });
    }
    return realFetch(url, init);
  };
})();
