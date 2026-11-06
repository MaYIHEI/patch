// kit.tsx — patch 的页面骨架: 系统底色 + 分组卡片 + 行. 黑白灰为主, 彩色只表示状态; 液态玻璃交给系统底栏、工具栏和按钮
// 只给 App 页面用, 不进小组件. 新组件把这个文件复制过去就能用, 不依赖组件里的其他文件

import {
  Button, Circle, HStack, Image, NavigationLink, Picker, Rectangle, RoundedRectangle, ScrollView, Spacer, Text, Toggle, VStack, ZStack,
} from 'scripting'
import type { Color } from 'scripting'

const HAS_GLASS = Number((Device.systemVersion || '0').split('.')[0]) >= 26
const RADIUS = HAS_GLASS ? 26 : 12   // 和系统 List 的卡片一致, 两种页面切换时不跳
const MARGIN = HAS_GLASS ? 20 : 16

const SEPARATOR: Color = 'separator'
const CARD: Color = 'secondarySystemGroupedBackground'

/** 页面: 系统底色 + 可滚动内容 */
// 注意: 自定义组件上的 padding、toolbar、frame 这类属性名, Scripting 会再当修饰符应用一次, 这里的属性都避开这些名字
export function Page(props: { title: string; large?: boolean; bar?: any; children?: any }) {
  return (
    <ScrollView
      navigationTitle={props.title}
      navigationBarTitleDisplayMode={props.large ? 'large' : 'inline'}
      toolbar={props.bar}
      background={<Rectangle fill="systemGroupedBackground" ignoresSafeArea />}
    >
      <VStack alignment="leading" spacing={22} padding={{ horizontal: MARGIN, vertical: 12 }}>{props.children}</VStack>
    </ScrollView>
  )
}

/** 卡片 */
export function Card(props: { radius?: number; inner?: number; tall?: number; children?: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={props.inner ?? 0}
      frame={{ maxWidth: 'infinity', minHeight: props.tall, alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={props.radius ?? RADIUS} style="continuous" fill={CARD} />}
    >
      {props.children}
    </VStack>
  )
}

/** 两列网格 */
export function Grid(props: { children?: any }) {
  const items = (Array.isArray(props.children) ? props.children : [props.children]).flat().filter(Boolean)
  const rows: any[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return (
    <VStack spacing={10}>
      {rows.map(row => (
        <HStack spacing={10} alignment="top">
          <VStack frame={{ maxWidth: 'infinity' }}>{row[0]}</VStack>
          <VStack frame={{ maxWidth: 'infinity' }}>{row[1] ?? null}</VStack>
        </HStack>
      ))}
    </VStack>
  )
}

/** 网格里进下一页的卡片 */
export function NavTile(props: { icon: string; title: string; value?: string; destination: any }) {
  return (
    <NavigationLink destination={props.destination} buttonStyle="plain">
      <Card inner={14} tall={92}>
        <VStack alignment="leading" spacing={3}>
          <Image systemName={props.icon} font={18} foregroundStyle="secondaryLabel" padding={{ bottom: 6 }} />
          <Text font={15} foregroundStyle="label" lineLimit={1}>{props.title}</Text>
          {props.value ? <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}
        </VStack>
      </Card>
    </NavigationLink>
  )
}

function Round(props: { icon: string; title: string }) {
  return (
    <VStack spacing={6}>
      <ZStack frame={{ width: 52, height: 52 }}>
        <Circle fill={CARD} />
        <Image systemName={props.icon} font={20} foregroundStyle="label" />
      </ZStack>
      <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.title}</Text>
    </VStack>
  )
}

/** 圆形操作按钮, 放在一行里平分宽度 */
export function RoundButton(props: { icon: string; title: string; action: () => void; disabled?: boolean }) {
  return <Button action={props.action} buttonStyle="plain" disabled={props.disabled} frame={{ maxWidth: 'infinity' }}><Round icon={props.icon} title={props.title} /></Button>
}

export function RoundLink(props: { icon: string; title: string; destination: any }) {
  return <NavigationLink destination={props.destination} buttonStyle="plain" frame={{ maxWidth: 'infinity' }}><Round icon={props.icon} title={props.title} /></NavigationLink>
}

/** 舞台: 比页面略深的底, 放预览 */
export function Stage(props: { children?: any }) {
  return (
    <VStack
      spacing={12}
      padding={{ vertical: 22 }}
      frame={{ maxWidth: 'infinity' }}
      background={<RoundedRectangle cornerRadius={RADIUS} style="continuous" fill="tertiarySystemFill" />}
    >
      {props.children}
    </VStack>
  )
}

/** 一组设置: 小标题 + 卡片 + 说明. 行之间自动加分隔线 */
export function Group(props: { title?: string; note?: string; inset?: number; children?: any }) {
  const rows = (Array.isArray(props.children) ? props.children : [props.children]).flat().filter(Boolean)
  return (
    <VStack alignment="leading" spacing={8}>
      {props.title ? <Text font={13} foregroundStyle="secondaryLabel" padding={{ leading: MARGIN }}>{props.title}</Text> : null}
      <Card>
        {rows.flatMap((row: any, i: number) => (i ? [<Rectangle fill={SEPARATOR} frame={{ height: 0.5 }} padding={{ leading: props.inset ?? 56 }} />, row] : [row]))}
      </Card>
      {props.note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: MARGIN }}>{props.note}</Text> : null}
    </VStack>
  )
}

