// loon-panel / app_intents.tsx
// 小组件、控制中心按钮的动作 (官方要求全部写在这个文件), 都走 Loon 插件的操作地址

import { AppIntentManager, AppIntentProtocol, Widget, ControlWidget } from 'scripting'

import { setLoon, loadLoon, mainGroup, ownerGroup, switchTarget } from './loon'
import { loadSubs } from './subs'
import { getPrefs } from './settings'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

/** 最近一次按钮操作的结果, 小组件重绘时显示 (失败原因 / 成功提示), 1 分钟后不再显示 */
export const NOTE_KEY = 'loonpanel.note'
export type Note = { t: number; ok: boolean; text: string }
export function readNote(): Note | null {
  const n = AppStorage.get<Note>(NOTE_KEY)
  return n && Date.now() - n.t < 60_000 ? n : null
}

// 小组件按钮在后台跑, 有时间限制 (系统没公开具体秒数, 留足余量)
const TIMEOUT_S = 20

async function run(q: { mode?: number; group?: string; node?: string }, okText: string) {
  try {
    await setLoon(q, TIMEOUT_S)
    AppStorage.set(NOTE_KEY, { t: Date.now(), ok: true, text: okText })
  } catch (e) {
    AppStorage.set(NOTE_KEY, { t: Date.now(), ok: false, text: (e as Error).message.slice(0, 40) })
  }
  Widget.reloadAll()
}

export const ModeIntent = AppIntentManager.register({
  name: 'LoonPanelModeIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ mode }: { mode: number }) => {
    await run({ mode }, '已切换模式')
  },
})

export const SwitchIntent = AppIntentManager.register({
  name: 'LoonPanelSwitchIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ group, node }: { group: string; node: string }) => {
    await run({ group, node }, `${group} → ${node}`)
  },
})

/** 不带参数 = 复测各策略组当前节点 */
export const CheckIntent = AppIntentManager.register({
  name: 'LoonPanelCheckIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await run({}, '体检完成')
  },
})

/** 右上角刷新: 重读订阅用量, 小组件重绘时再读 Loon */
export const RefreshIntent = AppIntentManager.register({
  name: 'LoonPanelRefreshIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await loadSubs(true)
    Widget.reloadAll()
  },
})

/** 主策略组切到体检最快的节点 */
async function fastest() {
  const { data } = await loadLoon()
  const main = data && !data.stale ? mainGroup(data, getPrefs()) : undefined
  const g = main && data ? ownerGroup(data, main) : undefined
  const target = g && data ? switchTarget(data, g) : undefined
  if (g && target) await run({ group: g.name, node: target }, `${g.name} → ${target}`)
  else {
    AppStorage.set(NOTE_KEY, { t: Date.now(), ok: false, text: '没有可切换的节点' })
    Widget.reloadAll()
  }
}

export const FastestIntent = AppIntentManager.register({
  name: 'LoonPanelFastestIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await fastest()
    ControlWidget.reloadButtons()
  },
})

/** 控制中心开关: 开 = 全局代理, 关 = 分流 */
export const ModeToggleIntent = AppIntentManager.register({
  name: 'LoonPanelModeToggleIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ value }: { value: boolean }) => {
    await run({ mode: value ? 2 : 1 }, '已切换模式')
    ControlWidget.reloadToggles()
  },
})
