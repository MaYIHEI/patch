// cmcc / styles/multi.tsx
// 多个号: 双号对照 / 谁先用完 / 多号翻页

import { VStack, HStack, Text, Spacer, Image, Button, Rectangle } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import {
  Root, Header, SyncTap, Tabs, pageIndex, Num, Label, Cell, Stat, Bar, MeterLine, ErrorBox, errorText, metersOf, amount, forecast, md, balanceColor, balanceLabel, pointsText, RED, GREEN, ORANGE, type Ctx, type Slot, type Paint,
} from '../ui'
import { PageIntent } from '../app_intents'
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
// T 谁先用完: 所有号的所有项按紧张程度排队, 前面是大号排名
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
  return (
    <Root ctx={ctx} spacing={7}>
      <Header ctx={ctx} title="谁先用完" sub={`${ctx.slots.filter(s => s.account).length} 个号`} />
      {rows.slice(0, 3).map((r, i) => (
        <HStack spacing={10}>
          <Num value={i + 1} size={20} color={i === 0 ? r.color : ctx.th.t3} />
          <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity' }}>
            <HStack spacing={5}>
              <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>{r.who}</Text>
              <Label ctx={ctx} text={r.what} />
              <Spacer minLength={4} />
              <Text font={11} foregroundStyle={r.color} lineLimit={1}>{r.text}</Text>
            </HStack>
            <Bar ctx={ctx} percent={Math.max(1, r.percent)} height={4} />
          </VStack>
        </HStack>
      ))}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// Q 多号翻页: 顶部号码标签, 点哪个看哪个; › 翻到下一个
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
  const i = pageIndex(ctx)
  const s = slots[i]
  const a = s.account
  const top = (
    <HStack spacing={6}>
      <Tabs ctx={ctx} index={i} />
      <Spacer minLength={4} />
      {slots.length > 1 ? <PageTap ctx={ctx} step={1} icon="chevron.right" /> : null}
      <SyncTap ctx={ctx} t={a?.fetchedAt} stale={a?.stale} />
    </HStack>
  )
  if (!a) return <Root ctx={ctx}>{top}<SlotError ctx={ctx} slot={s} /></Root>
  const ms = metersOf(a)
  const big = ctx.size === 'l'
  return (
    <Root ctx={ctx} spacing={big ? 12 : 8}>
      {top}
      <HStack alignment="bottom" spacing={14} frame={{ maxHeight: big ? undefined : 'infinity' }}>
        <VStack alignment="leading" spacing={1}>
          <Num value={a.balance.toFixed(2)} size={big ? 40 : 32} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? dyn(RED) : ctx.th.t2} />
        </VStack>
        {big ? <Spacer /> : <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>{ms.slice(0, 2).map(m => <MeterLine ctx={ctx} m={m} font={12} total />)}</VStack>}
        {big && a.monthFee !== undefined ? (
          <VStack alignment="trailing" spacing={1}>
            <Num value={`¥${a.monthFee.toFixed(2)}`} size={18} color={ctx.th.t1} />
            <Label ctx={ctx} text="本月消费" />
          </VStack>
        ) : null}
      </HStack>
      {big ? <VStack spacing={8}>{ms.map(m => <Cell ctx={ctx}><MeterLine ctx={ctx} m={m} total font={16} bar={6} /></Cell>)}</VStack> : null}
      {big ? <Spacer /> : null}
      {big ? (
        <HStack spacing={6}>
          <Stat ctx={ctx} label="积分" value={pointsText(a)} size={13} />
          <Stat ctx={ctx} label="品牌" value={a.user?.brand ?? '-'} size={13} />
          <Stat ctx={ctx} label="网龄" value={a.user?.netYears !== undefined ? `${a.user.netYears.toFixed(1)}年` : '-'} size={13} />
        </HStack>
      ) : null}
    </Root>
  )
}
