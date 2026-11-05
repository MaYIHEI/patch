// loon-panel / index.tsx
// App 页面 — 在 Scripting 里运行, 不是 widget
//
// 首页: 首次引导 + 状态卡 + 四个入口 (样式库 / 外观 / 订阅 / 设置) + Loon (模式、策略组、立即体检)

import {
  Button,
  ColorPicker,
  EditButton,
  ForEach,
  Form,
  HStack,
  Image,
  LabeledContent,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Picker,
  RoundedRectangle,
  Circle,
  Script,
  ScrollView,
  Section,
  Slider,
  Spacer,
  Text,
  Toggle,
  VStack,
  ZStack,
  Widget,
  Path,
  fetch,
  useEffect,
  useState,
} from 'scripting'

import { loadLoon, cachedLoon, setLoon, sampleLoon, mainGroup, healthCount, clearLoonCache, MODES, DATA_URL, type LoonData, type Group } from './loon'
import {
  loadSubs, cachedSubs, sampleSubs, listSubs, saveSubs, addSub, updateSub, removeSub, fetchUsage, clearHistory, recordedDays,
  fmtBytes, expireText, shiftDay, todayStr, type SubView,
} from './subs'
import {
  getPrefs, setPrefs, getLook, setLook, getDefaults, setDefault,
  DEFAULT_LOOK, RECOMMENDED_BG, RECOMMENDED_ACCENT, type Look, type Family, type Prefs,
} from './settings'
import { makeTheme, UsageRing, DailyBars, latencyColor, latencyText, nodeLabel, asnText, ago, hhmm, chunk, usageColor, OK, BAD, WARN, type Ctx } from './ui'
import { STYLES, stylesFor, styleById, paramOf, renderStyle, type StyleDef } from './styles/index'

declare const Safari: { openURL(url: string): Promise<boolean> }

const REMOTE_META = 'https://raw.githubusercontent.com/MaYIHEI/patch/main/scripting/loon-panel/script.json'
const INSTALL_URL = 'https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Floon-panel.zip%22%5D'
const PLUGIN_URL = 'https://raw.githubusercontent.com/MaYIHEI/patch/refs/heads/main/scripting/loon-panel/loon/loon-panel.lpx'
const LOON_IMPORT = `loon://import?plugin=${encodeURIComponent(PLUGIN_URL)}`
const BG_PATH = () => Path.join(FileManager.appGroupDocumentsDirectory, 'loon-panel', 'background.jpg')

async function main() {
  await Navigation.present({ element: <Home /> })
  Script.exit()
}

// ─────────────────────────────────────────────────────────────
// 共用
// ─────────────────────────────────────────────────────────────
const CARD = 'secondarySystemGroupedBackground'

type Shared = { loon: LoonData | null; loonErr: string; subs: SubView[]; reload: (force?: boolean) => Promise<void> }

const BOX: Record<Family, { width: number; height: number }> = {
  systemSmall: { width: 158, height: 158 },
  systemMedium: { width: 338, height: 158 },
  systemLarge: { width: 338, height: 354 },
  accessoryCircular: { width: 76, height: 76 },
  accessoryRectangular: { width: 172, height: 76 },
}

const FAMILY_NAME: Record<Family, string> = {
  systemSmall: '小号', systemMedium: '中号', systemLarge: '大号', accessoryCircular: '锁屏圆形', accessoryRectangular: '锁屏长条',
}

/** 按真实尺寸渲染一个小组件; scale < 1 时整体缩小 (外框也跟着缩) */
function Preview(props: { style: StyleDef; family: Family; loon: LoonData | null; subs: SubView[]; look?: Look; scale?: number }) {
  const box = BOX[props.family]
  const k = props.scale ?? 1
  const view = renderStyle(props.style, props.family, {
    inApp: true, loon: props.loon, loonErr: '', subs: props.subs, look: props.look ?? getLook(), prefs: getPrefs(),
  })
  return (
    <ZStack frame={{ width: box.width * k, height: box.height * k }} clipped>
      <VStack frame={box} scaleEffect={k}>{view}</VStack>
    </ZStack>
  )
}

function appCtx(loon: LoonData | null, subs: SubView[]): Ctx {
  return { th: makeTheme(DEFAULT_LOOK), size: 'm', inApp: true, loon, loonErr: '', subs, prefs: getPrefs() }
}

function SectionTitle(props: { title: string }) {
  return <Text font={13} fontWeight="medium" foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>{props.title}</Text>
}

function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number), b = local.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/** 首屏和样式库用: 有真实数据用真实的, 没有用示例 */
const previewData = (p: Shared) => ({ loon: p.loon ?? sampleLoon(), subs: p.subs.length ? p.subs : sampleSubs() })

