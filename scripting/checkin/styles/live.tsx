// checkin / styles/live.tsx
// 实时活动的状态和视图. 只放纯视图, 注册在 live_activity.tsx (官方要求单独文件)

import { VStack, HStack, Text, Spacer, Image, Capsule, RoundedRectangle } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { counts, isProblem, isToday, rewardTotal, type Entry } from '../api'

export const ACTIVITY_NAME = 'CheckinActivity'

/** contentState 只能放可 JSON 序列化的值 */
export type LiveState = { ok: number; total: number; cookie: number; fail: number; reward: number; last: string; todo: string }

export function liveStateOf(entries: Entry[]): LiveState {
  const c = counts(entries)
  const done = entries.filter(e => e.s === 'ok' && isToday(e.t)).sort((a, b) => b.t - a.t)[0]
  const todo = entries.filter(isProblem).slice(0, 2).map(e => (e.s === 'cookie' ? `${e.name}需重抓` : `${e.name}待补签`)).join(' · ')
  return {
    ok: c.ok, total: entries.length, cookie: c.cookie, fail: c.fail, reward: rewardTotal(entries),
    last: done ? `${done.name} ${done.msg.split(' · ')[0]}` : '',
    todo,
  }
}

/** 进度条: 白色在半透明轨道上 (锁屏实时活动底色是系统给的) */
function LiveBar(props: { p: number }) {
  const p = Math.max(0.005, Math.min(0.995, props.p))
  const g = { stops: [{ color: '#30D158', location: 0 }, { color: '#30D158', location: p }, { color: 'rgba(255,255,255,0.18)', location: p }, { color: 'rgba(255,255,255,0.18)', location: 1 }], startPoint: 'leading', endPoint: 'trailing' }
  return <Capsule fill={{ light: g, dark: g } as DynamicShapeStyle} frame={{ maxWidth: 'infinity', height: 5 }} />
}

/** 锁屏 / 横幅 */
export function LiveBanner(props: { st: LiveState }) {
  const { st } = props
  const sub = st.last ? `${st.ok} / ${st.total} · 刚完成：${st.last}` : `${st.ok} / ${st.total}`
  return (
    <HStack spacing={12} padding={{ horizontal: 16, vertical: 14 }}>
      <Text font={16} fontWeight="bold" foregroundStyle="#30D158" frame={{ width: 38, height: 38 }} background={<RoundedRectangle cornerRadius={10} fill="#1C1C1E" />}>签</Text>
      <VStack alignment="leading" spacing={3}>
        <HStack>
          <Text font={14} fontWeight="semibold" foregroundStyle="#FFFFFF">早间签到</Text>
          <Spacer />
          <Text font={12} foregroundStyle="rgba(255,255,255,0.6)">{st.ok >= st.total ? '已完成' : '进行中'}</Text>
        </HStack>
        <LiveBar p={st.total ? st.ok / st.total : 0} />
        <Text font={12} monospacedDigit foregroundStyle="rgba(255,255,255,0.7)" lineLimit={1}>{sub}</Text>
        {st.todo ? <Text font={11} foregroundStyle="#FF6961" lineLimit={1}>{st.todo}</Text> : null}
      </VStack>
    </HStack>
  )
}

export function LiveCompactLeading(props: { st: LiveState }) {
  return (
    <HStack spacing={3}>
      <Image systemName="checklist.checked" foregroundStyle="#30D158" />
      <Text monospacedDigit foregroundStyle="#FFFFFF">{String(props.st.ok)}</Text>
    </HStack>
  )
}

export function LiveCompactTrailing(props: { st: LiveState }) {
  const bad = props.st.cookie + props.st.fail
  return <Text monospacedDigit foregroundStyle={bad ? '#FF6961' : '#30D158'}>{bad ? `${bad}!` : `/${props.st.total}`}</Text>
}

export function LiveMinimal(props: { st: LiveState }) {
  return <Text monospacedDigit foregroundStyle={props.st.cookie + props.st.fail ? '#FF6961' : '#30D158'}>{String(props.st.ok)}</Text>
}
