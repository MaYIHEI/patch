// checkin / index.tsx
// App 页面 — 在 Scripting 里运行, 不是 widget
//
// 首页: 状态卡 + 四个入口 (样式库 / 外观 / 显示哪些 / 设置) + 需要处理
// 小组件里点某一行 → scripting://run/checkin?detail=<key> → 打开该脚本详情

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
  LiveActivity,
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
  TextField,
  Toggle,
  VStack,
  ZStack,
  Widget,
  Path,
  fetch,
  useEffect,
  useState,
} from 'scripting'
import {
  loadSnapshot,
  sampleSnapshot,
  clearCache,
  probe,
  runCheckin,
  counts,
  isProblem,
  rewardTotal,
  timeLabel,
  type Entry,
  type Snapshot,
} from './api'
import {
  getData, setData, getDisplay, setDisplay, getLook, setLook, getDefaults, setDefault,
  DEFAULT_LOOK, DEFAULT_HOST, RECOMMENDED_BG, RECOMMENDED_ACCENT, SUMMARY_URL,
  type DataPrefs, type Look, type Family, type Source,
} from './settings'
import { recordSnapshot, loadHistory, getKeepDays, setKeepDays, clearHistory, recordedDays, lastDays, byDate, type Day } from './history'
import { ensureIcons, clearIcons } from './icons'
import { makeTheme, Ring, AppIcon, hhmm, chunk, OK, BAD, WARN, type Ctx } from './ui'
import { STYLES, FEATURED, stylesFor, styleById, paramOf, renderStyle, type StyleDef } from './styles/index'
import { goalsOf } from './styles/history'
import { liveStateOf, LiveBanner } from './styles/live'
import { startOrRefresh } from './live_activity'

declare const Safari: { openURL(url: string): Promise<boolean> }

const REMOTE_META = 'https://raw.githubusercontent.com/MaYIHEI/patch/main/scripting/checkin/script.json'
const INSTALL_URL = 'https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Fcheckin.zip%22%5D'
const PLUGIN_URL = 'https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/testing/loon/paperclip-checkin/paperclip-checkin.lpx'
const LOON_IMPORT = `loon://import?plugin=${encodeURIComponent(PLUGIN_URL)}`
const BG_PATH = () => Path.join(FileManager.appGroupDocumentsDirectory, 'checkin', 'background.jpg')

async function main() {
  await Navigation.present({ element: <Home /> })
  Script.exit()
}

// ─────────────────────────────────────────────────────────────
// 共用
// ─────────────────────────────────────────────────────────────
const CARD = 'secondarySystemGroupedBackground'

type Shared = { snap: Snapshot | null; hist: Day[]; reload: () => Promise<void> }

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
function Preview(props: { style: StyleDef; family: Family; snap: Snapshot; hist: Day[]; look?: Look; scale?: number }) {
  const box = BOX[props.family]
  const k = props.scale ?? 1
  const d = getDisplay()
  const view = renderStyle(props.style, props.snap, props.family, {
    inApp: true, spot: 0, hist: props.hist, page: 0, look: props.look ?? getLook(), keys: d.keys, problemsFirst: d.problemsFirst, goals: d.goals,
  })
  return (
    <ZStack frame={{ width: box.width * k, height: box.height * k }} clipped>
      <VStack frame={box} scaleEffect={k}>{view}</VStack>
    </ZStack>
  )
}

function appCtx(snap: Snapshot): Ctx {
  return { th: makeTheme(DEFAULT_LOOK), size: 'm', entries: snap.entries, snap, inApp: true, spot: 0, hist: [], keys: new Set(snap.entries.map(e => e.key)), goals: {}, page: 0 }
}

function SectionTitle(props: { title: string }) {
  return <Text font={13} fontWeight="medium" foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>{props.title}</Text>
}

/** 打开 App: 有 open 就跳过去, 没有就说明怎么重抓 */
async function openApp(e: Entry) {
  if (e.open && (await Safari.openURL(e.open))) return
  await Dialog.alert({ title: `${e.name} 需要重抓`, message: `保持 Loon 开启, 打开「${e.name}」App, Cookie 抓取插件会重新抓取凭证。` })
}

/** 补签: 有 run 就现跑, 返回提示文字 */
async function retry(e: Entry): Promise<string> {
  if (!e.run) {
    await Dialog.alert({ title: e.name, message: '该脚本不支持补签' })
    return ''
  }
  try {
    const n = await runCheckin(e)
    return `${e.name}: ${n.s === 'ok' ? '补签成功' : n.msg || '仍然失败'}`
  } catch (err) {
    return `${e.name}: ${(err as Error).message}`
  }
}

function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number), b = local.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

function sourceText(snap: Snapshot | null, error: string): { text: string; color: string } {
  if (!snap) return error ? { text: '读不到数据', color: BAD } : { text: '读取中...', color: 'secondaryLabel' }
  if (snap.stale) return { text: `连不上 · 显示 ${hhmm(snap.fetchedAt)} 的结果`, color: WARN }
  return { text: `${snap.source === 'summary' ? '汇总地址' : 'BoxJS'}已连接`, color: OK }
}

