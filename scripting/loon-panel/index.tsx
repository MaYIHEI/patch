// loon-panel / index.tsx
// App 页面 — 在 Scripting 里运行, 不是 widget
//
// 底栏四页: 小组件 (引导、预览、样式、外观) / 机场 / 节点 (模式、策略组、体检、事件) / 设置

import {
  Button,
  Tab,
  TabView,
  useObservable,
  ColorPicker,
  EditButton,
  ForEach,
  HStack,
  Image,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Picker,
  Circle,
  ScrollView,
  Script,
  Section,
  Slider,
  Spacer,
  Text,
  Toggle,
  VStack,
  ZStack,
  Menu,
  Widget,
  Path,
  fetch,
  useEffect,
  useState,
} from 'scripting'
import type { Color } from 'scripting'

import {
  loadLoon, cachedLoon, setLoon, deepCheck, dnsServers, clearChecks, leafNodes, pathTo, isAuto, sampleLoon, mainGroup, shownGroups, setOpts, healthCount, availability, loonStatus, clearLoonCache, MODES, DATA_URL,
  type Deep, type LoonData, type Group, type NodeResult, type OptsPatch,
} from './loon'
import {
  loadSubs, cachedSubs, sampleSubs, listSubs, saveSubs, addSub, updateSub, removeSub, setUsage, readNow, parsePage, subURL, bjDate, DEFAULT_EVERY, clearHistory, recordedDays, localEvents, overview, parseSubs, importSubs,
  fmtBytes, expireText, md, shiftDay, todayStr, type SubView, type Usage,
} from './subs'
import { checkNat, lastNat, type Nat } from './net'
import { Page, Card, Stage, Grid, Block, Panel, StatTile, ToggleTile, KV, NavTile, RoundButton, RoundLink, Group as KitGroup, Chip, SmallButton, NavRow, ActionRow, InfoRow, PickerRow } from './kit'
import {
  getPrefs, setPrefs, getLook, setLook, getDefaults, setDefault, getRemoteTargets, setRemoteTargets,
  DEFAULT_LOOK, RECOMMENDED_BG, RECOMMENDED_ACCENT, type Look, type Family, type Prefs,
} from './settings'
import { makeTheme, Bar, UsageRing, DailyBars, HourBars, Spark, mediaColor, mediaWord, latencyColor, latencyText, nodeLabel, fullLabel, asnText, ago, hhmm, chunk, usageColor, OK, BAD, WARN, type Ctx } from './ui'
import { ipTags } from './styles/net'
import { rateText } from './styles/flow'
import { TRAFFIC_STYLES, NEEDS_SUBS, stylesFor, styleById, paramOf, renderStyle, type StyleDef } from './styles/index'

declare const Safari: { openURL(url: string): Promise<boolean> }

const REMOTE_META = 'https://raw.githubusercontent.com/MaYIHEI/patch/main/scripting/loon-panel/script.json'
const INSTALL_URL = 'https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Floon-panel.zip%22%5D'
const PLUGIN_URL = 'https://raw.githubusercontent.com/MaYIHEI/patch/refs/heads/main/scripting/loon-panel/loon/loon-panel.lpx'
const LOON_IMPORT = `loon://import?plugin=${encodeURIComponent(PLUGIN_URL)}`
const BG_PATH = () => Path.join(FileManager.appGroupDocumentsDirectory, 'loon-panel', 'background.jpg')

async function main() {
  await Navigation.present({ element: <Home />, modalPresentationStyle: 'fullScreen', swipeBackBehavior: 'dismiss' })
  Script.exit()
}

// ─────────────────────────────────────────────────────────────
// 共用
// ─────────────────────────────────────────────────────────────

type Act = { mode?: number; group?: string; node?: string; lock?: number; quiet?: number }
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
  // 预览框比部分机型的桌面组件矮, 留点余量, 免得内容被裁掉
  const room = props.family.startsWith('system') ? 12 : 0
  return (
    <ZStack frame={{ width: box.width * k, height: (box.height + room) * k }}>
      <VStack frame={{ width: box.width, height: box.height + room }} scaleEffect={k}>{view}</VStack>
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
const sampleNote = (id: string, loon: LoonData | null, subs: SubView[]) => (!loon ? ' · 示例数据' : !subs.length && TRAFFIC_STYLES.includes(id) ? ' · 流量是示例' : '')

const previewData = (p: Shared) => ({ loon: p.loon ?? sampleLoon(), subs: p.subs.length ? p.subs : sampleSubs() })

// ─────────────────────────────────────────────────────────────
// 底栏
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

const GALLERY: Partial<Record<Family, number>> = { systemSmall: 0.8, systemMedium: 0.62, systemLarge: 0.5 }

/** 小组件页: 当前样式的预览 + 选样式和外观; 打开 App 默认在这里 */
function WidgetTab(props: { shared: Shared; act: (q: {}, label: string) => Promise<void>; busy: string; close: any; onChanged: () => void; toSubs: () => void }) {
  const { shared } = props
  const [family, setFamily] = useState<Family>('systemMedium')
  const { loon, subs } = shared
  const live = !!loon && !loon.stale
  const look = getLook()
  const data = previewData(shared)
  const style = styleById(getDefaults()[family]) ?? stylesFor(family)[0]
  const more = stylesFor(family).filter(x => x.id !== style.id).sort((a, b) => Number(!shared.subs.length && NEEDS_SUBS.includes(a.id)) - Number(!shared.subs.length && NEEDS_SUBS.includes(b.id)))
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
        <Stage>
          <Preview style={style} family={family} loon={data.loon} subs={data.subs} />
          <Text font={12} foregroundStyle="secondaryLabel">{`${style.name} · ${FAMILY_NAME[family]}${sampleNote(style.id, loon, subs)}`}</Text>
        </Stage>
      </VStack>
      {more.length ? (
        <Block title="这个尺寸还有">
          <ScrollView axes="horizontal" scrollIndicator="hidden">
            <HStack spacing={12} alignment="top">
              {more.map(x => (
                <NavigationLink destination={<StyleDetail style={x} family={family} loon={data.loon} subs={data.subs} onChanged={props.onChanged} />} buttonStyle="plain">
                  <VStack spacing={6}>
                    <Preview style={x} family={family} loon={data.loon} subs={data.subs} scale={GALLERY[family] ?? 1} />
                    <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{`${x.name}${!shared.subs.length && NEEDS_SUBS.includes(x.id) ? ' · 需要机场' : ''}`}</Text>
                  </VStack>
                </NavigationLink>
              ))}
            </HStack>
          </ScrollView>
        </Block>
      ) : null}
      <VStack alignment="leading" spacing={8}>
        <Grid>
          <NavTile icon="square.grid.2x2" title="换个样式" value={`${stylesFor(family).length} 种`} destination={<StyleLibrary {...shared} start={family.startsWith('accessory') ? 'lock' : family as SizeTab} onChanged={props.onChanged} />} />
          <NavTile icon="paintpalette" title="外观" value={look.mode === 'plain' ? '素净' : look.bgType === 'image' ? '自定义图片' : '自定义纯色'} destination={<AppearancePage {...shared} onChanged={props.onChanged} />} />
        </Grid>
        <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 20 }}>加到桌面: 长按桌面空白处 → + → 搜 Scripting → 选 Loon 面板。</Text>
      </VStack>
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
  const common = loon ? shownGroups(loon, getPrefs()) : []
  const bar = { cancellationAction: props.close, topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={() => reload(true)} /> }
  if (!loon) return <Page title="节点" large bar={bar}><Text foregroundStyle="secondaryLabel">{`${st.text}。保持 Loon 开启并启用「Loon 面板」插件。`}</Text></Page>
  const main = mainGroup(loon, getPrefs())
  const others = common.filter(g => g.name !== main?.name)
  const link = (g: Group, body: any) => <NavigationLink destination={<GroupPage group={g} loon={loon} act={act} reload={reload} />} buttonStyle="plain">{body}</NavigationLink>
  const allTile = (
    <NavigationLink destination={<AllGroupsPage loon={loon} act={act} reload={reload} />} buttonStyle="plain">
      <Card inner={14} tall={92}>
        <VStack alignment="leading" spacing={3}>
          <Text font={12} foregroundStyle="secondaryLabel">策略组</Text>
          <Text font={22} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label">{`全部 ${loon.groups.length}`}</Text>
        </VStack>
      </Card>
    </NavigationLink>
  )
  return (
    <Page title="节点" large bar={bar}>
      {st.level !== 'ok' ? (
        <HStack spacing={6} padding={{ leading: 4 }}>
          <Circle fill={st.level === 'warn' ? WARN : BAD} frame={{ width: 7, height: 7 }} />
          <Text font={13} foregroundStyle="secondaryLabel">{`${st.text}${loon.stale ? ` · 显示 ${hhmm(loon.t)} 的数据` : ''}`}</Text>
        </HStack>
      ) : null}
      {main ? link(main, <HeroCard group={main} loon={loon} />) : null}
      {main ? (
        <KitGroup>
          <PickerRow icon="house" title="主策略组" value={main.name} options={loon.groups.map(g => [g.name, g.name])} onChanged={v => { setPrefs({ ...getPrefs(), main: v }); Widget.reloadAll(); reload() }} />
        </KitGroup>
      ) : null}
      <Picker title="模式" value={loon.mode} onChanged={(v: any) => { if (Number(v) !== loon.mode) act({ mode: Number(v) }, '切换模式') }} pickerStyle="segmented" disabled={!!busy || !live}>
        {MODES.map(m => <Text tag={m.id}>{m.name}</Text>)}
      </Picker>
      <Grid>
        {others.map(g => link(g, <GroupTile group={g} loon={loon} />))}
        {others.length % 2 ? allTile : null}
      </Grid>
      {others.length % 2 ? null : (
        <KitGroup><NavRow icon="square.grid.2x2" title="全部策略组" value={`${loon.groups.length} 个`} destination={<AllGroupsPage loon={loon} act={act} reload={reload} />} /></KitGroup>
      )}
      <VStack spacing={8}>
        <HStack>
          <RoundButton icon="stethoscope" title="立即体检" disabled={!!busy || !live} action={() => { act({}, '体检当前节点') }} />
          {main ? <RoundLink icon="magnifyingglass" title="深度检测" destination={<DeepPage node={main.leaf} loon={loon} reload={reload} />} /> : null}
          <RoundButton icon="arrow.down.circle" title="更新订阅" action={() => { Safari.openURL('loon://update?sub=all') }} />
          {events.length ? <RoundLink icon="list.bullet" title={`事件 ${events.length}`} destination={<EventsPage events={events} />} /> : null}
        </HStack>
        {note ? <Text font={12} foregroundStyle="secondaryLabel">{note}</Text> : null}
      </VStack>
    </Page>
  )
}

