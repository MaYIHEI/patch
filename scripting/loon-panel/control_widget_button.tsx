// loon-panel / control_widget_button.tsx
// 控制中心按钮: 主策略组切到体检最快的节点

import { ControlWidget, ControlWidgetButton } from 'scripting'

import { FastestIntent } from './app_intents'

ControlWidget.present(
  <ControlWidgetButton intent={FastestIntent(undefined)} label={{ title: '切到最快', systemImage: 'bolt.fill' }} />
)
