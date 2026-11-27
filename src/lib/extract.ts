// 在職缺頁裡執行的函式（透過 chrome.scripting.executeScript 注入）。
// 注意：這些函式會被序列化後送進頁面執行，不能引用檔案外的任何變數或 import。
import type { Job } from './types';

export type ExtractResult = { ok: true; job: Job } | { ok: false; reason: 'not_job' | 'empty' };

export async function extractJobInPage(): Promise<ExtractResult> {
  const clean = (s: unknown) =>
    String(s ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const host = location.hostname;
  const url = location.href.split('#')[0] ?? location.href;
  const now = new Date().toISOString();
  const site =
    host.endsWith('104.com.tw') ? '104'
    : host.endsWith('1111.com.tw') ? '1111'
    : /cake(resume)?\.(me|com)$/.test(host) ? 'cake'
    : host.endsWith('yourator.co') ? 'yourator'
    : host.endsWith('linkedin.com') ? 'linkedin'
    : 'other';

  // 104：用職缺頁自己載入資料的 API，拿到完整的結構化內容
  if (site === '104') {
    const m = location.pathname.match(/^\/job\/([a-z0-9]+)/i);
    if (!m) return { ok: false, reason: 'not_job' };
    try {
      const res = await fetch(`/job/ajax/content/${m[1]}`, { credentials: 'include', headers: { Accept: 'application/json' } });
      const d = (await res.json())?.data;
      if (d?.jobDetail) {
        const jd = d.jobDetail;
        const c = d.condition || {};
        const list = (a: unknown) => (Array.isArray(a) ? a.map((x) => (typeof x === 'string' ? x : x?.description)).filter(Boolean) : []);
        const remote = jd.remoteWork?.description || '';
        return {
          ok: true,
          job: {
            id: `104:${m[1]}`,
            url: `https://www.104.com.tw/job/${m[1]}`,
            site,
            title: d.header?.jobName || document.title,
            company: d.header?.custName,
            location: [jd.addressRegion, jd.addressDetail].filter(Boolean).join('') + (remote ? `（${remote}）` : ''),
            salaryText: jd.salary,
            experience: c.workExp,
            education: c.edu,
            skills: [...list(c.specialty), ...list(c.skill)],
            description: clean(jd.jobDescription),
            requirements: clean(
              [
                jd.workPeriod && `上班時段：${jd.workPeriod}`,
                jd.vacationPolicy && `休假制度：${jd.vacationPolicy}`,
                jd.needEmp && `需求人數：${jd.needEmp}`,
                list(c.major).length && `科系要求：${list(c.major).join('、')}`,
                list(c.language).map((l) => `語文：${l}`).join('\n'),
                c.certificate && `證照：${list(c.certificate).join('、') || c.certificate}`,
                c.other,
              ]
                .filter(Boolean)
                .join('\n'),
            ),
            benefits: clean([list(d.welfare?.tag).join('、'), d.welfare?.welfare].filter(Boolean).join('\n')),
            source: 'api',
            fetchedAt: now,
          },
        };
      }
    } catch {
      /* 換成讀取頁面文字 */
    }
  }

  // 使用者有選取文字時，以選取的內容為準（104 已經有完整資料，不受影響）
  const sel = String(window.getSelection?.() ?? '').trim();
  if (sel.length > 120) {
    return {
      ok: true,
      job: { id: `url:${url.split('?')[0] ?? url}`, url, site, title: document.querySelector('h1')?.textContent?.trim() || document.title, description: sel, source: 'selection', fetchedAt: now },
    };
  }

  // 其他網站：多數職缺頁都有 schema.org 的 JobPosting 資料
  const flatten = (x: any): any[] => (Array.isArray(x) ? x.flatMap(flatten) : x?.['@graph'] ? flatten(x['@graph']) : [x]);
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const posting = flatten(JSON.parse(s.textContent || '')).find((x) => x?.['@type'] === 'JobPosting' || (Array.isArray(x?.['@type']) && x['@type'].includes('JobPosting')));
      if (!posting) continue;
      const bs = posting.baseSalary?.value;
      const unit = { MONTH: '月薪', YEAR: '年薪', HOUR: '時薪', DAY: '日薪' }[String(bs?.unitText || '').toUpperCase() as 'MONTH'] || '';
      const salaryText = bs
        ? `${unit}${bs.minValue ?? bs.value ?? ''}${bs.maxValue && bs.maxValue !== bs.minValue ? `~${bs.maxValue}` : ''}元`
        : undefined;
      const loc = [].concat(posting.jobLocation || []).map((l: any) => l?.address?.addressLocality || l?.address?.addressRegion).filter(Boolean)[0];
      const description = clean(posting.description);
      if (description.length < 80) continue;
      return {
        ok: true,
        job: {
          id: `url:${url.split('?')[0] ?? url}`,
          url,
          site,
          title: clean(posting.title) || document.title,
          company: posting.hiringOrganization?.name,
          location: loc,
          salaryText,
          experience: typeof posting.experienceRequirements === 'string' ? posting.experienceRequirements : posting.experienceRequirements?.description,
          education: typeof posting.educationRequirements === 'string' ? posting.educationRequirements : posting.educationRequirements?.credentialCategory,
          skills: typeof posting.skills === 'string' ? posting.skills.split(/[,、]/).map((x: string) => x.trim()) : undefined,
          description,
          source: 'jsonld',
          fetchedAt: now,
        },
      };
    } catch {
      /* 下一個 */
    }
  }

  // 最後：讀取頁面主要內容的文字
  const root = [document.querySelector('main'), document.querySelector('article'), document.querySelector('[role="main"]'), document.body].find(
    (el) => el && (el as HTMLElement).innerText?.trim().length > 300,
  ) as HTMLElement | undefined;
  const text = (root || document.body).innerText.replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 200) return { ok: false, reason: 'empty' };
  return {
    ok: true,
    job: { id: `url:${url.split('?')[0] ?? url}`, url, site, title: document.querySelector('h1')?.textContent?.trim() || document.title, description: text.slice(0, 20000), source: 'page', fetchedAt: now },
  };
}

