// cmcc / styles/board.tsx
// W 全景 / X 双号全景: 一个组件看全. 排法参考 loon-panel 全景看板
// 按套餐有几项 (1 / 2 / 3) 分别排版; 多个号时顶部是号码标签, 点一下切号

import { VStack, HStack, Text, Spacer } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import {
  Root, Header, Logo, SyncTap, Section, Tabs, Num, Label, Cell, Bar, ErrorBox, errorText, pageIndex, metersOf, amount, totalText, month, forecast, md, starText, pointsText, netText,
  balanceColor, balanceLabel, RED, type Ctx, type Meter, type Slot,
} from '../ui'
import type { Account } from '../api'
import { NoData } from './basic'
import { DailyBars } from './forecast'

const dyn = (x: any) => x as DynamicShapeStyle
const resetDays = () => Math.ceil((month().reset - Date.now()) / 86_400_000)
const feeText = (a: Account) => (a.monthFee !== undefined ? `¥${a.monthFee.toFixed(2)}` : '-')

/** 预测的一句短话: 几号用完 (红) / 够到月底 / 每天可用多少 */
function planShort(m: Meter, slot: Slot): { text: string; bad: boolean } {
  const f = forecast(m, slot.hist)
  if (f.runOut) return { text: `${new Date(f.runOut).getDate()}日用完`, bad: true }
  if (f.avg !== null) return { text: '够到月底', bad: false }
  return { text: `每天 ${amount(m.key, f.perDay)}`, bad: false }
}

/** 今天 · 日均 · 每天可用 */
function detailOf(m: Meter, slot: Slot): string {
  const f = forecast(m, slot.hist)
  const today = slot.hist?.today(m.key) ?? null
  return [today !== null ? `今天 ${amount(m.key, today)}` : '', f.avg !== null ? `日均 ${amount(m.key, f.avg)}` : '', `每天可用 ${amount(m.key, f.perDay)}`].filter(Boolean).join(' · ')
}

/** 一行额度: 标签列 | 剩余/总量 + 预测, 进度条 (+ 明细) | 百分比列 */
function MeterRow(props: { ctx: Ctx; m: Meter; slot: Slot; detail?: string; noTotal?: boolean; planBelow?: boolean; big?: boolean }) {
  const { ctx, m } = props
  const { th } = ctx
  const plan = planShort(m, props.slot)
  return (
    <HStack spacing={8}>
      <Text font={props.big ? 13 : 12} fontWeight="medium" foregroundStyle={th.t1} frame={{ width: 28, alignment: 'leading' }}>{m.label}</Text>
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity' }}>
        <HStack spacing={2}>
          <Text font={props.big ? 11 : 10} monospacedDigit foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.85}>{props.noTotal ? amount(m.key, m.remain) : `${amount(m.key, m.remain)} / ${totalText(m.key, m.total)}`}</Text>
          <Spacer minLength={4} />
          {props.planBelow ? null : <Text font={10} fontWeight="medium" foregroundStyle={plan.bad ? dyn(RED) : th.t3} lineLimit={1}>{plan.text}</Text>}
        </HStack>
        <Bar ctx={ctx} percent={m.percent} height={props.big ? 5 : 4} tick={(1 - month().elapsed) * 100} />
        {props.planBelow ? <Text font={10} foregroundStyle={plan.bad ? dyn(RED) : th.t3} lineLimit={1}>{plan.text}</Text> : null}
        {props.detail ? <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.85}>{props.detail}</Text> : null}
      </VStack>
      <Text font={props.big ? 14 : 12} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={th.t1} frame={{ width: 36, alignment: 'trailing' }}>{`${Math.round(m.percent)}%`}</Text>
    </HStack>
  )
}

