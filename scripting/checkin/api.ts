// checkin / api.ts
// 数据层 — 只读 BoxJS, 按「签到状态协议 v1」解析
//
// checkin_registry = { "<状态key>": { name, author, url? } }
// <状态key>        = { v:1 (旧记录没有), s:"ok"|"cookie"|"fail"|"none", t:毫秒, msg, asset?, name?, author? }
// BoxJS 返回 { key, val }, val 是字符串, 要再 JSON.parse 一次

import { fetch } from 'scripting'

// DOM 的 Storage class 类型与 Scripting 全局 Storage 冲突，手动 cast
const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const REGISTRY_KEY = 'checkin_registry'
const HOST_KEY = 'checkin.host'
const MOCK_KEY = 'checkin.mock'
const CACHE_KEY = 'checkin.cache'
export const DEFAULT_HOST = 'https://boxjs.com'

// paperclip 的签到脚本 [显示名, 状态key, 类别]; 前两列照抄 paperclip app/summary/summary.js 的 SCRIPTS
// 类别先写死在这里, 以后放进协议
const SCRIPTS: [string, string, string][] = [
  ['微博超话', 'weibotalk_status', '社区'],
  ['腾讯视频', 'tenvideo_status', '影音'],
  ['米游社', 'mihoyo_status', '社区'],
  ['一点万象', 'newmixc_status', '商场'],
  ['小米商城', 'mishop_status', '生活'],
  ['小米抽奖', 'milottery_status', '生活'],
  ['小米有品', 'youpin_status', '生活'],
  ['龙湖天街 App', 'lhtj_app_status', '商场'],
  ['QQ音乐', 'qqmusic_status', '影音'],
  ['万达电影', 'wanda_status', '影音'],
  ['听听FM', 'tingtingfm_status', '影音'],
  ['WPS', 'wps_status', '工具'],
  ['扫描全能王', 'camscanner_status', '工具'],
  ['追觅', 'dreame_status', '生活'],
  ['灵狐灵购', 'linghu_status', '生活'],
  ['NodeSeek', 'nodeseek_status', '社区'],
  ['123社区', 'pan1_status', '社区'],
  ['AgentRouter', 'agentrouter_status', '工具'],
  ['网上国网', 'sgcc_status', '工具'],
  ['中国移动', 'cmcc_status', '工具'],
  ['小黑盒', 'heybox_status', '社区'],
  ['百度网盘', 'baidunetdisk_status', '工具'],
  ['徕芬', 'laifen_status', '生活'],
  ['泡泡玛特', 'ppmt_status', '生活'],
  ['途虎养车', 'tuhu_status', '生活'],
  ['海底捞', 'haidilao_status', '生活'],
  ['惠省红包墙', 'huisheng_status', '生活'],
  ['名创优品', 'miniso_status', '商场'],
  ['龙德广场', 'longde_status', '商场'],
  ['龙湖天街', 'lhtj_status', '商场'],
  ['味多美', 'wedome_status', '生活'],
  ['北京华联', 'bhg_status', '商场'],
  ['林里', 'linli_status', '生活'],
]
const OWN = new Map(SCRIPTS.map(([name, key]) => [key, name]))
const CATEGORY = new Map(SCRIPTS.map(([, key, cat]) => [key, cat]))
export const CATEGORIES = ['商场', '影音', '社区', '工具', '生活', '其他']

// 图标底色 (品牌色的深色调) + 字色; 已知品牌固定, 其余按 key 取色
const BRAND: Record<string, [string, string]> = {
  cmcc_status: ['#0B4F8C', '#BFE0FF'],
  nodeseek_status: ['#1D5A33', '#C6F2D3'],
  dreame_status: ['#6B4410', '#FFE2B8'],
}
const PALETTE: [string, string][] = [
  ['#1E3A5F', '#64D2FF'], ['#3A2350', '#BF5AF2'], ['#1F3D2B', '#30D158'], ['#4A2A1A', '#FFB340'],
  ['#5A1E2A', '#FF8FA3'], ['#2E2A10', '#FFD60A'], ['#123B44', '#5AC8FA'], ['#3B2A12', '#FFCC80'],
]

export type Status = 'ok' | 'cookie' | 'fail' | 'none'

export type Entry = {
  key: string
  name: string
  author: string
  url?: string
  s: Status
  t: number
  msg: string
  asset?: string
  exp?: number      // 凭证过期时间 (毫秒), 协议可选字段
  run?: string      // 补签触发 URL (registry 可选字段), GET 后返回最新结果
  category: string
}

