// loon-panel / styles/index.tsx
// 样式目录: 每种样式声明自己支持的尺寸, 只在这些尺寸出现; 小组件和 App 内预览共用 renderStyle

import { makeTheme, type Ctx, type Size } from '../ui'
import { getDefaults, BUILTIN_DEFAULTS, type Family, type Look, type Prefs } from '../settings'
import type { LoonData } from '../loon'
import { overview, type LocalEvent, type SubView } from '../subs'
import type { Nat } from '../net'
import { RingStyle, TrendStyle, LockCircular, LockRect, LockInline } from './usage'
import { NodeStyle, HealthStyle } from './node'
import { BoardStyle } from './board'
import { TodayStyle, BudgetStyle, MultiSmall, MultiMedium, CountdownStyle, CompareStyle, HoursStyle, ValueStyle, MonthStyle } from './flow'
import { UnlockSmall, UnlockMedium, PickerStyle, ModeStyle, IpStyle, SafetyStyle, RankStyle, ConsoleStyle, GroupsStyle, EventsStyle, OverviewStyle, OverviewSmall, TrafficStyle, TrafficSmall, PingStyle, NodesStyle, ReportStyle, LockLatency, LockToday, LockPing } from './net'

type View = (props: { ctx: Ctx }) => any

export type StyleDef = {
  id: string
  name: string
  desc: string
  icon: string
  views: Partial<Record<Family, View>>
}

export const STYLES: StyleDef[] = [
  { id: 'AF', name: '网络总览', icon: 'rectangle.split.2x1.fill', desc: '延迟、可用率、节点和出口; 中号还有常用策略组, 点右上角换模式', views: { systemSmall: OverviewSmall, systemMedium: OverviewStyle } },
  { id: 'AG', name: '流量总览', icon: 'chart.bar.xaxis', desc: '剩余流量、今天用量、到期和延迟; 中号还有常用策略组, 点右上角换模式', views: { systemSmall: TrafficSmall, systemMedium: TrafficStyle } },
  { id: 'A', name: '用量环', icon: 'chart.pie.fill', desc: '主订阅已用比例、剩余流量、每天可用额度和预测', views: { systemSmall: RingStyle } },
  { id: 'B', name: '当前节点', icon: 'antenna.radiowaves.left.and.right', desc: '主策略组正在用的节点、延迟折线、可用率和解锁', views: { systemSmall: NodeStyle } },
  { id: 'G', name: '今日流量', icon: 'arrow.up.arrow.down', desc: '全部机场今天合计、近 1 小时速度和每小时用量', views: { systemSmall: TodayStyle } },
  { id: 'H', name: '每日额度', icon: 'gauge.with.needle', desc: '今天用的和今天该用的比, 超了告诉你明天要省到多少', views: { systemSmall: BudgetStyle } },
  { id: 'I', name: '多机场', icon: 'square.stack.3d.up.fill', desc: '各机场剩余、今天用量和预测, 谁先用完', views: { systemSmall: MultiSmall, systemMedium: MultiMedium } },
  { id: 'J', name: '倒计时', icon: 'calendar', desc: '离到期或重置还有几天, 流量撑不撑得到', views: { systemSmall: CountdownStyle } },
  { id: 'K', name: '解锁', icon: 'lock.open.fill', desc: '流媒体和 AI 服务的解锁情况', views: { systemSmall: UnlockSmall, systemMedium: UnlockMedium } },
  { id: 'L', name: '模式开关', icon: 'slider.horizontal.3', desc: '点一下切直连、分流、全局', views: { systemSmall: ModeStyle } },
  { id: 'M', name: 'IP 质量', icon: 'checkmark.shield.fill', desc: '出口 IP、类型和各来源的风险标记', views: { systemSmall: IpStyle } },
  { id: 'N', name: '网络安全', icon: 'lock.shield.fill', desc: 'NAT 类型、DNS 泄漏、IP 黑名单', views: { systemSmall: SafetyStyle } },
  { id: 'O', name: '环比', icon: 'arrow.left.arrow.right', desc: '今天比昨天多用还是少用', views: { systemSmall: CompareStyle } },
  { id: 'C', name: '用量趋势', icon: 'chart.bar.fill', desc: '主订阅用量、上下行、预测和近 14 天每天用了多少', views: { systemMedium: TrendStyle } },
  { id: 'D', name: '节点体检', icon: 'stethoscope', desc: '节点延迟折线和可用率, 在用的排前面', views: { systemMedium: HealthStyle } },
  { id: 'Q', name: '今日时段', icon: 'clock.fill', desc: '今天每小时用了多少, 高峰在几点', views: { systemMedium: HoursStyle } },
  { id: 'S', name: '延迟排行', icon: 'trophy.fill', desc: '最快的 5 个节点, 点一行切过去', views: { systemMedium: RankStyle } },
  { id: 'T', name: '控制台', icon: 'slider.horizontal.below.rectangle', desc: '切模式、切最快、体检、更新订阅', views: { systemMedium: ConsoleStyle } },
  { id: 'U', name: '策略组卡片', icon: 'square.grid.2x2.fill', desc: '常用策略组的当前节点, 点卡片选节点, 可以翻页', views: { systemMedium: GroupsStyle } },
  { id: 'AE', name: '切换器', icon: 'arrow.triangle.swap', desc: '常用策略组的全部节点, 点哪个切哪个, 可以换组和翻页', views: { systemMedium: PickerStyle, systemLarge: PickerStyle } },
  { id: 'V', name: '事件时间线', icon: 'list.bullet.rectangle.fill', desc: '切网络、节点挂了、自动切换、用量提醒', views: { systemMedium: EventsStyle } },
  { id: 'W', name: '三网延迟', icon: 'point.3.connected.trianglepath.dotted', desc: '电信、联通、移动到出口的延迟、丢包和入站路径', views: { systemMedium: PingStyle } },
  { id: 'X', name: '性价比', icon: 'yensign.circle.fill', desc: '每 G 多少钱、剩余流量还值多少', views: { systemMedium: ValueStyle } },
  { id: 'E', name: '全景看板', icon: 'rectangle.3.group.fill', desc: '模式切换、多机场对比、策略组当前节点、解锁、出口', views: { systemLarge: BoardStyle } },
  { id: 'Y', name: '用量月报', icon: 'doc.text.below.ecg.fill', desc: '本月合计、日均、比上月和每天的热力日历', views: { systemLarge: MonthStyle } },
  { id: 'Z', name: '节点全景', icon: 'waveform.path.ecg', desc: '全部体检节点的可用格子、可用率和延迟', views: { systemLarge: NodesStyle } },
  { id: 'AA', name: '线路体检报告', icon: 'doc.text.magnifyingglass', desc: 'IP 质量、三网、回程、解锁、DNS、NAT 一页看完', views: { systemLarge: ReportStyle } },
  { id: 'F', name: '锁屏', icon: 'lock.fill', desc: '圆形: 主订阅已用; 长条: 剩余、预测、延迟; 单行: 剩余和延迟', views: { accessoryCircular: LockCircular, accessoryRectangular: LockRect, accessoryInline: LockInline } },
  { id: 'AB', name: '延迟', icon: 'speedometer', desc: '圆形: 当前节点延迟', views: { accessoryCircular: LockLatency } },
  { id: 'AC', name: '今日', icon: 'sun.max.fill', desc: '圆形: 今天用量和额度', views: { accessoryCircular: LockToday } },
  { id: 'AD', name: '三网', icon: 'point.3.connected.trianglepath.dotted', desc: '长条: 三网延迟', views: { accessoryRectangular: LockPing } },
]

