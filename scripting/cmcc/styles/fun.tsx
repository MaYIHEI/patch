// cmcc / styles/fun.tsx
// 换个说法: 话费天气 / 账户体检 / 地铁线路 / 网龄徽章 / 终端 / 话费小票

import { VStack, HStack, ZStack, Text, Spacer, Image, Circle, Rectangle } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import type { Account } from '../api'
import type { Hist } from '../history'
import {
  Root, Header, Num, Label, primary, metersOf, amount, month, forecast, md, hhmm, starText, pointsText, netText,
  RED, GREEN, ORANGE, type Ctx, type Meter, type Paint,
} from '../ui'
import { NoData } from './basic'

const dyn = (x: any) => x as DynamicShapeStyle

// ─────────────────────────────────────────────────────────────
// K 话费天气: 够用晴, 偏紧多云, 月底前用完下雨, 欠费雷暴
// ─────────────────────────────────────────────────────────────
type Sky = { icon: string; word: string; color: Paint; rank: number }
const SUN: Sky = { icon: 'sun.max.fill', word: '晴', color: dyn(ORANGE), rank: 0 }
const CLOUD: Sky = { icon: 'cloud.sun.fill', word: '多云', color: dyn({ light: '#8E8E93', dark: '#98989F' }), rank: 1 }
const RAIN: Sky = { icon: 'cloud.rain.fill', word: '有雨', color: dyn({ light: '#636366', dark: '#AEAEB2' }), rank: 2 }
const STORM: Sky = { icon: 'cloud.bolt.rain.fill', word: '雷暴', color: dyn(RED), rank: 3 }

function skyOf(m: Meter, hist?: Hist): Sky {
  const f = forecast(m, hist)
  if (f.runOut || m.percent < 20) return RAIN
  if (m.percent <= 50) return CLOUD
  return SUN
}

const balanceSky = (a: Account): Sky => (a.balance < 0 ? STORM : a.balance < 10 ? RAIN : SUN)

export function WeatherStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const items = [
    { label: '余额', sky: balanceSky(a), text: a.balance < 0 ? `欠费 ${(-a.balance).toFixed(2)}` : `¥${a.balance.toFixed(2)}` },
    ...metersOf(a).map(m => {
      const f = forecast(m, p.hist)
      return { label: m.label, sky: skyOf(m, p.hist), text: f.runOut ? `约 ${md(f.runOut)} 用完` : `剩 ${Math.round(m.percent)}%` }
    }),
  ]
  const worst = items.reduce((w, x) => (x.sky.rank > w.sky.rank ? x : w), items[0])
  const headline = worst.sky.rank === 0 ? '全部晴' : `${worst.label}${worst.sky.word}`
  const icon = <Image systemName={worst.sky.icon} font={ctx.size === 's' ? 40 : 52} foregroundStyle={worst.sky.color} />
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={0}>
        <Header ctx={ctx} title="话费天气" />
        <Spacer />
        {icon}
        <Text font={17} fontWeight="semibold" foregroundStyle={ctx.th.t1} padding={{ top: 6 }}>{headline}</Text>
        <Label ctx={ctx} text={worst.text} />
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={0}>
      <HStack spacing={16} frame={{ maxHeight: 'infinity' }}>
        <VStack spacing={6} frame={{ width: 104 }}>
          {icon}
          <Text font={17} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1} minScaleFactor={0.7}>{headline}</Text>
        </VStack>
        <VStack alignment="leading" spacing={7} frame={{ maxWidth: 'infinity' }}>
          <Header ctx={ctx} title="话费天气" />
          {items.map(x => (
            <HStack spacing={6}>
              <Image systemName={x.sky.icon} font={12} foregroundStyle={x.sky.color} frame={{ width: 18 }} />
              <Label ctx={ctx} text={`${x.label}${x.sky.word}`} color={ctx.th.t1} />
              <Spacer minLength={4} />
              <Text font={11} foregroundStyle={ctx.th.t2} lineLimit={1}>{x.text}</Text>
            </HStack>
          ))}
          <Spacer minLength={0} />
          <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>晴 够用 · 多云 偏紧 · 雨 月底前用完 · 雷暴 欠费</Text>
        </VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// L 账户体检: 100 分往下扣, 每一条扣分写清原因
