// loon-panel / styles/net.tsx
// 网络类: 解锁 (小 / 中) · 模式开关 · IP 质量 · 网络安全 · 延迟排行 · 控制台 · 策略组卡片 · 事件时间线 · 三网延迟 ·
//         节点全景 · 线路体检报告 · 锁屏 (圆形延迟 / 圆形今日 / 长条三网)

import { VStack, HStack, ZStack, Text, Spacer, Image, Button, Link, Capsule, Rectangle, RoundedRectangle, Gauge, AccessoryWidgetBackground } from 'scripting'
import type { Color } from 'scripting'

import {
  MODES, groupPage, pickerView, focusOf, pathTo, isAuto, mainGroup, rankedNodes, healthCount, availability, unlockNode, latestDeep, loonStatus, modeName,
  type Deep, type Group, type Isp,
} from '../loon'
import { fmtBytes, md, type SubView } from '../subs'
import { ModeIntent, SwitchIntent, CheckIntent, FastestIntent, TurnGroupsIntent, NextPickGroupIntent, TurnPickPageIntent, EnterPickIntent, LeavePickIntent, OpenPickIntent, ClosePickIntent, readNote, readPending } from '../app_intents'
import { mainGroupLeaf, checkText } from './node'
import {
  Root, Header, Num, Empty, Cell, Dot, Pill, Spark, Uptime, RefreshButton, Bar, usageColor, latencyColor, latencyInk, latencyText, nodeLabel, asnText, flag, ago, hhmm,
  mediaColor, mediaWord, chunk, withAlpha, OK, BAD, WARN, type Ctx, type Paint,
} from '../ui'

const NO_LOON = '读不到 Loon 数据\n打开 App 看排查步骤'
const NO_DEEP = '还没做过深度检测\n在 App 的策略组页里点「深度检测」'
const ISP: Record<Isp, string> = { ct: '电信', cu: '联通', cm: '移动' }

function NoLoon(props: { ctx: Ctx; title: string }) {
  return <Root ctx={props.ctx}><Header ctx={props.ctx} title={props.title} font={12} /><Empty ctx={props.ctx} icon="bolt.horizontal.circle" text={NO_LOON} /></Root>
}

/** 小组件里是按钮, App 预览里只是样子 */
export function Tap(props: { ctx: Ctx; intent: any; children?: any }) {
  if (props.ctx.inApp || !props.intent) return props.children
  return <Button intent={props.intent} buttonStyle="plain">{props.children}</Button>
}

/** 翻页: ‹ 1/3 ›, 只有一页时不显示 */
function Pager(props: { ctx: Ctx; page: number; pages: number; turn: (step: number) => any }) {
  const { ctx, page, pages, turn } = props
  const { th } = ctx
  if (pages < 2) return null
  const arrow = (icon: string, step: number) => (
    <Tap ctx={ctx} intent={turn(step)}>
      <Image systemName={icon} font={11} fontWeight="semibold" foregroundStyle={th.accent} padding={{ horizontal: 5, vertical: 2 }} />
    </Tap>
  )
  return (
    <HStack spacing={0}>
      {arrow('chevron.left', -1)}
      <Text font={11} monospacedDigit foregroundStyle={th.accent} lineLimit={1} frame={{ minWidth: 28 }}>{`${page + 1}/${pages}`}</Text>
      {arrow('chevron.right', 1)}
    </HStack>
  )
}

export function PageButton(props: { ctx: Ctx; page: number; pages: number }) {
  return <Pager {...props} turn={step => TurnGroupsIntent({ step })} />
}

/** 宽度等分的块状按钮 */
function Block(props: { ctx: Ctx; on?: boolean; icon?: string; text: string; font?: number }) {
  const { th } = props.ctx
  return (
    <HStack spacing={4} padding={{ vertical: 7 }} frame={{ maxWidth: 'infinity' }} background={<RoundedRectangle cornerRadius={11} fill={props.on ? th.accent : th.card} />}>
      {props.icon ? <Image systemName={props.icon} font={11} fontWeight="semibold" foregroundStyle={props.on ? '#FFFFFF' : th.t2} /> : null}
      <Text font={props.font ?? 12} fontWeight="semibold" foregroundStyle={props.on ? '#FFFFFF' : th.t1} lineLimit={1} minScaleFactor={0.7}>{props.text}</Text>
    </HStack>
  )
}

function Status(props: { ctx: Ctx }) {
  const s = loonStatus(props.ctx.loon)
  const color = s.level === 'ok' ? OK : s.level === 'warn' ? WARN : BAD
  return (
    <HStack spacing={4}>
      <Dot color={color} size={6} />
      <Text font={10} foregroundStyle={color} lineLimit={1}>{s.text}</Text>
    </HStack>
  )
}

