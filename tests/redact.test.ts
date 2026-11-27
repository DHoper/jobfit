import { describe, expect, it } from 'vitest';
import { guessName, redact } from '../src/lib/redact';
import { buildEvaluationMessages } from '../src/lib/prompt';

const RESUME = `王小明
手機：0912-345-678
Email: ming.wang@example.com
地址：台北市大安區忠孝東路 100 號
身分證 A123456789、市話 (02)2345-6789
GitHub：github.com/mingwang
樂購科技｜後端工程師｜2021–2024
王小明主導訂單系統改寫，尖峰 3,000 QPS，營收成長 20%`;

describe('redact', () => {
  const out = redact(RESUME, guessName(RESUME));
  it('移除聯絡資料與姓名', () => {
    for (const s of ['0912-345-678', 'ming.wang@example.com', '忠孝東路', 'A123456789', '2345-6789', 'mingwang', '王小明']) expect(out).not.toContain(s);
    expect(out).toContain('地址：[已移除]');
    expect(out).toContain('github.com/[帳號]');
  });
  it('保留經歷、年份與數字', () => {
    expect(out).toContain('樂購科技｜後端工程師｜2021–2024');
    expect(out).toContain('3,000 QPS');
    expect(out).toContain('20%');
  });
  it('猜姓名', () => {
    expect(guessName('姓名：陳大文\n...')).toBe('陳大文');
    expect(guessName('Backend Engineer\n...')).toBeUndefined();
  });
  it('評估訊息預設會遮掉，可以關閉', () => {
    const job = { id: 'x', url: '', site: 'other' as const, title: 't', description: 'd', source: 'page' as const, fetchedAt: '' };
    const on = buildEvaluationMessages({ resume: RESUME }, job, [])[1]!.content;
    const off = buildEvaluationMessages({ resume: RESUME }, job, [], { redact: false })[1]!.content;
    expect(on).not.toContain('0912-345-678');
    expect(off).toContain('0912-345-678');
  });
});
