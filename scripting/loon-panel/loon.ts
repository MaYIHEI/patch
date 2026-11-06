// loon-panel / loon.ts
// 读 Loon 插件的数据地址、调用操作地址. 都是明文 http (Loon 拦截后直接返回, 不出网), fetch 要显式允许

import { fetch } from 'scripting'

import type { Prefs } from './settings'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

export const DATA_URL = 'http://1.1.1.1/loon-panel/data'
export const SET_URL = 'http://1.1.1.1/loon-panel/set'
export const DEEP_URL = 'http://1.1.1.1/loon-panel/deep'
const OPTS_URL = 'http://1.1.1.1/loon-panel/opts'
const PAGE_KEY = 'loonpanel.page'
const PICK_KEY = 'loonpanel.pick'
const CACHE_KEY = 'loonpanel.loon'

/** h: 最近 24 次延迟 (ms), 超时记 -1; fail: 连续超时次数 */
export type NodeResult = { ok: boolean; ms: number; t: number; ip?: string; cc?: string; asn?: string; org?: string; err?: string; h?: number[]; fail?: number }
/** gone: 当前节点已经不在订阅里 */
export type Group = { name: string; now: string; leaf: string; subs: string[]; gone?: boolean }
export type Media = { name: string; status: 'yes' | 'partial' | 'no' | 'unknown'; region?: string; note?: string }
export type Isp = 'ct' | 'cu' | 'cm'
/** 深度检测结果 (ipquality-web-test 核心库的 data), 拿不到的字段没有 */
export type Deep = {
  t: number
  basic?: { ip?: string; cc?: string; country?: string; city?: string; asn?: string; org?: string }
  egress?: { ip: string; main?: boolean; sources?: string[]; asn?: string; cc?: string }[]
  types?: { source: string; type: string }[]
  scores?: { source: string; score?: number; text?: string }[]
  factors?: { source: string; proxy?: boolean; vpn?: boolean; tor?: boolean; hosting?: boolean }[]
  media?: Media[]
  regions?: { exit?: string; mismatch?: string[] }
  stability?: { target: string; ok: number; total: number; median?: number; max?: number }[]
  ping?: { isp: Isp; avg?: number; loss?: number; jitter?: number }[]
  inbound?: { isp: Isp; hops?: number; asPath?: string[]; summary?: string }[]
  backhaul?: { isp: Isp; probe?: string; hops?: number; asPath?: string[]; summary?: string }[]
  dnsbl?: { checked: number; listed: { list: string; hit?: string }[] }
  dnsleak?: { servers: { ip: string; cc?: string; org?: string }[] }
  speed?: { down?: number; up?: number; bytes?: number; conns?: number }
  bgp?: { prefix?: string; rpki?: string; holder?: string }
  errors?: Record<string, string>
}
export type LoonEvent = { t: number; k: string; msg: string }
/** 插件设置: 存在插件里, 在 App 里改. push 只表示配好了没有, 密钥不返回 */
export type Opts = { notify: boolean; auto: boolean; net: boolean; timeout: number; test_url: string; ip_url: string; push: boolean; full: string[] }
export type OptsPatch = Partial<Omit<Opts, 'push' | 'full' | 'test_url' | 'ip_url'>> & { test_url?: string; ip_url?: string; groups?: string[]; push_key?: string; targets?: string[] }

export type LoonData = {
  v: number
  version?: string
  t: number
  mode: number                 // 0 全局直连 / 1 分流 / 2 全局代理 / -1 未知
  final: string
  global: string
  groups: Group[]
  nodes: Record<string, NodeResult>
  check: { t: number; took: number; tested: number; total: number } | null
  direct?: { ip?: string; cc?: string; asn?: string; org?: string } | null
  media?: Record<string, { t: number; list: Media[] }>
  deep?: Record<string, Deep>
  locks?: Record<string, string>
  events?: LoonEvent[]         // 新的在前
  opts?: Opts
  cfg?: { keys: string[]; group: string[] }
  result?: { ok: boolean; error?: string }
  stale?: boolean              // 连不上 Loon, 显示的是上次的数据
  mock?: boolean
}

export const MODES = [
  { id: 0, name: '全局直连', short: '直连', icon: 'arrow.right' },
  { id: 1, name: '分流', short: '分流', icon: 'arrow.triangle.branch' },
  { id: 2, name: '全局代理', short: '全局', icon: 'globe' },
]
export const modeName = (m: number) => MODES.find(x => x.id === m)?.short ?? '未知'