// ─────────────────────────────────────────────────────────────
// 解锁: 小号 2 列, 中号 3 列
// ─────────────────────────────────────────────────────────────
function MediaGrid(props: { ctx: Ctx; cols: number; title: string }) {
  const { ctx, cols } = props
  const { th } = ctx
  if (!ctx.loon) return <NoLoon ctx={ctx} title={props.title} />
  const u = unlockNode(ctx.loon, ctx.prefs)
  const list = (u?.list ?? []).slice(0, 6)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title={props.title} font={12} right={cols === 3 && u ? `${nodeLabel(u.node, ctx.loon.nodes[u.node])}` : u?.group} />
      {list.length ? (
        <VStack spacing={4} frame={{ maxHeight: 'infinity', alignment: 'top' }}>
          {chunk(list, cols).map(row => (
            <HStack spacing={4}>
              {row.map(m => (
                <VStack alignment="leading" spacing={0} padding={{ horizontal: 6, vertical: 4 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={8} fill={th.card} />}>
                  <Text font={11} foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.7}>{m.name}</Text>
                  <Text font={10} fontWeight="medium" foregroundStyle={mediaColor(m)} lineLimit={1} minScaleFactor={0.7}>{mediaWord(m)}</Text>
                </VStack>
              ))}
              {row.length < cols ? Array.from({ length: cols - row.length }, () => <VStack frame={{ maxWidth: 'infinity' }} />) : null}
            </HStack>
          ))}
        </VStack>
      ) : <Empty ctx={ctx} icon="lock.open" text="还没有解锁结果, 下次体检会自动测" />}
      {u?.t && cols === 2 ? <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`${ago(u.t)} 检测`}</Text> : null}
    </Root>
  )
}
export const UnlockSmall = (p: { ctx: Ctx }) => <MediaGrid ctx={p.ctx} cols={2} title="解锁" />
export const UnlockMedium = (p: { ctx: Ctx }) => <MediaGrid ctx={p.ctx} cols={3} title="流媒体与 AI" />

// ─────────────────────────────────────────────────────────────
// 模式开关 (小)
// ─────────────────────────────────────────────────────────────
export function ModeStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const leaf = mainGroupLeaf(ctx)
  const cur = ctx.loon?.mode ?? -1
  return (
    <Root ctx={ctx} spacing={5}>
      <Header ctx={ctx} title="Loon" font={12} />
      {MODES.map(m => (
        <Tap ctx={ctx} intent={ctx.loon && !ctx.loon.stale && m.id !== cur ? ModeIntent({ mode: m.id }) : undefined}>
          <Block ctx={ctx} on={m.id === cur} icon={m.icon} text={m.id === cur && leaf?.r?.ok ? `${m.short} · ${leaf.r.ms}ms` : m.name} />
        </Tap>
      ))}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// IP 质量 (小): 多来源原样显示, 不自己打分
// ─────────────────────────────────────────────────────────────
/** 类型: 各来源里最多的那个 */
export function ipTags(d: Deep): { text: string; color: Color }[] {
  const tags: { text: string; color: Color }[] = []
  const types = (d.types ?? []).map(t => t.type.toLowerCase())
  if (types.length) {
    const home = types.filter(t => /isp|residential|home|住宅|家宽/.test(t)).length
    tags.push(home * 2 >= types.length ? { text: '住宅', color: OK } : { text: '机房', color: WARN })
  }
  const flagged = (d.factors ?? []).filter(f => f.proxy || f.vpn || f.tor).length
  if (d.factors?.length) tags.push(flagged ? { text: `${flagged}/${d.factors.length} 源标代理`, color: WARN } : { text: '未标代理', color: OK })
  if (d.regions) tags.push(d.regions.mismatch?.length ? { text: `${d.regions.mismatch.length} 项地区不一致`, color: WARN } : { text: '地区一致', color: OK })
  return tags
}

export function IpStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  if (!ctx.loon) return <NoLoon ctx={ctx} title="出口 IP" />
  const hit = latestDeep(ctx.loon, ctx.prefs)
  const leaf = mainGroupLeaf(ctx)
  const ip = hit?.data.basic?.ip ?? leaf?.r?.ip
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title="出口 IP" font={12} right={flag(hit?.data.basic?.cc ?? leaf?.r?.cc)} />
      <Text font={13} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.6}>{ip ?? '未知'}</Text>
      <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{asnText(leaf?.r) || hit?.data.basic?.org || ''}</Text>
      {hit ? (
        <VStack alignment="leading" spacing={3}>
          {ipTags(hit.data).slice(0, 3).map(t => <Pill text={t.text} fg={t.color} bg={withAlpha(t.color, 0.16)} font={10} />)}
        </VStack>
      ) : <Text font={10} foregroundStyle={th.t3}>{NO_DEEP}</Text>}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 网络安全 (小): NAT / DNS 泄漏 / 黑名单
