// checkin / styles/index.tsx
// 样式目录: 每种样式声明自己支持的尺寸, 只在这些尺寸出现; 小组件和 App 内预览共用 renderStyle

import { select, type Snapshot } from '../api'
import { makeTheme, type Ctx, type Size } from '../ui'
import { getDefaults, BUILTIN_DEFAULTS, type Family, type Look } from '../settings'
import type { Day } from '../history'
import { ListStyle, RingStyle, WalletStyle, WalletLockRect, BigStyle, BigLockCircular, LockCircular, LockRect } from './basic'
import { IconWallStyle, TerminalStyle, TimelineStyle, ReceiptStyle, SpotlightStyle, WeatherStyle } from './fun'
import { CategoryStyle, MetroStyle, AuthorStyle, BubbleStyle } from './board'
import { CalendarStyle, EarningsStyle, HeatmapStyle, QuestStyle, GoalStyle, BadgeStyle, HealthStyle, CompareStyle } from './history'
import { ExpiryStyle, PagerStyle } from './extra'

type View = (props: { ctx: Ctx }) => any

export type StyleDef = {
  id: string
  name: string
  desc: string
  icon: string
  views: Partial<Record<Family, View>>
}

export const STYLES: StyleDef[] = [
  { id: 'A', name: '列表', icon: 'list.bullet', desc: '状态、奖励、资产一行一个, 顶部计数和进度条', views: { systemMedium: ListStyle, systemLarge: ListStyle } },
  { id: 'B', name: '环形', icon: 'circle.dashed', desc: '今日完成度圆环, 中号带资产', views: { systemSmall: RingStyle, systemMedium: RingStyle } },
  { id: 'C', name: '打卡日历', icon: 'calendar', desc: '当月每天的成功率和连签天数', views: { systemSmall: CalendarStyle, systemMedium: CalendarStyle, systemLarge: CalendarStyle } },
  { id: 'D', name: '图标墙', icon: 'square.grid.3x3.fill', desc: 'App 图标网格, 有问题的描边; 小号只放有问题的', views: { systemSmall: IconWallStyle, systemMedium: IconWallStyle, systemLarge: IconWallStyle } },
  { id: 'E', name: '资产钱包', icon: 'wallet.pass.fill', desc: '只看资产, 带较昨天变化', views: { systemSmall: WalletStyle, systemMedium: WalletStyle, systemLarge: WalletStyle, accessoryRectangular: WalletLockRect } },
  { id: 'F', name: '终端日志', icon: 'terminal.fill', desc: '等宽字逐行 ✓ ✗ !', views: { systemMedium: TerminalStyle, systemLarge: TerminalStyle } },
  { id: 'G', name: '时间线', icon: 'clock.fill', desc: '按签到时间排列', views: { systemMedium: TimelineStyle, systemLarge: TimelineStyle } },
  { id: 'H', name: '收益统计', icon: 'chart.bar.fill', desc: '本月累计奖励和每天柱状图', views: { systemSmall: EarningsStyle, systemMedium: EarningsStyle, systemLarge: EarningsStyle } },
  { id: 'I', name: '完成度', icon: 'lock.fill', desc: '锁屏: 圆形完成度 / 长条摘要', views: { accessoryCircular: LockCircular, accessoryRectangular: LockRect } },
  { id: 'J', name: '热力图', icon: 'square.grid.4x3.fill', desc: '每个脚本每天一格, 看谁老出问题', views: { systemMedium: HeatmapStyle, systemLarge: HeatmapStyle } },
  { id: 'K', name: '每日任务', icon: 'gamecontroller.fill', desc: '等级经验和今日任务', views: { systemMedium: QuestStyle, systemLarge: QuestStyle } },
  { id: 'L', name: '签到小票', icon: 'scroll.fill', desc: '虚线票据, 逐行奖励和合计', views: { systemMedium: ReceiptStyle, systemLarge: ReceiptStyle } },
  { id: 'M', name: '大字状态', icon: 'textformat.size', desc: '有问题整张变红显示数量, 全部正常变绿', views: { systemSmall: BigStyle, systemMedium: BigStyle, accessoryCircular: BigLockCircular } },
  { id: 'N', name: '兑换目标', icon: 'target', desc: '资产离目标还差多少、还要几天', views: { systemSmall: GoalStyle, systemMedium: GoalStyle, systemLarge: GoalStyle } },
  { id: 'O', name: '分类看板', icon: 'square.split.2x2.fill', desc: '商场、影音、社区、工具、生活各自完成数', views: { systemMedium: CategoryStyle, systemLarge: CategoryStyle } },
  { id: 'P', name: '聚光灯', icon: 'light.max', desc: '每次刷新轮换一个脚本', views: { systemSmall: SpotlightStyle, systemMedium: SpotlightStyle } },
  { id: 'Q', name: '交互翻页', icon: 'hand.tap.fill', desc: '小组件上点 ‹ › 翻页、⟳ 刷新', views: { systemMedium: PagerStyle, systemLarge: PagerStyle } },
  { id: 'R', name: '成就徽章', icon: 'rosette', desc: '连签、零失败周、累计千分', views: { systemSmall: BadgeStyle, systemMedium: BadgeStyle, systemLarge: BadgeStyle } },
  { id: 'S', name: '签到天气', icon: 'cloud.sun.fill', desc: '全成功晴, 有失败下雨, 重抓多雷暴', views: { systemSmall: WeatherStyle, systemMedium: WeatherStyle } },
  { id: 'U', name: '地铁线路', icon: 'tram.fill', desc: '今天的签到排成站, 出问题的是故障站', views: { systemMedium: MetroStyle, systemLarge: MetroStyle } },
  { id: 'V', name: '体检评分', icon: 'heart.text.square.fill', desc: '100 分起扣, 和昨天比', views: { systemSmall: HealthStyle, systemMedium: HealthStyle, systemLarge: HealthStyle } },
  { id: 'W', name: '环比对比', icon: 'arrow.left.arrow.right', desc: '今天比昨天、本周比上周', views: { systemSmall: CompareStyle, systemMedium: CompareStyle } },
  { id: 'X', name: '过期倒计时', icon: 'hourglass', desc: '凭证还有几天过期 (需要脚本提供)', views: { systemSmall: ExpiryStyle, systemMedium: ExpiryStyle, systemLarge: ExpiryStyle } },
  { id: 'Y', name: '作者生态墙', icon: 'person.3.fill', desc: '按脚本作者分组', views: { systemMedium: AuthorStyle, systemLarge: AuthorStyle } },
  { id: 'Z', name: '积分气泡', icon: 'circle.circle.fill', desc: '资产越多气泡越大', views: { systemMedium: BubbleStyle, systemLarge: BubbleStyle } },
]