// ─────────────────────────────────────────────────────────────
// 首页
// ─────────────────────────────────────────────────────────────
function Home() {
  const dismiss = Navigation.useDismiss()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [hist, setHist] = useState<Day[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [tick, setTick] = useState(0)   // 子页面改了设置后刷新入口卡的副标题

  useEffect(() => { reload(true) }, [])

  async function reload(first = false) {
    setError('')
    try {
      const s = await loadSnapshot()
      recordSnapshot(s)
      await ensureIcons([...s.entries, ...s.idle].map(e => e.key))
      const h = loadHistory(s)
      setSnap(s)
      setHist(h)
      Widget.reloadAll()
      // 从小组件点进来: 打开这个脚本的详情
      const key = first ? (Script.queryParameters?.detail ?? Script.queryParameters?.key) : undefined
      const hit = key ? [...s.entries, ...s.idle].find(e => e.key === key) : undefined
      if (hit) await Navigation.present({ element: <NavigationStack><ScriptDetail entry={hit} hist={h} reload={() => reload()} /></NavigationStack> })
    } catch (e) {
      setError((e as Error).message)
    }
    setTick(tick + 1)
  }

  const shared: Shared = { snap, hist, reload: () => reload() }
  const problems = snap ? snap.entries.filter(isProblem) : []
  const fails = problems.filter(e => e.s === 'fail')

  async function retryAll() {
    const can = fails.filter(e => e.run)
    if (!can.length) return Dialog.alert({ message: '失败项都不支持补签' })
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < can.length; i++) {
      setBusy(can[i].key)
      setNote(`补签中 ${i + 1}/${can.length}: ${can[i].name}`)
      try {
        if ((await runCheckin(can[i])).s === 'ok') ok++
        else failed.push(can[i].name)
      } catch (err) {
        failed.push(`${can[i].name} (${(err as Error).message})`)
      }
    }
    setBusy('')
    setNote([`补签完成: 成功 ${ok}/${can.length}`, failed.length ? `仍失败: ${failed.join('、')}` : '', fails.length - can.length ? `${fails.length - can.length} 个不支持补签` : ''].filter(Boolean).join(' · '))
    await reload()
  }

  async function act(e: Entry) {
    if (e.s === 'cookie') return openApp(e)
    setBusy(e.key)
    const t = await retry(e)
    setBusy('')
    if (t) { setNote(t); await reload() }
  }

  const d = getDisplay()
  const look = getLook()
  const data = getData()

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle="签到总览"
        background="systemGroupedBackground"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
          topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={() => reload()} />,
        }}
      >
        <VStack alignment="leading" spacing={20} padding={16}>
          {!snap && error ? <Guide error={error} reload={() => reload()} /> : null}

          <StatusCard snap={snap} error={error} />

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
              <NavigationLink destination={<DisplayPage {...shared} onChanged={() => setTick(tick + 1)} />}>
                <EntryCard icon="checklist" color="systemGreen" title="显示哪些" sub={d.keys.length ? `已选 ${d.keys.length} 个` : '全部脚本'} />
              </NavigationLink>
              <NavigationLink destination={<SettingsPage {...shared} onChanged={() => reload()} />}>
                <EntryCard icon="gearshape.fill" color="systemGray" title="设置" sub={data.source === 'auto' ? '数据来源 自动' : data.source === 'summary' ? '数据来源 汇总地址' : '数据来源 BoxJS'} />
              </NavigationLink>
            </HStack>
          </VStack>

          {/* 需要处理 */}
          {problems.length ? (
            <VStack alignment="leading" spacing={8}>
              <SectionTitle title={`需要处理 · ${problems.length}`} />
              <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD} />}>
                {problems.slice(0, 3).map(e => <ProblemRow entry={e} busy={busy} act={act} hist={hist} reload={() => reload()} />)}
                {problems.length > 3 ? (
                  <NavigationLink destination={<ProblemsPage {...shared} />}>
                    <LinkLine title={`查看全部 ${problems.length} 条`} />
                  </NavigationLink>
                ) : null}
                {fails.length ? (
                  <Button action={retryAll} buttonStyle="plain" disabled={!!busy}>
                    <LinkLine title="全部失败项一键补签" color={busy ? 'tertiaryLabel' : 'systemBlue'} chevron={false} />
                  </Button>
                ) : null}
              </VStack>
              {note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>{note}</Text> : null}
            </VStack>
          ) : null}

          {/* 长期未运行: 不算需要处理, 收起来 */}
          {snap && snap.idle.length ? (
            <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD} />}>
              <NavigationLink destination={<IdlePage {...shared} />}>
                <LinkLine title={`长期未运行 · ${snap.idle.length} 个`} detail="超过 7 天没有新结果" />
              </NavigationLink>
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}

