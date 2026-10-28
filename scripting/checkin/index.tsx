// checkin / index.tsx
// 配置脚本 — 在 Scripting app 里跑, 不是 widget
//
// 首页: 今日完成度 / 需要处理 / 我的预设; 编辑预设 (实时预览); 更多设置; 签到协议

import {
  Button,
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
  Script,
  ScrollView,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  ZStack,
  Widget,
  LiveActivity,
  fetch,
  useEffect,
  useState,
} from 'scripting'
import {
  DEFAULT_HOST,
  getHost,
  setHost,
  getMock,
  setMock,
  loadSnapshot,
  clearCache,
  probe,
  runCheckin,
  counts,
  isProblem,
  rewardTotal,
  type Entry,
  type Snapshot,
} from './api'
import {
  STYLES,
  DEFAULT_PRESET,
  listPresets,
  savePreset,
  deletePreset,
  styleName,
  type Preset,
  type StyleId,
  type Skin,
  type Bg,
} from './presets'
import { makeTheme, Ring, AppIcon, hhmm, chunk, OK, BAD, WARN, type Ctx } from './ui'
import { renderPreset } from './styles/index'
import { recordSnapshot, loadHistory, getKeepDays, setKeepDays, clearHistory, recordedDays, type Day } from './history'
import { goalsOf } from './styles/history'
import { liveStateOf } from './styles/live'
import { startOrRefresh } from './live_activity'

declare const Safari: { openURL(url: string): Promise<boolean> }

const REMOTE_META = 'https://raw.githubusercontent.com/MaYIHEI/patch/main/scripting/checkin/script.json'
const INSTALL_URL = 'https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Fcheckin.zip%22%5D'

async function main() {
  await Navigation.present({ element: <Home /> })
  Script.exit()
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────
const CARD_BG = 'secondarySystemGroupedBackground'

async function cookieHint(e: Entry) {
  await Dialog.alert({ title: `${e.name} 需要重抓`, message: `保持代理工具开启, 打开「${e.name}」App, 签到脚本会重新抓取凭证。` })
}

function connText(snap: Snapshot | null, error: string): { text: string; color: string } {
  if (error) return { text: error, color: BAD }
  if (!snap) return { text: '读取中...', color: 'secondaryLabel' }
  if (snap.mock) return { text: '演示数据 · 更多设置里关闭', color: 'secondaryLabel' }
  if (snap.stale) return { text: 'BoxJS 连不上 · 显示上次结果', color: WARN }
  return { text: 'BoxJS 已连接', color: OK }
}

function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number), b = local.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

function appCtx(snap: Snapshot): Ctx {
  return {
    th: makeTheme(DEFAULT_PRESET), size: 'm', entries: snap.entries, snap, inApp: true, spot: 0,
    hist: [], keys: new Set(snap.entries.map(e => e.key)), preset: DEFAULT_PRESET, page: 0,
  }
}

