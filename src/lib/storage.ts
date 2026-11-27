// 所有資料都存在 chrome.storage.local：個人檔案、投遞紀錄、設定。不會上傳到伺服器。
import { useEffect, useState } from 'react';
import type { JobRecord, Profile, Settings, Status } from './types';

type Store = { profile: Profile; settings: Settings; records: Record<string, JobRecord>; schema: number };
const DEFAULTS: Store = { profile: {}, settings: {}, records: {}, schema: 2 };

export async function getAll(): Promise<Store> {
  const data = await chrome.storage.local.get(['profile', 'settings', 'records', 'schema']);
  return { ...DEFAULTS, ...data } as Store;
}

export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const data = await chrome.storage.local.get(key);
  return (data[key] ?? DEFAULTS[key]) as Store[K];
}

export async function set<K extends keyof Store>(key: K, value: Store[K]) {
  await chrome.storage.local.set({ [key]: value });
}

export async function saveRecord(rec: JobRecord) {
  const records = await get('records');
  records[rec.id] = rec;
  await set('records', records);
}

export async function updateRecord(id: string, patch: Partial<JobRecord>) {
  const records = await get('records');
  if (!records[id]) return;
  records[id] = { ...records[id], ...patch, updatedAt: new Date().toISOString() };
  await set('records', records);
}

export async function deleteRecord(id: string) {
  const records = await get('records');
  delete records[id];
  await set('records', records);
}

/** 訂閱某個欄位，其他頁面（側邊欄、設定頁）改了也會同步 */
export function useStored<K extends keyof Store>(key: K): [Store[K] | undefined, (v: Store[K]) => Promise<void>] {
  const [value, setValue] = useState<Store[K]>();
  useEffect(() => {
    let alive = true;
    get(key).then((v) => alive && setValue(v));
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[key]) setValue((changes[key]!.newValue ?? DEFAULTS[key]) as Store[K]);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, [key]);
  return [value, async (v) => { setValue(v); await set(key, v); }];
}

export const STATUS_LABEL: Record<Status, string> = {
  saved: '想投',
  applied: '已投遞',
  interview: '面試中',
  offer: '拿到 offer',
  rejected: '沒上',
  skipped: '不投了',
};
export const STATUS_ORDER: Status[] = ['saved', 'applied', 'interview', 'offer', 'rejected', 'skipped'];

// 第一版（0.1）的資料搬到新格式：eval:<url> → records、dealbreakerKeys → dealbreakers
export async function migrate() {
  const all: Record<string, any> = await chrome.storage.local.get(null);
  if (all.schema === 2) return;
  const profile: Profile & { dealbreakerKeys?: string[]; dealbreakers?: unknown } = all.profile || {};
  const next: Profile = { ...profile };
  if (Array.isArray(profile.dealbreakerKeys)) next.dealbreakers = profile.dealbreakerKeys;
  else if (!Array.isArray(profile.dealbreakers)) next.dealbreakers = [];
  if (typeof profile.dealbreakers === 'string') next.dealbreakerNote = profile.dealbreakers;
  delete (next as { dealbreakerKeys?: unknown }).dealbreakerKeys;

  const records: Record<string, JobRecord> = all.records || {};
  const oldKeys = Object.keys(all).filter((k) => k.startsWith('eval:'));
  for (const k of oldKeys) {
    const r = all[k];
    const id = `url:${k.slice(5)}`;
    records[id] = {
      id,
      url: r.url || k.slice(5),
      site: 'other',
      title: r.title || r.url || '職缺',
      ruleHits: [],
      status: 'saved',
      createdAt: r.evaluatedAt || new Date().toISOString(),
      updatedAt: r.evaluatedAt || new Date().toISOString(),
    };
  }
  await chrome.storage.local.set({ profile: next, records, schema: 2 });
  if (oldKeys.length) await chrome.storage.local.remove(oldKeys);
}
