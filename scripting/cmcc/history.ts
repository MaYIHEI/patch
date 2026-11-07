// cmcc / history.ts
// 本机历史: 每次查询成功记一笔 (每个号单独存), 用来算每天用量、日均和「几号用完」
// 只存剩余量和金额, 不存凭证; Storage 不进 iCloud

import type { Account } from './api'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const KEY = 'cmcc.hist.'          // + 手机号
const KEEP_DAYS = 62
const MERGE_MS = 20 * 60 * 1000   // 20 分钟内的新数据覆盖上一笔, 不另记

/** 一笔快照; 流量单位 MB, 语音单位分钟 */
export type Snap = { t: number; bal: number; fee?: number; gen?: number; tgt?: number; voice?: number }
export type Key = 'gen' | 'tgt' | 'voice'

const read = (tel: string) => AppStorage.get<Snap[]>(KEY + tel) ?? []

export function record(tel: string, a: Account): void {
  const snap: Snap = {
    t: a.fetchedAt, bal: a.balance, fee: a.monthFee,
    gen: a.general?.remainMB, tgt: a.targeted?.remainMB, voice: a.voice?.total ? a.voice.remain : undefined,
  }
  const list = read(tel)
  if (list.length && snap.t - list[list.length - 1].t < MERGE_MS) list.pop()
  list.push(snap)
  const since = Date.now() - KEEP_DAYS * 86_400_000
  AppStorage.set(KEY + tel, list.filter(s => s.t >= since))
}

export function clearHistory(tel: string): void {
  AppStorage.remove(KEY + tel)
}

export const dateKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 每天一项: 当天最后一笔; 按日期升序 */
function dayEnds(list: Snap[]): Snap[] {
  const out = new Map<string, Snap>()
  for (const s of list) out.set(dateKey(s.t), s)
  return [...out.values()]
}

export type Hist = {
  /** 记了几天 (含今天) */
  days: number
  /** 近 n 天每天用量, 最后一项是今天; 没记录或跨了重置 (剩余变多) 的那天是 null */
  daily: (key: Key, n: number) => (number | null)[]
  /** 今天用了多少; 昨天没记录时从今天第一笔算起 */
  today: (key: Key) => number | null
  /** 近 7 个整天的日均, 不含今天; 少于 2 天有记录时为 null */
  avg: (key: Key) => number | null
  /** 上个月最后记录到的本月消费 */
  lastMonthFee: number | null
}

export function histOf(tel: string): Hist {
  const list = read(tel)
  const ends = dayEnds(list)
  const todayKey = dateKey(Date.now())

  const daily = (key: Key, n: number) => {
    const out: (number | null)[] = []
    for (let i = n - 1; i >= 0; i--) {
      const day = dateKey(Date.now() - i * 86_400_000)
      const end = ends.find(s => dateKey(s.t) === day)
      const prev = [...ends].reverse().find(s => dateKey(s.t) < day)
      const a = prev?.[key], b = end?.[key]
      out.push(a !== undefined && b !== undefined && a >= b ? a - b : null)
    }
    return out
  }

  const today = (key: Key) => {
    const d = daily(key, 1)[0]
    if (d !== null) return d
    const first = list.find(s => dateKey(s.t) === todayKey)?.[key]
    const last = list[list.length - 1]?.[key]
    return first !== undefined && last !== undefined && first >= last ? first - last : null
  }

  const avg = (key: Key) => {
    const full = daily(key, 8).slice(0, 7).filter((x): x is number => x !== null)
    return full.length >= 2 ? full.reduce((s, x) => s + x, 0) / full.length : null
  }

  const now = new Date()
  const lastMonth = dateKey(new Date(now.getFullYear(), now.getMonth(), 0).getTime()).slice(0, 7)
  const lastMonthFee = [...list].reverse().find(s => dateKey(s.t).startsWith(lastMonth) && s.fee !== undefined)?.fee ?? null

  return { days: ends.length, daily, today, avg, lastMonthFee }
}