/** 样式库「精选」: 每个尺寸做得最好的几个 */
export const FEATURED: Record<Family, string[]> = {
  systemSmall: ['B', 'M', 'E', 'C'],
  systemMedium: ['A', 'E', 'B', 'H'],
  systemLarge: ['A', 'C', 'D', 'J'],
  accessoryCircular: ['I', 'M'],
  accessoryRectangular: ['I', 'E'],
}

export const FAMILY_PREFIX: Record<Family, string> = {
  systemSmall: '小', systemMedium: '中', systemLarge: '大', accessoryCircular: '锁屏圆', accessoryRectangular: '锁屏条',
}

export const stylesFor = (f: Family) => STYLES.filter(s => s.views[f])
export const styleById = (id: string) => STYLES.find(s => s.id === id)
/** 桌面参数: 「中·钱包」 */
export const paramOf = (s: StyleDef, f: Family) => `${FAMILY_PREFIX[f]}·${s.name}`

/** 参数 → 样式; 认「中·钱包」「钱包」「E」; 不支持这个尺寸就用该尺寸的默认样式 */
export function resolveStyle(param: string | undefined, family: Family): StyleDef {
  const name = (param ?? '').trim().replace(/^(锁屏圆|锁屏条|锁屏|小|中|大)\s*[·.:：\-\s]\s*/, '')
  // 先精确匹配名字 / 字母, 再按包含匹配 (「钱包」→ 资产钱包), 只认支持这个尺寸的
  const ok = (s: StyleDef) => !!s.views[family]
  const hit = name
    ? STYLES.find(s => ok(s) && (s.name === name || s.id.toLowerCase() === name.toLowerCase())) ?? STYLES.find(s => ok(s) && s.name.includes(name))
    : undefined
  if (hit) return hit
  const def = styleById(getDefaults()[family])
  return def?.views[family] ? def : styleById(BUILTIN_DEFAULTS[family])!
}

export function renderStyle(
  style: StyleDef, snap: Snapshot, family: Family,
  opts: { inApp: boolean; spot: number; hist: Day[]; page: number; look: Look; keys: string[]; problemsFirst: boolean; goals: Record<string, number> },
) {
  const entries = select(snap.entries, opts.keys, opts.problemsFirst)
  const ctx: Ctx = {
    th: makeTheme(opts.look),
    size: (family === 'systemSmall' ? 's' : family === 'systemMedium' ? 'm' : 'l') as Size,
    entries,
    snap,
    inApp: opts.inApp,
    spot: opts.spot,
    hist: opts.hist,
    keys: new Set(entries.map(e => e.key)),
    goals: opts.goals,
    page: opts.page,
  }
  const View = style.views[family] ?? styleById(BUILTIN_DEFAULTS[family])!.views[family]!
  return <View ctx={ctx} />
}