// ─────────────────────────────────────────────────────────────
// 首页
// ─────────────────────────────────────────────────────────────
function Home() {
  const dismiss = Navigation.useDismiss()
  const [loon, setLoonData] = useState<LoonData | null>(cachedLoon())
  const [loonErr, setLoonErr] = useState('')
  const [subs, setSubs] = useState<SubView[]>(cachedSubs())
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [tick, setTick] = useState(0)   // 子页面改了设置后刷新入口卡的副标题

  useEffect(() => { reload() }, [])

  async function reload(force = false) {
    const [l, s] = await Promise.all([loadLoon(), loadSubs(force)])
    setLoonData(l.data)
    setLoonErr(l.error)
    setSubs(s)
    setTick(tick + 1)
    Widget.reloadAll()
  }

  /** 操作地址: 切模式 / 切节点 / 复测 */
  async function act(q: { mode?: number; group?: string; node?: string }, label: string) {
    setBusy(label)
    setNote(`${label}...`)
    try {
      const d = await setLoon(q)
      setLoonData(d)
      setLoonErr('')
      setNote(`${label}完成${d.check ? ` · 复测 ${d.check.tested} 个节点` : ''}`)
      Widget.reloadAll()
    } catch (e) {
      setNote(`${label}失败: ${(e as Error).message}`)
    }
    setBusy('')
  }

  const shared: Shared = { loon, loonErr, subs, reload }
  const look = getLook()
  const prefs = getPrefs()
  const live = loon && !loon.stale

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle="Loon 面板"
        background="systemGroupedBackground"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
          topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={() => reload(true)} />,
        }}
      >
        <VStack alignment="leading" spacing={20} padding={16}>
          {!live || !subs.length || !loon?.check ? <Guide shared={shared} act={act} busy={busy} /> : null}

          <StatusCard loon={loon} loonErr={loonErr} subs={subs} />

          {/* 四个大入口 */}
          <VStack spacing={12}>
            <HStack spacing={12}>
              <NavigationLink destination={<StyleLibrary {...shared} onChanged={() => setTick(tick + 1)} />}>
                <EntryCard icon="square.grid.2x2.fill" color="systemBlue" title="样式库" sub={`${STYLES.length} 种样式`} />
              </NavigationLink>
              <NavigationLink destination={<AppearancePage {...shared} onChanged={() => setTick(tick + 1)} />}>
                <EntryCard icon="paintpalette.fill" color="systemOrange" title="外观" sub={look.mode === 'plain' ? '素净' : look.bgType === 'image' ? '自定义 · 图片' : '自定义 · 纯色'} />
              </NavigationLink>
            </HStack>
            <HStack spacing={12}>
              <NavigationLink destination={<SubsPage {...shared} />}>
                <EntryCard icon="airplane" color="systemGreen" title="订阅" sub={subs.length ? `${subs.length} 个机场` : '还没添加'} />
              </NavigationLink>
              <NavigationLink destination={<SettingsPage {...shared} onChanged={() => setTick(tick + 1)} />}>
                <EntryCard icon="gearshape.fill" color="systemGray" title="设置" sub={`每 ${prefs.refresh} 分钟刷新`} />
              </NavigationLink>
            </HStack>
          </VStack>

          {/* Loon: 模式 + 策略组 */}
          {loon ? (
            <VStack alignment="leading" spacing={8}>
              <SectionTitle title={loon.stale ? `Loon · 连不上, 显示 ${hhmm(loon.t)} 的数据` : 'Loon'} />
              <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD} />}>
                <HStack padding={{ horizontal: 14, vertical: 10 }}>
                  <Picker title="模式" value={loon.mode} onChanged={(v: any) => { if (Number(v) !== loon.mode) act({ mode: Number(v) }, '切换模式') }} pickerStyle="segmented" disabled={!!busy || !live}>
                    {MODES.map(m => <Text tag={m.id}>{m.name}</Text>)}
                  </Picker>
                </HStack>
                {loon.groups.map(g => (
                  <NavigationLink destination={<GroupPage group={g} loon={loon} act={act} />}>
                    <GroupLine group={g} loon={loon} />
                  </NavigationLink>
                ))}
                <Button action={() => { act({}, '体检当前节点') }} buttonStyle="plain" disabled={!!busy || !live}>
                  <HStack padding={{ horizontal: 14, vertical: 13 }}>
                    <Text font={15} foregroundStyle={busy || !live ? 'tertiaryLabel' : 'systemBlue'}>立即体检当前节点</Text>
                    <Spacer />
                    <Text font={12} foregroundStyle="secondaryLabel">{loon.check ? `上次 ${ago(loon.check.t)}` : '还没体检过'}</Text>
                  </HStack>
                </Button>
              </VStack>
              {note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>{note}</Text> : null}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}

function StatusCard(props: { loon: LoonData | null; loonErr: string; subs: SubView[] }) {
  const { loon, subs } = props
  const s = subs[0]
  const g = loon ? mainGroup(loon, getPrefs()) : undefined
  const r = g && loon ? loon.nodes[g.leaf] : undefined
  const status = !loon
    ? { text: props.loonErr ? '读不到 Loon 数据' : '读取中...', color: props.loonErr ? BAD : 'secondaryLabel' }
    : loon.stale ? { text: `连不上 Loon · 显示 ${hhmm(loon.t)} 的数据`, color: WARN } : { text: 'Loon 插件已连接', color: OK }
  return (
    <HStack spacing={16} padding={18} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={22} fill={CARD} />}>
      {s?.usage ? (
        <UsageRing ctx={appCtx(loon, subs)} ratio={s.ratio} size={78} line={10}>
          <VStack spacing={0}>
            <Text font={20} fontWeight="bold" fontDesign="rounded" monospacedDigit>{s.usage.total > 0 ? `${Math.round(s.ratio * 100)}%` : '∞'}</Text>
            <Text font={11} foregroundStyle="secondaryLabel">已用</Text>
          </VStack>
        </UsageRing>
      ) : (
        <ZStack frame={{ width: 88, height: 88 }}>
          <Circle stroke={{ shapeStyle: 'tertiarySystemFill', strokeStyle: { lineWidth: 10 } }} frame={{ width: 78, height: 78 }} />
          <Image systemName={s ? 'exclamationmark' : 'plus'} font={22} foregroundStyle="tertiaryLabel" />
        </ZStack>
      )}
      <VStack alignment="leading" spacing={5}>
        <Text font={19} fontWeight="bold" lineLimit={1}>{s ? s.name : '还没有添加订阅'}</Text>
        {s?.usage ? <Text font={14} foregroundStyle="secondaryLabel">{s.usage.total > 0 ? `剩 ${fmtBytes(Math.max(0, s.usage.total - s.used))} · ${s.fc.short}` : `已用 ${fmtBytes(s.used)}`}</Text> : s?.err ? <Text font={13} foregroundStyle={BAD}>{s.err}</Text> : null}
        {g ? <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>{`${g.name}: ${nodeLabel(g.leaf, r)} · ${latencyText(r)}`}</Text> : null}
        <HStack spacing={6}>
          <Circle fill={status.color} frame={{ width: 7, height: 7 }} />
          <Text font={12} foregroundStyle={status.color} lineLimit={2}>{status.text}</Text>
        </HStack>
      </VStack>
      <Spacer />
    </HStack>
  )
}

