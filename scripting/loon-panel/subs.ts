// loon-panel / subs.ts
// 机场订阅: 名字存 Storage, 订阅链接只存 Keychain; 用量从订阅返回头 Subscription-Userinfo 读
// 本机历史: 每次读到用量记一笔 (按北京时间日期, 同一天覆盖), 前后相减得到日用量

import { fetch } from 'scripting'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const LIST_KEY = 'loonpanel.subs'
const USAGE_KEY = 'loonpanel.usage'
const HIST_KEY = 'loonpanel.hist'
const secretKey = (id: string) => `loonpanel.sub.${id}`
const DAY = 86_400_000
const KEEP_DAYS = 62
/** 订阅接口别请求太勤: 30 分钟内复用上次结果 (App 里手动刷新除外) */
const TTL = 30 * 60_000
/** 常见客户端标识; 不带任何个人信息 */
const UA = 'Loon/3.2.4 CFNetwork/3826.500.111 Darwin/24.4.0'

export type Sub = { id: string; name: string }
/** upload / download / total 单位字节, expire 秒 (0 = 没有到期日), t 读取时间 */
export type Usage = { up: number; down: number; total: number; expire: number; t: number }
type UsageEntry = { usage?: Usage; err?: string; at: number }

const readJSON = <T>(key: string, fallback: T): T => {
  const raw = AppStorage.get<string>(key)
  return raw ? JSON.parse(raw) as T : fallback
}

// ────────────────────────────────────────────────────────────
// 订阅列表
// ────────────────────────────────────────────────────────────
export const listSubs = () => readJSON<Sub[]>(LIST_KEY, [])
export const saveSubs = (list: Sub[]) => AppStorage.set(LIST_KEY, JSON.stringify(list))
export const subURL = (id: string) => Keychain.get(secretKey(id)) ?? ''

export function addSub(name: string, url: string): Sub {
  const sub = { id: `s${Date.now().toString(36)}`, name: name.trim() }
  if (!Keychain.set(secretKey(sub.id), url.trim())) throw new Error('写入钥匙串失败')
  saveSubs([...listSubs(), sub])
  return sub
}

export function updateSub(id: string, name: string, url?: string): void {
  if (url !== undefined && !Keychain.set(secretKey(id), url.trim())) throw new Error('写入钥匙串失败')
  saveSubs(listSubs().map(s => (s.id === id ? { ...s, name: name.trim() } : s)))
  if (url !== undefined) dropUsage(id)
}

export function removeSub(id: string): void {
  Keychain.remove(secretKey(id))
  saveSubs(listSubs().filter(s => s.id !== id))
  dropUsage(id)
  const hist = readHist()
  delete hist[id]
  AppStorage.set(HIST_KEY, JSON.stringify(hist))
}

function dropUsage(id: string) {
  const all = readJSON<Record<string, UsageEntry>>(USAGE_KEY, {})
  delete all[id]
  AppStorage.set(USAGE_KEY, JSON.stringify(all))
}

// ────────────────────────────────────────────────────────────
// 读用量
// ────────────────────────────────────────────────────────────
/** "upload=1; download=2; total=3; expire=4" → 用量; 没有 total 和 download 时返回 null */
export function parseUserinfo(text: string, t = Date.now()): Usage | null {
  const num = (k: string) => {
    const m = text.match(new RegExp(`(?:^|[;,\\s])${k}\\s*=\\s*([0-9.eE+]+)`, 'i'))
    const n = m ? Number(m[1]) : NaN
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }
  const total = num('total'), down = num('download')
  if (Number.isNaN(total) && Number.isNaN(down)) return null
  const up = num('upload'), expire = num('expire')
  return { up: up || 0, down: down || 0, total: total || 0, expire: expire || 0, t }
}

/**
 * GET 订阅链接, 读 Subscription-Userinfo 头; 没有这个头时读响应体 (有的自建端点直接把用量写在 body 里)
 * 链接末尾可以带 #headers=<URL 编码的 JSON>, 作为请求头一起发 (比如 Authorization)
 * 出错信息不带链接, 免得订阅地址出现在界面或日志里
 */