// ─────────────────────────────────────────────────────────────
export function SafetyStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const d = ctx.loon ? latestDeep(ctx.loon, ctx.prefs)?.data : undefined
  const nat = ctx.nat
  const leakCC = d?.dnsleak?.servers.map(s => s.cc).filter(Boolean) ?? []
  const exit = d?.basic?.cc
  const rows: { name: string; text: string; color: Color }[] = [
    { name: 'NAT', text: nat ? nat.text : '未测', color: !nat ? '#8E8E93' : nat.type === 'blocked' ? BAD : nat.type === 'symmetric' ? WARN : OK },
    { name: 'DNS', text: !d?.dnsleak ? '未测' : leakCC.includes('CN') && exit !== 'CN' ? '疑似泄漏' : '未见泄漏', color: !d?.dnsleak ? '#8E8E93' : leakCC.includes('CN') && exit !== 'CN' ? BAD : OK },
    { name: '黑名单', text: !d?.dnsbl ? '未测' : d.dnsbl.listed.length ? `命中 ${d.dnsbl.listed.length}/${d.dnsbl.checked}` : `${d.dnsbl.checked} 家未命中`, color: !d?.dnsbl ? '#8E8E93' : d.dnsbl.listed.length ? WARN : OK },
  ]
  return (
    <Root ctx={ctx} spacing={7}>
      <Header ctx={ctx} title="网络安全" font={12} />
      {rows.map(r => (
        <HStack spacing={6}>
          <Dot color={r.color} size={8} />
          <Text font={12} foregroundStyle={th.t1}>{r.name}</Text>
          <Spacer minLength={2} />
          <Text font={10} foregroundStyle={r.color} lineLimit={1} minScaleFactor={0.7}>{r.text}</Text>
        </HStack>
      ))}
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>在 App 深度检测里更新</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 延迟排行 (中): 点一行切到这个节点所在的策略组
// ─────────────────────────────────────────────────────────────
export function RankStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="最快节点" />
  const list = rankedNodes(loon).filter(x => x.r.ok).sort((a, b) => a.r.ms - b.r.ms).slice(0, 5)
  if (!list.length) return <Root ctx={ctx}><Header ctx={ctx} title="最快节点" /><Empty ctx={ctx} icon="stethoscope" text="还没有体检结果" /></Root>
  const max = Math.max(...list.map(x => x.r.ms))
  const main = mainGroup(loon, ctx.prefs)
  return (
    <Root ctx={ctx} spacing={5}>
      <Header ctx={ctx} title="最快节点" right={`${checkText(ctx)}`} />
      {list.map((x, i) => {
        // 从主策略组一层层走到这个节点; 走不到就切第一个含它的组
        const owner = loon.groups.find(y => y.subs.includes(x.name) && y.now !== x.name)
        const hops = pathTo(loon, main?.name ?? '', x.name) ?? (owner ? [{ group: owner.name, node: x.name }] : [])
        const end = hops[hops.length - 1]
        const moved = hops.some(h => loon.groups.find(y => y.name === h.group)?.now !== h.node)
        return (
          <Tap ctx={ctx} intent={end && moved && !loon.stale ? SwitchIntent({ group: end.group, node: end.node, via: JSON.stringify(hops.slice(0, -1)) }) : undefined}>
            <HStack spacing={6}>
              <Text font={10} monospacedDigit foregroundStyle={th.t3} frame={{ width: 10 }}>{String(i + 1)}</Text>
              <Text font={12} fontWeight={x.current ? 'semibold' : 'regular'} foregroundStyle={th.t1} lineLimit={1}>{nodeLabel(x.name, x.r)}</Text>
              <Spacer minLength={4} />
              <Capsule fill={latencyColor(x.r)} frame={{ width: Math.max(4, (x.r.ms / max) * 70), height: 4 }} />
              <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={latencyInk(ctx, x.r)} frame={{ width: 46, alignment: 'trailing' }}>{latencyText(x.r)}</Text>
            </HStack>
          </Tap>
        )
      })}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 控制台 (中)
// ─────────────────────────────────────────────────────────────
export function ConsoleStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  const leaf = mainGroupLeaf(ctx)
  const cur = loon?.mode ?? -1
  const live = !!loon && !loon.stale
  const note = ctx.inApp ? null : readNote()
  const update = <Block ctx={ctx} icon="arrow.down.circle" text="更新订阅" font={11} />
  return (
    <Root ctx={ctx} spacing={6}>
      <HStack spacing={6}>
        <Image systemName="slider.horizontal.3" font={12} fontWeight="semibold" foregroundStyle={th.accent} />
        <Status ctx={ctx} />
        <Spacer minLength={4} />
        <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{leaf ? `${leaf.name} ${latencyText(leaf.r)}` : ''}</Text>
        <RefreshButton ctx={ctx} />
      </HStack>
      <HStack spacing={6}>
        {MODES.map(m => (
          <Tap ctx={ctx} intent={live && m.id !== cur ? ModeIntent({ mode: m.id }) : undefined}><Block ctx={ctx} on={m.id === cur} text={m.short} /></Tap>
        ))}
      </HStack>
      <HStack spacing={6}>
        <Tap ctx={ctx} intent={live ? FastestIntent(undefined) : undefined}><Block ctx={ctx} icon="bolt.fill" text="切最快" font={11} /></Tap>
        <Tap ctx={ctx} intent={live ? CheckIntent(undefined) : undefined}><Block ctx={ctx} icon="stethoscope" text="体检" font={11} /></Tap>
        {ctx.inApp ? update : <Link url="loon://update?sub=all">{update}</Link>}
      </HStack>
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={note ? (note.ok ? OK : BAD) : th.t3} lineLimit={1}>{note ? note.text : loon?.check ? `上次体检 ${ago(loon.check.t)}` : ''}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 策略组卡片 (中)
// ─────────────────────────────────────────────────────────────
/** 切换器顶部: 这个组正在用的节点; full 时带柱状图和出口 */
function PickerNow(props: { ctx: Ctx; group: Group; full: boolean }) {
  const { ctx, group: g, full } = props
  const { th } = ctx
  const r = ctx.loon!.nodes[g.leaf]
  return (
    <VStack alignment="leading" spacing={6} padding={{ horizontal: 12, vertical: full ? 10 : 6 }} frame={full ? { maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' } : { maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={12} style="continuous" fill={th.card} />}>
      <HStack spacing={6}>
        <Text font={11} foregroundStyle={th.t3}>正在用</Text>
        <Text font={12} foregroundStyle={th.t1} lineLimit={1}>{nodeLabel(g.leaf, r)}</Text>
        <Spacer minLength={2} />
        {full ? <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.7}>{r?.ip ? asnText(r) || r.ip : ''}</Text> : <Num value={latencyText(r)} size={16} color={latencyInk(ctx, r)} />}
      </HStack>
      {full ? <Num value={latencyText(r)} size={40} color={latencyInk(ctx, r)} /> : null}
      {full ? <Spacer minLength={0} /> : null}
      {full && r?.h?.length ? <Spark ctx={ctx} h={r.h} height={64} count={24} tone={th.accent} /> : null}
    </VStack>
  )
}

/** 切换器: 常用策略组里的一个组, 点节点直接切, 点策略组进下一层; 右上角换组、翻页 */
export function PickerStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="切换器" />
  const open = ctx.inApp ? '' : focusOf(ctx.size)
  const { group: g, via, nodes, total, page, pages, groups } = pickerView(loon, ctx.prefs, ctx.size === 'l' ? 15 : 6, open)
  if (!g) return <NoLoon ctx={ctx} title="切换器" />
  // 上面是当前节点, 下面是选项; 选项少时卡片定高, 多时撑满, 翻页时卡片大小不变
  const few = total <= (ctx.size === 'l' ? 6 : 3)
  const cols = total === 4 ? 2 : 3
  const rows = chunk(nodes, cols)
  const blank = pages > 1 ? (ctx.size === 'l' ? 5 : 2) - rows.length : 0
  const last = via[0]   // 点进了下层策略组: 列的是它下面的节点, 选了要从上层一路切过去
  const linked = !last || loon.groups.find(x => x.name === last.group)?.now === last.node
  const cell = (name: string) => {
    const sub = last ? undefined : loon.groups.find(x => x.name === name)   // 选项可能是另一个策略组, 看它正在用的节点
    const r = loon.nodes[sub?.leaf ?? name]
    const on = last ? linked && g.leaf === name : name === g.now
    // 已经指着的层不用再切, 按网络切换的组也切不动
    const full = last ? [...via, ...(pathTo(loon, g.name, name) ?? [])] : [{ group: g.name, node: name }]
    const end = full[full.length - 1]
    const route = full.filter(h => h === end || loon.groups.find(x => x.name === h.group)?.now !== h.node)
    const going = !ctx.inApp && readPending()?.group === end.group && readPending()?.node === name
    return (
      <Tap ctx={ctx} intent={sub && !isAuto(name) ? EnterPickIntent({ name }) : !on && !loon.stale ? SwitchIntent({ group: end.group, node: end.node, via: JSON.stringify(route.slice(0, -1)) }) : undefined}>
        <VStack alignment="leading" spacing={2} padding={{ horizontal: 10, vertical: 4 }} frame={few ? { maxWidth: 'infinity', minHeight: 50, maxHeight: 50, alignment: 'leading' } : { maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={12} style="continuous" fill={on ? th.accent : th.card} />}>
          <Text font={11} foregroundStyle={on ? '#FFFFFF' : th.t2} lineLimit={1} minScaleFactor={0.7}>{sub ? (isAuto(name) ? name : `${name} ›`) : nodeLabel(name, r)}</Text>
          <Text font={14} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={on ? '#FFFFFF' : r ? latencyInk(ctx, r) : th.t3} lineLimit={1} minScaleFactor={0.7}>{going ? '切换中' : name === 'DIRECT' ? '直连' : latencyText(r)}</Text>
        </VStack>
      </Tap>
    )
  }
  return (
    <Root ctx={ctx} spacing={5}>
      <Header
        ctx={ctx}
        title={g.name}
        trailing={(
          <HStack spacing={8}>
            {last ? <Tap ctx={ctx} intent={LeavePickIntent(undefined)}><Text font={11} foregroundStyle={th.accent} lineLimit={1}>返回</Text></Tap> : null}
            {last && !linked && !loon.stale ? <Tap ctx={ctx} intent={SwitchIntent({ group: last.group, node: last.node })}><Text font={11} fontWeight="semibold" foregroundStyle={th.accent} lineLimit={1}>用这组</Text></Tap> : null}
            {!last && open ? <Tap ctx={ctx} intent={ClosePickIntent(undefined)}><Text font={11} foregroundStyle={th.accent} lineLimit={1}>返回</Text></Tap> : null}
            {!last && !open && groups > 1 ? <Tap ctx={ctx} intent={NextPickGroupIntent(undefined)}><Text font={11} foregroundStyle={th.accent} lineLimit={1}>换组</Text></Tap> : null}
            <Pager ctx={ctx} page={page} pages={pages} turn={step => TurnPickPageIntent({ step })} />
          </HStack>
        )}
      />
      {few || ctx.size === 'l' ? <PickerNow ctx={ctx} group={g} full={few && ctx.size === 'l'} /> : null}
      {rows.map(row => (
        <HStack spacing={5} frame={few ? { maxWidth: 'infinity' } : { maxWidth: 'infinity', maxHeight: 'infinity' }}>
          {row.map(cell)}
        </HStack>
      ))}
      {Array.from({ length: Math.max(0, blank) }, () => <VStack frame={{ maxHeight: 'infinity' }} />)}
    </Root>
  )
}

/** 一个策略组: 组名、延迟、当前节点; 点一下进切换器选节点 */
export function GroupCell(props: { ctx: Ctx; g: Group }) {
  const { ctx, g } = props
  const { th } = ctx
  const loon = ctx.loon!
  const r = g.gone ? undefined : loon.nodes[g.leaf]
  const going = ctx.inApp ? null : readPending()
  return (
    <Tap ctx={ctx} intent={g.subs.length && !isAuto(g.name) && !loon.stale ? OpenPickIntent({ group: g.name, owner: ctx.size }) : undefined}>
      <Cell ctx={ctx}>
        <HStack spacing={3}>
          <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{g.name}</Text>
          {loon.locks?.[g.name] ? <Image systemName="lock.fill" font={8} foregroundStyle={th.t3} /> : null}
        </HStack>
        <Text font={15} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={latencyInk(ctx, r)} lineLimit={1}>{latencyText(r)}</Text>
        <Text font={10} foregroundStyle={going?.group === g.name ? th.accent : g.gone ? WARN : th.t3} lineLimit={1} minScaleFactor={0.85}>{going?.group === g.name ? `切换到 ${going.node}` : g.gone ? '节点已失效' : nodeLabel(g.leaf, r)}</Text>
      </Cell>
    </Tap>
  )
}

/** 当前节点的可用率和全部节点里能用的个数 */
function healthText(ctx: Ctx): string {
  const a = availability(mainGroupLeaf(ctx)?.r)
  const c = ctx.loon ? healthCount(ctx.loon) : null
  return [a === null ? '' : `可用 ${Math.round(a * 100)}%`, c?.total ? `${c.ok}/${c.total} 节点` : ''].filter(Boolean).join(' · ')
}

/** 今天用了多少和到期 / 重置日 */
const subLine = (s: SubView) => [`今天 ${fmtBytes(s.today)}`, s.deadline ? `${md(s.deadline)} ${s.deadlineWord}` : ''].filter(Boolean).join(' · ')

/** 右上角的模式按钮: 点一下换到下一个模式 */
function ModeTap(props: { ctx: Ctx }) {
  const { ctx } = props
  const loon = ctx.loon!
  const mode = MODES.find(m => m.id === loon.mode)
  return (
    <Tap ctx={ctx} intent={!loon.stale && loon.mode >= 0 ? ModeIntent({ mode: (loon.mode + 1) % 3 }) : undefined}>
      <HStack spacing={3} padding={{ horizontal: 7, vertical: 3 }} background={<Capsule fill={withAlpha(ctx.th.accent, 0.16)} />}>
        {mode ? <Image systemName={mode.icon} font={9} fontWeight="semibold" foregroundStyle={ctx.th.accent} /> : null}
        <Text font={10} fontWeight="semibold" foregroundStyle={ctx.th.accent} lineLimit={1}>{mode?.short ?? modeName(loon.mode)}</Text>
      </HStack>
    </Tap>
  )
}

function Metric(props: { ctx: Ctx; value: string; label: string; color?: Paint }) {
  const { th } = props.ctx
  return (
    <VStack alignment="leading" spacing={0} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <Num value={props.value} size={15} color={props.color ?? th.t1} />
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{props.label}</Text>
    </VStack>
  )
}

/** 小号总览: 有机场时剩余流量是主角, 没有时当前节点是主角 */
export function OverviewSmall(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="总览" />
  const s = ctx.subs[0]
  const u = s?.usage
  const leaf = mainGroupLeaf(ctx)
  const a = availability(leaf?.r)
  const c = healthCount(loon)
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title={s?.name ?? leaf?.group ?? 'Loon'} font={12} trailing={<ModeTap ctx={ctx} />} />
      {u ? (
        <VStack alignment="leading" spacing={3} padding={{ top: 4 }}>
          <HStack alignment="lastTextBaseline" spacing={4}>
            <Num value={fmtBytes(u.total > 0 ? s.remain : s.used)} size={26} />
            <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{u.total > 0 ? `/ ${fmtBytes(u.total)}` : '已用'}</Text>
          </HStack>
          {u.total > 0 ? <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={4} /> : null}
          <Text font={11} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.8}>{subLine(s)}</Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={2} padding={{ top: 8 }}>
          <Text font={17} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.6}>{leaf ? nodeLabel(leaf.name, leaf.r) : '-'}</Text>
          <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.8}>{leaf?.r?.org ?? ''}</Text>
        </VStack>
      )}
      <Spacer minLength={0} />
      {u ? (
        <HStack spacing={4}>
          <Text font={11} foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.8}>{leaf ? nodeLabel(leaf.name, leaf.r) : '-'}</Text>
          <Spacer minLength={2} />
          <Text font={11} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={latencyInk(ctx, leaf?.r)} lineLimit={1}>{latencyText(leaf?.r)}</Text>
        </HStack>
      ) : (
        <HStack spacing={4}>
          <Metric ctx={ctx} value={leaf?.r?.ok ? String(leaf.r.ms) : latencyText(leaf?.r)} label="延迟" color={latencyInk(ctx, leaf?.r)} />
          <Metric ctx={ctx} value={a === null ? '-' : `${Math.round(a * 100)}%`} label="可用" />
          <Metric ctx={ctx} value={`${c.ok}`} label="节点" />
        </HStack>
      )}
    </Root>
  )
}

