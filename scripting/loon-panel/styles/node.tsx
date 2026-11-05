// loon-panel / styles/node.tsx
// 节点类: B 当前节点 (小) · D 节点体检 (中)

import { VStack, HStack, Text, Spacer, Image } from 'scripting'

import { mainGroup, rankedNodes, healthCount, availability, unlockNode, modeName, type NodeResult } from '../loon'
import { Root, Header, Num, Empty, Dot, Pill, Spark, RefreshButton, mediaColor, latencyColor, latencyText, nodeLabel, asnText, flag, ago, syncText, withAlpha, type Ctx } from '../ui'

const NO_LOON = '读不到 Loon 数据\n打开 App 看排查步骤'

/** 主策略组和它当前用的节点 */
export function mainGroupLeaf(ctx: Ctx): { group: string; name: string; r?: NodeResult } | undefined {
  if (!ctx.loon) return undefined
  const g = mainGroup(ctx.loon, ctx.prefs)
  return g ? { group: g.name, name: g.leaf, r: ctx.loon.nodes[g.leaf] } : undefined
}

/** 体检时间: 「体检 12:30」, 从没体检过提示去跑一次 */
export const checkText = (ctx: Ctx) => (ctx.loon?.check ? `体检 ${ago(ctx.loon.check.t)}` : '还没体检过')

// ─────────────────────────────────────────────────────────────
// B 当前节点
// ─────────────────────────────────────────────────────────────
export function NodeStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const leaf = mainGroupLeaf(ctx)
  if (!ctx.loon || !leaf) return <Root ctx={ctx}><Header ctx={ctx} title="当前节点" icon="antenna.radiowaves.left.and.right" font={12} /><Empty ctx={ctx} icon="bolt.horizontal.circle" text={NO_LOON} /></Root>
  const r = leaf.r
  const media = unlockNode(ctx.loon, { ...ctx.prefs, unlock: leaf.group })?.list ?? []
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title={leaf.group} icon="antenna.radiowaves.left.and.right" font={12} right={modeName(ctx.loon.mode)} rightColor={th.accent} />
      <Spacer minLength={0} />
      <Text font={15} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={2} minScaleFactor={0.7}>{nodeLabel(leaf.name, r)}</Text>
      <HStack alignment="lastTextBaseline" spacing={3}>
        <Num value={r ? (r.ok ? r.ms : '超时') : '未测'} size={r?.ok ? 30 : 22} color={latencyColor(r)} weight="bold" />
        {r?.ok ? <Text font={12} fontWeight="medium" foregroundStyle={latencyColor(r)}>ms</Text> : null}
        <Spacer minLength={2} />
        <Spark ctx={ctx} h={r?.h} width={46} height={18} />
      </HStack>
      <Spacer minLength={0} />
      {availability(r) !== null ? <Text font={10} foregroundStyle={th.t2}>{`24 次可用 ${Math.round(availability(r)! * 100)}%`}</Text> : null}
      {media.length ? (
        <HStack spacing={4}>
          {media.slice(0, 4).map(m => <Text font={10} fontWeight="medium" foregroundStyle={mediaColor(m)} lineLimit={1} minScaleFactor={0.7}>{m.name.slice(0, 3)}</Text>)}
        </HStack>
      ) : null}
      <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.7}>{r?.ip ? `${flag(r.cc)} ${asnText(r) || r.ip}` : checkText(ctx)}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// D 节点体检: 在用的排前面, 其余按延迟
// ─────────────────────────────────────────────────────────────
export function HealthStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  if (!ctx.loon) return <Root ctx={ctx}><Header ctx={ctx} title="节点体检" icon="stethoscope" /><Empty ctx={ctx} icon="bolt.horizontal.circle" text={NO_LOON} /></Root>
  const list = rankedNodes(ctx.loon)
  const c = healthCount(ctx.loon)
  if (!list.length) return <Root ctx={ctx}><Header ctx={ctx} title="节点体检" icon="stethoscope" right={syncText(ctx)} /><Empty ctx={ctx} icon="stethoscope" text={'还没有体检结果\n在 App 里点「立即体检」'} /></Root>
  const rows = list.slice(0, 4)
  return (
    <Root ctx={ctx} spacing={6}>
      <HStack spacing={6}>
        <Image systemName="stethoscope" font={12} fontWeight="semibold" foregroundStyle={th.accent} />
        <Text font={13} fontWeight="semibold" foregroundStyle={th.t1}>节点体检</Text>
        <Pill text={`${c.ok}/${c.total} 可用`} fg={c.ok === c.total ? '#30D158' : '#FF9F0A'} bg={withAlpha(c.ok === c.total ? '#30D158' : '#FF9F0A', 0.18)} font={10} />
        <Spacer minLength={4} />
        <Text font={11} foregroundStyle={ctx.loon.stale ? '#FF9F0A' : th.t3} lineLimit={1}>{ctx.loon.stale ? syncText(ctx) : checkText(ctx)}</Text>
        <RefreshButton ctx={ctx} />
      </HStack>
      <VStack spacing={5} frame={{ maxHeight: 'infinity', alignment: 'top' }}>
        {rows.map(x => (
          <HStack spacing={6}>
            <Dot color={latencyColor(x.r)} size={6} />
            <Text font={12} fontWeight={x.current ? 'semibold' : 'regular'} foregroundStyle={th.t1} lineLimit={1}>{nodeLabel(x.name, x.r)}</Text>
            {x.current ? <Text font={9} foregroundStyle={th.accent}>在用</Text> : null}
            <Spacer minLength={4} />
            <Spark ctx={ctx} h={x.r.h} width={44} height={12} />
            <Text font={10} monospacedDigit foregroundStyle={th.t3} lineLimit={1} frame={{ width: 30, alignment: 'trailing' }}>{availability(x.r) === null ? '' : `${Math.round(availability(x.r)! * 100)}%`}</Text>
            <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={latencyColor(x.r)} lineLimit={1} frame={{ width: 50, alignment: 'trailing' }}>{latencyText(x.r)}</Text>
          </HStack>
        ))}
        <Spacer minLength={0} />
      </VStack>
      {list.length > rows.length ? <Text font={10} foregroundStyle={th.t3}>{`还有 ${list.length - rows.length} 个节点 · ${modeName(ctx.loon.mode)}模式`}</Text> : null}
    </Root>
  )
}
