// checkin / styles/basic.tsx
// A 列表 · B 环形 · E 资产钱包 · M 大字状态 · I 完成度 (锁屏)
// 每个样式只实现它在 styles/index.tsx 里声明支持的尺寸, 行数按最小机型 (SE / mini) 算过能放下

import { VStack, HStack, ZStack, Text, Spacer, Image, Gauge, AccessoryWidgetBackground, RoundedRectangle, Link } from 'scripting'

import { counts, isProblem, rewardTotal, splitAsset, type Entry } from '../api'
import { assetDelta } from '../history'
import {
  Root, Card, AppIcon, SegBar, Ring, ProblemPills, ActionPill, RowEnd, DateTag, Header, Num, Empty, Dot,
  syncText, statusColor, chunk, signed, detailURL, hhmm, OK, BAD, type Ctx,
} from '../ui'

/** 一行脚本: 图标 + 名称 (+ 下一行灰字 msg) + 行尾; 小组件里点左边打开脚本详情 */
export function EntryRow(props: { ctx: Ctx; entry: Entry; icon: number; sub?: boolean; buttons?: boolean; font?: number }) {
  const { ctx, entry, icon } = props
  const { th } = ctx
  const font = props.font ?? 14
  const msg = entry.s === 'cookie' ? `${entry.msg || '凭证失效'} · 打开 App 刷新` : entry.msg
  const left = (
    <HStack spacing={8}>
      <AppIcon entry={entry} size={icon} />
      <VStack alignment="leading" spacing={1}>
        <HStack spacing={4}>
          <Text font={font} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{entry.name}</Text>
          <DateTag entry={entry} />
        </HStack>
        {props.sub ? <Text font={11} foregroundStyle={entry.s === 'ok' ? th.t2 : statusColor(entry)} lineLimit={1}>{msg}</Text> : null}
      </VStack>
    </HStack>
  )
  return (
    <HStack spacing={8} frame={{ maxWidth: 'infinity' }}>
      {ctx.inApp ? left : <Link url={detailURL(entry.key)}>{left}</Link>}
      <Spacer minLength={4} />
      <RowEnd ctx={ctx} entry={entry} buttons={props.buttons} font={font} />
    </HStack>
  )
}

const empty = (ctx: Ctx) => <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>