/** 总览: 左边一个主角, 右边常用策略组; 右上角点一下换模式 */
export function OverviewStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="总览" />
  if (!ctx.inApp && focusOf(ctx.size)) return <PickerStyle ctx={ctx} />
  const { list: groups, page, pages } = groupPage(loon, ctx.prefs, 4)
  const s = ctx.subs[0]
  const u = s?.usage
  const leaf = mainGroupLeaf(ctx)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="总览" trailing={<HStack spacing={6}><PageButton ctx={ctx} page={page} pages={pages} /><ModeTap ctx={ctx} /></HStack>} />
      <HStack spacing={10} alignment="top" frame={{ maxHeight: 'infinity' }}>
        <VStack alignment="leading" spacing={3} frame={{ minWidth: 104, maxWidth: 104, maxHeight: 'infinity', alignment: 'topLeading' }}>
          <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{u ? (u.total > 0 ? `${s.name} 剩余` : `${s.name} 已用`) : leaf?.group ?? '当前节点'}</Text>
          <Num value={u ? fmtBytes(u.total > 0 ? s.remain : s.used) : latencyText(leaf?.r)} size={24} color={u ? th.t1 : latencyInk(ctx, leaf?.r)} />
          {u && u.total > 0 ? <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={4} /> : null}
          {u ? <Text font={10} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.8}>{subLine(s)}</Text> : <Text font={11} foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.75}>{leaf ? nodeLabel(leaf.name, leaf.r) : ''}</Text>}
          <Spacer minLength={0} />
          {u ? <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.75}>{leaf ? `${nodeLabel(leaf.name, leaf.r)} ${latencyText(leaf.r)}` : ''}</Text> : <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.75}>{healthText(ctx)}</Text>}
        </VStack>
        <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
          {chunk(groups, 2).map(row => (
            <HStack spacing={6}>
              {row.map(g => <GroupCell ctx={ctx} g={g} />)}
              {row.length < 2 ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
            </HStack>
          ))}
        </VStack>
      </HStack>
    </Root>
  )
}

