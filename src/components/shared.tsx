import type { Level, Verdict } from '@/lib/types';
import { cn } from './ui';

export const VERDICT_META: Record<Verdict, { word: string; text: string; soft: string; dot: string }> = {
  APPLY: { word: '建議投', text: 'text-go', soft: 'bg-go-soft text-go', dot: 'bg-go' },
  MAYBE: { word: '再想想', text: 'text-wait', soft: 'bg-wait-soft text-wait', dot: 'bg-wait' },
  SKIP: { word: '別投', text: 'text-stop', soft: 'bg-stop-soft text-stop', dot: 'bg-stop' },
};

export const LEVEL_META: Record<Level, { label: string; dot: string; marker: string; text: string }> = {
  high: { label: '高風險', dot: 'bg-stop', marker: 'marker-high', text: 'text-stop' },
  medium: { label: '要問清楚', dot: 'bg-marker', marker: 'marker', text: 'text-wait' },
  low: { label: '留意', dot: 'bg-ink-3', marker: 'marker-low', text: 'text-ink-3' },
};

export function VerdictPill({ verdict, className }: { verdict?: Verdict; className?: string }) {
  if (!verdict) return <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium text-ink-3 ring-1 ring-line ring-inset', className)}>未評估</span>;
  const m = VERDICT_META[verdict];
  return <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold', m.soft, className)}>{m.word}</span>;
}

/** 職缺原文引用：把命中的字詞用螢光筆標出來 */
export function Quote({ quote, match, level }: { quote: string; match?: string; level: Level }) {
  const m = LEVEL_META[level].marker;
  const i = match ? quote.indexOf(match) : -1;
  return (
    <span className="text-[13px] leading-relaxed text-ink-2">
      「
      {i < 0 ? (
        quote
      ) : (
        <>
          {quote.slice(0, i)}
          <span className={cn(m, 'text-ink')}>{match}</span>
          {quote.slice(i + match!.length)}
        </>
      )}
      」
    </span>
  );
}

export function relTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '剛剛';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

export const SITE_LABEL: Record<string, string> = { '104': '104', '1111': '1111', cake: 'Cake', yourator: 'Yourator', linkedin: 'LinkedIn', other: '網頁' };
