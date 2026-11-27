// 台灣職缺常見的地雷字眼：規則式偵測，不用 AI、當下就有結果，結果也會交給 AI 參考。
// level：high = 很可能有問題；medium = 值得問清楚；low = 提醒注意
// 每條規則都可以在個人檔案裡設成「底線」：命中就直接建議跳過。
import type { Job, Level, RuleHit } from './types';
import { belowMinWage, parseSalary } from './salary';

export type Category = 'pay' | 'hours' | 'contract' | 'work' | 'scam';

export const CATEGORY_LABEL: Record<Category, string> = {
  pay: '薪資',
  hours: '工時與休假',
  contract: '合約與雇用',
  work: '工作內容與文化',
  scam: '可疑徵才',
};

export interface Rule {
  id: string;
  label: string;
  level: Level;
  category: Category;
  why: string;
  ask?: string;
  re?: RegExp;
  check?: (job: Job, text: string) => { match?: string; quote?: string; why?: string } | null;
}

// 前面接這些字時視為否定，例如「非責任制」「不需輪班」「無試用期」
const NEGATION = /(非|無|不|免|沒有|不需|不用|不必|拒絕|反對|零)\s*$/;

export const RULES: Rule[] = [
  // ---------- 薪資 ----------
  {
    id: 'below_min_wage', label: '低於最低工資', level: 'high', category: 'pay',
    why: '寫出來的薪資低於法定最低工資，雇主違法，或是用名目把薪水拆開。',
    ask: '這個數字是不是已經包含其他津貼？實際的經常性薪資是多少？',
    check: (job) => {
      const why = belowMinWage(parseSalary(job.salaryText));
      return why ? { match: job.salaryText, quote: job.salaryText, why } : null;
    },
  },
  {
    id: 'salary_hidden', label: '薪資面議', level: 'medium', category: 'pay',
    why: '沒寫薪資範圍，面試前很難判斷值不值得去，也常是薪資偏低的訊號。',
    ask: '這個職缺的薪資範圍大概是多少？',
    check: (job, text) => {
      const m = text.match(/(待遇|薪資|薪水)\s*面議/);
      if (!m) return null;
      const s = parseSalary(job.salaryText);
      return {
        match: m[0],
        why: s.negotiableFloor
          ? `沒寫薪資範圍，只保證經常性薪資至少 ${s.negotiableFloor / 10000} 萬。實際給多少要面試時談。`
          : '沒寫薪資範圍，面試前很難判斷值不值得去，也常是薪資偏低的訊號。',
      };
    },
  },
  {
    id: 'overtime_included', label: '薪資已含加班費', level: 'high', category: 'pay',
    why: '把加班費包進月薪，加班越多時薪越低，也可能違反勞基法的加班費計算。',
    ask: '月薪含多少小時的加班？超過的部分怎麼算？',
    re: /(含|包含|內含|已含)\s*.{0,4}加班費|加班費.{0,4}(內含|已含|包含在)/,
  },
  {
    id: 'probation_pay', label: '試用期薪資打折', level: 'medium', category: 'pay',
    why: '試用期薪水比正式低，要問清楚多久、差多少。',
    ask: '試用期多久？試用期間的薪資是多少，轉正後多少？',
    re: /試用期.{0,12}(薪|打折|\d+\s*%|\d+\s*折)/,
  },
  {
    id: 'commission', label: '底薪加獎金', level: 'medium', category: 'pay',
    why: '收入有一大部分看業績，實際拿到的可能遠低於寫的數字。',
    ask: '團隊裡多數人實際每月拿到多少？業績門檻怎麼定？',
    re: /底薪.{0,10}(獎金|業績|抽成|分紅)|績效抽成|業績抽成/,
  },
  {
    id: 'no_base', label: '無底薪或純抽成', level: 'high', category: 'pay',
    why: '沒有業績就沒有收入，風險全在你身上。',
    re: /無底薪|純抽成|零底薪|只領(獎金|抽成)/,
  },
  {
    id: 'bonus_vague', label: '年終看公司營運', level: 'low', category: 'pay',
    why: '年終沒有保障，寫出來的「年薪」可能拿不到。',
    ask: '過去兩年年終實際發幾個月？',
    re: /年終.{0,8}(視|依|看).{0,6}(營運|獲利|績效|公司)/,
  },
  {
    id: 'equity_instead', label: '以股份代替薪資', level: 'medium', category: 'pay',
    why: '股份不一定有價值，現金薪資才是確定的。',
    re: /創業夥伴|技術入股|以股代薪|股份.{0,4}(取代|代替|抵)/,
  },

  // ---------- 工時與休假 ----------
  {
    id: 'responsibility', label: '責任制', level: 'high', category: 'hours',
    why: '常代表沒有加班費、工時不固定。',
    ask: '平均每週實際工時多少？加班怎麼計算？',
    re: /責任制/,
  },
  {
    id: 'overtime', label: '需配合加班', level: 'high', category: 'hours',
    why: '加班已經寫進條件裡，工時很可能偏長。',
    ask: '團隊平均每月加班多少小時？是加班費還是補休？',
    re: /配合.{0,4}加班|能(接受)?加班|需(要)?加班|可(以)?加班|加班配合|經常加班/,
  },
  {
    id: 'few_days_off', label: '休假少於法定', level: 'high', category: 'hours',
    why: '依勞基法每 7 天至少要有 2 天休息，一個月大約 8 天以上。',
    check: (_job, text) => {
      const m = text.match(/(月休|每月休|每月排休)\s*([0-7])\s*(天|日)|單休|週休一日|做六休一|一週休一/);
      return m ? { match: m[0] } : null;
    },
  },
  {
    id: 'shift', label: '輪班或大夜', level: 'low', category: 'hours',
    why: '作息不固定，長期對身體負擔大。',
    ask: '班表多久前排好？夜班有額外津貼嗎？',
    re: /輪班|大夜|小夜|三班制|兩班制/,
  },
  {
    id: 'weekend', label: '假日需上班', level: 'low', category: 'hours',
    why: '休假和一般人錯開，或假日也要待命。',
    re: /假日.{0,2}(需|要)?(上班|值班|待命)|週末.{0,2}(需|要)?上班/,
  },

  // ---------- 合約與雇用 ----------
  {
    id: 'contract_penalty', label: '綁約或違約金', level: 'high', category: 'contract',
    why: '提早離職要賠錢，最低服務年限需有合理補償才合法（勞基法第 15-1 條）。',
    ask: '綁約多久？公司提供什麼對應的培訓或補償？違約金怎麼算？',
    re: /違約金|最低服務(年限|期間)|綁約|未滿.{0,6}(年|個月).{0,12}(賠償|返還|扣)/,
  },
  {
    id: 'not_employee', label: '承攬或不保勞健保', level: 'high', category: 'contract',
    why: '不是正式僱傭關係，就沒有勞基法保障：沒有加班費、資遣費、勞退。',
    ask: '是正式員工嗎？公司會幫我投保勞健保和提撥勞退嗎？',
    re: /承攬(制|關係|方式|合約|契約|性質)|以承攬|勞(健)?保自理|(不|未)(投|加)保勞|無勞健保|開發票請款|接案合作/,
  },
  {
    id: 'dispatch', label: '派遣或約聘', level: 'medium', category: 'contract',
    why: '雇主可能不是你面試的那家公司，福利與穩定度要另外確認。',
    ask: '合約多久？期滿轉正的比例大概多少？',
    re: /派遣|約聘|外包人員/,
  },
  {
    id: 'travel', label: '需出差或外派', level: 'low', category: 'contract',
    why: '可能需要長時間在外地。',
    ask: '出差頻率多高？一次多久？',
    re: /出差|外派|派駐/,
  },

  // ---------- 工作內容與文化 ----------
  {
    id: 'pressure', label: '抗壓性高', level: 'medium', category: 'work',
    why: '通常代表工作量大、壓力大，或主管風格強勢。',
    ask: '這個職位壓力最大的時候通常是什麼情況？',
    re: /抗壓性?.{0,2}?(高|佳|強|好)|能承受(高)?壓力|高壓(環境|工作|下)|耐操|能吃苦/,
  },
  {
    id: 'multitask', label: '一人多工', level: 'medium', category: 'work',
    why: '工作範圍不清楚，可能一個人做好幾個人的事。',
    ask: '這個職位目前團隊有幾個人？主要時間花在哪些事？',
    re: /一人多工|身兼數職|包山包海|多工處理|一條龍/,
  },
  {
    id: 'grow_together', label: '「像家人」「一起成長」', level: 'low', category: 'work',
    why: '有時代表制度還不完整，或用情感取代實際的福利。',
    re: /(與|跟|和)公司(一起|一同|共同)成長|一起打拼|像家人|家人般|家庭式/,
  },
  {
    id: 'unpaid_test', label: '面試前需完成作業', level: 'low', category: 'work',
    why: '可以接受，但作業量太大或沒有回饋時要小心。',
    re: /(面試|錄取)前.{0,8}(作業|試做|實作)|需完成.{0,6}(作業|測驗)|帶回家作業/,
  },
  {
    id: 'always_hiring', label: '大量或長期徵才', level: 'low', category: 'work',
    why: '可能是流動率高，人一直留不住。',
    ask: '這個職缺為什麼開出來？前一位為什麼離開？',
    re: /大量(招募|徵才|招聘)|常態(徵才|招募)|長期徵才/,
  },
  {
    id: 'own_equipment', label: '需自備交通工具或設備', level: 'low', category: 'work',
    why: '油錢、折舊等成本可能轉嫁到你身上。',
    ask: '交通或設備有補貼嗎？',
    re: /自備.{0,2}(機車|汽車|車輛|筆電|電腦|工具|手機)/,
  },

  // ---------- 可疑徵才 ----------
  {
    id: 'high_pay_no_exp', label: '免經驗高薪', level: 'high', category: 'scam',
    why: '不需要經驗卻保證高收入，常見於詐騙或高壓業務。',
    check: (_job, text) => {
      const m =
        text.match(/(無經驗|免經驗|新手|小白).{0,25}(月入|月領|月薪|收入|日領).{0,6}(\d+\s*萬|十萬|破\s*\d|[5-9]\d,?\d{3})/) ||
        text.match(/(月入|月領)\s*(\d{2,}\s*萬|十萬|破\s*\d+\s*萬)/);
      return m ? { match: m[0] } : null;
    },
  },
  {
    id: 'overseas_scam', label: '海外高薪工作', level: 'high', category: 'scam',
    why: '東南亞「高薪包機票包住宿」的職缺，曾多次涉及人口販運與詐騙集團。',
    re: /(柬埔寨|緬甸|寮國|泰緬|東南亞|杜拜).{0,20}(高薪|月入|包吃|包住|機票)|(高薪|包機票).{0,10}(柬埔寨|緬甸|寮國)/,
  },
  {
    id: 'line_contact', label: '要你加 LINE 私下聯絡', level: 'high', category: 'scam',
    why: '正常公司會透過求職網站或公司信箱聯絡，私下加 LINE 是常見的詐騙手法。',
    re: /加\s*(LINE|賴)|LINE\s*ID|私訊.{0,4}(面試|詳談|了解)/i,
  },
  {
    id: 'upfront_fee', label: '要先付錢', level: 'high', category: 'scam',
    why: '依就業服務法，雇主不得向求職者收取保證金或培訓費。',
    re: /(自付|自費|繳交?|先付|需付|預付|收取).{0,4}(保證金|押金|訓練費|培訓費|課程費|入職費|制服費)|(自費|先繳).{0,4}(培訓|訓練|課程)/,
  },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

/** 把職缺的各欄位合成一段要檢查的文字 */
export function jobText(job: Job): string {
  return [job.title, job.salaryText, job.description, job.requirements, job.benefits, job.experience]
    .filter(Boolean)
    .join('\n');
}

function firstUnnegated(text: string, re: RegExp): RegExpMatchArray | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of text.matchAll(g)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 4), m.index);
    if (!NEGATION.test(before)) return m;
  }
  return null;
}

