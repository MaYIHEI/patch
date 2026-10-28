// checkin / styles/index.tsx
// 预设 + 数据 → 视图. 小组件 (widget.tsx) 和 App 内预览 (index.tsx) 共用

import { select, type Snapshot } from '../api'
import { makeTheme, type Ctx, type Size } from '../ui'
import type { Day } from '../history'
import type { Preset, StyleId } from '../presets'
import { ListStyle, RingStyle, WalletStyle, BigStyle, LockStyle, LockCircular, LockRect } from './basic'
import { IconWallStyle, TerminalStyle, TimelineStyle, ReceiptStyle, SpotlightStyle, WeatherStyle } from './fun'
import { CategoryStyle, MetroStyle, AuthorStyle, BubbleStyle } from './board'
import { CalendarStyle, EarningsStyle, HeatmapStyle, QuestStyle, GoalStyle, BadgeStyle, HealthStyle, CompareStyle } from './history'
import { ExpiryStyle, PagerStyle, LiveStyle, ControlStyle } from './extra'

const VIEWS: Record<StyleId, (props: { ctx: Ctx }) => any> = {
  A: ListStyle, B: RingStyle, C: CalendarStyle, D: IconWallStyle, E: WalletStyle, F: TerminalStyle,
  G: TimelineStyle, H: EarningsStyle, I: LockStyle, J: HeatmapStyle, K: QuestStyle, L: ReceiptStyle,
  M: BigStyle, N: GoalStyle, O: CategoryStyle, P: SpotlightStyle, Q: PagerStyle, R: BadgeStyle,
  S: WeatherStyle, U: MetroStyle, V: HealthStyle, W: CompareStyle, X: ExpiryStyle, Y: AuthorStyle,
  Z: BubbleStyle, AA: LiveStyle, AB: ControlStyle,
}

export function renderPreset(
  preset: Preset, snap: Snapshot, family: string,
  opts: { inApp: boolean; spot: number; hist: Day[]; page: number },
) {
  const entries = select(snap.entries, preset.keys, preset.problemsFirst)
  const ctx: Ctx = {
    th: makeTheme(preset),
    size: (family === 'systemSmall' ? 's' : family === 'systemMedium' ? 'm' : 'l') as Size,
    entries,
    snap,
    inApp: opts.inApp,
    spot: opts.spot,
    hist: opts.hist,
    keys: new Set(entries.map(e => e.key)),
    preset,
    page: opts.page,
  }
  // 锁屏两种尺寸: 任何样式都用 I 的锁屏版
  if (family === 'accessoryCircular') return <LockCircular ctx={ctx} />
  if (family === 'accessoryRectangular') return <LockRect ctx={ctx} />
  const View = VIEWS[preset.style] ?? ListStyle
  return <View ctx={ctx} />
}
