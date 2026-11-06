// loon-panel / styles/net.tsx
// 网络类: 解锁 (小 / 中) · 模式开关 · IP 质量 · 网络安全 · 延迟排行 · 控制台 · 策略组卡片 · 事件时间线 · 三网延迟 ·
//         节点全景 · 线路体检报告 · 锁屏 (圆形延迟 / 圆形今日 / 长条三网)

import { VStack, HStack, ZStack, Text, Spacer, Image, Button, Link, Capsule, Rectangle, RoundedRectangle, Gauge, AccessoryWidgetBackground } from 'scripting'
import type { Color } from 'scripting'

import {
  MODES, groupPage, pickerView, switchTarget, rankedNodes, healthCount, availability, unlockNode, latestDeep, loonStatus, modeName,
  type Deep, type Group, type Isp,
} from '../loon'
import { fmtBytes } from '../subs'
import { ModeIntent, SwitchIntent, CheckIntent, FastestIntent, NextGroupsIntent, NextPickGroupIntent, NextPickPageIntent, readNote } from '../app_intents'
import { mainGroupLeaf, checkText } from './node'
import {
  Root, Header, Num, Empty, Cell, Dot, Pill, Uptime, RefreshButton, latencyColor, latencyInk, latencyText, nodeLabel, asnText, flag, ago, hhmm,
  mediaColor, mediaWord, chunk, withAlpha, OK, BAD, WARN, type Ctx,
} from '../ui'

const NO_LOON = '读不到 Loon 数据\n打开 App 看排查步骤'
const NO_DEEP = '还没做过深度检测\n在 App 的策略组页里点「深度检测」'
const ISP: Record<Isp, string> = { ct: '电信', cu: '联通', cm: '移动' }

function NoLoon(props: { ctx: Ctx; title: string; icon: string }) {
  return <Root ctx={props.ctx}><Header ctx={props.ctx} title={props.title} icon={props.icon} font={12} /><Empty ctx={props.ctx} icon="bolt.horizontal.circle" text={NO_LOON} /></Root>
}

/** 小组件里是按钮, App 预览里只是样子 */
export function Tap(props: { ctx: Ctx; intent: any; children?: any }) {
  if (props.ctx.inApp || !props.intent) return props.children
  return <Button intent={props.intent} buttonStyle="plain">{props.children}</Button>
}

