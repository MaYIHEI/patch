// cmcc / api.ts
// 中国移动账号数据查询
//
// 职责:
// - 从 BoxJS 导入登录凭证 (一次性), 存进 Keychain
// - 每次刷新: 用凭证续登拿新会话 → 查话费 / 流量 / 积分
// - 5 分钟内复用缓存, 网络故障降级到缓存
// - 错误分类: no_cred / auth / network / schema

import { fetch } from 'scripting'
import { md5hex, encB64, decStr, nonce8 } from './crypto'

// DOM 的 Storage class 类型与 Scripting 全局 Storage 冲突，手动 cast
const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

// ────────────────────────────────────────────────────────────
// 配置常量
// ────────────────────────────────────────────────────────────
const KEYCHAIN_LOGIN = 'cmcc.login'   // 登录信封 (查询信封由它合成)

// 与 paperclip 签到脚本的 BoxJS 键一致
const BOXJS_LOGIN = 'cmcc_login'

const CACHE_KEY = 'cmcc.last_response'
const CACHE_TTL_MS = 5 * 60 * 1000   // 5 分钟内复用缓存
const STALE_OK_MS = 30 * 60 * 1000   // 30 分钟内网络故障可降级到缓存

const HOST_LOGIN = 'client.app.coc.10086.cn'
const HOST_BIZ = 'clientaccess.10086.cn'
const P_LOGIN = '/biz-orange/LN/uamrandcodelogin/autoLogin'
const P_FEE = '/biz-orange/BN/payFeesQuery/getPayFeesQueryInfo'
const P_REMAIN = '/biz-orange/BH/newPlanRemainQry/getNewPlanRemainQry'
const P_POINTS = '/biz-orange/BN/scoreQueryService/getScoreQuery'
const P_USER = '/biz-orange/BN/userInformationService/getUserInformation'
const UA = 'ChinaMobile/12.5.5 (iPhone; iOS 26.1; Scale/3.00)'
const SALT = 'Leadeon/SecurityOrganization'
const LK = 'tVkdaRWRY0ZkV1Vr', LSK = 'RYV0hCV1lV25KYVJ', LIV = 'VjFSQ1ZtVkQxRTlQ'
const BK = 'bAIgvwAuA4tbDr9d', BSK = 'GS7VelkJl5IT1uwQ', BIV = '9791027341711819'

// ────────────────────────────────────────────────────────────
// 对外类型
// ────────────────────────────────────────────────────────────
export type FlowPart = {
  /** 单位 MB */
  totalMB: number
  usedMB: number
  remainMB: number
}

export type UserInfo = {
  /** 品牌, 如 "动感地带" */
  brand?: string
  /** 星级, 如 1 */
  starLevel?: number
  /** 星级积分 */
  starScore?: number
  /** 归属, 如 "北京移动" */
  channel?: string
  /** 网龄, 如 "3年2个月" */
  netAge?: string
}

export type Account = {
  /** 话费余额, 元 */
  balance: number
  /** 本月消费, 元 */
  monthFee?: number
  /** 通用流量 */
  general?: FlowPart
  /** 定向流量 */
  targeted?: FlowPart
  points?: number
  user?: UserInfo
  /** 尾号 4 位 */
  phoneTail: string
  stale: boolean
  fetchedAt: number
}

export type ErrorKind = 'no_cred' | 'auth' | 'network' | 'schema'

export class CmccError extends Error {
  kind: ErrorKind
  constructor(kind: ErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'CmccError'
  }
}

// ────────────────────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────────────────────
export async function loadAccount(): Promise<Account> {
  const login = Keychain.get(KEYCHAIN_LOGIN)
  if (!login) throw new CmccError('no_cred', '未导入登录凭证')
  const query = queryFromLogin(login)

  const cached = readCache()
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { ...cached, stale: false }

  try {
    const cookie = await renewSession(login)
    // 话费 / 流量必需; 积分 / 用户信息失败不影响主流程
    const [fee, remain, points, user] = await Promise.all([
      bizCall(P_FEE, query, cookie),
      bizCall(P_REMAIN, query, cookie),
      bizCall(P_POINTS, query, cookie).catch(() => null),
      bizCall(P_USER, query, cookie).catch(() => null),
    ])
    const account = buildAccount(fee, remain, points, user, query)
    writeCache(account)
    return account
  } catch (err) {
    if (cached && Date.now() - cached.fetchedAt < STALE_OK_MS) return { ...cached, stale: true }
    throw err
  }
}

