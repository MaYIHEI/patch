// loon-panel / styles/usage.tsx
// 用量类: A 用量环 (小) · C 用量趋势 (中) · F 锁屏 (圆形 / 长条)

import { VStack, HStack, ZStack, Text, Spacer, Gauge, AccessoryWidgetBackground, RoundedRectangle } from 'scripting'

import { fmtBytes, md, type SubView } from '../subs'
import { mainGroupLeaf } from './node'
import { Root, Header, Num, Empty, Bar, UsageRing, DailyBars, usageColor, latencyText, syncText, OK, BAD, WARN, type Ctx } from '../ui'

const NO_SUB = '在 App 里添加机场订阅'

/** 主订阅 = 列表第一个 */
export const mainSub = (ctx: Ctx): SubView | undefined => ctx.subs[0]

export const pct = (r: number) => `${Math.round(r * 100)}%`
export const usedText = (s: SubView) => (s.usage ? (s.usage.total > 0 ? `${fmtBytes(s.used)} / ${fmtBytes(s.usage.total)}` : `已用 ${fmtBytes(s.used)}`) : '-')
export const fcColor = (s: SubView) => (s.fc.kind === 'runout' || s.fc.kind === 'out' ? (s.fc.kind === 'out' ? BAD : WARN) : s.fc.kind === 'enough' || s.fc.kind === 'idle' ? OK : undefined)

/** 订阅读取失败、显示旧数据时的标记 */
export const staleMark = (s: SubView) => (s.stale ? '⚠ ' : '')

// ─────────────────────────────────────────────────────────────
// A 用量环
// ─────────────────────────────────────────────────────────────
export function RingStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const s = mainSub(ctx)
  if (!s) return <Root ctx={ctx}><Header ctx={ctx} title="机场用量" icon="chart.pie.fill" font={12} /><Empty ctx={ctx} icon="plus.circle" text={NO_SUB} /></Root>
  if (!s.usage) return <Root ctx={ctx}><Header ctx={ctx} title={s.name} icon="chart.pie.fill" font={12} /><Empty ctx={ctx} icon="exclamationmark.triangle" text={s.err ?? '读取中'} /></Root>
  const unlimited = s.usage.total <= 0
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title={`${staleMark(s)}${s.name}`} icon="chart.pie.fill" font={12} />
      <HStack frame={{ maxWidth: 'infinity' }}>
        <Spacer minLength={0} />
        <UsageRing ctx={ctx} ratio={unlimited ? 0 : s.ratio} size={72} line={9}>
          <VStack spacing={0}>
            <Num value={unlimited ? fmtBytes(s.used) : pct(s.ratio)} size={unlimited ? 16 : 21} color={th.t1} weight="bold" />
            <Text font={10} foregroundStyle={th.t3}>已用</Text>
          </VStack>
        </UsageRing>
        <Spacer minLength={0} />
      </HStack>
      <Spacer minLength={0} />
      <Text font={11} fontWeight="medium" monospacedDigit foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.7}>
        {unlimited ? '不限流量' : `剩 ${fmtBytes(s.remain)} / ${fmtBytes(s.usage.total)}`}
      </Text>
      <Text font={10} foregroundStyle={fcColor(s) ?? th.t3} lineLimit={1} minScaleFactor={0.7}>{s.fc.text}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// C 用量趋势: 左边主订阅用量和预测, 右边近 14 天日用量
