// cmcc / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 每次刷新自动续登. 玻璃风格, 浅色 / 深色跟随系统
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

// 文字三级: 主数字 / 标签 / 次要信息
const T1: Pair = { light: '#042C53', dark: '#FFFFFF' }
const T2: Pair = { light: '#185FA5', dark: '#CECBF6' }
const T3: Pair = { light: '#378ADD', dark: '#AFA9EC' }
const CARD: Pair = { light: 'rgba(255,255,255,0.62)', dark: 'rgba(255,255,255,0.09)' }
const TRACK: Pair = { light: 'rgba(4,44,83,0.10)', dark: 'rgba(255,255,255,0.14)' }
const LOW: Pair = { light: '#E24B4A', dark: '#F09595' }

// 分项点缀色
const GENERAL: Pair = { light: '#1D9E75', dark: '#5DCAA5' }
const TARGETED: Pair = { light: '#7F77DD', dark: '#AFA9EC' }
const VOICE: Pair = { light: '#D85A30', dark: '#F0997B' }
const POINTS: Pair = { light: '#BA7517', dark: '#FAC775' }

// 小组件底色; iOS 26 透明 / 着色外观下系统会隐藏它, 换成系统玻璃
const BG: DynamicShapeStyle = {
  light: {
    gradient: [
      { color: '#EAF3FC', location: 0 },
      { color: '#B5D4F4', location: 1 },
    ],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  },
  dark: {
    gradient: [
      { color: '#1E1A4A', location: 0 },
      { color: '#26215C', location: 1 },
    ],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  },
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
      <Text font={size} fontWeight="semibold" fontDesign="rounded" foregroundStyle={account.balance < 10 ? LOW : T1}>
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

function FlowCard(props: { label: string; flow: FlowPart; color: Pair; detail?: boolean }) {
  const { label, flow, color, detail } = props
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
      <Bar percent={p} color={color} height={detail ? 6 : 5} />
      {detail ? (
        <Text font={11} foregroundStyle={T3}>{`已用 ${formatFlow(flow.usedMB)} · 剩 ${Math.round(p)}%`}</Text>
      ) : null}
    </Card>
  )
}

/** 中号右下的小胶囊: 图标 + 标签 + 值 */
function Chip(props: { icon: string; color: Pair; label: string; value: string }) {
  return (
    <HStack
      spacing={4}
      padding={{ horizontal: 10, vertical: 5 }}
      frame={{ maxWidth: 'infinity' }}
      background={<RoundedRectangle cornerRadius={14} fill={CARD} />}
    >
      <Image systemName={props.icon} font={10} foregroundStyle={props.color} />
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
      widgetBackground={BG}
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
        {general ? <Bar percent={remainPercent(general)} color={GENERAL} height={6} /> : null}
        {targeted ? <Bar percent={remainPercent(targeted)} color={TARGETED} height={6} /> : null}
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
      widgetBackground={BG}
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
        {account.general ? <FlowCard label="通用" flow={account.general} color={GENERAL} /> : null}
        {account.targeted ? <FlowCard label="定向" flow={account.targeted} color={TARGETED} /> : null}
        <HStack spacing={6}>
          <Chip icon="phone.fill" color={VOICE} label="语音" value={voiceText(account)} />
          <Chip icon="star.fill" color={POINTS} label="积分" value={pointsText(account)} />
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
      widgetBackground={BG}
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
        {account.general ? <FlowCard label="通用流量" flow={account.general} color={GENERAL} detail /> : null}
        {account.targeted ? <FlowCard label="定向流量" flow={account.targeted} color={TARGETED} detail /> : null}
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
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={BG}>
      <Image systemName="exclamationmark.triangle.fill" font={22} foregroundStyle={VOICE} />
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
