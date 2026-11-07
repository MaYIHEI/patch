// cmcc / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// 每次刷新先用旧会话查, 失效才续登. 样式见 styles/index.tsx
// 参数: 「样式名 尾号」, 如「账单卡 1234」「双号对照 主号:1234,副号:5678」; 只写尾号 / 不填用该尺寸的默认样式

import { Widget } from 'scripting'

import { getData, getLook, type Family } from './settings'
import { parseParam, resolveStyle, renderStyle } from './styles/index'
import { loadSlots } from './slots'
import { readPage } from './app_intents'

async function main() {
  const family = Widget.family as Family
  const { style: name, accounts } = parseParam(Widget.parameter)
  const style = resolveStyle(name, family, accounts.length)
  const slots = await loadSlots(style, accounts)
  Widget.present(
    renderStyle(style, family, { inApp: false, slots, look: getLook(), page: readPage() }),
    { policy: 'after', date: new Date(Date.now() + getData().refresh * 60_000) },
  )
}

main()
