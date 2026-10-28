// checkin / styles/history.tsx
// 第 2 批, 用本机历史: C 打卡日历 · H 收益统计 · J 热力图 · K 每日任务 · N 兑换目标 · R 成就徽章 · V 体检评分 · W 环比对比

import { VStack, HStack, ZStack, Text, Spacer, Image, Circle, RoundedRectangle } from 'scripting'

import { counts, isToday, reward, rewardTotal, splitAsset, type Entry } from '../api'
import {
  byDate, dayStats, streak, noFailRun, rewardOn, totalReward, lastDays, dailyGain, todayStr, shiftDay, type Day,
} from '../history'
import { Root, Card, Header, Num, Empty, Bar, HistEmpty, AppIcon, signed, round, chunk, OK, BAD, WARN, type Ctx } from '../ui'

const okShade = (rate: number) => `rgba(48,209,88,${(0.25 + 0.75 * rate).toFixed(2)})`
const monthOf = (d: string) => d.slice(0, 7)
const daysInMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate()

/** 满足 pred 的最长连续天数 (按日历天, 缺一天就断) */
function bestRun(days: Day[], pred: (d: Day | undefined) => boolean): number {
  const map = byDate(days)
  let best = 0
  for (const day of days) {
    if (!pred(day) || pred(map.get(shiftDay(day.d, -1)))) continue   // 只从一段的第一天开始数
    let n = 0, d = day.d
    while (pred(map.get(d))) { n++; d = shiftDay(d, 1) }
    best = Math.max(best, n)
  }
  return best
}

// ─────────────────────────────────────────────────────────────
// C 打卡日历: 当月格子, 颜色深浅 = 当天成功率; 标题连签天数
// ─────────────────────────────────────────────────────────────
function monthCells(): (string | null)[] {
  const t = todayStr()
  const first = `${monthOf(t)}-01`
  const lead = (new Date(Date.parse(`${first}T00:00:00Z`)).getUTCDay() + 6) % 7   // 周一开头
  const n = daysInMonth(t)
  return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => shiftDay(first, i))]
}

export function CalendarStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, hist, keys } = ctx
  if (!hist.length) return <HistEmpty ctx={ctx} need={1} title="打卡日历" icon="calendar" />
  const map = byDate(hist)
  const t = todayStr()
  const run = streak(hist, keys)
  const cells = monthCells()
  const monthDays = hist.filter(d => monthOf(d.d) === monthOf(t))
  const full = monthDays.filter(d => { const s = dayStats(d, keys); return s.total > 0 && s.ok === s.total }).length
  const avg = monthDays.length ? monthDays.reduce((n, d) => n + dayStats(d, keys).rate, 0) / monthDays.length : 0
  const cell = size === 'l' ? 36 : size === 'm' ? 15 : 12
  const gap = size === 'l' ? 6 : 3
  const Cell = (d: string | null) => {
    if (!d) return <VStack frame={{ width: cell, height: size === 'l' ? 32 : cell }} />
    const st = dayStats(map.get(d), keys)
    const fill = d > t ? 'rgba(0,0,0,0)' : st.total ? okShade(st.rate) : th.track
    return (
      <ZStack frame={{ width: cell, height: size === 'l' ? 32 : cell }}>
        <RoundedRectangle cornerRadius={size === 'l' ? 8 : 3} fill={fill}
          stroke={d === t ? { shapeStyle: th.t1, strokeStyle: { lineWidth: 1.5 } } : d > t ? { shapeStyle: th.track, strokeStyle: { lineWidth: 1 } } : undefined} />
        {size === 'l' ? <Text font={11} monospacedDigit foregroundStyle={st.rate > 0.6 ? '#FFFFFF' : th.t2}>{String(Number(d.slice(8)))}</Text> : null}
      </ZStack>
    )
  }
  const grid = (
    <VStack alignment="leading" spacing={gap}>
      {size === 'l' ? (
        <HStack spacing={gap}>{['一', '二', '三', '四', '五', '六', '日'].map(w => <Text font={11} foregroundStyle={th.t3} frame={{ width: cell }}>{w}</Text>)}</HStack>
      ) : null}
      {chunk(cells, 7).map(row => <HStack spacing={gap}>{row.map(Cell)}</HStack>)}
    </VStack>
  )
  const month = `${Number(t.slice(5, 7))}月`
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={6}>
        <Header ctx={ctx} title={`连签 ${run} 天`} right={month} font={12} />
        {grid}
      </Root>
    )
  }
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
            <Text font={12} foregroundStyle={th.t2}>{`${month} · 连签`}</Text>
            <HStack spacing={2} alignment="lastTextBaseline">
              <Num value={run} size={36} weight="bold" color={run ? OK : th.t1} />
              <Text font={13} foregroundStyle={th.t2}>天</Text>
            </HStack>
            <Spacer minLength={0} />
            <Text font={11} foregroundStyle={th.t2}>{`本月全勤 ${full} 天`}</Text>
            <Text font={11} foregroundStyle={th.t2}>{`平均成功率 ${Math.round(avg * 100)}%`}</Text>
          </VStack>
          {grid}
        </HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={10}>
      <HStack alignment="lastTextBaseline">
        <Text font={15} fontWeight="semibold" foregroundStyle={th.t1}>{`${month}打卡`}</Text>
        <Spacer />
        <Text font={13} fontWeight="semibold" foregroundStyle={run ? OK : th.t2}>{`连签 ${run} 天`}</Text>
      </HStack>
      {grid}
      <Spacer minLength={0} />
      <Text font={11} foregroundStyle={th.t2}>{`本月全勤 ${full} 天 · 平均成功率 ${Math.round(avg * 100)}% · 已记录 ${hist.length} 天`}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// H 收益统计: 本月累计奖励 + 柱状图
