// loon-panel / control_widget_toggle.tsx
// 控制中心开关: 分流 ↔ 全局代理

import { ControlWidget, ControlWidgetToggle } from 'scripting'

import { cachedLoon, loadLoon } from './loon'
import { ModeToggleIntent } from './app_intents'

async function main() {
  const { data } = await loadLoon()
  const on = (data ?? cachedLoon())?.mode === 2
  ControlWidget.present(
    <ControlWidgetToggle
      intent={ModeToggleIntent({ value: !on })}
      label={{ title: 'Loon 模式', systemImage: on ? 'globe' : 'arrow.triangle.branch' }}
      activeValueLabel={{ title: '全局代理' }}
      inactiveValueLabel={{ title: '分流' }}
    />
  )
}

main()
