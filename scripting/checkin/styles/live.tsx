// checkin / styles/live.tsx
// 实时活动的状态和视图. 只放纯视图, 注册在 live_activity.tsx (官方要求单独文件)
// 底色由系统决定, 这里只用语义文字色 (label / secondaryLabel) 和三种状态色
// 按钮由 live_activity.tsx 传进来 (intent 在 app_intents.tsx); App 内预览不传, 只画外观

import { VStack, HStack, ZStack, Text, Spacer, Image, Circle, Capsule, Button, Link, Script } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { counts, isProblem, isRetrying, rewardTotal, type Entry } from '../api'

export const ACTIVITY_NAME = 'CheckinActivity'
export const LIVE_ICON = 'checkmark.seal.fill'

const OK = '#30D158'
const BAD = '#FF453A'
const WARN = '#FF9F0A'
const TRACK = 'rgba(142,142,147,0.35)'

/** contentState 只能放可 JSON 序列化的值 */
export type LiveItem = { key: string; name: string; why: string; s: 'cookie' | 'fail'; run: boolean; open?: string; retrying: boolean }
export type LiveState = { ok: number; total: number; cookie: number; fail: number; reward: number; time: number; items: LiveItem[]; more: number }

export function liveStateOf(entries: Entry[], time: number): LiveState {
  const c = counts(entries)
  const problems = entries.filter(isProblem)
  return {
    ok: c.ok, total: entries.length, cookie: c.cookie, fail: c.fail, reward: rewardTotal(entries), time,
    items: problems.slice(0, 2).map(e => ({
      key: e.key, name: e.name, why: e.msg || (e.s === 'cookie' ? '凭证失效' : '失败'),
      s: e.s as 'cookie' | 'fail', run: !!e.run, open: e.open, retrying: isRetrying(e),
    })),
    more: Math.max(0, problems.length - 2),
  }
}

/** 实时活动里的按钮; 预览时为空 */
export type LiveActs = { retry: (key: string) => any; refresh: any; retryAll: any }

