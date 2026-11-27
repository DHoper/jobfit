// 投遞紀錄的統計：投了多少、進到面試的比例，以及 AI 建議和實際結果對不對得上。
import type { JobRecord, Verdict } from './types';

const SENT = new Set(['applied', 'interview', 'offer', 'rejected']);
const GOOD = new Set(['interview', 'offer']);

export interface Stats {
  total: number;
  sent: number;
  interviews: number;
  offers: number;
  interviewRate: number | null; // 0–1；還沒投遞時為 null
  /** 只算已經有結果（面試、offer、沒上）的紀錄 */
  byVerdict: { verdict: Verdict; outcomes: number; good: number }[];
  outcomes: number;
}

export function computeStats(records: JobRecord[]): Stats {
  const sent = records.filter((r) => SENT.has(r.status));
  const interviews = records.filter((r) => GOOD.has(r.status)).length;
  const offers = records.filter((r) => r.status === 'offer').length;
  const withOutcome = records.filter((r) => r.evaluation && (GOOD.has(r.status) || r.status === 'rejected'));
  const byVerdict = (['APPLY', 'MAYBE', 'SKIP'] as Verdict[])
    .map((verdict) => {
      const rs = withOutcome.filter((r) => r.evaluation!.verdict === verdict);
      return { verdict, outcomes: rs.length, good: rs.filter((r) => GOOD.has(r.status)).length };
    })
    .filter((x) => x.outcomes > 0);
  return {
    total: records.length,
    sent: sent.length,
    interviews,
    offers,
    interviewRate: sent.length ? interviews / sent.length : null,
    byVerdict,
    outcomes: withOutcome.length,
  };
}

export function sameCompany(records: Record<string, JobRecord>, company: string | undefined, exceptId: string): JobRecord[] {
  const norm = (s: string) => s.replace(/(股份)?有限公司|\s|台灣|臺灣|分公司/g, '').toLowerCase();
  if (!company || norm(company).length < 2) return [];
  const key = norm(company);
  return Object.values(records)
    .filter((r) => r.id !== exceptId && r.company && norm(r.company) === key)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 職缺內容的指紋：評估後職缺改過內容，提醒重新評估 */
export function textStamp(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
