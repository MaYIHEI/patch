// claude-quota / widget.tsx
// 运行环境: Scripting (https://scripting.fun)

import {
  VStack,
  HStack,
  ZStack,
  Text,
  Spacer,
  Image,
  Widget,
  Capsule,
  Circle,
  RoundedRectangle,
} from 'scripting'
import type { Color, VirtualNode } from 'scripting'

import {
  loadQuota, loadOrgInfo, loadRecentModel, readHistory,
  type Quota, type QuotaSegment, type OrgInfo, type DailySnapshot,
  QuotaError,
} from './api'

// ─────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────
const BRAND: Color = '#D4845A'
const CLAUDE_ICON_URL = 'https://claude.ai/apple-touch-icon.png'

function ClaudeIcon(props: { size: number }) {
  const { size } = props
  return (
    <Image
      imageUrl={CLAUDE_ICON_URL}
      resizable
      frame={{ width: size, height: size }}
      clipShape="circle"
    />
  )
}

function statusColor(p: number): Color {
  if (p >= 80) return '#ff453a'
  if (p >= 50) return '#ff9f0a'
  return '#30d158'
}

// ─────────────────────────────────────────────────────────────
// Plan 识别
// ─────────────────────────────────────────────────────────────
type PlanInfo = { label: string; color: Color }

function resolvePlan(quota: Quota, org: OrgInfo | null): PlanInfo {
  const tier = org?.planTier?.toLowerCase() ?? ''
  if (tier.includes('max_20'))    return { label: 'Max 20', color: '#BF5AF2' }
  if (tier.includes('max'))       return { label: 'Max',    color: '#BF5AF2' }
  if (tier.includes('pro'))       return { label: 'Pro',    color: '#0A84FF' }
  if (tier.includes('team'))      return { label: 'Team',   color: '#34C759' }
  if (tier.includes('enterprise')) return { label: 'Ent',   color: '#FF9F0A' }
  if (quota.sevenDayOpus)  return { label: 'Max', color: '#BF5AF2' }
  if (quota.sevenDay)      return { label: 'Pro', color: '#0A84FF' }
  return { label: 'Free', color: '#8E8E93' }
}

// ─────────────────────────────────────────────────────────────
// 时间格式化
// ─────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

