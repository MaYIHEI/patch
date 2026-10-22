// cmcc / app_intents.tsx
// 小组件上的刷新按钮: 跳过缓存重新查询

import { AppIntentManager, AppIntentProtocol, Widget } from 'scripting'
import { clearCache } from './api'

export const RefreshIntent = AppIntentManager.register({
  name: 'CmccRefreshIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    clearCache()
    Widget.reloadAll()
  },
})