async function get(url: string, timeout: number): Promise<LoonData> {
  const res = await fetch(url, { allowInsecureRequest: true, timeout })
  if (!res.ok) throw new Error(`Loon 返回 ${res.status}`)
  const j = await res.json() as LoonData
  if (!j || !Array.isArray(j.groups)) throw new Error('返回的不是 Loon 面板数据')
  j.nodes = j.nodes ?? {}
  return j
}

/** 读数据地址; 连不上就用上次的数据 (stale) */
export async function loadLoon(): Promise<{ data: LoonData | null; error: string }> {
  try {
    const data = await get(DATA_URL, 8)
    AppStorage.set(CACHE_KEY, JSON.stringify(data))
    return { data, error: '' }
  } catch (e) {
    const raw = AppStorage.get<string>(CACHE_KEY)
    const error = `读不到 Loon 数据: ${(e as Error).message}`
    return { data: raw ? { ...JSON.parse(raw) as LoonData, stale: true } : null, error }
  }
}

export const cachedLoon = (): LoonData | null => {
  const raw = AppStorage.get<string>(CACHE_KEY)
  return raw ? { ...JSON.parse(raw) as LoonData, stale: true } : null
}

/** 操作地址: 切模式 / 切节点 / 不带参数 = 复测当前节点; 返回最新状态 */
export async function setLoon(q: { mode?: number; group?: string; node?: string; lock?: number; quiet?: number }, timeout = 25): Promise<LoonData> {
  const qs = Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
  const data = await get(qs ? `${SET_URL}?${qs}` : SET_URL, timeout)
  AppStorage.set(CACHE_KEY, JSON.stringify(data))
  if (data.result && !data.result.ok) throw new Error(data.result.error || '操作失败')
  return data
}

/** 深度检测: 脚本最多跑 90 秒; speed 同时测速 (耗流量) */
export async function deepCheck(node: string, speed: boolean): Promise<LoonData> {
  const data = await get(`${DEEP_URL}?node=${encodeURIComponent(node)}${speed ? '&speed=1' : ''}`, 95)
  AppStorage.set(CACHE_KEY, JSON.stringify(data))
  if (data.result && !data.result.ok) throw new Error(data.result.error || '检测失败')
  return data
}

/** 保存插件设置 (POST 正文, 密钥不进 URL); 只传要改的项, 空字符串 = 恢复默认 */
export async function setOpts(patch: OptsPatch): Promise<LoonData> {
  const res = await fetch(OPTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), allowInsecureRequest: true, timeout: 10 })
  if (!res.ok) throw new Error(`Loon 返回 ${res.status}`)
  const data = await res.json() as LoonData
  if (!data || !Array.isArray(data.groups)) throw new Error('插件版本太旧, 先更新 Loon 面板插件')
  data.nodes = data.nodes ?? {}
  AppStorage.set(CACHE_KEY, JSON.stringify(data))
  return data
}

export const clearLoonCache = () => AppStorage.remove(CACHE_KEY)

// ────────────────────────────────────────────────────────────
// 取值
// ────────────────────────────────────────────────────────────
/** 主策略组: 设置里选的, 没选用兜底策略, 再没有用第一个 */
export function mainGroup(d: LoonData, prefs: Prefs): Group | undefined {
  return d.groups.find(g => g.name === prefs.main) ?? d.groups.find(g => g.name === d.final) ?? d.groups[0]
}

/** 看板列的策略组: 设置里选的 (按选的顺序), 没选用前 4 个 */
export function shownGroups(d: LoonData, prefs: Prefs): Group[] {
  const picked = prefs.groups.map(n => d.groups.find(g => g.name === n)).filter((g): g is Group => !!g)
  return picked.length ? picked : d.groups.slice(0, 4)
}

/** 页码绕回: 往前翻会变成负数 */
const wrap = (n: number, size: number) => ((n % size) + size) % size

/** 小组件翻页: 设了常用就只翻常用的, 没设就翻全部; 页码存 Storage, 翻到头回第一页 */
export function groupPage(d: LoonData, prefs: Prefs, size: number): { list: Group[]; page: number; pages: number } {
  const first = shownGroups(d, prefs)
  const all = prefs.groups.length ? first : d.groups
  const pages = Math.max(1, Math.ceil(all.length / size))
  const page = wrap(AppStorage.get<number>(PAGE_KEY) ?? 0, pages)
  return { list: all.slice(page * size, (page + 1) * size), page, pages }
}

export const turnGroupPage = (step: number) => AppStorage.set(PAGE_KEY, (AppStorage.get<number>(PAGE_KEY) ?? 0) + step)

