// Loon 面板 · 给 Scripting 小组件提供数据
// 定时任务 / 网络切换: 节点体检 (各策略组当前节点 + App 里指定策略组的全部节点)、直连出口、解锁检测、
//   锁定的策略组被还原就改回来、当前节点挂了发通知或自动切换, 结果写进 $persistentStore, 跑完可推送刷新小组件
// 请求 http://1.1.1.1/loon-panel/data: 返回模式、策略组、体检结果、解锁、事件记录等
// 请求 http://1.1.1.1/loon-panel/set: ?mode=0|1|2 切模式; ?group=…&node=… 切节点; ?group=…&node=…&lock=1 锁定, ?group=…&lock=0 解锁; 不带参数只复测; 加 quiet=1 切完不复测
// 请求 http://1.1.1.1/loon-panel/deep?node=…: 对节点跑一次深度检测 (加 &speed=1 同时测速, &full=1 再加 MTR 和 BGP 路径)
// 请求 http://1.1.1.1/loon-panel/clear?node=…: 清掉这个节点的深度检测结果; ?all=1 清掉全部检测结果、体检历史、解锁和事件, 设置和锁定不动
// POST http://1.1.1.1/loon-panel/opts: 保存 App 里的设置, 正文是要改的项 (JSON); 空字符串 = 恢复默认

const VERSION = '0.3.40'
const STORE_KEY = 'loon_panel'

// 设置都在 Scripting 的 App 里改, 存在 store.opts; 插件参数只留体检频率 (cron 只能写在规则里)
const DEFAULT_OPTS = {
  groups: [],       // 每次体检都测全部节点的策略组
  net: true,        // 网络切换后复测
  notify: false,    // 节点异常发通知; Loon 自己也会提示节点问题, 默认关
  auto: false,      // 挂了自动切到最快
  timeout: 5000,    // 单次超时 (毫秒)
  test_url: 'http://www.gstatic.com/generate_204',   // 常用 Loon 配置的 proxy-test-url 就是它; 脚本读不到 Loon 实际设的地址
  ip_url: 'https://api.ipify.org',
  lookup_direct: false,  // 按 IP 查数据库时先从手机直连, 失败再走节点; 查得更全, 但这些服务会看到手机 IP
  push_key: '',     // 体检完推送刷新小组件; 只存在这里, 不返回给数据地址
  targets: [],
}

function readOpts() {
  try {
    return Object.assign({}, DEFAULT_OPTS, (JSON.parse($persistentStore.read(STORE_KEY) || '{}') || {}).opts)
  } catch (e) {
    return Object.assign({}, DEFAULT_OPTS)
  }
}

const OPT = readOpts()

const IP_BACKUP = 'http://ip-api.com/line/?fields=query'
const CRON_BUDGET = 100000   // 插件里定时任务 timeout=120 秒, 留余量
const REQ_BUDGET = 20000     // 操作地址 timeout=30 秒, 小组件按钮也等不了太久
const DEEP_BUDGET = 75000    // 深度检测地址 timeout=90 秒
const KEEP_MS = 3 * 86400000 // 3 天没再测的节点从结果里删掉
const HISTORY = 24           // 每个节点保留最近 24 次
const FAIL_LIMIT = 3         // 连续几次超时算挂了
const MEDIA_EVERY = 6 * 3600000  // 同一节点的解锁结果 6 小时内不重测
const MEDIA_PER_RUN = 3
const EVENTS = 40
const DEEP_KEEP = 6

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const clean = v => (v === undefined || v === null ? '' : String(v).trim())

// ─────────────────────────────────────────────────────────────
// 配置. Loon 有时把值再包一层 JSON 字符串, 空值是字符串 "null"
// ─────────────────────────────────────────────────────────────
function decode(v) {
  if (typeof v !== 'string') return v === undefined || v === null ? '' : v
  const s = v.trim()
  if (!s || s === 'null' || s === 'undefined') return ''
  if (s[0] === '"' || s[0] === '[' || s[0] === '{') {
    try { return decode(JSON.parse(s)) } catch (e) { return s }
  }
  return s
}

function readConfig() {
  try {
    const c = decode($config.getConfig())
    return c && typeof c === 'object' ? c : {}
  } catch (e) {
    return {}
  }
}

const nameOf = x => (typeof x === 'string' ? x : x && typeof x.name === 'string' ? x.name : '')

function groupNames(conf) {
  if (Array.isArray(conf.all_policy_groups)) return conf.all_policy_groups.map(nameOf).filter(Boolean)
  return Object.keys(conf.policy_select || {})
}

/** 文档说名字不对时可能一直不回调, 3 秒兜底 */
function callSubs(fn, group) {
  return new Promise(resolve => {
    let done = false
    const finish = v => { if (!done) { done = true; resolve(v) } }
    setTimeout(() => finish([]), 3000)
    try {
      fn.call($config, group, text => {
        const list = decode(text)
        finish((Array.isArray(list) ? list : []).map(nameOf).filter(Boolean))
      })
    } catch (e) {
      finish([])
    }
  })
}

/** 两种拼写都试: 有人实测 getSubPolicies 拿不到, 旧名 getSubPolicys 能拿到 */
async function subPolicies(group) {
  const list = $config.getSubPolicies ? await callSubs($config.getSubPolicies, group) : []
  return list.length || !$config.getSubPolicys ? list : callSubs($config.getSubPolicys, group)
}

const isBuiltin = n => /^(DIRECT|REJECT)/i.test(n)

/** 当前选择: 没被手动选过的策略组可能读不到, 依次看 policy_select、旧接口, 最后取第一个真实成员 */
function selectedOf(name, conf, subs) {
  let v = nameOf(decode($config.getSelectedPolicy(name)))
  if (!v && conf.policy_select) v = nameOf(conf.policy_select[name])
  if (!v && $config.getPolicy) v = nameOf(decode($config.getPolicy(name)))
  return v || subs.find(n => !isBuiltin(n)) || subs[0] || ''
}

async function readState() {
  const conf = readConfig()
  const names = groupNames(conf)
  const set = new Set(names)
  const subs = await Promise.all(names.map(subPolicies))
  const now = {}
  names.forEach((n, i) => { now[n] = selectedOf(n, conf, subs[i]) })
  /** 一路往下找到真正的节点: 策略组选中的可能还是策略组 */
  const leafOf = name => {
    let cur = name
    for (let i = 0; i < 8 && set.has(cur) && now[cur]; i++) cur = now[cur]
    return cur
  }
  const groups = names.map((name, i) => ({ name, now: now[name], leaf: leafOf(name), subs: subs[i] }))
  // 订阅更新后策略组可能还记着已经没有的节点; 这种名字 Loon 找不到, 会换成第一个节点, 测出来的不是它
  const known = new Set([...names, ...subs.flat()])
  const gone = new Set(subs.some(l => l.length) ? groups.map(g => g.leaf).filter(n => n && !known.has(n) && !isBuiltin(n)) : [])
  for (const g of groups) if (gone.has(g.leaf)) g.gone = true
  return { conf, set, groups, leafOf, gone }
}

// DIRECT 不算节点: 测试地址在国内直连本来就可能不通, 直连出口由 checkDirect 单独记录
const testable = name => !!name && !isBuiltin(name)

function uniq(list) {
  const seen = new Set()
  return list.filter(x => testable(x) && !seen.has(x) && seen.add(x))
}

/** 各策略组当前选中的节点; 一路下来还停在策略组上的 (没有选中项) 不测 */
const leaves = state => uniq(state.groups.map(g => g.leaf).filter(n => !state.set.has(n) && !state.gone.has(n)))
/** 一路下来还是策略组 (比如链式策略): $httpClient 的 node 可以填策略组, 直接测它, 但不算「在用的节点」 */
const stuck = state => uniq(state.groups.map(g => g.leaf).filter(n => state.set.has(n)))

// ─────────────────────────────────────────────────────────────
// 存储、事件、通知
// ─────────────────────────────────────────────────────────────
function readStore() {
  let s = {}
  try { s = JSON.parse($persistentStore.read(STORE_KEY) || '{}') } catch (e) { s = {} }
  if (!s || typeof s !== 'object') s = {}
  for (const k of ['nodes', 'media', 'deep', 'locks']) if (!s[k] || typeof s[k] !== 'object') s[k] = {}
  delete s.nodes.DIRECT   // 旧版留下的记录: DIRECT 不再体检
  if (!Array.isArray(s.events)) s.events = []
  return s
}

function writeStore(store) {
  const now = Date.now()
  for (const k of Object.keys(store.nodes)) if (!store.nodes[k] || !(now - store.nodes[k].t < KEEP_MS)) delete store.nodes[k]
  for (const k of Object.keys(store.media)) if (!store.media[k] || !(now - store.media[k].t < KEEP_MS)) delete store.media[k]
  const deep = Object.keys(store.deep).sort((a, b) => store.deep[b].t - store.deep[a].t)
  for (const k of deep.slice(DEEP_KEEP)) delete store.deep[k]
  store.events = store.events.slice(-EVENTS)
  $persistentStore.write(JSON.stringify(store), STORE_KEY)
}

/** k: net 切网络 / fail 节点挂了 / switch 自动切换 / lock 改回锁定 */
function addEvent(store, k, msg) {
  store.events.push({ t: Date.now(), k, msg })
}

function notify(title, content) {
  $notification.post('Loon 面板', title, content)
}

// ─────────────────────────────────────────────────────────────
// 体检
// ─────────────────────────────────────────────────────────────
function get(url, node) {
  return new Promise(resolve => {
    const t0 = Date.now()
    $httpClient.get({ url, node, timeout: OPT.timeout }, (error, response, data) => resolve({ error, response, data, ms: Date.now() - t0 }))
  })
}

/** 出口 IP: 纯文本, 或带 ip / query / origin 字段的 JSON */
function pickIP(data) {
  if (typeof data !== 'string') return ''
  let text = data.trim()
  try {
    const j = JSON.parse(text)
    if (j && typeof j === 'object') text = String(j.ip || j.query || j.origin || '')
  } catch (e) { /* 纯文本 */ }
  text = text.split(',')[0].trim()
  return text.length <= 45 && /^[0-9a-f:.]+$/i.test(text) && /[.:]/.test(text) ? text : ''
}

function exitInfo(r, ip) {
  r.ip = ip
  r.cc = clean($utils.geoip(ip)).toUpperCase()
  r.asn = clean($utils.ipasn(ip))
  r.org = clean($utils.ipaso(ip))
}

/** 有的节点连不上默认的查询地址, 换一个再试一次 */
async function readIP(node) {
  for (const url of [OPT.ip_url, IP_BACKUP]) {
    const a = await get(url, node)
    const ip = a.error ? '' : pickIP(a.data)
    if (ip) return ip
  }
  return ''
}

async function probe(node) {
  const r = { t: Date.now(), ok: false, ms: 0 }
  const a = await get(OPT.test_url, node)
  if (a.error || !a.response) {
    r.err = clean(a.error).slice(0, 60) || '超时'
    return r
  }
  r.ok = true
  r.ms = a.ms
  const ip = await readIP(node)
  if (ip) exitInfo(r, ip)
  return r
}