function EntryCard(props: { icon: string; color: string; title: string; sub: string }) {
  return (
    <VStack alignment="leading" spacing={14} padding={14} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={18} fill={CARD} />}>
      <Image systemName={props.icon} font={17} fontWeight="semibold" foregroundStyle="white" frame={{ width: 34, height: 34 }} background={<RoundedRectangle cornerRadius={9} fill={props.color} />} />
      <VStack alignment="leading" spacing={2}>
        <Text font={17} fontWeight="semibold" foregroundStyle="label">{props.title}</Text>
        <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.sub}</Text>
      </VStack>
    </VStack>
  )
}

function GroupLine(props: { group: Group; loon: LoonData }) {
  const { group: g, loon } = props
  const r = loon.nodes[g.leaf]
  return (
    <HStack spacing={10} padding={{ horizontal: 14, vertical: 11 }}>
      <VStack alignment="leading" spacing={1}>
        <Text font={15} foregroundStyle="label" lineLimit={1}>{g.name}</Text>
        <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{g.now === g.leaf ? nodeLabel(g.leaf, r) : `${g.now} → ${nodeLabel(g.leaf, r)}`}</Text>
      </VStack>
      <Spacer />
      <Text font={13} fontWeight="medium" monospacedDigit foregroundStyle={latencyColor(r)}>{latencyText(r)}</Text>
      <Image systemName="chevron.right" font={13} foregroundStyle="tertiaryLabel" />
    </HStack>
  )
}

/** 首次引导: 导入插件 → 添加订阅 → 跑一次体检; 做完的打勾 */
function Guide(props: { shared: Shared; act: (q: {}, label: string) => Promise<void>; busy: string }) {
  const { loon, loonErr, subs, reload } = props.shared
  const live = !!loon && !loon.stale
  const step = (n: number, done: boolean, title: string, sub: string, button: any) => (
    <HStack spacing={12} padding={{ horizontal: 14, vertical: 12 }}>
      {done
        ? <Image systemName="checkmark.circle.fill" font={26} foregroundStyle="systemGreen" frame={{ width: 28, height: 28 }} />
        : <Text font={15} fontWeight="bold" foregroundStyle="white" frame={{ width: 28, height: 28 }} background={<Circle fill="systemBlue" />}>{String(n)}</Text>}
      <VStack alignment="leading" spacing={2}>
        <Text font={15} fontWeight="medium">{title}</Text>
        <Text font={12} foregroundStyle="secondaryLabel">{sub}</Text>
      </VStack>
      <Spacer />
      {button}
    </HStack>
  )
  return (
    <VStack alignment="leading" spacing={8}>
      <SectionTitle title="开始使用" />
      <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD} />}>
        {step(1, live, '导入 Loon 插件', live ? '已连上插件' : '一键添加「Loon 面板」插件, 装好后回来刷新',
          <Button title={live ? '刷新' : '导入'} buttonStyle="bordered" controlSize="small" action={() => { live ? reload() : Safari.openURL(LOON_IMPORT) }} />)}
        {step(2, subs.length > 0, '添加机场订阅', subs.length ? `已添加 ${subs.length} 个` : '订阅链接只存在钥匙串里',
          <NavigationLink destination={<SubsPage {...props.shared} />}><Text font={14} foregroundStyle="systemBlue">添加</Text></NavigationLink>)}
        {step(3, !!loon?.check, '跑一次体检', loon?.check ? `上次 ${ago(loon.check.t)}` : '测当前节点的延迟和出口; 之后插件定时体检',
          <Button title="体检" buttonStyle="bordered" controlSize="small" disabled={!live || !!props.busy} action={() => { props.act({}, '体检当前节点') }} />)}
      </VStack>
      {!live ? (
        <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>
          {`${loonErr ? `${loonErr}\n` : ''}读不到数据? 保持 Loon 开启, 用 Safari 打开 ${DATA_URL}, 能看到一段 JSON 才说明 Loon 已经接管; 看不到就检查插件是否已启用。不要把 1.1.1.1 加进 Loon 的 bypass-tun 或 skip-proxy。`}
        </Text>
      ) : null}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 策略组: 列出可选项和体检延迟, 点一下切换
