import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, ExternalLink, FileText, FileUp, NotebookPen, Search, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { computeStats, type Stats } from '@/lib/stats';
import { RESUME_ACCEPT, ResumeFileError, readResumeFile } from '@/lib/resume-file';
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
  const [confirm, setConfirm] = useState<null | { title: string; body: string; run: () => void }>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!p) return null;

  async function loadFile(f: File) {
    setReading(true);
    try {
      const text = await readResumeFile(f);
      const apply = () => {
        update({ resume: text });
        toast.success(`已讀取「${f.name}」，共 ${text.length.toLocaleString()} 字。檢查一下內容，再按「用 AI 整理」。`);
      };
      (p!.resume || '').trim()
        ? setConfirm({ title: '要取代目前貼上的履歷嗎？', body: `「${f.name}」的內容會取代上面欄位裡現有的文字。`, run: apply })
        : apply();
    } catch (e) {
      toast.error(e instanceof ResumeFileError ? e.message : '讀取檔案失敗，請改貼上文字');
    } finally {
      setReading(false);
    }
  }
  const bind = (k: keyof Profile) => ({ value: (p[k] as string) || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update({ [k]: e.target.value }) });

  async function split() {
    setBusy(true);
    try {
      const r = await chatJson(settings || {}, buildResumeSplitMessages(p!.resume || '', { redact: settings?.redact !== false }), (c) => parseResumeSplit(c), { temperature: 0.1 });
      const apply = () => {
        replace({ ...p!, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) });
        toast.success('已整理到下面的欄位，請逐項確認內容正確');
      };
      const filled = (['title', 'years', 'experience', 'skills', 'stories'] as const).some((k) => (p![k] || '').trim());
      filled
        ? setConfirm({ title: '要覆蓋已經填的欄位嗎？', body: 'AI 整理出來的內容會取代職稱、年資、經歷、技能與成果欄位裡現有的文字。', run: apply })
        : apply();
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

      <Block title="從舊履歷開始" desc="最快的方式。上傳或貼上之後讓 AI 拆成下面的欄位，你再逐項確認。檔案只在這台電腦讀取，不會上傳。">
        <div
          className={cn('relative rounded-md transition-shadow', dragging && 'ring-3 ring-marker')}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) loadFile(f);
          }}
        >
          <Textarea rows={8} placeholder="把 PDF 或 Word 履歷拖進來，或直接貼上文字" {...bind('resume')} />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-surface/90 text-sm font-medium">放開就會讀取這個檔案</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => fileRef.current?.click()} disabled={reading}>
            <FileText />{reading ? '讀取中…' : '上傳 PDF 或 Word'}
          </Button>
          <input ref={fileRef} type="file" accept={RESUME_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) loadFile(f); }} />
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
        title={confirm?.title ?? ''}
        description={confirm?.body ?? ''}
        confirmLabel="取代"
        onConfirm={() => confirm?.run()}
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

      <Block title="自訂關鍵字" desc="職缺出現這些字就直接建議跳過，例如產業、公司名、合約條款。">
        <KeywordInput value={p.keywords || []} onChange={(keywords) => update({ keywords })} />
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

      <Block title="其他不能接受的條件" desc="規則和關鍵字抓不到的，寫給 AI 參考。">
        <Textarea rows={3} placeholder="例如：通勤超過 1 小時、要求簽競業條款、博弈產業" value={p.dealbreakerNote || ''} onChange={(e) => update({ dealbreakerNote: e.target.value })} />
      </Block>
    </>
  );
}

function KeywordInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const items = raw.split(/[,，、\n]/).map((s) => s.trim()).filter((s) => s && !value.includes(s));
    if (items.length) onChange([...value, ...items]);
    setDraft('');
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="輸入後按 Enter，例如：博弈"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(draft);
            }
          }}
          aria-label="新增關鍵字"
          className="max-w-72"
        />
        <Button onClick={() => add(draft)} disabled={!draft.trim()}>加入</Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((k) => (
            <li key={k} className="inline-flex h-7 items-center gap-1 rounded-full bg-stop-soft pl-3 pr-1 text-[13px] text-stop">
              {k}
              <button onClick={() => onChange(value.filter((x) => x !== k))} className="rounded-full p-1 hover:bg-stop/10 cursor-pointer" aria-label={`移除 ${k}`}>
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =====================================================================
// 投遞紀錄
// =====================================================================
function RecordsPage() {
  const [records] = useStored('records');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<'recent' | 'score' | 'company'>('recent');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const list = useMemo(() => Object.values(records || {}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [records]);
  const stats = useMemo(() => computeStats(list), [list]);
  const counts = list.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const shown = list
    .filter((r) => (filter === 'all' || r.status === filter) && (!q || `${r.title}${r.company}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) =>
      sort === 'score' ? (b.evaluation?.score ?? -1) - (a.evaluation?.score ?? -1)
      : sort === 'company' ? (a.company || '').localeCompare(b.company || '', 'zh-Hant')
      : 0,
    );

  const exportCsv = () => {
    const rows = [['職缺', '公司', '網站', '薪資', '判斷', '符合度', '高風險地雷', '狀態', '筆記', '更新時間', '網址']];
    for (const r of list)
      rows.push([r.title, r.company || '', SITE_LABEL[r.site] ?? '', r.salaryText || '', r.evaluation?.verdict || '', String(r.evaluation?.score ?? ''),
        r.ruleHits.filter((h) => h.level === 'high').map((h) => h.label).join('、'), STATUS_LABEL[r.status], r.note || '', r.updatedAt.slice(0, 10), r.url]);
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`${BRAND.name}投遞紀錄-${today()}.csv`, csv, 'text/csv');
  };

  return (
    <>
      <PageHead title="投遞紀錄" lead="評估過或加入紀錄的職缺。投遞後回來更新狀態，累積下來就看得出哪些建議準。" />
      {!list.length ? (
        <p className="border-t border-line pt-7 text-sm text-ink-2">還沒有紀錄。打開任一個職缺頁，在側邊欄按「加入投遞紀錄」或「對照我的經歷評估」。</p>
      ) : (
        <>
          <StatsStrip stats={stats} />
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
            <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
              <div className="relative flex-1 sm:w-52 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                <Input placeholder="搜尋職稱或公司" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" aria-label="搜尋職稱或公司" />
              </div>
              <Select aria-label="排序" value={sort} onValueChange={(v) => setSort(v as typeof sort)} className="w-32"
                options={[{ value: 'recent', label: '最近更新' }, { value: 'score', label: '符合度高到低' }, { value: 'company', label: '依公司' }]} />
              <Button onClick={exportCsv}><Download />匯出 CSV</Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-line">
            <table className="w-full min-w-[780px] text-left text-[13px]">
              <thead className="border-b border-line text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">職缺</th>
                  <th className="px-3 py-2.5 font-medium">判斷</th>
                  <th className="px-3 py-2.5 text-right font-medium">符合度</th>
                  <th className="px-3 py-2.5 font-medium">高風險地雷</th>
                  <th className="px-3 py-2.5 font-medium">狀態</th>
                  <th className="px-3 py-2.5 font-medium">更新</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className={cn('border-t border-line first:border-t-0 hover:bg-ink/2', open === r.id && 'bg-ink/2')}>
                      <td className="max-w-[320px] px-4 py-3">
                        <a href={r.url} target="_blank" rel="noreferrer" className="group inline-flex max-w-full items-center gap-1 font-medium">
                          <span className="truncate group-hover:underline">{r.title}</span>
                          <ExternalLink className="size-3 shrink-0 text-ink-3" />
                        </a>
                        <p className="truncate text-xs text-ink-3">{[r.company, r.salaryText].filter(Boolean).join('｜')}</p>
                        {r.note && open !== r.id && <p className="mt-0.5 truncate text-xs text-ink-2">筆記：{r.note}</p>}
                      </td>
                      <td className="px-3 py-3"><VerdictPill verdict={r.evaluation?.verdict} /></td>
                      <td className="px-3 py-3 text-right">{r.evaluation ? r.evaluation.score : <span className="text-ink-3">—</span>}</td>
                      <td className="px-3 py-3 text-xs text-stop">{r.ruleHits.filter((h) => h.level === 'high').map((h) => h.label).join('、') || <span className="text-ink-3">—</span>}</td>
                      <td className="px-3 py-3">
                        <Select size="sm" aria-label="投遞狀態" value={r.status} onValueChange={(v) => updateRecord(r.id, { status: v as Status })}
                          options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-3">{relTime(r.updatedAt)}</td>
                      <td className="whitespace-nowrap pr-2 text-right">
                        <Button variant="ghost" size="icon" aria-label={open === r.id ? '收起' : '筆記與評估'} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                          <NotebookPen />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`刪除 ${r.title}`} onClick={() => setToDelete(r.id)}><Trash2 /></Button>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="bg-ink/2">
                        <td colSpan={7} className="px-4 pb-4 pt-1">
                          <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
                            <Field label="筆記" hint="面試日期、聯絡人、面試心得，離開欄位就會儲存。">
                              <Textarea rows={4} defaultValue={r.note || ''} onBlur={(e) => e.target.value !== (r.note || '') && updateRecord(r.id, { note: e.target.value }).then(() => toast.success('已儲存筆記'))} />
                            </Field>
                            <div className="text-[13px] leading-relaxed">
                              <p className="text-xs font-medium text-ink-3">AI 評估</p>
                              {r.evaluation ? (
                                <>
                                  <p className="mt-1">{r.evaluation.summary}</p>
                                  {r.evaluation.requirements.filter((x) => x.status === 'gap').length > 0 && (
                                    <p className="mt-2 text-ink-2">缺少：{r.evaluation.requirements.filter((x) => x.status === 'gap').map((x) => x.requirement).join('、')}</p>
                                  )}
                                </>
                              ) : (
                                <p className="mt-1 text-ink-3">還沒評估。打開職缺頁，在側邊欄按「對照我的經歷評估」。</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
        description="評估結果、投遞狀態和筆記都會刪掉，無法復原。"
        confirmLabel="刪除"
        danger
        onConfirm={() => toDelete && deleteRecord(toDelete).then(() => toast.success('已刪除'))}
      />
    </>
  );
}

function StatsStrip({ stats }: { stats: Stats }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const V = { APPLY: '建議投', MAYBE: '再想想', SKIP: '別投' } as const;
  return (
    <div className="mb-6 grid gap-x-8 gap-y-4 border-y border-line py-5 sm:grid-cols-[auto_auto_auto_1fr]">
      <Stat label="已投遞" value={stats.sent} sub={`共 ${stats.total} 筆紀錄`} />
      <Stat label="進到面試" value={stats.interviews} sub={stats.interviewRate === null ? '還沒投遞' : `面試率 ${pct(stats.interviewRate)}`} />
      <Stat label="拿到 offer" value={stats.offers} />
      <div className="min-w-0 sm:border-l sm:border-line sm:pl-8">
        <p className="text-xs text-ink-3">AI 建議準不準</p>
        {stats.outcomes < 3 ? (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">再累積 {3 - stats.outcomes} 筆有結果（面試、offer、沒上）的評估，這裡會比對 AI 的建議和實際結果。</p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {stats.byVerdict.map((v) => (
              <li key={v.verdict} className="flex items-center gap-2">
                <VerdictPill verdict={v.verdict} />
                <span>{v.outcomes} 筆中 {v.good} 筆進到面試</span>
                <span className="text-ink-3">（{pct(v.good / v.outcomes)}）</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-0.5 text-[26px] font-semibold leading-tight">{value}</p>
      {sub && <p className="text-xs text-ink-3">{sub}</p>}
    </div>
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
      <Block title="隱私" desc="評估職缺不需要你的聯絡資料。">
        <label className="flex cursor-pointer items-start gap-4 rounded-lg bg-surface px-4 py-3 ring-1 ring-line">
          <span className="min-w-0 flex-1">
            <span className="text-sm font-medium">送給 AI 前移除個人資料</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-3">姓名、電話、Email、地址、生日、身分證字號會換成「[已移除]」。只影響送出去的內容，你的個人檔案不會被改動。</span>
          </span>
          <Switch className="mt-1" checked={s.redact !== false} onCheckedChange={(v) => update({ redact: v })} aria-label="送給 AI 前移除個人資料" />
        </label>
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
