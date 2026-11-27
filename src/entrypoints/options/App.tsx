import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, ExternalLink, FileUp, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { Button, ConfirmDialog, Field, Input, Mark, Select, Switch, Textarea, cn } from '@/components/ui';
import { LEVEL_META, SITE_LABEL, VerdictPill, relTime } from '@/components/shared';
import { CATEGORY_LABEL, RULES, type Category } from '@/lib/rules';
import { profileCompleteness } from '@/lib/judge';
import { buildResumeSplitMessages, parseResumeSplit } from '@/lib/prompt';
import { AiError, DEFAULT_MODEL, chatJson, hasEndpoint } from '@/lib/ai';
import { STATUS_LABEL, STATUS_ORDER, deleteRecord, getAll, set, updateRecord, useStored } from '@/lib/storage';
import type { Profile, Settings, Status } from '@/lib/types';

type Page = 'profile' | 'dealbreakers' | 'records' | 'settings';
const PAGES: { id: Page; label: string }[] = [
  { id: 'profile', label: '個人檔案' },
  { id: 'dealbreakers', label: '底線與薪資' },
  { id: 'records', label: '投遞紀錄' },
  { id: 'settings', label: '設定與資料' },
];

function usePage(): [Page, boolean, (p: Page) => void] {
  const read = () => location.hash.slice(1);
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => setHash(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const page = (PAGES.some((p) => p.id === hash) ? hash : 'profile') as Page;
  return [page, hash === 'welcome', (p) => (location.hash = p)];
}

/** 輸入時自動儲存（延遲 400ms），標題列顯示狀態 */
function useAutosave<T extends object>(key: 'profile' | 'settings') {
  const [stored] = useStored(key);
  const [draft, setDraft] = useState<T>();
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (stored && !draft) setDraft(stored as T);
  }, [stored, draft]);
  const update = (patch: Partial<T>) => {
    setDraft((d) => {
      const next = { ...(d as T), ...patch };
      clearTimeout(timer.current);
      setState('saving');
      timer.current = setTimeout(async () => {
        await set(key, next as never);
        setState('saved');
      }, 400);
      return next;
    });
  };
  return { draft, update, state, replace: (v: T) => { setDraft(v); set(key, v as never); } };
}

export default function App() {
  const [page, welcome, go] = usePage();
  const [profile] = useStored('profile');
  const done = profile ? profileCompleteness(profile) : null;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <Mark className="size-7" />
          <span className="text-base font-semibold tracking-wide">{BRAND.name}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              aria-current={page === p.id ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-md px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-ink/4 hover:text-ink cursor-pointer',
                page === p.id && 'bg-ink/6 font-medium text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </nav>
        {done && (
          <div className="mx-5 mt-8 hidden md:block">
            <p className="text-xs text-ink-3">個人檔案完成度</p>
            <p className="mt-0.5 text-sm font-medium">{done.done} / {done.total}</p>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: done.total }, (_, i) => (
                <span key={i} className={cn('h-1 flex-1 rounded-full', i < done.done ? 'bg-ink' : 'bg-line')} />
              ))}
            </div>
            {done.missing.length > 0 && <p className="mt-2 text-xs leading-relaxed text-ink-3">還沒填：{done.missing.join('、')}</p>}
          </div>
        )}
      </aside>

      <main className="px-5 py-8 md:px-12 md:py-12">
        {page === 'profile' && <ProfilePage welcome={welcome} />}
        {page === 'dealbreakers' && <DealbreakersPage />}
        {page === 'records' && <RecordsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function PageHead({ title, lead, state }: { title: string; lead: React.ReactNode; state?: 'idle' | 'saving' | 'saved' }) {
  return (
    <div className="mb-8 flex items-start gap-4">
      <div className="max-w-[60ch]">
        <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{lead}</p>
      </div>
      {state && state !== 'idle' && (
        <span className="ml-auto shrink-0 pt-2 text-xs text-ink-3" aria-live="polite">{state === 'saving' ? '儲存中…' : '已自動儲存'}</span>
      )}
    </div>
  );
}

function Block({ title, desc, children }: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-line py-7 lg:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{desc}</p>}
      </div>
      <div className="max-w-[640px] space-y-5">{children}</div>
    </section>
  );
}

