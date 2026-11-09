// cmcc / index.tsx
// App 页面 — 在 Scripting 里运行, 不是 widget. 写法同 loon-panel
//
// 底栏三页: 小组件 (预览、样式库、外观) / 账号 (导入、每个号的数据) / 设置 (刷新间隔、BoxJS、更新)

import {
  Button,
  ForEach,
  List,
  Section,
  Tab,
  TabView,
  useObservable,
  ColorPicker,
  HStack,
  Navigation,
  NavigationLink,
  NavigationStack,
  Picker,
  Circle,
  ScrollView,
  Script,
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
import type { Color } from 'scripting'

import { importFromBoxJS, removeAccount, clearCache, listAccounts, setAccountOrder, feeRaw, CmccError } from './api'
import { Page, Card, Stage, Grid, Block, Panel, NavTile, Group, ActionRow, InfoRow, PickerRow, Chip, SmallButton } from './kit'
import { getData, setData, getLook, setLook, getDefaults, setDefault, getNames, setName, RECOMMENDED_BG, type Look, type Family, type DataPrefs } from './settings'
import { metersOf, amount, starText, pointsText, netText, errorText, hhmm, chunk, type Slot } from './ui'
import { STYLES, MULTI, NEEDS_HIST, stylesFor, styleById, paramOf, renderStyle, type StyleDef } from './styles/index'
import { loadSlots, sampleSlots, cachedSlots } from './slots'
import { installUpdate } from './update'

declare const Safari: { openURL(url: string): Promise<boolean> }

const BRANCH = 'testing'
const REMOTE_META = `https://raw.githubusercontent.com/MaYIHEI/patch/${BRANCH}/scripting/cmcc/script.json`
const PACKAGE_URL = `https://www.imarkr.com/api/github/download/MaYIHEI/patch/scripting/cmcc.zip?branch=${BRANCH}`
const HOMEPAGE = 'https://github.com/MaYIHEI/patch/tree/main/scripting/cmcc'
const BG_PATH = () => Path.join(FileManager.appGroupDocumentsDirectory, 'cmcc', 'background.jpg')

async function main() {
  await Navigation.present({ element: <Home />, modalPresentationStyle: 'fullScreen', swipeBackBehavior: 'dismiss' })
  Script.exit()
}

// ─────────────────────────────────────────────────────────────
// 共用
// ─────────────────────────────────────────────────────────────
type Shared = { slots: Slot[]; setSlots: (s: Slot[]) => void; reload: (force?: boolean) => Promise<void> }

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

type SizeTab = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'lock'

/** 预览用的号: 单号样式只给第一个, 多号样式给全部 */
const slotsFor = (style: StyleDef, all: Slot[]) => (MULTI.includes(style.id) ? all : all.slice(0, 1))

/** 有真实数据用真实的, 没有用示例 */
const previewSlots = (p: Shared) => (p.slots.some(s => s.account) ? p.slots : sampleSlots())

/** 按真实尺寸渲染一个小组件; scale < 1 时整体缩小 */
function Preview(props: { style: StyleDef; family: Family; slots: Slot[]; look?: Look; scale?: number }) {
  const box = BOX[props.family]
  const k = props.scale ?? 1
  const view = renderStyle(props.style, props.family, { inApp: true, slots: slotsFor(props.style, props.slots), look: props.look ?? getLook(), page: 0 })
  const room = props.family.startsWith('system') ? 12 : 0
  return (
    <ZStack frame={{ width: box.width * k, height: (box.height + room) * k }}>
      <VStack frame={{ width: box.width, height: box.height + room }} scaleEffect={k}>{view}</VStack>
    </ZStack>
  )
}

function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number), b = local.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

const tailsOf = (slots: Slot[]) => slots.filter(s => s.account).map(s => s.account!.phoneTail)

/** 某个样式的桌面参数: 多号样式带上所有尾号 */
const paramFor = (s: StyleDef, slots: Slot[]) => paramOf(s, s.id === 'S' || s.id === 'X' ? tailsOf(slots).slice(0, 2) : [])

const notes = (s: StyleDef, real: boolean) => [!real ? '示例数据' : '', NEEDS_HIST.includes(s.id) ? '需要几天历史' : ''].filter(Boolean).join(' · ')