// ─────────────────────────────────────────────────────────────
function GroupPage(props: { group: Group; loon: LoonData; act: (q: { group: string; node: string }, label: string) => Promise<void> }) {
  const [g, setG] = useState(props.group)
  const [busy, setBusy] = useState('')
  const loon = props.loon
  const groupNames = new Set(loon.groups.map(x => x.name))

  async function pick(node: string) {
    if (node === g.now || busy) return
    setBusy(node)
    await props.act({ group: g.name, node }, `切换到 ${node}`)
    const fresh = cachedLoon()?.groups.find(x => x.name === g.name)
    if (fresh) setG(fresh)
    setBusy('')
  }

  return (
    <List navigationTitle={g.name} navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>点一行切换。延迟来自最近一次体检; 没测过的显示「未测」, 想测全部节点可以在插件参数「全量体检的策略组」里填这个策略组。</Text>}>
        {g.subs.map(name => {
          const r = loon.nodes[name]
          const isGroup = groupNames.has(name)
          return (
            <Button action={() => { pick(name) }} buttonStyle="plain">
              <HStack spacing={10}>
                <Image systemName={name === g.now ? 'checkmark.circle.fill' : isGroup ? 'folder' : 'circle'} foregroundStyle={name === g.now ? 'systemBlue' : 'tertiaryLabel'} />
                <VStack alignment="leading" spacing={1}>
                  <Text foregroundStyle="label" lineLimit={1}>{nodeLabel(name, r)}</Text>
                  {r?.ip ? <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{`${r.ip} · ${asnText(r)}`}</Text> : null}
                </VStack>
                <Spacer />
                {busy === name ? <Text font={12} foregroundStyle="secondaryLabel">切换中</Text>
                  : isGroup ? <Text font={12} foregroundStyle="tertiaryLabel">策略组</Text>
                  : <Text font={13} monospacedDigit foregroundStyle={latencyColor(r)}>{latencyText(r)}</Text>}
              </HStack>
            </Button>
          )
        })}
      </Section>
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 订阅: 添加 / 改名 / 换链接 / 删除 / 拖动排序 (第一个是主订阅)
// ─────────────────────────────────────────────────────────────
async function askURL(title: string): Promise<string | null> {
  const url = await Dialog.prompt({ title, message: '粘贴订阅链接; 只存在本机钥匙串里, 不写进文件。需要额外请求头可以在末尾加 #headers=<URL 编码的 JSON>', placeholder: 'https://...', keyboardType: 'URL' })
  if (url === null) return null
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) {
    await Dialog.alert({ title: '链接不对', message: '订阅链接要以 http:// 或 https:// 开头' })
    return null
  }
  return u
}

function SubsPage(props: Shared) {
  const [list, setList] = useState<SubView[]>(props.subs)
  const [note, setNote] = useState('')

  async function refresh(force: boolean) {
    const s = await loadSubs(force)
    setList(s)
    Widget.reloadAll()
    await props.reload()
  }

  async function add() {
    const name = await Dialog.prompt({ title: '机场名字', message: '显示在小组件上, 比如「主力」', placeholder: '名字' })
    if (!name?.trim()) return
    const url = await askURL(`${name.trim()} 的订阅链接`)
    if (!url) return
    setNote('读取用量中...')
    try {
      const u = await fetchUsage(url)
      addSub(name, url)
      setNote(`已添加 ${name.trim()}: 已用 ${fmtBytes(u.up + u.down)}${u.total ? ` / ${fmtBytes(u.total)}` : ''}`)
    } catch (e) {
      const keep = await Dialog.confirm({ title: '没读到用量', message: `${(e as Error).message}。仍然添加吗?`, cancelLabel: '不添加', confirmLabel: '仍然添加' })
      if (!keep) return setNote('')
      addSub(name, url)
      setNote(`已添加 ${name.trim()}, 但还没读到用量`)
    }
    await refresh(true)
  }

  function onMove(indices: number[], newOffset: number) {
    const order = list.map(s => s.id)
    const moving = indices.map(i => order[i])
    const rest = order.filter((_, i) => !indices.includes(i))
    rest.splice(newOffset, 0, ...moving)
    const byId = new Map(listSubs().map(s => [s.id, s]))
    saveSubs(rest.map(id => byId.get(id)!).filter(Boolean))
    setList(rest.map(id => list.find(s => s.id === id)!))
    Widget.reloadAll()
  }

  return (
    <List navigationTitle="订阅" navigationBarTitleDisplayMode="inline" toolbar={{ topBarTrailing: <EditButton /> }}>
      <Section
        header={<Text>{`机场 · ${list.length}`}</Text>}
        footer={<Text>第一个是主订阅 (小号、中号、锁屏显示它); 点右上角「编辑」拖动排序。用量 30 分钟内复用上次结果, 下拉刷新或点「立即刷新」会重新读取。</Text>}
      >
        <ForEach
          count={list.length}
          itemBuilder={(i: number) => {
            const s = list[i]
            return (
              <NavigationLink key={s.id} destination={<SubDetail sub={s} onChanged={() => refresh(false)} />}>
                <HStack spacing={12}>
                  <UsageRing ctx={appCtx(null, [])} ratio={s.ratio} size={26} line={5} />
                  <VStack alignment="leading" spacing={1}>
                    <Text font={15}>{`${i === 0 ? '★ ' : ''}${s.name}`}</Text>
                    <Text font={12} foregroundStyle={s.err ? (s.usage ? WARN : BAD) : 'secondaryLabel'} lineLimit={1}>
                      {s.usage ? `${s.usage.total > 0 ? `${fmtBytes(s.used)} / ${fmtBytes(s.usage.total)}` : `已用 ${fmtBytes(s.used)}`} · ${s.fc.short}${s.err ? ' · ⚠ 旧数据' : ''}` : s.err ?? '读取中'}
                    </Text>
                  </VStack>
                </HStack>
              </NavigationLink>
            )
          }}
          onMove={onMove}
        />
        <Button title="添加订阅" systemImage="plus" action={add} />
      </Section>
      <Section footer={note ? <Text>{note}</Text> : undefined}>
        <Button title="立即刷新用量" action={async () => { setNote('刷新中...'); await refresh(true); setNote(`已刷新 ${hhmm(Date.now())}`) }} />
      </Section>
    </List>
  )
}