function StatusCard(props: { snap: Snapshot | null; error: string }) {
  const { snap } = props
  const c = snap ? counts(snap.entries) : null
  const src = sourceText(snap, props.error)
  return (
    <HStack spacing={16} padding={18} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={22} fill={CARD} />}>
      {snap ? (
        <Ring ctx={appCtx(snap)} size={78} line={10}>
          <VStack spacing={0}>
            <Text font={22} fontWeight="bold" fontDesign="rounded" monospacedDigit>{String(c!.ok)}</Text>
            <Text font={11} monospacedDigit foregroundStyle="secondaryLabel">{`/ ${snap.entries.length}`}</Text>
          </VStack>
        </Ring>
      ) : (
        <ZStack frame={{ width: 88, height: 88 }}>
          <Circle stroke={{ shapeStyle: 'tertiarySystemFill', strokeStyle: { lineWidth: 10 } }} frame={{ width: 78, height: 78 }} />
          <Image systemName="questionmark" font={22} foregroundStyle="tertiaryLabel" />
        </ZStack>
      )}
      <VStack alignment="leading" spacing={5}>
        <Text font={20} fontWeight="bold">{c ? (c.cookie + c.fail ? `${c.cookie + c.fail} 个需要处理` : '今天全部正常') : '今日签到'}</Text>
        {snap ? <Text font={14} foregroundStyle="secondaryLabel">{`今日奖励 +${rewardTotal(snap.entries)}`}</Text> : null}
        {snap ? <Text font={13} foregroundStyle="secondaryLabel">{`数据时间 ${hhmm(snap.fetchedAt)}`}</Text> : null}
        <HStack spacing={6}>
          <Circle fill={src.color} frame={{ width: 7, height: 7 }} />
          <Text font={12} foregroundStyle={src.color} lineLimit={2}>{src.text}</Text>
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

function LinkLine(props: { title: string; detail?: string; color?: string; chevron?: boolean }) {
  return (
    <HStack padding={{ horizontal: 14, vertical: 13 }}>
      <Text font={15} foregroundStyle={props.color ?? 'label'}>{props.title}</Text>
      {props.detail ? <Text font={12} foregroundStyle="secondaryLabel">{` · ${props.detail}`}</Text> : null}
      <Spacer />
      {props.chevron === false ? null : <Image systemName="chevron.right" font={13} foregroundStyle="tertiaryLabel" />}
    </HStack>
  )
}

function ActionText(props: { entry: Entry; busy: string }) {
  const e = props.entry
  const cookie = e.s === 'cookie'
  return (
    <Text font={13} fontWeight="medium" foregroundStyle={cookie ? 'white' : e.run ? 'label' : 'tertiaryLabel'}
      padding={{ horizontal: 12, vertical: 6 }}
      background={<RoundedRectangle cornerRadius={14} fill={cookie ? BAD : 'tertiarySystemFill'} />}>
      {cookie ? '打开 App' : props.busy === e.key ? '补签中...' : e.run ? '补签' : '不支持补签'}
    </Text>
  )
}

function ProblemRow(props: { entry: Entry; busy: string; act: (e: Entry) => void; hist: Day[]; reload: () => Promise<void> }) {
  const e = props.entry
  return (
    <HStack spacing={12} padding={{ horizontal: 14, vertical: 10 }}>
      <NavigationLink destination={<ScriptDetail entry={e} hist={props.hist} reload={props.reload} />}>
        <HStack spacing={12}>
          <AppIcon entry={e} size={32} />
          <VStack alignment="leading" spacing={1}>
            <Text font={15} foregroundStyle="label">{e.name}</Text>
            <Text font={12} foregroundStyle={e.s === 'cookie' ? BAD : WARN} lineLimit={1}>{e.msg || (e.s === 'cookie' ? '凭证失效' : '失败')}</Text>
          </VStack>
        </HStack>
      </NavigationLink>
      <Spacer />
      <Button action={() => { props.act(e) }} buttonStyle="plain" disabled={!!props.busy}>
        <ActionText entry={e} busy={props.busy} />
      </Button>
    </HStack>
  )
}

/** 读不到数据时的三步引导 */
function Guide(props: { error: string; reload: () => void }) {
  const step = (n: number, title: string, sub: string, button: string, action: () => void) => (
    <HStack spacing={12} padding={{ horizontal: 14, vertical: 12 }}>
      <Text font={15} fontWeight="bold" foregroundStyle="white" frame={{ width: 28, height: 28 }} background={<Circle fill="systemBlue" />}>{String(n)}</Text>
      <VStack alignment="leading" spacing={2}>
        <Text font={15} fontWeight="medium">{title}</Text>
        <Text font={12} foregroundStyle="secondaryLabel">{sub}</Text>
      </VStack>
      <Spacer />
      <Button title={button} buttonStyle="bordered" controlSize="small" action={action} />
    </HStack>
  )
  return (
    <VStack alignment="leading" spacing={8}>
      <SectionTitle title="开始使用" />
      <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD} />}>
        {step(1, '导入签到合集插件', 'Loon 里一键添加 paperclip 签到合集', '导入', () => { Safari.openURL(LOON_IMPORT) })}
        {step(2, '去 Loon 跑一次', '脚本 → 任选一个签到手动运行, 或等定时任务', '打开 Loon', () => { Safari.openURL('loon://') })}
        {step(3, '回来刷新', '保持 Loon 开启, 这里就能读到结果', '刷新', props.reload)}
      </VStack>
      <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>{props.error}</Text>
    </VStack>
  )
}