/** 延迟: 小圆点表示好坏, 数字保持黑色 */
function Latency(props: { r?: NodeResult }) {
  return (
    <HStack spacing={6}>
      <Circle fill={latencyColor(props.r)} frame={{ width: 6, height: 6 }} />
      <Text font={14} monospacedDigit foregroundStyle={props.r ? 'label' : 'secondaryLabel'}>{latencyText(props.r)}</Text>
    </HStack>
  )
}

/** 节点页网格里的策略组; 正常时数字保持黑色, 慢和超时才给颜色 */
function GroupTile(props: { group: Group; loon: LoonData }) {
  const { group: g, loon } = props
  const r = g.gone ? undefined : loon.nodes[g.leaf]
  return (
    <Card inner={14} tall={92}>
      <VStack alignment="leading" spacing={3}>
        <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{g.name}</Text>
        <Text font={22} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={r && (!r.ok || r.ms >= 800) ? latencyColor(r) : 'label'}>{latencyText(r)}</Text>
        <Text font={12} foregroundStyle={g.gone ? WARN : 'secondaryLabel'} lineLimit={1}>{g.gone ? `${g.leaf} 已失效` : nodeLabel(g.leaf, r)}</Text>
      </VStack>
    </Card>
  )
}

/** 节点页顶部: 主策略组现在好不好 */
function HeroCard(props: { group: Group; loon: LoonData }) {
  const { group: g, loon } = props
  const r = g.gone ? undefined : loon.nodes[g.leaf]
  const c = healthCount(loon)
  return (
    <Card inner={18}>
      <VStack alignment="leading" spacing={6}>
        <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>{g.name}</Text>
        <HStack alignment="lastTextBaseline" spacing={4}>
          <Text font={44} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={r && (!r.ok || r.ms >= 800) ? latencyColor(r) : 'label'}>{r ? (r.ok ? String(r.ms) : '超时') : '未测'}</Text>
          {r?.ok ? <Text font={15} foregroundStyle="secondaryLabel">ms</Text> : null}
        </HStack>
        <Text font={15} foregroundStyle={g.gone ? WARN : 'label'} lineLimit={1}>{g.gone ? `${g.leaf} 已失效，重新选一个节点` : nodeLabel(g.leaf, r)}</Text>
        {r?.h?.length ? <Spark ctx={appCtx(null, [])} h={r.h} height={30} count={24} tone="systemBlue" /> : null}
        <HStack>
          {c.total ? <Text font={12} foregroundStyle="secondaryLabel">{`${c.ok}/${c.total} 个节点可用`}</Text> : null}
          <Spacer />
          {loon.check ? <Text font={12} foregroundStyle="secondaryLabel">{`${ago(loon.check.t)} 体检`}</Text> : null}
        </HStack>
      </VStack>
    </Card>
  )
}

function AllGroupsPage(props: { loon: LoonData; act: (q: Act, label: string) => Promise<void>; reload: (force?: boolean) => Promise<void> }) {
  const { loon, act, reload } = props
  const [common, setCommon] = useState<Group[]>(shownGroups(loon, getPrefs()))
  const rest = loon.groups.filter(g => !common.some(x => x.name === g.name))
  const tile = (g: Group) => (
    <NavigationLink key={g.name} destination={<GroupPage group={g} loon={loon} act={act} reload={reload} />} buttonStyle="plain">
      <GroupTile group={g} loon={loon} />
    </NavigationLink>
  )
  return (
    <Page title="全部策略组">
      <Block title="常用" note="节点页、切换器、策略组卡片和全景看板都围绕这些; 进策略组里可以加入或移出常用。">
        <Grid>{common.map(tile)}</Grid>
      </Block>
      {common.length > 1 ? (
        <KitGroup>
          <NavRow icon="arrow.up.arrow.down" title="调整常用顺序" destination={<GroupOrderPage list={common} onChanged={next => { setCommon(next); reload() }} />} />
        </KitGroup>
      ) : null}
      {rest.length ? <Block title="其他"><Grid>{rest.map(tile)}</Grid></Block> : null}
    </Page>
  )
}

function GroupOrderPage(props: { list: Group[]; onChanged: (next: Group[]) => void }) {
  const [list, setList] = useState(props.list)

  function onMove(indices: number[], newOffset: number) {
    const moving = indices.map(i => list[i])
    const next = list.filter((_, i) => !indices.includes(i))
    next.splice(newOffset, 0, ...moving)
    setList(next)
    setPrefs({ ...getPrefs(), groups: next.map(g => g.name) })
    Widget.reloadAll()
    props.onChanged(next)
  }

  return (
    <List navigationTitle="调整常用顺序" navigationBarTitleDisplayMode="inline" toolbar={{ topBarTrailing: <EditButton /> }}>
      <Section footer={<Text>点右上角「编辑」拖动。</Text>}>
        <ForEach count={list.length} itemBuilder={(i: number) => <Text key={list[i].name}>{list[i].name}</Text>} onMove={onMove} />
      </Section>
    </List>
  )
}

