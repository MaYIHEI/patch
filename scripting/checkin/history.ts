// checkin / history.ts
// 本机历史: 每次读到真实数据, 按北京时间日期存一份当天快照 (同一天覆盖), 协议不变
// 演示数据时不读存储, 现场生成 30 天历史

import { splitAsset, rewardOf, type Entry, type Snapshot, type Status } from './api'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const HIST_KEY = 'checkin.history'
const KEEP_KEY = 'checkin.keepDays'
const DAY = 86_400_000

export type Item = { s: Status; msg: string; asset?: string; v?: number; r: number }
export type Day = { d: string; items: Record<string, Item> }

/** 北京时间日期 "2026-10-28" */
export const bjDate = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)
export const todayStr = () => bjDate(Date.now())
export function shiftDay(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
}

function toItem(e: { s: Status; msg: string; asset?: string }): Item {
  const v = e.asset ? splitAsset(e.asset).value : NaN
  return { s: e.s, msg: e.msg, asset: e.asset, v: Number.isFinite(v) ? v : undefined, r: rewardOf(e.msg) }
}

// ────────────────────────────────────────────────────────────
// 存取
// ────────────────────────────────────────────────────────────
export function getKeepDays(): number {
  return AppStorage.get<number>(KEEP_KEY) ?? 90
}

export function setKeepDays(n: number): void {
  AppStorage.set(KEEP_KEY, n)
}

export function clearHistory(): void {
  AppStorage.remove(HIST_KEY)
}

function readStored(): Record<string, Day> {
  const raw = AppStorage.get<string>(HIST_KEY)
  return raw ? JSON.parse(raw) as Record<string, Day> : {}
}

/** 真实数据才记; 缓存降级的不记 (那是旧数据) */
export function recordSnapshot(snap: Snapshot): void {
  if (snap.mock || snap.stale) return
  const all = readStored()
  for (const e of snap.entries) {
    const d = bjDate(e.t)
    all[d] = all[d] ?? { d, items: {} }
    all[d].items[e.key] = toItem(e)
  }
  const oldest = shiftDay(todayStr(), -(getKeepDays() - 1))
  for (const d of Object.keys(all)) if (d < oldest) delete all[d]
  AppStorage.set(HIST_KEY, JSON.stringify(all))
}

/** 按日期升序 */
export function loadHistory(snap: Snapshot): Day[] {
  const all = snap.mock ? mockHistory(snap.entries) : readStored()
  return Object.values(all).sort((a, b) => (a.d < b.d ? -1 : 1))
}

export function recordedDays(): number {
  return Object.keys(readStored()).length
}

// ────────────────────────────────────────────────────────────
// 统计 (keys = 预设选中的脚本)
// ────────────────────────────────────────────────────────────
export type Stats = { ok: number; cookie: number; fail: number; total: number; rate: number; reward: number }

export function dayStats(day: Day | undefined, keys: Set<string>): Stats {
  const out = { ok: 0, cookie: 0, fail: 0, total: 0, rate: 0, reward: 0 }
  if (!day) return out
  for (const [k, it] of Object.entries(day.items)) {
    if (!keys.has(k) || it.s === 'none') continue
    out.total++
    if (it.s === 'ok') { out.ok++; out.reward += it.r }
    else if (it.s === 'cookie') out.cookie++
    else out.fail++
  }
  out.rate = out.total ? out.ok / out.total : 0
  return out
}

export const byDate = (days: Day[]) => new Map(days.map(d => [d.d, d]))

const allOk = (day: Day | undefined, keys: Set<string>) => {
  const s = dayStats(day, keys)
  return s.total > 0 && s.ok === s.total
}

/** 连签: 连续多少天全部成功, 有失败就断; 今天还没全成功不算断, 只是不计入 */
export function streak(days: Day[], keys: Set<string>): number {
  const map = byDate(days)
  let d = todayStr()
  let n = 0
  if (allOk(map.get(d), keys)) n++
  d = shiftDay(d, -1)
  while (allOk(map.get(d), keys)) {
    n++
    d = shiftDay(d, -1)
  }
  return n
}

/** 连续多少天没有 fail (需重抓不算), 规则同 streak */
export function noFailRun(days: Day[], keys: Set<string>): number {
  const map = byDate(days)
  const clean = (day: Day | undefined) => { const s = dayStats(day, keys); return s.total > 0 && s.fail === 0 }
  let d = todayStr()
  let n = clean(map.get(d)) ? 1 : 0
  d = shiftDay(d, -1)
  while (clean(map.get(d))) { n++; d = shiftDay(d, -1) }
  return n
}

export function rewardOn(days: Day[], d: string, keys: Set<string>): number {
  return dayStats(byDate(days).get(d), keys).reward
}

export function totalReward(days: Day[], keys: Set<string>): number {
  return days.reduce((n, day) => n + dayStats(day, keys).reward, 0)
}

/** 最近 n 天 (含今天) 的日期, 升序 */
export function lastDays(n: number): string[] {
  const t = todayStr()
  return Array.from({ length: n }, (_, i) => shiftDay(t, i - n + 1))
}

/** 某个脚本某天的资产数值 */
export function assetOn(days: Day[], d: string, key: string): number | undefined {
  return byDate(days).get(d)?.items[key]?.v
}

/** 资产较昨天的变化; 没有昨天的记录返回 undefined */
export function assetDelta(days: Day[], key: string): number | undefined {
  const t = todayStr()
  const a = assetOn(days, t, key), b = assetOn(days, shiftDay(t, -1), key)
  return a !== undefined && b !== undefined ? a - b : undefined
}

/** 近 7 天资产日均增长 */
export function dailyGain(days: Day[], key: string): number | undefined {
  const series = days.map(d => ({ d: d.d, v: d.items[key]?.v })).filter(x => x.v !== undefined).slice(-8)
  if (series.length < 2) return undefined
  const first = series[0], last = series[series.length - 1]
  const span = (Date.parse(last.d) - Date.parse(first.d)) / DAY
  return span > 0 ? (last.v! - first.v!) / span : undefined
}

// ────────────────────────────────────────────────────────────
// 演示: 30 天, 最近 12 天全部成功, 第 13 天有失败, 再早的随机
// ────────────────────────────────────────────────────────────
function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function mockHistory(entries: Entry[]): Record<string, Day> {
  const t = todayStr()
  const all: Record<string, Day> = {}
  for (let i = 29; i >= 1; i--) {
    const d = shiftDay(t, -i)
    const day: Day = { d, items: {} }
    for (const e of entries) {
      const h = hash(e.key + d) % 100
      if (i > 13 && h >= 96) continue   // 偶尔没跑
      const s: Status = i <= 12 ? 'ok' : i === 13 ? (e.key === 'wps_status' ? 'fail' : 'ok') : h < 6 ? 'fail' : h < 9 ? 'cookie' : 'ok'
      const msg = s === 'ok' ? (e.s === 'ok' ? e.msg : '+2 积分') : s === 'cookie' ? '凭证失效' : '请求超时'
      const now = e.asset ? splitAsset(e.asset).value : NaN
      const step = rewardOf(e.s === 'ok' ? e.msg : '+2') || 1
      const asset = Number.isFinite(now) ? `${Math.max(0, Math.round((now - step * i) * 100) / 100)}` : undefined
      day.items[e.key] = toItem({ s, msg, asset })
    }
    all[d] = day
  }
  for (const e of entries) {
    const d = bjDate(e.t)
    all[d] = all[d] ?? { d, items: {} }
    all[d].items[e.key] = toItem(e)
  }
  return all
}
