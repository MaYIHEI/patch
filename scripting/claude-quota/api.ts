// claude-quota / api.ts
// claude.ai usage API 客户端层
//
// 职责:
// - 从 Keychain 读 cookie / org_id
// - 调用 https://claude.ai/api/organizations/{id}/usage
// - 解析返回的 utilization / resets_at
// - 5 分钟内复用缓存, 网络故障降级到缓存
// - 错误分类: auth / network / schema / no_cookie

import { fetch } from 'scripting'

// DOM 的 Storage class 类型与 Scripting 全局 Storage 冲突，手动 cast
const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

// ────────────────────────────────────────────────────────────
// 配置常量
// ────────────────────────────────────────────────────────────
const KEYCHAIN_COOKIE = 'claude_quota.cookie'
const KEYCHAIN_ORG_ID = 'claude_quota.org_id'

const CACHE_KEY = 'claude_quota.last_response'
const CACHE_TTL_MS = 5 * 60 * 1000   // 5 分钟内复用缓存
const STALE_OK_MS = 30 * 60 * 1000   // 30 分钟内网络故障可降级到缓存

// ────────────────────────────────────────────────────────────
// 对外类型
// ────────────────────────────────────────────────────────────
export type QuotaSegment = {
  /** 0..100 */
  percent: number
  /** 距离 reset 的毫秒数 */
  resetsInMs: number
  /** reset 的绝对时间戳 (epoch ms) */
  resetsAt: number
}

export type OrgInfo = {
  /** 账号显示名 */
  name?: string
  /** 原始 plan 字符串, 如 "pro" / "max_5" / "max_20" / "free" */
  planTier?: string
}

export type Quota = {
  fiveHour: QuotaSegment
  sevenDay?: QuotaSegment
  sevenDayOpus?: QuotaSegment
  sevenDaySonnet?: QuotaSegment
  stale: boolean
  /** 最近一次真实拉取 API 的时间戳 (epoch ms) */
  fetchedAt: number
}

export type ErrorKind = 'auth' | 'network' | 'schema' | 'no_cookie'

export class QuotaError extends Error {
  kind: ErrorKind
  constructor(kind: ErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'QuotaError'
  }
}

// ────────────────────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────────────────────
export async function loadQuota(): Promise<Quota> {
  const cookie = Keychain.get(KEYCHAIN_COOKIE)
  const orgId = Keychain.get(KEYCHAIN_ORG_ID)

  if (!cookie || !orgId) {
    throw new QuotaError('no_cookie', 'cookie 或 org_id 未配置')
  }

  // 1) 看缓存, 5 分钟内直接复用
  const cached = readCache()
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return rebuildQuota(cached.payload, false, cached.fetchedAt)
  }

  // 2) 真实请求
  try {
    const now = Date.now()
    const payload = await fetchFromClaude(cookie, orgId)
    writeCache(payload)
    const quota = rebuildQuota(payload, false, now)
    recordSnapshot(quota)
    return quota
  } catch (err) {
    // 3) 网络挂了, 缓存还新鲜的话降级
    if (cached && Date.now() - cached.fetchedAt < STALE_OK_MS) {
      return rebuildQuota(cached.payload, true, cached.fetchedAt)
    }
    throw err
  }
}

// ────────────────────────────────────────────────────────────
// 网络层
// ────────────────────────────────────────────────────────────
type RawResponse = {
  // 字段名按 claude.ai 接口实际返回 (2026-05-28 确认)
  five_hour?: RawSegment
  seven_day?: RawSegment
  seven_day_opus?: RawSegment
  seven_day_sonnet?: RawSegment
  [k: string]: unknown
}

type RawSegment = {
  utilization?: number
  resets_at?: string
}

async function fetchFromClaude(
  cookie: string,
  orgId: string,
): Promise<RawResponse> {
  const url = `https://claude.ai/api/organizations/${orgId}/usage`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'cookie': cookie,
        // 与 claude.ai 网页 client 对齐, 减少异常检测
        'anthropic-client-platform': 'web_claude_ai',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/144.0.0.0 Safari/537.36',
      },
    })
  } catch (e) {
    throw new QuotaError('network', `fetch failed: ${(e as Error).message}`)
  }

  if (res.status === 401 || res.status === 403) {
    throw new QuotaError('auth', `HTTP ${res.status}`)
  }
  if (!res.ok) {
    throw new QuotaError('network', `HTTP ${res.status}`)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (e) {
    throw new QuotaError('schema', 'response not json')
  }

  console.log('[claude-quota raw]', Object.keys(json as object).join(','), '|', JSON.stringify(json).slice(0, 800))

  if (!json || typeof json !== 'object') {
    throw new QuotaError('schema', 'response not object')
  }
  const raw = json as RawResponse
  if (!raw.five_hour || typeof raw.five_hour.utilization !== 'number') {
    throw new QuotaError('schema', 'missing five_hour.utilization')
  }

  return raw
}

