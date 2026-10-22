// cmcc / index.tsx
// 配置脚本 — 在 Scripting app 里跑, 不是 widget
//
// 用途:
// 1) 第一次配置: 从 BoxJS 导入登录凭证, 存到 Keychain
// 2) 查看当前数据 / 立即刷新
// 3) 清除配置

import {
  Button,
  Form,
  LabeledContent,
  Navigation,
  NavigationStack,
  Script,
  Section,
  Text,
  TextField,
  useEffect,
  useState,
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
  type FlowPart,
} from './api'

async function main() {
  await Navigation.present({ element: <SetupScreen /> })
  Script.exit()
}

function flowText(f?: FlowPart): string {
  return f ? `剩 ${formatFlow(f.remainMB)} / ${formatFlow(f.totalMB)}` : '-'
}

function timeText(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function errorText(e: unknown): string {
  if (e instanceof CmccError && e.kind === 'auth') return '登录凭证已失效, 划掉中国移动 App 重开以重新抓取, 再导入'
  return (e as Error).message
}

function SetupScreen() {
  const dismiss = Navigation.useDismiss()
  const [host, setHost] = useState('boxjs.com')
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    hasCredentials().then(ok => {
      setConfigured(ok)
      if (ok) run(async () => loadAccount())
    })
  }, [])

  async function run(task: () => Promise<Account>) {
    setBusy(true)
    setStatus('')
    try {
      setAccount(await task())
      setConfigured(true)
    } catch (e) {
      setStatus(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function handleImport() {
    run(async () => {
      await importFromBoxJS(host.trim() || 'boxjs.com')
      return loadAccount()
    })
  }

  function handleRefresh() {
    run(async () => {
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
    setAccount(null)
    setStatus('')
  }

  return (
    <NavigationStack>
      <Form
        navigationTitle="中国移动"
        navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}
      >
        <Section
          header={<Text>{account?.phoneTail ? `账号 · 尾号 ${account.phoneTail}` : '账号'}</Text>}
          footer={
            account ? (
              <Text>{`更新于 ${timeText(account.fetchedAt)}${account.stale ? ' · 网络失败, 显示的是缓存' : ''}`}</Text>
            ) : undefined
          }
        >
          {account ? <LabeledContent title="话费余额" value={`¥${account.balance.toFixed(2)}`} /> : null}
          {account?.monthFee !== undefined ? <LabeledContent title="本月消费" value={`¥${account.monthFee.toFixed(2)}`} /> : null}
          {account ? <LabeledContent title="通用流量" value={flowText(account.general)} /> : null}
          {account ? <LabeledContent title="定向流量" value={flowText(account.targeted)} /> : null}
          {account ? <LabeledContent title="语音" value={`${account.voice ? Math.round(account.voice.remain) : 0} 分钟`} /> : null}
          {account ? <LabeledContent title="积分" value={account.points !== undefined ? String(account.points) : '-'} /> : null}
          {account ? null : (
            <Text foregroundStyle="secondaryLabel">
              {busy ? '查询中...' : configured ? '暂无数据, 点下方「立即刷新」' : '还没有导入凭证'}
            </Text>
          )}
          {status ? <Text foregroundStyle="systemRed">{status}</Text> : null}
        </Section>

        <Section
          header={<Text>凭证</Text>}
          footer={
            <Text>
              {'1) Loon 装好 paperclip 中国移动插件和 BoxJS\n2) 划掉中国移动 App 再重开, 收到「获取成功」通知\n3) 保持 Loon 开启, 点「从 BoxJS 导入」'}
            </Text>
          }
        >
          <LabeledContent title="BoxJS 域名">
            <TextField title="boxjs.com" value={host} onChanged={setHost} />
          </LabeledContent>
          <Button
            title={busy ? '处理中...' : '从 BoxJS 导入'}
            systemImage="square.and.arrow.down"
            disabled={busy}
            action={handleImport}
          />
          {configured ? (
            <Button title="立即刷新" systemImage="arrow.clockwise" disabled={busy} action={handleRefresh} />
          ) : null}
        </Section>

        {configured ? (
          <Section footer={<Text>凭证只存本机 Keychain, 导入后小组件每次刷新自动续期, 不再需要 Loon.</Text>}>
            <Button title="清除配置" systemImage="trash" foregroundStyle="systemRed" action={handleClear} />
          </Section>
        ) : null}
      </Form>
    </NavigationStack>
  )
}

main()