// ─────────────────────────────────────────────────────────────
// A 列表: 中 3 行, 大 6 行
// ─────────────────────────────────────────────────────────────
export function ListStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return empty(ctx)
  const c = counts(entries)
  const rows = size === 'l' ? 6 : 3
  const shown = entries.slice(0, rows)
  const rest = entries.length - shown.length
  const head = (
    <HStack spacing={6}>
      <HStack spacing={2} alignment="lastTextBaseline">
        <Num value={c.ok} size={size === 'l' ? 24 : 18} color={th.t1} />
        <Text font={size === 'l' ? 14 : 12} monospacedDigit foregroundStyle={th.t2}>{` / ${entries.length}`}</Text>
      </HStack>
      <Text font={11} foregroundStyle={th.t3} lineLimit={1}>{syncText(ctx.snap)}</Text>
      <Spacer minLength={4} />
      <ProblemPills ctx={ctx} />
    </HStack>
  )
  if (size === 'm') {
    return (
      <Root ctx={ctx} spacing={7}>
        {head}
        <SegBar ctx={ctx} />
        <VStack spacing={5}>{shown.map(e => <EntryRow ctx={ctx} entry={e} icon={20} font={13} buttons />)}</VStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={9}>
      {head}
      <SegBar ctx={ctx} />
      <VStack spacing={7}>{shown.map(e => <EntryRow ctx={ctx} entry={e} icon={28} sub buttons />)}</VStack>
      <Spacer minLength={0} />
      {rest > 0 ? <Text font={11} foregroundStyle={th.t3}>{`还有 ${rest} 个`}</Text> : null}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// B 环形: 小、中
// ─────────────────────────────────────────────────────────────
function RingCenter(props: { ctx: Ctx; size: number }) {
  const { ctx } = props
  return (
    <VStack spacing={0}>
      <Num value={counts(ctx.entries).ok} size={props.size} color={ctx.th.t1} />
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
    <Card ctx={ctx} padding={{ horizontal: 10, vertical: 5 }} spacing={1}>
      <HStack spacing={6} frame={{ maxHeight: 'infinity' }}>
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
  if (!entries.length) return empty(ctx)
  const pl = problemLine(ctx)
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={4}>
        <HStack><Spacer /><Ring ctx={ctx} size={74} line={10}><RingCenter ctx={ctx} size={22} /></Ring><Spacer /></HStack>
        <Spacer minLength={0} />
        <HStack><Spacer /><Text font={12} fontWeight="medium" foregroundStyle={pl.color}>{pl.text}</Text><Spacer /></HStack>
        <HStack><Spacer /><Text font={10} foregroundStyle={th.t3}>{syncText(ctx.snap)}</Text><Spacer /></HStack>
      </Root>
    )
  }
  const assets = entries.filter(e => e.asset)
  return (
    <Root ctx={ctx}>
      <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
        <VStack spacing={6}>
          <Ring ctx={ctx} size={86} line={10}><RingCenter ctx={ctx} size={22} /></Ring>
          <Text font={11} foregroundStyle={pl.color}>{pl.text}</Text>
        </VStack>
        <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
          <Header ctx={ctx} title={assets.length ? '资产' : '需要处理'} right={syncText(ctx.snap)} font={12} />
          {assets.length
            ? assets.slice(0, 3).map(e => <MiniAsset ctx={ctx} entry={e} />)
            : entries.slice(0, 3).map(e => <EntryRow ctx={ctx} entry={e} icon={18} font={12} />)}
        </VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// E 资产钱包: 小 1 张, 中 3 张, 大 6 张, 锁屏长条 2 个
// ─────────────────────────────────────────────────────────────
function WalletCard(props: { ctx: Ctx; entry: Entry; numSize: number }) {
  const { ctx, entry } = props
  const { th } = ctx
  const a = splitAsset(entry.asset ?? '')
  const bad = entry.s === 'cookie'
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={10}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={14} fill={bad ? th.badBg : th.card} />}
      overlay={<RoundedRectangle cornerRadius={14} stroke={{ shapeStyle: th.border, strokeStyle: { lineWidth: 0.5 } }} />}
    >
      <HStack spacing={5}>
        <AppIcon entry={entry} size={16} />
        <Text font={11} foregroundStyle={bad ? th.badFg : th.t2} lineLimit={1}>{entry.name}</Text>
        <Spacer minLength={0} />
        {entry.s === 'fail' ? <Dot color="#FF9F0A" size={6} /> : null}
      </HStack>
      <Spacer minLength={2} />
      <Num value={a.num} size={props.numSize} color={bad ? th.badFg : th.t1} />
      <Text font={11} foregroundStyle={bad ? th.badFg : th.t2} lineLimit={1}>{bad ? '需重抓' : a.unit || ' '}</Text>
    </VStack>
  )
}

export function WalletStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size } = ctx
  const assets = ctx.entries.filter(e => e.asset)
  if (!assets.length) return <Root ctx={ctx}><Empty ctx={ctx} text="显示的脚本都没有资产" /></Root>
  if (size === 's') {
    const e = assets[0]
    const a = splitAsset(e.asset!)
    return (
      <Root ctx={ctx} tone={e.s === 'cookie' ? 'bad' : undefined} spacing={0}>
        <HStack spacing={6}>
          <AppIcon entry={e} size={26} />
          <Spacer />
          <Text font={10} foregroundStyle={th.t3}>{syncText(ctx.snap)}</Text>
        </HStack>
        <Spacer />
        <Text font={12} foregroundStyle={th.t2} lineLimit={1}>{`${e.name} · ${a.unit}`}</Text>
        <Num value={a.num} size={32} weight="bold" color={th.t1} />
        <Text font={12} foregroundStyle={e.s === 'ok' ? th.t2 : statusColor(e)} lineLimit={1}>{e.s === 'cookie' ? '需重抓' : e.msg}</Text>
      </Root>
    )
  }
  const shown = assets.slice(0, size === 'm' ? 3 : 6)
  // 较昨天: 有昨天记录的资产求和; 都没有就只显示数据时间
  const deltas = shown.map(e => assetDelta(ctx.hist, e.key)).filter((d): d is number => d !== undefined)
  const right = deltas.length ? `较昨天 ${signed(deltas.reduce((a, b) => a + b, 0))} · ${hhmm(ctx.snap.fetchedAt)}` : syncText(ctx.snap)
  return (
    <Root ctx={ctx} spacing={10}>
      <Header ctx={ctx} title="我的资产" right={right} />
      {size === 'm' ? (
        <HStack spacing={8} frame={{ maxHeight: 'infinity' }}>
          {shown.map(e => <WalletCard ctx={ctx} entry={e} numSize={20} />)}
          {shown.length < 3 ? Array(3 - shown.length).fill(0).map(() => <VStack frame={{ maxWidth: 'infinity' }} />) : null}
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

export function WalletLockRect(props: { ctx: Ctx }) {
  const { ctx } = props
  const assets = ctx.entries.filter(e => e.asset).slice(0, 2)
  return (
    <LockPreview ctx={ctx} radius={14}>
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
        <Text font={12} fontWeight="semibold" lineLimit={1} foregroundStyle={lockFg(ctx)}>{`资产 · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
        {assets.length ? assets.map(e => (
          <Text font={13} monospacedDigit lineLimit={1} foregroundStyle={lockFg(ctx)}>{`${e.name} ${e.asset}`}</Text>
        )) : <Text font={12} lineLimit={1} foregroundStyle={lockFg(ctx)}>没有资产</Text>}
      </VStack>
    </LockPreview>
  )
}

// ─────────────────────────────────────────────────────────────
// M 大字状态: 有问题整张卡变红, 全部正常变绿; 小、中、锁屏圆形
// ─────────────────────────────────────────────────────────────
const actionWord = (e: Entry) => (e.s === 'cookie' ? '重抓' : '补签')

export function BigStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return empty(ctx)
  const problems = entries.filter(isProblem)
  if (!problems.length) {
    const good = (big: number) => (
      <VStack alignment="leading" spacing={2}>
        <Image systemName="checkmark" font={big * 0.8} fontWeight="bold" foregroundStyle={OK} />
        <Text font={big} fontWeight="bold" foregroundStyle={th.goodFg} lineLimit={1} minScaleFactor={0.6}>全部正常</Text>
        <Text font={11} foregroundStyle={th.goodFg} lineLimit={1}>{`${entries.length} 个脚本 · 今日 +${rewardTotal(entries)}`}</Text>
        <Text font={10} foregroundStyle={th.goodFg} opacity={0.75}>{syncText(ctx.snap)}</Text>
      </VStack>
    )
    if (size === 's') return <Root ctx={ctx} tone="good"><Spacer minLength={0} />{good(26)}</Root>
    return (
      <Root ctx={ctx} tone="good">
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          {good(26)}
          <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
            {entries.filter(e => e.asset).slice(0, 3).map(e => <EntryRow ctx={ctx} entry={e} icon={18} font={12} />)}
          </VStack>
        </HStack>
      </Root>
    )
  }
  const label = <Text font={12} foregroundStyle={th.badFg} lineLimit={1}>{`需要处理 · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
  const big = <Num value={problems.length} size={size === 'm' ? 56 : 58} weight="bold" color={th.badFg} />
  if (size === 's') {
    return (
      <Root ctx={ctx} tone="bad" spacing={0}>
        {label}
        <Spacer minLength={0} />
        {big}
        <Spacer minLength={0} />
        {problems.slice(0, 2).map(e => <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{`${e.name} · ${actionWord(e)}`}</Text>)}
      </Root>
    )
  }
  return (
    <Root ctx={ctx} tone="bad">
      <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={0} frame={{ width: 92, maxHeight: 'infinity', alignment: 'topLeading' }}>
          {label}
          <Spacer minLength={0} />
          {big}
        </VStack>
        <VStack spacing={5} frame={{ maxWidth: 'infinity' }}>
          {problems.slice(0, 3).map(e => (
            <HStack spacing={8}>
              <AppIcon entry={e} size={20} />
              <Text font={13} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{e.name}</Text>
              <Spacer minLength={4} />
              <ActionPill ctx={ctx} entry={e} />
            </HStack>
          ))}
        </VStack>
      </HStack>
    </Root>
  )
}

export function BigLockCircular(props: { ctx: Ctx }) {
  const { ctx } = props
  const n = ctx.entries.filter(isProblem).length
  return (
    <LockPreview ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          <Image systemName={n ? 'exclamationmark.triangle.fill' : 'checkmark'} font={12} foregroundStyle={lockFg(ctx)} />
          <Text font={20} fontWeight="bold" monospacedDigit foregroundStyle={lockFg(ctx)}>{n ? String(n) : '好'}</Text>
        </VStack>
      </ZStack>
    </LockPreview>
  )
}

// ─────────────────────────────────────────────────────────────
// I 完成度: 锁屏圆形 / 长条
// ─────────────────────────────────────────────────────────────
/** 锁屏用系统着色, App 内预览才给白字 */
const lockFg = (ctx: Ctx) => (ctx.inApp ? '#FFFFFF' : undefined)

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
  const problems = ctx.entries.filter(isProblem)
  const lines = problems.length ? problems.slice(0, 2).map(e => (e.s === 'cookie' ? `${e.name}需重抓` : `${e.name} 待补签`)) : ['全部正常']
  return (
    <LockPreview ctx={ctx} radius={14}>
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
        <Text font={14} fontWeight="bold" monospacedDigit lineLimit={1} foregroundStyle={lockFg(ctx)}>
          {`签到 ${c.ok}/${ctx.entries.length} · ${hhmm(ctx.snap.fetchedAt)}`}
        </Text>
        {lines.map(t => <Text font={12} lineLimit={1} foregroundStyle={ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined}>{t}</Text>)}
      </VStack>
    </LockPreview>
  )
}
