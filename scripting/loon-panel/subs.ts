// loon-panel / subs.ts
// 机场订阅: 名字等设置存 Storage, 订阅链接只存 Keychain; 用量从订阅返回头 Subscription-Userinfo 读
// 本机历史: 按北京时间日期记当天最后读数 (算日用量), 另记最近几天的每次读数 (算每小时用量和近 1 小时速度)

import { fetch, Notification } from 'scripting'

import type { Alerts } from './settings'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const LIST_KEY = 'loonpanel.subs'
const USAGE_KEY = 'loonpanel.usage'
const HIST_KEY = 'loonpanel.hist'
const SAMPLE_KEY = 'loonpanel.samples'
const ALERT_KEY = 'loonpanel.alerted'
const EVENT_KEY = 'loonpanel.events'
const secretKey = (id: string) => `loonpanel.sub.${id}`
const DAY = 86_400_000
const HOUR = 3_600_000
const KEEP_DAYS = 62
const SAMPLE_DAYS = 3
/** 只读响应头很省, 但订阅接口也别请求太勤: 10 分钟内复用上次结果 (手动刷新除外) */
const TTL = 10 * 60_000
/** 常见客户端标识; 不带任何个人信息 */
const UA = 'Loon/3.2.4 CFNetwork/3826.500.111 Darwin/24.4.0'
const DAYS = 62

/** resetDay: 每月几号重置流量, 0 = 不重置; price: 每期多少钱, 0 = 没填 */
export type Sub = { id: string; name: string; resetDay?: number; price?: number }
/** upload / download / total 单位字节, expire 秒 (0 = 没有到期日), t 读取时间 */
export type Usage = { up: number; down: number; total: number; expire: number; t: number; plan?: string; site?: string }
type UsageEntry = { usage?: Usage; err?: string; at: number }
type Sample = [number, number]   // 读取时间, 已用量

function readJSON<T>(key: string, fallback: T): T {
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

export function updateSub(id: string, patch: Partial<Sub>, url?: string): void {
  if (url !== undefined && !Keychain.set(secretKey(id), url.trim())) throw new Error('写入钥匙串失败')
  saveSubs(listSubs().map(s => (s.id === id ? { ...s, ...patch } : s)))
  if (url !== undefined) dropUsage(id)
}

export function removeSub(id: string): void {
  Keychain.remove(secretKey(id))
  saveSubs(listSubs().filter(s => s.id !== id))
  dropUsage(id)
  for (const key of [HIST_KEY, SAMPLE_KEY]) {
    const all = readJSON<Record<string, unknown>>(key, {})
    delete all[id]
    AppStorage.set(key, JSON.stringify(all))
  }
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
 * 读用量, 尽量不下载订阅正文 (常见 1-5MB): 先 HEAD, 不行只取 1 字节, 最后才完整 GET;
 * 完整 GET 还没有这个头时读响应体 (有的自建端点把用量写在 body 里)
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
  const headers = { 'User-Agent': UA, ...extra }
  const init = { timeout: 12, allowInsecureRequest: /^http:/i.test(base) }
  const read = (res: { headers: { get(k: string): string | null } }) => {
    const info = parseUserinfo(res.headers.get('subscription-userinfo') ?? '')
    if (!info) return null
    info.plan = res.headers.get('plan-name') ?? undefined
    info.site = res.headers.get('profile-web-page-url') ?? undefined
    return info
  }
  for (const attempt of [{ method: 'HEAD', headers }, { method: 'GET', headers: { ...headers, Range: 'bytes=0-0' } }]) {
    try {
      const res = await fetch(base, { ...init, ...attempt })
      const info = res.ok ? read(res) : null
      if (info) return info
    } catch { /* 换下一种 */ }
  }
  let res
  try {
    res = await fetch(base, { ...init, headers })
  } catch {
    throw new Error('连不上订阅地址')
  }
  if (!res.ok) throw new Error(`订阅地址返回 ${res.status}`)
  const info = read(res)
  if (info) return info
  const text = await res.text().catch(() => '')
  const fromBody = text.length < 1000 ? parseUserinfo(text) : null
  if (fromBody) return fromBody
  throw new Error('没有返回用量信息')
}

export type Budget = { days: number; today: number; over: number; tomorrow: number }

export type SubView = {
  id: string
  name: string
  resetDay: number
  price: number
  usage?: Usage
  err?: string       // 最近一次读取失败的原因 (有旧数据时照常显示旧数据)
  stale: boolean     // 显示的是旧数据
  used: number
  remain: number
  ratio: number      // 已用 / 总量, 不限量时 0
  daily: (number | null)[]   // 近 62 天日用量, 最后一个是今天; null = 没有数据
  today: number      // 今天用了多少
  hourly: (number | null)[]  // 今天每小时 (北京时间), 还没到的小时 null
  recent: { bytes: number; mbps: number } | null   // 近 1 小时
  interval: number   // 机场大约多少分钟更新一次用量, 0 = 还不知道
  deadline: number   // 下次重置或到期 (ms), 0 = 没有
  deadlineWord: string
  budget: Budget | null
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
      cache[s.id] = { usage: await fetchUsage(url), at: now }
    } catch (e) {
      cache[s.id] = { usage: old?.usage, err: (e as Error).message, at: now }
    }
  }))
  // 请求是并发的, 历史等全部回来再一起写, 免得互相覆盖
  for (const s of subs) if (cache[s.id]?.at === now && cache[s.id].usage && !cache[s.id].err) record(s.id, cache[s.id].usage!)
  AppStorage.set(USAGE_KEY, JSON.stringify(cache))
  return views(subs, cache)
}