// ─────────────────────────────────────────────────────────────
// 底栏
// ─────────────────────────────────────────────────────────────
function Home() {
  const dismiss = Navigation.useDismiss()
  const [slots, setSlots] = useState<Slot[]>(cachedSlots())
  const [tick, setTick] = useState(0)
  const tab = useObservable<number>(0)

  useEffect(() => { reload() }, [])

  async function reload(force = false) {
    if (force) clearCache()
    // 没有账号时 (首次使用, 或脚本被重新导入后 Keychain 清空) 先试着从 BoxJS 取; Loon 没开就走正常的导入引导
    if (!listAccounts().length) await importFromBoxJS(getData().host).catch(() => {})
    setSlots(listAccounts().length ? await loadSlots(styleById('W')!, []) : [])
    setTick(tick + 1)
    Widget.reloadAll()
  }

  const shared: Shared = { slots, setSlots, reload }
  const close = <Button title="关闭" action={dismiss} />
  const onChanged = () => setTick(tick + 1)

  return (
    <TabView selection={tab}>
      <Tab title="小组件" systemImage="square.grid.2x2.fill" value={0}>
        <NavigationStack><WidgetTab shared={shared} close={close} onChanged={onChanged} toAccounts={() => tab.setValue(1)} /></NavigationStack>
      </Tab>
      <Tab title="账号" systemImage="person.crop.circle.fill" value={1}>
        <NavigationStack><AccountsTab {...shared} close={close} /></NavigationStack>
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value={2}>
        <NavigationStack><SettingsTab {...shared} close={close} /></NavigationStack>
      </Tab>
    </TabView>
  )
}

const GALLERY: Partial<Record<Family, number>> = { systemSmall: 0.8, systemMedium: 0.62, systemLarge: 0.5 }

// ─────────────────────────────────────────────────────────────
// 小组件页: 当前默认样式的预览 + 同尺寸其他样式 + 样式库 / 外观
// ─────────────────────────────────────────────────────────────
function WidgetTab(props: { shared: Shared; close: any; onChanged: () => void; toAccounts: () => void }) {
  const { shared } = props
  const [family, setFamily] = useState<Family>('systemMedium')
  const real = shared.slots.some(s => s.account)
  const data = previewSlots(shared)
  const look = getLook()
  const style = styleById(getDefaults()[family]) ?? stylesFor(family)[0]
  const more = stylesFor(family).filter(x => x.id !== style.id)
  const [refreshText, setRefreshText] = useState('')

  async function refreshNow() {
    setRefreshText('刷新中...')
    await shared.reload(true)
    setRefreshText(`已刷新 ${hhmm(Date.now())}`)
  }

  return (
    <Page title="小组件" large bar={{ cancellationAction: props.close }}>
      {!listAccounts().length ? (
        <Card inner={14}>
          <HStack spacing={12}>
            <Chip icon="person.crop.circle.badge.plus" />
            <VStack alignment="leading" spacing={2}>
              <Text font={15} foregroundStyle="label">还没有导入账号</Text>
              <Text font={12} foregroundStyle="secondaryLabel">下面是示例数据; 到「账号」从 BoxJS 导入</Text>
            </VStack>
            <Spacer />
            <SmallButton title="去导入" action={props.toAccounts} />
          </HStack>
        </Card>
      ) : null}
      <VStack spacing={14} frame={{ maxWidth: 'infinity' }}>
        <Picker title="尺寸" value={family} onChanged={(v: any) => setFamily(v as Family)} pickerStyle="segmented">
          <Text tag="systemSmall">小</Text>
          <Text tag="systemMedium">中</Text>
          <Text tag="systemLarge">大</Text>
          <Text tag="accessoryRectangular">锁屏</Text>
        </Picker>
        <Stage>
          <Preview style={style} family={family} slots={data} />
          <Text font={12} foregroundStyle="secondaryLabel">{[`${style.name} · ${FAMILY_NAME[family]}`, notes(style, real)].filter(Boolean).join(' · ')}</Text>
        </Stage>
        {listAccounts().length ? (
          <Group>
            <ActionRow icon="arrow.clockwise" title="立即刷新小组件" value={refreshText || undefined} disabled={refreshText === '刷新中...'} action={refreshNow} />
          </Group>
        ) : null}
      </VStack>
      {more.length ? (
        <Block title="这个尺寸还有">
          <ScrollView axes="horizontal" scrollIndicator="hidden">
            <HStack spacing={12} alignment="top">
              {more.map(x => (
                <NavigationLink destination={<StyleDetail style={x} family={family} slots={data} real={real} onChanged={props.onChanged} />} buttonStyle="plain">
                  <VStack spacing={6}>
                    <Preview style={x} family={family} slots={data} scale={GALLERY[family] ?? 1} />
                    <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{x.name}</Text>
                  </VStack>
                </NavigationLink>
              ))}
            </HStack>
          </ScrollView>
        </Block>
      ) : null}
      <VStack alignment="leading" spacing={8}>
        <Grid>
          <NavTile icon="square.grid.2x2" title="换个样式" value={`共 ${STYLES.length} 种`} destination={<StyleLibrary {...shared} start={family.startsWith('accessory') ? 'lock' : family as SizeTab} onChanged={props.onChanged} />} />
          <NavTile icon="paintpalette" title="外观" value={look.mode === 'plain' ? '素净' : look.bgType === 'image' ? '自定义图片' : '自定义纯色'} destination={<AppearancePage {...shared} onChanged={props.onChanged} />} />
        </Grid>
        <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 20 }}>加到桌面: 长按桌面空白处 → + → 搜 Scripting → 选 cmcc; 长按小组件 → 编辑小组件 → 参数里填「样式名 尾号」。</Text>
      </VStack>
    </Page>
  )
}

