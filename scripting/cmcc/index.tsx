// cmcc / index.tsx
// 配置脚本 — 在 Scripting app 里跑, 不是 widget
//
// 用途:
// 1) 第一次配置: 从 BoxJS 导入登录凭证, 存到 Keychain
// 2) 强制刷新: 跳过缓存实时查询
// 3) 清除配置

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
import {
  importFromBoxJS,
  clearCredentials,
  clearCache,
  hasCredentials,
  loadAccount,
  formatFlow,
  CmccError,
  type Account,
} from './api'

async function main() {
  await Navigation.present({ element: <SetupScreen /> })
  Script.exit()
}

function summary(a: Account): string {
  return [
    `话费: ¥${a.balance.toFixed(2)}`,
    a.general ? `通用流量: 剩 ${formatFlow(a.general.remainMB)} / ${formatFlow(a.general.totalMB)}` : '',
    a.targeted ? `定向流量: 剩 ${formatFlow(a.targeted.remainMB)} / ${formatFlow(a.targeted.totalMB)}` : '',
    a.points !== undefined ? `积分: ${a.points}` : '',
  ].filter(Boolean).join('\n')
}

function SetupScreen() {
  const [host, setHost] = useState('boxjs.com')
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    hasCredentials().then(setConfigured)
  }, [])

  async function run(label: string, task: () => Promise<Account>) {
    setBusy(true)
    setStatus(label)
    try {
      const a = await task()
      setStatus(`✅ 查询成功\n${summary(a)}`)
      setConfigured(true)
    } catch (e) {
      const err = e as Error
      if (e instanceof CmccError && e.kind === 'auth') setStatus('❌ 登录凭证已失效, 打开中国移动 App 重新抓取后再导入')
      else setStatus(`❌ ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  function handleImport() {
    run('从 BoxJS 导入...', async () => {
      await importFromBoxJS(host.trim() || 'boxjs.com')
      return loadAccount()
    })
  }

  function handleRefresh() {
    run('实时查询...', async () => {
      clearCache()
      return loadAccount()
    })
  }

  async function handleClear() {
    const ok = await Dialog.confirm({
      title: '清除配置?',
      message: '会删除 Keychain 里的登录凭证',
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
      <Text font="title2">中国移动 配置</Text>

      <Text font="caption" foregroundStyle={"gray"}>
        {configured
          ? '已配置. 凭证失效时重新导入即可'
          : '先在 Loon 里用 paperclip 中国移动插件抓到凭证, 再保持 Loon 开启点导入'}
      </Text>

      <VStack spacing={8}>
        <Text font="caption" foregroundStyle={"gray"}>BoxJS 域名</Text>
        <TextField title="boxjs.com" value={host} onChanged={setHost} />
      </VStack>

      <HStack spacing={12}>
        <Button
          title={busy ? '处理中...' : '从 BoxJS 导入'}
          buttonStyle="borderedProminent"
          disabled={busy}
          action={handleImport}
        />
        {configured && (
          <Button title="强制刷新" buttonStyle="bordered" disabled={busy} action={handleRefresh} />
        )}
        {configured && (
          <Button title="清除配置" buttonStyle="bordered" tint="red" action={handleClear} />
        )}
      </HStack>

      {!!status && (
        <Text font="caption" foregroundStyle={status.startsWith('✅') ? "green" : "label"}>
          {status}
        </Text>
      )}

      <Spacer />

      <Text font="caption2" foregroundStyle={"gray"}>
        凭证只存本机 Keychain, 导入后小组件每次刷新自动续期, 不再需要 Loon.
      </Text>
    </VStack>
  )
}

main()