// ────────────────────────────────────────────────────────────
// 解析层 — raw → Quota
// ────────────────────────────────────────────────────────────
function rebuildQuota(raw: RawResponse, stale: boolean, fetchedAt: number): Quota {
  return {
    fiveHour: parseSegment(raw.five_hour!)!,
    sevenDay: parseSegment(raw.seven_day),
    sevenDayOpus: parseSegment(raw.seven_day_opus),
    sevenDaySonnet: parseSegment(raw.seven_day_sonnet),
    stale,
    fetchedAt,
  }
}

function parseSegment(seg?: RawSegment): QuotaSegment | undefined {
  if (!seg || typeof seg.utilization !== 'number') return undefined
  const resetsAt = seg.resets_at ? Date.parse(seg.resets_at) : Date.now()
  return {
    percent: seg.utilization,
    resetsInMs: resetsAt - Date.now(),
    resetsAt,
  }
}

// ────────────────────────────────────────────────────────────
// 缓存层 — Storage (NSUserDefaults 底层, 不进 iCloud, 不同步)
// ────────────────────────────────────────────────────────────
type Cached = {
  fetchedAt: number
  payload: RawResponse
}

function readCache(): Cached | null {
  try {
    const s = AppStorage.get<string>(CACHE_KEY)
    if (!s) return null
    return JSON.parse(s) as Cached
  } catch {
    return null
  }
}

function writeCache(payload: RawResponse): void {
  try {
    AppStorage.set(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), payload }),
    )
  } catch {
    // 缓存写失败不影响主流程
  }
}

// ────────────────────────────────────────────────────────────
// 配置写入 — 供"配置脚本"调用 (见 setup.ts)
// ────────────────────────────────────────────────────────────
export async function saveCredentials(
  cookie: string,
  orgId: string,
): Promise<void> {
  Keychain.set(KEYCHAIN_COOKIE, cookie)
  Keychain.set(KEYCHAIN_ORG_ID, orgId)
  // 写新 cookie 后立刻失效旧缓存
  AppStorage.remove(CACHE_KEY)
}

export async function clearCredentials(): Promise<void> {
  Keychain.remove(KEYCHAIN_COOKIE)
  Keychain.remove(KEYCHAIN_ORG_ID)
  AppStorage.remove(CACHE_KEY)
}

export function clearCache(): void {
  AppStorage.remove(CACHE_KEY)
}

// ────────────────────────────────────────────────────────────
// 历史快照 — 每次刷新写一条, 供图表使用
// 按自然日聚合: 每天只保留当天最高值
// 保留最近 8 天 (多一天防止跨 reset 时出现空白)
// ────────────────────────────────────────────────────────────
const HISTORY_KEY = 'claude_quota.history'

export type DailySnapshot = {
  /** YYYY-MM-DD (本地时区) */
  date: string
  fiveHourMax: number
  sevenDayMax: number
}

export function recordSnapshot(quota: { fiveHour: { percent: number }; sevenDay?: { percent: number } }): void {
  const today = localDateStr(new Date())
  let history = readHistory()

  const existing = history.find(d => d.date === today)
  if (existing) {
    existing.fiveHourMax = Math.max(existing.fiveHourMax, quota.fiveHour.percent)
    existing.sevenDayMax = Math.max(existing.sevenDayMax, quota.sevenDay?.percent ?? 0)
  } else {
    history.push({
      date: today,
      fiveHourMax: quota.fiveHour.percent,
      sevenDayMax: quota.sevenDay?.percent ?? 0,
    })
  }

  // 只保留最近 8 天
  history = history.sort((a, b) => a.date < b.date ? -1 : 1).slice(-8)

  try {
    AppStorage.set(HISTORY_KEY, JSON.stringify(history))
  } catch { /* ignore */ }
}

export function readHistory(): DailySnapshot[] {
  try {
    const s = AppStorage.get<string>(HISTORY_KEY)
    if (!s) return []
    return JSON.parse(s) as DailySnapshot[]
  } catch {
    return []
  }
}