/** 翻页: 1/3 ›, 只有一页时不显示 */
export function PageButton(props: { ctx: Ctx; page: number; pages: number }) {
  const { th } = props.ctx
  if (props.pages < 2) return null
  return (
    <Tap ctx={props.ctx} intent={NextGroupsIntent(undefined)}>
      <HStack spacing={2}>
        <Text font={11} monospacedDigit foregroundStyle={th.accent}>{`${props.page + 1}/${props.pages}`}</Text>
        <Image systemName="chevron.right" font={10} fontWeight="semibold" foregroundStyle={th.accent} />
      </HStack>
    </Tap>
  )
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
  if (!ctx.loon) return <NoLoon ctx={ctx} title={props.title} icon="lock.open.fill" />
  const u = unlockNode(ctx.loon, ctx.prefs)
  const list = (u?.list ?? []).slice(0, 6)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title={props.title} icon="lock.open.fill" font={12} right={cols === 3 && u ? `${nodeLabel(u.node, ctx.loon.nodes[u.node])}` : u?.group} />
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
      <Header ctx={ctx} title="Loon" icon="slider.horizontal.3" font={12} />
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
  if (!ctx.loon) return <NoLoon ctx={ctx} title="出口 IP" icon="checkmark.shield.fill" />
  const hit = latestDeep(ctx.loon, ctx.prefs)
  const leaf = mainGroupLeaf(ctx)
  const ip = hit?.data.basic?.ip ?? leaf?.r?.ip
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title="出口 IP" icon="checkmark.shield.fill" font={12} right={flag(hit?.data.basic?.cc ?? leaf?.r?.cc)} />
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
      <Header ctx={ctx} title="网络安全" icon="lock.shield.fill" font={12} />
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
  if (!loon) return <NoLoon ctx={ctx} title="最快节点" icon="trophy.fill" />
  const list = rankedNodes(loon).filter(x => x.r.ok).sort((a, b) => a.r.ms - b.r.ms).slice(0, 5)
  if (!list.length) return <Root ctx={ctx}><Header ctx={ctx} title="最快节点" icon="trophy.fill" /><Empty ctx={ctx} icon="stethoscope" text="还没有体检结果" /></Root>
  const max = Math.max(...list.map(x => x.r.ms))
  return (
    <Root ctx={ctx} spacing={5}>
      <Header ctx={ctx} title="最快节点" icon="trophy.fill" right={`${checkText(ctx)}`} />
      {list.map((x, i) => {
        const g = loon.groups.find(y => y.subs.includes(x.name) && y.now !== x.name)
        return (
          <Tap ctx={ctx} intent={g && !loon.stale ? SwitchIntent({ group: g.name, node: x.name }) : undefined}>
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
/** 切换器: 常用策略组里的一个组, 点节点直接切; 右上角换组、翻页 */
export function PickerStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="切换器" icon="arrow.triangle.swap" />
  const { group: g, nodes, page, pages, groups } = pickerView(loon, ctx.prefs, ctx.size === 'l' ? 16 : 6)
  if (!g) return <NoLoon ctx={ctx} title="切换器" icon="arrow.triangle.swap" />
  const cell = (name: string) => {
    const r = loon.nodes[name]
    const on = name === g.now
    return (
      <Tap ctx={ctx} intent={!on && !loon.stale ? SwitchIntent({ group: g.name, node: name }) : undefined}>
        <HStack spacing={3} padding={{ horizontal: 8, vertical: 6 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }} background={<RoundedRectangle cornerRadius={9} fill={on ? th.accent : th.card} />}>
          <Text font={11} fontWeight="medium" foregroundStyle={on ? '#FFFFFF' : th.t1} lineLimit={1} minScaleFactor={0.7}>{nodeLabel(name, r)}</Text>
          <Spacer minLength={2} />
          {r ? <Text font={10} monospacedDigit foregroundStyle={on ? '#FFFFFF' : latencyInk(ctx, r)} lineLimit={1}>{r.ok ? String(r.ms) : '超时'}</Text> : null}
        </HStack>
      </Tap>
    )
  }
  return (
    <Root ctx={ctx} spacing={5}>
      <Header
        ctx={ctx}
        title={g.name}
        icon="arrow.triangle.swap"
        trailing={(
          <HStack spacing={8}>
            {groups > 1 ? <Tap ctx={ctx} intent={NextPickGroupIntent(undefined)}><Text font={11} foregroundStyle={th.accent} lineLimit={1}>换组</Text></Tap> : null}
            {pages > 1 ? <Tap ctx={ctx} intent={NextPickPageIntent(undefined)}><Text font={11} monospacedDigit foregroundStyle={th.accent}>{`${page + 1}/${pages} ›`}</Text></Tap> : null}
          </HStack>
        )}
      />
      {chunk(nodes, 2).map(row => (
        <HStack spacing={5}>
          {row.map(cell)}
          {row.length < 2 ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
        </HStack>
      ))}
      <Spacer minLength={0} />
    </Root>
  )
}

/** 一个策略组: 组名、延迟、当前节点; 点一下切到最快 */
export function GroupCell(props: { ctx: Ctx; g: Group }) {
  const { ctx, g } = props
  const { th } = ctx
  const loon = ctx.loon!
  const r = loon.nodes[g.leaf]
  const target = loon.stale ? undefined : switchTarget(loon, g)
  return (
    <Tap ctx={ctx} intent={target ? SwitchIntent({ group: g.name, node: target }) : undefined}>
      <Cell ctx={ctx}>
        <HStack spacing={3}>
          <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{g.name}</Text>
          {loon.locks?.[g.name] ? <Image systemName="lock.fill" font={8} foregroundStyle={th.t3} /> : null}
        </HStack>
        <Text font={15} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={latencyInk(ctx, r)} lineLimit={1}>{latencyText(r)}</Text>
        <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{nodeLabel(g.leaf, r)}</Text>
      </Cell>
    </Tap>
  )
}

export function GroupsStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="策略组" icon="square.grid.2x2.fill" />
  const { list: groups, page, pages } = groupPage(loon, ctx.prefs, 4)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="策略组" icon="square.grid.2x2.fill" right={modeName(loon.mode)} trailing={<PageButton ctx={ctx} page={page} pages={pages} />} />
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
      <Header ctx={ctx} title="发生了什么" icon="list.bullet.rectangle.fill" right={ctx.events.length ? `${ctx.events.length} 件` : undefined} />
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
  if (!ctx.loon) return <NoLoon ctx={ctx} title="三网延迟" icon="point.3.connected.trianglepath.dotted" />
  const hit = latestDeep(ctx.loon, ctx.prefs)
  if (!hit?.data.ping) return <Root ctx={ctx}><Header ctx={ctx} title="三网延迟" icon="point.3.connected.trianglepath.dotted" /><Empty ctx={ctx} icon="point.3.connected.trianglepath.dotted" text={NO_DEEP} /></Root>
  return (
    <Root ctx={ctx} spacing={7}>
      <Header ctx={ctx} title="三网延迟" icon="point.3.connected.trianglepath.dotted" right={`${ago(hit.data.t)} 检测`} />
      <PingCards ctx={ctx} d={hit.data} />
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{`外部探针到 ${nodeLabel(hit.node, ctx.loon.nodes[hit.node])} 出口`}</Text>
    </Root>
  )
}

export function NodesStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (!loon) return <NoLoon ctx={ctx} title="节点全景" icon="stethoscope" />
  const c = healthCount(loon)
  const list = rankedNodes(loon).slice(0, 8)
  const u = unlockNode(loon, ctx.prefs)
  const leaf = mainGroupLeaf(ctx)
  const deep = latestDeep(loon, ctx.prefs)
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="节点全景" icon="stethoscope" font={14} right={`${c.ok}/${c.total} 可用 · ${checkText(ctx)}`} />
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
  if (!loon) return <NoLoon ctx={ctx} title="线路体检报告" icon="doc.text.magnifyingglass" />
  const hit = latestDeep(loon, ctx.prefs)
  if (!hit) return <Root ctx={ctx}><Header ctx={ctx} title="线路体检报告" icon="doc.text.magnifyingglass" font={14} /><Empty ctx={ctx} icon="doc.text.magnifyingglass" text={NO_DEEP} /></Root>
  const d = hit.data
  const way = (d.backhaul ?? []).map(b => `${ISP[b.isp]} ${b.summary ?? ''}`.trim()).join(' · ')
  const media = (d.media ?? []).filter(m => m.status === 'yes').map(m => m.name)
  const stab = d.stability?.length ? d.stability.reduce((a, s) => ({ ok: a.ok + s.ok, total: a.total + s.total }), { ok: 0, total: 0 }) : null
  return (
    <Root ctx={ctx} spacing={6}>
      <Header ctx={ctx} title="线路体检报告" icon="doc.text.magnifyingglass" font={14} right={`${ago(d.t)} 检测`} />
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
  return <ZStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} background={<RoundedRectangle cornerRadius={props.radius} fill="#23306B" />}>{props.children}</ZStack>
}

export function LockLatency(props: { ctx: Ctx }) {
  const { ctx } = props
  const r = mainGroupLeaf(ctx)?.r
  return (
    <LockFrame ctx={ctx} radius={38}>
      <ZStack>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          <Text font={18} fontWeight="semibold" monospacedDigit minScaleFactor={0.6} foregroundStyle={ctx.inApp ? '#FFFFFF' : undefined}>{r?.ok ? String(r.ms) : r ? '超时' : '-'}</Text>
          <Text font={10} foregroundStyle={ctx.inApp ? 'rgba(255,255,255,0.78)' : undefined}>ms</Text>
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
  const line = (['ct', 'cu', 'cm'] as Isp[]).map(isp => { const p = d?.ping?.find(x => x.isp === isp); return `${ISP[isp][0]} ${p?.avg !== undefined ? Math.round(p.avg) : '-'}` }).join('  ')
  return (
    <LockFrame ctx={ctx} radius={14}>
      <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'leading' }} padding={ctx.inApp ? { horizontal: 10 } : 0}>
        <Text font={14} fontWeight="bold" lineLimit={1} foregroundStyle={fg}>三网延迟</Text>
        <Text font={13} monospacedDigit lineLimit={1} foregroundStyle={fg}>{d?.ping ? line : '还没做过深度检测'}</Text>
      </VStack>
    </LockFrame>
  )
}