// ─────────────────────────────────────────────────────────────
function Bars(props: { ctx: Ctx; days: string[]; height: number; labels?: boolean }) {
  const { ctx, days } = props
  const values = days.map(d => rewardOn(ctx.hist, d, ctx.keys))
  const max = Math.max(1, ...values)
  const t = todayStr()
  return (
    <HStack alignment="bottom" spacing={days.length > 14 ? 2 : 5} frame={{ maxWidth: 'infinity', height: props.height + (props.labels ? 14 : 0) }}>
      {days.map((d, i) => (
        <VStack spacing={2} frame={{ maxWidth: 'infinity' }}>
          <Spacer minLength={0} />
          <RoundedRectangle cornerRadius={2} fill={d === t ? OK : 'rgba(48,209,88,0.45)'} frame={{ height: Math.max(2, (values[i] / max) * props.height) }} />
          {props.labels ? (
            <Text font={9} foregroundStyle={ctx.th.t3} lineLimit={1}>{days.length > 14 ? (i % 5 === 4 || d === t ? String(Number(d.slice(8))) : ' ') : ['日', '一', '二', '三', '四', '五', '六'][new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay()]}</Text>
          ) : null}
        </VStack>
      ))}
    </HStack>
  )
}

function monthReward(ctx: Ctx): number {
  const m = monthOf(todayStr())
  return ctx.hist.filter(d => monthOf(d.d) === m).reduce((n, d) => n + dayStats(d, ctx.keys).reward, 0)
}

export function EarningsStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, hist } = ctx
  if (hist.length < 2) return <HistEmpty ctx={ctx} need={2} title="收益统计" icon="chart.bar.fill" />
  const month = round(monthReward(ctx))
  const today = round(rewardOn(hist, todayStr(), ctx.keys))
  const week = lastDays(7)
  const avg = round(week.reduce((n, d) => n + rewardOn(hist, d, ctx.keys), 0) / 7)
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={2}>
        <Text font={12} foregroundStyle={th.t2}>本月收益</Text>
        <Num value={`+${month}`} size={28} weight="bold" color={th.t1} />
        <Text font={11} foregroundStyle={th.t2}>{`今日 +${today}`}</Text>
        <Spacer minLength={4} />
        <Bars ctx={ctx} days={week} height={36} />
      </Root>
    )
  }
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack alignment="leading" spacing={3} frame={{ width: 110, maxHeight: 'infinity', alignment: 'topLeading' }}>
            <Text font={12} foregroundStyle={th.t2}>本月收益</Text>
            <Num value={`+${month}`} size={28} weight="bold" color={th.t1} />
            <Spacer minLength={0} />
            <Text font={11} foregroundStyle={th.t2}>{`今日 +${today}`}</Text>
            <Text font={11} foregroundStyle={th.t2}>{`近 7 天日均 +${avg}`}</Text>
          </VStack>
          <Bars ctx={ctx} days={week} height={90} labels />
        </HStack>
      </Root>
    )
  }
  // 大号: 30 天 + 本月贡献最多的脚本
  const m = monthOf(todayStr())
  const per = new Map<string, number>()
  for (const d of hist.filter(x => monthOf(x.d) === m)) {
    for (const [k, it] of Object.entries(d.items)) if (ctx.keys.has(k) && it.s === 'ok') per.set(k, (per.get(k) ?? 0) + it.r)
  }
  const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const nameOf = (k: string) => ctx.entries.find(e => e.key === k)
  return (
    <Root ctx={ctx} spacing={12}>
      <Header ctx={ctx} title="收益统计" right="近 30 天" />
      <HStack spacing={18}>
        <Stat ctx={ctx} label="本月" value={`+${month}`} />
        <Stat ctx={ctx} label="今日" value={`+${today}`} />
        <Stat ctx={ctx} label="日均" value={`+${avg}`} />
      </HStack>
      <Bars ctx={ctx} days={lastDays(30)} height={110} labels />
      <VStack spacing={6}>
        {top.map(([k, v]) => {
          const e = nameOf(k)
          return (
            <HStack spacing={8}>
              {e ? <AppIcon entry={e} size={20} /> : null}
              <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{e?.name ?? k}</Text>
              <Spacer />
              <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1}>{`+${round(v)}`}</Text>
            </HStack>
          )
        })}
      </VStack>
      <Spacer minLength={0} />
    </Root>
  )
}

