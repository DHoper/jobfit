export type Level = 'high' | 'medium' | 'low';
export type Verdict = 'APPLY' | 'MAYBE' | 'SKIP';
export type Site = '104' | '1111' | 'cake' | 'yourator' | 'linkedin' | 'other';

/** 從職缺頁讀到的內容。104 有結構化資料，其他網站盡量從 JSON-LD 取得。 */
export interface Job {
  id: string; // 用來對應投遞紀錄，例如 104:8abcd
  url: string;
  site: Site;
  title: string;
  company?: string;
  location?: string;
  salaryText?: string;
  experience?: string; // 工作經歷要求
  education?: string;
  skills?: string[];
  description: string; // 工作內容
  requirements?: string; // 其他條件
  benefits?: string;
  source: 'api' | 'jsonld' | 'page' | 'selection';
  fetchedAt: string;
}

export interface RuleHit {
  id: string;
  label: string;
  level: Level;
  why: string;
  ask?: string; // 面試時可以問的問題
  match?: string; // 命中的原文字詞（頁面標示用）
  quote?: string; // 前後文
}

export interface Requirement {
  requirement: string;
  status: 'met' | 'partial' | 'gap';
  evidence: string;
}

export interface Evaluation {
  verdict: Verdict;
  score: number;
  summary: string;
  requirements: Requirement[];
  red_flags: { flag: string; quote: string; why: string }[];
  pros: string[];
  cons: string[];
  questions_to_ask: string[];
  resume_tips: string[];
  dealbreakers_hit: string[];
  model?: string;
  profileStamp?: string;
  jobStamp?: string;
  evaluatedAt: string;
}

export type Status = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected' | 'skipped';

export interface JobRecord {
  id: string;
  url: string;
  site: Site;
  title: string;
  company?: string;
  salaryText?: string;
  ruleHits: RuleHit[];
  evaluation?: Evaluation;
  status: Status;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryFloor {
  amount: number; // 元
  unit: 'month' | 'year';
}

export interface Profile {
  title?: string;
  years?: string;
  experience?: string;
  skills?: string;
  stories?: string;
  goals?: string;
  location?: string;
  preferences?: string;
  resume?: string;
  salaryFloor?: SalaryFloor | null;
  dealbreakers?: string[]; // 規則 id
  dealbreakerNote?: string;
  /** 職缺出現這些字就直接跳過，例如「博弈」「競業」 */
  keywords?: string[];
}

export interface Settings {
  proxyUrl?: string;
  apiKey?: string;
  model?: string;
  /** 送 AI 前移除姓名、電話、Email 等個資，預設開啟 */
  redact?: boolean;
}