export function GroupsStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="策略组" />
  if (!ctx.inApp && focusOf(ctx.size)) return <PickerStyle ctx={ctx} />
  const { list: groups, page, pages } = groupPage(loon, ctx.prefs, 4)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="策略组" trailing={<HStack spacing={6}><PageButton ctx={ctx} page={page} pages={pages} /><ModeTap ctx={ctx} /></HStack>} />
      {chunk(groups, 2).map(row => (
        <HStack spacing={6}>
          {row.map(g => <GroupCell ctx={ctx} g={g} />)}
          {row.length < 2 ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
        </HStack>
      ))}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 事件时间线 (中)
// ─────────────────────────────────────────────────────────────
const eventColor = (k: string) => (k === 'fail' ? BAD : k === 'switch' || k === 'lock' || k === 'usage' ? WARN : OK)

export function EventsStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const list = ctx.events.slice(0, 5)
  return (
    <Root ctx={ctx} spacing={5}>
      <Header ctx={ctx} title="发生了什么" right={ctx.events.length ? `${ctx.events.length} 件` : undefined} />
      {list.length ? list.map(e => (
        <HStack spacing={6}>
          <Text font={10} monospacedDigit foregroundStyle={th.t3} frame={{ width: 34, alignment: 'leading' }}>{hhmm(e.t)}</Text>
          <Dot color={eventColor(e.k)} size={6} />
          <Text font={11} foregroundStyle={th.t1} lineLimit={1}>{e.msg}</Text>
        </HStack>
      )) : <Empty ctx={ctx} icon="checkmark.seal" text="一切正常, 暂时没有事件" />}
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 三网延迟 (中) / 节点全景 / 线路体检报告 (大)
// ─────────────────────────────────────────────────────────────
const pingColor = (avg?: number, loss?: number) => (avg === undefined ? '#8E8E93' : (loss ?? 0) >= 5 || avg >= 200 ? BAD : avg >= 100 ? WARN : OK)

function PingCards(props: { ctx: Ctx; d: Deep }) {
  const { ctx, d } = props
  const { th } = ctx
  return (
    <HStack spacing={6}>
      {(['ct', 'cu', 'cm'] as Isp[]).map(isp => {
        const p = d.ping?.find(x => x.isp === isp)
        const way = d.inbound?.find(x => x.isp === isp)
        return (
          <Cell ctx={ctx}>
            <Text font={11} foregroundStyle={th.t2}>{ISP[isp]}</Text>
            <Num value={p?.avg !== undefined ? `${Math.round(p.avg)}ms` : '-'} size={17} color={pingColor(p?.avg, p?.loss) === OK ? th.t1 : pingColor(p?.avg, p?.loss)} />
            <Text font={10} monospacedDigit foregroundStyle={th.t3} lineLimit={1}>{p ? `丢包 ${p.loss ?? 0}%` : ' '}</Text>
            {way?.summary ? <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.7}>{way.summary}</Text> : null}
          </Cell>
        )
      })}
    </HStack>
  )
}

export function PingStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  if (!ctx.loon) return <NoLoon ctx={ctx} title="三网延迟" />
  const hit = latestDeep(ctx.loon, ctx.prefs)
  if (!hit?.data.ping) return <Root ctx={ctx}><Header ctx={ctx} title="三网延迟" /><Empty ctx={ctx} icon="point.3.connected.trianglepath.dotted" text={NO_DEEP} /></Root>
  return (
    <Root ctx={ctx} spacing={7}>
      <Header ctx={ctx} title="三网延迟" right={`${ago(hit.data.t)} 检测`} />
      <PingCards ctx={ctx} d={hit.data} />
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`外部探针到 ${nodeLabel(hit.node, ctx.loon.nodes[hit.node])} 出口`}</Text>
    </Root>
  )
}