function contextOf(text: string, match: string): string {
  const i = text.indexOf(match);
  if (i < 0) return match;
  // 取同一行（或前後 24 字）當作原文引用
  const start = Math.max(text.lastIndexOf('\n', i) + 1, i - 24);
  const endLine = text.indexOf('\n', i + match.length);
  const end = Math.min(endLine < 0 ? text.length : endLine, i + match.length + 24);
  return (start > 0 && text[start - 1] !== '\n' ? '…' : '') + text.slice(start, end).trim() + (end < text.length && text[end] !== '\n' ? '…' : '');
}

const LEVEL_ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 };

export function checkRules(job: Job): RuleHit[] {
  const text = jobText(job);
  const hits: RuleHit[] = [];
  for (const r of RULES) {
    let match: string | undefined;
    let quote: string | undefined;
    let why = r.why;
    if (r.check) {
      const res = r.check(job, text);
      if (!res) continue;
      match = res.match;
      quote = res.quote;
      if (res.why) why = res.why;
    } else if (r.re) {
      const m = firstUnnegated(text, r.re);
      if (!m) continue;
      match = m[0];
    }
    if (match && !quote) quote = contextOf(text, match);
    hits.push({ id: r.id, label: r.label, level: r.level, why, ask: r.ask, match, quote });
  }
  return hits.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
