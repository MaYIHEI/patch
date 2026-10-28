// checkin / settings.ts
// 全局设置, 所有小组件共用 (0.4.0 起取代预设). 改完调 Widget.reloadAll 让桌面跟着变

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
// 数据来源
// ────────────────────────────────────────────────────────────
export type Source = 'auto' | 'summary' | 'boxjs'
export const SUMMARY_URL = 'http://1.1.1.1/checkin/all'
export const DEFAULT_HOST = 'https://boxjs.com'

export type DataPrefs = { source: Source; host: string; refresh: 15 | 30 | 60 }
const DATA_KEY = 'checkin.data'
export const getData = () => read<DataPrefs>(DATA_KEY, { source: 'auto', host: DEFAULT_HOST, refresh: 30 })
export const setData = (p: DataPrefs) => write(DATA_KEY, { ...p, host: p.host.trim() || DEFAULT_HOST })

// ────────────────────────────────────────────────────────────
// 显示哪些脚本: keys 空 = 全部 (登记顺序), 以后新增的也自动显示
// ────────────────────────────────────────────────────────────
export type DisplayPrefs = { keys: string[]; problemsFirst: boolean; goals: Record<string, number> }
const DISPLAY_KEY = 'checkin.display'
export const getDisplay = () => read<DisplayPrefs>(DISPLAY_KEY, { keys: [], problemsFirst: true, goals: {} })
export const setDisplay = (p: DisplayPrefs) => write(DISPLAY_KEY, p)

// ────────────────────────────────────────────────────────────
// 外观: 素净 (跟随系统) / 自定义 (纯色或图片)
// ────────────────────────────────────────────────────────────
export type Look = {
  mode: 'plain' | 'custom'
  bgType: 'color' | 'image'
  color: string        // 自定义纯色
  image: string        // 背景图文件路径 (App Group 目录, 小组件能读)
  blur: number         // 0-20
  dim: number          // 0-0.7, 叠一层黑
  accent: string
}
const LOOK_KEY = 'checkin.look'
export const DEFAULT_LOOK: Look = { mode: 'plain', bgType: 'color', color: '#1E2028', image: '', blur: 6, dim: 0.3, accent: '#0A84FF' }
export const getLook = () => read<Look>(LOOK_KEY, DEFAULT_LOOK)
export const setLook = (l: Look) => write(LOOK_KEY, l)

export const RECOMMENDED_BG = ['#1E2028', '#0B1F3A', '#1D3B2A', '#3A1E2E', '#F2F2F7', '#FFF4E0', '#E8F0FE', '#FDE7EF']
export const RECOMMENDED_ACCENT = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF']

// ────────────────────────────────────────────────────────────
// 各尺寸不填参数时用的样式
// ────────────────────────────────────────────────────────────
export type Family = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'accessoryCircular' | 'accessoryRectangular'
const DEFAULTS_KEY = 'checkin.defaults'
export const BUILTIN_DEFAULTS: Record<Family, string> = {
  systemSmall: 'B', systemMedium: 'A', systemLarge: 'A', accessoryCircular: 'I', accessoryRectangular: 'I',
}
export const getDefaults = () => read<Record<Family, string>>(DEFAULTS_KEY, BUILTIN_DEFAULTS)
export const setDefault = (f: Family, style: string) => write(DEFAULTS_KEY, { ...getDefaults(), [f]: style })

/** 0.3.0 的预设数据直接丢弃 */
AppStorage.remove('checkin.presets')
AppStorage.remove('checkin.mock')