export function NodesStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="节点全景" />
  const c = healthCount(loon)
  const list = rankedNodes(loon).slice(0, 8)
  const u = unlockNode(loon, ctx.prefs)
  const leaf = mainGroupLeaf(ctx)
  const deep = latestDeep(loon, ctx.prefs)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="节点全景" font={14} right={`${c.ok}/${c.total} 可用 · ${checkText(ctx)}`} />
      {list.length ? list.map(x => {
        const a = availability(x.r)
        return (
          <HStack spacing={6}>
            <Text font={11} fontWeight={x.current ? 'semibold' : 'regular'} foregroundStyle={th.t1} lineLimit={1} frame={{ width: 104, alignment: 'leading' }}>{nodeLabel(x.name, x.r)}</Text>
            <Uptime h={x.r.h} />
            <Text font={10} monospacedDigit foregroundStyle={th.t3} frame={{ width: 30, alignment: 'trailing' }}>{a === null ? '' : `${Math.round(a * 100)}%`}</Text>
            <Text font={11} fontWeight="semibold" monospacedDigit foregroundStyle={latencyInk(ctx, x.r)} frame={{ width: 38, alignment: 'trailing' }}>{x.r.ok ? String(x.r.ms) : '超时'}</Text>
          </HStack>
        )
      }) : <Empty ctx={ctx} icon="stethoscope" text="还没有体检结果" />}
      <Spacer minLength={0} />
      {u?.list.length ? (
        <HStack spacing={5}>
          {u.list.slice(0, 6).map(m => <Text font={10} fontWeight="medium" foregroundStyle={mediaColor(m)} lineLimit={1} minScaleFactor={0.7}>{m.name}</Text>)}
        </HStack>
      ) : null}
      <Text font={10} foregroundStyle={th.t2} lineLimit={1} padding={{ horizontal: 10, vertical: 5 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={10} style="continuous" fill={th.card} />}>
        {[leaf?.r?.cc ? `出口 ${flag(leaf.r.cc)} ${leaf.r.org ?? ''}` : '', loon.direct?.org ? `直连 ${loon.direct.org}` : '', deep?.data.speed?.down ? `带宽 ${Math.round(deep.data.speed.down)}Mbps` : ''].filter(Boolean).join(' · ')}
      </Text>
    </Root>
  )
}