// ─────────────────────────────────────────────────────────────
// 首页
// ─────────────────────────────────────────────────────────────
function Home() {
  const dismiss = Navigation.useDismiss()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [hist, setHist] = useState<Day[]>([])
  const [error, setError] = useState('')
  const [presets, setPresets] = useState<Preset[]>(listPresets())
  const [liveText, setLiveText] = useState('')
  const [busy, setBusy] = useState('')            // 正在补签的 key
  const [retryText, setRetryText] = useState('')

  useEffect(() => { refresh(true) }, [])

  async function refresh(first = false) {
    setError('')
    try {
      const s = await loadSnapshot()
      recordSnapshot(s)
      setSnap(s)
      setHist(loadHistory(s))
      Widget.reloadAll()
      // 从小组件的处理按钮点进来: 直接弹出这个脚本的处理说明
      const key = first ? Script.queryParameters?.key : undefined
      const hit = key ? s.entries.find(e => e.key === key) : undefined
      if (hit && isProblem(hit)) act(hit)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function act(e: Entry) {
    if (e.s === 'cookie') return cookieHint(e)
    if (!e.run) return Dialog.alert({ title: e.name, message: '该脚本不支持补签' })
    setBusy(e.key)
    setRetryText(`补签中: ${e.name}`)
    try {
      const n = await runCheckin(e)
      setRetryText(`${e.name}: ${n.s === 'ok' ? '补签成功' : n.msg || '仍然失败'}`)
    } catch (err) {
      setRetryText(`${e.name}: ${(err as Error).message}`)
    }
    setBusy('')
    await refresh()
  }

  /** 一键补签: 按顺序逐个请求, 显示进度 */
  async function retryAll() {
    if (!snap) return
    const fails = snap.entries.filter(e => e.s === 'fail')
    const can = fails.filter(e => e.run)
    const skip = fails.length - can.length
    if (!can.length) return Dialog.alert({ message: '失败项都不支持补签' })
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < can.length; i++) {
      setBusy(can[i].key)
      setRetryText(`补签中 ${i + 1}/${can.length}: ${can[i].name}`)
      try {
        if ((await runCheckin(can[i])).s === 'ok') ok++
        else failed.push(can[i].name)
      } catch (err) {
        failed.push(`${can[i].name} (${(err as Error).message})`)
      }
    }
    setBusy('')
    setRetryText([`补签完成: 成功 ${ok}/${can.length}`, failed.length ? `仍失败: ${failed.join('、')}` : '', skip ? `${skip} 个不支持补签` : ''].filter(Boolean).join(' · '))
    await refresh()
  }

  async function edit(p: Preset, isNew: boolean) {
    if (!snap) return
    await Navigation.present({ element: <PresetEditor preset={p} snap={snap} hist={hist} isNew={isNew} /> })
    setPresets(listPresets())
  }

  async function create() {
    const name = await Dialog.prompt({ title: '新建预设', message: '小组件参数里填这个名字', placeholder: '比如 钱包' })
    const n = name?.trim()
    if (!n) return
    if (presets.some(p => p.name === n)) {
      await Dialog.alert({ message: `已经有叫「${n}」的预设了` })
      return
    }
    await edit({ ...DEFAULT_PRESET, name: n }, true)
  }

  async function startLive() {
    if (!snap) return
    setLiveText('启动中...')
    const ok = await startOrRefresh(liveStateOf(snap.entries))
    setLiveText(ok ? '已开启, 锁屏和灵动岛可见' : '没开起来: 检查 设置 → Scripting → 实时活动 是否允许')
  }

  async function endLive() {
    await LiveActivity.endAllActivities({ dismissTimeInterval: 0 })
    setLiveText('已结束')
  }

  const conn = connText(snap, error)
  const problems = snap ? snap.entries.filter(isProblem) : []
  const c = snap ? counts(snap.entries) : null
  const cells: (Preset | null)[] = [...presets, null]

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle="签到总览"
        background="systemGroupedBackground"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
          topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={() => refresh()} />,
        }}
      >
        <VStack alignment="leading" spacing={18} padding={16}>
          {/* 今日完成度 */}
          <HStack spacing={16} padding={16} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={20} fill={CARD_BG} />}>
            {snap ? (
              <Ring ctx={appCtx(snap)} size={74} line={9}>
                <Text font={20} fontWeight="semibold" monospacedDigit>{String(c!.ok)}</Text>
              </Ring>
            ) : null}
            <VStack alignment="leading" spacing={4}>
              <Text font={17} fontWeight="semibold">{c ? `今日 ${c.ok} / ${snap!.entries.length}` : '今日签到'}</Text>
              {snap ? <Text font={13} foregroundStyle="secondaryLabel">{`今日奖励 +${rewardTotal(snap.entries)} · ${hhmm(snap.fetchedAt)} 同步`}</Text> : null}
              {snap ? <Text font={12} foregroundStyle="tertiaryLabel">{snap.mock ? '演示历史 30 天' : `已记录 ${hist.length} 天历史`}</Text> : null}
              <HStack spacing={6}>
                <RoundedRectangle cornerRadius={3} fill={conn.color} frame={{ width: 6, height: 6 }} />
                <Text font={12} foregroundStyle={conn.color} lineLimit={2}>{conn.text}</Text>
              </HStack>
            </VStack>
            <Spacer />
          </HStack>

          {/* 需要处理 */}
          {problems.length ? (
            <VStack alignment="leading" spacing={6}>
              <Text font={13} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>需要处理</Text>
              <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD_BG} />}>
                {problems.map(e => (
                  <HStack spacing={12} padding={{ horizontal: 14, vertical: 10 }}>
                    <AppIcon entry={e} size={30} />
                    <VStack alignment="leading" spacing={1}>
                      <Text font={15}>{e.name}</Text>
                      <Text font={12} foregroundStyle={e.s === 'cookie' ? BAD : WARN} lineLimit={1}>{e.msg || (e.s === 'cookie' ? '凭证失效' : '失败')}</Text>
                    </VStack>
                    <Spacer />
                    <Button action={() => { act(e) }} buttonStyle="plain" disabled={!!busy}>
                      <Text font={13} fontWeight="medium" foregroundStyle={e.s === 'cookie' ? 'white' : e.run ? 'label' : 'tertiaryLabel'}
                        padding={{ horizontal: 12, vertical: 6 }}
                        background={<RoundedRectangle cornerRadius={14} fill={e.s === 'cookie' ? BAD : 'tertiarySystemFill'} />}>
                        {e.s === 'cookie' ? '打开 App' : busy === e.key ? '补签中...' : e.run ? '补签' : '不支持补签'}
                      </Text>
                    </Button>
                  </HStack>
                ))}
                {problems.some(e => e.s === 'fail') ? (
                  <Button action={retryAll} buttonStyle="plain" disabled={!!busy}>
                    <HStack padding={{ horizontal: 14, vertical: 12 }}>
                      <Text font={15} foregroundStyle={busy ? 'tertiaryLabel' : 'systemBlue'}>全部失败项一键补签</Text>
                      <Spacer />
                    </HStack>
                  </Button>
                ) : null}
              </VStack>
              {retryText ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>{retryText}</Text> : null}
            </VStack>
          ) : null}

          {/* 我的预设 */}
          <VStack alignment="leading" spacing={6}>
            <HStack padding={{ horizontal: 16 }}>
              <Text font={13} foregroundStyle="secondaryLabel">我的预设</Text>
              <Spacer />
              <Button title="新建" action={create} />
            </HStack>
            <VStack spacing={10}>
              {chunk(cells, 2).map(row => (
                <HStack spacing={10}>
                  {row.map(p => p ? <PresetCard preset={p} action={() => edit(p, false)} /> : <NewCard action={create} />)}
                  {row.length < 2 ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
                </HStack>
              ))}
            </VStack>
            <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16, top: 4 }}>
              长按桌面小组件 › 编辑小组件, 在参数里填预设名就能套用; 不填用「A 列表 · 素净」。
            </Text>
          </VStack>

          {/* 实时活动 */}
          <VStack alignment="leading" spacing={6}>
            <Text font={13} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>实时活动</Text>
            <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD_BG} />}>
              <Button action={startLive} buttonStyle="plain"><EntryLine title="开始早间签到实时活动" /></Button>
              <Button action={endLive} buttonStyle="plain"><EntryLine title="结束实时活动" /></Button>
            </VStack>
            <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 16 }}>
              {liveText || '锁屏和灵动岛显示今日进度。也可以在控制中心添加 checkin 按钮, 点一下开启或刷新。'}
            </Text>
          </VStack>

          {/* 入口 */}
          <VStack spacing={0} background={<RoundedRectangle cornerRadius={14} fill={CARD_BG} />}>
            <NavigationLink destination={<MoreSettings onChanged={() => refresh()} />}>
              <EntryLine title="更多设置" />
            </NavigationLink>
            <NavigationLink destination={<ProtocolPage />}>
              <EntryLine title="签到协议" detail="给脚本作者" />
            </NavigationLink>
          </VStack>
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}