// ─────────────────────────────────────────────────────────────
export function TrendStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const s = mainSub(ctx)
  if (!s) return <Root ctx={ctx}><Header ctx={ctx} title="用量趋势" icon="chart.bar.fill" /><Empty ctx={ctx} icon="plus.circle" text={NO_SUB} /></Root>
  const days = s.daily.slice(-14)
  const known = days.filter((v): v is number => v !== null)
  const today = days[days.length - 1]
  return (
    <Root ctx={ctx} spacing={8}>
      <Header ctx={ctx} title={`${staleMark(s)}${s.name}`} icon="chart.bar.fill" right={s.deadline ? `${md(s.deadline)} ${s.deadlineWord}` : s.err && !s.usage ? s.err : undefined} />
      <HStack spacing={14} alignment="top" frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={4} frame={{ width: 118, alignment: 'leading' }}>
          <HStack alignment="lastTextBaseline" spacing={3}>
            <Num value={s.usage && s.usage.total > 0 ? pct(s.ratio) : fmtBytes(s.used)} size={28} color={th.t1} weight="bold" />
            <Text font={11} foregroundStyle={th.t3}>已用</Text>
          </HStack>
          <Text font={11} monospacedDigit foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7}>{usedText(s)}</Text>
          <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={5} />
          <Spacer minLength={0} />
          <Text font={11} fontWeight="medium" foregroundStyle={fcColor(s) ?? th.t2} lineLimit={1} minScaleFactor={0.7}>{s.fc.text}</Text>
          {s.budget ? <Text font={10} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7}>{`到${s.deadlineWord}前每天 ${fmtBytes(s.budget.today)}`}</Text> : null}
        </VStack>
        <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
          <HStack>
            <Text font={10} foregroundStyle={th.t3}>近 14 天</Text>
            <Spacer minLength={2} />
            <Text font={10} monospacedDigit foregroundStyle={th.t3} lineLimit={1}>
              {known.length ? `今天 ${today !== null ? fmtBytes(today) : '-'} · 日均 ${fmtBytes(s.fc.avg || known.reduce((a, b) => a + b, 0) / known.length)}` : ''}
            </Text>
          </HStack>
          {known.length ? (
            <DailyBars ctx={ctx} values={days} height={62} avg={s.fc.avg} />
          ) : (
            <ZStack frame={{ maxWidth: 'infinity', height: 62 }} background={<RoundedRectangle cornerRadius={8} fill={th.track} />}>
              <Text font={11} foregroundStyle={th.t2} multilineTextAlignment="center">{'每次刷新记一笔\n明天起显示日用量'}</Text>
            </ZStack>
          )}
          <HStack>
            <Text font={9} foregroundStyle={th.t3}>14 天前</Text>
            <Spacer />
            <Text font={9} foregroundStyle={th.t3}>今天</Text>
          </HStack>
        </VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// F 锁屏: 圆形 = 主订阅已用; 长条 = 剩余流量 + 当前节点延迟
// ─────────────────────────────────────────────────────────────
const lockFg = (ctx: Ctx) => (ctx.inApp ? '#FFFFFF' : undefined)

/** App 内预览锁屏时垫一块深色底, 模拟锁屏 */
function LockPreview(props: { ctx: Ctx; radius: number; children?: any }) {
  if (!props.ctx.inApp) return props.children
  return (
    <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} background={<RoundedRectangle cornerRadius={props.radius} fill="#23306B" />} clipShape={{ type: 'rect', cornerRadius: props.radius }}>
      {props.children}
    </ZStack>
  )
}

export function LockCircular(props: { ctx: Ctx }) {
  const { ctx } = props
  const s = mainSub(ctx)
  const ratio = s?.usage && s.usage.total > 0 ? s.ratio : 0
  return (
    <LockPreview ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <Gauge
          value={ratio}
          min={0}
          max={1}
          label={<Text>流量</Text>}
          currentValueLabel={<Text monospacedDigit>{s?.usage ? (s.usage.total > 0 ? String(Math.round(ratio * 100)) : '∞') : '-'}</Text>}
          gaugeStyle="accessoryCircularCapacity"
        />
      </ZStack>
    </LockPreview>
  )
}

export function LockRect(props: { ctx: Ctx }) {
  const { ctx } = props
  const s = mainSub(ctx)
  const leaf = mainGroupLeaf(ctx)
  const first = s?.usage
    ? s.usage.total > 0 ? `${s.name} 剩 ${fmtBytes(Math.max(0, s.usage.total - s.used))}` : `${s.name} 已用 ${fmtBytes(s.used)}`
    : s ? `${s.name} 读取失败` : NO_SUB
  return (
    <LockPreview ctx={ctx} radius={14}>
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
        <Text font={14} fontWeight="bold" monospacedDigit lineLimit={1} foregroundStyle={lockFg(ctx)}>{first}</Text>
        {s?.usage && s.usage.total > 0 ? <Text font={12} lineLimit={1} foregroundStyle={ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined}>{s.fc.text}</Text> : null}
        <Text font={12} lineLimit={1} foregroundStyle={ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined}>
          {leaf ? `${leaf.name} · ${latencyText(leaf.r)}` : syncText(ctx)}
        </Text>
      </VStack>
    </LockPreview>
  )
}

/** 单行 (锁屏时间上方): 只有一行文字 */
export function LockInline(props: { ctx: Ctx }) {
  const { ctx } = props
  const s = mainSub(ctx)
  const leaf = mainGroupLeaf(ctx)
  const text = [s?.usage ? (s.usage.total > 0 ? `剩 ${fmtBytes(s.remain)}` : `已用 ${fmtBytes(s.used)}`) : '', leaf ? latencyText(leaf.r) : ''].filter(Boolean).join(' · ') || 'Loon 面板'
  return <Text lineLimit={1} foregroundStyle={ctx.inApp ? '#FFFFFF' : undefined} padding={ctx.inApp ? 8 : 0} background={ctx.inApp ? <RoundedRectangle cornerRadius={8} fill="#23306B" /> : undefined}>{text}</Text>
}