// ────────────────────────────────────────────────────────────
// 网络层
// ────────────────────────────────────────────────────────────
type Rsp = { retCode?: string; retDesc?: string; rspBody?: any }

function signedHeaders(host: string, path: string, J: string, sid: string, qen: string): Record<string, string> {
  const t = String(Date.now()), n = nonce8()
  const xk = JSON.parse(J).xk || ''
  const xtoken = encB64(xk + '_' + path + '_' + t + '_' + n, BK, BIV)
  return {
    'Content-Type': 'application/Json',
    'User-Agent': UA,
    'x-qen': qen,
    'x-time': t,
    'x-nonce': n,
    'xs': md5hex('https://' + host + path + '_' + J + '_' + SALT),
    'x-token': xtoken,
    'x-sign': md5hex(xtoken + '_' + t + '_' + n + '_' + sid),
  }
}

async function post(url: string, headers: Record<string, string>, body: string): Promise<Response> {
  try {
    return await fetch(url, { method: 'POST', headers, body })
  } catch (e) {
    throw new CmccError('network', `fetch failed: ${(e as Error).message}`)
  }
}

function parseRsp(text: string, key: string, iv: string): Rsp {
  try {
    return JSON.parse(decStr(text, key, iv)) as Rsp
  } catch {
    throw new CmccError('schema', 'response not decodable')
  }
}

/** 静默续登, 返回会话 cookie (JSESSIONID / UID / ticketID) */
async function renewSession(J: string): Promise<string> {
  const res = await post('https://' + HOST_LOGIN + P_LOGIN, signedHeaders(HOST_LOGIN, P_LOGIN, J, 'null', '14'), encB64(J, LK, LIV))
  if (!res.ok) throw new CmccError('network', `HTTP ${res.status}`)
  const out = parseRsp(await res.text(), LSK, LIV)
  console.log('[cmcc login]', out.retCode, out.retDesc)
  if (out.retCode !== '000000') throw new CmccError('auth', `${out.retDesc ?? ''} [${out.retCode}]`)

  // 服务端把三个 cookie 合在一个 Set-Cookie 头里, 按名字逐个取
  const raw = res.headers.get('set-cookie') ?? ''
  const cookie = ['JSESSIONID', 'UID', 'ticketID']
    .map(name => {
      const v = raw.match(new RegExp(name + '=([^;,\\s]+)'))?.[1]
      return v ? `${name}=${v}` : ''
    })
    .filter(Boolean)
    .join('; ')
  if (!cookie.includes('JSESSIONID')) throw new CmccError('schema', 'login returned no session')
  return cookie
}

// 所有查询共用一份信封: 登录信封的顶层字段 + reqBody {cellNum}
function queryFromLogin(login: string): string {
  const lo = JSON.parse(login)
  return JSON.stringify({ ...lo, reqBody: { cellNum: lo.tel } })
}

async function bizCall(path: string, J: string, cookie: string): Promise<any> {
  const sid = cookie.match(/JSESSIONID=([^;]+)/)?.[1] ?? ''
  const headers = { ...signedHeaders(HOST_BIZ, path, J, sid, '2'), 'Cookie': cookie }
  const res = await post('https://' + HOST_BIZ + path, headers, encB64(J, BK, BIV))
  if (!res.ok) throw new CmccError('network', `HTTP ${res.status}`)
  const out = parseRsp(await res.text(), BSK, BIV)
  console.log('[cmcc biz]', path.split('/').pop(), out.retCode, out.retDesc)
  if (out.retCode === '410000') throw new CmccError('auth', '会话失效')
  if (out.retCode !== '000000' || !out.rspBody) throw new CmccError('schema', `${out.retDesc ?? ''} [${out.retCode}]`)
  return out.rspBody
}

