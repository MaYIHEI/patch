// cmcc / ui.tsx
// 外观 (素净 / 自定义) + 各样式共用的部件, 写法同 loon-panel. 小组件和 App 内预览共用同一套视图

import { VStack, HStack, ZStack, Text, Spacer, Image, Button, Capsule, Rectangle, RoundedRectangle } from 'scripting'
import type { Color, DynamicShapeStyle } from 'scripting'

import { formatFlow, CmccError, type Account } from './api'
import type { Hist, Key } from './history'
import type { Look, Family } from './settings'
import { RefreshIntent, PageSetIntent } from './app_intents'

// ─────────────────────────────────────────────────────────────
// 配色: 素净 = 浅白 / 深灰, 只有进度条和状态带颜色
// ─────────────────────────────────────────────────────────────
type Pair = { light: string; dark: string }
export type Paint = Color | DynamicShapeStyle

export const GREEN: Pair = { light: '#34C759', dark: '#30D158' }
export const ORANGE: Pair = { light: '#FF9500', dark: '#FF9F0A' }
export const RED: Pair = { light: '#FF3B30', dark: '#FF453A' }

const PLAIN = {
  bg: { light: '#FFFFFF', dark: '#1C1C1E' },
  card: { light: '#F2F2F7', dark: '#2C2C2E' },
  border: { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
  t1: { light: '#1C1C1E', dark: '#FFFFFF' },
  t2: { light: '#6E6E73', dark: '#98989F' },
  t3: { light: '#8E8E93', dark: '#8E8E93' },
  track: { light: '#E5E5EA', dark: '#3A3A3C' },
}

export type Theme = {
  custom: boolean
  bg: Paint; card: Paint; border: Paint; t1: Paint; t2: Paint; t3: Paint; track: Paint
  accent: Color
  image?: { path: string; blur: number; dim: number }
  /** 硬停点渐变要分别给浅色 / 深色 */
  trackPair: Pair
  inkPair: Pair
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
      custom: false,
      bg: r(PLAIN.bg), card: r(PLAIN.card), border: r(PLAIN.border), t1: r(PLAIN.t1), t2: r(PLAIN.t2), t3: r(PLAIN.t3),
      track: r(PLAIN.track), accent: '#0A84FF', trackPair: PLAIN.track, inkPair: PLAIN.t1,
    }
  }
  const image = look.bgType === 'image' && look.image ? { path: look.image, blur: look.blur, dim: look.dim } : undefined
  const text = look.text === 'white' ? '#FFFFFF' : look.text === 'black' ? '#000000' : look.text === 'custom' ? look.textColor
    : image || luminance(look.color) < 0.55 ? '#FFFFFF' : '#000000'
  const dark = luminance(text) >= 0.5
  const ink = (a: number) => withAlpha(text, a)
  const track = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)'
  return {
    custom: true,
    bg: image ? '#000000' : look.color,
    card: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)',
    border: ink(dark ? 0.14 : 0.08),
    t1: text, t2: ink(dark ? 0.72 : 0.62), t3: ink(dark ? 0.5 : 0.42), track,
    accent: look.accent,
    image,
    trackPair: { light: track, dark: track },
    inkPair: { light: text, dark: text },
  }
}

// ─────────────────────────────────────────────────────────────
// 渲染上下文
// ─────────────────────────────────────────────────────────────
export type Size = 's' | 'm' | 'l'

/** 一个号: 参数里的备注名 + 数据或错误 + 本机历史 */
export type Slot = { name: string; tel: string; account?: Account; error?: Error; hist?: Hist }

export type Ctx = {
  th: Theme
  size: Size
  family: Family
  inApp: boolean        // App 内预览: 不用 widgetBackground, 按钮不触发
  slots: Slot[]         // 单号样式只用第一个; 双号 / 多号样式用全部
  page: number          // 多号翻页当前页
}

/** 第一个查到数据的号 */
export const primary = (ctx: Ctx) => ctx.slots.find(s => s.account) as (Slot & { account: Account }) | undefined

export const hhmm = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const md = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// ─────────────────────────────────────────────────────────────
// 额度条: 通用 / 定向流量, 语音; 套餐缺哪项就少哪项
// ─────────────────────────────────────────────────────────────
export type Meter = {
  key: Key
  label: string
  remain: number        // 流量 MB, 语音分钟
  total: number
  used: number
  percent: number       // 剩余百分比
}

