// cmcc / styles/basic.tsx
// 一眼看懂: 自适应 (原默认版式) / 大字余额 / 账单卡 / 锁屏

import { VStack, HStack, ZStack, Text, Spacer, Gauge, AccessoryWidgetBackground, RoundedRectangle } from 'scripting'

import { formatFlow, type Account } from '../api'
import {
  Root, Header, SyncTap, Logo, Num, Label, Balance, Cell, Stat, Bar, MeterStack, ErrorBox, LockPreview, lockFg, primary, metersOf, amount, totalText,
  starText, pointsText, netText, balanceColor, balanceLabel, RED, type Ctx, type Meter,
} from '../ui'

/** 没有数据时整张显示错误 */
export function NoData(props: { ctx: Ctx }) {
  return <Root ctx={props.ctx}><ErrorBox ctx={props.ctx} error={props.ctx.slots[0]?.error} /></Root>
}

// ─────────────────────────────────────────────────────────────
// A 自适应: 按套餐有几项 (1-3) 排版; 原 0.4 默认样式
// ─────────────────────────────────────────────────────────────
function MeterCard(props: { ctx: Ctx; m: Meter; detail?: boolean; big?: boolean; roomy?: boolean }) {
  const { ctx, m } = props
  return (
    <Cell ctx={ctx} gap={props.big ? 8 : 4}>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Label ctx={ctx} text={m.label} />
        <Spacer />
        <Num value={amount(m.key, m.remain)} size={props.big ? 22 : props.roomy ? 20 : 17} color={ctx.th.t1} />
        <Text font={11} foregroundStyle={ctx.th.t3}>{`/${totalText(m.key, m.total)}`}</Text>
      </HStack>
      <Bar ctx={ctx} percent={m.percent} height={props.big ? 8 : props.roomy ? 7 : 5} />
      {props.detail ? <Text font={11} foregroundStyle={ctx.th.t3}>{`已用 ${amount(m.key, m.used)} · 剩 ${Math.round(m.percent)}%`}</Text> : null}
    </Cell>
  )
}

/** 中号右侧三项时的矮卡, 撑满高度平分 */
function SlimCard(props: { ctx: Ctx; m: Meter }) {
  const { ctx, m } = props
  return (
    <Cell ctx={ctx} gap={3} fill>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Label ctx={ctx} text={m.label} />
        <Spacer />
        <Num value={amount(m.key, m.remain)} size={14} color={ctx.th.t1} />
        <Text font={10} foregroundStyle={ctx.th.t3}>{`/${totalText(m.key, m.total)}`}</Text>
      </HStack>
      <Bar ctx={ctx} percent={m.percent} height={4} />
    </Cell>
  )
}

/** 一行的小胶囊: 标签 + 值 */
function Chip(props: { ctx: Ctx; label: string; value: string }) {
  const { ctx } = props
  return (
    <HStack padding={{ horizontal: 10, vertical: 5 }} frame={{ maxWidth: 'infinity' }} background={<RoundedRectangle cornerRadius={12} fill={ctx.th.card} />}>
      <Label ctx={ctx} text={props.label} />
      <Spacer minLength={4} />
      <Num value={props.value} size={11} color={ctx.th.t1} />
    </HStack>
  )
}