// =====================================================================
// 個人檔案
// =====================================================================
function ProfilePage({ welcome }: { welcome: boolean }) {
  const { draft: p, update, state, replace } = useAutosave<Profile>('profile');
  const [settings] = useStored('settings');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | (() => void)>(null);
  if (!p) return null;
  const bind = (k: keyof Profile) => ({ value: (p[k] as string) || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update({ [k]: e.target.value }) });

  async function split() {
    setBusy(true);
    try {
      const r = await chatJson(settings || {}, buildResumeSplitMessages(p!.resume || ''), (c) => parseResumeSplit(c), { temperature: 0.1 });
      const apply = () => {
        replace({ ...p!, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) });
        toast.success('已整理到下面的欄位，請逐項確認內容正確');
      };
      const filled = (['title', 'years', 'experience', 'skills', 'stories'] as const).some((k) => (p![k] || '').trim());
      filled ? setConfirm(() => apply) : apply();
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : '整理失敗，請再試一次');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="你的個人檔案"
        state={state}
        lead="評估職缺時，AI 只會根據這裡寫的內容判斷，不會替你編造經歷。寫得越具體，評估越準。資料只存在這台電腦的瀏覽器裡。"
      />

      {welcome && (
        <div className="mb-8 max-w-[860px] rounded-lg bg-ink p-5 text-surface dark:bg-surface dark:text-ink dark:ring-1 dark:ring-line">
          <p className="text-[15px] font-semibold">安裝好了。三個步驟開始用：</p>
          <ol className="mt-3 grid gap-3 text-[13px] leading-relaxed sm:grid-cols-3">
            {['在下面貼上你的舊履歷，按「用 AI 整理」', '到「底線與薪資」設定不能接受的條件', '打開任一個 104 職缺，點右側的「評估職缺」'].map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-marker text-[11px] font-bold text-[#0f1733]">{i + 1}</span>
                <span className="opacity-90">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Block title="從舊履歷開始" desc="最快的方式。貼上之後讓 AI 拆成下面的欄位，你再逐項確認。">
        <Textarea rows={8} placeholder="從 Word、PDF 或 104 履歷複製全部文字貼進來" {...bind('resume')} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={split} disabled={busy || !(p.resume || '').trim() || !hasEndpoint(settings || {})}>
            <Wand2 />{busy ? '整理中…' : '用 AI 整理成下面的欄位'}
          </Button>
          {!hasEndpoint(settings || {}) && <span className="text-xs text-ink-3">需要先在「設定與資料」設定 AI 服務</span>}
        </div>
      </Block>

      <Block title="經歷與能力" desc="經歷寫公司、職稱、期間與主要負責的事；成果盡量有數字。">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="目前職稱或身分"><Input placeholder="例如：後端工程師" {...bind('title')} /></Field>
          <Field label="總年資"><Input placeholder="例如：5 年" {...bind('years')} /></Field>
        </div>
        <Field label="工作經歷"><Textarea rows={7} placeholder={'XX 科技｜後端工程師｜2021–至今\n負責訂單系統 API、帶 2 人小組'} {...bind('experience')} /></Field>
        <Field label="技能與工具"><Textarea rows={3} placeholder="例如：Go、PostgreSQL、Kubernetes、AWS" {...bind('skills')} /></Field>
        <Field label="代表性成果" hint="情境、你做了什麼、結果。例如「把報表查詢從 8 秒降到 0.5 秒」。">
          <Textarea rows={6} {...bind('stories')} />
        </Field>
      </Block>

      <Block title="你想要的工作" desc="用來判斷職缺方向對不對。">
        <Field label="職涯目標"><Textarea rows={3} placeholder="接下來兩三年想往哪個方向發展" {...bind('goals')} /></Field>
        <Field label="期望地點與上班方式"><Input placeholder="例如：台北、可接受混合辦公" {...bind('location')} /></Field>
        <Field label="其他偏好"><Textarea rows={3} placeholder="公司規模、產業、團隊文化等" {...bind('preferences')} /></Field>
      </Block>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="要覆蓋已經填的欄位嗎？"
        description="AI 整理出來的內容會取代職稱、年資、經歷、技能與成果欄位裡現有的文字。"
        confirmLabel="覆蓋"
        onConfirm={() => confirm?.()}
      />
    </>
  );
}

// =====================================================================
// 底線與薪資
// =====================================================================
function DealbreakersPage() {
  const { draft: p, update, state } = useAutosave<Profile>('profile');
  if (!p) return null;
  const chosen = new Set(p.dealbreakers || []);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    on ? next.add(id) : next.delete(id);
    update({ dealbreakers: [...next] });
  };
  const floor = p.salaryFloor;
  const cats = Object.keys(CATEGORY_LABEL) as Category[];

  return (
    <>
      <PageHead
        title="底線與薪資"
        state={state}
        lead={`職缺碰到這裡設定的條件時，${BRAND.name}會直接建議跳過，不論 AI 怎麼判斷。沒開的項目仍然會標示出來，只是不會直接否決。`}
      />
      <Block title="薪資底線" desc="職缺的薪資上限低於這個數字時建議跳過。面議的職缺不會被擋。">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="至少" className="w-36">
            <div className="relative">
              <Input
                type="number"
                min={0}
                step={0.5}
                inputMode="decimal"
                placeholder="例如 6"
                value={floor?.amount ? floor.amount / 10000 : ''}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  update({ salaryFloor: n > 0 ? { amount: Math.round(n * 10000), unit: floor?.unit || 'month' } : null });
                }}
                className="pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">萬</span>
            </div>
          </Field>
          <Select
            aria-label="薪資單位"
            value={floor?.unit || 'month'}
            onValueChange={(u) => update({ salaryFloor: { amount: floor?.amount || 0, unit: u as 'month' | 'year' } })}
            options={[{ value: 'month', label: '月薪' }, { value: 'year', label: '年薪' }]}
            className="w-24"
          />
        </div>
      </Block>

      {cats.map((c) => (
        <Block key={c} title={CATEGORY_LABEL[c]}>
          <ul className="divide-y divide-line rounded-lg bg-surface ring-1 ring-line">
            {RULES.filter((r) => r.category === c).map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-start gap-4 px-4 py-3">
                  <span className={cn('mt-2 size-2 shrink-0 rounded-full', LEVEL_META[r.level].dot)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{r.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-3">{r.why}</span>
                  </span>
                  <Switch className="mt-1" checked={chosen.has(r.id)} onCheckedChange={(v) => toggle(r.id, v)} aria-label={`${r.label}設為底線`} />
                </label>
              </li>
            ))}
          </ul>
        </Block>
      ))}

      <Block title="其他不能接受的條件" desc="規則抓不到的，寫給 AI 參考。">
        <Textarea rows={3} placeholder="例如：通勤超過 1 小時、要求簽競業條款、博弈產業" value={p.dealbreakerNote || ''} onChange={(e) => update({ dealbreakerNote: e.target.value })} />
      </Block>
    </>
  );
}