/** 只读缓存, 不发请求 (App 内预览、首屏) */
export const cachedSubs = () => views(listSubs(), readJSON<Record<string, UsageEntry>>(USAGE_KEY, {}))

function views(subs: Sub[], cache: Record<string, UsageEntry>): SubView[] {
  const hist = readHist()
  const samples = readJSON<Record<string, Sample[]>>(SAMPLE_KEY, {})
  return subs.map(s => viewOf(s, cache[s.id], hist[s.id] ?? {}, samples[s.id] ?? []))
}

function viewOf(s: Sub, entry: UsageEntry | undefined, points: Record<string, number>, samples: Sample[]): SubView {
  const usage = entry?.usage
  const used = usage ? usage.up + usage.down : 0
  const remain = usage && usage.total > 0 ? Math.max(0, usage.total - used) : 0
  const daily = dailySeries(points, DAYS)
  const today = daily[daily.length - 1] ?? 0
  const resetDay = s.resetDay ?? 0
  const reset = resetDay ? nextReset(resetDay) : 0
  const exp = usage?.expire ? usage.expire * 1000 : 0
  const deadline = reset && (!exp || reset < exp) ? reset : exp
  const deadlineWord = deadline && deadline === reset ? '重置' : '到期'
  return {
    id: s.id, name: s.name, resetDay, price: s.price ?? 0,
    usage, err: entry?.err, stale: !!entry?.err && !!usage,
    used, remain, ratio: usage && usage.total > 0 ? Math.min(1, used / usage.total) : 0,
    daily, today, hourly: hourlySeries(samples), recent: recentRate(samples), interval: updateInterval(samples),
    deadline, deadlineWord, budget: budgetOf(usage, remain, today, deadline),
    fc: forecast(usage, daily, deadline, deadlineWord),
  }
}

// ────────────────────────────────────────────────────────────
// 历史
// ────────────────────────────────────────────────────────────
/** 北京时间日期 "2026-11-05" */
export const bjDate = (ms: number) => new Date(ms + 8 * HOUR).toISOString().slice(0, 10)
export const todayStr = () => bjDate(Date.now())
export const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
const bjHour = (ms: number) => new Date(ms + 8 * HOUR).getUTCHours()

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
  const all = readJSON<Record<string, Sample[]>>(SAMPLE_KEY, {})
  all[id] = [...(all[id] ?? []).filter(x => u.t - x[0] < SAMPLE_DAYS * DAY), [u.t, u.up + u.down]]
  AppStorage.set(SAMPLE_KEY, JSON.stringify(all))
}

