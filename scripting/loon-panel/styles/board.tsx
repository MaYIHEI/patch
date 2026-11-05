// loon-panel / styles/board.tsx
// E 全景看板 (大): 模式切换 · 多机场对比 · 策略组当前节点和延迟 (点行切到最快) · 出口信息

import { VStack, HStack, Text, Spacer, Image, Button, Capsule, Rectangle } from 'scripting'

import { MODES, shownGroups, switchTarget, healthCount, type Group } from '../loon'
import { fmtBytes } from '../subs'
import { ModeIntent, SwitchIntent, readNote } from '../app_intents'
import { mainGroupLeaf, checkText } from './node'
import { pct, fcColor, staleMark } from './usage'
import { Root, Bar, Dot, usageColor, latencyColor, latencyText, nodeLabel, asnText, flag, syncText, withAlpha, OK, BAD, type Ctx } from '../ui'

function Section(props: { ctx: Ctx; title: string; right?: string }) {
  const { th } = props.ctx
  return (
    <HStack spacing={6}>
      <Text font={10} fontWeight="semibold" foregroundStyle={th.t3}>{props.title}</Text>
      <Rectangle fill={th.border} frame={{ maxWidth: 'infinity', height: 0.5 }} />
      {props.right ? <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{props.right}</Text> : null}
    </HStack>
  )
}

/** 小组件里是按钮, App 预览里只是样子 */
function Tap(props: { ctx: Ctx; intent: any; children?: any }) {
  if (props.ctx.inApp || !props.intent) return props.children
  return <Button intent={props.intent} buttonStyle="plain">{props.children}</Button>
}

function ModeBar(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const cur = ctx.loon?.mode ?? -1
  return (
    <HStack spacing={6}>
      {MODES.map(m => {
        const on = m.id === cur
        return (
          <Tap ctx={ctx} intent={ctx.loon && !on ? ModeIntent({ mode: m.id }) : undefined}>
            <HStack spacing={4} padding={{ vertical: 6 }} frame={{ maxWidth: 'infinity' }} background={<Capsule fill={on ? th.accent : th.card} />}>
              <Image systemName={m.icon} font={11} fontWeight="semibold" foregroundStyle={on ? '#FFFFFF' : th.t2} />
              <Text font={12} fontWeight="semibold" foregroundStyle={on ? '#FFFFFF' : th.t2}>{m.name}</Text>
            </HStack>
          </Tap>
        )
      })}
    </HStack>
  )
}

function GroupRow(props: { ctx: Ctx; g: Group }) {
  const { ctx, g } = props
  const { th } = ctx
  const r = ctx.loon!.nodes[g.leaf]
  const target = ctx.loon!.stale ? undefined : switchTarget(ctx.loon!, g)
  return (
    <Tap ctx={ctx} intent={target ? SwitchIntent({ group: g.name, node: target }) : undefined}>
      <HStack spacing={6}>
        <Text font={11} foregroundStyle={th.t2} lineLimit={1} frame={{ width: 56, alignment: 'leading' }}>{g.name}</Text>
        <Dot color={latencyColor(r)} size={6} />
        <Text font={12} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{nodeLabel(g.leaf, r)}</Text>
        <Spacer minLength={4} />
        <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={latencyColor(r)} lineLimit={1}>{latencyText(r)}</Text>
        {target ? <Image systemName="arrow.triangle.2.circlepath" font={10} foregroundStyle={th.t3} /> : null}
      </HStack>
    </Tap>
  )
}

export function BoardStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  const subs = ctx.subs.slice(0, 3)
  const groups = loon ? shownGroups(loon, ctx.prefs).slice(0, 4) : []
  const leaf = mainGroupLeaf(ctx)
  const health = loon ? healthCount(loon) : null
  const note = ctx.inApp ? null : readNote()
  return (
    <Root ctx={ctx} spacing={8}>
      <HStack spacing={6}>
        <Image systemName="gauge.with.dots.needle.67percent" font={14} fontWeight="semibold" foregroundStyle={th.accent} />
        <Text font={15} fontWeight="bold" foregroundStyle={th.t1}>Loon 面板</Text>
        <Spacer minLength={4} />
        <Text font={11} foregroundStyle={note ? (note.ok ? OK : BAD) : loon?.stale || !loon ? '#FF9F0A' : th.t3} lineLimit={1}>{note ? note.text : syncText(ctx)}</Text>
      </HStack>

      <ModeBar ctx={ctx} />

      <Section ctx={ctx} title="机场" right={ctx.subs.length > 3 ? `共 ${ctx.subs.length} 个` : undefined} />
      {subs.length ? (
        <VStack spacing={6}>
          {subs.map(s => (
            <HStack spacing={8}>
              <Text font={12} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1} frame={{ width: 64, alignment: 'leading' }}>{`${staleMark(s)}${s.name}`}</Text>
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity' }}>
                <HStack>
                  <Text font={10} monospacedDigit foregroundStyle={th.t2} lineLimit={1}>
                    {s.usage ? (s.usage.total > 0 ? `${fmtBytes(s.used)} / ${fmtBytes(s.usage.total)}` : `已用 ${fmtBytes(s.used)}`) : s.err ?? '读取中'}
                  </Text>
                  <Spacer minLength={2} />
                  <Text font={10} fontWeight="medium" foregroundStyle={fcColor(s) ?? th.t3} lineLimit={1}>{s.fc.short}</Text>
                </HStack>
                <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={4} />
              </VStack>
              <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1} frame={{ width: 36, alignment: 'trailing' }}>{s.usage && s.usage.total > 0 ? pct(s.ratio) : '∞'}</Text>
            </HStack>
          ))}
        </VStack>
      ) : (
        <Text font={11} foregroundStyle={th.t3}>在 App 里添加机场订阅</Text>
      )}

      <Section ctx={ctx} title="策略组" right={health && health.total ? `${health.ok}/${health.total} 可用 · ${checkText(ctx)}` : undefined} />
      {loon ? (
        <VStack spacing={6}>
          {groups.map(g => <GroupRow ctx={ctx} g={g} />)}
        </VStack>
      ) : (
        <Text font={11} foregroundStyle={th.t3}>读不到 Loon 数据, 打开 App 看排查步骤</Text>
      )}

      <Spacer minLength={0} />
      {leaf?.r?.ip ? (
        <HStack spacing={6} padding={{ horizontal: 10, vertical: 6 }} background={<Capsule fill={withAlpha(th.accent, 0.12)} />}>
          <Text font={11} foregroundStyle={th.t2}>出口</Text>
          <Text font={11} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1} lineLimit={1}>{`${flag(leaf.r.cc)} ${leaf.r.ip}`}</Text>
          <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{asnText(leaf.r)}</Text>
          <Spacer minLength={0} />
        </HStack>
      ) : null}
      {!ctx.inApp && groups.length ? <Text font={9} foregroundStyle={th.t3}>点策略组切到体检最快的节点</Text> : null}
    </Root>
  )
}