// =====================================================================
// 投遞紀錄
// =====================================================================
function RecordsPage() {
  const [records] = useStored('records');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [q, setQ] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);
  const list = useMemo(() => Object.values(records || {}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [records]);
  const counts = list.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const shown = list.filter((r) => (filter === 'all' || r.status === filter) && (!q || `${r.title}${r.company}`.toLowerCase().includes(q.toLowerCase())));

  const exportCsv = () => {
    const rows = [['職缺', '公司', '網站', '薪資', '判斷', '符合度', '高風險地雷', '狀態', '更新時間', '網址']];
    for (const r of list)
      rows.push([r.title, r.company || '', SITE_LABEL[r.site] ?? '', r.salaryText || '', r.evaluation?.verdict || '', String(r.evaluation?.score ?? ''),
        r.ruleHits.filter((h) => h.level === 'high').map((h) => h.label).join('、'), STATUS_LABEL[r.status], r.updatedAt.slice(0, 10), r.url]);
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`${BRAND.name}投遞紀錄-${today()}.csv`, csv, 'text/csv');
  };

  return (
    <>
      <PageHead title="投遞紀錄" lead="評估過或加入紀錄的職缺。投遞後回來更新狀態，累積下來的結果也能看出哪些建議準。" />
      {!list.length ? (
        <p className="border-t border-line pt-7 text-sm text-ink-2">還沒有紀錄。打開任一個職缺頁，在側邊欄按「加入投遞紀錄」或「對照我的經歷評估」。</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(['all', ...STATUS_ORDER] as const).filter((s) => s === 'all' || counts[s]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn('h-8 rounded-full px-3 text-[13px] transition-colors cursor-pointer', filter === s ? 'bg-ink text-surface' : 'text-ink-2 ring-1 ring-line ring-inset hover:text-ink')}
              >
                {s === 'all' ? `全部 ${list.length}` : `${STATUS_LABEL[s]} ${counts[s]}`}
              </button>
            ))}
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input placeholder="搜尋職稱或公司" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" aria-label="搜尋職稱或公司" />
            </div>
            <Button onClick={exportCsv}><Download />匯出 CSV</Button>
          </div>
          <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-line">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-line text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">職缺</th>
                  <th className="px-3 py-2.5 font-medium">判斷</th>
                  <th className="px-3 py-2.5 text-right font-medium">符合度</th>
                  <th className="px-3 py-2.5 font-medium">高風險地雷</th>
                  <th className="px-3 py-2.5 font-medium">狀態</th>
                  <th className="px-3 py-2.5 font-medium">更新</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-ink/2">
                    <td className="max-w-[320px] px-4 py-3">
                      <a href={r.url} target="_blank" rel="noreferrer" className="group inline-flex max-w-full items-center gap-1 font-medium">
                        <span className="truncate group-hover:underline">{r.title}</span>
                        <ExternalLink className="size-3 shrink-0 text-ink-3" />
                      </a>
                      <p className="truncate text-xs text-ink-3">{[r.company, r.salaryText].filter(Boolean).join('｜')}</p>
                    </td>
                    <td className="px-3 py-3"><VerdictPill verdict={r.evaluation?.verdict} /></td>
                    <td className="px-3 py-3 text-right">{r.evaluation ? r.evaluation.score : <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-3 text-xs text-stop">{r.ruleHits.filter((h) => h.level === 'high').map((h) => h.label).join('、') || <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-3">
                      <Select size="sm" aria-label="投遞狀態" value={r.status} onValueChange={(v) => updateRecord(r.id, { status: v as Status })}
                        options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-3">{relTime(r.updatedAt)}</td>
                    <td className="pr-2">
                      <Button variant="ghost" size="icon" aria-label={`刪除 ${r.title}`} onClick={() => setToDelete(r.id)}><Trash2 /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <p className="px-4 py-6 text-sm text-ink-3">沒有符合的紀錄。</p>}
          </div>
        </>
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="刪除這筆紀錄？"
        description="評估結果和投遞狀態都會刪掉，無法復原。"
        confirmLabel="刪除"
        danger
        onConfirm={() => toDelete && deleteRecord(toDelete).then(() => toast.success('已刪除'))}
      />
    </>
  );
}

