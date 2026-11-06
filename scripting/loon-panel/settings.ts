// loon-panel / settings.ts
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
// 刷新间隔 + 策略组
// ────────────────────────────────────────────────────────────
/**
 * main: 小号「当前节点」和看板出口信息用哪个策略组, 空 = Loon 的兜底策略 (final)
 * groups: 大号看板列哪些策略组, 空 = 前 4 个
 * unlock: 解锁样式看哪个策略组的节点, 空 = 主策略组
 * alerts: 用量提醒开关
 */
export type Alerts = { usage: boolean; runout: boolean; expire: boolean }
export type Prefs = { refresh: 15 | 30 | 60; main: string; groups: string[]; unlock: string; alerts: Alerts }
const PREFS_KEY = 'loonpanel.prefs'
export const getPrefs = () => read<Prefs>(PREFS_KEY, { refresh: 30, main: '', groups: [], unlock: '', alerts: { usage: true, runout: true, expire: false } })
export const setPrefs = (p: Prefs) => write(PREFS_KEY, p)

// ────────────────────────────────────────────────────────────
// 外观: 素净 (跟随系统) / 自定义 (纯色或图片), 和 checkin 相同
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
const LOOK_KEY = 'loonpanel.look'
export const DEFAULT_LOOK: Look = { mode: 'plain', bgType: 'color', color: '#141A2E', image: '', blur: 6, dim: 0.3, accent: '#0A84FF', text: 'auto', textColor: '#FFFFFF' }
export const getLook = () => read<Look>(LOOK_KEY, DEFAULT_LOOK)
export const setLook = (l: Look) => write(LOOK_KEY, l)

export const RECOMMENDED_BG: Color[] = ['#141A2E', '#0B1F3A', '#1D3B2A', '#3A1E2E', '#F2F2F7', '#FFF4E0', '#E8F0FE', '#FDE7EF']
export const RECOMMENDED_ACCENT: Color[] = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF']

// ────────────────────────────────────────────────────────────
// 各尺寸不填参数时用的样式
// ────────────────────────────────────────────────────────────
export type Family = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'accessoryCircular' | 'accessoryRectangular' | 'accessoryInline'
const DEFAULTS_KEY = 'loonpanel.defaults'
export const BUILTIN_DEFAULTS: Record<Family, string> = {
  systemSmall: 'A', systemMedium: 'C', systemLarge: 'E', accessoryCircular: 'F', accessoryRectangular: 'F', accessoryInline: 'F',
}
export const getDefaults = () => read<Record<Family, string>>(DEFAULTS_KEY, BUILTIN_DEFAULTS)
export const setDefault = (f: Family, style: string) => write(DEFAULTS_KEY, { ...getDefaults(), [f]: style })

// ────────────────────────────────────────────────────────────
// 自动刷新 (Remote Updates): 只存不敏感的 target 信息, 发送密钥不落地
// ────────────────────────────────────────────────────────────
const REMOTE_KEY = 'loonpanel.remote'
export const getRemoteTargets = () => read<{ ids: string[] }>(REMOTE_KEY, { ids: [] }).ids
export const setRemoteTargets = (ids: string[]) => write(REMOTE_KEY, { ids })
