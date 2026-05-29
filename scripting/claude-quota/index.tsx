// claude-quota / setup.ts
// 配置脚本 — 在 Scripting app 里跑, 不是 widget
//
// 用途:
// 1) 第一次配置: 弹输入框让你粘 cookie 和 org_id, 存到 Keychain
// 2) 更新 cookie: cookie 过期后重新粘
// 3) 查看当前状态: 已配置 / 未配置
// 4) 清除配置: 退出登录

import {
  VStack,
  HStack,
  Text,
  Button,
  TextField,
  Spacer,
  Script,
  Navigation,
  useState,
  useEffect,
} from 'scripting'
import type { Color } from 'scripting'
import {
  saveCredentials,
  clearCredentials,
  clearCache,
  hasCredentials,
  loadQuota,
  QuotaError,
} from './api'

async function main() {
  await Navigation.present({ element: <SetupScreen /> })
  Script.exit()
}

function formatMs(ms: number): string {
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d${h % 24}h`
  if (h > 0) return `${h}h${m % 60}m`
  return `${m}m`
}


function SetupScreen() {
  const [cookie, setCookie] = useState('')
  const [orgId, setOrgId] = useState('')
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(false)

  // 启动时检查现有配置
  useEffect(() => {
    hasCredentials().then(setConfigured)
  }, [])

  async function handleSave() {
    if (!cookie.trim() || !orgId.trim()) {
      setStatus('cookie 和 org_id 都得填')
      return
    }
    setBusy(true)
    setStatus('保存中...')
    try {
      await saveCredentials(cookie.trim(), orgId.trim())
      setStatus('已保存, 正在测试...')
      const quota = await loadQuota()
      setStatus(
        `✅ 测试通过\n` +
          `5h: ${Math.round(quota.fiveHour.percent)}%\n` +
          (quota.sevenDay
            ? `7d: ${Math.round(quota.sevenDay.percent)}%\n`
            : '') +
          `回桌面长按空白区添加 Scripting widget, 选 claude-quota`,
      )
      setConfigured(true)
      setCookie('')
    } catch (e) {
      const err = e as Error
      if (e instanceof QuotaError) {
        if (e.kind === 'auth') setStatus('❌ Cookie 无效或已过期, 重新抓一次')
        else if (e.kind === 'schema') setStatus('❌ org_id 可能不对')
        else setStatus(`❌ ${e.kind}: ${err.message}`)
      } else {
        setStatus(`❌ ${err.message}`)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleForceRefresh() {
    setBusy(true)
    setStatus('清除缓存, 实时拉取...')
    try {
      clearCache()
      const quota = await loadQuota()
      const lines = [
        `✅ 拉取成功`,
        `5h: ${Math.round(quota.fiveHour.percent)}%  ↻${formatMs(quota.fiveHour.resetsInMs)}`,
        quota.sevenDay
          ? `7d: ${Math.round(quota.sevenDay.percent)}%  ↻${formatMs(quota.sevenDay.resetsInMs)}`
          : '',
        quota.sevenDayOpus
          ? `Opus: ${Math.round(quota.sevenDayOpus.percent)}%  ↻${formatMs(quota.sevenDayOpus.resetsInMs)}`
          : '',
        quota.sevenDaySonnet
          ? `Sonnet: ${Math.round(quota.sevenDaySonnet.percent)}%  ↻${formatMs(quota.sevenDaySonnet.resetsInMs)}`
          : '',
      ].filter(Boolean).join('\n')
      setStatus(lines)
    } catch (e) {
      const err = e as Error
      setStatus(`❌ ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    const ok = await Dialog.confirm({
      title: '清除配置?',
      message: '会删除 Keychain 里的 cookie 和 org_id',
      cancelLabel: '取消',
      confirmLabel: '清除',
    })
    if (!ok) return
    await clearCredentials()
    setConfigured(false)
    setStatus('已清除')
  }

  return (
    <VStack spacing={16} padding={20} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Text font="title2">Claude Quota 配置</Text>

      <Text font="caption" foregroundStyle={"gray"}>
        {configured
          ? '已配置. 可重新粘 cookie 更新, 或清除配置'
          : '首次使用, 按下方步骤粘 cookie 和 org_id'}
      </Text>

      <VStack spacing={8}>
        <Text font="caption" foregroundStyle={"gray"}>
          Cookie (claude.ai 浏览器 DevTools → Network → Request Headers → Cookie 整段复制)
        </Text>
        <TextField
          title="cookie"
          value={cookie}
          onChanged={setCookie}
          axis="vertical"
          lineLimit={{ min: 3, max: 5 }}
        />
      </VStack>

      <VStack spacing={8}>
        <Text font="caption" foregroundStyle={"gray"}>
          Organization ID (Network 标签里 URL 含 organizations/&lt;UUID&gt; 那段)
        </Text>
        <TextField
          title="org_id"
          value={orgId}
          onChanged={setOrgId}
        />
      </VStack>

      <HStack spacing={12}>
        <Button
          title={busy ? '处理中...' : '保存并测试'}
          buttonStyle="borderedProminent"
          disabled={busy}
          action={handleSave}
        />
        {configured && (
          <Button
            title="强制刷新"
            buttonStyle="bordered"
            disabled={busy}
            action={handleForceRefresh}
          />
        )}
        {configured && (
          <Button
            title="清除配置"
            buttonStyle="bordered"
            tint="red"
            action={handleClear}
          />
        )}
      </HStack>

      {!!status && (
        <Text
          font="caption"
          foregroundStyle={
            status.startsWith('✅') ? "green" : "label"
          }
        >
          {status}
        </Text>
      )}

      <Spacer />

      <Text font="caption2" foregroundStyle={"gray"}>
        所有数据存本机 Keychain, 不上传任何服务. Cookie 一般几周后失效,
        失效时打开本脚本重新粘.
      </Text>
    </VStack>
  )
}

main()
