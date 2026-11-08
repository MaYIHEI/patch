// cmcc / styles/board.tsx
// W 全景: 一个组件看全. 排法参考 loon-panel 全景看板: 分区小标题 + 固定宽度的标签列 / 数值列
// 多个号时顶部是号码标签, 点一下切号

import { VStack, HStack, Text, Spacer } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import {
  Root, Logo, SyncTap, Section, Tabs, Num, Label, Cell, Bar, pageIndex, metersOf, amount, month, forecast, md, starText, pointsText, netText,
  balanceColor, balanceLabel, RED, type Ctx, type Meter, type Slot,
} from '../ui'
import type { Account } from '../api'
import { NoData } from './basic'
import { DailyBars } from './forecast'

const dyn = (x: any) => x as DynamicShapeStyle

/** 预测的一句短话: 几号用完 (红) / 够到月底 / 每天可用多少 */
function planShort(m: Meter, slot: Slot): { text: string; bad: boolean } {
  const f = forecast(m, slot.hist)
  if (f.runOut) return { text: `${new Date(f.runOut).getDate()}日用完`, bad: true }
  if (f.avg !== null) return { text: '够到月底', bad: false }
  return { text: `每天 ${amount(m.key, f.perDay)}`, bad: false }
}

/** 一行额度: 标签列 | 剩余/总量 + 预测, 进度条 | 百分比列 */
function MeterRow(props: { ctx: Ctx; m: Meter; slot: Slot }) {
  const { ctx, m } = props
  const { th } = ctx
  const plan = planShort(m, props.slot)
  return (
    <HStack spacing={8}>
      <Text font={12} fontWeight="medium" foregroundStyle={th.t1} frame={{ width: 28, alignment: 'leading' }}>{m.label}</Text>
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity' }}>
        <HStack spacing={2}>
          <Text font={10} monospacedDigit foregroundStyle={th.t2} lineLimit={1}>{`${amount(m.key, m.remain)} / ${amount(m.key, m.total)}`}</Text>
          <Spacer minLength={4} />
          <Text font={10} fontWeight="medium" foregroundStyle={plan.bad ? dyn(RED) : th.t3} lineLimit={1}>{plan.text}</Text>
        </HStack>
        <Bar ctx={ctx} percent={m.percent} height={4} tick={(1 - month().elapsed) * 100} />
      </VStack>
      <Text font={12} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={th.t1} frame={{ width: 34, alignment: 'trailing' }}>{`${Math.round(m.percent)}%`}</Text>
    </HStack>
  )
}

/** 标题行: 多个号是号码标签, 一个号是名字和品牌 */
function Top(props: { ctx: Ctx; slot: Slot; a: Account; index: number }) {
  const { ctx, a } = props
  const sub = [ctx.size === 'l' ? a.user?.channel?.replace('移动', '') : '', a.user?.brand, a.user?.starLevel ? starText(a) : ''].filter(Boolean).join(' · ')
  return (
    <HStack spacing={6}>
      <Logo size={16} />
      {ctx.slots.length > 1
        ? <Tabs ctx={ctx} index={props.index} />
        : [<Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>中国移动</Text>, <Text font={11} foregroundStyle={ctx.th.t3} lineLimit={1}>{sub}</Text>]}
      <Spacer minLength={4} />
      <SyncTap ctx={ctx} t={a.fetchedAt} stale={a.stale} />
    </HStack>
  )
}

function MiniStat(props: { ctx: Ctx; label: string; value: string; color?: any }) {
  return (
    <VStack alignment="leading" spacing={0} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <Text font={10} foregroundStyle={props.ctx.th.t3}>{props.label}</Text>
      <Num value={props.value} size={12} color={props.color ?? props.ctx.th.t1} />
    </VStack>
  )
}