/** 只有一项时的大块: 剩余量放大 */
function HeroMeter(props: { ctx: Ctx; m: Meter; slot: Slot; size: number }) {
  const { ctx, m, slot } = props
  const plan = planShort(m, slot)
  return (
    <VStack alignment="leading" spacing={5} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <HStack alignment="lastTextBaseline" spacing={3}>
        <Label ctx={ctx} text={m.label} />
        <Spacer minLength={4} />
        <Num value={amount(m.key, m.remain)} size={props.size} color={ctx.th.t1} />
        <Text font={11} foregroundStyle={ctx.th.t3}>{`/${totalText(m.key, m.total)}`}</Text>
      </HStack>
      <Bar ctx={ctx} percent={m.percent} height={7} tick={(1 - month().elapsed) * 100} />
      <HStack>
        <Text font={10} foregroundStyle={plan.bad ? dyn(RED) : ctx.th.t2} lineLimit={1}>{plan.text}</Text>
        <Spacer minLength={4} />
        <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{`剩 ${Math.round(m.percent)}%`}</Text>
      </HStack>
    </VStack>
  )
}

/** 近 7 天柱子; 还没有记录时返回 null */
function Chart(props: { ctx: Ctx; slot: Slot; m?: Meter; height: number }) {
  const values = props.m ? props.slot.hist?.daily(props.m.key, 7) ?? [] : []
  if (!values.some(v => v !== null)) return null
  return <DailyBars ctx={props.ctx} values={values} height={props.height} />
}

/** 账户信息压成一行 */
function AccountStrip(props: { ctx: Ctx; a: Account }) {
  const { ctx, a } = props
  const items = [['积分', pointsText(a)], ['星级', starText(a)], ['星级分', a.user?.starScore !== undefined ? String(a.user.starScore) : '-'], ['网龄', netText(a)]]
  return (
    <HStack spacing={0}>
      {items.map(([l, v], i) => [
        i ? <Spacer minLength={4} /> : null,
        <HStack spacing={3}>
          <Text font={11} foregroundStyle={ctx.th.t2}>{l}</Text>
          <Text font={11} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={ctx.th.t1} lineLimit={1}>{v}</Text>
        </HStack>,
      ])}
    </HStack>
  )
}

function LastLedger(props: { ctx: Ctx; a: Account }) {
  const { ctx, a } = props
  const last = a.ledger?.[0]
  if (!last) return null
  return (
    <HStack spacing={6}>
      <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{`最近账本 ${md(last.time)} ${last.name}`}</Text>
      <Spacer minLength={4} />
      <Text font={10} fontWeight="semibold" monospacedDigit foregroundStyle={ctx.th.t1}>{`−${last.amount.toFixed(2)}`}</Text>
    </HStack>
  )
}

/** 标题行: 多个号是号码标签, 一个号是名字和品牌 */
function Top(props: { ctx: Ctx; a: Account; index: number }) {
  const { ctx, a } = props
  const sub = [a.user?.brand, a.user?.starLevel ? starText(a) : ''].filter(Boolean).join(' · ')
  return (
    <HStack spacing={6}>
      <Logo size={16} />
      <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>中国移动</Text>
      {ctx.slots.length > 1 ? <Tabs ctx={ctx} index={props.index} /> : <Text font={11} foregroundStyle={ctx.th.t3} lineLimit={1}>{sub}</Text>}
      <Spacer minLength={4} />
      <SyncTap ctx={ctx} t={a.fetchedAt} stale={a.stale} />
    </HStack>
  )
}