/** 逐个测, 快到时限就停, 剩下的下次再测; 在用的节点失败时连试 3 次, 免得偶发超时就报警 */
async function runChecks(store, targets, current, budget) {
  const start = Date.now()
  let tested = 0
  for (const name of targets) {
    if (Date.now() - start + 2 * OPT.timeout > budget) break
    const prev = store.nodes[name] || {}
    let r = await probe(name)
    let fails = r.ok ? 0 : 1
    for (let i = 1; !r.ok && current.has(name) && i < FAIL_LIMIT && Date.now() - start + 2 * OPT.timeout <= budget; i++) {
      r = await probe(name)
      fails = r.ok ? 0 : fails + 1
    }
    if (r.ok && !r.ip && prev.ip) for (const k of ['ip', 'cc', 'asn', 'org']) r[k] = prev[k]   // 这次没查到出口, 先留着上次的
    r.h = (prev.h || []).concat(r.ok ? r.ms : -1).slice(-HISTORY)
    r.fail = r.ok ? 0 : (prev.fail || 0) + fails
    if (!r.ok && prev.alerted) r.alerted = true
    store.nodes[name] = r
    tested++
  }
  const now = Date.now()
  store.check = { t: now, took: now - start, tested, total: targets.length }
}

async function checkDirect(store) {
  const a = await get(OPT.ip_url, 'DIRECT')
  const ip = a.error ? '' : pickIP(a.data)
  if (!ip) return
  const d = { t: Date.now(), ms: a.ms }
  exitInfo(d, ip)
  store.direct = d
}

/** 锁定的策略组被还原 (常见于重启 Loon 后) 就改回来 */
function applyLocks(state, store) {
  let changed = false
  for (const g of state.groups) {
    const want = store.locks[g.name]
    if (!want || g.now === want) continue
    if ($config.setSelectPolicy(g.name, want)) {
      addEvent(store, 'lock', `${g.name} 被还原，已改回 ${want}`)
      notify('策略组已改回', `${g.name} → ${want}`)
      changed = true
    }
  }
  return changed
}

/** 在用的节点连续超时: 发通知; 打开了自动切换就切到这个策略组里能用的最快节点 (锁定的不动) */
function handleDown(state, store) {
  let changed = false
  for (const name of leaves(state)) {
    const r = store.nodes[name]
    if (!r || r.ok || r.fail < FAIL_LIMIT || r.alerted) continue
    r.alerted = true
    const owner = state.groups.find(g => g.now === name && !store.locks[g.name])
    const alive = owner && OPT.auto
      ? owner.subs.filter(n => n !== name && store.nodes[n] && store.nodes[n].ok).sort((a, b) => store.nodes[a].ms - store.nodes[b].ms)
      : []
    if (alive.length && $config.setSelectPolicy(owner.name, alive[0])) {
      const msg = `${name} 连续 ${r.fail} 次超时，${owner.name} 已切到 ${alive[0]}（${store.nodes[alive[0]].ms}ms）`
      addEvent(store, 'switch', msg)
      notify('节点已自动切换', msg)
      changed = true
    } else {
      const msg = `${name} 连续 ${r.fail} 次超时`
      addEvent(store, 'fail', msg)
      if (OPT.notify) notify('当前节点不可用', msg)
    }
  }
  return changed
}

