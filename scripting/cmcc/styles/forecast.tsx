// cmcc / styles/forecast.tsx
// 够不够用: 今日额度 / 倒计时 / 用量预测 / 环比 / 性价比 / 用量月报
// 预测类用本机历史的日均; 历史不够时退回「剩余平均分到月底」

import { VStack, HStack, ZStack, Text, Spacer, Circle, RoundedRectangle, Gauge, AccessoryWidgetBackground } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { formatFlow, type Account } from '../api'
import {
  Root, Header, Num, Label, Cell, Stat, MeterLine, HistEmpty, LockPreview, lockFg, primary, metersOf, amount, month, forecast, md,
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
          {props.labels ? <Text font={9} foregroundStyle={ctx.th.t3}>{props.labels[i]}</Text> : null}
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
        <Text font={10} foregroundStyle={ctx.th.t2}>{`今天已用`}</Text>
      </VStack>
    </HalfGauge>
  )
  const lines = (
    <VStack alignment="leading" spacing={4}>
      <Label ctx={ctx} text={`今天能用 ${amount(m.key, allow)}`} />
      <Text font={11} foregroundStyle={used !== null && ratio > 1 ? (RED as DynamicShapeStyle) : ctx.th.t3} lineLimit={1}>
        {used === null ? '记录中, 今天再刷新一次就有' : ratio > 1 ? `超了 ${amount(m.key, used - allow)}, 明天少用点` : `还能用 ${amount(m.key, left)}`}
      </Text>
    </VStack>
  )
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={6}>
        <Header ctx={ctx} title={`${m.label} · 今天`} />
        <HStack><Spacer />{gauge}<Spacer /></HStack>
        <Spacer />
        {lines}
      </Root>
    )
  }
  const d = p.hist?.daily(m.key, 7) ?? []
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title={`${m.label}流量 · 今日额度`} />
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
        <Text font={9} foregroundStyle={ctx.th.t2}>天后重置</Text>
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
      <Root ctx={ctx} spacing={0}>
        <HStack><Spacer /><DayRing ctx={ctx} size={84} line={8} days={days} elapsed={mo.elapsed} /><Spacer /></HStack>
        <Spacer />
        <HStack spacing={4}>
          {rows.slice(0, 2).map((r, i) => [
            i ? <Spacer /> : null,
            <Text font={10} fontWeight="semibold" foregroundStyle={r.color} lineLimit={1}>{`${r.m.label} ${r.text}`}</Text>,
          ])}
        </HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={0}>
      <HStack spacing={16} frame={{ maxHeight: 'infinity' }}>
        <DayRing ctx={ctx} size={100} line={9} days={days} elapsed={mo.elapsed} />
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
// G 用量预测: 每项一条, 竖线 = 匀速用到月底此刻该剩多少
// ─────────────────────────────────────────────────────────────
export function ForecastStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
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
    <Root ctx={ctx} spacing={big ? 10 : 8}>
      <Header ctx={ctx} title={`本月第 ${mo.day} 天`} sub={`已过 ${Math.round(mo.elapsed * 100)}%`} />
      {rows}
      <Spacer />
      {big ? (
        <VStack alignment="leading" spacing={4}>
          <Label ctx={ctx} text="通用近 7 天每天用量" />
          <DailyBars ctx={ctx} values={p.hist?.daily('gen', 7) ?? []} height={60} labels={weekLabels(7)} />
        </VStack>
      ) : null}
      <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>竖线 = 匀速用到月底此刻该剩多少, 条在线左边说明用快了</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// H 环比: 昨天 / 今天两根柱子, 中间箭头; 下面本周比上周、本月话费比上月
// ─────────────────────────────────────────────────────────────
function Delta(props: { ctx: Ctx; label: string; now: number | null; before: number | null; fmt: (v: number) => string }) {
  const { ctx, now, before } = props
  const d = now !== null && before !== null ? now - before : null
  const text = d === null ? '-' : `${d > 0 ? '↑' : d < 0 ? '↓' : '±'} ${props.fmt(Math.abs(d))}`
  return (
    <HStack>
      <Label ctx={ctx} text={props.label} />
      <Spacer minLength={4} />
      <Text font={11} fontWeight="semibold" foregroundStyle={d === null ? ctx.th.t3 : dyn(d > 0 ? RED : GREEN)}>{text}</Text>
    </HStack>
  )
}

function TwoBars(props: { ctx: Ctx; y: number | null; t: number | null; height: number }) {
  const { ctx, y, t } = props
  const max = Math.max(1e-9, y ?? 0, t ?? 0)
  const col = (v: number | null, label: string, fill: Paint) => (
    <VStack spacing={3}>
      <Text font={10} foregroundStyle={ctx.th.t2} monospacedDigit>{v !== null ? formatFlow(v) : '-'}</Text>
      <VStack frame={{ height: props.height }}>
        <Spacer minLength={0} />
        <RoundedRectangle cornerRadius={6} fill={fill} frame={{ width: 30, height: v !== null ? Math.max(4, (v / max) * props.height) : 4 }} />
      </VStack>
      <Text font={10} foregroundStyle={ctx.th.t3}>{label}</Text>
    </VStack>
  )
  const up = y !== null && t !== null && t > y
  return (
    <HStack alignment="center" spacing={12}>
      {col(y, '昨天', ctx.th.track)}
      <Text font={24} fontWeight="semibold" foregroundStyle={y === null || t === null ? ctx.th.t3 : dyn(up ? RED : GREEN)}>{y === null || t === null ? '·' : up ? '↑' : '↓'}</Text>
      {col(t, '今天', dyn(up ? RED : GREEN))}
    </HStack>
  )
}

