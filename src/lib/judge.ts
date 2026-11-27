// 不用 AI 的初步判斷：底線與薪資期望。AI 評估之後，這裡的結果仍然優先。
import type { Evaluation, Job, Profile, RuleHit } from './types';
import { annualRange, formatYuan, parseSalary } from './salary';

export interface Conflict {
  kind: 'dealbreaker' | 'salary';
  label: string;
  detail: string;
}

export function findConflicts(job: Job, hits: RuleHit[], profile: Profile): Conflict[] {
  const out: Conflict[] = [];
  const chosen = new Set(profile.dealbreakers || []);
  for (const h of hits) {
    if (chosen.has(h.id) || h.id.startsWith('kw:')) out.push({ kind: 'dealbreaker', label: h.label, detail: h.quote || h.why });
  }
  const floor = profile.salaryFloor;
  if (floor?.amount) {
    const s = parseSalary(job.salaryText);
    const range = annualRange(s);
    const floorYear = floor.unit === 'month' ? floor.amount * 12 : floor.amount;
    const top = range.max ?? (s.kind === 'negotiable' ? undefined : range.min);
    if (top !== undefined && top < floorYear) {
      out.push({
        kind: 'salary',
        label: '薪資低於你的期望',
        detail: `職缺最高約年薪 ${formatYuan(top)}，你的底線是${floor.unit === 'month' ? `月薪 ${formatYuan(floor.amount)}` : `年薪 ${formatYuan(floor.amount)}`}（以 12 個月計）`,
      });
    }
  }
  return out;
}

/** 底線永遠比 AI 優先：碰到就改成建議跳過 */
export function applyConflicts(e: Evaluation, conflicts: Conflict[]): Evaluation {
  if (!conflicts.length) return e;
  return {
    ...e,
    verdict: 'SKIP',
    dealbreakers_hit: [...new Set([...conflicts.map((c) => c.label), ...e.dealbreakers_hit])],
  };
}

export function profileCompleteness(p: Profile): { done: number; total: number; missing: string[] } {
  const items: [string, boolean][] = [
    ['經歷或舊履歷', Boolean((p.experience || p.resume || '').trim())],
    ['技能', Boolean((p.skills || '').trim())],
    ['代表性成果', Boolean((p.stories || '').trim())],
    ['職涯目標', Boolean((p.goals || '').trim())],
    ['薪資底線', Boolean(p.salaryFloor?.amount)],
    ['不能接受的條件', Boolean(p.dealbreakers?.length || p.keywords?.length || (p.dealbreakerNote || '').trim())],
  ];
  return { done: items.filter(([, ok]) => ok).length, total: items.length, missing: items.filter(([, ok]) => !ok).map(([n]) => n) };
}

export function hasUsableProfile(p: Profile) {
  return Boolean((p.experience || p.resume || p.skills || '').trim());
}
