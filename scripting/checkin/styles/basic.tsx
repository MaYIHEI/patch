// checkin / styles/basic.tsx
// A 列表 · B 环形 · E 资产钱包 · M 大字状态 · I 锁屏

import { VStack, HStack, ZStack, Text, Spacer, Image, Gauge, AccessoryWidgetBackground, RoundedRectangle } from 'scripting'

import { counts, isProblem, rewardTotal, splitAsset, brand, type Entry } from '../api'
import {
  Root, Card, AppIcon, SegBar, Ring, ProblemPills, ActionPill, RowEnd, DateTag, Header, Num, Empty, Dot,
  syncText, statusColor, chunk, signed, OK, BAD, type Ctx,
} from '../ui'
import { assetDelta } from '../history'

/** 一行脚本: 图标 + 名称 (+ 下一行灰字 msg) + 行尾 */
export function EntryRow(props: { ctx: Ctx; entry: Entry; icon: number; sub?: boolean; buttons?: boolean; font?: number }) {
  const { ctx, entry, icon } = props
  const { th } = ctx
  const font = props.font ?? 14
  const msg = entry.s === 'cookie' ? `${entry.msg || '凭证失效'} · 打开 App 刷新` : entry.msg
  return (
    <HStack spacing={8} frame={{ maxWidth: 'infinity' }}>
      <AppIcon entry={entry} size={icon} />
      {props.sub ? (
        <VStack alignment="leading" spacing={1}>
          <HStack spacing={4}>
            <Text font={font} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{entry.name}</Text>
            <DateTag entry={entry} />
          </HStack>
          <Text font={11} foregroundStyle={entry.s === 'ok' ? th.t2 : statusColor(entry)} lineLimit={1}>{msg}</Text>
        </VStack>
      ) : (
        <HStack spacing={4}>
          <Text font={font} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{entry.name}</Text>
          <DateTag entry={entry} />
        </HStack>
      )}
      <Spacer minLength={4} />
      <RowEnd ctx={ctx} entry={entry} buttons={props.buttons} font={font} />
    </HStack>
  )
}