// ─────────────────────────────────────────────────────────────
function checkup(a: Account, hist?: Hist): { score: number; items: { pts: number; text: string }[] } {
  const items: { pts: number; text: string }[] = []
  if (a.balance < 0) items.push({ pts: 40, text: `已欠费 ${(-a.balance).toFixed(2)} 元` })
  else if (a.balance < 10) items.push({ pts: 20, text: `余额只剩 ${a.balance.toFixed(2)} 元` })
  for (const m of metersOf(a)) {
    const f = forecast(m, hist)
    if (f.runOut) items.push({ pts: 15, text: `${m.label}约 ${md(f.runOut)} 用完` })
    else if (m.percent < 20) items.push({ pts: 10, text: `${m.label}只剩 ${Math.round(m.percent)}%` })
    else if (m.percent <= 50) items.push({ pts: 5, text: `${m.label}剩 ${Math.round(m.percent)}%, 偏紧` })
  }
  const today = hist?.today('gen') ?? null
  const avg = hist?.avg('gen') ?? null
  if (today !== null && avg !== null && today > avg * 1.5) items.push({ pts: 5, text: `通用今天比平时多用 ${amount('gen', today - avg)}` })
  return { score: Math.max(0, 100 - items.reduce((s, x) => s + x.pts, 0)), items: items.sort((x, y) => y.pts - x.pts) }
}

export function HealthStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const { score, items } = checkup(p.account, p.hist)
  const color = dyn(score >= 80 ? GREEN : score >= 60 ? ORANGE : RED)
  const list = items.length
    ? items.slice(0, ctx.size === 's' ? 3 : 4).map(x => (
      <HStack spacing={4}>
        <Text font={10} fontWeight="semibold" foregroundStyle={dyn(RED)} monospacedDigit frame={{ width: 24, alignment: 'leading' }}>{`−${x.pts}`}</Text>
        <Text font={10} foregroundStyle={ctx.th.t2} lineLimit={1}>{x.text}</Text>
      </HStack>
    ))
    : [<Text font={11} foregroundStyle={dyn(GREEN)}>没有扣分项, 余额和流量都够</Text>]
  const big = (
    <HStack alignment="lastTextBaseline" spacing={3}>
      <Num value={score} size={ctx.size === 's' ? 44 : 52} color={color} />
      <Label ctx={ctx} text="分" />
    </HStack>
  )
  if (ctx.size === 's') return <Root ctx={ctx} spacing={0}><Header ctx={ctx} title="账户体检" /><Spacer />{big}<Spacer /><VStack alignment="leading" spacing={2}>{list}</VStack></Root>
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} title="账户体检" sub={`尾号 ${p.account.phoneTail}`} />
      <HStack spacing={18} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={2}>{big}<Label ctx={ctx} text={score >= 80 ? '状态良好' : score >= 60 ? '有点紧张' : '需要处理'} /></VStack>
        <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity' }}>{list}</VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// M 地铁线路: 本月每天一站, 走到今天; 哪项会在哪天「断供」标红站
// ─────────────────────────────────────────────────────────────
function Line(props: { ctx: Ctx; stops: number[] }) {
  const { ctx } = props
  const mo = month()
  const bad = new Set(props.stops)
  return (
    <HStack spacing={0} frame={{ height: 14 }}>
      {Array.from({ length: mo.dim }, (_, i) => {
        const d = i + 1
        const done = d < mo.day
        const today = d === mo.day
        const stop = bad.has(d)
        const size = today ? 12 : stop ? 9 : 5
        const fill: Paint = stop ? dyn(RED) : done || today ? dyn(GREEN) : ctx.th.track
        return (
          <ZStack frame={{ maxWidth: 'infinity', height: 14 }}>
            <Rectangle fill={done ? dyn(GREEN) : ctx.th.track} frame={{ maxWidth: 'infinity', height: 3 }} />
            {today ? <Circle fill={ctx.th.bg} frame={{ width: size, height: size }} overlay={<Circle stroke={{ shapeStyle: dyn(GREEN), strokeStyle: { lineWidth: 3 } }} />} />
              : <Circle fill={fill} frame={{ width: size, height: size }} />}
          </ZStack>
        )
      })}
    </HStack>
  )
}