export const FAMILY_PREFIX: Record<Family, string> = {
  systemSmall: '小', systemMedium: '中', systemLarge: '大', accessoryCircular: '锁屏圆', accessoryRectangular: '锁屏条', accessoryInline: '锁屏行',
}

export const stylesFor = (f: Family) => STYLES.filter(s => s.views[f])
export const styleById = (id: string) => STYLES.find(s => s.id === id)
/** 桌面参数: 「中·用量趋势」 */
export const paramOf = (s: StyleDef, f: Family) => `${FAMILY_PREFIX[f]}·${s.name}`

/** 参数 → 样式; 认「中·用量趋势」「趋势」「C」; 不支持这个尺寸就用该尺寸的默认样式 */
export function resolveStyle(param: string | undefined, family: Family): StyleDef {
  const name = (param ?? '').trim().replace(/^(锁屏圆|锁屏条|锁屏行|锁屏|小|中|大)\s*[·.:：\-\s]\s*/, '')
  const ok = (s: StyleDef) => !!s.views[family]
  const hit = name
    ? STYLES.find(s => ok(s) && (s.name === name || s.id.toLowerCase() === name.toLowerCase())) ?? STYLES.find(s => ok(s) && s.name.includes(name))
    : undefined
  if (hit) return hit
  const def = styleById(getDefaults()[family])
  return def?.views[family] ? def : styleById(BUILTIN_DEFAULTS[family])!
}

/** 用到机场用量的样式 */
export const TRAFFIC_STYLES = ['A', 'G', 'H', 'I', 'J', 'O', 'C', 'Q', 'X', 'E', 'Y', 'F', 'AC', 'AG']
/** 没有机场就没内容的样式, 样式库里排到后面并标注; 全景看板会按有没有机场变化 */
export const NEEDS_SUBS = TRAFFIC_STYLES.filter(id => !['E', 'F'].includes(id))
export function renderStyle(
  style: StyleDef, family: Family,
  opts: { inApp: boolean; loon: LoonData | null; loonErr: string; subs: SubView[]; look: Look; prefs: Prefs; nat: Nat | null; local: LocalEvent[] },
) {
  const ctx: Ctx = {
    th: makeTheme(opts.look),
    size: (family === 'systemSmall' ? 's' : family === 'systemMedium' ? 'm' : 'l') as Size,
    inApp: opts.inApp,
    loon: opts.loon,
    loonErr: opts.loonErr,
    subs: opts.subs,
    all: overview(opts.subs),
    prefs: opts.prefs,
    nat: opts.nat,
    events: [...(opts.loon?.events ?? []), ...opts.local].sort((a, b) => b.t - a.t),
  }
  const View = style.views[family] ?? styleById(BUILTIN_DEFAULTS[family])!.views[family]!
  return <View ctx={ctx} />
}
