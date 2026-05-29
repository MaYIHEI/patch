// claude-quota / themes.ts
// 主题色板 + UI 变量
// 4 套主题任选:
//   liquid_glass   - iOS 26 液态玻璃, 默认推荐 (需 iOS 26+)
//   minimal_dark   - 深色极简, 无玻璃, 兼容旧系统
//   paper          - 浅色纸质, 适合白色壁纸
//   neon           - 黑底霓虹高亮, 程序员审美

import type { Color } from 'scripting'

export type ThemeKey = 'liquid_glass' | 'minimal_dark' | 'paper' | 'neon'

export type Theme = {
  /** widget 整体背景 (容器底色) */
  backgroundFill: Color
  /** 进度条未填充部分 */
  trackFill: Color
  /** 标题/标签文字 */
  titleText: Color
  /** 副信息文字 (重置时间、时钟等) */
  subtleText: Color
  /** 是否启用 iOS 26 .glassEffect() */
  useGlass: boolean
  /**
   * 进度条颜色策略
   * 默认: < 50% 绿, 50-80% 橙, ≥ 80% 红
   * 各主题可改成单色调
   */
  barColorFor: (percent: number) => Color
}

// ────────────────────────────────────────────────────────────
// 主题 1: 液态玻璃 (默认)
// 半透明背景 + .glassEffect() 边框, 进度条液态玻璃材质
// ────────────────────────────────────────────────────────────
const liquid_glass: Theme = {
  backgroundFill: 'rgba(0,0,0,0)', // 透明, 让玻璃材质接管
  trackFill: 'rgba(255,255,255,0.15)',
  titleText: 'rgba(255,255,255,0.92)',
  subtleText: 'rgba(255,255,255,0.55)',
  useGlass: true,
  barColorFor: (p) => {
    if (p >= 80) return '#ff7a7a' // 柔和红
    if (p >= 50) return '#ffd166' // 暖黄
    return '#7ce5b4'               // 薄荷绿
  },
}

// ────────────────────────────────────────────────────────────
// 主题 2: 极简深色 (iOS 25 及以下兼容)
// 纯深色卡片, 不依赖液态玻璃, 老 iOS 也好看
// ────────────────────────────────────────────────────────────
const minimal_dark: Theme = {
  backgroundFill: '#151515',
  trackFill: '#2a2a2a',
  titleText: '#eaeaea',
  subtleText: '#808080',
  useGlass: false,
  barColorFor: (p) => {
    if (p >= 80) return '#e74c3c'
    if (p >= 50) return '#f39c12'
    return '#27ae60'
  },
}

// ────────────────────────────────────────────────────────────
// 主题 3: 浅色纸质
// 白色背景上的低饱和配色, 适合白色 / 浅色壁纸
// ────────────────────────────────────────────────────────────
const paper: Theme = {
  backgroundFill: '#f8f6f1',
  trackFill: '#e3ddd2',
  titleText: '#1d1d1f',
  subtleText: '#6b6b6b',
  useGlass: false,
  barColorFor: (p) => {
    if (p >= 80) return '#c0392b'
    if (p >= 50) return '#b7791f'
    return '#2c7a4b'
  },
}

// ────────────────────────────────────────────────────────────
// 主题 4: 霓虹 (黑底荧光)
// 黑色卡片 + 鲜亮单色高亮, 程序员审美
// ────────────────────────────────────────────────────────────
const neon: Theme = {
  backgroundFill: '#0a0a0a',
  trackFill: '#1a1a1a',
  titleText: '#e0ffff',
  subtleText: '#5a8a8a',
  useGlass: false,
  barColorFor: (p) => {
    if (p >= 80) return '#ff3860' // 荧光红
    if (p >= 50) return '#ffd866' // 荧光黄
    return '#5af78e'               // 荧光绿
  },
}

export const THEMES: Record<ThemeKey, Theme> = {
  liquid_glass,
  minimal_dark,
  paper,
  neon,
}
