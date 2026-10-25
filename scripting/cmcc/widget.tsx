// cmcc / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 每次刷新自动续登. 素色卡片, 浅色 / 深色跟随系统
// 参数: 空 = 第一个号; "1234" = 单号; "主号:1234,副号:5678" = 双号 (备注可省)
// 通用 / 定向 / 语音统一当"额度条", 版式按条数 1-3 自适应

import {
  VStack,
  HStack,
  Text,
  Spacer,
  Image,
  Widget,
  Button,
  Capsule,
  Rectangle,
  RoundedRectangle,
} from 'scripting'
import type { Color, DynamicShapeStyle } from 'scripting'

import { loadAccount, formatFlow, type Account, CmccError } from './api'
import { RefreshIntent } from './app_intents'

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────
const LOGO_URL = 'https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/cmcc.png'
const REFRESH_MS = 2 * 60 * 60 * 1000   // 请求 2 小时后刷新, 实际由系统决定; 要马上看点右上角时间

type Pair = { light: Color; dark: Color }

// 素色: 浅色白底, 深色深灰底, 色值取 iOS 系统色
const T1: Pair = { light: '#1C1C1E', dark: '#FFFFFF' }   // 主数字
const T2: Pair = { light: '#6E6E73', dark: '#98989F' }   // 标签
const T3: Pair = { light: '#8E8E93', dark: '#8E8E93' }   // 次要信息
const CARD: Pair = { light: '#F2F2F7', dark: '#2C2C2E' }
const TRACK: Pair = { light: '#E5E5EA', dark: '#3A3A3C' }
const BG: Pair = { light: '#FFFFFF', dark: '#1C1C1E' }

// 进度条按剩余比例: > 50% 绿, 20-50% 橙, < 20% 红
const GREEN: Pair = { light: '#34C759', dark: '#30D158' }
const ORANGE: Pair = { light: '#FF9500', dark: '#FF9F0A' }
const RED: Pair = { light: '#FF3B30', dark: '#FF453A' }

