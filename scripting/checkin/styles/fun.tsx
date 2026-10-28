// checkin / styles/fun.tsx
// D 图标墙 · F 终端日志 · G 时间线 · L 签到小票 · P 聚光灯 · S 签到天气

import { VStack, HStack, ZStack, Text, Spacer, Image, Rectangle, RoundedRectangle } from 'scripting'

import { counts, isProblem, isToday, rewardTotal, splitAsset, timeLabel, type Entry } from '../api'
import {
  Root, AppIcon, Dot, ActionPill, Header, Num, Empty, SegBar,
  syncText, statusColor, hhmm, chunk, OK, BAD, WARN, type Ctx,
} from '../ui'
import { EntryRow } from './basic'

const firstPart = (msg: string) => msg.split(' · ')[0]
const RANK = { cookie: 0, fail: 1, ok: 2, none: 3 }
const worst = (list: Entry[]) => list.reduce((w, e) => (RANK[e.s] < RANK[w.s] ? e : w), list[0])
const empty = (ctx: Ctx) => <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>

// ─────────────────────────────────────────────────────────────
// D 图标墙: 小号只放有问题的 9 个, 中号 14 个, 大号 25 个; 有问题的描边
// ─────────────────────────────────────────────────────────────
function MoreTile(props: { ctx: Ctx; n: number; size: number }) {
  return (
    <Text font={props.size * 0.34} fontWeight="semibold" foregroundStyle={props.ctx.th.t2} frame={{ width: props.size, height: props.size }}
      background={<RoundedRectangle cornerRadius={props.size * 0.26} fill={props.ctx.th.track} />}>
      {`+${props.n}`}
    </Text>
  )
}

function IconGrid(props: { ctx: Ctx; list: Entry[]; cols: number; rows: number; size: number; gap: number }) {
  const { ctx, list, cols, rows, size, gap } = props
  const cap = cols * rows
  const overflow = list.length > cap
  const shown = overflow ? list.slice(0, cap - 1) : list
  const cells: any[] = shown.map(e => <AppIcon entry={e} size={size} ring />)
  if (overflow) cells.push(<MoreTile ctx={ctx} n={list.length - shown.length} size={size} />)
  return (
    <VStack alignment="leading" spacing={gap}>
      {chunk(cells, cols).map(row => <HStack spacing={gap}>{row}</HStack>)}
    </VStack>
  )
}

