import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, BookmarkPlus, Building2, Check, ChevronDown, CircleDashed, Copy, ExternalLink, FileSearch,
  Lock, MapPin, MousePointerClick, RefreshCw, Settings, Sparkles, Wallet, X,
} from 'lucide-react';
import { Button, Mark, Select, Switch, Tip, cn } from '@/components/ui';
import { LEVEL_META, Quote, SITE_LABEL, VERDICT_META, VerdictPill, relTime } from '@/components/shared';
import { RULES, checkRules } from '@/lib/rules';
import { applyConflicts, findConflicts, hasUsableProfile, type Conflict } from '@/lib/judge';
import { buildEvaluationMessages, parseEvaluation } from '@/lib/prompt';
import { AiError, chatJson, hasEndpoint } from '@/lib/ai';
import { STATUS_LABEL, STATUS_ORDER, saveRecord, updateRecord, useStored } from '@/lib/storage';
import { highlight, useActiveJob } from '@/lib/tab';
import type { Evaluation, Job, JobRecord, RuleHit, Status } from '@/lib/types';

type View = 'job' | 'records';
const openOptions = (hash = '') => chrome.tabs.create({ url: chrome.runtime.getURL(`/options.html${hash}`) });

export default function App() {
  const [view, setView] = useState<View>('job');
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Mark className="size-6" />
        <span className="text-[15px] font-semibold tracking-wide">投準</span>
        <nav className="ml-3 flex h-full items-stretch gap-1" role="tablist">
          {(['job', 'records'] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'relative px-2 text-[13px] text-ink-3 transition-colors hover:text-ink cursor-pointer',
                view === v && 'font-medium text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink',
              )}
            >
              {v === 'job' ? '這個職缺' : '投遞紀錄'}
            </button>
          ))}
        </nav>
        <Tip content="個人檔案與設定">
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => openOptions()} aria-label="個人檔案與設定">
            <Settings />
          </Button>
        </Tip>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{view === 'job' ? <JobPane /> : <RecordsPane />}</main>
    </div>
  );
}

// =====================================================================
// 這個職缺
// =====================================================================
function JobPane() {
  const { state, reload, grant } = useActiveJob();

  if (state.kind === 'loading') return <JobSkeleton />;
  if (state.kind === 'unsupported')
    return <Empty icon={<FileSearch />} title="打開一個職缺頁" body="在 104、1111、Cake、Yourator 或 LinkedIn 打開任何職缺，這裡會馬上顯示評估。" />;
  if (state.kind === 'no_access')
    return (
      <Empty
        icon={<Lock />}
        title="需要你同意讀取這個網站"
        body="投準預設只讀取幾個主要的求職網站。允許之後，這個網站的職缺也能評估；只在你打開側邊欄時才會讀取。"
        action={<Button variant="primary" onClick={grant}>允許讀取這個網站</Button>}
      />
    );
  if (state.kind === 'not_job')
    return (
      <Empty
        icon={<MousePointerClick />}
        title="這頁不是職缺頁"
        body="打開一個職缺，或在這頁選取職缺內容的文字後按「重新讀取」。"
        action={<Button onClick={reload}><RefreshCw />重新讀取</Button>}
      />
    );
  return <JobView key={state.job.id} job={state.job} tabId={state.tabId} onReload={reload} />;
}

