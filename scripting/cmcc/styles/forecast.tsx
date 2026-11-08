// cmcc / styles/forecast.tsx
// 够不够用: 今日额度 / 倒计时 / 用量预测 / 用量月报
// 预测类用本机历史的日均; 历史不够时退回「剩余平均分到月底」

import { VStack, HStack, ZStack, Text, Spacer, Circle, RoundedRectangle, Gauge, AccessoryWidgetBackground } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { formatFlow, type Account } from '../api'
import {
  Root, Header, Num, Label, Cell, Stat, Bar, MeterLine, LockPreview, lockFg, primary, metersOf, amount, month, forecast, tightest, md,
  RED, GREEN, ORANGE, type Ctx, type Meter, type Paint,
} from '../ui'
import type { Hist } from '../history'
import type { Slot } from '../ui'
import { NoData } from './basic'

const dyn = (x: any) => x as DynamicShapeStyle

// ─────────────────────────────────────────────────────────────
// 共用
// ─────────────────────────────────────────────────────────────
/** 柱状图: 值越大越高, 最后一根 (今天) 用强调色 */
export function DailyBars(props: { ctx: Ctx; values: (number | null)[]; height: number; labels?: string[] }) {
  const { ctx } = props
  if (!props.values.some(v => v !== null)) {
    return <Text font={11} foregroundStyle={ctx.th.t3} frame={{ maxWidth: 'infinity', height: props.height, alignment: 'center' }}>记录中, 用几天后显示</Text>
  }
  const max = Math.max(1e-9, ...props.values.map(v => v ?? 0))
  return (
    <HStack alignment="bottom" spacing={4} frame={{ height: props.height + (props.labels ? 14 : 0) }}>
      {props.values.map((v, i) => (
        <VStack spacing={2} frame={{ maxWidth: 'infinity' }}>
          <Spacer minLength={0} />
          <RoundedRectangle
            cornerRadius={3}
            fill={i === props.values.length - 1 ? (GREEN as DynamicShapeStyle) : ctx.th.track}
            frame={{ maxWidth: 'infinity', height: v === null ? 2 : Math.max(2, (v / max) * props.height) }}
          />
          {props.labels ? <Text font={10} foregroundStyle={ctx.th.t3}>{props.labels[i]}</Text> : null}
        </VStack>
      ))}
    </HStack>
  )
}

const WEEK = '日一二三四五六'
const weekLabels = (n: number) => Array.from({ length: n }, (_, i) => WEEK[new Date(Date.now() - (n - 1 - i) * 86_400_000).getDay()])

/** 用量的说法: 照日均几号用完, 或每天可用多少 */
function planText(m: Meter, hist?: Hist) {
  const f = forecast(m, hist)
  if (f.runOut) return { text: `约 ${md(f.runOut)} 用完`, bad: true }
  return { text: `每天可用 ${amount(m.key, f.perDay)}${f.avg !== null ? ' · 够到月底' : ''}`, bad: false }
}

// ─────────────────────────────────────────────────────────────
// E 今日额度: 今天用了多少 / 今天能用多少 (剩余平均分到月底)
// ─────────────────────────────────────────────────────────────
function HalfGauge(props: { ctx: Ctx; ratio: number; size: number; line: number; children?: any }) {
  const { ctx } = props
  const p = Math.max(0, Math.min(1, props.ratio))
  const color = (p > 1 ? RED : p >= 0.8 ? ORANGE : GREEN) as DynamicShapeStyle
  return (
    <ZStack frame={{ width: props.size + props.line, height: props.size / 2 + props.line }}>
      <ZStack frame={{ width: props.size + props.line, height: props.size + props.line }} offset={{ x: 0, y: props.size / 4 }}>
        <Circle trim={{ from: 0.5, to: 1 }} stroke={{ shapeStyle: ctx.th.track, strokeStyle: { lineWidth: props.line, lineCap: 'round' } }} frame={{ width: props.size, height: props.size }} />
        {p > 0 ? <Circle trim={{ from: 0.5, to: 0.5 + p / 2 }} stroke={{ shapeStyle: props.ratio > 1 ? (RED as DynamicShapeStyle) : color, strokeStyle: { lineWidth: props.line, lineCap: 'round' } }} frame={{ width: props.size, height: props.size }} /> : null}
      </ZStack>
      {props.children}
    </ZStack>
  )
}

