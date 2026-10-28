// checkin / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 只读 BoxJS 渲染, 不含任何签到接口代码
// 参数: 预设名; 没填或找不到 → 默认 (A 列表 + 素净)

import { VStack, Text, Image, Widget } from 'scripting'

import { loadSnapshot } from './api'
import { recordSnapshot, loadHistory } from './history'
import { findPreset } from './presets'
import { renderPreset } from './styles/index'
import { pageKey } from './app_intents'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

const REFRESH_MS = 30 * 60 * 1000   // 请求 30 分钟后刷新, 实际由系统决定
const SPOT_KEY = 'checkin.spot'      // 聚光灯轮换序号, 每次刷新 +1

async function main() {
  let view
  try {
    const snap = await loadSnapshot()
    recordSnapshot(snap)
    const spot = (AppStorage.get<number>(SPOT_KEY) ?? 0) + 1
    AppStorage.set(SPOT_KEY, spot)
    const preset = findPreset(Widget.parameter)
    const page = AppStorage.get<number>(pageKey(preset.name)) ?? 0
    view = renderPreset(preset, snap, Widget.family, { inApp: false, spot, hist: loadHistory(snap), page })
  } catch (e) {
    view = <ErrorView message={(e as Error).message} />
  }
  Widget.present(view, { policy: 'after', date: new Date(Date.now() + REFRESH_MS) })
}

function ErrorView(props: { message: string }) {
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={{ light: '#F2F2F7', dark: '#1C1C1E' }}>
      <Image systemName="exclamationmark.triangle.fill" font={22} foregroundStyle="#FF9F0A" />
      <Text font={11} foregroundStyle={{ light: '#6E6E73', dark: '#98989F' }} multilineTextAlignment="center">{props.message.slice(0, 80)}</Text>
    </VStack>
  )
}

main()
