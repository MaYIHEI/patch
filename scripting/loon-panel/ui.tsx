// loon-panel / ui.tsx
// 外观 (素净 / 自定义) + 各样式共用的部件, 写法和 checkin 一致. 小组件和 App 内预览共用同一套视图
// 背景图只放在背景层 (background), 不参与内容布局

import { VStack, HStack, ZStack, Text, Spacer, Image, Button, Circle, Capsule, Rectangle, RoundedRectangle } from 'scripting'
import type { Color, DynamicShapeStyle } from 'scripting'

import type { Look, Prefs } from './settings'
import type { LoonData, Media, NodeResult } from './loon'
import type { Overview, SubView } from './subs'
import { RefreshIntent } from './app_intents'
import type { Nat } from './net'

// ─────────────────────────────────────────────────────────────
// 配色
// ─────────────────────────────────────────────────────────────
type Pair = { light: string; dark: string }
type Paint = Color | DynamicShapeStyle

export const OK: Color = '#30D158'
export const BAD: Color = '#FF453A'
export const WARN: Color = '#FF9F0A'

const PLAIN = {
  bg: { light: '#F2F2F7', dark: '#1C1C1E' },
  card: { light: '#FFFFFF', dark: '#2C2C2E' },
  border: { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
  t1: { light: '#1C1C1E', dark: '#F2F2F7' },
  t2: { light: '#6E6E73', dark: '#98989F' },
  t3: { light: '#8E8E93', dark: '#636366' },
  track: { light: '#E5E5EA', dark: '#3A3A3C' },
}

export type Theme = {
  custom: boolean
  dark: boolean        // 自定义背景是深色 (文字用白)
  bg: Paint; card: Paint; border: Paint; t1: Paint; t2: Paint; t3: Paint; track: Paint
  accent: Color
  image?: { path: string; blur: number; dim: number }
  /** 硬停点渐变要分别给浅色 / 深色 */
  trackPair: Pair
}

/** 相对亮度 0-1, 只认 #RGB / #RRGGBB / rgba() */
export function luminance(c: string): number {
  let r = 0, g = 0, b = 0
  const hex = c.match(/^#([0-9a-f]{6}|[0-9a-f]{3})([0-9a-f]{2})?$/i)
  const rgb = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1]
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16)
  } else if (rgb) {
    r = Number(rgb[1]); g = Number(rgb[2]); b = Number(rgb[3])
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** "#RRGGBB" / "#RGB" / rgba() → 指定透明度的 rgba, 次要文字用 */
export function withAlpha(c: Color, a: number): Color {
  const hex = c.match(/^#([0-9a-f]{6}|[0-9a-f]{3})([0-9a-f]{2})?$/i)
  const rgb = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1]
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`
  }
  if (rgb) return `rgba(${Number(rgb[1])},${Number(rgb[2])},${Number(rgb[3])},${a})`
  return c
}

export function makeTheme(look: Look): Theme {
  if (look.mode === 'plain') {
    const r = (x: Pair) => x as DynamicShapeStyle
    return {
      custom: false, dark: false,
      bg: r(PLAIN.bg), card: r(PLAIN.card), border: r(PLAIN.border), t1: r(PLAIN.t1), t2: r(PLAIN.t2), t3: r(PLAIN.t3),
      track: r(PLAIN.track), accent: '#0A84FF', trackPair: PLAIN.track,
    }
  }
  const image = look.bgType === 'image' && look.image ? { path: look.image, blur: look.blur, dim: look.dim } : undefined
  // 文字色: 自动时纯色按亮度选黑白, 图片背景亮度读不到, 默认白字
  const text = look.text === 'white' ? '#FFFFFF' : look.text === 'black' ? '#000000' : look.text === 'custom' ? look.textColor
    : image || luminance(look.color) < 0.55 ? '#FFFFFF' : '#000000'
  const dark = luminance(text) >= 0.5
  const ink = (a: number) => withAlpha(text, a)
  const track = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)'
  return {
    custom: true, dark,
    bg: image ? '#000000' : look.color,
    card: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)',
    border: ink(dark ? 0.14 : 0.08),
    t1: text, t2: ink(dark ? 0.72 : 0.62), t3: ink(dark ? 0.5 : 0.42), track,
    accent: look.accent,
    image,
    trackPair: { light: track, dark: track },
  }
}

// ─────────────────────────────────────────────────────────────
// 渲染上下文
// ─────────────────────────────────────────────────────────────
export type Size = 's' | 'm' | 'l'

export type Ctx = {
  th: Theme
  size: Size
  inApp: boolean       // App 内预览: 不用 widgetBackground, 按钮不触发
  loon: LoonData | null
  loonErr: string
  subs: SubView[]
  all: Overview        // 全部机场汇总
  prefs: Prefs
  nat: Nat | null
  events: { t: number; k: string; msg: string }[]   // Loon 事件 + 本机用量提醒, 新的在前
}

export const hhmm = (t: number) => {
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** 「12:30」/「3 小时前」/「11/02」 */
export function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60_000)
  if (m < 60 * 6) return hhmm(t)
  if (m < 60 * 24) return `${Math.round(m / 60)} 小时前`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 小组件右上角统一的数据时间 */
export function syncText(ctx: Ctx): string {
  const l = ctx.loon
  if (l?.mock) return `示例 ${hhmm(l.t)}`
  if (!l) return '未连接 Loon'
  return l.stale ? `⚠ ${hhmm(l.t)}` : `${hhmm(l.t)} 更新`
}

/** 用量颜色: < 50% 绿, 50-80% 橙, ≥ 80% 红 */
export const usageColor = (ratio: number) => (ratio >= 0.8 ? BAD : ratio >= 0.5 ? WARN : OK)
/** 体检测的是经节点完整请求一次的耗时, 比 ping 高得多: < 800 绿, < 1500 橙, 其余 / 不可用红 */
const msColor = (ms: number) => (ms < 800 ? OK : ms < 1500 ? WARN : BAD)
export const latencyColor = (r?: NodeResult) => (!r ? '#8E8E93' : !r.ok ? BAD : msColor(r.ms))
/** 延迟数字: 正常用正文色, 慢和超时才给颜色 */
export const latencyInk = (ctx: Ctx, r?: NodeResult): Paint => (r && (!r.ok || r.ms >= 800) ? latencyColor(r) : ctx.th.t1)
export const latencyText = (r?: NodeResult) => (!r ? '未测' : !r.ok ? '超时' : `${r.ms}ms`)

/** "HK" → 🇭🇰 */
export function flag(cc?: string): string {
  if (!cc || !/^[A-Z]{2}$/i.test(cc)) return ''
  return String.fromCodePoint(...cc.toUpperCase().split('').map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** 节点名自带国旗时不再重复加 */
/** 全名: 选节点的列表里用, 倍率和机场都要看得到 */
export function fullLabel(name: string, r?: NodeResult): string {
  const f = flag(r?.cc)
  return f && !name.includes(f) ? `${f} ${name}` : name
}

/** 短名: 小组件和首页用, 去掉开头的 [标签] 和 | 后面的倍率 */
export const nodeLabel = (name: string, r?: NodeResult) => fullLabel(name.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*[|｜丨│].*$/, '') || name, r)

export const asnText = (r?: NodeResult) => [r?.asn ? `AS${r.asn}` : '', r?.org ?? ''].filter(Boolean).join(' ')

// ─────────────────────────────────────────────────────────────
// 外框
// ─────────────────────────────────────────────────────────────
const PAD: Record<Size, number> = { s: 14, m: 14, l: 16 }

/** 小组件根视图; 背景图和暗化放在 background 里, 不会把内容挤出去 */
export function Root(props: { ctx: Ctx; spacing?: number; padding?: number; children?: any }) {
  const { ctx } = props
  const { th } = ctx
  const img = th.image
  const backdrop = img ? (
    <ZStack>
      <Image filePath={img.path} resizable scaleToFill blur={img.blur} />
      {img.dim > 0 ? <Rectangle fill={`rgba(0,0,0,${img.dim})`} /> : null}
    </ZStack>
  ) : undefined
  const content = (
    <VStack
      alignment="leading"
      spacing={props.spacing ?? 8}
      padding={props.padding ?? PAD[ctx.size]}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      background={backdrop}
      clipped
    >
      {props.children}
    </VStack>
  )
  if (ctx.inApp) {
    return (
      <ZStack
        frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
        background={<RoundedRectangle cornerRadius={22} fill={th.bg} />}
        clipShape={{ type: 'rect', cornerRadius: 22 }}
        overlay={<RoundedRectangle cornerRadius={22} stroke={{ shapeStyle: th.border, strokeStyle: { lineWidth: 0.5 } }} />}
      >
        {content}
      </ZStack>
    )
  }
  return <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={th.bg}>{content}</ZStack>
}

// ─────────────────────────────────────────────────────────────
// 小部件
// ─────────────────────────────────────────────────────────────
export function Dot(props: { color: Paint; size?: number }) {
  const s = props.size ?? 7
  return <Circle fill={props.color} frame={{ width: s, height: s }} />
}

/** 标题行: 左标题, 右灰字 */
export function Header(props: { ctx: Ctx; title: string; icon?: string; right?: string; rightColor?: Paint; font?: number; trailing?: any }) {
  const { th } = props.ctx
  return (
    <HStack spacing={5}>
      {props.icon ? <Image systemName={props.icon} font={(props.font ?? 13) - 1} fontWeight="semibold" foregroundStyle={th.accent} /> : null}
      <Text font={props.font ?? 13} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>{props.title}</Text>
      <Spacer minLength={4} />
      {props.right ? <Text font={11} foregroundStyle={props.rightColor ?? th.t3} lineLimit={1}>{props.right}</Text> : null}
      {props.trailing}
      <RefreshButton ctx={props.ctx} />
    </HStack>
  )
}

/** 右上角刷新: 后台重读数据, 不打开 App */
export function RefreshButton(props: { ctx: Ctx }) {
  if (props.ctx.inApp) return null
  return (
    <Button intent={RefreshIntent(undefined)} buttonStyle="plain">
      <Image systemName="arrow.clockwise" font={10} fontWeight="semibold" foregroundStyle={props.ctx.th.t3} />
    </Button>
  )
}

/** 小卡片: 网格和并排对比都用它 */
export function Cell(props: { ctx: Ctx; gap?: number; children?: any }) {
  return (
    <VStack alignment="leading" spacing={props.gap ?? 1} padding={{ horizontal: 10, vertical: 7 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={12} style="continuous" fill={props.ctx.th.card} />}>
      {props.children}
    </VStack>
  )
}

/** 大数字: 等宽数字, 圆体 */
export function Num(props: { value: string | number; size: number; color?: Paint; weight?: 'semibold' | 'bold' }) {
  return (
    <Text font={props.size} fontWeight={props.weight ?? 'semibold'} fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5} foregroundStyle={props.color}>
      {String(props.value)}
    </Text>
  )
}

export function Empty(props: { ctx: Ctx; icon: string; text: string }) {
  return (
    <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Image systemName={props.icon} font={props.ctx.size === 's' ? 22 : 26} foregroundStyle={props.ctx.th.t3} />
      <Text font={12} foregroundStyle={props.ctx.th.t2} multilineTextAlignment="center">{props.text}</Text>
    </VStack>
  )
}

/** 横向进度条 (0-1), 颜色单一 (硬停点渐变, 同 checkin) */
export function Bar(props: { ctx: Ctx; value: number; color: Color; height?: number }) {
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

/** 用量环: 已用部分按用量着色 */
export function UsageRing(props: { ctx: Ctx; ratio: number; size: number; line: number; color?: Color; children?: any }) {
  const p = Math.max(0, Math.min(1, props.ratio))
  return (
    <ZStack frame={{ width: props.size + props.line, height: props.size + props.line }}>
      <Circle stroke={{ shapeStyle: props.ctx.th.track, strokeStyle: { lineWidth: props.line } }} frame={{ width: props.size, height: props.size }} />
      {p > 0 ? (
        <Circle
          trim={{ from: 0, to: p }}
          stroke={{ shapeStyle: props.color ?? usageColor(p), strokeStyle: { lineWidth: props.line, lineCap: 'round' } }}
          rotationEffect={-90}
          frame={{ width: props.size, height: props.size }}
        />
      ) : null}
      {props.children}
    </ZStack>
  )
}

/** 用量柱状图: null 画一条细轨道; 最后一根 (今天) 或 peak 时最高的一根用强调色; avg 画一条日均线 */
export function DailyBars(props: { ctx: Ctx; values: (number | null)[]; height: number; spacing?: number; avg?: number; peak?: boolean }) {
  const { th } = props.ctx
  const max = Math.max(1, ...props.values.map(v => v ?? 0))
  const top = props.peak ? props.values.indexOf(Math.max(...props.values.map(v => v ?? 0))) : props.values.length - 1
  const bars = (
    <HStack alignment="bottom" spacing={props.spacing ?? 3} frame={{ maxWidth: 'infinity', height: props.height, alignment: 'bottom' }}>
      {props.values.map((v, i) => (
        <RoundedRectangle
          cornerRadius={2}
          fill={v === null ? th.track : i === top ? th.accent : withAlpha(th.accent, 0.45)}
          frame={{ maxWidth: 'infinity', height: v === null ? 2 : Math.max(2, (v / max) * props.height) }}
        />
      ))}
    </HStack>
  )
  if (!props.avg) return bars
  return (
    <ZStack frame={{ maxWidth: 'infinity', height: props.height }}>
      {bars}
      <VStack spacing={0} frame={{ maxWidth: 'infinity', height: props.height }}>
        <Spacer minLength={0} />
        <Rectangle fill={th.t3} frame={{ maxWidth: 'infinity', height: 0.5 }} />
        <VStack frame={{ height: Math.min(props.height, (props.avg / max) * props.height) }} />
      </VStack>
    </ZStack>
  )
}

/** 24 小时柱状图: 今天每小时, 还没到的小时画细轨道 */
export function HourBars(props: { ctx: Ctx; values: (number | null)[]; height: number }) {
  return <DailyBars ctx={props.ctx} values={props.values} height={props.height} spacing={2} peak />
}

/** 最近几次延迟的迷你柱: 高度 = 延迟, 超时画红色满格 */
export function Spark(props: { ctx: Ctx; h?: number[]; width?: number; height: number; count?: number; tone?: Color }) {
  const list = (props.h ?? []).slice(-(props.count ?? 12))
  const max = Math.max(1, ...list)
  return (
    <HStack alignment="bottom" spacing={props.tone ? 2 : 1} frame={{ width: props.width, maxWidth: props.width ? undefined : 'infinity', height: props.height, alignment: 'bottomTrailing' }}>
      {props.width ? null : <Spacer />}
      {list.map(v => <Rectangle fill={v < 0 ? BAD : props.tone ?? msColor(v)} frame={{ width: props.width ? undefined : 6, maxWidth: props.width ? 'infinity' : undefined, height: v < 0 ? props.height : Math.max(1, (v / max) * props.height) }} />)}
    </HStack>
  )
}

/** 可用性格子: 每次体检一格, 绿 / 橙 / 红 */
export function Uptime(props: { h?: number[]; height?: number }) {
  return (
    <HStack spacing={1} frame={{ maxWidth: 'infinity', height: props.height ?? 9 }}>
      {(props.h ?? []).slice(-16).map(v => <Rectangle fill={v < 0 ? BAD : msColor(v)} frame={{ maxWidth: 'infinity' }} />)}
    </HStack>
  )
}

export const mediaColor = (m: Media) => (m.status === 'yes' ? OK : m.status === 'partial' ? WARN : m.status === 'no' ? BAD : '#8E8E93')
export const mediaWord = (m: Media) => (m.status === 'yes' ? (m.region || '可用') : m.status === 'partial' ? '部分' : m.status === 'no' ? '不可用' : '未知')

/** 胶囊标签 */
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

/** 按 n 个一组切开, 用来拼网格 */
export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}