// =====================================================================
// 設定與資料
// =====================================================================
function SettingsPage() {
  const { draft: s, update, state } = useAutosave<Settings>('settings');
  const [clear, setClear] = useState(false);
  const [testing, setTesting] = useState<'idle' | 'busy' | 'ok' | string>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  if (!s) return null;

  const exportAll = async () => {
    const { profile, records } = await getAll();
    download(`${BRAND.name}備份-${today()}.json`, JSON.stringify({ app: 'jobfit', version: 2, exportedAt: new Date().toISOString(), profile, records }, null, 2), 'application/json');
  };
  const importAll = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'jobfit' || typeof data.profile !== 'object') throw new Error();
      await set('profile', data.profile);
      if (data.records) await set('records', data.records);
      if (data.version === 1) await set('schema', 1);
      toast.success('已匯入，重新整理頁面後生效');
      setTimeout(() => location.reload(), 800);
    } catch {
      toast.error(`這個檔案不是${BRAND.name}匯出的備份`);
    }
  };

  return (
    <>
      <PageHead title="設定與資料" state={state} lead="一般使用者不用改 AI 服務的設定。個人檔案和紀錄只存在這台電腦，換電腦前先匯出備份。" />
      <Block title="AI 評估服務" desc={<>站方部署的代理會保管 DeepSeek 金鑰，使用者不需要申請。部署方式見 <a className="underline" href="https://github.com/DHoper/jobfit#ai-評估服務" target="_blank" rel="noreferrer">README</a>。</>}>
        <Field label="代理伺服器網址" hint="例如 https://jobfit-proxy.你的帳號.workers.dev">
          <Input placeholder="https://" value={s.proxyUrl || ''} onChange={(e) => update({ proxyUrl: e.target.value })} />
        </Field>
        <Field label="DeepSeek API 金鑰（開發測試用）" hint="填了就直接呼叫 DeepSeek，不經過代理。金鑰只存在這台電腦。">
          <Input type="password" autoComplete="off" placeholder="sk-…" value={s.apiKey || ''} onChange={(e) => update({ apiKey: e.target.value })} />
        </Field>
        <Field label="模型" hint={`留空使用 ${DEFAULT_MODEL}`}>
          <Input placeholder={DEFAULT_MODEL} value={s.model || ''} onChange={(e) => update({ model: e.target.value })} className="max-w-60" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!hasEndpoint(s) || testing === 'busy'}
            onClick={async () => {
              setTesting('busy');
              try {
                await chatJson(s, [{ role: 'system', content: '只輸出 JSON：{"ok": true}' }, { role: 'user', content: 'ping' }], (c) => {
                  if (!c.includes('ok')) throw new Error('格式不正確');
                  return true;
                });
                setTesting('ok');
              } catch (e) {
                setTesting((e as Error).message || '連線失敗');
              }
            }}
          >
            <Sparkles />{testing === 'busy' ? '測試中…' : '測試連線'}
          </Button>
          <span role="status" className={cn('text-[13px]', testing === 'ok' ? 'text-go' : testing === 'idle' || testing === 'busy' ? 'text-ink-3' : 'text-stop')}>
            {testing === 'ok'
              ? `連線正常（${s.apiKey ? '你的 DeepSeek 金鑰' : '代理伺服器'}）`
              : testing === 'idle' || testing === 'busy'
                ? hasEndpoint(s) ? (s.apiKey ? '目前使用你的 DeepSeek 金鑰' : '目前使用代理伺服器') : '尚未設定，只能使用規則偵測'
                : testing}
          </span>
        </div>
      </Block>
      <Block title="備份" desc="包含個人檔案與投遞紀錄，不含金鑰。">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportAll}><Download />匯出備份</Button>
          <Button onClick={() => fileRef.current?.click()}><FileUp />匯入備份</Button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
        </div>
      </Block>
      <Block title="清除資料">
        <div><Button variant="danger" onClick={() => setClear(true)}><Trash2 />清除所有投遞紀錄</Button></div>
      </Block>
      <p className="border-t border-line pt-6 text-xs text-ink-3">{BRAND.name} {chrome.runtime.getManifest().version}・<a className="underline" href="https://github.com/DHoper/jobfit" target="_blank" rel="noreferrer">原始碼</a></p>
      <ConfirmDialog
        open={clear}
        onOpenChange={setClear}
        title="清除所有投遞紀錄？"
        description="所有評估結果與投遞狀態都會刪除，個人檔案會保留。建議先匯出備份。"
        confirmLabel="清除"
        danger
        onConfirm={() => set('records', {}).then(() => toast.success('已清除投遞紀錄'))}
      />
    </>
  );
}

function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const today = () => new Date().toISOString().slice(0, 10);
