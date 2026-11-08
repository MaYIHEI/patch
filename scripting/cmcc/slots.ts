// cmcc / slots.ts
// 按样式和参数决定查哪几个号; 小组件和 App 内预览共用

import { loadAccount, listAccounts, readCache, CmccError } from './api'
import { histOf } from './history'
import { getNames } from './settings'
import { MULTI, type AccountRef, type StyleDef } from './styles/index'
import type { Slot } from './ui'

/** 单号样式取参数里第一个号 (没写取第一个导入的号); 多号样式取参数里的号, 没写取全部 */
export async function loadSlots(style: StyleDef, refs: AccountRef[]): Promise<Slot[]> {
  const tels = listAccounts()
  const names = getNames()
  if (!tels.length) return [{ name: '中国移动', tel: '', error: new CmccError('no_cred', '未导入登录凭证') }]
  const multi = MULTI.includes(style.id)
  const want: AccountRef[] = multi
    ? (refs.length ? refs : tels.map(t => ({ tail: t })))
    : [refs[0] ?? { tail: tels[0] }]
  return Promise.all(want.map(async (r): Promise<Slot> => {
    const tel = tels.find(t => t.endsWith(r.tail)) ?? ''
    // 参数里写的备注优先, 其次设置页的备注
    const name = r.name ?? names[tel] ?? `尾号 ${(tel || r.tail).slice(-4)}`
    try {
      return { name, tel, account: await loadAccount(r.tail), hist: tel ? histOf(tel) : undefined }
    } catch (e) {
      return { name, tel, error: e as Error }
    }
  }))
}

/** 打开 App 时先显示上次的查询结果, 联网回来再刷新, 免得账号页先空几秒 */
export function cachedSlots(): Slot[] {
  const names = getNames()
  return listAccounts().map(tel => ({ name: names[tel] ?? `尾号 ${tel.slice(-4)}`, tel, account: readCache(tel) ?? undefined, hist: histOf(tel) }))
}

/** 示例: 样式库预览用; 主号通用、定向、语音都有, 副号欠费且只有通用和语音 */
export function sampleSlots(): Slot[] {
  const now = Date.now()
  const hist = {
    days: 7,
    daily: (key: string, n: number) => Array.from({ length: n }, (_, i) => (key === 'voice' ? 2 : [3100, 2400, 4800, 1900, 2200, 5600, 1800][i % 7])),
    today: (key: string) => (key === 'voice' ? 1 : 1800),
    avg: (key: string) => (key === 'voice' ? 1 : key === 'tgt' ? 1100 : 3200),
    lastMonthFee: 52,
  } as any
  return [
    {
      name: '主号', tel: '13800000001', hist,
      account: {
        balance: 128.5, monthFee: 46, phoneTail: '0001', stale: false, fetchedAt: now, points: 2680,
        general: { totalMB: 102400, usedMB: 36000, remainMB: 66400 },
        targeted: { totalMB: 20480, usedMB: 16000, remainMB: 4480 },
        voice: { total: 300, used: 120, remain: 180 },
        user: { brand: '全球通', starLevel: 4, starScore: 1860, channel: '上海移动', netYears: 8.5 },
        ledger: [
          { name: '本月实时话费', amount: 46, time: now - 3600_000 },
          { name: '上月账单扣费', amount: 52, time: now - 7 * 86_400_000 },
        ],
      },
    },
    {
      name: '副号', tel: '13800000002', hist,
      account: {
        balance: -12.6, monthFee: 28.3, phoneTail: '0002', stale: false, fetchedAt: now, points: 420,
        general: { totalMB: 5120, usedMB: 1100, remainMB: 4020 },
        voice: { total: 100, used: 62, remain: 38 },
        user: { brand: '神州行', starLevel: 2, starScore: 410, channel: '广东移动', netYears: 3.2 },
      },
    },
  ]
}