export function TodayStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const m = metersOf(p.account).find(x => x.key === 'gen') ?? metersOf(p.account)[0]
  if (!m) return <NoData ctx={ctx} />
  const used = p.hist?.today(m.key) ?? null
  const allow = (m.remain + (used ?? 0)) / month().left
  const ratio = used !== null && allow > 0 ? used / allow : 0
  const left = Math.max(0, allow - (used ?? 0))
  const gauge = (
    <HalfGauge ctx={ctx} ratio={ratio} size={ctx.size === 's' ? 108 : 120} line={10}>
      <VStack spacing={0} offset={{ x: 0, y: 10 }}>
        <Num value={used !== null ? amount(m.key, used) : '-'} size={20} color={used !== null && ratio > 1 ? RED : ctx.th.t1} />
        <Text font={10} foregroundStyle={ctx.th.t2} lineLimit={1}>{`${m.label}今天已用`}</Text>
      </VStack>
    </HalfGauge>
  )
  const lines = (
    <VStack alignment="leading" spacing={4}>
      <Label ctx={ctx} text={`今天能用 ${amount(m.key, allow)}`} />
      <Text font={11} foregroundStyle={used !== null && ratio > 1 ? (RED as DynamicShapeStyle) : ctx.th.t3} lineLimit={1}>
        {used === null ? '记录中, 再刷新一次' : ratio > 1 ? `超了 ${amount(m.key, used - allow)}` : `还能用 ${amount(m.key, left)}`}
      </Text>
    </VStack>
  )
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={6}>
        <Header ctx={ctx} />
        <HStack><Spacer />{gauge}<Spacer /></HStack>
        <Spacer />
        {lines}
      </Root>
    )
  }
  const d = p.hist?.daily(m.key, 7) ?? []
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} sub={`${m.label} · 今日额度`} />
      <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
        <VStack spacing={8}>{gauge}{lines}</VStack>
        <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity' }}>
          <Label ctx={ctx} text="近 7 天" />
          <DailyBars ctx={ctx} values={d} height={58} labels={weekLabels(7)} />
        </VStack>
      </HStack>
    </Root>
  )
}

export function TodayLock(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  const m = p ? (metersOf(p.account).find(x => x.key === 'gen') ?? metersOf(p.account)[0]) : undefined
  const used = m && p?.hist ? p.hist.today(m.key) : null
  const allow = m ? (m.remain + (used ?? 0)) / month().left : 0
  return (
    <LockPreview ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <Gauge
          value={used !== null && allow > 0 ? Math.min(1, used / allow) : 0} min={0} max={1}
          label={<Text>今日</Text>}
          currentValueLabel={<Text fontDesign="rounded" monospacedDigit foregroundStyle={lockFg(ctx)}>{used !== null && m ? amount(m.key, used).replace(/\.\d+/, '') : '-'}</Text>}
          gaugeStyle="accessoryCircularCapacity"
        />
      </ZStack>
    </LockPreview>
  )
}

// ─────────────────────────────────────────────────────────────
// F 倒计时: 一个圆环 = 本月已过的比例, 环里写还有几天; 下面每项撑不撑得到
// ─────────────────────────────────────────────────────────────
function DayRing(props: { ctx: Ctx; size: number; line: number; days: number; elapsed: number }) {
  const { ctx } = props
  return (
    <ZStack frame={{ width: props.size + props.line, height: props.size + props.line }}>
      <Circle stroke={{ shapeStyle: ctx.th.track, strokeStyle: { lineWidth: props.line } }} frame={{ width: props.size, height: props.size }} />
      <Circle trim={{ from: 0, to: Math.max(0.02, props.elapsed) }} stroke={{ shapeStyle: ctx.th.t1, strokeStyle: { lineWidth: props.line, lineCap: 'round' } }} rotationEffect={-90} frame={{ width: props.size, height: props.size }} />
      <VStack spacing={0}>
        <Num value={props.days} size={props.size * 0.3} color={ctx.th.t1} />
        <Text font={10} foregroundStyle={ctx.th.t2}>天后重置</Text>
      </VStack>
    </ZStack>
  )
}

