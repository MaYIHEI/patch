// cmcc / styles/fun.tsx
// 换个说法: 地铁线路 / 网龄徽章 / 终端 / 话费小票

import { VStack, HStack, ZStack, Text, Spacer, Circle, Rectangle } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import {
  Root, Header, Num, Label, primary, metersOf, amount, month, forecast, md, hhmm, starText, pointsText, netText,
  RED, GREEN, ORANGE, type Ctx, type Paint,
} from '../ui'
import { NoData } from './basic'

const dyn = (x: any) => x as DynamicShapeStyle

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