function ProblemsPage(props: Shared) {
  const list = props.snap ? props.snap.entries.filter(isProblem) : []
  return (
    <List navigationTitle="需要处理" navigationBarTitleDisplayMode="inline">
      {list.map(e => <ScriptLink entry={e} hist={props.hist} reload={props.reload} />)}
    </List>
  )
}

function IdlePage(props: Shared) {
  return (
    <List navigationTitle="长期未运行" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>超过 7 天没有新结果, 不算需要处理, 小组件里也不显示。可能是插件里关掉了这个脚本, 或者很久没抓 Cookie。</Text>}>
        {(props.snap?.idle ?? []).map(e => <ScriptLink entry={e} hist={props.hist} reload={props.reload} />)}
      </Section>
    </List>
  )
}

function ScriptLink(props: { entry: Entry; hist: Day[]; reload: () => Promise<void> }) {
  const e = props.entry
  return (
    <NavigationLink destination={<ScriptDetail entry={e} hist={props.hist} reload={props.reload} />}>
      <HStack spacing={12}>
        <AppIcon entry={e} size={30} />
        <VStack alignment="leading" spacing={1}>
          <Text>{e.name}</Text>
          <Text font={12} foregroundStyle={e.s === 'ok' ? 'secondaryLabel' : e.s === 'cookie' ? BAD : WARN} lineLimit={1}>{`${timeLabel(e.t)} · ${e.msg}`}</Text>
        </VStack>
      </HStack>
    </NavigationLink>
  )
}

// ─────────────────────────────────────────────────────────────
// 脚本详情: 最近 7 天、失败原因、补签 / 打开 App
// ─────────────────────────────────────────────────────────────
function ScriptDetail(props: { entry: Entry; hist: Day[]; reload: () => Promise<void> }) {
  const [e, setE] = useState(props.entry)
  const [note, setNote] = useState('')
  const map = byDate(props.hist)
  const days = lastDays(7).reverse()
  const word = (s?: string) => (s === 'ok' ? '成功' : s === 'cookie' ? '需重抓' : s === 'fail' ? '失败' : '没有记录')
  const color = (s?: string) => (s === 'ok' ? OK : s === 'cookie' ? BAD : s === 'fail' ? WARN : 'tertiaryLabel')
  const d = new Date(e.t)

  async function doRetry() {
    setNote('补签中...')
    const t = await retry(e)
    setNote(t)
    if (!t) return
    await props.reload()
    const s = await loadSnapshot()
    const n = [...s.entries, ...s.idle].find(x => x.key === e.key)
    if (n) setE(n)
  }

  return (
    <Form navigationTitle={e.name} navigationBarTitleDisplayMode="inline">
      <Section>
        <HStack spacing={14} padding={{ vertical: 4 }}>
          <AppIcon entry={e} size={52} />
          <VStack alignment="leading" spacing={3}>
            <Text font={19} fontWeight="semibold">{e.name}</Text>
            <Text font={13} foregroundStyle="secondaryLabel">{`${e.author || '未知作者'} · ${e.category}`}</Text>
          </VStack>
        </HStack>
        <LabeledContent label={<Text>状态</Text>}><Text foregroundStyle={color(e.s)}>{word(e.s)}</Text></LabeledContent>
        <LabeledContent label={<Text>{e.s === 'ok' ? '今日奖励' : '原因'}</Text>} value={e.msg || '-'} />
        <LabeledContent label={<Text>时间</Text>} value={`${d.getMonth() + 1}月${d.getDate()}日 ${hhmm(e.t)}`} />
        {e.asset ? <LabeledContent label={<Text>资产</Text>} value={e.asset} /> : null}
        {e.exp ? <LabeledContent label={<Text>凭证过期</Text>} value={`${Math.max(0, Math.floor((e.exp - Date.now()) / 86_400_000))} 天后`} /> : null}
      </Section>

      <Section footer={note ? <Text>{note}</Text> : undefined}>
        {e.s === 'fail' ? <Button title={e.run ? '补签' : '补签 (该脚本不支持)'} action={doRetry} disabled={!e.run} /> : null}
        <Button title="打开 App" action={() => { openApp(e) }} />
      </Section>

      <Section header={<Text>最近 7 天</Text>} footer={props.hist.length ? undefined : <Text>还没有历史记录, 以后每次读到数据都会记一笔。</Text>}>
        {days.map(day => {
          const it = map.get(day)?.items[e.key]
          return (
            <HStack>
              <Text monospacedDigit>{day.slice(5).replace('-', '/')}</Text>
              <Text font={13} foregroundStyle={color(it?.s)} padding={{ leading: 8 }}>{word(it?.s)}</Text>
              <Spacer />
              <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{it?.msg ?? ''}</Text>
            </HStack>
          )
        })}
      </Section>
    </Form>
  )
}