function levelColor(remainPercent: number): Pair {
  if (remainPercent < 20) return RED
  if (remainPercent <= 50) return ORANGE
  return GREEN
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 一根额度条: 通用 / 定向流量或语音 */
type Meter = { label: string; remain: string; total: string; used: string; percent: number }

function metersOf(a: Account): Meter[] {
  const out: Meter[] = []
  for (const [label, f] of [['通用', a.general], ['定向', a.targeted]] as const) {
    if (f) out.push({
      label,
      remain: formatFlow(f.remainMB),
      total: formatFlow(f.totalMB),
      used: formatFlow(f.usedMB),
      percent: f.totalMB > 0 ? (f.remainMB / f.totalMB) * 100 : 0,
    })
  }
  // 套餐没有语音分钟数时不显示语音
  const v = a.voice
  if (v && v.total > 0) out.push({
    label: '语音',
    remain: `${Math.round(v.remain)}分`,
    total: `${Math.round(v.total)}分`,
    used: `${Math.round(v.used)}分`,
    percent: (v.remain / v.total) * 100,
  })
  return out
}

const starText = (a: Account) => (a.user?.starLevel ? '★'.repeat(a.user.starLevel) : '-')
const pointsText = (a: Account) => (a.points !== undefined ? String(a.points) : '-')
const balanceLabel = (a: Account) => (a.balance < 0 ? '已欠费 · 元' : '话费余额 · 元')
/** 品牌, 未知品牌代码时退回星级 */
const tagText = (a: Account) => a.user?.brand ?? starText(a)

// ─────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────
/** 双号里的一格: 备注名 + 账号或错误 */
type Slot = { name: string; account?: Account; error?: Error }

/** "主号:1234,副号:5678" → [{name, tail}], 中英文逗号 / 冒号都行 */
function parseParam(p: string | undefined): { name?: string; tail: string }[] {
  return (p ?? '').split(/[,，]/).map(s => s.trim()).filter(Boolean).map(s => {
    const [a, b] = s.split(/[:：]/).map(x => x.trim())
    return b === undefined ? { tail: a } : { name: a, tail: b }
  })
}

async function main() {
  const entries = parseParam(Widget.parameter)
  let view
  if (entries.length >= 2) {
    const slots = await Promise.all(entries.slice(0, 2).map(e =>
      loadAccount(e.tail).then(
        (account): Slot => ({ name: e.name ?? `尾号 ${account.phoneTail}`, account }),
        (error): Slot => ({ name: e.name ?? `尾号 ${e.tail}`, error }),
      )))
    view = <DualRoot slots={slots} family={Widget.family} />
  } else {
    let account: Account | null = null
    let lastError: Error | null = null
    try {
      account = await loadAccount(entries[0]?.tail)
    } catch (e) {
      lastError = e as Error
    }
    view = <WidgetRoot account={account} error={lastError} family={Widget.family} />
  }
  Widget.present(view, { policy: 'after', date: new Date(Date.now() + REFRESH_MS) })
}

function WidgetRoot(props: { account: Account | null; error: Error | null; family: string }) {
  const { account, error, family } = props
  if (error || !account) return <ErrorView error={error} />
  if (family === 'systemSmall') return <SmallView account={account} />
  if (family === 'systemLarge' || family === 'systemExtraLarge') return <LargeView account={account} />
  return <MediumView account={account} />
}

function DualRoot(props: { slots: Slot[]; family: string }) {
  const { slots, family } = props
  const loaded = slots.filter(s => s.account).map(s => s.account!)
  if (loaded.length === 0) return <ErrorView error={slots[0].error ?? null} />
  // 两个号取较早的更新时间, 任一降级到缓存就带 ⚠
  const fetchedAt = Math.min(...loaded.map(a => a.fetchedAt))
  const stale = loaded.some(a => a.stale)
  if (family === 'systemSmall') return <DualSmall slots={slots} fetchedAt={fetchedAt} stale={stale} />
  if (family === 'systemLarge' || family === 'systemExtraLarge') return <DualLarge slots={slots} fetchedAt={fetchedAt} stale={stale} />
  return <DualMedium slots={slots} fetchedAt={fetchedAt} stale={stale} />
}

// ─────────────────────────────────────────────────────────────
// 公共部件
// ─────────────────────────────────────────────────────────────
function Logo() {
  return (
    <Image
      imageUrl={LOGO_URL}
      resizable
      frame={{ width: 22, height: 22 }}
      clipShape={{ type: 'rect', cornerRadius: 6 }}
    />
  )
}

function Brand() {
  return (
    <HStack spacing={6}>
      <Logo />
      <Text font={11} fontWeight="semibold" foregroundStyle={T1}>中国移动</Text>
    </HStack>
  )
}

/** 更新时间 + 刷新图标, 点按跳过缓存重新查询 */
function TimeText(props: { fetchedAt: number; stale: boolean }) {
  const t = formatTime(props.fetchedAt)
  return (
    <Button intent={RefreshIntent(undefined)} buttonStyle="plain">
      <HStack spacing={3}>
        <Text font={11} foregroundStyle={T3}>{props.stale ? `⚠ ${t}` : t}</Text>
        <Image systemName="arrow.clockwise" font={9} foregroundStyle={T3} />
      </HStack>
    </Button>
  )
}

/** 余额数字, 低于 10 元 (含欠费负数) 变红, 放不下自动缩小 */
function BalanceNumber(props: { account: Account; size: number }) {
  const { account, size } = props
  return (
    <Text font={size} fontWeight="semibold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.6}
      foregroundStyle={account.balance < 10 ? RED : T1}>
      {account.balance.toFixed(2)}
    </Text>
  )
}

function Balance(props: { account: Account; size: number }) {
  return (
    <VStack alignment="leading" spacing={1}>
      <BalanceNumber account={props.account} size={props.size} />
      <Text font={11} foregroundStyle={T2}>{balanceLabel(props.account)}</Text>
    </VStack>
  )
}

/** 圆角卡片, 撑满横向; fill 时也撑满纵向 */
function Card(props: { children?: any; spacing?: number; padding?: number; fill?: boolean }) {
  return (
    <VStack
      alignment="leading"
      spacing={props.spacing ?? 4}
      padding={props.padding ?? { horizontal: 10, vertical: 8 }}
      frame={{ maxWidth: 'infinity', maxHeight: props.fill ? 'infinity' : undefined, alignment: 'leading' }}
      background={<RoundedRectangle cornerRadius={14} fill={CARD} />}
    >
      {props.children}
    </VStack>
  )
}

/** 进度条: 轨道 + 填充, 浅色 / 深色各一套硬停点渐变 */
function Bar(props: { percent: number; height: number }) {
  const { percent, height } = props
  const color = levelColor(percent)
  const p = Math.max(0.005, Math.min(0.995, percent / 100))
  const fill = (c: Color, t: Color) => ({
    stops: [
      { color: c, location: 0 },
      { color: c, location: p },
      { color: t, location: p },
      { color: t, location: 1 },
    ],
    startPoint: 'leading',
    endPoint: 'trailing',
  })
  return (
    <Capsule
      fill={{ light: fill(color.light, TRACK.light), dark: fill(color.dark, TRACK.dark) } as DynamicShapeStyle}
      frame={{ maxWidth: 'infinity', height }}
    />
  )
}

/** 0.5pt 竖分隔线 */
function VLine() {
  return <Rectangle fill={TRACK} frame={{ width: 0.5, maxHeight: 'infinity' }} />
}

/** 无卡片的一行额度: 标签 + 剩余 (+ 总量), 下面一根进度条 */
function MeterLine(props: { m: Meter; font?: number; bar?: number; total?: boolean; caption?: boolean }) {
  const { m, font = 12, bar = 5, total, caption } = props
  return (
    <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity' }}>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Text font={11} foregroundStyle={T2}>{m.label}</Text>
        <Spacer />
        <Text font={font} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1} lineLimit={1}>{m.remain}</Text>
        {total ? <Text font={10} foregroundStyle={T3}>{`/${m.total}`}</Text> : null}
      </HStack>
      <Bar percent={m.percent} height={bar} />
      {caption ? <Text font={10} foregroundStyle={T3}>{`已用 ${m.used} · 剩 ${Math.round(m.percent)}%`}</Text> : null}
    </VStack>
  )
}