function formatAbsoluteReset(epochMs: number): string {
  const d = new Date(epochMs)
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return hm
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `明天 ${hm}`
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

/** ↻ HH:MM 格式的数据拉取时间 */
function fetchTimeStr(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `↻ ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────
async function main() {
  const history = readHistory()
  let quota: Quota | null = null
  let orgInfo: OrgInfo | null = null
  let recentModel: string | null = null
  let lastError: Error | null = null
  try {
    ;[quota, orgInfo, recentModel] = await Promise.all([
      loadQuota(),
      loadOrgInfo().catch(() => null),
      loadRecentModel().catch(() => null),
    ])
  } catch (e) {
    lastError = e as Error
  }
  Widget.present(
    <WidgetRoot
      quota={quota} org={orgInfo} model={recentModel}
      history={history} error={lastError} family={Widget.family}
    />
  )
  Widget.reloadAll()
}

function WidgetRoot(props: {
  quota: Quota | null; org: OrgInfo | null; model: string | null
  history: DailySnapshot[]; error: Error | null; family: string
}) {
  const { quota, org, model, history, error, family } = props
  if (error || !quota) return <ErrorView error={error} />
  if (family === 'systemSmall')      return <SmallView quota={quota} model={model} org={org} />
  if (family === 'systemLarge')      return <LargeView quota={quota} org={org} model={model} history={history} />
  if (family === 'systemExtraLarge') return <ExtraLargeView quota={quota} org={org} model={model} history={history} />
  return <MediumView quota={quota} org={org} model={model} history={history} />
}

// ─────────────────────────────────────────────────────────────
// Small — 两行 header + 环形图
// ─────────────────────────────────────────────────────────────
function SmallView(props: { quota: Quota; model: string | null; org: OrgInfo | null }) {
  const { quota, model, org } = props
  const fiveH = quota.fiveHour
  const pct = Math.round(fiveH.percent)
  const color = statusColor(fiveH.percent)
  const plan = resolvePlan(quota, org)
  const scale = Math.max(0.02, Math.min(1.0, fiveH.percent / 100))

  return (
    <VStack
      spacing={0}
      padding={{ leading: 12, trailing: 12, top: 11, bottom: 12 }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetURL="claude://"
    >
      {/* 第一行: logo + 名字 + 刷新时间 */}
      <HStack spacing={5}>
        <ClaudeIcon size={14} />
        <Text font={12} fontWeight="semibold" foregroundStyle="label">Claude</Text>
        <Spacer />
        <Text font={10} foregroundStyle="secondaryLabel">{fetchTimeStr(quota.fetchedAt)}</Text>
      </HStack>

      {/* 第二行: plan + model 徽章 */}
      <HStack spacing={4} padding={{ top: 2 }}>
        <PlanBadge plan={plan} />
        {!!model && <ModelBadge model={model} />}
        <Spacer />
        {!!quota.stale && <Text font={10} foregroundStyle="systemOrange">⚠</Text>}
      </HStack>

      <Spacer />

      {/* 环形进度图 */}
      <ZStack frame={{ width: 78, height: 78 }}>
        {/* 背景轨道 */}
        <Circle
          stroke={{ shapeStyle: '#E5E5EA', strokeStyle: { lineWidth: 7 } }}
          frame={{ width: 78, height: 78 }}
        />
        {/* 进度弧 */}
        <Circle
          trim={{ from: 0, to: scale }}
          stroke={{ shapeStyle: color, strokeStyle: { lineWidth: 7, lineCap: 'round' } }}
          frame={{ width: 78, height: 78 }}
        />
        {/* 中心文字 */}
        <VStack spacing={0}>
          <Text font={22} fontWeight="bold" fontDesign="rounded" foregroundStyle={color}>
            {`${pct}%`}
          </Text>
          <Text font={8} fontWeight="semibold" foregroundStyle="secondaryLabel">
            5-HOUR
          </Text>
        </VStack>
      </ZStack>

      <Spacer />

      {/* 重置时间 */}
      <HStack frame={{ maxWidth: 'infinity' }}>
        <Text font={10} foregroundStyle="secondaryLabel">
          {`↻ ${formatDuration(fiveH.resetsInMs)}`}
        </Text>
        <Spacer />
        <Text font={10} foregroundStyle="secondaryLabel">
          {formatAbsoluteReset(fiveH.resetsAt)}
        </Text>
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Medium — 左 5h / 右 7d + 每日柱状图
// ─────────────────────────────────────────────────────────────
function MediumView(props: {
  quota: Quota; org: OrgInfo | null; model: string | null; history: DailySnapshot[]
}) {
  const { quota, org, model, history } = props
  const fiveH = quota.fiveHour
  const pct = Math.round(fiveH.percent)
  const color = statusColor(fiveH.percent)
  const plan = resolvePlan(quota, org)

  const rightSegs = [
    quota.sevenDay     ? { label: '7D',     seg: quota.sevenDay }     : null,
    quota.sevenDayOpus ? { label: 'OPUS',   seg: quota.sevenDayOpus } : null,
    quota.sevenDaySonnet ? { label: 'SONNET', seg: quota.sevenDaySonnet } : null,
  ].filter(Boolean) as Array<{ label: string; seg: QuotaSegment }>

  const hasRight = rightSegs.length > 0
  const rightBig = rightSegs.length === 1

  return (
    <VStack
      spacing={0}
      padding={{ leading: 14, trailing: 14, top: 12, bottom: 12 }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetURL="claude://"
    >
      {/* 标题行 */}
      <HStack spacing={5}>
        <ClaudeIcon size={14} />
        <Text font={13} fontWeight="semibold" foregroundStyle="label">Claude</Text>
        <PlanBadge plan={plan} />
        {!!model && <ModelBadge model={model} />}
        <Spacer />
        {!!quota.stale && <Text font={10} foregroundStyle="systemOrange" padding={{ trailing: 3 }}>⚠</Text>}
        <Text font={11} foregroundStyle="secondaryLabel">{fetchTimeStr(quota.fetchedAt)}</Text>
      </HStack>

      <Spacer />

      <HStack spacing={12} frame={{ maxWidth: 'infinity' }}>
        {/* 左栏: 5h — label / Spacer / 大数字居中 / Spacer / bar / reset */}
        <VStack spacing={4} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'center' }}>
          <Text font={10} fontWeight="semibold" foregroundStyle="secondaryLabel">5-HOUR</Text>
          <Spacer />
          <Text font={36} fontWeight="bold" fontDesign="rounded" foregroundStyle={color}>
            {`${pct}%`}
          </Text>
          <Spacer />
          <Bar percent={fiveH.percent} color={color} height={4} />
          <HStack frame={{ maxWidth: 'infinity' }}>
            <Text font={10} foregroundStyle="secondaryLabel">
              {`↻ ${formatDuration(fiveH.resetsInMs)}`}
            </Text>
            <Spacer />
            <Text font={10} foregroundStyle="secondaryLabel">
              {formatAbsoluteReset(fiveH.resetsAt)}
            </Text>
          </HStack>
        </VStack>

        {hasRight && (
          <VStack frame={{ width: 1, maxHeight: 'infinity' }} background="separator" />
        )}

        {/* 右栏: 1 项 → [label + 小百分比] 同行 / Spacer / WeekBars / Spacer / bar / reset
            顶行与左栏 5-HOUR 同高, 底部 Bar+reset 与左栏齐 */}
        {hasRight && rightBig && (
          <VStack spacing={4} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }}>
            {/* alignment="top" 让 7D 标签顶对齐, 跟左栏 5-HOUR 同行 */}
            <HStack alignment="top" frame={{ maxWidth: 'infinity' }}>
              <Text font={10} fontWeight="semibold" foregroundStyle="secondaryLabel">
                {rightSegs[0].label}
              </Text>
              <Spacer />
              <Text
                font={20}
                fontWeight="bold"
                fontDesign="rounded"
                foregroundStyle={statusColor(rightSegs[0].seg.percent)}
              >
                {`${Math.round(rightSegs[0].seg.percent)}%`}
                {rightSegs[0].seg.percent >= 80 ? ' ⚠' : ''}
              </Text>
            </HStack>
            <Spacer />
            <WeekBars history={history} currentPct={rightSegs[0].seg.percent} />
            <Spacer />
            <Bar percent={rightSegs[0].seg.percent} color={statusColor(rightSegs[0].seg.percent)} height={4} />
            <HStack frame={{ maxWidth: 'infinity' }}>
              <Text font={10} foregroundStyle="secondaryLabel">
                {`↻ ${formatDuration(rightSegs[0].seg.resetsInMs)}`}
              </Text>
              <Spacer />
              <Text font={10} foregroundStyle="secondaryLabel">
                {formatAbsoluteReset(rightSegs[0].seg.resetsAt)}
              </Text>
            </HStack>
          </VStack>
        )}

        {/* 右栏: 2+ 项 → MiniRow 紧凑 */}
        {hasRight && !rightBig && (
          <VStack spacing={8} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            {!!quota.sevenDay && (
              <MiniRow label="7D" seg={quota.sevenDay} />
            )}
            {!!quota.sevenDayOpus && (
              <MiniRow label="OPUS" seg={quota.sevenDayOpus} />
            )}
            {!!quota.sevenDaySonnet && (
              <MiniRow label="SONNET" seg={quota.sevenDaySonnet} />
            )}
          </VStack>
        )}
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// Large — 全部配额纵向排列 + 7D 每日柱
// ─────────────────────────────────────────────────────────────
function LargeView(props: {
  quota: Quota; org: OrgInfo | null; model: string | null; history: DailySnapshot[]
}) {
  const { quota, org, model, history } = props
  const plan = resolvePlan(quota, org)

  const sectionCount = 1
    + (quota.sevenDay ? 1 : 0)
    + (quota.sevenDayOpus ? 1 : 0)
    + (quota.sevenDaySonnet ? 1 : 0)
  const fontSize  = sectionCount <= 2 ? 52 : 32
  const barHeight = sectionCount <= 2 ? 10 : 6

  return (
    <VStack
      spacing={0}
      padding={{ leading: 16, trailing: 16, top: 14, bottom: 14 }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetURL="claude://"
    >
      {/* 标题 */}
      <HStack spacing={6}>
        <ClaudeIcon size={16} />
        <Text font={14} fontWeight="semibold" foregroundStyle="label">Claude</Text>
        <PlanBadge plan={plan} />
        {!!model && <ModelBadge model={model} />}
        <Spacer />
        {!!quota.stale && <Text font={10} foregroundStyle="systemOrange" padding={{ trailing: 4 }}>⚠</Text>}
        <Text font={11} foregroundStyle="secondaryLabel">{fetchTimeStr(quota.fetchedAt)}</Text>
      </HStack>

      {/* 5-HOUR */}
      <Spacer />
      <SectionRow label="5-HOUR" seg={quota.fiveHour} fontSize={fontSize} barHeight={barHeight} />
      <Spacer />

      {/* 7-DAY */}
      {!!quota.sevenDay && (
        <>
          <HStack frame={{ maxWidth: 'infinity', height: 1 }} background="separator" />
          <Spacer />
          <SectionRow label="7-DAY" seg={quota.sevenDay} fontSize={fontSize} barHeight={barHeight}>
            <WeekBars history={history} currentPct={quota.sevenDay.percent} compact />
            <BurnRate seg={quota.sevenDay} />
          </SectionRow>
          <Spacer />
        </>
      )}

      {/* OPUS */}
      {!!quota.sevenDayOpus && (
        <>
          <HStack frame={{ maxWidth: 'infinity', height: 1 }} background="separator" />
          <Spacer />
          <SectionRow label="OPUS" seg={quota.sevenDayOpus} fontSize={fontSize} barHeight={barHeight} />
          <Spacer />
        </>
      )}

      {/* SONNET */}
      {!!quota.sevenDaySonnet && (
        <>
          <HStack frame={{ maxWidth: 'infinity', height: 1 }} background="separator" />
          <Spacer />
          <SectionRow label="SONNET" seg={quota.sevenDaySonnet} fontSize={fontSize} barHeight={barHeight} />
          <Spacer />
        </>
      )}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// ExtraLarge (iPad)
// ─────────────────────────────────────────────────────────────
function ExtraLargeView(props: {
  quota: Quota; org: OrgInfo | null; model: string | null; history: DailySnapshot[]
}) {
  const { quota, org, model, history } = props
  const fiveH = quota.fiveHour
  const pct = Math.round(fiveH.percent)
  const color = statusColor(fiveH.percent)
  const plan = resolvePlan(quota, org)
  const hasRight = !!(quota.sevenDay || quota.sevenDayOpus || quota.sevenDaySonnet)

  return (
    <VStack
      spacing={0}
      padding={{ leading: 20, trailing: 20, top: 16, bottom: 16 }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetURL="claude://"
    >
      <HStack spacing={6}>
        <ClaudeIcon size={16} />
        <Text font={15} fontWeight="semibold" foregroundStyle="label">Claude</Text>
        <PlanBadge plan={plan} />
        {!!model && <ModelBadge model={model} />}
        <Spacer />
        {!!quota.stale && <Text font={11} foregroundStyle="systemOrange" padding={{ trailing: 6 }}>⚠</Text>}
        <Text font={12} foregroundStyle="secondaryLabel">{fetchTimeStr(quota.fetchedAt)}</Text>
      </HStack>

      <Spacer />

      <HStack spacing={20} frame={{ maxWidth: 'infinity' }}>
        <VStack spacing={6} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
          <Text font={11} fontWeight="semibold" foregroundStyle="secondaryLabel">5-HOUR</Text>
          <Text font={60} fontWeight="bold" fontDesign="rounded" foregroundStyle={color}>
            {`${pct}%`}
          </Text>
          <Bar percent={fiveH.percent} color={color} height={6} />
          <HStack frame={{ maxWidth: 'infinity' }}>
            <Text font={11} foregroundStyle="secondaryLabel">{`↻ ${formatDuration(fiveH.resetsInMs)}`}</Text>
            <Spacer />
            <Text font={11} foregroundStyle="secondaryLabel">{formatAbsoluteReset(fiveH.resetsAt)}</Text>
          </HStack>
        </VStack>

        {hasRight && (
          <VStack frame={{ width: 1, maxHeight: 'infinity' }} background="separator" />
        )}

        {hasRight && (
          <VStack spacing={0} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <Spacer />
            {!!quota.sevenDay && (
              <>
                <SectionRow label="7-DAY" seg={quota.sevenDay} fontSize={30} barHeight={5}>
                  <WeekBars history={history} currentPct={quota.sevenDay.percent} compact />
                  <BurnRate seg={quota.sevenDay} />
                </SectionRow>
                <Spacer />
              </>
            )}
            {!!quota.sevenDayOpus && (
              <>
                <HStack frame={{ maxWidth: 'infinity', height: 1 }} background="separator" />
                <Spacer />
                <SectionRow label="OPUS" seg={quota.sevenDayOpus} fontSize={30} barHeight={5} />
                <Spacer />
              </>
            )}
            {!!quota.sevenDaySonnet && (
              <>
                <HStack frame={{ maxWidth: 'infinity', height: 1 }} background="separator" />
                <Spacer />
                <SectionRow label="SONNET" seg={quota.sevenDaySonnet} fontSize={30} barHeight={5} />
                <Spacer />
              </>
            )}
          </VStack>
        )}
      </HStack>
      <Spacer />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// SectionRow — 全宽配额行
// children 会渲染在进度条和 reset 行之间
// ─────────────────────────────────────────────────────────────
function SectionRow(props: {
  label: string; seg: QuotaSegment
  fontSize?: number; barHeight?: number
  children?: VirtualNode | VirtualNode[]
}) {
  const { label, seg, fontSize = 36, barHeight = 6, children } = props
  const pct = Math.round(seg.percent)
  const color = statusColor(seg.percent)

  return (
    <VStack spacing={5} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <HStack frame={{ maxWidth: 'infinity' }}>
        <Text font={11} fontWeight="semibold" foregroundStyle="secondaryLabel">{label}</Text>
        <Spacer />
        <Text font={fontSize} fontWeight="bold" fontDesign="rounded" foregroundStyle={color}>
          {`${pct}%`}
        </Text>
      </HStack>
      {!!children && children}
      <Bar percent={seg.percent} color={color} height={barHeight} />
      <HStack frame={{ maxWidth: 'infinity' }}>
        <Text font={10} foregroundStyle="secondaryLabel">{`↻ ${formatDuration(seg.resetsInMs)}`}</Text>
        <Spacer />
        <Text font={10} foregroundStyle="secondaryLabel">{formatAbsoluteReset(seg.resetsAt)}</Text>
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// MiniRow — Medium 右栏多项时的紧凑行
// ─────────────────────────────────────────────────────────────
function MiniRow(props: { label: string; seg: QuotaSegment }) {
  const { label, seg } = props
  const clamped = Math.max(0, Math.min(100, seg.percent))
  const color = statusColor(clamped)
  return (
    <VStack spacing={3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <HStack frame={{ maxWidth: 'infinity' }}>
        <Text font={10} fontWeight="semibold" foregroundStyle="secondaryLabel">{label}</Text>
        <Spacer />
        <Text font={15} fontWeight="bold" fontDesign="rounded" foregroundStyle={color}>
          {`${Math.round(clamped)}%`}
        </Text>
      </HStack>
      <Bar percent={clamped} color={color} height={4} />
      <HStack frame={{ maxWidth: 'infinity' }}>
        <Text font={10} foregroundStyle="secondaryLabel">{`↻ ${formatDuration(seg.resetsInMs)}`}</Text>
        <Spacer />
        <Text font={10} foregroundStyle="secondaryLabel">{formatAbsoluteReset(seg.resetsAt)}</Text>
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// WeekBars — 7 天每日柱状图
// compact=true 时柱高减半 (用于 Large 嵌入)
// ─────────────────────────────────────────────────────────────
function WeekBars(props: {
  history: DailySnapshot[]; currentPct: number; compact?: boolean
}) {
  const { history, currentPct, compact } = props
  const BAR_MAX = compact ? 14 : 20

  // 构建 7 天数据 (今天+过去6天)
  const slots: Array<{ val: number; label: string; isToday: boolean }> = []
  const DOW_LABELS = ['日', '一', '二', '三', '四', '五', '六']

  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const pad = (n: number) => n.toString().padStart(2, '0')
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const isToday = i === 0
    const snap = history.find(h => h.date === dateStr)
    const val = isToday ? currentPct : (snap?.sevenDayMax ?? 0)
    const label = isToday ? '今' : DOW_LABELS[d.getDay()]
    slots.push({ val, label, isToday })
  }

  // 构建柱子
  const bars: VirtualNode[] = []
  const labels: VirtualNode[] = []

  for (const slot of slots) {
    const h = slot.val > 0 ? Math.max(3, Math.round(slot.val / 100 * BAR_MAX)) : 2
    const color: Color =
      slot.val >= 80 ? '#ff453a' :
      slot.val >= 50 ? '#ff9f0a' :
      slot.val > 0   ? '#30d158' : '#E5E5EA'

    // 不套 VStack，直接用 HStack alignment="bottom" 底对齐
    bars.push(
      <RoundedRectangle
        fill={color}
        cornerRadius={2}
        frame={{ maxWidth: 'infinity', height: h }}
      />
    )

    labels.push(
      <Text
        font={compact ? 7 : 8}
        foregroundStyle={slot.isToday ? 'label' : 'tertiaryLabel'}
        frame={{ maxWidth: 'infinity' }}
        multilineTextAlignment="center"
      >
        {slot.label}
      </Text>
    )
  }

  return (
    <VStack spacing={2} frame={{ maxWidth: 'infinity' }}>
      <HStack spacing={3} alignment="bottom" frame={{ maxWidth: 'infinity', height: BAR_MAX }}>
        {bars}
      </HStack>
      <HStack spacing={3} frame={{ maxWidth: 'infinity' }}>
        {labels}
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// BurnRate — 7D 每天速率 + 超额预警
// ─────────────────────────────────────────────────────────────
function BurnRate(props: { seg: QuotaSegment }) {
  const { seg } = props
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const elapsedMs = WEEK_MS - Math.max(0, seg.resetsInMs)
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000)
  if (elapsedDays < 0.5) return null

  const daily = Math.round(seg.percent / elapsedDays)
  const warn = daily * 7 > 100

  return (
    <Text
      font={10}
      foregroundStyle={warn ? '#ff9f0a' : 'secondaryLabel'}
    >
      {warn ? `~${daily}%/天 ⚠ 预计超额` : `~${daily}%/天`}
    </Text>
  )
}

// ─────────────────────────────────────────────────────────────
// PlanBadge / ModelBadge
// ─────────────────────────────────────────────────────────────
function PlanBadge(props: { plan: PlanInfo }) {
  const { plan } = props
  return (
    <Text
      font={10} fontWeight="semibold" foregroundStyle="white"
      padding={{ horizontal: 6, vertical: 2 }}
      background={<Capsule fill={plan.color} />}
    >
      {plan.label}
    </Text>
  )
}

function ModelBadge(props: { model: string }) {
  const { model } = props
  const s = model.toLowerCase()
  const color: Color =
    s.includes('opus')  ? '#BF5AF2' :
    s.includes('haiku') ? '#0A84FF' : BRAND
  return (
    <Text
      font={10} fontWeight="medium" foregroundStyle={color}
      padding={{ horizontal: 5, vertical: 2 }}
      background={<Capsule stroke={color} />}
    >
      {model}
    </Text>
  )
}

// ─────────────────────────────────────────────────────────────
// Bar — Capsule + LinearGradient 硬停点进度条
// ─────────────────────────────────────────────────────────────
function Bar(props: { percent: number; color: Color; height: number }) {
  const { percent, color, height } = props
  const p = Math.max(0.005, Math.min(0.995, percent / 100))
  const h = Math.max(height, 4)
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
      frame={{ maxWidth: 'infinity', height: h }}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// ErrorView
// ─────────────────────────────────────────────────────────────
function ErrorView(props: { error: Error | null }) {
  const { error } = props
  const msg = classifyError(error)
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Image systemName="exclamationmark.triangle.fill" font={22} foregroundStyle="systemOrange" />
      <Text font={12} fontWeight="semibold" foregroundStyle="label">{msg.title}</Text>
      <Text font={10} foregroundStyle="secondaryLabel" multilineTextAlignment="center">{msg.hint}</Text>
    </VStack>
  )
}

function classifyError(err: Error | null): { title: string; hint: string } {
  if (!err) return { title: 'Unknown Error', hint: 'Open Scripting app to view logs' }
  if (err instanceof QuotaError) {
    if (err.kind === 'auth')      return { title: 'Cookie Expired',  hint: 'Open Scripting → run index.tsx to update cookie' }
    if (err.kind === 'network')   return { title: 'Network Error',   hint: 'Will retry automatically' }
    if (err.kind === 'schema')    return { title: 'API Changed',     hint: 'Check for script updates' }
    if (err.kind === 'no_cookie') return { title: 'Not Configured',  hint: 'Open Scripting → run index.tsx' }
  }
  return { title: 'Error', hint: err.message.slice(0, 60) }
}

main()