export function MetroStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const mo = month()
  const rows = metersOf(p.account).map(m => ({ m, f: forecast(m, p.hist) }))
  const stops = rows.filter(r => r.f.runOut).map(r => new Date(r.f.runOut!).getDate())
  return (
    <Root ctx={ctx} spacing={ctx.size === 'l' ? 14 : 8}>
      <Header ctx={ctx} title={`${new Date().getMonth() + 1} 月线路`} sub={`第 ${mo.day} 站 / 共 ${mo.dim} 站`} />
      <Spacer />
      <Line ctx={ctx} stops={stops} />
      <HStack>
        <Text font={10} foregroundStyle={ctx.th.t3}>1日</Text>
        <Spacer />
        <Text font={10} foregroundStyle={ctx.th.t1} fontWeight="semibold">{`今天 ${mo.day}日`}</Text>
        <Spacer />
        <Text font={10} foregroundStyle={ctx.th.t3}>{`${mo.dim}日 终点`}</Text>
      </HStack>
      <Spacer />
      <VStack alignment="leading" spacing={4}>
        {rows.map(r => (
          <HStack spacing={6}>
            <Circle fill={r.f.runOut ? dyn(RED) : dyn(GREEN)} frame={{ width: 7, height: 7 }} />
            <Label ctx={ctx} text={`${r.m.label} ${amount(r.m.key, r.m.remain)}`} color={ctx.th.t1} />
            <Spacer minLength={4} />
            <Text font={11} foregroundStyle={r.f.runOut ? dyn(RED) : ctx.th.t2} lineLimit={1}>
              {r.f.runOut ? `${new Date(r.f.runOut).getDate()}日站断供` : r.f.avg !== null ? '直达终点' : `每站可用 ${amount(r.m.key, r.f.perDay)}`}
            </Text>
          </HStack>
        ))}
      </VStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// N 网龄徽章: 网龄、星级和下一个整数年
// ─────────────────────────────────────────────────────────────
const GOLD = dyn({ light: '#C9A227', dark: '#E0BC4A' })

export function BadgeStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const y = a.user?.netYears
  const next = y !== undefined ? Math.max(5, Math.ceil((y + 0.01) / 5) * 5) : undefined
  const ring = (
    <ZStack frame={{ width: 84, height: 84 }}>
      <Circle stroke={{ shapeStyle: GOLD, strokeStyle: { lineWidth: 5 } }} frame={{ width: 78, height: 78 }} />
      <VStack spacing={0}>
        <Num value={y !== undefined ? y.toFixed(1) : '-'} size={24} color={ctx.th.t1} />
        <Text font={10} foregroundStyle={ctx.th.t2}>年网龄</Text>
      </VStack>
    </ZStack>
  )
  const lines = (
    <VStack alignment={ctx.size === 's' ? 'center' : 'leading'} spacing={3}>
      <Text font={13} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>{[starText(a), a.user?.brand].filter(x => x && x !== '-').join(' · ') || '中国移动'}</Text>
      {y !== undefined && next !== undefined ? <Text font={10} foregroundStyle={ctx.th.t3}>{`再 ${(next - y).toFixed(1)} 年满 ${next} 年`}</Text> : null}
      {ctx.size === 'm' ? <Text font={10} foregroundStyle={ctx.th.t3}>{`星级分 ${a.user?.starScore ?? '-'} · 积分 ${pointsText(a)}`}</Text> : null}
    </VStack>
  )
  if (ctx.size === 's') return <Root ctx={ctx} spacing={6}><HStack><Spacer />{ring}<Spacer /></HStack>{lines}</Root>
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} title="网龄徽章" />
      <HStack spacing={18} frame={{ maxHeight: 'infinity' }}>{ring}{lines}<Spacer /></HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// O 终端: 等宽字逐行 ✓ ! ✗
// ─────────────────────────────────────────────────────────────
const MONO = 'monospaced' as const