/** 切换器: 在常用策略组里选一个组 (g), 显示它的节点 (p 是节点页码); path 是点进去的下层策略组
 *  open: 在策略组卡片、看板、总览上点了哪个组, 这个尺寸的小组件临时变成切换器, 5 分钟后失效 */
type Pick = { g: number; p: number; path?: string[]; open?: string; owner?: string; t?: number }
const readPick = (): Pick => AppStorage.get<Pick>(PICK_KEY) ?? { g: 0, p: 0 }
export type Hop = { group: string; node: string }

export const focusOf = (owner: string) => {
  const x = readPick()
  return x.open && x.owner === owner && Date.now() - (x.t ?? 0) < 300_000 ? x.open : ''
}
export const openPick = (open: string, owner: string) => AppStorage.set(PICK_KEY, { ...readPick(), p: 0, path: [], open, owner, t: Date.now() })
export const closePick = () => {
  const x = readPick()
  if (x.open) AppStorage.set(PICK_KEY, { g: x.g, p: 0 })
}

/** 从 root 一层层走到 node 要切的每一步; 走不到返回 null */
export function pathTo(d: LoonData, root: string, node: string, seen = new Set<string>()): Hop[] | null {
  const g = d.groups.find(x => x.name === root)
  if (!g || seen.has(root)) return null
  seen.add(root)
  if (g.subs.includes(node)) return [{ group: root, node }]
  for (const n of g.subs) {
    const rest = pathTo(d, n, node, seen)
    if (rest) return [{ group: root, node: n }, ...rest]
  }
  return null
}

export function pickerView(d: LoonData, prefs: Prefs, size: number, open = ''): { group?: Group; via: Hop[]; nodes: string[]; page: number; pages: number; groups: number } {
  const groups = shownGroups(d, prefs).filter(g => g.subs.length)
  const opened = d.groups.find(g => g.name === open)
  if (!groups.length && !opened) return { via: [], nodes: [], page: 0, pages: 1, groups: 0 }
  const pick = readPick()
  let group = opened ?? groups[pick.g % groups.length]
  const via: Hop[] = []
  for (const name of pick.path ?? []) {   // 配置变了路径走不通就停在能到的这一层
    const next = d.groups.find(x => x.name === name)
    if (!next || !group.subs.includes(name)) break
    via.push({ group: group.name, node: name })
    group = next
  }
  const all = group.subs.filter(n => !/^REJECT/i.test(n))
  const pages = Math.max(1, Math.ceil(all.length / size))
  const page = wrap(pick.p, pages)
  return { group, via, nodes: all.slice(page * size, (page + 1) * size), page, pages, groups: groups.length }
}

export const nextPickGroup = () => { const x = readPick(); AppStorage.set(PICK_KEY, { g: x.g + 1, p: 0 }) }
export const enterPick = (name: string) => { const x = readPick(); AppStorage.set(PICK_KEY, { ...x, p: 0, path: [...(x.path ?? []), name] }) }
export const leavePick = () => { const x = readPick(); AppStorage.set(PICK_KEY, { ...x, p: 0, path: (x.path ?? []).slice(0, -1) }) }
export const turnPickPage = (step: number) => { const x = readPick(); AppStorage.set(PICK_KEY, { ...x, p: x.p + step }) }

/** 点策略组那一行切到哪: 体检过且能用的里最快的 (不含当前), 都没测过就切到下一个; 不切到 DIRECT / REJECT
 *  选项可能是另一个策略组, 看它正在用的节点; 和当前同一个节点的不算, 切过去没有变化 */
export function switchTarget(d: LoonData, g: Group): string | undefined {
  const list = g.subs.filter(n => !/^(DIRECT|REJECT)/i.test(n))
  const leaf = (n: string) => d.groups.find(x => x.name === n)?.leaf ?? n
  const ms = (n: string) => d.nodes[leaf(n)].ms
  const alive = list.filter(n => n !== g.now && leaf(n) !== g.leaf && d.nodes[leaf(n)]?.ok).sort((a, b) => ms(a) - ms(b))
  if (alive.length) return alive[0]
  const others = list.filter(n => n !== g.now)
  return others.length ? list[(list.indexOf(g.now) + 1) % list.length] : undefined
}

/** 真正选中当前节点的那个策略组: 主策略组常常只是指向别的策略组 */
export const ownerGroup = (d: LoonData, g: Group) => d.groups.find(x => x.now === g.leaf) ?? g