/** 小号 / 双号中号的额度区: 1 条带总量和说明, 2 条两行, 3 条时通用整行 + 定向 / 语音半行 */
function MeterStack(props: { meters: Meter[]; total?: boolean }) {
  const { meters, total } = props
  if (meters.length === 1) return <MeterLine m={meters[0]} total caption bar={6} />
  if (meters.length === 2) {
    return (
      <VStack spacing={6}>
        {meters.map(m => <MeterLine m={m} total={total} />)}
      </VStack>
    )
  }
  return (
    <VStack spacing={6}>
      <MeterLine m={meters[0]} total={total} />
      <HStack spacing={8}>
        <MeterLine m={meters[1]} font={11} bar={4} />
        <MeterLine m={meters[2]} font={11} bar={4} />
      </HStack>
    </VStack>
  )
}

/** 卡片里的一条额度; big 用于大号只有一条时 */
function MeterCard(props: { m: Meter; detail?: boolean; big?: boolean }) {
  const { m, detail, big } = props
  return (
    <Card spacing={big ? 8 : 4} padding={big ? 12 : undefined}>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Text font={11} foregroundStyle={T2}>{m.label}</Text>
        <Spacer />
        <Text font={big ? 22 : 17} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1} lineLimit={1}>{m.remain}</Text>
        <Text font={11} foregroundStyle={T3}>{`/${m.total}`}</Text>
      </HStack>
      <Bar percent={m.percent} height={big ? 8 : 5} />
      {detail ? (
        <Text font={11} foregroundStyle={T3}>{`已用 ${m.used} · 剩 ${Math.round(m.percent)}%`}</Text>
      ) : null}
    </Card>
  )
}

/** 中号右侧三条时用的矮卡 */
function SlimMeterCard(props: { m: Meter }) {
  const { m } = props
  return (
    <VStack
      alignment="leading"
      spacing={3}
      padding={{ horizontal: 10, vertical: 5 }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      background={<RoundedRectangle cornerRadius={12} fill={CARD} />}
    >
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Text font={11} foregroundStyle={T2}>{m.label}</Text>
        <Spacer />
        <Text font={15} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1} lineLimit={1}>{m.remain}</Text>
        <Text font={10} foregroundStyle={T3}>{`/${m.total}`}</Text>
      </HStack>
      <Bar percent={m.percent} height={4} />
    </VStack>
  )
}

/** 中号右下的小胶囊: 图标 + 标签 + 值 */
function Chip(props: { icon: string; label: string; value: string }) {
  return (
    <HStack
      spacing={4}
      padding={{ horizontal: 10, vertical: 5 }}
      frame={{ maxWidth: 'infinity' }}
      background={<RoundedRectangle cornerRadius={14} fill={CARD} />}
    >
      <Image systemName={props.icon} font={10} foregroundStyle={T2} />
      <Text font={11} foregroundStyle={T2} lineLimit={1}>{props.label}</Text>
      <Spacer />
      <Text font={11} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1}>{props.value}</Text>
    </HStack>
  )
}