function countdownRows(ctx: Ctx, p: Slot & { account: Account }) {
  return metersOf(p.account).map(m => {
    const f = forecast(m, p.hist)
    const text = f.runOut ? `差 ${f.shortDays} 天` : f.avg !== null ? '撑得到 ✓' : `每天 ${amount(m.key, f.perDay)}`
    return { m, text, color: (f.runOut ? dyn(RED) : f.avg !== null ? dyn(GREEN) : ctx.th.t2) as Paint }
  })
}

export function CountdownStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const mo = month()
  const days = Math.ceil((mo.reset - Date.now()) / 86_400_000)
  const rows = countdownRows(ctx, p)
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={2}>
        <Header ctx={ctx} />
        <HStack><Spacer /><DayRing ctx={ctx} size={rows.length > 2 ? 56 : 68} line={7} days={days} elapsed={mo.elapsed} /><Spacer /></HStack>
        <Spacer />
        <VStack spacing={2}>
          {rows.map(r => (
            <HStack>
              <Label ctx={ctx} text={r.m.label} />
              <Spacer minLength={4} />
              <Text font={11} fontWeight="semibold" foregroundStyle={r.color} lineLimit={1}>{r.text}</Text>
            </HStack>
          ))}
        </VStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} />
      <HStack spacing={16} frame={{ maxHeight: 'infinity' }}>
        <DayRing ctx={ctx} size={88} line={8} days={days} elapsed={mo.elapsed} />
        <VStack alignment="leading" spacing={7} frame={{ maxWidth: 'infinity' }}>
          <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1}>{`${md(mo.reset)}重置 · 已过 ${Math.round(mo.elapsed * 100)}%`}</Text>
          {rows.map(r => (
            <HStack>
              <Label ctx={ctx} text={`${r.m.label} ${amount(r.m.key, r.m.remain)}`} />
              <Spacer minLength={4} />
              <Text font={11} fontWeight="semibold" foregroundStyle={r.color} lineLimit={1}>{r.text}</Text>
            </HStack>
          ))}
        </VStack>
      </HStack>
    </Root>
  )
}

export function CountdownLock(props: { ctx: Ctx }) {
  const { ctx } = props
  const mo = month()
  const days = Math.ceil((mo.reset - Date.now()) / 86_400_000)
  return (
    <LockPreview ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <Gauge
          value={mo.elapsed} min={0} max={1}
          label={<Text>重置</Text>}
          currentValueLabel={<Text fontDesign="rounded" monospacedDigit foregroundStyle={lockFg(ctx)}>{String(days)}</Text>}
          gaugeStyle="accessoryCircularCapacity"
        />
      </ZStack>
    </LockPreview>
  )
}

// ─────────────────────────────────────────────────────────────
// G 用量预测 · 小号: 只回答一件事, 最紧张的那项够不够用
// ─────────────────────────────────────────────────────────────
function ForecastSmall(props: { ctx: Ctx; p: Slot & { account: Account } }) {
  const { ctx, p } = props
  const t = tightest(metersOf(p.account), p.hist)
  if (!t) return <NoData ctx={ctx} />
  const { m, f } = t
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} />
      <Spacer />
      <Label ctx={ctx} text={f.runOut ? `${m.label}约` : `${m.label}每天可用`} />
      <Num value={f.runOut ? `${new Date(f.runOut).getDate()} 日` : amount(m.key, f.perDay)} size={36} color={f.runOut ? dyn(RED) : ctx.th.t1} />
      <Label ctx={ctx} text={f.runOut ? `用完 · 早 ${f.shortDays} 天` : `剩 ${amount(m.key, m.remain)}`} />
      <Spacer />
      <Bar ctx={ctx} percent={m.percent} height={6} tick={(1 - month().elapsed) * 100} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// G 用量预测: 每项一条, 竖线 = 匀速用到月底此刻该剩多少
