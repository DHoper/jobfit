// 解析台灣職缺常見的薪資寫法，以及比對最低工資。

export type SalaryKind = 'month' | 'year' | 'hour' | 'day' | 'negotiable' | 'piece' | 'unknown';

export interface Salary {
  kind: SalaryKind;
  min?: number; // 元
  max?: number; // 元
  /** 「待遇面議」但註明經常性薪資達 4 萬以上，104 的規定寫法 */
  negotiableFloor?: number;
}

// 勞動部公告的最低工資（每年 1 月 1 日起）
// 2026：月薪 29,500、時薪 196；2027：月薪 30,900、時薪 205（2026/9/24 最低工資審議會決議）
export const MIN_WAGE: Record<number, { month: number; hour: number }> = {
  2026: { month: 29500, hour: 196 },
  2027: { month: 30900, hour: 205 },
};

export function minWageFor(date = new Date()) {
  const years = Object.keys(MIN_WAGE).map(Number).sort((a, b) => a - b);
  const y = years.filter((x) => x <= date.getFullYear()).pop() ?? years[0]!;
  return { year: y, ...MIN_WAGE[y]! };
}

/** 把「4萬」「40,000」「40K」「4.5 萬」轉成元 */
function toYuan(num: string, unit?: string): number {
  const n = parseFloat(num.replace(/,/g, ''));
  if (!unit) return n;
  if (unit === '萬') return n * 10000;
  if (/k/i.test(unit)) return n * 1000;
  return n;
}

const NUM = String.raw`(\d+(?:,\d{3})*(?:\.\d+)?)\s*(萬|[kK])?`;
const RANGE = new RegExp(`${NUM}\\s*(?:元)?\\s*(?:~|～|-|－|–|至|到)\\s*${NUM}`);
const SINGLE = new RegExp(NUM);

export function parseSalary(text: string | undefined): Salary {
  if (!text) return { kind: 'unknown' };
  const t = text.replace(/\s+/g, ' ');

  if (/面議/.test(t)) {
    const floor = t.match(/(?:經常性薪資|月薪)?\s*達?\s*(\d+(?:\.\d+)?)\s*萬(?:元)?(?:或)?以上/);
    return { kind: 'negotiable', negotiableFloor: floor?.[1] ? toYuan(floor[1], '萬') : undefined };
  }
  if (/論件|按件|件計/.test(t)) return { kind: 'piece' };

  let kind: SalaryKind = 'unknown';
  if (/年薪|\/\s*年|per year|annual/i.test(t)) kind = 'year';
  else if (/時薪|\/\s*(小)?時|per hour|hourly/i.test(t)) kind = 'hour';
  else if (/日薪|\/\s*日|per day|daily/i.test(t)) kind = 'day';
  else if (/月薪|\/\s*月|per month|monthly/i.test(t)) kind = 'month';

  let min: number | undefined;
  let max: number | undefined;
  const r = t.match(RANGE);
  if (r) {
    // 「4~6萬」：單位只寫在後面時，前面的數字也套用
    min = toYuan(r[1]!, r[2] || r[4]);
    max = toYuan(r[3]!, r[4]);
  } else {
    const s = t.match(SINGLE);
    if (s) {
      min = toYuan(s[1]!, s[2]);
      if (!/以上|起/.test(t)) max = min;
    }
  }
  if (min === undefined) return { kind };

  // 沒寫單位時用金額推測：幾百是時薪，幾萬是月薪，百萬以上是年薪
  if (kind === 'unknown') kind = min < 1000 ? 'hour' : min < 300000 ? 'month' : 'year';
  return { kind, min, max };
}

/** 換算成年薪（以 12 個月計，不含年終），用來和使用者的期望比較 */
export function annualRange(s: Salary): { min?: number; max?: number } {
  const mult = s.kind === 'month' ? 12 : s.kind === 'year' ? 1 : s.kind === 'hour' ? 176 * 12 : s.kind === 'day' ? 22 * 12 : 0;
  if (s.kind === 'negotiable' && s.negotiableFloor) return { min: s.negotiableFloor * 12 };
  if (!mult) return {};
  return { min: s.min !== undefined ? s.min * mult : undefined, max: s.max !== undefined ? s.max * mult : undefined };
}

export function belowMinWage(s: Salary, date = new Date()): string | null {
  const w = minWageFor(date);
  if (s.kind === 'month' && s.min !== undefined && s.min < w.month)
    return `月薪 ${s.min.toLocaleString()} 元低於 ${w.year} 年最低工資 ${w.month.toLocaleString()} 元`;
  if (s.kind === 'hour' && s.min !== undefined && s.min < w.hour)
    return `時薪 ${s.min} 元低於 ${w.year} 年最低時薪 ${w.hour} 元`;
  return null;
}

export function formatYuan(n: number): string {
  if (n >= 10000) {
    const w = n / 10000;
    return `${Number.isInteger(w) ? w : w.toFixed(1)} 萬`;
  }
  return `${n.toLocaleString()} 元`;
}
