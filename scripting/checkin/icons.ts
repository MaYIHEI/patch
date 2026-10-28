// checkin / icons.ts
// App 图标: 用 MaYIHEI/pin 仓库的 PNG, 下载一次缓存到 App Group 目录 (小组件能读), 之后不再下载
// 没有对应图标的脚本保留首字色块

import { fetch, Path } from 'scripting'

const PIN = 'https://raw.githubusercontent.com/MaYIHEI/pin/main/app/'

// 脚本 id (状态 key 去掉 _status) → pin/app 下的文件名; 没列的就是没有图标
const ICONS: Record<string, string> = {
  weibotalk: 'weibo', tenvideo: 'tenvideo', mihoyo: 'mihoyo', newmixc: 'newmixc', mishop: 'mishop',
  milottery: 'mishop', youpin: 'youpin', lhtj_app: 'lhtj', qqmusic: 'qqmusic', wanda: 'wanda',
  tingtingfm: 'tingtingfm', wps: 'wps', camscanner: 'camscanner', dreame: 'dreame', linghu: 'linghu',
  nodeseek: 'nodeseek', pan1: 'pan1', sgcc: 'sgcc', cmcc: 'cmcc', heybox: 'heybox',
  baidunetdisk: 'baidunetdisk', laifen: 'laifen', ppmt: 'popmart', tuhu: 'tuhu', haidilao: 'haidilao',
  huisheng: 'huisheng', miniso: 'miniso', longde: 'longde', lhtj: 'lhtj', wedome: 'wedome',
  bhg: 'bhg', linli: 'linli',
}

const dir = () => Path.join(FileManager.appGroupDocumentsDirectory, 'checkin', 'icons')
const iconName = (key: string) => ICONS[key.replace(/_status$/, '')]

/** 已缓存的图标路径; 没缓存返回 undefined (显示首字色块) */
export function iconPath(key: string): string | undefined {
  const name = iconName(key)
  if (!name) return undefined
  const p = Path.join(dir(), `${name}.png`)
  return FileManager.existsSync(p) ? p : undefined
}

/** 下载还没缓存的图标; 单个失败不影响其他 */
export async function ensureIcons(keys: string[]): Promise<void> {
  const names = [...new Set(keys.map(iconName).filter((n): n is string => !!n))]
    .filter(n => !FileManager.existsSync(Path.join(dir(), `${n}.png`)))
  if (!names.length) return
  await FileManager.createDirectory(dir(), true)
  await Promise.all(names.map(async n => {
    try {
      const res = await fetch(`${PIN}${n}.png`)
      if (!res.ok) return
      // pin 的图大多 512px, 解码后约 1MB; 大号图标墙一次 25 个会逼近小组件 30MB 内存, 缩到 96px 再存
      const p = Path.join(dir(), `${n}.png`)
      await FileManager.writeAsBytes(p, await res.bytes())
      const small = UIImage.fromFile(p)?.preparingThumbnail({ width: 96, height: 96 })?.toPNGData()
      if (small) await FileManager.writeAsData(p, small)
    } catch {
      // 下次再试, 这次先用首字色块
    }
  }))
}

export async function clearIcons(): Promise<void> {
  if (FileManager.existsSync(dir())) await FileManager.remove(dir())
}
