// checkin / styles/extra.tsx
// Q 交互翻页

import { HStack, Text, Spacer, Image, Button, Capsule } from 'scripting'

import { counts } from '../api'
import { Root, Empty, hhmm, BAD, type Ctx } from '../ui'
import { EntryRow } from './basic'
import { PageIntent, RefreshIntent } from '../app_intents'

// ─────────────────────────────────────────────────────────────
// Q 交互翻页: ‹ › 翻页, ⟳ 刷新 (AppIntent 存页码后 reload)
// ─────────────────────────────────────────────────────────────
function NavButton(props: { ctx: Ctx; icon: string; intent: any }) {
  const icon = (
    <Image systemName={props.icon} font={12} fontWeight="semibold" foregroundStyle={props.ctx.th.t1}
      frame={{ width: 26, height: 22 }} background={<Capsule fill={props.ctx.th.track} />} />
  )
  if (props.ctx.inApp) return icon
  return <Button intent={props.intent} buttonStyle="plain">{icon}</Button>
}

export function PagerStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size, entries } = ctx
  if (!entries.length) return <Root ctx={ctx}><Empty ctx={ctx} text="还没有签到结果" /></Root>
  const per = size === 'l' ? 6 : 3
  const pages = Math.ceil(entries.length / per)
  const p = ((ctx.page % pages) + pages) % pages
  const shown = entries.slice(p * per, p * per + per)
  const c = counts(entries)
  const nav = (
    <HStack spacing={6}>
      <NavButton ctx={ctx} icon="chevron.left" intent={PageIntent({ delta: -1 })} />
      <NavButton ctx={ctx} icon="chevron.right" intent={PageIntent({ delta: 1 })} />
      <NavButton ctx={ctx} icon="arrow.clockwise" intent={RefreshIntent(undefined)} />
    </HStack>
  )
  const title = c.cookie + c.fail ? `需要处理 ${c.cookie + c.fail}` : '全部正常'
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 9 : 6}>
      <HStack>
        <Text font={13} fontWeight="semibold" foregroundStyle={c.cookie + c.fail ? BAD : th.t1}>{title}</Text>
        <Text font={11} monospacedDigit foregroundStyle={th.t3}>{` ${p + 1}/${pages} · ${hhmm(ctx.snap.fetchedAt)}`}</Text>
        <Spacer />
        {nav}
      </HStack>
      {shown.map(e => <EntryRow ctx={ctx} entry={e} icon={size === 'l' ? 28 : 20} font={13} sub={size === 'l'} buttons />)}
      <Spacer minLength={0} />
    </Root>
  )
}
