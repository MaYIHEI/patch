// cmcc / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 每次刷新自动续登. 素色卡片, 浅色 / 深色跟随系统
// Small: 话费 + 两条流量 / Medium: + 流量卡 + 语音 / 积分 / Large: + 本月消费 / 归属 / 品牌 / 星级 / 网龄

import {
  VStack,
  HStack,
  Text,
  Spacer,
  Image,
  Widget,
  Capsule,
  RoundedRectangle,
} from 'scripting'
import type { Color, DynamicShapeStyle } from 'scripting'

import { loadAccount, formatFlow, type Account, type FlowPart, CmccError } from './api'

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────
const LOGO_URL = 'https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/cmcc.png'
const REFRESH_MS = 30 * 60 * 1000   // 请求 30 分钟后刷新, 实际由系统决定

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

function remainPercent(f: FlowPart): number {
  return f.totalMB > 0 ? (f.remainMB / f.totalMB) * 100 : 0
}

// ─────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────
async function main() {
  let account: Account | null = null
  let lastError: Error | null = null
  try {
    account = await loadAccount()
  } catch (e) {
    lastError = e as Error
  }
  Widget.present(
    <WidgetRoot account={account} error={lastError} family={Widget.family} />,
    { policy: 'after', date: new Date(Date.now() + REFRESH_MS) },
  )
}

function WidgetRoot(props: { account: Account | null; error: Error | null; family: string }) {
  const { account, error, family } = props
  if (error || !account) return <ErrorView error={error} />
  if (family === 'systemSmall') return <SmallView account={account} />
  if (family === 'systemLarge' || family === 'systemExtraLarge') return <LargeView account={account} />
  return <MediumView account={account} />
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

function TimeText(props: { account: Account }) {
  const { account } = props
  return (
    <Text font={11} foregroundStyle={T3}>
      {account.stale ? `⚠ ${formatTime(account.fetchedAt)}` : formatTime(account.fetchedAt)}
    </Text>
  )
}

function Balance(props: { account: Account; size: number }) {
  const { account, size } = props
  return (
    <VStack alignment="leading" spacing={1}>
      <Text font={size} fontWeight="semibold" fontDesign="rounded" foregroundStyle={account.balance < 10 ? RED : T1}>
        {account.balance.toFixed(2)}
      </Text>
      <Text font={11} foregroundStyle={T2}>话费余额 · 元</Text>
    </VStack>
  )
}

/** 圆角半透明卡片, 撑满横向 */
function Card(props: { children?: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={4}
      padding={{ horizontal: 10, vertical: 8 }}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
      background={<RoundedRectangle cornerRadius={14} fill={CARD} />}
    >
      {props.children}
    </VStack>
  )
}

/** 进度条: 轨道 + 填充, 浅色 / 深色各一套硬停点渐变 */
function Bar(props: { percent: number; color: Pair; height: number }) {
  const { percent, color, height } = props
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

function FlowCard(props: { label: string; flow: FlowPart; detail?: boolean }) {
  const { label, flow, detail } = props
  const p = remainPercent(flow)
  return (
    <Card>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Text font={11} foregroundStyle={T2}>{label}</Text>
        <Spacer />
        <Text font={detail ? 18 : 17} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1}>
          {formatFlow(flow.remainMB)}
        </Text>
        <Text font={11} foregroundStyle={T3}>{`/${formatFlow(flow.totalMB)}`}</Text>
      </HStack>
      <Bar percent={p} color={levelColor(p)} height={detail ? 6 : 5} />
      {detail ? (
        <Text font={11} foregroundStyle={T3}>{`已用 ${formatFlow(flow.usedMB)} · 剩 ${Math.round(p)}%`}</Text>
      ) : null}
    </Card>
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
      <Text font={11} foregroundStyle={T2}>{props.label}</Text>
      <Spacer />
      <Text font={11} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1}>{props.value}</Text>
    </HStack>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <VStack
      alignment="leading"
      spacing={1}
      padding={{ horizontal: 8, vertical: 6 }}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
      background={<RoundedRectangle cornerRadius={12} fill={CARD} />}
    >
      <Text font={11} foregroundStyle={T2}>{props.label}</Text>
      <Text font={15} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1} lineLimit={1}>{props.value}</Text>
    </VStack>
  )
}

const voiceText = (a: Account) => `${a.voice ? Math.round(a.voice.remain) : 0}分`
const pointsText = (a: Account) => (a.points !== undefined ? String(a.points) : '-')