function localDateStr(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ────────────────────────────────────────────────────────────
// 最近使用模型 — GET /api/organizations/{id}/chat_conversations
// 取最新一条对话的 model 字段，失败静默返回 null
// 缓存 5 分钟（和配额同频）
// ────────────────────────────────────────────────────────────
const MODEL_CACHE_KEY = 'claude_quota.recent_model'
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000  // 5 分钟

export async function loadRecentModel(): Promise<string | null> {
  const cookie = Keychain.get(KEYCHAIN_COOKIE)
  const orgId  = Keychain.get(KEYCHAIN_ORG_ID)
  if (!cookie || !orgId) return null

  try {
    const cached = AppStorage.get<string>(MODEL_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as { fetchedAt: number; model: string }
      if (Date.now() - parsed.fetchedAt < MODEL_CACHE_TTL_MS) return parsed.model
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(
      `https://claude.ai/api/organizations/${orgId}/chat_conversations?limit=5`,
      {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'cookie': cookie,
          'anthropic-client-platform': 'web_claude_ai',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      },
    )
    if (!res.ok) {
      console.log('[claude-quota model] HTTP', res.status)
      return null
    }
    const json = await res.json()
    // 打印前 800 字符, 方便看结构
    console.log('[claude-quota model raw]', JSON.stringify(json).slice(0, 800))

    // 尝试从各种可能的结构中提取 model
    const model = extractModel(json)
    if (model) {
      AppStorage.set(MODEL_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), model }))
    }
    return model
  } catch (e) {
    console.log('[claude-quota model] error:', String(e))
    return null
  }
}

function extractModel(json: unknown): string | null {
  // 可能的结构:
  // Array of conversations: [{ model: "...", ... }, ...]
  // Object with conversations: { conversations: [...] } / { data: [...] }
  let convs: unknown[] = []

  if (Array.isArray(json)) {
    convs = json
  } else if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    if (Array.isArray(obj.conversations))       convs = obj.conversations
    else if (Array.isArray(obj.data))           convs = obj.data
    else if (Array.isArray(obj.results))        convs = obj.results
  }

  for (const conv of convs) {
    if (!conv || typeof conv !== 'object') continue
    const c = conv as Record<string, unknown>
    // 可能的字段名: model / model_id / model_name / settings.model
    const raw =
      typeof c.model      === 'string' ? c.model :
      typeof c.model_id   === 'string' ? c.model_id :
      typeof c.model_name === 'string' ? c.model_name :
      (c.settings && typeof (c.settings as Record<string,unknown>).model === 'string')
        ? (c.settings as Record<string,unknown>).model as string
        : null

    if (raw) return shortModelName(raw)
  }
  return null
}

// "claude-opus-4-7-20250514" → "Opus 4.7"
// "claude-sonnet-4-5"        → "Sonnet 4.5"
// "claude-haiku-4-5"         → "Haiku 4.5"
function shortModelName(raw: string): string {
  const s = raw.toLowerCase()
  const ver = s.match(/[\d]+\.[\d]+|[\d]+-[\d]+/)?.[0]?.replace('-', '.') ?? ''
  if (s.includes('opus'))   return ver ? `Opus ${ver}`   : 'Opus'
  if (s.includes('sonnet')) return ver ? `Sonnet ${ver}` : 'Sonnet'
  if (s.includes('haiku'))  return ver ? `Haiku ${ver}`  : 'Haiku'
  // 兜底: 截取前 20 字符
  return raw.slice(0, 20)
}

// ────────────────────────────────────────────────────────────
// 账号信息 — GET /api/organizations/{id}
// 目的是拿真实 plan_tier 字符串 (pro / max_5 / max_20 / free…)
// 失败时静默返回 null, 不影响主流程
// ────────────────────────────────────────────────────────────
const ORG_CACHE_KEY = 'claude_quota.org_info'
const ORG_CACHE_TTL_MS = 60 * 60 * 1000  // 1 小时缓存

export async function loadOrgInfo(): Promise<OrgInfo | null> {
  const cookie = Keychain.get(KEYCHAIN_COOKIE)
  const orgId  = Keychain.get(KEYCHAIN_ORG_ID)
  if (!cookie || !orgId) return null

  try {
    const cached = AppStorage.get<string>(ORG_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as { fetchedAt: number; data: OrgInfo }
      if (Date.now() - parsed.fetchedAt < ORG_CACHE_TTL_MS) return parsed.data
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(`https://claude.ai/api/organizations/${orgId}`, {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'cookie': cookie,
        'anthropic-client-platform': 'web_claude_ai',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    console.log('[claude-quota org full]', JSON.stringify(json))

    const info: OrgInfo = {
      name: typeof json.name === 'string' ? json.name : undefined,
      planTier: typeof json.plan_tier === 'string' ? json.plan_tier : undefined,
    }
    AppStorage.set(ORG_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data: info }))
    return info
  } catch {
    return null
  }
}

export async function hasCredentials(): Promise<boolean> {
  const c = Keychain.get(KEYCHAIN_COOKIE)
  const o = Keychain.get(KEYCHAIN_ORG_ID)
  return Boolean(c && o)
}