function StyleLibrary(props: Shared & { start: SizeTab; onChanged: () => void }) {
  const [tab, setTab] = useState<SizeTab>(props.start)
  const real = props.slots.some(s => s.account)
  const [sample, setSample] = useState(!real)
  const [tick, setTick] = useState(0)
  const [items, setItems] = useState<1 | 2 | 3>(3)
  const data = sample ? sampleSlots(items) : previewSlots(props)
  const defaults = getDefaults()
  const changed = () => { setTick(tick + 1); props.onChanged() }

  const card = (s: StyleDef, f: Family, scale: number) => (
    <NavigationLink destination={<StyleDetail style={s} family={f} slots={data} real={real && !sample} onChanged={changed} />}>
      <VStack spacing={6}>
        <Preview style={s} family={f} slots={data} scale={scale} />
        <HStack spacing={4}>
          <Text font={13} fontWeight="medium" foregroundStyle="label">{s.name}</Text>
          {defaults[f] === s.id ? <Text font={10} foregroundStyle="secondaryLabel">默认</Text> : null}
        </HStack>
        <Text font={11} foregroundStyle="secondaryLabel" lineLimit={2} multilineTextAlignment="center">{s.desc}</Text>
      </VStack>
    </NavigationLink>
  )

  const grid = (f: Family) => {
    const cols = f === 'systemSmall' || f.startsWith('accessory') ? 2 : 1
    const scale = f === 'systemLarge' ? 0.92 : 1
    return (
      <VStack spacing={16}>
        {chunk(stylesFor(f), cols).map(row => (
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
        {sample ? (
          <Picker title="套餐项数" value={items} onChanged={(v: any) => setItems(v as 1 | 2 | 3)} pickerStyle="segmented">
            <Text tag={1}>1 项</Text>
            <Text tag={2}>2 项</Text>
            <Text tag={3}>3 项</Text>
          </Picker>
        ) : null}
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

function StyleDetail(props: { style: StyleDef; family: Family; slots: Slot[]; real: boolean; onChanged: () => void }) {
  const { style, family } = props
  const [note, setNote] = useState('')
  const param = paramFor(style, props.slots)
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
        <Preview style={style} family={family} slots={props.slots} scale={family === 'systemLarge' ? 0.92 : 1} />
        {notes(style, props.real) ? <Text font={12} foregroundStyle="secondaryLabel">{notes(style, props.real)}</Text> : null}
      </Stage>
      <Block note={`${style.desc}。支持: ${sizes}`}>
        <Button action={use} buttonStyle="borderedProminent" controlSize="large" frame={{ maxWidth: 'infinity' }}>
          <Text font={16} fontWeight="semibold" frame={{ maxWidth: 'infinity' }}>用这个样式</Text>
        </Button>
      </Block>
      <Block note={note || (lock
        ? `锁屏: 长按锁屏 → 自定 → 添加小组件 → Scripting → cmcc, 参数填「${param}」。不填用默认样式。`
        : `桌面: 长按小组件 → 编辑小组件 → 参数里粘贴「${param}」, 后面可加尾号选号 (如「${style.name} 1234」)。不填用这个尺寸的默认样式。`)} />
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
  const data = previewSlots(props)
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
    await FileManager.createDirectory(Path.join(FileManager.appGroupDocumentsDirectory, 'cmcc'), true)
    await FileManager.writeAsData(BG_PATH(), jpg)
    update({ bgType: 'image', image: BG_PATH() })
    setNote('')
  }

  return (
    <Page title="外观">
      <Stage>
        <Preview style={style} family={fam} slots={data} look={look} scale={fam === 'systemLarge' ? 0.8 : 1} />
        <Text font={12} foregroundStyle="secondaryLabel">{`${style.name} · ${FAMILY_NAME[fam]}`}</Text>
      </Stage>
      <Picker title="尺寸" value={fam} onChanged={(v: any) => setFam(v as Family)} pickerStyle="segmented">
        <Text tag="systemSmall">小</Text>
        <Text tag="systemMedium">中</Text>
        <Text tag="systemLarge">大</Text>
      </Picker>

      <Panel title="外观" note={look.mode === 'plain' ? '浅色白底、深色深灰底, 跟随系统; 只有进度条和状态带颜色。' : '背景可选纯色或相册图片, 文字颜色可自动或手动选; 用图片时可调暗化保证文字清楚。'}>
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
    </Page>
  )
}

// ─────────────────────────────────────────────────────────────
// 账号页: 每个号一张卡, 导入和刷新
// ─────────────────────────────────────────────────────────────
function errorWords(e: unknown): string {
  if (e instanceof CmccError && e.kind === 'auth') return '登录凭证已失效, 划掉中国移动 App 重开以重新抓取, 再导入'
  if (e instanceof CmccError && e.kind === 'risk') return '中国移动要求安全验证: 打开中国移动 App 按提示完成验证, 再刷新'
  return (e as Error).message
}

function AccountCard(props: { slot: Slot }) {
  const { slot } = props
  const a = slot.account
  if (!a) {
    const msg = errorText(slot.error)
    return (
        <VStack alignment="leading" spacing={4} padding={{ vertical: 4 }}>
          <Text font={16} fontWeight="semibold" foregroundStyle="label">{slot.name}</Text>
          <Text font={13} foregroundStyle="systemOrange">{msg.title}</Text>
          <Text font={12} foregroundStyle="secondaryLabel">{msg.hint}</Text>
        </VStack>
    )
  }
  return (
      <VStack alignment="leading" spacing={10} padding={{ vertical: 4 }}>
        <HStack spacing={12}>
          <VStack alignment="leading" spacing={2}>
            <Text font={16} fontWeight="semibold" foregroundStyle="label">{slot.name}</Text>
            <Text font={12} foregroundStyle="secondaryLabel">{[slot.name.endsWith(a.phoneTail) ? '' : `尾号 ${a.phoneTail}`, a.user?.brand, a.user?.starLevel ? starText(a) : '', a.user?.netYears !== undefined ? `网龄 ${netText(a)}` : ''].filter(Boolean).join(' · ')}</Text>
          </VStack>
          <Spacer />
          <VStack alignment="trailing" spacing={1}>
            <Text font={22} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={a.balance < 10 ? 'systemRed' : 'label'}>{a.balance.toFixed(2)}</Text>
            <Text font={11} foregroundStyle="secondaryLabel">{a.balance < 0 ? '已欠费' : '余额'}</Text>
          </VStack>
        </HStack>
        <HStack spacing={8}>
          {metersOf(a).map(m => (
            <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <Text font={11} foregroundStyle="secondaryLabel">{m.label}</Text>
              <Text font={14} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={m.percent < 20 ? 'systemRed' : 'label'}>{amount(m.key, m.remain)}</Text>
            </VStack>
          ))}
        </HStack>
      </VStack>
  )
}

function AccountsTab(props: Shared & { close: any }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const host = getData().host

  async function doImport() {
    setBusy(true)
    setNote('从 BoxJS 导入...')
    try {
      const tels = await importFromBoxJS(host)
      setNote(`已导入 ${tels.length} 个号`)
      await props.reload()
    } catch (e) {
      setNote(errorWords(e))
    }
    setBusy(false)
  }

  function onMove(indices: number[], newOffset: number) {
    const moving = indices.map(i => props.slots[i])
    const next = props.slots.filter((_, i) => !indices.includes(i))
    next.splice(newOffset, 0, ...moving)
    props.setSlots(next)
    setAccountOrder(next.map(s => s.tel))
    Widget.reloadAll()
  }

  async function onDelete(indices: number[]) {
    const gone = indices.map(i => props.slots[i].tel)
    props.setSlots(props.slots.filter((_, i) => !indices.includes(i)))
    for (const tel of gone) await removeAccount(tel)
    Widget.reloadAll()
  }

  return (
    <List
      navigationTitle="账号"
      navigationBarTitleDisplayMode="large"
      toolbar={{ cancellationAction: props.close }}
    >
      {props.slots.length ? (
        <Section footer={<Text>长按拖动调整顺序, 左滑删除。全景和多号翻页按这个顺序切换; 小组件参数里写了尾号的, 以参数为准。</Text>}>
          <ForEach
            count={props.slots.length}
            itemBuilder={(i: number) => {
              const s = props.slots[i]
              return <NavigationLink key={s.tel} destination={<AccountDetail slot={s} reload={props.reload} />}><AccountCard slot={s} /></NavigationLink>
            }}
            onMove={onMove}
            onDelete={onDelete}
          />
        </Section>
      ) : null}
      <Section
        header={<Text>导入</Text>}
        footer={<Text>{note || '1) Loon 装好 paperclip 中国移动插件和 BoxJS\n2) 划掉中国移动 App 再重开, 收到「获取成功」通知; 多个号用 App 的「切换账号」各抓一次\n3) 保持 Loon 开启, 点「从 BoxJS 导入」, 插件里存的号一次全部导入'}</Text>}
      >
        <Button title="从 BoxJS 导入" systemImage="square.and.arrow.down" disabled={busy} action={doImport} />
      </Section>
    </List>
  )
}

function AccountDetail(props: { slot: Slot; reload: (force?: boolean) => Promise<void> }) {
  const dismiss = Navigation.useDismiss()
  const { slot } = props
  const a = slot.account
  const [raw, setRaw] = useState('')

  async function rename() {
    const name = await Dialog.prompt({ title: '备注', message: '小组件和账号页显示这个名字; 留空恢复显示尾号', defaultValue: getNames()[slot.tel] ?? '', placeholder: '主号' })
    if (name === null) return
    setName(slot.tel, name.trim())
    await props.reload()
    dismiss()
  }

  async function diag() {
    setRaw('查询中...')
    try {
      setRaw(await feeRaw(slot.tel))
    } catch (e) {
      setRaw(errorWords(e))
    }
  }

  return (
    <Page title={slot.name}>
      {a ? (
        <Group title="套餐与账户" note={`更新于 ${hhmm(a.fetchedAt)}${a.stale ? ' · 网络失败, 显示的是缓存' : ''}; 本机已记录 ${slot.hist?.days ?? 0} 天历史`}>
          <InfoRow icon="yensign.circle" title={a.balance < 0 ? '已欠费' : '话费余额'} value={`¥${a.balance.toFixed(2)}`} color={a.balance < 10 ? 'systemRed' : undefined} />
          {a.monthFee !== undefined ? <InfoRow icon="creditcard" title="本月消费" value={`¥${a.monthFee.toFixed(2)}`} /> : null}
          {metersOf(a).map(m => <InfoRow icon={m.key === 'voice' ? 'phone' : m.key === 'tgt' ? 'square.stack.3d.up' : 'antenna.radiowaves.left.and.right'} title={m.key === 'voice' ? '语音' : `${m.label}流量`} value={`剩 ${amount(m.key, m.remain)} / ${amount(m.key, m.total)}`} />)}
          <InfoRow icon="star" title="积分" value={pointsText(a)} />
          {a.user?.starLevel ? <InfoRow icon="rosette" title="星级" value={`${starText(a)} · ${a.user.starScore ?? '-'}分`} /> : null}
          {a.user?.netYears !== undefined ? <InfoRow icon="calendar" title="网龄" value={`${netText(a)}`} /> : null}
          {a.user?.channel ? <InfoRow icon="mappin.and.ellipse" title="归属" value={a.user.channel} /> : null}
        </Group>
      ) : (
        <Group title="状态" note={errorText(slot.error).hint}>
          <InfoRow icon="exclamationmark.triangle" color="systemOrange" title={errorText(slot.error).title} />
        </Group>
      )}
      <Group title="备注" note="小组件参数里写了备注时, 以参数为准。">
        <ActionRow icon="pencil" title="备注" value={getNames()[slot.tel] || '未设置'} action={rename} />
      </Group>
      <Group title="诊断" note={raw || '查看话费接口的原始返回 (只有金额字段), 余额显示不对时截图给开发者。'}>
        <ActionRow icon="ladybug" title="话费原始数据" action={diag} />
      </Group>
    </Page>
  )
}

// ─────────────────────────────────────────────────────────────
// 设置: 刷新间隔、BoxJS、更新
// ─────────────────────────────────────────────────────────────
function SettingsTab(props: Shared & { close: any }) {
  const [prefs, setPrefsState] = useState<DataPrefs>(getData())
  const [updateText, setUpdateText] = useState('')
  const version = Script.metadata.version ?? '-'

  function update(patch: Partial<DataPrefs>) {
    const next = { ...prefs, ...patch }
    setPrefsState(next)
    setData(next)
    Widget.reloadAll()
  }

  async function checkUpdate() {
    setUpdateText('检查中...')
    try {
      const res = await fetch(REMOTE_META)
      const remote = String((await res.json() as { version?: string }).version ?? '')
      if (!remote || !isNewer(remote, version)) return setUpdateText('已是最新')
      setUpdateText(`有新版本 ${remote}`)
      const ok = await Dialog.confirm({ title: `发现新版本 ${remote}`, message: `当前 ${version}, 账号和历史都会保留`, cancelLabel: '稍后', confirmLabel: '更新' })
      if (!ok) return
      setUpdateText('更新中...')
      await installUpdate(PACKAGE_URL)
      Widget.reloadAll()
      await Dialog.alert({ title: `已更新到 ${remote}`, message: '点确定退出, 重新打开 cmcc 生效' })
      Script.exit()
    } catch (e) {
      setUpdateText(`失败: ${(e as Error).message}`.slice(0, 24))
    }
  }

  async function clearAll() {
    const ok = await Dialog.confirm({ title: '清除全部账号?', message: '会删除 Keychain 里所有号的登录凭证和本机历史', cancelLabel: '取消', confirmLabel: '清除' })
    if (!ok) return
    for (const t of listAccounts()) await removeAccount(t)
    await props.reload()
  }

  return (
    <Page title="设置" large bar={{ cancellationAction: props.close }}>
      <Group title="数据" note="小组件按这个间隔请系统刷新, 实际由系统决定; 想马上看, 到小组件页点「立即刷新小组件」, 或点小组件右上角的时间。">
        <PickerRow icon="clock" title="刷新间隔" value={prefs.refresh} options={[[60, '1 小时'], [120, '2 小时'], [240, '4 小时']]} onChanged={v => update({ refresh: v as DataPrefs['refresh'] })} />
        <HStack spacing={14} padding={{ horizontal: 14, vertical: 11 }} frame={{ maxWidth: 'infinity', minHeight: 48 }}>
          <Chip icon="shippingbox" />
          <Text font={16} foregroundStyle="label">BoxJS 域名</Text>
          <Spacer minLength={8} />
          <TextField title="boxjs.com" value={prefs.host} onChanged={(v: string) => update({ host: v })} multilineTextAlignment="trailing" />
        </HStack>
      </Group>
      <Group title="关于">
        <InfoRow icon="info.circle" title="版本" value={version} />
        <ActionRow icon="arrow.down.circle" title="检查更新" value={updateText || undefined} action={checkUpdate} />
        <ActionRow icon="link" title="项目主页" action={() => { Safari.openURL(HOMEPAGE) }} />
      </Group>
      {props.slots.length ? (
        <Group note="凭证只存本机 Keychain, 导入后小组件每次刷新自动续期, 不再需要 Loon。">
          <ActionRow icon="trash" color="systemRed" title="清除全部账号" destructive action={clearAll} />
        </Group>
      ) : null}
    </Page>
  )
}

main()
