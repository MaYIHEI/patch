// cmcc / styles/basic.tsx
// 一眼看懂: 自适应 (原默认版式) / 大字余额 / 状态色块 / 账单卡 / 锁屏

import { VStack, HStack, ZStack, Text, Spacer, Image, Gauge, AccessoryWidgetBackground, RoundedRectangle } from 'scripting'
import type { DynamicShapeStyle } from 'scripting'

import { formatFlow, type Account } from '../api'
import {
  Root, Header, SyncTap, Logo, Num, Label, Balance, Cell, Stat, Bar, MeterLine, ErrorBox, LockPreview, lockFg, primary, metersOf, amount,
  starText, pointsText, netText, balanceColor, balanceLabel, RED, GREEN, type Ctx, type Meter,
} from '../ui'

/** 没有数据时整张显示错误 */
export function NoData(props: { ctx: Ctx }) {
  return <Root ctx={props.ctx}><ErrorBox ctx={props.ctx} error={props.ctx.slots[0]?.error} /></Root>
}

// ─────────────────────────────────────────────────────────────
// A 自适应: 按套餐有几项 (1-3) 排版; 原 0.4 默认样式
// ─────────────────────────────────────────────────────────────
function MeterCard(props: { ctx: Ctx; m: Meter; detail?: boolean; big?: boolean }) {
  const { ctx, m } = props
  return (
    <Cell ctx={ctx} gap={props.big ? 8 : 4}>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Label ctx={ctx} text={m.label} />
        <Spacer />
        <Num value={amount(m.key, m.remain)} size={props.big ? 22 : 17} color={ctx.th.t1} />
        <Text font={11} foregroundStyle={ctx.th.t3}>{`/${amount(m.key, m.total)}`}</Text>
      </HStack>
      <Bar ctx={ctx} percent={m.percent} height={props.big ? 8 : 5} />
      {props.detail ? <Text font={11} foregroundStyle={ctx.th.t3}>{`已用 ${amount(m.key, m.used)} · 剩 ${Math.round(m.percent)}%`}</Text> : null}
    </Cell>
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
        <VStack spacing={6}>
          {ms.length === 1 ? <MeterLine ctx={ctx} m={ms[0]} total bar={6} note={`已用 ${amount(ms[0].key, ms[0].used)} · 剩 ${Math.round(ms[0].percent)}%`} /> : ms.slice(0, 2).map(m => <MeterLine ctx={ctx} m={m} />)}
        </VStack>
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
          <Stat ctx={ctx} label="积分" value={pointsText(a)} size={13} />
          <Stat ctx={ctx} label={a.user?.brand ?? '星级'} value={starText(a)} size={13} />
        </HStack>,
      ]
    } else {
      right = ms.map(m => <MeterCard ctx={ctx} m={m} />)
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
      <VStack spacing={6}>{ms.map(m => <MeterCard ctx={ctx} m={m} detail={ms.length < 3} big={ms.length === 1} />)}</VStack>
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
  const foot = metersOf(a).map(m => `${m.label} ${amount(m.key, m.remain)}`).join(' · ')
  return (
    <Root ctx={ctx} spacing={0}>
      <Spacer />
      <HStack>
        <Spacer />
        <VStack spacing={3}>
          <Num value={a.balance.toFixed(2)} size={ctx.size === 's' ? 46 : 58} color={balanceColor(ctx, a)} />
          <Label ctx={ctx} text={ctx.size === 'm' && a.monthFee !== undefined ? `${balanceLabel(a)} · 本月 ¥${a.monthFee.toFixed(2)}` : balanceLabel(a)} color={a.balance < 0 ? RED : ctx.th.t2} />
        </VStack>
        <Spacer />
      </HStack>
      <Spacer />
      <HStack>
        <Spacer />
        <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1} minScaleFactor={0.8}>{foot}</Text>
        <Spacer />
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// C 状态色块: 欠费 / 快用完整张变红, 一切正常变绿, 只说一件事
// ─────────────────────────────────────────────────────────────
export function StatusStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = primary(ctx)
  if (!p) return <NoData ctx={ctx} />
  const a = p.account
  const low = metersOf(a).filter(m => m.percent < 20)
  const bad = a.balance < 10 || low.length > 0
  const color = (bad ? RED : GREEN) as DynamicShapeStyle
  const title = a.balance < 0 ? '已欠费' : a.balance < 10 ? '余额不足' : low.length ? `${low[0].label}快用完` : '一切正常'
  const value = a.balance < 10 ? a.balance.toFixed(2) : low.length ? amount(low[0].key, low[0].remain) : a.balance.toFixed(2)
  const hint = a.balance < 10 ? '打开中国移动 App 缴费' : low.length ? `剩 ${Math.round(low[0].percent)}% · 省着点用` : `通用剩 ${a.general ? formatFlow(a.general.remainMB) : '-'}`
  return (
    <Root ctx={ctx} spacing={0} tone={bad ? 'bad' : 'good'}>
      <Header ctx={ctx} title={`尾号 ${a.phoneTail}`} />
      <Spacer />
      <Image systemName={bad ? 'exclamationmark.triangle.fill' : 'checkmark.seal.fill'} font={ctx.size === 's' ? 24 : 28} foregroundStyle={color} />
      <Text font={ctx.size === 's' ? 15 : 17} fontWeight="semibold" foregroundStyle={color} padding={{ top: 6 }}>{title}</Text>
      <Num value={value} size={ctx.size === 's' ? 30 : 36} color={color} />
      <Spacer />
      <Label ctx={ctx} text={hint} />
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
  const a = p.account
  if (ctx.size === 'm') {
    return <Root ctx={ctx} spacing={0}><BankCard ctx={ctx} a={a} tall /></Root>
  }
  return (
    <Root ctx={ctx} spacing={12}>
      <BankCard ctx={ctx} a={a} />
      <VStack spacing={8}>{metersOf(a).map(m => <MeterLine ctx={ctx} m={m} total bar={6} font={15} />)}</VStack>
      <Spacer />
      <HStack spacing={6}>
        <Stat ctx={ctx} label="积分" value={pointsText(a)} />
        <Stat ctx={ctx} label="星级分" value={a.user?.starScore !== undefined ? String(a.user.starScore) : '-'} />
        <Stat ctx={ctx} label="网龄" value={netText(a)} />
      </HStack>
    </Root>
  )
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
