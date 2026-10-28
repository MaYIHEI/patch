// checkin / live_activity.tsx
// 实时活动注册 (官方要求单独文件). 视图在 styles/live.tsx

import { LiveActivity, LiveActivityUI, LiveActivityUIExpandedCenter, LiveActivityUIExpandedLeading, LiveActivityUIExpandedTrailing, VStack } from 'scripting'
import type { LiveActivityUIBuilder } from 'scripting'

import { ACTIVITY_NAME, LiveBanner, LiveCompactLeading, LiveCompactTrailing, LiveMinimal, type LiveState } from './styles/live'

const builder: LiveActivityUIBuilder<LiveState> = st => (
  <LiveActivityUI
    content={<VStack activityBackgroundTint={{ light: 'rgba(28,28,30,0.9)', dark: 'rgba(28,28,30,0.9)' }}><LiveBanner st={st} /></VStack>}
    compactLeading={<LiveCompactLeading st={st} />}
    compactTrailing={<LiveCompactTrailing st={st} />}
    minimal={<LiveMinimal st={st} />}
  >
    <LiveActivityUIExpandedLeading><LiveCompactLeading st={st} /></LiveActivityUIExpandedLeading>
    <LiveActivityUIExpandedTrailing><LiveCompactTrailing st={st} /></LiveActivityUIExpandedTrailing>
    <LiveActivityUIExpandedCenter><LiveBanner st={st} /></LiveActivityUIExpandedCenter>
  </LiveActivityUI>
)

export const CheckinActivity = LiveActivity.register(ACTIVITY_NAME, builder)

/** 没有就开一个, 有就结束旧的重开 (文档只写清了 start / endAllActivities) */
export async function startOrRefresh(st: LiveState): Promise<boolean> {
  if (!(await LiveActivity.areActivitiesEnabled())) return false
  await LiveActivity.endAllActivities({ dismissTimeInterval: 0 })
  return CheckinActivity().start(st, { staleDate: Date.now() + 2 * 3_600_000 })
}
