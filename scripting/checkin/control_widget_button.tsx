// checkin / control_widget_button.tsx
// 控制中心 / 锁屏按钮: 显示今日完成数, 点一下读 BoxJS 并开 (或刷新) 实时活动

import { ControlWidget, ControlWidgetButton } from 'scripting'

import { loadSnapshot, counts } from './api'
import { LiveRefreshIntent } from './app_intents'

async function main() {
  let title = '签到总览'
  try {
    const snap = await loadSnapshot()
    const c = counts(snap.entries)
    title = `签到 ${c.ok}/${snap.entries.length}${c.cookie + c.fail ? ` · ${c.cookie + c.fail} 需处理` : ''}`
  } catch {
    // 读不到时只显示名称, 点按钮会再试一次
  }
  ControlWidget.present(
    <ControlWidgetButton
      intent={LiveRefreshIntent(undefined)}
      label={{ title, systemImage: 'checklist.checked' }}
    />
  )
}

main()