export type Snapshot = {
  entries: Entry[]   // 已去掉 s:"none" 和没有结果的, 保持登记顺序
  fetchedAt: number
  stale?: boolean    // BoxJS 连不上, 显示的是上次成功读到的
  mock?: boolean
}

// ────────────────────────────────────────────────────────────
// 配置
// ────────────────────────────────────────────────────────────
export function getHost(): string {
  return AppStorage.get<string>(HOST_KEY) || DEFAULT_HOST
}

export function setHost(host: string): void {
  AppStorage.set(HOST_KEY, host.trim() || DEFAULT_HOST)
}

/** 真实数据到位前默认用演示数据 */
export function getMock(): boolean {
  return AppStorage.get<boolean>(MOCK_KEY) ?? true
}

export function setMock(on: boolean): void {
  AppStorage.set(MOCK_KEY, on)
}

// ────────────────────────────────────────────────────────────
// 读取
// ────────────────────────────────────────────────────────────
/** "boxjs.com" / "https://boxjs.com/" → "https://boxjs.com" */
function baseUrl(host: string): string {
  const h = host.trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(h) ? h : `https://${h}`
}

async function readKey(base: string, key: string): Promise<any> {
  // BoxJS 地址允许填 http://, 同样要显式允许明文
  const res = await fetch(`${base}/query/data/${encodeURIComponent(key)}`, { allowInsecureRequest: base.startsWith('http://') })
  if (!res.ok) throw new Error(`BoxJS HTTP ${res.status}`)
  const { val } = await res.json() as { val?: string | null }
  return val ? JSON.parse(val) : null
}

type RegInfo = { name?: string; author?: string; url?: string; run?: string }

/** 一条结果 → Entry; 旧记录只有 {s, t, msg}, 没有 v 也按 v1 处理 */
function toEntry(key: string, r: any, info: RegInfo): Entry {
  return {
    key,
    name: info.name || r.name || OWN.get(key) || key,
    author: info.author || r.author || '',
    url: info.url,
    s: r.s,
    t: Number(r.t) || 0,
    msg: String(r.msg ?? ''),
    asset: r.asset != null && r.asset !== '' ? String(r.asset) : undefined,
    exp: Number(r.exp) > 0 ? Number(r.exp) : undefined,
    run: info.run || undefined,
    category: CATEGORY.get(key) ?? '其他',
  }
}

async function readBoxJS(host: string): Promise<Entry[]> {
  const base = baseUrl(host)
  let registry: Record<string, RegInfo> | null
  try {
    registry = await readKey(base, REGISTRY_KEY)
  } catch (e) {
    throw new Error(`连不上 BoxJS (${base}), 确认代理工具已开启: ${(e as Error).message}`)
  }
  const reg = registry ?? {}
  // 索引优先, paperclip 自带列表兜底 (同 paperclip summary.js)
  const keys = [...new Set([...OWN.keys(), ...Object.keys(reg)])]
  // 单个结果读失败或解析不了当作没记录, 不影响其他行
  const results = await Promise.all(keys.map(k => readKey(base, k).catch(() => null)))
  return keys
    .map((key, i) => (results[i] && typeof results[i] === 'object' ? toEntry(key, results[i], reg[key] ?? {}) : null))
    .filter((e): e is Entry => e !== null)
}

function tidy(entries: Entry[]): Entry[] {
  return entries.filter(e => e.s === 'ok' || e.s === 'cookie' || e.s === 'fail')   // none 和无法识别的不显示
}

// ────────────────────────────────────────────────────────────
// 补签: GET registry 里的 run, 响应体就是最新结果
// 拿到的结果先存成补丁, 盖住比它旧的那条 (演示数据和 BoxJS 还没同步时也能看到)
// ────────────────────────────────────────────────────────────
const PATCH_KEY = 'checkin.patch'
const RETRY_KEY = 'checkin.retrying'

function patches(): Record<string, Entry> {
  const raw = AppStorage.get<string>(PATCH_KEY)
  return raw ? JSON.parse(raw) as Record<string, Entry> : {}
}

function applyPatches(entries: Entry[]): Entry[] {
  const all = patches()
  const out = entries.map(e => (all[e.key] && all[e.key].t > e.t ? all[e.key] : e))
  // BoxJS 追上来的补丁不再需要
  for (const e of entries) if (all[e.key] && all[e.key].t <= e.t) delete all[e.key]
  AppStorage.set(PATCH_KEY, JSON.stringify(all))
  return out
}

