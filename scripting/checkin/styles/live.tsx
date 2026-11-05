// checkin / styles/live.tsx
// 实时活动的状态和视图. 只放纯视图, 注册在 live_activity.tsx (官方要求单独文件)
// 底色由系统决定, 这里只用语义文字色 (label / secondaryLabel) 和三种状态色
// 按钮由 live_activity.tsx 传进来 (intent 在 app_intents.tsx); App 内预览不传, 只画外观
// 远程渲染时只能依赖 state: 同步、不联网、不读文件

import { VStack, HStack, ZStack, Text, Spacer, Image, Circle, Capsule, Button, Link, Script } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { counts, isProblem, rewardTotal, type Entry } from '../api'

export const ACTIVITY_NAME = 'CheckinActivity'
export const LIVE_ICON = 'checkmark.seal.fill'

const OK = '#30D158'
const BAD = '#FF453A'
const WARN = '#FF9F0A'
const TRACK = 'rgba(142,142,147,0.35)'

/**
 * 本地开启和 Loon 远程推送共用的 state (远程由 paperclip 汇总脚本发):
 * { v:1, t, done, total, reward, issueCount, cookie?, fail?, issues: [{ key, name, s, msg, run?, open? }] }
 * issues 最多 3 条, 已按「需重抓 → 失败」排序; cookie / fail 是两类各自的数量, 没给时按 issues 估
 */
export type LiveIssue = { key: string; name: string; s: 'cookie' | 'fail'; msg: string; run?: string; open?: string }
export type LiveState = { v: 1; t: number; done: number; total: number; reward: number; issueCount: number; cookie?: number; fail?: number; issues: LiveIssue[] }

export function liveStateOf(entries: Entry[], time: number): LiveState {
  const c = counts(entries)
  return {
    v: 1, t: time, done: c.ok, total: entries.length, reward: rewardTotal(entries),
    issueCount: c.cookie + c.fail, cookie: c.cookie, fail: c.fail,
    // 长度按 STATE_SCHEMA 截断: 远程管理的活动在本地刷新也走服务端, 超长会被拒
    issues: entries.filter(isProblem).slice(0, 3).map(e => ({
      key: e.key.slice(0, 64), name: e.name.slice(0, 32), s: e.s as 'cookie' | 'fail',
      msg: (e.msg || (e.s === 'cookie' ? '凭证失效' : '失败')).slice(0, 60),
      ...(e.run && e.run.length <= 200 ? { run: e.run } : {}), ...(e.open && e.open.length <= 300 ? { open: e.open } : {}),
    })),
  }
}

/** 远程 state 来自外部, 渲染前整理成可用的值, 缺的字段给默认 */
type View = { done: number; total: number; reward: number; t: number; bad: number; cookie: number; fail: number; issues: LiveIssue[] }

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

function view(raw: LiveState): View {
  const issues = (Array.isArray(raw?.issues) ? raw.issues : [])
    .filter(i => i && typeof i.name === 'string' && (i.s === 'cookie' || i.s === 'fail'))
    .slice(0, 3)
  const bad = Math.max(num(raw?.issueCount), issues.length)
  const cookie = typeof raw?.cookie === 'number' ? raw.cookie : issues.filter(i => i.s === 'cookie').length
  const fail = typeof raw?.fail === 'number' ? raw.fail : Math.max(0, bad - cookie)
  return { done: num(raw?.done), total: num(raw?.total), reward: num(raw?.reward), t: num(raw?.t), bad, cookie, fail, issues }
}

/** 实时活动里的按钮; 预览时为空 */
export type LiveActs = { retry: (key: string) => any; refresh: any; retryAll: any }

