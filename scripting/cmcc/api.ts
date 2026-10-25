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
// 多账号: 按手机号分开存, 小组件参数填尾号选账号
const KEYCHAIN_ACCOUNTS = 'cmcc.accounts'   // 已导入的手机号列表 (JSON)
const KEYCHAIN_LOGIN = 'cmcc.login.'        // + 手机号: 登录信封 (查询信封由它合成)
const KEYCHAIN_SESSION = 'cmcc.session.'    // + 手机号: 会话 cookie, 失效才重新续登
const LEGACY_LOGIN = 'cmcc.login'           // 0.2.0 及以前的单账号凭证, 首次读取时迁移

// 与 paperclip 签到脚本的 BoxJS 键一致
const BOXJS_LOGIN = 'cmcc_login'

const CACHE_KEY = 'cmcc.last_response.'    // + 手机号
const CACHE_TTL_MS = 5 * 60 * 1000   // 5 分钟内复用缓存
const STALE_OK_MS = 6 * 60 * 60 * 1000   // 6 小时内网络故障可降级到缓存 (带 ⚠ 标记)

const HOST_LOGIN = 'client.app.coc.10086.cn'
const HOST_BIZ = 'clientaccess.10086.cn'
const P_LOGIN = '/biz-orange/LN/uamrandcodelogin/autoLogin'
const P_FEE = '/biz-orange/BN/payFeesQuery/getPayFeesQueryInfo'
const P_REMAIN = '/biz-orange/BH/newPlanRemainQry/getNewPlanRemainQry'
const P_POINTS = '/biz-orange/BN/scoreQueryService/getScoreQuery'
const P_USER = '/biz-orange/BN/userInformationService/getUserInformation'
const P_ACCOUNT = '/biz-orange/BH/accoutQry/getAccoutInfo'   // 账本: 实时余额 (含欠费) / 本月消费
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
  /** 网龄, 单位年, 如 5.3 */
  netYears?: number
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
  /** 语音, 单位分钟; 套餐没有语音时为 undefined */
  voice?: { total: number; used: number; remain: number }
  points?: number
  user?: UserInfo
  /** 尾号 4 位 */
  phoneTail: string
  stale: boolean
  fetchedAt: number
}

export type ErrorKind = 'no_cred' | 'auth' | 'risk' | 'network' | 'schema'

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
/** selector: 手机号或尾号; 空则取第一个账号 */
export async function loadAccount(selector?: string): Promise<Account> {
  const tels = listAccounts()
  if (tels.length === 0) throw new CmccError('no_cred', '未导入登录凭证')
  const want = selector?.trim()
  const tel = want ? tels.find(t => t.endsWith(want)) : tels[0]
  if (!tel) throw new CmccError('no_cred', `没有尾号 ${want} 的账号`)
  const login = Keychain.get(KEYCHAIN_LOGIN + tel)!
  const query = queryFromLogin(login)

  const cached = readCache(tel)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { ...cached, stale: false }

  try {
    const account = await withSession(tel, login, cookie => queryAll(cookie, query))
    writeCache(tel, account)
    return account
  } catch (err) {
    if (cached && Date.now() - cached.fetchedAt < STALE_OK_MS) return { ...cached, stale: true }
    throw err
  }
}

// 先用上次的会话查; 查不动 (过期 / 被踢) 再续登重试一次
async function withSession<T>(tel: string, login: string, fn: (cookie: string) => Promise<T>): Promise<T> {
  const saved = Keychain.get(KEYCHAIN_SESSION + tel)
  try {
    return await fn(saved ?? await renewSession(login, tel))
  } catch (e) {
    if (!saved) throw e
    return fn(await renewSession(login, tel))
  }
}

/** 诊断: 话费接口完整返回 (只有金额字段, 不含个人信息), 跳过缓存实时查询 */
export async function feeRaw(tel: string): Promise<string> {
  const login = Keychain.get(KEYCHAIN_LOGIN + tel)
  if (!login) throw new CmccError('no_cred', '未导入登录凭证')
  const query = queryFromLogin(login)
  return JSON.stringify(await withSession(tel, login, cookie => bizCall(P_FEE, query, cookie)), null, 1)
}

// 话费 / 流量必需; 积分 / 用户信息失败不影响主流程
async function queryAll(cookie: string, query: string): Promise<Account> {
  const [fee, ledger, remain, points, user] = await Promise.all([
    bizCall(P_FEE, query, cookie),
    bizCall(P_ACCOUNT, ledgerQuery(query), cookie).catch(() => null),
    bizCall(P_REMAIN, query, cookie),
    bizCall(P_POINTS, query, cookie).catch(() => null),
    bizCall(P_USER, query, cookie).catch(() => null),
  ])
  return buildAccount(fee, ledger, remain, points, user, query)
}

