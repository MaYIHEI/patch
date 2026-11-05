// Loon 面板 · 给 Scripting 小组件提供数据
// 定时任务: 节点体检 (各策略组当前选中的节点 + 插件参数里指定策略组的全部节点), 结果写进 $persistentStore
// 请求 http://1.1.1.1/loon-panel/data: 返回模式、策略组、当前节点、体检结果
// 请求 http://1.1.1.1/loon-panel/set?mode=0|1|2 或 ?group=…&node=…: 切换后复测当前节点, 返回最新状态; 不带参数只复测当前节点

const STORE_KEY = 'loon_panel'
const ARG = typeof $argument === 'object' && $argument ? $argument : {}
const TEST_URL = ARG.test_url || 'http://www.gstatic.com/generate_204'
const IP_URL = ARG.ip_url || 'https://api.ipify.org'
const TIMEOUT = Number(ARG.timeout) > 0 ? Number(ARG.timeout) : 3000
const FULL_GROUPS = String(ARG.groups || '').split(/[,，]/).map(s => s.trim()).filter(Boolean)
const CRON_BUDGET = 100000   // 插件里定时任务 timeout=120 秒, 留余量
const REQ_BUDGET = 20000     // 操作地址 timeout=30 秒, 小组件按钮也等不了太久
const KEEP_MS = 3 * 86400000 // 3 天没再测的节点从结果里删掉

// ─────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse($config.getConfig() || '{}') } catch (e) { return {} }
}

const nameOf = x => (typeof x === 'string' ? x : x && typeof x.name === 'string' ? x.name : '')

function groupNames(conf) {
  const list = Array.isArray(conf.all_policy_groups) ? conf.all_policy_groups : []
  return list.map(nameOf).filter(Boolean)
}

/** 策略组的可选项; 文档说名字不对时可能一直不回调, 3 秒兜底 */
function subPolicies(group) {
  return new Promise(resolve => {
    let done = false
    const finish = v => { if (!done) { done = true; resolve(v) } }
    setTimeout(() => finish([]), 3000)
    try {
      $config.getSubPolicies(group, text => {
        let list = []
        try { list = text ? JSON.parse(text) : [] } catch (e) { list = [] }
        finish((Array.isArray(list) ? list : []).map(nameOf).filter(Boolean))
      })
    } catch (e) {
      finish([])
    }
  })
}

/** 一路往下找到真正的节点: 策略组选中的可能还是策略组 */
function leafOf(name, groupSet) {
  let cur = name
  for (let i = 0; i < 8 && groupSet.has(cur); i++) {
    const next = $config.getSelectedPolicy(cur)
    if (!next) break
    cur = next
  }
  return cur
}

async function readState() {
  const conf = readConfig()
  const names = groupNames(conf)
  const set = new Set(names)
  const subs = await Promise.all(names.map(subPolicies))
  const groups = names.map((name, i) => ({ name, now: $config.getSelectedPolicy(name) || '', leaf: leafOf(name, set), subs: subs[i] }))
  return { conf, set, groups }
}

const testable = name => !!name && !/^REJECT/i.test(name)

function uniq(list) {
  const seen = new Set()
  return list.filter(x => testable(x) && !seen.has(x) && seen.add(x))
}