/** "今日签到 / 28 / 31" */
function DoneCount(props: { ctx: Ctx; size: number }) {
  const { ctx } = props
  const c = counts(ctx.entries)
  return (
    <VStack alignment="leading" spacing={1}>
      <Text font={12} foregroundStyle={ctx.th.t2}>今日签到</Text>
      <HStack spacing={2} alignment="lastTextBaseline">
        <Num value={c.ok} size={props.size} color={ctx.th.t1} />
        <Text font={props.size * 0.58} fontWeight="medium" monospacedDigit foregroundStyle={ctx.th.t2}>{` / ${ctx.entries.length}`}</Text>
      </HStack>
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// A 列表
// ─────────────────────────────────────────────────────────────
export function ListStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const rows = size === 'l' ? 7 : 3
  const shown = entries.slice(0, rows)
  const rest = entries.length - shown.length
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={7}>
        <HStack>
          <DoneCount ctx={ctx} size={20} />
          <Spacer />
        </HStack>
        <SegBar ctx={ctx} height={4} />
        {shown.map(e => <EntryRow ctx={ctx} entry={e} icon={18} font={12} />)}
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 9 : 7}>
      <HStack>
        <DoneCount ctx={ctx} size={size === 'l' ? 26 : 20} />
        <Spacer />
        <ProblemPills ctx={ctx} />
      </HStack>
      <SegBar ctx={ctx} />
      {size === 'l' ? (
        <VStack spacing={7}>
          {shown.map(e => <EntryRow ctx={ctx} entry={e} icon={28} sub buttons />)}
        </VStack>
      ) : (
        <VStack spacing={5}>
          {shown.map(e => <EntryRow ctx={ctx} entry={e} icon={20} font={13} buttons />)}
        </VStack>
      )}
      <Spacer minLength={0} />
      {size === 'l' ? (
        <HStack>
          <Text font={11} foregroundStyle={th.t3}>{rest > 0 ? `还有 ${rest} 个` : ''}</Text>
          <Spacer />
          <Text font={11} foregroundStyle={th.t3}>{syncText(ctx.snap)}</Text>
        </HStack>
      ) : null}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// B 环形
// ─────────────────────────────────────────────────────────────
function RingCenter(props: { ctx: Ctx; size: number }) {
  const { ctx } = props
  const c = counts(ctx.entries)
  return (
    <VStack spacing={0}>
      <Num value={c.ok} size={props.size} color={ctx.th.t1} />
      <Text font={11} monospacedDigit foregroundStyle={ctx.th.t2}>{`/ ${ctx.entries.length}`}</Text>
    </VStack>
  )
}

function problemLine(ctx: Ctx): { text: string; color: string } {
  const c = counts(ctx.entries)
  if (c.cookie) return { text: `${c.cookie} 个需重抓`, color: BAD }
  if (c.fail) return { text: `${c.fail} 个失败`, color: '#FF9F0A' }
  return { text: '全部正常', color: OK }
}

/** 小资产卡: 名称 + 数字 */
function MiniAsset(props: { ctx: Ctx; entry: Entry }) {
  const { ctx, entry } = props
  const a = splitAsset(entry.asset ?? '')
  return (
    <Card ctx={ctx} padding={{ horizontal: 10, vertical: 6 }} spacing={1}>
      <HStack spacing={6}>
        <Text font={11} foregroundStyle={ctx.th.t2} lineLimit={1}>{`${entry.name} ${a.unit}`}</Text>
        <Spacer minLength={2} />
        <Num value={a.num} size={15} color={ctx.th.t1} />
      </HStack>
    </Card>
  )
}

export function RingStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const pl = problemLine(ctx)
  const assets = entries.filter(e => e.asset)
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={6}>
        <Spacer minLength={0} />
        <HStack><Spacer /><Ring ctx={ctx} size={88} line={11}><RingCenter ctx={ctx} size={24} /></Ring><Spacer /></HStack>
        <HStack><Spacer /><Text font={11} foregroundStyle={pl.color}>{pl.text}</Text><Spacer /></HStack>
        <Spacer minLength={0} />
      </Root>
    )
  }
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack spacing={6}>
            <Ring ctx={ctx} size={90} line={10}><RingCenter ctx={ctx} size={22} /></Ring>
            <Text font={11} foregroundStyle={pl.color}>{pl.text}</Text>
          </VStack>
          <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
            {(assets.length ? assets : entries).slice(0, 3).map(e => e.asset ? <MiniAsset ctx={ctx} entry={e} /> : (
              <Card ctx={ctx} padding={{ horizontal: 10, vertical: 6 }}><EntryRow ctx={ctx} entry={e} icon={16} font={12} /></Card>
            ))}
          </VStack>
        </HStack>
      </Root>
    )
  }
  const c = counts(entries)
  return (
    <Root ctx={ctx} spacing={12}>
      <HStack spacing={16}>
        <Ring ctx={ctx} size={110} line={13}><RingCenter ctx={ctx} size={28} /></Ring>
        <VStack alignment="leading" spacing={6}>
          <Legend ctx={ctx} color={OK} label="成功" n={c.ok} />
          <Legend ctx={ctx} color={BAD} label="需重抓" n={c.cookie} />
          <Legend ctx={ctx} color="#FF9F0A" label="失败" n={c.fail} />
          <Text font={12} foregroundStyle={th.t2}>{`今日奖励 +${rewardTotal(entries)} · ${syncText(ctx.snap)}`}</Text>
        </VStack>
        <Spacer />
      </HStack>
      {assets.length ? (
        <VStack spacing={8}>
          {chunk(assets.slice(0, 6), 2).map(row => (
            <HStack spacing={8}>
              <MiniAsset ctx={ctx} entry={row[0]} />
              {row[1] ? <MiniAsset ctx={ctx} entry={row[1]} /> : <VStack frame={{ maxWidth: 'infinity' }} />}
            </HStack>
          ))}
        </VStack>
      ) : (
        <VStack spacing={7}>{entries.filter(isProblem).slice(0, 5).map(e => <EntryRow ctx={ctx} entry={e} icon={24} sub buttons />)}</VStack>
      )}
      <Spacer minLength={0} />
    </Root>
  )
}