// 账本查询的 reqBody 多了起止月份, 查本月
function ledgerQuery(query: string): string {
  const q = JSON.parse(query)
  const d = new Date()
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return JSON.stringify({ ...q, reqBody: { ...q.reqBody, beginMonth: month, endMonth: month } })
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
async function renewSession(J: string, tel: string): Promise<string> {
  const res = await post('https://' + HOST_LOGIN + P_LOGIN, signedHeaders(HOST_LOGIN, P_LOGIN, J, 'null', '14'), encB64(J, LK, LIV))
  if (!res.ok) throw new CmccError('network', `HTTP ${res.status}`)
  const out = parseRsp(await res.text(), LSK, LIV)
  console.log('[cmcc login]', out.retCode, out.retDesc)
  // 214100: 风控要求验证, 需要在中国移动 App 里完成, 不是凭证失效
  if (out.retCode === '214100') throw new CmccError('risk', `${out.retDesc ?? ''} [214100]`)
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
  Keychain.set(KEYCHAIN_SESSION + tel, cookie)
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

/** 185935 → "181.58G", 512 → "512M" */
export function formatFlow(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)}G`
  return `${Math.round(mb)}M`
}

// 品牌码: "03" "09" 已对照套餐名确认 (都是动感地带), 其余按中国移动通用编码; 未知代码不显示
const BRANDS: Record<string, string> = { '01': '全球通', '02': '神州行', '03': '动感地带', '09': '动感地带' }

function num(v: unknown): number | undefined {
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? undefined : n
}

// "5年3个月" / "8个月" → 5.25 / 0.67
function parseNetYears(v: unknown): number | undefined {
  const m = String(v ?? '').match(/^(?:(\d+)年)?(?:(\d+)个月)?$/)
  if (!m || (!m[1] && !m[2])) return undefined
  return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 12
}

function buildAccount(fee: any, ledger: any, remain: any, points: any, user: any, query: string): Account {
  // 余额 / 本月消费优先取账本: 欠费号在话费接口里 balance / payAmount 都是 0, 账本里才是 -27.32 / 16.93
  const book = ledger?.accoutQryInfoHis?.[0]
  const balance = num(book?.allThisMonthBill) ?? num(fee?.balance)
  if (balance === undefined) throw new CmccError('schema', 'missing balance')

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

  const v = remain?.newPlanRemainQryRes?.planRemianVoiceListRes?.planRemianVoiceInfoRes?.[0]

  const tel = String(JSON.parse(query).tel ?? '')
  const u = user?.userInfo
  return {
    balance,
    monthFee: num(book?.allThisMonthOutBill) ?? num(fee?.payAmount),
    general: part('0'),
    targeted: part('1'),
    voice: v ? {
      total: num(v.voiceSumNum) ?? 0,
      used: num(v.voiceUsdNum) ?? 0,
      remain: num(v.voiceRemainNum) ?? 0,
    } : undefined,
    points: num(points?.pointValue),
    user: u ? {
      brand: BRANDS[u.userBrand],
      starLevel: num(u.starLevel),
      starScore: num(u.starScore),
      channel: u.userChannel || undefined,
      netYears: parseNetYears(u.userAge),
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
function readCache(tel: string): Account | null {
  try {
    const s = AppStorage.get<string>(CACHE_KEY + tel)
    return s ? JSON.parse(s) as Account : null
  } catch {
    return null
  }
}

function writeCache(tel: string, account: Account): void {
  try {
    AppStorage.set(CACHE_KEY + tel, JSON.stringify(account))
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

/** 已导入的手机号, 按导入顺序 */
export function listAccounts(): string[] {
  const raw = Keychain.get(KEYCHAIN_ACCOUNTS)
  if (raw) return JSON.parse(raw) as string[]
  const legacy = Keychain.get(LEGACY_LOGIN)
  if (!legacy) return []
  const tel = String(JSON.parse(legacy).tel)
  Keychain.set(KEYCHAIN_LOGIN + tel, legacy)
  Keychain.set(KEYCHAIN_ACCOUNTS, JSON.stringify([tel]))
  Keychain.remove(LEGACY_LOGIN)
  Keychain.remove('cmcc.session')
  return [tel]
}

/**
 * 导入 BoxJS 里的全部账号; 同号覆盖, 新号追加. 返回导入的手机号
 * cmcc_login 是登录信封数组 (paperclip r5 起); 旧版是单个信封
 */
export async function importFromBoxJS(host: string): Promise<string[]> {
  const raw = await readBoxJS(host, BOXJS_LOGIN)
  const parsed = JSON.parse(raw)
  const logins: string[] = Array.isArray(parsed) ? parsed : [raw]
  const tels = listAccounts()
  const imported: string[] = []
  for (const login of logins) {
    const { xk, tel } = JSON.parse(login)
    if (!xk || !tel) throw new CmccError('schema', 'BoxJS 里的凭证格式不对')
    if (!tels.includes(tel)) tels.push(tel)
    Keychain.set(KEYCHAIN_LOGIN + tel, login)
    Keychain.remove(KEYCHAIN_SESSION + tel)
    AppStorage.remove(CACHE_KEY + tel)
    imported.push(tel)
  }
  Keychain.set(KEYCHAIN_ACCOUNTS, JSON.stringify(tels))
  return imported
}

export async function removeAccount(tel: string): Promise<void> {
  Keychain.set(KEYCHAIN_ACCOUNTS, JSON.stringify(listAccounts().filter(t => t !== tel)))
  Keychain.remove(KEYCHAIN_LOGIN + tel)
  Keychain.remove(KEYCHAIN_SESSION + tel)
  AppStorage.remove(CACHE_KEY + tel)
}

/** 清掉所有账号的查询缓存, 下次刷新实时查询 */
export function clearCache(): void {
  for (const tel of listAccounts()) AppStorage.remove(CACHE_KEY + tel)
}
