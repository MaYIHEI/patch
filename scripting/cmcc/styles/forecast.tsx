// cmcc / styles/forecast.tsx
// 够不够用: 今日额度 / 倒计时 / 用量预测 / 环比 / 性价比 / 用量月报
// 预测类用本机历史的日均; 历史不够时退回「剩余平均分到月底」

import { VStack, HStack, ZStack, Text, Spacer, Circle, RoundedRectangle, Gauge, AccessoryWidgetBackground } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { formatFlow } from '../api'
import {
  Root, Header, Num, Label, Cell, Stat, Bar, MeterLine, HistEmpty, LockPreview, lockFg, primary, metersOf, amount, month, forecast, md,
  RED, GREEN, ORANGE, type Ctx, type Meter, type Paint,
} from '../ui'
import type { Hist } from '../history'
import { NoData } from './basic'

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
// F 倒计时: 离下次重置还有几天, 每项撑不撑得到
// ─────────────────────────────────────────────────────────────
export function CountdownStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const mo = month()
  const days = Math.ceil((mo.reset - Date.now()) / 86_400_000)
  const rows = metersOf(p.account).map(m => {
    const f = forecast(m, p.hist)
    const text = f.runOut ? `差 ${f.shortDays} 天` : f.avg !== null ? '撑得到' : `每天 ${amount(m.key, f.perDay)}`
    return { m, text, color: (f.runOut ? RED : f.avg !== null ? GREEN : null) as Paint | null }
  })
  const big = (
    <HStack alignment="bottom" spacing={6}>
      <Num value={days} size={ctx.size === 's' ? 46 : 54} color={ctx.th.t1} />
      {/* 小号一行放不下「天后重置 · 12月1日」, 分两行 */}
      <VStack alignment="leading" spacing={1} padding={{ bottom: 6 }}>
        <Label ctx={ctx} text="天后重置" />
        <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{md(mo.reset)}</Text>
      </VStack>
    </HStack>
  )
  const list = (
    <VStack spacing={5}>
      {rows.map(r => (
        <HStack>
          <Label ctx={ctx} text={`${r.m.label} ${amount(r.m.key, r.m.remain)}`} />
          <Spacer minLength={4} />
          <Text font={11} fontWeight="semibold" foregroundStyle={r.color ?? ctx.th.t2} lineLimit={1}>{r.text}</Text>
        </HStack>
      ))}
    </VStack>
  )
  if (ctx.size === 's') return <Root ctx={ctx} spacing={0}><Header ctx={ctx} title="离重置" /><Spacer />{big}<Spacer />{list}</Root>
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} title="中国移动 · 离重置" />
      <HStack spacing={18} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={6}>
          {big}
          <Bar ctx={ctx} percent={(1 - mo.elapsed) * 100} color={GREEN} height={6} />
          <Label ctx={ctx} text={`本月已过 ${Math.round(mo.elapsed * 100)}%`} />
        </VStack>
        <VStack frame={{ maxWidth: 'infinity' }}>{list}</VStack>
      </HStack>
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
// H 环比: 今天比昨天, 本周比上周, 本月话费比上月
// ─────────────────────────────────────────────────────────────
function Delta(props: { ctx: Ctx; label: string; now: number | null; before: number | null; fmt: (v: number) => string }) {
  const { ctx, now, before } = props
  const d = now !== null && before !== null ? now - before : null
  const text = d === null ? '-' : `${d > 0 ? '↑' : d < 0 ? '↓' : '±'} ${props.fmt(Math.abs(d))}`
  return (
    <HStack>
      <Label ctx={ctx} text={props.label} />
      <Spacer minLength={4} />
      <Text font={11} fontWeight="semibold" foregroundStyle={d === null ? ctx.th.t3 : ((d > 0 ? RED : GREEN) as DynamicShapeStyle)}>{text}</Text>
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
  const sum = (xs: (number | null)[]) => (xs.some(x => x !== null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null)
  const fee = p.account.monthFee ?? null
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} title="比昨天" />
      <Spacer />
      <Label ctx={ctx} text="通用今天用了" />
      <HStack alignment="lastTextBaseline" spacing={6}>
        <Num value={t !== null ? formatFlow(t) : '-'} size={ctx.size === 's' ? 30 : 36} color={ctx.th.t1} />
        {t !== null && y !== null ? <Text font={13} foregroundStyle={(t > y ? RED : GREEN) as DynamicShapeStyle}>{`${t > y ? '↑' : '↓'} ${formatFlow(Math.abs(t - y))}`}</Text> : null}
      </HStack>
      <Spacer />
      <VStack spacing={3}>
        <Delta ctx={ctx} label="本周比上周" now={sum(d14.slice(7))} before={sum(d14.slice(0, 7))} fmt={formatFlow} />
        <Delta ctx={ctx} label="本月话费比上月" now={fee} before={hist.lastMonthFee} fmt={v => `¥${v.toFixed(2)}`} />
      </VStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// I 性价比: 本月每 G 花了多少钱, 剩下的流量还值多少
// ─────────────────────────────────────────────────────────────
export function ValueStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const usedMB = (a.general?.usedMB ?? 0) + (a.targeted?.usedMB ?? 0)
  const remainMB = (a.general?.remainMB ?? 0) + (a.targeted?.remainMB ?? 0)
  const perG = a.monthFee && usedMB > 100 ? a.monthFee / (usedMB / 1024) : null
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} title="本月性价比" />
      <Spacer />
      <Label ctx={ctx} text="每 G 花了" />
      <Num value={perG !== null ? `¥${perG.toFixed(2)}` : '-'} size={ctx.size === 's' ? 34 : 40} color={ctx.th.t1} />
      <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{`¥${(a.monthFee ?? 0).toFixed(2)} · 已用 ${formatFlow(usedMB)}`}</Text>
      <Spacer />
      <HStack>
        <Label ctx={ctx} text="剩下的还值" />
        <Spacer />
        <Num value={perG !== null ? `¥${((remainMB / 1024) * perG).toFixed(0)}` : '-'} size={13} color={ctx.th.t1} />
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

