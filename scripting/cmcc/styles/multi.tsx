// cmcc / styles/multi.tsx
// 多个号和能点的: 双号对照 / 谁先用完 / 多号翻页 / 控制台 / 账本记录

import { VStack, HStack, Text, Spacer, Image, Button, Rectangle, RoundedRectangle, Link, Script } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import {
  Root, Header, SyncTap, Num, Label, Cell, Stat, Bar, MeterLine, ErrorBox, errorText, primary, metersOf, amount, forecast, md, hhmm,
  balanceColor, balanceLabel, pointsText, RED, GREEN, ORANGE, type Ctx, type Slot, type Paint,
} from '../ui'
import type { Account } from '../api'
import { PageIntent, RefreshIntent } from '../app_intents'
import { NoData } from './basic'

const dyn = (x: any) => x as DynamicShapeStyle

/** 某个号查询失败时那一格 */
function SlotError(props: { ctx: Ctx; slot: Slot }) {
  const { ctx } = props
  const msg = errorText(props.slot.error)
  return (
    <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
      <Label ctx={ctx} text={props.slot.name} />
      <Spacer />
      <Image systemName="exclamationmark.triangle.fill" font={16} foregroundStyle={dyn(ORANGE)} />
      <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1}>{msg.title}</Text>
      <Text font={10} foregroundStyle={ctx.th.t2} lineLimit={2}>{msg.hint}</Text>
      <Spacer />
    </VStack>
  )
}

const VLine = (props: { ctx: Ctx }) => <Rectangle fill={props.ctx.th.track} frame={{ width: 0.5, maxHeight: 'infinity' }} />

/** 两个号里较早的更新时间; 任一用了缓存就带 ⚠ */
function syncOf(slots: Slot[]) {
  const loaded = slots.filter(s => s.account).map(s => s.account!)
  return { t: loaded.length ? Math.min(...loaded.map(a => a.fetchedAt)) : Date.now(), stale: loaded.some(a => a.stale) }
}