/** 行首图标: 默认灰色, 只有状态才给颜色 */
export function Chip(props: { icon: string; color?: Color; size?: number }) {
  const size = props.size ?? 28
  return <Image systemName={props.icon} font={size * 0.62} foregroundStyle={props.color ?? 'secondaryLabel'} frame={{ width: size, height: size }} />
}

type Label = { icon: string; color?: Color; title: string; sub?: string }

function Line(props: Label & { children?: any }) {
  return (
    <HStack spacing={14} padding={{ horizontal: 14, vertical: 11 }} frame={{ maxWidth: 'infinity', minHeight: 48 }}>
      <Chip icon={props.icon} color={props.color} />
      <VStack alignment="leading" spacing={2}>
        <Text font={16} foregroundStyle="label" lineLimit={1}>{props.title}</Text>
        {props.sub ? <Text font={12} foregroundStyle="secondaryLabel" lineLimit={2}>{props.sub}</Text> : null}
      </VStack>
      <Spacer minLength={8} />
      {props.children}
    </HStack>
  )
}

const Chevron = () => <Image systemName="chevron.right" font={13} fontWeight="semibold" foregroundStyle="tertiaryLabel" />

/** 只显示信息 */
export function InfoRow(props: Label & { value?: string }) {
  return <Line {...props}>{props.value ? <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}</Line>
}

/** 进下一页 */
export function NavRow(props: Label & { value?: string; destination: any }) {
  return (
    <NavigationLink destination={props.destination} buttonStyle="plain">
      <Line {...props}>
        {props.value ? <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}
        <Chevron />
      </Line>
    </NavigationLink>
  )
}

/** 点一下执行 */
export function ActionRow(props: Label & { value?: string; action: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Button action={props.action} buttonStyle="plain" disabled={props.disabled}>
      <Line {...props}>
        {props.value ? <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}
      </Line>
    </Button>
  )
}

export function ToggleRow(props: Label & { value: boolean; onChanged: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Line {...props}>
      <Toggle title={props.title} labelsHidden value={props.value} onChanged={props.onChanged} disabled={props.disabled} />
    </Line>
  )
}

/** 下拉选择: options 是 [值, 显示文字] */
export function PickerRow<T extends string | number>(props: Label & { value: T; options: [T, string][]; onChanged: (v: T) => void; disabled?: boolean }) {
  return (
    <Line {...props}>
      <Picker title={props.title} labelsHidden pickerStyle="menu" value={props.value} disabled={props.disabled} onChanged={(v: any) => props.onChanged(v as T)}>
        {props.options.map(([v, text]) => <Text tag={v}>{text}</Text>)}
      </Picker>
    </Line>
  )
}

/** 行尾的小按钮 */
export function SmallButton(props: { title: string; action: () => void; disabled?: boolean }) {
  return <Button title={props.title} buttonStyle={HAS_GLASS ? 'glass' : 'bordered'} controlSize="small" disabled={props.disabled} action={props.action} />
}
