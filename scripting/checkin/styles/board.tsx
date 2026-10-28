// checkin / styles/board.tsx
// O 分类看板 · U 地铁线路 · Y 作者生态墙 · Z 积分气泡

import { VStack, HStack, ZStack, Text, Spacer, Circle, Capsule } from 'scripting'

import { counts, isProblem, isToday, splitAsset, brand, CATEGORIES, type Entry } from '../api'
import { Root, Card, SegBar, Header, Empty, Dot, ActionPill, syncText, statusColor, hhmm, chunk, OK, BAD, WARN, type Ctx } from '../ui'

// ─────────────────────────────────────────────────────────────
// O 分类看板: 每类「完成数 / 总数」
// ─────────────────────────────────────────────────────────────
function byCategory(entries: Entry[]): { cat: string; list: Entry[] }[] {
  return CATEGORIES.map(cat => ({ cat, list: entries.filter(e => e.category === cat) })).filter(g => g.list.length)
}

export function CategoryStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const groups = byCategory(entries)
  if (size === 'm') {
    // 中号放 6 类: 一行「类别 完成/总数」+ 细进度条, 3 列 2 行
    return (
      <Root ctx={ctx} spacing={6}>
        <Header ctx={ctx} title="分类看板" right={syncText(ctx.snap)} font={12} />
        {chunk(groups.slice(0, 6), 3).map(row => (
          <HStack spacing={6}>
            {row.map(g => {
              const c = counts(g.list)
              return (
                <Card ctx={ctx} spacing={3} padding={{ horizontal: 8, vertical: 5 }}>
                  <HStack spacing={3}>
                    <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{g.cat}</Text>
                    <Spacer minLength={0} />
                    <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1}>{`${c.ok}/${g.list.length}`}</Text>
                  </HStack>
                  <SegBar ctx={ctx} entries={g.list} height={3} />
                </Card>
              )
            })}
            {row.length < 3 ? Array(3 - row.length).fill(0).map(() => <VStack frame={{ maxWidth: 'infinity' }} />) : null}
          </HStack>
        ))}
        <Spacer minLength={0} />
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={8}>
      <Header ctx={ctx} title="分类看板" right={syncText(ctx.snap)} />
      {groups.map(g => {
        const c = counts(g.list)
        const problems = g.list.filter(isProblem)
        return (
          <VStack alignment="leading" spacing={3}>
            <HStack>
              <Text font={13} fontWeight="medium" foregroundStyle={th.t1}>{g.cat}</Text>
              <Spacer />
              <Text font={13} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1}>{`${c.ok}/${g.list.length}`}</Text>
            </HStack>
            <SegBar ctx={ctx} entries={g.list} height={4} />
            <Text font={11} foregroundStyle={problems.length ? statusColor(problems[0]) : th.t3} lineLimit={1}>
              {problems.length ? problems.map(e => `${e.name} ${e.s === 'cookie' ? '需重抓' : '失败'}`).join(' · ') : g.list.map(e => e.name).join(' · ')}
            </Text>
          </VStack>
        )
      })}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// U 地铁线路: 今天的签到按时间排成站, 最后一站是「当前站」, 出问题的是故障站
// ─────────────────────────────────────────────────────────────
function Station(props: { ctx: Ctx; entry: Entry; current: boolean; size: number }) {
  const { entry: e, size } = props
  if (e.s !== 'ok') return <Circle fill={statusColor(e)} frame={{ width: size, height: size }} />
  return (
    <Circle
      fill={props.current ? OK : props.ctx.th.card}
      stroke={{ shapeStyle: OK, strokeStyle: { lineWidth: props.current ? 4 : 2.5 } }}
      frame={{ width: size, height: size }}
    />
  )
}