export async function fetchUsage(url: string): Promise<Usage> {
  const hash = url.indexOf('#')
  const base = hash < 0 ? url : url.slice(0, hash)
  const frag = hash < 0 ? '' : url.slice(hash + 1)
  let extra: Record<string, string> = {}
  if (frag.startsWith('headers=')) {
    try { extra = JSON.parse(decodeURIComponent(frag.slice(8))) } catch { throw new Error('#headers= 后面不是 JSON') }
  }
  if (!/^https?:\/\//i.test(base)) throw new Error('订阅链接要以 http:// 或 https:// 开头')
  let res
  try {
    res = await fetch(base, { headers: { 'User-Agent': UA, ...extra }, timeout: 12, allowInsecureRequest: /^http:/i.test(base) })
  } catch {
    throw new Error('连不上订阅地址')
  }
  if (!res.ok) throw new Error(`订阅地址返回 ${res.status}`)
  const info = parseUserinfo(res.headers.get('subscription-userinfo') ?? '')
  if (info) return info
  const text = await res.text().catch(() => '')
  const fromBody = text.length < 1000 ? parseUserinfo(text) : null
  if (fromBody) return fromBody
  throw new Error('没有返回用量信息')
}

export type SubView = {
  id: string
  name: string
  usage?: Usage
  err?: string       // 最近一次读取失败的原因 (有旧数据时照常显示旧数据)
  stale: boolean     // 显示的是旧数据
  used: number
  ratio: number      // 已用 / 总量, 不限量时 0
  daily: (number | null)[]   // 近 30 天日用量, 最后一个是今天; null = 没有数据
  fc: Forecast
}

/** 读全部订阅的用量; force 时不管缓存 */
export async function loadSubs(force = false): Promise<SubView[]> {
  const subs = listSubs()
  const cache = readJSON<Record<string, UsageEntry>>(USAGE_KEY, {})
  const now = Date.now()
  await Promise.all(subs.map(async s => {
    const old = cache[s.id]
    if (!force && old && now - old.at < TTL) return
    const url = subURL(s.id)
    try {
      if (!url) throw new Error('钥匙串里没有订阅链接, 请重新填写')
      const usage = await fetchUsage(url)
      cache[s.id] = { usage, at: now }
      record(s.id, usage)
    } catch (e) {
      cache[s.id] = { usage: old?.usage, err: (e as Error).message, at: now }
    }
  }))
  AppStorage.set(USAGE_KEY, JSON.stringify(cache))
  const hist = readHist()
  return subs.map(s => viewOf(s, cache[s.id], hist[s.id] ?? {}))
}

/** 只读缓存, 不发请求 (App 内预览、首屏) */
export function cachedSubs(): SubView[] {
  const cache = readJSON<Record<string, UsageEntry>>(USAGE_KEY, {})
  const hist = readHist()
  return listSubs().map(s => viewOf(s, cache[s.id], hist[s.id] ?? {}))
}

function viewOf(s: Sub, entry: UsageEntry | undefined, points: Record<string, number>): SubView {
  const usage = entry?.usage
  const used = usage ? usage.up + usage.down : 0
  const daily = dailySeries(points, 30)
  return {
    id: s.id, name: s.name, usage, err: entry?.err, stale: !!entry?.err && !!usage,
    used, ratio: usage && usage.total > 0 ? Math.min(1, used / usage.total) : 0,
    daily, fc: forecast(usage, daily),
  }
}

// ────────────────────────────────────────────────────────────
// 历史
// ────────────────────────────────────────────────────────────
/** 北京时间日期 "2026-11-05" */
export const bjDate = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)
export const todayStr = () => bjDate(Date.now())
export const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

type Hist = Record<string, Record<string, number>>   // 订阅 id → 日期 → 当天最后一次读到的已用量
const readHist = () => readJSON<Hist>(HIST_KEY, {})

function record(id: string, u: Usage): void {
  const hist = readHist()
  const points = hist[id] ?? {}
  points[bjDate(u.t)] = u.up + u.down
  const oldest = shiftDay(todayStr(), -KEEP_DAYS)
  for (const d of Object.keys(points)) if (d < oldest) delete points[d]
  hist[id] = points
  AppStorage.set(HIST_KEY, JSON.stringify(hist))
}

export function clearHistory(): void {
  AppStorage.remove(HIST_KEY)
}

export const recordedDays = (s: SubView) => s.daily.filter(v => v !== null).length

/**
 * 近 n 天日用量: 相邻两次记录相减; 中间隔了几天没记录就平均摊到这几天;
 * 用量变少 (重置了) 就当这段只用了新读数那么多
 */
export function dailySeries(points: Record<string, number>, n: number): (number | null)[] {
  const dates = Object.keys(points).sort()
  const out = new Map<string, number>()
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1], b = dates[i]
    const delta = points[b] - points[a]
    const gap = Math.max(1, daysBetween(a, b))
    const per = (delta >= 0 ? delta : points[b]) / gap
    for (let k = 1; k <= gap; k++) out.set(shiftDay(a, k), per)
  }
  const t = todayStr()
  return Array.from({ length: n }, (_, i) => out.get(shiftDay(t, i - n + 1)) ?? null)
}

