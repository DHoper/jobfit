// 給 DeepSeek 的提示詞與回傳格式驗證。改評估邏輯主要改這裡。
import { z } from 'zod';
import type { Evaluation, Job, Profile, RuleHit } from './types';
import { RULE_BY_ID } from './rules';
import { formatYuan } from './salary';

const SCHEMA = `{
  "verdict": "APPLY" | "MAYBE" | "SKIP",
  "score": 0 到 100 的整數（使用者與職缺的符合程度）,
  "summary": "一兩句話的結論：該不該投、最關鍵的理由",
  "requirements": [{ "requirement": "職缺的一項要求（簡短）", "status": "met" | "partial" | "gap", "evidence": "met/partial：引用使用者個人檔案裡的哪段經歷；gap：缺什麼、嚴不嚴重" }],
  "red_flags": [{ "flag": "地雷名稱", "quote": "職缺原文片段", "why": "為什麼要注意" }],
  "pros": ["值得投的理由"],
  "cons": ["要考慮的缺點"],
  "questions_to_ask": ["面試時值得問清楚的問題"],
  "resume_tips": ["投這個職缺時，履歷要把哪段既有經歷放前面、怎麼寫"],
  "dealbreakers_hit": ["命中的使用者底線"]
}`;

const SYSTEM = [
  '你是熟悉台灣就業市場的資深求職顧問，幫使用者判斷一個職缺值不值得投。',
  '原則：',
  '1. 只根據使用者提供的經歷判斷，絕對不要替使用者編造或誇大任何經歷。',
  '2. requirements 的 evidence 必須引用個人檔案裡真的有的內容；找不到就是 gap。列出職缺最重要的 4–8 項要求。',
  '3. 命中使用者底線時，verdict 一律為 SKIP，並寫進 dealbreakers_hit。',
  '4. 「規則偵測到的地雷」已經會顯示給使用者，red_flags 只放規則沒抓到、但從語意看得出來的問題；沒有就給空陣列。',
  '5. 判斷標準：APPLY = 主要要求大多符合且沒有嚴重地雷；MAYBE = 有明顯缺口或需要問清楚的地方；SKIP = 方向不符、缺口太大或地雷嚴重。',
  '6. 用繁體中文、台灣用語，語氣直接具體，不客套。每個陣列最多 5 項，每項一句話。',
  '7. 只輸出 JSON，格式如下：',
  SCHEMA,
].join('\n');

function field(name: string, value: unknown): string | null {
  const v = (Array.isArray(value) ? value.join('、') : String(value ?? '')).trim();
  return v ? `## ${name}\n${v}` : null;
}

export function buildEvaluationMessages(profile: Profile, job: Job, hits: RuleHit[]) {
  const floor = profile.salaryFloor?.amount
    ? `${profile.salaryFloor.unit === 'month' ? '月薪' : '年薪'} ${formatYuan(profile.salaryFloor.amount)} 以上`
    : '';
  const dealbreakers = [...(profile.dealbreakers || []).map((id) => RULE_BY_ID[id]?.label ?? id), profile.dealbreakerNote]
    .filter(Boolean)
    .join('、');

  const user = [
    '# 使用者個人檔案',
    field('目前職稱／身分', profile.title),
    field('總年資', profile.years),
    field('工作經歷', profile.experience),
    field('技能與工具', profile.skills),
    field('代表性成果', profile.stories),
    field('職涯目標', profile.goals),
    field('薪資底線', floor),
    field('期望地點／遠端', profile.location),
    field('其他偏好', profile.preferences),
    field('不能接受的條件（底線）', dealbreakers),
    field('舊履歷全文', (profile.resume || '').slice(0, 8000)),
    '',
    '# 職缺',
    field('職稱', job.title),
    field('公司', job.company),
    field('地點', job.location),
    field('薪資', job.salaryText),
    field('經歷要求', job.experience),
    field('學歷要求', job.education),
    field('技能要求', job.skills),
    field('工作內容', job.description.slice(0, 9000)),
    field('其他條件', job.requirements),
    field('福利', (job.benefits || '').slice(0, 2000)),
    '',
    '# 規則偵測到的地雷（已顯示給使用者）',
    hits.map((h) => `- ${h.label}：「${h.quote ?? ''}」`).join('\n') || '（無）',
  ]
    .filter((x): x is string => x !== null)
    .join('\n');

  return [
    { role: 'system' as const, content: SYSTEM },
    { role: 'user' as const, content: user },
  ];
}

export function buildResumeSplitMessages(resume: string) {
  return [
    {
      role: 'system' as const,
      content: [
        '把使用者貼上的履歷整理成個人檔案欄位。只能重新整理原文已有的內容，不要新增、推測或美化任何經歷、數字或技能。',
        '只輸出 JSON：{ "title": "目前職稱", "years": "總年資，例如 5 年", "experience": "每段經歷一段：公司｜職稱｜期間，下一行列主要負責的事", "skills": "技能與工具，用頓號分隔", "stories": "原文中有具體成果的段落，每個一段" }',
        '原文沒有的欄位給空字串。用繁體中文。',
      ].join('\n'),
    },
    { role: 'user' as const, content: resume.slice(0, 12000) },
  ];
}

const str = z.coerce.string().catch('');
const strArr = z.array(z.coerce.string()).catch([]).transform((a) => a.filter(Boolean).slice(0, 6));

const EvalSchema = z.object({
  verdict: z.enum(['APPLY', 'MAYBE', 'SKIP']).catch('MAYBE'),
  score: z.coerce.number().catch(50).transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  summary: str,
  requirements: z
    .array(z.object({ requirement: str, status: z.enum(['met', 'partial', 'gap']).catch('partial'), evidence: str }))
    .catch([]),
  red_flags: z.array(z.object({ flag: str, quote: str, why: str })).catch([]),
  pros: strArr,
  cons: strArr,
  questions_to_ask: strArr,
  resume_tips: strArr,
  dealbreakers_hit: strArr,
});

export function parseJsonLoose(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI 回傳的格式不正確');
    return JSON.parse(m[0]);
  }
}

export function parseEvaluation(content: string, model?: string): Evaluation {
  const data = EvalSchema.parse(parseJsonLoose(content));
  return { ...data, model, evaluatedAt: new Date().toISOString() };
}

const SplitSchema = z.object({ title: str, years: str, experience: str, skills: str, stories: str });
export function parseResumeSplit(content: string) {
  return SplitSchema.parse(parseJsonLoose(content));
}
