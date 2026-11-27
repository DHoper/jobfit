import { describe, expect, it } from 'vitest';
import { checkRules } from '../src/lib/rules';
import { annualRange, belowMinWage, minWageFor, parseSalary } from '../src/lib/salary';
import { findConflicts } from '../src/lib/judge';
import { parseEvaluation } from '../src/lib/prompt';
import type { Job } from '../src/lib/types';

const job = (description: string, extra: Partial<Job> = {}): Job => ({
  id: 't', url: 'https://x', site: '104', title: '工程師', description, source: 'api', fetchedAt: '', ...extra,
});
const ids = (j: Job) => checkRules(j).map((h) => h.id);

describe('parseSalary', () => {
  it.each([
    ['月薪 40,000~60,000元', { kind: 'month', min: 40000, max: 60000 }],
    ['月薪45,000元以上', { kind: 'month', min: 45000, max: undefined }],
    ['年薪 80萬~120萬元', { kind: 'year', min: 800000, max: 1200000 }],
    ['年薪800,000~1,200,000元', { kind: 'year', min: 800000, max: 1200000 }],
    ['時薪 200元', { kind: 'hour', min: 200, max: 200 }],
    ['4~6萬', { kind: 'month', min: 40000, max: 60000 }],
    ['NT$ 50K - 70K / 月', { kind: 'month', min: 50000, max: 70000 }],
  ])('%s', (text, expected) => {
    expect(parseSalary(text)).toMatchObject(expected);
  });
  it('待遇面議（經常性薪資達4萬元或以上）', () => {
    expect(parseSalary('待遇面議（經常性薪資達4萬元或以上）')).toEqual({ kind: 'negotiable', negotiableFloor: 40000 });
  });
  it('換算年薪', () => {
    expect(annualRange(parseSalary('月薪 40,000~60,000元'))).toEqual({ min: 480000, max: 720000 });
  });
});

describe('最低工資', () => {
  it('依年度切換', () => {
    expect(minWageFor(new Date('2026-11-27')).month).toBe(29500);
    expect(minWageFor(new Date('2027-01-02')).month).toBe(30900);
  });
  it('低於最低工資', () => {
    expect(belowMinWage(parseSalary('月薪 30,000元'), new Date('2027-03-01'))).toContain('30,900');
    expect(belowMinWage(parseSalary('月薪 30,000元'), new Date('2026-11-27'))).toBeNull();
    expect(belowMinWage(parseSalary('時薪 190元'), new Date('2026-11-27'))).toContain('196');
  });
});

describe('checkRules', () => {
  it('抓到常見地雷', () => {
    const hits = ids(job('本職務為責任制，需配合加班，抗壓性高者佳。試用期三個月薪資 9 折。', { salaryText: '待遇面議' }));
    expect(hits).toEqual(expect.arrayContaining(['responsibility', 'overtime', 'pressure', 'probation_pay', 'salary_hidden']));
  });
  it('否定句不算', () => {
    expect(ids(job('非責任制，不需輪班，準時下班。'))).not.toContain('responsibility');
    expect(ids(job('非責任制，不需輪班，準時下班。'))).not.toContain('shift');
  });
  it('可疑徵才', () => {
    expect(ids(job('無經驗可，月入10萬不是夢，有興趣請加LINE詳談'))).toEqual(expect.arrayContaining(['high_pay_no_exp', 'line_contact']));
    expect(ids(job('柬埔寨高薪客服，包吃包住包機票'))).toContain('overseas_scam');
    expect(ids(job('錄取後需繳交保證金 5000 元'))).toContain('upfront_fee');
  });
  it('休假與合約', () => {
    expect(ids(job('月休6天，做六休一'))).toContain('few_days_off');
    expect(ids(job('月休8天'))).not.toContain('few_days_off');
    expect(ids(job('需簽兩年最低服務年限，未滿一年離職需賠償訓練費用'))).toContain('contract_penalty');
    expect(ids(job('以承攬方式合作，勞健保自理'))).toContain('not_employee');
  });
  it('薪資含加班費、低於最低工資', () => {
    expect(ids(job('月薪已含加班費'))).toContain('overtime_included');
    expect(ids(job('一般內容', { salaryText: '月薪 25,000元' }))).toContain('below_min_wage');
  });
  it('提供原文引用，高風險排前面', () => {
    const hits = checkRules(job('福利很好。\n其他主管交辦事項，抗壓性佳。本職務為責任制。'));
    expect(hits[0]?.id).toBe('responsibility');
    expect(hits.find((h) => h.id === 'pressure')?.quote).toContain('抗壓性佳');
  });
  it('一般正常的 JD 沒有誤判', () => {
    const text = `負責後端 API 設計與開發，使用 Go 與 PostgreSQL。
與產品、設計團隊合作規劃新功能，參與 code review。
其他主管交辦事項。
週休二日，彈性上下班，遠端每週兩天。`;
    expect(ids(job(text, { salaryText: '月薪 70,000~100,000元' }))).toEqual([]);
  });
});

describe('底線', () => {
  it('勾選的規則與薪資期望', () => {
    const j = job('責任制', { salaryText: '月薪 40,000~50,000元' });
    const c = findConflicts(j, checkRules(j), { dealbreakers: ['responsibility'], salaryFloor: { amount: 60000, unit: 'month' } });
    expect(c.map((x) => x.kind)).toEqual(['dealbreaker', 'salary']);
  });
});

describe('parseEvaluation', () => {
  it('容錯：缺欄位、多餘文字', () => {
    const e = parseEvaluation('好的，結果如下：{"verdict":"APPLY","score":"88","summary":"符合","requirements":[{"requirement":"Go","status":"met","evidence":"3 年 Go"}],"pros":["遠端"]}');
    expect(e.verdict).toBe('APPLY');
    expect(e.score).toBe(88);
    expect(e.cons).toEqual([]);
    expect(e.requirements[0]?.status).toBe('met');
  });
  it('未知的 verdict 變成 MAYBE', () => {
    expect(parseEvaluation('{"verdict":"YES"}').verdict).toBe('MAYBE');
  });
});

describe('常見誤判', () => {
  it.each([
    ['電機：負責高壓電設備維護', 'pressure'],
    ['本公司承攬各大公共工程', 'not_employee'],
    ['期貨保證金管理與風控', 'upfront_fee'],
    ['公司全額補助訓練費', 'upfront_fee'],
    ['福利：年終獎金、業績獎金', 'commission'],
    ['駐點工程師，於客戶端維運', 'dispatch'],
  ])('%s 不算 %s', (text, id) => {
    expect(ids(job(text))).not.toContain(id);
  });
  it('真正的地雷仍然抓得到', () => {
    expect(ids(job('以承攬方式合作'))).toContain('not_employee');
    expect(ids(job('錄取後需繳交保證金'))).toContain('upfront_fee');
    expect(ids(job('需能在高壓環境下工作'))).toContain('pressure');
    expect(ids(job('底薪 3 萬加業績獎金'))).toContain('commission');
  });
  it('面議會說明 104 的最低保證', () => {
    const h = checkRules(job('待遇面議', { salaryText: '待遇面議（經常性薪資達4萬元或以上）' })).find((x) => x.id === 'salary_hidden');
    expect(h?.why).toContain('至少 4 萬');
  });
});