function EntryLine(props: { title: string; detail?: string }) {
  return (
    <HStack padding={{ horizontal: 14, vertical: 12 }}>
      <Text font={15} foregroundStyle="label">{props.title}</Text>
      {props.detail ? <Text font={12} foregroundStyle="secondaryLabel">{` · ${props.detail}`}</Text> : null}
      <Spacer />
      <Image systemName="chevron.right" font={13} foregroundStyle="tertiaryLabel" />
    </HStack>
  )
}

/** 预设卡: 缩略图 (皮肤底色 + 样式图标) + 名称 + 样式 */
function PresetCard(props: { preset: Preset; action: () => void }) {
  const p = props.preset
  const color = p.skin === 'color'
  return (
    <Button action={props.action} buttonStyle="plain">
      <VStack alignment="leading" spacing={10} padding={12} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={16} fill={CARD_BG} />}>
        <ZStack frame={{ maxWidth: 'infinity', height: 56 }} background={<RoundedRectangle cornerRadius={10} fill={color ? '#0A0E1A' : 'systemGroupedBackground'} />}>
          <Image systemName={STYLES.find(s => s.id === p.style)?.icon ?? 'square'} font={24} foregroundStyle={color ? '#64D2FF' : OK} />
        </ZStack>
        <VStack alignment="leading" spacing={1}>
          <Text font={15} fontWeight="semibold" foregroundStyle="label" lineLimit={1}>{p.name}</Text>
          <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{`${p.style} · ${styleName(p.style)} · ${color ? '彩色' : '素净'}`}</Text>
        </VStack>
      </VStack>
    </Button>
  )
}