const hhmm = (t: number) => {
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
const bad = (st: LiveState) => st.cookie + st.fail

// ─────────────────────────────────────────────────────────────
// 部件
// ─────────────────────────────────────────────────────────────
/** 完成度小圆环; color 不给时按成功绿 */
export function LiveRing(props: { st: LiveState; size: number; line: number; color?: string }) {
  const p = props.st.total ? props.st.ok / props.st.total : 0
  return (
    <ZStack frame={{ width: props.size + props.line, height: props.size + props.line }}>
      <Circle stroke={{ shapeStyle: TRACK, strokeStyle: { lineWidth: props.line } }} frame={{ width: props.size, height: props.size }} />
      <Circle trim={{ from: 0, to: Math.max(0.001, p) }} stroke={{ shapeStyle: props.color ?? OK, strokeStyle: { lineWidth: props.line, lineCap: 'round' } }}
        rotationEffect={-90} frame={{ width: props.size, height: props.size }} />
    </ZStack>
  )
}

/** 三色分段进度条 */
function LiveSegBar(props: { st: LiveState }) {
  const { st } = props
  const n = st.total || 1
  const a = st.ok / n, b = (st.ok + st.cookie) / n, d = (st.ok + st.cookie + st.fail) / n
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
function ItemButton(props: { item: LiveItem; acts?: LiveActs }) {
  const { item, acts } = props
  const cookie = item.s === 'cookie'
  const label = cookie ? '打开' : item.retrying ? '补签中' : item.run ? '补签' : '不支持'
  const pill = (
    <Text font={12} fontWeight="semibold" foregroundStyle={cookie ? '#FFFFFF' : item.run ? 'label' : 'secondaryLabel'}
      padding={{ horizontal: 10, vertical: 4 }} background={<Capsule fill={cookie ? BAD : TRACK} />}>
      {label}
    </Text>
  )
  if (!acts) return pill
  if (cookie) return <Link url={item.open ?? Script.createRunURLScheme(Script.name, { detail: item.key })}>{pill}</Link>
  if (!item.run || item.retrying) return pill
  return <Button intent={acts.retry(item.key)} buttonStyle="plain">{pill}</Button>
}

function ItemRows(props: { st: LiveState; acts?: LiveActs }) {
  return (
    <VStack spacing={6}>
      {props.st.items.map(it => (
        <HStack spacing={8}>
          <Circle fill={it.s === 'cookie' ? BAD : WARN} frame={{ width: 7, height: 7 }} />
          <Text font={13} fontWeight="medium" foregroundStyle="label" lineLimit={1}>{it.name}</Text>
          <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{it.why}</Text>
          <Spacer minLength={4} />
          <ItemButton item={it} acts={props.acts} />
        </HStack>
      ))}
      {props.st.more ? <Text font={11} foregroundStyle="secondaryLabel" frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{`还有 ${props.st.more} 个`}</Text> : null}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 锁屏横幅 (通知中心、待机、无灵动岛机型)
// ─────────────────────────────────────────────────────────────
export function LiveBanner(props: { st: LiveState; acts?: LiveActs }) {
  const { st } = props
  if (!bad(st)) {
    return (
      <HStack spacing={8} padding={{ horizontal: 16, vertical: 14 }}>
        <Image systemName="checkmark.circle.fill" font={20} foregroundStyle={OK} />
        <Text font={15} fontWeight="semibold" foregroundStyle="label" lineLimit={1}>{`全部正常 · +${st.reward}`}</Text>
        <Spacer />
        <Text font={12} monospacedDigit foregroundStyle="secondaryLabel">{hhmm(st.time)}</Text>
      </HStack>
    )
  }
  return (
    <VStack spacing={8} padding={{ horizontal: 16, vertical: 14 }}>
      <HStack spacing={6}>
        <Image systemName={LIVE_ICON} font={14} foregroundStyle={OK} />
        <Text font={13} fontWeight="semibold" foregroundStyle="label">签到总览</Text>
        <Spacer />
        <Text font={12} monospacedDigit foregroundStyle="secondaryLabel">{hhmm(st.time)}</Text>
      </HStack>
      <HStack alignment="lastTextBaseline" spacing={4}>
        <Text font={30} fontWeight="bold" fontDesign="rounded" monospacedDigit foregroundStyle="label">{String(st.ok)}</Text>
        <Text font={16} fontWeight="medium" monospacedDigit foregroundStyle="secondaryLabel">{`/ ${st.total}`}</Text>
        <Spacer />
        <Text font={13} foregroundStyle="secondaryLabel">{`今日奖励 +${st.reward}`}</Text>
      </HStack>
      <LiveSegBar st={st} />
      <ItemRows st={st} acts={props.acts} />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 灵动岛 (底色固定黑, 语义色会显示成浅色)
// ─────────────────────────────────────────────────────────────
export function LiveCompactLeading(props: { st: LiveState }) {
  return <LiveRing st={props.st} size={14} line={3} />
}

export function LiveCompactTrailing(props: { st: LiveState }) {
  const n = bad(props.st)
  return n
    ? <Text font={14} fontWeight="bold" monospacedDigit foregroundStyle={BAD}>{String(n)}</Text>
    : <Image systemName="checkmark" font={13} fontWeight="bold" foregroundStyle={OK} />
}

export function LiveMinimal(props: { st: LiveState }) {
  return <LiveRing st={props.st} size={14} line={3} color={bad(props.st) ? BAD : OK} />
}

/** 展开: 上排左 */
export function LiveExpandedLeading(props: { st: LiveState }) {
  return (
    <HStack spacing={6}>
      <LiveRing st={props.st} size={22} line={4} />
      <Text font={17} fontWeight="bold" monospacedDigit foregroundStyle="label">{`${props.st.ok}/${props.st.total}`}</Text>
    </HStack>
  )
}

/** 展开: 上排右 */
export function LiveExpandedTrailing(props: { st: LiveState }) {
  const n = bad(props.st)
  return n
    ? <Text font={15} fontWeight="semibold" foregroundStyle={BAD}>{`${n} 需处理`}</Text>
    : <Text font={15} fontWeight="semibold" foregroundStyle={OK}>全部正常</Text>
}

/** 展开: 上排下面一行小字 */
export function LiveExpandedCenter(props: { st: LiveState }) {
  return <Text font={12} foregroundStyle="secondaryLabel">{`今日奖励 +${props.st.reward} · ${hhmm(props.st.time)} 更新`}</Text>
}

/** 展开: 需处理 + 底部两个等宽按钮 */
export function LiveExpandedBottom(props: { st: LiveState; acts?: LiveActs }) {
  const { st, acts } = props
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
      {bad(st) ? <ItemRows st={st} acts={acts} /> : null}
      <HStack spacing={10}>
        {btn('刷新', acts?.refresh, true)}
        {btn('全部补签', acts?.retryAll, st.fail > 0)}
      </HStack>
    </VStack>
  )
}
