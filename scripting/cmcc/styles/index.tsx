// cmcc / styles/index.tsx
// 样式目录: 每种样式声明自己支持的尺寸, 只在这些尺寸出现; 小组件和 App 内预览共用 renderStyle
// 参数: 「样式名 尾号」, 如「仪表盘 1234」「双号对照 主号:1234,副号:5678」; 只写尾号用该尺寸的默认样式

import { makeTheme, type Ctx, type Size, type Slot } from '../ui'
import { getDefaults, BUILTIN_DEFAULTS, type Family, type Look } from '../settings'
import { AdaptiveStyle, BigBalanceStyle, BillStyle, LockCircular, LockRect, LockInline } from './basic'
import { TodayStyle, TodayLock, CountdownStyle, CountdownLock, ForecastStyle, MonthStyle } from './forecast'
import { DualStyle, PagerStyle } from './multi'
import { BoardStyle, DualBoardStyle } from './board'

type View = (props: { ctx: Ctx }) => any

export type StyleDef = {
  id: string
  name: string
  desc: string
  icon: string
  views: Partial<Record<Family, View>>
}

const SML = (v: View) => ({ systemSmall: v, systemMedium: v, systemLarge: v })
const SM = (v: View) => ({ systemSmall: v, systemMedium: v })
const ML = (v: View) => ({ systemMedium: v, systemLarge: v })

export const STYLES: StyleDef[] = [
  { id: 'W', name: '全景', icon: 'rectangle.3.group.bubble.fill', desc: '余额、每项预测、积分网龄、近 7 天; 多号点标签切换', views: SML(BoardStyle) },
  { id: 'A', name: '自适应', icon: 'rectangle.3.group.fill', desc: '余额 + 套餐里有的每一项, 按项数自动排版', views: SML(AdaptiveStyle) },
  { id: 'X', name: '双号全景', icon: 'rectangle.split.1x2.fill', desc: '两个号同屏看全: 余额、本月、每项剩余和预测、近 7 天', views: ML(DualBoardStyle) },
  { id: 'B', name: '大字余额', icon: 'textformat.size', desc: '只有一个居中的大余额', views: SM(BigBalanceStyle) },
  { id: 'D', name: '账单卡', icon: 'creditcard.fill', desc: '做成一张银行卡: 余额、尾号、本月消费', views: { systemMedium: BillStyle } },
  { id: 'E', name: '今日额度', icon: 'gauge.with.needle', desc: '今天用了多少 / 今天能用多少, 超了提醒', views: { ...SM(TodayStyle), accessoryCircular: TodayLock } },
  { id: 'F', name: '倒计时', icon: 'calendar', desc: '圆环里写还有几天重置, 每项撑不撑得到', views: { ...SM(CountdownStyle), accessoryCircular: CountdownLock } },
  { id: 'G', name: '用量预测', icon: 'chart.line.uptrend.xyaxis', desc: '每天可用多少, 照日均几号用完', views: SML(ForecastStyle) },
  { id: 'J', name: '用量月报', icon: 'square.grid.3x3.fill', desc: '本月合计、日均、最多一天; 大号是每天一格的热力日历', views: ML(MonthStyle) },
  { id: 'Q', name: '多号翻页', icon: 'hand.tap.fill', desc: '顶部号码标签, 点哪个看哪个', views: ML(PagerStyle) },
  { id: 'S', name: '双号对照', icon: 'rectangle.split.2x1.fill', desc: '两个号左右对照; 参数填两个尾号', views: SML(DualStyle) },
  { id: 'V', name: '锁屏', icon: 'lock.fill', desc: '圆形: 通用剩余; 长条: 余额 + 通用; 单行', views: { accessoryCircular: LockCircular, accessoryRectangular: LockRect, accessoryInline: LockInline } },
]

/** 用到多个号的样式: 参数没写尾号时用全部已导入的号 */
export const MULTI = ['Q', 'S', 'W', 'X']
/** 要本机历史才准的样式, 样式库里标注 */
export const NEEDS_HIST = ['E', 'J']

export const FAMILY_PREFIX: Record<Family, string> = {
  systemSmall: '小', systemMedium: '中', systemLarge: '大', accessoryCircular: '锁屏圆', accessoryRectangular: '锁屏条', accessoryInline: '锁屏行',
}

export const stylesFor = (f: Family) => STYLES.filter(s => s.views[f])
export const styleById = (id: string) => STYLES.find(s => s.id === id)

// ─────────────────────────────────────────────────────────────
// 参数
// ─────────────────────────────────────────────────────────────
export type AccountRef = { name?: string; tail: string }

/** 「仪表盘 主号:1234,副号:5678」→ { style: '仪表盘', accounts: [...] }; 中英文逗号、冒号都行 */
export function parseParam(param: string | undefined): { style: string; accounts: AccountRef[] } {
  const p = (param ?? '').trim()
  const one = String.raw`(?:[^\s,，:：]+[:：])?\d{3,11}`
  const m = p.match(new RegExp(String.raw`(?:^|\s)(${one}(?:\s*[,，]\s*${one})*)$`))
  const tail = m ? m[1] : ''
  const style = (m ? p.slice(0, p.length - m[0].length) : p).trim()
  const accounts = tail.split(/[,，]/).map(s => s.trim()).filter(Boolean).map(s => {
    const [a, b] = s.split(/[:：]/).map(x => x.trim())
    return b === undefined ? { tail: a } : { name: a, tail: b }
  })
  return { style, accounts }
}

/** 桌面参数: 「双号对照」+ 可选尾号 */
export const paramOf = (s: StyleDef, tails: string[] = []) => [s.name, tails.join(',')].filter(Boolean).join(' ')

/** 样式名 → 样式; 认「中·账单卡」「账单卡」「D」; 没写样式但写了两个尾号用双号对照; 不支持这个尺寸就用默认 */
export function resolveStyle(name: string, family: Family, accounts = 0): StyleDef {
  const n = name.replace(/^(锁屏圆|锁屏条|锁屏行|锁屏|小|中|大)\s*[·.:：\-\s]\s*/, '')
  const ok = (s: StyleDef) => !!s.views[family]
  const hit = n
    ? STYLES.find(s => ok(s) && (s.name === n || s.id.toLowerCase() === n.toLowerCase())) ?? STYLES.find(s => ok(s) && s.name.includes(n))
    : accounts >= 2 && family.startsWith('system') ? styleById('S') : undefined
  if (hit) return hit
  const def = styleById(getDefaults()[family])
  return def?.views[family] ? def : styleById(BUILTIN_DEFAULTS[family])!
}

export function renderStyle(style: StyleDef, family: Family, opts: { inApp: boolean; slots: Slot[]; look: Look; page: number }) {
  const ctx: Ctx = {
    th: makeTheme(opts.look),
    size: (family === 'systemSmall' ? 's' : family === 'systemMedium' ? 'm' : 'l') as Size,
    family,
    inApp: opts.inApp,
    slots: opts.slots,
    page: opts.page,
  }
  const View = style.views[family] ?? styleById(BUILTIN_DEFAULTS[family])!.views[family]!
  return <View ctx={ctx} />
}