function SubDetail(props: { sub: SubView; onChanged: () => Promise<void> }) {
  const dismiss = Navigation.useDismiss()
  const [s, setS] = useState(props.sub)
  const [note, setNote] = useState('')
  const u = s.usage
  const days30 = s.daily
  const known = days30.filter((v): v is number => v !== null)
  const first = shiftDay(todayStr(), -29)

  async function rename() {
    const name = await Dialog.prompt({ title: '改名', defaultValue: s.name, selectAll: true })
    if (!name?.trim()) return
    updateSub(s.id, name)
    setS({ ...s, name: name.trim() })
    await props.onChanged()
  }

  async function changeURL() {
    const url = await askURL(`${s.name} 的新链接`)
    if (!url) return
    updateSub(s.id, s.name, url)
    setNote('已更换链接, 返回列表后刷新用量')
    await props.onChanged()
  }

  async function remove() {
    if (!(await Dialog.confirm({ title: `删除 ${s.name}?`, message: '订阅链接和本机记录的用量历史一起删除', cancelLabel: '取消', confirmLabel: '删除' }))) return
    removeSub(s.id)
    await props.onChanged()
    dismiss()
  }

  return (
    <Form navigationTitle={s.name} navigationBarTitleDisplayMode="inline">
      <Section>
        <HStack spacing={16} padding={{ vertical: 6 }}>
          <UsageRing ctx={appCtx(null, [])} ratio={s.ratio} size={64} line={9} color={usageColor(s.ratio)}>
            <Text font={15} fontWeight="bold" fontDesign="rounded" monospacedDigit>{u && u.total > 0 ? `${Math.round(s.ratio * 100)}%` : '∞'}</Text>
          </UsageRing>
          <VStack alignment="leading" spacing={3}>
            <Text font={17} fontWeight="semibold">{u ? (u.total > 0 ? `剩 ${fmtBytes(Math.max(0, u.total - s.used))}` : '不限流量') : '还没读到用量'}</Text>
            <Text font={13} foregroundStyle={s.fc.kind === 'runout' ? WARN : s.fc.kind === 'out' ? BAD : 'secondaryLabel'}>{s.fc.text}</Text>
            {s.err ? <Text font={12} foregroundStyle={u ? WARN : BAD}>{`最近一次读取失败: ${s.err}`}</Text> : null}
          </VStack>
        </HStack>
        {u ? <LabeledContent label={<Text>已用</Text>} value={`${fmtBytes(s.used)} (上传 ${fmtBytes(u.up)} · 下载 ${fmtBytes(u.down)})`} /> : null}
        {u && u.total > 0 ? <LabeledContent label={<Text>总量</Text>} value={fmtBytes(u.total)} /> : null}
        {u?.expire ? <LabeledContent label={<Text>到期</Text>} value={expireText(u)} /> : null}
        {s.fc.avg ? <LabeledContent label={<Text>近 7 天日均</Text>} value={fmtBytes(s.fc.avg)} /> : null}
        {u ? <LabeledContent label={<Text>读取时间</Text>} value={`${new Date(u.t).getMonth() + 1}月${new Date(u.t).getDate()}日 ${hhmm(u.t)}`} /> : null}
      </Section>

      <Section header={<Text>近 30 天每天用量</Text>} footer={<Text>{known.length ? `已记录 ${recordedDays(s)} 天。每次读到用量按北京时间记一笔, 前后两天相减得到日用量; 中间几天没记录会平均摊开。` : '每次读到用量都会记一笔, 明天起这里显示每天用了多少。'}</Text>}>
        <VStack spacing={6} padding={{ vertical: 6 }}>
          <DailyBars ctx={appCtx(null, [])} values={days30} height={90} spacing={2} />
          <HStack>
            <Text font={11} foregroundStyle="secondaryLabel">{first.slice(5).replace('-', '/')}</Text>
            <Spacer />
            <Text font={11} foregroundStyle="secondaryLabel">{known.length ? `最多 ${fmtBytes(Math.max(...known))}` : ''}</Text>
            <Spacer />
            <Text font={11} foregroundStyle="secondaryLabel">今天</Text>
          </HStack>
        </VStack>
      </Section>

      <Section footer={note ? <Text>{note}</Text> : undefined}>
        <Button title="改名" action={rename} />
        <Button title="更换订阅链接" action={changeURL} />
        <Button title="删除这个订阅" role="destructive" action={remove} />
      </Section>
    </Form>
  )
}