// ─────────────────────────────────────────────────────────────
// 样式库: 按尺寸分, 只列放得下的; 精选 + 更多
// ─────────────────────────────────────────────────────────────
type Tab = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'lock'

function StyleLibrary(props: Shared & { onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('systemMedium')
  const [sample, setSample] = useState(true)
  const [tick, setTick] = useState(0)   // 「用这个样式」后刷新「默认」标记
  const snap = sample || !props.snap ? sampleSnapshot() : props.snap
  const hist = sample || !props.snap ? loadHistory(snap) : props.hist
  const defaults = getDefaults()
  const changed = () => { setTick(tick + 1); props.onChanged() }

  const card = (s: StyleDef, f: Family, scale: number) => (
    <NavigationLink destination={<StyleDetail style={s} family={f} snap={snap} hist={hist} onChanged={changed} />}>
      <VStack spacing={6}>
        <Preview style={s} family={f} snap={snap} hist={hist} scale={scale} />
        <HStack spacing={4}>
          <Text font={13} fontWeight="medium" foregroundStyle="label">{s.name}</Text>
          {defaults[f] === s.id ? <Text font={10} foregroundStyle="systemBlue">默认</Text> : null}
        </HStack>
      </VStack>
    </NavigationLink>
  )

  // 小号两列原尺寸, 中号一列原尺寸, 大号两列缩小, 锁屏两列原尺寸
  const grid = (list: StyleDef[], f: Family) => {
    const cols = f === 'systemMedium' ? 1 : 2
    const scale = f === 'systemLarge' ? 0.49 : 1
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

  const block = (f: Family, title?: string) => {
    const all = stylesFor(f)
    const featured = FEATURED[f].map(id => all.find(s => s.id === id)).filter((s): s is StyleDef => !!s)
    const more = all.filter(s => !FEATURED[f].includes(s.id))
    return (
      <VStack alignment="leading" spacing={12}>
        {title ? <Text font={17} fontWeight="semibold" padding={{ horizontal: 4 }}>{title}</Text> : null}
        <SectionTitle title="精选" />
        {grid(featured, f)}
        {more.length ? <SectionTitle title="更多样式" /> : null}
        {more.length ? grid(more, f) : null}
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
            {block('accessoryCircular', '圆形')}
            {block('accessoryRectangular', '长条')}
            <Text font={12} foregroundStyle="secondaryLabel">实时活动和控制中心按钮在「设置」里。</Text>
          </VStack>
        ) : block(tab)}
      </VStack>
    </ScrollView>
  )
}

function StyleDetail(props: { style: StyleDef; family: Family; snap: Snapshot; hist: Day[]; onChanged: () => void }) {
  const { style, family } = props
  const [note, setNote] = useState('')
  const [goals, setGoals] = useState(getDisplay().goals)
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

  async function editGoal(key: string, label: string, current: number) {
    const v = await Dialog.prompt({ title: `${label} 目标值`, message: `当前 ${current}; 清空恢复自动目标`, defaultValue: goals[key] ? String(goals[key]) : '', placeholder: '比如 1000', keyboardType: 'decimalPad' })
    if (v === null) return
    const n = Number(v.trim())
    const next = { ...goals }
    if (v.trim() && Number.isFinite(n) && n > 0) next[key] = n
    else delete next[key]
    setGoals(next)
    setDisplay({ ...getDisplay(), goals: next })
    Widget.reloadAll()
  }

  return (
    <List navigationTitle={style.name} navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{`${style.desc}。支持: ${sizes}`}</Text>}>
        <HStack padding={{ vertical: 8 }}>
          <Spacer />
          <Preview style={style} family={family} snap={props.snap} hist={props.hist} scale={family === 'systemLarge' ? 0.92 : 1} />
          <Spacer />
        </HStack>
      </Section>
      <Section
        footer={<Text>{lock
          ? `锁屏: 长按锁屏 → 自定 → 添加小组件 → Scripting → checkin, 点小组件在参数里填「${param}」。不填参数用默认样式。`
          : `桌面: 长按小组件 → 编辑小组件 → 参数里粘贴「${param}」。不填参数就用这个尺寸的默认样式。`}</Text>}
      >
        <Button action={use} buttonStyle="borderedProminent" controlSize="large" frame={{ maxWidth: 'infinity' }}>
          <Text font={16} fontWeight="semibold" frame={{ maxWidth: 'infinity' }}>用这个样式</Text>
        </Button>
        {note ? <Text font={13} foregroundStyle="systemGreen">{note}</Text> : null}
      </Section>
      {style.id === 'N' ? (
        <Section header={<Text>兑换目标</Text>} footer={<Text>点一行设目标值; 没设的按下一个整数自动定目标 (735 → 800)。</Text>}>
          {goalsOf({ ...appCtx(props.snap), hist: props.hist, goals }).map(g => (
            <Button action={() => editGoal(g.e.key, g.e.name, g.v)} buttonStyle="plain">
              <HStack>
                <Text foregroundStyle="label">{g.e.name}</Text>
                <Spacer />
                <Text foregroundStyle={g.auto ? 'tertiaryLabel' : 'systemBlue'} monospacedDigit>{`${g.num} / ${g.goal}${g.auto ? ' (自动)' : ''}`}</Text>
              </HStack>
            </Button>
          ))}
        </Section>
      ) : null}
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
  const snap = props.snap ?? sampleSnapshot()
  const hist = props.snap ? props.hist : loadHistory(snap)
  const style = styleById(getDefaults()[fam])!

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
    const data = small.toJPEGData(0.85)
    if (!data) return setNote('图片转换失败')
    await FileManager.createDirectory(Path.join(FileManager.appGroupDocumentsDirectory, 'checkin'), true)
    await FileManager.writeAsData(BG_PATH(), data)
    update({ bgType: 'image', image: BG_PATH() })
    setNote('')
  }

  return (
    <List navigationTitle="外观" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{`预览的是${FAMILY_NAME[fam]}默认样式「${style.name}」${props.snap ? '' : ' (示例数据)'}`}</Text>}>
        <VStack spacing={12} frame={{ maxWidth: 'infinity' }} padding={{ vertical: 8 }}>
          <Preview style={style} family={fam} snap={snap} hist={hist} look={look} scale={fam === 'systemLarge' ? 0.8 : 1} />
          <Picker title="尺寸" value={fam} onChanged={(v: any) => setFam(v as Family)} pickerStyle="segmented">
            <Text tag="systemSmall">小</Text>
            <Text tag="systemMedium">中</Text>
            <Text tag="systemLarge">大</Text>
          </Picker>
        </VStack>
      </Section>

      <Section footer={<Text>{look.mode === 'plain' ? '扁平卡片, 跟随系统深浅色。' : '文字颜色按背景亮度自动切换黑白; 用图片时按深色处理, 可调暗化保证文字清楚。'}</Text>}>
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
        <Section header={<Text>强调色</Text>} footer={<Text>用在进度条、终端日志等处; 成功 / 失败 / 需重抓的颜色固定。</Text>}>
          <Swatches colors={RECOMMENDED_ACCENT} value={look.accent} onPick={c => update({ accent: c })} />
          <ColorPicker title="自选强调色" value={look.accent} onChanged={(c: any) => update({ accent: String(c) })} supportsOpacity={false} />
        </Section>
      ) : null}
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 显示哪些: 勾选 + 拖动排序 + 有问题优先
// ─────────────────────────────────────────────────────────────
function DisplayPage(props: Shared & { onChanged: () => void }) {
  const snap = props.snap ?? sampleSnapshot()
  const all = [...snap.entries, ...snap.idle]
  const allKeys = all.map(e => e.key)
  const init = getDisplay()
  const [order, setOrder] = useState<string[]>(init.keys.length ? [...init.keys, ...allKeys.filter(k => !init.keys.includes(k))] : allKeys)
  const [selected, setSelected] = useState<string[]>(init.keys.length ? init.keys : allKeys)
  const [problemsFirst, setProblemsFirst] = useState(init.problemsFirst)
  const byKey = new Map(all.map(e => [e.key, e]))

  function save(o: string[], sel: string[], pf: boolean) {
    // 全部勾选且没排序 = 空 keys, 以后新增的脚本也自动显示
    const isAll = sel.length === o.length && o.join() === allKeys.join()
    setDisplay({ ...getDisplay(), keys: isAll ? [] : o.filter(k => sel.includes(k)), problemsFirst: pf })
    Widget.reloadAll()
    props.onChanged()
  }

  function toggle(key: string) {
    const sel = selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]
    if (!sel.length) return
    setSelected(sel)
    save(order, sel, problemsFirst)
  }

  function onMove(indices: number[], newOffset: number) {
    const moving = indices.map(i => order[i])
    const rest = order.filter((_, i) => !indices.includes(i))
    rest.splice(newOffset, 0, ...moving)
    setOrder(rest)
    save(rest, selected, problemsFirst)
  }

  return (
    <List navigationTitle="显示哪些" navigationBarTitleDisplayMode="inline" toolbar={{ topBarTrailing: <EditButton /> }}>
      <Section footer={<Text>打开后需重抓、失败的排在最前面。</Text>}>
        <Toggle title="有问题时优先显示" value={problemsFirst} onChanged={(v: boolean) => { setProblemsFirst(v); save(order, selected, v) }} />
      </Section>
      <Section
        header={<Text>{`脚本 · 已选 ${selected.length} / ${order.length}`}</Text>}
        footer={<Text>点一行勾选或取消; 点右上角「编辑」后拖动排序。所有小组件共用这份设置。</Text>}
      >
        <ForEach
          count={order.length}
          itemBuilder={(i: number) => {
            const key = order[i]
            const e = byKey.get(key)
            const on = selected.includes(key)
            return (
              <Button key={key} action={() => toggle(key)} buttonStyle="plain">
                <HStack spacing={12}>
                  {e ? <AppIcon entry={e} size={28} /> : <Image systemName="questionmark.square.dashed" font={22} foregroundStyle="secondaryLabel" />}
                  <VStack alignment="leading" spacing={0}>
                    <Text font={15} foregroundStyle={on ? 'label' : 'secondaryLabel'}>{e?.name ?? key}</Text>
                    <Text font={11} foregroundStyle="tertiaryLabel">{e ? (e.asset ? `${e.author} · ${e.asset}` : e.author) : key}</Text>
                  </VStack>
                  <Spacer />
                  {on ? <Image systemName="checkmark" font={15} fontWeight="semibold" foregroundStyle="systemBlue" /> : null}
                </HStack>
              </Button>
            )
          }}
          onMove={onMove}
        />
      </Section>
    </List>
  )
}