// ─────────────────────────────────────────────────────────────
// W 全景
// ─────────────────────────────────────────────────────────────
function Small(props: { ctx: Ctx; slot: Slot; a: Account; ms: Meter[] }) {
  const { ctx, slot, a, ms } = props
  const { th } = ctx
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} />
      <HStack alignment="bottom" spacing={8} padding={{ top: 6 }}>
        <VStack alignment="leading" spacing={1}>
          <Num value={a.balance.toFixed(2)} size={25} color={balanceColor(ctx, a)} />
          <Text font={10} foregroundStyle={a.balance < 0 ? dyn(RED) : th.t3} lineLimit={1} minScaleFactor={0.8}>{[ctx.slots.length > 1 ? slot.name : '', a.balance < 0 ? '已欠费' : ctx.slots.length > 1 ? '' : `本月 ${feeText(a)}`].filter(Boolean).join(' · ')}</Text>
        </VStack>
        <VStack frame={{ maxWidth: 'infinity' }}><Chart ctx={ctx} slot={slot} m={ms[0]} height={26} /></VStack>
      </HStack>
      <Spacer minLength={4} />
      {ms.length === 1 ? <HeroMeter ctx={ctx} m={ms[0]} slot={slot} size={20} /> : null}
      {ms.length === 2 ? (
        <VStack spacing={7}>
          {ms.map(m => {
            const plan = planShort(m, slot)
            return (
              <VStack alignment="leading" spacing={3}>
                <HStack>
                  <Text font={11} foregroundStyle={th.t2}>{m.label}</Text>
                  <Spacer minLength={2} />
                  <Num value={plan.bad ? plan.text : amount(m.key, m.remain)} size={12} color={plan.bad ? dyn(RED) : th.t1} />
                </HStack>
                <Bar ctx={ctx} percent={m.percent} height={5} tick={(1 - month().elapsed) * 100} />
              </VStack>
            )
          })}
        </VStack>
      ) : null}
      {ms.length === 3 ? (
        <VStack spacing={7}>
          {ms.map(m => {
            const plan = planShort(m, slot)
            return (
              <HStack spacing={6}>
                <Text font={11} foregroundStyle={th.t2} frame={{ width: 24, alignment: 'leading' }}>{m.label}</Text>
                <Bar ctx={ctx} percent={m.percent} height={5} />
                <Text font={11} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={plan.bad ? dyn(RED) : th.t1} lineLimit={1} frame={{ width: 50, alignment: 'trailing' }}>{plan.bad ? plan.text.replace('用完', '完') : amount(m.key, m.remain).replace(/\.\d+G$/, 'G')}</Text>
              </HStack>
            )
          })}
        </VStack>
      ) : null}
    </Root>
  )
}

function Medium(props: { ctx: Ctx; slot: Slot; a: Account; ms: Meter[]; index: number }) {
  const { ctx, slot, a, ms } = props
  const { th } = ctx
  const hasChart = (slot.hist?.days ?? 0) > 1 && !!ms[0]
  return (
    <Root ctx={ctx} spacing={8}>
      <Top ctx={ctx} a={a} index={props.index} />
      <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={2} frame={{ width: 104, maxHeight: 'infinity', alignment: 'topLeading' }}>
          <Num value={a.balance.toFixed(2)} size={27} color={balanceColor(ctx, a)} />
          <Text font={10} foregroundStyle={a.balance < 0 ? dyn(RED) : th.t3} lineLimit={1}>{a.balance < 0 ? `欠费 · 本月 ${feeText(a)}` : `本月 ${feeText(a)}`}</Text>
          <Spacer minLength={2} />
          {hasChart ? <Chart ctx={ctx} slot={slot} m={ms[0]} height={32} /> : null}
          {hasChart ? null : <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`积分 ${pointsText(a)}`}</Text>}
          <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{hasChart ? `近 7 天 · ${resetDays()}天重置` : `${resetDays()} 天后重置`}</Text>
        </VStack>
        <VStack spacing={0} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
          {ms.length === 1 ? [<Spacer minLength={0} />, <HeroMeter ctx={ctx} m={ms[0]} slot={slot} size={24} />, <Text font={10} foregroundStyle={th.t3} lineLimit={1} frame={{ maxWidth: 'infinity', alignment: 'leading' }} padding={{ top: 6 }}>{`每天可用 ${amount(ms[0].key, forecast(ms[0], slot.hist).perDay)}`}</Text>, <Spacer minLength={0} />] : null}
          {/* 两项 / 三项: 每行平分右侧高度, 不挤在中间 */}
          {ms.length > 1 ? ms.map(m => (
            <VStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
              <MeterRow ctx={ctx} m={m} slot={slot} big noTotal={ms.length === 3} planBelow={ms.length === 2} />
            </VStack>
          )) : null}
        </VStack>
      </HStack>
    </Root>
  )
}