// ─────────────────────────────────────────────────────────────
// 样式库: 按尺寸分, 只列放得下的
// ─────────────────────────────────────────────────────────────
type Tab = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'lock'

function StyleLibrary(props: Shared & { onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('systemMedium')
  const [sample, setSample] = useState(!props.loon || !props.subs.length)
  const [tick, setTick] = useState(0)   // 「用这个样式」后刷新「默认」标记
  const data = sample ? { loon: sampleLoon(), subs: sampleSubs() } : previewData(props)
  const defaults = getDefaults()
  const changed = () => { setTick(tick + 1); props.onChanged() }

  const card = (s: StyleDef, f: Family, scale: number) => (
    <NavigationLink destination={<StyleDetail style={s} family={f} loon={data.loon} subs={data.subs} onChanged={changed} />}>
      <VStack spacing={6}>
        <Preview style={s} family={f} loon={data.loon} subs={data.subs} scale={scale} />
        <HStack spacing={4}>
          <Text font={13} fontWeight="medium" foregroundStyle="label">{s.name}</Text>
          {defaults[f] === s.id ? <Text font={10} foregroundStyle="systemBlue">默认</Text> : null}
        </HStack>
      </VStack>
    </NavigationLink>
  )

  // 小号两列原尺寸, 中号一列原尺寸, 大号一列缩小, 锁屏两列原尺寸
  const grid = (f: Family) => {
    const list = stylesFor(f)
    const cols = f === 'systemSmall' || f === 'accessoryCircular' || f === 'accessoryRectangular' ? 2 : 1
    const scale = f === 'systemLarge' ? 0.92 : 1
    return (
      <VStack spacing={16}>
        {chunk(list, cols).map(row => (
          <HStack spacing={12} alignment="top">
            {row.map(s => <VStack frame={{ maxWidth: 'infinity' }}>{card(s, f, scale)}</VStack>)}
            {row.length < cols ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
          </HStack>
        ))}
      </VStack>
    )
  }

  return (
    <ScrollView navigationTitle="样式库" navigationBarTitleDisplayMode="inline" background="systemGroupedBackground">
      <VStack alignment="leading" spacing={18} padding={16}>
        <Picker title="尺寸" value={tab} onChanged={(v: any) => setTab(v as Tab)} pickerStyle="segmented">
          <Text tag="systemSmall">小</Text>
          <Text tag="systemMedium">中</Text>
          <Text tag="systemLarge">大</Text>
          <Text tag="lock">锁屏</Text>
        </Picker>
        <Toggle title="示例预览" value={sample} onChanged={setSample} />
        {tab === 'lock' ? (
          <VStack alignment="leading" spacing={24}>
            <VStack alignment="leading" spacing={12}><Text font={17} fontWeight="semibold" padding={{ horizontal: 4 }}>圆形</Text>{grid('accessoryCircular')}</VStack>
            <VStack alignment="leading" spacing={12}><Text font={17} fontWeight="semibold" padding={{ horizontal: 4 }}>长条</Text>{grid('accessoryRectangular')}</VStack>
          </VStack>
        ) : grid(tab)}
      </VStack>
    </ScrollView>
  )
}

function StyleDetail(props: { style: StyleDef; family: Family; loon: LoonData | null; subs: SubView[]; onChanged: () => void }) {
  const { style, family } = props
  const [note, setNote] = useState('')
  const param = paramOf(style, family)
  const sizes = (Object.keys(style.views) as Family[]).map(f => FAMILY_NAME[f]).join('、')
  const lock = family === 'accessoryCircular' || family === 'accessoryRectangular'

  async function use() {
    setDefault(family, style.id)
    await Pasteboard.setString(param)
    Widget.reloadAll()
    props.onChanged()
    setNote(`已设为${FAMILY_NAME[family]}默认样式, 参数「${param}」已复制`)
  }

  return (
    <List navigationTitle={style.name} navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{`${style.desc}。支持: ${sizes}`}</Text>}>
        <HStack padding={{ vertical: 8 }}>
          <Spacer />
          <Preview style={style} family={family} loon={props.loon} subs={props.subs} scale={family === 'systemLarge' ? 0.92 : 1} />
          <Spacer />
        </HStack>
      </Section>
      <Section
        footer={<Text>{lock
          ? `锁屏: 长按锁屏 → 自定 → 添加小组件 → Scripting → loon-panel, 点小组件在参数里填「${param}」。不填参数用默认样式。`
          : `桌面: 长按小组件 → 编辑小组件 → 参数里粘贴「${param}」。不填参数就用这个尺寸的默认样式。`}</Text>}
      >
        <Button action={use} buttonStyle="borderedProminent" controlSize="large" frame={{ maxWidth: 'infinity' }}>
          <Text font={16} fontWeight="semibold" frame={{ maxWidth: 'infinity' }}>用这个样式</Text>
        </Button>
        {note ? <Text font={13} foregroundStyle="systemGreen">{note}</Text> : null}
      </Section>
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 外观: 素净 / 自定义 (纯色或图片), 顶部实时预览
// ─────────────────────────────────────────────────────────────
function Swatches(props: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <HStack spacing={10}>
      {props.colors.map(c => (
        <Button action={() => props.onPick(c)} buttonStyle="plain">
          <Circle fill={c} frame={{ width: 28, height: 28 }}
            overlay={<Circle stroke={{ shapeStyle: c === props.value ? 'systemBlue' : 'separator', strokeStyle: { lineWidth: c === props.value ? 3 : 1 } }} />} />
        </Button>
      ))}
    </HStack>
  )
}

function AppearancePage(props: Shared & { onChanged: () => void }) {
  const [look, setLookState] = useState<Look>(getLook())
  const [fam, setFam] = useState<Family>('systemMedium')
  const [note, setNote] = useState('')
  const data = previewData(props)
  const style = styleById(getDefaults()[fam]) ?? stylesFor(fam)[0]

  function update(patch: Partial<Look>) {
    const next = { ...look, ...patch }
    setLookState(next)
    setLook(next)
    Widget.reloadAll()
    props.onChanged()
  }

  async function pickImage() {
    const [img] = await Photos.pickPhotos(1)
    if (!img) return
    // 缩到长边 1200 再存, 小组件内存只有 30MB 左右
    const k = Math.min(1, 1200 / Math.max(img.width, img.height))
    const small = img.preparingThumbnail({ width: Math.round(img.width * k), height: Math.round(img.height * k) }) ?? img
    const jpg = small.toJPEGData(0.85)
    if (!jpg) return setNote('图片转换失败')
    await FileManager.createDirectory(Path.join(FileManager.appGroupDocumentsDirectory, 'loon-panel'), true)
    await FileManager.writeAsData(BG_PATH(), jpg)
    update({ bgType: 'image', image: BG_PATH() })
    setNote('')
  }

  return (
    <List navigationTitle="外观" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{`预览的是${FAMILY_NAME[fam]}默认样式「${style.name}」${props.loon && props.subs.length ? '' : ' (示例数据)'}`}</Text>}>
        <VStack spacing={12} frame={{ maxWidth: 'infinity' }} padding={{ vertical: 8 }}>
          <Preview style={style} family={fam} loon={data.loon} subs={data.subs} look={look} scale={fam === 'systemLarge' ? 0.8 : 1} />
          <Picker title="尺寸" value={fam} onChanged={(v: any) => setFam(v as Family)} pickerStyle="segmented">
            <Text tag="systemSmall">小</Text>
            <Text tag="systemMedium">中</Text>
            <Text tag="systemLarge">大</Text>
          </Picker>
        </VStack>
      </Section>

      <Section footer={<Text>{look.mode === 'plain' ? '扁平卡片, 跟随系统深浅色。' : '背景可选纯色或相册图片, 文字颜色可自动或手动选; 用图片时可调暗化保证文字清楚。'}</Text>}>
        <Picker title="外观" value={look.mode} onChanged={(v: any) => update({ mode: v })} pickerStyle="segmented">
          <Text tag="plain">素净</Text>
          <Text tag="custom">自定义</Text>
        </Picker>
      </Section>

      {look.mode === 'custom' ? (
        <Section header={<Text>背景</Text>} footer={note ? <Text>{note}</Text> : undefined}>
          <Picker title="背景" value={look.bgType} onChanged={(v: any) => update({ bgType: v })} pickerStyle="segmented">
            <Text tag="color">纯色</Text>
            <Text tag="image">图片</Text>
          </Picker>
          {look.bgType === 'color' ? (
            <VStack alignment="leading" spacing={10}>
              <Swatches colors={RECOMMENDED_BG} value={look.color} onPick={c => update({ color: c })} />
              <ColorPicker title="自选颜色" value={look.color} onChanged={(c: any) => update({ color: String(c) })} supportsOpacity={false} />
            </VStack>
          ) : (
            <VStack alignment="leading" spacing={10}>
              <Button title={look.image ? '换一张图片' : '从相册选择'} action={pickImage} />
              {look.image ? (
                <VStack alignment="leading" spacing={4}>
                  <Text font={13} foregroundStyle="secondaryLabel">{`模糊 ${Math.round(look.blur)}`}</Text>
                  <Slider min={0} max={20} value={look.blur} onChanged={(v: number) => update({ blur: v })} />
                  <Text font={13} foregroundStyle="secondaryLabel">{`暗化 ${Math.round(look.dim * 100)}%`}</Text>
                  <Slider min={0} max={0.7} value={look.dim} onChanged={(v: number) => update({ dim: v })} />
                </VStack>
              ) : null}
            </VStack>
          )}
        </Section>
      ) : null}

      {look.mode === 'custom' ? (
        <Section header={<Text>文字颜色</Text>} footer={<Text>自动: 纯色背景按亮度在黑白之间选, 图片背景用白色。灰字由文字色调淡得到, 红绿橙状态色不变。</Text>}>
          <Picker title="文字颜色" value={look.text} onChanged={(v: any) => update({ text: v })} pickerStyle="segmented">
            <Text tag="auto">自动</Text>
            <Text tag="white">白色</Text>
            <Text tag="black">黑色</Text>
            <Text tag="custom">自选</Text>
          </Picker>
          {look.text === 'custom' ? (
            <ColorPicker title="自选文字颜色" value={look.textColor} onChanged={(c: any) => update({ textColor: String(c) })} supportsOpacity={false} />
          ) : null}
        </Section>
      ) : null}

      {look.mode === 'custom' ? (
        <Section header={<Text>强调色</Text>} footer={<Text>用在图标、柱状图、选中的模式按钮; 用量和延迟的红绿橙固定。</Text>}>
          <Swatches colors={RECOMMENDED_ACCENT} value={look.accent} onPick={c => update({ accent: c })} />
          <ColorPicker title="自选强调色" value={look.accent} onChanged={(c: any) => update({ accent: String(c) })} supportsOpacity={false} />
        </Section>
      ) : null}
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 设置
// ─────────────────────────────────────────────────────────────
function SettingsPage(props: Shared & { onChanged: () => void }) {
  const [prefs, setPrefsState] = useState<Prefs>(getPrefs())
  const [testText, setTestText] = useState('')
  const [misc, setMisc] = useState('')
  const [updateText, setUpdateText] = useState('')
  const version = Script.metadata.version ?? '-'
  const groups = props.loon?.groups.map(g => g.name) ?? []

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch }
    setPrefsState(next)
    setPrefs(next)
    Widget.reloadAll()
    props.onChanged()
  }

  async function test() {
    setTestText('连接中...')
    const r = await loadLoon()
    if (!r.data || r.data.stale) return setTestText(r.error || '连不上')
    const c = healthCount(r.data)
    setTestText(`已连上, ${r.data.groups.length} 个策略组, ${c.total} 个体检结果`)
    await props.reload()
  }

  function toggleGroup(name: string) {
    const cur = prefs.groups.length ? prefs.groups : groups.slice(0, 4)
    update({ groups: cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name] })
  }

  async function checkUpdate() {
    setUpdateText('检查中...')
    try {
      const res = await fetch(REMOTE_META)
      const remote = String((await res.json() as { version?: string }).version ?? '')
      if (!remote || !isNewer(remote, version)) return setUpdateText('已是最新')
      setUpdateText(`有新版本 ${remote}`)
      const ok = await Dialog.confirm({ title: `发现新版本 ${remote}`, message: `当前 ${version}, 更新会重新导入脚本, 设置和订阅保留`, cancelLabel: '稍后', confirmLabel: '更新' })
      if (ok) await Safari.openURL(INSTALL_URL)
    } catch {
      setUpdateText('检查失败')
    }
  }

  const shown = prefs.groups.length ? prefs.groups : groups.slice(0, 4)

  return (
    <Form navigationTitle="设置" navigationBarTitleDisplayMode="inline">
      <Section header={<Text>Loon 插件</Text>} footer={<Text>{`小组件从 ${DATA_URL} 读模式、策略组和体检结果。体检频率、全量体检的策略组、超时在 Loon 插件参数里改。`}</Text>}>
        <Button title={testText ? `测试连接 · ${testText}` : '测试连接'} action={test} />
        <Button title="导入 / 更新 Loon 插件" action={() => { Safari.openURL(LOON_IMPORT) }} />
        <Button title="用 Safari 打开数据地址" action={() => { Safari.openURL(DATA_URL) }} />
        <Picker title="小组件刷新间隔" value={prefs.refresh} onChanged={(v: any) => update({ refresh: Number(v) as 15 | 30 | 60 })}>
          <Text tag={15}>15 分钟</Text>
          <Text tag={30}>30 分钟</Text>
          <Text tag={60}>60 分钟</Text>
        </Picker>
      </Section>

      {groups.length ? (
        <Section header={<Text>主策略组</Text>} footer={<Text>小号「当前节点」、锁屏长条、看板出口信息显示它当前用的节点。默认是 Loon 的兜底策略。</Text>}>
          <Picker title="主策略组" value={prefs.main} onChanged={(v: any) => update({ main: String(v) })}>
            <Text tag="">{`兜底策略${props.loon?.final ? ` (${props.loon.final})` : ''}`}</Text>
            {groups.map(n => <Text tag={n}>{n}</Text>)}
          </Picker>
        </Section>
      ) : null}

      {groups.length ? (
        <Section header={<Text>{`大号看板显示的策略组 · ${shown.length}`}</Text>} footer={<Text>最多显示前 4 个, 按勾选顺序。都不勾就显示前 4 个。</Text>}>
          {groups.map(n => (
            <Button action={() => toggleGroup(n)} buttonStyle="plain">
              <HStack>
                <Text foregroundStyle="label">{n}</Text>
                <Spacer />
                {shown.includes(n) ? <Text font={13} foregroundStyle="systemBlue">{`第 ${shown.indexOf(n) + 1} 个`}</Text> : null}
              </HStack>
            </Button>
          ))}
          {prefs.groups.length ? <Button title="恢复默认" action={() => update({ groups: [] })} /> : null}
        </Section>
      ) : null}

      <Section header={<Text>用量历史</Text>} footer={<Text>每次读到用量按北京时间记一笔, 同一天覆盖, 保留约 60 天; 只存用量数字, 不存订阅链接。</Text>}>
        <Button title="清除用量历史" role="destructive" action={async () => {
          if (!(await Dialog.confirm({ title: '清除全部用量历史?', message: '趋势图和预测会从头记录', cancelLabel: '取消', confirmLabel: '清除' }))) return
          clearHistory()
          setMisc('历史已清除')
          await props.reload()
        }} />
      </Section>

      <Section footer={misc ? <Text>{misc}</Text> : undefined}>
        <Button title="清除 Loon 数据缓存" action={() => { clearLoonCache(); setMisc('缓存已清除') }} />
      </Section>

      <Section header={<Text>关于</Text>}>
        <LabeledContent label={<Text>版本</Text>} value={version} />
        <Button title={updateText ? `检查更新 · ${updateText}` : '检查更新'} action={checkUpdate} />
      </Section>
    </Form>
  )
}

main()