/** 统计格; tall 时撑满高度, 标签在上数值在下 */
function Stat(props: { label: string; value: string; size?: number; tall?: boolean }) {
  const { label, value, size = 15, tall } = props
  return (
    <VStack
      alignment="leading"
      spacing={1}
      padding={tall ? { horizontal: 12, vertical: 10 } : { horizontal: 8, vertical: 6 }}
      frame={{ maxWidth: 'infinity', maxHeight: tall ? 'infinity' : undefined, alignment: 'leading' }}
      background={<RoundedRectangle cornerRadius={12} fill={CARD} />}
    >
      <Text font={11} foregroundStyle={T2} lineLimit={1}>{label}</Text>
      {tall ? <Spacer /> : null}
      <Text font={size} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1} lineLimit={1} minScaleFactor={0.7}>{value}</Text>
    </VStack>
  )
}

/** 品牌格: 有品牌时 "动感地带 ★★★", 否则 "星级 ★★★" */
function BrandChip(props: { account: Account }) {
  const a = props.account
  return a.user?.brand
    ? <Chip icon="checkmark.seal.fill" label={a.user.brand} value="" />
    : <Chip icon="checkmark.seal.fill" label="星级" value={starText(a)} />
}

// ─────────────────────────────────────────────────────────────
// Small — 余额 + 额度区
// ─────────────────────────────────────────────────────────────
function SmallView(props: { account: Account }) {
  const { account } = props
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={14}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      widgetBackground={BG as DynamicShapeStyle}
    >
      <HStack>
        <Logo />
        <Spacer />
        <TimeText fetchedAt={account.fetchedAt} stale={account.stale} />
      </HStack>
      <Spacer />
      <Balance account={account} size={30} />
      <Spacer />
      <MeterStack meters={metersOf(account)} />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Medium — 左: 余额, 右: 按条数排 (1 条 + 两格 / 2 条 + 胶囊 / 3 张矮卡)
// ─────────────────────────────────────────────────────────────
function MediumView(props: { account: Account }) {
  const { account } = props
  const meters = metersOf(account)
  let right
  if (meters.length === 1) {
    right = [
      <MeterCard m={meters[0]} detail />,
      <HStack spacing={6} frame={{ maxHeight: 'infinity' }}>
        <Stat label="积分" value={pointsText(account)} size={17} tall />
        <Stat label={account.user?.brand ?? '星级'} value={starText(account)} size={17} tall />
      </HStack>,
    ]
  } else if (meters.length === 2) {
    right = [
      ...meters.map(m => <MeterCard m={m} />),
      <HStack spacing={6}>
        <Chip icon="star.fill" label="积分" value={pointsText(account)} />
        <BrandChip account={account} />
      </HStack>,
    ]
  } else {
    right = meters.map(m => <SlimMeterCard m={m} />)
  }
  return (
    <HStack
      spacing={14}
      padding={14}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetBackground={BG as DynamicShapeStyle}
    >
      <VStack alignment="leading" spacing={0} frame={{ width: 118, maxHeight: 'infinity', alignment: 'topLeading' }}>
        <Brand />
        <Spacer />
        <Balance account={account} size={34} />
        <Spacer />
        <HStack spacing={4}>
          {account.monthFee !== undefined ? (
            <Text font={11} foregroundStyle={T3}>{`本月 ¥${account.monthFee.toFixed(2)} ·`}</Text>
          ) : null}
          <TimeText fetchedAt={account.fetchedAt} stale={account.stale} />
        </HStack>
      </VStack>
      <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
        {right}
      </VStack>
    </HStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Large — 归属 / 品牌 + 余额 / 本月消费 + 额度卡 + 星级 / 积分 / 星级分 / 网龄
// ─────────────────────────────────────────────────────────────
function LargeView(props: { account: Account }) {
  const { account } = props
  const u = account.user
  const meters = metersOf(account)
  const subtitle = [u?.channel?.replace('移动', ''), u?.brand].filter(Boolean).join(' · ')
  const stats: [string, string][] = [
    ['星级', starText(account)],
    ['积分', pointsText(account)],
    ['星级分', u?.starScore !== undefined ? String(u.starScore) : '-'],
    ['网龄', u?.netYears !== undefined ? `${u.netYears.toFixed(1)}年` : '-'],
  ]
  const one = meters.length === 1
  return (
    <VStack
      alignment="leading"
      spacing={14}
      padding={16}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      widgetBackground={BG as DynamicShapeStyle}
    >
      <HStack spacing={6}>
        <Brand />
        {subtitle ? <Text font={11} foregroundStyle={T3}>{subtitle}</Text> : null}
        <Spacer />
        <TimeText fetchedAt={account.fetchedAt} stale={account.stale} />
      </HStack>
      <HStack alignment="bottom">
        <Balance account={account} size={44} />
        <Spacer />
        {account.monthFee !== undefined ? (
          <VStack alignment="trailing" spacing={1}>
            <Text font={18} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1}>
              {`¥${account.monthFee.toFixed(2)}`}
            </Text>
            <Text font={11} foregroundStyle={T2}>本月消费</Text>
          </VStack>
        ) : null}
      </HStack>
      {one ? (
        // 只有一条: 大卡 + 2×2 统计格撑满, 中间不留空
        <MeterCard m={meters[0]} detail big />
      ) : (
        <VStack spacing={6}>
          {meters.map(m => <MeterCard m={m} detail={meters.length < 3} />)}
        </VStack>
      )}
      {one ? (
        <VStack spacing={6} frame={{ maxHeight: 'infinity' }}>
          <HStack spacing={6}>
            {stats.slice(0, 2).map(([l, v]) => <Stat label={l} value={v} size={20} tall />)}
          </HStack>
          <HStack spacing={6}>
            {stats.slice(2).map(([l, v]) => <Stat label={l} value={v} size={20} tall />)}
          </HStack>
        </VStack>
      ) : [
        <Spacer />,
        <HStack spacing={6}>
          {stats.map(([l, v]) => <Stat label={l} value={v} />)}
        </HStack>,
      ]}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 双号 — 左右两列, 中间细线
// ─────────────────────────────────────────────────────────────
function DualFrame(props: { children?: any; padding: number; header: any; gap: number; columnGap: number }) {
  return (
    <VStack
      alignment="leading"
      spacing={props.gap}
      padding={props.padding}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      widgetBackground={BG as DynamicShapeStyle}
    >
      {props.header}
      <HStack alignment="top" spacing={props.columnGap} frame={{ maxHeight: 'infinity' }}>
        {props.children}
      </HStack>
    </VStack>
  )
}

/** 某个号查询失败时那一列 */
function SlotError(props: { slot: Slot }) {
  const msg = classifyError(props.slot.error ?? null)
  return (
    <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
      <Text font={11} foregroundStyle={T2} lineLimit={1}>{props.slot.name}</Text>
      <Spacer />
      <Image systemName="exclamationmark.triangle.fill" font={16} foregroundStyle={ORANGE} />
      <Text font={12} fontWeight="semibold" foregroundStyle={T1}>{msg.title}</Text>
      <Text font={10} foregroundStyle={T2}>{msg.hint}</Text>
      <Spacer />
    </VStack>
  )
}

function DualSmall(props: { slots: Slot[]; fetchedAt: number; stale: boolean }) {
  const column = (s: Slot) => {
    const a = s.account
    if (!a) return <SlotError slot={s} />
    return (
      <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
        <Text font={11} foregroundStyle={T2} lineLimit={1}>{s.name}</Text>
        <BalanceNumber account={a} size={19} />
        <Text font={10} foregroundStyle={a.balance < 0 ? RED : T3}>{a.balance < 0 ? '已欠费' : '余额'}</Text>
        <Spacer />
        <VStack alignment="leading" spacing={5}>
          {metersOf(a).slice(0, 2).map(m => (
            <VStack alignment="leading" spacing={3}>
              <Text font={10} foregroundStyle={T2} lineLimit={1} minScaleFactor={0.8}>{`${m.label} ${m.remain}`}</Text>
              <Bar percent={m.percent} height={4} />
            </VStack>
          ))}
        </VStack>
      </VStack>
    )
  }
  return (
    <DualFrame padding={14} gap={8} columnGap={10} header={
      <HStack>
        <Logo />
        <Spacer />
        <TimeText fetchedAt={props.fetchedAt} stale={props.stale} />
      </HStack>
    }>
      {column(props.slots[0])}
      <VLine />
      {column(props.slots[1])}
    </DualFrame>
  )
}

function DualMedium(props: { slots: Slot[]; fetchedAt: number; stale: boolean }) {
  const column = (s: Slot) => {
    const a = s.account
    if (!a) return <SlotError slot={s} />
    return (
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
        <HStack alignment="lastTextBaseline">
          <Text font={11} foregroundStyle={T2} lineLimit={1}>{a.balance < 0 ? `${s.name} · 欠费` : s.name}</Text>
          <Spacer />
          <Text font={10} foregroundStyle={T3} lineLimit={1}>{tagText(a)}</Text>
        </HStack>
        <BalanceNumber account={a} size={28} />
        <Spacer />
        <MeterStack meters={metersOf(a)} total />
      </VStack>
    )
  }
  return (
    <DualFrame padding={14} gap={6} columnGap={14} header={
      <HStack>
        <Brand />
        <Spacer />
        <TimeText fetchedAt={props.fetchedAt} stale={props.stale} />
      </HStack>
    }>
      {column(props.slots[0])}
      <VLine />
      {column(props.slots[1])}
    </DualFrame>
  )
}

function DualLarge(props: { slots: Slot[]; fetchedAt: number; stale: boolean }) {
  const column = (s: Slot) => {
    const a = s.account
    if (!a) return <SlotError slot={s} />
    return (
      <VStack alignment="leading" spacing={0} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
        <HStack alignment="lastTextBaseline">
          <Text font={12} fontWeight="semibold" foregroundStyle={T1} lineLimit={1}>{s.name}</Text>
          <Spacer />
          <Text font={10} foregroundStyle={T3} lineLimit={1}>{tagText(a)}</Text>
        </HStack>
        <VStack alignment="leading" spacing={1} padding={{ top: 10 }}>
          <BalanceNumber account={a} size={32} />
          <Text font={11} foregroundStyle={a.balance < 0 ? RED : T2}>{balanceLabel(a)}</Text>
        </VStack>
        <Spacer />
        <VStack spacing={6}>
          {metersOf(a).map(m => (
            <Card>
              <HStack alignment="lastTextBaseline">
                <Text font={11} foregroundStyle={T2}>{m.label}</Text>
                <Spacer />
                <Text font={15} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1} lineLimit={1}>{m.remain}</Text>
              </HStack>
              <Bar percent={m.percent} height={5} />
              <Text font={10} foregroundStyle={T3}>{`共 ${m.total} · 剩 ${Math.round(m.percent)}%`}</Text>
            </Card>
          ))}
        </VStack>
        <Spacer />
        <HStack spacing={6}>
          <Stat label="本月" value={a.monthFee !== undefined ? `¥${a.monthFee.toFixed(2)}` : '-'} size={13} />
          <Stat label="积分" value={pointsText(a)} size={13} />
        </HStack>
      </VStack>
    )
  }
  return (
    <DualFrame padding={16} gap={12} columnGap={14} header={
      <HStack>
        <Brand />
        <Spacer />
        <TimeText fetchedAt={props.fetchedAt} stale={props.stale} />
      </HStack>
    }>
      {column(props.slots[0])}
      <VLine />
      {column(props.slots[1])}
    </DualFrame>
  )
}

// ─────────────────────────────────────────────────────────────
// ErrorView
// ─────────────────────────────────────────────────────────────
function ErrorView(props: { error: Error | null }) {
  const msg = classifyError(props.error)
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={BG as DynamicShapeStyle}>
      <Image systemName="exclamationmark.triangle.fill" font={22} foregroundStyle={ORANGE} />
      <Text font={12} fontWeight="semibold" foregroundStyle={T1}>{msg.title}</Text>
      <Text font={10} foregroundStyle={T2} multilineTextAlignment="center">{msg.hint}</Text>
    </VStack>
  )
}

function classifyError(err: Error | null): { title: string; hint: string } {
  if (!err) return { title: '未知错误', hint: '打开 Scripting 查看日志' }
  if (err instanceof CmccError) {
    if (err.kind === 'no_cred') {
      return err.message.startsWith('没有尾号')
        ? { title: '找不到账号', hint: `${err.message}, 检查小组件参数` }
        : { title: '未配置', hint: '打开 Scripting → 运行 cmcc 导入凭证' }
    }
    if (err.kind === 'auth')    return { title: '凭证失效', hint: '划掉中国移动 App 重开, 再到 Scripting 导入' }
    if (err.kind === 'risk')    return { title: '需要验证', hint: '打开中国移动 App 完成安全验证后再刷新' }
    if (err.kind === 'network') return { title: '网络错误', hint: '稍后自动重试' }
    if (err.kind === 'schema')  return { title: '接口变化', hint: err.message.slice(0, 60) }
  }
  return { title: '错误', hint: err.message.slice(0, 60) }
}

main()
