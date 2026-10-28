// checkin / presets.ts
// 预设: 样式 + 皮肤 + 显示哪些脚本 + 背景. 小组件参数只填预设名
// 存在 Storage, App 改了预设后 Widget.reloadAll, 桌面上用这个预设的小组件跟着变

import { Widget } from 'scripting'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

const PRESETS_KEY = 'checkin.presets'

export type StyleId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N'
  | 'O' | 'P' | 'Q' | 'R' | 'S' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z' | 'AA' | 'AB'
export type Skin = 'plain' | 'color'
export type Bg = 'auto' | 'dark' | 'light'   // auto: 素净跟随系统, 彩色用深色

export type Preset = {
  name: string
  style: StyleId
  skin: Skin
  keys: string[]          // 空 = 全部脚本
  problemsFirst: boolean
  bg: Bg
  goals?: Record<string, number>   // N 兑换目标: 状态key → 目标值
}

export const STYLES: { id: StyleId; name: string; icon: string; note?: string }[] = [
  { id: 'A', name: '列表', icon: 'list.bullet' },
  { id: 'B', name: '环形', icon: 'circle.dashed' },
  { id: 'C', name: '打卡日历', icon: 'calendar' },
  { id: 'D', name: '图标墙', icon: 'square.grid.3x3.fill' },
  { id: 'E', name: '资产钱包', icon: 'wallet.pass.fill' },
  { id: 'F', name: '终端日志', icon: 'terminal.fill' },
  { id: 'G', name: '时间线', icon: 'clock.fill' },
  { id: 'H', name: '收益统计', icon: 'chart.bar.fill' },
  { id: 'I', name: '锁屏', icon: 'lock.fill' },
  { id: 'J', name: '热力图', icon: 'square.grid.4x3.fill' },
  { id: 'K', name: '每日任务', icon: 'gamecontroller.fill' },
  { id: 'L', name: '签到小票', icon: 'scroll.fill' },
  { id: 'M', name: '大字状态', icon: 'textformat.size' },
  { id: 'N', name: '兑换目标', icon: 'target', note: '在「兑换目标」里给脚本设目标值, 没设的按下一个整数自动定目标' },
  { id: 'O', name: '分类看板', icon: 'square.split.2x2.fill' },
  { id: 'P', name: '聚光灯', icon: 'light.max' },
  { id: 'Q', name: '交互翻页', icon: 'hand.tap.fill', note: '桌面上点 ‹ › 翻页、⟳ 刷新; App 内预览按钮不可点' },
  { id: 'R', name: '成就徽章', icon: 'rosette' },
  { id: 'S', name: '签到天气', icon: 'cloud.sun.fill' },
  { id: 'U', name: '地铁线路', icon: 'tram.fill' },
  { id: 'V', name: '体检评分', icon: 'heart.text.square.fill' },
  { id: 'W', name: '环比对比', icon: 'arrow.left.arrow.right' },
  { id: 'X', name: '过期倒计时', icon: 'hourglass', note: '需要脚本在结果里写 exp (凭证过期毫秒时间戳)' },
  { id: 'Y', name: '作者生态墙', icon: 'person.3.fill' },
  { id: 'Z', name: '积分气泡', icon: 'circle.circle.fill' },
  { id: 'AA', name: '实时活动', icon: 'dot.radiowaves.left.and.right', note: '这里预览的是锁屏实时活动的样子; 真正启动在首页「开始早间签到实时活动」' },
  { id: 'AB', name: '控制中心按钮', icon: 'switch.2', note: '控制中心: 编辑 → 添加控制 → Scripting → checkin; 桌面上放这个预设是一张大按钮卡' },
]

export const styleName = (id: StyleId) => STYLES.find(s => s.id === id)?.name ?? id

/** 参数没填或找不到预设时用 */
export const DEFAULT_PRESET: Preset = { name: '默认', style: 'A', skin: 'plain', keys: [], problemsFirst: true, bg: 'auto' }

// 第一次打开时给几个示例, 用户可改可删
const SEED: Preset[] = [
  { name: '列表', style: 'A', skin: 'plain', keys: [], problemsFirst: true, bg: 'auto' },
  { name: '钱包', style: 'E', skin: 'color', keys: [], problemsFirst: false, bg: 'auto' },
  { name: '全家福', style: 'D', skin: 'color', keys: [], problemsFirst: true, bg: 'auto' },
  { name: '锁屏', style: 'I', skin: 'plain', keys: [], problemsFirst: true, bg: 'auto' },
  { name: '目标', style: 'N', skin: 'color', keys: [], problemsFirst: false, bg: 'auto', goals: { dreame_status: 1000, nodeseek_status: 300 } },
  { name: '翻页', style: 'Q', skin: 'plain', keys: [], problemsFirst: true, bg: 'auto' },
]

export function listPresets(): Preset[] {
  const raw = AppStorage.get<string>(PRESETS_KEY)
  return raw ? JSON.parse(raw) as Preset[] : SEED
}

function saveAll(list: Preset[]): void {
  AppStorage.set(PRESETS_KEY, JSON.stringify(list))
  Widget.reloadAll()
}

export function findPreset(name: string | undefined): Preset {
  const n = (name ?? '').trim()
  return listPresets().find(p => p.name === n) ?? DEFAULT_PRESET
}

/** 按 oldName 覆盖, 没有就追加 */
export function savePreset(p: Preset, oldName = p.name): void {
  const list = listPresets()
  const i = list.findIndex(x => x.name === oldName)
  if (i >= 0) list[i] = p
  else list.push(p)
  saveAll(list)
}

export function deletePreset(name: string): void {
  saveAll(listPresets().filter(p => p.name !== name))
}