function Large(props: { ctx: Ctx; slot: Slot; a: Account; ms: Meter[]; index: number }) {
  const { ctx, slot, a, ms } = props
  const { th } = ctx
  const mo = month()
  const lastFee = slot.hist?.lastMonthFee ?? null
  const m0 = ms[0]
  const avg = m0 ? slot.hist?.avg(m0.key) ?? null : null
  const gap = <Spacer minLength={5} />
  return (
    <Root ctx={ctx} spacing={0}>
      <Top ctx={ctx} a={a} index={props.index} />
      {gap}
      <HStack alignment="bottom">
        <VStack alignment="leading" spacing={1}>
          <Num value={a.balance.toFixed(2)} size={34} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? dyn(RED) : th.t2} />
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={1}>
          <Num value={feeText(a)} size={17} color={th.t1} />
          <Label ctx={ctx} text={lastFee !== null ? `本月 · 上月 ¥${lastFee.toFixed(0)}` : '本月消费'} />
        </VStack>
      </HStack>
      {gap}
      <VStack spacing={7}>
        <Section ctx={ctx} title="套餐" right={`第 ${mo.day} 天 · ${resetDays()} 天后重置`} />
        {ms.length === 1 ? (
          <Cell ctx={ctx} gap={5}>
            <HeroMeter ctx={ctx} m={ms[0]} slot={slot} size={30} />
            <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{detailOf(ms[0], slot)}</Text>
          </Cell>
        ) : null}
        {ms.length === 2 ? <VStack spacing={6}>{ms.map(m => <Cell ctx={ctx}><MeterRow ctx={ctx} m={m} slot={slot} detail={detailOf(m, slot)} /></Cell>)}</VStack> : null}
        {ms.length === 3 ? <VStack spacing={8}>{ms.map(m => <MeterRow ctx={ctx} m={m} slot={slot} detail={detailOf(m, slot)} />)}</VStack> : null}
      </VStack>
      {gap}
      <AccountStrip ctx={ctx} a={a} />
      {gap}
      <VStack spacing={5}>
        <Section ctx={ctx} title={`近 7 天${m0?.label ?? ''}`} right={m0 && avg !== null ? `日均 ${amount(m0.key, avg)}` : undefined} />
        {m0 ? <DailyBars ctx={ctx} values={slot.hist?.daily(m0.key, 7) ?? []} height={ms.length === 3 ? 34 : 38} /> : null}
      </VStack>
      {ms.length === 3 ? null : [gap, <LastLedger ctx={ctx} a={a} />]}
    </Root>
  )
}

export function BoardStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const index = pageIndex(ctx)
  const slot = ctx.slots[index]?.account ? ctx.slots[index] : ctx.slots.find(s => s.account)
  if (!slot?.account) return <NoData ctx={ctx} />
  const a = slot.account
  const ms = metersOf(a).slice(0, 3)
  if (ctx.size === 's') return <Small ctx={ctx} slot={slot} a={a} ms={ms} />
  if (ctx.size === 'm') return <Medium ctx={ctx} slot={slot} a={a} ms={ms} index={index} />
  return <Large ctx={ctx} slot={slot} a={a} ms={ms} index={index} />
}

// ─────────────────────────────────────────────────────────────
// X 双号全景: 中号每个号一行, 各项对齐成列; 大号每个号一张卡
// ─────────────────────────────────────────────────────────────
function DualTop(props: { ctx: Ctx; slots: Slot[] }) {
  const { ctx } = props
  const loaded = props.slots.filter(s => s.account).map(s => s.account!)
  return (
    <HStack spacing={6}>
      <Logo size={16} />
      <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>中国移动</Text>
      <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{`${resetDays()} 天后重置`}</Text>
      <Spacer minLength={4} />
      <SyncTap ctx={ctx} t={Math.min(...loaded.map(a => a.fetchedAt))} stale={loaded.some(a => a.stale)} />
    </HStack>
  )
}

function DualFail(props: { ctx: Ctx; slot: Slot }) {
  const msg = errorText(props.slot.error)
  return <Text font={11} foregroundStyle={props.ctx.th.t2} lineLimit={2}>{`${props.slot.name} · ${msg.title}: ${msg.hint}`}</Text>
}

