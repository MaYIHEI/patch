// cmcc / styles/fun.tsx
// 话费小票

import { VStack, HStack, Text, Spacer, Circle, Rectangle } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import {
  Root, primary, metersOf, amount, md, hhmm, RED, type Ctx, } from '../ui'
import { NoData } from './basic'

const dyn = (x: any) => x as DynamicShapeStyle

const MONO = 'monospaced' as const

// ─────────────────────────────────────────────────────────────
// P 话费小票: 一张票据纸, 上下两边是锯齿, 余额 / 本月 / 各项剩余
// ─────────────────────────────────────────────────────────────
const PAPER = dyn({ light: '#FBF8F1', dark: '#2A2824' })

/** 锯齿: 一排和底色一样的小圆, 压在纸边上 */
function Teeth(props: { ctx: Ctx; y: number }) {
  return (
    <HStack spacing={4} offset={{ x: 0, y: props.y }}>
      {Array.from({ length: 26 }, () => <Circle fill={props.ctx.th.bg} frame={{ width: 7, height: 7 }} />)}
    </HStack>
  )
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
  return (
    <Root ctx={ctx} spacing={0}>
      <VStack
        alignment="leading" spacing={2}
        padding={{ horizontal: 14, vertical: 10 }}
        frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
        background={<Rectangle fill={PAPER} />}
        overlay={<VStack><Teeth ctx={ctx} y={-3.5} /><Spacer /><Teeth ctx={ctx} y={3.5} /></VStack>}
        clipped
      >
        <HStack><Spacer /><Text font={12} fontDesign={MONO} fontWeight="semibold" foregroundStyle={ctx.th.t1}>中国移动 · 话费单</Text><Spacer /></HStack>
        <Rectangle fill={ctx.th.t3} frame={{ maxWidth: 'infinity', height: 0.5 }} padding={{ vertical: 2 }} />
        {rows.map(([k, v, red]) => (
          <HStack>
            <Text font={11} fontDesign={MONO} foregroundStyle={ctx.th.t2}>{k}</Text>
            <Spacer />
            <Text font={11} fontDesign={MONO} fontWeight="semibold" foregroundStyle={red ? dyn(RED) : ctx.th.t1}>{v}</Text>
          </HStack>
        ))}
        <Spacer minLength={0} />
        <HStack>
          <Text font={10} fontDesign={MONO} foregroundStyle={ctx.th.t3}>{`尾号 ${a.phoneTail}`}</Text>
          <Spacer />
          <Text font={10} fontDesign={MONO} foregroundStyle={ctx.th.t3}>{`${md(a.fetchedAt)} ${hhmm(a.fetchedAt)}`}</Text>
        </HStack>
      </VStack>
    </Root>
  )
}
