// Loon 面板 · 给 Scripting 小组件提供数据
// 定时任务 / 网络切换: 节点体检 (各策略组当前节点 + App 里指定策略组的全部节点)、直连出口、解锁检测、
//   锁定的策略组被还原就改回来、当前节点挂了发通知或自动切换, 结果写进 $persistentStore, 跑完可推送刷新小组件
// 请求 http://1.1.1.1/loon-panel/data: 返回模式、策略组、体检结果、解锁、事件记录等
// 请求 http://1.1.1.1/loon-panel/set: ?mode=0|1|2 切模式; ?group=…&node=… 切节点; ?group=…&node=…&lock=1 锁定, ?group=…&lock=0 解锁; 不带参数只复测
// 请求 http://1.1.1.1/loon-panel/deep?node=…: 对节点跑一次深度检测 (加 &speed=1 同时测速)
// POST http://1.1.1.1/loon-panel/opts: 保存 App 里的设置, 正文是要改的项 (JSON); 空字符串 = 恢复默认

const VERSION = '0.3.0'
const STORE_KEY = 'loon_panel'
const CORE_KEY = 'loon_panel_core'
// 检测核心库 (paperclip ipquality-web-test), 解锁和深度检测都用它, 这里不另写一份
const CORE_URL = 'https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/testing/loon/ipquality-web-test/ipquality-core.js'
const CORE_TTL = 86400000

// 设置都在 Scripting 的 App 里改, 存在 store.opts; 插件参数只留体检频率 (cron 只能写在规则里)
const DEFAULT_OPTS = {
  groups: [],       // 每次体检都测全部节点的策略组
  net: true,        // 网络切换后复测
  notify: false,    // 节点异常发通知; Loon 自己也会提示节点问题, 默认关
  auto: false,      // 挂了自动切到最快
  timeout: 5000,    // 单次超时 (毫秒)
  test_url: 'http://www.gstatic.com/generate_204',
  ip_url: 'https://api.ipify.org',
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
  return { conf, set, groups, leafOf }
}

// DIRECT 不算节点: 测试地址在国内直连本来就可能不通, 直连出口由 checkDirect 单独记录
const testable = name => !!name && !isBuiltin(name)

function uniq(list) {
  const seen = new Set()
  return list.filter(x => testable(x) && !seen.has(x) && seen.add(x))
}

/** 各策略组当前选中的节点; 一路下来还停在策略组上的 (没有选中项) 不测 */
const leaves = state => uniq(state.groups.map(g => g.leaf).filter(n => !state.set.has(n)))
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

async function probe(node) {
  const r = { t: Date.now(), ok: false, ms: 0 }
  const a = await get(OPT.test_url, node)
  if (a.error || !a.response) {
    r.err = clean(a.error).slice(0, 60) || '超时'
    return r
  }
  r.ok = true
  r.ms = a.ms
  const b = await get(OPT.ip_url, node)
  const ip = b.error ? '' : pickIP(b.data)
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
// 检测核心库: 下载 ipquality-core.js 缓存一天, 注入节点和开关后执行, 取 result.data
// ─────────────────────────────────────────────────────────────
function loadCore() {
  let cached = null
  try { cached = JSON.parse($persistentStore.read(CORE_KEY) || 'null') } catch (e) { cached = null }
  if (cached && cached.code && Date.now() - cached.t < CORE_TTL) return Promise.resolve(cached.code)
  return new Promise(resolve => {
    $httpClient.get({ url: CORE_URL, timeout: 12000 }, (error, response, body) => {
      if (!error && response && response.status === 200 && body) {
        $persistentStore.write(JSON.stringify({ t: Date.now(), code: body }), CORE_KEY)
        resolve(body)
      } else {
        resolve(cached ? cached.code : '')   // 下载失败时旧版本也能用
      }
    })
  })
}

function runCore(code, node, labels, budget) {
  return new Promise(resolve => {
    let done = false
    const finish = v => { if (!done) { done = true; resolve(v) } }
    setTimeout(() => finish(null), budget)
    const options = {
      read: label => (labels.indexOf(String(label || '')) >= 0 ? 'true' : 'false'),
      write: () => false,
      remove: () => false,
    }
    try {
      new Function('$done', '$persistentStore', '$environment', code)(
        result => finish(result && result.data && result.data.v === 1 ? result.data : null),
        options,
        { params: { node } },
      )
    } catch (e) {
      console.log(`检测核心库出错: ${e && e.message ? e.message : e}`)
      finish(null)
    }
  })
}

const MEDIA_LABELS = ['执行媒体与 AI 检测', '显示媒体与 AI 结果']
const DEEP_LABELS = MEDIA_LABELS.concat([
  '显示基础信息', '显示 IP 类型', '显示风险评分', '显示风险因素', '显示出口分流', '显示 BGP 信息', '显示地区一致性',
  '测试外部探针 Ping', '测试外部探针入站路径', '测试 HTTPS 稳定性', '检测 IP 黑名单', '检测 DNS 泄漏', '测试近似回程',
])
const SPEED_LABELS = ['测试多连接测速', '测试三网真实测速']

/** 解锁结果不用每次都测: 在用的节点 6 小时一次, 每轮最多几个 */
async function refreshMedia(store, nodes, deadline) {
  const due = nodes.filter(n => store.nodes[n] && store.nodes[n].ok && !(store.media[n] && Date.now() - store.media[n].t < MEDIA_EVERY)).slice(0, MEDIA_PER_RUN)
  if (!due.length) return
  const code = await loadCore()
  if (!code) return
  for (const node of due) {
    const left = deadline - Date.now()
    if (left < 15000) break
    const data = await runCore(code, node, MEDIA_LABELS, left)
    if (data && Array.isArray(data.media)) store.media[node] = { t: Date.now(), list: data.media }
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
    opts: { notify: OPT.notify, auto: OPT.auto, net: OPT.net, timeout: OPT.timeout, test_url: OPT.test_url, ip_url: OPT.ip_url, push: !!(OPT.push_key && OPT.targets.length), full: OPT.groups },
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
  const skip = !result.ok || q.lock === '0'
  const targets = skip ? [] : via ? uniq([state.leafOf(via)]) : [...leaves(state), ...stuck(state)]
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
  const code = await loadCore()
  if (!code) return snapshot(state, store, { ok: false, error: '检测核心库下载失败' })
  const labels = q.speed === '1' ? DEEP_LABELS.concat(SPEED_LABELS) : DEEP_LABELS
  const data = await runCore(code, node, labels, DEEP_BUDGET)
  if (!data) return snapshot(state, store, { ok: false, error: '检测超时或核心库版本不匹配' })
  const old = store.deep[node] || {}
  store.deep[node] = q.speed === '1' ? data : Object.assign({}, data, { speed: old.speed })   // 没测速时保留上次速度
  store.deep[node].t = Date.now()
  if (Array.isArray(data.media)) store.media[node] = { t: Date.now(), list: data.media }
  writeStore(store)
  return snapshot(state, store, { ok: true })
}

async function handleRequest() {
  const url = $request.url
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (path === '/loon-panel/set') return respond(200, await handleSet(parseQuery(url)))
  if (path === '/loon-panel/deep') return respond(200, await handleDeep(parseQuery(url)))
  if (path === '/loon-panel/opts') return respond(200, await handleOpts())
  if (path === '/loon-panel/data') return respond(200, snapshot(await readState(), readStore()))
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
