// loon-panel / styles/board.tsx
// E 全景看板 (大): 模式切换 · 多机场对比 · 策略组当前节点和延迟 (点卡片选节点) · 出口信息

import { VStack, HStack, Text, Spacer, Image, Capsule, Rectangle, RoundedRectangle } from 'scripting'

import { MODES, groupPage, healthCount, unlockNode, loonStatus, focusOf } from '../loon'
import { fmtBytes } from '../subs'
import { ModeIntent, CheckIntent, readNote } from '../app_intents'
import { mainGroupLeaf } from './node'
import { PageButton, GroupCell, PickerStyle, Tap } from './net'
import { pct, fcColor, staleMark } from './usage'
import { Root, Logo, Num, Spark, latencyText, latencyInk, nodeLabel, Bar, RefreshButton, chunk, usageColor, mediaColor, flag, syncText, OK, BAD, WARN, type Ctx } from '../ui'

function Section(props: { ctx: Ctx; title: string; right?: string; trailing?: any }) {
  const { th } = props.ctx
  return (
    <HStack spacing={6}>
      <Text font={10} fontWeight="semibold" foregroundStyle={th.t3}>{props.title}</Text>
      <Rectangle fill={th.border} frame={{ maxWidth: 'infinity', height: 0.5 }} />
      {props.right ? <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{props.right}</Text> : null}
      {props.trailing}
    </HStack>
  )
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
      <Tap ctx={ctx} intent={ctx.loon && !ctx.loon.stale ? CheckIntent(undefined) : undefined}>
        <Image systemName="stethoscope" font={12} fontWeight="semibold" foregroundStyle={th.t2} padding={{ horizontal: 9, vertical: 7 }} background={<Capsule fill={th.card} />} />
      </Tap>
    </HStack>
  )
}

export function BoardStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, loon } = ctx
  if (loon && !ctx.inApp && focusOf(ctx.size)) return <PickerStyle ctx={ctx} />
  const subs = ctx.subs.slice(0, 2)
  const { list: groups, page, pages } = loon ? groupPage(loon, ctx.prefs, subs.length ? 4 : 6) : { list: [], page: 0, pages: 1 }   // 没有机场时多放一行, 不留空
  const leaf = mainGroupLeaf(ctx)
  const health = loon ? healthCount(loon) : null
  const note = ctx.inApp ? null : readNote()
  const status = loonStatus(loon)
  const unlock = loon ? unlockNode(loon, ctx.prefs) : undefined
  const media = unlock?.list ?? []
  return (
    <Root ctx={ctx} spacing={6}>
      <HStack spacing={6}>
        <Logo size={18} />
        <Text font={15} fontWeight="bold" foregroundStyle={th.t1}>Loon 面板</Text>
        <Spacer minLength={4} />
        <Text font={11} foregroundStyle={note ? (note.ok ? OK : BAD) : status.level === 'ok' ? th.t3 : status.level === 'warn' ? WARN : BAD} lineLimit={1}>{note ? note.text : status.level === 'ok' ? syncText(ctx) : status.text}</Text>
        <RefreshButton ctx={ctx} />
      </HStack>

      <ModeBar ctx={ctx} />

      {subs.length ? (
        <VStack spacing={6}>
          <Section ctx={ctx} title="机场" right={ctx.subs.length > 2 ? `共 ${ctx.subs.length} 个` : undefined} />
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
      ) : null}
      <Section ctx={ctx} title="策略组" right={health && health.total ? `${health.ok}/${health.total} 可用` : undefined} trailing={<PageButton ctx={ctx} page={page} pages={pages} />} />
      {loon ? (
        <VStack spacing={6}>
          {chunk(groups, 2).map(row => (
            <HStack spacing={6}>
              {row.map(g => <GroupCell ctx={ctx} g={g} />)}
              {row.length < 2 ? <Spacer /> : null}
            </HStack>
          ))}
        </VStack>
      ) : (
        <Text font={11} foregroundStyle={th.t3}>读不到 Loon 数据, 打开 App 看排查步骤</Text>
      )}

      <Spacer minLength={0} />
      {leaf ? (
        <VStack spacing={3} padding={{ horizontal: 10, vertical: 6 }} background={<RoundedRectangle cornerRadius={12} style="continuous" fill={th.card} />}>
          {subs.length ? null : (
            <HStack spacing={8}>
              <Num value={latencyText(leaf.r)} size={20} color={latencyInk(ctx, leaf.r)} />
              <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{nodeLabel(leaf.name, leaf.r)}</Text>
              <Spacer minLength={4} />
              <Spark ctx={ctx} h={leaf.r?.h} width={96} height={20} tone={th.accent} />
            </HStack>
          )}
          <HStack spacing={6}>
            <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{`出口 · ${leaf.group}`}</Text>
            <Spacer minLength={4} />
            <Text font={10} fontWeight="semibold" monospacedDigit foregroundStyle={leaf.r?.ip ? th.t1 : th.t3} lineLimit={1} minScaleFactor={0.7}>{leaf.r?.ip ? `${flag(leaf.r.cc)} ${leaf.r.ip}` : '没读到出口 IP'}</Text>
          </HStack>
          {unlock ? (
            <HStack spacing={5}>
              <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{`解锁 · ${unlock.group}`}</Text>
              <Spacer minLength={4} />
              {media.length
                ? media.slice(0, 4).map(m => <Text font={10} fontWeight="medium" foregroundStyle={mediaColor(m)} lineLimit={1} minScaleFactor={0.7}>{m.name}</Text>)
                : <Text font={10} foregroundStyle={th.t3} lineLimit={1}>还没检测</Text>}
            </HStack>
          ) : null}
        </VStack>
      ) : null}
    </Root>
  )
}