// ─────────────────────────────────────────────────────────────
// 设置
// ─────────────────────────────────────────────────────────────
function SettingsPage(props: Shared & { onChanged: () => void }) {
  const [data, setDataState] = useState<DataPrefs>(getData())
  const [testText, setTestText] = useState('')
  const [keep, setKeep] = useState(getKeepDays())
  const [liveText, setLiveText] = useState('')
  const [misc, setMisc] = useState('')
  const [updateText, setUpdateText] = useState('')
  const version = Script.metadata.version ?? '-'

  function update(patch: Partial<DataPrefs>) {
    const next = { ...data, ...patch }
    setDataState(next)
    setData(next)
  }

  async function test() {
    setTestText('连接中...')
    const r = await probe(data.source, data.host)
    setTestText(r.ok ? `已连上 ${r.via}, 读到 ${r.count} 个结果` : r.error ?? '连不上')
    if (r.ok) props.onChanged()
  }

  async function startLive() {
    const s = props.snap
    if (!s) return setLiveText('还没有数据')
    const d = getDisplay()
    const entries = d.keys.length ? s.entries.filter(e => d.keys.includes(e.key)) : s.entries
    setLiveText((await startOrRefresh(liveStateOf(entries))) ? '已开启, 锁屏和灵动岛可见' : '没开起来: 检查 设置 → Scripting → 实时活动 是否允许')
  }

  async function checkUpdate() {
    setUpdateText('检查中...')
    try {
      const res = await fetch(REMOTE_META)
      const remote = String((await res.json() as { version?: string }).version ?? '')
      if (!remote || !isNewer(remote, version)) return setUpdateText('已是最新')
      setUpdateText(`有新版本 ${remote}`)
      const ok = await Dialog.confirm({ title: `发现新版本 ${remote}`, message: `当前 ${version}, 更新会重新导入脚本, 设置保留`, cancelLabel: '稍后', confirmLabel: '更新' })
      if (ok) await Safari.openURL(INSTALL_URL)
    } catch {
      setUpdateText('检查失败')
    }
  }

  const st = props.snap ? liveStateOf(props.snap.entries) : null

  return (
    <Form navigationTitle="设置" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>数据来源</Text>}
        footer={<Text>{data.source === 'auto'
          ? `先请求汇总地址 ${SUMMARY_URL}, 失败再读 BoxJS (${data.host})。`
          : data.source === 'summary' ? '一次读完全部结果, 需要 Loon 开着签到合集插件。' : '逐个读取 BoxJS 里的结果。'}</Text>}
      >
        <Picker title="来源" value={data.source} onChanged={(v: any) => update({ source: v as Source })}>
          <Text tag="auto">自动</Text>
          <Text tag="summary">汇总地址</Text>
          <Text tag="boxjs">BoxJS</Text>
        </Picker>
        {data.source === 'boxjs' ? (
          <LabeledContent label={<Text>BoxJS 地址</Text>}>
            <TextField title={DEFAULT_HOST} value={data.host} onChanged={(v: string) => update({ host: v })} multilineTextAlignment="trailing" />
          </LabeledContent>
        ) : null}
        <Button title={testText ? `测试连接 · ${testText}` : '测试连接'} action={test} />
        <Picker title="小组件刷新间隔" value={data.refresh} onChanged={(v: any) => { update({ refresh: Number(v) as 15 | 30 | 60 }); Widget.reloadAll() }}>
          <Text tag={15}>15 分钟</Text>
          <Text tag={30}>30 分钟</Text>
          <Text tag={60}>60 分钟</Text>
        </Picker>
      </Section>

      <Section header={<Text>实时活动</Text>} footer={<Text>{liveText || '锁屏和灵动岛显示今日进度; 需要手动开启, 系统不允许没人操作时自动弹出。'}</Text>}>
        {st ? (
          <VStack padding={{ vertical: 6 }} background={<RoundedRectangle cornerRadius={18} fill="rgba(28,28,30,0.92)" />}>
            <LiveBanner st={st} />
          </VStack>
        ) : null}
        <Button title="开始早间签到实时活动" action={startLive} />
        <Button title="结束实时活动" action={async () => { await LiveActivity.endAllActivities({ dismissTimeInterval: 0 }); setLiveText('已结束') }} />
      </Section>

      <Section header={<Text>控制中心按钮</Text>}>
        <Text font={13} foregroundStyle="secondaryLabel">{'控制中心 → 左上角 + → 添加控制 → Scripting → checkin。点一下会读数据、刷新小组件, 并开启或刷新实时活动。'}</Text>
      </Section>

      <Section header={<Text>历史记录</Text>} footer={<Text>{`每次读到数据按北京时间记一份当天结果, 同一天覆盖。已记录 ${recordedDays()} 天。`}</Text>}>
        <Picker title="保留天数" value={keep} onChanged={(v: any) => { setKeep(Number(v)); setKeepDays(Number(v)) }}>
          <Text tag={30}>30 天</Text>
          <Text tag={90}>90 天</Text>
          <Text tag={180}>180 天</Text>
          <Text tag={365}>365 天</Text>
        </Picker>
        <Button title="清除历史" role="destructive" action={async () => {
          if (!(await Dialog.confirm({ title: '清除全部历史?', message: '日历、收益、热力图等会从头记录', cancelLabel: '取消', confirmLabel: '清除' }))) return
          clearHistory()
          setMisc('历史已清除')
        }} />
      </Section>

      <Section header={<Text>新手引导</Text>}>
        <Button title="1. 导入签到合集插件 (Loon)" action={() => { Safari.openURL(LOON_IMPORT) }} />
        <Button title="2. 打开 Loon 跑一次签到" action={() => { Safari.openURL('loon://') }} />
        <Button title="3. 回到这里测试连接" action={test} />
      </Section>

      <Section footer={misc ? <Text>{misc}</Text> : undefined}>
        <Button title="清除缓存和图标" action={async () => { clearCache(); await clearIcons(); setMisc('缓存已清除, 下次刷新重新下载图标'); props.onChanged() }} />
      </Section>

      <Section header={<Text>关于</Text>}>
        <LabeledContent label={<Text>版本</Text>} value={version} />
        <Button title={updateText ? `检查更新 · ${updateText}` : '检查更新'} action={checkUpdate} />
        <NavigationLink destination={<ProtocolPage />}><Text>签到协议 · 给脚本作者</Text></NavigationLink>
      </Section>
    </Form>
  )
}