function Stat(props: { ctx: Ctx; label: string; value: string }) {
  return (
    <VStack alignment="leading" spacing={1}>
      <Text font={11} foregroundStyle={props.ctx.th.t2}>{props.label}</Text>
      <Num value={props.value} size={20} weight="bold" color={props.ctx.th.t1} />
    </VStack>
  )
}

// ─────────────────────────────────────────────────────────────
// J 热力图: 每个脚本一行, 每天一格
// ─────────────────────────────────────────────────────────────
export function HeatmapStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, hist, entries } = ctx
  if (hist.length < 3) return <HistEmpty ctx={ctx} need={3} title="热力图" icon="square.grid.4x3.fill" />
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const conf = size === 'l' ? { n: 21, rows: 11, cell: 9, gap: 2, name: 64 } : size === 'm' ? { n: 14, rows: 4, cell: 14, gap: 3, name: 56 } : { n: 7, rows: 4, cell: 10, gap: 2, name: 38 }
  const days = lastDays(conf.n)
  const map = byDate(hist)
  const bad = (k: string) => days.filter(d => { const s = map.get(d)?.items[k]?.s; return s === 'cookie' || s === 'fail' }).length
  const rows = [...entries].map(e => ({ e, bad: bad(e.key) })).sort((a, b) => b.bad - a.bad).slice(0, conf.rows)
  const color = (s?: string) => (s === 'ok' ? OK : s === 'cookie' ? BAD : s === 'fail' ? WARN : th.track)
  const worst = rows[0]
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 6 : 4}>
      <Header ctx={ctx} title={size === 's' ? '热力图' : `热力图 · 近 ${conf.n} 天`} font={size === 's' ? 12 : 13}
        right={size === 'l' && worst?.bad ? `老出问题: ${worst.e.name}` : undefined} rightColor={BAD} />
      {rows.map(r => (
        <HStack spacing={4}>
          <Text font={size === 'l' ? 11 : 10} foregroundStyle={th.t1} lineLimit={1} frame={{ width: conf.name, alignment: 'leading' }}>{r.e.name}</Text>
          <HStack spacing={conf.gap}>
            {days.map(d => <RoundedRectangle cornerRadius={2} fill={color(map.get(d)?.items[r.e.key]?.s)} frame={{ width: conf.cell, height: conf.cell }} />)}
          </HStack>
          {size === 'l' ? <Text font={10} monospacedDigit foregroundStyle={r.bad ? BAD : th.t3}>{r.bad ? `${r.bad}次` : ''}</Text> : null}
        </HStack>
      ))}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// K 每日任务: 等级经验 (成功一次 +10, 全勤日再 +20) + 任务列表
// ─────────────────────────────────────────────────────────────
function xpOf(day: Day, keys: Set<string>): number {
  const s = dayStats(day, keys)
  return s.ok * 10 + (s.total > 0 && s.ok === s.total ? 20 : 0)
}