/** 体检过的节点, 当前在用的排前面, 其余能用的按延迟、不能用的放最后 */
export function rankedNodes(d: LoonData): { name: string; r: NodeResult; current: boolean }[] {
  const current = new Set(d.groups.map(g => g.leaf))
  return Object.entries(d.nodes)
    .map(([name, r]) => ({ name, r, current: current.has(name) }))
    .sort((a, b) => Number(b.current) - Number(a.current) || Number(b.r.ok) - Number(a.r.ok) || a.r.ms - b.r.ms)
}

/** 24 次体检里成功的比例 (0-1), 没有历史时 null */
export function availability(r?: NodeResult): number | null {
  const h = r?.h
  return h && h.length ? h.filter(x => x >= 0).length / h.length : null
}

/** 小组件上显示这几个; 检测结果里更多的服务在 App 里看 */
const UNLOCK_NAMES = ['Netflix', 'YouTube', 'Disney+', 'ChatGPT', 'Claude', 'Gemini']

/** 解锁样式看的节点: 设置里选的策略组, 没选用主策略组 */
export function unlockNode(d: LoonData, prefs: Prefs): { group: string; node: string; list: Media[]; t: number } | undefined {
  const g = d.groups.find(x => x.name === prefs.unlock) ?? mainGroup(d, prefs)
  if (!g) return undefined
  const m = d.media?.[g.leaf]
  const list = UNLOCK_NAMES.map(n => m?.list.find(x => x.name === n)).filter((x): x is Media => !!x)
  return { group: g.name, node: g.leaf, list, t: m?.t ?? 0 }
}

/** 最近一次深度检测: 优先主策略组当前节点, 否则取最新的一份 */
export function latestDeep(d: LoonData, prefs: Prefs): { node: string; data: Deep } | undefined {
  const leaf = mainGroup(d, prefs)?.leaf
  const all = Object.entries(d.deep ?? {})
  const hit = all.find(([n]) => n === leaf) ?? all.sort((a, b) => b[1].t - a[1].t)[0]
  return hit ? { node: hit[0], data: hit[1] } : undefined
}

/** 有 IPv4 地址的 utun 接口 = 有 VPN 在跑; 分不出是不是 Loon */
export function vpnRunning(): boolean {
  const all = Device.networkInterfaces()
  return Object.keys(all).some(k => /^utun/.test(k) && all[k].some((a: { family: string }) => a.family === 'IPv4'))
}

export function loonStatus(d: LoonData | null): { text: string; level: 'ok' | 'warn' | 'bad' } {
  if (d && !d.stale) return { text: 'Loon 运行中', level: 'ok' }
  return vpnRunning() ? { text: 'VPN 已开, 插件没响应', level: 'warn' } : { text: 'Loon 未开启', level: 'bad' }
}

export function healthCount(d: LoonData): { ok: number; total: number } {
  const list = Object.values(d.nodes)
  return { ok: list.filter(r => r.ok).length, total: list.length }
}

