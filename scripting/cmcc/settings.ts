// cmcc / settings.ts
// 全局设置, 所有小组件共用. 改完调 Widget.reloadAll 让桌面跟着变

import type { Color } from 'scripting'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

function read<T>(key: string, fallback: T): T {
  const raw = AppStorage.get<string>(key)
  return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
}

const write = (key: string, v: unknown) => AppStorage.set(key, JSON.stringify(v))

// ────────────────────────────────────────────────────────────
// 数据: BoxJS 域名 + 刷新间隔
// ────────────────────────────────────────────────────────────
export type DataPrefs = { host: string; refresh: 60 | 120 | 240 }
const DATA_KEY = 'cmcc.data'
export const getData = () => read<DataPrefs>(DATA_KEY, { host: 'boxjs.com', refresh: 120 })
export const setData = (p: DataPrefs) => write(DATA_KEY, { ...p, host: p.host.trim() || 'boxjs.com' })

// ────────────────────────────────────────────────────────────
// 账号备注: 手机号 → 备注名
// ────────────────────────────────────────────────────────────
const NAMES_KEY = 'cmcc.names'
export const getNames = () => read<Record<string, string>>(NAMES_KEY, {})
export function setName(tel: string, name: string) {
  const { [tel]: _, ...rest } = getNames()
  write(NAMES_KEY, name ? { ...rest, [tel]: name } : rest)
}

// ────────────────────────────────────────────────────────────
// 外观: 素净 (跟随系统) / 自定义 (纯色或图片), 和 loon-panel 相同
// ────────────────────────────────────────────────────────────
export type Look = {
  mode: 'plain' | 'custom'
  bgType: 'color' | 'image'
  color: Color         // 自定义纯色
  image: string        // 背景图文件路径 (App Group 目录, 小组件能读)
  blur: number         // 0-20
  dim: number          // 0-0.7, 叠一层黑
  accent: Color
  text: 'auto' | 'white' | 'black' | 'custom'   // 自动: 纯色按亮度选黑白, 图片用白
  textColor: Color     // text 为 custom 时用
}
const LOOK_KEY = 'cmcc.look'
export const DEFAULT_LOOK: Look = { mode: 'plain', bgType: 'color', color: '#1E2028', image: '', blur: 6, dim: 0.3, accent: '#0A84FF', text: 'auto', textColor: '#FFFFFF' }
export const getLook = () => read<Look>(LOOK_KEY, DEFAULT_LOOK)
export const setLook = (l: Look) => write(LOOK_KEY, l)

export const RECOMMENDED_BG: Color[] = ['#1E2028', '#0B1F3A', '#1D3B2A', '#3A1E2E', '#F2F2F7', '#FFF4E0', '#E8F0FE', '#FDE7EF']
export const RECOMMENDED_ACCENT: Color[] = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF']

// ────────────────────────────────────────────────────────────
// 各尺寸不填参数时用的样式
// ────────────────────────────────────────────────────────────
export type Family = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'accessoryCircular' | 'accessoryRectangular' | 'accessoryInline'
const DEFAULTS_KEY = 'cmcc.defaults'
export const BUILTIN_DEFAULTS: Record<Family, string> = {
  systemSmall: 'W', systemMedium: 'W', systemLarge: 'W', accessoryCircular: 'V', accessoryRectangular: 'V', accessoryInline: 'V',
}
export const getDefaults = () => read<Record<Family, string>>(DEFAULTS_KEY, BUILTIN_DEFAULTS)
export const setDefault = (f: Family, style: string) => write(DEFAULTS_KEY, { ...getDefaults(), [f]: style })