function Legend(props: { ctx: Ctx; color: string; label: string; n: number }) {
  return (
    <HStack spacing={6}>
      <Dot color={props.color} size={8} />
      <Text font={13} foregroundStyle={props.ctx.th.t2}>{props.label}</Text>
      <Num value={props.n} size={15} color={props.ctx.th.t1} />
    </HStack>
  )
}

// ─────────────────────────────────────────────────────────────
// E 资产钱包
// ─────────────────────────────────────────────────────────────
function WalletCard(props: { ctx: Ctx; entry: Entry; numSize: number }) {
  const { ctx, entry } = props
  const { th } = ctx
  const a = splitAsset(entry.asset ?? '')
  const b = brand(entry.key)
  const bad = entry.s === 'cookie'
  // 彩色: 品牌深色卡; 素净: 白卡. 需重抓的卡变红
  const fill = bad ? th.badBg : th.color ? b.bg : th.card
  const label = bad ? th.badFg : th.color ? b.fg : th.t2
  const num = bad ? th.badFg : th.color ? '#FFFFFF' : th.t1
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={10}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={14} fill={fill} />}
      overlay={th.color && !bad ? undefined : <RoundedRectangle cornerRadius={14} stroke={{ shapeStyle: th.border, strokeStyle: { lineWidth: 0.5 } }} />}
    >
      <HStack spacing={5}>
        {th.color ? null : <AppIcon entry={entry} size={16} />}
        <Text font={11} foregroundStyle={label} lineLimit={1}>{entry.name}</Text>
        <Spacer minLength={0} />
        {entry.s === 'fail' ? <Dot color="#FF9F0A" size={6} /> : null}
      </HStack>
      <Spacer minLength={2} />
      <Num value={a.num} size={props.numSize} color={num} />
      <Text font={11} foregroundStyle={label} lineLimit={1}>{bad ? '需重抓' : a.unit || ' '}</Text>
    </VStack>
  )
}