export function metersOf(a: Account): Meter[] {
  const out: Meter[] = []
  for (const [key, label, f] of [['gen', '通用', a.general], ['tgt', '定向', a.targeted]] as const) {
    if (f) out.push({ key, label, remain: f.remainMB, total: f.totalMB, used: f.usedMB, percent: f.totalMB > 0 ? (f.remainMB / f.totalMB) * 100 : 0 })
  }
  const v = a.voice
  if (v && v.total > 0) out.push({ key: 'voice', label: '语音', remain: v.remain, total: v.total, used: v.used, percent: (v.remain / v.total) * 100 })
  return out
}

/** 流量按 G / M, 语音按分钟 */
export const amount = (key: Key, v: number) => (key === 'voice' ? `${Math.round(v)}分` : formatFlow(v))

/** 总量: 196.00G 写成 196G, 省宽度 */
export const totalText = (key: Key, v: number) => amount(key, v).replace(/\.00G$/, 'G')

/** 剩余比例: > 50% 绿, 20-50% 橙, < 20% 红 */
export const levelColor = (percent: number): Pair => (percent < 20 ? RED : percent <= 50 ? ORANGE : GREEN)

export const balanceColor = (ctx: Ctx, a: Account): Paint => (a.balance < 10 ? RED : ctx.th.t1)
export const balanceLabel = (a: Account) => (a.balance < 0 ? '已欠费 · 元' : '话费余额 · 元')
export const starText = (a: Account) => (a.user?.starLevel ? `${a.user.starLevel}星` : '-')
export const pointsText = (a: Account) => (a.points !== undefined ? String(a.points) : '-')
export const netText = (a: Account) => (a.user?.netYears !== undefined ? `${a.user.netYears.toFixed(1)}年` : '-')

// ─────────────────────────────────────────────────────────────
// 本月进度和预测
// ─────────────────────────────────────────────────────────────
export function month(now = Date.now()) {
  const d = new Date(now)
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const day = d.getDate()
  const elapsed = (day - 1 + (d.getHours() * 60 + d.getMinutes()) / 1440) / dim
  return {
    day, dim,
    left: dim - day + 1,                                 // 含今天
    elapsed,                                             // 0-1
    reset: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  }
}

export type Forecast = {
  perDay: number                 // 剩余平均分到月底每天能用多少
  avg: number | null             // 近 7 天日均, 没历史为 null
  runOut: number | null          // 照日均用完的时间点, 撑得到月底为 null
  shortDays: number              // 比月底早几天用完
}

export function forecast(m: Meter, hist?: Hist): Forecast {
  const mo = month()
  const avg = hist?.avg(m.key) ?? null
  const runOut = avg && avg > 0 ? Date.now() + (m.remain / avg) * 86_400_000 : null
  const early = runOut !== null && runOut < mo.reset ? runOut : null
  return {
    perDay: m.remain / mo.left,
    avg,
    runOut: early,
    shortDays: early ? Math.ceil((mo.reset - early) / 86_400_000) : 0,
  }
}

/** 最紧张的一项: 先比会不会在月底前用完, 再比剩余比例 */
export function tightest(ms: Meter[], hist?: Hist): { m: Meter; f: Forecast } | undefined {
  return ms.map(m => ({ m, f: forecast(m, hist) }))
    .sort((a, b) => (a.f.runOut ?? Infinity) - (b.f.runOut ?? Infinity) || a.m.percent - b.m.percent)[0]
}

// ─────────────────────────────────────────────────────────────
// 外框
// ─────────────────────────────────────────────────────────────
const PAD: Record<Size, number> = { s: 14, m: 14, l: 16 }

/** 小组件根视图 */
export function Root(props: { ctx: Ctx; spacing?: number; children?: any }) {
  const { ctx } = props
  const { th } = ctx
  const bg = th.bg
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
      padding={PAD[ctx.size]}
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
        background={<RoundedRectangle cornerRadius={22} fill={bg} />}
        clipShape={{ type: 'rect', cornerRadius: 22 }}
        overlay={<RoundedRectangle cornerRadius={22} stroke={{ shapeStyle: th.border, strokeStyle: { lineWidth: 0.5 } }} />}
      >
        {content}
      </ZStack>
    )
  }
  return <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={bg}>{content}</ZStack>
}