// ────────────────────────────────────────────────────────────
// 预测
// ────────────────────────────────────────────────────────────
export type Forecast = {
  kind: 'none' | 'unlimited' | 'out' | 'idle' | 'enough' | 'runout'
  avg: number       // 近 7 天日均 (字节)
  date?: number     // 预计用完的时间 (ms)
  text: string      // 「预计 11/28 用完」「够用到 12/01 到期」
  short: string     // 窄位置用: 「11/28 用完」「够用」
}

const md = (ms: number) => { const d = new Date(ms + 8 * 3_600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}` }

/** 按近 7 天日均推算: 今天还没过完, 优先用今天以前的 7 天 */
export function forecast(u: Usage | undefined, daily: (number | null)[]): Forecast {
  if (!u) return { kind: 'none', avg: 0, text: '还没有读到用量', short: '-' }
  if (u.total <= 0) return { kind: 'unlimited', avg: 0, text: '不限流量', short: '不限量' }
  const remain = u.total - u.up - u.down
  if (remain <= 0) return { kind: 'out', avg: 0, text: '流量已用完', short: '已用完' }
  const before = daily.slice(-8, -1).filter((v): v is number => v !== null)
  const pool = before.length ? before : daily.slice(-1).filter((v): v is number => v !== null)
  if (!pool.length) return { kind: 'none', avg: 0, text: '再记录一天就能预测', short: '记录中' }
  const avg = pool.reduce((a, b) => a + b, 0) / pool.length
  const exp = u.expire > 0 ? u.expire * 1000 : 0
  if (avg <= 0) return { kind: 'idle', avg, text: exp ? `近 7 天几乎没用, 够用到 ${md(exp)} 到期` : '近 7 天几乎没用', short: '够用' }
  const date = Date.now() + (remain / avg) * DAY
  if (exp && date >= exp) return { kind: 'enough', avg, date, text: `够用到 ${md(exp)} 到期`, short: '够用' }
  return { kind: 'runout', avg, date, text: `预计 ${md(date)} 用完`, short: `${md(date)} 用完` }
}

export const expireText = (u?: Usage) => {
  if (!u || !u.expire) return ''
  const days = Math.ceil((u.expire * 1000 - Date.now()) / DAY)
  return days < 0 ? '已到期' : `${md(u.expire * 1000)} 到期 · 剩 ${days} 天`
}

/** 字节 → "76.2G" / "512M" / "1.25T" */
export function fmtBytes(n: number): string {
  const g = n / 1024 ** 3
  if (g >= 1000) return `${(g / 1024).toFixed(2)}T`
  if (g >= 100) return `${Math.round(g)}G`
  if (g >= 1) return `${g.toFixed(1)}G`
  return `${Math.round(n / 1024 ** 2)}M`
}

// ────────────────────────────────────────────────────────────
// 示例数据 (样式库「示例预览」/ 还没添加订阅时)
// ────────────────────────────────────────────────────────────
export function sampleSubs(): SubView[] {
  const G = 1024 ** 3
  const now = Date.now()
  const make = (id: string, name: string, used: number, total: number, expireDays: number, perDay: number[]): SubView => {
    const usage: Usage = { up: used * 0.08, down: used * 0.92, total, expire: expireDays ? Math.floor((now + expireDays * DAY) / 1000) : 0, t: now }
    const daily = Array.from({ length: 30 }, (_, i) => (i < 30 - perDay.length ? null : perDay[i - (30 - perDay.length)] * G))
    return { id, name, usage, stale: false, used, ratio: total ? used / total : 0, daily, fc: forecast(usage, daily) }
  }
  const wave = (n: number, base: number, amp: number, seed: number) =>
    Array.from({ length: n }, (_, i) => Math.max(0.1, base + amp * Math.sin(i * 0.9 + seed) + ((i * 7 + seed) % 5) * 0.3))
  return [
    make('demo1', '主力机场', 126.4 * G, 200 * G, 26, wave(30, 3.6, 1.8, 1)),
    make('demo2', '备用机场', 41.7 * G, 100 * G, 74, wave(18, 1.2, 0.8, 3)),
    make('demo3', '自建 VPS', 0.62 * 1024 * G, 1024 * G, 0, wave(30, 18, 9, 5)),
  ]
}