export function AdaptiveStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const ms = metersOf(a)
  if (ctx.size === 's') {
    return (
      <Root ctx={ctx} spacing={0}>
        <Header ctx={ctx} />
        <Spacer />
        <Balance ctx={ctx} a={a} size={30} />
        <Spacer />
        <MeterStack ctx={ctx} ms={ms} />
      </Root>
    )
  }
  if (ctx.size === 'm') {
    let right
    if (ms.length === 1) {
      right = [
        <MeterCard ctx={ctx} m={ms[0]} detail />,
        <HStack spacing={6} frame={{ maxHeight: 'infinity' }}>
          <Stat ctx={ctx} label="积分" value={pointsText(a)} size={17} fill />
          <Stat ctx={ctx} label={a.user?.brand ?? '星级'} value={starText(a)} size={17} fill />
        </HStack>,
      ]
    } else if (ms.length === 2) {
      right = [
        ...ms.map(m => <MeterCard ctx={ctx} m={m} />),
        <HStack spacing={6}>
          <Chip ctx={ctx} label="积分" value={pointsText(a)} />
          <Chip ctx={ctx} label={a.user?.brand ?? '星级'} value={a.user?.brand ? '' : starText(a)} />
        </HStack>,
      ]
    } else {
      right = ms.map(m => <SlimCard ctx={ctx} m={m} />)
    }
    return (
      <Root ctx={ctx} spacing={0}>
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack alignment="leading" spacing={0} frame={{ width: 118, maxHeight: 'infinity', alignment: 'topLeading' }}>
            <Header ctx={ctx} title="中国移动" right={null} />
            <Spacer />
            <Balance ctx={ctx} a={a} size={32} />
            <Spacer />
            {a.monthFee !== undefined ? <Text font={11} foregroundStyle={ctx.th.t3}>{`本月 ¥${a.monthFee.toFixed(2)}`}</Text> : null}
            <SyncTap ctx={ctx} />
          </VStack>
          <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
            {right}
          </VStack>
        </HStack>
      </Root>
    )
  }
  const u = a.user
  const stats: [string, string][] = [['星级', starText(a)], ['积分', pointsText(a)], ['星级分', u?.starScore !== undefined ? String(u.starScore) : '-'], ['网龄', netText(a)]]
  return (
    <Root ctx={ctx} spacing={14}>
      <Header ctx={ctx} title="中国移动" sub={[u?.channel?.replace('移动', ''), u?.brand].filter(Boolean).join(' · ')} />
      <HStack alignment="bottom">
        <Balance ctx={ctx} a={a} size={44} />
        <Spacer />
        {a.monthFee !== undefined ? (
          <VStack alignment="trailing" spacing={1}>
            <Num value={`¥${a.monthFee.toFixed(2)}`} size={18} color={ctx.th.t1} />
            <Label ctx={ctx} text="本月消费" />
          </VStack>
        ) : null}
      </HStack>
      <VStack spacing={6}>{ms.map(m => <MeterCard ctx={ctx} m={m} detail={ms.length < 3} big={ms.length === 1} roomy={ms.length === 3} />)}</VStack>
      <Spacer />
      <HStack spacing={6}>{stats.map(([l, v]) => <Stat ctx={ctx} label={l} value={v} />)}</HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// B 大字余额: 只有一个居中的大数字, 底下一行小字
// ─────────────────────────────────────────────────────────────
export function BigBalanceStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  if (ctx.size === 'm') {
    const rows: [string, string][] = [
      ...(a.monthFee !== undefined ? [['本月', `¥${a.monthFee.toFixed(2)}`] as [string, string]] : []),
      ...metersOf(a).map(m => [m.label, amount(m.key, m.remain)] as [string, string]),
    ]
    return (
      <Root ctx={ctx} spacing={4}>
        <Header ctx={ctx} />
        <HStack spacing={18} frame={{ maxHeight: 'infinity' }}>
          <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <Num value={a.balance.toFixed(2)} size={54} color={balanceColor(ctx, a)} />
            <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? RED : ctx.th.t2} />
          </VStack>
          <VStack frame={{ width: 112 }}>
            <Cell ctx={ctx} gap={7}>
              {rows.map(([l, v]) => (
                <HStack>
                  <Label ctx={ctx} text={l} />
                  <Spacer minLength={4} />
                  <Num value={v} size={13} color={ctx.th.t1} />
                </HStack>
              ))}
            </Cell>
          </VStack>
        </HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={0}>
      <Header ctx={ctx} />
      <Spacer />
      <HStack>
        <Spacer />
        <VStack spacing={3}>
          <Num value={a.balance.toFixed(2)} size={46} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? RED : ctx.th.t2} />
        </VStack>
        <Spacer />
      </HStack>
      <Spacer />
      <HStack spacing={4}>
        {metersOf(a).map(m => (
          <VStack spacing={1} frame={{ maxWidth: 'infinity' }}>
            <Num value={amount(m.key, m.remain)} size={12} color={ctx.th.t1} />
            <Label ctx={ctx} text={m.label} size={10} color={ctx.th.t3} />
          </VStack>
        ))}
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// D 账单卡: 做成一张银行卡, 卡号位放尾号; 大号下面再列额度和统计
// ─────────────────────────────────────────────────────────────
const CHIP = { gradient: [{ color: '#E2C878', location: 0 }, { color: '#B8963A', location: 1 }], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }

function BankCard(props: { ctx: Ctx; a: Account; tall?: boolean }) {
  const { ctx, a } = props
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ horizontal: 14, vertical: 12 }}
      frame={{ maxWidth: 'infinity', maxHeight: props.tall ? 'infinity' : undefined, alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={16} style="continuous" fill={ctx.th.card} />}
    >
      <HStack spacing={6}>
        <Logo size={20} />
        <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1} lineLimit={1}>中国移动</Text>
        <Spacer />
        <Text font={11} foregroundStyle={ctx.th.t2} lineLimit={1}>{[a.user?.brand, a.user?.starLevel ? starText(a) : ''].filter(Boolean).join(' · ')}</Text>
      </HStack>
      <RoundedRectangle cornerRadius={4} fill={CHIP as any} frame={{ width: 26, height: 18 }} padding={{ top: 8 }} />
      <Spacer minLength={6} />
      <HStack alignment="bottom">
        <VStack alignment="leading" spacing={3}>
          <Num value={`¥${a.balance.toFixed(2)}`} size={26} color={balanceColor(ctx, a)} />
          <Text font={11} fontDesign="monospaced" foregroundStyle={ctx.th.t3} lineLimit={1}>{`**** **** **** ${a.phoneTail}`}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={1}>
          <Text font={10} foregroundStyle={ctx.th.t3}>本月</Text>
          <Num value={a.monthFee !== undefined ? `¥${a.monthFee.toFixed(2)}` : '-'} size={14} color={ctx.th.t1} />
        </VStack>
      </HStack>
    </VStack>
  )
}

