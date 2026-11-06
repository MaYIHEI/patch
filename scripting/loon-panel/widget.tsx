// loon-panel / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// Loon 数据走插件的数据地址; 机场用量由这里直接读订阅, 不经过 Loon 插件
// 参数: 样式名 (如「中·用量趋势」或「趋势」); 不填或尺寸不支持 → 该尺寸的默认样式

import { VStack, Text, Image, Widget } from 'scripting'

import { loadLoon } from './loon'
import { loadSubs, localEvents, checkAlerts } from './subs'
import { lastNat } from './net'
import { getLook, getPrefs, type Family } from './settings'
import { resolveStyle, renderStyle } from './styles/index'

async function main() {
  const family = Widget.family as Family
  const prefs = getPrefs()
  let view
  try {
    const [loon, subs] = await Promise.all([loadLoon(), loadSubs()])
    await checkAlerts(subs, prefs.alerts).catch(e => console.log(`提醒发送失败: ${(e as Error).message}`))   // 发不出通知不影响小组件
    view = renderStyle(resolveStyle(Widget.parameter, family), family, {
      inApp: false, loon: loon.data, loonErr: loon.error, subs, look: getLook(), prefs, nat: lastNat(), local: localEvents(),
    })
  } catch (e) {
    view = <ErrorView message={(e as Error).message} />
  }
  Widget.present(view, { policy: 'after', date: new Date(Date.now() + prefs.refresh * 60_000) })
}

function ErrorView(props: { message: string }) {
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} widgetBackground={{ light: '#F2F2F7', dark: '#1C1C1E' }}>
      <Image systemName="exclamationmark.triangle.fill" font={20} foregroundStyle="#FF9F0A" />
      <Text font={11} foregroundStyle={{ light: '#6E6E73', dark: '#98989F' }} multilineTextAlignment="center" lineLimit={4}>
        {`${props.message.slice(0, 60)}\n打开 Loon 面板完成设置`}
      </Text>
    </VStack>
  )
}

main()