function Line(props: { ctx: Ctx; label: string; text: string; color?: any }) {
  const { th } = props.ctx
  return (
    <HStack spacing={6}>
      <Text font={11} foregroundStyle={th.t3} frame={{ width: 44, alignment: 'leading' }}>{props.label}</Text>
      <Text font={11} foregroundStyle={props.color ?? th.t1} lineLimit={1} minScaleFactor={0.7}>{props.text}</Text>
      <Spacer minLength={0} />
    </HStack>
  )
}

export function ReportStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="线路体检报告" />
  const hit = latestDeep(loon, ctx.prefs)
  if (!hit) return <Root ctx={ctx}><Header ctx={ctx} title="线路体检报告" font={14} /><Empty ctx={ctx} icon="doc.text.magnifyingglass" text={NO_DEEP} /></Root>
  const d = hit.data
  const way = (d.backhaul ?? []).map(b => `${ISP[b.isp]} ${b.summary ?? ''}`.trim()).join(' · ')
  const media = (d.media ?? []).filter(m => m.status === 'yes').map(m => m.name)
  const stab = d.stability?.length ? d.stability.reduce((a, s) => ({ ok: a.ok + s.ok, total: a.total + s.total }), { ok: 0, total: 0 }) : null
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="线路体检报告" font={14} right={`${ago(d.t)} 检测`} />
      <Text font={13} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>{nodeLabel(hit.node, loon.nodes[hit.node])}</Text>
      <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{[d.basic?.ip, d.basic?.asn ? `AS${d.basic.asn}` : '', d.basic?.org].filter(Boolean).join(' · ')}</Text>
      <HStack spacing={4}>{ipTags(d).slice(0, 3).map(t => <Pill text={t.text} fg={t.color} bg={withAlpha(t.color, 0.16)} font={10} />)}</HStack>
      <Rectangle fill={th.border} frame={{ maxWidth: 'infinity', height: 0.5 }} />
      {d.ping ? <PingCards ctx={ctx} d={d} /> : <Text font={11} foregroundStyle={th.t3}>三网探针没有结果</Text>}
      <Rectangle fill={th.border} frame={{ maxWidth: 'infinity', height: 0.5 }} />
      {way ? <Line ctx={ctx} label="回程" text={`${way} (同网络探针)`} /> : null}
      {media.length ? <Line ctx={ctx} label="解锁" text={media.join(' ')} color={OK} /> : null}
      {stab ? <Line ctx={ctx} label="HTTPS" text={`成功 ${stab.ok}/${stab.total}`} color={stab.ok === stab.total ? OK : WARN} /> : null}
      {d.dnsbl ? <Line ctx={ctx} label="黑名单" text={d.dnsbl.listed.length ? `命中 ${d.dnsbl.listed.length}/${d.dnsbl.checked}` : `${d.dnsbl.checked} 家未命中`} color={d.dnsbl.listed.length ? WARN : OK} /> : null}
      {d.dnsleak ? <Line ctx={ctx} label="DNS" text={d.dnsleak.servers.slice(0, 2).map(s => `${s.cc ?? ''} ${s.org ?? s.ip}`.trim()).join(' · ') || '无结果'} /> : null}
      {ctx.nat ? <Line ctx={ctx} label="NAT" text={ctx.nat.text} color={ctx.nat.type === 'blocked' ? BAD : undefined} /> : null}
      {d.speed?.down ? <Line ctx={ctx} label="带宽" text={`下载 ${Math.round(d.speed.down)}Mbps${d.speed.conns ? ` · ${d.speed.conns} 连接` : ''}`} /> : null}
      <Spacer minLength={0} />
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// 锁屏
// ─────────────────────────────────────────────────────────────
function LockFrame(props: { ctx: Ctx; radius: number; children?: any }) {
  if (!props.ctx.inApp) return props.children
  return <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} background={<RoundedRectangle cornerRadius={props.radius} fill="#3A3A3C" />}>{props.children}</ZStack>
}

