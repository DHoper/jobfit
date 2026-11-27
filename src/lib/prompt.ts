// 給 DeepSeek 的提示詞與回傳格式驗證。改評估邏輯主要改這裡。
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
  '   score 計分：必要條件符合程度占 60、加分條件 20、與職涯目標和偏好（地點、遠端、產業）的契合 20。地雷不扣 score，只影響 verdict。',
  '   職缺薪資上限低於使用者的薪資底線時，視同命中底線。',
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
    // 已經填了經歷欄位時，舊履歷只當補充，縮短以節省用量
    field('舊履歷全文', (profile.resume || '').slice(0, (profile.experience || '').trim() ? 3000 : 8000)),
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
    { role: 'system' as const, content: `${SYSTEM}\n今天是 ${new Date().toISOString().slice(0, 10)}。` },
    { role: 'user' as const, content: user },
  ];
}

/** 把評估整理成純文字，方便貼給朋友或存到筆記 */
export function evaluationToText(job: Job, e: Evaluation, hits: RuleHit[]): string {
  const V = { APPLY: '建議投', MAYBE: '再想想', SKIP: '別投' };
  const mark = { met: '✓', partial: '△', gap: '✗' };
  const lines = [
    `${job.title}${job.company ? `｜${job.company}` : ''}`,
    job.salaryText ? `薪資：${job.salaryText}` : '',
    `結論：${V[e.verdict]}（符合度 ${e.score}）`,
    e.summary,
    '',
    hits.length ? `地雷：${hits.map((h) => h.label).join('、')}` : '',
    e.requirements.length ? '需求對照：' : '',
    ...e.requirements.map((r) => `${mark[r.status]} ${r.requirement}：${r.evidence}`),
    e.questions_to_ask.length ? '\n面試要問：' : '',
    ...e.questions_to_ask.map((q, i) => `${i + 1}. ${q}`),
    '',
    job.url,
  ];
  return lines.filter((l, i, a) => l !== '' || (a[i - 1] ?? '') !== '').join('\n').trim();
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

// 回傳格式驗證：AI 偶爾會漏欄位、型別不對，這裡把不合格的值換成安全的預設值
const str = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const strArr = (v: unknown) => arr(v).map(str).filter(Boolean).slice(0, 6);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T => (opts.includes(v as T) ? (v as T) : fallback);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

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
  const d = obj(parseJsonLoose(content));
  const n = Number(d.score);
  return {
    verdict: oneOf(d.verdict, ['APPLY', 'MAYBE', 'SKIP'] as const, 'MAYBE'),
    score: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50,
    summary: str(d.summary),
    requirements: arr(d.requirements).map(obj).map((r) => ({
      requirement: str(r.requirement),
      status: oneOf(r.status, ['met', 'partial', 'gap'] as const, 'partial'),
      evidence: str(r.evidence),
    })).filter((r) => r.requirement),
    red_flags: arr(d.red_flags).map(obj).map((f) => ({ flag: str(f.flag), quote: str(f.quote), why: str(f.why) })).filter((f) => f.flag),
    pros: strArr(d.pros),
    cons: strArr(d.cons),
    questions_to_ask: strArr(d.questions_to_ask),
    resume_tips: strArr(d.resume_tips),
    dealbreakers_hit: strArr(d.dealbreakers_hit),
    model,
    evaluatedAt: new Date().toISOString(),
  };
}

export function parseResumeSplit(content: string) {
  const d = obj(parseJsonLoose(content));
  return { title: str(d.title), years: str(d.years), experience: str(d.experience), skills: str(d.skills), stories: str(d.stories) };
}