export async function runCheckin(e: Entry): Promise<Entry> {
  if (!e.run) throw new Error('该脚本不支持补签')
  let r: any
  if (e.run.startsWith('mock://')) {
    await new Promise(res => setTimeout(res, 800))
    r = { v: 1, s: 'ok', t: Date.now(), msg: '补签成功 +1', asset: e.asset }
  } else {
    // run 是 Loon 内网明文地址 (http://1.1.1.1/checkin/<id>), Scripting 的 fetch 默认拒绝 http, 要显式允许
    const res = await fetch(e.run, { allowInsecureRequest: true })
    if (!res.ok) throw new Error(`补签请求失败 HTTP ${res.status}`)
    r = await res.json()
  }
  if (!r || typeof r !== 'object' || !r.s) throw new Error('补签返回的不是签到结果')
  const next = { ...toEntry(e.key, r, { name: e.name, author: e.author, url: e.url, run: e.run }), category: e.category }
  const all = patches()
  all[e.key] = next
  AppStorage.set(PATCH_KEY, JSON.stringify(all))
  return next
}

/** 小组件按钮补签超时: 记下开始时间, 在脚本写回新结果之前显示「补签中」 */
export function markRetrying(key: string, on: boolean): void {
  const raw = AppStorage.get<string>(RETRY_KEY)
  const all: Record<string, number> = raw ? JSON.parse(raw) : {}
  if (on) all[key] = Date.now()
  else delete all[key]
  AppStorage.set(RETRY_KEY, JSON.stringify(all))
}

export function isRetrying(e: Entry): boolean {
  const raw = AppStorage.get<string>(RETRY_KEY)
  const since = raw ? (JSON.parse(raw) as Record<string, number>)[e.key] : undefined
  return since !== undefined && since > e.t && Date.now() - since < 10 * 60_000
}

/** 读全部结果; BoxJS 连不上时退回上次缓存, 没缓存才抛错 */
export async function loadSnapshot(): Promise<Snapshot> {
  if (getMock()) return { entries: applyPatches(tidy(mockEntries())), fetchedAt: Date.now(), mock: true }
  try {
    const snap: Snapshot = { entries: applyPatches(tidy(await readBoxJS(getHost()))), fetchedAt: Date.now() }
    AppStorage.set(CACHE_KEY, JSON.stringify(snap))
    return snap
  } catch (e) {
    const cached = AppStorage.get<string>(CACHE_KEY)
    if (cached) return { ...JSON.parse(cached) as Snapshot, stale: true }
    throw e
  }
}

/** 新手引导用: 不管演示开关, 直接试读 BoxJS */
export async function probe(): Promise<{ connected: boolean; count: number; error?: string }> {
  try {
    const entries = tidy(await readBoxJS(getHost()))
    return { connected: true, count: entries.length }
  } catch (e) {
    return { connected: false, count: 0, error: (e as Error).message }
  }
}

const RANK: Record<Status, number> = { cookie: 0, fail: 1, ok: 2, none: 3 }

/** 按 keys 挑选并排序 (空 = 全部, 登记顺序); problemsFirst 时需重抓 → 失败 → 成功 */
export function select(entries: Entry[], keys: string[], problemsFirst: boolean): Entry[] {
  const list = keys.length ? keys.map(k => entries.find(e => e.key === k)).filter((e): e is Entry => !!e) : entries
  if (!problemsFirst) return list
  return list.map((e, i) => ({ e, i })).sort((a, b) => RANK[a.e.s] - RANK[b.e.s] || a.i - b.i).map(x => x.e)
}

export function clearCache(): void {
  AppStorage.remove(CACHE_KEY)
}

export function counts(entries: Entry[]) {
  return {
    ok: entries.filter(e => e.s === 'ok').length,
    cookie: entries.filter(e => e.s === 'cookie').length,
    fail: entries.filter(e => e.s === 'fail').length,
  }
}

export const isProblem = (e: Entry) => e.s === 'cookie' || e.s === 'fail'

/** 资产拆成数字和单位: "话费 91.90 元" → { num: "91.90", unit: "话费 元", value: 91.9 } */
export function splitAsset(asset: string): { num: string; unit: string; value: number } {
  const m = asset.match(/-?\d[\d,]*(\.\d+)?/)
  if (!m) return { num: asset, unit: '', value: NaN }
  return { num: m[0], unit: asset.replace(m[0], '').replace(/\s+/g, ' ').trim(), value: Number(m[0].replace(/,/g, '')) }
}

/** msg 里的第一个 "+N" */
export function rewardOf(msg: string): number {
  const m = msg.match(/\+\s*(\d+(\.\d+)?)/)
  return m ? Number(m[1]) : 0
}

