// 給 DeepSeek 的提示詞與回傳格式。改評估邏輯主要改這裡。

const SCHEMA = `{
  "verdict": "APPLY" | "MAYBE" | "SKIP",
  "score": 0 到 100 的整數（符合程度）,
  "summary": "一兩句話的結論，直接告訴使用者該不該投、為什麼",
  "matches": [{ "requirement": "職缺的某項要求", "evidence": "使用者哪段經歷符合" }],
  "gaps": [{ "requirement": "職缺的某項要求", "note": "使用者缺什麼、嚴不嚴重、怎麼補" }],
  "red_flags": [{ "flag": "地雷名稱", "quote": "職缺原文片段", "why": "為什麼要注意" }],
  "dealbreakers_hit": ["命中的使用者底線"],
  "pros": ["值得投的理由"],
  "cons": ["要考慮的缺點"],
  "questions_to_ask": ["面試時值得問清楚的問題"],
  "resume_tips": ["投這個職缺時，履歷應該強調哪些既有經歷"]
}`;

export function buildMessages(profile, job) {
  const system = [
    '你是熟悉台灣就業市場的求職顧問，幫使用者判斷一個職缺值不值得投。',
    '原則：',
    '1. 只根據使用者提供的經歷判斷，不要替使用者編造或誇大任何經歷。',
    '2. 「matches」的 evidence 必須引用使用者個人檔案裡真的有的內容；沒有就放進 gaps。',
    '3. 命中使用者底線（dealbreakers）時，verdict 一律為 SKIP，並寫進 dealbreakers_hit。',
    '4. 注意台灣職缺的常見地雷：責任制、薪資面議、需配合加班、抗壓性高、試用期打折、底薪加獎金、派遣、一人多工等。',
    '5. 用繁體中文、台灣用語回答，語氣直接、具體，不要客套。',
    '6. 只輸出 JSON，格式如下：',
    SCHEMA,
  ].join('\n');

  const p = profile;
  const user = [
    '# 使用者個人檔案',
    field('目前職稱／身分', p.title),
    field('總年資', p.years),
    field('工作經歷', p.experience),
    field('技能與工具', p.skills),
    field('代表性成果（STAR 案例）', p.stories),
    field('職涯目標', p.goals),
    field('期望薪資', p.salary),
    field('期望地點／遠端', p.location),
    field('其他偏好', p.preferences),
    field('不能接受的條件（底線）', [...(p.dealbreakerKeys || []).map(ruleLabel), p.dealbreakers].filter(Boolean).join('、')),
    field('舊履歷全文', p.resume),
    '',
    '# 職缺',
    field('網址', job.url),
    field('頁面標題', job.title),
    '## 頁面內容',
    (job.text || '').slice(0, 14000),
    '',
    '# 規則偵測到的可能地雷（請確認並補充）',
    (job.ruleHits || []).map((h) => `- ${h.label}：「${h.quote}」`).join('\n') || '（無）',
  ]
    .filter((x) => x !== null)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function field(name, value) {
  const v = (value || '').toString().trim();
  return v ? `## ${name}\n${v}` : null;
}

function ruleLabel(key) {
  return (globalThis.JOBFIT_RULES || []).find((r) => r.key === key)?.label || key;
}

export function parseEvaluation(content, ruleHits) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI 回傳的格式不正確，請再試一次');
    data = JSON.parse(m[0]);
  }
  const arr = (x) => (Array.isArray(x) ? x : []);
  const verdict = ['APPLY', 'MAYBE', 'SKIP'].includes(data.verdict) ? data.verdict : 'MAYBE';
  return {
    verdict,
    score: Math.max(0, Math.min(100, Math.round(Number(data.score) || 0))),
    summary: String(data.summary || ''),
    matches: arr(data.matches),
    gaps: arr(data.gaps),
    red_flags: arr(data.red_flags),
    dealbreakers_hit: arr(data.dealbreakers_hit),
    pros: arr(data.pros),
    cons: arr(data.cons),
    questions_to_ask: arr(data.questions_to_ask),
    resume_tips: arr(data.resume_tips),
    rule_hits: ruleHits,
    evaluatedAt: new Date().toISOString(),
  };
}