export function WalletStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { size } = ctx
  const assets = ctx.entries.filter(e => e.asset)
  if (!assets.length) return <Root ctx={ctx}><Empty ctx={ctx} text="选中的脚本都没有资产" /></Root>
  if (size === 's') {
    const e = assets[0]
    const a = splitAsset(e.asset!)
    const b = brand(e.key)
    const { th } = ctx
    return (
      <Root ctx={ctx} bg={th.color ? b.bg : undefined} tone={e.s === 'cookie' ? 'bad' : undefined} spacing={0}>
        <HStack spacing={6}>
          <AppIcon entry={e} size={26} />
          <Spacer />
          <Text font={11} foregroundStyle={th.color ? b.fg : th.t3}>{syncText(ctx.snap)}</Text>
        </HStack>
        <Spacer />
        <Text font={12} foregroundStyle={th.color ? b.fg : th.t2} lineLimit={1}>{`${e.name} · ${a.unit}`}</Text>
        <Num value={a.num} size={34} weight="bold" color={th.color ? '#FFFFFF' : th.t1} />
        <Text font={12} foregroundStyle={e.s === 'ok' ? (th.color ? b.fg : th.t2) : statusColor(e)} lineLimit={1}>
          {e.s === 'cookie' ? '需重抓' : e.msg}
        </Text>
      </Root>
    )
  }
  const shown = assets.slice(0, size === 'm' ? 3 : 6)
  // 较昨天: 有昨天记录的资产求和; 都没有就显示同步时间
  const deltas = shown.map(e => assetDelta(ctx.hist, e.key)).filter((d): d is number => d !== undefined)
  const right = deltas.length ? `较昨天 ${signed(deltas.reduce((a, b) => a + b, 0))}` : syncText(ctx.snap)
  return (
    <Root ctx={ctx} spacing={10}>
      <Header ctx={ctx} title="我的资产" right={right} />
      {size === 'm' ? (
        <HStack spacing={8} frame={{ maxHeight: 'infinity' }}>
          {shown.map(e => <WalletCard ctx={ctx} entry={e} numSize={20} />)}
        </HStack>
      ) : (
        <VStack spacing={8} frame={{ maxHeight: 'infinity' }}>
          {chunk(shown, 2).map(row => (
            <HStack spacing={8}>
              <WalletCard ctx={ctx} entry={row[0]} numSize={24} />
              {row[1] ? <WalletCard ctx={ctx} entry={row[1]} numSize={24} /> : <VStack frame={{ maxWidth: 'infinity' }} />}
            </HStack>
          ))}
        </VStack>
      )}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// M 大字状态: 有问题整张卡变红, 全部正常变绿
// ─────────────────────────────────────────────────────────────
const actionWord = (e: Entry) => (e.s === 'cookie' ? '重抓' : '补签')

function AllGood(props: { ctx: Ctx; big: number }) {
  const { ctx } = props
  return (
    <VStack alignment="leading" spacing={2}>
      <Image systemName="checkmark" font={props.big * 0.9} fontWeight="bold" foregroundStyle={OK} />
      <Text font={props.big} fontWeight="bold" foregroundStyle={ctx.th.goodFg} lineLimit={1} minScaleFactor={0.6}>全部正常</Text>
      <Text font={12} foregroundStyle={ctx.th.goodFg} lineLimit={1}>{`${ctx.entries.length} 个脚本 · 今日 +${rewardTotal(ctx.entries)}`}</Text>
    </VStack>
  )
}

export function BigStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const problems = entries.filter(isProblem)
  if (!problems.length) {
    const assets = entries.filter(e => e.asset)
    return (
      <Root ctx={ctx} tone="good" spacing={10}>
        {size === 'm' ? (
          <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
            <AllGood ctx={ctx} big={28} />
            <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
              {assets.slice(0, 3).map(e => <EntryRow ctx={ctx} entry={e} icon={18} font={12} />)}
            </VStack>
          </HStack>
        ) : (
          <VStack alignment="leading" spacing={10} frame={{ maxHeight: 'infinity', alignment: 'topLeading' }}>
            {size === 'l' ? <Spacer minLength={0} /> : null}
            <AllGood ctx={ctx} big={size === 'l' ? 40 : 28} />
            {size === 'l' ? <Spacer minLength={0} /> : null}
            {size === 'l' ? assets.slice(0, 5).map(e => <EntryRow ctx={ctx} entry={e} icon={22} font={13} />) : null}
          </VStack>
        )}
      </Root>
    )
  }
  const big = <Num value={problems.length} size={size === 'l' ? 88 : size === 'm' ? 60 : 62} weight="bold" color={th.badFg} />
  if (size === 's') {
    return (
      <Root ctx={ctx} tone="bad" spacing={0}>
        <Text font={12} foregroundStyle={th.badFg}>需要处理</Text>
        <Spacer minLength={0} />
        {big}
        <Spacer minLength={0} />
        {problems.slice(0, 2).map(e => <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{`${e.name} · ${actionWord(e)}`}</Text>)}
      </Root>
    )
  }
  const rows = problems.slice(0, size === 'l' ? 6 : 3)
  const list = (
    <VStack spacing={size === 'l' ? 8 : 5} frame={{ maxWidth: 'infinity' }}>
      {rows.map(e => (
        <HStack spacing={8}>
          <AppIcon entry={e} size={size === 'l' ? 26 : 20} />
          <VStack alignment="leading" spacing={0}>
            <Text font={13} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{e.name}</Text>
            {size === 'l' ? <Text font={11} foregroundStyle={statusColor(e)} lineLimit={1}>{e.msg}</Text> : null}
          </VStack>
          <Spacer minLength={4} />
          <ActionPill ctx={ctx} entry={e} />
        </HStack>
      ))}
    </VStack>
  )
  if (size === 'm') {
    return (
      <Root ctx={ctx} tone="bad">
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack alignment="leading" spacing={0} frame={{ width: 92, maxHeight: 'infinity', alignment: 'topLeading' }}>
            <Text font={12} foregroundStyle={th.badFg}>需要处理</Text>
            <Spacer minLength={0} />
            {big}
          </VStack>
          {list}
        </HStack>
      </Root>
    )
  }
  const c = counts(entries)
  return (
    <Root ctx={ctx} tone="bad" spacing={6}>
      <Text font={13} foregroundStyle={th.badFg}>需要处理</Text>
      {big}
      <Spacer minLength={0} />
      {list}
      <Spacer minLength={0} />
      <Text font={11} foregroundStyle={th.t2}>{`成功 ${c.ok} · 需重抓 ${c.cookie} · 失败 ${c.fail} · ${syncText(ctx.snap)}`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// I 锁屏: 圆形完成度 / 长条摘要; 放到桌面时是同样信息的大字版
// ─────────────────────────────────────────────────────────────
function lockLines(entries: Entry[], max: number): string[] {
  const problems = entries.filter(isProblem)
  if (!problems.length) return ['全部正常']
  return problems.slice(0, max).map(e => (e.s === 'cookie' ? `${e.name}需重抓` : `${e.name} 待补签`))
}

/** App 内预览锁屏时垫一块深色底, 模拟锁屏 */
function LockPreview(props: { ctx: Ctx; radius: number; children?: any }) {
  if (!props.ctx.inApp) return props.children
  return (
    <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} background={<RoundedRectangle cornerRadius={props.radius} fill="#23306B" />} clipShape={{ type: 'rect', cornerRadius: props.radius }}>
      {props.children}
    </ZStack>
  )
}

export function LockCircular(props: { ctx: Ctx }) {
  const { ctx } = props
  const c = counts(ctx.entries)
  const total = ctx.entries.length || 1
  return (
    <LockPreview ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <Gauge
          value={c.ok / total}
          min={0}
          max={1}
          label={<Text>签到</Text>}
          currentValueLabel={<Text monospacedDigit>{String(c.ok)}</Text>}
          gaugeStyle="accessoryCircularCapacity"
        />
      </ZStack>
    </LockPreview>
  )
}

export function LockRect(props: { ctx: Ctx }) {
  const { ctx } = props
  const c = counts(ctx.entries)
  const reward = rewardTotal(ctx.entries)
  return (
    <LockPreview ctx={ctx} radius={14}>
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
        <Text font={14} fontWeight="bold" monospacedDigit lineLimit={1} foregroundStyle={ctx.inApp ? '#FFFFFF' : undefined}>
          {`签到 ${c.ok}/${ctx.entries.length}${reward ? ` · +${reward}` : ''}`}
        </Text>
        {lockLines(ctx.entries, 2).map(t => <Text font={12} lineLimit={1} foregroundStyle={ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined}>{t}</Text>)}
      </VStack>
    </LockPreview>
  )
}

export function LockStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  const c = counts(entries)
  const lines = lockLines(entries, size === 'l' ? 6 : size === 'm' ? 3 : 1)
  const ring = <Ring ctx={ctx} size={size === 's' ? 84 : 96} line={size === 's' ? 9 : 11}><RingCenter ctx={ctx} size={22} /></Ring>
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={6}>
        <HStack><Spacer />{ring}<Spacer /></HStack>
        <HStack><Spacer /><Text font={12} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>{lines[0]}</Text><Spacer /></HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={12}>
      <HStack spacing={16}>
        {ring}
        <VStack alignment="leading" spacing={3}>
          <Text font={17} fontWeight="bold" monospacedDigit foregroundStyle={th.t1}>{`签到 ${c.ok}/${entries.length} · +${rewardTotal(entries)}`}</Text>
          {(size === 'm' ? lines : lines.slice(0, 1)).map(t => <Text font={13} foregroundStyle={t === '全部正常' ? OK : th.t2} lineLimit={1}>{t}</Text>)}
        </VStack>
        <Spacer />
      </HStack>
      {size === 'l' ? (
        <VStack spacing={8}>{entries.filter(isProblem).slice(0, 6).map(e => <EntryRow ctx={ctx} entry={e} icon={26} sub buttons />)}</VStack>
      ) : null}
      <Spacer minLength={0} />
    </Root>
  )
}