function pushReload() {
  if (!OPT.push_key || !OPT.targets.length) return Promise.resolve()
  const t = Date.now()
  return Promise.all(OPT.targets.map(id => new Promise(resolve => {
    $httpClient.post({
      url: `https://push.scripting.fun/v1/remote-updates/widget-targets/${encodeURIComponent(id)}/reload`,
      headers: { Authorization: `Bearer ${OPT.push_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotency_key: `loonpanel:${t}:${id}` }),
    }, error => {
      if (error) console.log(`推送刷新失败: ${clean(error).slice(0, 80)}`)
      resolve()
    })
  })))
}

// ─────────────────────────────────────────────────────────────
// IP 质量检测: 解锁和深度检测. 数据源和判定口径来自 paperclip 的节点 IP 质量检测 (参考 @Roddy-D、@xykt),
// 这里只收集结果给小组件显示. 请求都走被检测的节点
// ─────────────────────────────────────────────────────────────
const CHECK_BUDGET = 45000       // 一次检测的请求时限, 到点后的请求直接失败, 已拿到的结果照常显示
const SPEED_BUDGET = 14000       // 测速放在其他检测之后单独计时, 免得互相抢带宽
const UPLOAD_BUDGET = 10000
const REQUEST_TIMEOUT = 7000
const MAX_REQUESTS = 8
const CHECK_PLACE = 'https://ipinfo.check.place'
const IPIFY_URL = 'https://api4.ipify.org?format=json'
const IPAPI_URL = 'https://api.ipapi.is/'
const IPPURE_URL = 'https://my.ippure.com/v1/info'
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const DISNEY_TOKEN = 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84'
const DNSBL_ZONES = ['bl.spamcop.net', 'psbl.surriel.com', 'dnsbl.dronebl.org', 'bl.mailspike.net', 'dnsbl-1.uceprotect.net', 'bl.blocklist.de']
const SPEED_CONNECTIONS = 4
const SPEED_BYTES = 4000000
const UPLOAD_SMALL = 131072
const UPLOAD_LARGE = 524288
// 这些域名的 A 记录应该属于对应 ASN, 不是就算疑似污染
const DNS_TARGETS = [
  { domain: 'www.google.com', asn: '15169' },
  { domain: 'www.youtube.com', asn: '15169' },
  { domain: 'www.wikipedia.org', asn: '14907' },
]
// 上海三网地址, 取自 zhanghanyun/backtrace
const BACKHAUL_TARGETS = [
  { isp: 'ct', carrier: '电信', ip: '202.96.209.133' },
  { isp: 'cu', carrier: '联通', ip: '210.22.97.1' },
  { isp: 'cm', carrier: '移动', ip: '211.136.112.200' },
]
const CHINA_ROUTE_ASNS = ['4809', '9929', '4134', '4837', '58453', '58807', '23764']
const CHINA_PROBES = [
  { magic: 'AS4134+China', limit: 1 },
  { magic: 'AS4837+China', limit: 1 },
  { magic: 'AS9808+China', limit: 1 },
]
const STABILITY_TARGETS = [
  { name: 'cloudflare', url: 'https://cp.cloudflare.com/generate_204' },
  { name: 'google', url: 'https://www.gstatic.com/generate_204' },
  { name: 'apple', url: 'https://captive.apple.com/hotspot-detect.html' },
]

let checkNode = ''
let checkEnd = 0
let activeRequests = 0
const requestCount = { ok: 0, total: 0 }
const requestQueue = []

function startCheck(node, budget) {
  checkNode = node
  checkEnd = Date.now() + budget
}

/** 有的请求可能一直不回调, 到点就放弃这次检测, 不拖垮整个脚本 */
const withBudget = (task, ms) => Promise.race([task, sleep(ms).then(() => null)])

const errorText = e => (e && e.message ? String(e.message) : String(e))
const capture = task => Promise.resolve(task).then(value => ({ ok: true, value }), e => ({ ok: false, error: errorText(e) }))
const safeTask = task => Promise.resolve(task).catch(e => ({ error: errorText(e) }))
const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits
const shorten = (v, n) => { const s = String(v || ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s }

function cleanValue(v) {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return /^(null|undefined|n\/a|unknown|-)$/i.test(s) ? '' : s
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function booleanOrNull(v) {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return null
}

function anyTrue(list) {
  const flags = list.map(booleanOrNull)
  if (flags.includes(true)) return true
  return flags.every(v => v === false) ? false : null
}

function compact(o) {
  const r = {}
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue
    r[k] = v
  }
  return r
}

function valueAt(o, path) {
  let v = o
  for (const k of path.split('.')) {
    if (v === null || v === undefined) return null
    v = v[k]
  }
  return v
}

function uniqueValues(list) {
  return [...new Set((list || []).map(cleanValue).filter(Boolean))]
}

function cleanASN(v) {
  const m = cleanValue(v).replace(/^AS/i, '').match(/^\d+/)
  return m ? m[0] : ''
}

function isIPv4(v) {
  const parts = String(v || '').trim().split('.')
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

function normalizeIP(v) {
  const s = String(v || '').trim().toLowerCase()
  if (isIPv4(s)) return s
  if (!/^[0-9a-f:]+$/.test(s) || !s.includes(':')) return ''
  try {
    return new URL(`http://[${s}]/`).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch (e) {
    return s
  }
}

function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = String(text || '').match(p)
    if (m && m[1]) return m[1].toUpperCase()
  }
  return ''
}

function median(list) {
  const rows = list.slice().sort((a, b) => a - b)
  return rows.length ? round(rows[Math.ceil(rows.length / 2) - 1], 2) : null
}

function deviation(list) {
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return Math.sqrt(list.reduce((a, b) => a + (b - avg) ** 2, 0) / list.length)
}

const networkOf = ip => ({ asn: cleanASN($utils.ipasn(ip)), organization: cleanValue($utils.ipaso(ip)), cc: cleanValue($utils.geoip(ip)).toUpperCase() })

const browserHeaders = () => ({
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': MOBILE_UA,
})

/** 检测的请求默认都走被检测的节点, 第三方只看到节点 IP; c.node 可以改走 DIRECT; c.allowHttpErrors 不把非 2xx 当失败 */
function sendRequest(method, url, c) {
  return new Promise((resolve, reject) => {
    const left = checkEnd - Date.now()
    if (left <= 250) return reject(new Error('已达到本次检测时限'))
    const start = Date.now()
    const backend = url.startsWith(CHECK_PLACE)
    const o = {
      url,
      node: c.node || checkNode,
      headers: c.headers || (backend ? { Accept: 'application/json', 'User-Agent': 'curl/8.7.1' } : browserHeaders()),
      timeout: Math.max(250, Math.min(c.timeout || REQUEST_TIMEOUT, left)),
    }
    if (c.binaryMode) o['binary-mode'] = true
    if (c.autoRedirect === false) o['auto-redirect'] = false
    if (backend) o.alpn = 'h2'
    if (c.body !== undefined) o.body = c.body
    const done = (error, response, body) => {
      requestCount.total++
      if (error) return reject(new Error(String(error)))
      const status = Number(response && (response.status || response.statusCode))
      if (status >= 200 && status < 400) requestCount.ok++
      if (!c.allowHttpErrors && !(status >= 200 && status < 300)) return reject(new Error(`HTTP ${status || '?'}`))
      resolve({ status, body: c.binaryMode ? body : String(body || ''), response: response || {}, elapsedMs: Math.max(1, Date.now() - start) })
    }
    if (method === 'POST') $httpClient.post(o, done)
    else $httpClient.get(o, done)
  })
}

function drainRequests() {
  while (activeRequests < MAX_REQUESTS && requestQueue.length) {
    const job = requestQueue.shift()
    activeRequests++
    job().then(() => {
      activeRequests--
      drainRequests()
    })
  }
}

function request(method, url, c = {}) {
  return new Promise((resolve, reject) => {
    requestQueue.push(() => sendRequest(method, url, c).then(resolve, reject))
    drainRequests()
  })
}

const requestText = (url, c = {}) => request(c.method || 'GET', url, c).then(r => r.body)

async function requestJson(url, c = {}) {
  const r = await request(c.method || 'GET', url, c)
  try {
    return JSON.parse(r.body)
  } catch (e) {
    throw new Error('JSON 响应解析失败')
  }
}

/** 打开「数据库直连」后, 按 IP 查数据库先从手机直连, 失败再走节点; 默认只走节点 */
async function either(send) {
  if (!OPT.lookup_direct) return send('')
  try {
    return await send('DIRECT')
  } catch (direct) {
    try {
      return await send('')
    } catch (node) {
      throw new Error(`直连 ${shorten(errorText(direct), 24)}；节点 ${shorten(errorText(node), 24)}`)
    }
  }
}

const lookupJson = (url, c = {}) => either(node => requestJson(url, Object.assign({}, c, { node })))
const lookupText = (url, c = {}) => either(node => requestText(url, Object.assign({}, c, { node })))

/** check.place 的 Cloudflare 会拦很多机场节点的 IP, 查得太频繁还会封 IP, 只走节点试一次, 不拿手机 IP 去试 */
async function requestBackendJson(url) {
  try {
    return await requestJson(url)
  } catch (e) {
    throw /HTTP 403\b|JSON/.test(errorText(e)) ? new Error('check.place 拦截了这个出口 IP') : e
  }
}

// 解锁
const mediaResult = (name, status, region, note) => compact({ name, status, region, note })

async function testTikTok() {
  const r = await request('GET', 'https://www.tiktok.com/', { allowHttpErrors: true })
  const region = firstMatch(r.body, [/"region"\s*:\s*"([A-Z]{2})"/i, /"storeCountry"\s*:\s*"([A-Z]{2})"/i])
  if (region) return mediaResult('TikTok', 'yes', region, '页面端点返回地区字段')
  if (r.status === 403 || /not available|access denied/i.test(r.body)) return mediaResult('TikTok', 'unknown', '', `HTTP ${r.status || '?'} · 可能受限或反爬`)
  return mediaResult('TikTok', 'unknown', '', '地区未识别')
}

async function testDisneyPlus() {
  const device = await requestJson('https://disney.api.edge.bamgrid.com/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${DISNEY_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8', 'User-Agent': MOBILE_UA },
    body: JSON.stringify({ deviceFamily: 'browser', applicationRuntime: 'chrome', deviceProfile: 'windows', attributes: {} }),
  })
  if (!device.assertion) return mediaResult('Disney+', 'unknown', '', '设备注册失败')
  const token = await requestJson('https://disney.api.edge.bamgrid.com/token', {
    method: 'POST',
    allowHttpErrors: true,
    headers: { Authorization: `Bearer ${DISNEY_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': MOBILE_UA },
    body: [
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange',
      'latitude=0',
      'longitude=0',
      'platform=browser',
      `subject_token=${encodeURIComponent(device.assertion)}`,
      'subject_token_type=urn%3Abamtech%3Aparams%3Aoauth%3Atoken-type%3Adevice',
    ].join('&'),
  })
  if (token.error_description === 'forbidden-location') return mediaResult('Disney+', 'no', '', '地区受限')
  if (!token.refresh_token) return mediaResult('Disney+', 'unknown', '', '令牌获取失败')
  const graph = await requestJson('https://disney.api.edge.bamgrid.com/graph/v1/device/graphql', {
    method: 'POST',
    allowHttpErrors: true,
    headers: { Authorization: DISNEY_TOKEN, 'Content-Type': 'application/json', 'User-Agent': MOBILE_UA },
    body: JSON.stringify({
      query: 'mutation refreshToken($input: RefreshTokenInput!) { refreshToken(refreshToken: $input) { activeSession { sessionId } } }',
      variables: { input: { refreshToken: token.refresh_token } },
    }),
  })
  const session = valueAt(graph, 'extensions.sdk.session') || {}
  const region = valueAt(session, 'location.countryCode') || ''
  if (session.inSupportedLocation === true) return mediaResult('Disney+', 'yes', region, 'inSupportedLocation=true')
  if (session.inSupportedLocation === false) return mediaResult('Disney+', 'no', region, 'inSupportedLocation=false')
  return mediaResult('Disney+', 'unknown', region, '状态未识别')
}

async function testNetflix() {
  const list = await Promise.all(['81280792', '70143836'].map(id => request('GET', `https://www.netflix.com/title/${id}`, { allowHttpErrors: true })))
  if (list.some(r => r.status === 403)) return mediaResult('Netflix', 'unknown', '', 'HTTP 403 · 可能受限或反爬')
  const region = firstMatch(list.map(r => r.body).join('\n'), [/"countryCode"\s*:\s*"([A-Z]{2})"/i, /"id"\s*:\s*"([A-Z]{2})"\s*,\s*"countryName"/i])
  if (list.every(r => /Oh no!|NSEZ-404/i.test(r.body))) return mediaResult('Netflix', 'partial', region, '两部测试片标题页均显示不可用')
  if (list.some(r => r.status >= 200 && r.status < 400)) return mediaResult('Netflix', 'yes', region, '测试片标题页可达，不代表登录后可播放')
  return mediaResult('Netflix', 'unknown', region, '状态未识别')
}

async function testYouTube() {
  const r = await request('GET', 'https://www.youtube.com/premium', {
    allowHttpErrors: true,
    headers: Object.assign(browserHeaders(), { Cookie: 'CONSENT=YES+cb.20220301-11-p0.en+FX+700' }),
  })
  if (/www\.google\.cn/i.test(r.body)) return mediaResult('YouTube', 'partial', 'CN', '重定向至 google.cn')
  const region = firstMatch(r.body, [/"contentRegion"\s*:\s*"([A-Z]{2})"/i])
  if (/Premium is not available in your country/i.test(r.body)) return mediaResult('YouTube', 'partial', region, '页面明确显示 Premium 不可用')
  if (region && /YouTube Premium/i.test(r.body)) return mediaResult('YouTube', 'yes', region, 'Premium 页面可达并返回地区字段，不代表可购买')
  return mediaResult('YouTube', 'unknown', region, '状态未识别')
}

async function testPrimeVideo() {
  const r = await request('GET', 'https://www.primevideo.com/', { allowHttpErrors: true })
  const region = firstMatch(r.body, [/"currentTerritory"\s*:\s*"([A-Z]{2})"/i, /currentTerritory\\?"\s*:\s*\\?"([A-Z]{2})/i])
  if (region) return mediaResult('Prime Video', 'yes', region, '端点返回 currentTerritory，不代表实际播放')
  if (/not available in your location/i.test(r.body)) return mediaResult('Prime Video', 'no', '', '页面明确显示地区受限')
  if (r.status === 403) return mediaResult('Prime Video', 'unknown', '', 'HTTP 403 · 可能受限或反爬')
  return mediaResult('Prime Video', 'unknown', '', '地区未识别')
}

async function testReddit() {
  const r = await request('GET', 'https://www.reddit.com/', { allowHttpErrors: true })
  const region = firstMatch(r.body, [/country\s*=\s*"([A-Z]{2})"/i, /"countryCode"\s*:\s*"([A-Z]{2})"/i])
  if (r.status === 200) return mediaResult('Reddit', 'yes', region, '首页端点 HTTP 200，不代表账号功能')
  if (r.status === 403) return mediaResult('Reddit', 'unknown', '', 'HTTP 403 · 可能受限或反爬')
  return mediaResult('Reddit', 'unknown', region, `HTTP ${r.status || '?'}`)
}

const BLOCK_PAGE = /sorry,\s*you have been blocked|access denied|cf-error/i

function chatGPTWeb(r) {
  if (!r) return 'unknown'
  if (/unsupported_country/i.test(r.body) || BLOCK_PAGE.test(r.body)) return 'blocked'
  return /cookie_consent_required/i.test(r.body) || (r.status >= 200 && r.status < 300) ? 'available' : 'unknown'
}

function chatGPTApp(r) {
  if (!r) return 'unknown'
  if (/request is not allowed\.\s*please try again later\./i.test(r.body)) return 'available'
  if (/you may be connected to a disallowed isp|\bVPN\b|unsupported_country/i.test(r.body) || BLOCK_PAGE.test(r.body)) return 'blocked'
  return r.status >= 200 && r.status < 400 ? 'available' : 'unknown'
}

async function testChatGPT() {
  const [webTask, appTask, traceTask] = await Promise.all([
    capture(request('GET', 'https://api.openai.com/compliance/cookie_requirements', {
      allowHttpErrors: true,
      headers: Object.assign(browserHeaders(), {
        Accept: '*/*',
        Authorization: 'Bearer null',
        'Content-Type': 'application/json',
        Origin: 'https://platform.openai.com',
        Referer: 'https://platform.openai.com/',
      }),
    })),
    capture(request('GET', 'https://ios.chat.openai.com/', { allowHttpErrors: true })),
    capture(request('GET', 'https://chatgpt.com/cdn-cgi/trace', { allowHttpErrors: true })),
  ])
  const web = webTask.ok ? webTask.value : null
  const app = appTask.ok ? appTask.value : null
  const region = traceTask.ok ? firstMatch(traceTask.value.body, [/^loc=([A-Z]{2})$/im]) : ''
  const w = chatGPTWeb(web)
  const a = chatGPTApp(app)
  if (!web && !app) return mediaResult('ChatGPT', 'unknown', region, '请求失败')
  if (w === 'available' && a === 'available') return mediaResult('ChatGPT', 'yes', region, 'Web/App 探测端点均可达，不代表登录后功能')
  if (w === 'available' && a === 'blocked') return mediaResult('ChatGPT', 'partial', region, `仅 Web 端点可达；App HTTP ${app.status}`)
  if (a === 'available' && w === 'blocked') return mediaResult('ChatGPT', 'partial', region, `仅 App 端点可达；Web HTTP ${web.status}`)
  if (w === 'blocked' && a === 'blocked') return mediaResult('ChatGPT', 'partial', region, 'Web/App 均拒绝或受限，无法区分地区限制与风控')
  if (w === 'available') return mediaResult('ChatGPT', 'partial', region, 'Web 端点可达；App 未确认')
  if (a === 'available') return mediaResult('ChatGPT', 'partial', region, 'App 端点可达；Web 未确认')
  const blocked = [w === 'blocked' ? 'Web 受限' : '', a === 'blocked' ? 'App 受限' : ''].filter(Boolean)
  return mediaResult('ChatGPT', 'unknown', region, blocked.length ? `${blocked.join('；')}；另一端未确认` : '响应不足以确认')
}

async function testClaude() {
  const headers = Object.assign(browserHeaders(), { 'User-Agent': DESKTOP_UA })
  const [r, trace] = await Promise.all([
    request('GET', 'https://claude.ai/', { allowHttpErrors: true, autoRedirect: false, headers }),
    capture(requestText('https://claude.ai/cdn-cgi/trace', { headers })),
  ])
  const region = trace.ok ? firstMatch(trace.value, [/^loc=([A-Z]{2})$/im]) : ''
  const heads = r.response.headers || {}
  const key = Object.keys(heads).find(k => k.toLowerCase() === 'location')
  if (key && /app-unavailable-in-region/i.test(String(heads[key]))) return mediaResult('Claude', 'no', region, '跳转到地区不可用页面')
  if (r.status >= 200 && r.status < 400) return mediaResult('Claude', 'yes', region, '网页端点可达，不代表账号可用')
  return mediaResult('Claude', 'unknown', region, `HTTP ${r.status || '?'} · 可能受限或反爬`)
}

async function testGemini() {
  const r = await request('GET', 'https://gemini.google.com/', {
    allowHttpErrors: true,
    headers: Object.assign(browserHeaders(), { 'User-Agent': DESKTOP_UA }),
  })
  const flag = r.body.match(/45631641(?:\\?"\s*:\s*|,null,)(true|false)/)
  const area = r.body.match(/,2,1,200,"([A-Z]{3})"/)
  const note = area ? ` · 地区 ${area[1]}` : ''
  if (flag && flag[1] === 'true') return mediaResult('Gemini', 'yes', '', `页面功能标记开启，不代表账号可用${note}`)
  if (flag) return mediaResult('Gemini', 'no', '', `页面功能标记关闭${note}`)
  return mediaResult('Gemini', 'unknown', '', `HTTP ${r.status || '?'} · 未找到功能标记${note}`)
}

const MEDIA_TESTS = [
  ['TikTok', testTikTok], ['Disney+', testDisneyPlus], ['Netflix', testNetflix], ['YouTube', testYouTube], ['Prime Video', testPrimeVideo],
  ['Reddit', testReddit], ['ChatGPT', testChatGPT], ['Claude', testClaude], ['Gemini', testGemini],
]

function collectMedia() {
  return Promise.all(MEDIA_TESTS.map(([name, test]) => test().catch(e => {
    console.log(`${name} 检测失败: ${errorText(e)}`)
    return mediaResult(name, 'unknown', '', `请求失败：${shorten(errorText(e), 40)}`)
  })))
}

// 出口和 IP 数据库
async function requestIppure() {
  const once = async () => {
    const v = await requestJson(IPPURE_URL, { headers: {}, timeout: 6000 })
    if (!normalizeIP(v && v.ip)) throw new Error('未返回可核验的出口 IP')
    const score = numberOrNull(v.fraudScore)
    if (score === null || score < 0 || score > 100) delete v.fraudScore   // 现在的接口已经不给风险分了, 位置信息照用
    return v
  }
  return once().catch(once)
}

async function discoverIP() {
  const trace = v => (String(v || '').match(/(?:^|\n)ip=([^\r\n]+)/) || [])[1]
  const field = v => v && v.ip
  const sources = [
    ['check.place', requestText(`${CHECK_PLACE}/cdn-cgi/trace`), trace],
    ['myip.check.place', requestText('https://myip.check.place'), String],
    ['ipify', requestJson(IPIFY_URL), field],
    ['ident.me', requestText('https://v4.ident.me/'), String],
    ['icanhazip', requestText('https://ipv4.icanhazip.com/'), String],
    ['ippure', requestIppure(), field],
    ['ipapi', requestJson(IPAPI_URL), field],
  ]
  const settled = await Promise.all(sources.map(s => capture(s[1])))
  const seen = []
  const out = { ip: '', ippure: null, ippureError: '', ipapi: null }
  sources.forEach(([source, , pick], i) => {
    const r = settled[i]
    if (!r.ok) {
      if (source === 'ippure') out.ippureError = r.error
      return console.log(`出口探针 ${source}: ${r.error}`)
    }
    if (source === 'ippure') out.ippure = r.value
    if (source === 'ipapi') out.ipapi = r.value
    const ip = normalizeIP(pick(r.value))
    if (isIPv4(ip)) seen.push({ source, ip })
  })
  if (!seen.length) return { ip: '', seen }
  const counts = {}
  for (const x of seen) counts[x.ip] = (counts[x.ip] || 0) + 1
  // 优先信检测后端看到的出口, 它和后面查数据库用的是同一条路; 否则取多数
  const backend = seen.find(x => x.source === 'check.place') || seen.find(x => x.source === 'myip.check.place')
  out.ip = backend ? backend.ip : seen.map(x => x.ip).sort((a, b) => counts[b] - counts[a])[0]
  if (out.ipapi && normalizeIP(out.ipapi.ip) !== out.ip) out.ipapi = null
  out.seen = seen
  return out
}

function buildEgress(seen, primary) {
  const groups = {}
  for (const { source, ip } of seen) {
    if (!groups[ip]) {
      const n = networkOf(ip)
      groups[ip] = { ip, main: ip === primary, sources: [], asn: n.asn, cc: n.cc }
    }
    groups[ip].sources.push(source)
  }
  return Object.values(groups).sort((a, b) => (a.main !== b.main ? (a.main ? -1 : 1) : b.sources.length - a.sources.length))
}

async function requestScamalytics(ip) {
  try {
    const backend = await requestBackendJson(`${CHECK_PLACE}/${ip}?db=scamalytics`)
    if (numberOrNull(valueAt(backend, 'scamalytics.scamalytics_score')) === null) throw new Error('聚合接口未返回评分')
    return backend
  } catch (e) {
    const html = await requestText(`https://scamalytics.com/ip/${ip}`)
    const parsed = parseScamalyticsHtml(html, ip)
    if (!parsed) throw new Error('Scamalytics 官网页面解析失败')
    return parsed
  }
}

function parseScamalyticsHtml(html, ip) {
  if (!html || /Attention Required|unable to access|cf-error-details/i.test(html)) return null
  const ipPattern = new RegExp(`(^|[^0-9a-f:.])${ip.replace(/\./g, '\\.')}([^0-9a-f:.]|$)`, 'i')
  if (!/Scamalytics/i.test(html) || !ipPattern.test(html)) return null
  const m = html.match(/Fraud\s*Score\s*[:：]?\s*(?:<[^>]+>\s*){0,3}(\d{1,3})(?!\d)/i)
  const score = m ? Number(m[1]) : NaN
  return score >= 0 && score <= 100 ? { ip, scamalytics: { scamalytics_score: score } } : null
}

async function requestIpregistry(ip) {
  const home = await capture(lookupText('https://ipregistry.co'))
  // 页面不再给演示密钥时, 用上游 IPQuality 脚本里的同一个备用密钥
  const key = (home.ok && (home.value.match(/apiKey=["']([a-zA-Z0-9]+)["']/i) || [])[1]) || 'sb69ksjcajfs4c'
  return lookupJson(`https://api.ipregistry.co/${ip}?hostname=true&key=${key}`, {
    headers: { Accept: 'application/json', Origin: 'https://ipregistry.co', Referer: 'https://ipregistry.co/', 'User-Agent': MOBILE_UA },
  })
}

const REPORTED_IP = {
  maxmind: ['IP', 'ip'], maxmindBackup: ['IP', 'ip'], ippure: ['ip'], ipapi: ['ip'], ipinfo: ['data.ip'], ipwhois: ['ip'],
  scamalytics: ['ip'], abuseipdb: ['data.ipAddress'], ip2locationFull: ['ip'], ipdata: ['ip'], ipregistry: ['ip'],
}

/** 返回的是别的 IP 的数据就不能用; 没有报告 IP 的来源算通过. 只比 IPv4: 双栈节点的 IPPure 可能回 IPv6, 那是同一个节点 */
function reportsOtherIP(key, value, ip) {
  let reported = key === 'proxycheck' ? Object.keys(value || {}).find(k => normalizeIP(k)) || '' : ''
  for (const path of REPORTED_IP[key] || []) {
    const v = cleanValue(valueAt(value, path))
    if (v) { reported = v; break }
  }
  return isIPv4(normalizeIP(reported)) && normalizeIP(reported) !== ip
}

async function collectDatabases(ip, discovery) {
  const tasks = {
    maxmind: requestBackendJson(`${CHECK_PLACE}/${ip}?lang=cn`),
    maxmindBackup: requestBackendJson(`${CHECK_PLACE}/${ip}?lang=en`),
    ippure: discovery.ippure ? Promise.resolve(discovery.ippure) : Promise.reject(new Error(discovery.ippureError || 'IPPure 请求失败')),
    ipapi: discovery.ipapi ? Promise.resolve(discovery.ipapi) : lookupJson(`${IPAPI_URL}?q=${ip}`),
    ipinfo: lookupJson(`https://ipinfo.io/widget/demo/${ip}`),
    ipwhois: lookupJson(`https://ipwho.is/${ip}`),
    ip2locationFull: requestBackendJson(`${CHECK_PLACE}/${ip}?db=ip2location`),
    ip2location: lookupText(`https://www.ip2location.io/${ip}`),
    abuseipdb: requestBackendJson(`${CHECK_PLACE}/${ip}?db=abuseipdb`),
    scamalytics: requestScamalytics(ip),
    ipqs: requestBackendJson(`${CHECK_PLACE}/${ip}?db=ipqualityscore`),
    proxycheck: lookupJson(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1&risk=1`),
    dbip: lookupText(`https://db-ip.com/${ip}`),
    ipregistry: requestIpregistry(ip),
    ipdata: requestBackendJson(`${CHECK_PLACE}/${ip}?db=ipdata`),
  }
  const keys = Object.keys(tasks)
  const settled = await Promise.all(keys.map(k => capture(tasks[k])))
  const data = { reasons: {} }
  keys.forEach((key, i) => {
    const r = settled[i]
    const other = r.ok && reportsOtherIP(key, r.value, ip)
    if (!r.ok) data.reasons[key] = shorten(r.error, 60)
    else if (other && key !== 'ippure') data.reasons[key] = '返回的不是这个出口的数据'
    // IPPure 走节点, 报告的 IP 不同说明这个节点有分流出口, 结果只留着看出口, 不算进风险
    if (key === 'ippure' && other) data.ippure = Object.assign({}, r.value, { split: true })
    else data[key] = r.ok && !other ? r.value : null
  })
  return data
}

function mergeFallback(primary, fallback) {
  if (Array.isArray(primary)) {
    if (!primary.length) return Array.isArray(fallback) ? fallback : primary
    if (!Array.isArray(fallback)) return primary
    return primary.map((x, i) => mergeFallback(x, fallback[i]))
  }
  if (primary && typeof primary === 'object') {
    const backup = fallback && typeof fallback === 'object' ? fallback : {}
    const r = {}
    for (const k of uniqueValues(Object.keys(primary).concat(Object.keys(backup)))) r[k] = mergeFallback(primary[k], backup[k])
    return r
  }
  return cleanValue(primary) ? primary : fallback
}

function parseIp2location(html) {
  if (!html) return null
  const usage = html.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*\(([A-Z]+(?:\/[A-Z]+)*)\)/i) || html.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*([A-Z]+(?:\/[A-Z]+)*)\b/i)
  const fraud = html.match(/Fraud\s*Score<\/label>\s*<p[^>]*>\s*(\d+(?:\.\d+)?)/i)
  const proxyBlock = html.match(/>Proxy<\/label>\s*<p[^>]*>([\s\S]{0,300}?)<\/p>/i)
  const proxy = proxyBlock ? proxyBlock[1].match(/\b(Yes|No)\b/i) : null
  const country = html.match(/>Country<\/label>[\s\S]{0,400}?<a[^>]*>([^(<]+)\(([A-Z]{2})\)<\/a>/i)
  const city = html.match(/>City<\/label>\s*<p[^>]*>\s*([^<]+)<\/p>/i)
  const asn = html.match(/>ASN<\/label>[\s\S]{0,400}?<a[^>]*>\s*(?:AS)?(\d+)<\/a>/i)
  const asOrg = html.match(/>AS<\/label>[\s\S]{0,400}?<a[^>]*>\s*([^<]+)<\/a>/i)
  if (!usage && !fraud && !proxy && !country && !asn) return null
  return {
    country_code: country ? country[2].toUpperCase() : null,
    country_name: country ? cleanValue(country[1]) : null,
    city_name: city ? cleanValue(city[1]) : null,
    asn: asn ? asn[1] : null,
    as: asOrg ? cleanValue(asOrg[1]) : null,
    usage_type: usage ? usage[1].toUpperCase() : null,
    fraud_score: fraud ? Number(fraud[1]) : null,
    is_proxy: proxy ? proxy[1].toLowerCase() === 'yes' : null,
  }
}

function ip2locationOf(data) {
  const full = data.ip2locationFull
  if (full && typeof full === 'object' && (cleanValue(full.ip) || cleanValue(full.usage_type) || numberOrNull(full.fraud_score) !== null || full.proxy)) return full
  return parseIp2location(data.ip2location)
}

function proxycheckRecord(payload) {
  if (!payload || String(payload.status || '').toLowerCase() !== 'ok') return null
  const key = Object.keys(payload).find(k => k !== 'status' && k !== 'query time' && k !== 'message' && payload[k] && typeof payload[k] === 'object')
  return key ? payload[key] : null
}

/** 基础信息按整组来源选, 不把不同数据库的国家和 ASN 拼成一条 */
function buildBasic(ip, data) {
  const ipapi = data.ipapi || {}
  const ippure = data.ippure && !data.ippure.split ? data.ippure : {}
  const ip2 = ip2locationOf(data) || {}
  const ipinfo = (data.ipinfo && data.ipinfo.data) || {}
  const ipwhois = data.ipwhois && data.ipwhois.success !== false ? data.ipwhois : {}
  const proxycheck = proxycheckRecord(data.proxycheck) || {}
  const maxmind = mergeFallback(data.maxmind, data.maxmindBackup) || {}
  const mmASN = maxmind.ASN || {}
  const mmCity = maxmind.City || {}
  const mmCountry = maxmind.Country || {}
  const mmRegion = cleanValue(mmCountry.IsoCode) || cleanValue(mmCountry.Name) ? mmCountry : valueAt(mmCity, 'Country') || {}
  const mmParts = uniqueValues((Array.isArray(mmCity.Subdivisions) ? mmCity.Subdivisions.map(x => x && x.Name) : []).concat(mmCity.Name))
  const location = ipapi.location || {}
  const profile = (cc, country, cityParts, asn, organization, timezone, route, registered) => ({
    cc: cleanValue(cc), country: cleanValue(country), cityParts, asn: cleanASN(asn), organization: cleanValue(organization),
    timezone: cleanValue(timezone), route: cleanValue(route), registered: cleanValue(registered),
  })
  const profiles = [
    profile(mmRegion.IsoCode, mmRegion.Name, mmParts, mmASN.AutonomousSystemNumber, mmASN.AutonomousSystemOrganization, valueAt(mmCity, 'Location.TimeZone'), mmASN.Network || maxmind.Network, valueAt(mmCountry, 'RegisteredCountry.IsoCode')),
    profile(ipinfo.country, ipinfo.country_name, uniqueValues([ipinfo.region, ipinfo.city]), valueAt(ipinfo, 'asn.asn'), valueAt(ipinfo, 'asn.name'), ipinfo.timezone, valueAt(ipinfo, 'asn.route'), valueAt(ipinfo, 'abuse.country')),
    profile(location.country_code, location.country, uniqueValues([location.state, location.city]), valueAt(ipapi, 'asn.asn'), valueAt(ipapi, 'asn.org'), location.timezone, valueAt(ipapi, 'asn.route')),
    profile(ipwhois.country_code, ipwhois.country, uniqueValues([ipwhois.region, ipwhois.city]), valueAt(ipwhois, 'connection.asn'), valueAt(ipwhois, 'connection.org'), valueAt(ipwhois, 'timezone.id')),
    profile(ippure.countryCode, ippure.country, uniqueValues([ippure.city]), ippure.asn, ippure.asOrganization, ippure.timezone),
    profile(ip2.country_code, ip2.country_name, uniqueValues([ip2.city_name]), ip2.asn, ip2.as, ip2.time_zone),
    profile(proxycheck.isocode, proxycheck.country, uniqueValues([proxycheck.region, proxycheck.city]), proxycheck.asn, proxycheck.organisation, proxycheck.timezone, proxycheck.range),
  ]
  const place = profiles.find(x => x.cc || x.country) || profiles.find(x => x.asn || x.organization || x.cityParts.length) || { cityParts: [] }
  const loon = networkOf(ip)
  const net = profiles.find(x => x.asn) || (loon.asn ? loon : null) || profiles.find(x => x.organization) || (loon.organization ? loon : null) || place
  return {
    ip,
    cc: (place.cc || '').toUpperCase(),
    country: place.country,
    city: place.cityParts.slice(0, 2).join(' · '),
    asn: net.asn,
    org: net.organization || (net.asn && net.asn === loon.asn ? loon.organization : ''),
    registered: (place.registered || '').toUpperCase(),
    timezone: place.timezone,
    route: net.route,
  }
}

/** 各数据库这次有没有拿到可用结果; IPQS 额度用完是上游的事, 不算失败 */
function buildSources(data) {
  const quota = data.ipqs && data.ipqs.success === false && /insufficient\s+credits?/i.test(data.ipqs.message || '')
  const has = (v, ...paths) => !!v && paths.some(p => cleanValue(valueAt(v, p)))
  const list = [
    ['MaxMind', has(data.maxmind, 'Country.IsoCode', 'ASN.AutonomousSystemNumber') || has(data.maxmindBackup, 'Country.IsoCode', 'ASN.AutonomousSystemNumber')],
    ['ipapi', has(data.ipapi, 'ip')],
    ['IPinfo', has(data.ipinfo, 'data.ip', 'data.country')],
    ['IPWhois', has(data.ipwhois, 'ip', 'country_code') && data.ipwhois.success !== false],
    ['IP2Location', !!ip2locationOf(data)],
    ['Scamalytics', numberOrNull(valueAt(data, 'scamalytics.scamalytics.scamalytics_score')) !== null],
    ['AbuseIPDB', has(data.abuseipdb, 'data.usageType') || numberOrNull(valueAt(data, 'abuseipdb.data.abuseConfidenceScore')) !== null],
    ['ipdata', has(data.ipdata, 'ip', 'country_code')],
    ['proxycheck', !!proxycheckRecord(data.proxycheck)],
    ['ipregistry', !!data.ipregistry],
    ['DB-IP', /Estimated threat level for this IP address is|<th class=['"]text-center['"]>Crawler/i.test(data.dbip || '')],
  ]
  if (data.ippure && !data.ippure.split) list.push(['IPPure', true])
  else if (!data.ippure) list.push(['IPPure', false])
  if (!quota) list.push(['IPQS', numberOrNull(valueAt(data, 'ipqs.fraud_score')) !== null])
  return compact({
    ok: list.filter(x => x[1]).length,
    total: list.length,
    failed: list.filter(x => !x[1]).map(x => x[0]),
    skipped: quota ? ['IPQS 上游额度不足'] : [],
    split: data.ippure && data.ippure.split ? data.ippure.ip : '',
    reasons: Object.keys(data.reasons).length ? data.reasons : null,
  })
}

function buildTypes(data) {
  const ip2 = ip2locationOf(data)
  return [
    ['ipinfo', valueAt(data, 'ipinfo.data.asn.type'), valueAt(data, 'ipinfo.data.company.type')],
    ['ipregistry', valueAt(data, 'ipregistry.connection.type'), valueAt(data, 'ipregistry.company.type')],
    ['ipapi', valueAt(data, 'ipapi.asn.type'), valueAt(data, 'ipapi.company.type')],
    ['ip2location', ip2 && ip2.usage_type, valueAt(ip2, 'as_info.as_usage_type')],
    ['abuseipdb', valueAt(data, 'abuseipdb.data.usageType'), null],
  ].map(([source, usage, company]) => ({ source, type: (cleanValue(usage) || cleanValue(company)).toLowerCase() })).filter(x => x.type)
}

function scoreRow(source, value, levels) {
  const score = numberOrNull(value)
  const level = score === null ? null : levels.find(x => score >= x[0])
  return level ? { source, score: round(score, 2), text: level[1] } : null
}

function buildScores(data) {
  const ip2 = ip2locationOf(data)
  const abuser = String(valueAt(data, 'ipapi.company.abuser_score') || '').match(/([0-9.]+)\s*\(([^)]+)\)/)
  const ratio = abuser ? Number(abuser[1]) : NaN
  const words = { 'very low': '极低', low: '低', elevated: '较高', high: '高', 'very high': '极高' }
  const dbip = String(data.dbip || '').match(/Estimated threat level for this IP address is\s*<span[^>]*>\s*([^<\s]+)/i)
  const dbipLevel = dbip ? dbip[1].toLowerCase() : ''
  return [
    data.ippure && !data.ippure.split ? scoreRow('ippure', data.ippure.fraudScore, [[80, '极高'], [70, '高'], [40, '中'], [0, '低']]) : null,
    Number.isFinite(ratio) ? { source: 'ipapi', score: round(ratio * 100, 2), text: words[abuser[2].toLowerCase()] || abuser[2] } : null,
    scoreRow('ip2location', ip2 && ip2.fraud_score, [[66, '高'], [33, '中'], [0, '低']]),
    scoreRow('scamalytics', valueAt(data, 'scamalytics.scamalytics.scamalytics_score'), [[90, '极高'], [60, '高'], [20, '中'], [0, '低']]),
    scoreRow('abuseipdb', valueAt(data, 'abuseipdb.data.abuseConfidenceScore'), [[75, '建议封禁'], [25, '高'], [0, '低']]),
    data.ipqs && data.ipqs.success !== false ? scoreRow('ipqs', data.ipqs.fraud_score, [[90, '高'], [85, '存在风险'], [75, '可疑'], [0, '低']]) : null,
    dbipLevel ? { source: 'db-ip', text: dbipLevel === 'high' ? '高' : dbipLevel === 'medium' ? '中' : '低' } : null,
  ].filter(Boolean)
}

/** DB-IP 页面的 Crawler / Proxy / Attack 三列依次是 Yes 或 No, 这里要第二列 */
function dbipProxy(html) {
  const start = String(html || '').search(/<th class=['"]text-center['"]>Crawler/i)
  if (start < 0) return null
  const cells = html.slice(start, start + 8000).match(/<span class="sr-only">\s*(Yes|No)(?:&nbsp;|\s)*<\/span>/gi) || []
  return cells.length > 1 ? /Yes/i.test(cells[1]) : null
}

function buildFactors(data) {
  const row = (source, proxy, vpn, tor, hosting) => {
    const flags = compact({ proxy: booleanOrNull(proxy), vpn: booleanOrNull(vpn), tor: booleanOrNull(tor), hosting: booleanOrNull(hosting) })
    return Object.keys(flags).length ? Object.assign({ source }, flags) : null
  }
  const ip2 = ip2locationOf(data)
  const p2 = (ip2 && ip2.proxy) || {}
  const ipapi = data.ipapi
  const reg = valueAt(data, 'ipregistry.security')
  const ipqs = data.ipqs && data.ipqs.success !== false ? data.ipqs : null
  const root = data.scamalytics
  const scam = root && root.scamalytics
  const threat = valueAt(data, 'ipdata.threat')
  const privacy = valueAt(data, 'ipinfo.data.privacy')
  return [
    ip2 && row('ip2location', anyTrue([ip2.is_proxy, p2.is_public_proxy, p2.is_web_proxy]), p2.is_vpn, p2.is_tor, p2.is_data_center),
    ipapi && row('ipapi', ipapi.is_proxy, ipapi.is_vpn, ipapi.is_tor, ipapi.is_datacenter),
    reg && row('ipregistry', reg.is_proxy, reg.is_vpn, anyTrue([reg.is_tor, reg.is_tor_exit]), reg.is_cloud_provider),
    ipqs && row('ipqs', ipqs.proxy, ipqs.vpn, ipqs.tor, null),
    scam && row('scamalytics', valueAt(root, 'external_datasources.firehol.is_proxy'), valueAt(scam, 'scamalytics_proxy.is_vpn'), valueAt(root, 'external_datasources.x4bnet.is_tor'), valueAt(scam, 'scamalytics_proxy.is_datacenter')),
    threat && row('ipdata', threat.is_proxy, null, threat.is_tor, threat.is_datacenter),
    privacy && row('ipinfo', privacy.proxy, privacy.vpn, privacy.tor, privacy.hosting),
    row('db-ip', dbipProxy(data.dbip)),
  ].filter(Boolean)
}

// 外部探针 (Globalping): 从国内三网探针看出口, 或从出口同网络的探针看回国路径, 都不是节点本机
const ispByASN = asn => ({ 4134: 'ct', 4837: 'cu', 9808: 'cm' }[asn] || '')

async function startGlobalping(type, target, locations, options) {
  const created = await requestJson('https://api.globalping.io/v1/measurements', {
    method: 'POST',
    timeout: 8000,
    body: JSON.stringify({ type, target, locations, measurementOptions: options }),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'loon-panel/1.0' },
  })
  if (!created || !created.id) throw new Error('未返回任务编号')
  return created.id
}

async function pollGlobalping(id, attempts) {
  let measurement = null
  for (let i = 0; i < attempts; i++) {
    if (checkEnd - Date.now() < 1200) break
    await sleep(i ? 1400 : 900)
    const polled = await capture(requestJson(`https://api.globalping.io/v1/measurements/${encodeURIComponent(id)}`, { timeout: 8000 }))
    if (polled.ok) measurement = polled.value
    if (measurement && measurement.status !== 'in-progress') break
  }
  return measurement || { error: 'Globalping 测量结果未返回' }
}

async function measureChina(type, ip, options, attempts = 4) {
  const created = await capture(startGlobalping(type, ip, CHINA_PROBES, options))
  if (!created.ok) return { error: `Globalping 创建测量失败：${created.error}` }
  return pollGlobalping(created.value, attempts)
}

function hopASPath(hops) {
  const path = []
  for (const hop of Array.isArray(hops) ? hops : []) {
    const given = Array.isArray(hop && hop.asn) ? hop.asn.map(cleanASN).filter(Boolean) : []
    const ip = given.length ? '' : normalizeIP(hop && hop.resolvedAddress)
    const found = ip ? networkOf(ip).asn : ''
    path.push(...(found ? [found] : given))
  }
  return path.filter((x, i) => x !== path[i - 1])
}

function routeSummary(path) {
  const clues = CHINA_ROUTE_ASNS.filter(asn => path.includes(asn))
  return clues.length ? `经 ${clues.map(asn => `AS${asn}`).join('、')}` : ''
}

async function collectInbound(ip) {
  const m = await measureChina('traceroute', ip, { protocol: 'ICMP' })
  if (m.error) return m
  const rows = (Array.isArray(m.results) ? m.results : []).map(item => {
    const hops = valueAt(item, 'result.hops')
    const asPath = hopASPath(hops)
    return compact({ isp: ispByASN(cleanASN(valueAt(item, 'probe.asn'))), hops: Array.isArray(hops) ? hops.length : 0, asPath, summary: routeSummary(asPath) })
  })
  return { rows: rows.filter(x => x.isp) }
}

async function collectPing(ip) {
  const m = await measureChina('ping', ip, { protocol: 'ICMP', packets: 4 })
  if (m.error) return m
  const rows = (Array.isArray(m.results) ? m.results : []).map(item => {
    const result = item.result || {}
    const stats = result.stats || {}
    const times = (Array.isArray(result.timings) ? result.timings : []).map(x => numberOrNull(x && x.rtt)).filter(x => x !== null)
    return compact({
      isp: ispByASN(cleanASN(valueAt(item, 'probe.asn'))),
      avg: numberOrNull(stats.avg),
      loss: numberOrNull(stats.loss),
      jitter: times.length > 1 ? round(deviation(times), 2) : null,
    })
  })
  return { rows: rows.filter(x => x.isp) }
}

async function collectMTR(ip) {
  const m = await measureChina('mtr', ip, { protocol: 'ICMP', packets: 5 }, 6)
  if (m.error) return m
  const rows = (Array.isArray(m.results) ? m.results : []).map(item => {
    const hops = valueAt(item, 'result.hops')
    const list = Array.isArray(hops) ? hops : []
    const last = list.slice().reverse().find(x => x && x.resolvedAddress)
    const stats = (last && last.stats) || {}
    return compact({
      isp: ispByASN(cleanASN(valueAt(item, 'probe.asn'))),
      hops: list.length,
      reached: !!last && normalizeIP(last.resolvedAddress) === normalizeIP(m.target),
      avg: numberOrNull(stats.avg),
      loss: numberOrNull(stats.loss),
      jitter: numberOrNull(stats.jAvg),
    })
  })
  return { rows: rows.filter(x => x.isp) }
}

async function collectBackhaul(ip, data) {
  const basic = buildBasic(ip, data)
  const city = cleanValue(valueAt(data, 'ipinfo.data.city')) || [cleanValue(valueAt(data, 'maxmindBackup.City.Name'))].find(x => /^[\x20-\x7e]+$/.test(x)) || ''
  const candidates = []
  if (basic.asn) candidates.push({ match: '同 ASN', locations: [{ asn: Number(basic.asn), limit: 1 }] })
  if (basic.cc && city) candidates.push({ match: '同城市', locations: [{ country: basic.cc, city, limit: 1 }] })
  if (basic.cc) candidates.push({ match: '同国家', locations: [{ country: basic.cc, limit: 1 }] })
  if (!candidates.length) return { error: '未取得出口 ASN 或国家，无法选择探针' }
  let first = ''
  let match = ''
  const failures = []
  for (const c of candidates) {
    const created = await capture(startGlobalping('traceroute', BACKHAUL_TARGETS[0].ip, c.locations, { protocol: 'ICMP' }))
    if (created.ok) {
      first = created.value
      match = c.match
      break
    }
    failures.push(`${c.match} ${created.error}`)
  }
  if (!first) return { error: `Globalping 未找到可用探针：${shorten(failures.join('；'), 60)}` }
  // 联通、移动复用第一次测量的同一个探针
  const others = await Promise.all(BACKHAUL_TARGETS.slice(1).map(t => capture(startGlobalping('traceroute', t.ip, first, { protocol: 'ICMP' }))))
  const ids = [first].concat(others.map(x => (x.ok ? x.value : '')))
  const measured = await Promise.all(ids.map(id => (id ? pollGlobalping(id, 5) : { error: '创建测量失败' })))
  const routes = BACKHAUL_TARGETS.map((t, i) => {
    const m = measured[i]
    const item = !m.error && Array.isArray(m.results) ? m.results[0] : null
    if (!item) return { isp: t.isp, carrier: t.carrier, error: m.error || '测量未返回结果' }
    const probe = item.probe || {}
    const hops = valueAt(item, 'result.hops')
    const asPath = hopASPath(hops)
    return {
      isp: t.isp,
      probe: [probe.asn ? `AS${cleanASN(probe.asn)}` : '', cleanValue(probe.city) || cleanValue(probe.country), match].filter(Boolean).join(' · '),
      hops: Array.isArray(hops) ? hops.length : 0,
      asPath,
      summary: routeSummary(asPath),
    }
  })
  return { routes }
}

// 网络身份、黑名单、DNS、稳定性、测速
async function ripeStat(endpoint, params) {
  const query = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
  const r = await requestJson(`https://stat.ripe.net/data/${endpoint}/data.json?${query}&sourceapp=loon-panel`, { timeout: 8000 })
  if (!r || r.status !== 'ok' || !r.data) throw new Error(cleanValue(r && r.message) || 'RIPEstat 响应无效')
  return r.data
}

function asPathOf(v) {
  const list = (Array.isArray(v) ? v : String(v || '').split(/\s+/)).map(x => String(x || '').trim()).filter(x => /^(?:AS)?\d+$/i.test(x)).map(cleanASN)
  return list.filter((x, i) => x !== list[i - 1])
}

/** 公共路由采集器看到的路径, 是控制面的样本, 不是节点发出的数据路径 */
function buildBGPPath(glass, status) {
  const collectors = Array.isArray(glass && glass.rrcs) ? glass.rrcs : []
  const paths = []
  for (const c of collectors) {
    for (const peer of Array.isArray(c && c.peers) ? c.peers : []) {
      const path = asPathOf(peer && peer.as_path)
      if (path.length) paths.push({ collector: cleanValue(c.location) || cleanValue(c.rrc), path })
    }
  }
  if (!paths.length) return null
  const seen = new Set()
  const first = cleanASN(valueAt(status, 'first_seen.origin'))
  const last = cleanASN(valueAt(status, 'last_seen.origin'))
  return compact({
    count: paths.length,
    collectors: collectors.length,
    seen: numberOrNull(valueAt(status, 'visibility.v4.ris_peers_seeing')),
    peers: numberOrNull(valueAt(status, 'visibility.v4.total_ris_peers')),
    samples: paths.filter(x => { const k = x.path.join(' '); return !seen.has(k) && seen.add(k) }).slice(0, 4),
    clues: CHINA_ROUTE_ASNS.map(asn => ({ asn, count: paths.filter(x => x.path.includes(asn)).length })).filter(x => x.count),
    origin: first && last && first !== last ? `AS${first} → AS${last}` : '',
  })
}

async function collectBGP(ip, full) {
  const network = await capture(ripeStat('network-info', { resource: ip }))
  if (!network.ok) return { error: `网络信息未返回：${network.error}` }
  const prefix = cleanValue(network.value.prefix)
  if (!prefix) return { error: 'RIPEstat 未返回可路由前缀' }
  const asns = uniqueValues(Array.isArray(network.value.asns) ? network.value.asns.map(cleanASN) : [])
  const [overview, glass, routing, ...rpki] = await Promise.all([
    capture(ripeStat('prefix-overview', { resource: prefix })),
    full ? capture(ripeStat('looking-glass', { resource: prefix })) : null,
    full ? capture(ripeStat('routing-status', { resource: prefix })) : null,
    ...asns.map(asn => capture(ripeStat('rpki-validation', { resource: asn, prefix }))),
  ])
  const holders = {}
  for (const x of (overview.ok && overview.value.asns) || []) holders[cleanASN(x && x.asn)] = cleanValue(x && x.holder)
  return compact({
    prefix,
    rpki: rpki.map(x => (x.ok ? String(x.value.status || '').trim().toLowerCase() : '')).filter(Boolean)[0],
    holder: asns.map(asn => holders[asn]).filter(Boolean)[0],
    path: full && glass.ok ? buildBGPPath(glass.value, routing.ok ? routing.value : null) : null,
  })
}

function loonARecords(domain, options) {
  return new Promise((resolve, reject) => {
    $dns.query(Object.assign({ domain, timeout: 3000 }, options), (error, result) => {
      if (error) {
        if (error.code === 'NO_ANSWER') return resolve([])   // NXDOMAIN 或空应答: 没有列入
        return reject(new Error(`${error.code || 'DNS'} ${error.message || ''}`.trim()))
      }
      resolve((result && Array.isArray(result.answers) ? result.answers : []).filter(x => x && x.type === 'A').map(x => String(x.value)))
    })
  })
}

const hasLoonDNS = () => typeof $dns !== 'undefined' && typeof $dns.query === 'function'

async function dohARecords(domain) {
  const r = await requestJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, { timeout: 5000, headers: { Accept: 'application/dns-json' } })
  if (r.Status === 3) return []   // NXDOMAIN: 没有列入
  if (r.Status !== 0) throw new Error(`DNS 状态 ${r.Status}`)
  return (Array.isArray(r.Answer) ? r.Answer : []).filter(x => x && x.type === 1).map(x => String(x.data))
}

async function collectDNSBL(ip) {
  const reversed = ip.split('.').reverse().join('.')
  // $dns 要 Build 988, 旧版本经节点查 DoH
  const lookup = hasLoonDNS() ? loonARecords : dohARecords
  const rows = await Promise.all(DNSBL_ZONES.map(async list => {
    const r = await capture(lookup(`${reversed}.${list}`))
    if (!r.ok) return { list, error: r.error }
    // 127.255.255.x 是黑名单拒绝公共解析器或超额查询的回复, 不算命中
    const hit = r.value.find(x => /^127\./.test(x) && !/^127\.255\.255\./.test(x))
    if (!hit && r.value.some(x => /^127\.255\.255\./.test(x))) return { list, error: '查询被列表拒绝' }
    return { list, hit: hit || '' }
  }))
  const checked = rows.filter(x => !x.error)
  if (!checked.length) return { error: `黑名单查询均失败：${shorten(rows[0].error, 40)}` }
  return {
    checked: checked.length,
    listed: checked.filter(x => x.hit).map(({ list, hit }) => ({ list, hit })),
    failed: rows.filter(x => x.error).map(x => x.list),
  }
}

async function collectDNSLeak() {
  const randomLabel = () => {
    let s = ''
    while (s.length < 32) s += Math.random().toString(36).slice(2)
    return s.slice(0, 32)
  }
  const settled = await Promise.all([0, 1, 2].map(() => capture(requestJson(`http://${randomLabel()}.edns.ip-api.com/json`, {
    timeout: 6000,
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  }))))
  const servers = []
  for (const r of settled) {
    const dns = r.ok && r.value && r.value.dns
    const ip = normalizeIP(dns && dns.ip)
    if (!ip || servers.some(x => x.ip === ip)) continue
    const n = networkOf(ip)
    servers.push(compact({ ip, cc: n.cc, org: cleanValue(String(dns.geo || '').split(' - ').slice(1).join(' - ')) || n.organization }))
  }
  const ecs = settled.map(x => x.ok && x.value && x.value.edns).find(x => x && x.ip)
  if (servers.length) return compact({ servers, ecs: ecs ? compact({ ip: cleanValue(ecs.ip), geo: cleanValue(ecs.geo) }) : null })
  const failed = settled.find(x => !x.ok)
  return { error: `泄漏检测服务未返回解析器：${failed ? failed.error : '响应缺少解析器信息'}` }
}

/** 手机本地的系统 DNS 有没有被污染, 和节点无关; IP 归属经节点查, 本地查可能也被干扰 */
async function collectDNSPollution() {
  if (!hasLoonDNS()) return { error: '需要 Loon 3.5.1(988) 或更高版本' }
  const answers = await Promise.all(DNS_TARGETS.map(t => capture(loonARecords(t.domain, { server: 'system' }))))
  const ips = [...new Set(answers.flatMap(x => (x.ok ? x.value : [])))]
  if (!ips.length) return { error: '系统 DNS 没有返回结果' }
  const lookup = await requestJson('http://ip-api.com/batch?fields=status,query,as', {
    method: 'POST',
    timeout: 6000,
    body: JSON.stringify(ips),
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' },
  })
  const owners = {}
  for (const x of Array.isArray(lookup) ? lookup : []) if (x && x.status === 'success' && x.as) owners[x.query] = x.as
  let checked = 0
  const polluted = []
  const hits = []
  DNS_TARGETS.forEach((t, i) => {
    const known = (answers[i].ok ? answers[i].value : []).filter(ip => owners[ip])
    if (!known.length) return
    checked++
    const foreign = known.find(ip => cleanASN(owners[ip]) !== t.asn)
    if (!foreign) return
    polluted.push(t.domain)
    hits.push({ domain: t.domain, ip: foreign, owner: owners[foreign] })
  })
  return checked ? { checked, polluted, hits } : { error: '查不到解析结果的 IP 归属' }
}

async function collectStability() {
  return Promise.all(STABILITY_TARGETS.map(async ({ name, url }) => {
    const samples = []
    for (let i = 0; i < 3 && checkEnd - Date.now() >= 1200; i++) {
      const start = Date.now()
      const r = await capture(request('GET', `${url}${url.includes('?') ? '&' : '?'}r=${start}-${i}`, { timeout: 6000, allowHttpErrors: true }))
      samples.push({ ok: r.ok && r.value.status >= 200 && r.value.status < 400, ms: Date.now() - start })
    }
    const good = samples.filter(x => x.ok).map(x => x.ms)
    return compact({ target: name, ok: good.length, total: samples.length, median: median(good), max: good.length ? Math.max(...good) : null })
  }))
}

async function collectSpeed() {
  // 不走请求队列, 保证几个连接同时下载
  const settled = await Promise.all(Array.from({ length: SPEED_CONNECTIONS }, (_, i) => capture(sendRequest('GET', `https://speed.cloudflare.com/__down?bytes=${SPEED_BYTES}&r=${Date.now()}-${i}`, {
    timeout: 12000,
    binaryMode: true,
    headers: { Accept: 'application/octet-stream', 'Accept-Encoding': 'identity', 'User-Agent': MOBILE_UA },
  }))))
  let bytes = 0
  let done = 0
  let ms = 0
  let conns = 0
  let failed = ''
  for (const r of settled) {
    const got = r.ok ? (r.value.body && (r.value.body.byteLength ?? r.value.body.length)) || 0 : 0
    bytes += got
    if (got >= SPEED_BYTES * 0.9) {
      done += got
      conns++
      ms = Math.max(ms, r.value.elapsedMs)
    } else {
      failed = failed || (r.ok ? `实收 ${got} 字节` : shorten(r.error, 30))
    }
  }
  if (!conns) return { error: `测速连接均未完成：${failed || '无响应'}` }
  return { down: round((done * 8) / (ms * 1000), 2), bytes, conns }
}

async function uploadSample(bytes) {
  const r = await sendRequest('POST', `https://speed.cloudflare.com/__up?bytes=${bytes}&r=${Date.now()}`, {
    timeout: 4500,
    body: '0123456789abcdef'.repeat(bytes / 16),
    headers: { Accept: '*/*', 'Content-Type': 'application/octet-stream', 'User-Agent': MOBILE_UA },
  })
  return { ms: r.elapsedMs, up: round((bytes * 8) / (r.elapsedMs * 1000), 2) }
}

/** 先传小样本, 很快传完再换大样本, 小样本在快线路上测不准 */
async function collectUpload() {
  const small = await uploadSample(UPLOAD_SMALL)
  if (small.ms >= 900) return small
  const large = await capture(uploadSample(UPLOAD_LARGE))
  return large.ok ? large.value : small
}

/** 一次深度检测; 拿不到的项目不写字段, 原因放进 errors */
async function collectDeep(speed, full) {
  const start = Date.now()
  const discovery = await discoverIP()
  const ip = discovery.ip
  if (!isIPv4(ip)) throw new Error('没查到这个节点的 IPv4 出口')
  const databases = collectDatabases(ip, discovery)
  const [data, media, bgp, inbound, ping, stability, dnsbl, dnsleak, dns, backhaul, mtr] = await Promise.all([
    databases,
    collectMedia(),
    safeTask(collectBGP(ip, full)),
    safeTask(collectInbound(ip)),
    safeTask(collectPing(ip)),
    safeTask(collectStability()),
    safeTask(collectDNSBL(ip)),
    safeTask(collectDNSLeak()),
    safeTask(collectDNSPollution()),
    databases.then(d => safeTask(collectBackhaul(ip, d))),   // 探针要按出口的 ASN 和城市选
    full ? safeTask(collectMTR(ip)) : null,
  ])
  const result = {}
  const errors = {}
  const put = (key, value, error) => {
    if (error) errors[key] = error
    if (value && Object.keys(value).length) result[key] = value
    else if (!error) errors[key] = '未返回数据'
  }
  const basic = buildBasic(ip, data)
  put('basic', compact(basic))
  put('egress', buildEgress(discovery.seen, ip).map(x => compact(Object.assign({}, x, x.main ? { asn: x.asn || basic.asn, cc: x.cc || basic.cc } : {}))))
  put('types', buildTypes(data))
  put('scores', buildScores(data))
  put('factors', buildFactors(data))
  put('media', media)
  const regional = media.filter(x => /^[A-Z]{2}$/.test(x.region || ''))
  put('regions', regional.length ? Object.assign(compact({ exit: basic.cc }), {
    mismatch: basic.cc ? regional.filter(x => x.region !== basic.cc).map(x => `${x.name}:${x.region}`) : [],
  }) : null)
  put('stability', stability.error ? null : stability, stability.error)
  put('ping', ping.rows, ping.error)
  put('inbound', inbound.rows, inbound.error)
  const routes = backhaul.routes || []
  const failed = routes.filter(x => x.error)
  put('backhaul', routes.filter(x => !x.error).map(compact), backhaul.error || (failed.length ? `${failed.map(x => x.carrier).join('、')}：${failed[0].error}` : ''))
  put('dnsbl', dnsbl.error ? null : { checked: dnsbl.checked, listed: dnsbl.listed }, dnsbl.error || (dnsbl.failed.length ? `未查询成功：${dnsbl.failed.join('、')}` : ''))
  put('dnsleak', dnsleak.error ? null : dnsleak, dnsleak.error)
  put('dns', dns.error ? null : dns, dns.error)
  const { path: bgpPath, ...bgpInfo } = bgp
  put('bgp', bgp.error ? null : bgpInfo, bgp.error)
  if (full) {
    put('mtr', mtr.rows, mtr.error)
    put('bgppath', bgpPath, bgp.error)
  }
  if (speed) {
    startCheck(checkNode, SPEED_BUDGET)
    const down = await safeTask(collectSpeed())
    startCheck(checkNode, UPLOAD_BUDGET)
    const up = await safeTask(collectUpload())
    put('speed', compact({ down: down.down, up: up.up, bytes: down.bytes, conns: down.conns }), [down.error, up.error].filter(Boolean).join('；'))
  }
  if (Object.keys(errors).length) result.errors = errors
  result.status = Object.assign(buildSources(data), { requests: requestCount.ok, sent: requestCount.total, ms: Date.now() - start })
  return result
}

/** 解锁结果不用每次都测: 在用的节点 6 小时一次, 每轮最多几个 */
async function refreshMedia(store, nodes, deadline) {
  const due = nodes.filter(n => store.nodes[n] && store.nodes[n].ok && !(store.media[n] && Date.now() - store.media[n].t < MEDIA_EVERY)).slice(0, MEDIA_PER_RUN)
  for (const node of due) {
    const left = deadline - Date.now()
    if (left < 15000) break
    startCheck(node, Math.min(left, CHECK_BUDGET))
    const list = await withBudget(collectMedia(), left)
    if (list && list.some(x => x.status !== 'unknown')) store.media[node] = { t: Date.now(), list }   // 全没测出来就下次再试
  }
}

// ─────────────────────────────────────────────────────────────
// 数据地址 / 操作地址
// ─────────────────────────────────────────────────────────────
function parseQuery(url) {
  const out = {}
  const i = url.indexOf('?')
  if (i < 0) return out
  const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch (e) { return s } }
  for (const part of url.slice(i + 1).split('#')[0].split('&')) {
    if (!part) continue
    const j = part.indexOf('=')
    out[dec(j < 0 ? part : part.slice(0, j))] = dec(j < 0 ? '' : part.slice(j + 1))
  }
  return out
}

/** 只列字段名, 不含内容: 用来确认这台设备的 Loon 到底提供了什么 */
function configShape(conf) {
  const first = Array.isArray(conf.all_policy_groups) ? conf.all_policy_groups[0] : null
  return { keys: Object.keys(conf), group: first && typeof first === 'object' ? Object.keys(first) : [] }
}

function snapshot(state, store, result) {
  const mode = Number(state.conf.running_model)
  const body = {
    v: 1,
    version: VERSION,
    t: Date.now(),
    mode: mode === 0 || mode === 1 || mode === 2 ? mode : -1,
    final: clean(state.conf.final),
    global: clean(state.conf.global_proxy),
    groups: state.groups,
    nodes: store.nodes,
    check: store.check || null,
    direct: store.direct || null,
    media: store.media,
    deep: store.deep,
    locks: store.locks,
    events: store.events.slice().reverse(),
    opts: { notify: OPT.notify, auto: OPT.auto, net: OPT.net, lookup_direct: OPT.lookup_direct, timeout: OPT.timeout, test_url: OPT.test_url, ip_url: OPT.ip_url, push: !!(OPT.push_key && OPT.targets.length), full: OPT.groups },
    cfg: configShape(state.conf),
  }
  if (result) body.result = result
  return body
}

function respond(status, obj) {
  $done({
    response: {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify(obj),
    },
  })
}

async function handleSet(q) {
  const store = readStore()
  let result = { ok: true }
  let via = ''    // 切完要复测谁; 空 = 全部当前节点
  if (q.mode !== undefined && q.mode !== '') {
    const m = Number(q.mode)
    if (!$config.setRunningModel(m)) result = { ok: false, error: '模式切换失败' }
    else {
      // 当前节点: 全局直连测 DIRECT, 全局代理测全局策略, 分流测兜底策略
      const conf = readConfig()
      via = m === 0 ? 'DIRECT' : m === 2 ? clean(conf.global_proxy) : clean(conf.final)
    }
  } else if (q.group) {
    if (q.lock === '0') delete store.locks[q.group]
    else if (q.node && $config.setSelectPolicy(q.group, q.node)) {
      via = q.group
      if (q.lock === '1' || store.locks[q.group]) store.locks[q.group] = q.node   // 手动换节点时锁跟着走
    } else result = { ok: false, error: `${q.group} 切换失败` }
  }
  const state = await readState()
  const picked = result.ok && q.group && q.node ? state.groups.find(g => g.name === q.group) : null
  if (picked && picked.now !== q.node) {   // 接口接受了但没生效, 常见于 Loon 自动选节点的策略组
    result = { ok: false, error: `Loon 仍在用 ${picked.now}，这个策略组可能是自动选择的` }
    delete store.locks[q.group]
  }
  const skip = !result.ok || q.lock === '0' || q.quiet === '1'   // quiet: 一层层切时只有最后一步复测
  const targets = skip ? [] : via ? uniq([state.leafOf(via)]).filter(n => !state.gone.has(n)) : [...leaves(state), ...stuck(state)]
  await runChecks(store, targets, new Set(leaves(state)), REQ_BUDGET)
  writeStore(store)
  return snapshot(state, store, result)
}

async function handleOpts() {
  const store = readStore()
  const patch = JSON.parse($request.body || '{}')
  const opts = Object.assign({}, store.opts)
  for (const k of Object.keys(DEFAULT_OPTS)) {
    if (!(k in patch)) continue
    if (patch[k] === '') delete opts[k]
    else opts[k] = patch[k]
  }
  store.opts = opts
  Object.assign(OPT, DEFAULT_OPTS, opts)
  writeStore(store)
  return snapshot(await readState(), store, { ok: true })
}

async function handleDeep(q) {
  const store = readStore()
  const state = await readState()
  const node = q.node || (state.groups[0] && state.groups[0].leaf) || ''
  if (!node) return snapshot(state, store, { ok: false, error: '没有可检测的节点' })
  startCheck(node, CHECK_BUDGET)
  let data = null
  let why = '检测超时'
  try {
    data = await withBudget(collectDeep(q.speed === '1', q.full === '1'), DEEP_BUDGET)
  } catch (e) {
    why = errorText(e)
  }
  if (!data) return snapshot(state, store, { ok: false, error: why })
  const old = store.deep[node] || {}
  store.deep[node] = Object.assign(data, q.speed === '1' ? {} : { speed: old.speed }, q.full === '1' ? {} : { mtr: old.mtr, bgppath: old.bgppath })   // 这次没测的项保留上次结果
  store.deep[node].t = Date.now()
  if (Array.isArray(data.media)) store.media[node] = { t: Date.now(), list: data.media }
  writeStore(store)
  return snapshot(state, store, { ok: true })
}

async function handleClear(q) {
  const store = readStore()
  if (q.all === '1') {
    store.deep = {}
    store.nodes = {}
    store.media = {}
    store.events = []
    delete store.check
    delete store.direct
  } else if (q.node) {
    delete store.deep[q.node]
  }
  writeStore(store)
  return snapshot(await readState(), store, { ok: true })
}

/** 读数据时顺便补测: 自动类策略组自己换了节点后, 新节点要等下次定时体检才有结果, 小组件会显示未测.
 *  只补测在用但没有任何记录的节点, 最多 3 个, 5 秒内测完多少算多少, 小组件那边最多等 8 秒 */
async function handleData() {
  const state = await readState()
  const store = readStore()
  const missing = leaves(state).filter(n => !store.nodes[n]).slice(0, 3)
  if (missing.length) {
    await Promise.race([Promise.all(missing.map(async name => {
      const r = await probe(name)
      r.h = [r.ok ? r.ms : -1]
      r.fail = r.ok ? 0 : 1
      store.nodes[name] = r
    })), sleep(5000)])
    writeStore(store)
  }
  return snapshot(state, store)
}

async function handleRequest() {
  const url = $request.url
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (path === '/loon-panel/set') return respond(200, await handleSet(parseQuery(url)))
  if (path === '/loon-panel/clear') return respond(200, await handleClear(parseQuery(url)))
  if (path === '/loon-panel/deep') return respond(200, await handleDeep(parseQuery(url)))
  if (path === '/loon-panel/opts') return respond(200, await handleOpts())
  if (path === '/loon-panel/data') return respond(200, await handleData())
  respond(404, { v: 1, error: 'not found' })
}

async function handleCheck() {
  const net = /网络/.test(typeof $script === 'object' && $script ? clean($script.name) : '')
  if (net && !OPT.net) return $done()
  if (net) await sleep(3000)   // 刚切网络时连接还没恢复
  const start = Date.now()
  const store = readStore()
  let state = await readState()
  if (applyLocks(state, store)) state = await readState()
  const full = []
  if (!net) {
    for (const name of OPT.groups) {
      const g = state.groups.find(x => x.name === name)
      if (g) full.push(...g.subs)
    }
  }
  const current = leaves(state)
  await runChecks(store, uniq([...current, ...stuck(state), ...full.filter(n => !state.set.has(n))]), new Set(current), CRON_BUDGET)
  await checkDirect(store)
  if (handleDown(state, store)) state = await readState()
  const c = store.check
  if (net) {
    const bad = current.filter(n => store.nodes[n] && !store.nodes[n].ok).length
    addEvent(store, 'net', `网络切换，复测 ${c.tested} 个节点，${bad ? `${bad} 个不可用` : '全部正常'}`)
  } else {
    await refreshMedia(store, leaves(state), start + CRON_BUDGET)
  }
  writeStore(store)
  await pushReload()
  console.log(`体检完成 ${c.tested}/${c.total}, 用时 ${Math.round(c.took / 1000)} 秒`)
  $done()
}

const isRequest = typeof $request !== 'undefined' && $request && $request.url

;(isRequest ? handleRequest() : handleCheck()).catch(e => {
  console.log(`Loon 面板出错: ${e && e.message ? e.message : e}`)
  if (isRequest) respond(500, { v: 1, error: String(e && e.message ? e.message : e) })
  else $done()
})