/** 今日奖励: 只算今天成功的 */
export const reward = (e: Entry) => (e.s === 'ok' && isToday(e.t) ? rewardOf(e.msg) : 0)

export const rewardTotal = (entries: Entry[]) => entries.reduce((n, e) => n + reward(e), 0)

/** 图标占位字: 中文取首字, NodeSeek → NS, 其他取首字母 */
export function initials(name: string): string {
  const caps = name.match(/[A-Z]/g)
  if (/^[A-Za-z]/.test(name) && caps && caps.length === 2) return caps.join('')
  return name.charAt(0).toUpperCase()
}

export function brand(key: string): { bg: string; fg: string } {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [bg, fg] = BRAND[key] ?? PALETTE[h % PALETTE.length]
  return { bg, fg }
}

export function isToday(t: number): boolean {
  return new Date(t).toDateString() === new Date().toDateString()
}

/** 今天 "08:05", 其他日子 "10/26" */
export function timeLabel(t: number): string {
  const d = new Date(t)
  if (isToday(t)) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ────────────────────────────────────────────────────────────
// 演示数据: 覆盖资产 / 需重抓 / 失败 / 昨天 / 其他作者 / 各类别 / 不同时间
// ────────────────────────────────────────────────────────────
function mockEntries(): Entry[] {
  const at = (h: number, m: number, dayOffset = 0) => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d.getTime() + dayOffset * 86_400_000
  }
  const me = 'MaYIHEI'
  const rows: Omit<Entry, 'category'>[] = [
    { key: 'dreame_status', name: '追觅', author: me, s: 'ok', t: at(8, 2), msg: '+5 积分 · 连签 3 天', asset: '积分 735', exp: Date.now() + 2.4 * 86_400_000 },
    { key: 'nodeseek_status', name: 'NodeSeek', author: me, s: 'ok', t: at(8, 0), msg: '鸡腿 +4', asset: '鸡腿 212', exp: Date.now() + 6.2 * 86_400_000 },
    { key: 'cmcc_status', name: '中国移动', author: me, s: 'ok', t: at(7, 30), msg: '+10 积分', asset: '话费 91.90 元', exp: Date.now() + 25 * 86_400_000 },
    { key: 'heybox_status', name: '小黑盒', author: me, s: 'cookie', t: at(8, 10), msg: '凭证失效' },
    { key: 'wps_status', name: 'WPS', author: me, s: 'fail', t: at(8, 15), msg: '请求超时', run: 'mock://run/wps_status' },
    { key: 'wedome_status', name: '味多美', author: me, s: 'ok', t: at(9, 0), msg: '+2 积分', asset: '积分 120', exp: Date.now() + 12.5 * 86_400_000 },
    { key: 'mihoyo_status', name: '米游社', author: me, s: 'ok', t: at(8, 30), msg: '原神 · 星铁 已签' },
    { key: 'wanda_status', name: '万达电影', author: me, s: 'ok', t: at(21, 0, -1), msg: '+1 成长值', asset: '成长值 88' },
    { key: 'qqmusic_status', name: 'QQ音乐', author: me, s: 'ok', t: at(7, 45), msg: '+3 成长值' },
    { key: 'bhg_status', name: '北京华联', author: me, s: 'ok', t: at(10, 5), msg: '+1 积分', asset: '积分 56' },
    { key: 'lhtj_status', name: '龙湖天街', author: me, s: 'cookie', t: at(9, 20), msg: 'Token 过期' },
    { key: 'tuhu_status', name: '途虎养车', author: me, s: 'none', t: at(8, 0), msg: '' },
    { key: 'demo_jd', name: '京东', author: 'Alice', s: 'ok', t: at(6, 30), msg: '+5 京豆', asset: '京豆 1,234', exp: Date.now() + 0.6 * 86_400_000 },
    { key: 'demo_smzdm', name: '什么值得买', author: 'Alice', s: 'fail', t: at(6, 35), msg: '签到接口变更' },
    { key: 'demo_v2ex', name: 'V2EX', author: 'Bob', s: 'fail', t: at(7, 20), msg: '网络超时', run: 'mock://run/demo_v2ex' },
    { key: 'demo_bilibili', name: '哔哩哔哩', author: 'Bob', s: 'ok', t: at(7, 0), msg: '+5 经验', asset: '硬币 66' },
  ]
  return rows.map(r => ({ ...r, category: CATEGORY.get(r.key) ?? '其他' }))
}