export function LockLatency(props: { ctx: Ctx }) {
  const { ctx } = props
  const r = mainGroupLeaf(ctx)?.r
  return (
    <LockFrame ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          <Text font={20} fontWeight="semibold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.6} foregroundStyle={ctx.inApp ? '#FFFFFF' : undefined}>{r?.ok ? String(r.ms) : r ? '超时' : '-'}</Text>
          {r?.ok ? <Text font={10} foregroundStyle={ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined}>ms</Text> : null}
        </VStack>
      </ZStack>
    </LockFrame>
  )
}

export function LockToday(props: { ctx: Ctx }) {
  const { ctx } = props
  const budget = ctx.subs[0]?.budget?.today ?? 0
  return (
    <LockFrame ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <Gauge
          value={budget ? Math.min(1, ctx.all.today / budget) : 0}
          min={0}
          max={1}
          label={<Text>今天</Text>}
          currentValueLabel={<Text monospacedDigit minScaleFactor={0.5}>{fmtBytes(ctx.all.today)}</Text>}
          gaugeStyle="accessoryCircularCapacity"
        />
      </ZStack>
    </LockFrame>
  )
}

export function LockPing(props: { ctx: Ctx }) {
  const { ctx } = props
  const d = ctx.loon ? latestDeep(ctx.loon, ctx.prefs)?.data : undefined
  const fg = ctx.inApp ? '#FFFFFF' : undefined
  const dim = ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined
  return (
    <LockFrame ctx={ctx} radius={14}>
      {d?.ping ? (
        <HStack spacing={10} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
          {(['ct', 'cu', 'cm'] as Isp[]).map(isp => {
            const p = d.ping?.find(x => x.isp === isp)
            return (
              <VStack alignment="leading" spacing={0} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                <Text font={11} lineLimit={1} foregroundStyle={dim}>{ISP[isp]}</Text>
                <Text font={20} fontWeight="semibold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.6} foregroundStyle={fg}>{p?.avg !== undefined ? String(Math.round(p.avg)) : '-'}</Text>
              </VStack>
            )
          })}
        </HStack>
      ) : (
        <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
          <Text font={14} fontWeight="bold" lineLimit={1} foregroundStyle={fg}>三网延迟</Text>
          <Text font={12} lineLimit={1} foregroundStyle={dim}>还没做过深度检测</Text>
        </VStack>
      )}
    </LockFrame>
  )
}
