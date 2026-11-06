// loon-panel / index.tsx
// App 页面 — 在 Scripting 里运行, 不是 widget
//
// 首页: 首次引导 + 状态卡 + 四个入口 (样式库 / 外观 / 机场 / 设置) + Loon (模式、策略组、体检、更新订阅、事件)

import {
  Button,
  Tab,
  TabView,
  useObservable,
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
  Rectangle,
  Menu,
  Widget,
  Path,
  fetch,
  useEffect,
  useState,
} from 'scripting'
import type { Color } from 'scripting'

import {
  loadLoon, cachedLoon, setLoon, deepCheck, sampleLoon, mainGroup, shownGroups, setOpts, healthCount, availability, loonStatus, clearLoonCache, MODES, DATA_URL,
  type Deep, type LoonData, type Group, type OptsPatch,
} from './loon'
import {
  loadSubs, cachedSubs, sampleSubs, listSubs, saveSubs, addSub, updateSub, removeSub, fetchUsage, clearHistory, recordedDays, localEvents, overview, parseSubs, importSubs,
  fmtBytes, expireText, md, shiftDay, todayStr, type SubView,
} from './subs'
import { checkNat, lastNat, type Nat } from './net'
import { Page, Group as KitGroup, Chip, SmallButton, NavRow, ActionRow, InfoRow, ToggleRow, PickerRow } from './kit'
import {
  getPrefs, setPrefs, getLook, setLook, getDefaults, setDefault, getRemoteTargets, setRemoteTargets,
  DEFAULT_LOOK, RECOMMENDED_BG, RECOMMENDED_ACCENT, type Look, type Family, type Prefs,
} from './settings'
import { makeTheme, UsageRing, DailyBars, HourBars, Spark, mediaColor, mediaWord, latencyColor, latencyText, nodeLabel, fullLabel, asnText, ago, hhmm, chunk, usageColor, OK, BAD, WARN, type Ctx } from './ui'
import { ipTags } from './styles/net'
import { rateText } from './styles/flow'
import { stylesFor, styleById, paramOf, renderStyle, type StyleDef } from './styles/index'

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

type Act = { mode?: number; group?: string; node?: string; lock?: number }
type Shared = { loon: LoonData | null; loonErr: string; subs: SubView[]; reload: (force?: boolean) => Promise<void> }

const BOX: Record<Family, { width: number; height: number }> = {
  systemSmall: { width: 158, height: 158 },
  systemMedium: { width: 338, height: 158 },
  systemLarge: { width: 338, height: 354 },
  accessoryCircular: { width: 76, height: 76 },
  accessoryRectangular: { width: 172, height: 76 },
  accessoryInline: { width: 172, height: 34 },
}

const FAMILY_NAME: Record<Family, string> = {
  systemSmall: '小号', systemMedium: '中号', systemLarge: '大号', accessoryCircular: '锁屏圆形', accessoryRectangular: '锁屏长条', accessoryInline: '锁屏单行',
}

/** 按真实尺寸渲染一个小组件; scale < 1 时整体缩小 (外框也跟着缩) */
function Preview(props: { style: StyleDef; family: Family; loon: LoonData | null; subs: SubView[]; look?: Look; scale?: number }) {
  const box = BOX[props.family]
  const k = props.scale ?? 1
  const view = renderStyle(props.style, props.family, {
    inApp: true, loon: props.loon, loonErr: '', subs: props.subs, look: props.look ?? getLook(), prefs: getPrefs(), nat: lastNat(), local: localEvents(),
  })
  return (
    <ZStack frame={{ width: box.width * k, height: box.height * k }} clipped>
      <VStack frame={box} scaleEffect={k}>{view}</VStack>
    </ZStack>
  )
}