function JobView({ job, tabId, onReload }: { job: Job; tabId: number; onReload: () => void }) {
  const [profile] = useStored('profile');
  const [settings] = useStored('settings');
  const [records] = useStored('records');
  const record = records?.[job.id];
  const hits = useMemo(() => checkRules(job), [job]);
  const conflicts = useMemo(() => (profile ? findConflicts(job, hits, profile) : []), [job, hits, profile]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const abort = useRef<AbortController | null>(null);
  const evaluation = record?.evaluation ? applyConflicts(record.evaluation, conflicts) : undefined;

  // 在頁面上標出地雷
  const [marking, setMarking] = useState(() => localStorage.getItem('jobfit:mark') !== 'off');
  const terms = useMemo(() => hits.filter((h) => h.match).map((h) => ({ text: h.match!, level: h.level })), [hits]);
  useEffect(() => {
    highlight(tabId, marking ? terms : []);
  }, [tabId, terms, marking]);
  useEffect(() => () => void highlight(tabId, []), [tabId]);

  const baseRecord = (): JobRecord => {
    const now = new Date().toISOString();
    return {
      id: job.id, url: job.url, site: job.site, title: job.title, company: job.company, salaryText: job.salaryText,
      ruleHits: hits, status: 'saved', createdAt: now, updatedAt: now, ...record,
    };
  };

  async function evaluate() {
    if (!profile || !hasUsableProfile(profile)) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const e = await chatJson(settings || {}, buildEvaluationMessages(profile, job, hits), (c, m) => parseEvaluation(c, m), { signal: abort.current.signal });
      await saveRecord({ ...baseRecord(), ruleHits: hits, evaluation: e, updatedAt: new Date().toISOString() });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof AiError ? e : new AiError('SERVER', (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: Status) {
    if (record) await updateRecord(job.id, { status: s });
    else await saveRecord({ ...baseRecord(), status: s });
    toast.success(record ? `已改成「${STATUS_LABEL[s]}」` : '已加入投遞紀錄');
  }

  const profileReady = profile ? hasUsableProfile(profile) : true;
  const endpointReady = settings ? hasEndpoint(settings) : true;

  return (
    <div className="flex min-h-full flex-col">
      <JobHeader job={job} onReload={onReload} />

      {conflicts.length > 0 && <ConflictBanner conflicts={conflicts} />}

      <div className="border-b border-line bg-surface px-4 py-4">
        {busy ? (
          <Evaluating onCancel={() => abort.current?.abort()} />
        ) : evaluation ? (
          <VerdictBlock e={evaluation} onRerun={evaluate} />
        ) : (
          <PreJudge
            hits={hits}
            conflicts={conflicts}
            error={error}
            profileReady={profileReady}
            endpointReady={endpointReady}
            onEvaluate={evaluate}
          />
        )}
      </div>

      <FlagsSection
        hits={hits}
        aiFlags={evaluation?.red_flags || []}
        marking={marking}
        onMarking={(v) => {
          setMarking(v);
          localStorage.setItem('jobfit:mark', v ? 'on' : 'off');
        }}
        onFocus={(h) => {
          if (!marking) setMarking(true);
          highlight(tabId, terms, h.match).then((r) => !r.count && toast('這段文字不在目前畫面的內容裡'));
        }}
      />

      {evaluation && (
        <>
          {evaluation.requirements.length > 0 && <RequirementsSection items={evaluation.requirements} />}
          {(evaluation.pros.length > 0 || evaluation.cons.length > 0) && <ProsCons pros={evaluation.pros} cons={evaluation.cons} />}
          {evaluation.resume_tips.length > 0 && (
            <Section title="履歷要強調">
              <ul className="space-y-2">
                {evaluation.resume_tips.map((t, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed"><span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />{t}</li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <AskSection hits={hits} questions={evaluation?.questions_to_ask || []} />

      <div className="flex-1" />
      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
        {record ? (
          <>
            <span className="text-xs text-ink-3">投遞狀態</span>
            <Select
              size="sm"
              aria-label="投遞狀態"
              value={record.status}
              onValueChange={(v) => setStatus(v as Status)}
              options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              className="min-w-24"
            />
            <span className="ml-auto text-xs text-ink-3">更新於 {relTime(record.updatedAt)}</span>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => setStatus('saved')}><BookmarkPlus />加入投遞紀錄</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus('skipped')}>不投，記一筆</Button>
          </>
        )}
      </footer>
    </div>
  );
}

function JobHeader({ job, onReload }: { job: Job; onReload: () => void }) {
  return (
    <div className="border-b border-line bg-surface px-4 pb-3 pt-3.5">
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-base font-semibold leading-snug">{job.title}</h1>
        <Tip content="重新讀取這個職缺">
          <Button variant="ghost" size="icon" className="-mr-1.5 -mt-1 size-7" onClick={onReload} aria-label="重新讀取">
            <RefreshCw className="!size-3.5" />
          </Button>
        </Tip>
      </div>
      <dl className="mt-1.5 space-y-0.5 text-[13px] text-ink-2">
        {job.company && <Meta icon={<Building2 />}>{job.company}</Meta>}
        {job.location && <Meta icon={<MapPin />}>{job.location}</Meta>}
        {job.salaryText && <Meta icon={<Wallet />}>{job.salaryText}</Meta>}
      </dl>
      {job.source !== 'api' && job.source !== 'jsonld' && (
        <p className="mt-2 text-xs text-ink-3">
          {job.source === 'selection' ? '用你選取的文字評估。' : '這個網站沒有結構化資料，用頁面文字評估，結果可能較不準。'}
          {SITE_LABEL[job.site] !== '網頁' && ` 來源：${SITE_LABEL[job.site]}`}
        </p>
      )}
    </div>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-ink-3">
      {icon}
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function ConflictBanner({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <div className="flex gap-2.5 border-b border-stop/20 bg-stop-soft px-4 py-3 text-stop">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-[13px] leading-relaxed">
        <p className="font-semibold">碰到你的底線：{conflicts.map((c) => c.label).join('、')}</p>
        {conflicts.filter((c) => c.kind === 'salary').map((c) => <p key={c.label} className="opacity-90">{c.detail}</p>)}
      </div>
    </div>
  );
}

// ---------- 判斷結果 ----------
function PreJudge({
  hits, conflicts, error, profileReady, endpointReady, onEvaluate,
}: {
  hits: RuleHit[]; conflicts: Conflict[]; error: AiError | null; profileReady: boolean; endpointReady: boolean; onEvaluate: () => void;
}) {
  const high = hits.filter((h) => h.level === 'high').length;
  const headline = conflicts.length
    ? '這份職缺碰到你的底線，建議跳過。'
    : high
      ? `有 ${high} 個高風險地雷，投之前先看清楚。`
      : hits.length
        ? `有 ${hits.length} 個地方值得問清楚，沒有高風險地雷。`
        : '沒有偵測到常見地雷。';

  return (
    <div>
      <p className="text-xs text-ink-3">規則初判（不含你的經歷）</p>
      <p className="mt-1 text-[15px] font-medium leading-snug">{headline}</p>

      {!profileReady ? (
        <div className="mt-3.5 rounded-md bg-paper p-3">
          <p className="text-[13px] leading-relaxed text-ink-2">要判斷你符不符合，需要先有你的經歷。貼上舊履歷最快，大約 3 分鐘。</p>
          <Button variant="primary" size="sm" className="mt-2.5" onClick={() => openOptions('#profile')}>建立個人檔案</Button>
        </div>
      ) : !endpointReady ? (
        <div className="mt-3.5 rounded-md bg-paper p-3">
          <p className="text-[13px] leading-relaxed text-ink-2">還沒設定 AI 評估服務。到設定頁填入代理網址或 DeepSeek 金鑰。</p>
          <Button size="sm" className="mt-2.5" onClick={() => openOptions('#settings')}>打開設定</Button>
        </div>
      ) : (
        <>
          <Button variant={conflicts.length ? 'outline' : 'primary'} size="lg" className="mt-3.5 w-full" onClick={onEvaluate}>
            <Sparkles />{conflicts.length ? '還是想看 AI 評估' : '對照我的經歷評估'}
          </Button>
          {error && (
            <p role="alert" className="mt-2.5 flex gap-1.5 text-[13px] leading-relaxed text-stop">
              <X className="mt-0.5 size-3.5 shrink-0" />{error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Evaluating({ onCancel }: { onCancel: () => void }) {
  const steps = ['讀取職缺要求', '對照你的經歷', '整理建議'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 4500);
    return () => clearInterval(t);
  }, []);
  return (
    <div aria-live="polite">
      <p className="text-xs text-ink-3">評估中，大約 10–30 秒</p>
      <ol className="mt-2.5 space-y-1.5">
        {steps.map((s, n) => (
          <li key={s} className={cn('flex items-center gap-2 text-[13px]', n > i && 'text-ink-3')}>
            {n < i ? <Check className="size-3.5 text-go" /> : n === i ? <CircleDashed className="size-3.5 animate-spin [animation-duration:2s]" /> : <span className="size-3.5" />}
            {s}
          </li>
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={onCancel}>取消</Button>
    </div>
  );
}

function VerdictBlock({ e, onRerun }: { e: Evaluation; onRerun: () => void }) {
  const m = VERDICT_META[e.verdict];
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <p className={cn('text-[30px] font-bold leading-none tracking-wide', m.text)}>
          <span className="marker marker-draw">{m.word}</span>
        </p>
        <div className="text-right">
          <p className="text-xs text-ink-3">符合度</p>
          <p className="text-[22px] font-semibold leading-tight">{e.score}<span className="text-xs font-normal text-ink-3"> / 100</span></p>
        </div>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className={cn('h-full rounded-full', m.dot)} style={{ width: `${e.score}%` }} />
      </div>
      {e.summary && <p className="mt-3 text-[14px] leading-relaxed">{e.summary}</p>}
      {e.dealbreakers_hit.length > 0 && <p className="mt-2 text-[13px] text-stop">碰到你的底線：{e.dealbreakers_hit.join('、')}</p>}
      <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
        <span>評估於 {relTime(e.evaluatedAt)}</span>
        <button onClick={onRerun} className="inline-flex items-center gap-1 hover:text-ink cursor-pointer"><RefreshCw className="size-3" />重新評估</button>
      </div>
    </div>
  );
}

// ---------- 地雷 ----------
function FlagsSection({
  hits, aiFlags, marking, onMarking, onFocus,
}: {
  hits: RuleHit[]; aiFlags: Evaluation['red_flags']; marking: boolean; onMarking: (v: boolean) => void; onFocus: (h: RuleHit) => void;
}) {
  const extra = aiFlags.filter((f) => !hits.some((h) => h.label === f.flag));
  const total = hits.length + extra.length;
  return (
    <Section
      title="地雷"
      count={total}
      aside={
        hits.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            在頁面上標出
            <Switch checked={marking} onCheckedChange={onMarking} aria-label="在頁面上標出地雷" />
          </label>
        )
      }
    >
      {total === 0 ? (
        <p className="text-[13px] text-ink-3">沒有偵測到責任制、面議、綁約等 {RULES.length} 種常見地雷。</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => h.match && onFocus(h)}
                className={cn('group w-full rounded-md px-2 py-2 text-left transition-colors', h.match && 'cursor-pointer hover:bg-ink/4')}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('size-2 shrink-0 rounded-full', LEVEL_META[h.level].dot)} />
                  <span className="text-[13.5px] font-semibold">{h.label}</span>
                  <span className={cn('text-[11px]', LEVEL_META[h.level].text)}>{LEVEL_META[h.level].label}</span>
                  {h.match && <span className="ml-auto text-[11px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">在頁面上找</span>}
                </div>
                <div className="mt-1 pl-4">
                  {h.quote && <Quote quote={h.quote} match={h.match} level={h.level} />}
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{h.why}</p>
                </div>
              </button>
            </li>
          ))}
          {extra.map((f, i) => (
            <li key={`ai-${i}`} className="px-2 py-2">
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-marker" />
                <span className="text-[13.5px] font-semibold">{f.flag}</span>
                <span className="text-[11px] text-ink-3">AI 判讀</span>
              </div>
              <div className="mt-1 pl-4">
                {f.quote && <Quote quote={f.quote} level="medium" />}
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{f.why}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- 需求對照 ----------
const REQ_META = {
  met: { label: '符合', cls: 'text-go', icon: '✓' },
  partial: { label: '部分', cls: 'text-wait', icon: '◐' },
  gap: { label: '缺少', cls: 'text-stop', icon: '✕' },
} as const;

function RequirementsSection({ items }: { items: Evaluation['requirements'] }) {
  const met = items.filter((r) => r.status === 'met').length;
  return (
    <Section title="需求對照" aside={<span className="text-xs text-ink-3">符合 {met} / {items.length}</span>}>
      <ul className="divide-y divide-line">
        {items.map((r, i) => {
          const m = REQ_META[r.status];
          return (
            <li key={i} className="grid grid-cols-[18px_1fr] gap-x-1.5 py-2 first:pt-0 last:pb-0">
              <span className={cn('text-[13px] font-bold leading-6', m.cls)} aria-label={m.label}>{m.icon}</span>
              <div>
                <p className="text-[13.5px] font-medium leading-6">{r.requirement}</p>
                <p className="text-[12.5px] leading-relaxed text-ink-2">{r.evidence}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function ProsCons({ pros, cons }: { pros: string[]; cons: string[] }) {
  return (
    <Section title="值得投的理由與顧慮">
      <div className="space-y-3">
        {pros.length > 0 && (
          <ul className="space-y-1.5">
            {pros.map((p, i) => <li key={i} className="flex gap-2 text-[13px] leading-relaxed"><span className="font-bold text-go">＋</span>{p}</li>)}
          </ul>
        )}
        {cons.length > 0 && (
          <ul className="space-y-1.5">
            {cons.map((p, i) => <li key={i} className="flex gap-2 text-[13px] leading-relaxed"><span className="font-bold text-stop">－</span>{p}</li>)}
          </ul>
        )}
      </div>
    </Section>
  );
}

function AskSection({ hits, questions }: { hits: RuleHit[]; questions: string[] }) {
  const all = [...new Set([...hits.map((h) => h.ask).filter((x): x is string => Boolean(x)), ...questions])];
  if (!all.length) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(all.map((q, i) => `${i + 1}. ${q}`).join('\n'));
    toast.success('已複製面試問題');
  };
  return (
    <Section
      title="面試時問清楚"
      count={all.length}
      aside={<Button variant="ghost" size="sm" className="-mr-2 h-7 px-2 text-xs" onClick={copy}><Copy className="!size-3.5" />複製</Button>}
      defaultOpen={false}
    >
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed marker:text-ink-3">
        {all.map((q) => <li key={q}>{q}</li>)}
      </ol>
    </Section>
  );
}

// ---------- 共用 ----------
function Section({
  title, count, aside, children, defaultOpen = true,
}: {
  title: string; count?: number; aside?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line bg-surface px-4 py-3">
      <div className="flex min-h-7 items-center gap-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="-ml-1 flex items-center gap-1.5 rounded px-1 text-[13px] font-semibold cursor-pointer">
          <ChevronDown className={cn('size-3.5 text-ink-3 transition-transform', !open && '-rotate-90')} />
          {title}
          {count !== undefined && count > 0 && <span className="rounded bg-paper px-1.5 text-[11px] font-medium leading-5 text-ink-2">{count}</span>}
        </button>
        <div className="ml-auto">{aside}</div>
      </div>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start px-6 pt-14">
      <div className="flex size-10 items-center justify-center rounded-lg bg-surface text-ink-2 ring-1 ring-line [&_svg]:size-5">{icon}</div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function JobSkeleton() {
  return (
    <div className="space-y-3 bg-surface px-4 py-4" aria-label="讀取職缺中">
      <div className="skeleton h-5 w-3/4" />
      <div className="skeleton h-3.5 w-1/2" />
      <div className="skeleton h-3.5 w-2/5" />
      <div className="skeleton mt-6 h-11 w-full" />
    </div>
  );
}

// =====================================================================
// 投遞紀錄
// =====================================================================
function RecordsPane() {
  const [records] = useStored('records');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const list = useMemo(
    () => Object.values(records || {}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records],
  );
  if (!records) return null;
  if (!list.length)
    return <Empty icon={<BookmarkPlus />} title="還沒有投遞紀錄" body="評估過或按「加入投遞紀錄」的職缺會出現在這裡，可以記錄投遞與面試進度。" />;

  const counts = list.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const shown = filter === 'all' ? list : list.filter((r) => r.status === filter);
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-line bg-surface px-3 py-2.5">
        {(['all', ...STATUS_ORDER] as const).filter((s) => s === 'all' || counts[s]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'h-7 shrink-0 rounded-full px-2.5 text-xs transition-colors cursor-pointer',
              filter === s ? 'bg-ink text-surface' : 'text-ink-2 ring-1 ring-line ring-inset hover:text-ink',
            )}
          >
            {s === 'all' ? `全部 ${list.length}` : `${STATUS_LABEL[s]} ${counts[s]}`}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line bg-surface">
        {shown.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <VerdictPill verdict={r.evaluation?.verdict} className="mt-0.5 shrink-0" />
              <a href={r.url} target="_blank" rel="noreferrer" className="group min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium group-hover:underline">{r.title}</p>
                <p className="truncate text-xs text-ink-3">{[r.company, SITE_LABEL[r.site]].filter(Boolean).join('｜')}</p>
              </a>
              <ExternalLink className="mt-1 size-3.5 shrink-0 text-ink-3" />
            </div>
            <div className="mt-2 flex items-center gap-2 pl-0.5">
              <Select
                size="sm"
                aria-label="投遞狀態"
                value={r.status}
                onValueChange={(v) => updateRecord(r.id, { status: v as Status })}
                options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              />
              {r.ruleHits.some((h) => h.level === 'high') && (
                <span className="text-[11px] text-stop">{r.ruleHits.filter((h) => h.level === 'high').length} 個高風險地雷</span>
              )}
              <span className="ml-auto text-[11px] text-ink-3">{relTime(r.updatedAt)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-4 py-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => openOptions('#records')}>在完整頁面管理紀錄</Button>
      </div>
    </div>
  );
}