// ─────────────────────────────────────────────────────────────
// S 双号对照: 左右两列 (原 0.4 双号版式)
// ─────────────────────────────────────────────────────────────
export function DualStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const slots = ctx.slots.slice(0, 2)
  if (!slots.some(s => s.account)) return <NoData ctx={ctx} />
  if (slots.length < 2) return <Root ctx={ctx}><ErrorBox ctx={ctx} error={new Error('参数里填两个尾号, 如「双号对照 1234,5678」')} /></Root>
  const sync = syncOf(slots)
  const column = (s: Slot) => {
    const a = s.account
    if (!a) return <SlotError ctx={ctx} slot={s} />
    const ms = metersOf(a)
    if (ctx.size === 's') {
      return (
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
          <Label ctx={ctx} text={s.name} />
          <Num value={a.balance.toFixed(2)} size={19} color={balanceColor(ctx, a)} />
          <Text font={10} foregroundStyle={a.balance < 0 ? dyn(RED) : ctx.th.t3}>{a.balance < 0 ? '已欠费' : '余额'}</Text>
          <Spacer />
          <VStack alignment="leading" spacing={5}>
            {ms.slice(0, 2).map(m => (
              <VStack alignment="leading" spacing={3}>
                <Text font={10} foregroundStyle={ctx.th.t2} lineLimit={1} minScaleFactor={0.8}>{`${m.label} ${amount(m.key, m.remain)}`}</Text>
                <Bar ctx={ctx} percent={m.percent} height={4} />
              </VStack>
            ))}
          </VStack>
        </VStack>
      )
    }
    const big = ctx.size === 'l'
    return (
      <VStack alignment="leading" spacing={big ? 6 : 1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
        <HStack alignment="lastTextBaseline">
          <Text font={big ? 12 : 11} fontWeight={big ? 'semibold' : 'regular'} foregroundStyle={big ? ctx.th.t1 : ctx.th.t2} lineLimit={1}>{a.balance < 0 && !big ? `${s.name} · 欠费` : s.name}</Text>
          <Spacer />
          <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{a.user?.brand ?? ''}</Text>
        </HStack>
        <VStack alignment="leading" spacing={1}>
          <Num value={a.balance.toFixed(2)} size={big ? 32 : 28} color={balanceColor(ctx, a)} />
          {big ? <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? dyn(RED) : ctx.th.t2} /> : null}
        </VStack>
        <Spacer />
        <VStack spacing={6}>
          {ms.map(m => big
            ? <Cell ctx={ctx}><MeterLine ctx={ctx} m={m} font={15} note={`共 ${amount(m.key, m.total)} · 剩 ${Math.round(m.percent)}%`} /></Cell>
            : <MeterLine ctx={ctx} m={m} total={ms.length < 3} font={12} bar={4} />)}
        </VStack>
        {big ? [<Spacer />, (
          <HStack spacing={6}>
            <Stat ctx={ctx} label="本月" value={a.monthFee !== undefined ? `¥${a.monthFee.toFixed(2)}` : '-'} size={13} />
            <Stat ctx={ctx} label="积分" value={pointsText(a)} size={13} />
          </HStack>
        )] : null}
      </VStack>
    )
  }
  return (
    <Root ctx={ctx} spacing={ctx.size === 'l' ? 12 : 6}>
      <Header ctx={ctx} title={ctx.size === 's' ? undefined : '中国移动'} right={<SyncTap ctx={ctx} t={sync.t} stale={sync.stale} />} />
      <HStack alignment="top" spacing={ctx.size === 's' ? 10 : 14} frame={{ maxHeight: 'infinity' }}>
        {column(slots[0])}
        <VLine ctx={ctx} />
        {column(slots[1])}
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// T 谁先用完: 所有号的所有项按紧张程度排队
// ─────────────────────────────────────────────────────────────
type Row = { who: string; what: string; text: string; color: Paint; percent: number; rank: number }

function rowsOf(slots: Slot[]): Row[] {
  const out: Row[] = []
  for (const s of slots) {
    const a = s.account
    if (!a) continue
    if (a.balance < 10) out.push({ who: s.name, what: '余额', text: a.balance < 0 ? `已欠费 ${(-a.balance).toFixed(2)}` : `只剩 ¥${a.balance.toFixed(2)}`, color: dyn(RED), percent: 0, rank: a.balance < 0 ? -2 : -1 })
    for (const m of metersOf(a)) {
      const f = forecast(m, s.hist)
      out.push({
        who: s.name, what: m.label,
        text: f.runOut ? `约 ${md(f.runOut)} 用完` : `剩 ${Math.round(m.percent)}% · ${amount(m.key, m.remain)}`,
        color: f.runOut || m.percent < 20 ? dyn(RED) : m.percent <= 50 ? dyn(ORANGE) : dyn(GREEN),
        percent: m.percent,
        rank: f.runOut ? (f.runOut - Date.now()) / 1e12 : m.percent,
      })
    }
  }
  return out.sort((a, b) => a.rank - b.rank)
}

export function QueueStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const rows = rowsOf(ctx.slots)
  if (!rows.length) return <NoData ctx={ctx} />
  const n = ctx.size === 'l' ? 7 : 3
  return (
    <Root ctx={ctx} spacing={ctx.size === 'l' ? 8 : 5}>
      <Header ctx={ctx} title="谁先用完" sub={`${ctx.slots.filter(s => s.account).length} 个号`} />
      {rows.slice(0, n).map(r => ctx.size === 'l' ? (
        <Cell ctx={ctx} gap={5}>
          <HStack>
            <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>{r.who}</Text>
            <Label ctx={ctx} text={r.what} />
            <Spacer />
            <Text font={11} foregroundStyle={r.color} lineLimit={1}>{r.text}</Text>
          </HStack>
          <Bar ctx={ctx} percent={r.percent} height={5} />
        </Cell>
      ) : (
        <HStack spacing={6}>
          <Text font={11} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>{r.who}</Text>
          <Label ctx={ctx} text={r.what} />
          <Spacer minLength={4} />
          <Text font={11} foregroundStyle={r.color} lineLimit={1}>{r.text}</Text>
        </HStack>
      ))}
      <Spacer />
      <Text font={10} foregroundStyle={ctx.th.t3}>最上面的最该先处理</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// Q 多号翻页: 一个组件轮着看所有号, 点 ‹ › 切换
// ─────────────────────────────────────────────────────────────
function PageTap(props: { ctx: Ctx; step: number; icon: string }) {
  const img = <Image systemName={props.icon} font={12} fontWeight="semibold" foregroundStyle={props.ctx.th.t2} frame={{ width: 22, height: 18 }} />
  if (props.ctx.inApp) return img
  return <Button intent={PageIntent({ step: props.step })} buttonStyle="plain">{img}</Button>
}

export function PagerStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const slots = ctx.slots
  if (!slots.some(s => s.account)) return <NoData ctx={ctx} />
  const n = slots.length
  const i = ((ctx.page % n) + n) % n
  const s = slots[i]
  const a = s.account
  const nav = (
    <HStack spacing={2}>
      <PageTap ctx={ctx} step={-1} icon="chevron.left" />
      <Text font={11} foregroundStyle={ctx.th.t3} monospacedDigit>{`${i + 1}/${n}`}</Text>
      <PageTap ctx={ctx} step={1} icon="chevron.right" />
      <SyncTap ctx={ctx} t={a?.fetchedAt} stale={a?.stale} />
    </HStack>
  )
  const dots = (
    <HStack spacing={4}>
      <Spacer />
      {slots.map((_, k) => <RoundedRectangle cornerRadius={3} fill={k === i ? ctx.th.t1 : ctx.th.track} frame={{ width: k === i ? 12 : 6, height: 6 }} />)}
      <Spacer />
    </HStack>
  )
  if (!a) return <Root ctx={ctx}><Header ctx={ctx} title={s.name} right={nav} /><SlotError ctx={ctx} slot={s} />{dots}</Root>
  const ms = metersOf(a)
  return (
    <Root ctx={ctx} spacing={ctx.size === 'l' ? 12 : 6}>
      <Header ctx={ctx} title={s.name} sub={a.user?.brand} right={nav} />
      <HStack alignment="bottom" spacing={14} frame={{ maxHeight: ctx.size === 'l' ? undefined : 'infinity' }}>
        <VStack alignment="leading" spacing={1}>
          <Num value={a.balance.toFixed(2)} size={ctx.size === 'l' ? 40 : 32} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? dyn(RED) : ctx.th.t2} />
        </VStack>
        <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
          {ctx.size === 'l' ? null : ms.slice(0, 2).map(m => <MeterLine ctx={ctx} m={m} font={12} />)}
        </VStack>
      </HStack>
      {ctx.size === 'l' ? <VStack spacing={8}>{ms.map(m => <Cell ctx={ctx}><MeterLine ctx={ctx} m={m} total font={16} bar={6} /></Cell>)}</VStack> : null}
      {ctx.size === 'l' ? <Spacer /> : null}
      {n > 1 ? dots : null}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// R 控制台: 左边余额, 右边按钮 (刷新 / 换号 / 打开设置)
// ─────────────────────────────────────────────────────────────
/** 点了打开 cmcc 的设置页 (Scripting 的运行链接) */
const settingsURL = () => Script.createRunURLScheme(Script.name)

function Tile(props: { ctx: Ctx; icon: string; title: string; intent?: any; url?: string }) {
  const { ctx } = props
  const body = (
    <VStack spacing={3} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} background={<RoundedRectangle cornerRadius={12} fill={ctx.th.card} />}>
      <Image systemName={props.icon} font={16} foregroundStyle={ctx.th.t1} />
      <Text font={11} foregroundStyle={ctx.th.t2}>{props.title}</Text>
    </VStack>
  )
  if (ctx.inApp) return body
  if (props.intent) return <Button intent={props.intent} buttonStyle="plain" frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>{body}</Button>
  if (props.url) return <Link url={props.url} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>{body}</Link>
  return body
}

export function ConsoleStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const slots = ctx.slots
  const n = slots.length
  const i = ((ctx.page % n) + n) % n
  const a = slots[i]?.account ?? primary(ctx)?.account
  if (!a) return <NoData ctx={ctx} />
  return (
    <Root ctx={ctx} spacing={0}>
      <HStack spacing={12} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={0} frame={{ width: 116, maxHeight: 'infinity', alignment: 'topLeading' }}>
          <Header ctx={ctx} title={`尾号 ${a.phoneTail}`} right={null} />
          <Spacer />
          <Num value={a.balance.toFixed(2)} size={28} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={a.general ? `通用 ${amount('gen', a.general.remainMB)}` : balanceLabel(a)} />
          <Spacer />
          <Text font={10} foregroundStyle={ctx.th.t3}>{`${hhmm(a.fetchedAt)} 更新`}</Text>
        </VStack>
        <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
          <HStack spacing={6}>
            <Tile ctx={ctx} icon="arrow.clockwise" title="刷新" intent={RefreshIntent(undefined)} />
            <Tile ctx={ctx} icon="arrow.left.arrow.right" title={n > 1 ? `换号 ${i + 1}/${n}` : '换号'} intent={PageIntent({ step: 1 })} />
          </HStack>
          <Tile ctx={ctx} icon="gearshape" title="打开设置" url={settingsURL()} />
        </VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// U 账本记录: 账本里的扣费记录 (实时话费、月结扣费等)
// ─────────────────────────────────────────────────────────────
export function LedgerStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a: Account = p.account
  const list = a.ledger ?? []
  const n = ctx.size === 'l' ? 10 : 4
  return (
    <Root ctx={ctx} spacing={ctx.size === 'l' ? 8 : 5}>
      <Header ctx={ctx} title="账本记录" sub={`余额 ${a.balance.toFixed(2)}`} />
      {list.length ? list.slice(0, n).map(x => (
        <HStack spacing={8}>
          <Text font={11} foregroundStyle={ctx.th.t3} monospacedDigit frame={{ width: 52, alignment: 'leading' }}>{md(x.time).replace('月', '/').replace('日', '')}</Text>
          <Text font={12} foregroundStyle={ctx.th.t1} lineLimit={1}>{x.name}</Text>
          <Spacer minLength={4} />
          <Num value={`−${x.amount.toFixed(2)}`} size={12} color={ctx.th.t1} />
        </HStack>
      )) : <Text font={12} foregroundStyle={ctx.th.t2}>账本里暂时没有记录</Text>}
      <Spacer />
      {a.monthFee !== undefined ? <Text font={10} foregroundStyle={ctx.th.t3}>{`本月已用 ¥${a.monthFee.toFixed(2)}`}</Text> : null}
    </Root>
  )
}
