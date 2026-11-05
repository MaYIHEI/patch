// loon-panel / styles/index.tsx
// 样式目录: 每种样式声明自己支持的尺寸, 只在这些尺寸出现; 小组件和 App 内预览共用 renderStyle

import { makeTheme, type Ctx, type Size } from '../ui'
import { getDefaults, BUILTIN_DEFAULTS, type Family, type Look, type Prefs } from '../settings'
import type { LoonData } from '../loon'
import type { SubView } from '../subs'
import { RingStyle, TrendStyle, LockCircular, LockRect } from './usage'
import { NodeStyle, HealthStyle } from './node'
import { BoardStyle } from './board'

type View = (props: { ctx: Ctx }) => any

export type StyleDef = {
  id: string
  name: string
  desc: string
  icon: string
  views: Partial<Record<Family, View>>
}

export const STYLES: StyleDef[] = [
  { id: 'A', name: '用量环', icon: 'chart.pie.fill', desc: '主订阅已用比例、剩余流量和预计用完日期', views: { systemSmall: RingStyle } },
  { id: 'B', name: '当前节点', icon: 'antenna.radiowaves.left.and.right', desc: '主策略组正在用的节点、延迟和出口', views: { systemSmall: NodeStyle } },
  { id: 'C', name: '用量趋势', icon: 'chart.bar.fill', desc: '主订阅用量、预测和近 14 天每天用了多少', views: { systemMedium: TrendStyle } },
  { id: 'D', name: '节点体检', icon: 'stethoscope', desc: '体检过的节点延迟、出口运营商, 在用的排前面', views: { systemMedium: HealthStyle } },
  { id: 'E', name: '全景看板', icon: 'rectangle.3.group.fill', desc: '模式切换、多机场对比、策略组当前节点 (点一下切到最快)、出口信息', views: { systemLarge: BoardStyle } },
  { id: 'F', name: '锁屏', icon: 'lock.fill', desc: '圆形: 主订阅已用; 长条: 剩余流量、预测和当前节点延迟', views: { accessoryCircular: LockCircular, accessoryRectangular: LockRect } },
]

export const FAMILY_PREFIX: Record<Family, string> = {
  systemSmall: '小', systemMedium: '中', systemLarge: '大', accessoryCircular: '锁屏圆', accessoryRectangular: '锁屏条',
}

export const stylesFor = (f: Family) => STYLES.filter(s => s.views[f])
export const styleById = (id: string) => STYLES.find(s => s.id === id)
/** 桌面参数: 「中·用量趋势」 */
export const paramOf = (s: StyleDef, f: Family) => `${FAMILY_PREFIX[f]}·${s.name}`

/** 参数 → 样式; 认「中·用量趋势」「趋势」「C」; 不支持这个尺寸就用该尺寸的默认样式 */
export function resolveStyle(param: string | undefined, family: Family): StyleDef {
  const name = (param ?? '').trim().replace(/^(锁屏圆|锁屏条|锁屏|小|中|大)\s*[·.:：\-\s]\s*/, '')
  const ok = (s: StyleDef) => !!s.views[family]
  const hit = name
    ? STYLES.find(s => ok(s) && (s.name === name || s.id.toLowerCase() === name.toLowerCase())) ?? STYLES.find(s => ok(s) && s.name.includes(name))
    : undefined
  if (hit) return hit
  const def = styleById(getDefaults()[family])
  return def?.views[family] ? def : styleById(BUILTIN_DEFAULTS[family])!
}

export function renderStyle(
  style: StyleDef, family: Family,
  opts: { inApp: boolean; loon: LoonData | null; loonErr: string; subs: SubView[]; look: Look; prefs: Prefs },
) {
  const ctx: Ctx = {
    th: makeTheme(opts.look),
    size: (family === 'systemSmall' ? 's' : family === 'systemMedium' ? 'm' : 'l') as Size,
    inApp: opts.inApp,
    loon: opts.loon,
    loonErr: opts.loonErr,
    subs: opts.subs,
    prefs: opts.prefs,
  }
  const View = style.views[family] ?? styleById(BUILTIN_DEFAULTS[family])!.views[family]!
  return <View ctx={ctx} />
}
