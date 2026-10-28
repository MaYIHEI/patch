// checkin / app_intents.tsx
// 小组件、实时活动、控制中心按钮的动作. 官方要求全部写在这个文件

import { AppIntentManager, AppIntentProtocol, Widget, ControlWidget } from 'scripting'

import { loadSnapshot, runCheckin, markRetrying } from './api'
import { recordSnapshot } from './history'
import { getDisplay } from './settings'
import { select } from './api'
import { liveStateOf } from './styles/live'
import { startOrRefresh } from './live_activity'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

export const PAGE_KEY = 'checkin.page'

/** Q 翻页: 页码存 Storage, 小组件重绘时读 */
export const PageIntent = AppIntentManager.register({
  name: 'CheckinPageIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ delta }: { delta: number }) => {
    AppStorage.set(PAGE_KEY, (AppStorage.get<number>(PAGE_KEY) ?? 0) + delta)
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

/** 小组件里的「补签」: 超时就标记「补签中」, 等脚本写回后下次刷新自然更新 */
export const RetryIntent = AppIntentManager.register({
  name: 'CheckinRetryIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ key }: { key: string }) => {
    await retryOne(key, RETRY_TIMEOUT_MS)
    Widget.reloadAll()
  },
})

async function refreshLive(): Promise<void> {
  const snap = await loadSnapshot()
  recordSnapshot(snap)
  const d = getDisplay()
  await startOrRefresh(liveStateOf(select(snap.entries, d.keys, d.problemsFirst), snap.fetchedAt))
  Widget.reloadAll()
  ControlWidget.reloadButtons()
}

/** 控制中心按钮 / 实时活动「刷新」: 读一次数据, 开或刷新实时活动, 刷新小组件 */
export const LiveRefreshIntent = AppIntentManager.register({
  name: 'CheckinLiveRefreshIntent',
  protocol: AppIntentProtocol.LiveActivityIntent,
  perform: async (_: undefined) => {
    await refreshLive()
  },
})

/** 补签有 run 的一条, 超时标记「补签中」; 返回是否在时限内跑完 */
async function retryOne(key: string, budgetMs: number): Promise<boolean> {
  const snap = await loadSnapshot()
  const e = snap.entries.find(x => x.key === key)
  if (!e?.run) return true
  markRetrying(key, true)
  const timeout = new Promise<'timeout'>(res => setTimeout(() => res('timeout'), budgetMs))
  const result = await Promise.race([runCheckin(e).then(() => 'done' as const, () => 'failed' as const), timeout])
  if (result === 'timeout') return false
  markRetrying(key, false)
  return true
}

/** 实时活动里的「补签」 */
export const LiveRetryIntent = AppIntentManager.register({
  name: 'CheckinLiveRetryIntent',
  protocol: AppIntentProtocol.LiveActivityIntent,
  perform: async ({ key }: { key: string }) => {
    await retryOne(key, RETRY_TIMEOUT_MS)
    await refreshLive()
  },
})

/** 实时活动里的「全部补签」: 逐个补, 总时长不超过限额, 剩下的下次再点 */
export const LiveRetryAllIntent = AppIntentManager.register({
  name: 'CheckinLiveRetryAllIntent',
  protocol: AppIntentProtocol.LiveActivityIntent,
  perform: async (_: undefined) => {
    const snap = await loadSnapshot()
    const deadline = Date.now() + RETRY_TIMEOUT_MS
    for (const e of snap.entries.filter(x => x.s === 'fail' && x.run)) {
      const left = deadline - Date.now()
      if (left <= 0 || !(await retryOne(e.key, left))) break
    }
    await refreshLive()
  },
})
