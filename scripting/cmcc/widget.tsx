// cmcc / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 每次刷新自动续登
// Small: 话费 + 流量 / Medium: + 本月消费 / 积分 / Large: + 星级 / 品牌 / 归属 / 网龄

import {
  VStack,
  HStack,
  Text,
  Spacer,
  Image,
  Widget,
  Capsule,
} from 'scripting'
import type { Color } from 'scripting'

import { loadAccount, formatFlow, type Account, type FlowPart, CmccError } from './api'

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────
const BRAND: Color = '#0085D0'
const REFRESH_MS = 30 * 60 * 1000   // 请求 30 分钟后刷新, 实际由系统决定

function statusColor(p: number): Color {
  if (p >= 80) return '#ff453a'
  if (p >= 50) return '#ff9f0a'
  return '#30d158'
}

function usedPercent(f: FlowPart): number {
  return f.totalMB > 0 ? (f.usedMB / f.totalMB) * 100 : 0
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
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
function Header(props: { account: Account; subtitle?: string }) {
  const { account, subtitle } = props
  return (
    <HStack spacing={4}>
      <Image systemName="antenna.radiowaves.left.and.right" font={11} foregroundStyle={BRAND} />
      <Text font={11} fontWeight="semibold" foregroundStyle="label">中国移动</Text>
      {subtitle ? <Text font={10} foregroundStyle="secondaryLabel">{subtitle}</Text> : null}
      <Spacer />
      <Text font={10} foregroundStyle="secondaryLabel">
        {account.stale ? `⚠ ${formatTime(account.fetchedAt)}` : formatTime(account.fetchedAt)}
      </Text>
    </HStack>
  )
}

function Balance(props: { account: Account; size: number }) {
  const { account, size } = props
  return (
    <VStack alignment="leading" spacing={0}>
      <Text font={10} foregroundStyle="secondaryLabel">话费余额</Text>
      <Text font={size} fontWeight="bold" fontDesign="rounded" foregroundStyle={account.balance < 10 ? '#ff453a' : 'label'}>
        {`¥${account.balance.toFixed(2)}`}
      </Text>
    </VStack>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <Text font={10} foregroundStyle="secondaryLabel">{props.label}</Text>
      <Text font={14} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label">{props.value}</Text>
    </VStack>
  )
}

function FlowRow(props: { label: string; flow: FlowPart }) {
  const { label, flow } = props
  const p = usedPercent(flow)
  return (
    <VStack alignment="leading" spacing={3}>
      <HStack spacing={4}>
        <Text font={10} foregroundStyle="secondaryLabel">{label}</Text>
        <Spacer />
        <Text font={11} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label">
          {`剩 ${formatFlow(flow.remainMB)}`}
        </Text>
        <Text font={9} foregroundStyle="secondaryLabel">{`/ ${formatFlow(flow.totalMB)}`}</Text>
      </HStack>
      <Bar percent={p} color={statusColor(p)} height={5} />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Small — 话费 + 两条流量
// ─────────────────────────────────────────────────────────────
function SmallView(props: { account: Account }) {
  const { account } = props
  return (
    <VStack alignment="leading" spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Header account={account} />
      <Balance account={account} size={22} />
      <Spacer />
      {account.general ? <FlowRow label="通用" flow={account.general} /> : null}
      {account.targeted ? <FlowRow label="定向" flow={account.targeted} /> : null}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Medium — 左: 话费 / 积分, 右: 流量
// ─────────────────────────────────────────────────────────────
function MediumView(props: { account: Account }) {
  const { account } = props
  return (
    <VStack alignment="leading" spacing={8} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Header account={account} subtitle={`尾号 ${account.phoneTail}`} />
      <HStack spacing={16}>
        <VStack alignment="leading" spacing={6}>
          <Balance account={account} size={26} />
          {account.monthFee !== undefined ? (
            <Text font={10} foregroundStyle="secondaryLabel">{`本月消费 ¥${account.monthFee.toFixed(2)}`}</Text>
          ) : null}
          {account.points !== undefined ? (
            <Text font={10} foregroundStyle="secondaryLabel">{`积分 ${account.points}`}</Text>
          ) : null}
        </VStack>
        <VStack spacing={10} frame={{ maxWidth: 'infinity' }}>
          {account.general ? <FlowRow label="通用流量" flow={account.general} /> : null}
          {account.targeted ? <FlowRow label="定向流量" flow={account.targeted} /> : null}
        </VStack>
      </HStack>
      <Spacer />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Large — 归属 / 品牌 + 话费 / 本月消费 + 流量 + 账号信息
// ─────────────────────────────────────────────────────────────
function LargeView(props: { account: Account }) {
  const { account } = props
  const u = account.user
  const subtitle = [u?.channel, u?.brand, `尾号 ${account.phoneTail}`].filter(Boolean).join(' · ')
  return (
    <VStack alignment="leading" spacing={14} padding={16} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Header account={account} subtitle={subtitle} />
      <HStack alignment="bottom" spacing={16}>
        <Balance account={account} size={34} />
        <Spacer />
        {account.monthFee !== undefined ? (
          <VStack alignment="trailing" spacing={0}>
            <Text font={10} foregroundStyle="secondaryLabel">本月消费</Text>
            <Text font={18} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label">
              {`¥${account.monthFee.toFixed(2)}`}
            </Text>
          </VStack>
        ) : null}
      </HStack>
      <VStack spacing={12}>
        {account.general ? <FlowRow label="通用流量" flow={account.general} /> : null}
        {account.targeted ? <FlowRow label="定向流量" flow={account.targeted} /> : null}
      </VStack>
      <Spacer />
      <HStack spacing={8}>
        <Stat label="积分" value={account.points !== undefined ? String(account.points) : '-'} />
        <Stat label="星级" value={u?.starLevel !== undefined ? '★'.repeat(u.starLevel) || '0' : '-'} />
        <Stat label="星级积分" value={u?.starScore !== undefined ? String(u.starScore) : '-'} />
        <Stat label="网龄" value={u?.netAge ?? '-'} />
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Bar — Capsule + LinearGradient 硬停点进度条 (同 claude-quota)
// ─────────────────────────────────────────────────────────────
function Bar(props: { percent: number; color: Color; height: number }) {
  const { percent, color, height } = props
  const p = Math.max(0.005, Math.min(0.995, percent / 100))
  return (
    <Capsule
      fill={{
        stops: [
          { color: color, location: 0 },
          { color: color, location: p },
          { color: '#E5E5EA', location: p },
          { color: '#E5E5EA', location: 1 },
        ],
        startPoint: 'leading',
        endPoint: 'trailing',
      }}
      frame={{ maxWidth: 'infinity', height }}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// ErrorView
// ─────────────────────────────────────────────────────────────
function ErrorView(props: { error: Error | null }) {
  const msg = classifyError(props.error)
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Image systemName="exclamationmark.triangle.fill" font={22} foregroundStyle="systemOrange" />
      <Text font={12} fontWeight="semibold" foregroundStyle="label">{msg.title}</Text>
      <Text font={10} foregroundStyle="secondaryLabel" multilineTextAlignment="center">{msg.hint}</Text>
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
