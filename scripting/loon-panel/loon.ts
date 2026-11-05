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
const CACHE_KEY = 'loonpanel.loon'

export type NodeResult = { ok: boolean; ms: number; t: number; ip?: string; cc?: string; asn?: string; org?: string; err?: string }
export type Group = { name: string; now: string; leaf: string; subs: string[] }
export type LoonData = {
  v: number
  t: number
  mode: number                 // 0 全局直连 / 1 分流 / 2 全局代理 / -1 未知
  final: string
  global: string
  groups: Group[]
  nodes: Record<string, NodeResult>
  check: { t: number; took: number; tested: number; total: number } | null
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
export async function setLoon(q: { mode?: number; group?: string; node?: string }, timeout = 25): Promise<LoonData> {
  const qs = Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
  const data = await get(qs ? `${SET_URL}?${qs}` : SET_URL, timeout)
  AppStorage.set(CACHE_KEY, JSON.stringify(data))
  if (data.result && !data.result.ok) throw new Error(data.result.error || '操作失败')
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

/** 点策略组那一行切到哪: 体检过且能用的里最快的 (不含当前), 都没测过就切到下一个 */
export function switchTarget(d: LoonData, g: Group): string | undefined {
  const alive = g.subs.filter(n => n !== g.now && d.nodes[n]?.ok).sort((a, b) => d.nodes[a].ms - d.nodes[b].ms)
  if (alive.length) return alive[0]
  if (g.subs.length < 2) return undefined
  return g.subs[(g.subs.indexOf(g.now) + 1) % g.subs.length]
}

/** 体检过的节点, 当前在用的排前面, 其余能用的按延迟、不能用的放最后 */
export function rankedNodes(d: LoonData): { name: string; r: NodeResult; current: boolean }[] {
  const current = new Set(d.groups.map(g => g.leaf))
  return Object.entries(d.nodes)
    .map(([name, r]) => ({ name, r, current: current.has(name) }))
    .sort((a, b) => Number(b.current) - Number(a.current) || Number(b.r.ok) - Number(a.r.ok) || a.r.ms - b.r.ms)
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
  const n = (ms: number, ip: string, cc: string, asn: string, org: string): NodeResult => ({ ok: ms > 0, ms, t, ip, cc, asn, org, err: ms > 0 ? undefined : '超时' })
  return {
    v: 1, t: Date.now(), mode: 1, final: '兜底', global: '节点选择', mock: true,
    groups: [
      { name: '节点选择', now: '香港', leaf: '🇭🇰 香港 IEPL 01', subs: ['香港', '日本', '美国', 'DIRECT'] },
      { name: '香港', now: '🇭🇰 香港 IEPL 01', leaf: '🇭🇰 香港 IEPL 01', subs: ['🇭🇰 香港 IEPL 01', '🇭🇰 香港 IEPL 02', '🇭🇰 香港 HKT'] },
      { name: '流媒体', now: '🇸🇬 新加坡 01', leaf: '🇸🇬 新加坡 01', subs: ['🇸🇬 新加坡 01', '🇺🇸 美国 洛杉矶', '🇯🇵 日本 东京'] },
      { name: 'AI', now: '🇺🇸 美国 洛杉矶', leaf: '🇺🇸 美国 洛杉矶', subs: ['🇺🇸 美国 洛杉矶', '🇯🇵 日本 东京'] },
      { name: '兜底', now: '节点选择', leaf: '🇭🇰 香港 IEPL 01', subs: ['节点选择', 'DIRECT'] },
    ],
    nodes: {
      '🇭🇰 香港 IEPL 01': n(68, '103.151.172.18', 'HK', '4760', 'HKT Limited'),
      '🇭🇰 香港 IEPL 02': n(74, '103.151.172.44', 'HK', '4760', 'HKT Limited'),
      '🇭🇰 香港 HKT': n(0, '', '', '', ''),
      '🇸🇬 新加坡 01': n(132, '154.26.133.9', 'SG', '141995', 'Contabo Asia'),
      '🇺🇸 美国 洛杉矶': n(196, '23.95.40.122', 'US', '36352', 'HostPapa'),
      '🇯🇵 日本 东京': n(486, '45.76.211.7', 'JP', '20473', 'Vultr Holdings'),
    },
    check: { t, took: 14_200, tested: 6, total: 6 },
  }
}
