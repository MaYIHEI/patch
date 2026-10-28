// checkin / styles/fun.tsx
// D 图标墙 · F 终端日志 · G 时间线 · L 签到小票 · P 聚光灯 · S 签到天气

import { VStack, HStack, ZStack, Text, Spacer, Image, Rectangle, RoundedRectangle } from 'scripting'

import { counts, isProblem, isToday, rewardTotal, splitAsset, brand, timeLabel, type Entry } from '../api'
import {
  Root, Card, AppIcon, Dot, ActionPill, Header, Num, Empty, SegBar,
  syncText, statusColor, hhmm, chunk, OK, BAD, WARN, type Ctx,
} from '../ui'
import { EntryRow } from './basic'

const firstPart = (msg: string) => msg.split(' · ')[0]
const RANK = { cookie: 0, fail: 1, ok: 2, none: 3 }
const worst = (list: Entry[]) => list.reduce((w, e) => (RANK[e.s] < RANK[w.s] ? e : w), list[0])

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
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const problems = entries.filter(isProblem)
  if (size === 's') {
    if (!problems.length) {
      return (
        <Root ctx={ctx} tone="good" spacing={4}>
          <Image systemName="checkmark.seal.fill" font={30} foregroundStyle={OK} />
          <Spacer />
          <Text font={22} fontWeight="bold" foregroundStyle={th.goodFg}>全部正常</Text>
          <Text font={12} foregroundStyle={th.goodFg}>{`${entries.length} 个脚本`}</Text>
        </Root>
      )
    }
    return (
      <Root ctx={ctx} spacing={8}>
        <Header ctx={ctx} title={`${problems.length} 个需要处理`} font={12} />
        <IconGrid ctx={ctx} list={problems} cols={3} rows={3} size={32} gap={8} />
      </Root>
    )
  }
  const right = problems.length ? `${problems.length} 个需要处理` : '全部正常'
  const rightColor = problems.length ? BAD : OK
  if (size === 'm') {
    return (
      <Root ctx={ctx} spacing={10}>
        <Header ctx={ctx} title={`${entries.length} 个脚本`} right={right} rightColor={rightColor} />
        <IconGrid ctx={ctx} list={entries} cols={7} rows={2} size={36} gap={8} />
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={10}>
      <Header ctx={ctx} title={`${entries.length} 个脚本`} right={right} rightColor={rightColor} />
      <SegBar ctx={ctx} height={4} />
      <IconGrid ctx={ctx} list={entries} cols={5} rows={5} size={46} gap={11} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// F 终端日志
// ─────────────────────────────────────────────────────────────
export function TerminalStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  const font = size === 'l' ? 12 : 11
  const rows = size === 'l' ? 15 : size === 'm' ? 5 : 4
  const c = counts(entries)
  const dim = th.color ? 'rgba(235,235,245,0.45)' : th.t3
  const ink = th.color ? '#F2F2F7' : th.t1
  const line = (e: Entry) => {
    const mark = e.s === 'ok' ? '✓' : e.s === 'cookie' ? '✗' : '!'
    const result = e.s === 'cookie' ? 'cookie' : e.s === 'fail' ? e.msg || 'fail' : firstPart(e.msg) || 'ok'
    return (
      <HStack spacing={5}>
        <Text font={font} fontDesign="monospaced" foregroundStyle={statusColor(e)}>{mark}</Text>
        <Text font={font} fontDesign="monospaced" foregroundStyle={ink} lineLimit={1}>{e.name}</Text>
        {isToday(e.t) ? null : <Text font={font - 1} fontDesign="monospaced" foregroundStyle={WARN}>{timeLabel(e.t)}</Text>}
        <Spacer minLength={4} />
        <Text font={font} fontDesign="monospaced" foregroundStyle={e.s === 'ok' ? dim : statusColor(e)} lineLimit={1}>{result}</Text>
      </HStack>
    )
  }
  return (
    <Root ctx={ctx} bg={th.color ? '#05070B' : undefined} spacing={size === 'l' ? 3 : 2}>
      <Text font={font} fontDesign="monospaced" foregroundStyle={dim} lineLimit={1}>{`~ checkin today · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
      {entries.slice(0, rows).map(line)}
      <Spacer minLength={0} />
      <Text font={font} fontDesign="monospaced" foregroundStyle={th.color ? '#64D2FF' : th.t2} lineLimit={1} minScaleFactor={0.7}>
        {size === 's' ? `${c.ok}✓ ${c.cookie}✗ ${c.fail}! ▌` : `${c.ok} ok · ${c.cookie} cookie · ${c.fail} fail ▌`}
      </Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// G 时间线: 按记录时间 (时:分) 分组, 新的在下
// ─────────────────────────────────────────────────────────────
function groupByTime(entries: Entry[]): { label: string; list: Entry[] }[] {
  const sorted = [...entries].sort((a, b) => a.t - b.t)
  const out: { label: string; list: Entry[] }[] = []
  for (const e of sorted) {
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
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const n = size === 'l' ? 9 : size === 'm' ? 4 : 3
  const groups = groupByTime(entries).slice(-n)
  const rowH = size === 'l' ? 32 : size === 'm' ? 23 : 30
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="时间线" right={size === 's' ? undefined : syncText(ctx.snap)} font={size === 's' ? 12 : 13} />
      <VStack spacing={0}>
        {groups.map((g, i) => {
          const w = worst(g.list)
          const names = g.list.map(e => e.name).join(' · ')
          return (
            <HStack spacing={8} frame={{ height: rowH }}>
              <Text font={11} monospacedDigit foregroundStyle={th.t2} lineLimit={1} frame={{ width: size === 's' ? 36 : 70, alignment: 'leading' }}>
                {size === 's' ? g.label.slice(-5) : g.label}
              </Text>
              <ZStack frame={{ width: 10, height: rowH }}>
                <Rectangle fill={th.track} frame={{ width: 1.5, height: i === groups.length - 1 ? rowH / 2 : rowH }} offset={{ x: 0, y: i === groups.length - 1 ? -rowH / 4 : 0 }} />
                <Dot color={statusColor(w)} size={9} />
              </ZStack>
              {size === 's' ? (
                <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{names}</Text>
              ) : (
                <VStack alignment="leading" spacing={0}>
                  <Text font={13} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{names}</Text>
                  {size === 'l' ? (
                    <Text font={11} foregroundStyle={w.s === 'ok' ? th.t2 : statusColor(w)} lineLimit={1}>
                      {g.list.length === 1 ? (w.s === 'cookie' ? '需重抓' : w.msg) : `${g.list.length} 个脚本`}
                    </Text>
                  ) : null}
                </VStack>
              )}
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
// L 签到小票: 虚线票据, 逐行奖励, 最后合计
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
    <Root ctx={ctx} spacing={0} padding={size === 's' ? 10 : 12}>
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
        {entries.length > rows ? <Text font={font - 1} fontDesign="monospaced" foregroundStyle={ink} opacity={0.6}>{`…另 ${entries.length - rows} 项`}</Text> : null}
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
// P 聚光灯: 每次刷新轮换一个脚本的大卡片
// ─────────────────────────────────────────────────────────────
function SpotCard(props: { ctx: Ctx; entry: Entry; num: number }) {
  const { ctx, entry: e } = props
  const { th } = ctx
  const b = brand(e.key)
  const bad = e.s === 'cookie'
  const fill = bad ? th.badBg : th.color ? b.bg : th.card
  const sub = bad ? th.badFg : th.color ? b.fg : th.t2
  const main = bad ? th.badFg : th.color ? '#FFFFFF' : th.t1
  const a = e.asset ? splitAsset(e.asset) : null
  const parts = e.msg.split(' · ')
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={12}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={14} fill={fill} />}
    >
      <HStack>
        <AppIcon entry={e} size={30} />
        <Spacer />
        <Text font={11} foregroundStyle={sub} lineLimit={1}>{parts[1] ?? ''}</Text>
      </HStack>
      <Spacer minLength={4} />
      <Text font={12} foregroundStyle={sub} lineLimit={1}>{a?.unit ? `${e.name} · ${a.unit}` : e.name}</Text>
      <Num value={bad ? '需重抓' : e.s === 'fail' ? '失败' : a ? a.num : '已签'} size={props.num} weight="bold" color={e.s === 'fail' ? WARN : main} />
      <Text font={12} foregroundStyle={sub} lineLimit={1}>{e.s === 'ok' ? `今日 ${parts[0]}` : e.msg}</Text>
    </VStack>
  )
}

export function SpotlightStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const i = ctx.spot % entries.length
  const e = entries[i]
  const next = [...entries.slice(i + 1), ...entries.slice(0, i)]
  if (size === 's') {
    const b = brand(e.key)
    // 小号整张卡就是聚光灯卡
    return (
      <Root ctx={ctx} bg={e.s === 'cookie' ? th.badBg : th.color ? b.bg : undefined} padding={0} spacing={0}>
        <SpotCard ctx={ctx} entry={e} num={34} />
      </Root>
    )
  }
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={12} frame={{ maxHeight: 'infinity' }}>
          <SpotCard ctx={ctx} entry={e} num={30} />
          <VStack alignment="leading" spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
            <Text font={11} foregroundStyle={th.t3}>接下来</Text>
            {next.slice(0, 3).map(x => <EntryRow ctx={ctx} entry={x} icon={20} font={12} />)}
          </VStack>
        </HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={10}>
      <VStack frame={{ height: 170 }}><SpotCard ctx={ctx} entry={e} num={44} /></VStack>
      <VStack spacing={7}>{next.slice(0, 5).map(x => <EntryRow ctx={ctx} entry={x} icon={24} font={13} />)}</VStack>
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// S 签到天气: 全部成功晴, 有失败雨, 需重抓 ≥ 3 雷暴
// ─────────────────────────────────────────────────────────────
function weatherOf(list: Entry[]): { sym: string; name: string; color: string } {
  const c = counts(list)
  if (c.cookie >= 3) return { sym: 'cloud.bolt.rain.fill', name: '雷暴', color: '#BF5AF2' }
  if (c.fail > 0) return { sym: 'cloud.rain.fill', name: '雨', color: '#64D2FF' }
  if (c.cookie > 0) return { sym: 'cloud.sun.fill', name: '多云', color: '#FFD60A' }
  return { sym: 'sun.max.fill', name: '晴', color: '#FFD60A' }
}

function weatherSub(list: Entry[]): string {
  const c = counts(list)
  const bits = [`${c.ok}/${list.length} 成功`]
  if (c.cookie) bits.push(`${c.cookie} 处需重抓`)
  if (c.fail) bits.push(`${c.fail} 处失败`)
  return bits.join(' · ')
}

export function WeatherStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const w = weatherOf(entries)
  const now = (big: number) => (
    <VStack alignment="leading" spacing={2}>
      <Image systemName={w.sym} font={big} foregroundStyle={w.color} />
      <Text font={big * 0.8} fontWeight="bold" foregroundStyle={th.t1}>{w.name}</Text>
      <Text font={11} foregroundStyle={th.t2} lineLimit={2}>{weatherSub(entries)}</Text>
    </VStack>
  )
  const problems = entries.filter(isProblem)
  if (size === 's') return <Root ctx={ctx}>{now(38)}<Spacer /><Text font={11} foregroundStyle={th.t3}>{syncText(ctx.snap)}</Text></Root>
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          {now(34)}
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
  // 大号: 按小时的「逐时预报」
  const hours: { hour: number; list: Entry[] }[] = []
  for (const e of [...entries].filter(x => isToday(x.t)).sort((a, b) => a.t - b.t)) {
    const hour = new Date(e.t).getHours()
    const last = hours[hours.length - 1]
    if (last && last.hour === hour) last.list.push(e)
    else hours.push({ hour, list: [e] })
  }
  return (
    <Root ctx={ctx} spacing={12}>
      <HStack>{now(44)}<Spacer /><Text font={11} foregroundStyle={th.t3}>{syncText(ctx.snap)}</Text></HStack>
      <Card ctx={ctx} padding={{ horizontal: 8, vertical: 8 }}>
        <HStack spacing={0}>
          {hours.slice(-6).map(x => {
            const hw = weatherOf(x.list)
            return (
              <VStack spacing={4} frame={{ maxWidth: 'infinity' }}>
                <Text font={11} foregroundStyle={th.t2}>{`${x.hour}时`}</Text>
                <Image systemName={hw.sym} font={18} foregroundStyle={hw.color} />
                <Text font={12} monospacedDigit foregroundStyle={th.t1}>{String(x.list.length)}</Text>
              </VStack>
            )
          })}
        </HStack>
      </Card>
      <VStack spacing={7}>{problems.slice(0, 4).map(e => <EntryRow ctx={ctx} entry={e} icon={24} sub buttons />)}</VStack>
      <Spacer minLength={0} />
    </Root>
  )
}