function level(xp: number): { lv: number; cur: number; need: number } {
  let lv = 1, need = 100
  while (xp >= need) { xp -= need; lv++; need += 50 }
  return { lv, cur: xp, need }
}

export function QuestStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, hist, entries, keys } = ctx
  if (!hist.length) return <HistEmpty ctx={ctx} need={1} title="每日任务" icon="gamecontroller.fill" />
  const total = hist.reduce((n, d) => n + xpOf(d, keys), 0)
  const L = level(total)
  const todayDay = byDate(hist).get(todayStr())
  const gain = todayDay ? xpOf(todayDay, keys) : 0
  const c = counts(entries)
  const run = streak(hist, keys)
  const tasks = [
    { title: `今日签到 ${c.ok}/${entries.length}`, done: c.ok === entries.length && entries.length > 0, p: entries.length ? c.ok / entries.length : 0 },
    { title: c.cookie ? `修复需重抓 ${c.cookie} 个` : '凭证全部有效', done: c.cookie === 0, p: c.cookie ? 0 : 1 },
    { title: `连签 7 天 (${Math.min(run, 7)}/7)`, done: run >= 7, p: Math.min(run, 7) / 7 },
  ]
  const Task = (x: typeof tasks[0], bar: boolean) => (
    <VStack alignment="leading" spacing={3}>
      <HStack spacing={6}>
        <Image systemName={x.done ? 'checkmark.circle.fill' : 'circle'} font={size === 's' ? 11 : 14} foregroundStyle={x.done ? OK : th.t3} />
        <Text font={size === 's' ? 11 : 13} foregroundStyle={x.done ? th.t2 : th.t1} lineLimit={1}>{x.title}</Text>
      </HStack>
      {bar ? <Bar ctx={ctx} value={x.p} color={x.done ? OK : '#64D2FF'} height={4} /> : null}
    </VStack>
  )
  const lvBlock = (big: number) => (
    <VStack alignment="leading" spacing={4}>
      <HStack spacing={4} alignment="lastTextBaseline">
        <Text font={big} fontWeight="bold" fontDesign="rounded" foregroundStyle={th.t1}>{`Lv.${L.lv}`}</Text>
        <Text font={11} foregroundStyle={OK}>{`今日 +${gain}`}</Text>
      </HStack>
      <Bar ctx={ctx} value={L.cur / L.need} color="#BF5AF2" height={6} />
      <Text font={10} monospacedDigit foregroundStyle={th.t3}>{`${L.cur} / ${L.need} 经验`}</Text>
    </VStack>
  )
  if (size === 's') return <Root ctx={ctx} spacing={7}>{lvBlock(22)}{tasks.map(x => Task(x, false))}</Root>
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={14} frame={{ maxHeight: 'infinity' }}>
          <VStack frame={{ width: 120 }}>{lvBlock(28)}</VStack>
          <VStack alignment="leading" spacing={8} frame={{ maxWidth: 'infinity' }}>{tasks.map(x => Task(x, false))}</VStack>
        </HStack>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={12}>
      <Card ctx={ctx} padding={12}>{lvBlock(30)}</Card>
      <Text font={12} foregroundStyle={th.t2}>今日任务</Text>
      <VStack spacing={10}>{tasks.map(x => Task(x, true))}</VStack>
      <Spacer minLength={0} />
      <Text font={12} foregroundStyle={th.t2}>最近经验</Text>
      {hist.slice(-4).reverse().map(d => (
        <HStack>
          <Text font={11} monospacedDigit foregroundStyle={th.t2}>{d.d.slice(5)}</Text>
          <Spacer />
          <Text font={11} monospacedDigit foregroundStyle={th.t1}>{`+${xpOf(d, keys)}`}</Text>
        </HStack>
      ))}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// N 兑换目标: 进度条 + 按近 7 天日均估算还要几天
// ─────────────────────────────────────────────────────────────
/** 735 → 800, 212 → 300, 1234 → 2000 */
export function autoGoal(v: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))))
  return (Math.floor(v / mag) + 1) * mag
}

type Goal = { e: Entry; v: number; num: string; unit: string; goal: number; auto: boolean; eta: string }

