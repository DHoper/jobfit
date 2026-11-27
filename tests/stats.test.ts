import { describe, expect, it } from 'vitest';
import { computeStats, sameCompany } from '../src/lib/stats';
import type { JobRecord, Status, Verdict } from '../src/lib/types';

const r = (id: string, status: Status, verdict?: Verdict, company = 'A 公司'): JobRecord => ({
  id, url: '', site: '104', title: id, company, ruleHits: [], status, createdAt: '', updatedAt: id,
  evaluation: verdict ? { verdict, score: 50, summary: '', requirements: [], red_flags: [], pros: [], cons: [], questions_to_ask: [], resume_tips: [], dealbreakers_hit: [], evaluatedAt: '' } : undefined,
});

describe('computeStats', () => {
  it('漏斗與 AI 對照', () => {
    const s = computeStats([r('1', 'interview', 'APPLY'), r('2', 'rejected', 'APPLY'), r('3', 'offer', 'MAYBE'), r('4', 'applied', 'SKIP'), r('5', 'saved')]);
    expect(s).toMatchObject({ total: 5, sent: 4, interviews: 2, offers: 1, interviewRate: 0.5, outcomes: 3 });
    expect(s.byVerdict).toEqual([
      { verdict: 'APPLY', outcomes: 2, good: 1 },
      { verdict: 'MAYBE', outcomes: 1, good: 1 },
    ]);
  });
  it('沒投遞時面試率是 null', () => {
    expect(computeStats([r('1', 'saved')]).interviewRate).toBeNull();
  });
});

describe('sameCompany', () => {
  it('忽略「股份有限公司」等字樣', () => {
    const recs = { a: r('a', 'applied', undefined, '鼎昇數位支付股份有限公司'), b: r('b', 'saved', undefined, '別家') };
    expect(sameCompany(recs, '鼎昇數位支付', 'x').map((x) => x.id)).toEqual(['a']);
    expect(sameCompany(recs, '鼎昇數位支付', 'a')).toEqual([]);
  });
});