// ─────────────────────────────────────────────────────────────
// 小部件
// ─────────────────────────────────────────────────────────────
const LOGO_URL = 'https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/cmcc.png'

export function Logo(props: { size: number }) {
  return <Image imageUrl={LOGO_URL} resizable frame={{ width: props.size, height: props.size }} clipShape={{ type: 'rect', cornerRadius: props.size * 0.27 }} />
}

/** 右上角: 数据时间 + 刷新; 点一下跳过缓存重查 */
export function SyncTap(props: { ctx: Ctx; t?: number; stale?: boolean }) {
  const { ctx } = props
  const a = primary(ctx)?.account
  const t = props.t ?? a?.fetchedAt
  const text = t ? `${(props.stale ?? a?.stale) ? '⚠ ' : ''}${hhmm(t)}` : ''
  const body = (
    <HStack spacing={3}>
      <Text font={11} foregroundStyle={ctx.th.t3} monospacedDigit lineLimit={1}>{text}</Text>
      <Image systemName="arrow.clockwise" font={10} foregroundStyle={ctx.th.t3} />
    </HStack>
  )
  if (ctx.inApp) return body
  return <Button intent={RefreshIntent(undefined)} buttonStyle="plain">{body}</Button>
}

/** 标题行: 图标 + 标题 + 灰字, 右边时间刷新 */
export function Header(props: { ctx: Ctx; title?: string; sub?: string; right?: any }) {
  const { th } = props.ctx
  return (
    <HStack spacing={5}>
      <Logo size={18} />
      <Text font={12} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.85}>{props.title ?? '中国移动'}</Text>
      {props.sub ? <Text font={11} foregroundStyle={th.t3} lineLimit={1}>{props.sub}</Text> : null}
      <Spacer minLength={4} />
      {props.right === undefined ? <SyncTap ctx={props.ctx} /> : props.right}
    </HStack>
  )
}

/** 额度区, 按项数排: 1 项带总量和说明, 2 项两行, 3 项通用整行 + 另两项半行 */
export function MeterStack(props: { ctx: Ctx; ms: Meter[]; total?: boolean }) {
  const { ctx, ms, total } = props
  if (ms.length === 0) return null
  if (ms.length === 1) return <MeterLine ctx={ctx} m={ms[0]} total bar={6} note={`已用 ${amount(ms[0].key, ms[0].used)} · 剩 ${Math.round(ms[0].percent)}%`} />
  if (ms.length === 2) return <VStack spacing={6}>{ms.map(m => <MeterLine ctx={ctx} m={m} total={total} />)}</VStack>
  return (
    <VStack spacing={6}>
      <MeterLine ctx={ctx} m={ms[0]} total={total} />
      <HStack spacing={8}>{ms.slice(1, 3).map(m => <MeterLine ctx={ctx} m={m} font={11} bar={4} />)}</HStack>
    </VStack>
  )
}

/** 分区小标题: 灰字 + 一条细线 (+ 右侧灰字), 同 loon-panel 全景看板 */
export function Section(props: { ctx: Ctx; title: string; right?: string }) {
  const { th } = props.ctx
  return (
    <HStack spacing={6}>
      <Text font={10} fontWeight="semibold" foregroundStyle={th.t3}>{props.title}</Text>
      <Rectangle fill={th.border} frame={{ maxWidth: 'infinity', height: 0.5 }} />
      {props.right ? <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{props.right}</Text> : null}
    </HStack>
  )
}

