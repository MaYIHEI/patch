// checkin / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 只读签到数据渲染, 不含任何签到接口代码
// 参数: 样式名 (如「中·钱包」或「钱包」); 不填或尺寸不支持 → 该尺寸的默认样式

import { VStack, Text, Image, Widget } from 'scripting'

import { loadSnapshot } from './api'
import { recordSnapshot, loadHistory } from './history'
import { getData, getDisplay, getLook, type Family } from './settings'
import { ensureIcons } from './icons'
import { resolveStyle, renderStyle } from './styles/index'
import { PAGE_KEY } from './app_intents'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

const SPOT_KEY = 'checkin.spot'      // 聚光灯轮换序号, 每次刷新 +1

async function main() {
  const family = Widget.family as Family
  let view
  try {
    const snap = await loadSnapshot()
    recordSnapshot(snap)
    // 图标只在缺的时候下载一次, 之后读缓存
    await ensureIcons(snap.entries.map(e => e.key))
    const spot = (AppStorage.get<number>(SPOT_KEY) ?? 0) + 1
    AppStorage.set(SPOT_KEY, spot)
    const d = getDisplay()
    view = renderStyle(resolveStyle(Widget.parameter, family), snap, family, {
      inApp: false, spot, hist: loadHistory(snap), page: AppStorage.get<number>(PAGE_KEY) ?? 0,
      look: getLook(), keys: d.keys, problemsFirst: d.problemsFirst, goals: d.goals,
    })
  } catch (e) {
    view = <ErrorView message={(e as Error).message} />
  }
  Widget.present(view, { policy: 'after', date: new Date(Date.now() + getData().refresh * 60_000) })
}

function ErrorView(props: { message: string }) {
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={{ light: '#F2F2F7', dark: '#1C1C1E' }}>
      <Image systemName="exclamationmark.triangle.fill" font={20} foregroundStyle="#FF9F0A" />
      <Text font={11} foregroundStyle={{ light: '#6E6E73', dark: '#98989F' }} multilineTextAlignment="center" lineLimit={4}>
        {`${props.message.slice(0, 60)}\n打开 checkin 完成设置`}
      </Text>
    </VStack>
  )
}

main()