export function goalsOf(ctx: Ctx): Goal[] {
  const goals = ctx.preset.goals ?? {}
  const list = ctx.entries
    .filter(e => e.asset)
    .map(e => ({ e, ...splitAsset(e.asset!) }))
    .filter(x => Number.isFinite(x.value))
    .map(x => {
      const set = goals[x.e.key]
      const goal = set ?? autoGoal(x.value)
      const gain = dailyGain(ctx.hist, x.e.key)
      const eta = x.value >= goal ? '可兑换' : gain === undefined ? '记录不足' : gain <= 0 ? '近期没涨' : `约 ${Math.ceil((goal - x.value) / gain)} 天`
      return { e: x.e, v: x.value, num: x.num, unit: x.unit, goal, auto: set === undefined, eta }
    })
  return list.sort((a, b) => Number(a.auto) - Number(b.auto))
}

export function GoalStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size } = ctx
  const list = goalsOf(ctx)
  if (!list.length) return <Root ctx={ctx}><Empty ctx={ctx} text="选中的脚本都没有数字资产" /></Root>
  const Row = (g: Goal, font: number) => (
    <VStack alignment="leading" spacing={3}>
      <HStack spacing={5}>
        <Text font={font} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{g.e.name}</Text>
        {g.auto ? <Text font={9} foregroundStyle={th.t3}>自动</Text> : null}
        <Spacer minLength={2} />
        <Text font={font - 1} monospacedDigit foregroundStyle={th.t2} lineLimit={1}>{`${g.num} / ${g.goal}`}</Text>
      </HStack>
      <Bar ctx={ctx} value={g.v / g.goal} color={g.v >= g.goal ? OK : '#64D2FF'} height={5} />
      <Text font={10} foregroundStyle={g.v >= g.goal ? OK : th.t3} lineLimit={1}>
        {g.v >= g.goal ? '可兑换' : `还差 ${round(g.goal - g.v)}${g.unit ? ` ${g.unit}` : ''} · ${g.eta}`}
      </Text>
    </VStack>
  )
  if (size === 's') {
    const g = list[0]
    return (
      <Root ctx={ctx} spacing={4}>
        <Header ctx={ctx} title="兑换目标" font={12} />
        <Spacer minLength={0} />
        <Text font={12} foregroundStyle={th.t2} lineLimit={1}>{`${g.e.name} · ${g.unit}`}</Text>
        <Num value={`${Math.min(100, Math.floor((g.v / g.goal) * 100))}%`} size={32} weight="bold" color={th.t1} />
        <Bar ctx={ctx} value={g.v / g.goal} color={g.v >= g.goal ? OK : '#64D2FF'} height={6} />
        <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{g.v >= g.goal ? '可兑换' : `${g.num}/${g.goal} · ${g.eta}`}</Text>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 12 : 7}>
      <Header ctx={ctx} title="兑换目标" right={size === 'l' ? '按近 7 天日均估算' : undefined} />
      {list.slice(0, size === 'l' ? 6 : 3).map(g => Row(g, size === 'l' ? 13 : 12))}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// R 成就徽章
// ─────────────────────────────────────────────────────────────
type Badge = { name: string; icon: string; color: string; cur: number; target: number; unit: string }

function badgesOf(ctx: Ctx): Badge[] {
  const { hist, keys } = ctx
  const ok = (d: Day | undefined) => { const s = dayStats(d, keys); return s.total > 0 && s.ok === s.total }
  const noFail = (d: Day | undefined) => { const s = dayStats(d, keys); return s.total > 0 && s.fail === 0 }
  const best = Math.max(bestRun(hist, ok), streak(hist, keys))
  const bestClean = Math.max(bestRun(hist, noFail), noFailRun(hist, keys))
  const t = todayStr()
  const monthRun = (() => { let n = 0, d = `${monthOf(t)}-01`; const m = byDate(hist); while (d <= t && ok(m.get(d))) { n++; d = shiftDay(d, 1) } return n })()
  const pastFullMonth = [...new Set(hist.map(d => monthOf(d.d)))].some(m => m < monthOf(t) && hist.filter(d => monthOf(d.d) === m && ok(d)).length === daysInMonth(`${m}-01`))
  return [
    { name: '初次签到', icon: 'sparkles', color: '#64D2FF', cur: hist.length ? 1 : 0, target: 1, unit: '天' },
    { name: '连签 7 天', icon: 'flame.fill', color: '#FF9F0A', cur: best, target: 7, unit: '天' },
    { name: '零失败周', icon: 'shield.fill', color: OK, cur: bestClean, target: 7, unit: '天' },
    { name: '累计千分', icon: 'star.fill', color: '#FFD60A', cur: round(totalReward(hist, keys)), target: 1000, unit: '分' },
    { name: '连签 30 天', icon: 'flame.fill', color: BAD, cur: best, target: 30, unit: '天' },
    { name: '全勤月', icon: 'calendar.badge.checkmark', color: '#BF5AF2', cur: pastFullMonth ? daysInMonth(t) : monthRun, target: daysInMonth(t), unit: '天' },
    { name: '连签 100 天', icon: 'crown.fill', color: '#FFD60A', cur: best, target: 100, unit: '天' },
  ]
}

function BadgeIcon(props: { ctx: Ctx; b: Badge; size: number }) {
  const { b, size } = props
  const on = b.cur >= b.target
  return (
    <ZStack frame={{ width: size, height: size }}>
      <Circle fill={on ? b.color : props.ctx.th.track} />
      <Image systemName={b.icon} font={size * 0.45} foregroundStyle={on ? '#FFFFFF' : props.ctx.th.t3} />
    </ZStack>
  )
}

export function BadgeStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, hist } = ctx
  if (!hist.length) return <HistEmpty ctx={ctx} need={1} title="成就徽章" icon="rosette" />
  const all = badgesOf(ctx)
  const got = all.filter(b => b.cur >= b.target)
  const locked = all.filter(b => b.cur < b.target)
  const next = locked.sort((a, b) => b.cur / b.target - a.cur / a.target)[0]
  const hint = next ? `下一个: ${next.name}, 还差 ${round(next.target - next.cur)} ${next.unit}` : '全部解锁'
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={4}>
        <Header ctx={ctx} title={`成就 ${got.length}/${all.length}`} font={12} />
        <Spacer minLength={0} />
        {next ? <BadgeIcon ctx={ctx} b={next} size={48} /> : null}
        <Text font={13} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>{next ? next.name : '全部解锁'}</Text>
        {next ? <Bar ctx={ctx} value={next.cur / next.target} color={next.color} height={4} /> : null}
        <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{next ? `还差 ${round(next.target - next.cur)} ${next.unit}` : ' '}</Text>
      </Root>
    )
  }
  const shown = size === 'm' ? [...got, ...locked].slice(0, 5) : all
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 14 : 10}>
      <Header ctx={ctx} title={`成就徽章 · ${got.length}/${all.length}`} />
      {chunk(shown, size === 'l' ? 4 : 5).map(row => (
        <HStack spacing={0}>
          {row.map(b => (
            <VStack spacing={4} frame={{ maxWidth: 'infinity' }}>
              <BadgeIcon ctx={ctx} b={b} size={size === 'l' ? 52 : 42} />
              <Text font={10} foregroundStyle={b.cur >= b.target ? th.t1 : th.t3} lineLimit={1} minScaleFactor={0.7}>{b.name}</Text>
              {size === 'l' && b.cur < b.target ? <Text font={9} monospacedDigit foregroundStyle={th.t3}>{`${b.cur}/${b.target}`}</Text> : null}
            </VStack>
          ))}
          {size === 'l' && row.length < 4 ? Array(4 - row.length).fill(0).map(() => <VStack frame={{ maxWidth: 'infinity' }} />) : null}
        </HStack>
      ))}
      <Spacer minLength={0} />
      <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{hint}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// V 体检评分: 100 分起扣 (需重抓 -8, 失败 -5, 过时未签 -3)
