// loon-panel / styles/flow.tsx
// 流量类: 今日流量 · 每日额度 · 多机场 (小 / 中) · 倒计时 · 环比 · 今日时段 · 性价比 · 用量月报

import { VStack, HStack, ZStack, Text, Spacer, Circle, RoundedRectangle } from 'scripting'

import { fmtBytes, md, type SubView } from '../subs'
import { mainSub, fcColor, staleMark } from './usage'
import { Root, Header, Num, Empty, Bar, HourBars, usageColor, withAlpha, chunk, OK, BAD, WARN, type Ctx } from '../ui'

const NO_SUB = '在 App 里添加机场订阅'
const G = 1024 ** 3

function NoSub(props: { ctx: Ctx; title: string; icon: string }) {
  return <Root ctx={props.ctx}><Header ctx={props.ctx} title={props.title} icon={props.icon} font={12} /><Empty ctx={props.ctx} icon="plus.circle" text={NO_SUB} /></Root>
}

/** 近 1 小时: 「近 1 小时 1.2G · ≈2.7Mbps」 */
export const rateText = (r: { bytes: number; mbps: number } | null) => (r ? `近 1 小时 ${fmtBytes(r.bytes)} · ≈${r.mbps.toFixed(1)}Mbps` : '近 1 小时 记录中')

// ─────────────────────────────────────────────────────────────
// 今日流量 (小): 全部机场合计
// ─────────────────────────────────────────────────────────────
export function TodayStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, all } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="今天" icon="arrow.up.arrow.down" />
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title="今天" icon="arrow.up.arrow.down" font={12} right={`${ctx.subs.length} 个机场`} />
      <Num value={fmtBytes(all.today)} size={28} color={th.t1} weight="bold" />
      <Text font={10} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7}>{rateText(all.recent)}</Text>
      <Spacer minLength={0} />
      <HourBars ctx={ctx} values={all.hourly} height={42} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 每日额度 (小): 今天用的和今天该用的比