function appCtx(loon: LoonData | null, subs: SubView[]): Ctx {
  return { th: makeTheme(DEFAULT_LOOK), size: 'm', inApp: true, loon, loonErr: '', subs, all: overview(subs), prefs: getPrefs(), nat: null, events: [] }
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
  const [tick, setTick] = useState(0)   // 子页面改了设置后刷新
  const tab = useObservable<number>(0)

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
  async function act(q: Act, label: string) {
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
  const close = <Button title="关闭" action={dismiss} />
  const onChanged = () => setTick(tick + 1)

  return (
    <TabView selection={tab}>
      <Tab title="小组件" systemImage="square.grid.2x2.fill" value={0}>
        <NavigationStack><WidgetTab shared={shared} act={act} busy={busy} close={close} onChanged={onChanged} toSubs={() => tab.setValue(1)} /></NavigationStack>
      </Tab>
      <Tab title="机场" systemImage="airplane" value={1}>
        <NavigationStack><SubsPage {...shared} close={close} /></NavigationStack>
      </Tab>
      <Tab title="节点" systemImage="antenna.radiowaves.left.and.right" value={2}>
        <NavigationStack><NodesTab shared={shared} act={act} busy={busy} note={note} close={close} /></NavigationStack>
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value={3}>
        <NavigationStack><SettingsPage {...shared} close={close} onChanged={onChanged} /></NavigationStack>
      </Tab>
    </TabView>
  )
}

/** 小组件页: 当前样式的预览 + 选样式和外观; 打开 App 默认在这里 */
function WidgetTab(props: { shared: Shared; act: (q: {}, label: string) => Promise<void>; busy: string; close: any; onChanged: () => void; toSubs: () => void }) {
  const { shared } = props
  const [family, setFamily] = useState<Family>('systemMedium')
  const { loon, subs } = shared
  const live = !!loon && !loon.stale
  const look = getLook()
  const data = previewData(shared)
  const style = styleById(getDefaults()[family]) ?? stylesFor(family)[0]
  return (
    <Page title="小组件" large bar={{ cancellationAction: props.close, topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={() => shared.reload(true)} /> }}>
      {!live || !subs.length || !loon?.check ? <Guide shared={shared} act={props.act} busy={props.busy} toSubs={props.toSubs} /> : null}
      <VStack spacing={14} frame={{ maxWidth: 'infinity' }}>
        <Picker title="尺寸" value={family} onChanged={(v: any) => setFamily(v as Family)} pickerStyle="segmented">
          <Text tag="systemSmall">小</Text>
          <Text tag="systemMedium">中</Text>
          <Text tag="systemLarge">大</Text>
          <Text tag="accessoryRectangular">锁屏</Text>
        </Picker>
        <Preview style={style} family={family} loon={data.loon} subs={data.subs} />
      </VStack>
      <KitGroup note="加到桌面: 长按桌面空白处 → + → 搜 Scripting → 选 loon-panel。">
        <NavRow icon="square.grid.2x2" color="systemBlue" title="样式" value={style.name} destination={<StyleLibrary {...shared} onChanged={props.onChanged} />} />
        <NavRow icon="paintpalette" color="systemBlue" title="外观" value={look.mode === 'plain' ? '素净' : look.bgType === 'image' ? '自定义图片' : '自定义纯色'} destination={<AppearancePage {...shared} onChanged={props.onChanged} />} />
      </KitGroup>
    </Page>
  )
}

/** 节点页: 运行模式、策略组、体检和事件 */
function NodesTab(props: { shared: Shared; act: (q: Act, label: string) => Promise<void>; busy: string; note: string; close: any }) {
  const { shared, act, busy, note } = props
  const { loon, reload } = shared
  const live = !!loon && !loon.stale
  const st = loonStatus(loon)
  const events = [...(loon?.events ?? []), ...localEvents()].sort((a, b) => b.t - a.t)
  const common = loon ? shownGroups(loon, getPrefs()).slice(0, 4) : []
  const bar = { cancellationAction: props.close, topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={() => reload(true)} /> }
  if (!loon) return <Page title="节点" large bar={bar}><Text foregroundStyle="secondaryLabel">{`${st.text}。保持 Loon 开启并启用「Loon 面板」插件。`}</Text></Page>
  return (
    <Page title="节点" large bar={bar}>
      <HStack spacing={6} padding={{ leading: 4 }}>
        <Circle fill={st.level === 'ok' ? OK : st.level === 'warn' ? WARN : BAD} frame={{ width: 7, height: 7 }} />
        <Text font={13} foregroundStyle="secondaryLabel">{`${st.text}${loon.stale ? ` · 显示 ${hhmm(loon.t)} 的数据` : ''}${loon.check ? ` · ${ago(loon.check.t)}体检` : ''}`}</Text>
      </HStack>
      <Picker title="模式" value={loon.mode} onChanged={(v: any) => { if (Number(v) !== loon.mode) act({ mode: Number(v) }, '切换模式') }} pickerStyle="segmented" disabled={!!busy || !live}>
        {MODES.map(m => <Text tag={m.id}>{m.name}</Text>)}
      </Picker>
      <KitGroup title="常用策略组" note={note || undefined} inset={16}>
        {common.map(g => (
          <NavigationLink destination={<GroupPage group={g} loon={loon} act={act} reload={reload} />} buttonStyle="plain">
            <GroupLine group={g} loon={loon} />
          </NavigationLink>
        ))}
        {loon.groups.length > common.length ? (
          <NavigationLink destination={<AllGroupsPage loon={loon} act={act} reload={reload} />} buttonStyle="plain">
            <HStack padding={{ horizontal: 16, vertical: 13 }}>
              <Text font={15} foregroundStyle="label">全部策略组</Text>
              <Spacer />
              <Text font={13} foregroundStyle="secondaryLabel">{`${loon.groups.length} 个`}</Text>
              <Image systemName="chevron.right" font={13} fontWeight="semibold" foregroundStyle="tertiaryLabel" />
            </HStack>
          </NavigationLink>
        ) : null}
      </KitGroup>
      <KitGroup>
        <ActionRow icon="stethoscope" color="systemBlue" title="立即体检" disabled={!!busy || !live} action={() => { act({}, '体检当前节点') }} />
        <ActionRow icon="arrow.down.circle" color="systemBlue" title="更新订阅" sub="跳到 Loon 更新" action={() => { Safari.openURL('loon://update?sub=all') }} />
        {events.length ? <NavRow icon="list.bullet" color="systemBlue" title="发生了什么" sub={events[0].msg} value={`${events.length} 件`} destination={<EventsPage events={events} />} /> : null}
      </KitGroup>
    </Page>
  )
}

function GroupLine(props: { group: Group; loon: LoonData }) {
  const { group: g, loon } = props
  const r = loon.nodes[g.leaf]
  return (
    <HStack spacing={10} padding={{ horizontal: 16, vertical: 11 }}>
      <VStack alignment="leading" spacing={1}>
        <Text font={15} fontWeight="medium" fontDesign="rounded" foregroundStyle="label" lineLimit={1}>{g.name}</Text>
        <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{nodeLabel(g.leaf, r)}</Text>
      </VStack>
      <Spacer />
      <Text font={13} fontWeight="medium" monospacedDigit foregroundStyle={latencyColor(r)}>{latencyText(r)}</Text>
      <Image systemName="chevron.right" font={13} foregroundStyle="tertiaryLabel" />
    </HStack>
  )
}

function AllGroupsPage(props: { loon: LoonData; act: (q: Act, label: string) => Promise<void>; reload: (force?: boolean) => Promise<void> }) {
  const { loon, act, reload } = props
  const [common, setCommon] = useState<Group[]>(shownGroups(loon, getPrefs()))
  const rest = loon.groups.filter(g => !common.some(x => x.name === g.name))
  const row = (g: Group) => (
    <NavigationLink key={g.name} destination={<GroupPage group={g} loon={loon} act={act} reload={reload} />}>
      <GroupLine group={g} loon={loon} />
    </NavigationLink>
  )

  function onMove(indices: number[], newOffset: number) {
    const moving = indices.map(i => common[i])
    const next = common.filter((_, i) => !indices.includes(i))
    next.splice(newOffset, 0, ...moving)
    setCommon(next)
    setPrefs({ ...getPrefs(), groups: next.map(g => g.name) })
    Widget.reloadAll()
    reload()
  }

  return (
    <List navigationTitle="全部策略组" navigationBarTitleDisplayMode="inline" toolbar={{ topBarTrailing: <EditButton /> }}>
      <Section header={<Text>常用</Text>} footer={<Text>首页和大号看板显示这些。点右上角「编辑」拖动排序; 进策略组里可以加入或移出常用。</Text>}>
        <ForEach count={common.length} itemBuilder={(i: number) => row(common[i])} onMove={onMove} />
      </Section>
      {rest.length ? <Section header={<Text>其他</Text>}>{rest.map(row)}</Section> : null}
    </List>
  )
}

/** 首次引导: 导入插件 → 添加订阅 → 跑一次体检; 做完的打勾 */
function Guide(props: { shared: Shared; act: (q: {}, label: string) => Promise<void>; busy: string; toSubs: () => void }) {
  const { loon, loonErr, subs } = props.shared
  const live = !!loon && !loon.stale
  const step = (n: number, title: string, sub: string, button: any) => (
    <HStack spacing={12} padding={{ horizontal: 14, vertical: 12 }}>
      <Chip icon={`${n}.circle.fill`} color="systemBlue" />
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
      <KitGroup title="还差这几步" inset={54}>
        {!live ? step(1, '导入 Loon 插件', '一键添加「Loon 面板」插件, 装好后回来刷新', <SmallButton title="导入" action={() => { Safari.openURL(LOON_IMPORT) }} />) : null}
        {!subs.length ? step(2, '添加机场订阅', '订阅链接只存在钥匙串里', <SmallButton title="添加" action={props.toSubs} />) : null}
        {!loon?.check ? step(3, '跑一次体检', '测当前节点的延迟和出口; 之后插件定时体检', <SmallButton title="体检" disabled={!live || !!props.busy} action={() => { props.act({}, '体检当前节点') }} />) : null}
      </KitGroup>
      {!live ? (
        <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>
          {`${loonErr ? `${loonErr}\n` : ''}读不到数据? 保持 Loon 开启, 用 Safari 打开 ${DATA_URL}, 能看到一段 JSON 才说明 Loon 已经接管; 看不到就检查插件是否已启用。不要把 1.1.1.1 加进 Loon 的 bypass-tun 或 skip-proxy。`}
        </Text>
      ) : null}
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 策略组: 按延迟排序, 点一下切换; 可锁定; 当前节点的解锁和深度检测
// ─────────────────────────────────────────────────────────────
function GroupPage(props: { group: Group; loon: LoonData; act: (q: Act, label: string) => Promise<void>; reload: (force?: boolean) => Promise<void> }) {
  const [g, setG] = useState(props.group)
  const [loon, setLoonData] = useState(props.loon)
  const [busy, setBusy] = useState('')
  const groupNames = new Set(loon.groups.map(x => x.name))
  const locked = loon.locks?.[g.name]
  const ms = (n: string) => { const r = loon.nodes[n]; return !r ? 1e7 : r.ok ? r.ms : 1e6 }
  const list = g.subs.slice().sort((a, b) => ms(a) - ms(b))
  const media = loon.media?.[g.leaf]?.list ?? []

  const [prefs, setPrefsState] = useState<Prefs>(getPrefs())
  const [note, setNote] = useState('')
  const common = shownGroups(loon, prefs).map(x => x.name)
  const isMain = mainGroup(loon, prefs)?.name === g.name
  const isUnlock = (prefs.unlock || mainGroup(loon, prefs)?.name) === g.name
  const full = loon.opts?.full ?? []

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch }
    setPrefsState(next)
    setPrefs(next)
    Widget.reloadAll()
    props.reload()
  }

  function toggleCommon(on: boolean) {
    if (on && common.length >= 4) return setNote('常用最多 4 个, 先移出一个')
    setNote('')
    update({ groups: on ? [...common, g.name] : common.filter(n => n !== g.name) })
  }

  async function toggleFull(on: boolean) {
    try {
      setLoonData(await setOpts({ groups: on ? [...full, g.name] : full.filter(n => n !== g.name) }))
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  async function after(q: Act, label: string) {
    await props.act(q, label)
    const fresh = cachedLoon()
    if (fresh) {
      setLoonData(fresh)
      const x = fresh.groups.find(y => y.name === g.name)
      if (x) setG(x)
    }
  }

  async function pick(node: string) {
    if (node === g.now || busy) return
    setBusy(node)
    await after({ group: g.name, node }, `切换到 ${node}`)
    setBusy('')
  }

  return (
    <List navigationTitle={g.name} navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{note || (locked ? `Loon 把选择还原时, 插件会改回 ${locked} 并发通知。` : '「全量体检」每次体检都测这个组的全部节点, 节点多时耗时更长。')}</Text>}>
        <Toggle title="常用 (首页和大号看板)" value={common.includes(g.name)} onChanged={toggleCommon} />
        <Toggle title="主策略组 (小号和锁屏)" value={isMain} onChanged={(v: boolean) => update({ main: v ? g.name : '' })} />
        <Toggle title="解锁样式看这个组" value={isUnlock} onChanged={(v: boolean) => update({ unlock: v ? g.name : '' })} />
        <Toggle title="全量体检" value={full.includes(g.name)} onChanged={(v: boolean) => { toggleFull(v) }} />
        <Toggle title="锁定当前选择" value={!!locked} onChanged={(v: boolean) => { after(v ? { group: g.name, node: g.now, lock: 1 } : { group: g.name, lock: 0 }, v ? '锁定' : '解锁') }} />
      </Section>

      <Section header={<Text>{loon.check ? `按延迟排序 · ${ago(loon.check.t)} 体检` : '节点'}</Text>} footer={<Text>点一行切换。没测过的显示「未测」, 打开上面的「全量体检」就会测全部节点。</Text>}>
        {list.map(name => {
          const r = loon.nodes[name]
          const a = availability(r)
          const isGroup = groupNames.has(name)
          return (
            <Button action={() => { pick(name) }} buttonStyle="plain">
              <HStack spacing={10}>
                <Image systemName={name === g.now ? 'checkmark.circle.fill' : isGroup ? 'folder' : 'circle'} foregroundStyle={name === g.now ? 'systemBlue' : 'tertiaryLabel'} />
                <VStack alignment="leading" spacing={1}>
                  <Text foregroundStyle="label" lineLimit={1}>{fullLabel(name, r)}</Text>
                  {r ? <Text font={11} foregroundStyle={r.ok ? 'secondaryLabel' : BAD} lineLimit={1}>{r.ok ? [a === null ? '' : `可用 ${Math.round(a * 100)}%`, asnText(r)].filter(Boolean).join(' · ') : `连续 ${r.fail ?? 1} 次超时`}</Text> : null}
                </VStack>
                <Spacer />
                {r?.h?.length ? <Spark ctx={appCtx(null, [])} h={r.h} width={40} height={14} /> : null}
                {busy === name ? <Text font={12} foregroundStyle="secondaryLabel">切换中</Text>
                  : isGroup ? <Text font={12} foregroundStyle="tertiaryLabel">策略组</Text>
                  : <Text font={13} monospacedDigit foregroundStyle={latencyColor(r)}>{latencyText(r)}</Text>}
              </HStack>
            </Button>
          )
        })}
      </Section>

      <Section header={<Text>{`当前节点 · ${g.leaf}`}</Text>}>
        {loon.nodes[g.leaf]?.ip ? <LabeledContent label={<Text>出口</Text>} value={`${loon.nodes[g.leaf].cc ?? ''} ${loon.nodes[g.leaf].ip}`} /> : null}
        {media.length ? (
          <VStack alignment="leading" spacing={6}>
            <Text font={13} foregroundStyle="secondaryLabel">解锁</Text>
            {chunk(media, 3).map(row => (
              <HStack spacing={8}>
                {row.map(m => <Text font={12} foregroundStyle={mediaColor(m)} frame={{ maxWidth: 'infinity', alignment: 'leading' }} lineLimit={1}>{`${m.name} ${mediaWord(m)}`}</Text>)}
              </HStack>
            ))}
          </VStack>
        ) : null}
        <NavigationLink destination={<DeepPage node={g.leaf} loon={loon} reload={props.reload} />}><Text>深度检测</Text></NavigationLink>
      </Section>
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 深度检测: 手动跑, 结果也给小组件用
// ─────────────────────────────────────────────────────────────
const ISP_NAME = { ct: '电信', cu: '联通', cm: '移动' }

function DeepPage(props: { node: string; loon: LoonData; reload: (force?: boolean) => Promise<void> }) {
  const [d, setD] = useState<Deep | null>(props.loon.deep?.[props.node] ?? null)
  const [nat, setNat] = useState<Nat | null>(lastNat())
  const [note, setNote] = useState('')

  async function run(speed: boolean) {
    setNote(speed ? '检测和测速中, 约一分钟, 会用掉十几 MB 流量...' : '检测中, 约一分钟...')
    try {
      const data = await deepCheck(props.node, speed)
      setD(data.deep?.[props.node] ?? null)
      setNote('')
      await props.reload()
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  async function nat2() {
    setNote('NAT 检测中...')
    try {
      setNat(await checkNat())
      setNote('')
    } catch (e) {
      setNote(`NAT 检测失败: ${(e as Error).message}`)
    }
  }

  const rows = (title: string, list: { k: string; v: string; color?: Color }[]) => (list.length ? (
    <Section header={<Text>{title}</Text>}>
      {list.map(x => <HStack><Text font={14}>{x.k}</Text><Spacer /><Text font={13} foregroundStyle={x.color ?? 'secondaryLabel'} lineLimit={2}>{x.v}</Text></HStack>)}
    </Section>
  ) : null)
  const yes = (b?: boolean) => (b ? '是' : '否')

  return (
    <List navigationTitle="深度检测" navigationBarTitleDisplayMode="inline">
      <Section header={<Text>{props.node}</Text>} footer={<Text>{note || '检测会把这个节点的出口 IP 提交给第三方查询服务。结果会显示在 IP 质量、三网延迟、网络安全、线路体检报告这些样式上。'}</Text>}>
        <Button title="开始检测" action={() => { run(false) }} />
        <Button title="检测并测速 (用十几 MB 流量)" action={() => { run(true) }} />
        <Button title={nat ? `NAT 类型 · ${nat.text}` : '检测 NAT 类型'} action={nat2} />
      </Section>
      {d ? rows('基础', [
        ...(d.basic?.ip ? [{ k: '出口', v: `${d.basic.cc ?? ''} ${d.basic.ip}` }] : []),
        ...(d.basic?.org ? [{ k: '运营商', v: `${d.basic.asn ? `AS${d.basic.asn} ` : ''}${d.basic.org}` }] : []),
        ...(d.bgp?.prefix ? [{ k: 'BGP', v: `${d.bgp.prefix}${d.bgp.rpki ? ` · RPKI ${d.bgp.rpki}` : ''}` }] : []),
        ...ipTags(d).map(t => ({ k: '标记', v: t.text, color: t.color })),
        ...(d.egress && d.egress.length > 1 ? [{ k: '出口分流', v: `${d.egress.length} 个出口`, color: WARN }] : []),
      ]) : null}
      {d ? rows('IP 类型和风险 (各来源原样)', [
        ...(d.types ?? []).map(t => ({ k: t.source, v: t.type })),
        ...(d.scores ?? []).map(t => ({ k: t.source, v: `风险 ${t.score ?? '-'}${t.text ? ` · ${t.text}` : ''}` })),
        ...(d.factors ?? []).map(f => ({ k: f.source, v: `代理 ${yes(f.proxy)} · VPN ${yes(f.vpn)} · Tor ${yes(f.tor)} · 机房 ${yes(f.hosting)}` })),
      ]) : null}
      {d ? rows('解锁', (d.media ?? []).map(m => ({ k: m.name, v: mediaWord(m), color: mediaColor(m) }))) : null}
      {d ? rows('三网 (外部探针到出口)', (d.ping ?? []).map(p => {
        const w = d.inbound?.find(x => x.isp === p.isp)
        return { k: ISP_NAME[p.isp], v: `${p.avg !== undefined ? `${Math.round(p.avg)}ms` : '-'} · 丢包 ${p.loss ?? 0}%${w?.summary ? ` · ${w.summary}` : ''}` }
      })) : null}
      {d ? rows('回程 (同网络探针, 不是节点本机)', (d.backhaul ?? []).map(b => ({ k: ISP_NAME[b.isp], v: `${b.summary ?? ''}${b.hops ? ` · ${b.hops} 跳` : ''}${b.probe ? ` · ${b.probe}` : ''}` }))) : null}
      {d ? rows('DNS 和黑名单', [
        ...(d.dnsleak?.servers ?? []).map(x => ({ k: 'DNS 服务器', v: `${x.cc ?? ''} ${x.org ?? x.ip}` })),
        ...(d.dnsbl ? [{ k: 'IP 黑名单', v: d.dnsbl.listed.length ? d.dnsbl.listed.map(x => x.list).join('、') : `${d.dnsbl.checked} 家未命中`, color: d.dnsbl.listed.length ? WARN : OK }] : []),
      ]) : null}
      {d ? rows('速度', [
        ...(d.speed?.down ? [{ k: '下载', v: `${Math.round(d.speed.down)}Mbps${d.speed.conns ? ` · ${d.speed.conns} 连接` : ''}` }] : []),
        ...(d.stability ?? []).map(x => ({ k: `HTTPS ${x.target}`, v: `成功 ${x.ok}/${x.total}${x.median ? ` · ${x.median}ms` : ''}` })),
      ]) : null}
      {d?.errors && Object.keys(d.errors).length ? rows('没拿到的项目', Object.entries(d.errors).map(([k, v]) => ({ k, v: String(v) }))) : null}
    </List>
  )
}

function EventsPage(props: { events: { t: number; k: string; msg: string }[] }) {
  return (
    <List navigationTitle="发生了什么" navigationBarTitleDisplayMode="inline">
      {props.events.map(e => (
        <VStack alignment="leading" spacing={2}>
          <Text font={14}>{e.msg}</Text>
          <Text font={12} foregroundStyle="secondaryLabel">{`${md(e.t)} ${hhmm(e.t)}`}</Text>
        </VStack>
      ))}
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

function SubsPage(props: Shared & { close: any }) {
  const title = '机场'
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

  /** 配置文本 → 添加读得到用量的订阅 */
  async function importText(text: string) {
    const found = parseSubs(text)
    if (!found.length) return setNote('没找到订阅链接')
    setNote(`找到 ${found.length} 个, 读取用量中...`)
    const r = await importSubs(found)
    setNote([
      r.added.length ? `已添加 ${r.added.join('、')}` : '没有新增',
      r.noUsage.length ? `${r.noUsage.join('、')} 没有用量信息, 未添加` : '',
      r.same.length ? `${r.same.join('、')} 已存在` : '',
    ].filter(Boolean).join('; '))
    await refresh(true)
  }

  async function fromPaste() {
    const text = await Pasteboard.getString()
    if (!text?.trim()) return setNote('剪贴板是空的, 先复制订阅链接或 Loon 配置')
    await importText(text)
  }

  async function fromFile() {
    const paths = await DocumentPicker.pickFiles({ types: ['public.data'] })
    if (!paths?.length) return
    try {
      await importText(await FileManager.readAsString(paths[0]))
    } catch (e) {
      setNote(`读取失败: ${(e as Error).message}`)
    }
    DocumentPicker.stopAcessingSecurityScopedResources()
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
    <List navigationTitle={title} toolbar={{ cancellationAction: props.close, topBarLeading: list.length > 1 ? <EditButton /> : undefined, topBarTrailing: (
      <Menu title="添加" systemImage="plus">
        <Button title="从 Loon 配置文件导入" systemImage="doc.badge.plus" action={fromFile} />
        <Button title="从剪贴板添加" systemImage="doc.on.clipboard" action={fromPaste} />
        <Button title="手动添加" systemImage="square.and.pencil" action={add} />
        <Button title="立即刷新用量" systemImage="arrow.clockwise" action={async () => { setNote('刷新中...'); await refresh(true); setNote(`已刷新 ${hhmm(Date.now())}`) }} />
      </Menu>
    ) }}>
      <Section
        header={<Text>{`机场 · ${list.length}`}</Text>}
        footer={<Text>{note || '第一个是主订阅, 小号、中号和锁屏显示它; 点左上角「编辑」拖动排序。'}</Text>}
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
      </Section>
      {!list.length ? (
        <Section footer={<Text>Loon 脚本读不到订阅链接, 所以从配置里导入: 在 Loon 导出配置文件后选择它, 或复制配置内容、订阅链接后从剪贴板添加。只添加能读到用量的订阅, 链接只存在本机钥匙串。</Text>}>
          <Button title="从 Loon 配置文件导入" systemImage="doc.badge.plus" action={fromFile} />
          <Button title="从剪贴板添加" systemImage="doc.on.clipboard" action={fromPaste} />
          <Button title="手动添加" systemImage="square.and.pencil" action={add} />
        </Section>
      ) : null}
    </List>
  )
}

function SubDetail(props: { sub: SubView; onChanged: () => Promise<void> }) {
  const dismiss = Navigation.useDismiss()
  const [s, setS] = useState(props.sub)
  const [note, setNote] = useState('')
  const u = s.usage
  const days30 = s.daily.slice(-30)
  const known = days30.filter((v): v is number => v !== null)
  const first = shiftDay(todayStr(), -29)

  async function rename() {
    const name = await Dialog.prompt({ title: '改名', defaultValue: s.name, selectAll: true })
    if (!name?.trim()) return
    updateSub(s.id, { name: name.trim() })
    setS({ ...s, name: name.trim() })
    await props.onChanged()
  }

  async function changeURL() {
    const url = await askURL(`${s.name} 的新链接`)
    if (!url) return
    updateSub(s.id, {}, url)
    setNote('已更换链接, 返回列表后刷新用量')
    await props.onChanged()
  }

  async function editNumber(title: string, message: string, current: number, key: 'resetDay' | 'price', max: number) {
    const v = await Dialog.prompt({ title, message, defaultValue: current ? String(current) : '', placeholder: '留空清除', keyboardType: 'decimalPad' })
    if (v === null) return
    const n = Number(v.trim())
    const value = v.trim() && Number.isFinite(n) && n > 0 && n <= max ? n : 0
    updateSub(s.id, { [key]: key === 'resetDay' ? Math.floor(value) : value })
    setS({ ...s, [key]: value })
    setNote('已保存, 返回列表后生效')
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
        {u?.plan ? <LabeledContent label={<Text>套餐</Text>} value={u.plan} /> : null}
        {u ? <LabeledContent label={<Text>已用</Text>} value={`${fmtBytes(s.used)} (上传 ${fmtBytes(u.up)} · 下载 ${fmtBytes(u.down)})`} /> : null}
        {u && u.total > 0 ? <LabeledContent label={<Text>总量</Text>} value={fmtBytes(u.total)} /> : null}
        {u?.expire ? <LabeledContent label={<Text>到期</Text>} value={expireText(u)} /> : null}
        {s.fc.avg ? <LabeledContent label={<Text>近 7 天日均</Text>} value={fmtBytes(s.fc.avg)} /> : null}
        {s.budget ? <LabeledContent label={<Text>{`到${s.deadlineWord}前每天`}</Text>} value={fmtBytes(s.budget.today)} /> : null}
        {s.price > 0 && u && u.total > 0 ? <LabeledContent label={<Text>每 G</Text>} value={`¥${(s.price / (u.total / 1024 ** 3)).toFixed(2)} · 剩余价值 ¥${(s.price * (1 - s.ratio)).toFixed(1)}`} /> : null}
        {u ? <LabeledContent label={<Text>读取时间</Text>} value={`${new Date(u.t).getMonth() + 1}月${new Date(u.t).getDate()}日 ${hhmm(u.t)}`} /> : null}
      </Section>

      <Section header={<Text>今天每小时</Text>} footer={<Text>{`${rateText(s.recent)}${s.interval ? ` · 这个机场约 ${s.interval} 分钟更新一次用量` : ''}。精度取决于机场多久更新一次。`}</Text>}>
        <VStack spacing={6} padding={{ vertical: 6 }}>
          <HourBars ctx={appCtx(null, [])} values={s.hourly} height={64} />
          <HStack><Text font={11} foregroundStyle="secondaryLabel">0 点</Text><Spacer /><Text font={11} foregroundStyle="secondaryLabel">{`今天 ${fmtBytes(s.today)}`}</Text></HStack>
        </VStack>
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
        <Button title={s.resetDay ? `每月重置日 · ${s.resetDay} 号` : '设置每月重置日'} action={() => { editNumber('每月几号重置流量', '填 1 到 31; 填了之后预测和每天额度按重置日算', s.resetDay, 'resetDay', 31) }} />
        <Button title={s.price ? `每期价格 · ¥${s.price}` : '设置每期价格'} action={() => { editNumber('每期多少钱', '用来算每 G 多少钱和性价比', s.price, 'price', 100000) }} />
        {u?.site ? <Button title="打开机场官网" action={() => { Safari.openURL(u.site!) }} /> : null}
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
type SizeTab = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'lock'

function StyleLibrary(props: Shared & { onChanged: () => void }) {
  const [tab, setTab] = useState<SizeTab>('systemMedium')
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
    const cols = f === 'systemSmall' || f === 'accessoryCircular' || f === 'accessoryRectangular' || f === 'accessoryInline' ? 2 : 1
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
    <ScrollView navigationTitle="样式库" navigationBarTitleDisplayMode="inline" background={<Rectangle fill="systemGroupedBackground" ignoresSafeArea />}>
      <VStack alignment="leading" spacing={18} padding={16}>
        <Picker title="尺寸" value={tab} onChanged={(v: any) => setTab(v as SizeTab)} pickerStyle="segmented">
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
            <VStack alignment="leading" spacing={12}><Text font={17} fontWeight="semibold" padding={{ horizontal: 4 }}>单行</Text>{grid('accessoryInline')}</VStack>
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
  const lock = family.startsWith('accessory')

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
function Swatches(props: { colors: Color[]; value: Color; onPick: (c: Color) => void }) {
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
              <ColorPicker title="自选颜色" value={look.color} onChanged={(c: Color) => update({ color: c })} supportsOpacity={false} />
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
            <ColorPicker title="自选文字颜色" value={look.textColor} onChanged={(c: Color) => update({ textColor: c })} supportsOpacity={false} />
          ) : null}
        </Section>
      ) : null}

      {look.mode === 'custom' ? (
        <Section header={<Text>强调色</Text>} footer={<Text>用在图标、柱状图、选中的模式按钮; 用量和延迟的红绿橙固定。</Text>}>
          <Swatches colors={RECOMMENDED_ACCENT} value={look.accent} onPick={c => update({ accent: c })} />
          <ColorPicker title="自选强调色" value={look.accent} onChanged={(c: Color) => update({ accent: c })} supportsOpacity={false} />
        </Section>
      ) : null}
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 设置
// ─────────────────────────────────────────────────────────────
function SettingsPage(props: Shared & { close: any; onChanged: () => void }) {
  const [prefs, setPrefsState] = useState<Prefs>(getPrefs())
  const [testText, setTestText] = useState('')
  const [updateText, setUpdateText] = useState('')
  const version = Script.metadata.version ?? '-'
  const { loon } = props
  const oldPlugin = !!loon && !loon.stale && loon.opts?.timeout === undefined

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

  const st = loonStatus(loon)
  const o = loon?.opts
  const onOff = (v?: boolean) => (v ? '开' : '关')
  const alerts = [prefs.alerts.usage && '用量', prefs.alerts.runout && '用完', prefs.alerts.expire && '到期'].filter(Boolean).join('、')

  return (
    <Page title="设置" large bar={{ cancellationAction: props.close }}>
      <KitGroup title="Loon">
        <ActionRow
          icon={st.level === 'ok' && !oldPlugin ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
          color={oldPlugin ? WARN : st.level === 'ok' ? OK : st.level === 'warn' ? WARN : BAD}
          title={oldPlugin ? '插件版本太旧' : st.text}
          sub={testText || '点一下测试连接'}
          action={test}
        />
        <ActionRow icon="square.and.arrow.down" color="systemBlue" title="导入 / 更新 Loon 插件" action={() => { Safari.openURL(LOON_IMPORT) }} />
      </KitGroup>

      <KitGroup title="检测和提醒">
        <NavRow icon="stethoscope" color="systemBlue" title="节点检测" sub={o?.timeout ? `超时 ${o.timeout / 1000} 秒 · 通知${onOff(o.notify)} · 自动切换${onOff(o.auto)}` : '开着 Loon 才能修改'} destination={<CheckPage loon={loon} reload={props.reload} />} />
        <NavRow icon="bell.badge.fill" color="systemBlue" title="用量提醒" sub={alerts || '已关闭'} destination={<AlertsPage />} />
      </KitGroup>

      <KitGroup title="小组件">
        <PickerRow icon="clock.fill" color="systemBlue" title="刷新间隔" value={prefs.refresh} options={[[15, '15 分钟'], [30, '30 分钟'], [60, '60 分钟']]} onChanged={v => update({ refresh: v })} />
        <NavRow icon="arrow.triangle.2.circlepath" color="systemBlue" title="体检完自动刷新" sub={o?.push ? '已设置' : '不用等系统定时刷新'} destination={<AutoRefreshPage />} />
      </KitGroup>

      <KitGroup title="更多" note="策略组的常用、主策略组、解锁、全量体检和锁定, 在首页点进策略组设置。">
        <NavRow icon="internaldrive.fill" color="systemBlue" title="数据和缓存" destination={<DataPage reload={props.reload} />} />
        <ActionRow icon="arrow.down.circle.fill" color="systemBlue" title="检查更新" value={updateText} action={checkUpdate} />
        <InfoRow icon="info.circle.fill" color="systemBlue" title="版本" value={`${version}${loon?.version ? ` · 插件 ${loon.version}` : ''}`} />
      </KitGroup>
    </Page>
  )
}

// 节点检测: 这些由 Loon 后台执行, 在这里改, 存到插件里
function CheckPage(props: { loon: LoonData | null; reload: () => Promise<void> }) {
  const [o, setO] = useState(props.loon?.opts)
  const [note, setNote] = useState('')
  const live = !!props.loon && !props.loon.stale && o?.timeout !== undefined

  async function save(patch: OptsPatch) {
    try {
      const d = await setOpts(patch)
      setO(d.opts)
      setNote('')
      await props.reload()
    } catch (e) {
      setNote(`保存失败: ${(e as Error).message}`)
    }
  }

  async function askAddress(title: string, key: 'test_url' | 'ip_url', now?: string) {
    const v = await Dialog.prompt({ title, message: '留空恢复默认', defaultValue: now, keyboardType: 'URL' })
    if (v !== null) await save({ [key]: v.trim() })
  }

  return (
    <Page title="节点检测">
      <KitGroup note={note || (live ? '这些由 Loon 在后台执行。体检频率是 Loon 插件里唯一的参数, 默认 30 分钟一次。' : '要开着 Loon 并更新到最新插件才能修改。')}>
        <ToggleRow icon="wifi" color="systemBlue" title="网络切换后复测" value={o?.net ?? true} disabled={!live} onChanged={v => { save({ net: v }) }} />
        <ToggleRow icon="bell.fill" color="systemBlue" title="节点异常发通知" sub="连续 3 次超时, 或锁定被改回时" value={o?.notify ?? true} disabled={!live} onChanged={v => { save({ notify: v }) }} />
        <ToggleRow icon="bolt.fill" color="systemBlue" title="挂了自动切到最快" sub="锁定的策略组不会切" value={o?.auto ?? false} disabled={!live} onChanged={v => { save({ auto: v }) }} />
        <PickerRow icon="timer" color="systemBlue" title="单次超时" value={o?.timeout ?? 5000} disabled={!live} options={[[3000, '3 秒'], [5000, '5 秒'], [8000, '8 秒']]} onChanged={v => { save({ timeout: v }) }} />
      </KitGroup>
      <KitGroup title="检测地址">
        <ActionRow icon="speedometer" color="systemBlue" title="测速地址" sub={o?.test_url} disabled={!live} action={() => { askAddress('测速地址', 'test_url', o?.test_url) }} />
        <ActionRow icon="network" color="systemBlue" title="出口 IP 地址" sub={o?.ip_url} disabled={!live} action={() => { askAddress('出口 IP 地址', 'ip_url', o?.ip_url) }} />
      </KitGroup>
    </Page>
  )
}

function AlertsPage() {
  const [prefs, setPrefsState] = useState<Prefs>(getPrefs())
  const set = (alerts: Prefs['alerts']) => {
    const next = { ...prefs, alerts }
    setPrefsState(next)
    setPrefs(next)
  }
  return (
    <Page title="用量提醒">
      <KitGroup note="小组件刷新时检查, 条件成立时发一次通知。">
        <ToggleRow icon="chart.pie.fill" color="systemBlue" title="用到 80% 和 90%" value={prefs.alerts.usage} onChanged={v => set({ ...prefs.alerts, usage: v })} />
        <ToggleRow icon="hourglass" color="systemBlue" title="预计 3 天内用完" value={prefs.alerts.runout} onChanged={v => set({ ...prefs.alerts, runout: v })} />
        <ToggleRow icon="calendar" color="systemBlue" title="到期前 3 天" value={prefs.alerts.expire} onChanged={v => set({ ...prefs.alerts, expire: v })} />
      </KitGroup>
    </Page>
  )
}

function DataPage(props: { reload: () => Promise<void> }) {
  const [note, setNote] = useState('')
  return (
    <Page title="数据和缓存">
      <KitGroup note={note || `小组件从 ${DATA_URL} 读 Loon 的数据。用量历史只存数字, 约 60 天, 不存订阅链接。`}>
        <ActionRow icon="safari.fill" color="systemBlue" title="用 Safari 打开数据地址" action={() => { Safari.openURL(DATA_URL) }} />
        <ActionRow icon="arrow.clockwise" color="systemBlue" title="清除 Loon 数据缓存" action={() => { clearLoonCache(); setNote('缓存已清除') }} />
        <ActionRow icon="trash.fill" color="systemRed" title="清除用量历史" action={async () => {
          if (!(await Dialog.confirm({ title: '清除全部用量历史?', message: '趋势图和预测会从头记录', cancelLabel: '取消', confirmLabel: '清除' }))) return
          clearHistory()
          setNote('历史已清除')
          await props.reload()
        }} />
      </KitGroup>
    </Page>
  )
}

function AutoRefreshPage() {
  const major = Number((Device.systemVersion || '0').split('.')[0])
  const [ids, setIds] = useState<string[]>(getRemoteTargets())
  const [note, setNote] = useState('')
  const err = (e: unknown) => (e as Error)?.message ?? String(e)

  async function enable() {
    setNote('授权中...')
    try {
      await Widget.remoteUpdates.enable()
      setNote('已授权, 接着在桌面小组件的编辑页里打开 Remote Updates')
    } catch (e) {
      setNote(`授权失败: ${err(e)}`)
    }
  }

  async function load() {
    setNote('读取中...')
    try {
      const list: any[] = await Widget.remoteUpdates.listTargets()
      const next = list.filter(t => String(t?.status ?? '') !== 'disabled').map(t => String(t?.targetId ?? '')).filter(Boolean)
      setIds(next)
      setRemoteTargets(next)
      setNote(next.length ? `读到 ${next.length} 个小组件` : '还没有 target: 确认桌面小组件的配置里已打开 Remote Updates')
    } catch (e) {
      setNote(`读取失败: ${err(e)}`)
    }
  }

  async function send() {
    const key = await Dialog.prompt({ title: '粘贴发送密钥', message: '在 Remote Updates 里为这些 target 生成, 只勾 widgets:reload。只交给 Loon 插件保存, 这里不留。', placeholder: '发送密钥', obscureText: true })
    if (!key?.trim()) return
    try {
      await setOpts({ push_key: key.trim(), targets: ids })
      setNote('已保存到 Loon 插件, 下次体检完会自动刷新小组件')
    } catch (e) {
      setNote(`保存失败: ${err(e)}`)
    }
  }

  return (
    <Page title="自动刷新">
      <KitGroup note={note || 'Loon 体检完马上刷新桌面小组件, 不用等系统定时。需要 iOS 26 以上和 Scripting 的 Remote Push, 和推送通知共用每日额度。'}>
        {major < 26 ? <InfoRow icon="exclamationmark.triangle.fill" color={WARN} title="当前系统低于 iOS 26, 暂时不能用" /> : null}
        <InfoRow icon="1.circle.fill" color="systemBlue" title="连接 Remote Push" sub="Scripting → 工具 → Remote Push 连接这台设备" />
        <ActionRow icon="2.circle.fill" color="systemBlue" title="授权小组件远程刷新" action={enable} />
        <InfoRow icon="3.circle.fill" color="systemBlue" title="打开小组件的 Remote Updates" sub="长按桌面 loon-panel 小组件 → 编辑小组件" />
        <ActionRow icon="4.circle.fill" color="systemBlue" title="读取小组件 target" value={ids.length ? `${ids.length} 个` : undefined} action={load} />
        <InfoRow icon="5.circle.fill" color="systemBlue" title="生成发送密钥" sub="Remote Updates → Create Sender Key, 只勾 widgets:reload" />
        <ActionRow icon="6.circle.fill" color="systemBlue" title="把发送密钥交给 Loon 插件" disabled={!ids.length} action={send} />
      </KitGroup>
    </Page>
  )
}

main()