export function clearHistory(): void {
  AppStorage.remove(HIST_KEY)
  AppStorage.remove(SAMPLE_KEY)
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

/** 今天每小时用量: 相邻两次读数相减, 跨了几个小时就平均摊开; 用量变少 (重置) 的一段不算 */
export function hourlySeries(samples: Sample[]): (number | null)[] {
  const now = Date.now()
  const today = bjDate(now)
  const out: (number | null)[] = Array.from({ length: 24 }, (_, h) => (h <= bjHour(now) ? 0 : null))
  for (let i = 1; i < samples.length; i++) {
    const [ta, ua] = samples[i - 1], [tb, ub] = samples[i]
    if (bjDate(tb) !== today || ub <= ua) continue
    const from = bjDate(ta) === today ? bjHour(ta) : 0
    const to = bjHour(tb)
    const per = (ub - ua) / (to - from + 1)
    for (let h = from; h <= to; h++) out[h] = (out[h] ?? 0) + per
  }
  return out
}

/** 近 1 小时: 取 20 分钟到 2 小时前最接近 1 小时前的读数, 折算成每小时 */
export function recentRate(samples: Sample[]): { bytes: number; mbps: number } | null {
  const last = samples[samples.length - 1]
  if (!last) return null
  const old = samples
    .filter(x => { const age = last[0] - x[0]; return age >= HOUR / 3 && age <= 2 * HOUR })
    .sort((a, b) => Math.abs(last[0] - a[0] - HOUR) - Math.abs(last[0] - b[0] - HOUR))[0]
  if (!old || last[1] < old[1]) return null
  const sec = (last[0] - old[0]) / 1000
  const delta = last[1] - old[1]
  return { bytes: delta * 3600 / sec, mbps: delta * 8 / sec / 1e6 }
}

/** 读数发生变化的时间间隔的中位数 = 机场大约多久更新一次用量 */
export function updateInterval(samples: Sample[]): number {
  const changes = samples.filter((x, i) => i > 0 && x[1] !== samples[i - 1][1]).map(x => x[0])
  if (changes.length < 3) return 0
  const gaps = changes.slice(1).map((t, i) => t - changes[i]).sort((a, b) => a - b)
  return Math.round(gaps[Math.floor(gaps.length / 2)] / 60_000)
}

// ────────────────────────────────────────────────────────────
// 预测、额度
// ────────────────────────────────────────────────────────────
export type Forecast = {
  kind: 'none' | 'unlimited' | 'out' | 'idle' | 'enough' | 'runout'
  avg: number       // 近 7 天日均 (字节)
  date?: number     // 预计用完的时间 (ms)
  text: string      // 「预计 11/28 用完」「够用到 12/01 到期」
  short: string     // 窄位置用: 「11/28 用完」「够用」
}

export const md = (ms: number) => { const d = new Date(ms + 8 * HOUR); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}` }

/** 下一个每月 day 号的北京时间 0 点; 当月没有这一天时取月底 */
export function nextReset(day: number, now = Date.now()): number {
  const d = new Date(now + 8 * HOUR)
  const at = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    return Date.UTC(y, m, Math.min(day, last)) - 8 * HOUR
  }
  const t = at(d.getUTCFullYear(), d.getUTCMonth())
  return t > now ? t : at(d.getUTCFullYear(), d.getUTCMonth() + 1)
}

/** 按近 7 天日均推算: 今天还没过完, 优先用今天以前的 7 天 */
export function forecast(u: Usage | undefined, daily: (number | null)[], deadline = 0, word = '到期'): Forecast {
  if (!u) return { kind: 'none', avg: 0, text: '还没有读到用量', short: '-' }
  if (u.total <= 0) return { kind: 'unlimited', avg: 0, text: '不限流量', short: '不限量' }
  const remain = u.total - u.up - u.down
  if (remain <= 0) return { kind: 'out', avg: 0, text: '流量已用完', short: '已用完' }
  const before = daily.slice(-8, -1).filter((v): v is number => v !== null)
  const pool = before.length ? before : daily.slice(-1).filter((v): v is number => v !== null)
  if (!pool.length) return { kind: 'none', avg: 0, text: '再记录一天就能预测', short: '记录中' }
  const avg = pool.reduce((a, b) => a + b, 0) / pool.length
  if (avg <= 0) return { kind: 'idle', avg, text: deadline ? `近 7 天几乎没用, 够用到 ${md(deadline)} ${word}` : '近 7 天几乎没用', short: '够用' }
  const date = Date.now() + (remain / avg) * DAY
  if (deadline && date >= deadline) return { kind: 'enough', avg, date, text: `够用到 ${md(deadline)} ${word}`, short: '够用' }
  return { kind: 'runout', avg, date, text: `预计 ${md(date)} 用完`, short: `${md(date)} 用完` }
}

/** 到下次重置 / 到期前每天能用多少; today 把今天已用的算回去, 不会越用额度越低 */
function budgetOf(u: Usage | undefined, remain: number, today: number, deadline: number): Budget | null {
  if (!u || u.total <= 0 || !deadline) return null
  const days = Math.max(1, Math.ceil((deadline - Date.now()) / DAY))
  const budget = (remain + today) / days
  return { days, today: budget, over: Math.max(0, today - budget), tomorrow: days > 1 ? remain / (days - 1) : 0 }
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
// 汇总 (全部机场)
// ────────────────────────────────────────────────────────────
export type Overview = {
  today: number
  yesterday: number | null
  recent: { bytes: number; mbps: number } | null
  hourly: (number | null)[]
  peakHour: number                 // 今天用得最多的小时, -1 = 没有
  month: { total: number; days: { d: string; v: number | null }[]; avg: number; max: { d: string; v: number } | null; lastAvg: number | null; change: number | null }
}

export function overview(subs: SubView[]): Overview {
  const sum = (pick: (s: SubView) => number | null) => {
    const list = subs.map(pick).filter((v): v is number => v !== null)
    return list.length ? list.reduce((a, b) => a + b, 0) : null
  }
  const n = DAYS
  const at = (i: number) => sum(s => s.daily[i] ?? null)
  const t = todayStr()
  const month = t.slice(0, 7)
  const dates = Array.from({ length: n }, (_, i) => ({ d: shiftDay(t, i - n + 1), v: at(i) }))
  const inMonth = dates.filter(x => x.d.startsWith(month))
  const known = inMonth.filter((x): x is { d: string; v: number } => x.v !== null)
  const lastKnown = dates.filter((x): x is { d: string; v: number } => x.v !== null && x.d < `${month}-01` && x.d >= shiftDay(`${month}-01`, -31))
  const total = known.reduce((a, b) => a + b.v, 0)
  const avg = known.length ? total / known.length : 0
  const lastAvg = lastKnown.length >= 7 ? lastKnown.reduce((a, b) => a + b.v, 0) / lastKnown.length : null
  const hourly = Array.from({ length: 24 }, (_, h) => sum(s => s.hourly[h]))
  const peak = hourly.reduce<number>((best, v, h) => ((v ?? 0) > (best < 0 ? 0 : hourly[best] ?? 0) ? h : best), -1)
  const recents = subs.map(s => s.recent).filter((r): r is { bytes: number; mbps: number } => !!r)
  return {
    today: subs.reduce((a, s) => a + s.today, 0),
    yesterday: at(n - 2),
    recent: recents.length ? { bytes: recents.reduce((a, r) => a + r.bytes, 0), mbps: recents.reduce((a, r) => a + r.mbps, 0) } : null,
    hourly,
    peakHour: peak,
    month: {
      total, days: inMonth, avg,
      max: known.length ? known.reduce((a, b) => (b.v > a.v ? b : a)) : null,
      lastAvg, change: lastAvg && avg ? avg / lastAvg - 1 : null,
    },
  }
}

// ────────────────────────────────────────────────────────────
// 用量提醒: 条件成立时发一次, 条件解除后才会再发
// ────────────────────────────────────────────────────────────
export type LocalEvent = { t: number; k: string; msg: string }
export const localEvents = () => readJSON<LocalEvent[]>(EVENT_KEY, [])

export async function checkAlerts(subs: SubView[], on: Alerts): Promise<void> {
  const sent = readJSON<Record<string, boolean>>(ALERT_KEY, {})
  const events = localEvents()
  const before = JSON.stringify(sent)
  const hit = async (key: string, cond: boolean, title: string, body: string) => {
    if (!cond) { delete sent[key]; return }
    if (sent[key]) return
    sent[key] = true
    events.push({ t: Date.now(), k: 'usage', msg: title })
    await Notification.schedule({ title, body })
  }
  for (const s of subs) {
    if (!s.usage || s.stale || s.usage.total <= 0) continue
    const line = s.budget ? `, 到${s.deadlineWord}前每天可用 ${fmtBytes(s.budget.today)}` : ''
    if (on.usage) {
      await hit(`${s.id}:90`, s.ratio >= 0.9, `${s.name}已用 90%`, `${s.fc.text}${line}`)
      await hit(`${s.id}:80`, s.ratio >= 0.8 && s.ratio < 0.9, `${s.name}已用 80%`, `${s.fc.text}${line}`)
    }
    if (on.runout) await hit(`${s.id}:run`, s.fc.kind === 'runout' && (s.fc.date ?? 0) - Date.now() < 3 * DAY, `${s.name}预计 3 天内用完`, `${s.fc.text}, 还剩 ${fmtBytes(s.remain)}`)
    if (on.expire) await hit(`${s.id}:exp`, !!s.usage.expire && s.usage.expire * 1000 - Date.now() < 3 * DAY, `${s.name}快到期了`, expireText(s.usage))
  }
  if (JSON.stringify(sent) !== before) {
    AppStorage.set(ALERT_KEY, JSON.stringify(sent))
    AppStorage.set(EVENT_KEY, JSON.stringify(events.slice(-20)))
  }
}

// ────────────────────────────────────────────────────────────
// 示例数据 (样式库「示例预览」/ 还没添加订阅时): 走和真实数据一样的计算
// ────────────────────────────────────────────────────────────
export function sampleSubs(): SubView[] {
  const G = 1024 ** 3
  const now = Date.now()
  const wave = (i: number, base: number, amp: number, seed: number) => Math.max(0.1, base + amp * Math.sin(i * 0.9 + seed) + ((i * 7 + seed) % 5) * 0.3)
  const make = (id: string, name: string, total: number, usedG: number, base: number, amp: number, seed: number, expireDays: number, extra: Partial<Sub>) => {
    const t = todayStr()
    const points: Record<string, number> = {}
    let used = usedG * G
    for (let i = 0; i < KEEP_DAYS; i++) {
      points[shiftDay(t, -i)] = used
      used = Math.max(0, used - wave(i, base, amp, seed) * G)
    }
    const samples: Sample[] = []
    const h = bjHour(now)
    let v = points[shiftDay(t, -1)]
    const step = (points[t] - v) / (h * 2 + 2)
    for (let i = h * 2 + 1; i >= 0; i--) {
      v += step * (0.6 + (i % 5) * 0.2)
      samples.push([now - i * 30 * 60_000, v])
    }
    const usage: Usage = { up: usedG * G * 0.08, down: usedG * G * 0.92, total: total * G, expire: expireDays ? Math.floor((now + expireDays * DAY) / 1000) : 0, t: now, plan: id === 'demo1' ? 'Pro' : undefined }
    return viewOf({ id, name, ...extra }, { usage, at: now }, points, samples)
  }
  return [
    make('demo1', '主力机场', 200, 126.4, 3.6, 1.8, 1, 26, { resetDay: 1, price: 30 }),
    make('demo2', '备用机场', 100, 41.7, 1.2, 0.8, 3, 74, { price: 15 }),
    make('demo3', '自建 VPS', 1024, 635, 18, 9, 5, 0, { resetDay: 1 }),
  ]
}
