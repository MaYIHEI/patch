// checkin / app_intents.tsx
// 小组件按钮 (Q 翻页 / 刷新) 和控制中心按钮的动作. 官方要求全部写在这个文件

import { AppIntentManager, AppIntentProtocol, Widget, ControlWidget } from 'scripting'

import { loadSnapshot, runCheckin, markRetrying } from './api'
import { recordSnapshot } from './history'
import { findPreset } from './presets'
import { select } from './api'
import { liveStateOf } from './styles/live'
import { startOrRefresh } from './live_activity'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

export const pageKey = (preset: string) => `checkin.page.${preset}`

/** Q 翻页: 页码存 Storage, 小组件重绘时读 */
export const PageIntent = AppIntentManager.register({
  name: 'CheckinPageIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ preset, delta }: { preset: string; delta: number }) => {
    AppStorage.set(pageKey(preset), (AppStorage.get<number>(pageKey(preset)) ?? 0) + delta)
    Widget.reloadAll()
  },
})

export const RefreshIntent = AppIntentManager.register({
  name: 'CheckinRefreshIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    Widget.reloadAll()
  },
})

// 小组件按钮在后台跑, 有时间限制 (系统没公开具体秒数, 留足余量)
const RETRY_TIMEOUT_MS = 20_000

/** 补签: 请求 run; 超时就标记「补签中」, 等脚本写回 BoxJS 后下次刷新自然更新 */
export const RetryIntent = AppIntentManager.register({
  name: 'CheckinRetryIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ key }: { key: string }) => {
    const snap = await loadSnapshot()
    const e = snap.entries.find(x => x.key === key)
    if (!e?.run) return
    markRetrying(key, true)
    const timeout = new Promise<'timeout'>(res => setTimeout(() => res('timeout'), RETRY_TIMEOUT_MS))
    const result = await Promise.race([runCheckin(e).then(() => 'done' as const, () => 'failed' as const), timeout])
    if (result !== 'timeout') markRetrying(key, false)
    Widget.reloadAll()
  },
})

/** 控制中心按钮 / AB 大按钮: 读一次 BoxJS, 开或刷新实时活动, 刷新小组件 */
export const LiveRefreshIntent = AppIntentManager.register({
  name: 'CheckinLiveRefreshIntent',
  protocol: AppIntentProtocol.LiveActivityIntent,
  perform: async (_: undefined) => {
    const snap = await loadSnapshot()
    recordSnapshot(snap)
    const preset = findPreset(undefined)
    await startOrRefresh(liveStateOf(select(snap.entries, preset.keys, preset.problemsFirst)))
    Widget.reloadAll()
    ControlWidget.reloadButtons()
  },
})
