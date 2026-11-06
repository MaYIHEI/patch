// kit.tsx — patch 自己的界面风格: 流光渐变底 + 液态玻璃卡片 + 圆形渐变图标 + 圆体字
// 只给 App 页面用, 不进小组件. 新组件把这个文件复制过去就能用, 不依赖组件里的其他文件
// iOS 26 以下没有液态玻璃, 卡片换成系统材质

import {
  Button, Circle, HStack, Image, NavigationLink, Picker, Rectangle, RoundedRectangle, ScrollView, Spacer, Text, Toggle, VStack, ZStack, gradient,
} from 'scripting'
import type { Color, DynamicShapeStyle } from 'scripting'

const RADIUS = 28
const HAS_GLASS = Number((Device.systemVersion || '0').split('.')[0]) >= 26

const GRID = [0, 0.5, 1].flatMap(y => [0, 0.5, 1].map(x => ({ x, y })))
const mesh = (colors: Color[]) => gradient('mesh', { width: 3, height: 3, points: GRID, colors })
const AMBIENT = {
  light: mesh(['#BFD8FF', '#E3DAFF', '#FFE1CC', '#CDEBFF', '#F4F6FC', '#FFDCE8', '#BDEBE3', '#DDE6FF', '#EBD9FF']),
  dark: mesh(['#10244F', '#241A52', '#3C1C40', '#0E2F4C', '#0C1222', '#2B1A44', '#0D3A3C', '#142450', '#2D1A50']),
}

const EDGE: DynamicShapeStyle = { light: 'rgba(255,255,255,0.75)', dark: 'rgba(255,255,255,0.16)' }
const SEPARATOR: DynamicShapeStyle = { light: 'rgba(40,50,80,0.1)', dark: 'rgba(255,255,255,0.1)' }

/** 页面: 渐变底 + 可滚动内容 */
export function Page(props: { title: string; children?: any }) {
  return (
    <ScrollView
      navigationTitle={props.title}
      navigationBarTitleDisplayMode="inline"
      background={<Rectangle fill={AMBIENT} ignoresSafeArea />}
    >
      <VStack alignment="leading" spacing={22} padding={{ horizontal: 16, vertical: 12 }}>{props.children}</VStack>
    </ScrollView>
  )
}

/** 玻璃面板 */
export function Glass(props: { radius?: number; padding?: number; children?: any }) {
  const cornerRadius = props.radius ?? RADIUS
  const shape = { type: 'rect' as const, cornerRadius, style: 'continuous' as const }
  const surface = HAS_GLASS
    ? { glassEffect: { glass: UIGlass.regular(), shape } }
    : { background: <RoundedRectangle cornerRadius={cornerRadius} style="continuous" fill="regularMaterial" /> }
  return (
    <ZStack
      frame={{ maxWidth: 'infinity', alignment: 'leading' }}
      overlay={<RoundedRectangle cornerRadius={cornerRadius} style="continuous" stroke={{ shapeStyle: EDGE, strokeStyle: { lineWidth: 1 } }} />}
      {...surface}
    >
      <VStack alignment="leading" spacing={0} padding={props.padding ?? 0} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{props.children}</VStack>
    </ZStack>
  )
}

/** 一组设置: 小标题 + 玻璃卡片 + 说明. 行之间自动加分隔线 */
export function Group(props: { title?: string; note?: string; children?: any }) {
  const rows = (Array.isArray(props.children) ? props.children : [props.children]).flat().filter(Boolean)
  return (
    <VStack alignment="leading" spacing={8}>
      {props.title ? <Text font={14} fontWeight="bold" fontDesign="rounded" foregroundStyle="secondaryLabel" padding={{ leading: 10 }}>{props.title}</Text> : null}
      <Glass>
        {rows.flatMap((row: any, i: number) => (i ? [<Rectangle fill={SEPARATOR} frame={{ height: 0.5 }} padding={{ leading: 60 }} />, row] : [row]))}
      </Glass>
      {props.note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: 10 }}>{props.note}</Text> : null}
    </VStack>
  )
}

/** 圆形渐变图标: 上亮下实, 这套风格的标记 */
export function Chip(props: { icon: string; color: Color; size?: number }) {
  const size = props.size ?? 32
  return (
    <ZStack frame={{ width: size, height: size }}>
      <Circle fill={props.color} />
      <Circle fill={gradient('linear', { colors: ['rgba(255,255,255,0.38)', 'rgba(255,255,255,0)'], startPoint: 'top', endPoint: 'bottom' })} />
      <Image systemName={props.icon} font={size * 0.48} fontWeight="semibold" foregroundStyle="white" />
    </ZStack>
  )
}

type Label = { icon: string; color: Color; title: string; sub?: string }

function Line(props: Label & { children?: any }) {
  return (
    <HStack spacing={14} padding={{ horizontal: 14, vertical: 11 }} frame={{ maxWidth: 'infinity', minHeight: 56 }}>
      <Chip icon={props.icon} color={props.color} />
      <VStack alignment="leading" spacing={2}>
        <Text font={16} fontWeight="medium" fontDesign="rounded" foregroundStyle="label" lineLimit={1}>{props.title}</Text>
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
    <Glass padding={18}>
      <VStack alignment="leading" spacing={16}>
        <HStack spacing={14}>
          <Chip icon={props.icon} color={props.color} size={54} />
          <VStack alignment="leading" spacing={4}>
            <Text font={23} fontWeight="bold" fontDesign="rounded" foregroundStyle="label" lineLimit={1}>{props.title}</Text>
            <HStack spacing={6}>
              <Circle fill={props.statusColor} frame={{ width: 7, height: 7 }} />
              <Text font={13} foregroundStyle="secondaryLabel" lineLimit={2}>{props.status}</Text>
            </HStack>
          </VStack>
          <Spacer minLength={0} />
        </HStack>
        {props.children ? <HStack spacing={10}>{props.children}</HStack> : null}
      </VStack>
    </Glass>
  )
}

/** Hero 里的玻璃按钮, 等宽 */
export function GlassButton(props: { title: string; icon: string; action: () => void; prominent?: boolean; disabled?: boolean }) {
  return (
    <Button action={props.action} buttonStyle={!HAS_GLASS ? 'bordered' : props.prominent ? 'glassProminent' : 'glass'} disabled={props.disabled} frame={{ maxWidth: 'infinity' }}>
      <HStack spacing={6} frame={{ maxWidth: 'infinity' }} padding={{ vertical: 3 }}>
        <Image systemName={props.icon} font={14} />
        <Text font={14} fontWeight="semibold" fontDesign="rounded" lineLimit={1}>{props.title}</Text>
      </HStack>
    </Button>
  )
}