/** 首次引导: 导入插件 → 添加订阅 → 跑一次体检; 做完的打勾 */
function Guide(props: { shared: Shared; act: (q: {}, label: string) => Promise<void>; busy: string; toSubs: () => void }) {
  const { loon, loonErr, subs } = props.shared
  const live = !!loon && !loon.stale
  const steps = [
    !live && { title: '导入 Loon 插件', sub: '一键添加「Loon 面板」插件, 装好后回来刷新', button: <SmallButton title="导入" action={() => { Safari.openURL(LOON_IMPORT) }} /> },
    !subs.length && { title: '添加机场订阅', sub: '订阅链接只存在钥匙串里', button: <SmallButton title="添加" action={props.toSubs} /> },
    !loon?.check && { title: '跑一次体检', sub: '测当前节点的延迟和出口; 之后插件定时体检', button: <SmallButton title="体检" disabled={!live || !!props.busy} action={() => { props.act({}, '体检当前节点') }} /> },
  ].filter(x => !!x)
  const step = (x: { title: string; sub: string; button: any }, i: number) => (
    <HStack spacing={12} padding={{ horizontal: 14, vertical: 12 }}>
      {steps.length > 1 ? <Chip icon={`${i + 1}.circle`} /> : null}
      <VStack alignment="leading" spacing={2}>
        <Text font={15} fontWeight="medium">{x.title}</Text>
        <Text font={12} foregroundStyle="secondaryLabel">{x.sub}</Text>
      </VStack>
      <Spacer />
      {x.button}
    </HStack>
  )
  return (
    <VStack alignment="leading" spacing={8}>
      <KitGroup title={steps.length > 1 ? '还差这几步' : '还差一步'} inset={54}>{steps.map(step)}</KitGroup>
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
/** via: 从上一层点进来时的那一步; 这时列出下面所有节点, 选了从上层一路切过去. changed: 选完告诉上一层刷新 */
function GroupPage(props: { group: Group; loon: LoonData; act: (q: Act, label: string) => Promise<void>; reload: (force?: boolean) => Promise<void>; via?: { group: string; node: string }[]; changed?: () => void }) {
  const [g, setG] = useState(props.group)
  const [loon, setLoonData] = useState(props.loon)
  const [busy, setBusy] = useState('')
  const locked = loon.locks?.[g.name]
  const resultOf = (n: string) => loon.nodes[loon.groups.find(x => x.name === n)?.leaf ?? n]   // 成员是策略组时看它正在用的节点
  const ms = (n: string) => { const r = resultOf(n); return !r ? 1e7 : r.ok ? r.ms : 1e6 }
  const list = (props.via ? leafNodes(loon, g.name) : g.subs.slice()).sort((a, b) => ms(a) - ms(b))
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
    update({ groups: on ? [...common, g.name] : common.filter(n => n !== g.name) })
  }

  async function toggleFull(on: boolean) {
    try {
      setLoonData(await setOpts({ groups: on ? [...full, g.name] : full.filter(n => n !== g.name) }))
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  function sync() {
    const fresh = cachedLoon()
    if (fresh) {
      setLoonData(fresh)
      const x = fresh.groups.find(y => y.name === g.name)
      if (x) setG(x)
    }
    props.changed?.()
  }

  async function after(q: Act, label: string) {
    await props.act(q, label)
    sync()
  }

  async function pick(node: string) {
    const full = props.via ? [...props.via, ...(pathTo(loon, g.name, node) ?? [])] : [{ group: g.name, node }]
    const hops = full.filter(h => cachedLoon()?.groups.find(x => x.name === h.group)?.now !== h.node)   // 已经指着的层不用再切
    if (busy || !hops.length) return
    setBusy(node)
    for (const [i, h] of hops.entries()) await props.act({ ...h, quiet: i < hops.length - 1 ? 1 : undefined }, `切换到 ${h.node}`)
    sync()
    setBusy('')
  }

  const out = loon.nodes[g.leaf]
  return (
    <Page title={g.name}>
      <HeroCard group={g} loon={loon} />

      <KitGroup>
        <NavRow icon="magnifyingglass" title="深度检测" sub={`测 ${nodeLabel(g.leaf, out)}`} destination={<DeepPage node={g.leaf} loon={loon} reload={props.reload} />} />
      </KitGroup>

      <KitGroup title={loon.check ? `按延迟排序 · ${ago(loon.check.t)} 体检` : '节点'} note="点一行切换, 点右边的 › 看里面所有节点。没测过的显示「未测」, 打开下面的「全量体检」就会测全部节点。" inset={44}>
        {list.map(name => {
          const r = resultOf(name)
          const a = availability(r)
          const inner = loon.groups.find(x => x.name === name)
          const on = props.via ? name === g.leaf : name === g.now
          return (
            <HStack spacing={0}>
              <Button action={() => { pick(name) }} buttonStyle="plain" frame={{ maxWidth: 'infinity' }}>
                <HStack spacing={10} padding={{ leading: 14, trailing: inner && !isAuto(name) ? 6 : 14, vertical: 10 }} frame={{ maxWidth: 'infinity' }}>
                  <Image systemName={on ? 'checkmark.circle.fill' : inner ? 'folder' : 'circle'} foregroundStyle={on ? 'systemBlue' : 'tertiaryLabel'} />
                  <VStack alignment="leading" spacing={1}>
                    <Text font={15} foregroundStyle="label" lineLimit={1}>{inner ? name : fullLabel(name, r)}</Text>
                    {inner ? <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{`正在用 ${nodeLabel(inner.leaf, r)}`}</Text>
                      : r ? <Text font={11} foregroundStyle={r.ok ? 'secondaryLabel' : BAD} lineLimit={1}>{r.ok ? [a === null ? '' : `可用 ${Math.round(a * 100)}%`, asnText(r)].filter(Boolean).join(' · ') : `连续 ${r.fail ?? 1} 次超时`}</Text> : null}
                  </VStack>
                  <Spacer />
                  {!inner && r?.h?.length ? <Spark ctx={appCtx(null, [])} h={r.h} width={40} height={14} tone="tertiaryLabel" /> : null}
                  {busy === name ? <Text font={12} foregroundStyle="secondaryLabel">切换中</Text> : <Latency r={r} />}
                </HStack>
              </Button>
              {inner && !isAuto(name) ? (
                <NavigationLink destination={<GroupPage group={inner} loon={loon} act={props.act} reload={props.reload} via={[{ group: g.name, node: name }]} changed={sync} />} buttonStyle="plain">
                  <Image systemName="chevron.right" font={13} fontWeight="semibold" foregroundStyle="systemBlue" padding={{ horizontal: 14, vertical: 16 }} />
                </NavigationLink>
              ) : null}
            </HStack>
          )
        })}
      </KitGroup>

      <Block title="这个策略组" note={note || (locked ? `Loon 把选择还原时, 插件会改回 ${locked} 并发通知。` : undefined)}>
        <Grid>
          <ToggleTile icon="star" title="常用" sub="小组件上切换" value={common.includes(g.name)} onChanged={toggleCommon} />
          <ToggleTile icon="house" title="主策略组" sub="小号和锁屏显示" value={isMain} onChanged={(v: boolean) => update({ main: v ? g.name : '' })} />
          <ToggleTile icon="play.tv" title="解锁样式" sub="看这个组的结果" value={isUnlock} onChanged={(v: boolean) => update({ unlock: v ? g.name : '' })} />
          <ToggleTile icon="waveform.path.ecg" title="全量体检" sub="每次测全部节点" value={full.includes(g.name)} onChanged={(v: boolean) => { toggleFull(v) }} />
          <ToggleTile icon="lock" title="锁定" sub="被还原就改回来" value={!!locked} onChanged={(v: boolean) => { after(v ? { group: g.name, node: g.now, lock: 1 } : { group: g.name, lock: 0 }, v ? '锁定' : '解锁') }} />
        </Grid>
      </Block>

      <KitGroup title={`当前节点 · ${nodeLabel(g.leaf, out)}`} inset={14}>
        {out?.ip ? <KV k="出口" v={`${out.cc ?? ''} ${out.ip}`} /> : null}
        {media.length ? (
          <VStack alignment="leading" spacing={6} padding={{ horizontal: 14, vertical: 11 }}>
            <Text font={13} foregroundStyle="secondaryLabel">解锁</Text>
            {chunk(media, 3).map(row => (
              <HStack spacing={8}>
                {row.map(m => <Text font={12} foregroundStyle={mediaColor(m)} frame={{ maxWidth: 'infinity', alignment: 'leading' }} lineLimit={1}>{`${m.name} ${mediaWord(m)}`}</Text>)}
              </HStack>
            ))}
          </VStack>
        ) : null}
      </KitGroup>
    </Page>
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

  async function run(mode: 'basic' | 'speed' | 'full') {
    setNote(mode === 'basic' ? '检测中, 约一分钟...' : `${mode === 'full' ? '完整检测' : '检测和测速'}中, 约一分钟, 会用掉十几 MB 流量...`)
    try {
      const data = await deepCheck(props.node, mode)
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
    <KitGroup title={title} inset={14}>{list.map(x => <KV k={x.k} v={x.v} color={x.color} />)}</KitGroup>
  ) : null)
  const yes = (b?: boolean) => (b ? '是' : '否')

  return (
    <Page title="深度检测">
      <Card inner={18}>
        <VStack alignment="leading" spacing={6}>
          <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>{props.node}</Text>
          <Text font={30} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label" lineLimit={1} minScaleFactor={0.5}>{d?.basic?.ip ?? '还没检测'}</Text>
          {d?.basic?.org ? <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>{`${d.basic.cc ?? ''} ${d.basic.org}`}</Text> : null}
        </VStack>
      </Card>
      <Block note={note || '检测会把这个节点的出口 IP 提交给第三方查询服务。结果会显示在 IP 质量、三网延迟、网络安全、线路体检报告这些样式上。测速用十几 MB 流量。完整检测包含测速, 再加 MTR 和 BGP 路径, 会用更多外部探针。'}>
        <HStack>
          <RoundButton icon="magnifyingglass" title="开始检测" action={() => { run('basic') }} />
          <RoundButton icon="speedometer" title="检测并测速" action={() => { run('speed') }} />
          <RoundButton icon="list.bullet.clipboard" title="完整检测" action={() => { run('full') }} />
          <RoundButton icon="network" title="NAT 类型" action={nat2} />
        </HStack>
      </Block>
      {nat ? rows('NAT', [{ k: '类型', v: nat.text }]) : null}
      {d ? rows('基础', [
        ...(d.basic?.ip ? [{ k: '出口', v: `${d.basic.cc ?? ''} ${d.basic.ip}` }] : []),
        ...(d.basic?.org ? [{ k: '运营商', v: `${d.basic.asn ? `AS${d.basic.asn} ` : ''}${d.basic.org}` }] : []),
        ...(d.basic?.registered ? [{ k: '注册地', v: `${d.basic.registered}${d.basic.cc ? (d.basic.registered === d.basic.cc ? ' · 和使用地一致' : ` · 和使用地 ${d.basic.cc} 不一致`) : ''}`, color: d.basic.cc && d.basic.registered !== d.basic.cc ? WARN : undefined }] : []),
        ...(d.basic?.timezone ? [{ k: '时区', v: d.basic.timezone }] : []),
        ...(d.basic?.route && d.basic.route !== d.bgp?.prefix ? [{ k: '路由段', v: d.basic.route }] : []),
        ...(d.bgp?.prefix ? [{ k: 'BGP', v: `${d.bgp.prefix}${d.bgp.rpki ? ` · RPKI ${d.bgp.rpki}` : ''}` }] : []),
        ...ipTags(d).map(t => ({ k: '标记', v: t.text, color: t.color })),
        ...(d.egress && d.egress.length > 1 ? [{ k: '出口分流', v: `${d.egress.length} 个出口`, color: WARN }] : []),
      ]) : null}
      {d ? rows('IP 类型和风险 (各来源原样)', [
        ...(d.types ?? []).map(t => ({ k: t.source, v: t.type })),
        ...(d.scores ?? []).map(t => ({ k: t.source, v: `风险 ${t.score ?? '-'}${t.text ? ` · ${t.text}` : ''}` })),
        ...(d.factors ?? []).map(f => ({ k: f.source, v: `代理 ${yes(f.proxy)} · VPN ${yes(f.vpn)} · Tor ${yes(f.tor)} · 机房 ${yes(f.hosting)}` })),
      ]) : null}
      {d ? rows('解锁', (d.media ?? []).map(m => ({ k: m.name, v: `${mediaWord(m)}${m.note ? ` · ${m.note}` : ''}`, color: mediaColor(m) }))) : null}
      {d ? rows('三网 (外部探针到出口)', (d.ping ?? []).map(p => {
        const w = d.inbound?.find(x => x.isp === p.isp)
        return { k: ISP_NAME[p.isp], v: `${p.avg !== undefined ? `${Math.round(p.avg)}ms` : '-'} · 丢包 ${p.loss ?? 0}%${w?.summary ? ` · ${w.summary}` : ''}` }
      })) : null}
      {d ? rows('回程 (同网络探针, 不是节点本机)', (d.backhaul ?? []).map(b => ({ k: ISP_NAME[b.isp], v: [b.summary ?? '未识别线路', b.hops ? `${b.hops} 跳` : '', b.probe ?? ''].filter(Boolean).join(' · ') }))) : null}
      {d ? rows('MTR (外部探针到出口, 单跳丢包不等于业务丢包)', (d.mtr ?? []).map(m => ({
        k: ISP_NAME[m.isp],
        v: [m.reached ? '到达出口' : '未确认到达', m.hops ? `${m.hops} 跳` : '', m.avg !== undefined ? `末跳 ${Math.round(m.avg)}ms` : '', m.loss !== undefined ? `丢包 ${m.loss}%` : '', m.jitter !== undefined ? `抖动 ${m.jitter}ms` : ''].filter(Boolean).join(' · '),
      }))) : null}
      {d?.bgppath ? rows('BGP 路径 (公共采集器的样本, 不是节点的数据路径)', [
        ...(d.bgppath.peers !== undefined ? [{ k: '可见性', v: `${d.bgppath.seen ?? '-'} / ${d.bgppath.peers} 个邻居` }] : []),
        { k: '路径样本', v: `${d.bgppath.count} 条${d.bgppath.collectors ? ` · ${d.bgppath.collectors} 个采集器` : ''}` },
        ...(d.bgppath.clues?.length ? [{ k: '含国内网络', v: d.bgppath.clues.map(x => `AS${x.asn} ${x.count} 条`).join('、') }] : []),
        ...(d.bgppath.origin ? [{ k: '历史 Origin', v: d.bgppath.origin, color: WARN }] : []),
        ...(d.bgppath.samples ?? []).map((x, i) => ({ k: `样本 ${i + 1}${x.collector ? ` ${x.collector}` : ''}`, v: x.path.map(a => `AS${a}`).join(' → ') })),
      ]) : null}
      {d ? rows('DNS 和黑名单', [
        ...dnsServers(d).map(v => ({ k: 'DNS 服务器', v })),
        ...(d.dnsleak?.ecs ? [{ k: 'ECS 网段', v: `${d.dnsleak.ecs.ip}${d.dnsleak.ecs.geo ? ` · ${d.dnsleak.ecs.geo}` : ''}` }] : []),
        ...(d.dns ? [{ k: '本地 DNS', v: d.dns.polluted.length ? `${d.dns.polluted.length}/${d.dns.checked} 疑似污染, 和节点无关` : `${d.dns.checked} 个域名未见污染`, color: d.dns.polluted.length ? WARN : OK }] : []),
        ...(d.dns?.hits ?? []).map(x => ({ k: x.domain, v: `${x.ip} · ${x.owner}` })),
        ...(d.dnsbl ? [{ k: 'IP 黑名单', v: d.dnsbl.listed.length ? d.dnsbl.listed.map(x => x.list).join('、') : `${d.dnsbl.checked} 家未命中`, color: d.dnsbl.listed.length ? WARN : OK }] : []),
      ]) : null}
      {d ? rows('速度', [
        ...(d.speed?.down ? [{ k: '下载', v: `${Math.round(d.speed.down)}Mbps${d.speed.conns ? ` · ${d.speed.conns} 连接` : ''}` }] : []),
        ...(d.speed?.up ? [{ k: '上传', v: `${Math.round(d.speed.up)}Mbps` }] : []),
        ...(d.stability ?? []).map(x => ({ k: `HTTPS ${x.target}`, v: `成功 ${x.ok}/${x.total}${x.median ? ` · ${x.median}ms` : ''}` })),
      ]) : null}
      {d?.status ? rows('数据状态', [
        { k: '数据来源', v: `${d.status.ok}/${d.status.total} 成功`, color: d.status.failed?.length ? WARN : OK },
        ...(d.status.failed?.length ? [{ k: '未成功', v: d.status.failed.join('、') }] : []),
        ...Object.entries(d.status.reasons ?? {}).map(([k, v]) => ({ k, v })),
        ...(d.status.skipped?.length ? [{ k: '已跳过', v: d.status.skipped.join('、') }] : []),
        ...(d.status.split ? [{ k: 'IPPure', v: `分流出口 ${d.status.split}, 不计入风险` }] : []),
        { k: '请求', v: `${d.status.requests}/${d.status.sent} 成功` },
        { k: '耗时', v: `${Math.round(d.status.ms / 1000)} 秒` },
      ]) : null}
      {d?.errors && Object.keys(d.errors).length ? rows('没拿到的项目', Object.entries(d.errors).map(([k, v]) => ({ k, v: String(v) }))) : null}
      {d ? (
        <KitGroup inset={14}>
          <ActionRow icon="trash" color="systemRed" title="清除这个节点的结果" destructive action={async () => {
            try {
              await clearChecks(props.node)
              setD(null)
              setNote('已清除')
              await props.reload()
            } catch (e) {
              setNote(`清除失败, 请更新 Loon 插件: ${(e as Error).message}`)
            }
          }} />
        </KitGroup>
      ) : null}
    </Page>
  )
}

function EventsPage(props: { events: { t: number; k: string; msg: string }[] }) {
  const days = [...new Set(props.events.map(e => md(e.t)))]
  return (
    <Page title="发生了什么">
      {days.map(day => (
        <KitGroup title={day} inset={66}>
          {props.events.filter(e => md(e.t) === day).map(e => (
            <HStack spacing={12} alignment="firstTextBaseline" padding={{ horizontal: 14, vertical: 11 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <Text font={12} monospacedDigit foregroundStyle="secondaryLabel" frame={{ width: 40, alignment: 'leading' }}>{hhmm(e.t)}</Text>
              <Text font={14} foregroundStyle="label">{e.msg}</Text>
            </HStack>
          ))}
        </KitGroup>
      ))}
    </Page>
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

/** 选读取方式; 这一步之前不能碰订阅链接 */
async function askEvery(): Promise<number | null> {
  const i = await Dialog.actionSheet({
    title: '怎么读取用量',
    message: '机场不让随时拉取订阅就选手动填写, 面板不会请求订阅',
    cancelButton: true,
    actions: [{ label: `低频读取 (${DEFAULT_EVERY} 小时一次)` }, { label: '手动填写' }],
  })
  return i === 0 ? DEFAULT_EVERY : i === 1 ? 0 : null
}

/** 手动填写用量; 取消或填错返回 false */
async function askUsage(s: { id: string; name: string }, u?: Usage): Promise<boolean> {
  const G = 1024 ** 3
  const gb = (n?: number) => (n ? String(Number((n / G).toFixed(2))) : '')
  const total = await Dialog.prompt({ title: `${s.name} 的总流量`, message: '单位 GB; 留空表示不限量', defaultValue: gb(u?.total), keyboardType: 'decimalPad' })
  if (total === null) return false
  const used = await Dialog.prompt({ title: '已用流量', message: '单位 GB, 在机场官网看', defaultValue: gb(u ? u.up + u.down : 0), keyboardType: 'decimalPad' })
  if (used === null) return false
  const date = await Dialog.prompt({ title: '到期日', message: '格式 2026-12-31; 留空表示没有到期日', defaultValue: u?.expire ? bjDate(u.expire * 1000) : '' })
  if (date === null) return false
  const expire = date.trim() ? Date.parse(`${date.trim()}T23:59:59+08:00`) / 1000 : 0
  const a = Number(total), b = Number(used)
  if (!(a >= 0) || !(b >= 0) || Number.isNaN(expire)) {
    await Dialog.alert({ title: '没有保存', message: '流量要填数字, 到期日格式是 2026-12-31' })
    return false
  }
  setUsage(s.id, b * G, a * G, expire)
  return true
}

function SubsPage(props: Shared & { close: any }) {
  const title = '机场'
  const [list, setList] = useState<SubView[]>(props.subs)
  const [note, setNote] = useState('')

  useEffect(() => { setList(props.subs) }, [props.subs])   // 这页一开 App 就挂着, 跟着外面的刷新走

  async function refresh(force: boolean) {
    const s = await loadSubs(force)
    setList(s)
    Widget.reloadAll()
    await props.reload()
  }

  async function add() {
    const name = await Dialog.prompt({ title: '机场名字', message: '显示在小组件上, 比如「主力」', placeholder: '名字' })
    if (!name?.trim()) return
    const every = await askEvery()
    if (every === null) return
    if (!every) {
      const saved = await askUsage(addSub(name, '', 0))
      setNote(saved ? `已添加 ${name.trim()}` : `已添加 ${name.trim()}, 点进去填写用量`)
      return refresh(false)
    }
    const url = await askURL(`${name.trim()} 的订阅链接`)
    if (!url) return
    addSub(name, url, every)
    setNote(`已添加 ${name.trim()}`)
    await refresh(true)
  }

  /** 配置文本 → 选好读取方式再添加, 导入时不请求订阅 */
  async function importText(text: string) {
    const found = parseSubs(text)
    if (!found.length) return setNote('没找到订阅链接')
    const every = await askEvery()
    if (every === null) return
    const r = importSubs(found, every)
    setNote([
      r.added.length ? `已添加 ${r.added.join('、')}${every ? '' : ', 点进去填写用量'}` : '没有新增',
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

  if (!list.length) return (
    <Page title={title} large bar={{ cancellationAction: props.close }}>
      <KitGroup note={note || 'Loon 脚本读不到订阅链接, 所以从配置里导入: 在 Loon 导出配置文件后选择它, 或复制配置内容、订阅链接后从剪贴板添加。添加时选读取方式, 选之前不会请求订阅; 链接只存在本机钥匙串。'}>
        <ActionRow icon="doc.badge.plus" title="从 Loon 配置文件导入" action={fromFile} />
        <ActionRow icon="doc.on.clipboard" title="从剪贴板添加" action={fromPaste} />
        <ActionRow icon="square.and.pencil" title="手动添加" action={add} />
      </KitGroup>
    </Page>
  )

  return (
    <Page title={title} large bar={{ cancellationAction: props.close, topBarTrailing: (
      <Menu title="添加" systemImage="plus">
        <Button title="从 Loon 配置文件导入" systemImage="doc.badge.plus" action={fromFile} />
        <Button title="从剪贴板添加" systemImage="doc.on.clipboard" action={fromPaste} />
        <Button title="手动添加" systemImage="square.and.pencil" action={add} />
        <Button title="立即刷新用量" systemImage="arrow.clockwise" action={async () => { setNote('刷新中...'); await refresh(true); setNote(`已检查 ${hhmm(Date.now())}, 30 分钟内读过的不重复请求`) }} />
      </Menu>
    ) }}>
      {note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 20 }}>{note}</Text> : null}
      {list.map((s, i) => (
        <NavigationLink key={s.id} destination={<SubDetail sub={s} onChanged={() => refresh(false)} />} buttonStyle="plain">
          <SubCard sub={s} first={i === 0 && list.length > 1} />
        </NavigationLink>
      ))}
      {list.length > 1 ? (
        <KitGroup>
          <NavRow icon="arrow.up.arrow.down" title="调整顺序" sub="第一个是主订阅, 小号、中号和锁屏显示它" destination={<SubsOrderPage list={list} onChanged={() => refresh(false)} />} />
        </KitGroup>
      ) : null}
    </Page>
  )
}

/** 机场页的一张卡: 还剩多少是主角 */
function SubCard(props: { sub: SubView; first: boolean }) {
  const s = props.sub
  const u = s.usage
  const limited = !!u && u.total > 0
  return (
    <Card inner={16}>
      <VStack alignment="leading" spacing={8}>
        <HStack spacing={6}>
          <Text font={14} foregroundStyle="label" lineLimit={1}>{s.name}</Text>
          {props.first ? <Text font={11} foregroundStyle="secondaryLabel">主订阅</Text> : null}
          <Spacer />
          {s.deadline ? <Text font={12} foregroundStyle="secondaryLabel">{`${md(s.deadline)} ${s.deadlineWord}`}</Text> : null}
        </HStack>
        <HStack alignment="lastTextBaseline" spacing={5}>
          <Text font={32} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle="label">{!u ? '-' : limited ? fmtBytes(s.remain) : `已用 ${fmtBytes(s.used)}`}</Text>
          {limited ? <Text font={13} foregroundStyle="secondaryLabel">{`剩余 / ${fmtBytes(u.total)}`}</Text> : null}
        </HStack>
        {limited ? <Bar ctx={appCtx(null, [])} value={s.ratio} color={usageColor(s.ratio)} /> : null}
        {u ? (
          <HStack>
            <Text font={12} foregroundStyle="secondaryLabel">{`今天 ${fmtBytes(s.today)}`}</Text>
            <Spacer />
            <Text font={12} foregroundStyle={s.fc.kind === 'runout' ? WARN : s.fc.kind === 'out' ? BAD : 'secondaryLabel'}>{s.fc.short}</Text>
          </HStack>
        ) : null}
        {s.err ? <Text font={12} foregroundStyle={u ? WARN : BAD} lineLimit={1}>{u ? `旧数据: ${s.err}` : s.err}</Text> : null}
      </VStack>
    </Card>
  )
}

function SubsOrderPage(props: { list: SubView[]; onChanged: () => Promise<void> }) {
  const [list, setList] = useState(props.list)

  function onMove(indices: number[], newOffset: number) {
    const moving = indices.map(i => list[i])
    const next = list.filter((_, i) => !indices.includes(i))
    next.splice(newOffset, 0, ...moving)
    const byId = new Map(listSubs().map(s => [s.id, s]))
    saveSubs(next.map(s => byId.get(s.id)!).filter(Boolean))
    setList(next)
    Widget.reloadAll()
    props.onChanged()
  }

  return (
    <List navigationTitle="调整顺序" navigationBarTitleDisplayMode="inline" toolbar={{ topBarTrailing: <EditButton /> }}>
      <Section footer={<Text>点右上角「编辑」拖动。第一个是主订阅, 小号、中号和锁屏显示它。</Text>}>
        <ForEach count={list.length} itemBuilder={(i: number) => <Text key={list[i].id}>{list[i].name}</Text>} onMove={onMove} />
      </Section>
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

  async function changeEvery(every: number) {
    const url = every && !subURL(s.id) ? await askURL(`${s.name} 的订阅链接`) : undefined
    if (url === null) return
    updateSub(s.id, { every }, url)
    setS({ ...s, every })
    await props.onChanged()
  }

  async function changeSite(): Promise<string | null> {
    const site = (await Dialog.prompt({ title: '机场官网', message: '填用量所在的页面; 登录状态由网页窗口保存, 面板不碰账号密码', defaultValue: s.site ?? u?.site ?? '', keyboardType: 'URL' }))?.trim()
    if (!site) return null
    if (!/^https:\/\//i.test(site)) {
      await Dialog.alert({ title: '地址不对', message: '官网地址要以 https:// 开头' })
      return null
    }
    updateSub(s.id, { site })
    setS({ ...s, site })
    return site
  }

  /** 打开官网: 有的机场要打开页面才开放订阅, 关掉窗口后读一次订阅; 读不到就看页面文字 */
  async function syncSite() {
    const site = s.site ?? await changeSite()
    if (!site) return
    const web = new WebViewController({ settings: { inactiveSchedulingPolicy: 'none' } })
    let text = ''
    try {
      await web.loadURL(site)
      await web.present({ navigationTitle: s.name })
      text = String(await web.evaluateJavaScript('return document.body ? document.body.innerText : ""') ?? '')
    } catch (e) {
      setNote(`网页出错: ${(e as Error).message}`)
    } finally {
      web.dispose()
    }
    let result = ''
    if (subURL(s.id)) {
      setNote('读取中...')
      try {
        await readNow(s)
        result = '已从订阅读到用量'
      } catch (e) {
        result = `订阅没读到: ${(e as Error).message}`
      }
    }
    if (!result.startsWith('已')) {
      const p = parsePage(text)
      const ok = p && await Dialog.confirm({ title: '从官网读到用量', message: `已用 ${fmtBytes(p.used)} / 总量 ${fmtBytes(p.total)}${p.expire ? `, ${bjDate(p.expire * 1000)} 到期` : ''}。数字对吗?`, cancelLabel: '不对', confirmLabel: '保存' })
      if (p && ok) {
        setUsage(s.id, p.used, p.total, p.expire)
        result = '已从官网读到用量'
      } else result = [result, p ? '官网数字没有保存' : '官网页面上没找到用量'].filter(Boolean).join('; ')
    }
    setNote(result)
    setS(cachedSubs().find(x => x.id === s.id) ?? s)
    await props.onChanged()
  }

  async function changeUA(ua: string) {
    updateSub(s.id, { ua: ua || undefined })
    setS({ ...s, ua: ua || undefined })
    await props.onChanged()
  }

  async function fill() {
    if (!(await askUsage(s, u))) return
    setS(cachedSubs().find(x => x.id === s.id) ?? s)
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
    <Page title={s.name}>
      <Card inner={18}>
        <HStack spacing={16}>
          <UsageRing ctx={appCtx(null, [])} ratio={s.ratio} size={72} line={9} color={usageColor(s.ratio)}>
            <Text font={16} fontWeight="bold" fontDesign="rounded" monospacedDigit>{u && u.total > 0 ? `${Math.round(s.ratio * 100)}%` : '∞'}</Text>
          </UsageRing>
          <VStack alignment="leading" spacing={3}>
            <Text font={26} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label" lineLimit={1} minScaleFactor={0.6}>{u ? (u.total > 0 ? `剩 ${fmtBytes(Math.max(0, u.total - s.used))}` : '不限流量') : s.every ? '还没读到用量' : '还没填写用量'}</Text>
            <Text font={13} foregroundStyle={s.fc.kind === 'runout' ? WARN : s.fc.kind === 'out' ? BAD : 'secondaryLabel'}>{s.fc.text}</Text>
            {s.err ? <Text font={12} foregroundStyle={u ? WARN : BAD}>{`最近一次读取失败: ${s.err}`}</Text> : null}
          </VStack>
        </HStack>
      </Card>

      <Grid>
        {u ? <StatTile label="已用" value={fmtBytes(s.used)} sub={s.every ? `↑${fmtBytes(u.up)} ↓${fmtBytes(u.down)}` : undefined} /> : null}
        {u && u.total > 0 ? <StatTile label="总量" value={fmtBytes(u.total)} sub={u.plan} /> : null}
        {u?.expire ? <StatTile label="到期" value={expireText(u)} /> : null}
        {s.fc.avg ? <StatTile label="近 7 天日均" value={fmtBytes(s.fc.avg)} /> : null}
        {s.budget ? <StatTile label={`到${s.deadlineWord}前每天`} value={fmtBytes(s.budget.today)} /> : null}
        {s.price > 0 && u && u.total > 0 ? <StatTile label="每 G" value={`¥${(s.price / (u.total / 1024 ** 3)).toFixed(2)}`} sub={`剩余价值 ¥${(s.price * (1 - s.ratio)).toFixed(1)}`} /> : null}
      </Grid>

      <Panel title="今天每小时" note={`${rateText(s.recent)}${s.interval ? ` · 这个机场约 ${s.interval} 分钟更新一次用量` : ''}。精度取决于机场多久更新一次。`}>
        <HourBars ctx={appCtx(null, [])} values={s.hourly} height={64} />
        <HStack><Text font={11} foregroundStyle="secondaryLabel">0 点</Text><Spacer /><Text font={11} foregroundStyle="secondaryLabel">{`今天 ${fmtBytes(s.today)}`}</Text></HStack>
      </Panel>

      <Panel title="近 30 天每天用量" note={known.length ? `已记录 ${recordedDays(s)} 天。每次读到用量按北京时间记一笔, 前后两天相减得到日用量; 中间几天没记录会平均摊开。` : '每次读到用量都会记一笔, 明天起这里显示每天用了多少。'}>
        <DailyBars ctx={appCtx(null, [])} values={days30} height={90} spacing={2} />
        <HStack>
          <Text font={11} foregroundStyle="secondaryLabel">{first.slice(5).replace('-', '/')}</Text>
          <Spacer />
          <Text font={11} foregroundStyle="secondaryLabel">{known.length ? `最多 ${fmtBytes(Math.max(...known))}` : ''}</Text>
          <Spacer />
          <Text font={11} foregroundStyle="secondaryLabel">今天</Text>
        </HStack>
      </Panel>

      <KitGroup note={note || (u ? `${s.every ? '读取' : '填写'}于 ${new Date(u.t).getMonth() + 1}月${new Date(u.t).getDate()}日 ${hhmm(u.t)}` : undefined)}>
        <PickerRow icon="clock" title="读取方式" value={s.every} options={[[1, '1 小时一次'], [3, '3 小时一次'], [6, '6 小时一次'], [12, '12 小时一次'], [24, '24 小时一次'], [0, '手动填写']]} onChanged={v => { changeEvery(v) }} />
        <ActionRow icon="safari" title="打开官网并同步" sub="第一次在窗口里登录, 看到用量后关掉窗口" action={() => { syncSite() }} />
        {s.every ? null : <ActionRow icon="square.and.pencil" title="填写用量" action={fill} />}
        <ActionRow icon="calendar" title="每月重置日" value={s.resetDay ? `${s.resetDay} 号` : '未设置'} action={() => { editNumber('每月几号重置流量', '填 1 到 31; 填了之后预测和每天额度按重置日算', s.resetDay, 'resetDay', 31) }} />
        <ActionRow icon="yensign.circle" title="每期价格" value={s.price ? `¥${s.price}` : '未设置'} action={() => { editNumber('每期多少钱', '用来算每 G 多少钱和性价比', s.price, 'price', 100000) }} />
        <ActionRow icon="globe" title="官网地址" value={s.site ? s.site.replace(/^https:\/\//i, '').split('/')[0] : '未设置'} action={() => { changeSite() }} />
        <ActionRow icon="pencil" title="改名" action={rename} />
        <ActionRow icon="link" title={subURL(s.id) ? '更换订阅链接' : '添加订阅链接'} sub={s.every ? undefined : '手动填写时只在同步官网后读一次'} action={changeURL} />
        {subURL(s.id) ? <PickerRow icon="person.crop.circle" title="请求身份" sub="Loon 格式没有用量时, 用 Mihomo 链接并选 Clash" value={s.ua ?? ''} options={[['', 'Loon'], ['clash.meta', 'Clash']]} onChanged={v => { changeUA(v) }} /> : null}
        <ActionRow icon="trash" color="systemRed" title="删除这个订阅" action={remove} />
      </KitGroup>
    </Page>
  )
}

// ─────────────────────────────────────────────────────────────
// 样式库: 按尺寸分, 只列放得下的
// ─────────────────────────────────────────────────────────────
type SizeTab = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'lock'

function StyleLibrary(props: Shared & { start: SizeTab; onChanged: () => void }) {
  const [tab, setTab] = useState<SizeTab>(props.start)
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
          <Text font={13} fontWeight="medium" foregroundStyle="label">{`${s.name}${!props.subs.length && NEEDS_SUBS.includes(s.id) ? ' · 需要机场' : ''}`}</Text>
          {defaults[f] === s.id ? <Text font={10} foregroundStyle="secondaryLabel">默认</Text> : null}
        </HStack>
      </VStack>
    </NavigationLink>
  )

  // 小号两列原尺寸, 中号一列原尺寸, 大号一列缩小, 锁屏两列原尺寸
  const grid = (f: Family) => {
    const need = (x: StyleDef) => Number(!props.subs.length && NEEDS_SUBS.includes(x.id))
    const list = stylesFor(f).sort((a, b) => need(a) - need(b))
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
    <Page title="样式库">
      <VStack alignment="leading" spacing={18}>
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
    </Page>
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
    <Page title={style.name}>
      <Stage>
        <Preview style={style} family={family} loon={props.loon} subs={props.subs} scale={family === 'systemLarge' ? 0.92 : 1} />
      </Stage>
      <Block note={`${style.desc}。支持: ${sizes}`}>
        <Button action={use} buttonStyle="borderedProminent" controlSize="large" frame={{ maxWidth: 'infinity' }}>
          <Text font={16} fontWeight="semibold" frame={{ maxWidth: 'infinity' }}>用这个样式</Text>
        </Button>
      </Block>
      <Block note={note || (lock
        ? `锁屏: 长按锁屏 → 自定 → 添加小组件 → Scripting → Loon 面板, 点小组件在参数里填「${param}」。不填参数用默认样式。`
        : `桌面: 长按小组件 → 编辑小组件 → 参数里粘贴「${param}」。不填参数就用这个尺寸的默认样式。`)} />
    </Page>
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
    <Page title="外观">
      <Stage>
        <Preview style={style} family={fam} loon={data.loon} subs={data.subs} look={look} scale={fam === 'systemLarge' ? 0.8 : 1} />
        <Text font={12} foregroundStyle="secondaryLabel">{`${style.name} · ${FAMILY_NAME[fam]}${sampleNote(style.id, props.loon, props.subs)}`}</Text>
      </Stage>
      <Picker title="尺寸" value={fam} onChanged={(v: any) => setFam(v as Family)} pickerStyle="segmented">
        <Text tag="systemSmall">小</Text>
        <Text tag="systemMedium">中</Text>
        <Text tag="systemLarge">大</Text>
      </Picker>

      <Panel title="外观" note={look.mode === 'plain' ? '扁平卡片, 跟随系统深浅色。' : '背景可选纯色或相册图片, 文字颜色可自动或手动选; 用图片时可调暗化保证文字清楚。'}>
        <Picker title="外观" value={look.mode} onChanged={(v: any) => update({ mode: v })} pickerStyle="segmented">
          <Text tag="plain">素净</Text>
          <Text tag="custom">自定义</Text>
        </Picker>
      </Panel>

      {look.mode === 'custom' ? (
        <Panel title="背景" note={note || undefined}>
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
        </Panel>
      ) : null}

      {look.mode === 'custom' ? (
        <Panel title="文字颜色" note="自动: 纯色背景按亮度在黑白之间选, 图片背景用白色。灰字由文字色调淡得到, 红绿橙状态色不变。">
          <Picker title="文字颜色" value={look.text} onChanged={(v: any) => update({ text: v })} pickerStyle="segmented">
            <Text tag="auto">自动</Text>
            <Text tag="white">白色</Text>
            <Text tag="black">黑色</Text>
            <Text tag="custom">自选</Text>
          </Picker>
          {look.text === 'custom' ? (
            <ColorPicker title="自选文字颜色" value={look.textColor} onChanged={(c: Color) => update({ textColor: c })} supportsOpacity={false} />
          ) : null}
        </Panel>
      ) : null}

      {look.mode === 'custom' ? (
        <Panel title="强调色" note="用在图标、柱状图、选中的模式按钮; 用量和延迟的红绿橙固定。">
          <Swatches colors={RECOMMENDED_ACCENT} value={look.accent} onPick={c => update({ accent: c })} />
          <ColorPicker title="自选强调色" value={look.accent} onChanged={(c: Color) => update({ accent: c })} supportsOpacity={false} />
        </Panel>
      ) : null}
    </Page>
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
  const alerts = [prefs.alerts.usage && '用到 80%、90%', prefs.alerts.runout && '快用完', prefs.alerts.expire && '快到期'].filter(Boolean).join('、')

  return (
    <Page title="设置" large bar={{ cancellationAction: props.close }}>
      <Card inner={18}>
        <VStack alignment="leading" spacing={4}>
          <HStack spacing={8}>
            <Circle fill={oldPlugin ? WARN : st.level === 'ok' ? OK : st.level === 'warn' ? WARN : BAD} frame={{ width: 8, height: 8 }} />
            <Text font={13} foregroundStyle="secondaryLabel">{`版本 ${version}${loon?.version ? ` · 插件 ${loon.version}` : ''}`}</Text>
          </HStack>
          <Text font={26} fontWeight="semibold" fontDesign="rounded" foregroundStyle="label" lineLimit={1} minScaleFactor={0.6}>{oldPlugin ? '插件版本太旧' : st.text}</Text>
          {testText || updateText ? <Text font={12} foregroundStyle="secondaryLabel">{testText || updateText}</Text> : null}
        </VStack>
      </Card>

      <HStack>
        <RoundButton icon="checkmark.circle" title="测试连接" action={test} />
        <RoundButton icon="square.and.arrow.down" title="更新插件" action={() => { Safari.openURL(LOON_IMPORT) }} />
        <RoundButton icon="arrow.down.circle" title="检查更新" action={checkUpdate} />
      </HStack>

      <Grid>
        <NavTile icon="stethoscope" title="节点检测" value={o?.timeout ? `超时 ${o.timeout / 1000} 秒 · 通知${onOff(o.notify)}` : '开着 Loon 才能修改'} destination={<CheckPage loon={loon} reload={props.reload} />} />
        <NavTile icon="bell.badge" title="用量提醒" value={alerts || '已关闭'} destination={<AlertsPage />} />
        <NavTile icon="arrow.triangle.2.circlepath" title="自动刷新" value={o?.push ? '已设置' : '体检完刷新小组件'} destination={<AutoRefreshPage />} />
        <NavTile icon="externaldrive" title="数据和缓存" value="用量历史、缓存" destination={<DataPage reload={props.reload} />} />
      </Grid>

      <KitGroup note="策略组的常用、主策略组、解锁、全量体检和锁定, 在节点页点进策略组设置。">
        <PickerRow icon="clock" title="小组件刷新间隔" value={prefs.refresh} options={[[15, '15 分钟'], [30, '30 分钟'], [60, '60 分钟']]} onChanged={v => update({ refresh: v })} />
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
      <Block note={note || (live ? '这些由 Loon 在后台执行。体检频率是 Loon 插件里唯一的参数, 默认 30 分钟一次。' : '要开着 Loon 并更新到最新插件才能修改。')}>
        <Grid>
          <ToggleTile icon="wifi" title="切网复测" sub="网络切换后测一次" value={o?.net ?? true} disabled={!live} onChanged={v => { save({ net: v }) }} />
          <ToggleTile icon="bell" title="异常通知" sub="连续 3 次超时" value={o?.notify ?? true} disabled={!live} onChanged={v => { save({ notify: v }) }} />
          <ToggleTile icon="bolt" title="自动切换" sub="挂了切到最快" value={o?.auto ?? false} disabled={!live} onChanged={v => { save({ auto: v }) }} />
        </Grid>
      </Block>
      <KitGroup>
        <PickerRow icon="timer" title="单次超时" value={o?.timeout ?? 5000} disabled={!live} options={[[3000, '3 秒'], [5000, '5 秒'], [8000, '8 秒']]} onChanged={v => { save({ timeout: v }) }} />
      </KitGroup>
      <KitGroup title="检测地址">
        <ActionRow icon="speedometer" title="测速地址" sub={o?.test_url} disabled={!live} action={() => { askAddress('测速地址', 'test_url', o?.test_url) }} />
        <ActionRow icon="network" title="出口 IP 地址" sub={o?.ip_url} disabled={!live} action={() => { askAddress('出口 IP 地址', 'ip_url', o?.ip_url) }} />
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
      <Block note="小组件刷新时检查, 条件成立时发一次通知。">
        <Grid>
          <ToggleTile icon="chart.pie" title="用量" sub="用到 80% 和 90%" value={prefs.alerts.usage} onChanged={v => set({ ...prefs.alerts, usage: v })} />
          <ToggleTile icon="hourglass" title="快用完" sub="预计 3 天内用完" value={prefs.alerts.runout} onChanged={v => set({ ...prefs.alerts, runout: v })} />
          <ToggleTile icon="calendar" title="快到期" sub="到期前 3 天" value={prefs.alerts.expire} onChanged={v => set({ ...prefs.alerts, expire: v })} />
        </Grid>
      </Block>
    </Page>
  )
}

function DataPage(props: { reload: () => Promise<void> }) {
  const [note, setNote] = useState('')
  return (
    <Page title="数据和缓存">
      <Block note={note || `小组件从 ${DATA_URL} 读 Loon 的数据。用量历史只存数字, 约 60 天, 不存订阅链接。`}>
        <HStack>
          <RoundButton icon="safari" title="打开数据地址" action={() => { Safari.openURL(DATA_URL) }} />
          <RoundButton icon="arrow.clockwise" title="清除缓存" action={() => { clearLoonCache(); setNote('缓存已清除') }} />
          <RoundButton icon="trash" title="清除历史" action={async () => {
            if (!(await Dialog.confirm({ title: '清除全部用量历史?', message: '趋势图和预测会从头记录', cancelLabel: '取消', confirmLabel: '清除' }))) return
            clearHistory()
            setNote('历史已清除')
            await props.reload()
          }} />
          <RoundButton icon="xmark.bin" title="清除检测" action={async () => {
            if (!(await Dialog.confirm({ title: '清除全部检测结果?', message: '深度检测、体检历史、解锁和事件记录都会清掉, 设置和锁定的策略组不变', cancelLabel: '取消', confirmLabel: '清除' }))) return
            try {
              await clearChecks()
              setNote('检测结果已清除')
              await props.reload()
            } catch (e) {
              setNote(`清除失败, 请更新 Loon 插件: ${(e as Error).message}`)
            }
          }} />
        </HStack>
      </Block>
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
        {major < 26 ? <InfoRow icon="exclamationmark.triangle" color={WARN} title="当前系统低于 iOS 26, 暂时不能用" /> : null}
        <InfoRow icon="1.circle" title="连接 Remote Push" sub="Scripting → 工具 → Remote Push 连接这台设备" />
        <ActionRow icon="2.circle" title="授权小组件远程刷新" action={enable} />
        <InfoRow icon="3.circle" title="打开小组件的 Remote Updates" sub="长按桌面的 Loon 面板小组件 → 编辑小组件" />
        <ActionRow icon="4.circle" title="读取小组件 target" value={ids.length ? `${ids.length} 个` : undefined} action={load} />
        <InfoRow icon="5.circle" title="生成发送密钥" sub="Remote Updates → Create Sender Key, 只勾 widgets:reload" />
        <ActionRow icon="6.circle" title="把发送密钥交给 Loon 插件" disabled={!ids.length} action={send} />
      </KitGroup>
    </Page>
  )
}

main()
