// cmcc / update.ts
// 就地更新: 下载新版本覆盖脚本目录里的文件, 脚本本身不删, 所以 Keychain 凭证和本机历史都还在
// (从浏览器重新导入会替换整个脚本, 按脚本隔离的 Keychain 会被一起清掉)

import { fetch, Path, Script } from 'scripting'

export async function installUpdate(packageUrl: string): Promise<void> {
  const res = await fetch(packageUrl)
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)

  const work = Path.join(FileManager.temporaryDirectory, `cmcc-update-${Date.now()}`)
  const out = Path.join(work, 'files')
  await FileManager.createDirectory(out, true)
  const zip = Path.join(work, 'package.zip')
  await FileManager.writeAsData(zip, await res.data())
  await FileManager.unzip(zip, out)
  if (!FileManager.existsSync(Path.join(out, 'script.json'))) throw new Error('更新包内容不对')

  const files = (await FileManager.readDirectory(out, true))
    .map((p: string) => (p.startsWith(out) ? p.slice(out.length + 1) : p))
    // script.json 放最后: 中途失败时版本号还是旧的, 可以重新更新
    .sort((a: string, b: string) => Number(a === 'script.json') - Number(b === 'script.json'))
  for (const rel of files) {
    const from = Path.join(out, rel)
    const to = Path.join(Script.directory, rel)
    if (FileManager.isDirectorySync(from)) await FileManager.createDirectory(to, true)
    else await FileManager.writeAsData(to, FileManager.readAsDataSync(from))
  }
}
