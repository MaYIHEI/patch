// checkin / live_activity.tsx
// 实时活动注册 (官方要求单独文件). 视图在 styles/live.tsx, 按钮的 intent 在 app_intents.tsx

import {
  LiveActivity, LiveActivityUI, LiveActivityUIExpandedLeading, LiveActivityUIExpandedTrailing,
  LiveActivityUIExpandedCenter, LiveActivityUIExpandedBottom,
} from 'scripting'
import type { LiveActivityUIBuilder } from 'scripting'

import {
  ACTIVITY_NAME, LiveBanner, LiveCompactLeading, LiveCompactTrailing, LiveMinimal,
  LiveExpandedLeading, LiveExpandedTrailing, LiveExpandedCenter, LiveExpandedBottom, type LiveState, type LiveActs,
} from './styles/live'
import { LiveRefreshIntent, LiveRetryIntent, LiveRetryAllIntent } from './app_intents'

// 两个文件互相引用, intent 只在渲染时才取, 不在加载时访问
const acts = (): LiveActs => ({
  retry: key => LiveRetryIntent({ key }),
  refresh: LiveRefreshIntent(undefined),
  retryAll: LiveRetryAllIntent(undefined),
})

const builder: LiveActivityUIBuilder<LiveState> = st => (
  <LiveActivityUI
    content={<LiveBanner st={st} acts={acts()} />}
    compactLeading={<LiveCompactLeading st={st} />}
    compactTrailing={<LiveCompactTrailing st={st} />}
    minimal={<LiveMinimal st={st} />}
  >
    <LiveActivityUIExpandedLeading><LiveExpandedLeading st={st} /></LiveActivityUIExpandedLeading>
    <LiveActivityUIExpandedTrailing><LiveExpandedTrailing st={st} /></LiveActivityUIExpandedTrailing>
    <LiveActivityUIExpandedCenter><LiveExpandedCenter st={st} /></LiveActivityUIExpandedCenter>
    <LiveActivityUIExpandedBottom><LiveExpandedBottom st={st} acts={acts()} /></LiveActivityUIExpandedBottom>
  </LiveActivityUI>
)

// 只能注册一次: 锁屏渲染时本文件是入口, 又经 app_intents 被当模块引入, 同一环境里会被求值两次
// 官方没有「已注册就复用」的接口, 第一次注册的结果挂在 globalThis 上, 之后都复用它
const g = globalThis as { __checkinActivity?: any }
export const CheckinActivity = g.__checkinActivity ?? (g.__checkinActivity = LiveActivity.register(ACTIVITY_NAME, builder))

const START_OPTS = () => ({ staleDate: Date.now() + 2 * 3_600_000 })

/**
 * 已有活动就原地更新 (实时活动里点按钮时不闪), 没有就新开
 * LiveActivity.from 文档只写了签名, 更新不了时退回「结束再开」
 */
export async function startOrRefresh(st: LiveState): Promise<boolean> {
  if (!(await LiveActivity.areActivitiesEnabled())) return false
  const ids = await LiveActivity.getAllActivitiesIds()
  if (ids.length) {
    try {
      const current = LiveActivity.from(ids[0], ACTIVITY_NAME)
      if (current) {
        await current.update(st, START_OPTS())
        return true
      }
    } catch {
      // 落到下面重开
    }
    await LiveActivity.endAllActivities({ dismissTimeInterval: 0 })
  }
  return CheckinActivity().start(st, START_OPTS())
}