export function CompareStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const hist = p.hist
  if (!hist || hist.days < 2) return <Root ctx={ctx}><HistEmpty ctx={ctx} need={2} title="环比" icon="arrow.left.arrow.right" /></Root>
  const [y, t] = hist.daily('gen', 2)
  const d14 = hist.daily('gen', 14)
  const sum = (xs: (number | null)[]) => (xs.some(x => x !== null) ? xs.reduce<number>((acc, x) => acc + (x ?? 0), 0) : null)
  const deltas = [
    <Delta ctx={ctx} label="本周比上周" now={sum(d14.slice(7))} before={sum(d14.slice(0, 7))} fmt={formatFlow} />,
    <Delta ctx={ctx} label="话费比上月" now={p.account.monthFee ?? null} before={hist.lastMonthFee} fmt={v => `¥${v.toFixed(2)}`} />,
  ]
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={4}>
        <Label ctx={ctx} text="通用 · 今天比昨天" />
        <HStack><Spacer /><TwoBars ctx={ctx} y={y} t={t} height={52} /><Spacer /></HStack>
        <Spacer minLength={0} />
        {deltas[0]}
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={0}>
      <HStack spacing={18} frame={{ maxHeight: 'infinity' }}>
        <TwoBars ctx={ctx} y={y} t={t} height={70} />
        <VStack alignment="leading" spacing={8} frame={{ maxWidth: 'infinity' }}>
          <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1}>通用 · 今天比昨天</Text>
          {deltas}
        </VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// I 性价比: 价签造型, 本月每 G 花了多少钱; 下面剩下的流量还值多少
// ─────────────────────────────────────────────────────────────
export function ValueStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const usedMB = (a.general?.usedMB ?? 0) + (a.targeted?.usedMB ?? 0)
  const remainMB = (a.general?.remainMB ?? 0) + (a.targeted?.remainMB ?? 0)
  const perG = a.monthFee && usedMB > 100 ? a.monthFee / (usedMB / 1024) : null
  const tag = (
    <ZStack alignment="topLeading">
      <VStack
        alignment="leading" spacing={0}
        padding={{ top: 14, bottom: 10, horizontal: 12 }}
        frame={{ maxWidth: 'infinity', alignment: 'leading' }}
        overlay={<RoundedRectangle cornerRadius={12} stroke={{ shapeStyle: ctx.th.t3, strokeStyle: { lineWidth: 1.5, dash: [5, 3] } }} />}
      >
        <Text font={10} foregroundStyle={ctx.th.t3}>本月每 G</Text>
        <Num value={perG !== null ? `¥${perG.toFixed(2)}` : '-'} size={ctx.size === 's' ? 28 : 32} color={ctx.th.t1} />
      </VStack>
      <Circle fill={ctx.th.bg} frame={{ width: 10, height: 10 }} overlay={<Circle stroke={{ shapeStyle: ctx.th.t3, strokeStyle: { lineWidth: 1.5 } }} />} offset={{ x: 12, y: -5 }} />
    </ZStack>
  )
  const lines = (
    <VStack alignment="leading" spacing={3}>
      <Label ctx={ctx} text={`已花 ¥${(a.monthFee ?? 0).toFixed(2)} · 用了 ${formatFlow(usedMB)}`} />
      <HStack>
        <Label ctx={ctx} text="剩下的还值" />
        <Spacer minLength={4} />
        <Num value={perG !== null ? `¥${((remainMB / 1024) * perG).toFixed(0)}` : '-'} size={13} color={ctx.th.t1} />
      </HStack>
    </VStack>
  )
  if (ctx.size === 's') return <Root ctx={ctx} spacing={0}><Spacer minLength={4} />{tag}<Spacer />{lines}</Root>
  return (
    <Root ctx={ctx} spacing={0}>
      <HStack spacing={16} frame={{ maxHeight: 'infinity' }}>
        <VStack frame={{ width: 150 }}>{tag}</VStack>
        <VStack alignment="leading" spacing={6} frame={{ maxWidth: 'infinity' }}>{lines}<Text font={10} foregroundStyle={ctx.th.t3}>按本月消费和已用流量算, 含定向</Text></VStack>
      </HStack>
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
        <Header ctx={ctx} title={`${new Date().getMonth() + 1} 月通用用量`} />
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
      <Header ctx={ctx} title={`${new Date().getMonth() + 1} 月通用用量`} />
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
                <ZStack frame={{ maxWidth: 'infinity', height: 26 }} background={<RoundedRectangle cornerRadius={5} fill={fill} />}>
                  <Text font={10} foregroundStyle={dayNo === mo.day ? ctx.th.t1 : ctx.th.t3} fontWeight={dayNo === mo.day ? 'semibold' : 'regular'}>{String(dayNo)}</Text>
                </ZStack>
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