/** 一段横向线路: 底下一条线, 上面等宽排站 */
function Line(props: { ctx: Ctx; list: Entry[]; current?: Entry; size: number }) {
  const { ctx, list, size } = props
  return (
    <ZStack alignment="top">
      <Capsule fill={OK} opacity={0.55} frame={{ maxWidth: 'infinity', height: 4 }} padding={{ top: size / 2 - 2 }} />
      <HStack spacing={0} alignment="top">
        {list.map(e => (
          <VStack spacing={3} frame={{ maxWidth: 'infinity' }}>
            <Station ctx={ctx} entry={e} current={e === props.current} size={size} />
            <Text font={10} foregroundStyle={e.s === 'ok' ? ctx.th.t1 : statusColor(e)} fontWeight={e === props.current ? 'bold' : 'regular'} lineLimit={1} minScaleFactor={0.7}>{e.name}</Text>
            <Text font={9} monospacedDigit foregroundStyle={ctx.th.t3}>{hhmm(e.t)}</Text>
          </VStack>
        ))}
      </HStack>
    </ZStack>
  )
}

export function MetroStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size } = ctx
  const today = ctx.entries.filter(e => isToday(e.t)).sort((a, b) => a.t - b.t)
  if (!today.length) return <Root ctx={ctx}><Empty ctx={ctx} text="今天还没有签到" /></Root>
  const current = today[today.length - 1]
  const faults = today.filter(isProblem)
  const head = (
    <Header ctx={ctx} title={`签到线 · 现在：${current.name}`} right={`${faults.length ? `${faults.length} 个故障站` : '全线正常'} · ${hhmm(ctx.snap.fetchedAt)}`} rightColor={faults.length ? BAD : OK} />
  )
  if (size === 'm') {
    return (
      <Root ctx={ctx} spacing={14}>
        {head}
        <Line ctx={ctx} list={today.slice(-6)} current={current} size={14} />
      </Root>
    )
  }
  const rows = chunk(today.slice(-15), 5)
  return (
    <Root ctx={ctx} spacing={18}>
      {head}
      {rows.map(r => <Line ctx={ctx} list={r} current={current} size={16} />)}
      <Spacer minLength={0} />
      {faults.length ? (
        <VStack spacing={6}>
          {faults.slice(0, 2).map(e => (
            <HStack spacing={8}>
              <Dot color={statusColor(e)} size={8} />
              <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{`${e.name} · ${e.msg}`}</Text>
              <Spacer minLength={4} />
              <ActionPill ctx={ctx} entry={e} />
            </HStack>
          ))}
        </VStack>
      ) : null}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// Y 作者生态墙: 按 author 分组
// ─────────────────────────────────────────────────────────────
function byAuthor(entries: Entry[]): { author: string; list: Entry[] }[] {
  const map = new Map<string, Entry[]>()
  for (const e of entries) {
    const a = e.author || '未署名'
    map.set(a, [...(map.get(a) ?? []), e])
  }
  return [...map.entries()].map(([author, list]) => ({ author, list })).sort((a, b) => b.list.length - a.list.length)
}

function Avatar(props: { name: string; size: number }) {
  const b = brand(props.name)
  return (
    <Text font={props.size * 0.44} fontWeight="semibold" foregroundStyle={b.fg} frame={{ width: props.size, height: props.size }} background={<Circle fill={b.bg} />}>
      {props.name.charAt(0).toUpperCase()}
    </Text>
  )
}

function Dots(props: { list: Entry[]; max: number; size?: number }) {
  return (
    <HStack spacing={3}>
      {props.list.slice(0, props.max).map(e => <Dot color={statusColor(e)} size={props.size ?? 6} />)}
    </HStack>
  )
}

export function AuthorStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const groups = byAuthor(entries)
  const sub = (list: Entry[]) => {
    const bad = list.filter(isProblem).length
    return bad ? `${list.length} 个 · ${bad} 需处理` : `${list.length} 个 · 正常`
  }
  if (size === 'm') {
    return (
      <Root ctx={ctx} spacing={10}>
        <Header ctx={ctx} title={`作者生态 · ${groups.length} 位`} right={`${entries.length} 个脚本 · ${hhmm(ctx.snap.fetchedAt)}`} />
        <HStack spacing={8} frame={{ maxHeight: 'infinity' }}>
          {groups.slice(0, 3).map(g => (
            <Card ctx={ctx} spacing={4}>
              <Avatar name={g.author} size={26} />
              <Text font={12} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{g.author}</Text>
              <Text font={10} foregroundStyle={g.list.some(isProblem) ? BAD : th.t2} lineLimit={1}>{sub(g.list)}</Text>
              <Dots list={g.list} max={8} />
            </Card>
          ))}
          {groups.length < 3 ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
        </HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={12}>
      <Header ctx={ctx} title={`作者生态 · ${groups.length} 位`} right={`${entries.length} 个脚本 · ${hhmm(ctx.snap.fetchedAt)}`} />
      {groups.slice(0, 6).map(g => (
        <HStack spacing={10}>
          <Avatar name={g.author} size={32} />
          <VStack alignment="leading" spacing={2}>
            <HStack spacing={6}>
              <Text font={14} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{g.author}</Text>
              <Text font={11} foregroundStyle={g.list.some(isProblem) ? BAD : th.t2}>{sub(g.list)}</Text>
            </HStack>
            <Text font={11} foregroundStyle={th.t3} lineLimit={1}>{g.list.map(e => e.name).join(' · ')}</Text>
          </VStack>
          <Spacer minLength={4} />
          <Dots list={g.list} max={10} size={7} />
        </HStack>
      ))}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// Z 积分气泡: 按资产数值决定气泡大小
// ─────────────────────────────────────────────────────────────
type Bub = { entry: Entry; num: string; value: number; d: number }

/** 面积按数值, 直径 = sqrt; 太宽时整体缩小 */
function bubbles(entries: Entry[], n: number, minD: number, maxD: number, width: number, perRow: number): Bub[] {
  const list = entries
    .filter(e => e.asset)
    .map(e => ({ entry: e, ...splitAsset(e.asset!) }))
    .filter(x => Number.isFinite(x.value) && x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
  if (!list.length) return []
  const max = Math.sqrt(list[0].value)
  const out = list.map(x => ({ entry: x.entry, num: x.num, value: x.value, d: minD + (maxD - minD) * (Math.sqrt(x.value) / max) }))
  const rowWidth = Math.max(...chunk(out, perRow).map(r => r.reduce((s, b) => s + b.d, 0) + (r.length - 1) * 6))
  const k = rowWidth > width ? width / rowWidth : 1
  return out.map(b => ({ ...b, d: b.d * k }))
}

function Bubble(props: { ctx: Ctx; b: Bub }) {
  const { b } = props
  const br = brand(b.entry.key)
  const bad = b.entry.s === 'cookie'
  return (
    <ZStack frame={{ width: b.d, height: b.d }}>
      <Circle fill={bad ? BAD : br.bg} stroke={b.entry.s === 'fail' ? { shapeStyle: WARN, strokeStyle: { lineWidth: 2 } } : undefined} />
      <VStack spacing={0}>
        <Text font={Math.max(10, b.d * 0.24)} fontWeight="bold" monospacedDigit foregroundStyle="#FFFFFF" lineLimit={1} minScaleFactor={0.5}>{b.num}</Text>
        <Text font={Math.max(8, b.d * 0.12)} foregroundStyle={bad ? '#FFFFFF' : br.fg} lineLimit={1} minScaleFactor={0.6}>{b.entry.name}</Text>
      </VStack>
    </ZStack>
  )
}

export function BubbleStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { size } = ctx
  const conf = size === 'm' ? { n: 5, min: 36, max: 88, w: 290, per: 5 } : { n: 6, min: 54, max: 120, w: 290, per: 3 }
  const list = bubbles(ctx.entries, conf.n, conf.min, conf.max, conf.w, conf.per)
  if (!list.length) return <Root ctx={ctx}><Empty ctx={ctx} text="选中的脚本都没有数字资产" /></Root>
  return (
    <Root ctx={ctx} spacing={10}>
      <Header ctx={ctx} title="积分气泡" right={syncText(ctx.snap)} />
      <VStack spacing={10} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
        {chunk(list, conf.per).map(r => (
          <HStack spacing={6}>{r.map(b => <Bubble ctx={ctx} b={b} />)}</HStack>
        ))}
      </VStack>
    </Root>
  )
}
