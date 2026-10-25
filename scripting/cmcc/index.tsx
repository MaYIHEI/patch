// cmcc / index.tsx
// 配置脚本 — 在 Scripting app 里跑, 不是 widget
//
// 用途:
// 1) 第一次配置: 从 BoxJS 导入登录凭证, 存到 Keychain
// 2) 查看当前数据 / 立即刷新
// 3) 多账号切换 / 删除, 检查脚本更新

import {
  Button,
  Form,
  HStack,
  Image,
  LabeledContent,
  Navigation,
  NavigationStack,
  RoundedRectangle,
  Script,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  fetch,
  useEffect,
  useState,
} from 'scripting'
import type { Color } from 'scripting'
import {
  importFromBoxJS,
  removeAccount,
  clearCache,
  listAccounts,
  loadAccount,
  feeRaw,
  formatFlow,
  CmccError,
  type Account,
  type FlowPart,
} from './api'

declare const Safari: { openURL(url: string): Promise<boolean> }

const LOGO_URL = 'https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/cmcc.png'
const REMOTE_META = 'https://raw.githubusercontent.com/MaYIHEI/patch/main/scripting/cmcc/script.json'
const INSTALL_URL = 'scripting://import_scripts?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Fcmcc.zip%22%5D'
const HOMEPAGE = 'https://github.com/MaYIHEI/patch/tree/main/scripting/cmcc'