// ────────────────────────────────────────────────────────────
// 示例数据
// ────────────────────────────────────────────────────────────
export function sampleLoon(): LoonData {
  const t = Date.now() - 6 * 60_000
  const wave = (base: number, seed: number, drops = 0) => Array.from({ length: 24 }, (_, i) => (i >= 24 - drops ? -1 : Math.round(base * (0.85 + 0.3 * Math.abs(Math.sin(i * 0.7 + seed))))))
  const n = (ms: number, ip: string, cc: string, asn: string, org: string, h: number[]): NodeResult => ({ ok: ms > 0, ms, t, ip, cc, asn, org, h, fail: ms > 0 ? 0 : 3, err: ms > 0 ? undefined : '超时' })
  const media = (bad: string[]): Media[] => ['Netflix', 'YouTube', 'Disney+', 'ChatGPT', 'Claude', 'Gemini'].map(name => ({ name, status: bad.includes(name) ? 'no' : 'yes', region: bad.includes(name) ? undefined : 'HK' }))
  const hk = '🇭🇰 香港 IEPL 01'
  return {
    v: 1, version: '0.2.0', t: Date.now(), mode: 1, final: '兜底', global: '节点选择', mock: true,
    groups: [
      { name: '节点选择', now: '香港', leaf: hk, subs: ['香港', '🇯🇵 日本 东京', '🇺🇸 美国 洛杉矶', 'DIRECT'] },
      { name: '香港', now: hk, leaf: hk, subs: [hk, '🇭🇰 香港 IEPL 02', '🇭🇰 香港 HKT'] },
      { name: '流媒体', now: '🇸🇬 新加坡 01', leaf: '🇸🇬 新加坡 01', subs: ['🇸🇬 新加坡 01', '🇺🇸 美国 洛杉矶', '🇯🇵 日本 东京'] },
      { name: 'AI', now: '🇺🇸 美国 洛杉矶', leaf: '🇺🇸 美国 洛杉矶', subs: ['🇺🇸 美国 洛杉矶', '🇯🇵 日本 东京'] },
      { name: '兜底', now: '节点选择', leaf: hk, subs: ['节点选择', 'DIRECT'] },
    ],
    nodes: {
      [hk]: n(68, '103.151.172.18', 'HK', '4760', 'HKT Limited', wave(68, 1)),
      '🇭🇰 香港 IEPL 02': n(74, '103.151.172.44', 'HK', '4760', 'HKT Limited', wave(74, 2)),
      '🇭🇰 香港 HKT': n(0, '', '', '', '', wave(90, 3, 5)),
      '🇸🇬 新加坡 01': n(132, '154.26.133.9', 'SG', '141995', 'Contabo Asia', wave(132, 4)),
      '🇺🇸 美国 洛杉矶': n(196, '23.95.40.122', 'US', '36352', 'HostPapa', wave(196, 5, 1)),
      '🇯🇵 日本 东京': n(486, '45.76.211.7', 'JP', '20473', 'Vultr Holdings', wave(486, 6)),
    },
    check: { t, took: 14_200, tested: 6, total: 6 },
    direct: { ip: '123.118.8.8', cc: 'CN', asn: '4808', org: '北京联通' },
    media: { [hk]: { t, list: media(['Disney+', 'Claude']) }, '🇸🇬 新加坡 01': { t, list: media(['Claude']) } },
    locks: { 节点选择: '香港' },
    events: [
      { t: t - 20 * 60_000, k: 'switch', msg: '香港 HKT 连续 3 次超时，香港 已切到 香港 IEPL 01（68ms）' },
      { t: t - 150 * 60_000, k: 'net', msg: '网络切换，复测 4 个节点，全部正常' },
      { t: t - 300 * 60_000, k: 'lock', msg: '节点选择 被还原，已改回 香港' },
      { t: t - 720 * 60_000, k: 'net', msg: '网络切换，复测 4 个节点，全部正常' },
    ],
    deep: {
      [hk]: {
        t,
        basic: { ip: '103.151.172.18', cc: 'HK', country: '香港', city: 'Hong Kong', asn: '4760', org: 'HKT Limited' },
        types: [{ source: 'ipinfo', type: 'isp' }, { source: 'ipregistry', type: 'isp' }],
        scores: [{ source: 'scamalytics', score: 12, text: '低' }, { source: 'ipapi', score: 0, text: '低' }],
        factors: [{ source: 'ipapi', proxy: false, vpn: false, tor: false, hosting: false }, { source: 'ipregistry', proxy: true, vpn: false, tor: false, hosting: false }],
        media: media(['Disney+', 'Claude']),
        regions: { exit: 'HK', mismatch: [] },
        stability: [{ target: 'cloudflare', ok: 3, total: 3, median: 180, max: 240 }, { target: 'google', ok: 3, total: 3, median: 210, max: 260 }],
        ping: [{ isp: 'ct', avg: 45, loss: 0, jitter: 3 }, { isp: 'cu', avg: 38, loss: 0, jitter: 2 }, { isp: 'cm', avg: 62, loss: 1, jitter: 6 }],
        inbound: [{ isp: 'ct', hops: 14, asPath: ['4134', '4809', '4760'], summary: '经 AS4809' }, { isp: 'cu', hops: 12, asPath: ['4837', '4760'], summary: '直连' }, { isp: 'cm', hops: 15, asPath: ['9808', '58453', '4760'], summary: '经 AS58453' }],
        backhaul: [{ isp: 'ct', probe: 'AS4760 Hong Kong', hops: 12, asPath: ['4760', '4809', '4134'], summary: '经 AS4809' }],
        dnsbl: { checked: 6, listed: [] },
        dnsleak: { servers: [{ ip: '8.8.8.8', cc: 'US', org: 'Google' }] },
        speed: { down: 86.4, bytes: 16_777_216, conns: 4 },
        bgp: { prefix: '103.151.172.0/24', rpki: 'valid', holder: 'HKT' },
      },
    },
    opts: { notify: true, auto: false, net: true, timeout: 5000, test_url: 'http://www.gstatic.com/generate_204', ip_url: 'https://api.ipify.org', push: false, full: [] },
  }
}
