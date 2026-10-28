// checkin / ui.tsx
// 两套皮肤的配色 + 各样式共用的部件. 小组件和 App 内预览共用同一套视图

import { VStack, HStack, ZStack, Text, Spacer, Image, Button, Circle, Capsule, RoundedRectangle, Link, Script } from 'scripting'
import type { Color, DynamicShapeStyle } from 'scripting'

import { counts, initials, brand, timeLabel, splitAsset, isRetrying, type Entry, type Snapshot } from './api'
import { RetryIntent } from './app_intents'
import type { Preset } from './presets'
import type { Day } from './history'

// ─────────────────────────────────────────────────────────────
// 配色
// ─────────────────────────────────────────────────────────────
type Pair = { light: string; dark: string }
type Paint = Color | DynamicShapeStyle

export const OK = '#30D158'
export const BAD = '#FF453A'
export const WARN = '#FF9F0A'
export const OK_TINT = 'rgba(48,209,88,0.18)'
export const BAD_TINT = 'rgba(255,69,58,0.18)'
export const WARN_TINT = 'rgba(255,159,10,0.18)'

const PLAIN = {
  bg: { light: '#F2F2F7', dark: '#1C1C1E' },
  card: { light: '#FFFFFF', dark: '#2C2C2E' },
  border: { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
  t1: { light: '#1C1C1E', dark: '#F2F2F7' },
  t2: { light: '#6E6E73', dark: '#98989F' },
  t3: { light: '#8E8E93', dark: '#636366' },
  track: { light: '#E5E5EA', dark: '#3A3A3C' },
  badBg: { light: '#FFE9E7', dark: '#3A1214' },
  badFg: { light: '#D70015', dark: '#FF6961' },
  goodBg: { light: '#E6F8EC', dark: '#0F3B24' },
  goodFg: { light: '#248A3D', dark: '#6EE7A0' },
  paper: { light: '#FFFFFF', dark: '#2C2C2E' },
  ink: { light: '#1C1C1E', dark: '#F2F2F7' },
}

const COLOR = {
  bg: { light: '#EEF1F8', dark: '#0A0E1A' },
  card: { light: 'rgba(255,255,255,0.82)', dark: 'rgba(30,32,40,0.82)' },
  border: { light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.1)' },
  t1: { light: '#111318', dark: '#F2F2F7' },
  t2: { light: '#5B5F6B', dark: 'rgba(235,235,245,0.6)' },
  t3: { light: '#8A8F9C', dark: 'rgba(235,235,245,0.45)' },
  track: { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.12)' },
  badBg: { light: '#FFE1DE', dark: '#3A1214' },
  badFg: { light: '#C4180C', dark: '#FF6961' },
  goodBg: { light: '#DDF5E5', dark: '#0F3B24' },
  goodFg: { light: '#1E7A36', dark: '#6EE7A0' },
  paper: { light: '#FFFDF7', dark: '#F5F0E6' },
  ink: { light: '#2B2620', dark: '#2B2620' },
}

const BLOBS: Pair[] = [
  { light: '#D9E0FF', dark: '#1B2350' },
  { light: '#EBDDF7', dark: '#2A1640' },
  { light: '#D5F0EE', dark: '#0F3A3A' },
]

export type Theme = {
  color: boolean
  bg: Paint; card: Paint; border: Paint; t1: Paint; t2: Paint; t3: Paint; track: Paint
  badBg: Paint; badFg: Paint; goodBg: Paint; goodFg: Paint; paper: Paint; ink: Paint
  blobs: Paint[]
  /** 硬停点渐变要分别给浅色 / 深色 */
  trackPair: Pair
}

export function makeTheme(p: Preset): Theme {
  const set = p.skin === 'color' ? COLOR : PLAIN
  // 素净 auto 跟随系统; 彩色 auto 固定深色
  const mode = p.bg === 'auto' ? (p.skin === 'color' ? 'dark' : 'system') : p.bg
  const r = (x: Pair): Paint => (mode === 'system' ? x as DynamicShapeStyle : x[mode])
  const trackPair = mode === 'system' ? set.track : { light: set.track[mode], dark: set.track[mode] }
  return {
    color: p.skin === 'color',
    bg: r(set.bg), card: r(set.card), border: r(set.border),
    t1: r(set.t1), t2: r(set.t2), t3: r(set.t3), track: r(set.track),
    badBg: r(set.badBg), badFg: r(set.badFg), goodBg: r(set.goodBg), goodFg: r(set.goodFg),
    paper: r(set.paper), ink: r(set.ink),
    blobs: p.skin === 'color' ? BLOBS.map(r) : [],
    trackPair,
  }
}

// ─────────────────────────────────────────────────────────────
// 渲染上下文
// ─────────────────────────────────────────────────────────────
export type Size = 's' | 'm' | 'l'

export type Ctx = {
  th: Theme
  size: Size
  entries: Entry[]     // 预设挑选 + 排序后的
  snap: Snapshot
  inApp: boolean       // App 内预览: 不用 widgetBackground, 按钮不跳转
  spot: number         // 聚光灯轮换序号
  hist: Day[]          // 本机历史, 日期升序
  keys: Set<string>    // entries 的 key, 历史统计只算这些
  preset: Preset
  page: number         // Q 翻页页码
}

export const hhmm = (t: number) => {
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function syncText(snap: Snapshot): string {
  return snap.mock ? `演示 ${hhmm(snap.fetchedAt)}` : snap.stale ? `⚠ ${hhmm(snap.fetchedAt)}` : `${hhmm(snap.fetchedAt)} 更新`
}

export const statusColor = (e: Entry) => (e.s === 'cookie' ? BAD : e.s === 'fail' ? WARN : OK)
export const statusWord = (e: Entry) => (e.s === 'cookie' ? '需重抓' : e.s === 'fail' ? '失败' : '成功')

// ─────────────────────────────────────────────────────────────
// 外框
// ─────────────────────────────────────────────────────────────
const PAD: Record<Size, number> = { s: 14, m: 14, l: 16 }

/** 小组件根视图; tone 让整张卡变红 / 变绿 */
export function Root(props: { ctx: Ctx; tone?: 'bad' | 'good'; bg?: Paint; spacing?: number; padding?: number; children?: any }) {
  const { ctx, tone } = props
  const { th } = ctx
  const bg = props.bg ?? (tone === 'bad' ? th.badBg : tone === 'good' ? th.goodBg : th.bg)
  const blobs = tone || props.bg ? [] : th.blobs
  const content = (
    <VStack
      alignment="leading"
      spacing={props.spacing ?? 8}
      padding={props.padding ?? PAD[ctx.size]}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
    >
      {props.children}
    </VStack>
  )
  const layers = (
    <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      {blobs.length ? <Circle fill={blobs[0]} frame={{ width: 300, height: 300 }} offset={{ x: -140, y: -120 }} /> : null}
      {blobs.length ? <Circle fill={blobs[1]} frame={{ width: 260, height: 260 }} offset={{ x: 150, y: 130 }} /> : null}
      {blobs.length ? <Circle fill={blobs[2]} frame={{ width: 140, height: 140 }} offset={{ x: 40, y: 90 }} /> : null}
      {content}
    </ZStack>
  )
  if (ctx.inApp) {
    return (
      <ZStack
        frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
        background={<RoundedRectangle cornerRadius={22} fill={bg} />}
        clipShape={{ type: 'rect', cornerRadius: 22 }}
        overlay={<RoundedRectangle cornerRadius={22} stroke={{ shapeStyle: th.border, strokeStyle: { lineWidth: 0.5 } }} />}
      >
        {layers}
      </ZStack>
    )
  }
  return <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={bg}>{layers}</ZStack>
}

/** 行内卡片: 0.5pt 细边框, 圆角 12 */
export function Card(props: { ctx: Ctx; fill?: Paint; padding?: any; spacing?: number; alignment?: 'leading' | 'center'; children?: any; noBorder?: boolean }) {
  const { th } = props.ctx
  return (
    <VStack
      alignment={props.alignment ?? 'leading'}
      spacing={props.spacing ?? 4}
      padding={props.padding ?? { horizontal: 10, vertical: 8 }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: props.alignment === 'center' ? 'center' : 'topLeading' }}
      background={<RoundedRectangle cornerRadius={12} fill={props.fill ?? th.card} />}
      overlay={props.noBorder ? undefined : <RoundedRectangle cornerRadius={12} stroke={{ shapeStyle: th.border, strokeStyle: { lineWidth: 0.5 } }} />}
    >
      {props.children}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 小部件
// ─────────────────────────────────────────────────────────────
/** App 图标占位: 品牌深色圆角方块 + 首字. 以后换 pin 仓库的图标 */
export function AppIcon(props: { entry: Entry; size: number; ring?: boolean }) {
  const { entry, size } = props
  const b = brand(entry.key)
  const text = initials(entry.name)
  return (
    <Text
      font={text.length > 1 ? size * 0.38 : size * 0.46}
      fontWeight="semibold"
      foregroundStyle={b.fg}
      lineLimit={1}
      frame={{ width: size, height: size }}
      background={<RoundedRectangle cornerRadius={size * 0.26} fill={b.bg} />}
      overlay={props.ring && entry.s !== 'ok'
        ? <RoundedRectangle cornerRadius={size * 0.26} stroke={{ shapeStyle: statusColor(entry), strokeStyle: { lineWidth: 2 } }} />
        : undefined}
    >
      {text}
    </Text>
  )
}

export function Dot(props: { color: Color; size?: number }) {
  const s = props.size ?? 7
  return <Circle fill={props.color} frame={{ width: s, height: s }} />
}

/** 分段进度条: 绿 / 红 / 橙按数量分段 (硬停点渐变, 同 cmcc 的进度条写法) */
export function SegBar(props: { ctx: Ctx; entries?: Entry[]; height?: number }) {
  const c = counts(props.entries ?? props.ctx.entries)
  const total = c.ok + c.cookie + c.fail
  const barH = props.height ?? 5
  const a = total ? c.ok / total : 0
  const b = total ? (c.ok + c.cookie) / total : 0
  const d = total ? 1 : 0
  const fill = (track: string) => ({
    stops: [
      { color: OK, location: 0 }, { color: OK, location: a },
      { color: BAD, location: a }, { color: BAD, location: b },
      { color: WARN, location: b }, { color: WARN, location: d },
      { color: track, location: d }, { color: track, location: 1 },
    ],
    startPoint: 'leading',
    endPoint: 'trailing',
  })
  const tp = props.ctx.th.trackPair
  return <Capsule fill={{ light: fill(tp.light), dark: fill(tp.dark) } as DynamicShapeStyle} frame={{ maxWidth: 'infinity', height: barH }} />
}

/** 完成度圆环: 绿 / 红 / 橙三段 */
export function Ring(props: { ctx: Ctx; size: number; line: number; entries?: Entry[]; children?: any }) {
  const c = counts(props.entries ?? props.ctx.entries)
  const total = c.ok + c.cookie + c.fail || 1
  const a = c.ok / total, b = (c.ok + c.cookie) / total, d = (c.ok + c.cookie + c.fail) / total
  const arc = (from: number, to: number, color: Paint) => (
    <Circle
      trim={{ from, to }}
      stroke={{ shapeStyle: color, strokeStyle: { lineWidth: props.line, lineCap: 'butt' } }}
      rotationEffect={-90}
      frame={{ width: props.size, height: props.size }}
    />
  )
  return (
    <ZStack frame={{ width: props.size + props.line, height: props.size + props.line }}>
      <Circle stroke={{ shapeStyle: props.ctx.th.track, strokeStyle: { lineWidth: props.line } }} frame={{ width: props.size, height: props.size }} />
      {a > 0 ? arc(0, a, OK) : null}
      {b > a ? arc(a, b, BAD) : null}
      {d > b ? arc(b, d, WARN) : null}
      {props.children}
    </ZStack>
  )
}

/** 小号胶囊标签: "2 重抓" */
export function Pill(props: { text: string; fg: Paint; bg: Paint; font?: number }) {
  return (
    <Text
      font={props.font ?? 11}
      fontWeight="medium"
      foregroundStyle={props.fg}
      lineLimit={1}
      padding={{ horizontal: 7, vertical: 3 }}
      background={<Capsule fill={props.bg} />}
    >
      {props.text}
    </Text>
  )
}

/** 顶部计数标签, 只显示非零的 */
export function ProblemPills(props: { ctx: Ctx; entries?: Entry[] }) {
  const c = counts(props.entries ?? props.ctx.entries)
  return (
    <HStack spacing={5}>
      {c.cookie ? <Pill text={`${c.cookie} 重抓`} fg={BAD} bg={BAD_TINT} /> : null}
      {c.fail ? <Pill text={`${c.fail} 失败`} fg={WARN} bg={WARN_TINT} /> : null}
      {!c.cookie && !c.fail ? <Pill text="全部正常" fg={OK} bg={OK_TINT} /> : null}
    </HStack>
  )
}

/**
 * 处理按钮: 需重抓 → 红色实心「打开 App」(打开本脚本的 App 页面);
 * 失败 → 灰色「补签」, 脚本登记了 run 才能点, 没有显示「不支持补签」; 超时后显示「补签中, 稍后刷新」
 */
export function ActionPill(props: { ctx: Ctx; entry: Entry }) {
  const { ctx, entry } = props
  const cookie = entry.s === 'cookie'
  const retrying = !cookie && !ctx.inApp && isRetrying(entry)
  const text = cookie ? '打开 App' : retrying ? '补签中, 稍后刷新' : entry.run ? '补签' : '不支持补签'
  const pill = (
    <Text
      font={retrying || (!cookie && !entry.run) ? 10 : 11}
      fontWeight="semibold"
      foregroundStyle={cookie ? '#FFFFFF' : entry.run ? ctx.th.t1 : ctx.th.t3}
      lineLimit={1}
      padding={{ horizontal: 9, vertical: 4 }}
      background={<Capsule fill={cookie ? BAD : ctx.th.track} />}
    >
      {text}
    </Text>
  )
  if (ctx.inApp || retrying) return pill
  if (cookie) return <Link url={Script.createRunURLScheme(Script.name, { key: entry.key })}>{pill}</Link>
  if (!entry.run) return pill
  return <Button intent={RetryIntent({ key: entry.key })} buttonStyle="plain">{pill}</Button>
}

/** 行尾: 有问题显示处理按钮 (buttons) 或状态字; 成功显示资产数字, 没资产显示绿点 */
export function RowEnd(props: { ctx: Ctx; entry: Entry; buttons?: boolean; font?: number }) {
  const { ctx, entry } = props
  if (entry.s !== 'ok') {
    return props.buttons
      ? <ActionPill ctx={ctx} entry={entry} />
      : <Text font={11} fontWeight="medium" foregroundStyle={statusColor(entry)} lineLimit={1}>{statusWord(entry)}</Text>
  }
  if (entry.asset) {
    return <Text font={props.font ?? 14} fontWeight="semibold" monospacedDigit foregroundStyle={ctx.th.t1} lineLimit={1}>{splitAsset(entry.asset).num}</Text>
  }
  return <Dot color={OK} size={8} />
}

/** 不是今天的结果显示日期 */
export function DateTag(props: { entry: Entry }) {
  const d = new Date(props.entry.t)
  if (d.toDateString() === new Date().toDateString()) return null
  return <Text font={10} foregroundStyle={WARN} lineLimit={1}>{timeLabel(props.entry.t)}</Text>
}

/** 标题行: 左标题, 右灰字 */
export function Header(props: { ctx: Ctx; title: string; right?: string; rightColor?: Paint; font?: number }) {
  const { th } = props.ctx
  return (
    <HStack spacing={6}>
      <Text font={props.font ?? 13} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>{props.title}</Text>
      <Spacer minLength={4} />
      {props.right ? <Text font={11} foregroundStyle={props.rightColor ?? th.t3} lineLimit={1}>{props.right}</Text> : null}
    </HStack>
  )
}

/** 大数字: 等宽数字, 粗体 */
export function Num(props: { value: string | number; size: number; color?: Paint; weight?: 'semibold' | 'bold' }) {
  return (
    <Text font={props.size} fontWeight={props.weight ?? 'semibold'} fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5} foregroundStyle={props.color}>
      {String(props.value)}
    </Text>
  )
}

export function Empty(props: { ctx: Ctx; text: string }) {
  return (
    <VStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Text font={12} foregroundStyle={props.ctx.th.t2} multilineTextAlignment="center">{props.text}</Text>
    </VStack>
  )
}

/** 历史不足的空状态: "已记录 2 天, 再签 5 天就能看到趋势" */
export function HistEmpty(props: { ctx: Ctx; need: number; title: string; icon: string }) {
  const { ctx } = props
  const have = ctx.hist.length
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title={props.title} font={ctx.size === 's' ? 12 : 13} />
      <Spacer minLength={0} />
      <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
        <Image systemName={props.icon} font={ctx.size === 's' ? 26 : 32} foregroundStyle={ctx.th.t3} />
        <Text font={12} foregroundStyle={ctx.th.t2} multilineTextAlignment="center">
          {have ? `已记录 ${have} 天, 再签 ${props.need - have} 天就能看到趋势` : '还没有历史记录, 签到结果读到后会自动记录'}
        </Text>
      </VStack>
      <Spacer minLength={0} />
    </Root>
  )
}

/** 横向进度条 (0-1), 颜色单一 */
export function Bar(props: { ctx: Ctx; value: number; color: string; height?: number }) {
  const p = Math.max(0, Math.min(1, props.value))
  const barH = props.height ?? 6
  const fill = (track: string) => ({
    stops: [{ color: props.color, location: 0 }, { color: props.color, location: p }, { color: track, location: p }, { color: track, location: 1 }],
    startPoint: 'leading',
    endPoint: 'trailing',
  })
  const tp = props.ctx.th.trackPair
  return <Capsule fill={{ light: fill(tp.light), dark: fill(tp.dark) } as DynamicShapeStyle} frame={{ maxWidth: 'infinity', height: barH }} />
}

/** 带符号的差值: +5 / -3 / ±0 */
export const signed = (n: number) => (n > 0 ? `+${round(n)}` : n < 0 ? `${round(n)}` : '±0')
export const round = (n: number) => Math.round(n * 100) / 100

/** 按 n 个一组切开, 用来拼网格 */
export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}