// ─────────────────────────────────────────────────────────────
// Small — 余额 + 两条流量
// ─────────────────────────────────────────────────────────────
function SmallView(props: { account: Account }) {
  const { account } = props
  const { general, targeted } = account
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
        <TimeText account={account} />
      </HStack>
      <Spacer />
      <Balance account={account} size={32} />
      <Spacer />
      <HStack spacing={4}>
        {general ? (
          <Text font={11} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1}>{formatFlow(general.remainMB)}</Text>
        ) : null}
        <Text font={11} foregroundStyle={T2}>通用</Text>
        <Spacer />
        {targeted ? <Text font={11} foregroundStyle={T2}>定向</Text> : null}
        {targeted ? (
          <Text font={11} fontWeight="semibold" fontDesign="rounded" foregroundStyle={T1}>{formatFlow(targeted.remainMB)}</Text>
        ) : null}
      </HStack>
      <HStack spacing={4} padding={{ top: 5 }}>
        {general ? <Bar percent={remainPercent(general)} color={levelColor(remainPercent(general))} height={6} /> : null}
        {targeted ? <Bar percent={remainPercent(targeted)} color={levelColor(remainPercent(targeted))} height={6} /> : null}
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Medium — 左: 余额, 右: 流量卡 + 语音 / 积分
// ─────────────────────────────────────────────────────────────
function MediumView(props: { account: Account }) {
  const { account } = props
  return (
    <HStack
      spacing={14}
      padding={14}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetBackground={BG as DynamicShapeStyle}
    >
      <VStack alignment="leading" spacing={0} frame={{ width: 118, maxHeight: 'infinity', alignment: 'topLeading' }}>
        <HStack spacing={6}>
          <Logo />
          <Text font={11} fontWeight="semibold" foregroundStyle={T1}>中国移动</Text>
        </HStack>
        <Spacer />
        <Balance account={account} size={34} />
        <Spacer />
        <HStack spacing={4}>
          {account.monthFee !== undefined ? (
            <Text font={11} foregroundStyle={T3}>{`本月 ¥${account.monthFee.toFixed(2)} ·`}</Text>
          ) : null}
          <TimeText account={account} />
        </HStack>
      </VStack>
      <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
        {account.general ? <FlowCard label="通用" flow={account.general} /> : null}
        {account.targeted ? <FlowCard label="定向" flow={account.targeted} /> : null}
        <HStack spacing={6}>
          <Chip icon="phone.fill" label="语音" value={voiceText(account)} />
          <Chip icon="star.fill" label="积分" value={pointsText(account)} />
        </HStack>
      </VStack>
    </HStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Large — 归属 / 品牌 / 星级 + 余额 / 本月消费 + 流量详情 + 账号信息
// ─────────────────────────────────────────────────────────────
function LargeView(props: { account: Account }) {
  const { account } = props
  const u = account.user
  const star = u?.starLevel ? '★'.repeat(u.starLevel) : undefined
  const subtitle = [u?.channel?.replace('移动', ''), u?.brand, star].filter(Boolean).join(' · ')
  return (
    <VStack
      alignment="leading"
      spacing={14}
      padding={16}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      widgetBackground={BG as DynamicShapeStyle}
    >
      <HStack spacing={6}>
        <Logo />
        <Text font={11} fontWeight="semibold" foregroundStyle={T1}>中国移动</Text>
        {subtitle ? <Text font={11} foregroundStyle={T3}>{subtitle}</Text> : null}
        <Spacer />
        <TimeText account={account} />
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
      <VStack spacing={6}>
        {account.general ? <FlowCard label="通用流量" flow={account.general} detail /> : null}
        {account.targeted ? <FlowCard label="定向流量" flow={account.targeted} detail /> : null}
      </VStack>
      <Spacer />
      <HStack spacing={6}>
        <Stat label="语音" value={voiceText(account)} />
        <Stat label="积分" value={pointsText(account)} />
        <Stat label="星级分" value={u?.starScore !== undefined ? String(u.starScore) : '-'} />
        <Stat label="网龄" value={u?.netAge ?? '-'} />
      </HStack>
    </VStack>
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
    if (err.kind === 'no_cred') return { title: '未配置', hint: '打开 Scripting → 运行 cmcc 导入凭证' }
    if (err.kind === 'auth')    return { title: '凭证失效', hint: '划掉中国移动 App 重开, 再到 Scripting 导入' }
    if (err.kind === 'network') return { title: '网络错误', hint: '稍后自动重试' }
    if (err.kind === 'schema')  return { title: '接口变化', hint: err.message.slice(0, 60) }
  }
  return { title: '错误', hint: err.message.slice(0, 60) }
}

main()