// ─────────────────────────────────────────────────────────────
// 体检
// ─────────────────────────────────────────────────────────────
function get(url, node) {
  return new Promise(resolve => {
    const t0 = Date.now()
    $httpClient.get({ url, node, timeout: TIMEOUT }, (error, response, data) => resolve({ error, response, data, ms: Date.now() - t0 }))
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

const clean = v => (v === undefined || v === null ? '' : String(v).trim())

async function probe(node) {
  const r = { t: Date.now(), ok: false, ms: 0 }
  const a = await get(TEST_URL, node)
  if (a.error || !a.response) {
    r.err = clean(a.error).slice(0, 60) || '超时'
    return r
  }
  r.ok = true
  r.ms = a.ms
  const b = await get(IP_URL, node)
  const ip = b.error ? '' : pickIP(b.data)
  if (ip) {
    r.ip = ip
    r.cc = clean($utils.geoip(ip)).toUpperCase()
    r.asn = clean($utils.ipasn(ip))
    r.org = clean($utils.ipaso(ip))
  }
  return r
}

function readStore() {
  try {
    const s = JSON.parse($persistentStore.read(STORE_KEY) || '{}')
    return s && typeof s === 'object' ? s : {}
  } catch (e) {
    return {}
  }
}

/** 逐个测, 快到时限就停, 剩下的下次再测 */
async function runChecks(targets, budget) {
  const store = readStore()
  const nodes = store.nodes && typeof store.nodes === 'object' ? store.nodes : {}
  const start = Date.now()
  let tested = 0
  for (const name of targets) {
    if (Date.now() - start + 2 * TIMEOUT > budget) break
    nodes[name] = await probe(name)
    tested++
  }
  const now = Date.now()
  for (const k of Object.keys(nodes)) if (!nodes[k] || !(now - nodes[k].t < KEEP_MS)) delete nodes[k]
  store.nodes = nodes
  store.check = { t: now, took: now - start, tested, total: targets.length }
  $persistentStore.write(JSON.stringify(store), STORE_KEY)
  return store
}

/** 各策略组当前选中的节点; 一路下来还停在策略组上的 (没有选中项) 不测 */
const leaves = (groups, set) => uniq(groups.map(g => g.leaf).filter(n => !set.has(n)))

// ─────────────────────────────────────────────────────────────
// 数据地址 / 操作地址
// ─────────────────────────────────────────────────────────────
function parseQuery(url) {
  const out = {}
  const i = url.indexOf('?')
  if (i < 0) return out
  for (const part of url.slice(i + 1).split('#')[0].split('&')) {
    if (!part) continue
    const j = part.indexOf('=')
    const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch (e) { return s } }
    out[dec(j < 0 ? part : part.slice(0, j))] = dec(j < 0 ? '' : part.slice(j + 1))
  }
  return out
}

function snapshot(state, store, result) {
  const mode = Number(state.conf.running_model)
  const body = {
    v: 1,
    t: Date.now(),
    mode: mode === 0 || mode === 1 || mode === 2 ? mode : -1,
    final: clean(state.conf.final),
    global: clean(state.conf.global_proxy),
    groups: state.groups,
    nodes: store.nodes || {},
    check: store.check || null,
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
  const before = await readState()
  let targets = []
  let result = { ok: true }
  if (q.mode !== undefined && q.mode !== '') {
    const m = Number(q.mode)
    if (!$config.setRunningModel(m)) result = { ok: false, error: '模式切换失败' }
    else {
      // 当前节点: 全局直连测 DIRECT, 全局代理测全局策略, 分流测兜底策略
      const via = m === 0 ? 'DIRECT' : m === 2 ? clean(before.conf.global_proxy) : clean(before.conf.final)
      targets = leaves([{ leaf: leafOf(via, before.set) }], before.set)
    }
  } else if (q.group) {
    if (!q.node || !$config.setSelectPolicy(q.group, q.node)) result = { ok: false, error: `${q.group} 切换失败` }
    else targets = leaves([{ leaf: leafOf(q.group, before.set) }], before.set)
  } else {
    targets = leaves(before.groups, before.set)
  }
  const store = await runChecks(targets, REQ_BUDGET)
  return snapshot(await readState(), store, result)
}

async function handleRequest() {
  const url = $request.url
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (path === '/loon-panel/set') return respond(200, await handleSet(parseQuery(url)))
  if (path === '/loon-panel/data') return respond(200, snapshot(await readState(), readStore()))
  respond(404, { v: 1, error: 'not found' })
}

async function handleCron() {
  const state = await readState()
  const full = []
  for (const name of FULL_GROUPS) {
    const g = state.groups.find(x => x.name === name)
    if (g) full.push(...g.subs)
  }
  const store = await runChecks(uniq([...leaves(state.groups, state.set), ...full.filter(n => !state.set.has(n))]), CRON_BUDGET)
  const c = store.check
  console.log(`体检完成 ${c.tested}/${c.total}, 用时 ${Math.round(c.took / 1000)} 秒`)
  $done()
}

const isRequest = typeof $request !== 'undefined' && $request && $request.url

;(isRequest ? handleRequest() : handleCron()).catch(e => {
  console.log(`Loon 面板出错: ${e && e.message ? e.message : e}`)
  if (isRequest) respond(500, { v: 1, error: String(e && e.message ? e.message : e) })
  else $done()
})