export function TerminalStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const mark = (ok: boolean, warn: boolean) => (ok ? { s: '✓', c: dyn(GREEN) } : warn ? { s: '!', c: dyn(ORANGE) } : { s: '✗', c: dyn(RED) })
  const rows = [
    { k: 'balance ', v: `¥${a.balance.toFixed(2)}`, m: mark(a.balance >= 10, a.balance >= 0) },
    ...metersOf(a).map(m => ({
      k: (m.key === 'gen' ? 'general ' : m.key === 'tgt' ? 'targeted' : 'voice   '),
      v: `${amount(m.key, m.remain)} / ${amount(m.key, m.total)}  ${Math.round(m.percent)}%`,
      m: mark(m.percent > 50, m.percent >= 20),
    })),
    { k: 'points  ', v: `${pointsText(a)}  star ${a.user?.starLevel ?? '-'}`, m: mark(true, true) },
  ]
  const line = (text: string, color: Paint) => <Text font={11} fontDesign={MONO} foregroundStyle={color} lineLimit={1}>{text}</Text>
  return (
    <Root ctx={ctx} spacing={3}>
      {line(`$ cmcc status --tail ${a.phoneTail}`, ctx.th.t3)}
      {rows.slice(0, ctx.size === 'l' ? 8 : 4).map(r => (
        <HStack spacing={6}>
          <Text font={11} fontDesign={MONO} fontWeight="semibold" foregroundStyle={r.m.c}>{r.m.s}</Text>
          {line(`${r.k}  ${r.v}`, ctx.th.t1)}
        </HStack>
      ))}
      {ctx.size === 'l' && a.ledger ? [line('', ctx.th.t3), line('$ cmcc ledger', ctx.th.t3), ...a.ledger.slice(0, 6).map(x => line(`  ${md(x.time).padEnd(6)} ${x.amount.toFixed(2).padStart(7)}  ${x.name}`, ctx.th.t2))] : null}
      <Spacer />
      {line(`updated ${hhmm(a.fetchedAt)}${a.stale ? ' (cached)' : ''}`, ctx.th.t3)}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// P 话费小票: 虚线票据, 余额 / 本月 / 各项剩余
// ─────────────────────────────────────────────────────────────
function Dashed(props: { ctx: Ctx }) {
  return <Text font={10} fontDesign={MONO} foregroundStyle={props.ctx.th.t3} lineLimit={1}>{'- '.repeat(40)}</Text>
}

export function ReceiptStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const rows: [string, string, boolean?][] = [
    ['账户余额', a.balance.toFixed(2), a.balance < 10],
    ['本月消费', (a.monthFee ?? 0).toFixed(2)],
    ...metersOf(a).map(m => [`${m.label}剩余`, amount(m.key, m.remain), m.percent < 20] as [string, string, boolean]),
  ]
  if (ctx.size === 'l') rows.push(['积分', pointsText(a)], ['星级', starText(a)], ['网龄', netText(a)])
  return (
    <Root ctx={ctx} spacing={ctx.size === 'l' ? 5 : 2}>
      <HStack><Spacer /><Text font={12} fontDesign={MONO} fontWeight="semibold" foregroundStyle={ctx.th.t1}>中国移动 · 话费单</Text><Spacer /></HStack>
      <Dashed ctx={ctx} />
      {rows.map(([k, v, red]) => (
        <HStack>
          <Text font={11} fontDesign={MONO} foregroundStyle={ctx.th.t2}>{k}</Text>
          <Spacer />
          <Text font={11} fontDesign={MONO} fontWeight="semibold" foregroundStyle={red ? dyn(RED) : ctx.th.t1}>{v}</Text>
        </HStack>
      ))}
      <Dashed ctx={ctx} />
      <Spacer minLength={0} />
      <HStack>
        <Text font={10} fontDesign={MONO} foregroundStyle={ctx.th.t3}>{`尾号 ${a.phoneTail}`}</Text>
        <Spacer />
        <Text font={10} fontDesign={MONO} foregroundStyle={ctx.th.t3}>{`${md(a.fetchedAt)} ${hhmm(a.fetchedAt)}`}</Text>
      </HStack>
    </Root>
  )
}