async function main() {
  await Navigation.present({ element: <SetupScreen /> })
  Script.exit()
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────
function remainText(f?: FlowPart): string {
  return f ? formatFlow(f.remainMB) : '-'
}

function flowText(f?: FlowPart): string {
  return f ? `剩 ${formatFlow(f.remainMB)} / ${formatFlow(f.totalMB)}` : '-'
}

function timeText(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function errorText(e: unknown): string {
  if (e instanceof CmccError && e.kind === 'auth') return '登录凭证已失效, 划掉中国移动 App 重开以重新抓取, 再导入'
  if (e instanceof CmccError && e.kind === 'risk') return '中国移动要求安全验证: 打开中国移动 App 按提示完成验证, 再点「立即刷新」'
  return (e as Error).message
}

/** "0.10.0" > "0.9.1" */
function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number), b = local.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

// ─────────────────────────────────────────────────────────────
// 行部件 — iOS 设置风格: 彩色圆角方块图标 + 标题
// ─────────────────────────────────────────────────────────────
function IconSquare(props: { icon: string; color: Color }) {
  return (
    <Image
      systemName={props.icon}
      font={13}
      fontWeight="semibold"
      foregroundStyle="white"
      frame={{ width: 28, height: 28 }}
      background={<RoundedRectangle cornerRadius={7} fill={props.color} />}
    />
  )
}

function InfoRow(props: { icon: string; color: Color; title: string; value: string }) {
  return (
    <LabeledContent
      label={
        <HStack spacing={12}>
          <IconSquare icon={props.icon} color={props.color} />
          <Text>{props.title}</Text>
        </HStack>
      }
      value={props.value}
    />
  )
}

function ActionRow(props: { icon: string; color: Color; title: string; detail?: string; disabled?: boolean; action: () => void }) {
  return (
    <Button action={props.action} disabled={props.disabled}>
      <HStack spacing={12}>
        <IconSquare icon={props.icon} color={props.color} />
        <Text foregroundStyle="label">{props.title}</Text>
        <Spacer />
        {props.detail ? <Text foregroundStyle="secondaryLabel">{props.detail}</Text> : null}
      </HStack>
    </Button>
  )
}

function Metric(props: { title: string; value: string }) {
  return (
    <VStack spacing={2} frame={{ maxWidth: 'infinity' }}>
      <Text font={17} fontWeight="semibold" fontDesign="rounded">{props.value}</Text>
      <Text font={12} foregroundStyle="secondaryLabel">{props.title}</Text>
    </VStack>
  )
}

/** 顶部账号卡: 图标 + 品牌 + 大号余额, 下面三项核心数据 */
function Hero(props: { account: Account | null; hint: string }) {
  const { account, hint } = props
  const sub = account
    ? [account.user?.brand, account.phoneTail ? `尾号 ${account.phoneTail}` : ''].filter(Boolean).join(' · ')
    : hint
  return (
    <VStack spacing={14} padding={{ vertical: 6 }}>
      <HStack spacing={14}>
        <Image imageUrl={LOGO_URL} resizable frame={{ width: 52, height: 52 }} clipShape={{ type: 'rect', cornerRadius: 12 }} />
        <VStack alignment="leading" spacing={3}>
          <Text font={17} fontWeight="semibold">中国移动</Text>
          <Text font={13} foregroundStyle="secondaryLabel">{sub}</Text>
        </VStack>
        <Spacer />
        {account ? (
          <VStack alignment="trailing" spacing={1}>
            <Text font={28} fontWeight="semibold" fontDesign="rounded" foregroundStyle={account.balance < 10 ? 'systemRed' : 'label'}>
              {account.balance.toFixed(2)}
            </Text>
            <Text font={12} foregroundStyle="secondaryLabel">话费余额 · 元</Text>
          </VStack>
        ) : null}
      </HStack>
      {account ? (
        <HStack>
          <Metric title="通用剩余" value={remainText(account.general)} />
          <Metric title="定向剩余" value={remainText(account.targeted)} />
          <Metric title="积分" value={account.points !== undefined ? String(account.points) : '-'} />
        </HStack>
      ) : null}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 页面
// ─────────────────────────────────────────────────────────────
function SetupScreen() {
  const dismiss = Navigation.useDismiss()
  const [host, setHost] = useState('boxjs.com')
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [tels, setTels] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [updateText, setUpdateText] = useState('')
  const [raw, setRaw] = useState('')
  const version = Script.metadata.version ?? '-'
  const configured = tels.length > 0

  useEffect(() => {
    const list = listAccounts()
    setTels(list)
    if (list.length > 0) select(list[0])
  }, [])

  async function run(task: () => Promise<Account>) {
    setBusy(true)
    setStatus('')
    try {
      setAccount(await task())
    } catch (e) {
      setStatus(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function select(tel: string) {
    setCurrent(tel)
    setAccount(null)
    run(() => loadAccount(tel))
  }

  function handleImport() {
    run(async () => {
      const imported = await importFromBoxJS(host.trim() || 'boxjs.com')
      const tel = imported[imported.length - 1]
      setTels(listAccounts())
      setCurrent(tel)
      return loadAccount(tel)
    })
  }

  function handleRefresh() {
    run(async () => {
      clearCache()
      return loadAccount(current)
    })
  }

  async function handleCheckUpdate() {
    setUpdateText('检查中...')
    try {
      const res = await fetch(REMOTE_META)
      const remote = String((await res.json() as { version?: string }).version ?? '')
      if (!remote || !isNewer(remote, version)) {
        setUpdateText('已是最新')
        return
      }
      setUpdateText(`有新版本 ${remote}`)
      const ok = await Dialog.confirm({
        title: `发现新版本 ${remote}`,
        message: `当前 ${version}, 更新会重新导入脚本, 登录凭证保留`,
        cancelLabel: '稍后',
        confirmLabel: '更新',
      })
      if (ok) await Safari.openURL(INSTALL_URL)
    } catch {
      setUpdateText('检查失败')
    }
  }

  async function handleFeeRaw() {
    setRaw('查询中...')
    try {
      setRaw(await feeRaw(current))
    } catch (e) {
      setRaw(errorText(e))
    }
  }

  async function handleRemove() {
    const ok = await Dialog.confirm({
      title: `删除尾号 ${current.slice(-4)}?`,
      message: '会删除 Keychain 里这个号的登录凭证',
      cancelLabel: '取消',
      confirmLabel: '删除',
    })
    if (!ok) return
    await removeAccount(current)
    const list = listAccounts()
    setTels(list)
    setStatus('')
    if (list.length > 0) select(list[0])
    else { setCurrent(''); setAccount(null) }
  }

  const hint = busy ? '查询中...' : configured ? '暂无数据' : '还没有导入凭证'
  const u = account?.user

  return (
    <NavigationStack>
      <Form
        navigationTitle="中国移动"
        navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}
      >
        <Section
          footer={
            account ? (
              <Text>{`更新于 ${timeText(account.fetchedAt)}${account.stale ? ' · 网络失败, 显示的是缓存' : ''}`}</Text>
            ) : undefined
          }
        >
          <Hero account={account} hint={hint} />
          {status ? <Text font={13} foregroundStyle="systemRed">{status}</Text> : null}
        </Section>

        {account ? (
          <Section header={<Text>套餐与账户</Text>}>
            {account.monthFee !== undefined ? (
              <InfoRow icon="creditcard.fill" color="systemBlue" title="本月消费" value={`¥${account.monthFee.toFixed(2)}`} />
            ) : null}
            <InfoRow icon="antenna.radiowaves.left.and.right" color="systemGreen" title="通用流量" value={flowText(account.general)} />
            <InfoRow icon="square.stack.3d.up.fill" color="systemTeal" title="定向流量" value={flowText(account.targeted)} />
            {account.voice?.total ? (
              <InfoRow icon="phone.fill" color="systemOrange" title="语音" value={`剩 ${Math.round(account.voice.remain)} / ${Math.round(account.voice.total)} 分钟`} />
            ) : null}
            {u?.starLevel ? <InfoRow icon="star.fill" color="systemYellow" title="星级" value={`${u.starLevel}星 · ${u.starScore ?? '-'}分`} /> : null}
            {u?.netYears !== undefined ? <InfoRow icon="calendar" color="systemIndigo" title="网龄" value={`${u.netYears.toFixed(1)} 年`} /> : null}
            {u?.channel ? <InfoRow icon="mappin.and.ellipse" color="systemPink" title="归属" value={u.channel} /> : null}
          </Section>
        ) : null}

        {configured ? (
          <Section
            header={<Text>账号</Text>}
            footer={
              <Text>
                {'小组件显示哪个号: 长按小组件 → 编辑小组件 → 参数, 填手机尾号 4 位; 不填显示第一个.\n添加另一个号: 在中国移动 App 里用「切换账号」登录该号 (别用「退出登录」), 划掉重开 App 让插件抓取, 再点「从 BoxJS 导入」, 插件里存的号会一次全部导入.'}
              </Text>
            }
          >
            {tels.map(t => (
              <ActionRow
                key={t}
                icon="person.crop.circle.fill"
                color={t === current ? 'systemBlue' : 'systemGray'}
                title={`尾号 ${t.slice(-4)}`}
                detail={t === current ? '当前' : undefined}
                disabled={busy}
                action={() => select(t)}
              />
            ))}
          </Section>
        ) : null}

        <Section
          header={<Text>登录凭证</Text>}
          footer={
            <Text>
              {'1) Loon 装好 paperclip 中国移动插件和 BoxJS\n2) 划掉中国移动 App 再重开, 收到「获取成功」通知\n3) 保持 Loon 开启, 点「从 BoxJS 导入」'}
            </Text>
          }
        >
          <LabeledContent
            label={
              <HStack spacing={12}>
                <IconSquare icon="shippingbox.fill" color="systemGray" />
                <Text>BoxJS 域名</Text>
              </HStack>
            }
          >
            <TextField title="boxjs.com" value={host} onChanged={setHost} multilineTextAlignment="trailing" />
          </LabeledContent>
          <ActionRow icon="square.and.arrow.down.fill" color="systemBlue" title="从 BoxJS 导入" detail={busy ? '处理中...' : undefined} disabled={busy} action={handleImport} />
          {configured ? (
            <ActionRow icon="arrow.clockwise" color="systemGreen" title="立即刷新" disabled={busy} action={handleRefresh} />
          ) : null}
        </Section>

        <Section header={<Text>关于</Text>}>
          <InfoRow icon="info.circle.fill" color="systemGray" title="版本" value={version} />
          <ActionRow icon="arrow.down.circle.fill" color="systemPurple" title="检查更新" detail={updateText || undefined} action={handleCheckUpdate} />
          <ActionRow icon="link" color="systemGray" title="项目主页" action={() => { Safari.openURL(HOMEPAGE) }} />
          {configured ? (
            <ActionRow icon="ladybug.fill" color="systemOrange" title="话费原始数据" detail={`尾号 ${current.slice(-4)}`} action={handleFeeRaw} />
          ) : null}
          {raw ? <Text font={12} fontDesign="monospaced" foregroundStyle="secondaryLabel">{raw}</Text> : null}
        </Section>

        {configured ? (
          <Section footer={<Text>凭证只存本机 Keychain, 导入后小组件每次刷新自动续期, 不再需要 Loon.</Text>}>
            <Button title={`删除尾号 ${current.slice(-4)}`} role="destructive" action={handleRemove} />
          </Section>
        ) : null}
      </Form>
    </NavigationStack>
  )
}

main()