/** 用 CSS Custom Highlight API 在頁面上標出地雷字詞，不改動網站的 DOM */
export function highlightInPage(terms: { text: string; level: string }[], focus?: string | null) {
  const NAMES = ['jobfit-high', 'jobfit-medium', 'jobfit-low', 'jobfit-focus'];
  const H = (globalThis as any).Highlight;
  const registry = (CSS as any).highlights;
  if (!H || !registry) return { ok: false, count: 0 };
  NAMES.forEach((n) => registry.delete(n));
  if (!document.getElementById('jobfit-highlight-style')) {
    const st = document.createElement('style');
    st.id = 'jobfit-highlight-style';
    st.textContent = `
      ::highlight(jobfit-high) { background-color: rgba(229, 72, 77, .28); color: inherit; text-decoration: underline 2px rgb(205, 43, 49); }
      ::highlight(jobfit-medium) { background-color: rgba(255, 201, 60, .5); color: inherit; }
      ::highlight(jobfit-low) { background-color: rgba(120, 130, 150, .2); color: inherit; }
      ::highlight(jobfit-focus) { background-color: rgb(255, 201, 60); color: #0F1733; }`;
    document.head.appendChild(st);
  }
  if (!terms.length) return { ok: true, count: 0 };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName) || p.closest('#jobfit-launcher')) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  const groups: Record<'high' | 'medium' | 'low' | 'focus', Range[]> = { high: [], medium: [], low: [], focus: [] };
  let first: Range | null = null;
  for (const t of terms) {
    const needle = t.text.trim().slice(0, 40);
    if (needle.length < 2) continue;
    for (const node of nodes) {
      let i = node.nodeValue!.indexOf(needle);
      while (i >= 0) {
        const r = new Range();
        r.setStart(node, i);
        r.setEnd(node, i + needle.length);
        (groups[t.level as 'high'] || groups.low).push(r);
        if (focus && t.text === focus) {
          groups.focus.push(r);
          first ||= r;
        }
        i = node.nodeValue!.indexOf(needle, i + needle.length);
      }
    }
  }
  let count = 0;
  for (const [lv, ranges] of Object.entries(groups)) {
    if (!ranges.length) continue;
    registry.set(`jobfit-${lv}`, new H(...ranges));
    if (lv !== 'focus') count += ranges.length;
  }
  if (first) {
    (first as Range).startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => registry.delete('jobfit-focus'), 2400);
  }
  return { ok: true, count };
}