// ─────────────────────────────────────────────────────────────
export function ForecastStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  if (ctx.size === 's') return <ForecastSmall ctx={ctx} p={p} />
  const mo = month()
  const tick = (1 - mo.elapsed) * 100
  const ms = metersOf(p.account)
  const big = ctx.size === 'l'
  const rows = ms.map(m => {
    const plan = planText(m, p.hist)
    const line = <MeterLine ctx={ctx} m={m} total={big} font={big ? 17 : 13} bar={big ? 7 : 6} tick={tick} />
    const note = <Text font={big ? 11 : 10} foregroundStyle={plan.bad ? (RED as DynamicShapeStyle) : ctx.th.t3} lineLimit={1}>{plan.text}</Text>
    return big ? <Cell ctx={ctx} gap={5}>{line}{note}</Cell> : <VStack alignment="leading" spacing={2}>{line}{note}</VStack>
  })
  return (
    <Root ctx={ctx} spacing={big ? 10 : ms.length > 2 ? 4 : 8}>
      <Header ctx={ctx} sub={`第 ${mo.day} 天 · 已过 ${Math.round(mo.elapsed * 100)}%`} />
      {rows}
      <Spacer />
      {big && ms.length < 3 ? (
        <VStack alignment="leading" spacing={4}>
          <Label ctx={ctx} text="通用近 7 天每天用量" />
          <DailyBars ctx={ctx} values={p.hist?.daily('gen', 7) ?? []} height={60} labels={weekLabels(7)} />
        </VStack>
      ) : null}
      {!big && ms.length > 2 ? null : <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>竖线 = 匀速用到月底此刻该剩多少</Text>}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// J 用量月报: 本月合计 / 日均 / 最多一天, 大号带每天一格的热力日历
// ─────────────────────────────────────────────────────────────
export function MonthStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const mo = month()
  const used = p.account.general?.usedMB ?? 0
  const days = p.hist?.daily('gen', mo.day) ?? []
  const known = days.filter((x): x is number => x !== null)
  const peak = known.length ? Math.max(...known) : null
  const stats = (
    <HStack spacing={6}>
      <Stat ctx={ctx} label="本月合计" value={formatFlow(used)} size={14} />
      <Stat ctx={ctx} label="日均" value={formatFlow(used / mo.day)} size={14} />
      <Stat ctx={ctx} label="最多一天" value={peak !== null ? formatFlow(peak) : '-'} size={14} />
    </HStack>
  )
  if (ctx.size !== 'l') {
    return (
      <Root ctx={ctx} spacing={8}>
        <Header ctx={ctx} sub={`${new Date().getMonth() + 1} 月通用用量`} />
        {stats}
        <DailyBars ctx={ctx} values={p.hist?.daily('gen', 14) ?? []} height={34} />
      </Root>
    )
  }
  // 热力日历: 周一开头, 每天一格, 越深用得越多
  const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const pad = (first.getDay() + 6) % 7
  const cells: (number | null | undefined)[] = [...Array(pad).fill(undefined), ...Array.from({ length: mo.dim }, (_, i) => (i < mo.day ? days[i] : undefined))]
  const max = Math.max(1e-9, ...known)
  const rows: (number | null | undefined)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return (
    <Root ctx={ctx} spacing={10}>
      <Header ctx={ctx} sub={`${new Date().getMonth() + 1} 月通用用量`} />
      {stats}
      <HStack spacing={5}>{'一二三四五六日'.split('').map(w => <Text font={10} foregroundStyle={ctx.th.t3} frame={{ maxWidth: 'infinity' }}>{w}</Text>)}</HStack>
      <VStack spacing={5}>
        {rows.map((r, ri) => (
          <HStack spacing={5}>
            {Array.from({ length: 7 }, (_, ci) => {
              const v = r[ci]
              const dayNo = ri * 7 + ci - pad + 1
              if (dayNo < 1 || dayNo > mo.dim) return <RoundedRectangle cornerRadius={5} fill="rgba(0,0,0,0)" frame={{ maxWidth: 'infinity', height: 26 }} />
              const fill: Paint = typeof v === 'number' ? `rgba(52,199,89,${(0.18 + (v / max) * 0.82).toFixed(2)})` : ctx.th.card
              return (
                <RoundedRectangle cornerRadius={5} fill={fill} frame={{ maxWidth: 'infinity', height: 26 }}
                  overlay={<Text font={10} foregroundStyle={dayNo === mo.day ? ctx.th.t1 : ctx.th.t3} fontWeight={dayNo === mo.day ? 'semibold' : 'regular'}>{String(dayNo)}</Text>} />
              )
            })}
          </HStack>
        ))}
      </VStack>
      <Spacer />
      <Text font={10} foregroundStyle={ctx.th.t3}>{known.length ? '颜色越深用得越多; 灰格是还没记录的日子' : '记录中, 每天刷新几次后这里会出现颜色'}</Text>
    </Root>
  )
}