// ─────────────────────────────────────────────────────────────
const COST = { cookie: 8, fail: 5, stale: 3 }

function scoreOf(entries: Entry[]) {
  const c = counts(entries)
  const stale = entries.filter(e => e.s === 'ok' && !isToday(e.t)).length
  const total = entries.length || 1
  return {
    score: Math.max(0, 100 - c.cookie * COST.cookie - c.fail * COST.fail - stale * COST.stale),
    subs: [
      { name: '成功率', v: c.ok / total },
      { name: '凭证', v: 1 - c.cookie / total },
      { name: '准时', v: entries.filter(e => isToday(e.t)).length / total },
    ],
  }
}

function yesterdayScore(ctx: Ctx): number | undefined {
  const day = byDate(ctx.hist).get(shiftDay(todayStr(), -1))
  if (!day) return undefined
  const s = dayStats(day, ctx.keys)
  return s.total ? Math.max(0, 100 - s.cookie * COST.cookie - s.fail * COST.fail) : undefined
}

const scoreColor = (n: number) => (n >= 90 ? OK : n >= 70 ? WARN : BAD)
const grade = (n: number) => (n >= 90 ? '健康' : n >= 70 ? '亚健康' : '需要关注')

export function HealthStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const { score, subs } = scoreOf(entries)
  const y = yesterdayScore(ctx)
  const delta = y === undefined ? '首次体检' : `比昨天 ${signed(score - y)}`
  const col = scoreColor(score)
  const subRows = (font: number) => subs.map(s => (
    <VStack alignment="leading" spacing={2}>
      <HStack>
        <Text font={font} foregroundStyle={th.t2}>{s.name}</Text>
        <Spacer />
        <Text font={font} monospacedDigit foregroundStyle={th.t1}>{`${Math.round(s.v * 100)}`}</Text>
      </HStack>
      <Bar ctx={ctx} value={s.v} color={scoreColor(s.v * 100)} height={4} />
    </VStack>
  ))
  const ring = (d: number, line: number, font: number) => (
    <ZStack frame={{ width: d + line, height: d + line }}>
      <Circle stroke={{ shapeStyle: th.track, strokeStyle: { lineWidth: line } }} frame={{ width: d, height: d }} />
      <Circle trim={{ from: 0, to: score / 100 }} stroke={{ shapeStyle: col, strokeStyle: { lineWidth: line, lineCap: 'round' } }} rotationEffect={-90} frame={{ width: d, height: d }} />
      <VStack spacing={0}>
        <Num value={score} size={font} weight="bold" color={col} />
        <Text font={10} foregroundStyle={th.t2}>{grade(score)}</Text>
      </VStack>
    </ZStack>
  )
  if (size === 's') {
    return (
      <Root ctx={ctx} spacing={4}>
        <Header ctx={ctx} title="签到体检" font={12} />
        <Spacer minLength={0} />
        <HStack><Spacer />{ring(84, 9, 28)}<Spacer /></HStack>
        <Spacer minLength={0} />
        <HStack><Spacer /><Text font={11} foregroundStyle={th.t2}>{delta}</Text><Spacer /></HStack>
      </Root>
    )
  }
  if (size === 'm') {
    return (
      <Root ctx={ctx}>
        <HStack spacing={16} frame={{ maxHeight: 'infinity' }}>
          <VStack spacing={4}>{ring(88, 10, 28)}<Text font={11} foregroundStyle={th.t2}>{delta}</Text></VStack>
          <VStack spacing={8} frame={{ maxWidth: 'infinity' }}>{subRows(12)}</VStack>
        </HStack>
      </Root>
    )
  }
  const deductions = entries.flatMap(e => e.s === 'cookie' ? [{ e, why: '需重抓', n: COST.cookie }]
    : e.s === 'fail' ? [{ e, why: '失败', n: COST.fail }]
    : !isToday(e.t) ? [{ e, why: '今天还没签', n: COST.stale }] : [])
  return (
    <Root ctx={ctx} spacing={12}>
      <HStack spacing={18}>
        {ring(100, 11, 32)}
        <VStack alignment="leading" spacing={8} frame={{ maxWidth: 'infinity' }}>
          <Text font={12} foregroundStyle={th.t2}>{delta}</Text>
          {subRows(12)}
        </VStack>
      </HStack>
      <Text font={12} foregroundStyle={th.t2}>{deductions.length ? '扣分项' : '没有扣分项'}</Text>
      {deductions.slice(0, 6).map(x => (
        <HStack spacing={8}>
          <AppIcon entry={x.e} size={20} />
          <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{x.e.name}</Text>
          <Text font={11} foregroundStyle={th.t3}>{x.why}</Text>
          <Spacer />
          <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={BAD}>{`-${x.n}`}</Text>
        </HStack>
      ))}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// W 环比对比: 今天 vs 昨天, 本周 vs 上周 (同样天数)
// ─────────────────────────────────────────────────────────────
function compareData(ctx: Ctx) {
  const t = todayStr()
  const sum = (from: string, n: number) => Array.from({ length: n }, (_, i) => rewardOn(ctx.hist, shiftDay(from, i), ctx.keys)).reduce((a, b) => a + b, 0)
  const dow = (new Date(Date.parse(`${t}T00:00:00Z`)).getUTCDay() + 6) % 7   // 周一 = 0
  const monday = shiftDay(t, -dow)
  return {
    // 今天的奖励直接从当前结果算, 和其他样式的「今日 +N」一致
    today: rewardTotal(ctx.entries),
    yesterday: rewardOn(ctx.hist, shiftDay(t, -1), ctx.keys),
    week: sum(monday, dow) + rewardTotal(ctx.entries),
    lastWeek: sum(shiftDay(monday, -7), dow + 1),
  }
}

function Compare(props: { ctx: Ctx; label: string; a: number; b: number; aName: string; bName: string }) {
  const { ctx, a, b } = props
  const max = Math.max(a, b, 1)
  const d = a - b
  return (
    <VStack alignment="leading" spacing={4}>
      <HStack>
        <Text font={12} foregroundStyle={ctx.th.t2}>{props.label}</Text>
        <Spacer />
        <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={d > 0 ? OK : d < 0 ? BAD : ctx.th.t2}>{`${signed(d)} ${d > 0 ? '↑' : d < 0 ? '↓' : ''}`}</Text>
      </HStack>
      <HStack spacing={6}>
        <Text font={10} foregroundStyle={ctx.th.t2} frame={{ width: 28, alignment: 'leading' }}>{props.aName}</Text>
        <Bar ctx={ctx} value={a / max} color={OK} height={8} />
        <Text font={10} monospacedDigit foregroundStyle={ctx.th.t1} frame={{ width: 40, alignment: 'trailing' }}>{`+${round(a)}`}</Text>
      </HStack>
      <HStack spacing={6}>
        <Text font={10} foregroundStyle={ctx.th.t2} frame={{ width: 28, alignment: 'leading' }}>{props.bName}</Text>
        <Bar ctx={ctx} value={b / max} color="#8E8E93" height={8} />
        <Text font={10} monospacedDigit foregroundStyle={ctx.th.t2} frame={{ width: 40, alignment: 'trailing' }}>{`+${round(b)}`}</Text>
      </HStack>
    </VStack>
  )
}

export function CompareStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, hist, keys } = ctx
  if (hist.length < 2) return <HistEmpty ctx={ctx} need={2} title="环比对比" icon="arrow.left.arrow.right" />
  const x = compareData(ctx)
  if (size === 's') {
    const d = x.today - x.yesterday
    return (
      <Root ctx={ctx} spacing={2}>
        <Text font={12} foregroundStyle={th.t2}>今日奖励</Text>
        <Num value={`+${round(x.today)}`} size={30} weight="bold" color={th.t1} />
        <Text font={12} fontWeight="semibold" foregroundStyle={d > 0 ? OK : d < 0 ? BAD : th.t2}>{`比昨天 ${signed(d)}`}</Text>
        <Spacer minLength={0} />
        <Text font={11} foregroundStyle={th.t2}>{`本周 +${round(x.week)}`}</Text>
        <Text font={11} foregroundStyle={th.t2}>{`比上周 ${signed(x.week - x.lastWeek)}`}</Text>
      </Root>
    )
  }
  const rows = (
    <VStack spacing={size === 'l' ? 14 : 10}>
      <Compare ctx={ctx} label="今天比昨天" a={x.today} b={x.yesterday} aName="今天" bName="昨天" />
      <Compare ctx={ctx} label="本周比上周" a={x.week} b={x.lastWeek} aName="本周" bName="上周" />
    </VStack>
  )
  if (size === 'm') return <Root ctx={ctx} spacing={8}>{rows}</Root>
  // 大号: 各脚本今天比昨天的变化
  const yDay = byDate(hist).get(shiftDay(todayStr(), -1))
  const changes = ctx.entries
    .filter(e => keys.has(e.key))
    .map(e => ({ e, d: reward(e) - (yDay?.items[e.key]?.s === 'ok' ? yDay.items[e.key].r : 0) }))
    .filter(x => x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 6)
  return (
    <Root ctx={ctx} spacing={12}>
      <Header ctx={ctx} title="环比对比" />
      {rows}
      <Text font={12} foregroundStyle={th.t2}>{changes.length ? '变化最大' : '各脚本和昨天持平'}</Text>
      {changes.map(c => (
        <HStack spacing={8}>
          <AppIcon entry={c.e} size={20} />
          <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{c.e.name}</Text>
          <Spacer />
          <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={c.d > 0 ? OK : BAD}>{signed(c.d)}</Text>
        </HStack>
      ))}
      <Spacer minLength={0} />
    </Root>
  )
}