// ─────────────────────────────────────────────────────────────
export function BudgetStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const s = mainSub(ctx)
  if (!s) return <NoSub ctx={ctx} title="今日额度" icon="gauge.with.needle" />
  const b = s.budget
  if (!b) {
    return (
      <Root ctx={ctx}>
        <Header ctx={ctx} title="今日额度" icon="gauge.with.needle" font={12} right={s.name} />
        <Empty ctx={ctx} icon="calendar.badge.plus" text={s.usage?.total ? '没有到期日, 在 App 里填每月重置日' : s.usage ? '不限流量' : s.err ?? '读取中'} />
      </Root>
    )
  }
  const ratio = b.today > 0 ? s.today / b.today : 1
  const color = ratio >= 1 ? BAD : ratio >= 0.7 ? WARN : OK
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title="今日额度" icon="gauge.with.needle" font={12} right={s.name} />
      <HStack alignment="lastTextBaseline" spacing={3}>
        <Num value={fmtBytes(s.today)} size={24} color={color} weight="bold" />
        <Text font={12} foregroundStyle={th.t2}>{`/ ${fmtBytes(b.today)}`}</Text>
      </HStack>
      <Bar ctx={ctx} value={ratio} color={color} height={7} />
      <Spacer minLength={0} />
      <Text font={11} fontWeight="medium" foregroundStyle={b.over > 0 ? BAD : OK} lineLimit={1}>{b.over > 0 ? `今天超了 ${fmtBytes(b.over)}` : `今天还能用 ${fmtBytes(b.today - s.today)}`}</Text>
      <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.7}>{b.days > 1 ? `明天起每天 ${fmtBytes(b.tomorrow)} 才够用` : `今天${s.deadlineWord}`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 多机场: 小号看剩余, 中号加今天用量和预测
// ─────────────────────────────────────────────────────────────
const remainText = (s: SubView) => (s.usage ? (s.usage.total > 0 ? fmtBytes(s.remain) : '不限量') : '-')

export function MultiSmall(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="机场" icon="square.stack.3d.up.fill" />
  const first = ctx.subs.filter(s => s.fc.kind === 'runout').sort((a, b) => (a.fc.date ?? 0) - (b.fc.date ?? 0))[0]
  return (
    <Root ctx={ctx} spacing={5}>
      <Header ctx={ctx} title="机场" icon="square.stack.3d.up.fill" font={12} right="剩余" />
      {ctx.subs.slice(0, 3).map(s => (
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={4}>
            <Text font={11} foregroundStyle={th.t1} lineLimit={1}>{`${staleMark(s)}${s.name}`}</Text>
            <Spacer minLength={2} />
            <Text font={11} fontWeight="medium" monospacedDigit foregroundStyle={s.usage ? usageColor(s.ratio) : th.t3} lineLimit={1}>{remainText(s)}</Text>
          </HStack>
          <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={4} />
        </VStack>
      ))}
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={first ? WARN : th.t3} lineLimit={1} minScaleFactor={0.7}>{first ? `最先用完: ${first.name} ${md(first.fc.date!)}` : '都够用'}</Text>
    </Root>
  )
}

export function MultiMedium(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, all } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="机场对比" icon="square.stack.3d.up.fill" />
  return (
    <Root ctx={ctx} spacing={7}>
      <Header ctx={ctx} title="机场对比" icon="square.stack.3d.up.fill" right="今天 · 已用 · 预测" />
      {ctx.subs.slice(0, 3).map(s => (
        <HStack spacing={6}>
          <Text font={12} foregroundStyle={th.t1} lineLimit={1} frame={{ width: 58, alignment: 'leading' }}>{`${staleMark(s)}${s.name}`}</Text>
          <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={5} />
          <Text font={10} monospacedDigit foregroundStyle={th.t3} lineLimit={1} frame={{ width: 34, alignment: 'trailing' }}>{fmtBytes(s.today)}</Text>
          <Text font={10} monospacedDigit foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7} frame={{ width: 62, alignment: 'trailing' }}>{s.usage ? (s.usage.total > 0 ? `${fmtBytes(s.used)}/${fmtBytes(s.usage.total)}` : fmtBytes(s.used)) : s.err ? '失败' : '-'}</Text>
          <Text font={10} fontWeight="medium" foregroundStyle={fcColor(s) ?? th.t3} lineLimit={1} minScaleFactor={0.7} frame={{ width: 50, alignment: 'trailing' }}>{s.fc.short}</Text>
        </HStack>
      ))}
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`合计今天 ${fmtBytes(all.today)} · 本月 ${fmtBytes(all.month.total)}`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 倒计时 (小): 到期 / 重置, 流量撑不撑得到
// ─────────────────────────────────────────────────────────────
export function CountdownStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const s = mainSub(ctx)
  if (!s) return <NoSub ctx={ctx} title="倒计时" icon="calendar" />
  if (!s.deadline) {
    return <Root ctx={ctx}><Header ctx={ctx} title={s.name} icon="calendar" font={12} /><Empty ctx={ctx} icon="infinity" text={s.usage ? '没有到期日, 可在 App 里填每月重置日' : s.err ?? '读取中'} /></Root>
  }
  const days = Math.max(0, Math.ceil((s.deadline - Date.now()) / 86_400_000))
  const last = s.fc.date ? Math.floor((s.fc.date - Date.now()) / 86_400_000) : 0
  const short = s.fc.kind === 'runout'
  return (
    <Root ctx={ctx} spacing={3}>
      <Header ctx={ctx} title={s.name} icon="calendar" font={12} />
      <HStack alignment="lastTextBaseline" spacing={3}>
        <Num value={days} size={38} color={th.t1} weight="bold" />
        <Text font={13} foregroundStyle={th.t2}>天</Text>
      </HStack>
      <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{`${md(s.deadline)} ${s.deadlineWord}`}</Text>
      <Spacer minLength={0} />
      <Text font={11} fontWeight="medium" foregroundStyle={short ? WARN : s.fc.kind === 'out' ? BAD : OK} lineLimit={1} minScaleFactor={0.7}>
        {short ? `流量撑 ${last} 天, 差 ${Math.max(0, days - last)} 天` : s.fc.kind === 'out' ? '流量已用完' : '流量够用'}
      </Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 环比 (小): 今天比昨天
// ─────────────────────────────────────────────────────────────
export function CompareStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, all } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="环比" icon="arrow.left.arrow.right" />
  const y = all.yesterday
  const up = y !== null && all.today > y
  const change = y ? (all.today - y) / y : null
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title="今天比昨天" icon="arrow.left.arrow.right" font={12} />
      <Num value={change === null ? '记录中' : `${change >= 0 ? '+' : ''}${Math.round(change * 100)}%`} size={change === null ? 20 : 30} color={change === null ? th.t2 : up ? WARN : OK} weight="bold" />
      <Spacer minLength={0} />
      <Bar ctx={ctx} value={y ? Math.min(1, all.today / Math.max(all.today, y)) : 0} color={th.accent} height={5} />
      <Text font={11} monospacedDigit foregroundStyle={th.t2} lineLimit={1}>{`今天 ${fmtBytes(all.today)}`}</Text>
      <Bar ctx={ctx} value={y ? Math.min(1, y / Math.max(all.today, y)) : 0} color={withAlpha(th.accent, 0.45)} height={5} />
      <Text font={11} monospacedDigit foregroundStyle={th.t3} lineLimit={1}>{`昨天 ${y === null ? '-' : fmtBytes(y)}`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 今日时段 (中): 今天每小时
// ─────────────────────────────────────────────────────────────
export function HoursStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, all } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="今天每小时" icon="clock.fill" />
  const slow = Math.max(0, ...ctx.subs.map(s => s.interval))
  return (
    <Root ctx={ctx} spacing={5}>
      <Header ctx={ctx} title="今天每小时" icon="clock.fill" right={`合计 ${fmtBytes(all.today)}${all.peakHour >= 0 ? ` · 高峰 ${all.peakHour} 点` : ''}`} />
      <HourBars ctx={ctx} values={all.hourly} height={78} />
      <HStack>
        {['0', '6', '12', '18'].map(x => <Text font={9} foregroundStyle={th.t3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{x}</Text>)}
      </HStack>
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`${rateText(all.recent)}${slow ? ` · 机场约 ${slow} 分钟更新一次` : ''}`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 性价比 (中): 每 G 多少钱、这期已用掉多少钱
// ─────────────────────────────────────────────────────────────
export function ValueStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="性价比" icon="yensign.circle.fill" />
  const priced = ctx.subs.filter(s => s.price > 0 && s.usage && s.usage.total > 0)
  if (!priced.length) return <Root ctx={ctx}><Header ctx={ctx} title="性价比" icon="yensign.circle.fill" /><Empty ctx={ctx} icon="yensign.circle" text="在 App 的机场详情里填每期价格" /></Root>
  const perG = (s: SubView) => s.price / (s.usage!.total / G)
  const sorted = priced.slice().sort((a, b) => perG(a) - perG(b))
  return (
    <Root ctx={ctx} spacing={7}>
      <Header ctx={ctx} title="性价比" icon="yensign.circle.fill" right="每 G · 剩余价值" />
      {sorted.slice(0, 3).map((s, i) => (
        <HStack spacing={6}>
          <Text font={12} foregroundStyle={th.t1} lineLimit={1} frame={{ width: 72, alignment: 'leading' }}>{s.name}</Text>
          <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={5} />
          <Text font={11} fontWeight="medium" monospacedDigit foregroundStyle={i === 0 ? OK : th.t1} lineLimit={1} frame={{ width: 58, alignment: 'trailing' }}>{`¥${perG(s).toFixed(2)}/G`}</Text>
          <Text font={11} monospacedDigit foregroundStyle={th.t2} lineLimit={1} frame={{ width: 50, alignment: 'trailing' }}>{`¥${(s.price * (1 - s.ratio)).toFixed(1)}`}</Text>
        </HStack>
      ))}
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`最划算: ${sorted[0].name}`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 用量月报 (大): 本月汇总 + 每天热力日历
// ─────────────────────────────────────────────────────────────
function Stat(props: { ctx: Ctx; label: string; value: string; color?: any }) {
  const { th } = props.ctx
  return (
    <VStack alignment="leading" spacing={1} padding={{ horizontal: 9, vertical: 6 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={10} fill={th.card} />}>
      <Text font={10} foregroundStyle={th.t3}>{props.label}</Text>
      <Text font={15} fontWeight="semibold" monospacedDigit foregroundStyle={props.color ?? th.t1} lineLimit={1} minScaleFactor={0.7}>{props.value}</Text>
    </VStack>
  )
}

export function MonthStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, all } = ctx
  if (!ctx.subs.length) return <NoSub ctx={ctx} title="用量月报" icon="doc.text.below.ecg.fill" />
  const m = all.month
  const days = m.days
  const first = days[0]?.d ?? ''
  const lead = first ? (new Date(Date.parse(`${first}T00:00:00Z`)).getUTCDay() + 6) % 7 : 0   // 周一开头
  const cells: ({ d: string; v: number | null } | null)[] = [...Array(lead).fill(null), ...days]
  const max = Math.max(1, ...days.map(x => x.v ?? 0))
  const up = ctx.subs.reduce((a, s) => a + (s.usage?.up ?? 0), 0)
  const down = ctx.subs.reduce((a, s) => a + (s.usage?.down ?? 0), 0)
  const c = m.change
  return (
    <Root ctx={ctx} spacing={8}>
      <Header ctx={ctx} title={`${Number(first.slice(5, 7)) || ''}月用量`} icon="doc.text.below.ecg.fill" font={14} right={`${ctx.subs.length} 个机场合计`} />
      <HStack spacing={6}>
        <Stat ctx={ctx} label="本月" value={fmtBytes(m.total)} />
        <Stat ctx={ctx} label="日均" value={fmtBytes(m.avg)} />
        <Stat ctx={ctx} label="比上月" value={c === null ? '记录中' : `${c >= 0 ? '+' : ''}${Math.round(c * 100)}%`} color={c === null ? th.t3 : c > 0 ? WARN : OK} />
      </HStack>
      <Text font={10} foregroundStyle={th.t3}>每天用量 (颜色越深用得越多)</Text>
      <VStack spacing={3} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'top' }}>
        {chunk(cells, 7).map(row => (
          <HStack spacing={3} frame={{ maxHeight: 'infinity' }}>
            {Array.from({ length: 7 }, (_, i) => {
              const x = row[i]
              const fill = !x ? 'rgba(0,0,0,0)' : x.v === null ? th.track : withAlpha(th.accent, 0.2 + 0.8 * (x.v / max))
              return (
                <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
                  <RoundedRectangle cornerRadius={4} fill={fill} />
                  {x ? <Text font={9} monospacedDigit foregroundStyle={x.v !== null && x.v / max > 0.55 ? '#FFFFFF' : th.t3}>{String(Number(x.d.slice(8)))}</Text> : null}
                </ZStack>
              )
            })}
          </HStack>
        ))}
      </VStack>
      <HStack spacing={6}>
        <Circle fill={th.accent} frame={{ width: 6, height: 6 }} />
        <Text font={10} monospacedDigit foregroundStyle={th.t3} lineLimit={1}>{`↓${fmtBytes(down)} ↑${fmtBytes(up)}`}</Text>
        <Spacer minLength={2} />
        <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{m.max ? `最多 ${Number(m.max.d.slice(5, 7))}/${Number(m.max.d.slice(8))} ${fmtBytes(m.max.v)}` : ''}</Text>
      </HStack>
    </Root>
  )
}