export function BoardStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const index = pageIndex(ctx)
  const slot = ctx.slots[index]?.account ? ctx.slots[index] : ctx.slots.find(s => s.account)
  if (!slot?.account) return <NoData ctx={ctx} />
  const a = slot.account
  const ms = metersOf(a)
  const mo = month()
  const resetDays = Math.ceil((mo.reset - Date.now()) / 86_400_000)

  // ── 小号: 余额 + 天数 + 每项一根带竖线的条
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={0}>
        <HStack spacing={4}>
          <Logo size={14} />
          <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{ctx.slots.length > 1 ? slot.name : `${resetDays}天后重置`}</Text>
          <Spacer minLength={2} />
          <SyncTap ctx={ctx} />
        </HStack>
        <HStack alignment="lastTextBaseline" spacing={3} padding={{ top: 6 }}>
          <Num value={a.balance.toFixed(2)} size={26} color={balanceColor(ctx, a)} />
          <Text font={10} foregroundStyle={a.balance < 0 ? dyn(RED) : th.t3}>{a.balance < 0 ? '欠费' : '元'}</Text>
        </HStack>
        {ms.length > 2 ? null : <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{[a.monthFee !== undefined ? `本月 ¥${a.monthFee.toFixed(0)}` : '', a.points !== undefined ? `${a.points} 积分` : ''].filter(Boolean).join(' · ')}</Text>}
        <Spacer />
        <VStack spacing={5}>
          {ms.slice(0, 3).map(m => {
            const plan = planShort(m, slot)
            return (
              <VStack alignment="leading" spacing={2}>
                <HStack spacing={2}>
                  <Text font={10} foregroundStyle={th.t2}>{m.label}</Text>
                  <Spacer minLength={2} />
                  <Text font={11} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={plan.bad ? dyn(RED) : th.t1} lineLimit={1}>{plan.bad ? plan.text : amount(m.key, m.remain)}</Text>
                </HStack>
                <Bar ctx={ctx} percent={m.percent} height={4} tick={(1 - mo.elapsed) * 100} />
              </VStack>
            )
          })}
        </VStack>
      </Root>
    )
  }

  const stats: [string, string, any?][] = [
    ['本月', a.monthFee !== undefined ? `¥${a.monthFee.toFixed(2)}` : '-'],
    ['积分', pointsText(a)],
    ['重置', `${resetDays}天`],
    ['网龄', netText(a)],
  ]

  // ── 中号: 左余额 + 四格, 右每项一行
  if (ctx.size === 'm') {
    return (
      <Root ctx={ctx} spacing={8}>
        <Top ctx={ctx} slot={slot} a={a} index={index} />
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack alignment="leading" spacing={0} frame={{ width: 104, maxHeight: 'infinity', alignment: 'topLeading' }}>
            <Num value={a.balance.toFixed(2)} size={28} color={balanceColor(ctx, a)} />
            <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? dyn(RED) : th.t2} />
            <Spacer />
            <VStack spacing={4}>
              <HStack spacing={6}>{stats.slice(0, 2).map(([l, v]) => <MiniStat ctx={ctx} label={l} value={v} />)}</HStack>
              <HStack spacing={6}>{stats.slice(2).map(([l, v]) => <MiniStat ctx={ctx} label={l} value={v} />)}</HStack>
            </VStack>
          </VStack>
          <VStack spacing={ms.length > 2 ? 7 : 12} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
            <Spacer minLength={0} />
            {ms.map(m => <MeterRow ctx={ctx} m={m} slot={slot} />)}
            <Spacer minLength={0} />
          </VStack>
        </HStack>
      </Root>
    )
  }

  // ── 大号: 余额 / 本月 + 套餐 (每项带今天、日均、预测) + 账户 + 近 7 天 + 最近账本
  const lastFee = slot.hist?.lastMonthFee ?? null
  const detail = (m: Meter) => {
    const f = forecast(m, slot.hist)
    const today = slot.hist?.today(m.key) ?? null
    return [
      today !== null ? `今天 ${amount(m.key, today)}` : '',
      f.avg !== null ? `日均 ${amount(m.key, f.avg)}` : '',
      `每天可用 ${amount(m.key, f.perDay)}`,
    ].filter(Boolean).join(' · ')
  }
  const roomy = ms.length < 3
  const last = a.ledger?.[0]
  return (
    <Root ctx={ctx} spacing={8}>
      <Top ctx={ctx} slot={slot} a={a} index={index} />
      <HStack alignment="bottom">
        <VStack alignment="leading" spacing={1}>
          <Num value={a.balance.toFixed(2)} size={38} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? dyn(RED) : th.t2} />
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={1}>
          <Num value={a.monthFee !== undefined ? `¥${a.monthFee.toFixed(2)}` : '-'} size={18} color={th.t1} />
          <Label ctx={ctx} text={lastFee !== null ? `本月消费 · 上月 ¥${lastFee.toFixed(0)}` : '本月消费'} />
        </VStack>
      </HStack>
      <Section ctx={ctx} title="套餐" right={`第 ${mo.day} 天 · ${resetDays} 天后重置`} />
      <VStack spacing={roomy ? 8 : 6}>
        {ms.map(m => (
          <Cell ctx={ctx} gap={4}>
            <MeterRow ctx={ctx} m={m} slot={slot} />
            {roomy ? <Text font={10} foregroundStyle={th.t3} lineLimit={1} padding={{ leading: 36 }}>{detail(m)}</Text> : null}
          </Cell>
        ))}
      </VStack>
      <Section ctx={ctx} title="账户" />
      <HStack spacing={6}>
        {[['积分', pointsText(a)], ['星级', starText(a)], ['星级分', a.user?.starScore !== undefined ? String(a.user.starScore) : '-'], ['网龄', netText(a)]].map(([l, v]) => (
          <Cell ctx={ctx} gap={0}><Text font={10} foregroundStyle={th.t3}>{l}</Text><Num value={v} size={13} color={th.t1} /></Cell>
        ))}
      </HStack>
      {roomy ? <Section ctx={ctx} title="近 7 天通用" right={slot.hist?.avg('gen') != null ? `日均 ${amount('gen', slot.hist!.avg('gen')!)}` : '记录中'} /> : null}
      {roomy ? <DailyBars ctx={ctx} values={slot.hist?.daily('gen', 7) ?? []} height={26} /> : null}
      <Spacer minLength={0} />
      {last ? (
        <HStack spacing={6}>
          <Text font={10} foregroundStyle={th.t3}>最近账本</Text>
          <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{`${md(last.time)} ${last.name}`}</Text>
          <Spacer minLength={4} />
          <Text font={10} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1}>{`−${last.amount.toFixed(2)}`}</Text>
        </HStack>
      ) : null}
    </Root>
  )
}