function DualMedium(props: { ctx: Ctx; slots: Slot[] }) {
  const { ctx, slots } = props
  const { th } = ctx
  const cols = Math.max(1, ...slots.map(s => (s.account ? Math.min(3, metersOf(s.account).length) : 0)))
  const line = (s: Slot) => {
    const a = s.account
    if (!a) return <DualFail ctx={ctx} slot={s} />
    const ms = metersOf(a).slice(0, 3)
    return (
      <HStack spacing={10} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={3} frame={{ width: 88, alignment: 'leading' }}>
          <HStack spacing={3}>
            <Text font={11} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.8}>{s.name}</Text>
            <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.8}>{a.monthFee !== undefined ? `本月¥${a.monthFee.toFixed(0)}` : ''}</Text>
          </HStack>
          <Num value={a.balance.toFixed(2)} size={22} color={balanceColor(ctx, a)} />
        </VStack>
        {Array.from({ length: cols }, (_, k) => {
          const m = ms[k]
          if (!m) return <VStack frame={{ maxWidth: 'infinity' }} />
          const plan = planShort(m, s)
          return (
            <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <HStack>
                <Text font={10} foregroundStyle={th.t3}>{m.label}</Text>
                <Spacer minLength={2} />
                <Text font={10} foregroundStyle={cols < 3 && plan.bad ? dyn(RED) : th.t3} monospacedDigit lineLimit={1}>{cols < 3 ? plan.text : `${Math.round(m.percent)}%`}</Text>
              </HStack>
              <Num value={cols === 3 ? amount(m.key, m.remain).replace(/\.\d+G$/, 'G') : amount(m.key, m.remain)} size={13} color={plan.bad ? dyn(RED) : th.t1} />
              <Bar ctx={ctx} percent={m.percent} height={4} />
            </VStack>
          )
        })}
      </HStack>
    )
  }
  return (
    <Root ctx={ctx} spacing={6}>
      <DualTop ctx={ctx} slots={slots} />
      {line(slots[0])}
      <Section ctx={ctx} title="" />
      {line(slots[1])}
    </Root>
  )
}

function DualPanel(props: { ctx: Ctx; s: Slot; roomy: boolean }) {
  const { ctx, s } = props
  const { th } = ctx
  const a = s.account
  if (!a) return <Cell ctx={ctx} fill><DualFail ctx={ctx} slot={s} /></Cell>
  const ms = metersOf(a).slice(0, 3)
  return (
    <Cell ctx={ctx} gap={7} fill>
      <HStack alignment="bottom" spacing={10}>
        <VStack alignment="leading" spacing={3}>
          <HStack spacing={5}>
            <Text font={12} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>{s.name}</Text>
            <Text font={10} foregroundStyle={a.balance < 0 ? dyn(RED) : th.t3} lineLimit={1}>{a.balance < 0 ? '已欠费' : a.user?.brand ?? ''}</Text>
          </HStack>
          <Num value={a.balance.toFixed(2)} size={25} color={balanceColor(ctx, a)} />
        </VStack>
        <VStack frame={{ maxWidth: 'infinity' }}><Chart ctx={ctx} slot={s} m={ms[0]} height={26} /></VStack>
        <VStack alignment="trailing" spacing={1}>
          <Text font={10} foregroundStyle={th.t3}>本月</Text>
          <Num value={feeText(a)} size={13} color={th.t1} />
        </VStack>
      </HStack>
      <Spacer minLength={0} />
      <VStack spacing={props.roomy ? 7 : 5}>{ms.map(m => <MeterRow ctx={ctx} m={m} slot={s} detail={props.roomy ? detailOf(m, s) : undefined} />)}</VStack>
      <Spacer minLength={0} />
    </Cell>
  )
}

export function DualBoardStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const slots = ctx.slots.slice(0, 2)
  if (!slots.some(s => s.account)) return <NoData ctx={ctx} />
  if (slots.length < 2) return <Root ctx={ctx}><ErrorBox ctx={ctx} error={new Error('导入两个号后可用, 或在参数里填两个尾号')} /></Root>
  if (ctx.size !== 'l') return <DualMedium ctx={ctx} slots={slots} />
  const rows = slots.reduce((n, s) => n + (s.account ? Math.min(3, metersOf(s.account).length) : 0), 0)
  return (
    <Root ctx={ctx} spacing={8}>
      <DualTop ctx={ctx} slots={slots} />
      <DualPanel ctx={ctx} s={slots[0]} roomy={rows <= 4} />
      <DualPanel ctx={ctx} s={slots[1]} roomy={rows <= 4} />
    </Root>
  )
}