/** 号码标签: 多个号时一排胶囊, 点哪个切到哪个; 当前的反色 */
export function Tabs(props: { ctx: Ctx; index: number }) {
  const { ctx } = props
  const { th } = ctx
  return (
    <HStack spacing={5}>
      {/* 号多时只显示当前号附近的 3 个, 免得挤出去 */}
      {ctx.slots.map((s, i) => ({ s, i })).slice(Math.max(0, Math.min(props.index - 1, ctx.slots.length - 3)), Math.max(0, Math.min(props.index - 1, ctx.slots.length - 3)) + 3).map(({ s, i }) => {
        const on = i === props.index
        const pill = (
          <Text font={11} fontWeight={on ? 'semibold' : 'regular'} foregroundStyle={on ? th.bg : th.t2} lineLimit={1}
            padding={{ horizontal: 9, vertical: 3 }} background={<Capsule fill={on ? th.t1 : th.card} />}>
            {s.name}
          </Text>
        )
        return ctx.inApp || on ? pill : <Button intent={PageSetIntent({ page: i })} buttonStyle="plain">{pill}</Button>
      })}
    </HStack>
  )
}

/** 当前页对应的号 (多号翻页 / 全景用) */
export function pageIndex(ctx: Ctx) {
  const n = Math.max(1, ctx.slots.length)
  return ((ctx.page % n) + n) % n
}

/** 大数字: 圆体、等宽, 放不下自动缩小 */
export function Num(props: { value: string | number; size: number; color?: Paint; weight?: 'semibold' | 'bold' | 'medium' }) {
  return (
    <Text font={props.size} fontWeight={props.weight ?? 'semibold'} fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.5} foregroundStyle={props.color}>
      {String(props.value)}
    </Text>
  )
}

export function Label(props: { ctx: Ctx; text: string; size?: number; color?: Paint }) {
  return <Text font={props.size ?? 11} foregroundStyle={props.color ?? props.ctx.th.t2} lineLimit={1}>{props.text}</Text>
}

/** 余额数字 + 「话费余额 · 元」 */
export function Balance(props: { ctx: Ctx; a: Account; size: number }) {
  const { ctx, a } = props
  return (
    <VStack alignment="leading" spacing={1}>
      <Num value={a.balance.toFixed(2)} size={props.size} color={balanceColor(ctx, a)} />
      <Label ctx={ctx} text={balanceLabel(a)} color={a.balance < 0 ? RED : ctx.th.t2} />
    </VStack>
  )
}

