// loon-panel / styles/node.tsx
// 节点类: B 当前节点 (小) · D 节点体检 (中)

import { VStack, HStack, Text, Spacer, Image } from 'scripting'

import { activeGroup, rankedNodes, healthCount, availability, type NodeResult } from '../loon'
import { Root, ModeTap, Header, Num, Empty, Cell, Pill, Spark, RefreshButton, latencyInk, latencyText, nodeLabel, asnText, flag, ago, syncText, chunk, withAlpha, type Ctx } from '../ui'

const NO_LOON = '读不到 Loon 数据\n打开 App 看排查步骤'

/** 主策略组和它当前用的节点 */
export function mainGroupLeaf(ctx: Ctx): { group: string; name: string; r?: NodeResult } | undefined {
  if (!ctx.loon) return undefined
  const g = activeGroup(ctx.loon, ctx.prefs)
  return g ? { group: g.name, name: g.leaf, r: g.gone ? undefined : ctx.loon.nodes[g.leaf] } : undefined
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
  if (!ctx.loon || !leaf) return <Root ctx={ctx}><Header ctx={ctx} title="当前节点" font={12} /><Empty ctx={ctx} icon="bolt.horizontal.circle" text={NO_LOON} /></Root>
  const r = leaf.r
  return (
    <Root ctx={ctx} spacing={4}>
      <Header ctx={ctx} title={leaf.group} font={12} trailing={<ModeTap ctx={ctx} />} />
      <Spacer minLength={0} />
      <Text font={15} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={2} minScaleFactor={0.7}>{nodeLabel(leaf.name, r)}</Text>
      <HStack alignment="lastTextBaseline" spacing={3}>
        <Num value={r ? (r.ok ? r.ms : '超时') : '未测'} size={r?.ok ? 34 : 22} color={latencyInk(ctx, r)} weight="bold" />
        {r?.ok ? <Text font={12} fontWeight="medium" foregroundStyle={th.t3}>ms</Text> : null}
        <Spacer minLength={2} />
        <Spark ctx={ctx} h={r?.h} width={46} height={18} />
      </HStack>
      <Spacer minLength={0} />
      <HStack spacing={4}>
        {availability(r) !== null ? <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{`可用 ${Math.round(availability(r)! * 100)}%`}</Text> : null}
        <Spacer minLength={2} />
        <Text font={10} monospacedDigit foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7}>{r?.ip ?? '没读到出口 IP'}</Text>
      </HStack>
      <Text font={10} foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.7}>{r?.ip ? `${flag(r.cc)} ${r.org ?? asnText(r)}` : checkText(ctx)}</Text>
    </Root>
  )
}

// ─────────────────────────────────────────────────────────────
// D 节点体检: 在用的排前面, 其余按延迟
// ─────────────────────────────────────────────────────────────
export function HealthStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  if (!ctx.loon) return <Root ctx={ctx}><Header ctx={ctx} title="节点体检" /><Empty ctx={ctx} icon="bolt.horizontal.circle" text={NO_LOON} /></Root>
  const list = rankedNodes(ctx.loon)
  const c = healthCount(ctx.loon)
  if (!list.length) return <Root ctx={ctx}><Header ctx={ctx} title="节点体检" right={syncText(ctx)} /><Empty ctx={ctx} icon="stethoscope" text={'还没有体检结果\n在 App 里点「立即体检」'} /></Root>
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
      {chunk(rows, 2).map(row => (
        <HStack spacing={6}>
          {row.map(x => (
            <Cell ctx={ctx}>
              <HStack spacing={3}>
                <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{nodeLabel(x.name, x.r)}</Text>
                {x.current ? <Text font={9} foregroundStyle={th.accent}>在用</Text> : null}
              </HStack>
              <HStack spacing={4}>
                <Text font={15} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={latencyInk(ctx, x.r)} lineLimit={1}>{latencyText(x.r)}</Text>
                <Spacer minLength={2} />
                <Spark ctx={ctx} h={x.r.h} width={36} height={12} />
              </HStack>
            </Cell>
          ))}
          {row.length < 2 ? <VStack frame={{ maxWidth: 'infinity' }} /> : null}
        </HStack>
      ))}
    </Root>
  )
}
