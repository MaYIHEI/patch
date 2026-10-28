// checkin / styles/extra.tsx
// X 过期倒计时 · Q 交互翻页

import { VStack, HStack, Text, Spacer, Image, Button, Capsule } from 'scripting'

import { counts, type Entry } from '../api'
import { Root, Header, Num, Empty, Bar, AppIcon, syncText, hhmm, OK, BAD, WARN, type Ctx } from '../ui'
import { EntryRow } from './basic'
import { PageIntent, RefreshIntent } from '../app_intents'

// ─────────────────────────────────────────────────────────────
// X 过期倒计时: 协议可选字段 exp, ≤3 天红, ≤7 天橙
// ─────────────────────────────────────────────────────────────
const DAY = 86_400_000
const leftDays = (e: Entry) => (e.exp! - Date.now()) / DAY
const expColor = (d: number) => (d <= 3 ? BAD : d <= 7 ? WARN : OK)
const leftText = (d: number) => (d <= 0 ? '已过期' : d < 1 ? `${Math.max(1, Math.round(d * 24))} 小时` : `${Math.floor(d)} 天`)

export function ExpiryStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, size } = ctx
  const list = ctx.entries.filter(e => e.exp).sort((a, b) => a.exp! - b.exp!)
  if (!list.length) {
    return (
      <Root ctx={ctx} spacing={6}>
        <Header ctx={ctx} title="过期倒计时" right={hhmm(ctx.snap.fetchedAt)} font={size === 's' ? 12 : 13} />
        <Spacer minLength={0} />
        <VStack spacing={6} frame={{ maxWidth: 'infinity' }}>
          <Image systemName="hourglass" font={28} foregroundStyle={th.t3} />
          <Text font={12} foregroundStyle={th.t2} multilineTextAlignment="center">脚本还没提供过期时间</Text>
        </VStack>
        <Spacer minLength={0} />
      </Root>
    )
  }
  const Row = (e: Entry, big: boolean) => {
    const d = leftDays(e)
    return (
      <VStack alignment="leading" spacing={3}>
        <HStack spacing={6}>
          {big ? <AppIcon entry={e} size={20} /> : null}
          <Text font={big ? 13 : 12} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1}>{e.name}</Text>
          <Spacer minLength={2} />
          <Text font={big ? 13 : 12} fontWeight="semibold" monospacedDigit foregroundStyle={expColor(d)}>{leftText(d)}</Text>
        </HStack>
        <Bar ctx={ctx} value={Math.max(0, d) / 30} color={expColor(d)} height={5} />
      </VStack>
    )
  }
  if (size === 's') {
    const e = list[0], d = leftDays(e)
    return (
      <Root ctx={ctx} tone={d <= 3 ? 'bad' : undefined} spacing={3}>
        <Header ctx={ctx} title="最快过期" right={hhmm(ctx.snap.fetchedAt)} font={12} />
        <Spacer minLength={0} />
        <Text font={13} foregroundStyle={th.t1} lineLimit={1}>{e.name}</Text>
        <Num value={leftText(d)} size={30} weight="bold" color={expColor(d)} />
        <Bar ctx={ctx} value={Math.max(0, d) / 30} color={expColor(d)} height={5} />
        <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{list[1] ? `下一个: ${list[1].name} ${leftText(leftDays(list[1]))}` : ' '}</Text>
      </Root>
    )
  }
  return (
    <Root ctx={ctx} spacing={size === 'l' ? 12 : 8}>
      <Header ctx={ctx} title={`凭证过期 · ${list.length} 个`} right={syncText(ctx.snap)} />
      {list.slice(0, size === 'l' ? 7 : 3).map(e => Row(e, size === 'l'))}
      <Spacer minLength={0} />
    </Root>
  )
}

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
