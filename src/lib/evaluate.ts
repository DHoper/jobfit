// AI 評估在背景程式裡執行：關掉側邊欄也會繼續跑完，結果存進投遞紀錄。
// 進行中的狀態放在 chrome.storage.session，側邊欄重新打開時能接著顯示。
import { AiError, chatJson } from './ai';
import { buildEvaluationMessages, parseEvaluation } from './prompt';
import { get, saveRecord } from './storage';
import type { Job, JobRecord, Profile, RuleHit } from './types';

export type EvalSession = { pending: Record<string, number>; errors: Record<string, { code: string; message: string }> };

/** 個人檔案的指紋：評估後改過檔案，就提醒使用者重新評估 */
export function profileStamp(p: Profile): string {
  const s = JSON.stringify([p.title, p.years, p.experience, p.skills, p.stories, p.goals, p.location, p.preferences, p.resume, p.salaryFloor, p.dealbreakers, p.dealbreakerNote]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function session(): Promise<EvalSession> {
  const d: Record<string, any> = await chrome.storage.session.get(['pending', 'errors']);
  return { pending: d.pending || {}, errors: d.errors || {} };
}
async function patch(fn: (s: EvalSession) => void) {
  const s = await session();
  fn(s);
  await chrome.storage.session.set(s);
}

const running = new Map<string, AbortController>();

export async function runEvaluation(job: Job, hits: RuleHit[]) {
  if (running.has(job.id)) return;
  const ctrl = new AbortController();
  running.set(job.id, ctrl);
  await patch((s) => {
    s.pending[job.id] = Date.now();
    delete s.errors[job.id];
  });
  // 背景程式閒置 30 秒會被關掉；評估期間定時呼叫 API 讓它保持運作
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  try {
    const [profile, settings, records] = await Promise.all([get('profile'), get('settings'), get('records')]);
    const evaluation = await chatJson(settings, buildEvaluationMessages(profile, job, hits), (c, m) => parseEvaluation(c, m), { signal: ctrl.signal });
    const now = new Date().toISOString();
    const prev = records[job.id];
    const rec: JobRecord = {
      id: job.id, url: job.url, site: job.site, title: job.title, company: job.company, salaryText: job.salaryText,
      status: 'saved', createdAt: now, ...prev,
      ruleHits: hits, evaluation: { ...evaluation, profileStamp: profileStamp(profile) }, updatedAt: now,
    };
    await saveRecord(rec);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      const err = e instanceof AiError ? e : new AiError('SERVER', (e as Error).message || '評估失敗');
      await patch((s) => (s.errors[job.id] = { code: err.code, message: err.message }));
    }
  } finally {
    clearInterval(keepAlive);
    running.delete(job.id);
    await patch((s) => delete s.pending[job.id]);
  }
}

export function cancelEvaluation(id: string) {
  running.get(id)?.abort();
}