function NewCard(props: { action: () => void }) {
  return (
    <Button action={props.action} buttonStyle="plain">
      <VStack spacing={6} frame={{ maxWidth: 'infinity', height: 118 }}
        overlay={<RoundedRectangle cornerRadius={16} stroke={{ shapeStyle: 'separator', strokeStyle: { lineWidth: 1, dash: [5, 4] } }} />}>
        <Image systemName="plus" font={22} foregroundStyle="accentColor" />
        <Text font={14} foregroundStyle="accentColor">新建预设</Text>
      </VStack>
    </Button>
  )
}

// ─────────────────────────────────────────────────────────────
// 编辑预设
// ─────────────────────────────────────────────────────────────
type PreviewFamily = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'lock'

const BOX: Record<string, { width: number; height: number }> = {
  systemSmall: { width: 170, height: 170 },
  systemMedium: { width: 345, height: 162 },
  systemLarge: { width: 345, height: 362 },
  accessoryCircular: { width: 76, height: 76 },
  accessoryRectangular: { width: 172, height: 76 },
}

function PresetEditor(props: { preset: Preset; snap: Snapshot; hist: Day[]; isNew: boolean }) {
  const dismiss = Navigation.useDismiss()
  const p = props.preset
  const allKeys = props.snap.entries.map(e => e.key)
  const [name, setName] = useState(p.name)
  const [style, setStyle] = useState<StyleId>(p.style)
  const [skin, setSkin] = useState<Skin>(p.skin)
  const [bg, setBg] = useState<Bg>(p.bg)
  const [problemsFirst, setProblemsFirst] = useState(p.problemsFirst)
  // 显示内容: order 是全部脚本的排列, selected 是勾上的; 空 keys = 全部
  const [order, setOrder] = useState<string[]>(p.keys.length ? [...p.keys, ...allKeys.filter(k => !p.keys.includes(k))] : allKeys)
  const [selected, setSelected] = useState<string[]>(p.keys.length ? p.keys : allKeys)
  const [family, setFamily] = useState<PreviewFamily>(p.style === 'I' ? 'lock' : 'systemMedium')
  const [note, setNote] = useState('')
  const [goals, setGoals] = useState<Record<string, number>>(p.goals ?? {})

  function keys(): string[] {
    const all = selected.length === order.length && order.join() === allKeys.join()
    return all ? [] : order.filter(k => selected.includes(k))
  }

  const draft: Preset = { name: name.trim(), style, skin, keys: keys(), problemsFirst, bg, goals }

  async function editGoal(key: string, label: string, current: number) {
    const v = await Dialog.prompt({ title: `${label} 目标值`, message: `当前 ${current}; 清空恢复自动目标`, defaultValue: goals[key] ? String(goals[key]) : '', placeholder: '比如 1000', keyboardType: 'decimalPad' })
    if (v === null) return
    const n = Number(v.trim())
    const next = { ...goals }
    if (v.trim() && Number.isFinite(n) && n > 0) next[key] = n
    else delete next[key]
    setGoals(next)
  }

  async function save(): Promise<boolean> {
    if (!draft.name) {
      await Dialog.alert({ message: '预设名不能为空' })
      return false
    }
    if (draft.name !== p.name && listPresets().some(x => x.name === draft.name)) {
      await Dialog.alert({ message: `已经有叫「${draft.name}」的预设了` })
      return false
    }
    if (!selected.length) {
      await Dialog.alert({ message: '至少勾选一个脚本' })
      return false
    }
    savePreset(draft, props.isNew ? draft.name : p.name)
    return true
  }

  async function done() {
    if (await save()) dismiss()
  }

  async function copyParam() {
    if (!(await save())) return
    await Pasteboard.setString(draft.name)
    setNote(`已保存并复制「${draft.name}」, 到小组件参数里粘贴`)
  }

  /** 用 Scripting 的真实小组件尺寸预览 (会先保存) */
  async function systemPreview() {
    if (!(await save())) return
    const fam = family === 'lock' ? 'accessoryRectangular' : family
    await Widget.preview({ family: fam, parameters: { options: { [draft.name]: draft.name }, default: draft.name } })
  }

  async function remove() {
    const ok = await Dialog.confirm({ title: `删除「${p.name}」?`, message: '用这个预设的小组件会变回默认样式', cancelLabel: '取消', confirmLabel: '删除' })
    if (!ok) return
    deletePreset(p.name)
    dismiss()
  }

  function toggle(key: string) {
    setSelected(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])
  }

  function onMove(indices: number[], newOffset: number) {
    const moving = indices.map(i => order[i])
    const rest = order.filter((_, i) => !indices.includes(i))
    rest.splice(newOffset, 0, ...moving)
    setOrder(rest)
  }

  const byKey = new Map(props.snap.entries.map(e => [e.key, e]))
  const preview = (fam: string) => (
    <VStack frame={BOX[fam]}>{renderPreset(draft, props.snap, fam, { inApp: true, spot: 0, hist: props.hist, page: 0 })}</VStack>
  )

  return (
    <NavigationStack>
      <List
        navigationTitle={props.isNew ? '新建预设' : p.name}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="取消" action={dismiss} />,
          confirmationAction: [<Button title="完成" action={done} />, <EditButton />],
        }}
      >
        <Section footer={<Text>{'预览用的是当前数据; 「真实尺寸预览」会先保存, 再用系统小组件渲染。'}</Text>}>
          <VStack spacing={14} frame={{ maxWidth: 'infinity' }} padding={{ vertical: 8 }}>
            {family === 'lock' ? (
              <HStack spacing={14}>{preview('accessoryCircular')}{preview('accessoryRectangular')}</HStack>
            ) : preview(family)}
            <Picker title="尺寸" value={family} onChanged={(v: any) => setFamily(v as PreviewFamily)} pickerStyle="segmented">
              <Text tag="systemSmall">小</Text>
              <Text tag="systemMedium">中</Text>
              <Text tag="systemLarge">大</Text>
              <Text tag="lock">锁屏</Text>
            </Picker>
          </VStack>
          <Button title="真实尺寸预览" action={systemPreview} />
        </Section>

        <Section header={<Text>样式</Text>} footer={<Text>{STYLES.find(s => s.id === style)?.note ?? `${style} · ${styleName(style)}`}</Text>}>
          <ScrollView axes="horizontal" scrollIndicator="hidden">
            <HStack spacing={10} padding={{ vertical: 4 }}>
              {STYLES.map(s => (
                <Button action={() => setStyle(s.id)} buttonStyle="plain">
                  <VStack spacing={5} frame={{ width: 70 }}>
                    <ZStack frame={{ width: 64, height: 64 }}
                      background={<RoundedRectangle cornerRadius={14} fill="tertiarySystemFill" />}
                      overlay={s.id === style ? <RoundedRectangle cornerRadius={14} stroke={{ shapeStyle: 'systemBlue', strokeStyle: { lineWidth: 2.5 } }} /> : undefined}>
                      <Image systemName={s.icon} font={22} foregroundStyle={s.id === style ? 'systemBlue' : 'secondaryLabel'} />
                    </ZStack>
                    <Text font={11} foregroundStyle={s.id === style ? 'systemBlue' : 'secondaryLabel'} fontWeight={s.id === style ? 'semibold' : 'regular'} lineLimit={1}>
                      {`${s.id} ${s.name}`}
                    </Text>
                  </VStack>
                </Button>
              ))}
            </HStack>
          </ScrollView>
        </Section>

        <Section
          header={<Text>{`显示内容 · ${selected.length} / ${order.length}`}</Text>}
          footer={<Text>{'点一行勾选或取消; 点右上角「编辑」后拖动排序。全部勾选且没排序时, 以后新增的脚本也会自动显示。'}</Text>}
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
                    {e ? <AppIcon entry={e} size={26} /> : <Image systemName="questionmark.square.dashed" font={22} foregroundStyle="secondaryLabel" />}
                    <VStack alignment="leading" spacing={0}>
                      <Text font={15} foregroundStyle={on ? 'label' : 'secondaryLabel'}>{e?.name ?? key}</Text>
                      <Text font={11} foregroundStyle="tertiaryLabel">{e?.asset ? `${key} · ${e.asset}` : key}</Text>
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

        {style === 'N' ? (
          <Section header={<Text>兑换目标</Text>} footer={<Text>{'点一行设目标值; 没设的按下一个整数自动定目标 (735 → 800)。'}</Text>}>
            {goalsOf({ ...appCtx(props.snap), entries: props.snap.entries.filter(e => selected.includes(e.key)), hist: props.hist, preset: draft }).map(g => (
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

        <Section header={<Text>外观</Text>}>
          <Picker title="皮肤" value={skin} onChanged={(v: any) => setSkin(v as Skin)} pickerStyle="segmented">
            <Text tag="plain">素净</Text>
            <Text tag="color">彩色</Text>
          </Picker>
          <Picker title="背景" value={bg} onChanged={(v: any) => setBg(v as Bg)} pickerStyle="segmented">
            <Text tag="auto">{skin === 'color' ? '自动 (深色)' : '跟随系统'}</Text>
            <Text tag="dark">深色</Text>
            <Text tag="light">浅色</Text>
          </Picker>
          <Toggle title="有问题时优先显示" value={problemsFirst} onChanged={setProblemsFirst} />
          <LabeledContent label={<Text>预设名</Text>}>
            <TextField title="小组件参数" value={name} onChanged={setName} multilineTextAlignment="trailing" />
          </LabeledContent>
        </Section>

        <Section footer={note ? <Text>{note}</Text> : undefined}>
          <Button action={copyParam} buttonStyle="borderedProminent" controlSize="large" frame={{ maxWidth: 'infinity' }}>
            <Text font={16} fontWeight="semibold" frame={{ maxWidth: 'infinity' }}>{`复制参数「${draft.name || '未命名'}」`}</Text>
          </Button>
          {props.isNew ? null : <Button title="删除预设" role="destructive" action={remove} />}
        </Section>
      </List>
    </NavigationStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 更多设置
// ─────────────────────────────────────────────────────────────
type Check = { connected: boolean; count: number; error?: string }

function MoreSettings(props: { onChanged: () => void }) {
  const [host, setHostText] = useState(getHost())
  const [mock, setMockOn] = useState(getMock())
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [cacheText, setCacheText] = useState('')
  const [keep, setKeep] = useState(getKeepDays())
  const [histText, setHistText] = useState('')
  const version = Script.metadata.version ?? '-'

  function handleMock(on: boolean) {
    setMockOn(on)
    setMock(on)
    props.onChanged()
  }

  function saveHost() {
    setHost(host)
    setHostText(getHost())
    props.onChanged()
  }

  async function runCheck() {
    setChecking(true)
    setCheck(await probe())
    setChecking(false)
  }

  async function checkUpdate() {
    setUpdateText('检查中...')
    try {
      const res = await fetch(REMOTE_META)
      const remote = String((await res.json() as { version?: string }).version ?? '')
      if (!remote || !isNewer(remote, version)) {
        setUpdateText('已是最新')
        return
      }
      setUpdateText(`有新版本 ${remote}`)
      const ok = await Dialog.confirm({ title: `发现新版本 ${remote}`, message: `当前 ${version}, 更新会重新导入脚本, 预设保留`, cancelLabel: '稍后', confirmLabel: '更新' })
      if (ok) await Safari.openURL(INSTALL_URL)
    } catch {
      setUpdateText('检查失败')
    }
  }

  const step = (ok: boolean | null) => (ok === null ? 'circle' : ok ? 'checkmark.circle.fill' : 'xmark.circle.fill')
  const stepColor = (ok: boolean | null) => (ok === null ? 'tertiaryLabel' : ok ? 'systemGreen' : 'systemRed')

  return (
    <Form navigationTitle="更多设置" navigationBarTitleDisplayMode="inline">
      <Section header={<Text>数据源</Text>} footer={<Text>{'关掉演示数据后从 BoxJS 读取, 代理工具 (Loon / Surge / QX) 需保持开启。'}</Text>}>
        <Toggle title="演示数据" value={mock} onChanged={handleMock} />
        <LabeledContent label={<Text>BoxJS 地址</Text>}>
          <TextField title={DEFAULT_HOST} value={host} onChanged={setHostText} multilineTextAlignment="trailing" />
        </LabeledContent>
        <Button title="保存地址并刷新" action={saveHost} />
        <Button title={cacheText || '清缓存'} action={() => { clearCache(); setCacheText('已清除'); props.onChanged() }} />
      </Section>

      <Section header={<Text>历史记录</Text>} footer={<Text>{`每次读到数据按北京时间存当天快照, 同一天覆盖。已记录 ${recordedDays()} 天; 演示数据用的是现场生成的 30 天历史。`}</Text>}>
        <Picker title="保留天数" value={keep} onChanged={(v: any) => { setKeep(Number(v)); setKeepDays(Number(v)) }}>
          <Text tag={30}>30 天</Text>
          <Text tag={90}>90 天</Text>
          <Text tag={180}>180 天</Text>
          <Text tag={365}>365 天</Text>
        </Picker>
        <Button title={histText || '清除历史'} role="destructive" action={async () => {
          const ok = await Dialog.confirm({ title: '清除全部历史?', message: '日历、收益、热力图等会从头开始记录', cancelLabel: '取消', confirmLabel: '清除' })
          if (!ok) return
          clearHistory()
          setHistText('已清除')
          props.onChanged()
        }} />
      </Section>

      <Section header={<Text>新手引导</Text>} footer={check?.error ? <Text>{check.error}</Text> : undefined}>
        <HStack spacing={10}>
          <Image systemName={step(check ? check.count > 0 : null)} foregroundStyle={stepColor(check ? check.count > 0 : null)} />
          <VStack alignment="leading" spacing={1}>
            <Text>1. 装签到插件</Text>
            <Text font={12} foregroundStyle="secondaryLabel">
              {check ? (check.count > 0 ? `BoxJS 里有 ${check.count} 个签到结果` : '还没读到签到结果, 先让签到脚本跑一次') : '代理工具里装 BoxJS 和支持签到状态的脚本'}
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={10}>
          <Image systemName={step(check ? check.connected : null)} foregroundStyle={stepColor(check ? check.connected : null)} />
          <VStack alignment="leading" spacing={1}>
            <Text>2. 连 BoxJS</Text>
            <Text font={12} foregroundStyle="secondaryLabel">{check ? (check.connected ? `已连上 ${getHost()}` : '连不上, 检查地址和代理工具') : `当前地址 ${getHost()}`}</Text>
          </VStack>
        </HStack>
        <HStack spacing={10}>
          <Image systemName="info.circle" foregroundStyle="systemBlue" />
          <VStack alignment="leading" spacing={1}>
            <Text>3. 加小组件</Text>
            <Text font={12} foregroundStyle="secondaryLabel">桌面长按空白 → + → Scripting → 选 checkin, 参数填预设名</Text>
          </VStack>
        </HStack>
        <Button title={checking ? '检查中...' : '开始检查'} action={runCheck} disabled={checking} />
      </Section>

      <Section header={<Text>关于</Text>}>
        <LabeledContent label={<Text>版本</Text>} value={version} />
        <Button title={updateText ? `检查更新 · ${updateText}` : '检查更新'} action={checkUpdate} />
      </Section>
    </Form>
  )
}

// ─────────────────────────────────────────────────────────────
// 签到协议
// ─────────────────────────────────────────────────────────────
const SAMPLE_REGISTRY = '{"dreame_status":{"name":"追觅","author":"MaYIHEI"}}'
const SAMPLE_RESULT = '{"v":1,"s":"ok","t":1793105254635,"msg":"+5 积分 · 连签 3 天","asset":"积分 735"}'

function ProtocolPage() {
  const [note, setNote] = useState('')
  return (
    <Form navigationTitle="签到协议 v1" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{'脚本跑完后把结果写进代理工具的持久化存储 ($persistentStore / $prefs), 本小组件通过 BoxJS 读取。'}</Text>}>
        <Text>{'1. 在 checkin_registry 里登记自己: { "状态key": { name, author, url?, run? } }'}</Text>
        <Text>{'2. 每次签到后把结果写进状态 key: { v:1, s, t, msg, asset? }'}</Text>
      </Section>
      <Section header={<Text>字段</Text>}>
        <LabeledContent label={<Text>s</Text>} value="ok 成功 / cookie 需重抓 / fail 失败 / none 不显示" />
        <LabeledContent label={<Text>t</Text>} value="毫秒时间戳" />
        <LabeledContent label={<Text>msg</Text>} value="今日奖励, 如 +5 积分" />
        <LabeledContent label={<Text>asset</Text>} value="资产 (可选), 如 积分 735" />
        <LabeledContent label={<Text>exp</Text>} value="凭证过期毫秒时间戳 (可选)" />
        <LabeledContent label={<Text>run</Text>} value="登记项里的补签 URL (可选), GET 后现跑脚本并返回最新结果" />
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