// ─────────────────────────────────────────────────────────────
// 签到协议
// ─────────────────────────────────────────────────────────────
const SAMPLE_REGISTRY = '{"dreame_status":{"name":"追觅","author":"MaYIHEI","run":"http://1.1.1.1/checkin/dreame"}}'
const SAMPLE_RESULT = '{"v":1,"s":"ok","t":1793105254635,"msg":"+5 积分 · 连签 3 天","asset":"积分 735"}'

function ProtocolPage() {
  const [note, setNote] = useState('')
  return (
    <Form navigationTitle="签到协议 v1" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{'脚本跑完后把结果写进代理工具的持久化存储 ($persistentStore / $prefs), 本小组件通过汇总地址或 BoxJS 读取。'}</Text>}>
        <Text>{'1. 在 checkin_registry 里登记自己: { "状态key": { name, author, url?, run?, open? } }'}</Text>
        <Text>{'2. 每次签到后把结果写进状态 key: { v:1, s, t, msg, asset?, exp? }'}</Text>
      </Section>
      <Section header={<Text>字段</Text>}>
        <LabeledContent label={<Text>s</Text>} value="ok 成功 / cookie 需重抓 / fail 失败 / none 不显示" />
        <LabeledContent label={<Text>t</Text>} value="毫秒时间戳; 超过 7 天算长期未运行" />
        <LabeledContent label={<Text>msg</Text>} value="今日奖励, 如 +5 积分" />
        <LabeledContent label={<Text>asset</Text>} value="资产 (可选), 如 积分 735" />
        <LabeledContent label={<Text>exp</Text>} value="凭证过期毫秒时间戳 (可选)" />
        <LabeledContent label={<Text>run</Text>} value="登记项里的补签地址 (可选)" />
        <LabeledContent label={<Text>open</Text>} value="登记项里的打开 App 链接 (可选)" />
      </Section>
      <Section header={<Text>示例</Text>} footer={note ? <Text>{note}</Text> : undefined}>
        <Text font={12} fontDesign="monospaced">{`checkin_registry\n${SAMPLE_REGISTRY}`}</Text>
        <Text font={12} fontDesign="monospaced">{`dreame_status\n${SAMPLE_RESULT}`}</Text>
        <Button title="复制示例" action={async () => { await Pasteboard.setString(`${SAMPLE_REGISTRY}\n${SAMPLE_RESULT}`); setNote('已复制') }} />
      </Section>
    </Form>
  )
}

main()
