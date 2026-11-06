// kit.tsx — patch 的页面骨架: 系统底色 + 分组卡片 + 行. 液态玻璃交给系统底栏和工具栏; 配色风格定稿后只改这个文件
// 只给 App 页面用, 不进小组件. 新组件把这个文件复制过去就能用, 不依赖组件里的其他文件

import {
  Button, Circle, HStack, Image, NavigationLink, Picker, Rectangle, RoundedRectangle, ScrollView, Spacer, Text, Toggle, VStack,
} from 'scripting'
import type { Color } from 'scripting'

const RADIUS = 16
const HAS_GLASS = Number((Device.systemVersion || '0').split('.')[0]) >= 26

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
      background="systemGroupedBackground"
    >
      <VStack alignment="leading" spacing={22} padding={{ horizontal: 16, vertical: 12 }}>{props.children}</VStack>
    </ScrollView>
  )
}

/** 卡片 */
export function Card(props: { radius?: number; inner?: number; children?: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={props.inner ?? 0}
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
      background={<RoundedRectangle cornerRadius={props.radius ?? RADIUS} style="continuous" fill={CARD} />}
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
      {props.title ? <Text font={14} fontWeight="bold" foregroundStyle="secondaryLabel" padding={{ leading: 10 }}>{props.title}</Text> : null}
      <Card>
        {rows.flatMap((row: any, i: number) => (i ? [<Rectangle fill={SEPARATOR} frame={{ height: 0.5 }} padding={{ leading: props.inset ?? 56 }} />, row] : [row]))}
      </Card>
      {props.note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 10 }}>{props.note}</Text> : null}
    </VStack>
  )
}

/** 行首图标 */
export function Chip(props: { icon: string; color: Color; size?: number }) {
  const size = props.size ?? 28
  return <Image systemName={props.icon} font={size * 0.62} foregroundStyle={props.color} frame={{ width: size, height: size }} />
}

type Label = { icon: string; color: Color; title: string; sub?: string }

function Line(props: Label & { children?: any }) {
  return (
    <HStack spacing={14} padding={{ horizontal: 14, vertical: 11 }} frame={{ maxWidth: 'infinity', minHeight: 56 }}>
      <Chip icon={props.icon} color={props.color} />
      <VStack alignment="leading" spacing={2}>
        <Text font={16} fontWeight="medium" foregroundStyle="label" lineLimit={1}>{props.title}</Text>
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

/** 页面顶部: 大图标 + 名字 + 状态 */
export function Hero(props: { icon: string; color: Color; title: string; status: string; statusColor: Color; children?: any }) {
  return (
    <Card inner={18}>
      <VStack alignment="leading" spacing={16}>
        <HStack spacing={14}>
          <Chip icon={props.icon} color={props.color} size={54} />
          <VStack alignment="leading" spacing={4}>
            <Text font={23} fontWeight="bold" foregroundStyle="label" lineLimit={1}>{props.title}</Text>
            <HStack spacing={6}>
              <Circle fill={props.statusColor} frame={{ width: 7, height: 7 }} />
              <Text font={13} foregroundStyle="secondaryLabel" lineLimit={2}>{props.status}</Text>
            </HStack>
          </VStack>
          <Spacer minLength={0} />
        </HStack>
        {props.children ? <HStack spacing={10}>{props.children}</HStack> : null}
      </VStack>
    </Card>
  )
}

/** 行尾的小按钮 */
export function SmallButton(props: { title: string; action: () => void; disabled?: boolean }) {
  return <Button title={props.title} buttonStyle={HAS_GLASS ? 'glass' : 'bordered'} controlSize="small" disabled={props.disabled} action={props.action} />
}

/** Hero 里的玻璃按钮, 等宽 */
export function GlassButton(props: { title: string; icon: string; action: () => void; prominent?: boolean; disabled?: boolean }) {
  return (
    <Button action={props.action} buttonStyle={!HAS_GLASS ? 'bordered' : props.prominent ? 'glassProminent' : 'glass'} disabled={props.disabled} frame={{ maxWidth: 'infinity' }}>
      <HStack spacing={6} frame={{ maxWidth: 'infinity' }} padding={{ vertical: 3 }}>
        <Image systemName={props.icon} font={14} />
        <Text font={14} fontWeight="semibold" lineLimit={1}>{props.title}</Text>
      </HStack>
    </Button>
  )
}