export function IconWallStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return empty(ctx)
  const problems = entries.filter(isProblem)
  if (size === 's') {
    if (!problems.length) {
      return (
        <Root ctx={ctx} tone="good" spacing={4}>
          <Image systemName="checkmark.seal.fill" font={28} foregroundStyle={OK} />
          <Spacer />
          <Text font={22} fontWeight="bold" foregroundStyle={th.goodFg}>全部正常</Text>
          <Text font={11} foregroundStyle={th.goodFg}>{`${entries.length} 个脚本 · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
        </Root>
      )
    }
    return (
      <Root ctx={ctx} spacing={8}>
        <Header ctx={ctx} title={`${problems.length} 需处理`} right={hhmm(ctx.snap.fetchedAt)} font={12} />
        <IconGrid ctx={ctx} list={problems} cols={3} rows={3} size={28} gap={6} />
      </Root>
    )
  }
  const head = <Header ctx={ctx} title={`${entries.length} 个脚本`} right={problems.length ? `${problems.length} 需处理 · ${hhmm(ctx.snap.fetchedAt)}` : syncText(ctx.snap)} rightColor={problems.length ? BAD : th.t3} />
  if (size === 'm') {
    return (
      <Root ctx={ctx} spacing={10}>
        {head}
        <IconGrid ctx={ctx} list={entries} cols={7} rows={2} size={34} gap={7} />
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={10}>
      {head}
      <SegBar ctx={ctx} height={4} />
      <IconGrid ctx={ctx} list={entries} cols={5} rows={5} size={44} gap={10} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// F 终端日志: 中 5 行, 大 15 行
// ─────────────────────────────────────────────────────────────
export function TerminalStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  const font = size === 'l' ? 12 : 11
  const rows = size === 'l' ? 15 : 5
  const c = counts(entries)
  const line = (e: Entry) => {
    const mark = e.s === 'ok' ? '✓' : e.s === 'cookie' ? '✗' : '!'
    const result = e.s === 'cookie' ? 'cookie' : e.s === 'fail' ? e.msg || 'fail' : firstPart(e.msg) || 'ok'
    return (
      <HStack spacing={5}>
        <Text font={font} fontDesign="monospaced" foregroundStyle={statusColor(e)}>{mark}</Text>
        <Text font={font} fontDesign="monospaced" foregroundStyle={th.t1} lineLimit={1}>{e.name}</Text>
        {isToday(e.t) ? null : <Text font={font - 1} fontDesign="monospaced" foregroundStyle={WARN}>{timeLabel(e.t)}</Text>}
        <Spacer minLength={4} />
        <Text font={font} fontDesign="monospaced" foregroundStyle={e.s === 'ok' ? th.t3 : statusColor(e)} lineLimit={1}>{result}</Text>
      </HStack>
    )
  }
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 3 : 2}>
      <Text font={font} fontDesign="monospaced" foregroundStyle={th.t3} lineLimit={1}>{`~ checkin today · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
      {entries.slice(0, rows).map(line)}
      <Spacer minLength={0} />
      <Text font={font} fontDesign="monospaced" foregroundStyle={th.accent} lineLimit={1}>{`${c.ok} ok · ${c.cookie} cookie · ${c.fail} fail ▌`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// G 时间线: 按记录时间 (时:分) 分组, 新的在下; 中 4 组, 大 8 组
// ─────────────────────────────────────────────────────────────
function groupByTime(entries: Entry[]): { label: string; list: Entry[] }[] {
  const out: { label: string; list: Entry[] }[] = []
  for (const e of [...entries].sort((a, b) => a.t - b.t)) {
    const label = isToday(e.t) ? hhmm(e.t) : `${timeLabel(e.t)} ${hhmm(e.t)}`
    const last = out[out.length - 1]
    if (last && last.label === label) last.list.push(e)
    else out.push({ label, list: [e] })
  }
  return out
}

export function TimelineStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return empty(ctx)
  const groups = groupByTime(entries).slice(size === 'l' ? -8 : -4)
  const rowH = size === 'l' ? 32 : 23
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="时间线" right={syncText(ctx.snap)} />
      <VStack spacing={0}>
        {groups.map((g, i) => {
          const w = worst(g.list)
          return (
            <HStack spacing={8} frame={{ height: rowH }}>
              <Text font={11} monospacedDigit foregroundStyle={th.t2} lineLimit={1} frame={{ width: 70, alignment: 'leading' }}>{g.label}</Text>
              <ZStack frame={{ width: 10, height: rowH }}>
                <Rectangle fill={th.track} frame={{ width: 1.5, height: i === groups.length - 1 ? rowH / 2 : rowH }} offset={{ x: 0, y: i === groups.length - 1 ? -rowH / 4 : 0 }} />
                <Dot color={statusColor(w)} size={9} />
              </ZStack>
              <VStack alignment="leading" spacing={0}>
                <Text font={13} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{g.list.map(e => e.name).join(' · ')}</Text>
                {size === 'l' ? (
                  <Text font={11} foregroundStyle={w.s === 'ok' ? th.t2 : statusColor(w)} lineLimit={1}>
                    {g.list.length === 1 ? (w.s === 'cookie' ? '需重抓' : w.msg) : `${g.list.length} 个脚本`}
                  </Text>
                ) : null}
              </VStack>
              <Spacer minLength={0} />
              {size === 'l' && g.list.length === 1 && w.s !== 'ok' ? <ActionPill ctx={ctx} entry={w} /> : null}
            </HStack>
          )
        })}
      </VStack>
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// L 签到小票: 虚线票据, 逐行奖励, 最后合计; 中 3 行, 大 11 行
// ─────────────────────────────────────────────────────────────
function DashLine(props: { color: any }) {
  return <Rectangle frame={{ maxWidth: 'infinity', height: 0.5 }} stroke={{ shapeStyle: props.color, strokeStyle: { lineWidth: 1, dash: [3, 3] } }} />
}

export function ReceiptStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  const ink = th.ink
  const rows = size === 'l' ? 11 : 3
  const font = size === 'l' ? 12 : 11
  const d = new Date(ctx.snap.fetchedAt)
  const c = counts(entries)
  const value = (e: Entry) => (e.s === 'cookie' ? '需重抓' : e.s === 'fail' ? '失败' : firstPart(e.msg) || '已签')
  return (
    <Root ctx={ctx} spacing={0} padding={12}>
      <VStack
        alignment="leading"
        spacing={size === 'l' ? 5 : 3}
        padding={{ horizontal: 12, vertical: size === 'l' ? 12 : 8 }}
        frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
        background={<RoundedRectangle cornerRadius={10} fill={th.paper} />}
      >
        <HStack>
          <Text font={font} fontWeight="bold" fontDesign="monospaced" foregroundStyle={ink}>签到小票</Text>
          <Spacer />
          <Text font={font - 1} fontDesign="monospaced" foregroundStyle={ink} opacity={0.6}>{`${d.getMonth() + 1}/${d.getDate()} ${hhmm(d.getTime())}`}</Text>
        </HStack>
        <DashLine color={ink} />
        {entries.slice(0, rows).map(e => (
          <HStack spacing={4}>
            <Text font={font} fontDesign="monospaced" foregroundStyle={ink} lineLimit={1}>{e.name}</Text>
            <Spacer minLength={4} />
            <Text font={font} fontDesign="monospaced" foregroundStyle={e.s === 'ok' ? ink : statusColor(e)} lineLimit={1}>{value(e)}</Text>
          </HStack>
        ))}
        {size === 'l' && entries.length > rows ? <Text font={font - 1} fontDesign="monospaced" foregroundStyle={ink} opacity={0.6}>{`…另 ${entries.length - rows} 项`}</Text> : null}
        <Spacer minLength={0} />
        <DashLine color={ink} />
        <HStack>
          <Text font={font + 1} fontWeight="bold" fontDesign="monospaced" foregroundStyle={ink}>{`合计 +${rewardTotal(entries)}`}</Text>
          <Spacer />
          <Text font={font} fontDesign="monospaced" foregroundStyle={ink}>{`${c.ok}/${entries.length}`}</Text>
        </HStack>
      </VStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// P 聚光灯: 每次刷新轮换一个脚本的大卡片; 小、中
// ─────────────────────────────────────────────────────────────
function SpotCard(props: { ctx: Ctx; entry: Entry; num: number; fill: boolean }) {
  const { ctx, entry: e } = props
  const { th } = ctx
  const bad = e.s === 'cookie'
  const a = e.asset ? splitAsset(e.asset) : null
  const parts = e.msg.split(' · ')
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={12}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      background={props.fill ? <RoundedRectangle cornerRadius={14} fill={bad ? th.badBg : th.card} /> : undefined}
    >
      <HStack>
        <AppIcon entry={e} size={30} />
        <Spacer />
        <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{parts[1] ?? ''}</Text>
      </HStack>
      <Spacer minLength={4} />
      <Text font={12} foregroundStyle={th.t2} lineLimit={1}>{a?.unit ? `${e.name} · ${a.unit}` : e.name}</Text>
      <Num value={bad ? '需重抓' : e.s === 'fail' ? '失败' : a ? a.num : '已签'} size={props.num} weight="bold" color={e.s === 'fail' ? WARN : bad ? th.badFg : th.t1} />
      <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{`${e.s === 'ok' ? `今日 ${parts[0]}` : e.msg} · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
    </VStack>
  )
}

export function SpotlightStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return empty(ctx)
  const i = ctx.spot % entries.length
  const e = entries[i]
  const next = [...entries.slice(i + 1), ...entries.slice(0, i)]
  if (size === 's') {
    return (
      <Root ctx={ctx} tone={e.s === 'cookie' ? 'bad' : undefined} padding={2} spacing={0}>
        <SpotCard ctx={ctx} entry={e} num={32} fill={false} />
      </Root>
    )
  }
  return (
    <Root ctx={ctx}>
      <HStack spacing={12} frame={{ maxHeight: 'infinity' }}>
        <SpotCard ctx={ctx} entry={e} num={28} fill />
        <VStack alignment="leading" spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
          <Text font={11} foregroundStyle={th.t3}>接下来</Text>
          {next.slice(0, 3).map(x => <EntryRow ctx={ctx} entry={x} icon={20} font={12} />)}
        </VStack>
      </HStack>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// S 签到天气: 全部成功晴, 有失败雨, 需重抓 ≥ 3 雷暴; 小、中
// ─────────────────────────────────────────────────────────────
function weatherOf(list: Entry[]): { sym: string; name: string; color: string } {
  const c = counts(list)
  if (c.cookie >= 3) return { sym: 'cloud.bolt.rain.fill', name: '雷暴', color: '#BF5AF2' }
  if (c.fail > 0) return { sym: 'cloud.rain.fill', name: '雨', color: '#64D2FF' }
  if (c.cookie > 0) return { sym: 'cloud.sun.fill', name: '多云', color: '#FFD60A' }
  return { sym: 'sun.max.fill', name: '晴', color: '#FFD60A' }
}

export function WeatherStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return empty(ctx)
  const w = weatherOf(entries)
  const c = counts(entries)
  const sub = [`${c.ok}/${entries.length} 成功`, c.cookie ? `${c.cookie} 处需重抓` : '', c.fail ? `${c.fail} 处失败` : ''].filter(Boolean).join(' · ')
  const now = (
    <VStack alignment="leading" spacing={2}>
      <Image systemName={w.sym} font={30} foregroundStyle={w.color} />
      <Text font={24} fontWeight="bold" foregroundStyle={th.t1}>{w.name}</Text>
      <Text font={11} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7}>{sub}</Text>
    </VStack>
  )
  const time = <Text font={10} foregroundStyle={th.t3}>{syncText(ctx.snap)}</Text>
  if (size === 's') return <Root ctx={ctx}>{now}<Spacer />{time}</Root>
  const problems = entries.filter(isProblem)
  return (
    <Root ctx={ctx}>
      <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" frame={{ maxHeight: 'infinity', alignment: 'topLeading' }}>
          {now}
          <Spacer minLength={0} />
          {time}
        </VStack>
        <VStack alignment="leading" spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
          <Text font={11} foregroundStyle={th.t3}>预报</Text>
          {(problems.length ? problems : entries).slice(0, 3).map(e => (
            <HStack spacing={6}>
              <Image systemName={e.s === 'cookie' ? 'cloud.bolt.fill' : e.s === 'fail' ? 'cloud.rain.fill' : 'sun.max.fill'} font={13} foregroundStyle={e.s === 'ok' ? '#FFD60A' : statusColor(e)} />
              <Text font={13} foregroundStyle={th.t1} lineLimit={1}>{e.name}</Text>
              <Spacer minLength={2} />
              <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{e.s === 'ok' ? firstPart(e.msg) : e.msg}</Text>
            </HStack>
          ))}
        </VStack>
      </HStack>
    </Root>
  )
}