// ────────────────────────────────────────────────────────────
// 解析层
// ────────────────────────────────────────────────────────────
// unit: "03" = MB, "04" = GB
function toMB(v: string | undefined, unit: string | undefined): number {
  const n = parseFloat(v ?? '0') || 0
  return unit === '04' ? n * 1024 : n
}

/** 185935 → "181.6G", 512 → "512M" */
export function formatFlow(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 100 * 1024 ? 0 : 1)}G`
  return `${Math.round(mb)}M`
}

// 品牌码: "03" 已对照套餐名确认, 其余按中国移动通用编码
const BRANDS: Record<string, string> = { '01': '全球通', '02': '神州行', '03': '动感地带' }

function num(v: unknown): number | undefined {
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? undefined : n
}

function buildAccount(fee: any, remain: any, points: any, user: any, query: string): Account {
  const balance = parseFloat(fee?.balance)
  if (Number.isNaN(balance)) throw new CmccError('schema', 'missing balance')

  // flowtype "0" = 通用, "1" = 定向
  const flows: any[] = remain?.newPlanRemainQryRes?.planRemianFlowListRes?.planRemianFlowRes ?? []
  const part = (type: string): FlowPart | undefined => {
    const f = flows.find(x => x.flowtype === type)
    if (!f) return undefined
    return {
      totalMB: toMB(f.flowSumNum, f.unit),
      usedMB: toMB(f.flowUsdNum, f.unit),
      remainMB: toMB(f.flowRemainNum, f.unit),
    }
  }

  const tel = String(JSON.parse(query).tel ?? '')
  const u = user?.userInfo
  return {
    balance,
    monthFee: num(fee?.payAmount),
    general: part('0'),
    targeted: part('1'),
    points: num(points?.pointValue),
    user: u ? {
      brand: BRANDS[u.userBrand] ?? u.userBrand,
      starLevel: num(u.starLevel),
      starScore: num(u.starScore),
      channel: u.userChannel || undefined,
      netAge: u.userAge || undefined,
    } : undefined,
    phoneTail: tel.slice(-4),
    stale: false,
    fetchedAt: Date.now(),
  }
}

// ────────────────────────────────────────────────────────────
// 缓存层 — Storage (NSUserDefaults 底层, 不进 iCloud, 不同步)
// 只存查询结果, 不存凭证
// ────────────────────────────────────────────────────────────
function readCache(): Account | null {
  try {
    const s = AppStorage.get<string>(CACHE_KEY)
    return s ? JSON.parse(s) as Account : null
  } catch {
    return null
  }
}

function writeCache(account: Account): void {
  try {
    AppStorage.set(CACHE_KEY, JSON.stringify(account))
  } catch {
    // 缓存写失败不影响主流程
  }
}

// ────────────────────────────────────────────────────────────
// 配置写入 — 供配置脚本 (index.tsx) 调用
// ────────────────────────────────────────────────────────────
async function readBoxJS(host: string, key: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`https://${host}/query/data/${key}`)
  } catch (e) {
    throw new CmccError('network', `连不上 BoxJS (${host}), 确认 Loon 已开启: ${(e as Error).message}`)
  }
  if (!res.ok) throw new CmccError('network', `BoxJS HTTP ${res.status}`)
  const json = await res.json() as { val?: string }
  if (!json.val) throw new CmccError('no_cred', `BoxJS 里没有 ${key}, 先打开中国移动 App 让签到插件抓取`)
  return json.val
}

export async function importFromBoxJS(host: string): Promise<void> {
  const login = await readBoxJS(host, BOXJS_LOGIN)
  if (!JSON.parse(login).xk) throw new CmccError('schema', 'BoxJS 里的凭证格式不对')
  Keychain.set(KEYCHAIN_LOGIN, login)
  AppStorage.remove(CACHE_KEY)
}

export async function clearCredentials(): Promise<void> {
  Keychain.remove(KEYCHAIN_LOGIN)
  AppStorage.remove(CACHE_KEY)
}

export function clearCache(): void {
  AppStorage.remove(CACHE_KEY)
}

export async function hasCredentials(): Promise<boolean> {
  return Boolean(Keychain.get(KEYCHAIN_LOGIN))
}