/** 小卡片 */
export function Cell(props: { ctx: Ctx; gap?: number; fill?: boolean; children?: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={props.gap ?? 3}
      padding={{ horizontal: 10, vertical: 7 }}
      frame={{ maxWidth: 'infinity', maxHeight: props.fill ? 'infinity' : undefined, alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={12} style="continuous" fill={props.ctx.th.card} />}
    >
      {props.children}
    </VStack>
  )
}

/** 标签 + 数值, 统计格里用 */
export function Stat(props: { ctx: Ctx; label: string; value: string; size?: number; color?: Paint; fill?: boolean }) {
  return (
    <Cell ctx={props.ctx} gap={1} fill={props.fill}>
      <Label ctx={props.ctx} text={props.label} />
      {props.fill ? <Spacer /> : null}
      <Num value={props.value} size={props.size ?? 15} color={props.color ?? props.ctx.th.t1} />
    </Cell>
  )
}

/**
 * 横向进度条 (剩余百分比 0-100), 按剩余比例着色
 * tick: 0-100, 画一道竖线 (月底前「该剩多少」), 用硬停点渐变画, 不需要量宽度
 */
export function Bar(props: { ctx: Ctx; percent: number; height?: number; color?: Pair; tick?: number }) {
  const { ctx } = props
  const p = Math.max(0.005, Math.min(0.995, props.percent / 100))
  const c = props.color ?? levelColor(props.percent)
  const fill = (fg: string, track: string, ink: string) => {
    const stops = [{ color: fg, location: 0 }, { color: fg, location: p }, { color: track, location: p }, { color: track, location: 1 }]
    if (props.tick !== undefined) {
      const t = Math.max(0.01, Math.min(0.99, props.tick / 100))
      const base = (x: number) => (x <= p ? fg : track)
      const mark = [{ color: base(t - 0.012), location: t - 0.012 }, { color: ink, location: t - 0.012 }, { color: ink, location: t + 0.012 }, { color: base(t + 0.012), location: t + 0.012 }]
      stops.push(...mark)
      stops.sort((a, b) => a.location - b.location)
    }
    return { stops, startPoint: 'leading', endPoint: 'trailing' }
  }
  const tp = ctx.th.trackPair, ip = ctx.th.inkPair
  return (
    <Capsule
      fill={{ light: fill(c.light, tp.light, ip.light), dark: fill(c.dark, tp.dark, ip.dark) } as DynamicShapeStyle}
      frame={{ maxWidth: 'infinity', height: props.height ?? 6 }}
    />
  )
}

/** 竖向液位条: 从下往上填 */
export function VBar(props: { ctx: Ctx; percent: number; width?: number }) {
  const p = Math.max(0.005, Math.min(0.995, props.percent / 100))
  const c = levelColor(props.percent)
  const tp = props.ctx.th.trackPair
  const fill = (fg: string, track: string) => ({
    stops: [{ color: fg, location: 0 }, { color: fg, location: p }, { color: track, location: p }, { color: track, location: 1 }],
    startPoint: 'bottom', endPoint: 'top',
  })
  return <Capsule fill={{ light: fill(c.light, tp.light), dark: fill(c.dark, tp.dark) } as DynamicShapeStyle} frame={{ width: props.width ?? 16, maxHeight: 'infinity' }} />
}

/** 一行额度: 标签 + 剩余 (+ 总量), 下面进度条 */
export function MeterLine(props: { ctx: Ctx; m: Meter; font?: number; bar?: number; total?: boolean; tick?: number; note?: string }) {
  const { ctx, m } = props
  return (
    <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity' }}>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Label ctx={ctx} text={m.label} />
        <Spacer minLength={4} />
        <Num value={amount(m.key, m.remain)} size={props.font ?? 13} color={ctx.th.t1} />
        {props.total ? <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{`/${totalText(m.key, m.total)}`}</Text> : null}
      </HStack>
      <Bar ctx={ctx} percent={m.percent} height={props.bar ?? 5} tick={props.tick} />
      {props.note ? <Text font={10} foregroundStyle={ctx.th.t3} lineLimit={1}>{props.note}</Text> : null}
    </VStack>
  )
}

/** 锁屏在 App 内预览时垫一块深色底 */
export function LockPreview(props: { ctx: Ctx; radius: number; children?: any }) {
  if (!props.ctx.inApp) return props.children
  return (
    <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} background={<RoundedRectangle cornerRadius={props.radius} fill="#3A3A3C" />} clipShape={{ type: 'rect', cornerRadius: props.radius }}>
      {props.children}
    </ZStack>
  )
}

export const lockFg = (ctx: Ctx) => (ctx.inApp ? '#FFFFFF' : undefined)

// ─────────────────────────────────────────────────────────────
// 错误
// ─────────────────────────────────────────────────────────────
export function errorText(err: Error | undefined | null): { title: string; hint: string } {
  if (!err) return { title: '未知错误', hint: '打开 Scripting 查看日志' }
  if (err instanceof CmccError) {
    if (err.kind === 'no_cred') {
      return err.message.startsWith('没有尾号')
        ? { title: '找不到账号', hint: `${err.message}, 检查小组件参数` }
        : { title: '未配置', hint: '打开 Scripting → 运行 cmcc 导入凭证' }
    }
    if (err.kind === 'auth') return { title: '凭证失效', hint: '划掉中国移动 App 重开, 再到 Scripting 导入' }
    if (err.kind === 'risk') return { title: '需要验证', hint: '打开中国移动 App 完成安全验证后再刷新' }
    if (err.kind === 'network') return { title: '网络错误', hint: '稍后自动重试' }
    if (err.kind === 'schema') return { title: '接口变化', hint: err.message.slice(0, 60) }
  }
  return { title: '错误', hint: err.message.slice(0, 60) }
}

export function ErrorBox(props: { ctx: Ctx; error?: Error }) {
  const { ctx } = props
  const msg = errorText(props.error)
  return (
    <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Image systemName="exclamationmark.triangle.fill" font={ctx.size === 's' ? 20 : 22} foregroundStyle={ORANGE as DynamicShapeStyle} />
      <Text font={12} fontWeight="semibold" foregroundStyle={ctx.th.t1}>{msg.title}</Text>
      <Text font={10} foregroundStyle={ctx.th.t2} multilineTextAlignment="center" lineLimit={3}>{msg.hint}</Text>
    </VStack>
  )
}

export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}