const hhmm = (t: number) => {
  if (!t) return '--:--'
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────
// 部件
// ─────────────────────────────────────────────────────────────
/** 完成度小圆环; color 不给时按成功绿 */
function Ring(props: { v: View; size: number; line: number; color?: string }) {
  const p = props.v.total ? Math.min(1, props.v.done / props.v.total) : 0
  return (
    <ZStack frame={{ width: props.size + props.line, height: props.size + props.line }}>
      <Circle stroke={{ shapeStyle: TRACK, strokeStyle: { lineWidth: props.line } }} frame={{ width: props.size, height: props.size }} />
      <Circle trim={{ from: 0, to: Math.max(0.001, p) }} stroke={{ shapeStyle: props.color ?? OK, strokeStyle: { lineWidth: props.line, lineCap: 'round' } }}
        rotationEffect={-90} frame={{ width: props.size, height: props.size }} />
    </ZStack>
  )
}

/** 三色分段进度条 */
function SegBar(props: { v: View }) {
  const { v } = props
  const n = v.total || 1
  const a = Math.min(1, v.done / n), b = Math.min(1, (v.done + v.cookie) / n), d = Math.min(1, (v.done + v.cookie + v.fail) / n)
  const g = {
    stops: [
      { color: OK, location: 0 }, { color: OK, location: a }, { color: BAD, location: a }, { color: BAD, location: b },
      { color: WARN, location: b }, { color: WARN, location: d }, { color: TRACK, location: d }, { color: TRACK, location: 1 },
    ],
    startPoint: 'leading',
    endPoint: 'trailing',
  }
  return <Capsule fill={{ light: g, dark: g } as DynamicShapeStyle} frame={{ maxWidth: 'infinity', height: 5 }} />
}

/** cookie → 红色「打开」(有 open 跳 App, 没有打开脚本详情); fail → 灰色「补签」, 直接执行 */
function IssueButton(props: { issue: LiveIssue; acts?: LiveActs }) {
  const { issue, acts } = props
  const cookie = issue.s === 'cookie'
  const pill = (
    <Text font={12} fontWeight="semibold" foregroundStyle={cookie ? '#FFFFFF' : issue.run ? 'label' : 'secondaryLabel'}
      padding={{ horizontal: 10, vertical: 4 }} background={<Capsule fill={cookie ? BAD : TRACK} />}>
      {cookie ? '打开' : issue.run ? '补签' : '不支持'}
    </Text>
  )
  if (!acts) return pill
  if (cookie) return <Link url={issue.open ?? Script.createRunURLScheme(Script.name, { detail: issue.key })}>{pill}</Link>
  if (!issue.run) return pill
  return <Button intent={acts.retry(issue.key)} buttonStyle="plain">{pill}</Button>
}

/** 前 2 条需处理, 还有更多显示「还有 N 个」 */
function IssueRows(props: { v: View; acts?: LiveActs }) {
  const shown = props.v.issues.slice(0, 2)
  const more = props.v.bad - shown.length
  return (
    <VStack spacing={6}>
      {shown.map(it => (
        <HStack spacing={8}>
          <Circle fill={it.s === 'cookie' ? BAD : WARN} frame={{ width: 7, height: 7 }} />
          <Text font={13} fontWeight="medium" foregroundStyle="label" lineLimit={1}>{it.name}</Text>
          <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{it.msg}</Text>
          <Spacer minLength={4} />
          <IssueButton issue={it} acts={props.acts} />
        </HStack>
      ))}
      {more > 0 ? <Text font={11} foregroundStyle="secondaryLabel" frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{`还有 ${more} 个`}</Text> : null}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 锁屏横幅 (通知中心、待机、无灵动岛机型)
// ─────────────────────────────────────────────────────────────
export function LiveBanner(props: { st: LiveState; acts?: LiveActs }) {
  const v = view(props.st)
  if (!v.bad) {
    return (
      <HStack spacing={8} padding={{ horizontal: 16, vertical: 14 }}>
        <Image systemName="checkmark.circle.fill" font={20} foregroundStyle={OK} />
        <Text font={15} fontWeight="semibold" foregroundStyle="label" lineLimit={1}>{`全部正常 · +${v.reward}`}</Text>
        <Spacer />
        <Text font={12} monospacedDigit foregroundStyle="secondaryLabel">{hhmm(v.t)}</Text>
      </HStack>
    )
  }
  return (
    <VStack spacing={8} padding={{ horizontal: 16, vertical: 14 }}>
      <HStack spacing={6}>
        <Image systemName={LIVE_ICON} font={14} foregroundStyle={OK} />
        <Text font={13} fontWeight="semibold" foregroundStyle="label">签到总览</Text>
        <Spacer />
        <Text font={12} monospacedDigit foregroundStyle="secondaryLabel">{hhmm(v.t)}</Text>
      </HStack>
      <HStack alignment="lastTextBaseline" spacing={4}>
        <Text font={30} fontWeight="bold" fontDesign="rounded" monospacedDigit foregroundStyle="label">{String(v.done)}</Text>
        <Text font={16} fontWeight="medium" monospacedDigit foregroundStyle="secondaryLabel">{`/ ${v.total}`}</Text>
        <Spacer />
        <Text font={13} foregroundStyle="secondaryLabel">{`今日奖励 +${v.reward}`}</Text>
      </HStack>
      <SegBar v={v} />
      <IssueRows v={v} acts={props.acts} />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 灵动岛 (底色固定黑, 语义色会显示成浅色)
// ─────────────────────────────────────────────────────────────
export function LiveCompactLeading(props: { st: LiveState }) {
  return <Ring v={view(props.st)} size={14} line={3} />
}

export function LiveCompactTrailing(props: { st: LiveState }) {
  const n = view(props.st).bad
  return n
    ? <Text font={14} fontWeight="bold" monospacedDigit foregroundStyle={BAD}>{String(n)}</Text>
    : <Image systemName="checkmark" font={13} fontWeight="bold" foregroundStyle={OK} />
}

export function LiveMinimal(props: { st: LiveState }) {
  const v = view(props.st)
  return <Ring v={v} size={14} line={3} color={v.bad ? BAD : OK} />
}

/** 展开: 上排左 */
export function LiveExpandedLeading(props: { st: LiveState }) {
  const v = view(props.st)
  return (
    <HStack spacing={6}>
      <Ring v={v} size={22} line={4} />
      <Text font={17} fontWeight="bold" monospacedDigit foregroundStyle="label">{`${v.done}/${v.total}`}</Text>
    </HStack>
  )
}

/** 展开: 上排右 */
export function LiveExpandedTrailing(props: { st: LiveState }) {
  const n = view(props.st).bad
  return n
    ? <Text font={15} fontWeight="semibold" foregroundStyle={BAD}>{`${n} 需处理`}</Text>
    : <Text font={15} fontWeight="semibold" foregroundStyle={OK}>全部正常</Text>
}

/** 展开: 上排下面一行小字 */
export function LiveExpandedCenter(props: { st: LiveState }) {
  const v = view(props.st)
  return <Text font={12} foregroundStyle="secondaryLabel">{`今日奖励 +${v.reward} · ${hhmm(v.t)} 更新`}</Text>
}

/** 展开: 需处理 + 底部两个等宽按钮 */
export function LiveExpandedBottom(props: { st: LiveState; acts?: LiveActs }) {
  const v = view(props.st)
  const { acts } = props
  const btn = (title: string, intent: any, enabled: boolean) => {
    const label = (
      <Text font={14} fontWeight="semibold" foregroundStyle={enabled ? 'label' : 'secondaryLabel'}
        frame={{ maxWidth: 'infinity' }} padding={{ vertical: 8 }} background={<Capsule fill={TRACK} />}>
        {title}
      </Text>
    )
    return acts && enabled ? <Button intent={intent} buttonStyle="plain" frame={{ maxWidth: 'infinity' }}>{label}</Button> : label
  }
  return (
    <VStack spacing={10}>
      {v.bad ? <IssueRows v={v} acts={acts} /> : null}
      <HStack spacing={10}>
        {btn('刷新', acts?.refresh, true)}
        {btn('全部补签', acts?.retryAll, v.fail > 0)}
      </HStack>
    </VStack>
  )
}

/** 准备远程启动时的样例 state, 也是给 paperclip 的格式示例 */
export const SAMPLE_STATE: LiveState = {
  v: 1, t: 1793105254635, done: 24, total: 31, reward: 1078, issueCount: 7, cookie: 2, fail: 5,
  issues: [
    { key: 'dreame_status', name: '追觅', s: 'cookie', msg: '会话过期' },
    { key: 'wps_status', name: 'WPS', s: 'fail', msg: '请求超时', run: 'http://1.1.1.1/checkin/wps' },
    { key: 'heybox_status', name: '小黑盒', s: 'fail', msg: '网络错误' },
  ],
}

/** 固定进模板的 state 格式 (Scripting 支持的 JSON Schema 子集); 不合格的推送在服务端就会被拒 */
export const STATE_SCHEMA = {
  type: 'object',
  required: ['v', 't', 'done', 'total', 'reward', 'issueCount', 'issues'],
  properties: {
    v: { type: 'integer', enum: [1] },
    t: { type: 'number' },
    done: { type: 'integer', minimum: 0 },
    total: { type: 'integer', minimum: 0 },
    reward: { type: 'number' },
    issueCount: { type: 'integer', minimum: 0 },
    cookie: { type: 'integer', minimum: 0 },
    fail: { type: 'integer', minimum: 0 },
    issues: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        required: ['key', 'name', 's', 'msg'],
        properties: {
          key: { type: 'string', maxLength: 64 },
          name: { type: 'string', maxLength: 32 },
          s: { type: 'string', enum: ['cookie', 'fail'] },
          msg: { type: 'string', maxLength: 60 },
          run: { type: 'string', maxLength: 200 },
          open: { type: 'string', maxLength: 300 },
        },
      },
    },
  },
}