export function BillStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  return <Root ctx={ctx} spacing={0}><BankCard ctx={ctx} a={p.account} tall /></Root>
}

// ─────────────────────────────────────────────────────────────
// V 锁屏: 圆形 = 通用剩余比例 / 长条 = 余额 + 通用 / 单行
// ─────────────────────────────────────────────────────────────
export function LockCircular(props: { ctx: Ctx }) {
  const { ctx } = props
  const a = primary(ctx)?.account
  const g = a?.general
  const ratio = g && g.totalMB > 0 ? g.remainMB / g.totalMB : 0
  return (
    <LockPreview ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <Gauge
          value={ratio} min={0} max={1}
          label={<Text>通用</Text>}
          currentValueLabel={<Text fontDesign="rounded" monospacedDigit foregroundStyle={lockFg(ctx)}>{g ? formatFlow(g.remainMB).replace(/\.\d+/, '') : '-'}</Text>}
          gaugeStyle="accessoryCircularCapacity"
        />
      </ZStack>
    </LockPreview>
  )
}

export function LockRect(props: { ctx: Ctx }) {
  const { ctx } = props
  const a = primary(ctx)?.account
  const g = a?.general
  const fg = lockFg(ctx)
  const dim = ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined
  return (
    <LockPreview ctx={ctx} radius={14}>
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
        <Text font={11} lineLimit={1} foregroundStyle={dim}>{a ? (a.balance < 0 ? '移动 已欠费' : '移动 话费') : '中国移动'}</Text>
        <Text font={20} fontWeight="semibold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.6} foregroundStyle={fg}>{a ? `¥${a.balance.toFixed(2)}` : '-'}</Text>
        {g && g.totalMB > 0 ? <Gauge value={g.remainMB / g.totalMB} min={0} max={1} label={<Text>{`通用剩 ${formatFlow(g.remainMB)}`}</Text>} gaugeStyle="accessoryLinearCapacity" /> : null}
      </VStack>
    </LockPreview>
  )
}

export function LockInline(props: { ctx: Ctx }) {
  const { ctx } = props
  const a = primary(ctx)?.account
  const text = a ? [`¥${a.balance.toFixed(2)}`, a.general ? formatFlow(a.general.remainMB) : ''].filter(Boolean).join(' · ') : '中国移动'
  return <Text lineLimit={1} foregroundStyle={ctx.inApp ? '#FFFFFF' : undefined} padding={ctx.inApp ? 8 : 0} background={ctx.inApp ? <RoundedRectangle cornerRadius={8} fill="#3A3A3C" /> : undefined}>{text}</Text>
}
